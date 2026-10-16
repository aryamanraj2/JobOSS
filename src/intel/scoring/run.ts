import type { Prisma } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import type { ReasonCodeValue } from '../../core/reason-codes/registry.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { lockDMutation } from '../../outreach/review/locks.js'
import { COMPANY_SCORING_SELECT, collectScoreInput, type CompanyForScoring } from './collect.js'
import { scoreCompany, type ScoreBreakdown } from './score.js'
import { ACTIVE_SCORE_VERSION, assertSumsTo100, type ScoreVersionSpec } from './score-version.js'
import { roleTrackIdsByKey } from '../taxonomy/seed-tracks.js'

/**
 * Scoring, persisted.
 *
 * The arithmetic lives in `score.ts` and stays pure; this module is the part that
 * touches rows. Three things get written and they are deliberately separate:
 *
 *   - `ScoreVersion` — the weight set, validated to sum to 100 before it is stored,
 *     so a row that could not have produced a valid score cannot exist (A1).
 *   - `Lead` — score, risk deduction, `score_components` JSON, and the version it
 *     was computed under, so any later threshold change replays against it (A11).
 *   - `AuditLog` — the reason codes the score raised, which is what A11 asks the
 *     operator to review qualitatively instead of tuning weights on 0-3 events.
 */

/**
 * The campaign cycle a lead belongs to. Month-grained.
 *
 * This is the unit A2's dedup indexes count in — one first touch per contact and
 * per company per cycle — so it must be coarse enough that a cycle boundary is not
 * a way to message someone twice in a fortnight.
 */
export function currentCampaignCycle(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Writes (or finds) the row for a weight set.
 *
 * The spec is re-validated here rather than trusted, because a `ScoreVersion` row
 * is the thing a historical score is replayed against: a row whose weights do not
 * sum to 100 would make every score that cites it unexplainable.
 *
 * An existing row is never rewritten. A11 freezes weights, and silently updating a
 * stored version would change the meaning of every score already computed under
 * it — the exact failure `ScoreVersion` exists to prevent. Changing weights means
 * a new label.
 */
export async function ensureScoreVersion(db: Db, spec: ScoreVersionSpec = ACTIVE_SCORE_VERSION): Promise<string> {
  assertSumsTo100(spec)
  const existing = await db.scoreVersion.findUnique({ where: { label: spec.label }, select: { id: true } })
  if (existing) return existing.id

  const created = await db.scoreVersion.create({
    data: {
      label: spec.label,
      weights: spec.weights as unknown as Prisma.InputJsonValue,
      thresholds: spec.thresholds as unknown as Prisma.InputJsonValue,
      maxRiskDeduction: spec.maxRiskDeduction,
      frozenUntilSends: spec.frozenUntilSends,
      isActive: true,
    },
    select: { id: true },
  })
  // Exactly one active version at a time: "the active weight set" has to be a
  // single answer, or two leads scored on the same day are not comparable.
  await db.scoreVersion.updateMany({ where: { id: { not: created.id } }, data: { isActive: false } })
  return created.id
}

export type ScoreCompanyOutcome =
  | { scored: true; leadId: string; breakdown: ScoreBreakdown }
  | { scored: false; reason: Extract<ReasonCodeValue, 'insufficient_evidence'>; detail: string }

export type HistoryBlocker = { leadId: string | null; blocker: string }

/**
 * Refusals that are neither a score nor missing evidence. Neither is a ReasonCode,
 * so they are not folded into `ScoreCompanyOutcome.reason` (whose callers read it as
 * one); `scoreCompanyAndPersist` throws them as `ScoreRefusedError` instead.
 *
 *   - `history_protected`: current-cycle history (another or no score version, an
 *     attached draft or packet, a bound contact, operator status/history) or a
 *     company operator stop this call must not rewrite. Nothing score-owned was
 *     written; one append-only `score.history_protected` audit row records the blockers.
 *   - `concurrent_change`: a competing writer held a row this score needs, or an
 *     eligible posting changed mid-score. Nothing was written; retry later.
 */
export type ScoreBlockedOutcome =
  | { reason: 'history_protected'; detail: string; leadIds: string[]; blockers: HistoryBlocker[] }
  | { reason: 'concurrent_change'; detail: string }

export class ScoreRefusedError extends Error {
  constructor(readonly outcome: ScoreBlockedOutcome) {
    super(`score refused (${outcome.reason}): ${outcome.detail}`)
    this.name = 'ScoreRefusedError'
  }
}

export type ScoreRefusalReason = Extract<ScoreCompanyOutcome, { scored: false }>['reason'] | ScoreBlockedOutcome['reason']

/** One line for CLI reporting; each refusal is named for what it is. */
export function describeScoreRefusals(counts: Partial<Record<ScoreRefusalReason, number>>): string {
  return `${counts.insufficient_evidence ?? 0} refused as insufficient_evidence, ` +
    `${counts.history_protected ?? 0} refused to protect existing lead history, ` +
    `${counts.concurrent_change ?? 0} skipped on a concurrent change (retry)`
}

export type ScoreCompanyOptions = {
  now?: Date
  spec?: ScoreVersionSpec
  campaignCycle?: string
}

/** The status the scorer itself writes for a stored band; anything else is not ours to overwrite. */
const SCORER_STATUS: Record<string, readonly [string, string | null]> = {
  queue: ['qualified', null],
  research: ['qualifying', null],
  reject: ['rejected', 'low_relevance'],
}

function lockUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as Record<string, unknown>
  return row['code'] === '55P03' || row['sqlState'] === '55P03' ||
    ['meta', 'cause', 'driverAdapterError', 'originalError'].some((key) => lockUnavailable(row[key]))
}

