import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { prepareDiscovery } from '../../src/ingest/discovery/prepare.js'
import { HN_API as H } from '../../src/ingest/discovery/hn.js'
import { STARTUPDB_BASE as S, INVESTOR_SEEDS } from '../../src/ingest/discovery/startupdb.js'
const db = testDb(), now = new Date('2026-10-18T00:00:00Z')
beforeEach(truncateAll)
afterAll(closeTestDb)
const json = (value: unknown) => ({ body: JSON.stringify(value) })
function legacyFixture(posts: string[] = [], entries: Record<string, unknown>[] = []) {
  const r: Record<string, { body: string }> = {
    'https://yc-oss.github.io/api/companies/all.json': json([]),
    [`${H}/user/whoishiring.json`]: json({ id: 'whoishiring', submitted: [30, 20, 10] }),
  }
  for (const [i, id] of [30, 20, 10].entries()) r[`${H}/item/${id}.json`] = json({ id, by: 'whoishiring', type: 'story', title: 'Ask HN: Who is hiring?', time: Date.UTC(2026, 9 - i, 1) / 1000, kids: i ? [] : posts.map((_, j) => 100 + j) })
  posts.forEach((text, i) => { r[`${H}/item/${100 + i}.json`] = json({ id: 100 + i, parent: 30, type: 'comment', by: 'synthetic', time: 1790899200, text }) })
  for (const [i, seed] of INVESTOR_SEEDS.entries()) {
    r[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = json({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } })
    r[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = json(i ? { data: [], pagination: { total: 0 } } : { data: entries, pagination: { total: entries.length } })
  }
  for (const e of entries) r[`${S}/startups/${e.slug}`] = json({ data: { ...e, profile: { shortDescription: 'desc' }, fundingHistory: [], fundingHistoryTotal: 0 } })
  return new StubFetcher(r)
}
const runLegacy = (gate: StubFetcher) => prepareDiscovery(db, gate, { limit: 20, now, delayMs: 0 })

describe('Part A DC1 qualifications (integration)', () => {
  it.each([
    ['denied host', 'https://www.linkedin.com/company/li'],
    ['uncanonicalizable', 'https://127.0.0.1/'],
  ])('DC1-R4 a present-but-unusable StartupDB website (%s) is a per-entry omission, not a source pause', async (_label, websiteUrl) => {
    const gate = legacyFixture([], [{ name: 'Li', slug: 'li', websiteUrl }, { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example' }])
    const summary = await runLegacy(gate), source = summary.sources.find((s) => s.source === 'startupdb')!
    expect(source.status).not.toBe('paused')
    expect(gate.requested).not.toContain(`${S}/startups/li`)
    expect(gate.requested).toContain(`${S}/startups/acme`)
    expect(source.coverage.omissions).toEqual([expect.objectContaining({ index: 0, reason: expect.stringMatching(/^portfolio website unusable/),
      raw: expect.stringContaining(websiteUrl), recordHash: expect.any(String) })])
    expect((await db.company.findMany()).map((c) => c.canonicalDomain)).toEqual(['acme.example'])
  })
  it.each([100, 600, 3000])('DC1-R5 identity JSON for a %i-character route is chunked at about 300 characters and reconstructs exactly', async (len) => {
    const route = `https://hnco.example/jobs?${'q'.repeat(len)}`
    await runLegacy(legacyFixture([`Hnco | Hiring engineers <a href="${route}">Apply</a>`]))
    const rows = (await db.evidence.findMany()).flatMap((e) => { try { return [{ excerpt: e.excerpt, value: JSON.parse(e.excerpt) }] } catch { return [] } })
    const chunks = rows.filter((r) => r.value.kind === 'discovery_identity_chunk').sort((a, b) => a.value.index - b.value.index)
    const whole = rows.find((r) => r.value.kind === 'discovery_identity')?.value ?? JSON.parse(chunks.map((c) => c.value.text).join(''))
    expect(whole.sourceFields.route).toBe(route)
    for (const c of chunks) { expect(c.excerpt.length).toBeLessThanOrEqual(500); expect(c.value.text.length).toBeLessThanOrEqual(300); expect(c.value.total).toBe(chunks.length) }
    if (chunks.length) expect(chunks.length).toBeLessThanOrEqual(Math.ceil(JSON.stringify(whole).length / 250))
    expect(chunks.length).toBeLessThan(len >= 3000 ? 20 : 5)
  })
})

import { readFileSync } from 'node:fs'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
const NOW = new Date('2026-10-18T12:00:00Z')
const real = (name: string) => readFileSync(`test/fixtures/discovery-expansion/real/${name}.html`, 'utf8')
const routeUrl = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!.url!
const src = (s: Awaited<ReturnType<typeof prepareDiscovery>>, id: string) => s.sources.find((x) => x.source === id)!
// Real-format pages from the saved pre-flight bytes; SPC detail pages are synthetic (no detail bytes were retained).
function partBPages(over: Record<string, { body: string; statusCode?: number; headers?: Record<string, string> }> = {}) {
  const portfolio = real('alchemist-portfolio-2')
  const r: Record<string, { body: string; statusCode?: number; headers?: Record<string, string> }> = {
    [routeUrl('seedcamp:companies')]: { body: real('seedcamp-companies') },
    [routeUrl('southparkcommons:companies')]: { body: real('southparkcommons-companies') },
    'https://www.southparkcommons.com/companies/pilot': { body: '<html><body><main><h1>Pilot</h1><a href="https://pilot.com/">Website</a></main></body></html>' },
    'https://www.southparkcommons.com/companies/compound': { body: '<html><body><main><h1>Compound</h1><a href="https://compound.finance/">Visit website</a></main></body></html>' },
    'https://www.southparkcommons.com/companies/goodfire': { body: '<html><body><main><h1>Goodfire</h1><p>No website label.</p></main></body></html>' },
    'https://www.southparkcommons.com/companies/render': { body: '<html><body><main><h1>Render</h1><a href="https://render.com/">Website</a></main></body></html>' },
    [routeUrl('alchemist:highlights')]: { body: portfolio },
    // Page 2 derives from the retained page with its next link disabled (no page-2 bytes were retained).
    'https://www.alchemistaccelerator.com/portfolio-2?pno=2': { body: portfolio.replace('class="next-posts-link "', 'class="next-posts-link disabled"') },
    'https://yc-oss.github.io/api/companies/all.json': { body: JSON.stringify([
      { id: 901, name: 'Old Large', website: 'https://old-large.example', batch: 'Summer 2008', team_size: 4000, status: 'Acquired', one_liner: 'payments' },
      { id: 902, name: 'Recent Mobile', website: 'https://recent-mobile.example', batch: 'Summer 2026', team_size: 4, status: 'Active', one_liner: 'iOS and Android app' },
      { id: 903, name: 'Unknown', website: 'https://unknown-meta.example' },
      { id: 904, name: 'Recent AI Big', website: 'https://recent-ai-big.example', batch: 'Winter 2025', team_size: 400, status: 'Active', one_liner: 'AI agents' },
    ]) },
    'https://yc-oss.github.io/api/companies/hiring.json': { body: readFileSync('test/fixtures/yc-oss-companies-hiring.json', 'utf8') },
    [`${S}/investors/f0/portfolio?limit=25&offset=0`]: json({ data: [{ name: 'Wexler', slug: 'wexler', websiteUrl: 'https://wexler.ai' }], pagination: { total: 1 } }),
    [`${S}/startups/wexler`]: json({ data: { name: 'Wexler', slug: 'wexler', websiteUrl: 'https://wexler.ai', profile: {}, fundingHistory: [], fundingHistoryTotal: 0 } }),
  }
  for (const [i, seed] of INVESTOR_SEEDS.entries()) {
    r[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = json({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } })
    if (i) r[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = json({ data: [], pagination: { total: 0 } })
  }
  return { ...r, ...over }
}
const expanded = (gate: StubFetcher, limit = 20) => prepareDiscovery(db, gate, { mode: 'expanded-v1', limit, now: NOW, delayMs: 0 })

describe('SX1 Part B real formats through the expanded-v1 pipeline', () => {
  it('EF, MassChallenge, YC site jobs and Alchemist class29/details issue zero requests and stay visible gaps', async () => {
    const gate = new StubFetcher(partBPages()), result = await expanded(gate)
    for (const [id, access] of [['ef:companies', 'unavailable'], ['masschallenge:ch-uk-2026', 'access_blocked'], ['masschallenge:us-2023', 'access_blocked'], ['masschallenge:alumni', 'access_blocked'],
      ['yc:jobs', 'access_blocked'], ['alchemist:class29', 'stale'], ['alchemist:details', 'unsupported'], ['yc:work-at-a-startup', 'unsupported']] as const) {
      expect(src(result, id), id).toMatchObject({ status: access, discovered: 0, coverage: { reason: access, scopeComplete: false, executionFinished: true, sourceExecuted: false,
        accessReason: expect.any(String), countsThisInvocation: { requests: 0 } } })
    }
    expect(gate.requested.filter((u) => /joinef\.com|masschallenge\.org|ycombinator\.com|vault\.alchemist|admin-ajax|portfolio\?class=29|getro/.test(u))).toEqual([])
    expect(result.complete).toBe(false)
    // Resume keeps those gaps terminal: no request and no "finished scope has pending work" pause.
    const none = new StubFetcher({}), resumed = await prepareDiscovery(db, none, { mode: 'expanded-v1', limit: 20, now: NOW, delayMs: 0, resume: true, runId: result.batchId })
    for (const id of ['ef:companies', 'masschallenge:ch-uk-2026', 'masschallenge:us-2023', 'yc:jobs', 'alchemist:class29']) expect(src(resumed, id), id).toMatchObject({ status: src(result, id).status, errors: [] })
    expect(none.requested.filter((u) => /joinef|masschallenge|ycombinator\.com|class=29/.test(u))).toEqual([])
  })
  it('Seedcamp and StartupDB attributions merge on one canonical company; website-less cards stay unresolved', async () => {
    const result = await expanded(new StubFetcher(partBPages()))
    const wexler = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'wexler.ai' } })
    expect(await db.company.count({ where: { canonicalDomain: 'wexler.ai' } })).toBe(1)
    const routes = result.sources.flatMap((s) => (s.coverage.records as { companyId: string; route: string; provenance: { relationship: string } }[] ?? [])
      .filter((r) => r.companyId === wexler.id).map((r) => [r.route, r.provenance.relationship]))
    expect(routes).toEqual(expect.arrayContaining([['startupdb', 'indexed_investor_portfolio'], ['seedcamp:companies', 'investment_portfolio']]))
    expect(new Set((await db.evidence.findMany({ where: { companyId: wexler.id } })).map((e) => e.sourceUrl))).toEqual(new Set([`${S}/startups/wexler`, routeUrl('seedcamp:companies')]))
    expect(result.handoff?.items.find((i) => i.companyId === wexler.id)?.sourceRoutes).toEqual(expect.arrayContaining(['startupdb', 'seedcamp:companies']))
    const seedcamp = src(result, 'seedcamp:companies')
    expect(seedcamp.discovered).toBe(6)
    expect((seedcamp.coverage.unresolved as { name: string }[]).map((u) => u.name)).toEqual(['Solvera', 'Caveman'])
    expect(await db.fundingRecord.count()).toBe(0)
  })
  it('SPC and Alchemist cards without a website create no Company or host permission; SPC detail pages count in the budget', async () => {
    const result = await expanded(new StubFetcher(partBPages()))
    const spc = src(result, 'southparkcommons:companies')
    expect(spc.discovered).toBe(3)
    expect((spc.coverage.unresolved as { name: string }[]).map((u) => u.name)).toEqual(['Goodfire'])
    expect(spc.coverage.countsThisInvocation).toMatchObject({ requests: 5 })
    for (const domain of ['pilot.com', 'compound.finance', 'render.com']) expect(await db.company.findUnique({ where: { canonicalDomain: domain } }), domain).not.toBeNull()
    const derived = (await db.hostPolicy.findMany({ where: { origin: 'derived_company' } })).map((h) => h.host)
    expect(derived.filter((h) => /goodfire|tryprofound|alchemist|vault|launchdarkly|privacera|rigetti|3dos|36zero/i.test(h))).toEqual([])
    const alchemist = src(result, 'alchemist:highlights')
    expect(alchemist.discovered).toBe(0)
    expect((alchemist.coverage.unresolved as { name: string }[]).map((u) => u.name)).toEqual(['Launch Darkly', 'Privacera', 'Rigetti Quantum Computing', '3DOS', 'Command Line Inc.', '36ZERO Vision'])
    expect(alchemist.coverage).toMatchObject({ pages: [routeUrl('alchemist:highlights'), 'https://www.alchemistaccelerator.com/portfolio-2?pno=2'], scopeComplete: false })
    expect(await db.company.count({ where: { displayName: { in: ['Launch Darkly', 'Privacera', 'Goodfire', '3DOS'] } } })).toBe(0)
  })
  it('the YC hiring signal enters as company seeds only: no job, opportunity, lead or recipient rows', async () => {
    const result = await expanded(new StubFetcher(partBPages()))
    const hiring = src(result, 'yc:hiring')
    expect(hiring.discovered).toBe(20)
    const records = hiring.coverage.records as { provenance: { relationship: string; mode: string; listing: unknown }; raw: { hiringSignal: string } }[]
    expect(records.every((r) => r.provenance.relationship === 'yc_hiring_signal' && r.provenance.mode === 'company_seed' && r.provenance.listing === null &&
      r.raw.hiringSignal === 'yc_oss_hiring_feed_listing_signal_not_job_posting')).toBe(true)
    expect(await db.opportunity.count()).toBe(0); expect(await db.contact.count()).toBe(0); expect(await db.lead.count()).toBe(0); expect(await db.draft.count()).toBe(0)
    expect(result.handoff?.items.filter((i) => i.sourceRoutes.includes('yc:hiring')).every((i) => i.listingHints.length === 0 && i.mode === 'speculative_candidate')).toBe(true)
  })
  it('yc:companies applies no batch/size/status exclusion and orders recent, mobile/AI and small first under a cap, keeping the rest visible', async () => {
    const gate = new StubFetcher(partBPages())
    const first = await expanded(gate, 2), yc = src(first, 'yc:companies')
    expect((yc.coverage.records as { companyName: string }[]).map((r) => r.companyName)).toEqual(['Recent Mobile', 'Recent AI Big'])
    expect(yc.coverage).toMatchObject({ filter: 'none', pendingRecords: 2, pendingByPriority: { 0: 2 }, scopeComplete: false })
    const second = await prepareDiscovery(db, new StubFetcher(partBPages()), { mode: 'expanded-v1', limit: 2, now: NOW, delayMs: 0, resume: true, runId: first.batchId })
    expect((src(second, 'yc:companies').coverage.records as { companyName: string }[]).map((r) => r.companyName)).toEqual(['Recent Mobile', 'Recent AI Big', 'Old Large', 'Unknown'])
    expect(src(second, 'yc:companies').coverage).toMatchObject({ pendingRecords: 0, scopeDone: true })
  })
})

describe('SX1 Part B StartupDB activity (mocked transport)', () => {
  const detail = (rounds: unknown[], total: number) => json({ data: { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example', profile: {}, fundingHistory: rounds, fundingHistoryTotal: total } })
  const round = (i: number) => ({ eventId: `e${i}`, roundLabel: 'Seed', eventDate: '2026-09-01', amount: { original: '1000000', currency: 'USD' },
    participants: [{ name: 'Seedcamp', role: 'lead' }], sourceUrls: [], description: 'Third-party company description', headline: 'Press headline' })
  function activityWorld(over: Record<string, { body: string; statusCode?: number; headers?: Record<string, string> }> = {}) {
    const r: Record<string, { body: string; statusCode?: number; headers?: Record<string, string> }> = {}
    for (const [i, seed] of INVESTOR_SEEDS.entries()) {
      r[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = json({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } })
      r[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = json(i ? { data: [], pagination: { total: 0 } } : { data: [{ name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example' }], pagination: { total: 1 } })
    }
    r[`${S}/startups/acme`] = detail([round(0)], 27)
    r[`${S}/startups/acme/activity?kind=funding&limit=25&offset=0`] = json({ data: Array.from({ length: 25 }, (_, i) => round(i)), pagination: { offset: 0, total: 27 } })
    r[`${S}/startups/acme/activity?kind=funding&limit=25&offset=25`] = json({ data: [round(25), round(26)], pagination: { offset: 25, total: 27 } })
    return { ...r, ...over }
  }
  it('pages documented activity by offset only and stores round facts with CC BY credit, never descriptions', async () => {
    const gate = new StubFetcher(activityWorld())
    const { StartupDbProvider, initialStartupDbCursor } = await import('../../src/ingest/discovery/startupdb.js')
    const seen: Record<string, unknown>[] = []
    const result = await new StartupDbProvider(gate, 0).discover(initialStartupDbCursor(), 1, async (c) => { seen.push(...(c.funding ?? [])) }, async () => {})
    const activity = gate.requested.filter((u) => u.includes('/activity'))
    expect(activity).toEqual([`${S}/startups/acme/activity?kind=funding&limit=25&offset=0`, `${S}/startups/acme/activity?kind=funding&limit=25&offset=25`])
    expect(gate.requested.every((u) => !u.startsWith(S) || /^https:\/\/startupdb\.com\/api\/v1\/(?:investors\?q=[^&]+&limit=100&offset=0|investors\/f\d\/portfolio\?limit=25&offset=\d+|startups\/acme(?:\/activity\?kind=funding&limit=25&offset=\d+)?)$/.test(u))).toBe(true)
    expect(seen).toHaveLength(27)
    const persistedSummary = await expanded(new StubFetcher(activityWorld()))
    const persisted = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(persistedSummary, 'startupdb').runId } })
    expect(JSON.stringify({ cursor: persisted.cursor, coverage: persisted.coverage })).not.toMatch(/Third-party company description|Press headline/)
    expect(JSON.stringify(seen)).not.toMatch(/Third-party company description|Press headline/)
    expect(result.coverage).toMatchObject({ attribution: 'StartupDB (https://startupdb.com)', license: 'CC BY 4.0', rateLimit: expect.stringContaining('120/min'),
      robotsConflictDisclosure: expect.stringContaining('Disallow: /api/v1/') })
  }, 30_000)
  it('honours an activity 429 with retry-after: pauses with the cursor saved and resumes from the same offset', async () => {
    const limited = activityWorld({ [`${S}/startups/acme/activity?kind=funding&limit=25&offset=25`]: { body: '', statusCode: 429, headers: { 'retry-after': '42' } } })
    const { StartupDbProvider, initialStartupDbCursor } = await import('../../src/ingest/discovery/startupdb.js')
    let saved: unknown = null
    await expect(new StartupDbProvider(new StubFetcher(limited), 0).discover(initialStartupDbCursor(), 1, async () => {}, async (c) => { saved = c }))
      .rejects.toMatchObject({ reason: 'source_rate_limited', retryAfterSeconds: 42 })
    expect(saved).toMatchObject({ pending: { slug: 'acme', fundingOffset: 25, fundingDone: false } })
    const gate = new StubFetcher(activityWorld()), funding: unknown[] = []
    await new StartupDbProvider(gate, 0).discover(saved as never, 1, async (c) => { funding.push(...(c.funding ?? [])) }, async () => {})
    expect(gate.requested.filter((u) => u.includes('/activity'))).toEqual([`${S}/startups/acme/activity?kind=funding&limit=25&offset=0`, `${S}/startups/acme/activity?kind=funding&limit=25&offset=25`])
    expect(funding).toHaveLength(27)
  }, 30_000)
})
