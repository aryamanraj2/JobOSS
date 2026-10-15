import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { FETCHED_VIA, verbatimExcerpt, writeEvidence } from '../../core/evidence/write-evidence.js'
import { fetchPage } from '../fetch-page.js'
import { parseHTML } from 'linkedom'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { detectAllAtsInText, detectAtsInUrl, type AtsDetection } from './signatures.js'

export type DetectTarget = { id: string; canonicalDomain: string; careersUrl: string | null; website: string | null }

export type DetectOutcome =
  | { found: true; detection: AtsDetection; sourceUrl: string; fetches: number }
  | { found: false; reason: 'source_unavailable'; detail: string; fetches: number }

export type DetectOptions = {
  /**
   * Candidate PATHS tried per company. Not a request count: a path that redirects
   * costs one request per hop, bounded separately by `maxRedirectHops`.
   * Detection is cheap or it is not done.
   */
  maxPages?: number
  /**
   * Wait between two requests to the SAME host, redirect hops included.
   *
   * Every page tried here is on one employer domain, so the per-host spacing in
   * D4 step 4 applies between them. The gate REFUSES a too-early request rather
   * than queueing it, so without this every company's second candidate page comes
   * back `rate_limited` and detection effectively gets one attempt. Waiting is the
   * only correct response: retrying immediately, or reaching past the limiter,
   * would be evading a rate limit (handover.md §1.5).
   */
  interPageDelayMs?: number
  /**
   * Redirect hops per candidate page. Apex-to-`www`, HTTP-to-HTTPS and locale
   * prefixes mean most company homepages answer with a 30x; not following leaves
   * detection with almost nothing to read. Each hop is re-checked by the gate —
   * see fetch-page.ts.
   */
  maxRedirectHops?: number
  now?: () => Date
}

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/**
 * The paths a careers page actually lives at, in the order worth trying.
 *
 * This list is short on purpose. Detection exists to find a board token, and a
 * company that hides it behind four redirects and a JS router is a company F2's
 * Firecrawl escalation handles — not one to spend ten requests and ten seconds of
 * per-host rate delay on here.
 */
export const CAREERS_PATHS = ['/careers', '/jobs', '/careers/', '/about/careers'] as const

