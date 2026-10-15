import { companyFitExcerpt } from './support.js'
import type { Prisma } from '../../../generated/prisma/client.js'
import type { RoleTrackKey } from '../../../generated/prisma/enums.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { RankedOutreachCompany } from '../../core/joboss/contracts.js'
import { matchTracks, type TextField } from '../taxonomy/matcher.js'
import { canonicalizeDomain } from '../../ingest/domain/canonicalize.js'
import { earlyFundingStage, fundingRecent, type FundingDate } from '../../ingest/discovery/funding.js'
import { verifiedOwnership, belongsToBoard, sourcePageKey } from '../../ingest/ats/verified.js'
import { postingContentHash } from '../../ingest/ats/ingest-postings.js'
import { fundingSupportExcerpt } from '../../ingest/discovery/funding.js'
import { batchYear } from '../../ingest/yc/yc-oss.js'

export type OutreachEvidence = { id: string; sourceUrl: string; sourceType: string; excerpt: string;
  companyId?: string | null; contentHash?: string; observedAt: Date; publishedAt: Date | null; contactId: string | null }
export type OutreachFunding = FundingDate & { id: string; evidenceId: string; stage: string | null;
  verificationStatus: string; observedAt: Date }
export type OutreachCompany = { id: string; canonicalDomain: string; displayName: string; countries: string[];
  teamSize: number | null; ycBatch: string | null; ycStatus: string | null; ycOneLiner: string | null;
  ycLongDescription: string | null; tags: string[]; status?: string; atsSlug?: string | null; atsBoardToken?: string | null; atsOwnershipEvidenceId?: string | null; atsOwnershipVerifiedAt: Date | null;
  evidence: OutreachEvidence[]; fundingRecords: OutreachFunding[];
  opportunities: { id: string; title: string | null; description: string | null; roleUrl: string | null; externalId?: string | null; location?: string | null; postedAt?: Date | null; lastSeenAt: Date; status: string }[] }

const AGE_MS = 86_400_000
const FIT_WINDOW_DAYS = 60
function prioritizedTrack(matches: ReturnType<typeof matchTracks>['matches']): RoleTrackKey | null {
  return (matches.find((m) => m.track === 'ios_android' || m.track === 'ai_engineer') ?? matches[0])?.track ?? null
}

