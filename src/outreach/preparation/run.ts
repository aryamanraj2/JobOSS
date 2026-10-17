import { randomUUID } from 'node:crypto'
import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { expandedManifestHash } from '../../ingest/discovery/expanded/registry.js'
import { prepareDiscovery, refreshExpandedListingBoards } from '../../ingest/discovery/prepare.js'
import { currentCompanyContext } from '../review/context.js'
import { researchCompanyPage } from '../../intel/research/page-research.js'
import { prepareRecipients } from '../contacts/prepare.js'
import { prepareOutreachDrafts } from '../draft/prepare.js'
import { evaluateOutreachReadiness } from '../review/readiness.js'
import { HandoffLlmGateway } from '../../core/llm/handoff-gateway.js'
import { findTaskSchema, type ResearchUrlsResponse } from '../../core/llm/tasks.js'
import { runPendingTasks } from '../../core/llm/subscription-runner.js'
import { ownRun } from './ownership.js'
import { windowedDiscoveryDb, transientPause } from './discovery-window.js'
import { sharedTaskIds } from './task-sharing.js'
import { DiscoveryPaused } from '../../ingest/discovery/common.js'
import { fencedDiscoveryDb } from './discovery-fence.js'
import { exactListedHint } from './listed.js'
import { roleFingerprint } from './selection.js'
import { CHECKPOINT_VERSION, Options, decodeCheckpoint, discoveryOf, scopeHash, sourceEnded, json, type PreparationOptions, type PreparationCheckpoint, type PreparationEntry } from './contracts.js'
import { preparationStop, guardedCompanyGate } from './stops.js'

export type PreparationRequest = { runId?: string; resume?: boolean; options?: Partial<PreparationOptions> }
export type PreparationResult = { runId: string; status: string; reviewUrl: string; checkpoint?: PreparationCheckpoint; detail?: string }
export function validateRequest(request: PreparationRequest) {
  if (request.runId !== undefined && !/^[A-Za-z0-9_-]{1,90}$/.test(request.runId)) throw new Error('Invalid preparation run-id')
  if (request.resume && !request.runId) throw new Error('Resume requires exact --run-id')
  if (request.resume) { Options.partial().parse(request.options ?? {}); return null }
  return Options.parse(request.options ?? {})
}
const unique = (ids: string[]) => [...new Set(ids)]
/** Production coordinator. Dependencies are the ordinary standalone DB and gated
 * fetcher, never an executor or an injected alternate implementation of stages. */
