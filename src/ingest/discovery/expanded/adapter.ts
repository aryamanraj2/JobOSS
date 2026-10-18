import type { GatedFetcher } from '../../../core/interfaces/providers.js'
import { contentHashOf } from '../../../core/evidence/content-hash.js'
import { object, DiscoveryPaused, type DiscoveryCandidate } from '../common.js'
import { parseExpandedPage, sourceRelationship, type ParsedPage, type UnresolvedEntry } from './parsers.js'
import { publicPage } from './page.js'
import { routeRunnable, type ExpandedRoute } from './registry.js'
import { decodePageCursor, candidateKey } from './snapshot.js'

export type PageCursor = { version: 1; next: string | null; pages: string[]; pageHashes: Record<string, string>;
  processed: string[]; unresolved: UnresolvedEntry[]; limitations: string[];
  snapshot?: { url: string; observedAt: string; parsed: ParsedPage }; scopeDone: boolean }
export const pageCursor = (route: ExpandedRoute): PageCursor => ({ version: 1, next: route.url, pages: [], pageHashes: {}, processed: [], unresolved: [], limitations: [], scopeDone: false })


const DETAIL_REASONS = ['company_website_missing_or_foreign', 'identity_requires_same_source_detail_page']
export async function discoverPublic(gate: GatedFetcher, route: ExpandedRoute, cursor: PageCursor, now: Date,
  handle: (c: DiscoveryCandidate) => Promise<boolean>, save: (cursor: PageCursor) => Promise<void>, limit: number) {
  if (!routeRunnable(route)) throw new DiscoveryPaused(route.url ?? route.id, route.access)
  Object.assign(cursor, decodePageCursor(cursor, route, now))
  const checkpoint = () => save(structuredClone(cursor))
  let emitted = 0, scans = 0
  while (!cursor.scopeDone && emitted < limit && scans < 500) {
    if (!cursor.snapshot) {
      if (!cursor.next) { cursor.scopeDone = true; await checkpoint(); break }
      if (cursor.pages.length >= 6) { cursor.limitations.push('page_cap_6_remaining_cursor'); break }
      if (cursor.pages.includes(cursor.next)) { cursor.limitations.push('pagination_cycle'); break }
      const page = await publicPage(gate, cursor.next, route)
      const hash = contentHashOf(page.html)
      if (Object.values(cursor.pageHashes).includes(hash)) { cursor.limitations.push('repeated_page_content'); break }
      const parsed = parseExpandedPage(page.html, page.url, route, now)
      cursor.pageHashes[cursor.next] = hash
      cursor.pages.push(cursor.next)
      cursor.snapshot = { url: cursor.next, observedAt: now.toISOString(), parsed }
      cursor.unresolved.push(...parsed.unresolved.filter((u) => !cursor.unresolved.some((v) => v.externalId === u.externalId && v.reason === u.reason)))
      cursor.limitations.push(...parsed.limitations)
      // Persist fetched bytes' parsed scope before storing any company. Partial resumes use frozen records.
      await checkpoint()
    }
    const snapshot = cursor.snapshot
    // Public same-source detail pages only, with exact name match; a vault/foreign URL stays unresolved.
    for (const entry of snapshot.parsed.unresolved.filter((r) => r.detailUrl && DETAIL_REASONS.includes(r.reason))) {
      const key = `detail:${entry.detailUrl}`
      if (cursor.processed.includes(key)) continue
      // Detail pages count in the same page/request budget as listing pages.
      if (cursor.pages.length >= 6 || scans >= 500) { cursor.limitations.push('detail_page_or_scan_cap_remaining_entries'); break }
      if (cursor.pages.includes(entry.detailUrl!)) { cursor.limitations.push('detail_cycle'); continue }
      const detail = await publicPage(gate, entry.detailUrl!, route)
      const parsed = parseExpandedPage(detail.html, detail.url, route, now)
      const matches = parsed.candidates.filter((c) => c.companyName === entry.name)
      if (matches.length === 1) {
        const candidate = matches[0]!
        candidate.externalId = entry.externalId
        if (candidate.provenance) candidate.provenance = { ...candidate.provenance, profileUrl: detail.url,
          relationship: sourceRelationship(route, `${String(entry.raw?.description ?? '')} ${candidate.text}`) }
        candidate.raw = { ...candidate.raw, directoryEntry: entry.raw ?? {}, directoryUrl: snapshot.url, directoryObservedAt: snapshot.observedAt, detailRequestedUrl: entry.detailUrl, detailHops: detail.hops, detailUrl: detail.url, detailObservedAt: now.toISOString() }
        snapshot.parsed.candidates.push(candidate)
        cursor.unresolved = cursor.unresolved.filter((r) => r.externalId !== entry.externalId)
      } else cursor.limitations.push(`unresolved_detail_binding:${entry.externalId}`)
      cursor.processed.push(key); cursor.pages.push(entry.detailUrl!); scans++
      await checkpoint()
    }
    for (const c of snapshot.parsed.candidates) {
      const key = candidateKey(c)
      if (cursor.processed.includes(key)) continue
      if (emitted >= limit || scans >= 500) break
      // Cursor advances only after canonical company, evidence and full relationship provenance are durable.
      if (await handle(c)) emitted++
      scans++; cursor.processed.push(key); await checkpoint()
    }
    if (snapshot.parsed.candidates.some((c) => !cursor.processed.includes(candidateKey(c)))) break
    cursor.next = snapshot.parsed.next
    if (!cursor.next) cursor.scopeDone = true
    delete cursor.snapshot
    await checkpoint()
  }
  cursor.limitations = [...new Set(cursor.limitations)]
  return { complete: cursor.scopeDone && !cursor.unresolved.length && !cursor.limitations.length,
    coverage: { scopeDone: cursor.scopeDone, scopeComplete: cursor.scopeDone && !cursor.unresolved.length && !cursor.limitations.length,
      pages: cursor.pages, pageHashes: cursor.pageHashes, unresolved: cursor.unresolved, limitations: cursor.limitations,
      remainingCursor: cursor.next, snapshotPending: !!cursor.snapshot, scannedThisInvocation: scans, emittedThisInvocation: emitted,
      nextAction: cursor.unresolved.length ? 'capture_or_resolve_entry_identity' : cursor.next ? 'resume_frozen_scope' : 'verify_source_representation_and_access' } }
}

/** Validate persisted JSON before an adapter can use it as work, not merely a cast. */
export function restoredPageCursor(value: unknown, route: ExpandedRoute, now = new Date()): PageCursor {
  if (value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(object(value)).length)) return pageCursor(route)
  return decodePageCursor(value, route, now)
}
