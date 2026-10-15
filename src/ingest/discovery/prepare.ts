import type { Prisma } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { verbatimExcerpt, writeEvidence, writeCompanySignal } from '../../core/evidence/write-evidence.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { ensureDerivedCompanyHost } from '../host/derived-company-host.js'
import { ensureCompanyResearchBudget } from '../budget/company-budget.js'
import { YcOssSeedProvider, inRecentStartupBand } from '../yc/yc-oss.js'
import { runSeedIngest } from '../yc/seed-loader.js'
import { object, DiscoveryPaused, type DiscoveryCandidate } from './common.js'
import { StartupDbProvider, initialStartupDbCursor, type StartupDbCursor } from './startupdb.js'
import { HnHiringProvider, initialHnCursor, type HnCursor } from './hn.js'
import { storeFundingRound } from './funding.js'
import { detectAtsForCompany, saveDetection } from '../ats/detect.js'
import { atsProviders, ingestPostings } from '../ats/ingest-postings.js'
import type { AtsVendor } from '../ats/signatures.js'

export type PrepareDiscoveryOptions = { limit: number; runId?: string; now?: Date; resume?: boolean; delayMs?: number }
export type SourceSummary = { source: string; runId: string; status: string; discovered: number;
  counts: Record<string, unknown>; coverage: Record<string, unknown>; errors: string[] }
export type DiscoverySummary = { sources: SourceSummary[]; runIds: string[]; discovered: number; complete: boolean }

/** Only the selected cohort is refreshed. Missing ATS never blocks company/person research. */
export async function refreshDiscoveryBoards(db: Db, gate: GatedFetcher, companyIds: string[], opts: { now?: Date; delayMs?: number } = {}) {
  const now = opts.now ?? new Date()
  const results: { companyId: string; status: string; detail?: string; postings?: number; complete?: boolean }[] = []
  const providers = atsProviders(gate)
  for (const company of await db.company.findMany({ where: { id: { in: companyIds } } })) {
    try {
      const detected = await detectAtsForCompany(db, gate, company, { maxPages: 3,
        interPageDelayMs: opts.delayMs ?? 5_000, now: () => now })
      if (!detected.found) { results.push({ companyId: company.id, status: 'no_verified_board', detail: detected.detail }); continue }
      await saveDetection(db, company.id, detected.detection, detected.sourceUrl)
      // An employer can move vendors. Only its newly verified board is queried.
      const provider = providers[detected.detection.vendor as AtsVendor]
      const snapshot = await ingestPostings(db, provider, { id: company.id, atsBoardToken: detected.detection.boardToken }, { now: () => now })
      results.push({ companyId: company.id, status: snapshot.sourceFailure ? 'source_failed' : snapshot.complete ? 'refreshed' : 'partial',
        ...(snapshot.sourceFailure ? { detail: snapshot.sourceFailure.detail } : {}), postings: snapshot.fetched, complete: snapshot.complete ?? false })
    } catch (error) { results.push({ companyId: company.id, status: 'paused', detail: error instanceof Error ? error.message : String(error) }) }
  }
  return results
}

async function storeCandidate(db: Db, gate: GatedFetcher, candidate: DiscoveryCandidate, now: Date): Promise<string> {
  const canonical = canonicalizeDomain(candidate.website)
  if (!canonical.ok) throw new Error(`unusable company domain for ${candidate.companyName}`)
  const company = await db.company.upsert({ where: { canonicalDomain: canonical.domain },
    create: { canonicalDomain: canonical.domain, displayName: candidate.companyName, website: candidate.website,
      countries: [], locations: [], tags: [], status: 'normalized' }, update: {} })
  await ensureDerivedCompanyHost(db, { companyId: company.id, host: canonical.domain, sourceUrl: candidate.sourceUrl })
  await ensureCompanyResearchBudget(db, company.id, company.countries, now)
  const hash = contentHashOf(candidate.raw)
  let evidence = await db.evidence.findFirst({ where: { companyId: company.id, sourceUrl: candidate.sourceUrl, contentHash: hash }, select: { id: true } })
  if (!evidence) {
    evidence = await writeEvidence(db, { companyId: company.id, sourceUrl: candidate.sourceUrl,
      sourceType: 'external_source', excerpt: verbatimExcerpt(candidate.text || JSON.stringify(candidate.raw)),
      contentHash: hash, observedAt: now, publishedAt: candidate.publishedAt, confidence: 0.65, fetchedVia: 'structured_feed' })
    if (candidate.source === 'hn') await writeCompanySignal(db, { companyId: company.id, evidenceId: evidence.id,
      signalType: 'job_posting', observedAt: candidate.publishedAt ?? now, confidence: 0.65 })
  }
  // Preserve the complete hiring invitation and its explicitly published contacts across the 500-character excerpt bound.
  if (candidate.source === 'hn') {
    for (let start = 500; start < candidate.text.length && start < 5_000; start += 500) {
      const excerpt = candidate.text.slice(start, start + 500)
      const excerptHash = contentHashOf({ hash, start })
      if (!await db.evidence.findFirst({ where: { companyId: company.id, sourceUrl: candidate.sourceUrl, contentHash: excerptHash }, select: { id: true } })) {
        await writeEvidence(db, { companyId: company.id, sourceUrl: candidate.sourceUrl, sourceType: 'external_source',
          excerpt, contentHash: excerptHash, observedAt: now, publishedAt: candidate.publishedAt, confidence: 0.65, fetchedVia: 'structured_feed' })
      }
    }
  }
  for (const round of candidate.funding ?? []) await storeFundingRound(db, gate, company, {
    ...round, sourceCoverage: { fundingReturned: candidate.funding?.length ?? 0, fundingTotal: candidate.raw.fundingHistoryTotal ?? null,
      lastSyncedAt: candidate.raw.lastSyncedAt ?? null, scopeDisclosures: candidate.raw.scopeDisclosures ?? [] },
  }, candidate.sourceUrl, now, candidate.investor)
  return company.id
}

