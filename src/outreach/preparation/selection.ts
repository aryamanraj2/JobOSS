import { z } from 'zod'
import type { Db } from '../../core/audit/audit-log.js'
import type { PrismaClient } from '../../../generated/prisma/client.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { postingContentHash } from '../../ingest/ats/ingest-postings.js'
import { currentCompanyContext } from '../review/context.js'
import { preparationStop } from './stops.js'
const Selection = z.object({ companyId: z.string(), campaignCycle: z.string().min(1), intent: z.enum(['listed','speculative']),
  opportunityId: z.string().nullable(), roleHash: z.string().nullable(), contactId: z.string(),
  associationId: z.string().nullable().optional(), runId: z.string().optional(), owner: z.string().optional() }).strict()
export type PreparationSelection = z.infer<typeof Selection>
// 55P03: NOWAIT or lock_timeout. 40P01 (adapter: TransactionWriteConflict/P2034): deadlock victim.
function unavailable(e: unknown, codes = ['55P03']): boolean {
  if (!e || typeof e !== 'object') return false
  const v = e as Record<string, unknown>
  return [v.code, v.sqlState, v.originalCode].some(c => codes.includes(String(c))) || ['meta','cause','driverAdapterError','originalError'].some(k => unavailable(v[k], codes))
}
/** Called only after D's mutation advisory, before any D mutation. This opt-in
 * branch freezes current intent/association/stops through D's local transaction.
 * No HTTP or manual/model waiting occurs inside. Defaults never call it. */
export async function beginPreparationSelection(tx: Db, raw: PreparationSelection, companyIds: string[], campaignCycle?: string): Promise<string | null> {
  const parsed = Selection.safeParse(raw)
  if (!parsed.success || companyIds.length !== 1 || raw.companyId !== companyIds[0] || !campaignCycle || raw.campaignCycle !== campaignCycle ||
    raw.intent === 'listed' && (!raw.opportunityId || !raw.roleHash) || raw.intent === 'speculative' && (raw.opportunityId !== null || raw.roleHash !== null)) return 'preparation_selection_conflict'
  const level = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
  if (level[0]?.transaction_isolation !== 'read committed') return 'preparation_current_transaction_required'
  // Backstop after D's advisory: any residual row wait aborts quickly instead of holding
  // the table locks below; preparationTransaction maps the abort to busy.
  await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`
  await tx.$executeRaw`SAVEPOINT preparation_selection`
  try {
    await tx.$queryRaw`SELECT id FROM company WHERE id=${raw.companyId} FOR UPDATE NOWAIT`
    await tx.$executeRaw`LOCK TABLE company, evidence, opportunity, outreach_assessment, lead, draft, contact, contact_research, suppression, send_attempt, preparation_run, llm_task, audit_log IN SHARE ROW EXCLUSIVE MODE NOWAIT`
    await tx.$executeRaw`LOCK TABLE approved_claim, resume_version, role_track, candidate_profile, funding_record IN SHARE MODE NOWAIT`
    await tx.$queryRaw`SELECT id FROM contact WHERE id=${raw.contactId} FOR UPDATE NOWAIT`
    await tx.$queryRaw`SELECT id FROM lead WHERE company_id=${raw.companyId} AND campaign_cycle=${campaignCycle} FOR UPDATE NOWAIT`
    // Every other row D's body locks or FK-references (table locks above do not exclude
    // row holders): campaign drafts (prepare.ts FOR UPDATE OF d, draft updates, revision
    // FK), the assessment row it may update, the opportunity a new listed lead references,
    // and active resumes a draft insert/@5 merge may reference. Lead/contact/company above.
    await tx.$queryRaw`SELECT d.id FROM draft d JOIN lead l ON l.id = d.lead_id WHERE l.company_id=${raw.companyId} AND l.campaign_cycle=${campaignCycle} ORDER BY d.id FOR UPDATE OF d NOWAIT`
    await tx.$queryRaw`SELECT company_id FROM outreach_assessment WHERE company_id=${raw.companyId} FOR UPDATE NOWAIT`
    if (raw.opportunityId) await tx.$queryRaw`SELECT id FROM opportunity WHERE id=${raw.opportunityId} FOR KEY SHARE NOWAIT`
    await tx.$queryRaw`SELECT id FROM resume_version WHERE is_active ORDER BY id FOR KEY SHARE NOWAIT`
    await tx.$executeRaw`RELEASE SAVEPOINT preparation_selection`
  } catch (e) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT preparation_selection`
    await tx.$executeRaw`RELEASE SAVEPOINT preparation_selection`
    if (unavailable(e)) return 'preparation_inputs_busy'
    throw e
  }
  if (raw.runId) {
    const run = await tx.preparationRun.findUnique({ where: { id: raw.runId } })
    if (!raw.owner || (run?.checkpoint as { owner?: string } | undefined)?.owner !== raw.owner) return 'preparation_ownership_lost'
  }
  const stop = await preparationStop(tx, raw.companyId, campaignCycle, raw.contactId)
  if (stop) return stop
  const context = await currentCompanyContext(tx, raw.companyId, new Date())
  // Caller uses its authoritative decision time for role freshness below; this
  // read only checks the selected recipient marker/current binding here.
  if (!context || context.company.outreachAssessment?.selectedContactId && context.company.outreachAssessment.selectedContactId !== raw.contactId) return 'preparation_selection_conflict'
  const leads = await tx.lead.findMany({ where: { companyId: raw.companyId, campaignCycle } })
  if (raw.associationId !== undefined && (raw.associationId === null ? leads.length > 0 : !leads.some(l => l.id === raw.associationId))) return 'preparation_selection_conflict'
  if (leads.length > 1 || leads.some(l => l.leadKind !== (raw.intent === 'listed' ? 'posted_role' : 'speculative') || l.opportunityId !== raw.opportunityId || l.contactId && l.contactId !== raw.contactId)) return 'preparation_selection_conflict'
  const contact = await tx.contact.findUnique({ where: { id: raw.contactId } })
  return !contact || contact.companyId !== raw.companyId ? 'preparation_selection_conflict' : null
}
type Role = { id: string; externalId: string | null; title: string | null; roleUrl: string | null; location: string | null; description: string | null;
  postedAt: Date | null; status: string; closedAt: Date | null }
