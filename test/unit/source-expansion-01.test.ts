import { describe, expect, it } from 'vitest'
import { hiringCandidate } from '../../src/ingest/discovery/hn.js'

const post = (header: string, body: string) => hiringCandidate({ id: 1, by: 'owner', parent: 30, type: 'comment', text: `${header} | Engineer | Remote | We are hiring. ${body}` }, 30)
const host = (header: string, body: string) => { const c = post(header, body); return c ? new URL(c.website).hostname : null }

describe('DC1-R2 HN name-domain corroboration and second-layer route lists', () => {
  // R-R1b leak set (hn-replay.json synthetic sole routes): every one must stay unresolved.
  it.each([
    'https://jobs.smartrecruiters.com/Acme/123', 'https://jobs.jobvite.com/acme', 'https://acme.recruitee.com', 'https://acme.teamtailor.com/jobs',
    'https://acme.bamboohr.com/careers', 'https://acme.breezy.hr', 'https://ats.rippling.com/acme/jobs', 'https://acme.applytojob.com/apply',
    'https://acme.jobs.personio.de', 'https://acme.pinpointhq.com', 'https://www.welcometothejungle.com/en/companies/acme/jobs', 'https://app.otta.com/jobs/abc',
    'https://builtin.com/job/acme/1', 'https://remoteok.com/remote-jobs/1', 'https://acme.typeform.com/to/abc', 'https://forms.gle/abc', 'https://tally.so/r/abc',
    'https://airtable.com/shrABC', 'https://tinyurl.com/abc', 'https://lnkd.in/abc', 'https://acme.carrd.co', 'https://acme.substack.com/p/hiring',
    'https://medium.com/@acme/hiring', 'https://acme.gitlab.io', 'https://acme.pages.dev', 'https://acme.herokuapp.com',
  ])('sole route %s stays unresolved', (route) => {
    expect(post('Acme', `<a href="${route}">x</a>`)).toBeNull()
  })
  it.each(['jane@hey.com', 'jane@pm.me', 'jane@me.com', 'jane@live.com', 'jane@yahoo.co.uk', 'jane@hotmail.co.uk', 'jane@gmx.de', 'jane@zohomail.com', 'acme@workablemail.com'])('free-mail/ATS-mail %s stays unresolved', (email) => {
    expect(post('Acme', `mail ${email}`)).toBeNull()
  })
  it('third-party product link plus ATS link is unresolved (huggingface case)', () => {
    expect(post('Acme', 'we build on <a href="https://huggingface.co">HF</a>; apply <a href="https://jobs.ashbyhq.com/acme">here</a>')).toBeNull()
  })
  it('an unlisted third-party domain without a header token in its label is unresolved', () => {
    expect(post('Acme', '<a href="https://unrelatedvendor.example">x</a>')).toBeNull()
  })
  it.each([
    ['Acme', '<a href="https://www.acme-robotics.com/careers">x</a> or jobs@acme-robotics.com', 'acme-robotics.com'],
    ['Acme', '<a href="https://acme-robotics.com">x</a> apply <a href="https://jobs.lever.co/acmerobotics">x</a>', 'acme-robotics.com'],
    ['Lake AI', '<a href="https://joinlake.ai">x</a>', 'joinlake.ai'],
    ['QRS Trading', '<a href="https://qrstrading.com">x</a>', 'qrstrading.com'],
    ['ZX7', '<a href="https://zx7.eu">x</a>', 'zx7.eu'],
    ['VQM Run (https://vqm.run)', '<a href="https://vqm.run">x</a>', 'vqm.run'],
    ['Torch Health', '<a href="https://www.torch.health">x</a>', 'torch.health'],
    ['Hollow Space (YC S24)', '<a href="https://www.hollowspace.com/jobs">x</a>', 'hollowspace.com'],
    ['Wipco.com', '<a href="https://careers.wipco.com/">x</a>', 'wipco.com'],
    ['SeedingField', '<a href="https://seeding.field">x</a>', 'seeding.field'],
  ])('genuine corroborated employer %s still resolves', (header, body, expected) => {
    expect(host(header, body)).toBe(expected)
  })
  it('two distinct employer domains remain unresolved', () => {
    expect(post('Acme', '<a href="https://acme.com">x</a> product <a href="https://acme.ai">x</a>')).toBeNull()
  })
  it('descriptive header with no name token cannot corroborate a domain', () => {
    expect(post('Audio/Video Collaboration company, worldwide', 'send resume to hello@loopwidget.io')).toBeNull()
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'
import * as startupdb from '../../src/ingest/discovery/startupdb.js'
const NOW = new Date('2026-10-18T12:00:00Z')
const real = (name: string) => readFileSync(`test/fixtures/discovery-expansion/real/${name}.html`, 'utf8')
const meta = (name: string) => JSON.parse(readFileSync(`test/fixtures/discovery-expansion/real/${name}.meta.json`, 'utf8'))
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const parseReal = (id: string, name: string) => { const r = route(id); return parseExpandedPage(real(name), r.url!, r, NOW) }

describe('SX1 Part B real-format fixtures (saved pre-flight bytes)', () => {
  it.each(['seedcamp-companies', 'southparkcommons-companies', 'alchemist-portfolio-2', 'ef-portfolio'])('%s fixture records its pre-flight source file and SHA-256', async (name) => {
    const m = meta(name), { createHash } = await import('node:crypto')
    expect(createHash('sha256').update(readFileSync(m.sourceFile)).digest('hex')).toBe(m.sourceSha256)
    expect(createHash('sha256').update(readFileSync(`test/fixtures/discovery-expansion/real/${name}.html`)).digest('hex')).toBe(m.fixtureSha256)
  })
  it('Seedcamp cards bind "Link to {name}\'s website", keep investment year/sectors and leave website-less cards unresolved', () => {
    const page = parseReal('seedcamp:companies', 'seedcamp-companies')
    expect(page.candidates.map((c) => [c.companyName, c.website])).toEqual([['Vessla', 'http://vessla.ai/'], ['Waniwani', 'http://waniwani.ai/'],
      ['Wexler', 'http://wexler.ai/'], ['Linkup', 'http://linkup.so/'], ['Fiat Republic', 'http://fiatrepublic.com/'], ['Wise', 'http://wise.com/']])
    expect(page.unresolved.map((u) => [u.name, u.reason])).toEqual([['Solvera', 'company_website_missing_or_foreign'], ['Caveman', 'company_website_missing_or_foreign']])
    const vessla = page.candidates[0]!
    expect(vessla).toMatchObject({ publishedAt: null, provenance: { route: 'seedcamp:companies', period: '2026', periodPrecision: 'source_label', relationship: 'investment_portfolio', mode: 'company_seed' },
      raw: { yearMeaning: 'investment_year_not_funding_date', sectors: ['ai', 'enterprise'], sourceCard: 'seedcamp.company__item' } })
    expect(vessla.funding).toBeUndefined()
    expect(page.representation).toBe('publisher-cards@sx1'); expect(page.next).toBeNull(); expect(page.limitations).toEqual([])
  })
  it('SPC listing yields detail-page entries only: no card or news-link identity', () => {
    const page = parseReal('southparkcommons:companies', 'southparkcommons-companies')
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved.map((u) => [u.name, u.reason, u.detailUrl])).toEqual(expect.arrayContaining([
      ['Goodfire', 'identity_requires_same_source_detail_page', 'https://www.southparkcommons.com/companies/goodfire'],
      ['Render', 'identity_requires_same_source_detail_page', 'https://www.southparkcommons.com/companies/render'],
      ['Compound', 'identity_requires_same_source_detail_page', 'https://www.southparkcommons.com/companies/compound'],
      ['Pilot', 'identity_requires_same_source_detail_page', 'https://www.southparkcommons.com/companies/pilot']]))
    expect(page.unresolved).toHaveLength(4)
    expect(JSON.stringify(page)).not.toMatch(/"website":"https?:\/\/(?:www\.)?tryprofound/)
  })
  it('SPC detail page binds identity only through an explicit website label (synthetic detail: no detail bytes were retained)', () => {
    const r = route('southparkcommons:companies'), url = 'https://www.southparkcommons.com/companies/pilot'
    const ok = parseExpandedPage('<html><body><main><h1>Pilot</h1><a href="https://pilot.com/">Website</a><a href="https://news.example/pilot">Press</a></main></body></html>', url, r, NOW)
    expect(ok.candidates.map((c) => [c.companyName, c.website, c.sourceUrl])).toEqual([['Pilot', 'https://pilot.com/', url]])
    expect(parseExpandedPage('<html><body><main><h1>Pilot</h1><a href="https://news.example/pilot">Press</a></main></body></html>', url, r, NOW).candidates).toHaveLength(0)
  })
  it('Alchemist /portfolio-2 cards have names only: unresolved, Vault never a detail URL, HubDB pagination bounded', () => {
    const page = parseReal('alchemist:highlights', 'alchemist-portfolio-2')
    expect(route('alchemist:highlights').url).toBe('https://www.alchemistaccelerator.com/portfolio-2')
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved.map((u) => u.name)).toEqual(['Launch Darkly', 'Privacera', 'Rigetti Quantum Computing', '3DOS', 'Command Line Inc.', '36ZERO Vision'])
    expect(page.unresolved.every((u) => u.detailUrl === undefined && u.reason === 'company_website_missing_or_foreign' && (u.raw as { vaultFollowed: boolean }).vaultFollowed === false)).toBe(true)
    expect(page.unresolved[0]?.raw).toMatchObject({ investors: [expect.stringContaining('Redpoint')], vaultProfileUrl: 'https://vault.alchemistaccelerator.com/companies/public/launchdarkly' })
    expect(page.next).toBe('https://www.alchemistaccelerator.com/portfolio-2?pno=2')
  })
  it('EF static portfolio tiles carry no company website (records load via admin-ajax), so the route is unavailable', () => {
    expect(parseReal('ef:companies', 'ef-portfolio').candidates).toHaveLength(0)
    expect(real('ef-portfolio')).toContain('admin-ajax.php')
    expect(route('ef:companies')).toMatchObject({ access: 'unavailable', accessReason: expect.stringMatching(/^records_not_in_static_html_undocumented_endpoint/), remaining: expect.stringContaining('operator import') })
  })
})

describe('SX1 Part B registry access truth', () => {
  it('every route records pre-flight access with existing evidence; none is unverified', () => {
    for (const r of EXPANDED_ROUTES) {
      expect(['permitted', 'limited', 'retained_contract', 'unsupported', 'unavailable', 'access_blocked', 'stale'], r.id).toContain(r.access)
      expect(r.accessReason.length, r.id).toBeGreaterThan(10)
      expect(r.evidence.length, r.id).toBeGreaterThan(0)
      for (const file of r.evidence) expect(existsSync(file), `${r.id} ${file}`).toBe(true)
    }
    expect(Object.fromEntries(EXPANDED_ROUTES.map((r) => [r.id, r.access]))).toEqual({
      'yc:companies': 'permitted', 'yc:hiring': 'permitted', 'yc:jobs': 'access_blocked', 'yc:work-at-a-startup': 'unsupported',
      'southparkcommons:companies': 'permitted', 'alchemist:highlights': 'permitted', 'alchemist:class29': 'stale', 'alchemist:details': 'unsupported',
      'ef:companies': 'unavailable', 'masschallenge:ch-uk-2026': 'access_blocked', 'masschallenge:us-2023': 'access_blocked', 'masschallenge:alumni': 'access_blocked',
      'seedcamp:companies': 'permitted', 'seedcamp:talent': 'permitted', startupdb: 'limited', hn: 'retained_contract' })
    expect(route('yc:hiring')).toMatchObject({ url: 'https://yc-oss.github.io/api/companies/hiring.json', feed: 'hiring', relationship: 'yc_hiring_signal' })
    expect(route('seedcamp:talent').minDelayMs).toBeGreaterThanOrEqual(10_000)
  })
})

describe('SX1 Part B StartupDB activity facts', () => {
  it('keeps round facts only: no description, title or other third-party text', () => {
    const facts = startupdb.fundingFacts({ eventId: 'e1', kind: 'funding', roundLabel: 'Seed', eventDate: '2026-09-01', amount: { original: '1000000', currency: 'USD', note: 'press text' },
      participants: [{ name: 'Seedcamp', role: 'lead', bio: 'third-party bio' }], sourceUrls: ['https://news.example/a'], description: 'Company description', title: 'News headline', summary: 'Quoted text' })
    expect(facts).toEqual({ eventId: 'e1', kind: 'funding', roundLabel: 'Seed', eventDate: '2026-09-01', amount: { original: '1000000', currency: 'USD' },
      participants: [{ name: 'Seedcamp', role: 'lead' }], sourceUrls: ['https://news.example/a'] })
  })
})
