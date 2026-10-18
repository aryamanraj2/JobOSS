import { afterAll, beforeEach, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { prepareDiscovery, type PrepareDiscoveryOptions } from '../../src/ingest/discovery/prepare.js'
const db = testDb()
const NOW = new Date('2026-10-16T00:00:00Z')
beforeEach(async () => { vi.restoreAllMocks(); await truncateAll() })
afterAll(closeTestDb)
it('expanded production dispatch retains old, large and unknown YC employers and explicit source routes', async () => {
  const gate = new StubFetcher({ 'https://yc-oss.github.io/api/companies/all.json': { body: JSON.stringify([
    { id: 1, name: 'Old Mobile', website: 'https://old-mobile.example', batch: 'Summer 2010', team_size: 900, status: 'Active' },
    { id: 2, name: 'Unknown AI', website: 'https://unknown-ai.example', status: 'Active' },
  ]) } })
  const result = await prepareDiscovery(db, gate, { mode: 'expanded-v1', limit: 20, now: NOW, delayMs: 0 } as PrepareDiscoveryOptions)
  expect(result.companyIds).toHaveLength(2)
  expect(result.sources.map((s) => s.source)).toContain('southparkcommons:companies')
  expect(result.complete).toBe(false)
})
it('expanded production mode refuses a legacy three-source resume', async () => {
  const gate = new StubFetcher({})
  const legacy = await prepareDiscovery(db, gate, { limit: 1, now: NOW, delayMs: 0 })
  await expect(prepareDiscovery(db, gate, { mode: 'expanded-v1', limit: 1, now: NOW, resume: true, runId: legacy.batchId } as PrepareDiscoveryOptions)).rejects.toThrow(/manifest|scope|mode/i)
})

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { responses, syntheticGate, html, org } from '../fixtures/discovery-expansion/fixtures.js'
import { rankOutreachCompanies } from '../../src/intel/outreach/assess.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { seedHostPolicies } from '../../src/core/policy/host-policy.js'
import { currentPeriodMonth } from '../../src/core/policy/budget.js'
import { HostRateLimiter } from '../../src/core/policy/rate-limit.js'
import { mockAgent } from '../setup.js'
import { boundedSourceGate, publicPage } from '../../src/ingest/discovery/expanded/page.js'
import { prepareRecipients } from '../../src/outreach/contacts/prepare.js'
import { prepareOutreachDrafts } from '../../src/outreach/draft/prepare.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { dWorld, prepareWritten, fulfillSupport } from '../fixtures/joboss-d/world.js'
import { vi } from 'vitest'
const EVIDENCE = 'scratch/joboss-x-corrections-01-20261016-a/expanded'
const options = { mode: 'expanded-v1' as const, limit: 20, now: NOW, delayMs: 0 }
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const source = (summary: Awaited<ReturnType<typeof prepareDiscovery>>, id: string) => summary.sources.find((s) => s.source === id)!
const record = (name: string, data: unknown) => { mkdirSync(EVIDENCE, { recursive: true }); writeFileSync(`${EVIDENCE}/${name}.json`, JSON.stringify(data, null, 2) + '\n') }

it('uses all production adapters, deduplicates direct/indirect portfolios, retains zero-priority IDs and exact provenance', async () => {
  const gate = syntheticGate(), result = await prepareDiscovery(db, gate, options)
  expect(result.sources).toHaveLength(15); expect(result.discovered).toBe(4); expect(await db.company.count()).toBe(4)
  for (const r of EXPANDED_ROUTES.filter((r) => r.url && ['directory', 'jobs'].includes(r.kind))) {
    expect(gate.requested).toContain(r.url); expect(source(result, r.id).discovered).toBe(1)
    expect(source(result, r.id).status).toBe('unverified'); expect(source(result, r.id).coverage.scopeComplete).toBe(true)
  }
  expect(source(result, 'yc:companies').discovered).toBe(4)
  expect(source(result, 'startupdb').discovered).toBe(1); expect(source(result, 'hn').discovered).toBe(1)
  expect(result.complete).toBe(false)
  const acme = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'acme.example' } })
  expect(await db.contact.count()).toBe(0); expect(await db.opportunity.count()).toBe(0); expect(await db.fundingRecord.count()).toBe(0)
  const allRecords = result.sources.flatMap((s) => Array.isArray(s.coverage.records) ? s.coverage.records : [])
  expect(allRecords.filter((r) => (r as { companyId: string }).companyId === acme.id).length).toBeGreaterThanOrEqual(12)
  expect(source(result, 'seedcamp:companies').coverage.records).toEqual(expect.arrayContaining([expect.objectContaining({
    publishedAt: null, provenance: expect.objectContaining({ period: '2018', relationship: 'investment_portfolio' }), primaryFitEvidence: false, employerAtsOwnership: false,
  })]))
  expect(result.handoff?.items.find((i) => i.domain === 'acme.example')).toMatchObject({ stage: 'company_research', mode: 'listed_hint_pending_verification', requiresPrimaryResearch: true,
    recipientDraftHandoff: 'E_must_block_unresolved_advertised_intent_before_D' })
  const ranked = await rankOutreachCompanies(db, { limit: 20, now: NOW })
  expect(ranked.find((r) => r.companyId === acme.id)?.fit.supported).toBe(false)
  expect(result.handoff?.items.find((i) => i.domain === 'historical.example')?.assessment.priority).toBe(0)
  expect(result.handoff?.rankCompanyIds).toHaveLength(4)
  const drafts = await prepareOutreachDrafts(db, { companyIds: result.companyIds, limit: 20, now: NOW })
  expect(drafts.draftIds).toHaveLength(0); expect(drafts.blockers.every((b) => b.reason === 'unsupported_fit')).toBe(true)
  record('synthetic-funnel', { fixture: 'synthetic not live-source execution', result, ranked, drafts,
    sourceFunnel: result.sources.map((s) => ({ source: s.source, discovered: s.discovered,
      enteredRanking: result.handoff?.items.filter((i) => i.sourceRoutes.includes(s.source)).length,
      primarySupported: 0, contactable: 0, drafted: 0, approved: 0, status: s.status })) })
})
it('terminal completed/unverified/unsupported scopes resume exact manifest without any requests', async () => {
  const result = await prepareDiscovery(db, syntheticGate(), options)
  const gate = new StubFetcher({}), resumed = await prepareDiscovery(db, gate, { ...options, resume: true, runId: result.batchId })
  expect(gate.requested).toHaveLength(0); expect(resumed.companyIds).toEqual(result.companyIds)
  expect(resumed.sources.map((s) => [s.source, s.status])).toEqual(result.sources.map((s) => [s.source, s.status]))
  await expect(prepareDiscovery(db, gate, { ...options, resume: true })).rejects.toThrow('explicit')
  await expect(prepareDiscovery(db, gate, { limit: 20, resume: true, runId: result.batchId })).rejects.toThrow('Unknown/incomplete')
})
it.each(['missing', 'mixed', 'tampered', 'version'])('refuses %s manifest before transport or new work', async (kind) => {
  const result = await prepareDiscovery(db, syntheticGate(), options)
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: result.runIds[0]! } })
  if (kind === 'missing') await db.discoveryRun.delete({ where: { id: row.id } })
  else if (kind === 'mixed') await db.discoveryRun.update({ where: { id: row.id }, data: { source: 'unrelated' } })
  else {
    const coverage = row.coverage as Record<string, unknown>, manifest = coverage.manifest as { version: string; bounds: { pagesPerRoute: number } }
    if (kind === 'version') manifest.version = 'expanded-v999'; else manifest.bounds.pagesPerRoute = 600
    await db.discoveryRun.update({ where: { id: row.id }, data: { coverage: JSON.parse(JSON.stringify(coverage)) } })
  }
  const gate = new StubFetcher({})
  await expect(prepareDiscovery(db, gate, { ...options, resume: true, runId: result.batchId })).rejects.toThrow(/manifest/)
  expect(gate.requested).toHaveLength(0)
})
it('partial YC resumes by stable IDs/hashes across reorder, exposes pending older/unknown and refuses changed content', async () => {
  const pages = responses(), gate = new StubFetcher(pages), first = await prepareDiscovery(db, gate, { ...options, limit: 1 })
  expect(source(first, 'yc:companies').coverage.pendingRecords).toBe(3)
  const rows = JSON.parse(pages['https://yc-oss.github.io/api/companies/all.json']!.body)
  pages['https://yc-oss.github.io/api/companies/all.json']!.body = JSON.stringify(rows.reverse())
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1, resume: true, runId: first.batchId })
  expect(source(second, 'yc:companies').discovered).toBe(2)
  rows[0].one_liner = 'Changed mobile source record'
  pages['https://yc-oss.github.io/api/companies/all.json']!.body = JSON.stringify(rows)
  const changed = await prepareDiscovery(db, new StubFetcher(pages), { ...options, resume: true, runId: first.batchId })
  expect(source(changed, 'yc:companies')).toMatchObject({ status: 'paused', coverage: { reason: 'changed_feed_hash_new_batch_required' } })
  expect(source(changed, 'yc:companies').discovered).toBe(2)
})
it('a frozen partial public page survives changed live ordering/content without refetch or losing pending entries', async () => {
  const pages = responses(), r = route('ef:companies')
  pages[r.url!] = { body: html([org(), org('Second', 'https://second.example')]) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  expect(source(first, r.id).status).toBe('partial')
  pages[r.url!] = { body: '<html><body>Changed representation</body></html>' }
  const gate = new StubFetcher(pages), next = await prepareDiscovery(db, gate, { ...options, limit: 1, resume: true, runId: first.batchId })
  expect(gate.requested).not.toContain(r.url); expect(source(next, r.id).discovered).toBe(2)
  expect(next.companyIds).toContain((await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'second.example' } })).id)
})
it.each(['beforeEvidence', 'afterEvidence', 'afterProvenance', 'cursor'])('replays/repairs %s crash without losing provenance or advancing cursor early', async (point) => {
  const r = route('ef:companies'), pages = responses()
  pages[r.url!] = { body: html([org('Repair', 'https://repair.example')]) }
  const originalUpdate = db.discoveryRun.update.bind(db.discoveryRun)
  let fired = false
  // Inject failures at actual transaction-local writes and durable checkpoints.
  const originalTransaction = db.$transaction.bind(db)
  const transactionSpy = vi.spyOn(db, '$transaction').mockImplementation((async (work: unknown, ...rest: unknown[]) => {
    if (typeof work !== 'function') return Reflect.apply(originalTransaction, db, [work, ...rest])
    return Reflect.apply(originalTransaction, db, [async (tx: typeof db) => {
      if (point === 'beforeEvidence' || point === 'afterEvidence') {
        const create = tx.evidence.create.bind(tx.evidence)
        tx.evidence.create = (async (...args: Parameters<typeof create>) => {
          if (!fired && args[0].data.sourceUrl === r.url && point === 'beforeEvidence') { fired = true; throw Error('X before evidence crash') }
          const result = await create(...args)
          if (!fired && args[0].data.sourceUrl === r.url && point === 'afterEvidence') { fired = true; throw Error('X after evidence crash') }
          return result
        }) as unknown as typeof create
      }
      const result = await work(tx)
      if (point === 'afterProvenance' && !fired && await tx.company.findUnique({ where: { canonicalDomain: 'repair.example' } })) { fired = true; throw Error('X after provenance before commit crash') }
      return result
    }, ...rest])
  }) as typeof db.$transaction)
  const updateSpy = vi.spyOn(db.discoveryRun, 'update').mockImplementation((...args) => {
    const data = args[0].data as { cursor?: { processed?: string[] } }
    if (!fired && point === 'cursor' && data.cursor?.processed?.length && (args[0].data.coverage as Record<string, unknown>)?.route === r.id) { fired = true; throw Error('X cursor persistence crash') }
    return originalUpdate(...args)
  })
  const first = await prepareDiscovery(db, new StubFetcher(pages), options)
  updateSpy.mockRestore(); transactionSpy.mockRestore()
  expect(fired).toBe(true); expect(source(first, r.id).status).toBe('paused')
  const retried = await prepareDiscovery(db, new StubFetcher(pages), { ...options, resume: true, runId: first.batchId })
  expect(source(retried, r.id).discovered).toBe(1)
  const company = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'repair.example' } })
  expect(await db.evidence.count({ where: { companyId: company.id, sourceUrl: r.url! } })).toBe(1)
  expect((source(retried, r.id).coverage.records as unknown[])).toHaveLength(1)
})
it('preserves budgets/operator stops/selected contacts/lead/draft/assessment history on repeat discovery', async () => {
  const w = await dWorld(), prepared = await prepareWritten(w)
  await db.company.update({ where: { id: w.company.id }, data: { status: 'excluded', tags: ['operator-tag'], website: 'https://reviewed.acme.example' } })
  await db.outreachAssessment.update({ where: { companyId: w.company.id }, data: { status: 'stopped', selectedContactId: w.contact.id } })
  await db.researchBudget.create({ data: { companyId: w.company.id, periodMonth: '2026-10', creditsCap: 11, creditsSpent: 7, billedUsdCap: 0 } })
  const before = { lead: await db.lead.findMany(), drafts: await db.draft.findMany(), assessment: await db.outreachAssessment.findMany(), budget: await db.researchBudget.findMany() }
  const result = await prepareDiscovery(db, syntheticGate(), options)
  const after = await db.company.findUniqueOrThrow({ where: { id: w.company.id } })
  expect(after).toMatchObject({ status: 'excluded', website: 'https://reviewed.acme.example', tags: expect.arrayContaining(['operator-tag']) })
  expect(await db.lead.findMany()).toEqual(before.lead); expect(await db.draft.findMany()).toEqual(before.drafts)
  expect(await db.outreachAssessment.findMany()).toEqual(before.assessment)
  expect(await db.researchBudget.findMany({ where: { companyId: w.company.id } })).toEqual(before.budget)
  expect(result.handoff?.items.find((i) => i.companyId === w.company.id)).toMatchObject({ stopped: true, stage: 'stopped' })
  expect(prepared.draftId).toBe(before.drafts[0]?.id)
})
it.each([false, true])('actual IDs enter unchanged D with separate primary/person/manual fixtures; listed=%s', async (listed) => {
  const w = await dWorld({ named: true, listed })
  const pages = responses()
  if (!listed) for (const r of EXPANDED_ROUTES.filter((r) => r.kind === 'jobs')) pages[r.url!] = { body: html([org()]) }
  const discovery = await prepareDiscovery(db, new StubFetcher(pages), options)
  expect(discovery.companyIds).toContain(w.company.id)
  const ranked = await rankOutreachCompanies(db, { limit: 20, now: NOW })
  expect(ranked.find((r) => r.companyId === w.company.id)?.fit.supported).toBe(true)
  const recipients = await prepareRecipients(db, w.gate, discovery.companyIds, { limit: 20, maxPages: 1, interPageDelayMs: 0, now: NOW })
  expect(recipients.selected).toContainEqual({ companyId: w.company.id, contactId: w.contact.id })
  const prepared = await prepareWritten(w, true), support = await fulfillSupport(w, prepared.draftId)
  expect(await evaluateOutreachReadiness(db, prepared.draftId, NOW)).toMatchObject({ ready: true })
  expect(await db.lead.count({ where: { companyId: w.company.id } })).toBe(1)
  expect((await db.lead.findUniqueOrThrow({ where: { id: w.lead!.id } })).leadKind).toBe(listed ? 'posted_role' : 'speculative')
  expect(prepared.draft.approvedAt).toBeNull(); expect(await db.sendAttempt.count()).toBe(0)
  record(`synthetic-d-${listed ? 'listed' : 'speculative'}`, { primarySupport: 'separate synthetic employer/product/person/current ATS, not portfolio membership', discovery, ranked, recipients,
    prepared, support, readiness: await evaluateOutreachReadiness(db, prepared.draftId, NOW), approved: 0, sent: 0 })
})
it('unsupported external listing is blocked by D current-role check; no additional Lead or speculative escape', async () => {
  const w = await dWorld({ named: true })
  await db.lead.update({ where: { id: w.lead!.id }, data: { leadKind: 'posted_role', opportunityId: null } })
  const discovery = await prepareDiscovery(db, syntheticGate(), options)
  const recipients = await prepareRecipients(db, w.gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
  const drafts = await prepareOutreachDrafts(db, { companyIds: discovery.companyIds, limit: 20, now: NOW })
  expect(drafts.blockers).toContainEqual(expect.objectContaining({ companyId: w.company.id, reason: 'listed_role_not_current' }))
  expect(drafts.draftIds).toHaveLength(0); expect(await db.lead.count()).toBe(1); expect(await db.draft.count()).toBe(0)
  record('synthetic-unsupported-listing', { discovery, recipients, drafts })
})

// These use the ACTUAL FetchPolicyGate/raw-client/MockAgent seam with network disabled by unchanged setup.
function realGate(now = NOW, limiter?: HostRateLimiter, waitForDelay?: (ms: number) => Promise<void>) { return new FetchPolicyGate(db, { userAgent: 'joboss-x-synthetic/1', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000, now: () => now, ...(waitForDelay ? { waitForDelay } : {}) }, limiter) }
async function policySetup(cap = 100) {
  await seedHostPolicies(db)
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(NOW), creditsCap: cap, billedUsdCap: 0 } })
}
it('all eight added exact hosts reach production adapters through robots and positive atomic budget reservations', async () => {
  await policySetup()
  const hosts = ['www.ycombinator.com', 'www.southparkcommons.com', 'www.alchemistaccelerator.com', 'www.joinef.com', 'masschallenge.org', 'more.masschallenge.org', 'seedcamp.com', 'talent.seedcamp.com']
  const before = await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })
  for (const host of hosts) {
    const r = EXPANDED_ROUTES.find((r) => r.hosts.includes(host) && ['jobs', 'directory'].includes(r.kind))!
    const url = new URL(r.url!)
    mockAgent.get(url.origin).intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n')
    mockAgent.get(url.origin).intercept({ path: url.pathname + url.search }).reply(200, html([org()]))
    expect((await publicPage(boundedSourceGate(realGate(), r, 0).gate, r.url!, r)).html).toContain('Acme')
    expect(await db.hostPolicy.findFirst({ where: { host } })).toMatchObject({ includeSubdomains: false })
  }
  const after = await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })
  expect(after.creditsSpent - before.creditsSpent).toBe(hosts.length)
}, 60_000) // Eight fresh robots/content pairs now include the mandatory 5s gaps.
it.each(['deny', 'robots', 'terms', 'budget', 'rate'])('expanded page real gateway refuses %s before page transport', async (kind) => {
  await policySetup(kind === 'budget' ? 0 : 20)
  const r = route({ deny: 'southparkcommons:companies', robots: 'ef:companies', terms: 'seedcamp:companies', budget: 'masschallenge:ch-uk-2026', rate: 'masschallenge:us-2023' }[kind]!), url = new URL(r.url!); url.searchParams.set('probe', kind); let pageCalls = 0
  mockAgent.get(url.origin).intercept({ path: url.pathname + url.search }).reply(() => { pageCalls++; return { statusCode: 200, data: html([org()]) } }).times(kind === 'rate' ? 2 : 1)
  if (kind === 'deny') await db.hostPolicy.updateMany({ where: { host: url.hostname }, data: { mode: 'deny' } })
  if (kind === 'terms') await db.hostPolicy.updateMany({ where: { host: url.hostname }, data: { termsProhibited: true } })
  mockAgent.get(url.origin).intercept({ path: '/robots.txt' }).reply(200, `User-agent: *\n${kind === 'robots' ? 'Disallow: /' : 'Allow: /'}\n`)
  // Advance the same synthetic limiter clock during robots/content spacing.
  let rateTime = NOW.getTime()
  const limiter = new HostRateLimiter(5000, () => rateTime), gate = realGate(NOW, limiter, async (ms) => { rateTime += ms })
  if (kind === 'rate') { await publicPage(boundedSourceGate(gate, r, 0).gate, url.href, r); expect(pageCalls).toBe(1) }
  const before = pageCalls
  await expect(publicPage(boundedSourceGate(gate, r, 0).gate, url.href, r)).rejects.toMatchObject({ reason: { deny: 'host_denied', robots: 'robots_disallowed', terms: 'terms_prohibited', budget: 'budget_exhausted', rate: 'rate_limited' }[kind] })
  expect(pageCalls).toBe(before)
})
it('exact host additions do not trust vault, apex aliases, vendor APIs or arbitrary subdomains', async () => {
  await policySetup()
  for (const url of ['https://vault.alchemistaccelerator.com/acme', 'https://api.joinef.com/portfolio', 'https://southparkcommons.com/companies', 'https://other.seedcamp.com/companies']) expect(await realGate().fetchText(url, { cost: 1 })).toEqual({ ok: false, reason: 'host_denied' })
})
it('real source 429 preserves retry-after/cursor and real redirect target denial cannot open a page socket', async () => {
  await policySetup()
  const r = route('ef:companies'), url = new URL(r.url!)
  mockAgent.get(url.origin).intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n')
  mockAgent.get(url.origin).intercept({ path: url.pathname }).reply(429, '', { headers: { 'retry-after': '37' } })
  await expect(publicPage(boundedSourceGate(realGate(), r, 0).gate, r.url!, r)).rejects.toMatchObject({ reason: 'source_rate_limited', retryAfterSeconds: 37 })
  let targetCalls = 0
  mockAgent.get('https://linkedin.com').intercept({ path: /.*/ }).reply(() => { targetCalls++; return { statusCode: 200, data: 'denied' } }).persist()
  mockAgent.get(url.origin).intercept({ path: url.pathname }).reply(302, '', { headers: { location: 'https://linkedin.com/company/acme' } })
  await expect(publicPage(boundedSourceGate(realGate(), r, 0).gate, r.url!, r)).rejects.toMatchObject({ reason: 'unsupported_redirect_or_auth' })
  expect(targetCalls).toBe(0)
})
it('CLI maps only the explicit expanded option to the production callable mode', () => {
  const cli = readFileSync('tools/run-seed-ingest.ts', 'utf8')
  expect(cli).toContain("process.argv.includes('--discovery-expanded')")
  expect(cli).toContain("mode: 'expanded-v1' as const")
  expect(cli).toContain('JSON.stringify(summary, null, 2)')
  expect(cli).toContain('if (!summary.complete) process.exitCode = 2')
  expect(contentHashOf(cli)).toHaveLength(64)
})
it('whole expanded prepare path uses the real policy/transport seam for all supported source adapters', async () => {
  await policySetup(200)
  const pages = responses(), seen: string[] = [], origins = new Set<string>()
  for (const [href, response] of Object.entries(pages)) {
    const url = new URL(href)
    if (!origins.has(url.origin)) { mockAgent.get(url.origin).intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n'); origins.add(url.origin) }
    mockAgent.get(url.origin).intercept({ path: url.pathname + url.search }).reply(() => { seen.push(href); return { statusCode: response.statusCode ?? 200, data: response.body } }).times(/\/item\/(?:10|20|30)\.json$/.test(url.pathname) ? 2 : 1)
  }
  let elapsed = NOW.getTime()
  const clock = () => elapsed
  const gate = realGate(NOW, new HostRateLimiter(5000, clock), async (ms) => { elapsed += ms })
  // Advancing a synthetic clock represents waiting; the actual limiter, robots, terms, budget and raw-client all still run.
  const guarded = { check: gate.check.bind(gate), fetchText: (async (...args: Parameters<typeof gate.fetchText>) => { elapsed += 6000; return gate.fetchText(...args) }) }
  const result = await prepareDiscovery(db, guarded, options)
  record('synthetic-real-gateway-debug', { result, seen })
  expect(result.discovered).toBe(4)
  for (const r of EXPANDED_ROUTES.filter((r) => r.url && r.kind !== 'unavailable')) {
    expect(source(result, r.id).discovered).toBeGreaterThan(0)
    if (r.kind === 'directory' || r.kind === 'jobs') expect(seen).toContain(r.url)
  }
  const budget = await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })
  expect(budget.creditsSpent).toBe(seen.length)
  record('synthetic-real-gateway', { result, seen, creditsSpent: budget.creditsSpent, liveRetrieval: false, network: 'MockAgent.disableNetConnect; synthetic public shapes' })
})
it('dynamic/auth shells, missing domain and failed source routes remain explicit in production summaries', async () => {
  const pages = responses()
  pages[route('alchemist:highlights').url!] = { body: '<html><body>Loading...<button>Load more</button></body></html>' }
  pages[route('yc:jobs').url!] = { body: '<html><body><input type="password"></body></html>' }
  pages[route('ef:companies').url!] = { body: html([org('No domain', 'https://www.joinef.com')]) }
  pages[route('seedcamp:talent').url!] = { body: '', statusCode: 429, headers: { 'retry-after': '61' } }
  const result = await prepareDiscovery(db, new StubFetcher(pages), options)
  expect(source(result, 'alchemist:highlights').coverage).toMatchObject({ scopeComplete: false, limitations: expect.arrayContaining(['dynamic_empty_or_changed_representation']) })
  expect(source(result, 'yc:jobs').coverage).toMatchObject({ scopeComplete: false, limitations: ['access_blocked'] })
  expect(source(result, 'ef:companies').coverage.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'company_website_missing_or_foreign' })]))
  expect(source(result, 'seedcamp:talent')).toMatchObject({ status: 'paused', coverage: { retryAfterSeconds: 61, reason: 'source_rate_limited' } })
  expect(source(result, 'southparkcommons:companies').discovered).toBe(1)
  record('synthetic-source-blockers', result)
})
it('same-domain distinct YC record IDs refuse identity merge, and public source duplication does not starve pending employers', async () => {
  const pages = responses()
  pages['https://yc-oss.github.io/api/companies/all.json'] = { body: JSON.stringify([
    { id: 1, name: 'Acme', website: 'https://acme.example', one_liner: 'iOS Swift', status: 'Active' },
    { id: 2, name: 'Different legal identity', website: 'https://acme.example', status: 'Active' },
  ]) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options)
  expect(source(first, 'yc:companies')).toMatchObject({ status: 'paused', coverage: { reason: 'conflicting_yc_id_same_domain_needs_review' } })
  const company = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'acme.example' } })
  expect(company.ycId).toBe('1'); expect(company.displayName).toBe('Acme')
  expect(source(first, 'seedcamp:companies').discovered).toBe(1)
})

