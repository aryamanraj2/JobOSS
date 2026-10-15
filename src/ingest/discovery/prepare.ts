import { randomUUID } from 'node:crypto'
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
export type DiscoverySummary = { batchId: string; companyIds: string[]; sources: SourceSummary[]; runIds: string[]; discovered: number; complete: boolean }

/** Only the selected cohort is refreshed. Missing ATS never blocks company/person research. */
export async function refreshDiscoveryBoards(db: Db, gate: GatedFetcher, companyIds: string[], opts: { now?: Date; delayMs?: number; limit?: number } = {}) {
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || new Set(companyIds).size > limit) throw new Error('Selected board scope exceeds limit1-200')
  const results: BoardRefreshResult[] = []
  const providers = atsProviders(gate)
  for (const company of await db.company.findMany({ where: { id: { in: companyIds } } })) {
    try {
      const detected = await detectAtsForCompany(db, gate, company, { maxPages: 3,
        interPageDelayMs: opts.delayMs ?? 5_000, now: () => now })
      if (!detected.found) { results.push({ companyId: company.id, status: 'no_verified_board', detail: detected.detail, complete: false }); continue }
      await saveDetection(db, company.id, detected.detection, detected.sourceUrl)
      // An employer can move vendors. Only its newly verified board is queried.
      const provider = providers[detected.detection.vendor as AtsVendor]
      const snapshot = await ingestPostings(db, provider, { id: company.id, atsBoardToken: detected.detection.boardToken }, { now: () => now })
      results.push({ companyId: company.id, status: snapshot.sourceFailure ? 'source_failed' : snapshot.complete ? 'refreshed' : 'partial',
        ...(snapshot.sourceFailure ? { detail: snapshot.sourceFailure.detail } : {}), postings: snapshot.fetched, complete: snapshot.complete ?? false })
    } catch (error) { results.push({ companyId: company.id, status: 'paused', complete: false, detail: error instanceof Error ? error.message : String(error) }) }
  }
  for (const id of new Set(companyIds)) if (!results.some((r) => r.companyId === id)) results.push({ companyId: id, status: 'missing_company', complete: false })
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
      lastSyncedAt: candidate.raw.lastSyncedAt ?? null, scopeDisclosures: candidate.raw.scopeDisclosures ?? [],
      license: candidate.raw.license ?? null, licenseScope: candidate.raw.licenseScope ?? null,
      attribution: candidate.raw.attribution ?? null, fundingPartial: candidate.raw.fundingPartial ?? false,
      portfolioRelationship: candidate.raw.portfolioRelationship ?? null },
  }, candidate.sourceUrl, now, candidate.investor)
  return company.id
}

export type BoardRefreshResult = { companyId: string;
  status: 'no_verified_board' | 'source_failed' | 'refreshed' | 'partial' | 'paused' | 'missing_company';
  detail?: string; postings?: number; complete: boolean }

