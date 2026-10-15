import type { Prisma, Evidence } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { recipientTask, recipientCandidateUrls, applyRecipientResearch } from './tasks.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { ensureCompanyResearchBudget } from '../../ingest/budget/company-budget.js'
import { fetchPage } from '../../ingest/fetch-page.js'
import { curateCompanyContacts } from './curate.js'
import { readImportedRow } from './verify-backfill.js'
import { observePersonPage } from './person-research.js'
import { recipientSuitability } from './suitability.js'
import { isCompanyDomain } from './classify.js'
import { recipientState, validPersonFacts, evidenceSnapshot, type PersonFact } from './verification.js'
import { preparationLimit } from '../review/context.js'
export type { PersonFact } from './verification.js'
export type PreparationBlocker = { companyId: string; contactId?: string; reason: string; detail: string }
export type PrepareRecipientsResult = { selected: { companyId: string; contactId: string }[]; blockers: PreparationBlocker[];
  researched: number; limitations: { companyId: string; contactId: string; detail: string }[]; taskIds: string[] }

/** Selected company IDs; default 20, maximum 100 companies / 8 pages per company per pass.
 * Resume reuses only current verified snapshots and matching manual tasks. No scoring/provider execution. */
export async function prepareRecipients(db: Db, gate: GatedFetcher, companyIds: string[],
  opts: { now?: Date; limit?: number; maxPages?: number; interPageDelayMs?: number } = {}): Promise<PrepareRecipientsResult> {
  const limit = preparationLimit(opts.limit), maxPages = preparationLimit(opts.maxPages ?? 4, 8), now = opts.now ?? new Date()
  const out: PrepareRecipientsResult = { selected: [], blockers: [], researched: 0, limitations: [], taskIds: [] }
  for (const companyId of [...new Set(companyIds)].slice(0, limit)) {
    const company = await db.company.findUnique({ where: { id: companyId }, include: { outreachAssessment: true } })
    const block = (reason: string, detail: string, contactId?: string) => out.blockers.push({ companyId, ...(contactId ? { contactId } : {}), reason, detail })
    if (!company) { block('unknown_company', 'Selected company no longer exists.'); continue }
    if (company.status === 'excluded' || /^(?:stopped|excluded|rejected|closed|paused)$/.test(company.outreachAssessment?.status ?? '')) { block('operator_stopped', 'Company research is stopped.'); continue }
    const selectedId = company.outreachAssessment?.selectedContactId
    const candidateUrls = await recipientCandidateUrls(db, companyId)
    let contacts = await db.contact.findMany({ where: { companyId }, orderBy: { id: 'asc' } })
    // Never replace a deliberate selection with another person, including a now-invalid selection.
    if (selectedId && !contacts.some((c) => c.id === selectedId && c.status === 'active')) { block('selected_contact_stopped', 'Deliberately selected contact is unavailable or stopped.', selectedId); continue }
    const selected = selectedId ? contacts.find((c) => c.id === selectedId) : null
    if (selected) {
      const state = await recipientState(db, selected, company.canonicalDomain, now)
      if (state.detail.includes('suppressed') || state.detail.includes('stopped')) { block('selected_contact_stopped', state.detail, selected.id); continue }
    }
    const companyStops = await db.suppression.findFirst({ where: { OR: [{ scope: 'global' }, { scope: 'domain', domain: company.canonicalDomain }] }, select: { id: true } })
    if (companyStops) { block('company_suppressed', 'Company or global suppression stops recipient preparation.'); continue }
    let pagesUsed = 0
    const cache = new Map<string, Awaited<ReturnType<typeof fetchPage>>>()
    const read = async (url: string) => {
      const prior = cache.get(url); if (prior) return prior
      if (pagesUsed >= maxPages) return { ok: false, reason: 'source_unavailable', detail: 'Bounded recipient page allowance reached.', fetches: 0 } as const
      if (cache.size) await new Promise((resolve) => setTimeout(resolve, opts.interPageDelayMs ?? 5200))
      pagesUsed++
      let result: Awaited<ReturnType<typeof fetchPage>>
      try { result = await fetchPage(gate, url, { companyId, cost: 1, sameHostDelayMs: opts.interPageDelayMs ?? 5200 }) }
      catch { result = { ok: false, reason: 'source_unavailable', detail: 'Source transport unavailable; resume later.', fetches: 0 } }
      cache.set(url, result); return result
    }
    if (!(await Promise.all(contacts.filter((c) => !selectedId || c.id === selectedId).map((c) => recipientState(db, c, company.canonicalDomain, now)))).some((s) => s.ready || s.detail.startsWith('Person identity'))) {
      const curated = await curateCompanyContacts(db, gate, company, { now, maxPages: Math.min(3, maxPages), candidateUrls, interPageDelayMs: opts.interPageDelayMs ?? 5200 })
      pagesUsed = curated.pagesAttempted
      // Curation counts toward this pass's page bound; no alternate transport or free research.
      for (const page of curated.pagesRead) cache.set(page.url, { ok: false, reason: 'source_unavailable', detail: 'Already read for contact curation; resume identity capture.', fetches: 0 })
      contacts = await db.contact.findMany({ where: { companyId }, orderBy: { id: 'asc' } })
      for (const refusal of curated.refusals) out.limitations.push({ companyId, contactId: '', detail: `${refusal.reason}: ${refusal.detail}` })
    }
    const knownStates = new Map<string, Awaited<ReturnType<typeof recipientState>>>()
    for (const c of contacts) knownStates.set(c.id, await recipientState(db, c, company.canonicalDomain, now))
    const candidates = contacts.filter((c) => !selectedId || c.id === selectedId).sort((a, b) => (knownStates.get(a.id)?.suitability.priority ?? 99) - (knownStates.get(b.id)?.suitability.priority ?? 99) || a.id.localeCompare(b.id)).slice(0, 10)
    if (!selectedId && contacts.length > 10) out.limitations.push({ companyId, contactId: '', detail: 'Inspected ten strongest contact candidates; explicitly select another recipient to resume beyond this bound.' })
    for (const contact of candidates) {
      if (contact.status !== 'active' || !contact.verified || contact.discoveryMethod === 'pattern_inferred' || (!contact.contactType.startsWith('named') && !recipientSuitability(contact).suitable)) {
        block('recipient_unsuitable', recipientSuitability(contact).reason, contact.id); continue
      }
      let state = await recipientState(db, contact, company.canonicalDomain, now)
      if (state.ready) {
        if (state.research) {
          const fingerprint = contentHashOf({ contact, facts: state.research.facts, hooks: state.research.hooks, citedEvidenceIds: state.research.citedEvidenceIds })
          const prior = await db.llmTask.findFirst({ where: { kind: 'contact_research', subjectId: `${contact.id}:${fingerprint}` }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
          if (prior) { out.taskIds.push(prior.id); await applyRecipientResearch(db, contact.id, prior.id); state = await recipientState(db, contact, company.canonicalDomain, now) }
        }
        if (!state.ready) { block('recipient_review_blocked', state.detail, contact.id); continue }
        out.selected.push({ companyId, contactId: contact.id })
        for (const detail of state.research?.limitations ?? ['Recruiting inbox; use a company hook without naming a person.']) out.limitations.push({ companyId, contactId: contact.id, detail })
        break
      }
      // No source work can make a suppressed/stopped/unverified route usable.
      if (!contact.contactType.startsWith('named') || !state.detail.startsWith('Person identity')) { block('route_unavailable', state.detail, contact.id); continue }
      let candidateName = contact.fullName, candidateIdentityUrl = contact.identitySourceUrl
      if (!candidateName) {
        const provenance = await db.evidence.findUnique({ where: { id: contact.evidenceId } })
        const imported = provenance ? readImportedRow({ ...provenance, emailNormalized: contact.emailNormalized }) : null
        if (imported?.ok) { candidateName = imported.cells['full_name']?.trim() || null; candidateIdentityUrl = imported.cells['source_url']?.trim() || null }
      }
      const facts: PersonFact[] = [], hooks: PersonFact[] = [], limitations: string[] = []
      const links = new Set<string>()
      let identityUrl: string | null = null
      if (!candidateName || candidateName.trim().split(/\s+/).length < 2) limitations.push('A disambiguated full public name is missing.')
      else {
        await ensureCompanyResearchBudget(db, companyId, company.countries, now)
        const urls = [...new Set([candidateIdentityUrl, ...candidateUrls, `https://${company.canonicalDomain}/team`, `https://${company.canonicalDomain}/about`].filter((u): u is string => !!u))]
          .filter((u) => { try { return new URL(u).protocol === 'https:' && isCompanyDomain(`source@${new URL(u).hostname}`, company.canonicalDomain) } catch { return false } })
        for (const url of urls) {
          const page = await read(url)
          if (!page.ok) { limitations.push(`${page.reason}: ${page.detail}`); continue }
          const observation = observePersonPage({ html: page.body, url: page.url, companyDomain: company.canonicalDomain, fullName: candidateName, publicTitle: contact.publicTitle })
          if (!observation.identityVerified || !observation.excerpt || (observation.publishedAt && observation.publishedAt > now)) continue
          identityUrl = page.url; observation.links.forEach((u) => links.add(u))
          const e = await personEvidence(db, company, contact.id, page.url, observation.excerpt, now, observation.publishedAt ?? null)
          facts.push({ ...fact(e, 'identity', false), ...(observation.identityRecord ? { identityRecord: observation.identityRecord } : {}) })
          if (observation.authorshipVerified && observation.workExcerpt) {
            const work = await personEvidence(db, company, contact.id, page.url, observation.workExcerpt, now, observation.publishedAt ?? null)
            hooks.push(fact(work, 'authorship', true))
          }
          break
        }
        for (const url of [...links].slice(0, 2)) {
          const page = await read(url)
          if (!page.ok) { limitations.push(`${page.reason}: ${page.detail}`); continue }
          const observation = observePersonPage({ html: page.body, url: page.url, companyDomain: company.canonicalDomain, fullName: candidateName, publicTitle: contact.publicTitle, employerLinked: !!identityUrl })
          if (!observation.authorshipVerified || !observation.workExcerpt || (observation.publishedAt && observation.publishedAt > now)) continue
          hooks.push(fact(await personEvidence(db, company, contact.id, page.url, observation.workExcerpt, now, observation.publishedAt ?? null), 'authorship', true))
        }
      }
      if (!hooks.length) limitations.push('Verified personal work is unavailable; use a company hook without attributing product work to this person.')
      if (!identityUrl) limitations.push('Current employment identity remains unverified; resume source research.')
      const citedEvidenceIds = [...new Set([...facts, ...hooks].flatMap((f) => f.evidenceIds))]
      const data = { companyId, identityStatus: identityUrl ? 'verified' : 'unverified', facts: facts as Prisma.InputJsonValue, hooks: hooks as Prisma.InputJsonValue,
        citedEvidenceIds, limitations, researchedAt: now, verifiedAt: identityUrl ? now : null }
      await db.contactResearch.upsert({ where: { contactId: contact.id }, create: { contactId: contact.id, ...data }, update: data })
      const updated = await db.contact.update({ where: { id: contact.id }, data: { identityVerifiedAt: identityUrl ? now : null, ...(identityUrl ? { identitySourceUrl: identityUrl, fullName: candidateName } : {}) } })
      out.researched++
      limitations.forEach((detail) => out.limitations.push({ companyId, contactId: contact.id, detail }))
      const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: contact.id } })
      const evidence = await db.evidence.findMany({ where: { companyId } })
      const verified = validPersonFacts(research, updated, evidence, now, company.canonicalDomain)
      const researchHash = contentHashOf({ contact: updated, facts: research.facts, hooks: research.hooks, citedEvidenceIds: research.citedEvidenceIds })
      const task = await recipientTask(db, { kind: 'contact_research', promptVersion: 'contact_research@1', subjectType: 'ContactResearch', subjectId: `${contact.id}:${researchHash}`,
        allowedEvidenceIds: citedEvidenceIds, allowedApprovedClaimIds: [], input: {
          company: { id: companyId, name: company.displayName, domain: company.canonicalDomain }, contactId: contact.id, fullName: candidateName, publicTitle: contact.publicTitle,
          verification: { identityVerified: verified, identityEvidenceIds: facts.flatMap((f) => f.evidenceIds), verifiedAuthorshipEvidenceIds: hooks.flatMap((f) => f.evidenceIds) },
          facts, hooks, limitations, instructions: 'Review the supplied captured excerpts. Preserve exact person/company bindings. Identity and authorship cannot be promoted by model labels. Do not invent work or addresses.',
        } })
      out.taskIds.push(task.taskId)
      await applyRecipientResearch(db, contact.id, task.taskId)
      await writeAudit(db, { actorType: 'system', actorId: 'recipient-research', action: 'contact.researched', subjectType: 'Contact', subjectId: contact.id, metadata: { identityVerified: verified, citedEvidenceIds, limitations, taskId: task.taskId } })
      state = await recipientState(db, updated, company.canonicalDomain, now)
      if (state.ready) { out.selected.push({ companyId, contactId: contact.id }); break }
      block('recipient_identity_unverified', state.detail, contact.id)
    }
    if (!out.selected.some((s) => s.companyId === companyId)) {
      const task = await recipientTask(db, { kind: 'research_urls', promptVersion: 'research_urls@1', subjectType: 'RecipientSearch', subjectId: companyId,
        allowedEvidenceIds: [], allowedApprovedClaimIds: [], input: { company: { id: companyId, name: company.displayName, domain: company.canonicalDomain },
          instructions: 'Suggest public employer identity/contact/work URLs only. These are unverified candidates, not evidence, names or inferred addresses. Capture through the gateway is required. No paid enrichment.' } })
      out.taskIds.push(task.taskId); block('recipient_research_incomplete', 'No reachable suitable recipient within this bounded pass. Resume research or supply public candidate URLs through manual handoff.')
    }
    // The selected recipient is persisted by draft preparation under a company lock.
  }
  return out
}
function fact(e: Evidence, observation: 'identity' | 'authorship', authorshipVerified: boolean): PersonFact {
  return { text: e.excerpt, evidenceIds: [e.id], authorshipVerified, observation, snapshots: [{ id: e.id, hash: evidenceSnapshot(e) }] }
}
async function personEvidence(db: Db, company: { id: string; canonicalDomain: string }, contactId: string, url: string, excerpt: string, now: Date, publishedAt: Date | null) {
  const text = excerpt.slice(0, 500), contentHash = contentHashOf({ url, excerpt: text, contactId })
  // Same immutable capture may be reused only at its real observation time; never refresh cache timestamps.
  const prior = await db.evidence.findFirst({ where: { companyId: company.id, contactId, sourceUrl: url, contentHash, observedAt: now } })
  if (prior) return prior
  return db.evidence.create({ data: { companyId: company.id, contactId, sourceUrl: url, sourceType: isCompanyDomain(`source@${new URL(url).hostname}`, company.canonicalDomain) ? 'company_page' : 'external_source',
    excerpt: text, contentHash, observedAt: now, publishedAt, confidence: 0.9, fetchedVia: 'static_fetch' } })
}