/** Posting identity/content, not observation bookkeeping (lastSeenAt/updatedAt). Reuses
 * the accepted ATS content hash; posted date, status and closure are added explicitly. */
export function roleFingerprint(r: Role) {
  return contentHashOf({ id: r.id, roleUrl: r.roleUrl, status: r.status, closedAt: r.closedAt?.toISOString() ?? null, postedAt: r.postedAt?.toISOString() ?? null,
    content: postingContentHash({ externalId: r.externalId ?? '', title: r.title ?? '', url: r.roleUrl ?? '', location: r.location, content: r.description ?? '', postedAt: r.postedAt }) })
}
/** Opt-in transaction boundary only: a lock_timeout (55P03) or deadlock (40P01) abort
 * rolls the whole transaction back, so drop this company's in-memory results and
 * report busy. Default D callers never enter this. */
export async function preparationTransaction(db: PrismaClient, prepare: (tx: Db) => Promise<void>, companyId: string,
  out: { draftIds: string[]; taskIds: string[]; blockers: { companyId: string; reason: string; detail: string }[] }) {
  const mark = [out.draftIds.length, out.taskIds.length, out.blockers.length] as const
  try { await db.$transaction(prepare, { timeout: 30_000 }) } catch (e) {
    if (!unavailable(e, ['55P03', '40P01', 'P2034'])) throw e
    out.draftIds.length = mark[0]; out.taskIds.length = mark[1]; out.blockers.length = mark[2]
    out.blockers.push({ companyId, reason: 'preparation_inputs_busy', detail: 'Selected inputs are locked by another writer; nothing was committed. Retry later.' })
  }
}
export async function currentSelectionError(tx: Db, selection: PreparationSelection, now: Date): Promise<string | null> {
  if (selection.intent === 'speculative') return null
  const context = await currentCompanyContext(tx, selection.companyId, now)
  const role = context?.currentRoles.find(r => r.id === selection.opportunityId)
  return !role || roleFingerprint(role) !== selection.roleHash ? 'preparation_selected_role_changed' : null
}
