import { describe, expect, it } from 'vitest'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'
import { EXPANDED_ROUTES, expandedManifest, expandedManifestHash } from '../../src/ingest/discovery/expanded/registry.js'
import { employerWebsite, parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'
import { discoverPublic, pageCursor } from '../../src/ingest/discovery/expanded/adapter.js'
import { boundedSourceGate, publicPage } from '../../src/ingest/discovery/expanded/page.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { spcDetail, fixture, html, job, org, NOW } from '../fixtures/discovery-expansion/fixtures.js'
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const parse = (id: string, body?: string) => { const r = route(id); return parseExpandedPage(body ?? fixture(`${id.replaceAll(':', '-')}.html`), r.url!, r, NOW) }

describe('X bounded public parsers — explicitly synthetic shapes', () => {
  it('SPC deduplicates actual rows beside contradictory empty UI and distinguishes fund/member associations', () => {
    // SX1 (Part B 4): an SPC listing never establishes identity; duplicate rows collapse to one visible unresolved entry.
    const result = parse('southparkcommons:companies')
    expect(result.candidates).toHaveLength(0); expect(result.unresolved).toMatchObject([{ name: 'Acme', reason: 'identity_requires_same_source_detail_page' }])
    // Fund/member distinction is now asserted on the same-source detail page, the only identity route.
    const detail = (body: string) => { const r = route('southparkcommons:companies'); return parseExpandedPage(body, 'https://www.southparkcommons.com/companies/acme', r, NOW) }
    expect(detail(spcDetail(org('Acme', 'https://acme.example', { description: 'fund investment' }))).candidates[0]?.provenance?.relationship).toBe('fund_investment')
    const member = detail(spcDetail(org('Memberco', 'https://member.example', { description: 'SPC member company' })))
    expect(member.candidates[0]?.provenance?.relationship).toBe('member_association')
    expect(member.candidates[0]?.publishedAt).toBeNull(); expect(member.candidates[0]?.funding).toBeUndefined()
  })
  it('SPC does not upgrade conflicting member/investment language', () => {
    const r = route('southparkcommons:companies')
    expect(parseExpandedPage(spcDetail(org('Acme', 'https://acme.example', { description: 'member and fund investment' })), 'https://www.southparkcommons.com/companies/acme', r, NOW).candidates[0]?.provenance?.relationship).toBe('ambiguous_member_and_investment')
  })
  it('Alchemist preserves highlight versus class29 scopes; dynamic shells are not empty complete portfolios', () => {
    expect(parse('alchemist:highlights').candidates).toHaveLength(1)
    expect(parse('alchemist:class29').candidates[0]?.provenance?.period).toBe('class29')
    expect(parse('alchemist:highlights', '<html><body><h1>Highlights</h1><p>No companies found</p><button>Load more</button></body></html>').limitations).toContain('dynamic_empty_or_changed_representation')
    expect(route('alchemist:details').access).toBe('unsupported')
  })
  it('EF binds location/industry/year/stage and keeps founders as unverified research candidates', () => {
    const c = parse('ef:companies').candidates[0]!
    expect(c.raw).toMatchObject({ location: 'Bengaluru', industry: 'Software', year: '2024', stage: 'Seed', founderCandidates: [{ name: 'Jamie Rao', verification: 'unverified_research_candidate' }] })
    expect(c.provenance?.period).toBe('2024'); expect(c.contactEmails).toBeUndefined(); expect(c.funding).toBeUndefined()
  })
  it('MassChallenge keeps separate historical 2026/2023 program scopes and no hiring/funding date', () => {
    for (const id of ['masschallenge:ch-uk-2026', 'masschallenge:us-2023']) {
      const c = parse(id).candidates[0]!
      expect(c.provenance?.relationship).toBe('historical_program_cohort'); expect(c.provenance?.mode).toBe('company_seed'); expect(c.publishedAt).toBeNull()
      expect(c.raw.yearMeaning).toBe('cohort_year_not_current_operation')
    }
    expect(route('masschallenge:alumni').access).toBe('access_blocked')
  })
  it('Seedcamp direct investment year is not a funding announcement and talent retains company/job binding', () => {
    const c = parse('seedcamp:companies').candidates[0]!
    expect(c.provenance?.period).toBe('2018'); expect(c.publishedAt).toBeNull(); expect(c.funding).toBeUndefined()
    const listing = parse('seedcamp:talent').candidates.find((c) => c.provenance?.listing)!
    expect(listing.website).toBe('https://acme.example/'); expect(listing.provenance?.listing?.url).toBe('https://talent.seedcamp.com/jobs/mobile-1')
  })
  it('official YC jobs require bound employer, listing, title and nonfuture observation/date', () => {
    const c = parse('yc:jobs').candidates[0]!
    expect(c.provenance?.mode).toBe('listed_hint'); expect(c.provenance?.listing?.applicationUrl).toBe('https://acme.example/careers/mobile')
    for (const extra of [{ hiringOrganization: { name: 'Acme' } }, { validThrough: '2026-09-01' }, { datePosted: '2027-01-01' }, { url: 'javascript:alert(1)' }, { title: '' }]) expect(parse('yc:jobs', html([job(extra)])).candidates).toHaveLength(0)
    expect(parse('yc:jobs', html([org()])).limitations).toContain('current_listing_representation_missing')
  })
  it.each(['https://seedcamp.com', 'https://www.southparkcommons.com', 'https://jobs.lever.co/acme', 'https://boards.greenhouse.io/acme', 'https://linkedin.com/company/acme', 'https://bit.ly/acme', 'https://acme.example/?redirect=https://foreign.example', 'https://user:pass@acme.example', 'https://acme.example:4430'])('rejects publisher/social/ATS/tracking/credential route as canonical employer: %s', (url) => {
    expect(employerWebsite(url)).toBeNull()
  })
  it('foreign first links/founder links do not become the company website; ambiguous labelled sites stay unresolved', () => {
    const body = '<html><body><article><h2>Acme</h2><a href="https://foreign.example">Founder</a><a href="https://acme.example">Website</a><a href="https://lookalike.example">Website</a></article></body></html>'
    const result = parse('ef:companies', body)
    expect(result.candidates).toHaveLength(0); expect(result.unresolved[0]?.reason).toBe('conflicting_entry_websites')
    expect(parse('ef:companies', '<html><body><article><h2>Acme</h2><a href="https://founder.example">Founder</a></article></body></html>').candidates).toHaveLength(0)
  })
  it('same-name different domains remain distinct; rebrand/acquisition and conflicting same IDs refuse', () => {
    expect(parse('ef:companies', html([org(), org('Acme', 'https://other.example')])).candidates).toHaveLength(2)
    const bad = parse('ef:companies', html([org('Acme', 'https://acme.example', { identifier: 'a' }), org('Acme', 'https://other.example', { identifier: 'a' })]))
    expect(bad.candidates).toHaveLength(0); expect(bad.unresolved[0]?.reason).toBe('conflicting_duplicate_record')
    expect(parse('ef:companies', html([org('Acme', 'https://acme.example', { description: 'Acquired by Otherco' })])).unresolved[0]?.reason).toContain('rebrand_or_acquisition')
  })
  it('auth pages and empty shells are explicit and never parser successes', () => {
    expect(parse('yc:jobs', '<html><body><input type="password"></body></html>').limitations).toContain('access_blocked')
    expect(parse('seedcamp:companies', '<html><body>Loading...</body></html>').limitations).toContain('dynamic_empty_or_changed_representation')
  })
  it('rejects malformed/foreign pagination rather than following arbitrary links', () => {
    expect(parse('ef:companies', html([org()], '<a rel="next" href="https://foreign.example/page2">Next</a>')).limitations).toContain('malformed_or_foreign_pagination')
    expect(parse('ef:companies', html([org()], '<a rel="next" href="?page=2">Next</a>')).next).toBe('https://www.joinef.com/portfolio/?page=2')
  })
})
describe('X durable/bounded adapter contracts', () => {
  it('freezes the exact source/config manifest and reports every required unresolved subroute', () => {
    // SX1 (Part B 8, 10): yc:hiring added; yc:jobs kept as a blocked, never-requested route.
    expect(EXPANDED_ROUTES).toHaveLength(16)
    expect(EXPANDED_ROUTES.filter((r) => r.kind !== 'unavailable' && !['permitted', 'limited', 'retained_contract'].includes(r.access)).map((r) => [r.id, r.access])).toEqual([
      ['yc:jobs', 'access_blocked'], ['alchemist:class29', 'stale'], ['ef:companies', 'unavailable'], ['masschallenge:ch-uk-2026', 'access_blocked'], ['masschallenge:us-2023', 'access_blocked']])
    const manifest = expandedManifest(); expect(contentHashOf(manifest)).toBe(expandedManifestHash())
    manifest.routes[0]!.scope = 'tampered'; expect(contentHashOf(manifest)).not.toBe(expandedManifestHash())
    expect(EXPANDED_ROUTES.filter((r) => r.kind === 'unavailable').map((r) => r.id)).toEqual(['yc:work-at-a-startup', 'alchemist:details', 'masschallenge:alumni'])
  })
  it('retains the frozen partial page without refetch/order skips and does not charge duplicate company quota', async () => {
    const r = route('seedcamp:companies'), cursor = pageCursor(r), ids = new Set<string>()
    const gate = new StubFetcher({ [r.url!]: { body: html([org(), org('Second', 'https://second.example')]) } })
    const handle = async (c: { website: string }) => { const fresh = !ids.has(c.website); ids.add(c.website); return fresh }
    await discoverPublic(gate, r, cursor, NOW, handle, async () => {}, 1)
    expect(cursor.snapshot).toBeDefined(); expect(ids.size).toBe(1)
    const noFetch = new StubFetcher({})
    await discoverPublic(noFetch, r, cursor, NOW, handle, async () => {}, 1)
    expect(ids.size).toBe(2); expect(noFetch.requested).toHaveLength(0); expect(cursor.scopeDone).toBe(true)
  })
  it('catches cyclic and repeated-content pagination and caps page traversal', async () => {
    const r = route('seedcamp:companies')
    const pages: Record<string, { body: string }> = {}
    for (let i = 0; i < 8; i++) pages[i ? `${r.url}?page=${i}` : r.url!] = { body: html([org(`C${i}`, `https://c${i}.example`)], `<a rel="next" href="?page=${i + 1}">Next</a>`) }
    const gate = new StubFetcher(pages), cursor = pageCursor(r)
    const result = await discoverPublic(gate, r, cursor, NOW, async () => true, async () => {}, 20)
    expect(gate.requested).toHaveLength(6); expect(result.complete).toBe(false); expect(cursor.next).toContain('page=6'); expect(cursor.limitations).toContain('page_cap_6_remaining_cursor')
    const cyclic = pageCursor(r)
    await discoverPublic(new StubFetcher({ [r.url!]: { body: html([org()], `<a rel="next" href="${r.url}">Next</a>`) } }), r, cyclic, NOW, async () => true, async () => {}, 20)
    expect(cyclic.limitations).toContain('pagination_cycle')
    const repeated = pageCursor(r), body = html([org()], '<a rel="next" href="?page=1">Next</a>')
    await discoverPublic(new StubFetcher({ [r.url!]: { body }, [`${r.url}?page=1`]: { body } }), r, repeated, NOW, async () => true, async () => {}, 20)
    expect(repeated.limitations).toContain('repeated_page_content')
  })
  it('follows only gated same-source details with exact company names and preserves directory entry', async () => {
    const r = route('southparkcommons:companies'), cursor = pageCursor(r), stored: unknown[] = []
    const gate = new StubFetcher({ [r.url!]: { body: '<html><body><article><h2><a href="/companies/acme">Acme</a></h2></article></body></html>' }, 'https://www.southparkcommons.com/companies/acme': { body: spcDetail() } })
    await discoverPublic(gate, r, cursor, NOW, async (c) => { stored.push(c); return true }, async () => {}, 20)
    expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ companyName: 'Acme', raw: { detailUrl: 'https://www.southparkcommons.com/companies/acme' } })
    expect(cursor.unresolved).toHaveLength(0)
  })
  it('429 keeps retry-after and byte/truncation/refusal/redirect failures stay bounded', async () => {
    const r = route('seedcamp:companies')
    const rate = boundedSourceGate(new StubFetcher({ [r.url!]: { body: '', statusCode: 429, headers: { 'retry-after': '17' } } }), r, 0)
    await expect(publicPage(rate.gate, r.url!, r)).rejects.toMatchObject({ reason: 'source_rate_limited', retryAfterSeconds: 17 })
    const truncated = boundedSourceGate(new StubFetcher({ [r.url!]: { body: 'partial', truncated: true } }), r, 0)
    await expect(publicPage(truncated.gate, r.url!, r)).rejects.toMatchObject({ reason: 'truncated_or_byte_cap' })
    await expect(publicPage(new StubFetcher({ [r.url!]: { body: '', statusCode: 302, headers: { location: 'https://linkedin.com' } } }), r.url!, r)).rejects.toMatchObject({ reason: 'unsupported_redirect_or_auth' })
    await expect(publicPage(new StubFetcher({ [r.url!]: { body: '', statusCode: 302, headers: { location: r.url! } } }), r.url!, r)).rejects.toMatchObject({ reason: 'redirect_cycle' })
  })
})
it('source request/byte/record caps cannot be bypassed by a fake transport ignoring maxBytes', async () => {
  const r = route('seedcamp:companies'), url = r.url!
  const gate = boundedSourceGate(new StubFetcher({ [url]: { body: 'x' } }), r, 0)
  for (let i = 0; i < 250; i++) await gate.gate.fetchText(url, { cost: 1 })
  await expect(gate.gate.fetchText(url, { cost: 1 })).rejects.toMatchObject({ reason: 'request_cap_250' })
  const bytes = boundedSourceGate(new StubFetcher({ [url]: { body: 'x'.repeat(2 * 1024 * 1024 + 1) } }), r, 0)
  await expect(publicPage(bytes.gate, url, r)).rejects.toMatchObject({ reason: 'truncated_or_byte_cap' })
  const big = parse('ef:companies', html(Array.from({ length: 501 }, (_, i) => org(`C${i}`, `https://c${i}.example`))))
  expect(big.candidates).toHaveLength(500); expect(big.limitations).toContain('records_per_page_cap_500')
})
it('foreign source details and wrong-company details cannot manufacture a company binding', async () => {
  const r = route('southparkcommons:companies'), cursor = pageCursor(r), candidates: unknown[] = []
  const gate = new StubFetcher({ [r.url!]: { body: '<html><body><article><h2><a href="/companies/acme">Acme</a></h2></article></body></html>' }, 'https://www.southparkcommons.com/companies/acme': { body: spcDetail(org('Lookalike', 'https://foreign.example')) } })
  await discoverPublic(gate, r, cursor, NOW, async (c) => { candidates.push(c); return true }, async () => {}, 20)
  expect(candidates).toHaveLength(0); expect(cursor.unresolved).toHaveLength(1)
  expect(cursor.limitations).toContain('unresolved_detail_binding:https://www.southparkcommons.com/companies/acme')
})
