import { contentHashOf } from '../../core/evidence/content-hash.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { detectAtsInUrl } from './signatures.js'

export const ATS_OWNERSHIP_DAYS = 30
export type OwnershipCompany = { id: string; canonicalDomain: string; atsSlug?: string | null;
  atsBoardToken?: string | null; atsOwnershipEvidenceId?: string | null; atsOwnershipVerifiedAt?: Date | null }
export type OwnershipEvidence = { id: string; companyId?: string | null; contactId?: string | null;
  sourceType: string; sourceUrl: string; excerpt: string; contentHash?: string; observedAt: Date }
export function currentObservation(date: Date, now: Date, days: number): boolean {
  const age = now.getTime() - date.getTime()
  return Number.isFinite(age) && age >= 0 && age <= days * 86_400_000
}
export function verifiedOwnership(company: OwnershipCompany, evidence: OwnershipEvidence | null | undefined, now: Date): boolean {
  const domain = evidence && canonicalizeDomain(evidence.sourceUrl)
  return !!(company.atsSlug && company.atsBoardToken && company.atsOwnershipVerifiedAt && evidence &&
    evidence.id === company.atsOwnershipEvidenceId && evidence.companyId === company.id && !evidence.contactId &&
    evidence.sourceType === 'company_page' && !/\.eu\.(?:lever\.co|greenhouse\.io)/i.test(evidence.excerpt) && domain && domain.ok && domain.domain === company.canonicalDomain &&
    evidence.observedAt.getTime() === company.atsOwnershipVerifiedAt.getTime() &&
    currentObservation(evidence.observedAt, now, ATS_OWNERSHIP_DAYS) &&
    evidence.contentHash === contentHashOf({ vendor: company.atsSlug, boardToken: company.atsBoardToken }) &&
    belongsToBoard(/^[a-z][a-z0-9+.-]*:/i.test(evidence.excerpt) ? evidence.excerpt : `https://${evidence.excerpt}`, company))
}
export function belongsToBoard(url: string | null, company: OwnershipCompany): boolean {
  if (!url) return false
  const hit = detectAtsInUrl(url)
  return !!hit && hit.vendor === company.atsSlug && hit.boardToken === company.atsBoardToken
}

/** Fragments address positions within one fetched page, not independent sources. */
export function sourcePageKey(input: string): string {
  try { const url = new URL(input); url.hash = ''; return url.href } catch { return input }
}
