import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, testDb, truncateAll } from '../helpers/db.js'
import { boardSnapshot, proveBoard, syntheticJob } from '../fixtures/discovery-support.js'
import { COMPANY_SCORING_SELECT, collectScoreInput } from '../../src/intel/scoring/collect.js'
import { describeScoreRefusals, ensureScoreVersion, scoreCompanyAndPersist, ScoreRefusedError, type ScoreRefusalReason } from '../../src/intel/scoring/run.js'
import { SCORE_VERSION_V3 } from '../../src/intel/scoring/score-version.js'
import { seedRoleTracks } from '../../src/intel/taxonomy/seed-tracks.js'
import { pauseLead } from '../../src/outreach/send/ingest-outcomes.js'
import { researchCompanyPage } from '../../src/intel/research/page-research.js'
import { computeJobCountDelta } from '../../src/intel/signals/job-count-delta.js'
import { StubFetcher } from '../helpers/fixtures.js'
import type { Db } from '../../src/core/audit/audit-log.js'

/**
 * S — scorer persistence: RC-4 (collector-consistent attachment), RC-5 (same-cycle
 * history refusal) and R3 (stored stale-posting risk outside eligible support).
 * Every case calls the real exported collector/persistence functions.
 */
const NOW = new Date('2026-10-15T12:00:00Z') // current synthetic campaign cycle 2026-10
const DAY = 86_400_000
const db = testDb()
beforeEach(async () => { await truncateAll(); await seedRoleTracks(db) })
afterAll(closeTestDb)

// Evidence is written only for an explicit phase, never by the default suite.
const phase = process.env.JOBOSS_S_PHASE
function record(name: string, data: unknown) {
  if (!phase) return
  const dir = `scratch/joboss-s-corrections-01/${phase}`, file = `${dir}/${name}.json`
  mkdirSync(dir, { recursive: true })
  if (existsSync(file)) throw new Error(`Never overwrite ${file}`)
  writeFileSync(file, JSON.stringify(data, null, 2))
}

/** A typed refusal becomes `{ refused: outcome }`; a score or insufficient_evidence passes through; anything else rethrows. */
const settle = <T>(p: Promise<T>) => p.then((value): T | { refused: ScoreRefusedError['outcome'] } => value,
  (e: unknown) => { if (e instanceof ScoreRefusedError) return { refused: e.outcome }; throw e })

const row = (id: string) => db.company.findUniqueOrThrow({ where: { id }, select: COMPANY_SCORING_SELECT })
const at = (ms: number) => new Date(NOW.getTime() + ms)

