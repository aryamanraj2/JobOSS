import { describe, expect, it } from 'vitest'
import { detectAllAtsInText, detectAtsInText, detectAtsInUrl } from '../../src/ingest/ats/signatures.js'

/**
 * B6's correction, tested: Greenhouse migrated hosted board pages from
 * `boards.greenhouse.io` to `job-boards.greenhouse.io`. Both must resolve, because
 * years of published links still point at the old host and treating those as
 * unknown loses the company silently.
 */
describe('Greenhouse detection', () => {
  it('reads the token from the current hosted-board host', () => {
    expect(detectAtsInUrl('https://job-boards.greenhouse.io/acmecorp')).toEqual({
      vendor: 'greenhouse',
      boardToken: 'acmecorp',
      matchedText: 'job-boards.greenhouse.io/acmecorp',
    })
  })

  it('still reads the token from the legacy host', () => {
    expect(detectAtsInUrl('https://boards.greenhouse.io/acmecorp')).toMatchObject({
      vendor: 'greenhouse',
      boardToken: 'acmecorp',
    })
  })

  it('does not swallow the job path into the token', () => {
    expect(
      detectAtsInUrl('https://job-boards.greenhouse.io/acmecorp/jobs/4729937005'),
    ).toMatchObject({ boardToken: 'acmecorp' })
  })

  it('reads the token out of an embed script rather than calling it "embed"', () => {
    const html = `<script src="https://boards.greenhouse.io/embed/job_board/js?for=acmecorp"></script>`
    expect(detectAtsInText(html)).toMatchObject({ vendor: 'greenhouse', boardToken: 'acmecorp' })
  })

  it('reads the token from an embedded board iframe', () => {
    const html = `<iframe src="https://boards.greenhouse.io/embed/job_board?for=acmecorp"></iframe>`
    expect(detectAtsInText(html)).toMatchObject({ vendor: 'greenhouse', boardToken: 'acmecorp' })
  })

  it('recognises the API host itself', () => {
    expect(
      detectAtsInUrl('https://boards-api.greenhouse.io/v1/boards/acmecorp/jobs'),
    ).toMatchObject({ vendor: 'greenhouse', boardToken: 'acmecorp' })
  })
})

/**
 * Lever publishes no discovery endpoint (B6), so the slug exists nowhere except on
 * pages the company controls. These are the shapes it actually appears in.
 */
describe('Lever slug resolution', () => {
  it('reads the slug from a hosted board link', () => {
    expect(detectAtsInUrl('https://jobs.lever.co/leverdemo')).toMatchObject({
      vendor: 'lever',
      boardToken: 'leverdemo',
    })
  })

  it('reads the slug from a deep link to one posting', () => {
    const html = `<a href="https://jobs.lever.co/leverdemo/681fbc53-1e34-4a46-8677-3a78118674eb">Apply</a>`
    expect(detectAtsInText(html)).toMatchObject({ vendor: 'lever', boardToken: 'leverdemo' })
  })

  it('recognises the postings API', () => {
    expect(detectAtsInUrl('https://api.lever.co/v0/postings/leverdemo?mode=json')).toMatchObject({
      vendor: 'lever',
      boardToken: 'leverdemo',
    })
  })
})

describe('Ashby detection', () => {
  it('reads the board name from a hosted board link', () => {
    expect(detectAtsInUrl('https://jobs.ashbyhq.com/ashby')).toMatchObject({
      vendor: 'ashby',
      boardToken: 'ashby',
    })
  })

  it('recognises the public posting API', () => {
    expect(
      detectAtsInUrl('https://api.ashbyhq.com/posting-api/job-board/ashby'),
    ).toMatchObject({ vendor: 'ashby', boardToken: 'ashby' })
  })
})

describe('non-detections', () => {
  it('returns null rather than inventing a board', () => {
    expect(detectAtsInText('<html><body>We are hiring! Email us.</body></html>')).toBeNull()
    expect(detectAtsInUrl('https://example.com/careers')).toBeNull()
  })

  it('does not match a lookalike host', () => {
    expect(detectAtsInUrl('https://notgreenhouse.io/acmecorp')).toBeNull()
    expect(detectAtsInUrl('https://lever.example.com/acme')).toBeNull()
  })
})

