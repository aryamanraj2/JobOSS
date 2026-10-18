import { randomUUID } from 'node:crypto'
import { sourceDate } from './dates.js'
import { isStandaloneDatabaseClient } from '../../../core/joboss/database-scope.js'
import type { Prisma } from '../../../../generated/prisma/client.js'
import type { Db } from '../../../core/audit/audit-log.js'
import type { CompanySeed, GatedFetcher } from '../../../core/interfaces/providers.js'
import { contentHashOf } from '../../../core/evidence/content-hash.js'
import { canonicalizeDomain } from '../../domain/canonicalize.js'
import { YcOssSeedProvider, batchYear } from '../../yc/yc-oss.js'
import { runSeedIngest } from '../../yc/seed-loader.js'
import { object, DiscoveryPaused, type DiscoveryCandidate } from '../common.js'
import { StartupDbProvider, initialStartupDbCursor, sanitizeStartupDbCursor, sanitizeStartupDbCoverage, type StartupDbCursor } from '../startupdb.js'
import { HnHiringProvider, initialHnCursor, type HnCursor } from '../hn.js'
import { assessOutreachCompany } from '../../../intel/outreach/assess.js'
import type { FundingDatePrecision } from '../../../core/joboss/contracts.js'
import type { PrepareDiscoveryOptions, DiscoverySummary, SourceSummary } from '../prepare.js'
import { EXPANDED_ROUTES, expandedManifest, expandedManifestHash, routeRunnable, type ExpandedRoute } from './registry.js'
import { boundedSourceGate } from './page.js'
import { employerWebsite } from './parsers.js'
import { discoverPublic, restoredPageCursor } from './adapter.js'
import { validateCommittedProgress } from './snapshot.js'

type Store = (db: Db, gate: GatedFetcher, c: DiscoveryCandidate, now: Date) => Promise<string>
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
/** Match frozen YC content before selecting replay raw/time. Original v1 records need no new metadata. */
function frozenYcReplay(candidate: DiscoveryCandidate, records: unknown[], routeId: string): DiscoveryCandidate {
  const prior = records.map(object).filter((r) => r.route === routeId && r.externalId === candidate.externalId)
  if (!prior.length) return candidate
  // An already inconsistent historical scope needs inspection, never destructive deduplication.
  if (prior.length !== 1) throw new Error('Inconsistent frozen YC source records; inspect this exact batch')
  const row = prior[0]!, raw = object(row.raw)
  const identity = (value: Record<string, unknown>) => {
    const stableRaw = { ...object(value.raw) }
    delete stableRaw.sourceObservedAt // Only X capture time, never publisher content, is volatile here.
    return contentHashOf({ externalId: value.externalId, companyName: value.companyName, website: value.website,
      source: value.source, sourceUrl: value.sourceUrl, text: value.text, publishedAt: value.publishedAt, raw: stableRaw, provenance: value.provenance })
  }
  if (identity(row) !== identity({ ...candidate, publishedAt: candidate.publishedAt?.toISOString() ?? null }) ||
    row.textHash !== contentHashOf(candidate.text) || row.observedAt !== raw.sourceObservedAt ||
    row.key !== contentHashOf({ route: routeId, externalId: row.externalId, raw, provenance: row.provenance })) {
    throw new Error('Inconsistent frozen YC source content; inspect this exact batch')
  }
  return { ...candidate, raw }
}
async function atomic<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  if (!isStandaloneDatabaseClient(db)) throw new Error('Expanded discovery requires a standalone database client')
  return db.$transaction(work, { timeout: 30_000 })
}