export async function prepareOutreach(db: Db, gate: GatedFetcher, connectionString: string, request: PreparationRequest,
  clock: { now?: () => Date; delayMs?: number } = {}): Promise<PreparationResult> {
  const initialOptions = validateRequest(request)
  if (!isStandaloneDatabaseClient(db)) throw new Error('Preparation requires standalone database client')
  const id = request.runId ?? randomUUID(), now = () => clock.now?.() ?? new Date(), reviewUrl = `/preparation/${id}`
  const ownership = await ownRun(db, connectionString, id)
  if (!ownership) return { runId: id, status: 'busy', reviewUrl, detail: 'This preparation run is active; retry later.' }
  let c: PreparationCheckpoint | undefined
  const token = randomUUID()
  try {
    let row = await db.preparationRun.findUnique({ where: { id } })
    if (request.resume) {
      if (!row) throw new Error('Unknown preparation run; no latest-run fallback')
      c = decodeCheckpoint(row.checkpoint, id)
      if (row.limit !== c.options.limit || row.provider !== c.options.provider) throw new Error('Preparation row/options mismatch')
      for (const [k,v] of Object.entries(request.options ?? {})) if (c.options[k as keyof PreparationOptions] !== v) throw new Error('Changed frozen preparation options; use original scope')
    } else {
      if (row) throw new Error('Preparation run exists; explicitly resume it')
      const options = initialOptions!
      c = { version: CHECKPOINT_VERSION, runId: id, options, optionsHash: contentHashOf(options), batchId: `prep_${id}`,
        manifestHash: expandedManifestHash(), scopeHash: scopeHash({candidateIds:[],entries:[]}), discovery: null, candidateIds: [], entries: [], errors: [], usage: [], owner: null, status: 'discovery', discoveryFinished: false, discoveryPass: 0, discoveryPending: false }
      try { row = await db.preparationRun.create({ data: { id, status: c.status, limit: options.limit, provider: options.provider, checkpoint: json(c) } }) }
      catch (error) { throw new Error(`Preparation creation acknowledgement unknown; inspect/resume exact run ${id}`, { cause: error }) }
    }
    // Session lock serializes invocations; durable token additionally fences CAS
    // checkpoints and opt-in D mutations after a lost ownership connection.
    if (c.discovery) {
      const summary = discoveryOf(c)
      const sources = await db.discoveryRun.findMany({ where: { id: { in: summary.runIds } } })
      if (sources.length !== summary.sources.length || sources.some(s => {
        const coverage = s.coverage as { batchId?: string; manifestHash?: string; manifest?: unknown }
        return coverage.batchId !== c!.batchId || coverage.manifestHash !== c!.manifestHash || contentHashOf(coverage.manifest) !== c!.manifestHash || !summary.sources.some(row => row.runId === s.id && row.source === s.source)
      })) throw new Error('Foreign/missing durable discovery rows; inspect exact run')
    }
    // Fence the initial claim too: losing the session immediately before this
    // write must not replace a newer invocation's committed checkpoint.
    await ownership.assert()
    const claim = await db.preparationRun.updateMany({ where: { id, checkpoint: { equals: json(row!.checkpoint) } },
      data: { checkpoint: json({ ...c, owner: token }) } })
    if (claim.count !== 1) throw new Error('Preparation ownership claim superseded; resume exact run')
    c.owner = token
    const assertOwner = async () => {
      await ownership.assert()
      const current = await db.preparationRun.findUnique({ where: { id }, select: { checkpoint: true } })
      if ((current?.checkpoint as { owner?: string })?.owner !== token) throw new Error('Preparation ownership superseded; resume exact run')
    }
    const save = async () => {
      await assertOwner()
      c!.scopeHash = scopeHash(c!)
      const changed = await db.preparationRun.updateMany({ where: { id, checkpoint: { path: ['owner'], equals: token } },
        data: { checkpoint: json(c), status: c!.status, cohort: json(c!.entries.filter(e => e.selected).map(e => e.companyId)),
          usage: json(c!.usage), errors: json(c!.errors), completedAt: c!.status === 'review' ? now() : null } })
      if (changed.count !== 1) throw new Error('Preparation checkpoint fenced; inspect exact run')
    }
    const checkpoint = c
    while (!checkpoint.discoveryFinished) {
      if(!checkpoint.discoveryPending){checkpoint.discoveryPass++;checkpoint.discoveryPending=true;await save()}
      const rows = await db.discoveryRun.findMany({ where: { coverage: { path: ['batchId'], equals: checkpoint.batchId } }, select: { id: true } })
      // Same exact pre-recorded batch, even after an unknown creation COMMIT ack.
      const window = await windowedDiscoveryDb(fencedDiscoveryDb(db,id,token,assertOwner),checkpoint.batchId,checkpoint.discoveryPass,checkpoint.options.discoveryPasses,now())
      const discoveryGate = guardedCompanyGate(gate, async companyId => {
        await assertOwner()
        if(window.atBound())throw new DiscoveryPaused(checkpoint.batchId,'candidate_bound_reached')
        if (companyId) {
          const stop = await preparationStop(db,companyId,checkpoint.options.campaignCycle)
          if (stop) throw new Error(stop)
        }
      })
      const summary = await window.restore(await prepareDiscovery(window.db, discoveryGate, { mode: 'expanded-v1', runId: checkpoint.batchId,
        resume: rows.length > 0, limit: checkpoint.options.discoveryLimit, now: now(), delayMs: clock.delayMs ?? 5200 }))
      checkpoint.discoveryPending=false
      checkpoint.discovery = json(summary); checkpoint.candidateIds = summary.companyIds
      checkpoint.discoveryFinished = summary.sources.every(sourceEnded)
      // No cohort, company research, recipients, tasks or drafts until every source's
      // bounded execution ended; resume continues this exact batch.
      if (!checkpoint.discoveryFinished) checkpoint.status = 'discovery'
      await save()
      if (!checkpoint.discoveryFinished && summary.sources.some(transientPause)) return { runId: id, status: checkpoint.status, reviewUrl, checkpoint }
    }
    const discovery = discoveryOf(checkpoint)
    // Rank once over the complete bounded identifiable set.
    if (!checkpoint.entries.length) {
      const items = discovery.handoff!.items
      const entries: PreparationEntry[] = []
      for (const companyId of checkpoint.candidateIds) {
        const context = await currentCompanyContext(db, companyId, now()), item = items.find(i => i.companyId === companyId)
        if (!context || !item) throw new Error('Discovery candidate no longer identifiable')
        const hints = item.listingHints.map(v => {
          const r = v as { title?: string; url?: string; applicationUrl?: string }
          return { title: r.title ?? '', url: r.url ?? '', applicationUrl: r.applicationUrl ?? null }
        })
        const listed = hints.length > 0 || item.unresolvedAdvertisedHints.length > 0
        entries.push({ companyId, name: context.company.displayName, domain: context.company.canonicalDomain, priority: context.assessment.priority,
          selected: false, reason: 'outside_target_cohort', sourceRoutes: item.sourceRoutes, provenance: json([...item.listingHints, ...item.unresolvedAdvertisedHints]), hints,
          unresolved: item.unresolvedAdvertisedHints.length > 0, intent: listed ? 'listed' : 'speculative', opportunityId: null, roleHash: null,
          associationId: null, contactId: null, stage: 'ranked', blockers: [], pages: [], taskIds: [], draftIds: [], refreshAttempted: false, orphanedTaskIds: [], ambiguousTaskIds: [] })
      }
      entries.sort((a,b) => b.priority - a.priority || a.domain.localeCompare(b.domain))
      let selected = 0
      for (const e of entries) {
        const stop = await preparationStop(db, e.companyId, checkpoint.options.campaignCycle)
        if (stop) { e.reason = stop; e.stage = 'blocked'; e.blockers = [stop] }
        else if (e.priority <= 0) { e.reason = 'zero_or_unsupported_priority'; e.stage = 'blocked'; e.blockers = [e.reason] }
        else if (selected < checkpoint.options.limit) { e.selected = true; e.reason = 'canonical_bounded_research_priority'; selected++ }
      }
      checkpoint.entries.push(...entries); checkpoint.status = 'working'; await save()
    }
    for (const e of checkpoint.entries.filter(e => e.selected)) {
      const check = async () => {
        await assertOwner()
        const stop = await preparationStop(db, e.companyId, checkpoint.options.campaignCycle, e.contactId)
        if (stop) throw new Error(stop)
      }
      let activePage: PreparationEntry['pages'][number] | undefined
      const scopedGate = guardedCompanyGate(gate, check, async url => {
        if (activePage && !activePage.urls.includes(url)) { activePage.urls.push(url); await save() }
      })
      const addTasks = (ids: string[]) => { e.taskIds = unique([...e.taskIds,...ids]) }
      const block = (reason: string) => { e.stage = 'blocked'; e.blockers = [reason] }
      // Record every task a stage created before its post-stage stop check. On failure,
      // also capture this company's tasks created in the stage window (a helper may have
      // swallowed the stop and continued) and mark them stop_orphaned: never fulfil them.
      const dbNow = async () => (await db.$queryRaw<{ t: Date }[]>`SELECT clock_timestamp() AS t`)[0]!.t
      const orphan = async (ids: string[], since: Date, stage: 'recipients'|'drafts') => {
        const contacts = await db.contact.findMany({ where: { companyId: e.companyId }, select: { id: true } })
        const scope = stage === 'recipients' ? [
          {kind:'research_urls',subjectType:'RecipientSearch',subjectId:e.companyId},
          ...contacts.map(c=>({kind:'contact_research',subjectType:'ContactResearch',subjectId:{startsWith:`${c.id}:`}}))
        ] : e.draftIds.flatMap(d=>[{kind:'outreach_draft',subjectType:'Draft',subjectId:d},{kind:'draft_support',subjectType:'DraftSupport',subjectId:{startsWith:`${d}:`}}])
        const matched = await db.llmTask.findMany({where:{OR:scope,createdAt:{gte:since}},select:{id:true}})
        const found=unique([...ids,...matched.map(t=>t.id)]),shared=await sharedTaskIds(db,id,found)
        addTasks(found)
        e.ambiguousTaskIds=unique([...e.ambiguousTaskIds,...shared])
        e.orphanedTaskIds=unique([...e.orphanedTaskIds,...found]).filter(t=>!e.ambiguousTaskIds.includes(t))
      }
      const afterStage = async (ids: string[], since: Date, stage: 'recipients'|'drafts') => {
        addTasks(ids)
        try { await check() } catch (error) { await orphan(ids, since, stage); throw error }
      }
      try {
        await check()
        const freshItem = discovery.handoff!.items.find(i => i.companyId === e.companyId)
        if (!freshItem) throw new Error('missing_frozen_candidate_handoff')
        if (contentHashOf([...freshItem.listingHints,...freshItem.unresolvedAdvertisedHints]) !== contentHashOf(e.provenance)) {
          block('new_advertised_input_requires_explicit_reselection'); await save(); continue
        }
        if (e.stage === 'ready' && e.draftIds.length && (await Promise.all(e.draftIds.map(d => evaluateOutreachReadiness(db,d,now())))).every(r => r.ready)) {
          e.blockers = []; await save(); continue
        }
        // Never reinterpret a frozen listed request as speculative, including raw
        // unresolved hints on a separately discovered canonical employer.
        if (e.opportunityId) {
          const ctx = await currentCompanyContext(db, e.companyId, now()), role = ctx?.currentRoles.find(r => r.id === e.opportunityId)
          if (!role || roleFingerprint(role) !== e.roleHash) { block('selected_role_changed'); await save(); continue }
        }
        let context = await currentCompanyContext(db, e.companyId, now())
        if (!context) throw new Error('missing_company')
        const listedHint = e.intent === 'listed' ? exactListedHint(e, context, now()) : null
        if (e.intent === 'listed' && !listedHint) { block('unresolved_or_ambiguous_advertised_intent'); await save(); continue }
        if (listedHint && !e.opportunityId) {
          const roles = context.currentRoles.filter(r=>r.title === listedHint.title && [listedHint.url,listedHint.applicationUrl].includes(r.roleUrl))
          if (roles.length === 1) { e.opportunityId = roles[0]!.id; e.roleHash = roleFingerprint(roles[0]!); await save() }
        }
        // Reconcile a planned capture whose Evidence committed before our checkpoint.
        for (const page of e.pages.filter(p => p.status === 'planned')) {
          const found = await db.evidence.findFirst({ where: { companyId: e.companyId, sourceUrl: { in: page.urls }, sourceType: 'company_page', id: { notIn: page.baselineIds }, observedAt: { gte: new Date(page.observedAt) } }, orderBy: { observedAt: 'desc' } })
          const audit = !found && await db.auditLog.findFirst({ where: { subjectType: 'Company', subjectId: e.companyId, action: 'research.page_fetched', createdAt: { gte: new Date(page.recordedAt) }, OR: page.urls.map(url => ({metadata: {path:['url'],equals:url}})) }, orderBy: {createdAt:'desc'} })
          const unchanged = audit && await db.evidence.findFirst({where:{companyId:e.companyId,sourceType:'company_page',sourceUrl:(audit.metadata as {url:string}).url},orderBy:{observedAt:'desc'}})
          const captured = found || unchanged
          if (captured) { page.status = 'reconciled'; page.evidenceId = captured.id }
          else page.status = 'interrupted_capture' // retry only this exact planned URL below
        }
        const root = `https://${e.domain}/`
        const urls = e.pages.length ? e.pages.filter(p => p.status === 'interrupted_capture').map(p => p.url) : [root]
        const searchSubject = `PrepCompany:${id}:${e.companyId}`
        const search = await db.llmTask.findFirst({ where: { kind: 'research_urls', subjectType: 'PreparationCompany', subjectId: searchSubject }, orderBy: [{ createdAt: 'desc' },{ id: 'desc' }] })
        if (search) {
          addTasks([search.id])
          if (search.status === 'fulfilled') {
            const output = findTaskSchema('research_urls','research_urls@1')!.schema.safeParse(search.output)
            if (!output.success) { block('invalid_research_url_output'); await save(); continue }
            urls.push(...(output.data as ResearchUrlsResponse).urls.map(r => r.url).filter(url => {
              try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === e.domain || u.hostname === `www.${e.domain}`) } catch { return false }
            }))
          }
        }
        if (e.pages.some(p => p.status === 'refused' || p.status === 'injection')) { block('primary_source_refused_or_injection'); await save(); continue }
        for (const url of unique(urls)) {
          await check()
          if (e.pages.some(p => p.url === url && !['interrupted_capture','planned'].includes(p.status))) continue
          if (e.pages.length >= checkpoint.options.primaryPages && !e.pages.some(p => p.url === url)) break
          let page = e.pages.find(p => p.url === url)
          if (!page) {
            const prior = await db.evidence.findMany({where:{companyId:e.companyId,sourceType:'company_page'},select:{id:true},take:2001})
            if (prior.length > 2000) throw new Error('primary_reconciliation_history_bound')
            page = { url, status: 'planned', detail: null, evidenceId: null, observedAt: now().toISOString(), recordedAt: new Date().toISOString(), urls: [url], baselineIds: prior.map(v=>v.id) }; e.pages.push(page)
          }
          else page.status = 'planned'
          e.stage = 'research'; await save()
          activePage = page
          const result = await researchCompanyPage(db, scopedGate, context.company, url, { now: now(), cost: 1, sameHostDelayMs: clock.delayMs ?? 5200 })
          activePage = undefined
          await check()
          page.status = result.kind; page.detail = 'detail' in result ? result.detail : 'patterns' in result ? result.patterns.join(', ') : null; page.evidenceId = 'evidenceId' in result ? result.evidenceId : null
          await save()
          if (result.kind === 'refused' || result.kind === 'injection') break
        }
        await check(); context = await currentCompanyContext(db, e.companyId, now())
        if (!context?.assessment.fit.supported || !context.assessment.priority || e.pages.some(p => ['refused','injection'].includes(p.status))) {
          if (!search && !e.pages.some(p => ['refused','injection'].includes(p.status))) {
            const task = await new HandoffLlmGateway(db).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1', subjectType: 'PreparationCompany', subjectId: searchSubject,
              allowedEvidenceIds: [], allowedApprovedClaimIds: [], input: { company: { id: e.companyId, name: e.name, domain: e.domain }, instructions: 'Suggest public primary product/company URLs only. URL hints are not evidence; normal gated capture is mandatory.' } })
            addTasks([task.taskId])
          }
          block('primary_company_support_missing'); await save(); continue
        }
        if (e.intent === 'listed') {
          const hint = listedHint!
          let roles = context.currentRoles.filter(r => r.title === hint.title && [hint.url,hint.applicationUrl].includes(r.roleUrl))
          if (!roles.length && !e.refreshAttempted && !e.opportunityId) {
            e.refreshAttempted = true; await save()
            await refreshExpandedListingBoards(db, scopedGate, discovery, { companyIds: [e.companyId], limit: 1, now: now(), delayMs: clock.delayMs ?? 5200 })
            await check(); context = await currentCompanyContext(db, e.companyId, now())
            roles = context?.currentRoles.filter(r => r.title === hint.title && [hint.url,hint.applicationUrl].includes(r.roleUrl)) ?? []
          }
          if (roles.length !== 1 || e.opportunityId && (e.opportunityId !== roles[0]!.id || e.roleHash !== roleFingerprint(roles[0]!))) { block('exact_current_listed_role_missing'); await save(); continue }
          e.opportunityId ??= roles[0]!.id; e.roleHash ??= roleFingerprint(roles[0]!); await save()
        }
        const leads = await db.lead.findMany({ where: { companyId: e.companyId, campaignCycle: checkpoint.options.campaignCycle } })
        if (leads.length > 1 || leads.some(l => l.leadKind !== (e.intent === 'listed' ? 'posted_role' : 'speculative') || l.opportunityId !== e.opportunityId || e.associationId && l.id !== e.associationId)) { block('preparation_selection_conflict'); await save(); continue }
        if (e.associationId && !leads.some(l => l.id === e.associationId)) { block('selected_association_missing'); await save(); continue }
        e.associationId = leads[0]?.id ?? null
        await check()
        // Pending recipient tasks do not trigger repeated capture on every resume.
        const waiting = await db.llmTask.findMany({ where: { id: { in: e.taskIds } } })
        if (!e.contactId && e.stage === 'recipients' && waiting.some(t => t.status !== 'fulfilled')) {
          // A terminally rejected/abandoned task (even an optional URL suggestion) stalls this entry; there is no reset command.
          const terminal = waiting.filter(t => t.status === 'rejected' || t.status === 'abandoned').map(t => `${t.id} (${t.status})`)
          e.blockers = terminal.length ? [`recipient_tasks_terminal_unfulfilled: ${terminal.join(', ')}; recipients will not re-run for this entry`] : ['recipient_tasks_pending']; await save(); continue
        }
        e.stage = 'recipients'; await save()
        const recipientsSince = await dbNow()
        const recipients = await prepareRecipients(db, scopedGate, [e.companyId], { now: now(), limit: 1, maxPages: 4, interPageDelayMs: clock.delayMs ?? 5200 })
          .catch(async (error: unknown) => { await orphan([], recipientsSince, 'recipients'); throw error })
        await afterStage(recipients.taskIds, recipientsSince, 'recipients')
        const selected = recipients.selected[0]?.contactId
        if (!selected || e.contactId && selected !== e.contactId) { e.blockers = recipients.blockers.map(b => `${b.reason}: ${b.detail}`); await save(); continue }
        e.contactId ??= selected; await save(); await check()
        const draftsSince = await dbNow()
        const drafts = await prepareOutreachDrafts(db, { companyIds: [e.companyId], limit: 1, now: now(), campaignCycle: checkpoint.options.campaignCycle,
          upgradeExisting: checkpoint.options.upgradeExisting, preparationSelection: { companyId: e.companyId, campaignCycle: checkpoint.options.campaignCycle,
            intent: e.intent, opportunityId: e.opportunityId, roleHash: e.roleHash, contactId: e.contactId, associationId: e.associationId, runId: id, owner: token } })
        e.draftIds = unique([...e.draftIds,...drafts.draftIds]); await afterStage(drafts.taskIds, draftsSince, 'drafts')
        // Recover task IDs/association after a D transaction committed before the
        // checkpoint acknowledgement. Existing D work fingerprints prevent copies.
        for (const draftId of e.draftIds) {
          const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId } }); e.associationId = draft.leadId
          const tasks = await db.llmTask.findMany({ where: { OR: [{ kind: 'outreach_draft', subjectId: draftId }, { kind: 'draft_support', subjectId: { startsWith: `${draftId}:` } }] } })
          addTasks(tasks.map(t => t.id))
        }
        const ready = e.draftIds.length && (await Promise.all(e.draftIds.map(d => evaluateOutreachReadiness(db, d, now())))).every(r => r.ready)
        e.stage = ready ? 'ready' : e.draftIds.length && (await db.draft.findMany({ where: { id: { in: e.draftIds }, promptVersion: null } })).length ? 'composing' : e.draftIds.length ? 'support' : 'blocked'
        e.blockers = drafts.blockers.map(b => `${b.reason}: ${b.detail}`)
        await save()
      } catch (error) { block(error instanceof Error ? error.message : 'preparation_stage_failed'); checkpoint.errors = [...checkpoint.errors,String(error)].slice(-100); await save() }
    }
    const shared=await sharedTaskIds(db,id,checkpoint.entries.flatMap(e=>e.orphanedTaskIds))
    for(const e of checkpoint.entries){e.ambiguousTaskIds=unique([...e.ambiguousTaskIds,...e.orphanedTaskIds.filter(t=>shared.includes(t))]);e.orphanedTaskIds=e.orphanedTaskIds.filter(t=>!e.ambiguousTaskIds.includes(t))}
    const orphaned = new Set(checkpoint.entries.flatMap(e => [...e.orphanedTaskIds,...e.ambiguousTaskIds]))
    const taskIds = unique(checkpoint.entries.flatMap(e => e.taskIds)).filter(t => !orphaned.has(t))
    if (taskIds.length > 200) throw new Error('Run task bound reached; no unbounded execution')
    const batch = await runPendingTasks(db, { taskIds, provider: checkpoint.options.provider, limit: taskIds.length, now: now() })
    checkpoint.usage = json(batch.results)
    checkpoint.status = checkpoint.discoveryFinished && checkpoint.entries.filter(e => e.selected).length > 0 && checkpoint.entries.filter(e => e.selected).every(e => e.stage === 'ready') ? 'review' : 'paused'
    await save()
    return { runId: id, status: checkpoint.status, reviewUrl, checkpoint }
  } catch (error) {
    // Never replace/reset a batch/checkpoint after unknown acknowledgement. The
    // exact run ID is returned in the error for explicit forensic resume.
    throw new Error(`Preparation ${id} paused; inspect/resume this exact run: ${error instanceof Error ? error.message : 'unknown failure'}`, { cause: error })
  } finally { await ownership.close() }
}
