import { afterAll, beforeEach, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { prepareDiscovery } from '../../src/ingest/discovery/prepare.js'
import { HN_API as H } from '../../src/ingest/discovery/hn.js'
import { STARTUPDB_BASE as S, INVESTOR_SEEDS } from '../../src/ingest/discovery/startupdb.js'
import { storeFundingRound } from '../../src/ingest/discovery/funding.js'
import { canonicalizeDomain } from '../../src/ingest/domain/canonicalize.js'
const db = testDb(), now = new Date('2026-10-18T00:00:00Z')
beforeEach(truncateAll)
afterAll(closeTestDb)
const json = (value: unknown) => ({ body: JSON.stringify(value) })
// Synthetic reconstructions of the five saved R4 shapes; no real post/API request.
const shapes = [
  ['All Gravy', 'https://nordictechjobs.com/jobs/synthetic', 'Hiring engineers. Apply via Nordic Tech Jobs.'],
  ['Chronograph (chronograph.pe)', 'https://grnh.se/synthetic', 'Hiring engineers. Apply here.'],
  ['City Detect', 'https://jobs.gem.com/citydetect/synthetic', 'Hiring engineers. Apply here.'],
  ['GiveDirectly', 'https://perfectwiki.page/p/synthetic', 'Hiring engineers. Eligibility info. <a href="https://job-boards.greenhouse.io/givedirectly/jobs/123">Apply</a>'],
  ['NeverBlink', 'https://app.dover.com/apply/synthetic', 'Hiring engineers. Apply here.'],
]
function fixture(posts: string[] = [], entries: unknown[] = [], malformed = false) {
  const r: Record<string, { body: string }> = {
    'https://yc-oss.github.io/api/companies/all.json': json([]),
    [`${H}/user/whoishiring.json`]: json({ id: 'whoishiring', submitted: [30, 20, 10] }),
  }
  for (const [i, id] of [30, 20, 10].entries()) {
    r[`${H}/item/${id}.json`] = json({ id, by: 'whoishiring', type: 'story', title: 'Ask HN: Who is hiring?', time: Date.UTC(2026, 9 - i, 1) / 1000, kids: i ? [] : posts.map((_, j) => 100 + j) })
  }
  posts.forEach((text, i) => { r[`${H}/item/${100 + i}.json`] = json({ id: 100 + i, parent: 30, type: 'comment', by: 'synthetic', time: 1790899200, text }) })
  for (const [i, seed] of INVESTOR_SEEDS.entries()) {
    r[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = json({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } })
    r[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = json(i ? { data: [], pagination: { total: 0 } } : malformed ? { unexpected: 'RAW_ENVELOPE', data: 'invalid' } : { data: entries, pagination: { total: entries.length } })
  }
  r[`${S}/startups/acme`] = json({ data: { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about', profile: { shortDescription: 'Product description without identity. '.repeat(30) }, fundingHistory: [], fundingHistoryTotal: 0 } })
  return new StubFetcher(r)
}
const run = (gate: StubFetcher) => prepareDiscovery(db, gate, { limit: 20, now, delayMs: 0 })
it.each(shapes)('RR1-02 keeps %s unresolved without Company or derived host', async (name, route, rest) => {
  const summary = await run(fixture([`${name} | ${rest} <a href="${route}">Info</a>`]))
  expect(await db.company.count()).toBe(0)
  expect(await db.hostPolicy.count({ where: { origin: 'derived_company' } })).toBe(0)
  expect(summary.sources.find((s) => s.source === 'hn')?.coverage).toMatchObject({ identityUnresolved: [{ reason: 'employer_identity_unresolved', routes: expect.arrayContaining([route]) }] })
})
it.each(['https://apply.workable.com/acme', 'https://jobs.lever.co/acme', 'https://jobs.ashbyhq.com/acme', 'https://wellfound.com/jobs/123', 'https://www.ycombinator.com/companies/acme/jobs/123', 'jobs@gmail.com', 'jobs@grnh.se', 'apply@dover.com', 'jobs@outlook.com'])('RR1-02 excludes application/free-mail route %s', async (route) => {
  const text = route.includes('@') ? route : `<a href="${route}">Apply</a>`
  const summary = await run(fixture([`Acme | Hiring engineers ${text}`]))
  expect(await db.company.count()).toBe(0)
  expect(await db.hostPolicy.count({ where: { origin: 'derived_company' } })).toBe(0)
  expect(summary.sources.find((s) => s.source === 'hn')?.coverage).toHaveProperty('identityUnresolved.0.reason', 'employer_identity_unresolved')
})
it('RR1-04 reproduces HN and StartupDB identity from additive linked JSON evidence and retains old excerpts', async () => {
  const post = `Hnco | Hiring engineers ${'Long product description. '.repeat(35)}<a href="https://hnco.example/jobs">Apply</a>`
  const gate = fixture([post], [{ name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about' }])
  await run(gate)
  expect(await db.company.count()).toBe(2)
  const before = await db.evidence.findMany({ orderBy: { id: 'asc' } })
  for (const c of await db.company.findMany()) {
    const linked = before.filter((e) => e.companyId === c.id).flatMap((e) => { try { return [{ e, value: JSON.parse(e.excerpt) }] } catch { return [] } })
    const identity = linked.find(({ value }) => value.kind === 'discovery_identity')!
    expect(identity, c.canonicalDomain).toBeDefined()
    expect(identity.value).toMatchObject({ companyName: c.displayName, website: c.website, canonicalDomain: c.canonicalDomain, recordHash: expect.stringMatching(/^[a-f0-9]{64}$/), sourceFields: expect.any(Object) })
    expect(canonicalizeDomain(identity.value.website)).toMatchObject({ ok: true, domain: c.canonicalDomain })
    expect(Object.keys(identity.value.sourceFields).length).toBeGreaterThan(0)
  }
  await run(fixture([post], [{ name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about' }]))
  expect(await db.evidence.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
  expect(before.some((e) => e.excerpt.startsWith('Hnco | Hiring'))).toBe(true)
  expect(before.some((e) => e.excerpt.startsWith('Product description'))).toBe(true)
})
it('RR1-05 omits a missing website with bounded raw bytes, then continues and retains omission on resume', async () => {
  const gate = fixture([], [{ name: 'Broken', slug: 'broken', rawMarker: '💡'.repeat(3000) }, { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about' }])
  const summary = await run(gate), source = summary.sources.find((s) => s.source === 'startupdb')!
  expect(source.status).toBe('partial'); expect(source.discovered).toBe(1)
  const omissions = source.coverage.omissions as Array<Record<string, unknown>>
  expect(omissions[0]).toMatchObject({ index: 0, pageUrl: `${S}/investors/f0/portfolio?limit=25&offset=0`, reason: 'portfolio identity missing', raw: expect.stringContaining('Broken') })
  expect(Buffer.byteLength(String(omissions[0]!.raw))).toBeLessThanOrEqual(4096)
  expect(gate.requested).not.toContain(`${S}/startups/broken`)
  const resumed = await prepareDiscovery(db, gate, { limit: 20, now, delayMs: 0, resume: true, runId: summary.batchId })
  expect(resumed.sources.find((s) => s.source === 'startupdb')?.coverage.omissions).toEqual(omissions)
})
it('RR1-05 pauses on malformed envelope with bounded raw response retained in durable coverage', async () => {
  const summary = await run(fixture([], [], true)), source = summary.sources.find((s) => s.source === 'startupdb')!
  expect(source.status).toBe('paused')
  expect(source.coverage).toMatchObject({ responseFailures: [{ pageUrl: `${S}/investors/f0/portfolio?limit=25&offset=0`, raw: expect.stringContaining('RAW_ENVELOPE') }] })
  const saved = await db.discoveryRun.findUniqueOrThrow({ where: { id: source.runId } })
  expect(saved.coverage).toMatchObject({ responseFailures: source.coverage.responseFailures })
})
it('RR1-09 rejects a truncated matching funding prefix and records the failed primary attempt', async () => {
  const c = await db.company.create({ data: { displayName: 'Acme', canonicalDomain: 'acme.example' } })
  const url = 'https://acme.example/seed', body = `<html><head><title>Seed</title></head><body><article><p>Acme raised a Seed funding round on September 1, 2026.</p><p>${'Original announcement. '.repeat(40)}</p></article></body></html>`
  await storeFundingRound(db, new StubFetcher({ [url]: { body, truncated: true } }), c, { eventId: 'test', roundLabel: 'Seed', eventDate: '2026-09-01', sourceUrls: [url] }, `${S}/startups/acme`, now)
  const record = await db.fundingRecord.findFirstOrThrow()
  expect(record.verificationStatus).toBe('indexed')
  expect(record.metadata).toMatchObject({ primaryAttempts: [{ url, failure: expect.stringMatching(/truncat/i) }] })
  expect(await db.evidence.count({ where: { sourceType: 'company_page' } })).toBe(0)
})
it('RR1-03 deduplicates an exact funding original across rounds in one discovery invocation', async () => {
  const gate = fixture([], [{ name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about' }])
  const base = gate.fetchText.bind(gate), url = 'https://acme.example/seed'
  gate.fetchText = async (request) => request === `${S}/startups/acme` ? { ok: true, response: { url: request, statusCode: 200, headers: {}, truncated: false, body: JSON.stringify({ data: { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example/about', fundingHistoryTotal: 2, fundingHistory: ['a', 'b'].map((eventId) => ({ eventId, roundLabel: 'Seed', eventDate: '2026-09-01', sourceUrls: [url] })) } }) } } : base(request)
  await run(gate)
  expect(gate.requested.filter((u) => u === url)).toHaveLength(1)
  expect(await db.fundingRecord.count()).toBe(2)
})