/** Company text supported independently of any posting: seed one-liner plus a current owned product page. */
async function supported(domain = 'acme.example', proveAt: Date | null = NOW) {
  const c = await db.company.create({ data: { canonicalDomain: domain, displayName: 'Acme', countries: ['India'], locations: [], tags: [], teamSize: 25,
    ycOneLiner: 'We ship SwiftUI on iOS with on-device Core ML inference.' } })
  await db.evidence.create({ data: { companyId: c.id, sourceUrl: `https://${domain}/product`, sourceType: 'company_page',
    excerpt: 'Our iOS app uses Swift and SwiftUI with on-device Core ML.', contentHash: `product-${domain}`, observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch' } })
  if (proveAt) await proveBoard(c.id, proveAt)
  return c
}

async function withRole(domain = 'acme.example') {
  const c = await supported(domain)
  const ingest = await boardSnapshot(c.id, NOW, [syntheticJob('r1')])
  expect(ingest).toMatchObject({ created: 1, complete: true })
  return { c, role: await db.opportunity.findFirstOrThrow({ where: { companyId: c.id, externalId: 'r1' } }) }
}

async function state(companyId: string) {
  return {
    company: await db.company.findUniqueOrThrow({ where: { id: companyId } }),
    leads: await db.lead.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    drafts: await db.draft.findMany({ where: { lead: { companyId } }, orderBy: { id: 'asc' } }),
    packets: await db.applicationPacket.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    opportunities: await db.opportunity.findMany({ where: { companyId }, orderBy: { id: 'asc' } }),
    versions: await db.scoreVersion.findMany({ orderBy: { label: 'asc' } }),
    scoreAudits: await db.auditLog.findMany({ where: { action: { in: ['score.computed', 'score.reason', 'score.refused'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
  }
}

async function eligibleSummary(companyId: string) {
  const collected = await collectScoreInput(db, await row(companyId), NOW)
  const atsIds = (await db.evidence.findMany({ where: { companyId, sourceType: 'ats' }, select: { id: true } })).map((e) => e.id)
  return {
    collected,
    summary: {
      eligibleIds: collected.eligibleOpportunityIds,
      trackIds: collected.opportunityTracks.map((t) => t.opportunityId),
      postingFields: collected.fields.filter((f) => f.field.startsWith('posting')).map((f) => f.field),
      relevantOpenRoles: collected.input.hiring.relevantOpenRoles,
      hasRoleUrl: collected.input.applicationRoute.hasRoleUrl,
      newestPostingAgeDays: collected.input.freshness.newestPostingAgeDays,
      atsCitations: collected.citedEvidenceIds.filter((id) => atsIds.includes(id)),
      allPostingsStale: collected.input.risks.allPostingsStale,
    },
    atsIds,
  }
}

describe('RC-4: persistence attaches only a collector-eligible posting', () => {
  const rejections: Record<string, (id: string) => Promise<unknown>> = {
    closed: (id) => db.opportunity.update({ where: { id }, data: { status: 'closed', closedAt: NOW } }),
    stale: (id) => db.opportunity.update({ where: { id }, data: { lastSeenAt: new Date('2026-01-01T00:00:00Z') } }),
    'wrong-board': (id) => db.opportunity.update({ where: { id }, data: { roleUrl: 'https://job-boards.greenhouse.io/foreign/jobs/r1' } }),
    'hash-mismatch': (id) => db.opportunity.update({ where: { id }, data: { description: 'Tampered current body without its evidence.' } }),
    future: (id) => db.opportunity.update({ where: { id }, data: { lastSeenAt: at(DAY) } }),
  }

  it.each(Object.keys(rejections))('%s: zero eligible IDs, no rejected support, speculative/null association', async (name) => {
    const { c, role } = await withRole()
    await rejections[name]!(role.id)
    const { summary, atsIds } = await eligibleSummary(c.id)
    // Soft: the persisted association below is asserted even when collection is wrong.
    expect.soft(summary).toMatchObject({ eligibleIds: [], trackIds: [], postingFields: [], relevantOpenRoles: 0, hasRoleUrl: false, newestPostingAgeDays: null, atsCitations: [] })
    expect.soft(summary.allPostingsStale).toBe(name === 'stale')

    const outcome = await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    expect(outcome.scored).toBe(true)
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    const after = await db.opportunity.findUniqueOrThrow({ where: { id: role.id } })
    record(`rc4-${name}`, { summary, outcome: outcome.scored ? { reasonCodes: outcome.breakdown.reasonCodes, risks: outcome.breakdown.risks } : outcome,
      lead: { leadKind: lead.leadKind, opportunityId: lead.opportunityId }, roleTrackId: after.roleTrackId })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'speculative', opportunityId: null })
    expect(after.roleTrackId).toBeNull()
    expect(lead.citedEvidenceIds.filter((id) => atsIds.includes(id))).toEqual([])
    if (outcome.scored) expect(outcome.breakdown.reasonCodes.includes('outdated_role')).toBe(name === 'stale')
  })

  it('valid: the eligible posting is attached and labelled from its own text', async () => {
    const { c, role } = await withRole()
    const { summary } = await eligibleSummary(c.id)
    expect.soft(summary).toMatchObject({ eligibleIds: [role.id], trackIds: [role.id], relevantOpenRoles: 1, allPostingsStale: false })
    await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    const after = await db.opportunity.findUniqueOrThrow({ where: { id: role.id }, include: { roleTrack: true } })
    record('rc4-valid', { summary, lead: { leadKind: lead.leadKind, opportunityId: lead.opportunityId }, roleTrack: after.roleTrack?.key })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'posted_role', opportunityId: role.id })
    expect(after.roleTrack?.key).toBe('ios_android')
  })

  it('returning: a closed role re-listed by a complete snapshot is eligible again', async () => {
    const c = await supported('acme.example', null)
    await proveBoard(c.id, at(-20 * DAY)); await boardSnapshot(c.id, at(-20 * DAY), [syntheticJob('r1')])
    await proveBoard(c.id, at(-10 * DAY)); expect(await boardSnapshot(c.id, at(-10 * DAY), [], 0)).toMatchObject({ closed: 1, complete: true })
    await proveBoard(c.id, NOW); await boardSnapshot(c.id, NOW, [syntheticJob('r1')])
    const role = await db.opportunity.findFirstOrThrow({ where: { companyId: c.id } })
    expect(role.status).toBe('open')
    const { summary } = await eligibleSummary(c.id)
    expect.soft(summary.eligibleIds).toEqual([role.id])
    await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    record('rc4-returning', { summary, lead: { leadKind: lead.leadKind, opportunityId: lead.opportunityId } })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'posted_role', opportunityId: role.id })
  })

  it('mixed: a newer rejected decoy never displaces the older eligible posting', async () => {
    const c = await supported()
    await boardSnapshot(c.id, NOW, [syntheticJob('r1'), syntheticJob('r2', 'Android Engineer Intern', 'Build Android apps in Kotlin.')])
    const valid = await db.opportunity.findFirstOrThrow({ where: { companyId: c.id, externalId: 'r1' } })
    const decoy = await db.opportunity.findFirstOrThrow({ where: { companyId: c.id, externalId: 'r2' } })
    await db.opportunity.update({ where: { id: valid.id }, data: { lastSeenAt: at(-DAY) } })
    await db.opportunity.update({ where: { id: decoy.id }, data: { roleUrl: 'https://job-boards.greenhouse.io/foreign/jobs/r2' } })
    const { summary } = await eligibleSummary(c.id)
    expect.soft(summary.eligibleIds).toEqual([valid.id])
    await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    const decoyAfter = await db.opportunity.findUniqueOrThrow({ where: { id: decoy.id } })
    record('rc4-mixed-decoy', { summary, decoyId: decoy.id, validId: valid.id, lead: { leadKind: lead.leadKind, opportunityId: lead.opportunityId }, decoyRoleTrackId: decoyAfter.roleTrackId })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'posted_role', opportunityId: valid.id })
    expect(decoyAfter.roleTrackId).toBeNull()
  })

  it('several eligible postings: newest lastSeenAt wins, then the smaller stable ID', async () => {
    const c = await supported()
    await boardSnapshot(c.id, NOW, [syntheticJob('r1'), syntheticJob('r2', 'Android Engineer Intern', 'Build Android apps in Kotlin.')])
    const [first, second] = await db.opportunity.findMany({ where: { companyId: c.id }, orderBy: { id: 'asc' } })
    expect.soft((await eligibleSummary(c.id)).summary.eligibleIds).toEqual([first!.id, second!.id])
    await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    expect((await db.lead.findFirstOrThrow({ where: { companyId: c.id } })).opportunityId).toBe(first!.id)
    await db.opportunity.update({ where: { id: first!.id }, data: { lastSeenAt: at(-DAY) } })
    expect.soft((await eligibleSummary(c.id)).summary.eligibleIds).toEqual([second!.id, first!.id])
    await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    expect((await db.lead.findFirstOrThrow({ where: { companyId: c.id } })).opportunityId).toBe(second!.id)
  })
})