/** Separate versioned branch: old three-row batches cannot be broadened on resume. Caller serializes a batch. */
export async function prepareExpandedDiscovery(db: Db, gate: GatedFetcher, opts: PrepareDiscoveryOptions, store: Store): Promise<DiscoverySummary> {
  if (!isStandaloneDatabaseClient(db)) throw new Error('Expanded discovery requires a standalone database client; caller-owned transactions are unsupported')
  const now = opts.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid discovery observation time')
  if (opts.resume && !opts.runId) throw new Error('Expanded resume requires an explicit manifest batchId; no latest unrelated run')
  const batchId = opts.runId ?? randomUUID(), manifest = expandedManifest(), manifestHash = expandedManifestHash()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(batchId)) throw new Error('Invalid discovery batchId')
  const existing = await db.discoveryRun.findMany({ where: { coverage: { path: ['batchId'], equals: batchId } } })
  if (opts.resume) {
    if (existing.length !== manifest.routes.length || new Set(existing.map((r) => r.source)).size !== manifest.routes.length ||
      existing.some((r) => !manifest.routes.some((route) => route.id === r.source) || object(r.coverage).manifestHash !== manifestHash ||
        contentHashOf(object(r.coverage).manifest) !== manifestHash || object(r.coverage).mode !== 'expanded-v1') ||
      new Set(existing.map((r) => object(r.coverage).scopeNow)).size !== 1) throw new Error('Unknown, mixed, missing or tampered expanded manifest scope; no resume performed')
  } else if (existing.length) throw new Error('Discovery batchId already exists; use resume')
  let runs = existing
  if (!opts.resume) try {
    runs = await atomic(db, (tx) => Promise.all(manifest.routes.map((route) => tx.discoveryRun.create({ data: {
    source: route.id, status: 'running', startedAt: now, coverage: json({ batchId, mode: 'expanded-v1', manifest, manifestHash,
      scopeNow: now.toISOString(), route: route.id, exhaustive: false, companyIds: [], records: [] }),
  } }))))
  } catch (error) {
    throw new Error(`Expanded manifest creation failed or acknowledgement is unknown for batch ${batchId}; inspect/resume this exact batch`, { cause: error })
  }
  const sources: SourceSummary[] = [], unionThisInvocation = new Set<string>()
  for (const route of EXPANDED_ROUTES) {
    const run = runs.find((r) => r.source === route.id)!
    let cursor = object(run.cursor), coverage = object(run.coverage), status = run.status
    if (route.kind === 'startupdb') { cursor = sanitizeStartupDbCursor(cursor); coverage = sanitizeStartupDbCoverage(coverage) }
    const scopeNow = sourceDate(coverage.scopeNow, true)
    if (!scopeNow || scopeNow > now) throw new Error('Invalid expanded scope time')
    const initialIds = new Set([...strings(coverage.companyIds), ...(Array.isArray(coverage.records) ? coverage.records.map((r) => object(r).companyId).filter((id): id is string => typeof id === 'string') : [])])
    let ids = new Set(initialIds)
    const errors = strings(run.errors).slice(-49)
    let emitted = 0
    const bounded = boundedSourceGate(gate, route, opts.delayMs ?? 5_000)
    // Durable progress is authoritative, including an identity commit whose acknowledgement was lost.
    const reconcile = async (includeCursor = false) => {
      const durable = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })
      const saved = route.kind === 'startupdb' ? sanitizeStartupDbCoverage(object(durable.coverage)) : object(durable.coverage)
      if (!Array.isArray(saved.records) || !Array.isArray(saved.companyIds) || saved.companyIds.some((id) => typeof id !== 'string') ||
        (saved.pendingFollowups !== undefined && !Array.isArray(saved.pendingFollowups))) throw new Error('Cannot reconcile invalid durable discovery progress')
      const recordIds = saved.records.map((r) => object(r).companyId)
      if (recordIds.some((id) => typeof id !== 'string')) throw new Error('Cannot reconcile invalid relationship identity')
      ids = new Set([...saved.companyIds as string[], ...recordIds as string[]])
      for (const id of ids) if (!initialIds.has(id)) unionThisInvocation.add(id)
      coverage = { ...coverage, records: saved.records, companyIds: [...ids], pendingFollowups: saved.pendingFollowups ?? [] }
      if (includeCursor) cursor = route.kind === 'startupdb' ? sanitizeStartupDbCursor(structuredClone(object(durable.cursor))) : structuredClone(object(durable.cursor))
    }
    const checkpoint = async (next: object) => {
      const durable = structuredClone(next)
      await reconcile()
      await db.discoveryRun.update({ where: { id: run.id }, data: { cursor: json(durable), coverage: json(coverage), counts: { discovered: ids.size }, status: 'running' } })
      cursor = durable as Record<string, unknown>
    }
    const handle = async (candidate: DiscoveryCandidate, seed?: CompanySeed) => {
      const records = Array.isArray(coverage.records) ? coverage.records : []
      if (seed) candidate = frozenYcReplay(candidate, records, route.id)
      const canonical = canonicalizeDomain(candidate.website)
      if (!canonical.ok) throw new Error('Unresolved company canonical identity')
      const known = await db.company.findUnique({ where: { canonicalDomain: canonical.domain }, select: { id: true, ycId: true } })
      if ((!known || !unionThisInvocation.has(known.id)) && unionThisInvocation.size >= 2000) throw new DiscoveryPaused(candidate.sourceUrl, 'cross_source_union_cap_2000')
      if (seed && known?.ycId && known.ycId !== seed.externalId) throw new DiscoveryPaused(candidate.sourceUrl, 'conflicting_yc_id_same_domain_needs_review')
      const recordKey = contentHashOf({ route: route.id, externalId: candidate.externalId, raw: candidate.raw, provenance: candidate.provenance ?? null })
      // Commit full relationship record with canonical/evidence writes. Cursor is intentionally a later checkpoint.
      const result = await atomic(db, async (tx) => {
        if (seed) {
          const imported = await runSeedIngest(tx, { async *listCompanies() { yield seed } }, { now: () => now })
          if (imported.sourceFailure || imported.skipped.length) throw new Error('YC seed provenance could not be repaired')
        }
        const priorRecord = records.find((r) => object(r).key === recordKey)
        const sourceTime = sourceDate(object(priorRecord).observedAt ?? candidate.raw.sourceObservedAt ?? now.toISOString(), true)
        if (!sourceTime || sourceTime > now) throw new Error('Invalid source observation time')
        const id = await store(tx, bounded.gate, { ...candidate, funding: [] }, sourceTime)
        const record = { key: recordKey, companyId: id, externalId: candidate.externalId, companyName: candidate.companyName,
          website: candidate.website, sourceUrl: candidate.sourceUrl, source: candidate.source, route: route.id,
          observedAt: sourceTime.toISOString(), publishedAt: candidate.publishedAt?.toISOString() ?? null,
          text: candidate.text, textHash: contentHashOf(candidate.text), raw: candidate.raw, provenance: candidate.provenance ?? { relationship: route.relationship, mode: 'company_seed' },
          primaryFitEvidence: false, employerAtsOwnership: false }
        const committedRaw = object((await tx.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })).coverage)
        const committed = route.kind === 'startupdb' ? sanitizeStartupDbCoverage(committedRaw) : committedRaw
        const committedRecords = Array.isArray(committed.records) ? committed.records : records
        const pending = Array.isArray(committed.pendingFollowups) ? committed.pendingFollowups : []
        const pendingFollowups = candidate.funding?.length && !pending.some((p) => object(p).key === recordKey)
          ? [...pending, { key: recordKey, stage: 'funding', companyId: id, observedAt: sourceTime.toISOString() }] : pending
        const nextCoverage = { ...coverage, pendingFollowups, companyIds: [...new Set([...ids, id])],
          records: committedRecords.some((r) => object(r).key === recordKey) ? committedRecords : [...committedRecords, record] }
        await tx.discoveryRun.update({ where: { id: run.id }, data: { coverage: json(nextCoverage), counts: { discovered: ids.size + (ids.has(id) ? 0 : 1) } } })
        return { id, nextCoverage, identityObservedAt: sourceTime.toISOString() }
      })
      coverage = result.nextCoverage
      const accepted = !ids.has(result.id)
      ids.add(result.id); unionThisInvocation.add(result.id)
      if (accepted) emitted++
      // Funding may fetch primary pages. Run the accepted adapter after budgets/identity commit,
      // and before the cursor advances. Replay repairs an interrupted funding stage too.
      if (candidate.funding?.length) {
        const sourceTime = new Date(result.identityObservedAt)
        await store(db, bounded.gate, candidate, sourceTime)
        await atomic(db, async (tx) => {
          const durableRaw = object((await tx.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })).coverage)
          const durable = route.kind === 'startupdb' ? sanitizeStartupDbCoverage(durableRaw) : durableRaw
          const pending = Array.isArray(durable.pendingFollowups) ? durable.pendingFollowups : []
          await tx.discoveryRun.update({ where: { id: run.id }, data: { coverage: json({ ...durable,
            pendingFollowups: pending.filter((p) => object(p).key !== recordKey) }) } })
        })
        await reconcile()
      }
      return accepted
    }
    // A terminal bounded/unverified scope does not refetch. Its unresolved source row remains visible forever.
    const terminal = coverage.executionFinished === true
    try {
      if (route.kind === 'directory' || route.kind === 'jobs') {
        if (!Object.keys(cursor).length && ids.size) throw new Error('Invalid expanded missing cursor for committed source work')
        const restored = restoredPageCursor(run.cursor, route, now)
        validateCommittedProgress(restored, coverage.records, route)
        // A non-runnable route ends terminal with its untouched initial cursor (zero requests).
        if (terminal && !restored.scopeDone && routeRunnable(route)) throw new Error('Invalid expanded finished scope has pending work')
      }
      if (!terminal) {
        if (!routeRunnable(route)) {
          // Unsupported, unavailable, blocked or stale access: zero requests and a visible gap.
          status = route.access
          coverage = { ...coverage, scopeDone: false, scopeComplete: false, executionFinished: true, reason: route.access, accessReason: route.accessReason }
        } else if (route.kind === 'yc') {
          const result = await discoverBroadYc(bounded.gate, route, cursor, scopeNow, now, opts.limit, handle, checkpoint)
          coverage = { ...coverage, ...result.coverage }
          status = result.complete ? 'completed' : 'partial'
        } else if (route.kind === 'startupdb') {
          const state = Object.keys(cursor).length ? structuredClone(cursor) as StartupDbCursor : initialStartupDbCursor()
          const result = await new StartupDbProvider(bounded.gate, 0).discover(state, opts.limit, handle, checkpoint)
          coverage = { ...coverage, ...result.coverage, scopeDone: result.complete, scopeComplete: result.complete }
          status = result.complete ? 'completed' : 'partial'
        } else if (route.kind === 'hn') {
          const state = Object.keys(cursor).length ? structuredClone(cursor) as HnCursor : initialHnCursor()
          const result = await new HnHiringProvider(bounded.gate, 0).discover(state, opts.limit, handle, checkpoint, scopeNow)
          coverage = { ...coverage, ...result.coverage, scopeDone: result.complete, scopeComplete: result.complete }
          status = result.complete ? 'completed' : 'partial'
        } else {
          const result = await discoverPublic(bounded.gate, route, restoredPageCursor(cursor, route, now), now, handle, checkpoint, opts.limit)
          coverage = { ...coverage, ...result.coverage }
          status = Array.isArray(result.coverage.limitations) && result.coverage.limitations.includes('access_blocked') ? 'access_blocked' : result.coverage.scopeDone ? 'unverified' : 'partial'
        }
        if (status === 'completed' || coverage.scopeDone === true) coverage.executionFinished = true
      }
    } catch (error) {
      await reconcile(true)
      status = 'paused'
      coverage = { ...coverage, scopeComplete: false }
      errors.push(error instanceof Error ? error.message : String(error))
      if (error instanceof DiscoveryPaused) coverage = { ...coverage, reason: error.reason, retryAfterSeconds: error.retryAfterSeconds }
      coverage.executionFinished = false
    }
    await reconcile()
    emitted = [...ids].filter((id) => !initialIds.has(id)).length
    coverage = { ...coverage, sourceAccess: route.access, accessReason: route.accessReason, accessEvidence: route.evidence, remainingRequirement: route.remaining, sourceScope: route.scope,
      sourceExecuted: route.kind !== 'unavailable' && (bounded.stats().requests > 0 || coverage.sourceExecuted === true),
      parser: route.parser, sourceVerifiedLive: false, exhaustive: false, companyIds: [...ids],
      countsThisInvocation: bounded.stats(), emittedThisInvocation: emitted, limit: opts.limit,
      ...(route.kind !== 'jobs' && route.kind !== 'hn' ? { hiringRoute: 'employer_hiring_check_required_no_source_job_feed_claimed' } : {}) }
    await db.discoveryRun.update({ where: { id: run.id }, data: { status, ...(route.kind === 'startupdb' ? { cursor: json(cursor) } : {}), coverage: json(coverage),
      counts: { discovered: ids.size, emittedThisInvocation: emitted }, errors, completedAt: coverage.executionFinished === true ? run.completedAt ?? now : null } })
    sources.push({ source: route.id, runId: run.id, status, discovered: ids.size, counts: { discovered: ids.size, emittedThisInvocation: emitted }, coverage, errors })
  }
  const companyIds = [...new Set(sources.flatMap((s) => strings(s.coverage.companyIds)))]
  const handoff = await expandedHandoff(db, companyIds, sources, now)
  return { batchId, mode: 'expanded-v1', manifestVersion: 'expanded-v1', manifestHash, companyIds, sources, runIds: sources.map((s) => s.runId),
    discovered: companyIds.length, complete: sources.every((s) => s.status === 'completed'), handoff }
}

