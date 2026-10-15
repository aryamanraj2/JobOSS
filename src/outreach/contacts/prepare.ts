import type { Prisma } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { ensureCompanyResearchBudget } from '../../ingest/budget/company-budget.js'
import { fetchPage } from '../../ingest/fetch-page.js'
import { curateCompanyContacts } from './curate.js'
import { readImportedRow } from './verify-backfill.js'
import { observePersonPage } from './person-research.js'
import { recipientSuitability } from './suitability.js'
import { isCompanyDomain } from './classify.js'

export type PreparationBlocker = { companyId: string; contactId?: string; reason: string; detail: string }
export type PrepareRecipientsResult = {
  selected: { companyId: string; contactId: string }[]
  blockers: PreparationBlocker[]
  researched: number
  limitations: { companyId: string; contactId: string; detail: string }[]
}
export type PersonFact = { text: string; evidenceIds: string[]; authorshipVerified: boolean }

/** Shared, bounded employer-page reads; no inferred addresses or provider billing. */
export async function prepareRecipients(
  db: Db,
  gate: GatedFetcher,
  companyIds: string[],
  opts: { now?: Date; limit?: number; maxPages?: number; interPageDelayMs?: number } = {},
): Promise<PrepareRecipientsResult> {
  const now = opts.now ?? new Date()
  const out: PrepareRecipientsResult = { selected: [], blockers: [], researched: 0, limitations: [] }
  const companies = await db.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, displayName: true, canonicalDomain: true, countries: true } })
  const byId = new Map(companies.map((company) => [company.id, company]))
  for (const companyId of companyIds.slice(0, opts.limit ?? companyIds.length)) {
    const company = byId.get(companyId)
    if (!company) continue
    await ensureCompanyResearchBudget(db, company.id, company.countries, now)
    let contacts = await db.contact.findMany({ where: { companyId, status: 'active' }, orderBy: { id: 'asc' } })
    if (!contacts.some((c) => c.verified && recipientSuitability(c).suitable)) {
      const curated = await curateCompanyContacts(db, gate, company, { now, maxPages: opts.maxPages ?? 3, interPageDelayMs: opts.interPageDelayMs ?? 5200 })
      contacts = await db.contact.findMany({ where: { companyId, status: 'active' }, orderBy: { id: 'asc' } })
      for (const refusal of curated.refusals) out.limitations.push({ companyId, contactId: '', detail: `${refusal.reason}: ${refusal.detail}` })
    }
    const candidates = contacts.filter((c) => c.verified && c.discoveryMethod !== 'pattern_inferred' && recipientSuitability(c).suitable)
      .sort((a, b) => recipientSuitability(a).priority - recipientSuitability(b).priority || a.id.localeCompare(b.id))
    if (candidates.length === 0) {
      out.blockers.push({ companyId, reason: 'no_verified_suitable_contact', detail: 'No supported person or recruiting route with a verified address.' })
      continue
    }
    const cache = new Map<string, Awaited<ReturnType<typeof fetchPage>>>()
    const read = async (url: string) => {
      if (cache.has(url)) return cache.get(url)!
      if (cache.size >= (opts.maxPages ?? 4)) return { ok: false, reason: 'source_unavailable', detail: 'Recipient research coverage cap reached.', fetches: 0 } as const
      if (cache.size > 0) await new Promise((resolve) => setTimeout(resolve, opts.interPageDelayMs ?? 5200))
      const result = await fetchPage(gate, url, { companyId, cost: 1, sameHostDelayMs: opts.interPageDelayMs ?? 5200 })
      cache.set(url, result)
      return result
    }
    for (const contact of candidates) {
      const suitability = recipientSuitability(contact)
      await db.contact.update({ where: { id: contact.id }, data: { suitability: suitability.category, suitabilityReason: suitability.reason } })
      if (!contact.contactType.startsWith('named')) {
        out.selected.push({ companyId, contactId: contact.id })
        out.limitations.push({ companyId, contactId: contact.id, detail: 'Recruiting inbox; no named person or person-specific hook.' })
        break
      }
      let fullName = contact.fullName
      let identitySourceUrl = contact.identitySourceUrl
      if (!fullName) {
        const provenance = await db.evidence.findUnique({ where: { id: contact.evidenceId }, select: { excerpt: true, sourceUrl: true } })
        const imported = provenance ? readImportedRow({ ...provenance, emailNormalized: contact.emailNormalized }) : null
        if (imported?.ok) {
          fullName = imported.cells['full_name']?.trim() || null
          identitySourceUrl = imported.cells['source_url']?.trim() || null
          await db.contact.update({ where: { id: contact.id }, data: { fullName, identitySourceUrl } })
        }
      }
      const existing = await db.contactResearch.findUnique({ where: { contactId: contact.id } })
      if (existing?.identityStatus === 'verified' && existing.verifiedAt && contact.identityVerifiedAt && now.getTime() - existing.researchedAt.getTime() < 30 * 86400000) {
        out.selected.push({ companyId, contactId: contact.id })
        for (const detail of existing.limitations) out.limitations.push({ companyId, contactId: contact.id, detail })
        break
      }
      const limitations: string[] = []
      const facts: PersonFact[] = []
      const hooks: PersonFact[] = []
      let identityVerified = false
      let verifiedUrl: string | null = null
      const linkedSources = new Set<string>()
      if (!fullName || fullName.split(/\s+/).length < 2) limitations.push('A disambiguated full name is unavailable.')
      else {
        const urls = [...new Set([`https://${company.canonicalDomain}/team`, `https://${company.canonicalDomain}/about`, `https://${company.canonicalDomain}/`, ...(identitySourceUrl?.startsWith(`https://${company.canonicalDomain}/`) ? [identitySourceUrl] : [])])]
        for (const url of urls) {
          const page = await read(url)
          if (!page.ok) { limitations.push(`${page.reason}: ${page.detail}`); continue }
          const observation = observePersonPage({ html: page.body, url: page.url, companyDomain: company.canonicalDomain, fullName, publicTitle: contact.publicTitle })
          if (!observation.identityVerified) continue
          identityVerified = true
          verifiedUrl = page.url
          observation.links.forEach((link) => linkedSources.add(link))
          const evidence = await personEvidence(db, { companyId, companyDomain: company.canonicalDomain, contactId: contact.id, url: page.url, excerpt: observation.excerpt!, now })
          facts.push({ text: observation.excerpt!, evidenceIds: [evidence.id], authorshipVerified: observation.authorshipVerified })
          if (observation.authorshipVerified && observation.workExcerpt) hooks.push({ text: observation.excerpt!, evidenceIds: [evidence.id], authorshipVerified: true })
          break
        }
        // Only employer-linked public authorship sources are eligible for external binding.
        for (const url of [...linkedSources].slice(0, 2)) {
          const page = await read(url)
          if (!page.ok) { limitations.push(`${page.reason}: ${page.detail}`); continue }
          const observation = observePersonPage({ html: page.body, url: page.url, companyDomain: company.canonicalDomain, fullName, publicTitle: contact.publicTitle, employerLinked: identityVerified })
          if (!observation.authorshipVerified || !observation.workExcerpt) continue
          const evidence = await personEvidence(db, { companyId, companyDomain: company.canonicalDomain, contactId: contact.id, url: page.url, excerpt: observation.workExcerpt, now })
          hooks.push({ text: observation.workExcerpt, evidenceIds: [evidence.id], authorshipVerified: true })
        }
      }
      if (hooks.length === 0) limitations.push('Verified person-specific work is unavailable; use a company-specific hook without attributing product work to this person.')
      if (!identityVerified) limitations.push('Public employment identity is unverified; this named recipient is not ready.')
      const citedEvidenceIds = [...new Set([...facts, ...hooks].flatMap((fact) => fact.evidenceIds))]
      await db.contactResearch.upsert({ where: { contactId: contact.id }, create: { contactId: contact.id, companyId, identityStatus: identityVerified ? 'verified' : 'unverified', facts: facts as Prisma.InputJsonValue, hooks: hooks as Prisma.InputJsonValue, citedEvidenceIds, limitations, researchedAt: now, verifiedAt: identityVerified ? now : null }, update: { identityStatus: identityVerified ? 'verified' : 'unverified', facts: facts as Prisma.InputJsonValue, hooks: hooks as Prisma.InputJsonValue, citedEvidenceIds, limitations, researchedAt: now, verifiedAt: identityVerified ? now : null } })
      if (identityVerified) await db.contact.update({ where: { id: contact.id }, data: { identityVerifiedAt: now, identitySourceUrl: verifiedUrl } })
      out.researched += 1
      limitations.forEach((detail) => out.limitations.push({ companyId, contactId: contact.id, detail }))
      await writeAudit(db, { actorType: 'system', actorId: 'recipient-research', action: 'contact.researched', subjectType: 'Contact', subjectId: contact.id, metadata: { identityVerified, hooks: hooks.length, citedEvidenceIds, limitations } })
      if (identityVerified) { out.selected.push({ companyId, contactId: contact.id }); break }
      out.blockers.push({ companyId, contactId: contact.id, reason: 'recipient_identity_unverified', detail: limitations.join(' ') })
    }
    if (!out.selected.some((row) => row.companyId === companyId)) out.blockers.push({ companyId, reason: 'recipient_research_incomplete', detail: 'No named identity verified and no suitable role inbox found within the bounded research.' })
  }
  return out
}

async function personEvidence(db: Db, input: { companyId: string; companyDomain: string; contactId: string; url: string; excerpt: string; now: Date }): Promise<{ id: string }> {
  const contentHash = contentHashOf({ url: input.url, excerpt: input.excerpt, contactId: input.contactId })
  const existing = await db.evidence.findFirst({ where: { companyId: input.companyId, contactId: input.contactId, sourceUrl: input.url, contentHash }, select: { id: true } })
  if (existing) return existing
  const employerSource = isCompanyDomain(`source@${new URL(input.url).hostname}`, input.companyDomain)
  return db.evidence.create({ data: { companyId: input.companyId, contactId: input.contactId, sourceUrl: input.url, sourceType: employerSource ? 'company_page' : 'external_source', excerpt: input.excerpt.slice(0, 500), contentHash, observedAt: input.now, confidence: 0.9, fetchedVia: 'static_fetch' }, select: { id: true } })
}