async function addDraft(leadId: string, status: 'composing' | 'closed' | 'approved' = 'approved') {
  return db.draft.create({ data: { leadId, status, subject: 'Synthetic reviewed draft', bodyText: 'Synthetic body.', citedEvidenceIds: [], approvedClaimIds: [],
    ...(status === 'approved' ? { approvalHash: 'synthetic-approval-hash', approvedBy: 'operator', approvedAt: NOW } : {}) } })
}

async function v3Lead(cycleNow = NOW) {
  const { c, role } = await withRole()
  await ensureScoreVersion(db, SCORE_VERSION_V3)
  const old = await scoreCompanyAndPersist(db, await row(c.id), { now: cycleNow, spec: SCORE_VERSION_V3, campaignCycle: `${cycleNow.getUTCFullYear()}-${String(cycleNow.getUTCMonth() + 1).padStart(2, '0')}` })
  if (!old.scored) throw new Error('v3 fixture expected to score')
  return { c, role, leadId: old.leadId }
}

async function v4Lead() {
  const { c, role } = await withRole()
  const first = await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
  if (!first.scored) throw new Error('v4 fixture expected to score')
  return { c, role, leadId: first.leadId }
}

describe('RC-5: protected same-cycle history is refused before any score-owned mutation', () => {
  const protectedCases: Record<string, () => Promise<{ c: { id: string }; leadId: string }>> = {
    'v3 deferred + approved draft (original)': async () => {
      const w = await v3Lead(); await db.lead.update({ where: { id: w.leadId }, data: { status: 'deferred' } }); await addDraft(w.leadId); return w
    },
    'v3 scorer-owned, no draft': v3Lead,
    'versionless manual association': async () => {
      const { c } = await withRole()
      const lead = await db.lead.create({ data: { companyId: c.id, leadKind: 'speculative', status: 'candidate', primaryTrack: 'ios_android',
        primaryTrackReason: 'manual association', campaignCycle: '2026-10', citedEvidenceIds: [] } })
      return { c, leadId: lead.id }
    },
    'same version + composing draft': async () => { const w = await v4Lead(); await addDraft(w.leadId, 'composing'); return w },
    'same version + closed draft': async () => { const w = await v4Lead(); await addDraft(w.leadId, 'closed'); return w },
    'same version + approved draft': async () => { const w = await v4Lead(); await addDraft(w.leadId, 'approved'); return w },
    'same version + application packet': async () => {
      const w = await v4Lead()
      const resume = await db.resumeVersion.create({ data: { label: 'synthetic', trackKey: 'ios_android', linkUrl: 'https://example.invalid/r.pdf' } })
      await db.applicationPacket.create({ data: { companyId: w.c.id, leadId: w.leadId, resumeVersionId: resume.id, officialUrl: 'https://job-boards.greenhouse.io/acme/jobs/r1',
        prefilledAnswers: {}, citedEvidenceIds: [], approvedClaimIds: [] } })
      return w
    },
    'same version + operator accepted': async () => { const w = await v4Lead(); await db.lead.update({ where: { id: w.leadId }, data: { status: 'accepted' } }); return w },
    'same version + operator deferred': async () => { const w = await v4Lead(); await db.lead.update({ where: { id: w.leadId }, data: { status: 'deferred' } }); return w },
    'same version + operator rejected': async () => { const w = await v4Lead(); await db.lead.update({ where: { id: w.leadId }, data: { status: 'rejected', statusReason: null } }); return w },
    'same version + paused (production pauseLead)': async () => { const w = await v4Lead(); await pauseLead(db, w.leadId); return w },
    'company excluded by operator': async () => { const w = await v4Lead(); await db.company.update({ where: { id: w.c.id }, data: { status: 'excluded', statusReason: null } }); return w },
  }

  it.each(Object.keys(protectedCases))('%s: explicit refusal, every row unchanged', async (name) => {
    const { c, leadId } = await protectedCases[name]!()
    const before = await state(c.id)
    const outcome = await settle(scoreCompanyAndPersist(db, await row(c.id), { now: NOW }))
    const after = await state(c.id)
    const refusal = await db.auditLog.findMany({ where: { action: 'score.history_protected' } })
    record(`rc5-${name.replace(/[^a-z0-9]+/gi, '-')}`, { outcome, unchanged: JSON.stringify(after) === JSON.stringify(before), refusal: refusal.map((r) => r.metadata),
      lead: before.leads.map((l) => ({ id: l.id, status: l.status, scoreVersionId: l.scoreVersionId })), versions: after.versions.map((v) => ({ label: v.label, isActive: v.isActive })) })
    expect(outcome).toMatchObject({ refused: { reason: 'history_protected', leadIds: [leadId] } })
    expect(after).toEqual(before)
    expect(refusal).toHaveLength(1)
  })

  it('separate cycle: older v3 history stays byte-identical while the current cycle scores', async () => {
    const w = await v3Lead(new Date('2026-09-20T12:00:00Z'))
    await db.lead.update({ where: { id: w.leadId }, data: { status: 'deferred' } }); const draft = await addDraft(w.leadId)
    const old = await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })
    const outcome = await scoreCompanyAndPersist(db, await row(w.c.id), { now: NOW })
    if (!outcome.scored) throw new Error('current cycle expected to score')
    expect(outcome.leadId).not.toBe(w.leadId)
    expect(await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })).toEqual(old)
    expect(await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(draft)
    expect((await db.lead.findUniqueOrThrow({ where: { id: outcome.leadId } })).campaignCycle).toBe('2026-10')
  })

  it('ordinary same-version unprotected rescoring reuses the one current lead', async () => {
    const { c, leadId } = await v4Lead()
    const first = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
    const again = await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    expect(again).toMatchObject({ scored: true, leadId })
    const second = await db.lead.findUniqueOrThrow({ where: { id: leadId } })
    expect({ ...second, updatedAt: null }).toEqual({ ...first, updatedAt: null })
    expect(await db.lead.count({ where: { companyId: c.id } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'score.computed' } })).toBe(2)
  })

  it('unprotected insufficient evidence stays truthful and does not touch history', async () => {
    const c = await db.company.create({ data: { canonicalDomain: 'candles.example', displayName: 'Candles', countries: [], locations: [], tags: [], ycOneLiner: 'We sell artisanal candles.' } })
    expect(await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })).toMatchObject({ scored: false, reason: 'insufficient_evidence' })
    expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('insufficient_evidence')
  })
})