/** On-demand discovery, independently checkpointed per source. No contacts, drafts, approvals or sends are written. */
export async function prepareDiscovery(db: Db, gate: GatedFetcher, opts: PrepareDiscoveryOptions): Promise<DiscoverySummary> {
  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 200) throw new Error('discovery limit must be an integer between1 and200')
  const now = opts.now ?? new Date()
  const sources: SourceSummary[] = []
  for (const source of ['yc', 'startupdb', 'hn'] as const) {
    const previous = opts.resume ? await db.discoveryRun.findMany({ where: { source, status: { in: ['partial', 'paused', 'running'] } }, orderBy: { startedAt: 'desc' }, take: 20 }) : []
    const selected = previous.find((run) => !opts.runId || object(run.coverage).batchId === opts.runId)
    const run = selected ?? await db.discoveryRun.create({ data: { source, status: 'running',
      coverage: { batchId: opts.runId ?? null, exhaustive: false } } })
    const priorCounts = object(run.counts)
    let discovered = typeof priorCounts.discovered === 'number' ? priorCounts.discovered : 0
    let cursor = object(run.cursor)
    let coverage = { ...object(run.coverage) }
    const companyIds = new Set(Array.isArray(coverage.companyIds) ? coverage.companyIds.filter((v): v is string => typeof v === 'string') : [])
    let status = 'partial'
    const errors: string[] = []
    const checkpoint = async (next: object) => {
      cursor = { ...next }
      await db.discoveryRun.update({ where: { id: run.id }, data: { cursor: cursor as Prisma.InputJsonValue,
        status: 'running', counts: { discovered }, coverage: coverage as Prisma.InputJsonValue } })
    }
    const handle = async (candidate: DiscoveryCandidate) => {
      const id = await storeCandidate(db, gate, candidate, now)
      companyIds.add(id)
      discovered = companyIds.size
      coverage.companyIds = [...companyIds]
    }
    try {
      if (source === 'yc') {
        const processed = typeof cursor.processed === 'number' ? cursor.processed : 0
        const provider = new YcOssSeedProvider(gate, { feed: 'all', filter: (record) => inRecentStartupBand(record, now) })
        let visited = 0, emitted = 0, truncated = false
        const processedDomains: string[] = []
        const bounded = { async *listCompanies() {
          for await (const seed of provider.listCompanies()) {
            if (visited++ < processed) continue
            if (emitted >= opts.limit) { truncated = true; break }
            emitted += 1
            const canonical = canonicalizeDomain(seed.website)
            if (canonical.ok) processedDomains.push(canonical.domain)
            yield seed
          }
        } }
        const result = await runSeedIngest(db, bounded)
        for (const company of await db.company.findMany({ where: { canonicalDomain: { in: processedDomains } }, select: { id: true } })) companyIds.add(company.id)
        discovered = companyIds.size
        coverage.companyIds = [...companyIds]
        if (result.sourceFailure) throw new Error(result.sourceFailure.detail)
        await checkpoint({ processed: processed + result.seen })
        coverage = { ...coverage, filter: 'active,last_two_years,team1-250_or_unknown',
          malformedSkippedByProvider: 'not counted', limit: opts.limit, partial: truncated, exhaustive: !truncated }
        status = truncated ? 'partial' : 'completed'
      } else if (source === 'startupdb') {
        const state = Object.keys(cursor).length ? cursor as StartupDbCursor : initialStartupDbCursor()
        const result = await new StartupDbProvider(gate, opts.delayMs ?? 5_000).discover(state, opts.limit, handle, checkpoint)
        coverage = { ...coverage, ...result.coverage, partial: !result.complete, limit: opts.limit }
        status = result.complete ? 'completed' : 'partial'
      } else {
        const state = Object.keys(cursor).length ? cursor as HnCursor : initialHnCursor()
        const result = await new HnHiringProvider(gate, opts.delayMs ?? 5_000).discover(state, opts.limit, handle, checkpoint, now)
        coverage = { ...coverage, ...result.coverage, partial: !result.complete, limit: opts.limit }
        status = result.complete ? 'completed' : 'partial'
      }
    } catch (error) {
      status = 'paused'
      errors.push(error instanceof Error ? error.message : String(error))
      coverage = { ...coverage, partial: true, resumeSupported: true,
        ...(error instanceof DiscoveryPaused ? { reason: error.reason, retryAfterSeconds: error.retryAfterSeconds } : {}) }
    }
    await db.discoveryRun.update({ where: { id: run.id }, data: { status, cursor: cursor as Prisma.InputJsonValue,
      counts: { discovered }, coverage: coverage as Prisma.InputJsonValue, errors,
      ...(status === 'completed' ? { completedAt: now } : {}) } })
    sources.push({ source, runId: run.id, status, discovered, counts: { discovered }, coverage, errors })
  }
  return { sources, runIds: sources.map((s) => s.runId), discovered: sources.reduce((n, s) => n + s.discovered, 0),
    complete: sources.every((s) => s.status === 'completed') }
}
