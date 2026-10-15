import type { Db } from '../../core/audit/audit-log.js'
import { HandoffLlmGateway } from '../../core/llm/handoff-gateway.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import type { DraftComposition } from './message.js'

export type SupportClaim = {
  text: string
  kind: 'company' | 'person' | 'candidate' | 'hypothetical'
  evidenceIds: string[]
  approvedClaimIds: string[]
  verdict: 'supported' | 'unsupported' | 'uncertain'
  reason: string
}
export type DraftSupportOutput = { claims: SupportClaim[]; overall: 'supported' | 'needs_research'; limitations: string[] }
export const draftSupportHash = (draft: { subject: string | null; bodyText: string | null; composition: unknown }) => contentHashOf({ subject: draft.subject, bodyText: draft.bodyText, composition: draft.composition })

/** The checker sees the exact draft plus its excerpts, with no mailbox credentials. */
export async function queueDraftSupport(db: Db, draftId: string): Promise<{ taskId: string; created: boolean }> {
  const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId }, select: { id: true, subject: true, bodyText: true, composition: true, citedEvidenceIds: true, approvedClaimIds: true, contactId: true, lead: { select: { companyId: true } } } })
  const [evidence, claims, person] = await Promise.all([
    db.evidence.findMany({ where: { id: { in: draft.citedEvidenceIds } }, select: { id: true, companyId: true, contactId: true, sourceUrl: true, excerpt: true } }),
    db.approvedClaim.findMany({ where: { id: { in: draft.approvedClaimIds }, isActive: true }, select: { id: true, key: true, text: true } }),
    draft.contactId ? db.contactResearch.findUnique({ where: { contactId: draft.contactId } }) : null,
  ])
  const contentHash = draftSupportHash(draft)
  const existing = await db.llmTask.findFirst({ where: { kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draftId}:${contentHash}`, status: { in: ['pending', 'claimed', 'fulfilled'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  if (existing) return { taskId: existing.id, created: false }
  return new HandoffLlmGateway(db).enqueue({ kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draftId}:${contentHash}`, allowedEvidenceIds: evidence.map((e) => e.id), allowedApprovedClaimIds: claims.map((c) => c.id), input: {
    draftId, contentHash, companyId: draft.lead.companyId, contactId: draft.contactId, subject: draft.subject, bodyText: draft.bodyText,
    sentences: (draft.composition as DraftComposition).sentences.filter((s) => s.source === 'llm'),
    evidence: evidence.map((e) => ({ evidenceId: e.id, companyId: e.companyId, contactId: e.contactId, sourceUrl: e.sourceUrl, excerpt: e.excerpt })),
    claims: claims.map((claim) => ({ approvedClaimId: claim.id, key: claim.key, text: claim.text })),
    personResearch: person ? { identityStatus: person.identityStatus, facts: person.facts, hooks: person.hooks, limitations: person.limitations } : null,
    instructions: 'Independently check every supplied sentence against exactly its cited excerpts and approved claims. Return one claim per sentence using the sentence text verbatim. Citation IDs alone are not support. Unsupported scope, identity, authorship, interpretations or candidate claims require needs_research. Label clearly conditional product scenarios hypothetical; never treat them as existing features. Do not add citations to repair a sentence. Every supplied sentence must be covered; uncertain counts as needs_research.',
  } })
}

export function validateSupportCoverage(composition: DraftComposition, output: DraftSupportOutput): { supported: boolean; detail: string } {
  if (output.overall !== 'supported' || output.claims.some((claim) => claim.verdict !== 'supported')) return { supported: false, detail: 'Independent support review needs research.' }
  const lines = composition.sentences.filter((sentence) => sentence.source === 'llm')
  if (lines.length !== output.claims.length) return { supported: false, detail: 'Independent review did not cover every generated sentence exactly once.' }
  const remaining = [...output.claims]
  for (const sentence of lines) {
    const index = remaining.findIndex((claim) => claim.text === sentence.text)
    if (index < 0) return { supported: false, detail: `Independent review omitted: ${sentence.text.slice(0, 80)}` }
    const claim = remaining.splice(index, 1)[0]!
    if (JSON.stringify([...claim.evidenceIds].sort()) !== JSON.stringify([...sentence.evidenceIds].sort()) || JSON.stringify([...claim.approvedClaimIds].sort()) !== JSON.stringify([...sentence.approvedClaimIds].sort())) return { supported: false, detail: 'Independent review changed the sentence citations.' }
    if (sentence.role === 'person' && claim.kind !== 'person') return { supported: false, detail: 'Person attribution was not reviewed as a person claim.' }
  }
  return { supported: true, detail: 'Every generated sentence independently checked against its exact citations.' }
}

export async function draftSupportStatus(db: Db, draft: { id: string; subject: string | null; bodyText: string | null; composition: unknown }): Promise<{ supported: boolean; detail: string; taskId?: string }> {
  const task = await db.llmTask.findFirst({ where: { kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: `${draft.id}:${draftSupportHash(draft)}` }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, output: true } })
  if (!task || task.status !== 'fulfilled' || !task.output) return { supported: false, detail: `Independent support review ${task?.status ?? 'not queued'}.`, ...(task ? { taskId: task.id } : {}) }
  return { ...validateSupportCoverage(draft.composition as DraftComposition, task.output as DraftSupportOutput), taskId: task.id }
}
