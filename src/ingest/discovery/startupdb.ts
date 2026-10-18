import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { SourceError } from '../source-error.js'
import { array, object, str, waitForSource, DiscoveryPaused, type CandidateHandler } from './common.js'

export const STARTUPDB_BASE = 'https://startupdb.com/api/v1'
export const INVESTOR_SEEDS = [
  { name: 'Seedcamp', domain: 'seedcamp.com' }, { name: 'Antler', domain: 'antler.co' },
  { name: 'Techstars', domain: 'techstars.com' }, { name: 'Accel', domain: 'accel.com' },
  { name: 'Index Ventures', domain: 'indexventures.com' },
] as const
export type StartupDbCursor = { version: 2; investorIndex: number; investorSlug?: string; offset: number; entryIndex: number;
  pageHashes: Record<string, string>; omissions: (string | Record<string, unknown>)[]; responseFailures?: Record<string, unknown>[]; disclosures: unknown[]; pending?: { slug: string; detail: Record<string, unknown>;
    entry: Record<string, unknown>; funding: Record<string, unknown>[]; fundingOffset: number; total: number;
    fundingHashes: Record<string, string>; fundingDone: boolean } }
export const initialStartupDbCursor = (): StartupDbCursor => ({ version: 2, investorIndex: 0, offset: 0, entryIndex: 0, pageHashes: {}, omissions: [], disclosures: [] })
export function selectInvestorIdentity(records: unknown[], expected: { name: string; domain: string }): Record<string, unknown> | null {
  const matches = records.map(object).filter((record) => {
    const domain = canonicalizeDomain(str(record.domain) ?? str(record.websiteUrl))
    const website = str(record.websiteUrl) ? canonicalizeDomain(str(record.websiteUrl)) : null
    return domain.ok && domain.domain === expected.domain && (!website || (website.ok && website.domain === expected.domain)) &&
      str(record.name)?.toLowerCase() === expected.name.toLowerCase() && str(record.slug) !== null
  })
  return matches.length === 1 ? matches[0]! : null
}
function pageData(response: Record<string, unknown>, url: string, offset: number): Record<string, unknown>[] {
  const pagination = object(response.pagination)
  if (!Array.isArray(response.data) || response.data.some((r) => !r || typeof r !== 'object' || Array.isArray(r)) ||
    (pagination.offset !== undefined && pagination.offset !== offset)) throw SourceError.unusable(url, 'malformed page or offset drift')
  return response.data.map(object)
}
function pageFinished(response: Record<string, unknown>, length: number, offset: number): boolean {
  const pagination = object(response.pagination)
  const total = pagination.total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < offset + length ||
      (!length && total > offset)) throw new Error('Missing/inconsistent pagination total; coverage undetermined')
  return offset + length >= total
}
/** CC BY 4.0 covers StartupDB facts, not descriptions or third-party text: keep only round facts. */
export function fundingFacts(round: Record<string, unknown>): Record<string, unknown> {
  const amount = object(round.amount)
  return Object.fromEntries(Object.entries({ eventId: round.eventId, kind: round.kind, roundLabel: round.roundLabel, eventDate: round.eventDate,
    dateMeaning: round.dateMeaning, amount: round.amount === undefined ? undefined : { original: amount.original, currency: amount.currency },
    participants: Array.isArray(round.participants) ? round.participants.map((p) => ({ name: object(p).name, role: object(p).role, slug: object(p).slug })) : undefined,
    sourceUrls: round.sourceUrls }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))
}
/** StartupDB reusable storage is an allowlist of dataset facts, including resumed state. */
const pick = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(k => row[k] !== undefined).map(k => [k, row[k]]))
const relationshipFacts = (value: unknown) => value == null ? null : pick(object(value), ['type', 'status', 'investmentYear', 'roundLabel', 'eventId'])
const startupEntryFacts = (value: unknown) => {
  const row = object(value)
  return { ...pick(row, ['name', 'slug', 'domain', 'websiteUrl']), ...(row.relationship === undefined ? {} : { relationship: relationshipFacts(row.relationship) }) }
}
export function startupDbFacts(value: unknown): Record<string, unknown> {
  const row = object(value), profile = object(row.profile)
  return { ...pick(row, ['name', 'slug', 'domain', 'websiteUrl', 'fundingHistoryTotal', 'license', 'licenseScope', 'attribution']),
    ...(row.profile === undefined ? {} : { profile: Object.fromEntries(['productTechnologyTags', 'sectorTags', 'productsAndServices'].filter(k => profile[k] !== undefined)
      .map(k => [k, array(profile[k]).map(v => pick(object(v), ['value']))])) }),
    ...(Array.isArray(row.fundingHistory) ? { fundingHistory: row.fundingHistory.map(object).map(fundingFacts) } : {}) }
}
export function startupDbText(raw: Record<string, unknown>): string {
  const profile = object(raw.profile)
  return [...array(profile.productTechnologyTags), ...array(profile.sectorTags), ...array(profile.productsAndServices)]
    .map(v => str(object(v).value)).filter(Boolean).join(', ')
}
export function sanitizeStartupDbCursor<T extends Record<string, unknown>>(cursor: T): T {
  const pending = object(cursor.pending)
  if (Object.keys(pending).length) {
    Object.assign(cursor, { pending: { ...pick(pending, ['slug', 'fundingOffset', 'total', 'fundingHashes', 'fundingDone']), detail: startupDbFacts(pending.detail),
      entry: startupEntryFacts(pending.entry),
      funding: array(pending.funding).map(object).map(fundingFacts) } })
  }
  return cursor
}
/** Sanitizes working relationship records too; historical C is never run or rewritten by SX1C. */
export function sanitizeStartupDbCoverage(coverage: Record<string, unknown>): Record<string, unknown> {
  const keys = new Map<string, string>()
  const records = array(coverage.records).map(value => {
    const record = object(value), raw = object(record.raw)
    const safe = { ...startupDbFacts(raw), identitySourceFields: pick(object(raw.identitySourceFields), ['name', 'slug', 'websiteUrl', 'domain']),
      fundingPartial: raw.fundingPartial === true, portfolioRelationship: relationshipFacts(raw.portfolioRelationship),
      verifiedInvestorIdentity: pick(object(raw.verifiedInvestorIdentity), ['name', 'domain']), relationshipVerification: 'indexed_exact_identities' }
    const text = startupDbText(safe)
    const key = contentHashOf(raw) === contentHashOf(safe) ? String(record.key) : contentHashOf({ route: 'startupdb', externalId: record.externalId, raw: safe, provenance: null })
    keys.set(String(record.key), key)
    return { ...pick(record, ['companyId', 'externalId', 'companyName', 'website', 'sourceUrl', 'source', 'route', 'observedAt', 'publishedAt', 'primaryFitEvidence', 'employerAtsOwnership']),
      provenance: { relationship: 'indexed_investor_portfolio', mode: 'company_seed' }, key, raw: safe, text, textHash: contentHashOf(text) }
  })
  return { ...coverage, records, ...(Array.isArray(coverage.pendingFollowups) ? { pendingFollowups: coverage.pendingFollowups.map(value => {
    const row = object(value); return { ...row, key: keys.get(String(row.key)) ?? row.key }
  }) } : {}) }
}
/** A UTF-8 prefix, never more than 4 KiB (including multibyte source text). */
function rawExcerpt(raw: string): string {
  return new TextDecoder().decode(Buffer.from(raw).subarray(0, 4096), { stream: true })
}
export class StartupDbProvider {
  constructor(private readonly gate: GatedFetcher, private readonly delayMs = 5_000) {}
  async discover(cursor: StartupDbCursor, limit: number, handle: CandidateHandler,
    checkpoint: (cursor: StartupDbCursor) => Promise<void>): Promise<{ count: number; complete: boolean; coverage: Record<string, unknown> }> {
    if (cursor.version !== 2 || !Number.isInteger(cursor.investorIndex) || cursor.investorIndex < 0 || cursor.investorIndex > 5 ||
      !Number.isInteger(cursor.offset) || cursor.offset < 0 || !Number.isInteger(cursor.entryIndex) || cursor.entryIndex < 0 ||
      !cursor.pageHashes || !Array.isArray(cursor.omissions) || !Array.isArray(cursor.disclosures)) throw new Error('Invalid StartupDB cursor; start a new source run')
    sanitizeStartupDbCursor(cursor)
    let count = 0, requests = 0, scans = 0
    const disclosures = cursor.disclosures
    const save = () => checkpoint(structuredClone(cursor))
    let lastResponse: { pageUrl: string; raw: string; recordHash: string } | undefined
    const get = async (url: string) => {
      if (requests >= 120) throw new DiscoveryPaused(url, 'request_cap_120')
      if (requests++) await waitForSource(this.delayMs)
      const result = await this.gate.fetchText(url, { cost: 1, maxBytes: 16 * 1024 * 1024 })
      if (!result.ok) throw new DiscoveryPaused(url, result.reason)
      const response = result.response
      lastResponse = { pageUrl: url, raw: rawExcerpt(response.body), recordHash: contentHashOf(response.body) }
      if (response.statusCode === 429) {
        const retry = response.headers['retry-after']
        throw new DiscoveryPaused(url, 'source_rate_limited', typeof retry === 'string' && /^\d+$/.test(retry) ? Number(retry) : null)
      }
      if (response.truncated || response.statusCode < 200 || response.statusCode >= 300) throw SourceError.unusable(url, response.truncated ? 'truncated response' : `HTTP ${response.statusCode}`)
      try { return object(JSON.parse(response.body)) } catch { throw SourceError.unusable(url, 'invalid JSON') }
    }
    const bind = (hashes: Record<string, string>, key: string, page: unknown) => {
      const hash = contentHashOf(page)
      if (hashes[key] && hashes[key] !== hash) throw new Error(`Source page changed at ${key}; new run required, no positional skip`)
      // Detect an endpoint ignoring offset and replaying an earlier page.
      if (Object.entries(hashes).some(([k, h]) => k !== key && (!key.startsWith('https:') || k.split('?')[0] === key.split('?')[0]) && h === hash)) throw new Error('Repeated source page; pagination loop')
      hashes[key] = hash
    }
    try {
      while (cursor.investorIndex < INVESTOR_SEEDS.length && count < limit && scans < 500) {
        const investor = INVESTOR_SEEDS[cursor.investorIndex]!
        if (!cursor.investorSlug) {
          const url = `${STARTUPDB_BASE}/investors?q=${encodeURIComponent(investor.name)}&limit=100&offset=0`
          const response = await get(url)
          const records = pageData(response, url, 0)
          if (!pageFinished(response, records.length, 0)) throw new Error('Investor search truncated; identity undetermined')
          const identity = selectInvestorIdentity(records, investor)
          if (!identity) {
            cursor.omissions.push(`${investor.name}: ambiguous_or_missing_identity`)
            cursor.investorIndex++; cursor.offset = 0; cursor.entryIndex = 0
            await save(); continue
          }
          cursor.investorSlug = str(identity.slug)!
          await save()
        }
        const url = `${STARTUPDB_BASE}/investors/${encodeURIComponent(cursor.investorSlug)}/portfolio?limit=25&offset=${cursor.offset}`
        for (const [savedUrl, hash] of Object.entries(cursor.pageHashes)) {
          if (savedUrl === url || savedUrl.split('?')[0] !== url.split('?')[0]) continue
          const prior = await get(savedUrl), offset = Number(new URL(savedUrl).searchParams.get('offset'))
          if (contentHashOf(pageData(prior, savedUrl, offset)) !== hash) throw new Error('Portfolio shifted before cursor; new run required')
        }
        const response = await get(url)
        const page = pageData(response, url, cursor.offset)
        if (page.length > 25) throw new Error('Portfolio page exceeds declared bound')
        const finished = pageFinished(response, page.length, cursor.offset)
        bind(cursor.pageHashes, url, page)
        if (cursor.entryIndex > page.length) throw new Error('Invalid portfolio entry cursor')
        if (!disclosures.some((d) => object(d).url === url)) disclosures.push({ url, investor: investor.name, scopeDisclosures: response.scopeDisclosures ?? [], pagination: response.pagination,
          license: response.license ?? null, licenseScope: response.licenseScope ?? null, attribution: response.attribution ?? null })
        await save()
        while (cursor.entryIndex < page.length && count < limit && scans < 500) {
          const entry = page[cursor.entryIndex]!
          const website = str(entry.websiteUrl) ?? str(entry.domain), name = str(entry.name), slug = str(entry.slug)
          // A present but unusable (uncanonicalizable or denied) website is omitted like a missing one, not a source pause.
          const usable = website ? canonicalizeDomain(website) : null
          if (!website || !name || !slug || !usable?.ok) {
            cursor.omissions.push({ pageUrl: url, index: cursor.offset + cursor.entryIndex,
              reason: !website || !name || !slug ? 'portfolio identity missing' : `portfolio website unusable: ${usable && !usable.ok ? usable.reason : 'unknown'}`,
              storagePurpose: 'bounded_forensic_source_excerpt_not_reusable_facts', raw: rawExcerpt(JSON.stringify(entry)), recordHash: contentHashOf(entry) })
            scans++; cursor.entryIndex++; await save(); continue
          }
          const detailUrl = `${STARTUPDB_BASE}/startups/${encodeURIComponent(slug)}`
          if (!cursor.pending) {
            const detailResponse = await get(detailUrl), detail = object(detailResponse.data)
            const domain = canonicalizeDomain(website), entryDomain = canonicalizeDomain(str(entry.domain) ?? website), detailDomain = canonicalizeDomain(str(detail.websiteUrl) ?? str(detail.domain))
            const explicitDomain = str(detail.domain) ? canonicalizeDomain(str(detail.domain)) : detailDomain
            if (!domain.ok || !entryDomain.ok || !detailDomain.ok || !explicitDomain.ok || domain.domain !== entryDomain.domain || domain.domain !== detailDomain.domain ||
              domain.domain !== explicitDomain.domain || detail.slug !== slug || str(detail.name)?.toLowerCase() !== name.toLowerCase()) {
              throw SourceError.unusable(detailUrl, 'startup name/slug/domain mismatch')
            }
            if (!Array.isArray(detail.fundingHistory) || typeof detail.fundingHistoryTotal !== 'number' ||
              !Number.isSafeInteger(detail.fundingHistoryTotal) || detail.fundingHistoryTotal < detail.fundingHistory.length) {
              throw SourceError.unusable(detailUrl, 'funding preview/total omitted or malformed')
            }
            cursor.pending = { slug, detail: { ...startupDbFacts(detail), license: detailResponse.license ?? response.license ?? null,
              licenseScope: detailResponse.licenseScope ?? response.licenseScope ?? null,
              attribution: detailResponse.attribution ?? response.attribution ?? null }, entry: startupEntryFacts(entry),
              funding: detail.fundingHistoryTotal > detail.fundingHistory.length ? [] : detail.fundingHistory.map(object).map(fundingFacts),
              fundingOffset: 0, total: detail.fundingHistoryTotal, fundingHashes: {}, fundingDone: detail.fundingHistoryTotal === detail.fundingHistory.length }
            await save()
          }
          const pending = cursor.pending
          if (pending.slug !== slug) throw new Error('Pending company does not match portfolio cursor')
          // Replay saved funding pages to detect a shifting positional feed before extending it.
          for (const [offset, hash] of Object.entries(pending.fundingHashes)) {
            const activityUrl = `${detailUrl}/activity?kind=funding&limit=25&offset=${offset}`
            const activity = await get(activityUrl), rounds = pageData(activity, activityUrl, Number(offset))
            if (contentHashOf(rounds) !== hash) throw new Error('Funding activity changed; new run required')
          }
          while (!pending.fundingDone && pending.fundingOffset < 100) {
            const activityUrl = `${detailUrl}/activity?kind=funding&limit=25&offset=${pending.fundingOffset}`
            const activity = await get(activityUrl), rounds = pageData(activity, activityUrl, pending.fundingOffset)
            if (rounds.length > 25 || object(activity.pagination).total !== pending.total) throw new Error('Funding page size/total drift')
            const done = pageFinished(activity, rounds.length, pending.fundingOffset)
            bind(pending.fundingHashes, String(pending.fundingOffset), rounds)
            pending.funding.push(...rounds.map(fundingFacts)); pending.fundingOffset += rounds.length; pending.fundingDone = done
            await save()
          }
          if (!pending.fundingDone) cursor.omissions.push(`${slug}: funding capped at100; total${pending.total}`)
          const detail = pending.detail
          const accepted = await handle({ source: 'startupdb', externalId: slug, companyName: name, website,
            sourceUrl: detailUrl, text: startupDbText(detail), publishedAt: null,
            raw: { ...detail, identitySourceFields: { name: entry.name, slug: entry.slug, websiteUrl: entry.websiteUrl ?? null, domain: entry.domain ?? null }, fundingPartial: !pending.fundingDone, portfolioRelationship: relationshipFacts(entry.relationship),
              verifiedInvestorIdentity: investor, relationshipVerification: 'indexed_exact_identities' },
            investor, funding: [...new Map(pending.funding.map((r) => [str(r.eventId) ?? contentHashOf(r), r])).values()] })
          if (accepted !== false) count++
          scans++; cursor.entryIndex++; delete cursor.pending
          await save()
        }
        if (cursor.entryIndex < page.length) break
        cursor.offset += page.length; cursor.entryIndex = 0
        if (finished) { cursor.investorIndex++; delete cursor.investorSlug; cursor.offset = 0 }
        await save()
      }
    } catch (error) {
      if (!(error instanceof DiscoveryPaused) && lastResponse) {
        cursor.responseFailures ??= []
        cursor.responseFailures.push({ ...lastResponse, storagePurpose: 'bounded_forensic_source_excerpt_not_reusable_facts', reason: error instanceof Error ? error.message : String(error) })
        await save()
      }
      throw error
    }
    return { count, complete: cursor.investorIndex === INVESTOR_SEEDS.length && cursor.omissions.length === 0,
      coverage: { investorSeeds: INVESTOR_SEEDS.map((s) => s.name), disclosures, omissions: cursor.omissions, responseFailures: cursor.responseFailures ?? [],
        requests, requestCap: 120, scanned: scans, scanCap: 500, fundingRoundCap: 100,
        attribution: 'StartupDB (https://startupdb.com)', license: 'CC BY 4.0', exhaustive: false,
        rateLimit: '120/min per IP enforced at the gate (startupdb.* API contract minSpacingMs 500) plus provider delay', fundingStorage: 'round facts only (CC BY 4.0); descriptions/third-party text excluded',
        robotsConflictDisclosure: 'robots.txt Disallow: /api/v1/ conflicts with the documented keyless API; exact documented endpoints only (existing orchestrator decision)' } }
  }
}
