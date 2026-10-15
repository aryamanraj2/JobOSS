import { describe, expect, it } from 'vitest'
import { StartupDbProvider, initialStartupDbCursor, selectInvestorIdentity, INVESTOR_SEEDS, STARTUPDB_BASE as S } from '../../src/ingest/discovery/startupdb.js'
import { HnHiringProvider, initialHnCursor, hiringCandidate, HN_API as H } from '../../src/ingest/discovery/hn.js'
import { discoveryJson, type DiscoveryCandidate } from '../../src/ingest/discovery/common.js'
import { inRecentStartupBand, YcOssSeedProvider } from '../../src/ingest/yc/yc-oss.js'
import { parseFundingDate, fundingRecent, fundingSupportExcerpt } from '../../src/ingest/discovery/funding.js'
import { StubFetcher, type StubResponse } from '../helpers/fixtures.js'
const NOW = new Date('2026-10-15T00:00:00Z')
const json = (data: unknown): StubResponse => ({ body: JSON.stringify(data) })
const page = (data: unknown[], total = data.length, offset = 0) => json({ data, pagination: { total, offset }, license: 'CC BY 4.0', scopeDisclosures: ['synthetic only'] })
function startupWorld(n = 2) {
  const responses: Record<string, StubResponse> = {}
  for (const [i, investor] of INVESTOR_SEEDS.entries()) {
    responses[`${S}/investors?q=${encodeURIComponent(investor.name)}&limit=100&offset=0`] = page([{ ...investor, slug: `fund${i}` }])
    responses[`${S}/investors/fund${i}/portfolio?limit=25&offset=0`] = page(i ? [] : Array.from({ length: n }, (_, j) => ({ name: `Co${j}`, slug: `co${j}`, domain: `co${j}.example` })))
  }
  for (let j = 0; j < n; j++) responses[`${S}/startups/co${j}`] = json({ data: {
    name: `Co${j}`, slug: `co${j}`, domain: `co${j}.example`, fundingHistory: [], fundingHistoryTotal: 0,
  } })
  return responses
}
function hnWorld() {
  const responses: Record<string, StubResponse> = { [`${H}/user/whoishiring.json`]: json({ id: 'whoishiring', submitted: [30, 20, 10] }) }
  for (const [i, id] of [30, 20, 10].entries()) {
    responses[`${H}/item/${id}.json`] = json({ id, by: 'whoishiring', type: 'story', title: 'Ask HN: Who is hiring?', time: Date.UTC(2026, 9 - i, 1) / 1000, kids: [id + 1, id + 2] })
    for (const kid of [id + 1, id + 2]) responses[`${H}/item/${kid}.json`] = json({ id: kid, by: 'employer', type: 'comment', parent: id,
      text: `Co${kid} | Hiring iOS engineers <a href="https://co${kid}.example">Apply</a>`, time: Date.UTC(2026, 9 - i, 2) / 1000 })
  }
  return responses
}
describe('synthetic source contracts and durable resume', () => {
  it('StartupDB emits per-invocation limits and resumes exactly the interrupted company', async () => {
    const gate = new StubFetcher(startupWorld()), cursor = initialStartupDbCursor(), emitted: string[] = []
    let saved = structuredClone(cursor)
    const save = async (c: typeof cursor) => { saved = structuredClone(c) }
    const handle = async (c: DiscoveryCandidate) => { emitted.push(c.externalId) }
    const first = await new StartupDbProvider(gate, 0).discover(cursor, 1, handle, save)
    expect(first.complete).toBe(false); expect(emitted).toEqual(['co0'])
    const second = await new StartupDbProvider(gate, 0).discover(saved, 1, handle, save)
    expect(second.complete).toBe(false); expect(emitted).toEqual(['co0', 'co1'])
    const third = await new StartupDbProvider(gate, 0).discover(saved, 1, handle, save)
    expect(third.complete).toBe(true); expect(third.count).toBe(0)
  })
  it('does not advance past a storage failure and retries the same identity', async () => {
    const cursor = initialStartupDbCursor(); let saved = structuredClone(cursor)
    const save = async (c: typeof cursor) => { saved = structuredClone(c) }
    await expect(new StartupDbProvider(new StubFetcher(startupWorld()), 0).discover(cursor, 2, async () => { throw Error('storage interruption') }, save)).rejects.toThrow('storage')
    expect(saved.entryIndex).toBe(0); expect(saved.pending?.slug).toBe('co0')
    const names: string[] = []
    await new StartupDbProvider(new StubFetcher(startupWorld()), 0).discover(saved, 2, async (c) => { names.push(c.externalId) }, save)
    expect(names).toEqual(['co0', 'co1'])
  })
  it('retains funding pages at a429 then resumes without duplicate rounds', async () => {
    const r = startupWorld(1), detail = JSON.parse(r[`${S}/startups/co0`]!.body)
    detail.data.fundingHistoryTotal = 26; r[`${S}/startups/co0`] = json(detail)
    const rounds = Array.from({ length: 25 }, (_, i) => ({ eventId: `e${i}`, roundLabel: 'Seed' }))
    r[`${S}/startups/co0/activity?kind=funding&limit=25&offset=0`] = page(rounds, 26)
    const next = `${S}/startups/co0/activity?kind=funding&limit=25&offset=25`
    r[next] = { statusCode: 429, body: '', headers: { 'retry-after': '17' } }
    const cursor = initialStartupDbCursor(); let saved = structuredClone(cursor)
    const save = async (c: typeof cursor) => { saved = structuredClone(c) }
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(cursor, 2, async () => {}, save)).rejects.toMatchObject({ reason: 'source_rate_limited', retryAfterSeconds: 17 })
    expect(saved.pending?.funding).toHaveLength(25); expect(saved.entryIndex).toBe(0)
    r[next] = page([{ eventId: 'e25', roundLabel: 'Seed' }], 26, 25)
    const found: DiscoveryCandidate[] = []
    await new StartupDbProvider(new StubFetcher(r), 0).discover(saved, 2, async (c) => { found.push(c) }, save)
    expect(found[0]?.funding).toHaveLength(26)
  })
  it('rejects a changing portfolio rather than skipping changed identities', async () => {
    const r = startupWorld(), cursor = initialStartupDbCursor(); let saved = structuredClone(cursor)
    await new StartupDbProvider(new StubFetcher(r), 0).discover(cursor, 1, async () => {}, async (c) => { saved = structuredClone(c) })
    r[`${S}/investors/fund0/portfolio?limit=25&offset=0`] = page([{ slug: 'co1', name: 'Co1', domain: 'co1.example' }])
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(saved, 1, async () => {}, async () => {})).rejects.toThrow('changed')
  })
  it.each([undefined, null, {}, 'no'])('omitted/malformed portfolio arrays stay undetermined (%j)', async (bad) => {
    const r = startupWorld(); r[`${S}/investors/fund0/portfolio?limit=25&offset=0`] = json({ data: bad, pagination: { total: 0 } })
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 1, async () => {}, async () => {})).rejects.toThrow('malformed')
  })
  it('rejects ambiguous investors and conflicting company identity', async () => {
    const seed = INVESTOR_SEEDS[0]
    expect(selectInvestorIdentity([{ ...seed, slug: 'a' }, { ...seed, slug: 'b' }], seed)).toBeNull()
    expect(selectInvestorIdentity([{ ...seed, slug: 'a', websiteUrl: 'https://foreign.example' }], seed)).toBeNull()
    const r = startupWorld(1); r[`${S}/startups/co0`] = json({ data: { slug: 'co0', name: 'Co0', domain: 'wrong.example' } })
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 1, async () => {}, async () => {})).rejects.toThrow('mismatch')
  })
  it('deduplicated handler results do not consume the emitted limit', async () => {
    const out: string[] = []
    const result = await new StartupDbProvider(new StubFetcher(startupWorld()), 0).discover(initialStartupDbCursor(), 1,
      async (c) => { out.push(c.externalId); return c.externalId !== 'co0' }, async () => {})
    expect(result.count).toBe(1); expect(out).toEqual(['co0', 'co1'])
  })
  it('HN freezes thread/comment IDs across reordered feeds and resumes without skips', async () => {
    const r = hnWorld(); let saved = initialHnCursor(); const found: string[] = []
    const save = async (c: typeof saved) => { saved = structuredClone(c) }
    await new HnHiringProvider(new StubFetcher(r), 0).discover(structuredClone(saved), 1, async (c) => { found.push(c.externalId) }, save, NOW)
    r[`${H}/user/whoishiring.json`] = json({ id: 'wrong', submitted: [] })
    const thread = JSON.parse(r[`${H}/item/30.json`]!.body); thread.kids = [32, 31, 99]; r[`${H}/item/30.json`] = json(thread)
    const result = await new HnHiringProvider(new StubFetcher(r), 0).discover(saved, 10, async (c) => { found.push(c.externalId) }, save, NOW)
    expect(found).toEqual(['31', '32', '21', '22', '11', '12']); expect(result.complete).toBe(true)
  })
  it('HN missing monthly threads remains partial and exposes the shortfall', async () => {
    const r = hnWorld(); r[`${H}/user/whoishiring.json`] = json({ id: 'whoishiring', submitted: [30] })
    const result = await new HnHiringProvider(new StubFetcher(r), 0).discover(initialHnCursor(), 20, async () => {}, async () => {}, NOW)
    expect(result.complete).toBe(false); expect(result.coverage.missingThreads).toBe(2)
  })
  it.each([{ deleted: true }, { dead: true }, { parent: 99 }, { by: '' }, { text: 'Seeking work <a href="https://a.example">Hiring</a>' },
    { text: 'Recruiter | Hiring <a href="https://a.example">Apply</a>' },
    { text: 'Hiring <a href="https://a.example">Apply</a><a href="https://b.example">Apply</a>' }])('HN rejects non-employer/ambiguous routes %j', (over) => {
    expect(hiringCandidate({ id: 1, by: 'owner', parent: 30, type: 'comment', text: 'A | Hiring <a href="https://a.example">Apply</a>', ...over }, 30)).toBeNull()
  })
  it.each([{ statusCode: 429, body: '', headers: { 'retry-after': '9' } }, { body: '{}', truncated: true }, { statusCode: 403, body: '' }, { body: 'invalid' }])('source failures do not become empty success %j', async (response) => {
    await expect(discoveryJson(new StubFetcher({ 'https://source.example': response }), 'https://source.example')).rejects.toThrow()
  })
})
describe('funding precision and recent small YC discovery', () => {
  it.each([['2026-10-14', 'date'], ['2026-10', 'month'], ['2026', 'year'], ['2026-02-30', 'unknown'], ['', 'unknown'], ['2026-13-01', 'unknown']])('retains date precision %s', (date, precision) => {
    expect(parseFundingDate(date).datePrecision).toBe(precision)
  })
  it('does not turn14 investors plus October2026 into October14', () => {
    const text = 'Acme raised a seed round from14 investors in October 2026.'
    expect(fundingSupportExcerpt(text, 'Acme', 'Seed', parseFundingDate('2026-10-14'))).toBeNull()
    expect(fundingSupportExcerpt(text, 'Acme', 'Seed', parseFundingDate('2026-10'))).not.toBeNull()
    expect(fundingSupportExcerpt('Acme raised a seed round on October 14, 2026.', 'Acme', 'Seed', parseFundingDate('2026-10-14'))).not.toBeNull()
  })
  it('checks180-day boundary and whole partial-date intervals, excluding future events', () => {
    const boundary = new Date(NOW.getTime() - 180 * 86400000).toISOString().slice(0, 10)
    expect(fundingRecent(parseFundingDate(boundary), NOW)).toBe(true)
    expect(fundingRecent(parseFundingDate('2026-10-16'), NOW)).toBe(false)
    expect(fundingRecent(parseFundingDate('2026-10'), NOW)).toBe(false)
    expect(fundingRecent(parseFundingDate('2026-09'), NOW)).toBe(true)
    expect(fundingRecent(parseFundingDate('2026'), NOW)).toBe(false)
    expect(fundingRecent(parseFundingDate('2026-04'), NOW)).toBe(false)
  })
  it.each([1, 2, 9, 50, 250, null])('includes recent active YC size%s', (team_size) => {
    expect(inRecentStartupBand({ id: 1, name: 'Small', status: 'Active', batch: 'Summer 2026', team_size }, NOW)).toBe(true)
  })
  it('retains malformed-source coverage and excludes old/inactive/large YC records', async () => {
    for (const over of [{ team_size: 251 }, { batch: 'Winter 2023' }, { status: 'Acquired' }]) expect(inRecentStartupBand({ id: 1, name: 'X', status: 'Active', batch: 'Summer 2026', team_size: 2, ...over }, NOW)).toBe(false)
    const provider = new YcOssSeedProvider(new StubFetcher({ 'https://yc-oss.github.io/api/companies/all.json': json([{ id: 1, name: 'A' }, { bad: true }]) }), { feed: 'all' })
    for await (const _ of provider.listCompanies()) { void _ }
    expect(provider.coverage.malformed).toBe(1)
  })
})