/** Waits on a real lock wait in pg_stat_activity — a transaction-state control, not a sleep. */
async function lockWaiter(fragment: string) {
  for (let i = 0; i < 200; i += 1) {
    const rows = await db.$queryRaw<{ query: string }[]>`SELECT query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if (rows.some((r) => r.query.toLowerCase().includes(fragment.toLowerCase()))) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return false
}

function gate() {
  let open!: () => void
  const opened = new Promise<void>((r) => { open = r })
  return { open, opened }
}

/** Bounded so the pre-change red run reports a block instead of hanging. */
const bounded = <T>(p: Promise<T>) => Promise.race([p, new Promise<'blocked'>((r) => setTimeout(() => r('blocked'), 5_000))])

/** Fails every Lead write: injected after S's version, track and lock steps. */
const failing = (tx: Db) => new Proxy(tx, { get(target, key) {
  const value = Reflect.get(target, key)
  if (key === 'lead') return new Proxy(value as object, { get: (l, k) => (k === 'create' || k === 'update') ? () => Promise.reject(new Error('injected lead write failure')) : Reflect.get(l, k) })
  return typeof value === 'function' ? value.bind(target) : value
} }) as Db

/** A standalone client whose own score transaction gets `failing`. */
const failingStandalone = new Proxy(db, { get(target, key) {
  if (key === '$transaction') return (fn: (tx: Db) => unknown, opts: unknown) => target.$transaction((tx) => fn(failing(tx)) as never, opts as never)
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? value.bind(target) : value
} }) as Db

/** The first query really waiting on another session's lock, or null after a bounded poll. */
async function blockedQuery() {
  for (let i = 0; i < 200; i += 1) {
    const [hit] = await db.$queryRaw<{ query: string }[]>`SELECT query FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0`
    if (hit) return hit.query
    await new Promise((r) => setTimeout(r, 25))
  }
  return null
}

/** Pauses S at `model.method` inside its own transaction, before the call or after it returns. */
function pausedAt(tx: Db, model: string, method: string, when: 'before' | 'after', reached: () => void, release: Promise<void>) {
  return new Proxy(tx, { get(target, key) {
    const value = Reflect.get(target, key)
    if (key !== model) return typeof value === 'function' ? value.bind(target) : value
    return new Proxy(value as object, { get(delegate, name) {
      const fn = Reflect.get(delegate, name)
      if (name !== method) return typeof fn === 'function' ? fn.bind(delegate) : fn
      return async (...args: unknown[]) => {
        if (when === 'before') { reached(); await release }
        const out = await (fn as (...a: unknown[]) => Promise<unknown>).apply(delegate, args)
        if (when === 'after') { reached(); await release }
        return out
      }
    } })
  } }) as Db
}

describe('S concurrency and transaction boundary', () => {
  it('two competing callers on one company/cycle produce one current lead', async () => {
    const { c } = await withRole()
    const company = await row(c.id)
    const [a, b] = await Promise.all([scoreCompanyAndPersist(db, company, { now: NOW }), scoreCompanyAndPersist(db, company, { now: NOW })])
    record('race-two-callers', { a: a.scored ? a.leadId : a, b: b.scored ? b.leadId : b, leads: await db.lead.count() })
    expect(a.scored && b.scored).toBe(true)
    if (a.scored && b.scored) expect(a.leadId).toBe(b.leadId)
    expect(await db.lead.count({ where: { companyId: c.id } })).toBe(1)
  })

  async function overlap(name: string, hold: (tx: Db, w: Awaited<ReturnType<typeof v4Lead>>) => Promise<unknown>, expectAfter: (o: unknown) => void) {
    const w = await v4Lead()
    const holding = gate(), release = gate()
    const other = db.$transaction(async (tx) => { await hold(tx, w); holding.open(); await release.opened }, { timeout: 30_000 })
    await holding.opened
    const before = await state(w.c.id)
    const scoring = settle(scoreCompanyAndPersist(db, await row(w.c.id), { now: NOW }))
    const during = await bounded(scoring)
    const unchanged = JSON.stringify(await state(w.c.id)) === JSON.stringify(before)
    release.open(); await other
    const late = during === 'blocked' ? await scoring : null
    const fresh = await settle(scoreCompanyAndPersist(db, await row(w.c.id), { now: NOW }))
    record(`overlap-${name}`, { during, late, unchangedWhileHeld: unchanged, fresh, leads: await db.lead.findMany({ where: { companyId: w.c.id } }) })
    expect(during).toMatchObject({ refused: { reason: 'concurrent_change' } })
    expect(unchanged).toBe(true)
    expectAfter(fresh)
    expect(await db.lead.count({ where: { companyId: w.c.id } })).toBe(1)
    return w
  }

  it('operator status change in flight: busy refusal, then protected history', async () => {
    const w = await overlap('operator', (tx, x) => tx.lead.update({ where: { id: x.leadId }, data: { status: 'deferred' } }),
      (o) => expect(o).toMatchObject({ refused: { reason: 'history_protected' } }))
    expect((await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })).status).toBe('deferred')
  })

  it('draft binding in flight: busy refusal, then protected history', async () => {
    await overlap('draft-binding', (tx, x) => tx.draft.create({ data: { leadId: x.leadId, status: 'composing', citedEvidenceIds: [], approvedClaimIds: [] } }),
      (o) => expect(o).toMatchObject({ refused: { reason: 'history_protected' } }))
  })

  it('selected role closing in flight: busy refusal, then a fresh speculative result', async () => {
    const w = await overlap('role-closure', (tx, x) => tx.opportunity.update({ where: { id: x.role.id }, data: { status: 'closed', closedAt: NOW } }),
      (o) => expect(o).toMatchObject({ scored: true }))
    const lead = await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'speculative', opportunityId: null })
  })

  it('an operator change arriving during the S write window waits and lands after the score', async () => {
    const w = await v4Lead()
    const inside = gate(), release = gate()
    const scoring = db.$transaction(async (tx) => { const o = await scoreCompanyAndPersist(tx, await row(w.c.id), { now: NOW }); inside.open(); await release.opened; return o }, { timeout: 30_000 })
    await inside.opened
    // `.then` starts the lazy Prisma query now, so it can actually queue behind S's lock.
    const operator = db.lead.update({ where: { id: w.leadId }, data: { status: 'deferred' } }).then((r) => r)
    const waited = await lockWaiter('UPDATE "public"."lead"')
    release.open()
    const [scored] = await Promise.all([scoring, operator])
    expect(waited).toBe(true)
    expect(scored).toMatchObject({ scored: true, leadId: w.leadId })
    expect((await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })).status).toBe('deferred')
    expect(await settle(scoreCompanyAndPersist(db, await row(w.c.id), { now: NOW }))).toMatchObject({ refused: { reason: 'history_protected' } })
  })

  it('caller-owned transaction: scores inside, and an injected failure leaves no partial S mutation', async () => {
    const { c } = await withRole()
    const company = await row(c.id)
    const inside = await db.$transaction((tx) => scoreCompanyAndPersist(tx, company, { now: NOW }), { timeout: 30_000 })
    expect(inside.scored).toBe(true)
    expect(await db.lead.count({ where: { companyId: c.id } })).toBe(1)

    const second = await withRole('beta.example')
    const before = await state(second.c.id)
    const caller = await db.$transaction(async (tx) => {
      const error = await scoreCompanyAndPersist(failing(tx), await row(second.c.id), { now: NOW }).then(() => null, (e: Error) => e.message)
      await tx.auditLog.create({ data: { actorType: 'system', actorId: 'caller', action: 'caller.continued', subjectType: 'Company', subjectId: second.c.id } })
      return error
    }, { timeout: 30_000 })
    const after = await state(second.c.id)
    record('nested-error-rollback', { caller, unchanged: JSON.stringify(after) === JSON.stringify(before), callerWrite: await db.auditLog.count({ where: { action: 'caller.continued' } }) })
    expect(caller).toBe('injected lead write failure')
    expect(after).toEqual(before)
    expect(await db.auditLog.count({ where: { action: 'caller.continued' } })).toBe(1)

    await expect(scoreCompanyAndPersist(failingStandalone, await row(second.c.id), { now: NOW })).rejects.toThrow('injected lead write failure')
    expect(await state(second.c.id)).toEqual(before)
  })

  it('refuses visibly inside a caller snapshot it cannot keep fresh', async () => {
    const { c } = await withRole()
    const company = await row(c.id)
    await expect(db.$transaction((tx) => scoreCompanyAndPersist(tx, company, { now: NOW }), { isolationLevel: 'RepeatableRead', timeout: 30_000 }))
      .rejects.toThrow(/READ COMMITTED/)
    expect(await db.lead.count()).toBe(0)
  })
})

describe('R3: stored stale-posting risk stays separate from eligible support', () => {
  async function legacy(rows: { lastSeenAt: Date; status?: 'open' | 'closed' }[], seed: string | null = 'We ship SwiftUI on iOS with on-device Core ML inference.') {
    const c = await db.company.create({ data: { canonicalDomain: 'stale.example', displayName: 'Stale Co', countries: ['India'], locations: [], tags: [], teamSize: 40,
      atsBoardToken: 'stale', atsSlug: 'greenhouse', ycOneLiner: seed } })
    for (const [i, r] of rows.entries()) {
      await db.opportunity.create({ data: { companyId: c.id, kind: 'published_role', status: r.status ?? 'open', title: 'iOS Engineer',
        roleUrl: `https://job-boards.greenhouse.io/stale/jobs/${i}`, externalId: `stale-${i}`, lastSeenAt: r.lastSeenAt } })
    }
    return c
  }
  const ages: [string, { lastSeenAt: Date; status?: 'open' | 'closed' }[], boolean][] = [
    ['exactly 90d', [{ lastSeenAt: at(-90 * DAY) }], false],
    ['90d + 1ms', [{ lastSeenAt: at(-90 * DAY - 1) }], false],
    ['91d', [{ lastSeenAt: at(-91 * DAY) }], true],
    ['stale-only, several', [{ lastSeenAt: at(-91 * DAY) }, { lastSeenAt: at(-300 * DAY) }], true],
    ['mixed fresh/stale', [{ lastSeenAt: at(-200 * DAY) }, { lastSeenAt: at(-DAY) }], false],
    ['future', [{ lastSeenAt: at(DAY) }], false],
    ['future + stale', [{ lastSeenAt: at(DAY) }, { lastSeenAt: at(-200 * DAY) }], false],
    ['no rows', [], false],
    ['closed-only', [{ lastSeenAt: at(-200 * DAY), status: 'closed' }], false],
    ['closed stale + open fresh', [{ lastSeenAt: at(-200 * DAY), status: 'closed' }, { lastSeenAt: at(-DAY) }], false],
  ]
  it.each(ages.map(([name, rows, stale]) => ({ name, rows, stale })))('$name → allPostingsStale $stale, never support', async ({ name, rows, stale }) => {
    const c = await legacy(rows)
    const { summary } = await eligibleSummary(c.id)
    record(`r3-${name.replace(/[^a-z0-9]+/gi, '-')}`, summary)
    expect.soft(summary.allPostingsStale).toBe(stale)
    expect.soft(summary).toMatchObject({ eligibleIds: [], trackIds: [], postingFields: [], relevantOpenRoles: 0, hasRoleUrl: false, newestPostingAgeDays: null })
  })

  it('legacy outdated_role path: real collector→score→audit warning with a speculative/null association', async () => {
    const c = await legacy([{ lastSeenAt: new Date('2026-01-01T00:00:00Z') }])
    const outcome = await scoreCompanyAndPersist(db, await row(c.id), { now: new Date('2026-09-09T00:00:00Z') })
    if (!outcome.scored) throw new Error('seed support expected to score')
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    const audit = await db.auditLog.findMany({ where: { action: 'score.reason', reasonCode: 'outdated_role' } })
    const role = await db.opportunity.findFirstOrThrow({ where: { companyId: c.id } })
    record('r3-legacy-outdated-role', { reasonCodes: outcome.breakdown.reasonCodes, risks: outcome.breakdown.risks, audit: audit.length,
      lead: { leadKind: lead.leadKind, opportunityId: lead.opportunityId, citedEvidenceIds: lead.citedEvidenceIds }, roleTrackId: role.roleTrackId })
    expect(outcome.breakdown.reasonCodes).toContain('outdated_role')
    expect(outcome.breakdown.risks.map((r) => r.key)).toContain('stale_postings')
    expect(audit).toHaveLength(1)
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'speculative', opportunityId: null })
    expect(role.roleTrackId).toBeNull()
  })

  it('stale-only text without an independent match is still insufficient_evidence', async () => {
    const c = await legacy([{ lastSeenAt: at(-200 * DAY) }], null)
    expect(await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })).toMatchObject({ scored: false, reason: 'insufficient_evidence' })
    expect(await db.lead.count()).toBe(0)
  })

  it('an owned, once-ingested posting that went stale warns but never attaches', async () => {
    const c = await supported('acme.example', null)
    await proveBoard(c.id, at(-120 * DAY)); await boardSnapshot(c.id, at(-120 * DAY), [syntheticJob('r1')])
    await proveBoard(c.id, NOW)
    const { summary } = await eligibleSummary(c.id)
    expect.soft(summary).toMatchObject({ eligibleIds: [], allPostingsStale: true, atsCitations: [] })
    const outcome = await scoreCompanyAndPersist(db, await row(c.id), { now: NOW })
    if (!outcome.scored) throw new Error('company support expected to score')
    expect(outcome.breakdown.reasonCodes).toContain('outdated_role')
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    expect({ kind: lead.leadKind, opportunityId: lead.opportunityId }).toEqual({ kind: 'speculative', opportunityId: null })
  })
})

