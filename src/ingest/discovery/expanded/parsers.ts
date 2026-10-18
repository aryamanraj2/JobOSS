import { parseHTML } from 'linkedom'
import { contentHashOf } from '../../../core/evidence/content-hash.js'
import { canonicalizeDomain } from '../../domain/canonicalize.js'
import { array, object, str, type DiscoveryCandidate } from '../common.js'
import { sameRouteUrl } from './page.js'
import type { ExpandedRoute } from './registry.js'
import { sourceDate } from './dates.js'
import { APPLICATION_DOMAINS } from '../hn.js'

export type UnresolvedEntry = { externalId: string; name: string | null; reason: string; sourceUrl: string; detailUrl?: string; raw?: Record<string, unknown> }
export type ParsedPage = { candidates: DiscoveryCandidate[]; unresolved: UnresolvedEntry[]; next: string | null; limitations: string[]; representation: string }
const NON_EMPLOYERS = new Set(['southparkcommons.com', 'alchemistaccelerator.com', 'joinef.com', 'masschallenge.org', 'seedcamp.com',
  'ycombinator.com', 'workatastartup.com', 'startupdb.com', 'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com',
  'myworkdayjobs.com', 'github.com', 'google.com', 'youtube.com', 'youtu.be', 'notion.site', 'notion.so', 'linktr.ee', 'bit.ly', 't.co',
  // SX1E: Getro boards and every HN application-route root (ATS, job boards, forms, hosted pages) are vendors, never employers.
  'getro.com', 'getro.xyz', ...APPLICATION_DOMAINS])
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
  // SPC has one strict detail representation; page-global semantic/JSON-LD rows cannot bind it.
  if (route.family === 'southparkcommons' && SPC_DETAIL.test(new URL(sourceUrl).pathname)) nodes.length = 0
  // SX1 real-format publisher cards (saved pre-flight bytes). The bounded generic shapes above remain a fallback.
  const realCards = route.family === 'seedcamp' && route.kind === 'directory' ? seedcampCards(document)
    : route.family === 'southparkcommons' ? spcEntries(document, sourceUrl, route)
      : route.family === 'alchemist' ? alchemistCards(document) : []
  if (realCards.length) { nodes.push(...realCards); out.representation = 'publisher-cards@sx1' }
  // SX1D: talent.seedcamp.com is Getro. Listing cards are JobPosting microdata; a job page carries one top-level JSON-LD JobPosting.
  const talent = route.family === 'seedcamp' && route.kind === 'jobs' ? talentRows(document, sourceUrl, route) : null
  if (talent?.rows.length) {
    nodes.length = 0; nodes.push(...talent.rows); out.representation = talent.page === 'listing' ? 'seedcamp-talent-listing@sx1d' : 'seedcamp-talent-job@unverified'
    out.limitations.push(talent.page === 'listing' ? 'seedcamp_talent_static_first_page_only' : 'talent_job_page_representation_unverified')
  }
  // SPC listing pages never establish identity; only the same-source detail page can.
  const spcListing = route.family === 'southparkcommons' && !SPC_DETAIL.test(new URL(sourceUrl).pathname)
  for (const row of nodes.slice(0, 500)) {
    const job = typed(row, ['JobPosting'])
    if (job && route.kind !== 'jobs') { out.unresolved.push({ externalId: contentHashOf(row), name: str(object(row.hiringOrganization).name), sourceUrl, reason: 'listing_outside_supported_job_route', raw: row }); continue }
    const employer = job ? object(row.hiringOrganization) : row
    const name = str(employer.name)
    const website = spcListing ? null : employerWebsite(employer.url)
    const profile = sameRouteUrl(String(row.profileUrl ?? row['@id'] ?? ''), sourceUrl, route)
    const id = str(object(row.identifier).value) ?? str(row.identifier) ?? profile ?? contentHashOf({ name, website, title: job ? row.title : null, listingUrl: job ? row.url : null })
    if (!name || !website || row.identityConflict || /\b(?:acquired by|formerly known as|rebranded|redirected to)\b/i.test(String(row.description ?? ''))) {
      out.unresolved.push({ externalId: id, name, sourceUrl, reason: row.identityConflict ? 'conflicting_entry_websites' : row.listingOffRoute ? 'listing_url_off_source_route' : !name ? 'company_name_missing' : spcListing ? 'identity_requires_same_source_detail_page' : !website ? 'company_website_missing_or_foreign' : 'rebrand_or_acquisition_needs_identity_review',
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
  // Alchemist HubDB pages publish their next page as a.next-posts-link rather than rel=next.
  const nextLinks = [...new Set([...document.querySelectorAll('a[rel~="next"][href], a.next-posts-link[href]:not(.disabled)')].map((a) => sameRouteUrl(a.getAttribute('href') ?? '', sourceUrl, route)))]
  if (nextLinks.length > 1 || nextLinks.includes(null)) out.limitations.push('malformed_or_foreign_pagination')
  else out.next = nextLinks[0] ?? null
  if (!nodes.length) out.limitations.push('dynamic_empty_or_changed_representation')
  if (/\b(?:load more|show more)\b/i.test(document.body?.textContent ?? '') && !out.next && !talent?.rows.length) out.limitations.push('dynamic_pagination_unverified')
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
  // A card repeated on one page (e.g. a highlight also in the grid) is one visible unresolved entry.
  out.unresolved = out.unresolved.filter((u, i, all) => all.findIndex((v) => v.externalId === u.externalId && v.reason === u.reason) === i)
  return out
}

type Doc = ReturnType<typeof parseHTML>['document']
const SPC_DETAIL = /^\/compan(?:y|ies)\/[^/]+\/?$/
const WEBSITE_LABEL = /^(?:website|visit website|company website|visit site)$/i
const text = (node: { textContent: string | null } | null | undefined) => clean(node?.textContent)
/** seedcamp.com/our-companies: div.company__item cards; the website is bound only by "Link to {name}'s website". */
function seedcampCards(document: Doc): Record<string, unknown>[] {
  return [...document.querySelectorAll('div.company__item')].map((card) => {
    const name = text(card.querySelector('.company__item__name')), link = card.querySelector('a.company__item__link[href]')
    const label = text(link), bound = /^Link to (.+?)\s*'s website$/i.exec(label)
    const href = link?.getAttribute('href') ?? null
    return { '@type': 'Organization', name, url: bound && clean(bound[1]) === name ? employerWebsite(href) : null,
      description: text(card.querySelector('.company__item__description__content')) || null, year: text(card.querySelector('.company__item__year')) || null,
      sectors: [...card.classList].filter((c) => c !== 'company__item' && c !== 'mix'), websiteCandidates: href ? [href] : [], websiteLabel: label || null,
      sourceCard: 'seedcamp.company__item' }
  })
}
/** southparkcommons.com/companies: highlight cards and SSR rows link to /companies/{slug}; a detail page may label a website. */
function spcEntries(document: Doc, sourceUrl: string, route: ExpandedRoute): Record<string, unknown>[] {
  if (SPC_DETAIL.test(new URL(sourceUrl).pathname)) {
    const headings = [...document.querySelectorAll('h1')]
    const heading = headings.length === 1 ? headings[0] : null, name = text(heading)
    const excluded = 'footer,nav,header,aside,[role="navigation"],.news,#news,[data-news]'
    const scope = heading?.closest('article,main')
    if (!name || !scope || heading?.closest(excluded)) return []
    const labelled = [...document.querySelectorAll('a[href]')].filter(a => WEBSITE_LABEL.test(text(a) || (a.getAttribute('aria-label') ?? '')))
    const link = labelled.length === 1 ? labelled[0] : null
    const url = link ? absolute(link.getAttribute('href'), sourceUrl) : null
    // The common identity group must not reach the link through a different semantic group.
    let group = heading?.parentElement
    while (group && link && !group.contains(link)) group = group.parentElement
    let identityGroup = !!group && !!link
    for (let ancestor = link?.parentElement; ancestor && ancestor !== group; ancestor = ancestor.parentElement) {
      if (ancestor.matches('article,section,aside,h2,h3,h4,h5,h6')) identityGroup = false
    }
    // The lowest common ancestor of the h1 and the link must itself hold no other semantic block (flat headings, sibling asides/sections).
    if (group?.querySelector('article,section,aside,nav,footer,header,h2,h3,h4,h5,h6')) identityGroup = false
    const bound = identityGroup && link && scope.contains(link) && !link.closest(excluded) && url && !/\/(?:news|blog|press|articles?)(?:\/|$)/i.test(new URL(url).pathname)
    const website = bound ? employerWebsite(url) : null
    // Real pages (pre-flight 02) put founder bios in aside blocks: a bound identity's description is the identity group only, never the whole page.
    return [{ '@type': 'Organization', name, url: website, description: clean([...(bound && group ? group : scope).childNodes].map(node => node.textContent ?? '').join(' ')), websiteCandidates: website ? [website] : [], sourceCard: 'spc.detail',
      ...(labelled.length > 1 ? { identityConflict: true } : {}) }]
  }
  const rows = [...document.querySelectorAll('a[data-highlight-card][href]')].map((card) => ({ card, link: card, name: text(card.querySelector('h3')),
    description: text([...card.querySelectorAll('p')].at(-1)), label: text(card.querySelector('p')), facts: [] as string[], kind: 'spc.highlight' }))
  for (const article of document.querySelectorAll('article')) {
    if (article.querySelector('h2,h3')) continue // generic semantic rows are parsed above
    const link = article.querySelector('a[href*="/companies/"]')
    if (link) rows.push({ card: article, link, name: text(link), description: text(article.querySelector('p')), label: '',
      facts: [...new Set([...article.querySelectorAll('span:not([aria-hidden])')].map((s) => text(s)).filter(Boolean))], kind: 'spc.row' })
  }
  return rows.filter((r) => r.name).map((r) => ({ '@type': 'Organization', name: r.name, url: null, profileUrl: sameRouteUrl(r.link.getAttribute('href') ?? '', sourceUrl, route),
    description: r.description || null, highlightLabel: r.label || null, facts: r.facts, sourceCard: r.kind }))
}
const TALENT_JOB = /^\/companies\/[^/]+\/jobs\/\d+-[^/]+\/?$/
/** Getro boards: the listing card has only the employer name and logo (employer stays unresolved); load-more, Getro and APIs are never called. */
function talentRows(document: Doc, sourceUrl: string, route: ExpandedRoute): { page: 'listing' | 'job'; rows: Record<string, unknown>[] } {
  if (TALENT_JOB.test(new URL(sourceUrl).pathname)) {
    const rows: Record<string, unknown>[] = []
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = object(JSON.parse(script.textContent ?? ''))
        if (!typed(value, ['JobPosting'])) continue
        const apply = [...new Set([...document.querySelectorAll('a[href]')].filter((a) => /^apply now$/i.test(text(a))).map((a) => absolute(a.getAttribute('href'), sourceUrl)))]
        rows.push({ ...value, url: sameRouteUrl(sourceUrl, sourceUrl, route), ...(apply.length === 1 && apply[0] ? { applicationUrl: apply[0] } : {}), sourceCard: 'seedcamp.talent.jsonld' })
      } catch { /* invalid JSON-LD stays absent */ }
    }
    return { page: 'job', rows }
  }
  // linkedom keeps the camel-cased itemType/itemProp attribute names of this React markup, so match them case-insensitively.
  const attr = (el: ReturnType<Doc['querySelector']> & object, name: string) => el.getAttribute(name) ?? el.getAttribute(name.toLowerCase())
  const props = (root: ReturnType<Doc['querySelector']> & object, name: string) => [...root.querySelectorAll('*')].filter((el) => attr(el, 'itemProp') === name)
  const cards = [...document.querySelectorAll('[itemscope]')].filter((el) => attr(el, 'itemType') === 'https://schema.org/JobPosting')
  const rows = cards.map((card) => {
    const link = card.querySelector('a[data-testid="job-title-link"][href]')
    const employer = props(card, 'hiringOrganization')[0]
    const title = text(props(card, 'title')[0]), name = clean(employer && props(employer, 'name')[0]?.getAttribute('content'))
    const url = link ? sameRouteUrl(link.getAttribute('href') ?? '', sourceUrl, route) : null
    // An off-host (or non-job) link is kept as a title/employer-only unresolved signal; the link itself is never stored or followed.
    if (!url || !TALENT_JOB.test(new URL(url).pathname)) return { '@type': 'JobPosting', title, hiringOrganization: { '@type': 'Organization', name }, listingOffRoute: true, sourceCard: 'seedcamp.talent.microdata' }
    return { '@type': 'JobPosting', title, url, datePosted: props(card, 'datePosted')[0]?.getAttribute('content') ?? null,
      hiringOrganization: { '@type': 'Organization', name }, sourceCard: 'seedcamp.talent.microdata' }
  }).filter((row) => row.title)
  return { page: 'listing', rows }
}
/** alchemistaccelerator.com/portfolio-2: highlight slides and HubDB grid cards link only to the Vault (never followed). */
function alchemistCards(document: Doc): Record<string, unknown>[] {
  const vault = (href: string | null | undefined) => { try { const u = new URL(href ?? ''); return u.hostname === 'vault.alchemistaccelerator.com' ? u.href : null } catch { return null } }
  const slug = (url: string | null) => url ? /\/companies\/public\/([^/?#]+)/.exec(url)?.[1] ?? null : null
  const banner = [...document.querySelectorAll('.portfolio-banner-items')].map((item) => {
    const profile = vault(item.querySelector('.portfolio-banner-button a[href]')?.getAttribute('href'))
    const investors = [...item.querySelectorAll('.startups_second_subtitle p')].map((p) => text(p)).filter((t) => t && !/^investors:?$/i.test(t))
    return { name: text(item.querySelector('h2')), description: text(item.querySelector('.startups_subheader')), investors, profile, sourceCard: 'alchemist.highlight' }
  })
  const grid = [...document.querySelectorAll('.investors-hubdb-items a.link')].map((a) => ({ name: text(a.querySelector('.feature_text')),
    description: text(a.querySelector('.description')), country: text(a.querySelector('.country')) || null, classLabel: text(a.querySelector('.class')) || null,
    profile: vault(a.getAttribute('href')), sourceCard: 'alchemist.grid' }))
  return [...banner, ...grid].filter((c) => c.name).map(({ profile, ...c }) => ({ '@type': 'Organization', ...c, url: null,
    ...(slug(profile) ? { identifier: `alchemist-vault:${slug(profile)}` } : {}), vaultProfileUrl: profile, vaultFollowed: false }))
}