/**
 * Scores one company and records the result.
 *
 * Refuses rather than guesses when there is nothing to score on: no track cleared
 * the confidence floor with a specific term means we have no supported claim about
 * what this company builds, and `handover.md` §5.3 forbids applying a label anyway.
 * That is `insufficient_evidence` — D1 makes it re-entrant, a budget decision
 * rather than a verdict, so the company stays eligible for more research.
 *
 * ## Transaction boundary
 *
 * Guard checks, collection and every write happen in one READ COMMITTED
 * transaction: the client's own, or a savepoint inside a caller's transaction, which
 * is rolled back on any error so a caller that catches and commits keeps no partial
 * S mutation. A caller transaction at another isolation level is refused with an
 * error, because its snapshot cannot be refreshed by the locks below.
 *
 * Lock order matches D: the D mutation advisory lock first (the only wait, taken
 * while holding nothing else when this call owns the transaction; a caller must
 * enter it before its own conflicting locks), then company → current-cycle drafts →
 * current-cycle leads → open opportunities → SHARE on opportunity, evidence,
 * company_signal and audit_log, all NOWAIT. A busy row, or any uncommitted write to
 * those tables, returns `concurrent_change` rather than waiting on a partial lock
 * set, so no deadlock with B review/reservation, D preparation or ingestion. A writer
 * that arrives after these locks waits for this commit and then sees the new state.
 *
 * Availability: while a score transaction is open, every writer of those four
 * tables waits, for any company (they are table locks). An autovacuum or analyze
 * of one of them also makes this call refuse busy; retry.
 *
 * Protected history and concurrent change throw `ScoreRefusedError` after this
 * call's own transaction commits its refusal audit (inside a caller's transaction,
 * after the savepoint is released; the caller decides whether that audit commits).
 */
