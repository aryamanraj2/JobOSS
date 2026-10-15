import type { Db } from '../../core/audit/audit-log.js'
import { assessOutreachCompany } from '../../intel/outreach/assess.js'
import type { FundingDatePrecision } from '../../core/joboss/contracts.js'
import { currentObservation, sourcePageKey, verifiedOwnership, belongsToBoard } from '../../ingest/ats/verified.js'
import { postingContentHash } from '../../ingest/ats/ingest-postings.js'

/** Recompute C's assessment without persisting it or touching application ranking. */
export async function currentCompanyContext(db: Db, companyId: string, now: Date) {
  const company = await db.company.findUnique({ where: { id: companyId }, include: {
    evidence: { orderBy: [{ observedAt: 'desc' }, { id: 'asc' }] }, fundingRecords: true, opportunities: true,
    outreachAssessment: true,
  } })
  if (!company) return null
  const assessment = assessOutreachCompany({ ...company, fundingRecords: company.fundingRecords.map((r) => ({ ...r, datePrecision: r.datePrecision as FundingDatePrecision })) }, now)
  const currentEvidence = company.evidence.filter((e) => currentObservation(e.observedAt, now, 30) &&
    (!e.publishedAt || e.publishedAt <= now) && !company.evidence.some((other) =>
      other.contactId === e.contactId && sourcePageKey(other.sourceUrl) === sourcePageKey(e.sourceUrl) && other.observedAt > e.observedAt))
  const owned = verifiedOwnership(company, company.evidence.find((e) => e.id === company.atsOwnershipEvidenceId), now)
  const currentRoles = company.opportunities.filter((o) => owned && o.status === 'open' && currentObservation(o.lastSeenAt, now, 30) &&
    belongsToBoard(o.roleUrl, company) && currentEvidence.some((e) => e.contactId === null && e.sourceType === 'ats' && e.sourceUrl === o.roleUrl && o.externalId &&
      e.contentHash === postingContentHash({ externalId: o.externalId, title: o.title ?? '', url: o.roleUrl!, location: o.location, content: o.description ?? '', postedAt: o.postedAt })))
  return { company, assessment, currentEvidence, currentRoles }
}

export function hasConcreteHook(excerpt: string): boolean {
  return excerpt.length >= 100 && /\b(app|product|platform|model|assistant|tool|launch|released|feature|build|sensor|sdk|api)\b/i.test(excerpt) && !/^\s*(?:careers|jobs|join our team|we are hiring)\b/i.test(excerpt)
}

export function preparationLimit(value = 20, max = 100): number {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Preparation limit must be 1-${max}`)
  return value
}