/** Ignore testimonials, customer links and arbitrary script text. A careers link/embed is an ownership claim. */
export function employerAtsLinks(html: string, pageUrl: string, companyDomain: string): AtsDetection[] {
  const owner = canonicalizeDomain(pageUrl)
  if (!owner.ok || owner.domain !== companyDomain) return []
  const { document } = parseHTML(html)
  const onCareersPage = /\/(careers?|jobs?|join)(\/|$)/i.test(new URL(pageUrl).pathname)
  const candidates: AtsDetection[] = []
  for (const element of document.querySelectorAll('a[href],iframe[src],script[src]')) {
    const value = element.getAttribute('href') ?? element.getAttribute('src') ?? ''
    const careerContext = /career|\bjobs?\b|open\s+(roles|positions)|join\s+(us|our)|work\s+(with|at)/i.test(
      `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
    )
    const embedded = element.localName !== 'a' && /job_board|posting-api|jobs\./i.test(value)
    if (!onCareersPage && !careerContext && !embedded) continue
    for (const hit of detectAllAtsInText(value)) {
      if (!candidates.some((c) => c.vendor === hit.vendor && c.boardToken === hit.boardToken)) candidates.push(hit)
    }
  }
  return candidates
}

/**
 * ATS detection with slug resolution (Part F, F1).
 *
 * Two stages, cheapest first, which is D4's source precedence applied at the level
 * of a single company:
 *
 *   1. **No request at all.** If a stored careers URL or website already points at
 *      a hosted board, the token is right there in the string. Greenhouse and Ashby
 *      companies are usually resolved here.
 *   2. **Read the company's own pages.** Lever publishes no discovery endpoint
 *      (B6), so for a Lever company the slug exists nowhere except on pages the
 *      company controls. The homepage is tried first, then a short list of
 *      conventional careers paths.
 *
 * Every request goes through the gate, so the company's `derived_company` allow
 * row, its robots.txt, its rate policy and both budget envelopes all apply. A
 * refusal is returned as an outcome, never thrown: F1 handover §8.2.3 — "detection
 * failure is `source_unavailable`, not an exception".
 */
export async function detectAtsForCompany(
  db: Db,
  fetcher: GatedFetcher,
  company: DetectTarget,
  opts: DetectOptions = {},
): Promise<DetectOutcome> {
  const now = opts.now ?? (() => new Date())
  const maxPages = opts.maxPages ?? 3

  const origin = `https://${company.canonicalDomain}`
  const storedEmployerCareers = company.careersUrl && canonicalizeDomain(company.careersUrl)
  const pages = [...new Set([
    ...(storedEmployerCareers && storedEmployerCareers.ok && storedEmployerCareers.domain === company.canonicalDomain
      ? [company.careersUrl!] : []),
    origin, ...CAREERS_PATHS.map((path) => `${origin}${path}`),
  ])].slice(0, maxPages)

  let fetches = 0
  const failures: string[] = []

  for (const url of pages) {
    if (fetches > 0) await sleep(opts.interPageDelayMs ?? 0)

    const page = await fetchPage(fetcher, url, {
      companyId: company.id,
      cost: 1,
      maxHops: opts.maxRedirectHops ?? 3,
      sameHostDelayMs: opts.interPageDelayMs ?? 0,
    })
    fetches += page.fetches

    if (!page.ok) {
      failures.push(page.detail)
      // A preflight refusal is about the HOST, not the path: robots, terms, rate
      // and budget apply identically to every other page on it, so trying more
      // paths would only produce the same refusal more times. An ordinary HTTP
      // failure says nothing about the next path, so that one keeps going.
      if (page.reason !== 'source_unavailable') break
      continue
    }

    const hits = employerAtsLinks(page.body, page.url, company.canonicalDomain)
    const expected = company.careersUrl ? detectAtsInUrl(company.careersUrl) : null
    const hit = hits.length === 1 ? hits[0] : null
    if (hit && (!expected || (hit.vendor === expected.vendor && hit.boardToken === expected.boardToken))) {
      // Cite the URL that actually served the markup, not the one we asked for.
      await recordDetectionEvidence(db, company.id, page.url, hit, now())
      return { found: true, detection: hit, sourceUrl: page.url, fetches }
    }
    failures.push(`${page.url}: ${hits.length > 1 ? 'ambiguous employer boards' : expected && hit ? 'board ownership mismatch' : 'no employer careers board link'}`)
  }

  await writeAudit(db, {
    actorType: 'system',
    actorId: 'ats-detect',
    action: 'ats.detection_failed',
    subjectType: 'Company',
    subjectId: company.id,
    reasonCode: 'source_unavailable',
    metadata: { domain: company.canonicalDomain, attempts: failures },
  })

  return {
    found: false,
    reason: 'source_unavailable',
    detail: failures.join('; ') || 'no candidate URL to inspect',
    fetches,
  }
}

/**
 * Records WHERE the board token was read from, quoting the matched text verbatim.
 *
 * `Company.atsBoardToken` is a stored fact like any other, so it needs the same
 * provenance as a location or a team size: without this row, the criterion "every
 * field traceable to an `Evidence` row" is false for the two fields that decide
 * which postings the company ever gets.
 */
async function recordDetectionEvidence(
  db: Db,
  companyId: string,
  sourceUrl: string,
  detection: AtsDetection,
  observedAt: Date,
): Promise<void> {
  await writeEvidence(db, {
    companyId,
    sourceUrl,
    // The token was read off the employer's own page or link, not out of an ATS
    // feed — `company_page` is what that is.
    sourceType: 'company_page',
    excerpt: verbatimExcerpt(detection.matchedText),
    contentHash: contentHashOf({ vendor: detection.vendor, boardToken: detection.boardToken }),
    observedAt,
    confidence: 0.9,
    fetchedVia: FETCHED_VIA.structuredFeed,
  })
}

/** Persists a detection onto the Company. `atsSlug` is the vendor; `atsBoardToken` the board. */
export async function saveDetection(
  db: Db,
  companyId: string,
  detection: AtsDetection,
  careersUrl: string,
): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { canonicalDomain: true } })
  const owner = canonicalizeDomain(careersUrl)
  const evidence = owner.ok && owner.domain === company.canonicalDomain
    ? await db.evidence.findFirst({
        where: { companyId, sourceUrl: careersUrl, sourceType: 'company_page',
          contentHash: contentHashOf({ vendor: detection.vendor, boardToken: detection.boardToken }) },
        orderBy: { observedAt: 'desc' }, select: { id: true, observedAt: true },
      }) : null
  if (!evidence) throw new Error('ATS ownership requires a fetched employer careers link')
  await db.company.update({
    where: { id: companyId },
    data: {
      atsSlug: detection.vendor,
      atsBoardToken: detection.boardToken,
      careersUrl,
      atsOwnershipEvidenceId: evidence.id,
      atsOwnershipVerifiedAt: evidence.observedAt,
    },
  })
}
