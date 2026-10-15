import type { Db } from '../../core/audit/audit-log.js'
import { HandoffLlmGateway } from '../../core/llm/handoff-gateway.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { findTaskSchema } from '../../core/llm/tasks.js'
import { validateDraftSupport } from '../../core/llm/foundation-validation.js'
import { DraftComposition, compositionClaimIds, compositionEvidenceIds } from './message.js'
import { isPersonAttribution } from './v5.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { lockDMutation } from '../review/locks.js'
import { supportSnapshot } from '../review/snapshot.js'

export type SupportClaim = { text: string; kind: 'company' | 'person' | 'candidate' | 'hypothetical'; evidenceIds: string[];
  approvedClaimIds: string[]; verdict: 'supported' | 'unsupported' | 'uncertain'; reason: string }
export type DraftSupportOutput = { claims: SupportClaim[]; overall: 'supported' | 'needs_research'; limitations: string[] }
/** Compatibility content fingerprint; readiness uses the stronger persisted-input snapshot. */
export const draftSupportHash = (draft: { subject: string | null; bodyText: string | null; composition: unknown }) => contentHashOf({ subject: draft.subject, bodyText: draft.bodyText, composition: draft.composition })

export function supportSentences(composition: DraftComposition) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  return [
    { role: isPersonAttribution(composition.subject) ? 'person' : 'subject', text: composition.subject, evidenceIds: compositionEvidenceIds(composition), approvedClaimIds: compositionClaimIds(composition) },
    ...composition.sentences.filter((s) => s.source === 'llm' || (composition.layout === 'v5' && s.source === 'deterministic' && !s.templateId)).flatMap((s) => [...segmenter.segment(s.text)].map(({ segment }) => ({
      role: isPersonAttribution(segment) ? 'person' : ['intro', 'availability'].includes(s.role) ? 'candidate' : s.role, text: segment.trim(), evidenceIds: s.evidenceIds, approvedClaimIds: s.approvedClaimIds,
    }))),
  ]
}

/** Every generated sentence AND the subject, against immutable supporting input snapshots. */
export async function queueDraftSupport(db: Db, draftId: string): Promise<{ taskId: string; created: boolean }> {
  if (isStandaloneDatabaseClient(db)) return db.$transaction((tx) => queueDraftSupport(tx, draftId), { timeout: 30_000 })
  await lockDMutation(db)
  const snapshot = await supportSnapshot(db, draftId)
  const { draft, company, claims, person } = snapshot
  const composition = DraftComposition.parse(draft.composition)
  const evidence = company.evidence.filter((e) => draft.citedEvidenceIds.includes(e.id))
  const existing = await db.llmTask.findFirst({ where: { kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draftId}:${snapshot.hash}`, status: { in: ['pending', 'claimed', 'fulfilled'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
  if (existing) return { taskId: existing.id, created: false }
  return new HandoffLlmGateway(db).enqueue({ kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draftId}:${snapshot.hash}`,
    allowedEvidenceIds: evidence.map((e) => e.id), allowedApprovedClaimIds: claims.filter((c) => c.isActive).map((c) => c.id), input: {
      draftId, contentHash: snapshot.hash, companyId: company.id, contactId: draft.contactId, subject: draft.subject, bodyText: draft.bodyText,
      sentences: supportSentences(composition),
      evidence: evidence.map((e) => ({ evidenceId: e.id, companyId: e.companyId, contactId: e.contactId, sourceUrl: e.sourceUrl, sourceType: e.sourceType,
        excerpt: e.excerpt, contentHash: e.contentHash, observedAt: e.observedAt.toISOString(), publishedAt: e.publishedAt?.toISOString() ?? null })),
      claims: claims.map((c) => ({ approvedClaimId: c.id, key: c.key, text: c.text, isActive: c.isActive, sourceRef: c.sourceRef })),
      resume: draft.resumeVersion ? { id: draft.resumeVersion.id, label: draft.resumeVersion.label, linkUrl: draft.resumeVersion.linkUrl, fileSha256: draft.resumeVersion.fileSha256 } : null,
      personResearch: person ? { identityStatus: person.identityStatus, facts: person.facts, hooks: person.hooks, limitations: person.limitations } : null,
      instructions: 'Independently assess the meaning of EVERY supplied sentence and subject verbatim, using exactly its citations. Membership of an ID, matching words or the writer label is not truth. Reject wrong identity, third-person or quoted-author confusion, unsupported responsibility, authorship, company interpretation, combined candidate claims or invented project links. Check all subject product/vacancy claims too. Conditional examples must be hypothetical, not shipped features. Return one claim per supplied unit, identical text and citations, with a reason grounded in excerpts. Any missing, unsupported or uncertain claim requires needs_research. Never repair citations or approve a draft.',
    } })
}

export function validateSupportCoverage(composition: DraftComposition, output: DraftSupportOutput): { supported: boolean; detail: string } {
  const parsed = findTaskSchema('draft_support', 'draft_support@1')!.schema.safeParse(output)
  if (!parsed.success) return { supported: false, detail: 'Malformed support output.' }
  const detail = validateDraftSupport(output, supportSentences(composition))
  if (detail) return { supported: false, detail }
  if (composition.layout === 'v5' && supportSentences(composition).some((s) => s.role === 'candidate' && !output.claims.some((c) => c.text === s.text && c.kind === 'candidate'))) return { supported: false, detail: 'Candidate facts require candidate-kind semantic coverage.' }
  if (output.overall !== 'supported' || output.claims.some((c) => c.verdict !== 'supported')) return { supported: false, detail: 'Independent semantic support review needs research.' }
  return { supported: true, detail: 'Every generated sentence and the subject checked against exact citations and current supporting snapshots.' }
}

export async function draftSupportStatus(db: Db, draft: { id: string }): Promise<{ supported: boolean; detail: string; taskId?: string }> {
  const snapshot = await supportSnapshot(db, draft.id)
  const task = await db.llmTask.findFirst({ where: { kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draft.id}:${snapshot.hash}` },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, status: true, input: true, output: true } })
  if (!task || task.status !== 'fulfilled' || !task.output) return { supported: false, detail: `Independent support review ${task?.status ?? 'not queued for current evidence/claims/identity/resume'}.`, ...(task ? { taskId: task.id } : {}) }
  const input = task.input as { contentHash?: string }
  if (input.contentHash !== snapshot.hash) return { supported: false, detail: 'Support snapshot changed.', taskId: task.id }
  const parsed = DraftComposition.safeParse(snapshot.draft.composition)
  if (!parsed.success) return { supported: false, detail: 'Draft composition is invalid.', taskId: task.id }
  return { ...validateSupportCoverage(parsed.data, task.output as DraftSupportOutput), taskId: task.id }
}
