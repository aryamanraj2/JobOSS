import type { Db } from '../../core/audit/audit-log.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { FIXED_V5_KEYS } from '../draft/fixed-v5.js'
import { APPROVED_PROJECT_LINKS } from '../../core/joboss/project-links.js'

/** Content AND supporting inputs. Status/gate bookkeeping is deliberately separate. */
export async function supportSnapshot(db: Db, draftId: string) {
  const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId }, include: { contact: true, resumeVersion: true, lead: true } })
  const company = await db.company.findUniqueOrThrow({ where: { id: draft.lead.companyId }, include: {
    evidence: { orderBy: { id: 'asc' } }, opportunities: { orderBy: { id: 'asc' } }, fundingRecords: { orderBy: { id: 'asc' } }, outreachAssessment: true,
  } })
  const [claims, person, profile, suppressions, attempts] = await Promise.all([
    db.approvedClaim.findMany({ where: { OR: [{ id: { in: draft.approvedClaimIds } }, { key: { in: [...FIXED_V5_KEYS, 'identity.portfolio', 'identity.github'] } }] }, orderBy: { id: 'asc' } }),
    draft.contactId ? db.contactResearch.findUnique({ where: { contactId: draft.contactId } }) : null,
    db.candidateProfile.findFirst({ select: { id: true, senderIdentity: true } }),
    db.suppression.findMany({ orderBy: { id: 'asc' } }),
    db.sendAttempt.findMany({ where: { companyId: company.id }, orderBy: { id: 'asc' }, select: { id: true, contactId: true, touchSlot: true, campaignCycle: true, draftId: true, status: true } }),
  ])
  const content = { id: draft.id, leadId: draft.leadId, contactId: draft.contactId, touchSlot: draft.touchSlot, revision: draft.revision,
    revisionOfId: draft.revisionOfId, researchBriefId: draft.researchBriefId, resumeVersionId: draft.resumeVersionId,
    subject: draft.subject, bodyText: draft.bodyText, composition: draft.composition, outreachCase: draft.outreachCase,
    citedEvidenceIds: draft.citedEvidenceIds, approvedClaimIds: draft.approvedClaimIds, promptVersion: draft.promptVersion,
    contact: draft.contact, resume: draft.resumeVersion, lead: draft.lead }
  const hash = contentHashOf({ version: 'joboss-d-support@3', content, company, claims: claims.map((c) => ({ id: c.id, key: c.key, text: c.text, category: c.category, sourceRef: c.sourceRef, isActive: c.isActive })), person, profile, suppressions, projectLinks: APPROVED_PROJECT_LINKS })
  return { hash, draft, company, claims, person, profile, suppressions, attempts }
}

export async function reviewSnapshot(db: Db, draftId: string): Promise<string> {
  const snapshot = await supportSnapshot(db, draftId)
  const [tasks, decisions] = await Promise.all([
    db.llmTask.findMany({ where: { OR: [{ kind: 'outreach_draft', subjectId: draftId }, { kind: 'draft_support', subjectId: `${draftId}:${snapshot.hash}` }] }, orderBy: { id: 'asc' } }),
    db.auditLog.findMany({ where: { subjectType: 'Draft', subjectId: draftId, action: { in: ['draft.joboss_prepared', 'draft.outreach_snapshot_approved'] } }, orderBy: { id: 'asc' } }),
  ])
  return contentHashOf({ hash: snapshot.hash, status: snapshot.draft.status, gateResult: snapshot.draft.gateResult,
    approvedAt: snapshot.draft.approvedAt, approvalHash: snapshot.draft.approvalHash, approvedBy: snapshot.draft.approvedBy, tasks, decisions, attempts: snapshot.attempts })
}
