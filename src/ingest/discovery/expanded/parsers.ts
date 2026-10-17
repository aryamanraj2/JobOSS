import { parseHTML } from 'linkedom'
import { contentHashOf } from '../../../core/evidence/content-hash.js'
import { canonicalizeDomain } from '../../domain/canonicalize.js'
import { array, object, str, type DiscoveryCandidate } from '../common.js'
import { sameRouteUrl } from './page.js'
import type { ExpandedRoute } from './registry.js'
import { sourceDate } from './dates.js'

export type UnresolvedEntry = { externalId: string; name: string | null; reason: string; sourceUrl: string; detailUrl?: string; raw?: Record<string, unknown> }
export type ParsedPage = { candidates: DiscoveryCandidate[]; unresolved: UnresolvedEntry[]; next: string | null; limitations: string[]; representation: string }
const NON_EMPLOYERS = new Set(['southparkcommons.com', 'alchemistaccelerator.com', 'joinef.com', 'masschallenge.org', 'seedcamp.com',
  'ycombinator.com', 'workatastartup.com', 'startupdb.com', 'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com',
  'myworkdayjobs.com', 'github.com', 'google.com', 'youtube.com', 'youtu.be', 'notion.site', 'notion.so', 'linktr.ee', 'bit.ly', 't.co'])
export function employerApplicationCandidate(raw: unknown): string | null {
  const value = str(raw)
  if (!value) return null
  try {
    const url = new URL(value)
    const domain = canonicalizeDomain(url.href)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || url.search || url.hash ||
      !domain.ok || NON_EMPLOYERS.has(domain.domain)) return null
    return url.href
  } catch { return null }
}
/** Canonical employer identity needs an explicit own root website, never a hosted tenant/path. */
export function employerWebsite(raw: unknown): string | null {
  const value = employerApplicationCandidate(raw)
  if (!value) return null
  const url = new URL(value), canonical = canonicalizeDomain(value)
  return canonical.ok && [canonical.domain, `www.${canonical.domain}`].includes(url.hostname) && url.pathname === '/' ? value : null
}
export function employerApplicationUrl(raw: unknown, domain: string): string | null {
  const value = absolute(raw, `https://${domain}/`)
  if (!value) return null
  const canonical = canonicalizeDomain(value)
  return canonical.ok && canonical.domain === domain ? value : null
}
/** A declared source listing must agree with its employer and application route.
 * External ATS/tenant candidates stay unresolved until independent employer verification. */