async function discoverBroadYc(gate: GatedFetcher, route: ExpandedRoute, saved: Record<string, unknown>, scopeNow: Date, now: Date, limit: number,
  handle: (c: DiscoveryCandidate, seed?: CompanySeed) => Promise<boolean>, checkpoint: (c: object) => Promise<void>) {
  const cursor = Object.keys(saved).length ? structuredClone(saved) : { version: 1, processed: [], feedHash: null }
  if (cursor.version !== 1 || !Array.isArray(cursor.processed) || cursor.processed.some((s) => typeof s !== 'string') ||
    (cursor.feedHash !== null && typeof cursor.feedHash !== 'string')) throw new Error('Invalid broad YC cursor')
  const provider = new YcOssSeedProvider(gate, { feed: route.feed ?? 'all', now: () => now })
  const seeds: CompanySeed[] = []
  for await (const seed of provider.listCompanies()) seeds.push(seed)
  const ordered = seeds.map((s) => ({ id: s.externalId, hash: s.source.contentHash })).sort((a, b) => a.id.localeCompare(b.id) || a.hash.localeCompare(b.hash))
  const hash = contentHashOf(ordered)
  if (cursor.feedHash && cursor.feedHash !== hash) throw new DiscoveryPaused(route.url!, 'changed_feed_hash_new_batch_required')
  cursor.feedHash = hash
  // Same record ID with different content is an identity conflict; never choose whichever came first.
  const duplicates = new Set(ordered.filter((s, i) => i && ordered[i - 1]!.id === s.id && ordered[i - 1]!.hash !== s.hash).map((s) => s.id))
  const priority = (s: CompanySeed) => (batchYear(s.batch) >= scopeNow.getUTCFullYear() - 2 ? 4 : 0) +
    (/\b(?:mobile|ios|android|ai|machine learning)\b/i.test([s.oneLiner, s.longDescription, s.tags?.join(' ')].join(' ')) ? 2 : 0) + (s.teamSize && s.teamSize <= 50 ? 1 : 0)
  seeds.sort((a, b) => priority(b) - priority(a) || a.externalId.localeCompare(b.externalId))
  const processed = new Set(cursor.processed as string[]), unresolved = Array.isArray(cursor.unresolved) ? cursor.unresolved : []
  let emitted = 0, scanned = 0
  const save = async () => { cursor.processed = [...processed]; cursor.unresolved = unresolved; await checkpoint(cursor) }
  await save()
  for (const seed of seeds) {
    const key = `${seed.externalId}:${seed.source.contentHash}`
    if (processed.has(key)) continue
    if (emitted >= limit || scanned >= 500) break
    const website = employerWebsite(seed.website)
    if (!website || duplicates.has(seed.externalId)) unresolved.push({ externalId: seed.externalId, name: seed.name,
      website: seed.website, reason: duplicates.has(seed.externalId) ? 'conflicting_source_id' : 'invalid_employer_website' })
    else {
      const accepted = await handle({ source: 'yc', externalId: seed.externalId, companyName: seed.name, website, sourceUrl: seed.source.url,
        text: [seed.name, seed.oneLiner, seed.longDescription, seed.tags?.join(', ')].filter(Boolean).join('\n'), publishedAt: null,
        provenance: { route: route.id, profileUrl: typeof seed.source.record.url === 'string' ? seed.source.record.url : null,
          relationship: route.relationship, mode: 'company_seed', period: seed.batch ?? null, periodPrecision: 'cohort_label_not_funding_date', listing: null },
        raw: { ...seed.source.record, sourceObservedAt: seed.source.observedAt.toISOString(), attribution: 'yc-oss seed index only',
          lifecycleUnverified: seed.lifecycleStatus ?? 'unknown', scopeDisclosures: ['No batch/team/lifecycle exclusion; primary research required'],
          // A hiring feed entry is a listing signal: no role, posting or recipient is created from it.
          ...(route.feed === 'hiring' ? { hiringSignal: 'yc_oss_hiring_feed_listing_signal_not_job_posting' } : {}) } }, seed)
      if (accepted) emitted++
    }
    scanned++; processed.add(key); await save()
  }
  const pendingSeeds = seeds.filter((s) => !processed.has(`${s.externalId}:${s.source.contentHash}`)), pending = pendingSeeds.length
  // Capped remainder stays visible by priority tier (recent 4, mobile/AI 2, small 1); nothing is excluded.
  const pendingByPriority: Record<string, number> = {}
  for (const s of pendingSeeds) pendingByPriority[priority(s)] = (pendingByPriority[priority(s)] ?? 0) + 1
  const scopeDone = pending === 0
  const { records: feedRecordCount, ...feedCoverage } = provider.coverage
  return { complete: scopeDone && !unresolved.length && !provider.coverage.malformed && !provider.coverage.scanCapped,
    coverage: { ...feedCoverage, feedRecordCount, orderedRecordHash: hash, scopeDone, scopeComplete: scopeDone && !unresolved.length && !provider.coverage.malformed && !provider.coverage.scanCapped,
      pendingRecords: pending, pendingByPriority, unresolved, scannedThisInvocation: scanned, priority: 'recent_mobile_ai_small_first_without_exclusion', filter: 'none', exhaustive: false } }
}

