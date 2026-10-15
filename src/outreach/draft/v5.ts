import type { OutreachDraftResponseV4 } from '../../core/llm/tasks.js'
import type { PersonFact } from '../contacts/prepare.js'
import { validateEmailV4 } from './email.js'

export type OutreachDraftV5 = OutreachDraftResponseV4 & { personHook?: { text: string; evidenceIds: string[]; contactId: string } }

export function validatePersonHook(
  hook: NonNullable<OutreachDraftV5['personHook']>,
  target: { companyId: string; contactId: string; identityVerified: boolean },
  evidence: { id: string; companyId: string | null; contactId: string | null; excerpt: string }[],
  hooks: PersonFact[],
): string[] {
  const errors: string[] = []
  if (hook.contactId !== target.contactId || !target.identityVerified) errors.push('Person identity is not verified for this recipient.')
  const rows = new Map(evidence.map((row) => [row.id, row]))
  if (hook.evidenceIds.length === 0 || hook.evidenceIds.some((id) => rows.get(id)?.companyId !== target.companyId || rows.get(id)?.contactId !== target.contactId)) errors.push('Person hook cites evidence bound to another company or person.')
  const attributedWork = /\b(built|led|lead|created|designed|developed|authored|wrote|published|your (?:article|talk|work|post|research))\b/i.test(hook.text)
  if (attributedWork) {
    const authored = new Set(hooks.filter((row) => row.authorshipVerified).flatMap((row) => row.evidenceIds))
    if (hook.evidenceIds.some((id) => !authored.has(id))) errors.push('Person work attribution lacks verified authorship evidence.')
  }
  return errors
}

export function validateEmailV5(
  answer: OutreachDraftV5,
  target: { companyId: string; companyName: string; contactId: string; identityVerified: boolean },
  sources: { evidence: { id: string; companyId: string | null; contactId: string | null; excerpt: string }[]; claims: Map<string, string>; hooks: PersonFact[] },
  body: string,
): string[] {
  const rows = sources.evidence.map((row) => ({ id: row.id, companyId: row.companyId, text: row.excerpt }))
  const errors = validateEmailV4(answer, target, { evidence: rows, claims: sources.claims }, body)
  if (answer.personHook) {
    errors.push(...validatePersonHook(answer.personHook, target, sources.evidence, sources.hooks))
    // Reuse number/name/link checking for the personal sentence as well.
    const personal = { ...answer, hook: { ...answer.personHook, approvedClaimIds: [] } }
    errors.push(...validateEmailV4(personal, target, { evidence: rows, claims: sources.claims }, body).map((error) => `personHook: ${error}`))
  }
  return [...new Set(errors)]
}
