import { afterAll, beforeEach, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { mockAgent } from '../setup.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { HostRateLimiter } from '../../src/core/policy/rate-limit.js'
import { currentPeriodMonth } from '../../src/core/policy/budget.js'
import { hiringCandidate } from '../../src/ingest/discovery/hn.js'
import { StartupDbProvider, initialStartupDbCursor, STARTUPDB_BASE as S } from '../../src/ingest/discovery/startupdb.js'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { boundedSourceGate, publicPage, sameRouteUrl } from '../../src/ingest/discovery/expanded/page.js'
import { discoverPublic, pageCursor, restoredPageCursor } from '../../src/ingest/discovery/expanded/adapter.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'
import { prepareDiscovery } from '../../src/ingest/discovery/prepare.js'
import { responses, NOW } from '../fixtures/discovery-expansion/fixtures.js'
const db = testDb(), route = (id: string) => EXPANDED_ROUTES.find(r => r.id === id)!
beforeEach(truncateAll); afterAll(closeTestDb)
it.each([
  ['AI', '<a href="https://brain.example">site</a>'],
  ['Acme (https://acme.applytojob.com)', '<a href="https://acme.applytojob.com/apply">apply</a>'],
  ['Acme (https://huggingface.co)', '<a href="https://huggingface.co">product</a><a href="https://jobs.ashbyhq.com/acme">apply</a>'],
  ['Acme (jobs@huggingface.co)', 'jobs@huggingface.co'],
  ['Acme https://huggingface.co', '<a href="https://huggingface.co">product</a>'],
])('SX1C HN name excludes route tokens: %s', (header, body) => {
  expect(hiringCandidate({ id: 100, by: 'owner', parent: 30, type: 'comment', text: `${header} | Hiring Engineer ${body}` }, 30)).toBeNull()
})
it.each(['publicPage', 'discoverPublic', 'boundedSourceGate', 'boundedCheck'])('SX1C blocked helper %s issues zero requests', async helper => {
  const r = route('ef:companies'), gate = new StubFetcher({ [r.url!]: { body: '<html><body>blocked</body></html>' } })
  try {
    if (helper === 'publicPage') await publicPage(gate, r.url!, r)
    else if (helper === 'discoverPublic') await discoverPublic(gate, r, pageCursor(r), NOW, async () => true, async () => {}, 1)
    else if (helper === 'boundedCheck') await boundedSourceGate(gate, r, 0).gate.check(r.url!)
    else await boundedSourceGate(gate, r, 0).gate.fetchText(r.url!)
  } catch { /* Refusal may be returned or thrown; transport is never entered. */ }
  expect(gate.requested).toEqual([])
})
it.each(['/wp-admin/admin-ajax.php?action=portfolio', '/admin-ajax.php', '/wp-admin/portfolio', '/wp-json/wp/v2/pages', '/api/portfolio', '/login', '/signin', '/%77p-admin/admin-ajax.php'])('SX1C forbidden path %s rejects pagination, redirect and v1 restore', async path => {
  const r = route('seedcamp:companies'), next = new URL(path, r.url!).href
  expect(sameRouteUrl(next, r.url!, r)).toBeNull()
  expect(parseExpandedPage(`<html><body><a rel="next" href="${next}">Next</a></body></html>`, r.url!, r, NOW).next).toBeNull()
  expect(() => restoredPageCursor({ ...pageCursor(r), next }, r, NOW)).toThrow()
  const gate = new StubFetcher({ [r.url!]: { body: '', statusCode: 302, headers: { location: next } }, [next]: { body: 'forbidden' } })
  await expect(publicPage(boundedSourceGate(gate, r, 0).gate, r.url!, r)).rejects.toMatchObject({ reason: 'unsupported_redirect_or_auth' })
  expect(gate.requested).toEqual([r.url!])
})
it.each([
  '<main><h1>Acme</h1></main><footer><a href="https://vendor.example/">Website</a></footer>',
  '<main><h1>Acme</h1><nav><a href="https://vendor.example/">Website</a></nav></main>',
  '<main><h1>Acme</h1><header><a href="https://vendor.example/">Website</a></header></main>',
  '<main><h1>Acme</h1><section class="news"><a href="https://vendor.example/">Website</a></section></main>',
  '<main><h1>Acme</h1><a href="https://acme.example/">Website</a><a href="https://acme.example/">Website</a></main>',
  '<main><h1>Acme</h1></main><article><h2>Acme</h2><a href="https://vendor.example/">Website</a></article>',
  '<main><h1>Acme</h1></main><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"Organization","name":"Acme","url":"https://vendor.example/"}]}</script>',
  '<h1>Acme</h1><a href="https://acme.example/">Website</a>',
])('SX1C SPC rejects unbound or ambiguous detail scope %#', body => {
  const r = route('southparkcommons:companies')
  expect(parseExpandedPage(`<html><body>${body}</body></html>`, `${r.url!}/acme`, r, NOW).candidates).toHaveLength(0)
})
it('SX1C SPC binds a unique Website inside the main article holding its h1', () => {
  const r = route('southparkcommons:companies')
  expect(parseExpandedPage('<html><body><main><article><h1>Acme</h1><p>member company</p><a href="https://acme.example/">Website</a></article></main></body></html>', `${r.url!}/acme`, r, NOW).candidates[0]).toMatchObject({ companyName: 'Acme', website: 'https://acme.example/', provenance: { relationship: 'member_association' } })
})
it.each(['get', 'json', 'form'].flatMap(a => ['get', 'json', 'form'].map(b => [a, b])))('SX1C %s then %s refuses content-after-content without an extra wait', async (first, second) => {
  const host = 'mixed-content.example'; await db.hostPolicy.create({ data: { host, mode: 'allow', origin: 'derived_company' } })
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(), creditsCap: 20, billedUsdCap: 0 } })
  let now = 0; const waits: number[] = [], calls: string[] = []
  const gate = new FetchPolicyGate(db, { userAgent: 'SX1C', robotsTtlSeconds: 86400, defaultRateDelayMs: 500, waitForDelay: async ms => { waits.push(ms); now += ms } }, new HostRateLimiter(500, () => now))
  mockAgent.get(`https://${host}`).intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n')
  mockAgent.get(`https://${host}`).intercept({ path: '/one', method: first === 'get' ? 'GET' : 'POST' }).reply(() => { calls.push('one'); return { statusCode: 200, data: 'one' } })
  mockAgent.get(`https://${host}`).intercept({ path: '/two', method: second === 'get' ? 'GET' : 'POST' }).reply(() => { calls.push('two'); return { statusCode: 200, data: 'two' } })
  const dispatch = (op: string, path: string) => op === 'get' ? gate.fetchText(`https://${host}/${path}`) : op === 'json' ? gate.postJson(`https://${host}/${path}`, {}) : gate.postForm(`https://${host}/${path}`, {})
  expect((await dispatch(first, 'one')).ok).toBe(true)
  const before = waits.length; expect(await dispatch(second, 'two')).toEqual({ ok: false, reason: 'rate_limited' }); expect(waits.length).toBe(before); expect(calls).toEqual(['one'])
})
it('SX1C talent scheduler covers first robots, content and redirect exactly once per gap', async () => {
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(), creditsCap: 20, billedUsdCap: 0 } })
  let t = 0; const stamps: number[] = [], waits: number[] = []
  const gate = new FetchPolicyGate(db, { userAgent: 'SX1C', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000, waitForDelay: async ms => { waits.push(ms); t += ms } }, new HostRateLimiter(5000, () => t))
  const paths: string[] = []
  for (const [path, code, data, headers] of [['/robots.txt', 200, 'User-agent: ExaSearchBot\nDisallow:\nCrawl-delay: 10\n', {}], ['/jobs', 302, '', { location: '/jobs/next' }], ['/jobs/next', 200, '<html><body>page</body></html>', {}]] as const)
    mockAgent.get('https://talent.seedcamp.com').intercept({ path }).reply(() => { stamps.push(t); paths.push(path); return { statusCode: code, data, responseOptions: { headers } } })
  const r = route('seedcamp:talent'); await publicPage(boundedSourceGate(gate, r, 5000).gate, r.url!, r)
  expect(paths).toEqual(['/robots.txt', '/jobs', '/jobs/next']) // the route's first content request is /jobs
  expect(stamps).toHaveLength(3); expect(stamps[1]! - stamps[0]!).toBeGreaterThanOrEqual(10000); expect(stamps[2]! - stamps[1]!).toBeGreaterThanOrEqual(10000)
  expect(waits).toEqual([10001, 10001])
})
it('SX1C StartupDB persisted cursor, ledger, raw and Evidence exclude third-party text, including resumed pending inputs', async () => {
  const pages = responses(), markers = ['THIRD_PARTY_DESCRIPTION', 'THIRD_PARTY_HEADLINE', 'THIRD_PARTY_PROFILE', 'THIRD_PARTY_UNKNOWN']
  const round = { eventId: 'storage', roundLabel: 'Seed', eventDate: '2026-09-01', sourceUrls: [], description: markers[0], headline: markers[1] }
  const detail = { name: 'Acme', slug: 'acme', domain: 'acme.example', profile: { shortDescription: markers[2], sectorTags: [{ value: 'Software' }] }, fundingHistory: [round], fundingHistoryTotal: 1, unknown: markers[3] }
  pages[`${S}/startups/acme`] = { body: JSON.stringify({ data: detail }) }
  const result = await prepareDiscovery(db, new StubFetcher(pages), { mode: 'expanded-v1', limit: 20, now: NOW, delayMs: 0 }), s = result.sources.find(s => s.source === 'startupdb')!
  const persisted = await db.discoveryRun.findUniqueOrThrow({ where: { id: s.runId } })
  for (const marker of markers) expect(JSON.stringify({ cursor: persisted.cursor, coverage: persisted.coverage, evidence: await db.evidence.findMany() })).not.toContain(marker)
  // An older completed expanded ledger is a resume input too, even without provider traffic.
  const oldCoverage = JSON.parse(JSON.stringify(persisted.coverage))
  oldCoverage.records[0].raw.profile.shortDescription = markers[2]
  oldCoverage.records[0].raw.fundingHistory[0].description = markers[0]
  oldCoverage.records[0].raw.fundingHistory[0].headline = markers[1]
  oldCoverage.records[0].raw.unknown = markers[3]
  oldCoverage.records[0].text = markers[2]
  await db.discoveryRun.update({ where: { id: s.runId }, data: { coverage: oldCoverage } })
  const resumed = await prepareDiscovery(db, new StubFetcher(pages), { mode: 'expanded-v1', limit: 20, now: NOW, delayMs: 0, resume: true, runId: result.batchId })
  const repaired = await db.discoveryRun.findUniqueOrThrow({ where: { id: s.runId } })
  for (const marker of markers) expect(JSON.stringify({ coverage: repaired.coverage, cursor: repaired.cursor })).not.toContain(marker)
  expect(resumed.sources.find(s => s.source === 'startupdb')!.discovered).toBe(1)
  const cursor = { ...initialStartupDbCursor(), investorSlug: 'f0', pending: { slug: 'acme', detail, entry: { name: 'Acme', slug: 'acme', domain: 'acme.example', description: markers[0] }, funding: [round], fundingOffset: 0, total: 1, fundingHashes: {}, fundingDone: true } }
  const saved: unknown[] = [], candidates: unknown[] = []
  await new StartupDbProvider(new StubFetcher(pages), 0).discover(cursor, 1, async c => { candidates.push(c) }, async c => { saved.push(c) })
  for (const marker of markers) expect(JSON.stringify({ saved, candidates, cursor })).not.toContain(marker)
  expect(candidates).toHaveLength(1)
})