/**
 * RS-01: support used by a score stays current through its commit. The trigger is
 * the reviewer's: no seed text, a genuinely ingested neutral role, and a current
 * product page as the only technical match. The real page writer then appends a
 * newer neutral observation at the same URL while S is inside its transaction.
 */
describe('RS-01: a newer page observation cannot supersede support S is persisting', () => {
  const PAGE = 'https://race.example/product'
  const neutral = () => new StubFetcher({ [PAGE]: { body: `<!doctype html><html><head><title>Our pottery</title></head><body><article><h1>Our studio</h1><p>${
    'Our ceramics studio makes hand thrown mugs, bowls and plates. We shape clay and glaze each piece. Our potters sell handmade tableware in our local shop. '.repeat(6)}</p></article></body></html>` } })
  const supersede = (client: Db, c: { id: string; canonicalDomain: string; countries: string[] }) =>
    researchCompanyPage(client, neutral(), c, PAGE, { now: NOW, sameHostDelayMs: 0 })

  async function pageOnly() {
    const c = await db.company.create({ data: { canonicalDomain: 'race.example', displayName: 'Review', countries: ['India'], locations: [], tags: [], teamSize: 24 } })
    await proveBoard(c.id, at(-1000))
    await boardSnapshot(c.id, at(-1000), [syntheticJob('neutral', 'Operations Associate', 'We pack ceramic mugs and plates for local shops.')])
    const old = await db.evidence.create({ data: { companyId: c.id, sourceUrl: PAGE, sourceType: 'company_page', excerpt: 'Our iOS apps use Swift and SwiftUI with on-device Core ML.',
      contentHash: 'race-old', observedAt: at(-1000), confidence: 0.9, fetchedVia: 'static_fetch' } })
    const initial = await collectScoreInput(db, await row(c.id), NOW)
    expect(initial.input.match.matches.map((m) => m.track)).toContain('ios_android')
    return { c, old }
  }

  /** After the writer lands, the neutral page is current: no match, and scoring refuses truthfully. */
  async function expectNeutralCurrent(companyId: string) {
    expect((await collectScoreInput(db, await row(companyId), NOW)).input.match.matches).toEqual([])
    expect(await scoreCompanyAndPersist(db, await row(companyId), { now: NOW })).toMatchObject({ scored: false, reason: 'insufficient_evidence' })
  }

  it.each([
    { window: 'after collection, at roleTrack.findMany', model: 'roleTrack', when: 'before' as const },
    { window: 'immediately after the Evidence read', model: 'evidence', when: 'after' as const },
  ])('real page writer $window: waits for S, commits after it, then is current', async ({ window, model, when }) => {
    const { c, old } = await pageOnly()
    const reached = gate(), release = gate(), order: string[] = []
    const scoring = db.$transaction((tx) => scoreCompanyAndPersist(pausedAt(tx, model, 'findMany', when, reached.open, release.opened), c, { now: NOW }), { timeout: 30_000 })
      .then((o) => { order.push('S committed'); return o })
    await reached.opened
    // Started, not awaited: under the boundary it must queue behind S's transaction.
    const writer = supersede(db, c).then((o) => { order.push('page committed'); return o })
    const blocked = await blockedQuery()
    release.open()
    const outcome = await scoring, page = await writer
    const lead = await db.lead.findFirst({ where: { companyId: c.id } })
    record(`rs01-${model}`, { window, blocked, order, outcome, page: page.kind, lead: lead && { score: lead.score, kind: lead.leadKind, citedEvidenceIds: lead.citedEvidenceIds }, oldEvidenceId: old.id })
    expect(blocked).toMatch(/evidence|audit_log|company_signal/i)
    expect(order).toEqual(['S committed', 'page committed'])
    // S used the page that was current when it committed; the newer page commits only afterwards.
    expect(outcome).toMatchObject({ scored: true })
    expect(lead?.citedEvidenceIds).toContain(old.id)
    expect(page.kind).toBe('stored')
    await expectNeutralCurrent(c.id)
  })

  it('page observation already written but uncommitted: bounded busy refusal, nothing written; after commit, insufficient_evidence', async () => {
    const { c } = await pageOnly()
    const holding = gate(), release = gate()
    const writer = db.$transaction(async (tx) => { const o = await supersede(tx, c); holding.open(); await release.opened; return o }, { timeout: 30_000 })
    await holding.opened
    const before = await state(c.id)
    const during = await bounded(settle(scoreCompanyAndPersist(db, await row(c.id), { now: NOW })))
    const unchanged = JSON.stringify(await state(c.id)) === JSON.stringify(before)
    release.open(); await writer
    record('rs01-uncommitted-writer', { during, unchanged })
    expect(during).toMatchObject({ refused: { reason: 'concurrent_change' } })
    expect(unchanged).toBe(true)
    await expectNeutralCurrent(c.id)
    expect(await db.lead.count()).toBe(0)
    expect(await db.scoreVersion.count()).toBe(0)
  })

  it('caller-owned transaction: the page writer stays excluded until the caller commits, not until S returns', async () => {
    const { c, old } = await pageOnly()
    const returned = gate(), finish = gate(), order: string[] = []
    const caller = db.$transaction(async (tx) => {
      const o = await scoreCompanyAndPersist(tx, c, { now: NOW })
      returned.open(); await finish.opened; order.push('caller committing'); return o
    }, { timeout: 30_000 })
    await returned.opened
    const writer = supersede(db, c).then((o) => { order.push('page committed'); return o })
    const blocked = await blockedQuery()
    finish.open()
    const outcome = await caller; await writer
    record('rs01-caller-held', { blocked, order, outcome })
    expect(blocked).not.toBeNull()
    expect(order).toEqual(['caller committing', 'page committed'])
    expect(outcome).toMatchObject({ scored: true })
    expect((await db.lead.findFirstOrThrow({ where: { companyId: c.id } })).citedEvidenceIds).toContain(old.id)
    await expectNeutralCurrent(c.id)
  })

  it('caller-owned transaction: an injected failure rolls S and its support locks back to the savepoint', async () => {
    const { c } = await pageOnly()
    const before = await state(c.id)
    const result = await db.$transaction(async (tx) => {
      const error = await scoreCompanyAndPersist(failing(tx), c, { now: NOW }).then(() => null, (e: Error) => e.message)
      // Another session: must not wait on locks the rolled-back savepoint held.
      const page = await bounded(supersede(db, c))
      await tx.auditLog.create({ data: { actorType: 'system', actorId: 'caller', action: 'caller.continued', subjectType: 'Company', subjectId: c.id } })
      return { error, page: page === 'blocked' ? page : page.kind }
    }, { timeout: 30_000 })
    record('rs01-caller-failure', result)
    expect(result).toEqual({ error: 'injected lead write failure', page: 'stored' })
    expect(await state(c.id)).toEqual(before)
    expect(await db.auditLog.count({ where: { action: 'caller.continued' } })).toBe(1)
    await expectNeutralCurrent(c.id)
  })

  it('an eligible role ingested before the boundary but after the open-row locks is still a busy refusal', async () => {
    // No open row yet, so S holds no posting row the ingestion would have to wait for.
    const c = await supported()
    const reached = gate(), release = gate()
    const lockSupport = (tx: Db) => new Proxy(tx, { get(target, key) {
      const value = Reflect.get(target, key)
      if (key !== '$executeRaw') return typeof value === 'function' ? value.bind(target) : value
      return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join('').includes('LOCK TABLE')) { reached.open(); await release.opened }
        return (value as (...a: unknown[]) => Promise<unknown>).call(target, strings, ...values)
      }
    } }) as Db
    const scoring = settle(db.$transaction((tx) => scoreCompanyAndPersist(lockSupport(tx), c, { now: NOW }), { timeout: 30_000 }))
    const paused = await bounded(reached.opened)
    const ingest = await bounded(boardSnapshot(c.id, NOW, [syntheticJob('r1')]))
    release.open()
    const outcome = await scoring
    record('rs01-membership', { paused, ingest, outcome })
    expect(paused).not.toBe('blocked')
    expect(ingest).toMatchObject({ created: 1 })
    expect(outcome).toMatchObject({ refused: { reason: 'concurrent_change' } })
    expect(await db.lead.count()).toBe(0)
  })

  it.each([
    { name: 'ownership rebind', write: (id: string) => proveBoard(id, NOW, 'replacement'), eligible: 0 },
    { name: 'changed posting ingestion', write: (id: string) => boardSnapshot(id, NOW, [syntheticJob('r1', 'Android Engineer', 'Build Android apps in Kotlin.')]), eligible: 1 },
  ])('production $name during S waits and is current afterwards', async ({ name, write, eligible }) => {
    const { c } = await withRole()
    const reached = gate(), release = gate(), order: string[] = []
    const scoring = db.$transaction((tx) => scoreCompanyAndPersist(pausedAt(tx, 'roleTrack', 'findMany', 'before', reached.open, release.opened), c, { now: NOW }), { timeout: 30_000 })
      .then((o) => { order.push('S committed'); return o })
    await reached.opened
    const writer = write(c.id).then(() => { order.push('writer committed') })
    const blocked = await blockedQuery()
    release.open()
    const outcome = await scoring; await writer
    const fresh = await collectScoreInput(db, await row(c.id), NOW)
    record(`rs01-seam-${name.replace(/ /g, '-')}`, { blocked, order, scored: outcome.scored, eligible: fresh.eligibleOpportunityIds, tracks: fresh.opportunityTracks })
    expect(blocked).not.toBeNull()
    expect(order).toEqual(['S committed', 'writer committed'])
    expect(outcome.scored).toBe(true)
    expect(fresh.eligibleOpportunityIds).toHaveLength(eligible)
    if (eligible) expect(fresh.opportunityTracks[0]?.track).toBe('ios_android')
  })
})

