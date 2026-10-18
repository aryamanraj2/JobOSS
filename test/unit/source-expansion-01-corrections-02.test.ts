import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'

const NOW = new Date('2026-10-18T12:00:00Z')
const dir = 'test/fixtures/discovery-expansion/real/'
const real = (name: string) => readFileSync(`${dir}${name}.html`, 'utf8')
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('SX1D pre-flight 02 real fixtures', () => {
  it.each(['southparkcommons-baseten', 'southparkcommons-goodfire', 'seedcamp-talent-jobs', 'seedcamp-talent-job'])('%s records its pre-flight 02 source SHA-256', (name) => {
    const m = JSON.parse(readFileSync(`${dir}${name}.meta.json`, 'utf8'))
    expect(m.sourceFile).toContain('joboss-source-access-preflight-02-20261018-a/raw/')
    expect(sha(m.sourceFile)).toBe(m.sourceSha256)
    expect(sha(`${dir}${name}.html`)).toBe(m.fixtureSha256)
  })

  it.each([['baseten', 'https://baseten.co/'], ['goodfire', 'https://goodfire.ai/']])('SPC real detail %s binds only the company-hero Website anchor', (slug, website) => {
    const r = route('southparkcommons:companies'), url = `https://www.southparkcommons.com/companies/${slug}`
    const page = parseExpandedPage(real(`southparkcommons-${slug}`), url, r, NOW)
    expect(page.candidates.map((c) => [c.companyName, c.website, c.sourceUrl])).toEqual([[slug === 'baseten' ? 'Baseten' : 'Goodfire', website, url]])
    expect(page.unresolved).toHaveLength(0)
    expect(JSON.stringify(page.candidates[0]!.raw.websiteCandidates)).toBe(JSON.stringify([website]))
  })

  it('SPC real detail: aside, nav and footer anchors never bind identity', () => {
    const r = route('southparkcommons:companies'), url = 'https://www.southparkcommons.com/companies/baseten'
    const html = real('southparkcommons-baseten').replace(/<a\b[^>]*>\s*<span>\s*Website\s*<\/span>/i, '<a href="https://baseten.co"><span>Site</span>')
    expect(html).not.toBe(real('southparkcommons-baseten'))
    expect(parseExpandedPage(html, url, r, NOW).candidates).toHaveLength(0)
  })

  it('Seedcamp talent listing reads JobPosting microdata cards as unresolved listing signals', () => {
    const r = route('seedcamp:talent'), url = 'https://talent.seedcamp.com/jobs'
    const page = parseExpandedPage(real('seedcamp-talent-jobs'), url, r, NOW)
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved.map((u) => [u.name, u.reason, (u.raw as { title: string }).title, (u.raw as { url: string }).url])).toEqual([
      ['Seedcamp', 'company_website_missing_or_foreign', 'Legal Analyst/Associate', 'https://talent.seedcamp.com/companies/seedcamp/jobs/94426887-legal-analyst-associate'],
      ['Fluidstack', 'company_website_missing_or_foreign', 'Gas Lead', 'https://talent.seedcamp.com/companies/fluidstack/jobs/97373785-gas-lead'],
      ['Pleo', 'company_website_missing_or_foreign', 'Senior Consumer Duty Specialist', 'https://talent.seedcamp.com/companies/pleo/jobs/97364959-senior-consumer-duty-specialist'],
      ['Wise', 'listing_url_off_source_route', 'Senior Software Engineer - Send High Volume', undefined]])
    expect(page.representation).toBe('seedcamp-talent-listing@sx1d')
    expect(page.next).toBeNull()
    expect(page.limitations).toContain('seedcamp_talent_static_first_page_only')
    expect(page.limitations).not.toContain('dynamic_empty_or_changed_representation')
  })

  it('Seedcamp talent job page: hiringOrganization on the network never becomes employer identity; Apply now stays a raw hint', () => {
    const r = route('seedcamp:talent'), url = 'https://talent.seedcamp.com/companies/seedcamp/jobs/94426887-legal-analyst-associate'
    const page = parseExpandedPage(real('seedcamp-talent-job'), url, r, NOW)
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved).toHaveLength(1)
    expect(page.unresolved[0]).toMatchObject({ name: 'Seedcamp', reason: 'company_website_missing_or_foreign',
      raw: { title: 'Legal Analyst/Associate', applicationUrl: expect.stringContaining('https://seedcamp.com/views/we-are-hiring-a-legal-analyst-associate/') } })
    expect(page.representation).toBe('seedcamp-talent-job@unverified')
    expect(page.limitations).toContain('talent_job_page_representation_unverified')
  })

  it.each(['https://seedcamp.com', 'https://talent.seedcamp.com/', 'https://www.seedcamp.com/x'])('talent job-page hiringOrganization %s never binds', (u) => {
    const r = route('seedcamp:talent'), url = 'https://talent.seedcamp.com/companies/acme/jobs/1-x'
    const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'X', datePosted: '2026-10-01', hiringOrganization: { '@type': 'Organization', name: 'Acme', url: u, sameAs: u } }
    const page = parseExpandedPage(`<html><body><script type="application/ld+json">${JSON.stringify(ld)}</script></body></html>`, url, r, NOW)
    expect(page.candidates).toHaveLength(0)
    expect(page.unresolved.map((x) => x.name)).toEqual(['Acme'])
  })

  it('registry evidence for both routes cites pre-flight 02', () => {
    for (const id of ['southparkcommons:companies', 'seedcamp:talent']) {
      const ev = route(id).evidence
      expect(ev).toContain('docs/JOBOSS-SOURCE-ACCESS-PREFLIGHT-02-REPORT.md')
      expect(ev.some((e) => e.startsWith('scratch/joboss-source-access-preflight-02-20261018-a/raw/'))).toBe(true)
    }
  })
})
