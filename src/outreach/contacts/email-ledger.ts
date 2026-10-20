import { randomUUID, createHash } from 'node:crypto'
import type { Prisma } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import type { EmailLookupResult } from './provider.js'

export type EmailProviderSlug = 'hunter' | 'tomba' | 'prospeo' | 'zerobounce'
export type EmailOperation = 'find' | 'verify'
export type ProviderAllowance = {
  cap: number
  model: 'monthly' | 'one_time'
  // Dashboard billing boundaries, never inferred from a calendar month.
  start?: string | undefined
  end?: string | undefined
}
export type LedgerEntry = {
  id: string; provider: EmailProviderSlug; operation: EmailOperation; inputKey: string
  at: string; settledAt?: string; reserved: number; outcome?: string; charged?: number; attempted?: boolean
  pauseUntil?: string; result?: EmailLookupResult; expiresAt?: string
}
export function emailInputKey(provider: EmailProviderSlug, operation: EmailOperation, input: unknown): string {
  return createHash('sha256').update(JSON.stringify([provider, operation, input])).digest('hex')
}
export function allowanceActive(a: ProviderAllowance, now: Date): boolean {
  return Number.isFinite(a.cap) && a.cap > 0 && (a.model === 'one_time' ||
    (!!a.start && !!a.end && Number.isFinite(Date.parse(a.start)) && Number.isFinite(Date.parse(a.end)) &&
      Date.parse(a.start) <= now.getTime() && now.getTime() < Date.parse(a.end)))
}

/** Pure policy: reservations survive crashes at worst-case cost. Tomba's second /
 * minute counters reset only after a full idle window, per its live docs. */
export function ledgerRefusal(entries: LedgerEntry[], provider: EmailProviderSlug, operation: EmailOperation,
  allowance: ProviderAllowance, cost: number, now: Date): string | null {
  if (!allowanceActive(allowance, now)) return 'provider_balance_disabled'
  const all = entries.filter((e) => e.provider === provider)
  if (all.some((e) => e.pauseUntil && Date.parse(e.pauseUntil) > now.getTime())) return 'provider_paused'
  // A call crossing a UTC/billing boundary counts conservatively in both
  // possible periods. Completion time also keeps delayed dispatches from bunching.
  const effectiveAt=(e: LedgerEntry) => Math.max(Date.parse(e.at),Date.parse(e.settledAt ?? e.at))
  const period = all.filter((e) => (provider !== 'tomba' || e.operation === operation) && (allowance.model === 'one_time' || effectiveAt(e) >= Date.parse(allowance.start!)))
  if (period.reduce((n, e) => n + (e.charged ?? e.reserved), 0) + cost > allowance.cap) return 'provider_balance_exhausted'
  const calls = all.filter((e) => e.operation === operation && e.attempted !== false && e.outcome !== 'http_429')
    .sort((a,b) => effectiveAt(a) - effectiveAt(b))
  const limits = provider === 'tomba' ? [1, 2, operation === 'find' ? 5 : 10] :
    provider === 'hunter' ? [operation === 'find' ? 15 : 10, operation === 'find' ? 500 : 300, Infinity] :
    provider === 'prospeo' ? [1, 2, 5] : [1, 60, 100] // Conservative local ceilings for ZB; no free-plan limits claimed.
  for (const [i, window] of [1000, 60000, 86400000].entries()) {
    if (i === 2) {
      if (calls.filter((e) => (e.at.slice(0,10) === now.toISOString().slice(0,10) || new Date(effectiveAt(e)).toISOString().slice(0,10) === now.toISOString().slice(0,10))).length >= limits[i]!) return 'provider_daily_window'
    } else if (provider === 'tomba') {
      let consecutive = 0, prior = -Infinity
      for (const e of calls) { const at = effectiveAt(e); consecutive = at - prior >= window ? 1 : consecutive + 1; prior = at }
      if (now.getTime() - prior < window && consecutive >= limits[i]!) return i === 0 ? 'provider_second_window' : 'provider_minute_window'
    } else if (calls.filter((e) => now.getTime() - effectiveAt(e) < window).length >= limits[i]!) return i === 0 ? 'provider_second_window' : 'provider_minute_window'
  }
  return null
}

/** No migration. One immutable reservation and one immutable settlement per call.
 * A transaction advisory lock serializes cap/cache/window decisions across clients;
 * it is released before the gate can perform network I/O. Pending calls are never
 * guessed free and block identical inputs, including after a process crash. */
export class EmailProviderLedger {
  constructor(private readonly db: Db) {}
  private async entries(db: Db, provider: EmailProviderSlug): Promise<LedgerEntry[]> {
    const rows = await db.auditLog.findMany({ where: { subjectType: 'EmailProvider', subjectId: provider,
      action: { in: ['email_provider.reserved','email_provider.settled'] } }, orderBy: [{createdAt:'asc'},{id:'asc'}] })
    const entries = new Map<string, LedgerEntry>()
    for (const row of rows) {
      const e = row.metadata as unknown as LedgerEntry
      if (row.action === 'email_provider.reserved') entries.set(e.id,e)
      else if (entries.has(e.id)) entries.set(e.id,{...entries.get(e.id)!,...e})
    }
    return [...entries.values()]
  }
  async cached(provider: EmailProviderSlug, operation: EmailOperation, inputKey: string, now: Date): Promise<EmailLookupResult | null> {
    const entries = await this.entries(this.db,provider)
    return entries.reverse().find((e) => e.operation === operation && e.inputKey === inputKey && e.result &&
      e.expiresAt && Date.parse(e.expiresAt) > now.getTime())?.result ?? null
  }
  async reserve(provider: EmailProviderSlug, operation: EmailOperation, inputKey: string, allowance: ProviderAllowance, cost: number, now: Date): Promise<{id: string} | {reason: string}> {
    if (!isStandaloneDatabaseClient(this.db)) return {reason:'transaction_client_network_forbidden'}
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'email-provider:'+provider}))::text`
      const entries = await this.entries(tx,provider)
      if (entries.some((e) => e.inputKey === inputKey && e.outcome === undefined)) return {reason:'provider_pending'}
      if (entries.some((e) => e.inputKey === inputKey && e.result && e.expiresAt && Date.parse(e.expiresAt)>now.getTime())) return {reason:'provider_cache_race'}
      const reason = ledgerRefusal(entries,provider,operation,allowance,cost,now)
      if (reason) return {reason}
      if (entries.some((e) => e.outcome === undefined)) return {reason:'provider_pending'}
      const id = randomUUID()
      const entry: LedgerEntry = {id,provider,operation,inputKey,at:now.toISOString(),reserved:cost}
      await writeAudit(tx,{actorType:'system',actorId:'email-provider-ledger',action:'email_provider.reserved',subjectType:'EmailProvider',subjectId:provider,
        metadata:{...entry,creditModel:allowance.model,charging:'result_only',endpoint:`${provider}.${operation}`}})
      return {id}
    })
  }
  async settle(entry: LedgerEntry): Promise<void> {
    await writeAudit(this.db,{actorType:'system',actorId:'email-provider-ledger',action:'email_provider.settled',subjectType:'EmailProvider',subjectId:entry.provider,
      metadata: {...entry, chargedFlag: entry.charged === undefined ? null : entry.charged > 0, endpoint:`${entry.provider}.${entry.operation}`} as Prisma.InputJsonObject})
  }
}
