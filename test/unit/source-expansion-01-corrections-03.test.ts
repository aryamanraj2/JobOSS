import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'

const NOW = new Date('2026-10-18T12:00:00Z')
const dir = 'test/fixtures/discovery-expansion/real/'
const RAW = 'scratch/joboss-source-access-preflight-02-20261018-a/raw/'
const real = (name: string) => readFileSync(`${dir}${name}.html`, 'utf8')
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const spc = route('southparkcommons:companies'), talent = route('seedcamp:talent')
const spcUrl = (slug: string) => `https://www.southparkcommons.com/companies/${slug}`
const JOB_URL = 'https://talent.seedcamp.com/companies/seedcamp/jobs/94426887-legal-analyst-associate'
const bound = (html: string, slug = 'acme') => parseExpandedPage(html, spcUrl(slug), spc, NOW).candidates.map((c) => c.website)
// Remove the hero "Website" label, relabel the anchors chosen by `pick` as "Website" with a foreign root.
type El = NonNullable<ReturnType<ReturnType<typeof parseHTML>['document']['querySelector']>>
const relabelled = (name: string, pick: (anchors: El[]) => El[]) => {
  const { document } = parseHTML(real(name))
  const hero = [...document.querySelectorAll('a[href]')].find((a) => (a.textContent ?? '').trim() === 'Website')!
  const picked = pick([...document.querySelectorAll('a[href]')].filter((a) => a !== hero))
  expect(picked.length).toBeGreaterThan(0)
  hero.querySelector('span')!.textContent = 'Site'
  for (const a of picked) { a.setAttribute('href', 'https://vendor.example/'); a.textContent = 'Website' }
  return document.toString()
}

describe('SX1E SX3-R1 SPC identity group is the lowest common ancestor', () => {
  it.each([
    ['flat h2 News', '<main><h1>Acme</h1><h2>News</h2><p>Vendor partnership <a href="https://vendor.example/">Website</a></p></main>'],
    ['sibling div h3', '<main><section data-section="company-hero"><h1>Acme</h1><div><h3>Partner company</h3><a href="https://vendor.example/">Website</a></div></section></main>'],
    ['media block like real', '<main><section data-section="company-hero"><div class="container"><div class="grid"><div><div><h1>Acme</h1></div><p>Tagline</p></div><aside><p>Founders</p></aside></div><div><div><div><p>Media</p><div><a href="https://vendor.example/" aria-label="Website"><img src="x.webp" alt=""></a></div></div></div></div></div></section></main>'],
  ])('reviewer counterexample %s yields zero candidates', (_name, body) => {
    expect(bound(`<html><body>${body}</body></html>`)).toEqual([])
  })
  it('real goodfire with the Media item relabelled Website and the hero label removed yields zero', () => {
    const html = relabelled('southparkcommons-goodfire', (anchors) => [anchors.find((a) => (a.getAttribute('href') ?? '').includes('announcing-our-50m-series-a'))!])
    expect(bound(html, 'goodfire')).toEqual([])
  })
  it.each([['baseten', 'https://baseten.co/'], ['goodfire', 'https://goodfire.ai/']])('real %s still binds its own website', (slug, website) => {
    expect(bound(real(`southparkcommons-${slug}`), slug)).toEqual([website])
  })
})

describe('SX1E SX3-R5 relabel controls: foreign Website anchors in aside, nav and footer never bind', () => {
  it.each([['aside', 'southparkcommons-goodfire', 'goodfire'], ['nav', 'southparkcommons-baseten', 'baseten'], ['footer', 'southparkcommons-baseten', 'baseten']])('relabelled %s anchor yields zero', (block, file, slug) => {
    expect(bound(relabelled(file, (anchors) => [anchors.find((a) => a.closest(block))!]), slug)).toEqual([])
  })
})

describe('SX1E SX3-R2 talent route', () => {
  it('registry start URL is the verified /jobs listing', () => {
    expect(talent.url).toBe('https://talent.seedcamp.com/jobs')
  })
})

describe('SX1E SX3-R3 off-host talent card', () => {
  const entries = (html: string) => parseExpandedPage(html, 'https://talent.seedcamp.com/jobs', talent, NOW)
  it('trimmed fixture keeps the real Wise card as an unresolved off-route entry with title and employer only', () => {
    const page = entries(real('seedcamp-talent-jobs'))
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved.map((u) => [u.name, u.reason])).toEqual([['Seedcamp', 'company_website_missing_or_foreign'], ['Fluidstack', 'company_website_missing_or_foreign'],
      ['Pleo', 'company_website_missing_or_foreign'], ['Wise', 'listing_url_off_source_route']])
    const wise = page.unresolved.at(-1)!
    expect(wise.raw).toMatchObject({ title: 'Senior Software Engineer - Send High Volume', hiringOrganization: { name: 'Wise' } })
    expect(JSON.stringify(wise)).not.toContain('wise.jobs')
    expect(wise.detailUrl).toBeUndefined()
  })
  it('the full saved page gives 20 entries: 19 signals plus 1 off-route', () => {
    const page = entries(readFileSync(`${RAW}talent.seedcamp.com_jobs`, 'utf8'))
    expect(page.unresolved).toHaveLength(20)
    expect(page.unresolved.filter((u) => u.reason === 'listing_url_off_source_route').map((u) => u.name)).toEqual(['Wise'])
    expect(page.unresolved.filter((u) => u.reason === 'company_website_missing_or_foreign')).toHaveLength(19)
  })
})

describe('SX1E SX3-R4 vendor roots never become talent job-page employer identity', () => {
  const html = real('seedcamp-talent-job'), match = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html)!
  const ld = JSON.parse(match[1]!)
  const withOrg = (url: string, apply: boolean) => {
    const v = structuredClone(ld); v.hiringOrganization.url = url; v.hiringOrganization.sameAs = url
    const out = html.replace(match[1]!, JSON.stringify(v))
    return apply ? out : out.replace(/Apply now/g, 'Apply')
  }
  // The first four are the discriminating network cases: a parser without seedcamp.com in NON_EMPLOYERS binds each of them.
  it.each(['https://seedcamp.com', 'https://seedcamp.com/', 'http://seedcamp.com', 'https://www.seedcamp.com/'])('network root %s never binds', (u) => {
    for (const apply of [true, false]) {
      const page = parseExpandedPage(withOrg(u, apply), JOB_URL, talent, NOW)
      expect(page.candidates).toEqual([]); expect(page.unresolved.map((x) => x.reason)).toEqual(['company_website_missing_or_foreign'])
    }
  })
  it.each(['https://getro.com/', 'https://www.getro.com/', 'https://cdn.getro.com/', 'https://getro.xyz/', 'https://wellfound.com/', 'https://www.ashbyhq.com/', 'https://jobs.ashbyhq.com/', 'https://greenhouse.io/',
    'https://www.teamtailor.com/', 'https://www.smartrecruiters.com/', 'https://applytojob.com/', 'https://www.linkedin.com/'])('vendor root %s never binds, with or without Apply now', (u) => {
    for (const apply of [true, false]) {
      const page = parseExpandedPage(withOrg(u, apply), JOB_URL, talent, NOW)
      expect(page.candidates).toEqual([]); expect(page.unresolved.map((x) => x.reason)).toEqual(['company_website_missing_or_foreign'])
    }
  })
})

describe('SX1E SX3-R6 registry note', () => {
  it('SPC remaining text says signals come from the identity group only', () => {
    expect(spc.remaining).toMatch(/identity group only/)
    expect(spc.remaining).toMatch(/association_unspecified/)
  })
})
