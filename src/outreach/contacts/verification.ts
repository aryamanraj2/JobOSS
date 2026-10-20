import type { Contact, ContactResearch, Evidence } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import { emailHmac } from '../../core/crypto/secret-store.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { currentObservation, sourcePageKey } from '../../ingest/ats/verified.js'
import { observePersonPage, MAX_IDENTITY_SOURCE_CHARS, identityCaptureHash } from './person-research.js'
import { isCompanyDomain } from './classify.js'
import { recipientSuitability } from './suitability.js'
import { readEmailProviderRoute } from './email-lookup.js'
import { readImportedRow } from './verify-backfill.js'
import { providerAttestsDeliverable } from './import.js'

export type PersonFact = { text: string; evidenceIds: string[]; authorshipVerified: boolean;
  identityRecord?: { version: 2 | 3; html: string }; observation?: 'identity' | 'authorship'; snapshots?: { id: string; hash: string }[] }
export const evidenceSnapshot = (e: Evidence) => contentHashOf({ id: e.id, companyId: e.companyId, contactId: e.contactId,
  sourceUrl: e.sourceUrl, sourceType: e.sourceType, excerpt: e.excerpt, contentHash: e.contentHash, observedAt: e.observedAt, publishedAt: e.publishedAt })
export function personFacts(input: unknown): PersonFact[] {
  return Array.isArray(input) ? input.filter((r): r is PersonFact => !!r && typeof r === 'object' && typeof r.text === 'string' && Array.isArray(r.evidenceIds)) : []
}
export function validPersonFacts(research: ContactResearch, contact: Contact, evidence: Evidence[], now: Date, companyDomain?: string, companyName?: string): boolean {
  if (research.companyId !== contact.companyId || research.identityStatus !== 'verified' || !research.verifiedAt || !contact.identityVerifiedAt ||
    !currentObservation(research.researchedAt, now, 30) || !currentObservation(research.verifiedAt, now, 30) ||
    !currentObservation(contact.identityVerifiedAt, now, 30) || !contact.fullName || !contact.identitySourceUrl) return false
  const rows = new Map(evidence.map((e) => [e.id, e]))
  const responsibilities = personFacts(research.facts), hooks = personFacts(research.hooks)
  const facts = [...responsibilities, ...hooks]
  // All v2 captures isolated a script/card and discarded ancestors/sibling records.
  // Their original quotation/example context cannot be recovered. Preserve them
  // as history, but require deliberate recapture of the full bounded v3 source.
  // Reject the collection if any responsibility lacks its own current source
  // proof. Suitability consumes every research.fact, so a good employment record
  // cannot license another fact (including one relabelled as authorship). Genuine
  // authorship hooks stay separate and are not product-responsibility evidence.
  const validResponsibility = (f: PersonFact) => {
    if (f.observation !== 'identity' || f.identityRecord?.version !== 3 || typeof f.identityRecord.html !== 'string' || !f.identityRecord.html.trim() || f.identityRecord.html.length > MAX_IDENTITY_SOURCE_CHARS || !contact.publicTitle) return false
    const domain = companyDomain ?? contact.emailNormalized.split('@')[1]
    if (!domain) return false
    return f.evidenceIds.length > 0 && f.evidenceIds.every((id) => {
      const e = rows.get(id)
      if (!e || e.contentHash !== identityCaptureHash(e.sourceUrl, e.excerpt, contact.id, f.identityRecord!.html)) return false
      const observed = observePersonPage({ html: f.identityRecord!.html, url: e.sourceUrl, companyDomain: domain, ...(companyName ? { companyName } : {}), fullName: contact.fullName!, publicTitle: contact.publicTitle })
      return observed.identityVerified && observed.excerpt === f.text
    })
  }
  // Each source is checked at its own URL; legitimate secondary employer sources
  // need not share the contact's primary identity URL. Retain that primary anchor.
  const identity = responsibilities.length > 0 && responsibilities.every(validResponsibility) &&
    responsibilities.some((f) => f.evidenceIds.some((id) => rows.get(id)?.sourceUrl === contact.identitySourceUrl)) &&
    hooks.filter((f) => f.observation === 'identity').every(validResponsibility)
  return identity && facts.length > 0 && research.citedEvidenceIds.length > 0 && facts.every((f) => f.evidenceIds.length > 0 && f.evidenceIds.every((id) => {
    const e = rows.get(id)
    return !!e && research.citedEvidenceIds.includes(id) && e.companyId === contact.companyId && e.contactId === contact.id &&
      currentObservation(e.observedAt, now, 30) && (!e.publishedAt || e.publishedAt <= now) && f.text === e.excerpt &&
      Array.isArray(f.snapshots) && f.snapshots.some((s) => !!s && s.id === id && s.hash === evidenceSnapshot(e)) &&
      !evidence.some((other) => other.contactId === e.contactId && sourcePageKey(other.sourceUrl) === sourcePageKey(e.sourceUrl) && other.observedAt > e.observedAt)
  }))
}

