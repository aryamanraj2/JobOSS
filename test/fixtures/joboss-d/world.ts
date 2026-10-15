import { testDb } from '../../helpers/db.js'
import { StubFetcher } from '../../helpers/fixtures.js'
import { seedApprovedClaims } from '../../../src/apply/claims/seed-claims.js'
import { seedCandidateProfile } from '../../../src/apply/claims/seed-profile.js'
import { prepareRecipients } from '../../../src/outreach/contacts/prepare.js'
import { prepareOutreachDrafts } from '../../../src/outreach/draft/prepare.js'
import { fulfilTask } from '../../../src/core/llm/handoff-gateway.js'
import { supportSentences, queueDraftSupport, type DraftSupportOutput } from '../../../src/outreach/draft/support.js'
import { DraftComposition } from '../../../src/outreach/draft/message.js'
import { listedRoleContextV5, listedRoleEvidenceV5 } from '../../../src/outreach/draft/role-v5.js'
import { MODULES } from '../../../src/outreach/draft/email.js'
import { proveBoard, boardSnapshot, syntheticJob } from '../discovery-support.js'
export const NOW = new Date('2026-10-15T00:00:00Z')
export async function dWorld(opts: { named?: boolean; domain?: string; name?: string; listed?: boolean; teamSize?: number | null; withLead?: boolean; personWork?: boolean } = {}) {
  const db = testDb(), domain = opts.domain ?? 'acme.example', name = opts.name ?? 'Acme'
  await seedApprovedClaims(db); await seedCandidateProfile(db, { sendingAccount: 'candidate@example.invalid' })
  let resume = await db.resumeVersion.findFirst({ where: { label: 'iOS / Android — iOS lead' } })
  resume ??= await db.resumeVersion.create({ data: { label: 'iOS / Android — iOS lead', trackKey: 'ios_android', linkUrl: 'https://cv.example/ios.pdf', fileSha256: 'a'.repeat(64) } })
  await db.roleTrack.upsert({ where: { key: 'ios_android' }, create: { key: 'ios_android', displayName: 'Mobile', positiveKeywords: ['Swift', 'iOS'], negativeKeywords: [], defaultResumeVersionId: resume.id }, update: { defaultResumeVersionId: resume.id } })
  const company = await db.company.create({ data: { canonicalDomain: domain, displayName: name, countries: [], locations: [], tags: [], teamSize: opts.teamSize === undefined ? 2 : opts.teamSize, ycBatch: 'W15' } })
  const product = await db.evidence.create({ data: { companyId: company.id, sourceUrl: `https://${domain}/product`, sourceType: 'company_page',
    excerpt: `${name} builds an iOS app in Swift and SwiftUI that reads receipts with an on-device Core ML model. The app keeps receipt data offline and shows each extracted amount before the user saves it.`,
    contentHash: 'synthetic-product', observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch' } })
  const second = await db.evidence.create({ data: { companyId: company.id, sourceUrl: `https://${domain}/engineering`, sourceType: 'company_page',
    excerpt: `${name} develops the mobile receipt review feature using SwiftUI. Its iOS app shows the original receipt beside extracted values, letting users check an amount before accepting it.`,
    contentHash: 'synthetic-second', observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch' } })
  let opportunityId: string | undefined
  if (opts.listed) {
    await proveBoard(company.id, NOW)
    await boardSnapshot(company.id, NOW, [syntheticJob('j1')])
    opportunityId = (await db.opportunity.findFirstOrThrow({ where: { companyId: company.id } })).id
  }
  const route = await db.evidence.create({ data: { companyId: company.id, sourceUrl: `https://${domain}/careers`, sourceType: 'company_page',
    excerpt: opts.named ? `Jamie Rao, Co-Founder & CEO. For engineering internship inquiries contact jamie@${domain}.` : `For engineering internship inquiries write to careers@${domain}.`,
    contentHash: 'synthetic-route', observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch' } })
  const contact = await db.contact.create({ data: { companyId: company.id, emailNormalized: `${opts.named ? 'jamie' : 'careers'}@${domain}`, contactType: opts.named ? 'named_employee' : 'careers_alias',
    verified: true, discoveryMethod: 'page_published', sourcePageKind: 'careers', publicTitle: opts.named ? 'Co-Founder & CEO' : null, fullName: opts.named ? 'Jamie Rao' : null,
    identitySourceUrl: opts.named ? `https://${domain}/team` : null, evidenceId: route.id, capturedAt: NOW } })
  const lead = opts.withLead === false ? null : await db.lead.create({ data: { companyId: company.id, ...(opportunityId ? { opportunityId } : {}), leadKind: opts.listed ? 'posted_role' : 'speculative',
    status: 'candidate', primaryTrack: 'ios_android', primaryTrackReason: 'Synthetic operator association; no scorer.', campaignCycle: '2026-10', citedEvidenceIds: [product.id, second.id] } })
  const body = `<html><head><title>${name} team</title></head><body><section data-person><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p>${opts.personWork === false ? '' : '<a href="https://writing.example/jamie/receipts">Jamie Rao</a>'}</section></body></html>`
  const article = `<html><head><title>Receipt review</title><script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', author: { '@type': 'Person', name: 'Jamie Rao' }, datePublished: '2026-10-01' })}</script></head><body><article><h1>Receipt review</h1><a rel="author">Jamie Rao</a><p>Our receipt review tool shows the original receipt beside each extracted value. Users can check uncertain amounts before saving. The app keeps the receipt and the model on the phone to work offline.</p><p>We describe the interface as a review step rather than an automatic acceptance. This article explains why keeping the source visible helps people correct extraction errors.</p></article></body></html>`
  const gate = new StubFetcher({ [`https://${domain}/team`]: { body }, 'https://writing.example/jamie/receipts': { body: article } })
  if (opts.named) await prepareRecipients(db, gate, [company.id], { now: NOW, interPageDelayMs: 0 })
  return { db, company, contact: await db.contact.findUniqueOrThrow({ where: { id: contact.id } }), lead, product, second, route, resume, gate }
}
export type DWorld = Awaited<ReturnType<typeof dWorld>>
export async function writerOutput(w: DWorld, person = false) {
  const claims = await w.db.approvedClaim.findMany(), id = (key: string) => claims.find((c) => c.key === key)!.id
  const research = await w.db.contactResearch.findUnique({ where: { contactId: w.contact.id } })
  const hooks = research?.hooks as { evidenceIds: string[] }[] | null
  const role = w.lead?.opportunityId ? await w.db.opportunity.findUnique({ where: { id: w.lead.opportunityId } }) : null
  const roleEvidence = role ? listedRoleEvidenceV5(role, await w.db.evidence.findMany({ where: { companyId: w.company.id, sourceType: 'ats', sourceUrl: role.roleUrl! } })) : []
  return {
    track: 'ios' as const, subject: `Intern who wants to build ${w.company.displayName}'s app`,
    tldr: { text: `I build iOS apps with on-device models and would like to help with ${w.company.displayName}'s receipt review.`, evidenceIds: [w.product.id], approvedClaimIds: [id('project.saldo.ios')] },
    hook: { text: `${role?.title ? `${listedRoleContextV5(role.title)} ` : ''}${w.company.displayName}'s app keeps receipt data offline and shows each extracted amount before users save it.`, evidenceIds: [w.product.id, w.second.id, ...roleEvidence.map((e) => e.id)], approvedClaimIds: [] },
    story: ['privacy_saldo', 'honest_aquasense'].map((key) => { const m = MODULES[key as 'privacy_saldo' | 'honest_aquasense']; return { text: m.text, evidenceIds: [], approvedClaimIds: m.claimKeys.map(id) } }),
    scene: { text: `For ${w.company.displayName}, I could help a user check an uncertain receipt amount against the original before saving it.`, evidenceIds: [w.product.id, w.second.id], approvedClaimIds: [] },
    ...(person && hooks?.[0] ? { personHook: { text: 'I read your article about keeping the original receipt visible while reviewing extracted values.', contactId: w.contact.id, evidenceIds: hooks[0].evidenceIds } } : {}),
  }
}
export async function prepareWritten(w: DWorld, person = false) {
  const opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true, campaignCycle: '2026-10' }
  const first = await prepareOutreachDrafts(w.db, opts)
  const draftId = first.draftIds[0]!
  if (!draftId) throw new Error(JSON.stringify(first))
  const task = await w.db.llmTask.findFirstOrThrow({ where: { kind: 'outreach_draft', subjectId: draftId } })
  const output = await writerOutput(w, person)
  const fulfilled = await fulfilTask(w.db, task.id, output, { now: NOW, fulfilledBy: 'synthetic-supplied-D-fixture' })
  if (!fulfilled.ok) throw new Error(JSON.stringify(fulfilled))
  const resumed = await prepareOutreachDrafts(w.db, opts)
  if (!resumed.draftIds.includes(draftId)) throw new Error(`Revision did not resume: ${JSON.stringify(resumed)}`)
  const draft = await w.db.draft.findUniqueOrThrow({ where: { id: draftId } })
  if (!draft.promptVersion) throw new Error(JSON.stringify(resumed))
  return { draftId, draft, first, resumed, writerTaskId: task.id, writerOutput: output }
}
export async function fulfillSupport(w: DWorld, draftId: string, verdict: 'supported' | 'uncertain' = 'supported') {
  const support = await queueDraftSupport(w.db, draftId)
  const draft = await w.db.draft.findUniqueOrThrow({ where: { id: draftId } })
  const composition = DraftComposition.parse(draft.composition)
  const output: DraftSupportOutput = { overall: verdict === 'supported' ? 'supported' : 'needs_research', limitations: ['Synthetic supplied support output; not real model-quality evidence.'],
    claims: supportSentences(composition).map((s) => ({ text: s.text, evidenceIds: s.evidenceIds, approvedClaimIds: s.approvedClaimIds,
      kind: s.role === 'person' ? 'person' : s.role === 'tie' ? 'hypothetical' : s.role === 'candidate' ? 'candidate' : 'company', verdict,
      reason: 'Synthetic fixture: exact statement supported by supplied excerpt/approved claim; conditional contribution remains hypothetical.' })) }
  const result = await fulfilTask(w.db, support.taskId, output, { now: NOW, fulfilledBy: 'synthetic-supplied-D-checker' })
  if (!result.ok) throw new Error(JSON.stringify(result))
  return { taskId: support.taskId, output }
}
