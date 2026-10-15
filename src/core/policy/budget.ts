import { isStandaloneDatabaseClient } from '../joboss/database-scope.js'
import type { Db } from '../audit/audit-log.js'
import type { ResearchBudget } from '../../../generated/prisma/client.js'

export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; scope: 'company' | 'global' | 'global_vendor' | 'billed_usd' | 'invalid_spend' | 'ambiguous'; detail?: string }
export type BudgetSpend = { credits: number; vendorCredits?: number; billedUsd?: number }
type Cost = Required<BudgetSpend>
type Refusal = Extract<BudgetVerdict, { allowed: false }>

/** All public accounting paths share these exact number and zero-spend rules. */
export function validateBudgetSpend(spend: number | BudgetSpend): { allowed: true; cost: Cost } | Refusal {
  const cost = typeof spend === 'number' ? { credits: spend, vendorCredits: 0, billedUsd: 0 } : {
    credits: spend?.credits,
    vendorCredits: spend?.vendorCredits === undefined ? 0 : spend.vendorCredits,
    billedUsd: spend?.billedUsd === undefined ? 0 : spend.billedUsd,
  }
  if (![cost.credits, cost.vendorCredits].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      !Number.isFinite(cost.billedUsd) || cost.billedUsd < 0 || (cost.vendorCredits > 0 && cost.credits === 0)) {
    return { allowed: false, scope: 'invalid_spend' }
  }
  if (cost.billedUsd > 0) return { allowed: false, scope: 'billed_usd' }
  return { allowed: true, cost }
}
const isZero = (cost: Cost) => cost.credits === 0 && cost.vendorCredits === 0 && cost.billedUsd === 0

export function currentPeriodMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Select exactly one global envelope and, when attributed, one company envelope. */
async function checkedEnvelopes(db: Db, companyId: string | null, cost: Cost, now: Date, lockedIds?: string[]): Promise<
  { allowed: true; rows: ResearchBudget[] } | Refusal
> {
  const periodMonth = currentPeriodMonth(now)
  const rows = await db.researchBudget.findMany({ where: {
    periodMonth, ...(lockedIds ? { id: { in: lockedIds } } : {}), OR: companyId === null ? [{ companyId: null }] : [{ companyId: null }, { companyId }],
  } })
  const globals = rows.filter((row) => row.companyId === null)
  const companies = companyId === null ? [] : rows.filter((row) => row.companyId === companyId)
  if (globals.length > 1 || companies.length > 1) return { allowed: false, scope: 'ambiguous',
    detail: `Multiple monthly envelopes for ${periodMonth}; explicit reconciliation required; no spend recorded` }
  const global = globals[0]
  if (!global) return { allowed: false, scope: 'global' }
  if (global.creditsSpent + cost.credits > global.creditsCap) return { allowed: false, scope: 'global' }
  if (cost.vendorCredits > 0 && global.vendorCreditsSpent + cost.vendorCredits > global.vendorCreditsCap) return { allowed: false, scope: 'global_vendor' }
  const company = companies[0]
  if (companyId !== null && !company) return { allowed: false, scope: 'company' }
  if (company && company.creditsSpent + cost.credits > company.creditsCap) return { allowed: false, scope: 'company' }
  return { allowed: true, rows: company ? [global, company] : [global] }
}

/** Advisory only. The gate separately restricts zero spends to exact mail/OAuth operations. */
export async function checkBudget(db: Db, companyId: string | null, spend: number | BudgetSpend = 1, now = new Date()): Promise<BudgetVerdict> {
  const validated = validateBudgetSpend(spend)
  if (!validated.allowed) return validated
  if (isZero(validated.cost)) return { allowed: true }
  const checked = await checkedEnvelopes(db, companyId, validated.cost, now)
  return checked.allowed ? { allowed: true } : checked
}

/**
 * Fixed global-first row locks serialize all envelope dimensions across connections.
 * Charge exactly the rows validated while locked. On a transaction client this is
 * provisional accounting until commit; FetchPolicyGate refuses network use of such
 * clients, so a rollback cannot undo authorization for an already opened socket.
 * Uncertain transport failures retain the ordinary client's committed reservation.
 */
export async function reserveBudget(db: Db, companyId: string | null, spend: number | BudgetSpend = 1, now = new Date()): Promise<BudgetVerdict> {
  const validated = validateBudgetSpend(spend)
  if (!validated.allowed) return validated
  if (isZero(validated.cost)) return { allowed: true }
  const reserve = async (tx: Db): Promise<BudgetVerdict> => {
    const period = currentPeriodMonth(now)
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM research_budget
      WHERE period_month = ${period} AND (company_id IS NULL OR company_id = ${companyId})
      ORDER BY company_id NULLS FIRST, id FOR UPDATE`
    const checked = await checkedEnvelopes(tx, companyId, validated.cost, now, locked.map((row) => row.id))
    if (!checked.allowed) return checked
    for (const row of checked.rows) await tx.researchBudget.update({ where: { id: row.id }, data: {
      creditsSpent: { increment: validated.cost.credits }, vendorCreditsSpent: { increment: validated.cost.vendorCredits },
    } })
    return { allowed: true }
  }
  return isStandaloneDatabaseClient(db) ? db.$transaction(reserve) : reserve(db)
}

export class BudgetSpendRefusedError extends Error {
  constructor(readonly verdict: Refusal) {
    super(verdict.detail ?? `Budget accounting refused: ${verdict.scope}`)
    this.name = 'BudgetSpendRefusedError'
  }
}
/** Compatibility ledger entry: now the same atomic, validated operation, never an unchecked increment. */
export async function recordSpend(db: Db, companyId: string | null, spend: number | BudgetSpend, now = new Date()): Promise<void> {
  const verdict = await reserveBudget(db, companyId, spend, now)
  if (!verdict.allowed) throw new BudgetSpendRefusedError(verdict)
}
