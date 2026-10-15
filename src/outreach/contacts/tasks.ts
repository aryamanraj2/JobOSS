import type { Db } from '../../core/audit/audit-log.js'
import type { ContactResearchResponse, ResearchUrlsResponse } from '../../core/llm/tasks.js'
import { HandoffLlmGateway, type EnqueueSpec } from '../../core/llm/handoff-gateway.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { personFacts } from './verification.js'

export async function recipientTask(db: Db, spec: EnqueueSpec) {
  const existing = await db.llmTask.findFirst({ where: { kind: spec.kind, promptVersion: spec.promptVersion, subjectType: spec.subjectType,
    subjectId: spec.subjectId, status: { in: ['pending', 'claimed', 'fulfilled'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
  return existing ? { taskId: existing.id, created: false } : new HandoffLlmGateway(db).enqueue(spec)
}
export async function recipientCandidateUrls(db: Db, companyId: string): Promise<string[]> {
  const task = await db.llmTask.findFirst({ where: { kind: 'research_urls', promptVersion: 'research_urls@1', subjectType: 'RecipientSearch', subjectId: companyId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  if (task?.status !== 'fulfilled' || !task.output) return []
  return (task.output as ResearchUrlsResponse).urls.map((r) => r.url)
}

/** Fulfilled labels cannot promote identity or authorship. Exact captured facts are the ceiling. */
export async function applyRecipientResearch(db: Db, contactId: string, taskId: string): Promise<boolean> {
  const [task, research, contact] = await Promise.all([db.llmTask.findUnique({ where: { id: taskId } }),
    db.contactResearch.findUnique({ where: { contactId } }), db.contact.findUnique({ where: { id: contactId } })])
  if (!task || !research || !contact || task.status !== 'fulfilled' || task.kind !== 'contact_research' || !task.output) return false
  const observations = [...personFacts(research.facts), ...personFacts(research.hooks)]
  const fingerprint = contentHashOf({ contact, facts: research.facts, hooks: research.hooks, citedEvidenceIds: research.citedEvidenceIds })
  if (task.subjectId !== `${contactId}:${fingerprint}`) return false
  const output = task.output as ContactResearchResponse
  if ([...output.facts, ...output.hooks].some((f) => !observations.some((o) => o.text === f.text &&
    JSON.stringify([...o.evidenceIds].sort()) === JSON.stringify([...f.evidenceIds].sort())))) return false
  const limitations = [...new Set([...research.limitations, ...output.limitations])]
  if (JSON.stringify(limitations) !== JSON.stringify(research.limitations) || output.identityStatus !== research.identityStatus) await db.contactResearch.update({ where: { contactId }, data: { limitations, ...(output.identityStatus !== 'verified' ? { identityStatus: output.identityStatus, verifiedAt: null } : {}) } })
  return true
}