/** No network or writes; a verified bit or a foreign key alone cannot verify a route. */
export async function recipientState(db: Db, contact: Contact, companyDomain: string, now: Date) {
  const [route, research, evidence, suppressions, company] = await Promise.all([
    db.evidence.findUnique({ where: { id: contact.evidenceId } }),
    db.contactResearch.findUnique({ where: { contactId: contact.id } }),
    db.evidence.findMany({ where: { companyId: contact.companyId } }),
    db.suppression.findMany(),
    db.company.findUnique({ where: { id: contact.companyId }, select: { displayName: true } }),
  ])
  const verifiedIdentity = !!research && validPersonFacts(research, contact, evidence, now, companyDomain, company?.displayName)
  const suitability = recipientSuitability(contact, verifiedIdentity ? personFacts(research!.facts).map((f) => f.text) : [])
  const fail = (detail: string) => ({ ready: false, detail, research, evidence, suitability })
  if (contact.status !== 'active' || !contact.verified || contact.discoveryMethod === 'pattern_inferred') return fail('Recipient is stopped or the published route is not verified.')
  if (!isCompanyDomain(contact.emailNormalized, companyDomain)) return fail('Contact route is not on the verified employer domain.')
  const salt = process.env.SUPPRESSION_HMAC_SALT
  if (suppressions.some((s) => s.scope === 'global' || (s.scope === 'domain' && s.domain === contact.emailNormalized.split('@')[1]) ||
    (s.scope === 'contact' && (!salt || s.emailHmac === emailHmac(contact.emailNormalized, salt))))) return fail('Recipient or company is suppressed.')
  if (!route || route.companyId !== contact.companyId || (route.contactId && route.contactId !== contact.id) ||
    !currentObservation(route.observedAt, now, 30) || !currentObservation(contact.capturedAt, now, 30) || (route.publishedAt && route.publishedAt > now)) return fail('Contact route provenance is missing, stale or future dated.')
  if (evidence.some((e) => e.contactId === route.contactId && sourcePageKey(e.sourceUrl) === sourcePageKey(route.sourceUrl) && e.observedAt > route.observedAt)) return fail('A newer source capture supersedes the contact route.')
  if (contact.discoveryMethod === 'page_published') {
    let employer = false
    try { employer = isCompanyDomain(`source@${new URL(route.sourceUrl).hostname}`, companyDomain) } catch { /* No published route. */ }
    if (!employer || route.sourceType !== 'company_page' || !route.excerpt.toLowerCase().includes(contact.emailNormalized.toLowerCase())) return fail('Employer evidence does not publish this exact address.')
  } else if (route.sourceUrl.startsWith('provider-api://')) {
    if (!readEmailProviderRoute(route, contact, companyDomain)) return fail('Machine provider route lacks an exact bound provider attestation.')
  } else {
    const imported = readImportedRow({ ...route, emailNormalized: contact.emailNormalized })
    if (!imported?.ok || !providerAttestsDeliverable(imported.cells['email_status'])) return fail('Imported route lacks an exact valid provider attestation.')
  }
  if (contact.contactType.startsWith('named') && !verifiedIdentity) return fail('Person identity or current responsibilities need verified source snapshots.')
  if (!suitability.suitable) return fail(suitability.reason)
  return { ready: true, detail: 'Suitable verified recipient and current published route.', research, evidence, suitability }
}
