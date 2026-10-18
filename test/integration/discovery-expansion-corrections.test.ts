import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { prepareDiscovery, refreshExpandedListingBoards } from '../../src/ingest/discovery/prepare.js'
import { EXPANDED_ROUTES, routeRunnable } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage, employerWebsite } from '../../src/ingest/discovery/expanded/parsers.js'
import { spcDetail, responses, html, org, job, NOW } from '../fixtures/discovery-expansion/fixtures.js'
import { dWorld } from '../fixtures/joboss-d/world.js'
import type { Db } from '../../src/core/audit/audit-log.js'
const db = testDb(), options = { mode: 'expanded-v1' as const, limit: 20, now: NOW, delayMs: 0 }
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const src = (s: Awaited<ReturnType<typeof prepareDiscovery>>, id: string) => s.sources.find((s) => s.source === id)!
const DIR = 'scratch/joboss-x-corrections-01-20261016-a'
function evidence(name: string, value: unknown) { mkdirSync(DIR, { recursive: true }); writeFileSync(`${DIR}/synthetic-${name}.json`, JSON.stringify(value, null, 2) + '\n') }
beforeEach(async () => { vi.restoreAllMocks(); await truncateAll() })
afterAll(closeTestDb)
it('RX-01 refuses an actual caller transaction before manifests, companies or requests', async () => {
  const gate = new StubFetcher({ 'https://yc-oss.github.io/api/companies/all.json': { body: '[]' } })
  await db.$transaction(async (tx) => {
    expect(typeof Reflect.get(tx, '$transaction')).toBe('function')
    expect(Reflect.get(tx, Symbol.for('prisma.client.transaction.scope_context'))).toBeDefined()
    await expect(prepareDiscovery(tx, gate, options)).rejects.toThrow(/standalone/i)
  }, { timeout: 3000 })
  expect(gate.requested).toHaveLength(0); expect(await db.discoveryRun.count()).toBe(0)
  expect(await db.company.count()).toBe(0); expect(await db.evidence.count()).toBe(0)
})
it.each(['yc:jobs', 'seedcamp:talent'])('RX-02 restores PostgreSQL JSON dates and completes frozen %s pending listings without refetch', async (id) => {
  const pages = responses(), r = route(id)
  pages['https://yc-oss.github.io/api/companies/all.json'] = { body: '[]' }
  pages[r.url!] = { body: html(['a', 'b'].map((key) => job({ identifier: key, url: new URL(`/jobs/${key}`, r.url!).href,
    applicationUrl: `https://job-${key}.example/careers/mobile`, hiringOrganization: org(`Job ${key}`, `https://job-${key}.example`) }))) }
  if (!routeRunnable(r)) {
    // SX1 (Part B 8): yc:jobs is blocked by decision; it makes zero requests and stays a visible gap. Coverage: the seedcamp:talent case.
    const gate = new StubFetcher(pages), blocked = await prepareDiscovery(db, gate, { ...options, limit: 1 })
    expect(gate.requested).not.toContain(r.url)
    expect(src(blocked, id)).toMatchObject({ status: 'access_blocked', discovered: 0, coverage: { reason: 'access_blocked', scopeComplete: false, records: [] } })
    return
  }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  expect(src(first, id).discovered).toBe(1)
  const saved = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, id).runId } })
  expect(JSON.stringify(saved.cursor)).toContain('2026-10-01T00:00:00.000Z')
  const gate = new StubFetcher(pages), second = await prepareDiscovery(db, gate, { ...options, limit: 1, resume: true, runId: first.batchId })
  expect(src(second, id).discovered).toBe(2); expect(src(second, id).status).toBe('unverified')
  expect(gate.requested).not.toContain(r.url)
  const noFetch = new StubFetcher({}), third = await prepareDiscovery(db, noFetch, { ...options, resume: true, runId: first.batchId })
  expect(noFetch.requested).toHaveLength(0); expect(src(third, id).coverage.records).toEqual(src(second, id).coverage.records)
  const records = src(second, id).coverage.records as { observedAt: string; publishedAt: string; raw: { validThrough: string } }[]
  expect(records.every((record) => record.observedAt === NOW.toISOString() && record.publishedAt === '2026-10-01T00:00:00.000Z' && record.raw.validThrough === '2026-11-01')).toBe(true)
  evidence(`roundtrip-${id.replace(':', '-')}`, { first: src(first, id), saved, second: src(second, id), third: src(third, id) })
})
it('RX-03 reconciles an actual identity commit with a lost acknowledgement before error finalization', async () => {
  const pages = responses(), r = route('seedcamp:companies') /* SX1: EF unavailable */; pages[r.url!] = { body: html([org('Committed', 'https://committed.example')]) }
  const original = db.$transaction.bind(db); let fired = false
  const spy = vi.spyOn(db, '$transaction').mockImplementation((async (...args: unknown[]) => {
    const result = await Reflect.apply(original, db, args)
    if (!fired && result?.id && await db.company.findUnique({ where: { canonicalDomain: 'committed.example' } })) { fired = true; throw Error('X lost commit acknowledgement') }
    return result
  }) as typeof db.$transaction)
  const first = await prepareDiscovery(db, new StubFetcher(pages), options); spy.mockRestore()
  expect(fired).toBe(true); expect(src(first, r.id).status).toBe('paused')
  const company = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'committed.example' } })
  expect(src(first, r.id).coverage.companyIds).toEqual([company.id]); expect(src(first, r.id).coverage.records).toHaveLength(1)
  expect(src(first, r.id).discovered).toBe(1); expect(src(first, r.id).counts.emittedThisInvocation).toBe(1); expect(first.handoff?.items.find((i) => i.companyId === company.id)?.sourceRoutes).toContain(r.id)
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, resume: true, runId: first.batchId })
  expect(src(second, r.id).coverage.records).toHaveLength(1)
  expect(await db.evidence.count({ where: { companyId: company.id, sourceUrl: r.url! } })).toBe(1)
  evidence('commit-ack', { first: src(first, r.id), second: src(second, r.id), fired })
})
it('RX-03 funding failure retains committed identity ledger and explicit pending work during failure and repairs once', async () => {
  const pages = responses(), detail = 'https://startupdb.com/api/v1/startups/acme', body = JSON.parse(pages[detail]!.body)
  body.data.fundingHistory = [{ eventId: 'correction-fund', roundLabel: 'Seed', eventDate: '2026-10-01', sourceUrls: [] }]
  body.data.fundingHistoryTotal = 1; pages[detail] = { body: JSON.stringify(body) }
  const original = db.$transaction.bind(db); let fired = false
  const spy = vi.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Db) => Promise<unknown>, ...rest: unknown[]) => Reflect.apply(original, db, [async (tx: Db) => {
    const upsert = tx.fundingRecord.upsert.bind(tx.fundingRecord)
    tx.fundingRecord.upsert = ((...args: Parameters<typeof upsert>) => { if (!fired) { fired = true; throw Error('X transaction-local funding failure') } return upsert(...args) }) as unknown as typeof upsert
    return work(tx)
  }, ...rest])) as typeof db.$transaction)
  const first = await prepareDiscovery(db, new StubFetcher(pages), options); spy.mockRestore()
  expect(fired).toBe(true); expect(src(first, 'startupdb').status).toBe('paused'); expect(src(first, 'startupdb').discovered).toBe(1)
  expect(src(first, 'startupdb').coverage.records).toHaveLength(1); expect(src(first, 'startupdb').coverage.companyIds).toHaveLength(1)
  expect(src(first, 'startupdb').coverage.pendingFollowups).toHaveLength(1)
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, now: new Date(NOW.getTime() + 86400000), resume: true, runId: first.batchId })
  expect(src(second, 'startupdb').coverage.pendingFollowups).toEqual([]); expect(src(second, 'startupdb').coverage.records).toHaveLength(1)
  expect(await db.fundingRecord.count()).toBe(1); expect((await db.fundingRecord.findFirstOrThrow()).observedAt).toEqual(NOW)
  evidence('funding-repair', { first: src(first, 'startupdb'), second: src(second, 'startupdb'), fired })
})
it('RX-04 refuses a persisted other-allowed-host next URL without fetching or erasing forensic state', async () => {
  const r = route('seedcamp:companies') /* SX1: EF unavailable */, pages = responses(); pages[r.url!] = { body: html([org(), org('Pending', 'https://pending.example')]) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 }), row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } })
  const cursor = row.cursor as Record<string, unknown>; delete cursor.snapshot; cursor.next = 'https://www.ycombinator.com/foreign-portfolio'
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: JSON.parse(JSON.stringify(cursor)) } })
  const gate = new StubFetcher({ [String(cursor.next)]: { body: html([org('Foreign', 'https://foreign.example')]) } })
  const second = await prepareDiscovery(db, gate, { ...options, resume: true, runId: first.batchId })
  expect(gate.requested).not.toContain(cursor.next); expect(src(second, r.id).status).toBe('paused')
  expect((await db.discoveryRun.findUniqueOrThrow({ where: { id: row.id } })).cursor).toEqual(cursor)
  expect(await db.company.findUnique({ where: { canonicalDomain: 'foreign.example' } })).toBeNull()
})
it('RX-05 rejects impossible publication and expiry calendars instead of normalizing them', () => {
  const r = route('yc:jobs')
  for (const extra of [{ datePosted: '2026-02-30', validThrough: '2027-01-01' }, { validThrough: '2026-11-31' }]) {
    const result = parseExpandedPage(html([job(extra)]), r.url!, r, NOW)
    expect(result.candidates).toHaveLength(0); expect(result.unresolved[0]?.raw).toMatchObject(extra)
  }
})
it('RX-06 requires explicit membership and consistent affirmative employer/listing/application identity', () => {
  const ef = route('ef:companies'), yc = route('yc:jobs')
  const metadata = `<html><head><script type="application/ld+json">${JSON.stringify(org('Analytics Widget', 'https://analytics.example'))}</script></head><body>Portfolio</body></html>`
  expect(parseExpandedPage(metadata, ef.url!, ef, NOW).candidates).toHaveLength(0)
  const wrong = parseExpandedPage(html([job({ hiringOrganization: org('Other Employer', 'https://other.example'), url: 'https://foreign.example/jobs/acme', applicationUrl: 'https://acme.example/careers/mobile' })]), yc.url!, yc, NOW)
  expect(wrong.candidates).toHaveLength(0); expect(wrong.unresolved).toHaveLength(1)
  expect(employerWebsite('https://jobs.gem.com/acme')).toBeNull()
})
it('RX-E02 checks current stored stop state after discovery and performs no refresh requests or writes', async () => {
  const w = await dWorld(), result = await prepareDiscovery(db, new StubFetcher(responses()), options)
  await db.company.update({ where: { id: w.company.id }, data: { status: 'excluded', careersUrl: 'https://acme.example/operator-careers' } })
  const before = { company: await db.company.findUnique({ where: { id: w.company.id } }), evidence: await db.evidence.findMany(), opportunities: await db.opportunity.findMany(), audits: await db.auditLog.findMany() }
  const gate = new StubFetcher({ 'https://acme.example/operator-careers': { body: '<a href="https://job-boards.greenhouse.io/acme">Jobs</a>' } })
  const verification = await refreshExpandedListingBoards(db, gate, result, { companyIds: [w.company.id], now: NOW, delayMs: 0 })
  expect(gate.requested).toHaveLength(0); expect(verification).toMatchObject({ blocked: [{ companyId: w.company.id, reason: 'operator_stopped' }] })
  expect({ company: await db.company.findUnique({ where: { id: w.company.id } }), evidence: await db.evidence.findMany(), opportunities: await db.opportunity.findMany(), audits: await db.auditLog.findMany() }).toEqual(before)
})

