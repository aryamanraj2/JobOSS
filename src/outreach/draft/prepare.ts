import { beginPreparationSelection, currentSelectionError, preparationTransaction, type PreparationSelection } from '../preparation/selection.js'
import type { Db } from '../../core/audit/audit-log.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { loadTrackResumes } from '../../apply/packet/generate.js'
import { deterministicComposition, gateDraft } from './compose.js'
import { fixedCandidateV5 } from './fixed-v5.js'
import { renderTemplate } from './templates.js'
import { renderBody, compositionClaimIds } from './message.js'
import { queueOutreachDraft, applyOutreachDraft } from './queue-draft.js'
import { recipientSuitability } from '../contacts/suitability.js'
import { recipientState } from '../contacts/verification.js'
import { isBoundEvidenceInScope } from './evidence-scope.js'
import { currentCompanyContext, hasConcreteHook, preparationLimit } from '../review/context.js'
import { evaluateOutreachReadiness } from '../review/readiness.js'
import { lockDMutation } from '../review/locks.js'
import { queueDraftSupport } from './support.js'
export { hasConcreteHook } from '../review/context.js'

export type PrepareDraftsResult = { draftIds: string[]; taskIds: string[]; blockers: { companyId: string; reason: string; detail: string }[] }
export type PrepareDraftsOptions = { companyIds: string[]; limit: number; now?: Date; upgradeExisting?: boolean;
  /** Explicit operator/integration campaign, required only when no association exists. Never inferred to evade dedup. */
  campaignCycle?: string; preparationSelection?: PreparationSelection; additionalContacts?: number; reviseDraftId?: string }

/** Resume only identifiable JOBOSS revisions with the exact current work. Original rows are never updated.
 * Companies 1-100, contacts 1-6 per company (default strongest only); tasks enqueue but never execute. */