export function listingBinding(row: Record<string, unknown>, website: string, sourceUrl: string, route: ExpandedRoute) {
  const roleUrl = absolute(row.url, sourceUrl), applicationUrl = row.applicationUrl == null ? null : absolute(row.applicationUrl, sourceUrl)
  const domain = canonicalizeDomain(website)
  if (!roleUrl || !domain.ok) return null
  const ownRole = employerApplicationUrl(roleUrl, domain.domain), sourceRole = sameRouteUrl(roleUrl, sourceUrl, route)
  if (!ownRole && !sourceRole) return null
  if (row.applicationUrl != null && !applicationUrl) return null
  const role = new URL(roleUrl), application = applicationUrl ? new URL(applicationUrl) : null
  const sourceApplication = application && sourceRole && sameRouteUrl(application.href, sourceUrl, route) && application.origin === role.origin &&
    (application.pathname === role.pathname || application.pathname.startsWith(role.pathname.endsWith('/') ? role.pathname : `${role.pathname}/`))
  if (applicationUrl && !employerApplicationUrl(applicationUrl, domain.domain) &&
    !sourceApplication) return null
  return { roleUrl, applicationUrl }
}
function absolute(raw: unknown, base: string): string | null {
  if (!str(raw)) return null
  try { const url = new URL(String(raw), base); return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : null } catch { return null }
}
function typed(value: Record<string, unknown>, names: string[]) {
  return array(Array.isArray(value['@type']) ? value['@type'] : [value['@type']]).some((t) => names.includes(String(t)))
}
function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}
export function sourceRelationship(route: ExpandedRoute, text: string) {
  if (route.family !== 'southparkcommons') return route.relationship
  const member = /\bmember(?:ship)?\b/i.test(text), fund = /\b(?:fund investment|invested|investment)\b/i.test(text)
  return member && fund ? 'ambiguous_member_and_investment' : member ? 'member_association' : fund ? 'fund_investment' : 'association_unspecified'
}
/** Standards/semantic parsers are deliberately unverified against live markup. They do not guess hidden schemas. */
export function parseExpandedPage(html: string, sourceUrl: string, route: ExpandedRoute, now: Date): ParsedPage {
  const { document } = parseHTML(html)
  const out: ParsedPage = { candidates: [], unresolved: [], next: null, limitations: [], representation: 'public-semantic-or-jsonld@1' }
  if (sameRouteUrl(sourceUrl, route.url ?? sourceUrl, route) !== sourceUrl) { out.limitations.push('invalid_source_route_url'); return out }
  if (document.querySelector('input[type="password"]') || /\b(?:sign in|log in) to (?:view|access|continue)\b/i.test(document.body?.textContent ?? '')) {
    out.limitations.push('access_blocked'); return out
  }
  const nodes: Record<string, unknown>[] = []
  const visit = (value: unknown, depth = 0, entry = false) => {
    if (depth > 8 || nodes.length >= 1000) { out.limitations.push('structured_scan_cap'); return }
    if (Array.isArray(value)) { value.slice(0, 1000).forEach((v) => visit(v, depth + 1, entry)); return }
    const row = object(value)
    if (!Object.keys(row).length) return
    if (typed(row, ['ItemList'])) { array(row.itemListElement).slice(0, 1000).forEach((v) => visit(v, depth + 1, true)); return }
    if (typed(row, ['ListItem'])) { visit(row.item, depth + 1, entry); return }
    if (row['@graph']) { visit(row['@graph'], depth + 1, false); return }
    if (entry && typed(row, ['Organization', 'Corporation', 'LocalBusiness', 'JobPosting'])) nodes.push(row)
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent ?? '')) } catch { out.limitations.push('invalid_jsonld') }
  }
  // Semantic cards: a company heading + an explicitly labelled website, or a linked company heading.
  // Arbitrary first external links and founder/social links are never website fallbacks.
  for (const card of document.querySelectorAll('article, [itemtype="https://schema.org/Organization"]')) {
    if (card.querySelector('article')) continue
    const heading = card.querySelector('h2,h3,[itemprop="name"]')
    const name = clean(heading?.textContent)
    if (!name) continue
    const explicit = [...card.querySelectorAll('a[href]')].filter((a) => /^(?:website|visit website|company website)$/i.test(clean(a.textContent)) || a.getAttribute('itemprop') === 'url')
    const headingLinks = heading ? [...heading.querySelectorAll('a[href]')].filter((a) => clean(a.textContent) === name) : []
    const links = explicit.length ? explicit : headingLinks
    const websites = [...new Set(links.map((a) => absolute(a.getAttribute('href'), sourceUrl)).filter((u) => u && employerWebsite(u)))]
    const profiles = [...new Set(headingLinks.map((a) => sameRouteUrl(a.getAttribute('href') ?? '', sourceUrl, route)).filter(Boolean))]
    const raw: Record<string, unknown> = { '@type': 'Organization', name, url: websites.length === 1 ? websites[0] : null,
      profileUrl: profiles.length === 1 ? profiles[0] : null, description: clean([...card.childNodes].map((node) => node.textContent ?? '').join(' ')), websiteCandidates: websites,
      location: clean(card.querySelector('[itemprop="location"]')?.textContent) || null,
      industry: clean(card.querySelector('[itemprop="industry"]')?.textContent) || null,
      year: clean(card.querySelector('[data-year],time')?.textContent) || null,
      stage: clean(card.querySelector('[data-stage]')?.textContent) || null,
      founderCandidates: [...card.querySelectorAll('a[rel="author"]')].map((a) => ({ name: clean(a.textContent), url: absolute(a.getAttribute('href'), sourceUrl), verification: 'unverified_research_candidate' })) }
    if (websites.length > 1 || profiles.length > 1) raw.identityConflict = true
    nodes.push(raw)
  }
  for (const row of nodes.slice(0, 500)) {
    const job = typed(row, ['JobPosting'])
    if (job && route.kind !== 'jobs') { out.unresolved.push({ externalId: contentHashOf(row), name: str(object(row.hiringOrganization).name), sourceUrl, reason: 'listing_outside_supported_job_route', raw: row }); continue }
    const employer = job ? object(row.hiringOrganization) : row
    const name = str(employer.name)
    const website = employerWebsite(employer.url)
    const profile = sameRouteUrl(String(row.profileUrl ?? row['@id'] ?? ''), sourceUrl, route)
    const id = str(object(row.identifier).value) ?? str(row.identifier) ?? profile ?? contentHashOf({ name, website, title: job ? row.title : null, listingUrl: job ? row.url : null })
    if (!name || !website || row.identityConflict || /\b(?:acquired by|formerly known as|rebranded|redirected to)\b/i.test(String(row.description ?? ''))) {
      out.unresolved.push({ externalId: id, name, sourceUrl, reason: row.identityConflict ? 'conflicting_entry_websites' : !name ? 'company_name_missing' : !website ? 'company_website_missing_or_foreign' : 'rebrand_or_acquisition_needs_identity_review',
        ...(profile && profile !== sourceUrl ? { detailUrl: profile } : {}), raw: row }); continue
    }
    const boundListing = job ? listingBinding(row, website, sourceUrl, route) : null
    const roleUrl = boundListing?.roleUrl ?? null
    const publishedAt = sourceDate(row.datePosted), expires = row.validThrough, expiry = sourceDate(expires)
    if (job && (!str(row.title) || !roleUrl || !publishedAt || !Number.isFinite(publishedAt.getTime()) || publishedAt > now ||
        (expires != null && (!expiry || expiry < now)) || (!expiry && publishedAt && now.getTime() - publishedAt.getTime() > 90 * 86400000))) {
      out.unresolved.push({ externalId: id, name, sourceUrl, reason: 'listing_not_proven_current_or_bound', raw: row }); continue
    }
    const text = [name, clean(row.description)].filter(Boolean).join('\n')
    const relation = sourceRelationship(route, text)
    out.candidates.push({ source: route.family as DiscoveryCandidate['source'], externalId: id, companyName: name, website,
      sourceUrl: profile ?? sourceUrl, text, publishedAt: job ? publishedAt : null,
      provenance: { route: route.id, profileUrl: profile, relationship: relation, mode: job ? 'listed_hint' : 'company_seed',
        period: route.period ?? str(row.year) ?? null, periodPrecision: route.period || row.year ? 'source_label' : 'unknown',
        listing: job ? { title: String(row.title), url: roleUrl!, applicationUrl: boundListing!.applicationUrl, observedAt: now.toISOString(),
          publishedAt: publishedAt!.toISOString(), validThrough: expiry?.toISOString() ?? null, currentVerification: 'external_listing_only_employer_verification_required' } : null },
      raw: { ...row, sourceRoute: route.id, attribution: route.url, relationship: relation, sourceObservedAt: now.toISOString(),
        yearMeaning: route.family === 'seedcamp' ? 'investment_year_not_funding_date' : route.family === 'masschallenge' ? 'cohort_year_not_current_operation' : 'source_label_not_funding_date',
        employerIdentity: 'entry_bound_index_unverified', scopeDisclosures: [route.scope, route.remaining] } })
  }
  if (nodes.length > 500) out.limitations.push('records_per_page_cap_500')
  const nextLinks = [...new Set([...document.querySelectorAll('a[rel~="next"][href]')].map((a) => sameRouteUrl(a.getAttribute('href') ?? '', sourceUrl, route)))]
  if (nextLinks.length > 1 || nextLinks.includes(null)) out.limitations.push('malformed_or_foreign_pagination')
  else out.next = nextLinks[0] ?? null
  if (!nodes.length) out.limitations.push('dynamic_empty_or_changed_representation')
  if (/\b(?:load more|show more)\b/i.test(document.body?.textContent ?? '') && !out.next) out.limitations.push('dynamic_pagination_unverified')
  if (route.kind === 'jobs' && !out.candidates.some((c) => c.provenance?.listing)) out.limitations.push('current_listing_representation_missing')
  // Duplicate cards do not spend distinct-company allowance; conflicting identities never merge silently.
  const byId = new Map<string, DiscoveryCandidate>()
  const conflicts = new Set<string>()
  for (const c of out.candidates) {
    const prior = byId.get(c.externalId)
    if (prior && contentHashOf(prior) !== contentHashOf(c)) conflicts.add(c.externalId)
    else byId.set(c.externalId, c)
  }
  for (const id of conflicts) { const c = byId.get(id)!; byId.delete(id); out.unresolved.push({ externalId: id, name: c.companyName, sourceUrl, reason: 'conflicting_duplicate_record' }) }
  out.candidates = [...byId.values()]
  return out
}