import { refreshExpandedListingBoards } from '../../src/ingest/discovery/prepare.js'
import { job } from '../fixtures/discovery-expansion/fixtures.js'
import { syntheticJob } from '../fixtures/discovery-support.js'
it('explicit expanded listing handoff passes employer application candidates into unchanged board verification and retains exact-role gaps', async () => {
  const pages = responses(), applicationUrl = 'https://job-boards.greenhouse.io/acme/jobs/mobile-1'
  pages[route('yc:jobs').url!] = { body: html([job({ applicationUrl, title: 'iOS Engineer Intern' })]) }
  const result = await prepareDiscovery(db, new StubFetcher(pages), options)
  const acme = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'acme.example' } })
  expect(source(result, 'yc:jobs').coverage.unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'listing_not_proven_current_or_bound' })]))
  // Independent synthetic mapping input, not parser-promoted ATS ownership or source binding.
  result.handoff!.items.find((i) => i.companyId === acme.id)!.listingHints.push({ title: 'iOS Engineer Intern', url: 'https://www.ycombinator.com/jobs/mobile-1', applicationUrl })
  const gate = new StubFetcher({ 'https://acme.example/careers/mobile': { body: '<a href="https://job-boards.greenhouse.io/acme">Open roles</a>' },
    'https://acme.example/careers': { body: '<a href="https://job-boards.greenhouse.io/acme">Open roles</a>' },
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true': { body: JSON.stringify({ jobs: [syntheticJob('mobile-1')], meta: { total: 1 } }) } })
  const check = await refreshExpandedListingBoards(db, gate, result, { companyIds: [acme.id], now: NOW, delayMs: 0 })
  expect(check.refreshed).toEqual([expect.objectContaining({ status: 'refreshed', postings: 1 })])
  expect(check.listingChecks).toContainEqual(expect.objectContaining({ listingUrl: 'https://www.ycombinator.com/jobs/mobile-1', status: 'current_employer_role_verified' }))
  expect(check.listingChecks).toContainEqual(expect.objectContaining({ listingUrl: 'https://talent.seedcamp.com/jobs/mobile-1', status: 'external_listing_not_accepted_ats_support' }))
  expect(await db.lead.count()).toBe(0); expect(await db.draft.count()).toBe(0)
  record('synthetic-listing-verification', { check, requested: gate.requested })
})
it('YC feed record count cannot overwrite the durable expanded relationship ledger or route attribution', async () => {
  const result = await prepareDiscovery(db, syntheticGate(), options)
  const yc = source(result, 'yc:companies')
  expect(Array.isArray(yc.coverage.records)).toBe(true)
  expect(yc.coverage.records).toHaveLength(4)
  expect(yc.coverage.feedRecordCount).toBe(4)
  for (const item of result.handoff!.items) expect(item.sourceRoutes).toContain('yc:companies')
  const stored = await db.discoveryRun.findUniqueOrThrow({ where: { id: yc.runId } })
  expect((stored.coverage as { records: unknown[] }).records).toHaveLength(4)
  const resumed = await prepareDiscovery(db, new StubFetcher({}), { ...options, resume: true, runId: result.batchId })
  expect(source(resumed, 'yc:companies').coverage.records).toEqual(yc.coverage.records)
})
