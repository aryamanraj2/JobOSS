import type { DiscoveryCandidate } from '../common.js'
import type { ExpandedRoute } from './registry.js'
import type { PageCursor } from './adapter.js'
import { sameRouteUrl } from './page.js'
import { employerWebsite, listingBinding, sourceRelationship, type ParsedPage, type UnresolvedEntry } from './parsers.js'
import { runtimeDate, sourceDate } from './dates.js'
import { contentHashOf } from '../../../core/evidence/content-hash.js'

export const candidateKey = (c: DiscoveryCandidate) => contentHashOf({ id: c.externalId, raw: c.raw, provenance: c.provenance })
/** Candidate progress is a claim about this source's committed ledger, not just a captured hash.
 * Extra committed records are valid: identity commits before the cursor checkpoint. */
export function validateCommittedProgress(cursor: PageCursor, records: unknown, route: ExpandedRoute): void {
  const durableKeys = new Set<string>()
  for (const value of list(records, 'committed records')) {
    const row = record(value, 'committed record'), raw = record(row.raw, 'committed raw'), provenance = record(row.provenance, 'committed provenance')
    if (row.route !== route.id || row.source !== route.family || raw.sourceRoute !== route.id || provenance.route !== route.id ||
      row.key !== contentHashOf({ route: route.id, externalId: row.externalId, raw, provenance })) invalid('committed source binding')
    text(row.companyId, 'committed company'); text(row.externalId, 'committed external ID')
    durableKeys.add(contentHashOf({ id: row.externalId, raw, provenance }))
    // The optional normalized expiry was added after original v1. Its absence does not
    // change source content: raw expiry and all other identity/provenance bytes still bind.
    if (provenance.listing && typeof provenance.listing === 'object' && !Array.isArray(provenance.listing)) {
      const listing = { ...provenance.listing } as Record<string, unknown>
      delete listing.validThrough
      durableKeys.add(contentHashOf({ id: row.externalId, raw, provenance: { ...provenance, listing } }))
    }
  }
  if (cursor.processed.some((key) => !key.startsWith('detail:') && !durableKeys.has(key))) invalid('processed candidate lacks committed source record')
}
function invalid(detail: string): never { throw new Error(`Invalid expanded persisted state: ${detail}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(label)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(label)
  return value
}
function nullableText(value: unknown, label: string) { if (value !== null) text(value, label) }
function list(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) invalid(label); return value }
function stringList(value: unknown, label: string): string[] { return list(value, label).map((v) => text(v, label)) }
function routeUrl(value: unknown, route: ExpandedRoute, label: string): string {
  const url = text(value, label)
  if (sameRouteUrl(url, route.url ?? url, route) !== url) invalid(label)
  return url
}
function json(value: unknown, depth = 0): void {
  if (depth > 32) invalid('raw JSON nesting')
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return
  if (Array.isArray(value)) { value.forEach((v) => json(v, depth + 1)); return }
  Object.values(record(value, 'raw JSON')).forEach((v) => json(v, depth + 1))
}
function observed(value: unknown, now: Date, label: string): Date {
  const date = sourceDate(value, true)
  if (!date || date > now) invalid(label)
  return date
}
function unresolved(value: unknown, route: ExpandedRoute): UnresolvedEntry {
  const row = record(value, 'unresolved entry')
  text(row.externalId, 'unresolved ID'); nullableText(row.name, 'unresolved name'); text(row.reason, 'unresolved reason')
  routeUrl(row.sourceUrl, route, 'unresolved source URL')
  if (row.detailUrl !== undefined) routeUrl(row.detailUrl, route, 'unresolved detail URL')
  if (row.raw !== undefined) { record(row.raw, 'unresolved raw'); json(row.raw) }
  return row as UnresolvedEntry
}
function candidate(value: unknown, route: ExpandedRoute, snapshotTime: Date, now: Date): DiscoveryCandidate {
  const row = record(value, 'candidate'), raw = record(row.raw, 'candidate raw'), p = record(row.provenance, 'candidate provenance')
  json(raw)
  if (row.source !== route.family || raw.sourceRoute !== route.id || p.route !== route.id) invalid('candidate route/family')
  const name = text(row.companyName, 'company name'), website = employerWebsite(row.website)
  if (!website || website !== row.website) invalid('canonical employer website')
  text(row.externalId, 'external ID'); if (typeof row.text !== 'string') invalid('candidate text')
  routeUrl(row.sourceUrl, route, 'candidate source URL')
  if (p.profileUrl !== null) routeUrl(p.profileUrl, route, 'candidate profile URL')
  if (p.relationship !== sourceRelationship(route, `${String((raw.directoryEntry as Record<string, unknown> | undefined)?.description ?? '')} ${String(row.text)}`)) invalid('source relationship')
  text(p.relationship, 'relationship'); text(p.periodPrecision, 'period precision'); nullableText(p.period, 'period')
  const observation = observed(raw.sourceObservedAt, now, 'candidate observation')
  if (observation < snapshotTime) invalid('candidate predates source snapshot')
  if (raw.detailUrl !== undefined) {
    routeUrl(raw.detailUrl, route, 'candidate detail URL'); routeUrl(raw.directoryUrl, route, 'candidate directory URL')
    if (observed(raw.directoryObservedAt, now, 'directory observation').getTime() !== snapshotTime.getTime() ||
      observed(raw.detailObservedAt, now, 'detail observation').getTime() !== observation.getTime()) invalid('detail observation binding')
    const entry = record(raw.directoryEntry, 'detail directory entry')
    const indexedProfile = entry.profileUrl ?? entry['@id']
    const requested = raw.detailRequestedUrl ?? indexedProfile
    routeUrl(requested, route, 'requested detail URL')
    if (entry.name !== name || indexedProfile !== requested) invalid('detail entry binding')
    if (raw.detailHops !== undefined) {
      const hops = stringList(raw.detailHops, 'detail redirect hops').map((url) => routeUrl(url, route, 'detail hop URL'))
      if (!hops.length || hops.length > 4 || new Set(hops).size !== hops.length || hops[0] !== requested || hops.at(-1) !== raw.detailUrl) invalid('detail redirect binding')
    }
    // Original v1 captures predate hop metadata: their exact-name, recorded same-source binding
    // remains an unverified legacy index relationship, never fresh redirect/ownership proof.
  } else if (observation.getTime() !== snapshotTime.getTime()) invalid('snapshot observation binding')
  const employer = p.mode === 'listed_hint' ? record(raw.hiringOrganization, 'listing employer') : raw
  const description = typeof raw.description === 'string' ? raw.description.replace(/\s+/g, ' ').trim() : ''
  if (raw.identityConflict || /\b(?:acquired by|formerly known as|rebranded|redirected to)\b/i.test(description) || row.text !== [name, description].filter(Boolean).join('\n')) invalid('candidate text/identity conflict')
  if (employer.name !== name || employerWebsite(employer.url) !== website) invalid('raw employer binding')
  const restored = structuredClone(row) as DiscoveryCandidate
  if (p.mode === 'listed_hint') {
    if (route.kind !== 'jobs') invalid('listing outside supported route')
    const listing = record(p.listing, 'listing'), binding = listingBinding(raw, website, String(row.sourceUrl), route)
    const published = runtimeDate(row.publishedAt), declared = sourceDate(raw.datePosted), expiry = raw.validThrough == null ? null : sourceDate(raw.validThrough)
    if (!binding || !published || !declared || published.getTime() !== declared.getTime() || published > observation ||
      (raw.validThrough != null && (!expiry || expiry < observation)) || (!expiry && observation.getTime() - published.getTime() > 90 * 86400000)) invalid('listing date or route binding')
    if (listing.title !== raw.title || listing.url !== binding.roleUrl || listing.applicationUrl !== binding.applicationUrl ||
      sourceDate(listing.publishedAt, true)?.getTime() !== published.getTime() ||
      observed(listing.observedAt, now, 'listing observation').getTime() !== observation.getTime() ||
      listing.currentVerification !== 'external_listing_only_employer_verification_required') invalid('listing provenance binding')
    if (listing.validThrough !== undefined && listing.validThrough !== (expiry?.toISOString() ?? null)) invalid('listing expiry binding')
    restored.publishedAt = published
  } else {
    if (p.mode !== 'company_seed' || row.publishedAt !== null || p.listing !== null) invalid('company seed dates/mode')
    restored.publishedAt = null
  }
  if (row.contactEmails !== undefined) stringList(row.contactEmails, 'candidate contact emails')
  if (row.funding !== undefined || row.investor !== undefined) invalid('public snapshot funding/provider fields')
  return restored
}
/** Cursor v1 is retained. Both runtime Dates and original PostgreSQL JSON ISO strings decode to Dates.
 * No rewriting/hash-changing promotion of legacy raw records or observation timestamps. */
export function decodePageCursor(value: unknown, route: ExpandedRoute, now: Date): PageCursor {
  const raw = record(value, 'cursor')
  if (raw.version !== 1 || typeof raw.scopeDone !== 'boolean') invalid('cursor version/finished state')
  const pages = stringList(raw.pages, 'pages').map((p) => routeUrl(p, route, 'page URL'))
  const processed = stringList(raw.processed, 'processed'), hashes = record(raw.pageHashes, 'page hashes')
  const entries = list(raw.unresolved, 'unresolved').map((v) => unresolved(v, route)), limitations = stringList(raw.limitations, 'limitations')
  if (pages.length > 6 || new Set(pages).size !== pages.length || new Set(processed).size !== processed.length) invalid('page/progress uniqueness/bounds')
  for (const [url, hash] of Object.entries(hashes)) {
    routeUrl(url, route, 'hash URL')
    if (!pages.includes(url) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) invalid('page/hash relationship')
  }
  for (const key of processed) {
    if (key.startsWith('detail:')) { if (!pages.includes(routeUrl(key.slice(7), route, 'processed detail URL'))) invalid('detail progress relationship') }
    else if (!/^[a-f0-9]{64}$/.test(key)) invalid('processed candidate hash')
  }
  if (pages.some((p) => !Object.hasOwn(hashes, p) && !processed.includes(`detail:${p}`))) invalid('page without capture/progress')
  const next = raw.next === null ? null : routeUrl(raw.next, route, 'next URL')
  let snapshot: PageCursor['snapshot']
  if (raw.snapshot !== undefined) {
    const s = record(raw.snapshot, 'snapshot'), url = routeUrl(s.url, route, 'snapshot URL'), time = observed(s.observedAt, now, 'snapshot observedAt')
    const p = record(s.parsed, 'parsed snapshot')
    if (!pages.includes(url) || !Object.hasOwn(hashes, url) || next !== url || raw.scopeDone) invalid('snapshot/page/next relationship')
    const candidates = list(p.candidates, 'snapshot candidates').map((v) => candidate(v, route, time, now))
    const unresolvedEntries = list(p.unresolved, 'snapshot unresolved').map((v) => unresolved(v, route))
    const keys = candidates.map(candidateKey)
    if (Object.keys(hashes).length === 1 && processed.some((key) => !key.startsWith('detail:') && !keys.includes(key))) invalid('processed hash absent from captured candidates')
    if (candidates.length > 500 || new Set(keys).size !== keys.length || new Set(candidates.map((c) => c.externalId)).size !== candidates.length) invalid('snapshot candidate uniqueness/bounds')
    const parsed: ParsedPage = { candidates, unresolved: unresolvedEntries, next: p.next === null ? null : routeUrl(p.next, route, 'snapshot next'),
      limitations: stringList(p.limitations, 'snapshot limitations'), representation: text(p.representation, 'snapshot representation') }
    if (parsed.representation !== 'public-semantic-or-jsonld@1') invalid('snapshot representation version')
    snapshot = { url, observedAt: time.toISOString(), parsed }
  }
  if (raw.scopeDone ? next !== null || snapshot !== undefined : next === null) invalid('finished/pending contradiction')
  return { version: 1, pages, processed, pageHashes: hashes as Record<string, string>, unresolved: entries, limitations, next, scopeDone: raw.scopeDone,
    ...(snapshot ? { snapshot } : {}) }
}
