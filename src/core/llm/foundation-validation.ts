import { z } from 'zod'
import type { ContactResearchResponse, DraftSupportResponse } from './tasks.js'

/** Deterministic provenance metadata from capture code, never supplied by a model. */
export type ContactVerification = {
  identityVerified: boolean
  identityEvidenceIds: string[]
  verifiedAuthorshipEvidenceIds: string[]
}

const VerificationSchema = z.object({
  identityVerified: z.boolean(),
  identityEvidenceIds: z.array(z.string().min(1)),
  verifiedAuthorshipEvidenceIds: z.array(z.string().min(1)),
})

export function validateContactResearch(
  output: ContactResearchResponse, verification: ContactVerification | undefined, allowedEvidenceIds: string[],
): string | null {
  if (verification !== undefined && !VerificationSchema.safeParse(verification).success) return 'Malformed independent verification metadata'
  const allowed = new Set(allowedEvidenceIds)
  const identitySupported = verification?.identityVerified === true && verification.identityEvidenceIds.length > 0 &&
    verification.identityEvidenceIds.every((id) => allowed.has(id))
  if (verification && ((verification.identityVerified && !identitySupported) ||
      (!verification.identityVerified && (verification.identityEvidenceIds.length > 0 || verification.verifiedAuthorshipEvidenceIds.length > 0)) ||
      verification.verifiedAuthorshipEvidenceIds.some((id) => !allowed.has(id)))) {
    return 'Inconsistent independent identity/authorship verification metadata'
  }
  if (output.identityStatus === 'verified' && !identitySupported) {
    return 'Model output cannot verify identity without independent captured identity evidence'
  }
  const authorship = new Set(verification?.verifiedAuthorshipEvidenceIds ?? [])
  if (output.hooks.some((hook) => hook.authorshipVerified &&
      (!identitySupported || !hook.evidenceIds.length || hook.evidenceIds.some((id) => !authorship.has(id))))) {
    return 'Model output cannot verify authorship without independent captured authorship evidence'
  }
  return null
}

export type SupportSentence = { text: string; evidenceIds: string[]; approvedClaimIds: string[]; role?: string }
const SentenceSchema = z.object({ text: z.string().min(1), evidenceIds: z.array(z.string()), approvedClaimIds: z.array(z.string()), role: z.string().optional() })
const sameIds = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

/** Check exact coverage/citations even when a model labels its own response supported. */
export function validateDraftSupport(output: DraftSupportResponse, sentences: SupportSentence[]): string | null {
  if (!z.array(SentenceSchema).safeParse(sentences).success) return 'Malformed generated-sentence input'
  if (output.claims.length !== sentences.length) return 'Support output must cover every generated sentence exactly once'
  const remaining = [...output.claims]
  for (const sentence of sentences) {
    const at = remaining.findIndex((claim) => claim.text === sentence.text &&
      sameIds(claim.evidenceIds, sentence.evidenceIds) && sameIds(claim.approvedClaimIds, sentence.approvedClaimIds))
    if (at < 0) return 'Support output changed or omitted a generated sentence or its exact citations'
    const claim = remaining.splice(at, 1)[0]!
    if (sentence.role === 'person' && claim.kind !== 'person') return 'Person attribution requires a person support check'
  }
  if (output.overall === 'supported' && output.claims.some((claim) => claim.verdict !== 'supported')) return 'Uncertain or unsupported sentences require needs_research'
  return null
}