export async function prepareOutreachDrafts(db: Db, opts: PrepareDraftsOptions): Promise<PrepareDraftsResult> {
  const limit = preparationLimit(opts.limit), contactsLimit = preparationLimit(opts.additionalContacts ?? 1, 6), now = opts.now ?? new Date()
  const out: PrepareDraftsResult = { draftIds: [], taskIds: [], blockers: [] }
  for (const companyId of [...new Set(opts.companyIds)].slice(0, limit)) {
    const prepare = async (tx: Db) => {
      await lockDMutation(tx)
      if (opts.preparationSelection) {
        const problem = await beginPreparationSelection(tx, opts.preparationSelection, opts.companyIds, opts.campaignCycle) ??
          await currentSelectionError(tx, opts.preparationSelection, now)
        if (problem) { out.blockers.push({ companyId, reason: problem, detail: 'Exact preparation selection is blocked; existing history is preserved.' }); return }
      }
      await tx.$queryRaw`SELECT id FROM company WHERE id = ${companyId} FOR UPDATE`
      const context = await currentCompanyContext(tx, companyId, now)
      const block = (reason: string, detail: string) => out.blockers.push({ companyId, reason, detail })
      if (!context || !context.assessment.fit.supported || !context.assessment.primaryTrack || context.assessment.priority <= 0) { block('unsupported_fit', 'Current mobile/AI or secondary software fit needs primary evidence.'); return }
      const { company, assessment, currentEvidence, currentRoles } = context
      const saved = company.outreachAssessment
      if (saved && /^(?:stopped|excluded|rejected|closed|paused)$/.test(saved.status)) { block('operator_stopped', 'Preparation is stopped by the operator.'); return }
      const contacts = await tx.contact.findMany({ where: { companyId, ...(opts.preparationSelection ? { id: opts.preparationSelection.contactId } : {}) }, orderBy: { id: 'asc' } })
      const ordered = contacts.sort((a, b) => (a.id === saved?.selectedContactId ? -1 : b.id === saved?.selectedContactId ? 1 :
        recipientSuitability(a).priority - recipientSuitability(b).priority || a.id.localeCompare(b.id)))
      const reachable = []
      for (const contact of ordered) {
        const state = await recipientState(tx, contact, company.canonicalDomain, now)
        if (state.ready) reachable.push({ contact, state })
        else if (contact.id === saved?.selectedContactId) { block('selected_contact_invalid', state.detail); return }
      }
      reachable.sort((a, b) => a.contact.id === saved?.selectedContactId ? -1 : b.contact.id === saved?.selectedContactId ? 1 : a.state.suitability.priority - b.state.suitability.priority || a.contact.id.localeCompare(b.contact.id))
      if (saved?.selectedContactId && !contacts.some((c) => c.id === saved.selectedContactId)) { block('selected_contact_invalid', 'Selected contact no longer exists.'); return }
      if (!reachable.length) { block('no_verified_suitable_contact', 'Research a suitable verified route and identity first.'); return }
      const hook = currentEvidence.find((e) => !e.contactId && isBoundEvidenceInScope(e, { ...company, companyId }, e.id) && hasConcreteHook(e.excerpt))
      if (!hook) { block('concrete_hook_missing', 'A fresh concrete company/product hook is missing.'); return }
      const resumes = await loadTrackResumes(tx), resume = resumes.get(assessment.primaryTrack!)
      const resumeRow = resume ? await tx.resumeVersion.findUnique({ where: { id: resume.id } }) : null
      if (!resumeRow?.isActive || !resumeRow.linkUrl.startsWith('https://')) { block('no_resume', 'An active hosted resume matching the supported track is required.'); return }
      const claims = await tx.approvedClaim.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })
      const claimByKey = new Map(claims.map((c) => [c.key, c]))
      let lead = await tx.lead.findFirst({ where: { companyId, ...(opts.campaignCycle ? { campaignCycle: opts.campaignCycle } : {}) }, orderBy: [{ campaignCycle: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] })
      if (lead && (['rejected', 'deferred', 'excluded'].includes(lead.status) || ['reply_received', 'reply_positive', 'reply_negative', 'reply_neutral', 'opt_out', 'hard_bounce', 'soft_bounce', 'wrong_contact'].includes(lead.statusReason ?? ''))) { block('operator_stopped', 'Existing association is stopped; its score/operator history is preserved.'); return }
      if (lead?.leadKind === 'posted_role' && !currentRoles.some((r) => r.id === lead!.opportunityId)) { block('listed_role_not_current', 'Existing listed-role association lacks a current owned unchanged posting.'); return }
      if (!lead) {
        if (!opts.campaignCycle?.trim()) { block('campaign_cycle_required', 'Supply the authorized campaignCycle to create a new speculative association.'); return }
        lead = await tx.lead.create({ data: { companyId, leadKind: opts.preparationSelection?.intent === 'listed' ? 'posted_role' : 'speculative', ...(opts.preparationSelection?.opportunityId ? { opportunityId: opts.preparationSelection.opportunityId } : {}), status: 'candidate', primaryTrack: assessment.primaryTrack!,
          primaryTrackReason: opts.preparationSelection?.intent === 'listed' ? 'Explicit preparation selection of a current verified role; no application assessment or score was produced.' : 'JOBOSS D speculative association from current primary outreach fit; no application assessment or score was produced.',
          campaignCycle: opts.campaignCycle, citedEvidenceIds: assessment.citedEvidenceIds } })
        await writeAudit(tx, { actorType: 'system', actorId: 'outreach-preparation', action: opts.preparationSelection?.intent === 'listed' ? 'lead.listed_association_created' : 'lead.speculative_association_created', subjectType: 'Lead', subjectId: lead.id,
          metadata: { companyId, campaignCycle: lead.campaignCycle, fitEvidenceIds: assessment.fit.evidenceIds, scoringPerformed: false } })
      }
      const primaryContactId = saved?.selectedContactId ?? reachable[0]!.contact.id
      // Preserve later selected/status fields. New research is read from C's pure assessment.
      if (!saved) await tx.outreachAssessment.create({ data: { companyId, researchPriority: assessment.priority, primaryTrack: assessment.primaryTrack,
        status: 'contact_needed', blockers: [], fit: JSON.parse(JSON.stringify(assessment.fit)), eligibility: JSON.parse(JSON.stringify(assessment.eligibility)), trigger: JSON.parse(JSON.stringify(assessment.trigger)),
        citedEvidenceIds: assessment.citedEvidenceIds, assessedAt: now, selectedContactId: primaryContactId } })
      else if (!saved.selectedContactId) await tx.outreachAssessment.update({ where: { companyId }, data: { selectedContactId: primaryContactId } })
      // Lock existing relevant rows before checking operator stops, including closure
      // already in flight. Anchors select history; they do not override the latest chain.
      await tx.$queryRaw`SELECT d.id FROM draft d JOIN lead l ON l.id = d.lead_id WHERE l.company_id = ${companyId} AND l.campaign_cycle = ${lead.campaignCycle} ORDER BY d.id FOR UPDATE OF d`
      const allDrafts = await tx.draft.findMany({ where: { lead: { companyId, campaignCycle: lead.campaignCycle } }, orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }] })
      for (const { contact, state } of reachable.slice(0, contactsLimit)) {
        if (await tx.sendAttempt.findFirst({ where: { contactId: contact.id, campaignCycle: lead.campaignCycle } })) { block('contact_already_attempted', 'This contact already has a send attempt in this campaign.'); continue }
        const anchor = opts.reviseDraftId ? allDrafts.find((d) => d.id === opts.reviseDraftId && d.contactId === contact.id) : null
        if (opts.reviseDraftId && !anchor) { block('invalid_revision_anchor', 'The explicit revision anchor must belong to this company/contact/campaign.'); continue }
        const latest = allDrafts.find((d) => d.contactId === contact.id && (!anchor || d.touchSlot === anchor.touchSlot))
        const previous = anchor ?? latest
        if (latest?.status === 'closed' || previous?.status === 'closed') { block('draft_closed', 'The latest draft is closed; preserve the deliberate stop.'); continue }
        const workHash = contentHashOf({ company: { ...company, outreachAssessment: undefined }, assessment, contact, research: state.research,
          claims, resume: resumeRow, lead, primaryContactId, reviseDraftId: opts.reviseDraftId ?? null })
        const markers = await tx.auditLog.findMany({ where: { action: 'draft.joboss_prepared', subjectType: 'Draft' }, orderBy: { createdAt: 'desc' } })
        const marker = markers.find((m) => (m.metadata as { workHash?: string } | null)?.workHash === workHash && allDrafts.some((d) => d.id === m.subjectId))
        const reusable = marker ? allDrafts.find((d) => d.id === marker.subjectId && !d.approvedAt && !['closed', 'sent', 'sending', 'scheduled'].includes(d.status)) : null
        if (previous?.promptVersion === 'outreach_draft@5' && previous.approvedAt && !opts.upgradeExisting) { out.draftIds.push(previous.id); const readiness = await evaluateOutreachReadiness(tx, previous.id, now); if (!readiness.ready) block('approved_revision_needs_review', readiness.detail); continue }
        if (previous && !reusable && !opts.upgradeExisting) { block('revision_required', `Preserved existing draft ${previous.id}; pass upgradeExisting to create a new @5 revision requiring approval.`); continue }
        let draft = reusable
        if (!draft) {
          const fullName = claimByKey.get('identity.full_name')?.text
          if (!fullName) { block('candidate_identity_missing', 'Approved candidate name is missing.'); continue }
          const fixed = fixedCandidateV5(claims)
          if (!fixed) { block('candidate_facts_missing', 'Current approved identity, education and availability facts are required.'); continue }
          const base = deterministicComposition({ vars: { companyName: company.displayName, roleTitle: lead.leadKind === 'posted_role' ? currentRoles.find((r) => r.id === lead!.opportunityId)?.title ?? null : null,
            resumeUrl: resumeRow.linkUrl, candidateName: fullName, candidateFirstName: fullName.split(/\s+/)[0]!, recipientFirstName: contact.fullName?.split(/\s+/)[0] ?? null,
            candidateLinks: ['identity.portfolio', 'identity.github'].map((k) => claimByKey.get(k)?.text.replace(/^https?:\/\//, '')).filter(Boolean).join(' · ') || null },
            claimByKey, roleInbox: !contact.contactType.startsWith('named'), now })
          const composition = { ...base, sentences: base.sentences.map((s) => s.role === 'intro' ? fixed.intro : s.role === 'availability' ? fixed.availability : s.role === 'ask' ? { ...s, templateId: 'ask.intern_availability@1', text: renderTemplate('ask.intern_availability@1', { companyName: company.displayName, roleTitle: null, resumeUrl: resumeRow.linkUrl, candidateName: fullName }) } : s), layout: 'v5' as const, limitations: state.research?.limitations ?? ['Recruiting inbox; company-specific hook only.'] }
          const touchSlot = previous?.touchSlot ?? (allDrafts.length ? Math.max(...allDrafts.map((d) => d.touchSlot)) + 1 : 0)
          const revision = 1 + Math.max(0, ...allDrafts.filter((d) => d.leadId === lead!.id && d.contactId === contact.id && d.touchSlot === touchSlot).map((d) => d.revision))
          draft = await tx.draft.create({ data: { leadId: lead.id, contactId: contact.id, touchSlot, revision, revisionOfId: previous?.id ?? null,
            resumeVersionId: resumeRow.id, outreachCase: 'intern_availability_inquiry', status: 'composing', composition, subject: composition.subject,
            bodyText: renderBody(composition), citedEvidenceIds: [], approvedClaimIds: compositionClaimIds(composition) } })
          allDrafts.unshift(draft)
          await writeAudit(tx, { actorType: 'system', actorId: 'outreach-preparation', action: 'draft.joboss_prepared', subjectType: 'Draft', subjectId: draft.id,
            metadata: { workHash, primaryContactId, additionalContact: contact.id !== primaryContactId, companyId, contactId: contact.id, revisionOfId: previous?.id ?? null } })
        }
        out.draftIds.push(draft.id)
        if (!draft.promptVersion) {
          const newest = await tx.llmTask.findFirst({ where: { kind: 'outreach_draft', subjectId: draft.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
          if (newest?.status === 'fulfilled') {
            const applied = await applyOutreachDraft(tx, newest.id)
            if (!applied.merged) { block(applied.reason, applied.detail); continue }
          } else {
            const queued = await queueOutreachDraft(tx, draft.id, 'outreach_draft@5', now)
            if (queued.queued) out.taskIds.push(queued.taskId)
            else block(queued.reason, 'Current draft could not be queued.')
            block('draft_pending', 'Manual drafting is pending; automatic execution remains isolation_blocked.'); continue
          }
        }
        const support = await queueDraftSupport(tx, draft.id); out.taskIds.push(support.taskId)
        const gated = await gateDraft(tx, draft.id, now)
        if (!gated.ok) block('readiness_blocked', gated.detail)
      }
    }
    if (isStandaloneDatabaseClient(db) && opts.preparationSelection) await preparationTransaction(db, prepare, companyId, out)
    else if (isStandaloneDatabaseClient(db)) await db.$transaction(prepare, { timeout: 30_000 })
    else await prepare(db)
  }
  return out
}