describe('detectAllAtsInText', () => {
  /**
   * A company mid-migration links both vendors. That is a decision for the caller,
   * not something to resolve silently by returning whichever regex ran first.
   */
  it('surfaces every distinct board on a page', () => {
    const html = `
      <a href="https://boards.greenhouse.io/oldco">Old jobs</a>
      <a href="https://jobs.ashbyhq.com/newco">New jobs</a>
      <a href="https://jobs.ashbyhq.com/newco/123">A role</a>
    `
    expect(detectAllAtsInText(html)).toEqual([
      { vendor: 'greenhouse', boardToken: 'oldco', matchedText: 'boards.greenhouse.io/oldco' },
      { vendor: 'ashby', boardToken: 'newco', matchedText: 'jobs.ashbyhq.com/newco' },
    ])
  })
})

describe('RC-2 actual parsed vendor and board', () => {
  const target = { id: 'synthetic', canonicalDomain: 'acme.example', atsSlug: 'greenhouse', atsBoardToken: 'acme' }
  it.each([
    'https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme',
    'https://jobs.lever.co/foreign/1?next=https://job-boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/foreign/1#https://job-boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/foreign/https://job-boards.greenhouse.io/acme/jobs/1',
    'https://job-boards.greenhouse.io/foreign/jobs/1?next=https://job-boards.greenhouse.io/acme',
    'https://job-boards.greenhouse.io/foreign/jobs/1#https://job-boards.greenhouse.io/acme',
    'https://job-boards.greenhouse.io/foreign/https://job-boards.greenhouse.io/acme',
    'https://boards.greenhouse.io/?for=acme',
    'https://boards.greenhouse.io/embed/other?for=acme',
    'https://boards.greenhouse.io/embed/job_board?for=acme&for=foreign',
    'https://boards.greenhouse.io/embed/job_board?next=https://job-boards.greenhouse.io/acme',
    'https://job-boards.greenhouse.io/acme%2Fforeign/jobs/1',
    'http://job-boards.greenhouse.io/acme',
    'https://user:password@job-boards.greenhouse.io/acme',
    'https://job-boards.greenhouse.io:8443/acme',
    'https://jobs.eu.lever.co/acme',
    'https://evil.example/?next=https://job-boards.greenhouse.io/acme',
  ])('rejects cross-vendor/token/query/fragment/path confusion: %s', async (url) => {
    const { belongsToBoard } = await import('../../src/ingest/ats/verified.js')
    expect(belongsToBoard(url, target)).toBe(false)
  })
  it.each([
    'https://job-boards.greenhouse.io/acme',
    'https://boards.greenhouse.io/acme/jobs/123?gh_src=fixture#application',
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true',
    'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123',
    'https://boards.greenhouse.io/embed/job_board?for=acme',
    'https://boards.greenhouse.io/embed/job_board/js?for=acme',
    'https://job-boards.greenhouse.io/embed/job_board?for=acme',
    'https://job-boards.greenhouse.io/embed/job_board/js?for=acme',
  ])('preserves a valid Greenhouse origin/path: %s', async (url) => {
    const { belongsToBoard } = await import('../../src/ingest/ats/verified.js')
    expect(belongsToBoard(url, target)).toBe(true)
  })
  it('extracts each complete outer URL once, keeping nested descriptions out of identity', () => {
    const nested = 'https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme'
    expect(detectAtsInUrl(nested)).toBeNull()
    expect(detectAllAtsInText(`<a href="${nested}">Jobs</a>`)).toEqual([])
    expect(detectAtsInUrl('https://jobs.lever.co/foreign/123?next=https://job-boards.greenhouse.io/acme')).toMatchObject({ vendor: 'lever', boardToken: 'foreign' })
  })
})

it.each([
  ['https://jobs.lever.co/acme/123/apply', 'lever'],
  ['https://api.lever.co/v0/postings/acme?mode=json', 'lever'],
  ['https://api.lever.co/v0/postings/acme/123', 'lever'],
  ['https://jobs.ashbyhq.com/acme/123/application', 'ashby'],
  ['https://api.ashbyhq.com/posting-api/job-board/acme', 'ashby'],
])('uses the actual supported %s origin and path', async (url, vendor) => {
  const { belongsToBoard } = await import('../../src/ingest/ats/verified.js')
  expect(belongsToBoard(url, { id: 'synthetic', canonicalDomain: 'acme.example', atsSlug: vendor, atsBoardToken: 'acme' })).toBe(true)
  expect(belongsToBoard(url, { id: 'synthetic', canonicalDomain: 'acme.example', atsSlug: vendor, atsBoardToken: 'foreign' })).toBe(false)
})