/** Per-source emitted limit; batchId binds all three source scopes. Resume never falls back to unrelated work. */
export async function prepareDiscovery(db: Db, gate: GatedFetcher, opts: PrepareDiscoveryOptions): Promise<DiscoverySummary> {
  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 200) throw new Error('discovery limit must be an integer between1 and200')
  const now = opts.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid discovery observation time')
  let batchId = opts.runId
  if (opts.resume && !batchId) {
    const latest = await db.discoveryRun.findFirst({ orderBy: { startedAt: 'desc' } })
    batchId = typeof object(latest?.coverage).batchId === 'string' ? object(latest?.coverage).batchId as string : undefined
    if (!batchId) throw new Error('No discovery batch to resume; supply its batchId')
  }
  batchId ??= randomUUID()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(batchId)) throw new Error('Invalid discovery batchId')
  const existing = await db.discoveryRun.findMany({ where: { coverage: { path: ['batchId'], equals: batchId } } })
  if (opts.resume ? existing.length !== 3 || new Set(existing.map((r) => r.source)).size !== 3 : existing.length > 0) {
    throw new Error(opts.resume ? 'Unknown/incomplete discovery batchId; no unrelated resume performed' : 'Discovery batchId already exists; use resume')
  }
  const createRuns = (client: Db) => Promise.all(['yc', 'startupdb', 'hn'].map((source) => client.discoveryRun.create({
    data: { source, status: 'running', startedAt: now, coverage: { batchId, scopeNow: now.toISOString(), exhaustive: false } },
  })))
  const runs = opts.resume ? existing : '$transaction' in db ? await db.$transaction(createRuns) : await createRuns(db)
  const sources: SourceSummary[] = []
  for (const source of ['yc', 'startupdb', 'hn'] as const) {
    const run = runs.find((r) => r.source === source)!
    let cursor = object(run.cursor), coverage = { ...object(run.coverage) }
    const scopeNow = new Date(String(coverage.scopeNow))
    if (!Number.isFinite(scopeNow.getTime())) throw new Error('Invalid discovery scope time; new batch required')
    const companyIds = new Set(Array.isArray(coverage.companyIds) ? coverage.companyIds.filter((v): v is string => typeof v === 'string') : [])
    let discovered = companyIds.size, emitted = 0, status = run.status
    const errors: string[] = Array.isArray(run.errors) ? run.errors.filter((e): e is string => typeof e === 'string').slice(-49) : []
    const checkpoint = async (next: object) => {
      const durable = structuredClone(next)
      await db.discoveryRun.update({ where: { id: run.id }, data: { cursor: durable as Prisma.InputJsonValue,
        status: 'running', counts: { discovered }, coverage: coverage as Prisma.InputJsonValue } })
      // Advance the local durable cursor only after storage succeeds. Providers own separate mutable copies.
      cursor = durable as Record<string, unknown>
    }
    const handle = async (candidate: DiscoveryCandidate) => {
      const id = await storeCandidate(db, gate, candidate, now)
      const accepted = !companyIds.has(id)
      companyIds.add(id); discovered = companyIds.size; coverage.companyIds = [...companyIds]
      if (accepted) emitted++
      const disclosures = Array.isArray(coverage.candidateDisclosures) ? coverage.candidateDisclosures : []
      const disclosure = { companyId: id, externalId: candidate.externalId, sourceUrl: candidate.sourceUrl,
        observedAt: now.toISOString(), license: candidate.raw.license ?? null, licenseScope: candidate.raw.licenseScope ?? null,
        attribution: candidate.raw.attribution ?? null, lastSyncedAt: candidate.raw.lastSyncedAt ?? null,
        scopeDisclosures: candidate.raw.scopeDisclosures ?? [], threadId: candidate.raw.threadId ?? null,
        author: candidate.source === 'hn' ? candidate.raw.by ?? null : null,
        capturedTextChars: Math.min(candidate.text.length, candidate.source === 'hn' ? 5000 : 500),
        textTruncated: candidate.text.length > (candidate.source === 'hn' ? 5000 : 500),
        employerIdentity: candidate.raw.employerIdentity ?? 'indexed_exact_identities' }
      coverage.candidateDisclosures = [...disclosures.filter((d) => object(d).externalId !== candidate.externalId), disclosure]
      return accepted
    }
    if (status !== 'completed') try {
      if (source === 'yc') {
        if (Object.keys(cursor).length && (cursor.version !== 2 || !Number.isInteger(cursor.processed) || Number(cursor.processed) < 0 || typeof cursor.feedHash !== 'string')) throw new Error('Invalid YC cursor; new batch required')
        const provider = new YcOssSeedProvider(gate, { feed: 'all', filter: (r) => inRecentStartupBand(r, scopeNow), now: () => now })
        const seeds = []
        for await (const seed of provider.listCompanies()) seeds.push(seed)
        if (cursor.feedHash && cursor.feedHash !== provider.coverage.feedHash) throw new Error('YC feed changed; new batch required, no positional skip')
        // Stable within a feed; founder-led teams first, then 51-250, then unknown sizes.
        const band = (size: number | undefined) => size === undefined ? 2 : size <= 50 ? 0 : 1
        seeds.sort((a, b) => band(a.teamSize) - band(b.teamSize) || a.externalId.localeCompare(b.externalId))
        let processed = Number(cursor.processed ?? 0)
        if (processed > seeds.length) throw new Error('YC cursor outside recorded feed')
        coverage = { ...coverage, ...provider.coverage, cutoffYearInclusive: scopeNow.getUTCFullYear() - 2,
          latestYearInclusive: scopeNow.getUTCFullYear(), cutoffMeaning: 'cohort_year_not_funding_date', filter: 'active,team1-250_or_unknown' }
        await checkpoint({ version: 2, processed, feedHash: provider.coverage.feedHash })
        while (processed < seeds.length && emitted < opts.limit) {
          const seed = seeds[processed]!, domain = canonicalizeDomain(seed.website)
          if (domain.ok) {
            const result = await runSeedIngest(db, { async *listCompanies() { yield seed } }, { now: () => now })
            if (result.sourceFailure) throw new Error(result.sourceFailure.detail)
            const company = await db.company.findUniqueOrThrow({ where: { canonicalDomain: domain.domain }, select: { id: true } })
            if (!companyIds.has(company.id)) emitted++
            companyIds.add(company.id); discovered = companyIds.size; coverage.companyIds = [...companyIds]
          } else coverage.invalidDomains = Number(coverage.invalidDomains ?? 0) + 1
          processed++; await checkpoint({ version: 2, processed, feedHash: provider.coverage.feedHash })
        }
        status = processed === seeds.length && !provider.coverage.malformed && !provider.coverage.scanCapped && !coverage.invalidDomains ? 'completed' : 'partial'
      } else if (source === 'startupdb') {
        const state = Object.keys(cursor).length ? structuredClone(cursor) as StartupDbCursor : initialStartupDbCursor()
        const result = await new StartupDbProvider(gate, opts.delayMs ?? 5_000).discover(state, opts.limit, handle, checkpoint)
        coverage = { ...coverage, ...result.coverage }
        status = result.complete ? 'completed' : 'partial'
      } else {
        const state = Object.keys(cursor).length ? structuredClone(cursor) as HnCursor : initialHnCursor()
        const result = await new HnHiringProvider(gate, opts.delayMs ?? 5_000).discover(state, opts.limit, handle, checkpoint, scopeNow)
        coverage = { ...coverage, ...result.coverage }
        status = result.complete ? 'completed' : 'partial'
      }
    } catch (error) {
      status = 'paused'; errors.push(error instanceof Error ? error.message : String(error))
      coverage = { ...coverage, resumeSupported: true,
        ...(error instanceof DiscoveryPaused ? { reason: error.reason, retryAfterSeconds: error.retryAfterSeconds } : {}) }
    }
    coverage = { ...coverage, ...(Array.isArray(cursor.disclosures) ? { disclosures: cursor.disclosures } : {}), partial: status !== 'completed', limit: opts.limit, emittedThisInvocation: emitted, companyIds: [...companyIds] }
    await db.discoveryRun.update({ where: { id: run.id }, data: { status, cursor: cursor as Prisma.InputJsonValue,
      counts: { discovered }, coverage: coverage as Prisma.InputJsonValue, errors,
      ...(status === 'completed' ? { completedAt: now } : {}) } })
    sources.push({ source, runId: run.id, status, discovered, counts: { discovered, emittedThisInvocation: emitted }, coverage, errors })
  }
  const companyIds = [...new Set(sources.flatMap((s) => s.coverage.companyIds as string[]))]
  return { batchId, companyIds, sources, runIds: sources.map((s) => s.runId), discovered: companyIds.length,
    complete: sources.every((s) => s.status === 'completed') }
}