/** Application ranking remains intact; no ATS or geography requirement applies to research priority. */
export function assessOutreachCompany(company: OutreachCompany, now = new Date()): RankedOutreachCompany {
  const fresh = (date: Date) => date.getTime() <= now.getTime() && now.getTime() - date.getTime() <= FIT_WINDOW_DAYS * AGE_MS
  // Do not reinterpret rejected historical funding proof as a launch/fit citation.
  const rejectedFundingEvidence = new Set(company.fundingRecords.filter((r) => {
    if (r.verificationStatus !== 'primary_verified') return false
    const evidence = company.evidence.find((e) => e.id === r.evidenceId)
    return !evidence || !r.stage || !fundingSupportExcerpt(evidence.excerpt, company.displayName, r.stage, r)
  }).map((r) => r.evidenceId))
  const latestPages = new Map<string, number>()
  for (const e of company.evidence.filter((e) => !e.contactId && e.sourceType === 'company_page')) latestPages.set(sourcePageKey(e.sourceUrl), Math.max(latestPages.get(sourcePageKey(e.sourceUrl)) ?? 0, e.observedAt.getTime()))
  const owned = company.evidence.filter((e) => {
    const domain = canonicalizeDomain(e.sourceUrl)
    return !rejectedFundingEvidence.has(e.id) && e.companyId === company.id && e.contactId === null && e.sourceType === 'company_page' && domain.ok && domain.domain === company.canonicalDomain && fresh(e.observedAt) && latestPages.get(sourcePageKey(e.sourceUrl)) === e.observedAt.getTime()
  })
  const fields: TextField[] = owned.filter((e) => companyFitExcerpt(e.excerpt, company.displayName)).map((e) => ({ field: `evidence:${e.id}`, text: e.excerpt }))
  const postingEvidenceIds = new Map<string, string[]>()
  if (verifiedOwnership(company, company.evidence.find((e) => e.id === company.atsOwnershipEvidenceId), now)) {
    for (const posting of company.opportunities.filter((o) => o.status === 'open' && fresh(o.lastSeenAt))) {
      const matching = company.evidence.filter((e) => e.companyId === company.id && e.sourceType === 'ats' && e.sourceUrl === posting.roleUrl && !e.contactId &&
        fresh(e.observedAt) && posting.externalId && belongsToBoard(posting.roleUrl, company) &&
        e.contentHash === postingContentHash({ externalId: posting.externalId, title: posting.title ?? '', url: posting.roleUrl!,
          location: posting.location ?? null, content: posting.description ?? '', postedAt: posting.postedAt ?? null }))
      if (!matching.length) continue
      fields.push({ field: `posting:${posting.id}`, text: matching.map((e) => e.excerpt).join('\n') })
      postingEvidenceIds.set(posting.id, matching.map((e) => e.id))
    }
  }
  const verifiedMatch = matchTracks(fields)
  const seedFields: TextField[] = [company.ycOneLiner, company.ycLongDescription, company.tags.join(', ')].filter((t): t is string => !!t)
    .map((text, i) => ({ field: `seed:${i}`, text }))
  // Index evidence helps decide what to research, never asserts readiness.
  const indexFields: TextField[] = company.evidence.filter((e) => !rejectedFundingEvidence.has(e.id) && e.companyId === company.id && e.sourceType === 'external_source' && !e.contactId && fresh(e.observedAt))
    .map((e) => ({ field: `index:${e.id}`, text: e.excerpt }))
  const indexMatch = matchTracks([...seedFields, ...indexFields])
  const primaryTrack = prioritizedTrack(verifiedMatch.matches) ?? prioritizedTrack(indexMatch.matches)
  const supported = primaryTrack !== null && verifiedMatch.matches.some((m) => m.track === primaryTrack)
  const primary = (supported ? verifiedMatch : indexMatch).matches.find((m) => m.track === primaryTrack)
  const matchedIds = new Set((primary?.snippets ?? []).filter((s) => s.field.startsWith('evidence:')).map((s) => s.field.slice(9)))
  for (const snippet of primary?.snippets ?? []) {
    if (snippet.field.startsWith('posting:')) for (const id of postingEvidenceIds.get(snippet.field.slice(8)) ?? []) matchedIds.add(id)
  }
  const citationIds = [...matchedIds]
  const validEvidence = company.evidence.filter((e) => !rejectedFundingEvidence.has(e.id) && e.companyId === company.id && !e.contactId && fresh(e.observedAt))
  const funding = company.fundingRecords.filter((r) => {
    const e = validEvidence.find((e) => e.id === r.evidenceId)
    return e && (r.verificationStatus !== 'primary_verified' || (r.stage && fundingSupportExcerpt(e.excerpt, company.displayName, r.stage, r)))
  }).sort((a, b) => (b.announcedAt?.getTime() ?? 0) - (a.announcedAt?.getTime() ?? 0))
  const latestRound = funding[0] ?? null
  const earlyStageVerified = latestRound?.verificationStatus === 'primary_verified' && earlyFundingStage(latestRound.stage) && fundingRecent(latestRound, now)
  const recentRound = funding.find((round) => fundingRecent(round, now)) ?? null
  const hiring = validEvidence.find((e) => e.publishedAt && fresh(e.publishedAt) &&
    e.sourceUrl.startsWith('https://news.ycombinator.com/item?') && /\bhiring|open roles|open positions|apply\b/i.test(e.excerpt))
  const productLaunch = owned.find((e) => e.publishedAt && fresh(e.publishedAt) && /\b(launch|released|introduc|announc)\w*/i.test(e.excerpt))
  const trigger = recentRound
    ? { kind: 'funding', evidenceId: recentRound.evidenceId, stage: recentRound.stage, date: recentRound.dateText,
        datePrecision: recentRound.datePrecision, verified: recentRound.verificationStatus === 'primary_verified', windowDays: 180 }
    : hiring ? { kind: 'hiring_invitation', evidenceId: hiring.id, publishedAt: hiring.publishedAt,
        verified: false, limitation: 'Employer identity requires corroboration' }
    : productLaunch ? { kind: 'product_launch', evidenceId: productLaunch.id, publishedAt: productLaunch.publishedAt, verified: true }
    : { kind: 'none', verified: false, limitation: 'No supported recent trigger' }
  if ('evidenceId' in trigger && typeof trigger.evidenceId === 'string') citationIds.push(trigger.evidenceId)
  if (latestRound?.verificationStatus === 'primary_verified') citationIds.push(latestRound.evidenceId)
  let priority = primaryTrack === 'ios_android' || primaryTrack === 'ai_engineer' ? (supported ? 1000 : 400) : primaryTrack ? 100 : 0
  priority += supported ? 100 : primaryTrack ? 30 : 0
  priority += recentRound ? (recentRound.verificationStatus === 'primary_verified' ? 90 : 35) : hiring ? 65 : productLaunch ? 50 : 0
  priority += earlyStageVerified ? 60 : latestRound && earlyFundingStage(latestRound.stage) ? 25 : 0
  priority += company.teamSize === null ? 5 : company.teamSize >= 1 && company.teamSize <= 50 ? 30 : company.teamSize <= 250 ? 15 : 0
  const recentBatch = batchYear(company.ycBatch) >= now.getUTCFullYear() - 2
  if (primaryTrack && recentBatch && (company.teamSize === null || company.teamSize <= 50)) priority += 90
  if (company.teamSize !== null && company.teamSize > 250) priority = Math.max(0, priority - 250)
  const lifecycle = company.ycStatus?.toLowerCase()
  if (company.status === 'excluded' || lifecycle === 'inactive' || lifecycle === 'acquired' || lifecycle === 'public') priority = 0
  const restrictions = owned.flatMap((e) => {
    const found = e.excerpt.match(/[^.!?]*(?:must be based|work authori[sz]ation|no sponsorship|onsite|on-site|remote[^.!?]*(?:only|restricted)|location[^.!?]*only)[^.!?]*/gi)
    return (found ?? []).map((text) => ({ text: text.trim(), evidenceId: e.id }))
  })
  const blockers = [
    ...(!primaryTrack ? ['fit_unknown'] : !supported ? ['fit_needs_primary_evidence'] : []),
    ...(!earlyStageVerified ? ['early_stage_unverified'] : []),
    'suitable_verified_contact_needed',
    ...(!supported || trigger.kind === 'none' || !trigger.verified ? ['concrete_hook_needed'] : []),
    ...(company.status === 'excluded' ? ['operator_excluded'] : []),
    ...(lifecycle === 'inactive' || lifecycle === 'acquired' || lifecycle === 'public' ? ['company_lifecycle_not_startup'] : []),
  ]
  return { companyId: company.id, name: company.displayName, domain: company.canonicalDomain, priority,
    primaryTrack, status: supported ? 'contact_needed' : 'research_needed', blockers,
    fit: { supported, primaryTrack, confidence: primary?.confidence ?? 0, matchedTerms: primary?.specificTerms ?? [],
      snippets: primary?.snippets.slice(0, 8) ?? [], evidenceIds: [...matchedIds],
      earlyStageVerified: !!earlyStageVerified, stage: latestRound?.stage ?? null,
      stageBasis: 'latest_known_funding_round', currentStageUncertainty: 'Source coverage is incomplete; later rounds may be absent',
      teamSize: company.teamSize, teamSizeBasis: 'seed_index_unverified',
      teamSizeUncertainty: company.teamSize === null ? 'unknown' : 'requires_primary_verification',
      batch: company.ycBatch, batchIsFundingDate: false },
    eligibility: { status: restrictions.length ? 'restrictions_recorded' : 'unknown', countries: company.countries,
      restrictions, internationalEligibility: 'unconfirmed', sponsorship: 'unknown', relocation: 'unknown', remoteArrangement: 'unconfirmed' },
    trigger, citedEvidenceIds: [...new Set(citationIds)] }
}