import { prepareWritten, fulfillSupport } from '../fixtures/joboss-d/world.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { candidateKey } from '../../src/ingest/discovery/expanded/snapshot.js'
import type { DiscoveryCandidate } from '../../src/ingest/discovery/common.js'
import { sourceDate } from '../../src/ingest/discovery/expanded/dates.js'
import { restoredPageCursor, discoverPublic } from '../../src/ingest/discovery/expanded/adapter.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { seedHostPolicies } from '../../src/core/policy/host-policy.js'
import { currentPeriodMonth } from '../../src/core/policy/budget.js'
import { mockAgent } from '../setup.js'
import { publicPage, boundedSourceGate } from '../../src/ingest/discovery/expanded/page.js'
import { prepareOutreachDrafts } from '../../src/outreach/draft/prepare.js'
import { canonicalizeDomain } from '../../src/ingest/domain/canonicalize.js'

it.each([false, true])('RX-E01 unchanged D can prepare speculative work with unresolved advertised intent; existingLead=%s', async (withLead) => {
  const w = await dWorld({ named: true, withLead }), discovery = await prepareDiscovery(db, new StubFetcher(responses()), options)
  const item = discovery.handoff!.items.find((i) => i.companyId === w.company.id)!
  expect(item.mode).toBe('listed_hint_pending_verification')
  expect(item.advertisedIntentEnforcement).toBe('advisory_only_E_must_enforce_before_D_no_durable_X_marker')
  const drafts = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW, campaignCycle: '2026-10' })
  expect(drafts.draftIds).toHaveLength(1)
  const prepared = await prepareWritten(w, true); await fulfillSupport(w, prepared.draftId)
  const readiness = await evaluateOutreachReadiness(db, prepared.draftId, NOW)
  expect(readiness.ready).toBe(true)
  expect(await db.lead.count()).toBe(1); expect((await db.lead.findFirstOrThrow()).leadKind).toBe('speculative')
  if (withLead) expect((await db.lead.findFirstOrThrow()).id).toBe(w.lead!.id)
  expect((await db.draft.findUniqueOrThrow({ where: { id: prepared.draftId } })).approvedAt).toBeNull()
  expect(await db.sendAttempt.count()).toBe(0)
  evidence(`advisory-intent-${withLead}`, { item, drafts, prepared, readiness, explanation: 'Independent employer/person/manual support; E must prevent this route switch before calling unchanged D.' })
})
it.each([false, true])('RX-01 caller catches refusal and commits only unrelated work, withCandidate=%s', async (withCandidate) => {
  const gate = new StubFetcher({ 'https://yc-oss.github.io/api/companies/all.json': { body: '[]' },
    ...(withCandidate ? { [route('ef:companies').url!]: { body: html([org('Transaction employer', 'https://tx-employer.example')]) } } : {}) })
  const started = Date.now()
  await db.$transaction(async (tx) => {
    await expect(prepareDiscovery(tx, gate, options)).rejects.toThrow(/standalone/)
    await tx.company.create({ data: { canonicalDomain: 'unrelated.example', displayName: 'Unrelated operator write', countries: [], locations: [], tags: [] } })
  }, { timeout: 3000 })
  expect(gate.requested).toHaveLength(0); expect(await db.discoveryRun.count()).toBe(0); expect(await db.evidence.count()).toBe(0)
  expect((await db.company.findMany()).map((c) => c.canonicalDomain)).toEqual(['unrelated.example'])
  evidence(`transaction-catch-${withCandidate}`, { elapsedMs: Date.now() - started, requests: gate.requested, runs: 0, xCompanies: 0, unrelatedCommitted: true })
})
it.each([false, true])('RX-01 deliberate outer rollback after refusal leaves no X or unrelated work, candidate=%s', async (withCandidate) => {
  const gate = new StubFetcher(withCandidate ? { [route('ef:companies').url!]: { body: html([org()]) } } : {})
  await expect(db.$transaction(async (tx) => {
    await expect(prepareDiscovery(tx, gate, options)).rejects.toThrow(/standalone/)
    await tx.company.create({ data: { canonicalDomain: 'unrelated.example', displayName: 'Unrelated rollback', countries: [], locations: [], tags: [] } })
    throw Error('explicit caller rollback')
  }, { timeout: 3000 })).rejects.toThrow('explicit caller rollback')
  expect(gate.requested).toHaveLength(0); expect(await db.company.count()).toBe(0); expect(await db.discoveryRun.count()).toBe(0); expect(await db.evidence.count()).toBe(0)
})
it('RX-04 validates all nested persisted shapes and source relationships before actual allowed transport, preserving forensic JSON', async () => {
  const r = route('seedcamp:companies') /* SX1: EF unavailable */, pages = responses()
  pages[r.url!] = { body: html(Array.from({ length: 21 }, (_, i) => org(`EF ${i}`, `https://ef-${i}.example`))) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options)
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } }), original = row.cursor as Record<string, unknown>
  expect(src(first, r.id).status).toBe('partial')
  await seedHostPolicies(db)
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(NOW), creditsCap: 20, billedUsdCap: 0 } })
  let foreignCalls = 0, robotsCalls = 0
  mockAgent.get('https://www.ycombinator.com').intercept({ path: '/robots.txt' }).reply(() => { robotsCalls++; return { statusCode: 200, data: 'User-agent: *\nAllow: /\n' } })
  mockAgent.get('https://www.ycombinator.com').intercept({ path: '/foreign-portfolio' }).reply(() => { foreignCalls++; return { statusCode: 200, data: html([org('Foreign', 'https://foreign.example')]) } })
  const gate = new FetchPolicyGate(db, { userAgent: 'x-corrections-offline/1', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000, now: () => NOW })
  const mutations: [string, (c: Record<string, unknown>) => unknown][] = [
    ['foreign-next', (c) => { delete c.snapshot; c.next = 'https://www.ycombinator.com/foreign-portfolio'; return c }],
    ['hash-array', (c) => ({ ...c, pageHashes: [] })], ['numeric-processed', (c) => ({ ...c, processed: [123] })],
    ['unknown-processed', (c) => ({ ...c, processed: ['a'.repeat(64)] })], ['numeric-pages', (c) => ({ ...c, pages: [123] })],
    ['finished-pending', (c) => ({ ...c, scopeDone: true })], ['no-next-pending', (c) => ({ ...c, next: null })],
    ['cursor-array', () => []], ['bad-observation', (c) => { (c.snapshot as Record<string, unknown>).observedAt = '2026-02-30T00:00:00.000Z'; return c }],
    ['foreign-snapshot', (c) => { (c.snapshot as Record<string, unknown>).url = 'https://www.ycombinator.com/foreign-portfolio'; return c }],
    ['foreign-candidate', (c) => { const parsed = (c.snapshot as { parsed: { candidates: Record<string, unknown>[] } }).parsed; parsed.candidates[0]!.sourceUrl = 'https://www.ycombinator.com/foreign-portfolio'; return c }],
    ['foreign-detail', (c) => { (c.snapshot as { parsed: { unresolved: unknown[] } }).parsed.unresolved.push({ externalId: 'foreign', name: 'Foreign', reason: 'company_website_missing_or_foreign', sourceUrl: r.url, detailUrl: 'https://www.ycombinator.com/foreign-portfolio' }); return c }],
    ['malformed-candidates', (c) => { (c.snapshot as { parsed: { candidates: unknown } }).parsed.candidates = {}; return c }],
    ['wrong-family', (c) => { (c.snapshot as { parsed: { candidates: Record<string, unknown>[] } }).parsed.candidates[0]!.source = 'yc'; return c }],
  ]
  const outcomes = []
  for (const [name, mutate] of mutations) {
    const cursor = JSON.parse(JSON.stringify(mutate(structuredClone(original))))
    await db.discoveryRun.update({ where: { id: row.id }, data: { cursor } })
    const resumed = await prepareDiscovery(db, gate, { ...options, runId: first.batchId, resume: true })
    const paused = src(resumed, r.id)
    expect(paused.status, name).toBe('paused'); expect(paused.coverage.scopeComplete, name).toBe(false)
    expect((await db.discoveryRun.findUniqueOrThrow({ where: { id: row.id } })).cursor, name).toEqual(cursor)
    expect(paused.discovered, name).toBe(20)
    outcomes.push({ name, errors: paused.errors, credits: (await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })).creditsSpent })
  }
  expect(foreignCalls).toBe(0); expect(robotsCalls).toBe(0); expect(outcomes.every((o) => o.credits === 0)).toBe(true)
  expect(await db.company.findUnique({ where: { canonicalDomain: 'foreign.example' } })).toBeNull()
  evidence('invalid-state-real-gateway', { outcomes, foreignCalls, robotsCalls })
})
it('RX-04 rejects an initial foreign public URL at the real gateway seam before even robots or credits', async () => {
  await seedHostPolicies(db); await db.researchBudget.create({ data: { companyId: null, periodMonth: '2026-10', creditsCap: 5, billedUsdCap: 0 } })
  const gate = new FetchPolicyGate(db, { userAgent: 'x-offline/1', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000, now: () => NOW })
  await expect(publicPage(boundedSourceGate(gate, route('seedcamp:companies'), 0).gate, 'https://www.southparkcommons.com/companies/', route('seedcamp:companies'))).rejects.toMatchObject({ reason: 'invalid_source_route_url' })
  expect(await db.robotsCache.count()).toBe(0); expect((await db.researchBudget.findFirstOrThrow()).creditsSpent).toBe(0)
})
it.each(['2026-02-29', '2026-02-30', '2026-11-31', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01',
  '2026-10-01T24:00:00Z', '2026-10-01T12:60:00Z', '2026-10-01T12:00:60Z', '2026-10-01T12:00:00+14:01', '2026-10-01T12:00:00', '10/01/2026'])('RX-05 source calendar refuses %s', (value) => {
  expect(sourceDate(value)).toBeNull()
  const r = route('yc:jobs'), result = parseExpandedPage(html([job({ datePosted: value })]), r.url!, r, NOW)
  expect(result.candidates).toHaveLength(0); expect(result.unresolved[0]?.raw?.datePosted).toBe(value)
})
it.each(['2024-02-29', '2026-09-30', '2026-10-01T12:00:00+05:30', '2026-10-01T03:02:01.123Z', '2026-10-01T03:02:01-04:00'])('RX-05 strict calendar preserves valid date/offset %s', (value) => {
  const parsed = sourceDate(value); expect(parsed).not.toBeNull()
  const r = route('yc:jobs'), result = parseExpandedPage(html([job({ datePosted: value, validThrough: '2027-01-01' })]), r.url!, r, NOW)
  expect(result.candidates).toHaveLength(1); expect(result.candidates[0]!.publishedAt?.getTime()).toBe(parsed?.getTime())
  expect(result.candidates[0]!.raw.datePosted).toBe(value)
})
it('RX-06 production persistence ignores header decoys and refuses contradictory or tenant-only entries', async () => {
  // SX1 (Part B 6, 8): EF and yc:jobs make no requests; the same entries ride on seedcamp:companies and seedcamp:talent.
  const pages = responses(), ef = route('seedcamp:companies'), yc = route('seedcamp:talent'), role = (key: string) => new URL(`/jobs/${key}`, yc.url!).href
  pages[ef.url!] = { body: html([org('Real entry', 'https://real-entry.example')], `<script type="application/ld+json">${JSON.stringify(org('Analytics Widget', 'https://analytics-widget.example'))}</script>`) }
  pages[yc.url!] = { body: html([
    job({ identifier: 'valid', url: role('valid'), hiringOrganization: org('Valid role', 'https://valid-role.example'), applicationUrl: 'https://valid-role.example/apply' }),
    job({ identifier: 'wrong', url: role('wrong'), hiringOrganization: org('Other Employer', 'https://other-employer.example'), applicationUrl: 'https://acme.example/apply' }),
    job({ identifier: 'tenant', url: role('tenant'), hiringOrganization: org('Tenant Employer', 'https://jobs.gem.com/tenant'), applicationUrl: 'https://jobs.gem.com/tenant/apply' }),
  ]) }
  const result = await prepareDiscovery(db, new StubFetcher(pages), options)
  for (const domain of ['analytics-widget.example', 'other-employer.example', 'gem.com']) {
    expect(await db.company.findUnique({ where: { canonicalDomain: domain } })).toBeNull()
    expect(await db.hostPolicy.findFirst({ where: { host: domain, origin: 'derived_company' } })).toBeNull()
  }
  expect(src(result, ef.id).coverage.records).toHaveLength(1); expect(src(result, yc.id).coverage.records).toHaveLength(1)
  expect(src(result, yc.id).coverage.unresolved).toHaveLength(2)
  expect(result.handoff!.items.every((i) => !i.assessment.fit.supported)).toBe(true)
  evidence('entry-binding', result)
})
it('RX-06 explicit employer role URLs remain supported; external ATS applications remain unresolved research candidates', () => {
  const r = route('yc:jobs')
  const own = parseExpandedPage(html([job({ url: 'https://acme.example/jobs/mobile', applicationUrl: 'https://acme.example/apply/mobile' })]), r.url!, r, NOW)
  expect(own.candidates).toHaveLength(1)
  const ats = parseExpandedPage(html([job({ applicationUrl: 'https://job-boards.greenhouse.io/acme/jobs/mobile-1' })]), r.url!, r, NOW)
  expect(ats.candidates).toHaveLength(0); expect(ats.unresolved[0]?.raw?.applicationUrl).toContain('greenhouse.io')
})
it.each(['stopped', 'paused', 'closed', 'rejected', 'excluded'])('RX-E02 honors fresh stored assessment %s after handoff creation', async (status) => {
  const w = await dWorld(), result = await prepareDiscovery(db, new StubFetcher(responses()), options)
  await prepareOutreachDrafts(db, { companyIds: [w.company.id], now: NOW, limit: 1 })
  await db.outreachAssessment.update({ where: { companyId: w.company.id }, data: { status } })
  const before = { company: await db.company.findUnique({ where: { id: w.company.id } }), evidence: await db.evidence.count(), audit: await db.auditLog.count(), opportunity: await db.opportunity.count() }
  const gate = new StubFetcher({})
  const output = await refreshExpandedListingBoards(db, gate, result, { companyIds: [w.company.id], now: NOW, delayMs: 0 })
  expect(output.blocked).toEqual([expect.objectContaining({ companyId: w.company.id, reason: 'operator_stopped' })]); expect(output.refreshed).toEqual([])
  expect(gate.requested).toEqual([])
  expect({ company: await db.company.findUnique({ where: { id: w.company.id } }), evidence: await db.evidence.count(), audit: await db.auditLog.count(), opportunity: await db.opportunity.count() }).toEqual(before)
})