describe('bounded coverage controls (synthetic)', () => {
  it('traverses portfolio pages beyond25 with exact offsets', async () => {
    const r = startupWorld(26), all = JSON.parse(r[`${S}/investors/fund0/portfolio?limit=25&offset=0`]!.body).data
    r[`${S}/investors/fund0/portfolio?limit=25&offset=0`] = page(all.slice(0, 25), 26)
    r[`${S}/investors/fund0/portfolio?limit=25&offset=25`] = page(all.slice(25), 26, 25)
    const found: string[] = []
    const result = await new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 100, async (c) => { found.push(c.externalId) }, async () => {})
    expect(result.complete).toBe(true); expect(new Set(found).size).toBe(26)
  })
  it('funding cap retains preview disclosure and never claims complete coverage', async () => {
    const r = startupWorld(1), d = JSON.parse(r[`${S}/startups/co0`]!.body); d.data.fundingHistoryTotal = 101; r[`${S}/startups/co0`] = json(d)
    for (const offset of [0, 25, 50, 75]) r[`${S}/startups/co0/activity?kind=funding&limit=25&offset=${offset}`] = page(Array.from({ length: 25 }, (_, i) => ({ eventId: `e${offset + i}` })), 101, offset)
    const found: DiscoveryCandidate[] = []
    const result = await new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 10, async (c) => { found.push(c) }, async () => {})
    expect(result.complete).toBe(false); expect(found[0]?.funding).toHaveLength(100)
    expect(found[0]?.raw.fundingPartial).toBe(true); expect(result.coverage.omissions).toEqual(['co0: funding capped at100; total101'])
  })
  it('rejects repeated funding pages instead of looping or inventing completeness', async () => {
    const r = startupWorld(1), d = JSON.parse(r[`${S}/startups/co0`]!.body); d.data.fundingHistoryTotal = 51; r[`${S}/startups/co0`] = json(d)
    const rounds = Array.from({ length: 25 }, (_, i) => ({ eventId: `e${i}` }))
    for (const offset of [0, 25]) r[`${S}/startups/co0/activity?kind=funding&limit=25&offset=${offset}`] = page(rounds, 51, offset)
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 10, async () => {}, async () => {})).rejects.toThrow('loop')
  })
  it('HN scan cap is independent of accepted candidates and resumes frozen IDs', async () => {
    const r = hnWorld(), thread = JSON.parse(r[`${H}/item/30.json`]!.body), kids = Array.from({ length: 201 }, (_, i) => i + 1000)
    thread.kids = kids; r[`${H}/item/30.json`] = json(thread)
    for (const id of kids) r[`${H}/item/${id}.json`] = json({ id, type: 'comment', by: 'candidate', parent: 30, text: 'Seeking work' })
    let saved = initialHnCursor(); const save = async (c: typeof saved) => { saved = structuredClone(c) }
    const first = await new HnHiringProvider(new StubFetcher(r), 0).discover(structuredClone(saved), 20, async () => {}, save, NOW)
    expect(first.complete).toBe(false); expect(first.coverage.scannedThisRun).toBe(200)
    const second = await new HnHiringProvider(new StubFetcher(r), 0).discover(saved, 20, async () => {}, save, NOW)
    expect(second.complete).toBe(true); expect(second.coverage.scannedThisRun).toBe(5)
  })
  it('rejects explicit offset drift and missing investor search arrays', async () => {
    const r = startupWorld(); r[`${S}/investors/fund0/portfolio?limit=25&offset=0`] = page([], 0, 25)
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 2, async () => {}, async () => {})).rejects.toThrow('drift')
    r[`${S}/investors?q=Seedcamp&limit=100&offset=0`] = json({ pagination: { total: 0 } })
    await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 2, async () => {}, async () => {})).rejects.toThrow('malformed')
  })
  it('treats gateway/provider refusal as a resumable source error', async () => {
    await expect(discoveryJson(new StubFetcher({}, { 'https://source.example': 'budget_exhausted' }), 'https://source.example')).rejects.toMatchObject({ reason: 'budget_exhausted' })
  })
})