/** Pure scoped assessment keeps priority-zero and stopped candidates inspectable; no later assessment state is overwritten. */
export async function expandedHandoff(db: Db, ids: string[], sources: SourceSummary[], now: Date) {
  const companies = await db.company.findMany({ where: { id: { in: ids } }, include: { evidence: true, fundingRecords: true,
    opportunities: true, outreachAssessment: true } })
  const items = companies.map((company) => {
    const assessment = assessOutreachCompany({ ...company, fundingRecords: company.fundingRecords.map((r) => ({ ...r, datePrecision: r.datePrecision as FundingDatePrecision })) }, now)
    const records = sources.flatMap((s) => Array.isArray(s.coverage.records) ? s.coverage.records : []).map(object).filter((r) => r.companyId === company.id)
    const listingHints = records.map((r) => object(r.provenance).listing).filter((l) => l && typeof l === 'object')
    const unresolvedAdvertisedHints = sources.filter((s) => s.source === 'yc:jobs' || s.source === 'seedcamp:talent')
      .flatMap((s) => Array.isArray(s.coverage.unresolved) ? s.coverage.unresolved.map((u) => ({ ...object(u), route: s.source })) : [])
      .filter((entry) => {
        const employer = object(object(object(entry).raw).hiringOrganization), domain = canonicalizeDomain(typeof employer.url === 'string' ? employer.url : null)
        return employer.name === company.displayName && domain.ok && domain.domain === company.canonicalDomain
      })
    const advertised = listingHints.length > 0 || unresolvedAdvertisedHints.length > 0
    const stopped = company.status === 'excluded' || /^(?:stopped|excluded|rejected|closed|paused)$/.test(company.outreachAssessment?.status ?? '')
    return { companyId: company.id, domain: company.canonicalDomain, sourceRoutes: [...new Set(records.map((r) => String(r.route)))],
      assessment, enteredRankingInput: true, requiresPrimaryResearch: !assessment.fit.supported, stopped,
      stage: stopped ? 'stopped' : !assessment.fit.supported ? 'company_research' : advertised ? 'employer_listing_verification' : 'recipients',
      mode: advertised ? 'listed_hint_pending_verification' : 'speculative_candidate', listingHints, unresolvedAdvertisedHints,
      blockers: [...assessment.blockers, ...(stopped ? ['operator_stopped'] : []), ...(advertised ? ['external_listing_not_accepted_ats_support'] : [])],
      taskIds: [], applicationUrlCandidates: listingHints.map((l) => object(l).applicationUrl).filter((u) => typeof u === 'string'),
      advertisedIntentEnforcement: 'advisory_only_E_must_enforce_before_D_no_durable_X_marker',
      recipientDraftHandoff: advertised ? 'E_must_block_unresolved_advertised_intent_before_D' : 'prepareRecipients_then_prepareOutreachDrafts_after_primary_support',
      listedRoleSupportGap: advertised ? 'refreshDiscoveryBoards accepts companyIds and employer careers ownership, not arbitrary aggregator application URLs; retain candidates for employer research and verify exact current role before D.' : null }
  }).sort((a, b) => b.assessment.priority - a.assessment.priority || a.domain.localeCompare(b.domain))
  return { stage: 'discovery', rankCompanyIds: ids, items, taskIds: [],
    checkpoint: { stage: 'discovery', companyIds: ids, completedStages: ['discovery'] },
    limits: { perSourceDistinctPerInvocation: 'limit1-200', crossSourceDistinctPerInvocation: 2000, perPageRecords: 500, publicPagesPerRoute: 6 },
    automaticExecution: 'isolation_blocked', next: 'rankOutreachCompanies; scoped IDs including priority-zero remain in items; verify employer and recipient before D' }
}
