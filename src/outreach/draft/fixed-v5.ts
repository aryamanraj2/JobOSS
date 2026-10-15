import type { DraftComposition, DraftSentence } from './message.js'

type Claim = { id: string; key: string; text: string }
const INTRO_KEYS = ['identity.full_name', 'education.year_of_study', 'education.degree']
export const FIXED_V5_KEYS = [...INTRO_KEYS, 'eligibility.internship_window']

/** @5 quotes the current approved facts. No static year, university, name or window fallback.
 * The longer verbatim introduction deliberately trades brevity for exact current meaning. */
export function fixedCandidateV5(claims: Claim[]): { intro: DraftSentence; availability: DraftSentence } | null {
  const byKey = new Map(claims.map((c) => [c.key, c]))
  if (FIXED_V5_KEYS.some((k) => !byKey.get(k)?.text.trim())) return null
  const introClaims = INTRO_KEYS.map((k) => byKey.get(k)!)
  const window = byKey.get('eligibility.internship_window')!
  const sentence = (role: 'intro' | 'availability', text: string, cited: Claim[]): DraftSentence => ({ role, text, evidenceIds: [],
    approvedClaimIds: cited.map((c) => c.id), source: 'deterministic', templateId: null })
  return {
    intro: sentence('intro', `I'm ${introClaims[0]!.text}. ${introClaims.slice(1).map((c) => c.text).join(' ')}`, introClaims),
    availability: sentence('availability', window.text, [window]),
  }
}
export function fixedCandidateV5Error(composition: DraftComposition, claims: Claim[]): string | null {
  const fixed = fixedCandidateV5(claims)
  if (!fixed) return 'Current approved candidate identity, education or availability facts are missing.'
  for (const role of ['intro', 'availability'] as const) {
    const rows = composition.sentences.filter((s) => s.role === role)
    const expected = fixed[role]
    if (rows.length !== 1 || rows[0]!.text !== expected.text || rows[0]!.source !== 'deterministic' || rows[0]!.templateId !== null ||
      rows[0]!.evidenceIds.length || JSON.stringify([...rows[0]!.approvedClaimIds].sort()) !== JSON.stringify([...expected.approvedClaimIds].sort())) {
      return 'Fixed candidate facts differ from their current exact approved inputs; prepare a new revision.'
    }
  }
  return null
}