/**
 * RS-02: the CLI's pre-scoring steps, read from `tools/run-intelligence.ts` itself
 * and run against B with the production functions they name, followed by the CLI's
 * scoring loop. Restoring a startup `ensureScoreVersion(db)` puts it back in this list.
 */
describe('RS-02: intel:run startup leaves score versions to a successful guarded score', () => {
  const cli = readFileSync('tools/run-intelligence.ts', 'utf8')
  const startup = cli.slice(cli.indexOf('const config = env()'), cli.indexOf('// --- optional research pass'))
  const steps: Record<string, () => Promise<unknown>> = {
    seedRoleTracks: () => seedRoleTracks(db),
    ensureScoreVersion: () => ensureScoreVersion(db),
    computeJobCountDelta: async () => { for (const { id } of await db.company.findMany({ select: { id: true } })) await computeJobCountDelta(db, id) },
  }

  async function runCli(score: Db = db) {
    const called = [...new Set([...startup.matchAll(/await (\w+)\(/g)].map((m) => m[1]!))]
    for (const name of called) {
      const step = steps[name]
      if (!step) throw new Error(`unmapped intel:run startup call ${name}`)
      await step()
    }
    const refused: Partial<Record<ScoreRefusalReason, number>> = {}
    let scored = 0
    for (const company of await db.company.findMany({ select: COMPANY_SCORING_SELECT, orderBy: { createdAt: 'asc' } })) {
      const outcome = await scoreCompanyAndPersist(score, company, { now: NOW }).catch((error: unknown) => {
        if (error instanceof ScoreRefusedError) return { scored: false as const, reason: error.outcome.reason }
        throw error
      })
      if (outcome.scored) scored += 1
      else refused[outcome.reason] = (refused[outcome.reason] ?? 0) + 1
    }
    return { called, scored, line: describeScoreRefusals(refused) }
  }
  const versions = () => db.scoreVersion.findMany({ orderBy: { label: 'asc' } })

  it('all companies protected (2026-10 v3 deferred + approved draft, v3 active, v4 absent): versions, Lead and Draft unchanged', async () => {
    const w = await v3Lead()
    await db.lead.update({ where: { id: w.leadId }, data: { status: 'deferred' } }); await addDraft(w.leadId)
    const before = await state(w.c.id)
    expect(before.versions.map((v) => [v.label, v.isActive])).toEqual([[SCORE_VERSION_V3.label, true]])
    const run = await runCli()
    const after = await state(w.c.id)
    record('rs02-all-protected', { run, versionsBefore: before.versions, versionsAfter: after.versions })
    expect(after.versions).toEqual(before.versions)
    expect(after).toEqual(before)
    expect(run).toMatchObject({ scored: 0, line: '0 refused as insufficient_evidence, 1 refused to protect existing lead history, 0 skipped on a concurrent change (retry)' })
  })

  it('a genuinely successful new-company score initializes the requested version normally', async () => {
    await ensureScoreVersion(db, SCORE_VERSION_V3)
    const { c } = await withRole()
    const run = await runCli()
    const [v3, v4] = [SCORE_VERSION_V3.label, 'joboss-v4'].map((label) => versions().then((all) => all.find((v) => v.label === label)))
    const lead = await db.lead.findFirstOrThrow({ where: { companyId: c.id } })
    record('rs02-success', { run, versions: await versions() })
    expect(run).toMatchObject({ scored: 1, line: '0 refused as insufficient_evidence, 0 refused to protect existing lead history, 0 skipped on a concurrent change (retry)' })
    expect(await v3).toMatchObject({ isActive: false })
    expect(await v4).toMatchObject({ isActive: true })
    expect(lead.scoreVersionId).toBe((await v4)!.id)
  })

  it('failure, busy and insufficient-evidence paths leave no new version; an existing version is reused', async () => {
    await ensureScoreVersion(db, SCORE_VERSION_V3)
    const only = await versions()
    const { c } = await withRole()
    await expect(runCli(failingStandalone)).rejects.toThrow('injected lead write failure')
    expect(await versions()).toEqual(only)

    const holding = gate(), release = gate()
    const other = db.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM company WHERE id = ${c.id} FOR UPDATE`; holding.open(); await release.opened }, { timeout: 30_000 })
    await holding.opened
    const busy = await runCli()
    release.open(); await other
    expect(busy).toMatchObject({ scored: 0, line: '0 refused as insufficient_evidence, 0 refused to protect existing lead history, 1 skipped on a concurrent change (retry)' })
    expect(await versions()).toEqual(only)

    await db.company.create({ data: { canonicalDomain: 'candles.example', displayName: 'Candles', countries: [], locations: [], tags: [], ycOneLiner: 'We sell artisanal candles.' } })
    await withRole('beta.example')
    const first = await runCli()
    const created = await versions()
    const second = await runCli()
    record('rs02-paths', { busy, first, second, versions: await versions() })
    expect(first).toMatchObject({ scored: 2, line: '1 refused as insufficient_evidence, 0 refused to protect existing lead history, 0 skipped on a concurrent change (retry)' })
    expect(second).toMatchObject({ scored: 2 })
    expect(created).toHaveLength(2)
    expect(await versions()).toEqual(created)
    expect(new Set((await db.lead.findMany()).map((l) => l.scoreVersionId))).toEqual(new Set([created.find((v) => v.isActive)!.id]))
  })
})