import { readFileSync } from 'node:fs'
it('RX-E01 current interface explicitly disclaims a durable X intent marker and assigns E the pre-D block', () => {
  const contract = readFileSync('docs/JOBOSS-X-DISCOVERY-INTERFACES.md', 'utf8')
  expect(contract).toContain('no durable X enforcement marker')
  expect(contract).toContain('E must block unresolved advertised intent before calling D')
})
it.each(['beforeCommit', 'afterCheckpoint', 'beforeFinalSummary', 'afterFinalSummary', 'reconcileFailure'])('RX-03 %s preserves authoritative progress and repairs idempotently', async (boundary) => {
  const pages = responses(), r = route('seedcamp:companies') /* SX1: EF unavailable */, domain = 'boundary.example', runId = `rx-${boundary}`
  pages[r.url!] = { body: html([org('Boundary employer', `https://${domain}`)]) }
  let fired = false
  const transaction = db.$transaction.bind(db), update = db.discoveryRun.update.bind(db.discoveryRun), read = db.discoveryRun.findUniqueOrThrow.bind(db.discoveryRun)
  const txSpy = vi.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Db) => Promise<unknown>, ...rest: unknown[]) => {
    const result = await Reflect.apply(transaction, db, [async (tx: Db) => {
      const result = await work(tx)
      if (!fired && boundary === 'beforeCommit' && result && typeof result === 'object' && 'id' in result && await tx.company.findUnique({ where: { canonicalDomain: domain } })) { fired = true; throw Error('before identity commit') }
      return result
    }, ...rest])
    if (!fired && boundary === 'reconcileFailure' && result?.id && await db.company.findUnique({ where: { canonicalDomain: domain } })) { fired = true; throw Error('lost acknowledgement before reconcile failure') }
    return result
  }) as typeof db.$transaction)
  const updateSpy = vi.spyOn(db.discoveryRun, 'update').mockImplementation((async (...args: Parameters<typeof update>) => {
    const data = args[0].data, coverage = data.coverage as { route?: string } | undefined
    const cursor = data.cursor as { processed?: unknown[] } | undefined
    const target = coverage?.route === r.id
    if (!fired && target && boundary === 'beforeFinalSummary' && data.status === 'unverified') { fired = true; throw Error('before final summary write') }
    const result = await update(...args)
    if (!fired && target && ((boundary === 'afterCheckpoint' && cursor?.processed?.length) || (boundary === 'afterFinalSummary' && data.status === 'unverified'))) { fired = true; throw Error(`acknowledgement lost ${boundary}`) }
    return result
  }) as unknown as typeof db.discoveryRun.update)
  const readSpy = vi.spyOn(db.discoveryRun, 'findUniqueOrThrow').mockImplementation(((...args: Parameters<typeof read>) => {
    if (fired && boundary === 'reconcileFailure') throw Error('authoritative reconciliation unavailable')
    return read(...args)
  }) as unknown as typeof db.discoveryRun.findUniqueOrThrow)
  let first: Awaited<ReturnType<typeof prepareDiscovery>> | undefined, error: string | undefined
  try { first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, runId }) } catch (caught) { error = String(caught) }
  txSpy.mockRestore(); updateSpy.mockRestore(); readSpy.mockRestore()
  expect(fired).toBe(true)
  const row = await db.discoveryRun.findFirstOrThrow({ where: { source: r.id } }), coverage = row.coverage as { records: unknown[]; companyIds: string[] }
  expect(coverage.records).toHaveLength(boundary === 'beforeCommit' ? 0 : 1)
  expect(coverage.companyIds).toHaveLength(boundary === 'beforeCommit' ? 0 : 1)
  expect(await db.company.count({ where: { canonicalDomain: domain } })).toBe(boundary === 'beforeCommit' ? 0 : 1)
  if (['beforeFinalSummary', 'afterFinalSummary', 'reconcileFailure'].includes(boundary)) expect(error).toBeTruthy()
  else expect(src(first!, r.id).status).toBe('paused')
  const gate = new StubFetcher(pages), second = await prepareDiscovery(db, gate, { ...options, runId, resume: true })
  expect(src(second, r.id).coverage.records).toHaveLength(1); expect(src(second, r.id).discovered).toBe(1)
  expect(await db.evidence.count({ where: { sourceUrl: r.url!, company: { canonicalDomain: domain } } })).toBe(1)
  expect(gate.requested).not.toContain(r.url)
  evidence(`boundary-${boundary}`, { fired, error, row, second: src(second, r.id) })
})
it.each([false, true])('RX-03 manifest transaction rollback/acknowledgement ambiguity remains visible; committed=%s', async (committed) => {
  const original = db.$transaction.bind(db), runId = `rx-manifest-${committed}`; let fired = false
  const spy = vi.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Db) => Promise<unknown>, ...rest: unknown[]) => {
    const result = await Reflect.apply(original, db, [async (tx: Db) => {
      const result = await work(tx)
      if (!committed && !fired) { fired = true; throw Error('manifest before commit rollback') }
      return result
    }, ...rest])
    if (committed && !fired) { fired = true; throw Error('manifest commit acknowledgement lost') }
    return result
  }) as typeof db.$transaction)
  const gate = new StubFetcher(responses())
  await expect(prepareDiscovery(db, gate, { ...options, runId })).rejects.toThrow(runId)
  spy.mockRestore(); expect(fired).toBe(true); expect(gate.requested).toHaveLength(0)
  expect(await db.discoveryRun.count()).toBe(committed ? EXPANDED_ROUTES.length : 0); expect(await db.company.count()).toBe(0) // SX1: 16 routes
  const next = await prepareDiscovery(db, new StubFetcher(responses()), { ...options, runId, ...(committed ? { resume: true } : {}) })
  expect(next.sources).toHaveLength(EXPANDED_ROUTES.length); expect(await db.discoveryRun.count()).toBe(EXPANDED_ROUTES.length)
})
it('RX-02/04 legacy v1 JSON snapshots restore valid dates, refuse invalid nested job state and retain original observation across later-day resume', async () => {
  const r = route('seedcamp:talent'), pages = responses() // SX1 (Part B 8): yc:jobs is never requested
  pages[r.url!] = { body: html(['a', 'b'].map((key) => job({ identifier: key, url: new URL(`/jobs/${key}`, r.url!).href, hiringOrganization: org(`Legacy ${key}`, `https://legacy-${key}.example`), applicationUrl: `https://legacy-${key}.example/apply` }))) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } }), original = row.cursor as { processed: string[]; snapshot: { observedAt: string; parsed: { candidates: { publishedAt: unknown; provenance: { listing: { validThrough?: string | null; publishedAt: string } }; raw: Record<string, unknown> }[] } } }
  const legacy = structuredClone(original)
  const keyMap = new Map(legacy.snapshot.parsed.candidates.map((c) => { const before = candidateKey(c as unknown as DiscoveryCandidate); delete c.provenance.listing.validThrough; return [before, candidateKey(c as unknown as DiscoveryCandidate)] }))
  legacy.processed = legacy.processed.map((key) => keyMap.get(key) ?? key)
  const restored = restoredPageCursor(legacy, r, NOW)
  expect(restored.snapshot!.parsed.candidates.every((c) => c.publishedAt instanceof Date)).toBe(true)
  for (const mutate of [
    (c: typeof legacy.snapshot.parsed.candidates[number]) => { c.publishedAt = 123 },
    (c: typeof legacy.snapshot.parsed.candidates[number]) => { c.raw.datePosted = '2026-02-30'; c.publishedAt = '2026-03-02T00:00:00.000Z'; c.provenance.listing.publishedAt = String(c.publishedAt) },
    (c: typeof legacy.snapshot.parsed.candidates[number]) => { c.raw.validThrough = '2026-11-31' },
  ]) {
    const invalid = structuredClone(legacy); mutate(invalid.snapshot.parsed.candidates[1]!)
    await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: JSON.parse(JSON.stringify(invalid)) } })
    const gate = new StubFetcher(pages), paused = await prepareDiscovery(db, gate, { ...options, runId: first.batchId, resume: true })
    expect(src(paused, r.id).status).toBe('paused'); expect(src(paused, r.id).discovered).toBe(1); expect(gate.requested).not.toContain(r.url)
  }
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: JSON.parse(JSON.stringify(legacy)) } })
  const gate = new StubFetcher(pages), resumed = await prepareDiscovery(db, gate, { ...options, now: new Date(NOW.getTime() + 86400000), runId: first.batchId, resume: true })
  expect(src(resumed, r.id).discovered).toBe(2); expect(gate.requested).not.toContain(r.url)
  expect((src(resumed, r.id).coverage.records as { observedAt: string }[]).every((r) => r.observedAt === NOW.toISOString())).toBe(true)
})
it('RX-04 accepts a genuine company-only JSON snapshot in the direct bounded adapter without freshening its capture', async () => {
  const r = route('seedcamp:companies'), gate = new StubFetcher({ [r.url!]: { body: html([org(), org('Next', 'https://next.example')]) } })
  let saved: unknown
  const { pageCursor } = await import('../../src/ingest/discovery/expanded/adapter.js')
  await discoverPublic(gate, r, pageCursor(r), NOW, async () => true, async (c) => { saved = JSON.parse(JSON.stringify(c)) }, 1)
  const noFetch = new StubFetcher({}), accepted: unknown[] = []
  await discoverPublic(noFetch, r, restoredPageCursor(saved, r, NOW), NOW, async (c) => { accepted.push(c); return true }, async () => {}, 1)
  expect(noFetch.requested).toEqual([]); expect(accepted).toHaveLength(1)
})
it('RX-E02 active wrapper honors stored careers URL over supplied decoy and preserves exact title/URL checks', async () => {
  const w = await dWorld(), result = await prepareDiscovery(db, new StubFetcher(responses()), options)
  await db.company.update({ where: { id: w.company.id }, data: { careersUrl: 'https://acme.example/operator-careers' } })
  const gate = new StubFetcher({ 'https://acme.example/operator-careers': { body: '<a href="https://job-boards.greenhouse.io/acme">Jobs</a>' },
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true': { body: JSON.stringify({ jobs: [], meta: { total: 0 } }) } })
  const output = await refreshExpandedListingBoards(db, gate, result, { companyIds: [w.company.id], now: NOW, delayMs: 0 })
  expect(output.blocked).toEqual([]); expect(output.refreshed[0]?.status).toBe('refreshed')
  expect(gate.requested).toEqual(['https://acme.example/operator-careers', 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true'])
  expect(output.listingChecks.every((c) => c.status === 'external_listing_not_accepted_ats_support')).toBe(true)
  expect(canonicalizeDomain((await db.company.findUniqueOrThrow({ where: { id: w.company.id } })).careersUrl!).ok).toBe(true)
})
it('RX-04 frozen redirected details and original v1 detail shapes resume without requesting another source or freshening observation', async () => {
  const r = route('southparkcommons:companies'), pages = responses(), requested = 'https://www.southparkcommons.com/companies/acme'
  const final = 'https://www.southparkcommons.com/company/acme'
  // SX1 (Part B 4): SPC listing rows never bind identity, so the first employer also comes from its detail page.
  pages[r.url!] = { body: '<html><body><article><h2><a href="/companies/next">Next employer</a></h2></article><article><h2><a href="/companies/acme">Acme</a></h2><p>member company</p></article></body></html>' }
  pages['https://www.southparkcommons.com/companies/next'] = { body: spcDetail(org('Next employer', 'https://next-employer.example')) }
  pages[requested] = { body: '', statusCode: 302, headers: { location: final } }
  pages[final] = { body: spcDetail() }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } })
  const cursor = row.cursor as { snapshot: { parsed: { candidates: { raw: Record<string, unknown>; companyName: string }[] } } }
  const detail = cursor.snapshot.parsed.candidates.find((c) => c.companyName === 'Acme')!
  expect(detail.raw.detailHops).toEqual([requested, final])
  delete detail.raw.detailHops; delete detail.raw.detailRequestedUrl
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: JSON.parse(JSON.stringify(cursor)) } })
  const gate = new StubFetcher(pages), second = await prepareDiscovery(db, gate, { ...options, now: new Date(NOW.getTime() + 86400000), resume: true, runId: first.batchId })
  expect(src(second, r.id).discovered).toBe(2)
  for (const url of [r.url, requested, final]) expect(gate.requested).not.toContain(url)
  expect(src(second, r.id).coverage.records).toEqual(expect.arrayContaining([expect.objectContaining({ observedAt: NOW.toISOString(), provenance: expect.objectContaining({ relationship: 'member_association' }) })]))
})
it('RX-01/03 standalone production source calls stay outside manifest/identity/funding persistence transactions', async () => {
  const original = db.$transaction.bind(db); let inside = 0, transactions = 0
  const spy = vi.spyOn(db, '$transaction').mockImplementation((async (work: (tx: Db) => Promise<unknown>, ...rest: unknown[]) => Reflect.apply(original, db, [async (tx: Db) => {
    transactions++; inside++
    try { return await work(tx) } finally { inside-- }
  }, ...rest])) as typeof db.$transaction)
  const pages = responses(), detail = 'https://startupdb.com/api/v1/startups/acme', payload = JSON.parse(pages[detail]!.body)
  payload.data.fundingHistory = [{ eventId: 'tx-network', roundLabel: 'Seed', eventDate: '2026-10-01', sourceUrls: ['https://acme.example/news/seed'] }]
  payload.data.fundingHistoryTotal = 1; pages[detail] = { body: JSON.stringify(payload) }
  pages['https://acme.example/news/seed'] = { body: `<html><body><article><h1>Acme funding</h1><p>Acme raised a Seed funding round on October 1, 2026.</p><p>${'Acme builds mobile software. '.repeat(30)}</p></article></body></html>` }
  const stub = new StubFetcher(pages), trace: { url: string; inside: number }[] = []
  const gate = { check: stub.check.bind(stub), fetchText: (async (...args: Parameters<typeof stub.fetchText>) => { trace.push({ url: args[0], inside }); expect(inside).toBe(0); return stub.fetchText(...args) }) }
  const result = await prepareDiscovery(db, gate, options); spy.mockRestore()
  // SX1: fewer runnable routes commit fewer identities; every committed record still had its own transaction after the manifest.
  const committed = result.sources.reduce((n, s) => n + (Array.isArray(s.coverage.records) ? s.coverage.records.length : 0), 0)
  expect(result.discovered).toBe(4); expect(transactions).toBeGreaterThan(committed)
  expect(trace.some((r) => r.url === 'https://acme.example/news/seed')).toBe(true)
  expect(trace.every((r) => r.inside === 0)).toBe(true)
  expect(src(result, 'startupdb').coverage.pendingFollowups).toEqual([])
  evidence('standalone-source-transaction-trace', { transactions, trace, companyIds: result.companyIds })
})
