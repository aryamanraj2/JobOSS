import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { proveBoard, boardSnapshot, syntheticJob } from '../fixtures/discovery-support.js'
import { prepareDiscovery, refreshDiscoveryBoards } from '../../src/ingest/discovery/prepare.js'
import { INVESTOR_SEEDS, STARTUPDB_BASE as S } from '../../src/ingest/discovery/startupdb.js'
import { HN_API as H } from '../../src/ingest/discovery/hn.js'
import { storeFundingRound } from '../../src/ingest/discovery/funding.js'
import { ingestPostings } from '../../src/ingest/ats/ingest-postings.js'
import { GreenhouseProvider } from '../../src/ingest/ats/greenhouse.js'
import { collectScoreInput, COMPANY_SCORING_SELECT } from '../../src/intel/scoring/collect.js'
import { rankOutreachCompanies } from '../../src/intel/outreach/assess.js'
import { ensureScoreVersion, scoreCompanyAndPersist } from '../../src/intel/scoring/run.js'
import { SCORE_VERSION_V3, ACTIVE_SCORE_VERSION } from '../../src/intel/scoring/score-version.js'
const NOW = new Date('2026-10-15T00:00:00Z')
const db = testDb()
beforeEach(async () => { vi.restoreAllMocks(); await truncateAll() })
afterAll(closeTestDb)
async function company(domain = 'acme.example', extra: Record<string, unknown> = {}) {
  return db.company.create({ data: { canonicalDomain: domain, displayName: 'Acme', countries: [], locations: [], tags: [], teamSize: 2, ...extra } })
}
async function product(companyId: string, domain: string, text = 'Our iOS app uses Swift and SwiftUI with on-device Core ML.', extra: Record<string, unknown> = {}) {
  return db.evidence.create({ data: { companyId, sourceUrl: `https://${domain}/product`, sourceType: 'company_page', excerpt: text,
    contentHash: 'synthetic-product', observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch', ...extra } })
}
const indexUrl = `${S}/startups/acme`
const round = { eventId: 'seed-1', roundLabel: 'Seed', eventDate: '2026-09-01', amount: { original: '1000000', currency: 'USD' },
  participants: [{ name: 'Seedcamp', role: 'lead' }], sourceUrls: ['https://acme.example/news/seed'] }
function fundingGate(text = 'Acme raised a Seed funding round on September 1, 2026.') {
  return new StubFetcher({ 'https://acme.example/news/seed': { body: `<html><head><title>Acme funding</title></head><body><article><h1>Acme funding</h1><p>${text}</p><p>${'This is the original company announcement. '.repeat(15)}</p></article></body></html>` } })
}
function discoveryGate(ycRecords: unknown[] = [{ id: 1, name: 'Acme', website: 'https://acme.example', batch: 'Summer 2026', status: 'Active', team_size: 2 }]) {
  const responses: Record<string, { body: string }> = {
    'https://yc-oss.github.io/api/companies/all.json': { body: JSON.stringify(ycRecords) },
    [`${H}/user/whoishiring.json`]: { body: JSON.stringify({ id: 'whoishiring', submitted: [30, 20, 10] }) },
  }
  for (const [i, seed] of INVESTOR_SEEDS.entries()) {
    responses[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = { body: JSON.stringify({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } }) }
    responses[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = { body: JSON.stringify({ data: i ? [] : [{ name: 'Acme', slug: 'acme', domain: 'acme.example' }], pagination: { total: i ? 0 : 1 } }) }
  }
  responses[indexUrl] = { body: JSON.stringify({ data: { name: 'Acme', slug: 'acme', domain: 'acme.example', profile: { shortDescription: 'iOS Swift SwiftUI mobile app' }, fundingHistory: [], fundingHistoryTotal: 0 } }) }
  for (const [i, id] of [30, 20, 10].entries()) {
    responses[`${H}/item/${id}.json`] = { body: JSON.stringify({ id, by: 'whoishiring', type: 'story', title: 'Ask HN: Who is hiring?', time: Date.UTC(2026, 9 - i, 1) / 1000, kids: [id + 1] }) }
    responses[`${H}/item/${id + 1}.json`] = { body: JSON.stringify({ id: id + 1, by: 'owner', type: 'comment', parent: id, time: Date.UTC(2026, 9 - i, 2) / 1000,
      text: 'Acme | Hiring iOS engineers <a href="https://acme.example">Apply</a> owner@acme.example' }) }
  }
  return new StubFetcher(responses)
}
describe('C discovery persistence and source funnel (synthetic)', () => {
  it('counts source/run/company identities distinctly across all three sources and resumes completed scopes without requests', async () => {
    const gate = discoveryGate(), result = await prepareDiscovery(db, gate, { limit: 20, now: NOW, delayMs: 0 })
    expect(result.complete).toBe(true); expect(result.discovered).toBe(1); expect(result.companyIds).toHaveLength(1)
    expect(result.sources.map((s) => s.discovered)).toEqual([1, 1, 1]); expect(await db.contact.count()).toBe(0)
    const resumeGate = new StubFetcher({}), resumed = await prepareDiscovery(db, resumeGate, { limit: 20, now: NOW, delayMs: 0, resume: true, runId: result.batchId })
    expect(resumed.discovered).toBe(1); expect(resumeGate.requested).toHaveLength(0)
    writeFileSync('/tmp/joboss-c-evidence/synthetic-funnel.json', JSON.stringify(result, null, 2))
  })
  it('rejects unknown run scopes before creating source work', async () => {
    await expect(prepareDiscovery(db, discoveryGate(), { limit: 2, resume: true, runId: 'unrelated' })).rejects.toThrow('Unknown')
    expect(await db.discoveryRun.count()).toBe(0)
  })
  it('retains the last durable YC cursor on a checkpoint failure and idempotently replays', async () => {
    const original = db.discoveryRun.update.bind(db.discoveryRun); let failed = false
    const spy = vi.spyOn(db.discoveryRun, 'update').mockImplementation((...args) => {
      const data = args[0].data as { cursor?: { processed?: number } }
      if (!failed && data.cursor?.processed === 1) { failed = true; throw Error('checkpoint interruption') }
      return original(...args)
    })
    const first = await prepareDiscovery(db, discoveryGate(), { limit: 1, now: NOW, delayMs: 0 })
    spy.mockRestore()
    expect(first.sources[0]?.status).toBe('paused')
    const stored = await db.discoveryRun.findUniqueOrThrow({ where: { id: first.runIds[0]! } })
    expect(stored.cursor).toMatchObject({ processed: 0 })
    const second = await prepareDiscovery(db, discoveryGate(), { limit: 1, now: NOW, delayMs: 0, resume: true, runId: first.batchId })
    expect(second.sources[0]?.status).toBe('completed'); expect(second.discovered).toBe(1); expect(await db.company.count()).toBe(1)
  })
  it('preserves operator stops and reviewed fields on repeated discovery imports', async () => {
    const c = await company('acme.example', { status: 'excluded', website: 'https://reviewed.acme.example', tags: ['operator-reviewed'] })
    await prepareDiscovery(db, discoveryGate(), { limit: 20, now: NOW, delayMs: 0 })
    const after = await db.company.findUniqueOrThrow({ where: { id: c.id } })
    expect(after.status).toBe('excluded'); expect(after.website).toBe('https://reviewed.acme.example'); expect(after.tags).toContain('operator-reviewed')
  })
})
describe('C funding provenance (synthetic)', () => {
  it('deduplicates shared event IDs while retaining source disclosures and field uncertainty', async () => {
    const c = await company()
    await storeFundingRound(db, fundingGate(), c, round, indexUrl, NOW, INVESTOR_SEEDS[0])
    await storeFundingRound(db, fundingGate(), c, round, `${indexUrl}?fixture=second`, NOW, INVESTOR_SEEDS[0])
    const rows = await db.fundingRecord.findMany()
    expect(rows).toHaveLength(1); expect(rows[0]?.verificationStatus).toBe('primary_verified')
    expect(rows[0]?.datePrecision).toBe('date'); expect(rows[0]?.metadata).toMatchObject({ fields: { stage: 'primary_verified', date: 'primary_verified', amount: 'indexed', investors: 'indexed' }, indexUrls: [indexUrl, `${indexUrl}?fixture=second`] })
    expect(await db.evidence.count({ where: { sourceUrl: round.sourceUrls[0]! } })).toBe(1)
  })
  it.each(['Acme has14 investors. We raised a Seed funding round in October 2026.', 'Otherco raised Seed funding on October 14, 2026. Acme has14 investors.'])('does not upgrade unrelated dates or companies: %s', async (text) => {
    const c = await company(); await storeFundingRound(db, fundingGate(text), c, { ...round, eventDate: '2026-10-14' }, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('indexed')
  })
  it('downgrades changed primary support and tries later permitted originals', async () => {
    const c = await company(); await storeFundingRound(db, fundingGate(), c, round, indexUrl, NOW)
    await storeFundingRound(db, fundingGate('Acme sells mobile software.'), c, round, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('indexed')
    const next = { ...round, sourceUrls: ['https://acme.example/missing', ...round.sourceUrls] }
    await storeFundingRound(db, fundingGate(), c, next, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('primary_verified')
  })
  it('never verifies future funding dates', async () => {
    const c = await company(); await storeFundingRound(db, fundingGate('Acme raised Seed funding on October 16, 2026.'), c, { ...round, eventDate: '2026-10-16' }, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('indexed')
  })
})
describe('C verified ATS snapshots and current scoring (synthetic)', () => {
  it('closes only complete snapshots, permits empty closure, reopens returns, and handles A→B→A', async () => {
    const c = await company(); await proveBoard(c.id, NOW)
    expect(await boardSnapshot(c.id, NOW, [syntheticJob('1'), syntheticJob('2')])).toMatchObject({ complete: true, created: 2 })
    expect(await boardSnapshot(c.id, NOW, [syntheticJob('1', 'Android Engineer')], 2)).toMatchObject({ complete: false })
    expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(2)
    const failed = new GreenhouseProvider(new StubFetcher({}))
    expect((await ingestPostings(db, failed, { id: c.id, atsBoardToken: 'acme' }, { now: () => NOW })).sourceFailure).toBeDefined()
    expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(2)
    expect(await boardSnapshot(c.id, NOW, [syntheticJob('1')])).toMatchObject({ complete: true, updated: 1, closed: 1 })
    const evidenceBefore = await db.evidence.count()
    expect(await boardSnapshot(c.id, NOW, [syntheticJob('1')])).toMatchObject({ unchanged: 1 })
    expect(await db.evidence.count()).toBe(evidenceBefore + 1)
    expect(await boardSnapshot(c.id, NOW, [])).toMatchObject({ complete: true, closed: 1 })
    await boardSnapshot(c.id, NOW, [syntheticJob('1')]); expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(1)
  })
  it.each(['stale', 'foreign', 'hash', 'wrong-board'])('refuses%s ownership or board facts without closing jobs', async (caseName) => {
    const c = await company(); const owned = await proveBoard(c.id, NOW)
    await boardSnapshot(c.id, NOW, [syntheticJob('1')])
    const evidenceId = owned.atsOwnershipEvidenceId!
    if (caseName === 'stale') {
      const old = new Date('2026-08-01'); await db.evidence.update({ where: { id: evidenceId }, data: { observedAt: old } }); await db.company.update({ where: { id: c.id }, data: { atsOwnershipVerifiedAt: old } })
    } else if (caseName === 'foreign') await db.evidence.update({ where: { id: evidenceId }, data: { sourceUrl: 'https://foreign.example/careers' } })
    else if (caseName === 'hash') await db.evidence.update({ where: { id: evidenceId }, data: { contentHash: 'wrong-hash' } })
    else await db.company.update({ where: { id: c.id }, data: { atsBoardToken: 'foreign' } })
    expect((await boardSnapshot(c.id, NOW, [])).sourceFailure?.reason).toBe('weak_evidence')
    expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(1)
  })
  it('does not close or count a malformed/foreign snapshot as complete', async () => {
    const c = await company(); await proveBoard(c.id, NOW); await boardSnapshot(c.id, NOW, [syntheticJob('1')])
    const malformed = await boardSnapshot(c.id, NOW, [{ bad: true }])
    expect(malformed.complete).toBe(false)
    const foreign = await boardSnapshot(c.id, NOW, [syntheticJob('9', 'iOS Engineer', 'Swift', 'other')])
    expect(foreign).toMatchObject({ complete: false, fetched: 0 }); expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(1)
  })
  it('bounds selected refresh, reports missing/no-ATS, and invalidates prior ownership on drift', async () => {
    const c = await company(); await proveBoard(c.id, NOW)
    const result = await refreshDiscoveryBoards(db, new StubFetcher({}), [c.id, 'missing'], { now: NOW, delayMs: 0 })
    expect(result.map((r) => r.status).sort()).toEqual(['missing_company', 'no_verified_board'])
    expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).atsOwnershipEvidenceId).toBeNull()
    await expect(refreshDiscoveryBoards(db, new StubFetcher({}), [c.id, 'missing'], { limit: 1 })).rejects.toThrow('scope')
  })
  it('excludes stale/closed/wrong-board/hash-mismatched postings and counts one page once', async () => {
    const c = await company(); await proveBoard(c.id, NOW); await boardSnapshot(c.id, NOW, [syntheticJob('1'), syntheticJob('2'), syntheticJob('3'), syntheticJob('4')])
    await db.opportunity.updateMany({ where: { externalId: '1' }, data: { description: 'tampered current content' } })
    await db.opportunity.updateMany({ where: { externalId: '2' }, data: { status: 'closed' } })
    await db.opportunity.updateMany({ where: { externalId: '3' }, data: { lastSeenAt: new Date('2026-01-01') } })
    await db.opportunity.updateMany({ where: { externalId: '4' }, data: { roleUrl: 'https://job-boards.greenhouse.io/foreign/jobs/4' } })
    const e = await product(c.id, c.canonicalDomain)
    await product(c.id, c.canonicalDomain, 'More SwiftUI and Kotlin details.', { contentHash: 'same-page-excerpt' })
    const collected = await collectScoreInput(db, await db.company.findUniqueOrThrow({ where: { id: c.id }, select: COMPANY_SCORING_SELECT }), NOW)
    expect(collected.input.hiring.relevantOpenRoles).toBe(0)
    expect(collected.opportunityTracks).toHaveLength(0); expect(collected.input.personalization.specificSourceCount).toBe(1)
    expect(collected.citedEvidenceIds).toHaveLength(2); expect(collected.citedEvidenceIds).toContain(e.id)
  })
  it('adds a new immutable input version while preserving the old lead and audit', async () => {
    const c = await company(); await product(c.id, c.canonicalDomain)
    const input = await db.company.findUniqueOrThrow({ where: { id: c.id }, select: COMPANY_SCORING_SELECT })
    await ensureScoreVersion(db, SCORE_VERSION_V3)
    const old = await scoreCompanyAndPersist(db, input, { now: NOW, spec: SCORE_VERSION_V3, campaignCycle: 'historical-c' })
    if (!old.scored) throw Error('synthetic score expected')
    const before = await db.lead.findUniqueOrThrow({ where: { id: old.leadId } })
    const audits = await db.auditLog.count()
    await scoreCompanyAndPersist(db, input, { now: NOW, campaignCycle: 'current-c' })
    expect(await db.lead.findUniqueOrThrow({ where: { id: old.leadId } })).toEqual(before)
    expect(await db.auditLog.count()).toBeGreaterThan(audits); expect(ACTIVE_SCORE_VERSION.label).toBe('joboss-v4')
  })
})
describe('C explainable research ranking (synthetic)', () => {
  it('ranks mobile/AI small/no-ATS/global/unknown/historical/index-only cases, rejects wrong proof and preserves D work', async () => {
    const tiny = await company('acme.example', { displayName: 'Acme', teamSize: 2, ycBatch: 'Summer 2026' })
    const tinyEvidence = await product(tiny.id, tiny.canonicalDomain)
    await storeFundingRound(db, fundingGate(), tiny, round, indexUrl, NOW)
    const indexed = await company('indexed.example', { displayName: 'Indexed AI', teamSize: null, ycBatch: 'Summer 2026', ycOneLiner: 'We build LLM agents and machine learning inference with PyTorch.' })
    const global = await company('global.example', { displayName: 'Global AI', teamSize: null })
    await product(global.id, global.canonicalDomain, 'Our LLM agents use machine learning inference in PyTorch.')
    const historical = await company('historical.example', { displayName: 'Historical Mobile', teamSize: 8 })
    await product(historical.id, historical.canonicalDomain)
    await storeFundingRound(db, new StubFetcher({}), historical, { ...round, eventId: 'old', eventDate: '2023', sourceUrls: [] }, `${S}/startups/historical`, NOW)
    const wrong = await company('wrong.example', { displayName: 'Wrong Board', teamSize: 5 })
    await db.opportunity.create({ data: { companyId: wrong.id, kind: 'published_role', status: 'open', title: 'iOS SwiftUI Engineer', description: 'Swift Kotlin mobile app', externalId: 'foreign', roleUrl: 'https://job-boards.greenhouse.io/other/jobs/1', lastSeenAt: NOW } })
    const established = await company('established.example', { displayName: 'Established Mobile', teamSize: 1500, ycBatch: 'Winter 2016' })
    await product(established.id, established.canonicalDomain)
    const excluded = await company('excluded.example', { status: 'excluded' }); await product(excluded.id, excluded.canonicalDomain)
    const ranked = await rankOutreachCompanies(db, { limit: 20, now: NOW })
    expect(ranked[0]?.companyId).toBe(tiny.id)
    const by = (id: string) => ranked.find((r) => r.companyId === id)!
    expect(by(tiny.id).citedEvidenceIds).toContain(tinyEvidence.id)
    expect(by(indexed.id).fit.supported).toBe(false); expect(by(indexed.id).status).toBe('research_needed')
    expect(by(global.id).fit.supported).toBe(true); expect(by(global.id).eligibility).toMatchObject({ status: 'unknown' })
    expect(by(historical.id).trigger).toMatchObject({ kind: 'none' }); expect(by(wrong.id).fit.supported).toBe(false)
    expect(ranked.some((r) => r.companyId === excluded.id)).toBe(false)
    expect(by(tiny.id).priority).toBeGreaterThan(by(established.id).priority)
    expect(ranked.every((r) => ['research_needed', 'contact_needed'].includes(r.status))).toBe(true)
    await db.outreachAssessment.update({ where: { companyId: tiny.id }, data: { status: 'drafted', selectedContactId: 'D-owned-selection', blockers: ['D-owned-blocker'] } })
    await rankOutreachCompanies(db, { limit: 20, now: NOW })
    expect(await db.outreachAssessment.findUniqueOrThrow({ where: { companyId: tiny.id } })).toMatchObject({ status: 'drafted', selectedContactId: 'D-owned-selection', blockers: ['D-owned-blocker'] })
    expect(await db.draft.count()).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
    writeFileSync('/tmp/joboss-c-evidence/synthetic-ranking.json', JSON.stringify(ranked, null, 2))
    writeFileSync('/tmp/joboss-c-evidence/synthetic-funding.json', JSON.stringify(await db.fundingRecord.findMany(), null, 2))
  })
})

describe('additional freshness and evidence controls (synthetic)', () => {
  it('ignores stale, person, wrong-company and superseded company-page fit', async () => {
    const c = await company('acme.example', { teamSize: null })
    await product(c.id, c.canonicalDomain, 'iOS SwiftUI Kotlin mobile applications.', { observedAt: new Date('2026-01-01') })
    const current = await product(c.id, c.canonicalDomain, 'We sell candles.', { observedAt: NOW })
    await product(c.id, 'foreign.example', 'iOS SwiftUI Kotlin mobile applications.')
    const other = await company('other.example')
    const person = await db.contact.create({ data: { companyId: c.id, fullName: 'Synthetic Person', emailNormalized: 'owner@acme.example', contactType: 'named_employee', discoveryMethod: 'page_published', evidenceId: current.id, capturedAt: NOW } })
    await product(c.id, c.canonicalDomain, 'iOS SwiftUI Kotlin mobile applications.', { sourceUrl: 'https://acme.example/person', contactId: person.id })
    await product(other.id, other.canonicalDomain)
    const ranked = await rankOutreachCompanies(db, { limit: 20, now: NOW }), entry = ranked.find((r) => r.companyId === c.id)!
    expect(entry.fit.supported).toBe(false); expect(entry.citedEvidenceIds).toEqual([])
  })
  it('records location restrictions with citations without inventing international eligibility', async () => {
    const c = await company(), evidence = await product(c.id, c.canonicalDomain, 'Our iOS mobile app uses SwiftUI and Swift. Must be based in Canada; no sponsorship.')
    const entry = (await rankOutreachCompanies(db, { limit: 20, now: NOW }))[0]!
    expect(entry.eligibility).toMatchObject({ status: 'restrictions_recorded', internationalEligibility: 'unconfirmed', sponsorship: 'unknown', restrictions: [{ evidenceId: evidence.id }] })
  })
  it('caps ATS postings independently and leaves missing jobs open', async () => {
    const c = await company(); await proveBoard(c.id, NOW); await boardSnapshot(c.id, NOW, [syntheticJob('old')])
    const url = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true'
    const provider = new GreenhouseProvider(new StubFetcher({ [url]: { body: JSON.stringify({ jobs: [syntheticJob('1'), syntheticJob('2')], meta: { total: 2 } }) } }))
    const result = await ingestPostings(db, provider, { id: c.id, atsBoardToken: 'acme' }, { now: () => NOW, maxPostings: 1 })
    expect(result).toMatchObject({ complete: false, fetched: 1 }); expect(await db.opportunity.count({ where: { status: 'open' } })).toBe(2)
    expect(await db.companySignal.count({ where: { signalType: 'job_posting', numericValue: { not: null } } })).toBe(1)
  })
  it('does not let stored third-party URLs or nested spoofed links prove ownership', async () => {
    const c = await company(); const { detectAtsForCompany } = await import('../../src/ingest/ats/detect.js')
    const gate = new StubFetcher({ 'https://acme.example': { body: '<a href="https://evil.example/?next=https://jobs.lever.co/acme">Careers</a>' } })
    const result = await detectAtsForCompany(db, gate, { ...c, careersUrl: 'https://jobs.lever.co/acme' }, { maxPages: 1, now: () => NOW })
    expect(result.found).toBe(false)
  })
})

it('merges a dated round without event ID across source URLs and records conflicts on a stable event', async () => {
  const c = await company()
  const noId = { roundLabel: 'Seed', eventDate: '2026-09', amount: { original: '1000000', currency: 'USD' }, sourceUrls: ['https://index.example/a'] }
  await storeFundingRound(db, new StubFetcher({}), c, noId, indexUrl, NOW)
  await storeFundingRound(db, new StubFetcher({}), c, { ...noId, sourceUrls: ['https://index.example/b'] }, indexUrl, NOW)
  expect(await db.fundingRecord.count()).toBe(1)
  const record = await db.fundingRecord.findFirstOrThrow()
  expect(record.metadata).toMatchObject({ originalSourceUrls: ['https://index.example/a', 'https://index.example/b'] })
  await storeFundingRound(db, new StubFetcher({}), c, round, indexUrl, NOW)
  await storeFundingRound(db, new StubFetcher({}), c, { ...round, roundLabel: 'Series B' }, indexUrl, NOW)
  const conflict = await db.fundingRecord.findUniqueOrThrow({ where: { companyId_sourceKey: { companyId: c.id, sourceKey: 'startupdb:seed-1' } } })
  expect(conflict.metadata).toMatchObject({ conflicts: [{ previousStage: 'Seed' }] })
})

it('preserves an existing inactive lifecycle and rejects customer-only mobile evidence', async () => {
  const c = await company('acme.example', { ycStatus: 'Acquired' })
  await prepareDiscovery(db, discoveryGate(), { limit: 20, now: NOW, delayMs: 0 })
  expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).ycStatus).toBe('Acquired')
  await product(c.id, c.canonicalDomain, 'Our customer builds iOS mobile apps in SwiftUI and Swift.')
  const { assessOutreachCompany } = await import('../../src/intel/outreach/assess.js')
  const data = await db.company.findUniqueOrThrow({ where: { id: c.id }, include: { evidence: true, fundingRecords: true, opportunities: true } })
  const result = assessOutreachCompany({ ...data, ycOneLiner: null, ycLongDescription: null,
    fundingRecords: [], tags: [] }, NOW)
  expect(result.fit.supported).toBe(false); expect(result.priority).toBe(0)
})

it('refreshes only a selected employer and follows its currently linked board after a vendor move', async () => {
  const c = await company(); await proveBoard(c.id, NOW); await boardSnapshot(c.id, NOW, [syntheticJob('old')])
  const unselected = await company('unselected.example')
  const gate = new StubFetcher({
    'https://acme.example/careers': { body: '<a href="https://jobs.lever.co/newco">Open positions</a>' },
    'https://api.lever.co/v0/postings/newco?mode=json': { body: JSON.stringify([{ id: 'new', text: 'iOS Engineer', hostedUrl: 'https://jobs.lever.co/newco/new', descriptionPlain: 'Build SwiftUI and Swift iOS apps.' }]) },
  })
  const result = await refreshDiscoveryBoards(db, gate, [c.id], { now: NOW, delayMs: 0 })
  expect(result).toEqual([{ companyId: c.id, status: 'refreshed', postings: 1, complete: true }])
  expect((await db.company.findUniqueOrThrow({ where: { id: c.id } })).atsSlug).toBe('lever')
  expect(await db.opportunity.count({ where: { companyId: c.id, status: 'open' } })).toBe(1)
  expect(await db.opportunity.count({ where: { companyId: unselected.id } })).toBe(0)
  expect(gate.requested.some((url) => url.includes('unselected'))).toBe(false)
})

describe('RC-1 funding persistence and stored-evidence revalidation', () => {
  const outputs: unknown[] = []
  const unsupported = [
    'Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.',
    'Acme raised funding from Seed Capital on September 1, 2026.',
    'Acme raised Seed funding in 2023 and presented its product on September 1, 2026.',
    'Acme raised a Series B round in 2023; Otherco announced Seed funding on September 1, 2026.',
  ]
  it.each(unsupported)('does not verify fresh storage or old falsely verified evidence: %s', async (text) => {
    const c = await company(); await product(c.id, c.canonicalDomain)
    await storeFundingRound(db, fundingGate(text), c, round, indexUrl, NOW)
    const record = await db.fundingRecord.findFirstOrThrow()
    expect(record.verificationStatus).toBe('indexed')
    expect(record.metadata).toMatchObject({ fields: { stage: 'indexed', date: 'indexed', amount: 'indexed', currency: 'indexed', investors: 'indexed' } })
    const legacy = await product(c.id, c.canonicalDomain, text, { sourceUrl: round.sourceUrls[0]!, contentHash: 'legacy-unsupported-funding', publishedAt: new Date('2026-09-01') })
    await db.fundingRecord.update({ where: { id: record.id }, data: { evidenceId: legacy.id, verificationStatus: 'primary_verified' } })
    const ranked = (await rankOutreachCompanies(db, { limit: 20, now: NOW }))[0]!
    expect(ranked.fit.earlyStageVerified).toBe(false)
    expect(ranked.trigger).not.toMatchObject({ kind: 'funding', verified: true })
    expect(ranked.citedEvidenceIds).not.toContain(legacy.id)
    await storeFundingRound(db, fundingGate(), c, round, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('primary_verified')
    await storeFundingRound(db, fundingGate(text), c, round, indexUrl, NOW)
    expect((await db.fundingRecord.findFirstOrThrow()).verificationStatus).toBe('indexed')
    outputs.push({ text, companyId: c.id, recordId: record.id, freshVerification: record.verificationStatus,
      oldEvidenceId: legacy.id, oldEarlyStageVerified: ranked.fit.earlyStageVerified, oldTrigger: ranked.trigger,
      oldBadEvidenceCited: ranked.citedEvidenceIds.includes(legacy.id), validControl: 'primary_verified', changedControl: 'indexed' })
    writeFileSync('/tmp/joboss-c-c01-evidence/rc1.json', JSON.stringify(outputs, null, 2))
  })
})

describe('RC-2 exact URL binding through production consumers', () => {
  const outputs: unknown[] = []
  const nestedUrls = [
    'https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme',
    'https://jobs.lever.co/foreign/1?next=https://job-boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/foreign/1#https://job-boards.greenhouse.io/acme/jobs/1',
    'https://job-boards.greenhouse.io/foreign/https://job-boards.greenhouse.io/acme',
  ]
  it.each(nestedUrls)('cannot admit foreign postings or already-stored false ownership: %s', async (url) => {
    const c = await company(); const owned = await proveBoard(c.id, NOW)
    const snapshot = await boardSnapshot(c.id, NOW, [{ ...syntheticJob('nested'), absolute_url: url }])
    expect(snapshot).toMatchObject({ fetched: 0, complete: false })
    expect(await db.opportunity.count()).toBe(0)
    // Recreate an old bad posting/evidence pair without relying on the corrected importer.
    const { postingContentHash } = await import('../../src/ingest/ats/ingest-postings.js')
    const hash = postingContentHash({ externalId: 'legacy', title: 'iOS Engineer', url, location: null, content: 'Swift SwiftUI mobile app', postedAt: null })
    await db.opportunity.create({ data: { companyId: c.id, externalId: 'legacy', kind: 'published_role', status: 'open', title: 'iOS Engineer', roleUrl: url, description: 'Swift SwiftUI mobile app', lastSeenAt: NOW } })
    const evidence = await db.evidence.create({ data: { companyId: c.id, sourceType: 'ats', sourceUrl: url, excerpt: 'iOS Swift SwiftUI mobile app', contentHash: hash, observedAt: NOW, confidence: 0.95, fetchedVia: 'structured_feed' } })
    let input = await collectScoreInput(db, owned, NOW)
    expect(input.opportunityTracks).toEqual([]); expect(input.citedEvidenceIds).not.toContain(evidence.id)
    let ranked = (await rankOutreachCompanies(db, { limit: 20, now: NOW }))[0]!
    expect(ranked.fit.supported).toBe(false); expect(ranked.citedEvidenceIds).not.toContain(evidence.id)
    // Old ownership hash/time/company are valid, but its URL text describes another board.
    await db.evidence.update({ where: { id: owned.atsOwnershipEvidenceId! }, data: { excerpt: url } })
    input = await collectScoreInput(db, owned, NOW)
    expect(input.input.applicationRoute.hasBoardToken).toBe(false)
    expect((await boardSnapshot(c.id, NOW, [syntheticJob('valid')])).sourceFailure?.reason).toBe('weak_evidence')
    ranked = (await rankOutreachCompanies(db, { limit: 20, now: NOW }))[0]!
    expect(ranked.fit.supported).toBe(false)
    outputs.push({ url, companyId: c.id, snapshot, legacyPostingEligible: input.opportunityTracks.length,
      boardTokenUsable: input.input.applicationRoute.hasBoardToken, supportedFit: ranked.fit.supported, citedEvidenceIds: ranked.citedEvidenceIds })
    writeFileSync('/tmp/joboss-c-c01-evidence/rc2.json', JSON.stringify(outputs, null, 2))
  })
  it('rejects fetched nested-only markup and refuses saving old forged detection evidence', async () => {
    const c = await company(), url = 'https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme', careers = 'https://acme.example/careers'
    const { detectAtsForCompany, saveDetection } = await import('../../src/ingest/ats/detect.js')
    const result = await detectAtsForCompany(db, new StubFetcher({ [careers]: { body: `<a href="${url}">Careers</a>` } }), { ...c, careersUrl: careers }, { now: () => NOW, maxPages: 1 })
    expect(result.found).toBe(false)
    const { contentHashOf } = await import('../../src/core/evidence/content-hash.js')
    await product(c.id, c.canonicalDomain, url, { sourceUrl: careers, contentHash: contentHashOf({ vendor: 'greenhouse', boardToken: 'acme' }) })
    await expect(saveDetection(db, c.id, { vendor: 'greenhouse', boardToken: 'acme', matchedText: url }, careers)).rejects.toThrow('ownership')
  })
})

describe('RC-3 actual preparation storage interruption and legacy repair', () => {
  const record = { id: 700, name: 'Acme', website: 'https://acme.example', batch: 'Summer 2026', status: 'Active', team_size: 2, one_liner: 'Our iOS SwiftUI mobile app', tags: ['mobile'] }
  async function assertProvenance(companyId: string) {
    const { YC_SOURCE_KEYS } = await import('../../src/ingest/yc/yc-oss.js')
    const { contentHashOf } = await import('../../src/core/evidence/content-hash.js')
    const evidence = await db.evidence.findMany({ where: { companyId, sourceType: 'yc' } })
    for (const key of Object.keys(YC_SOURCE_KEYS)) {
      const value = (record as Record<string, unknown>)[key]
      if (value === undefined || value === null || (Array.isArray(value) && !value.length)) continue
      expect(evidence.some((e) => e.sourceUrl === 'https://yc-oss.github.io/api/companies/all.json' && e.contentHash === contentHashOf({ [key]: value }) && e.excerpt === JSON.stringify({ [key]: value })), key).toBe(true)
    }
    const recordEvidence = evidence.find((e) => e.contentHash === contentHashOf(record))!
    expect(recordEvidence).toBeDefined()
    const signals = await db.companySignal.findMany({ where: { companyId, signalType: 'yc_profile' } })
    expect(signals).toHaveLength(1); expect(signals[0]?.evidenceId).toBe(recordEvidence.id)
    expect(signals[0]?.observedAt).toEqual(recordEvidence.observedAt)
    return { evidence: evidence.length, signals: signals.length }
  }
  it.each(['second-evidence', 'later-evidence', 'signal'])('resumes actual prepareDiscovery after %s failure without losing per-key evidence', async (where) => {
    let calls = 0
    const fail = () => {
      if (++calls === (where === 'second-evidence' ? 2 : where === 'later-evidence' ? 6 : 1)) throw Error(`RC-3 synthetic ${where} failure`)
    }
    const originalEvidence = db.evidence.create.bind(db.evidence)
    const originalSignal = db.companySignal.create.bind(db.companySignal)
    const spy = where === 'signal'
      ? vi.spyOn(db.companySignal, 'create').mockImplementation((...args) => { fail(); return originalSignal(...args) })
      : vi.spyOn(db.evidence, 'create').mockImplementation((...args) => { fail(); return originalEvidence(...args) })
    const first = await prepareDiscovery(db, discoveryGate([record]), { limit: 20, now: NOW, delayMs: 0 })
    spy.mockRestore()
    expect(first.sources[0]?.status).toBe('paused')
    const before = { evidence: await db.evidence.count({ where: { sourceType: 'yc' } }), signals: await db.companySignal.count({ where: { signalType: 'yc_profile' } }) }
    const resumed = await prepareDiscovery(db, discoveryGate([record]), { limit: 20, now: NOW, delayMs: 0, resume: true, runId: first.batchId })
    expect(resumed.sources[0]?.status).toBe('completed')
    expect(resumed.batchId).toBe(first.batchId); expect(resumed.runIds).toEqual(first.runIds)
    expect(resumed.sources.map((r) => r.discovered)).toEqual([1, 1, 1]); expect(resumed.discovered).toBe(1)
    const c = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'acme.example' } })
    const complete = await assertProvenance(c.id)
    const { toSeed } = await import('../../src/ingest/yc/yc-oss.js'), { runSeedIngest } = await import('../../src/ingest/yc/seed-loader.js')
    const seed = toSeed(record, 'https://yc-oss.github.io/api/companies/all.json', NOW)
    const result = await runSeedIngest(db, { async *listCompanies() { yield seed } }, { now: () => NOW })
    expect(result.unchanged).toBe(1); expect(await assertProvenance(c.id)).toEqual(complete)
    writeFileSync(`/tmp/joboss-c-c01-evidence/rc3-${where}.json`, JSON.stringify({ synthetic: true, batchId: first.batchId, runIds: first.runIds, firstStatus: first.sources[0]?.status, errors: first.sources[0]?.errors, before, resumedStatus: resumed.sources[0]?.status, complete, replayUnchanged: result.unchanged, companyId: c.id }, null, 2))
  })
  it('repairs an already-partial record hash without changing operator fields or source bindings', async () => {
    const c = await company('acme.example', { status: 'excluded', ycStatus: 'Acquired', website: 'https://reviewed.acme.example', tags: ['operator'] })
    const { contentHashOf } = await import('../../src/core/evidence/content-hash.js')
    const prior = await db.evidence.create({ data: { companyId: c.id, sourceUrl: 'https://yc-oss.github.io/api/companies/all.json', sourceType: 'yc', excerpt: JSON.stringify({ id: record.id, name: record.name, website: record.website }), contentHash: contentHashOf(record), observedAt: new Date('2026-10-01'), confidence: 0.6, fetchedVia: 'structured_feed' } })
    const result = await prepareDiscovery(db, discoveryGate([record]), { limit: 20, now: NOW, delayMs: 0 })
    expect(result.sources[0]?.status).toBe('completed')
    await assertProvenance(c.id)
    expect(await db.evidence.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior)
    expect(await db.company.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'excluded', ycStatus: 'Acquired', website: 'https://reviewed.acme.example', tags: ['operator', 'mobile'] })
  })
})

it.each([
  'https://boards.greenhouse.io/embed/job_board?for=acme',
  'https://boards.greenhouse.io/embed/job_board/js?for=acme',
  'https://job-boards.greenhouse.io/embed/job_board?for=acme',
  'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
])('preserves actual employer proof and posting use for supported URL %s', async (url) => {
  const c = await company(), careers = 'https://acme.example/careers'
  const { detectAtsForCompany, saveDetection } = await import('../../src/ingest/ats/detect.js')
  const result = await detectAtsForCompany(db, new StubFetcher({ [careers]: { body: `<iframe src="${url}"></iframe>` } }), { ...c, careersUrl: careers }, { now: () => NOW })
  expect(result.found).toBe(true)
  if (!result.found) throw Error(result.detail)
  await saveDetection(db, c.id, result.detection, result.sourceUrl)
  expect(await boardSnapshot(c.id, NOW, [syntheticJob('positive')])).toMatchObject({ complete: true, created: 1 })
  const owned = await db.company.findUniqueOrThrow({ where: { id: c.id } })
  const collected = await collectScoreInput(db, owned, NOW)
  expect(collected.input.applicationRoute.hasBoardToken).toBe(true); expect(collected.opportunityTracks).toHaveLength(1)
  expect((await rankOutreachCompanies(db, { limit: 20, now: NOW }))[0]?.fit.supported).toBe(true)
})
