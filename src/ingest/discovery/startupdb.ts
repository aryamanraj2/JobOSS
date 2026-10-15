import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { SourceError } from '../source-error.js'
import { array, object, str, discoveryJson, waitForSource, type CandidateHandler } from './common.js'

export const STARTUPDB_BASE = 'https://startupdb.com/api/v1'
export const INVESTOR_SEEDS = [
  { name: 'Seedcamp', domain: 'seedcamp.com' }, { name: 'Antler', domain: 'antler.co' },
  { name: 'Techstars', domain: 'techstars.com' }, { name: 'Accel', domain: 'accel.com' },
  { name: 'Index Ventures', domain: 'indexventures.com' },
] as const

export type StartupDbCursor = { investorIndex: number; investorSlug?: string; offset: number; entryIndex: number }
export const initialStartupDbCursor = (): StartupDbCursor => ({ investorIndex: 0, offset: 0, entryIndex: 0 })

/** Exact verified identity, not whichever similarly named fund happens to be first. */
export function selectInvestorIdentity(records: unknown[], expected: { name: string; domain: string }): Record<string, unknown> | null {
  const matches = records.map(object).filter((record) => {
    const domain = canonicalizeDomain(str(record.domain) ?? str(record.websiteUrl))
    const websiteDomain = str(record.websiteUrl) ? canonicalizeDomain(str(record.websiteUrl)) : null
    return domain.ok && domain.domain === expected.domain &&
      (!websiteDomain || (websiteDomain.ok && websiteDomain.domain === expected.domain)) &&
      str(record.name)?.toLowerCase() === expected.name.toLowerCase() && str(record.slug) !== null
  })
  return matches.length === 1 ? matches[0]! : null
}

export class StartupDbProvider {
  constructor(private readonly gate: GatedFetcher, private readonly delayMs = 5_000) {}

  async discover(cursor: StartupDbCursor, limit: number, handle: CandidateHandler,
    checkpoint: (cursor: StartupDbCursor) => Promise<void>): Promise<{ count: number; complete: boolean; coverage: Record<string, unknown> }> {
    let count = 0
    const disclosures: unknown[] = []
    while (cursor.investorIndex < INVESTOR_SEEDS.length && count < limit) {
      const investor = INVESTOR_SEEDS[cursor.investorIndex]!
      if (!cursor.investorSlug) {
        const url = `${STARTUPDB_BASE}/investors?q=${encodeURIComponent(investor.name)}&limit=100&offset=0`
        const response = object(await discoveryJson(this.gate, url))
        const identity = selectInvestorIdentity(array(response.data), investor)
        if (!identity) {
          disclosures.push({ investor: investor.name, skipped: 'ambiguous_or_missing_identity' })
          cursor.investorIndex += 1
          cursor.offset = 0
          cursor.entryIndex = 0
          await checkpoint({ ...cursor })
          await waitForSource(this.delayMs)
          continue
        }
        cursor.investorSlug = str(identity.slug)!
        await checkpoint({ ...cursor })
        await waitForSource(this.delayMs)
      }
      const url = `${STARTUPDB_BASE}/investors/${encodeURIComponent(cursor.investorSlug)}/portfolio?limit=25&offset=${cursor.offset}`
      const response = object(await discoveryJson(this.gate, url))
      if (!Array.isArray(response.data)) throw SourceError.unusable(url, 'portfolio has no data array')
      const page = response.data.map(object)
      const pagination = object(response.pagination)
      disclosures.push(response.scopeDisclosures ?? object(response.facets), { investor: investor.name, total: pagination.total ?? null })
      while (cursor.entryIndex < page.length && count < limit) {
        const entry = page[cursor.entryIndex]!
        const website = str(entry.websiteUrl) ?? str(entry.domain)
        const name = str(entry.name)
        const slug = str(entry.slug)
        if (website && name && slug) {
          await waitForSource(this.delayMs)
          const detailUrl = `${STARTUPDB_BASE}/startups/${encodeURIComponent(slug)}`
          const detailResponse = object(await discoveryJson(this.gate, detailUrl))
          const detail = object(detailResponse.data)
          const canonical = canonicalizeDomain(website)
          const detailDomain = canonicalizeDomain(str(detail.websiteUrl) ?? str(detail.domain))
          if (!canonical.ok || !detailDomain.ok || canonical.domain !== detailDomain.domain || detail.slug !== slug) {
            throw SourceError.unusable(detailUrl, 'startup identity/domain mismatch')
          }
          disclosures.push({ company: slug, lastSyncedAt: detail.lastSyncedAt ?? null, scopeDisclosures: detail.scopeDisclosures ?? [] })
          let funding = array(detail.fundingHistory).map(object)
          // Detail carries only a bounded funding preview; read the remainder through its documented activity endpoint.
          const total = typeof detail.fundingHistoryTotal === 'number' ? detail.fundingHistoryTotal : funding.length
          if (total > funding.length) {
            let activityOffset = 0
            funding = []
            while (activityOffset < total && activityOffset < 100) {
              await waitForSource(this.delayMs)
              const activityUrl = `${detailUrl}/activity?kind=funding&limit=25&offset=${activityOffset}`
              const activity = object(await discoveryJson(this.gate, activityUrl))
              if (!Array.isArray(activity.data)) throw SourceError.unusable(activityUrl, 'funding activity has no data array')
              const rounds = activity.data.map(object)
              funding.push(...rounds)
              activityOffset += rounds.length
              if (rounds.length < 25) break
            }
            disclosures.push({ company: slug, fundingReturned: funding.length, fundingTotal: total, fundingPartial: funding.length < total })
          }
          const profile = object(detail.profile)
          const terms = [...array(profile.productTechnologyTags), ...array(profile.sectorTags), ...array(profile.productsAndServices)]
            .map((v) => str(object(v).value)).filter(Boolean).join(', ')
          await handle({ source: 'startupdb', externalId: slug, companyName: name, website,
            sourceUrl: detailUrl, text: [str(profile.shortDescription), terms].filter(Boolean).join('\n'),
            publishedAt: null, raw: { ...detail, license: detailResponse.license ?? response.license,
              attribution: detailResponse.attribution ?? response.attribution, portfolioRelationship: entry.relationship },
            investor, funding })
          count += 1
        }
        cursor.entryIndex += 1
        await checkpoint({ ...cursor })
      }
      if (cursor.entryIndex < page.length) break
      cursor.offset += page.length
      cursor.entryIndex = 0
      const total = typeof pagination.total === 'number' ? pagination.total : null
      if (page.length < 25 || (total !== null && cursor.offset >= total)) {
        cursor.investorIndex += 1
        delete cursor.investorSlug
        cursor.offset = 0
      }
      await checkpoint({ ...cursor })
      await waitForSource(this.delayMs)
    }
    return { count, complete: cursor.investorIndex >= INVESTOR_SEEDS.length,
      coverage: { investorSeeds: INVESTOR_SEEDS.map((s) => s.name), disclosures,
        attribution: 'StartupDB (https://startupdb.com)', license: 'CC BY 4.0', exhaustive: false } }
  }
}