it('does not promote an investor-name substring or a different company to funding support', () => {
  expect(fundingSupportExcerpt('Acme raised Series B funding from Seedcamp on September 1, 2026.', 'Acme', 'Seed', parseFundingDate('2026-09-01'))).toBeNull()
  expect(fundingSupportExcerpt('NotAcme raised Seed funding on September 1, 2026.', 'Acme', 'Seed', parseFundingDate('2026-09-01'))).toBeNull()
})

it('rejects conflicting domains on a portfolio identity before importing a relationship', async () => {
  const r = startupWorld(1)
  r[`${S}/investors/fund0/portfolio?limit=25&offset=0`] = page([{ name: 'Co0', slug: 'co0', websiteUrl: 'https://co0.example', domain: 'foreign.example' }])
  await expect(new StartupDbProvider(new StubFetcher(r), 0).discover(initialStartupDbCursor(), 1, async () => {}, async () => {})).rejects.toThrow('mismatch')
})

it('does not map a regional board token onto the approved global API', async () => {
  const { employerAtsLinks } = await import('../../src/ingest/ats/detect.js')
  expect(employerAtsLinks('<a href="https://jobs.eu.lever.co/acme">Open roles</a>', 'https://acme.example/careers', 'acme.example')).toEqual([])
})

describe('RC-1 one funding fact (synthetic)', () => {
  it.each([
    'Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.',
    'Acme raised funding from Seed Capital on September 1, 2026.',
    'Acme raised Seed funding in 2023 and presented its product on September 1, 2026.',
    'Acme raised Series A funding; Otherco raised Seed funding on September 1, 2026.',
    'Acme raised Seed funding in 2023, announcing a product launch on September 1, 2026.',
    'Acme announced its product on September 1, 2026 after raising Seed funding in 2023.',
    'Acme raised funding from the investor Seed Ventures in September 2026.',
    'Acme has not raised a Seed funding round on September 1, 2026.',
    'Otherco said Acme raised a Seed funding round on September 1, 2026.',
  ])('leaves unsupported relations indexed: %s', (text) => {
    expect(fundingSupportExcerpt(text, 'Acme', 'Seed', parseFundingDate('2026-09-01'))).toBeNull()
  })
  it.each([
    ['Acme raised a Seed funding round on September 1, 2026.', 'Seed', '2026-09-01'],
    ['Acme has secured its Seed round on 1 September 2026.', 'Seed', '2026-09-01'],
    ['Acme closed a Series A funding round in September 2026.', 'Series A', '2026-09'],
    ['Acme raised a pre-seed round in 2026.', 'Pre-seed', '2026'],
    ['Acme raised a Seed round from 14 investors in September 2026.', 'Seed', '2026-09'],
  ])('retains direct supported funding: %s', (text, stage, date) => {
    expect(fundingSupportExcerpt(text, 'Acme', stage, parseFundingDate(date))).not.toBeNull()
  })
})