export async function rankOutreachCompanies(db: Db, opts: { limit: number; now?: Date }): Promise<RankedOutreachCompany[]> {
  if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 10_000) throw new Error('Research ranking limit must be1-10000')
  const now = opts.now ?? new Date()
  const companies = await db.company.findMany({ include: {
    fundingRecords: true,
    evidence: { where: { sourceType: { in: ['company_page', 'external_source', 'ats'] } }, orderBy: { observedAt: 'desc' } },
    opportunities: { where: { status: 'open', lastSeenAt: { gte: new Date(now.getTime() - FIT_WINDOW_DAYS * AGE_MS) } } },
  } })
  const ranked = companies.map((company) => assessOutreachCompany({ ...company,
    fundingRecords: company.fundingRecords.map((round) => ({ ...round, datePrecision: round.datePrecision as FundingDate['datePrecision'] })) }, now))
    .sort((a, b) => b.priority - a.priority || a.domain.localeCompare(b.domain))
    .filter((assessment) => assessment.priority > 0).slice(0, opts.limit)
  for (const assessment of ranked) {
    const data = { companyId: assessment.companyId, researchPriority: assessment.priority, primaryTrack: assessment.primaryTrack,
      status: assessment.status, blockers: assessment.blockers, fit: assessment.fit as Prisma.InputJsonValue,
      eligibility: assessment.eligibility as Prisma.InputJsonValue, trigger: assessment.trigger as Prisma.InputJsonValue,
      citedEvidenceIds: assessment.citedEvidenceIds, assessedAt: now }
    const { status, ...researchData } = data
    await db.outreachAssessment.upsert({ where: { companyId: assessment.companyId }, create: data, update: { researchPriority: data.researchPriority, assessedAt: now } })
    await db.outreachAssessment.updateMany({ where: { companyId: assessment.companyId, selectedContactId: null, status: { in: ['research_needed', 'contact_needed'] } }, data: { ...researchData, status } })
  }
  return ranked
}