export async function scoreCompanyAndPersist(
  db: Db,
  company: CompanyForScoring,
  opts: ScoreCompanyOptions = {},
): Promise<ScoreCompanyOutcome> {
  const now = opts.now ?? new Date()
  const spec = opts.spec ?? ACTIVE_SCORE_VERSION
  const campaignCycle = opts.campaignCycle ?? currentCampaignCycle(now)

  const work = async (tx: Db): Promise<ScoreCompanyOutcome | ScoreRefusedError> => {
    const [level] = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
    if (level?.transaction_isolation !== 'read committed') {
      throw new Error(`scoreCompanyAndPersist requires READ COMMITTED; the caller's transaction is ${level?.transaction_isolation ?? 'unknown'}`)
    }
    await lockDMutation(tx)
    await tx.$executeRaw`SAVEPOINT joboss_s_score`
    try {
      const outcome = await scoreLocked(tx, company.id, spec, campaignCycle, now)
      await tx.$executeRaw`RELEASE SAVEPOINT joboss_s_score`
      return outcome
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT joboss_s_score`
      await tx.$executeRaw`RELEASE SAVEPOINT joboss_s_score`
      if (lockUnavailable(error)) {
        return new ScoreRefusedError({ reason: 'concurrent_change', detail: 'a competing writer holds a company, lead, draft or posting row, or has uncommitted posting, evidence, signal or audit writes; nothing was written' })
      }
      throw error
    }
  }
  const result = isStandaloneDatabaseClient(db)
    ? await db.$transaction(work, { isolationLevel: 'ReadCommitted', timeout: 30_000 })
    : await work(db)
  if (result instanceof ScoreRefusedError) throw result
  return result
}

async function scoreLocked(
  db: Db,
  companyId: string,
  spec: ScoreVersionSpec,
  campaignCycle: string,
  now: Date,
): Promise<ScoreCompanyOutcome | ScoreRefusedError> {
  const locked = await db.$queryRaw<{ id: string }[]>`SELECT id FROM company WHERE id = ${companyId} FOR NO KEY UPDATE NOWAIT`
  if (!locked.length) throw new Error(`Unknown company ${companyId}`)
  await db.$queryRaw`SELECT d.id FROM draft d JOIN lead l ON l.id = d.lead_id
    WHERE l.company_id = ${companyId} AND l.campaign_cycle = ${campaignCycle} ORDER BY d.id FOR UPDATE OF d NOWAIT`
  // FOR UPDATE (not NO KEY): also conflicts with an in-flight draft/packet insert under the lead.
  await db.$queryRaw`SELECT id FROM lead WHERE company_id = ${companyId} AND campaign_cycle = ${campaignCycle} ORDER BY id FOR UPDATE NOWAIT`
  const lockedOpen = new Set((await db.$queryRaw<{ id: string }[]>`SELECT id FROM opportunity
    WHERE company_id = ${companyId} AND status = 'open' ORDER BY id FOR UPDATE NOWAIT`).map((r) => r.id))
  // Support boundary (RS-01). Row locks cannot see a row that does not exist yet, and
  // a newer page observation is an INSERT that supersedes Evidence this call reads.
  // SHARE conflicts with every insert/update/delete on the tables the collector and
  // the history guard read, until this transaction (or the caller's) ends.
  await db.$executeRaw`LOCK TABLE opportunity, evidence, company_signal, audit_log IN SHARE MODE NOWAIT`

  // Fresh reads after the locks: the caller's company object is not trusted as current.
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { ...COMPANY_SCORING_SELECT, status: true } })
  const leads = await db.lead.findMany({
    where: { companyId, campaignCycle },
    orderBy: { id: 'asc' },
    select: { id: true, status: true, statusReason: true, scoreVersionId: true, scoreComponents: true, contactId: true,
      _count: { select: { drafts: true, applicationPackets: true } } },
  })
  // Read-only: creating or activating the version is itself a score-owned mutation.
  const version = await db.scoreVersion.findUnique({ where: { label: spec.label }, select: { id: true } })

  const blockers: HistoryBlocker[] = []
  if (company.status === 'excluded') blockers.push({ leadId: null, blocker: 'company_excluded' })
  if (leads.length > 1) blockers.push({ leadId: null, blocker: 'multiple_current_leads' })
  for (const lead of leads) {
    const block = (blocker: string) => blockers.push({ leadId: lead.id, blocker })
    if (lead.scoreVersionId === null) block('unscored_association')
    else if (lead.scoreVersionId !== version?.id) block('different_score_version')
    if (lead._count.drafts > 0) block('draft_attached')
    if (lead._count.applicationPackets > 0) block('application_packet_attached')
    if (lead.contactId !== null) block('contact_bound')
    const band = (lead.scoreComponents as { band?: unknown } | null)?.band
    const expected = typeof band === 'string' ? SCORER_STATUS[band] : undefined
    if (!expected || lead.status !== expected[0] || lead.statusReason !== expected[1]) block('operator_status')
  }
  // Anything but the scorer writing about the lead is history we cannot classify as automatic.
  const touched = leads.length === 0 ? [] : await db.auditLog.findMany({
    where: { subjectType: 'Lead', subjectId: { in: leads.map((l) => l.id) }, NOT: { actorId: 'scorer' } },
    distinct: ['subjectId'],
    select: { subjectId: true },
  })
  for (const row of touched) blockers.push({ leadId: row.subjectId, blocker: 'non_scorer_history' })

  if (blockers.length > 0) {
    const leadIds = leads.map((l) => l.id)
    const detail = `existing ${campaignCycle} history is preserved: ${blockers.map((b) => b.blocker).join(', ')}`
    await writeAudit(db, {
      actorType: 'system',
      actorId: 'scorer',
      action: 'score.history_protected',
      subjectType: 'Company',
      subjectId: companyId,
      metadata: { campaignCycle, requestedScoreVersion: spec.label, leadIds, blockers, scoreOwnedMutations: 0 },
    })
    return new ScoreRefusedError({ reason: 'history_protected', detail, leadIds, blockers })
  }

  const collected = await collectScoreInput(db, company, now)

  if (collected.input.match.matches.length === 0) {
    const detail =
      collected.fields.length === 0
        ? 'no source text held for this company'
        : `no track cleared the confidence floor across ${collected.fields.length} source field(s)`
    await db.company.update({
      where: { id: companyId },
      data: { status: 'insufficient_evidence', statusReason: 'insufficient_evidence', lastRefreshedAt: now },
    })
    await writeAudit(db, {
      actorType: 'system',
      actorId: 'scorer',
      action: 'score.refused',
      subjectType: 'Company',
      subjectId: companyId,
      reasonCode: 'insufficient_evidence',
      metadata: { detail, fields: collected.fields.length },
    })
    return { scored: false, reason: 'insufficient_evidence', detail }
  }

  // Every eligible posting was open when locked above, unless it reopened since: a
  // row this call does not hold could change before commit, so start again instead.
  // Nothing has been written yet on this path.
  if (collected.eligibleOpportunityIds.some((id) => !lockedOpen.has(id))) {
    return new ScoreRefusedError({ reason: 'concurrent_change', detail: 'an eligible posting changed during scoring; nothing was written, retry' })
  }

  const breakdown = scoreCompany(collected.input, spec)
  const scoreVersionId = await ensureScoreVersion(db, spec)

  // F3 selects a track-tailored resume per posting, so the track belongs on the
  // Opportunity rather than being re-derived from the company later. Only eligible
  // rows whose own text supports a track are labelled: a posting inherits nothing.
  const trackIds = await roleTrackIdsByKey(db)
  for (const assignment of collected.opportunityTracks) {
    const roleTrackId = assignment.track === null ? null : (trackIds.get(assignment.track) ?? null)
    await db.opportunity.update({
      where: { id: assignment.opportunityId },
      data: { roleTrackId },
    })
  }

  // A3: a lead with no Opportunity is speculative by definition. Posted-role only for
  // a posting the collector admitted (RC-4): its first eligible ID, newest lastSeenAt
  // then smaller ID. A rejected open row never attaches, and zero eligible rows is
  // speculative even when rejected open rows remain.
  const opportunityId = collected.eligibleOpportunityIds[0] ?? null
  const leadKind = opportunityId ? ('posted_role' as const) : ('speculative' as const)

  const status =
    breakdown.band === 'queue' ? ('qualified' as const)
    : breakdown.band === 'research' ? ('qualifying' as const)
    : ('rejected' as const)

  // The stored JSON carries the matched snippets as well as the numbers: F3's
  // evidence viewer needs the reasons to be readable, and a score whose only
  // artefact is an integer cannot be reviewed.
  const componentsJson = {
    ...breakdown,
    tracks: collected.input.match.matches.map((m) => ({
      track: m.track,
      confidence: m.confidence,
      specificTerms: m.specificTerms,
      negativeTerms: m.negativeTerms,
      snippets: m.snippets.slice(0, 8),
    })),
  } as unknown as Prisma.InputJsonValue

  const data = {
    opportunityId,
    leadKind,
    status,
    statusReason: breakdown.band === 'reject' ? ('low_relevance' as const) : null,
    primaryTrack: breakdown.primaryTrack!,
    primaryTrackReason: breakdown.primaryTrackReason,
    score: breakdown.total,
    riskDeduction: breakdown.riskDeduction,
    scoreComponents: componentsJson,
    scoreVersionId,
    citedEvidenceIds: collected.citedEvidenceIds,
  }

  // One lead per company per cycle. There is no unique index for this (D3's
  // indexes are on send_attempt, where the invariant actually matters); the D lock
  // above serializes the look-then-write, and the guard has already refused any
  // current lead this call may not rewrite.
  const existing = leads[0]
  const lead = existing
    ? await db.lead.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.lead.create({ data: { companyId, campaignCycle, ...data }, select: { id: true } })

  await db.company.update({
    where: { id: companyId },
    data: { status: 'researched', statusReason: null, lastRefreshedAt: now },
  })

  await writeAudit(db, {
    actorType: 'system',
    actorId: 'scorer',
    action: 'score.computed',
    subjectType: 'Lead',
    subjectId: lead.id,
    // The band's own code, so the refusal counters read the way Part G intends.
    reasonCode: breakdown.band === 'reject' ? 'low_relevance' : undefined,
    metadata: {
      companyId,
      scoreVersion: breakdown.scoreVersion,
      total: breakdown.total,
      subtotal: breakdown.subtotal,
      riskDeduction: breakdown.riskDeduction,
      band: breakdown.band,
      primaryTrack: breakdown.primaryTrack,
      reasonCodes: breakdown.reasonCodes,
      countryMapVersion: breakdown.countryMapVersion,
      opportunityId,
      eligibleOpportunityIds: collected.eligibleOpportunityIds,
      // A negative observation about stored rows, not hiring support or an attachment.
      storedPostingRisk: collected.storedPostingRisk,
    },
  })

  // Every reason the score raised gets its own row, so Part G's counters can be
  // read by reason rather than by parsing a metadata blob.
  for (const code of breakdown.reasonCodes) {
    if (code === 'low_relevance') continue
    await writeAudit(db, {
      actorType: 'system',
      actorId: 'scorer',
      action: 'score.reason',
      subjectType: 'Lead',
      subjectId: lead.id,
      reasonCode: code,
      metadata: { companyId, scoreVersion: breakdown.scoreVersion },
    })
  }

  return { scored: true, leadId: lead.id, breakdown }
}
