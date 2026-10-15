import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { loadTrackResumes } from '../../apply/packet/generate.js'
import { deterministicComposition, gateDraft } from './compose.js'
import { renderBody, compositionClaimIds } from './message.js'
import { queueOutreachDraft, applyOutreachDraft, latestFulfilledDraftTasks } from './queue-draft.js'
import { recipientSuitability } from '../contacts/suitability.js'
import { isBoundEvidenceInScope } from './evidence-scope.js'
import { queueDraftSupport } from './support.js'

export type PrepareDraftsResult = { draftIds: string[]; taskIds: string[]; blockers: { companyId: string; reason: string; detail: string }[] }

/** A hook must be an actual product/work description, not only a fetched page or role title. */
export function hasConcreteHook(excerpt: string): boolean {
  return excerpt.length >= 100 && /\b(app|product|platform|model|assistant|tool|launch|released|feature|build|sensor|sdk|api)\b/i.test(excerpt) && !/^\s*(?:careers|jobs|join our team|we are hiring)\b/i.test(excerpt)
}

export async function prepareOutreachDrafts(db: Db, opts: { companyIds: string[]; limit: number; now?: Date; upgradeExisting?: boolean }): Promise<PrepareDraftsResult> {
  const now = opts.now ?? new Date()
  const out: PrepareDraftsResult = { draftIds: [], taskIds: [], blockers: [] }
  const resumes = await loadTrackResumes(db)
  const claims = await db.approvedClaim.findMany({ where: { isActive: true }, select: { id: true, key: true, text: true } })
  const claimByKey = new Map(claims.map((claim) => [claim.key, claim]))
  for (const companyId of opts.companyIds.slice(0, opts.limit)) {
    const assessment = await db.outreachAssessment.findUnique({ where: { companyId }, include: { company: true } })
    const block = (reason: string, detail: string) => out.blockers.push({ companyId, reason, detail })
    if (!assessment || !(assessment.fit as { supported?: boolean } | null)?.supported || !assessment.primaryTrack) { block('unsupported_fit', 'Mobile/AI or secondary software fit has not been supported by evidence.'); continue }
    const company = assessment.company
    const contacts = await db.contact.findMany({ where: { companyId, status: 'active', verified: true }, orderBy: { id: 'asc' } })
    const candidates = contacts.filter((contact) => contact.discoveryMethod !== 'pattern_inferred' && recipientSuitability(contact).suitable).sort((a, b) => recipientSuitability(a).priority - recipientSuitability(b).priority || a.id.localeCompare(b.id))
    const contact = assessment.selectedContactId ? candidates.find((candidate) => candidate.id === assessment.selectedContactId) : candidates.find((candidate) => !candidate.contactType.startsWith('named') || candidate.identityVerifiedAt)
    if (!contact) { block('no_verified_suitable_contact', 'No suitable verified route selected for this company.'); continue }
    const person = await db.contactResearch.findUnique({ where: { contactId: contact.id } })
    if (contact.contactType.startsWith('named') && (!contact.identityVerifiedAt || person?.identityStatus !== 'verified' || !person.verifiedAt || person.companyId !== companyId)) { block('recipient_identity_unverified', 'Named person employment identity is not publicly verified.'); continue }
    const source = await db.evidence.findMany({ where: { companyId, contactId: null, observedAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, select: { id: true, companyId: true, contactId: true, sourceUrl: true, excerpt: true } })
    const hook = source.find((evidence) => isBoundEvidenceInScope(evidence, { ...company, companyId }, evidence.id) && hasConcreteHook(evidence.excerpt))
    if (!hook) { block('concrete_hook_missing', 'No fresh, company-bound description of a specific product or work supports a draft.'); continue }
    await db.outreachAssessment.update({ where: { companyId }, data: { selectedContactId: contact.id, status: 'draft_ready', blockers: [] } })
    const existing = await db.draft.findFirst({ where: { contactId: contact.id, lead: { companyId } }, orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }] })
    const written = existing && existing.promptVersion !== null
    if (existing && (existing.approvedAt || written) && !opts.upgradeExisting) {
      out.draftIds.push(existing.id)
      if (existing.promptVersion === 'outreach_draft@5' && !existing.approvedAt) {
        const support = await queueDraftSupport(db, existing.id)
        out.taskIds.push(support.taskId)
        const gate = await gateDraft(db, existing.id, now)
        if (!gate.ok) block('support_review_pending', gate.detail)
      }
      continue
    }
    let draftId: string
    if (existing && !written && !existing.approvedAt && !opts.upgradeExisting) draftId = existing.id
    else {
      const resume = resumes.get(assessment.primaryTrack)
      if (!resume) { block('no_resume', `No active resume for ${assessment.primaryTrack}.`); continue }
      const resumeRow = await db.resumeVersion.findUniqueOrThrow({ where: { id: resume.id }, select: { linkUrl: true } })
      let lead = await db.lead.findFirst({ where: { companyId }, orderBy: { campaignCycle: 'desc' }, select: { id: true } })
      if (!lead) lead = await db.lead.create({ data: { companyId, leadKind: 'speculative', status: 'candidate', primaryTrack: assessment.primaryTrack, primaryTrackReason: 'Outreach fit supported independently of application ranking.', campaignCycle: now.toISOString().slice(0, 7), citedEvidenceIds: assessment.citedEvidenceIds }, select: { id: true } })
      const fullName = claimByKey.get('identity.full_name')?.text ?? 'the candidate'
      const composition = { ...deterministicComposition({ vars: { companyName: company.displayName, roleTitle: null, resumeUrl: resumeRow.linkUrl, candidateName: fullName, candidateFirstName: fullName.split(/\s+/)[0]!, recipientFirstName: contact.fullName?.split(/\s+/)[0] ?? null, candidateLinks: ['identity.portfolio', 'identity.github'].map((key) => claimByKey.get(key)?.text.replace(/^https?:\/\//, '')).filter(Boolean).join(' · ') || null }, claimByKey, roleInbox: !contact.contactType.startsWith('named'), now }), layout: 'v5' as const, limitations: person?.limitations ?? ['No person-specific work; company-specific hook only.'] }
      const draft = await db.draft.create({ data: { leadId: lead.id, contactId: contact.id, touchSlot: existing?.touchSlot ?? 0, revision: (existing?.revision ?? 0) + 1, revisionOfId: existing?.id ?? null, resumeVersionId: resume.id, outreachCase: 'intern_availability_inquiry', status: 'composing', composition, bodyText: renderBody(composition), subject: composition.subject, citedEvidenceIds: [], approvedClaimIds: compositionClaimIds(composition) }, select: { id: true } })
      draftId = draft.id
      await writeAudit(db, { actorType: 'system', actorId: 'outreach-preparation', action: existing ? 'draft.revision_created' : 'draft.prepared', subjectType: 'Draft', subjectId: draftId, metadata: { companyId, contactId: contact.id, revisionOfId: existing?.id ?? null } })
    }
    out.draftIds.push(draftId)
    const queued = await queueOutreachDraft(db, draftId, 'outreach_draft@5')
    if (queued.queued) out.taskIds.push(queued.taskId)
    else block(queued.reason, 'Draft task could not be queued with current evidence.')
  }
  const ids = new Set(out.draftIds)
  for (const task of (await latestFulfilledDraftTasks(db)).filter((task) => ids.has(task.subjectId))) {
    const draft = await db.draft.findUnique({ where: { id: task.subjectId }, select: { promptVersion: true, approvedAt: true } })
    if (draft?.approvedAt || draft?.promptVersion) continue
    const merged = await applyOutreachDraft(db, task.id)
    if (!merged.merged) {
      const company = await db.draft.findUnique({ where: { id: task.subjectId }, select: { lead: { select: { companyId: true } } } })
      if (company) out.blockers.push({ companyId: company.lead.companyId, reason: merged.reason, detail: merged.detail })
    }
  }
  return out
}
