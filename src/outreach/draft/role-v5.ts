import { postingContentHash } from '../../ingest/ats/ingest-postings.js'
import type { DraftComposition } from './message.js'

/** One bounded, substantive inquiry: a current posting motivates the internship question.
 * Senior postings never become an invented intern vacancy or a claim of qualification. */
export function listedRoleContextV5(title: string): string {
  return /\bintern(?:ship)?\b/i.test(title)
    ? `I saw your ${title} posting and would like to ask about that internship.`
    : `I saw your ${title} posting; I'm asking whether a related engineering internship could fit that team's work.`
}
type ListedRole = { title: string | null; roleUrl: string | null; externalId: string | null; location: string | null; description: string | null; postedAt: Date | null }
type RoleEvidence = { id: string; sourceType: string; sourceUrl: string; contentHash: string; contactId: string | null }
export function listedRoleEvidenceV5<T extends RoleEvidence>(role: ListedRole, evidence: T[]): T[] {
  if (!role.externalId || !role.title || !role.roleUrl) return []
  const hash = postingContentHash({ externalId: role.externalId, title: role.title, url: role.roleUrl, location: role.location, content: role.description ?? '', postedAt: role.postedAt })
  return evidence.filter((e) => e.contactId === null && e.sourceType === 'ats' && e.sourceUrl === role.roleUrl && e.contentHash === hash)
}
export function listedRoleContextV5Error(composition: DraftComposition, role: ListedRole, evidence: RoleEvidence[]): string | null {
  if (!role.title) return 'Listed role context is missing a current title.'
  const lines = composition.sentences.filter((s) => s.role === 'company')
  const ids = new Set(listedRoleEvidenceV5(role, evidence).map((e) => e.id))
  if (lines.length !== 1 || lines[0]!.source !== 'llm' || !lines[0]!.text.startsWith(`${listedRoleContextV5(role.title)} `) || lines[0]!.text.slice(listedRoleContextV5(role.title).length).trim().length < 40 ||
    !lines[0]!.evidenceIds.length || !lines[0]!.evidenceIds.some((id) => ids.has(id)) || lines[0]!.approvedClaimIds.length) {
    return 'Listed role context must relate the current posting to the internship inquiry with its exact ATS evidence.'
  }
  return null
}
