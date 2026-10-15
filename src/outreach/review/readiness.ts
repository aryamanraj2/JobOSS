import type { Db } from '../../core/audit/audit-log.js'
import { supportSnapshot } from './snapshot.js'
import { currentCompanyContext, hasConcreteHook } from './context.js'
import { recipientState, personFacts } from '../contacts/verification.js'
import { isBoundEvidenceInScope } from '../draft/evidence-scope.js'
import { compositionEvidenceIds, compositionClaimIds, renderBody, validateComposition } from '../draft/message.js'
import { TEMPLATE_IDS, renderTemplate } from '../draft/templates.js'
import { draftSupportStatus } from '../draft/support.js'
import { runQualityGate } from '../draft/quality-gate.js'
import { validatePersonHook, isPersonAttribution } from '../draft/v5.js'
import { fixedCandidateV5Error, FIXED_V5_KEYS } from '../draft/fixed-v5.js'
import { listedRoleContextV5Error } from '../draft/role-v5.js'
import { wordCount, MAX_WORDS_V4, RESUME_LABEL, factCheck } from '../draft/email.js'
import { currentObservation } from '../../ingest/ats/verified.js'

const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
/** E injects this into B's callback. Transaction-scoped, read-only, no network/tasks/providers. */
export async function evaluateOutreachReadiness(db: Db, draftId: string, now: Date): Promise<{ ready: boolean; detail: string }> {
  const fail = (detail: string) => ({ ready: false, detail })
  const draft = await db.draft.findUnique({ where: { id: draftId }, include: { contact: true, resumeVersion: true, lead: { include: { opportunity: true } } } })
  if (!draft || draft.promptVersion !== 'outreach_draft@5') return fail('A current @5 revision is required.')
  if (!draft.contact || ['closed', 'sent', 'suppressed', 'scheduled', 'sending'].includes(draft.status)) return fail('Draft is closed, already in delivery, or lacks a recipient.')
  if (['rejected', 'deferred', 'excluded'].includes(draft.lead.status) || ['reply_received', 'reply_positive', 'reply_negative', 'reply_neutral', 'opt_out', 'hard_bounce', 'soft_bounce', 'wrong_contact'].includes(draft.lead.statusReason ?? '')) return fail('The lead has an operator stop or delivery stop.')
  const attempted = await db.sendAttempt.findFirst({ where: { OR: [{ draftId: draft.id }, { contactId: draft.contact.id, campaignCycle: draft.lead.campaignCycle }, { companyId: draft.lead.companyId, touchSlot: draft.touchSlot, campaignCycle: draft.lead.campaignCycle }] }, select: { id: true } })
  if (attempted) return fail('This recipient or company slot already has a send attempt in the current campaign.')
  if (draft.approvedAt) {
    const frozen = await db.auditLog.findFirst({ where: { action: 'draft.outreach_snapshot_approved', subjectType: 'Draft', subjectId: draft.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    const metadata = frozen?.metadata as { approvalHash?: string; supportHash?: string } | null
    if (!metadata || metadata.approvalHash !== draft.approvalHash || metadata.supportHash !== (await supportSnapshot(db, draft.id)).hash) return fail('Supporting snapshots changed since individual approval; withdraw approval and review again.')
  }
  const context = await currentCompanyContext(db, draft.lead.companyId, now)
  if (!context || !context.assessment.fit.supported || context.assessment.priority <= 0) return fail('Current supported company fit is missing or the company is stopped.')
  const selected = context.company.outreachAssessment
  if (selected?.selectedContactId && selected.selectedContactId !== draft.contact.id) {
    const marker = await db.auditLog.findFirst({ where: { action: 'draft.joboss_prepared', subjectType: 'Draft', subjectId: draft.id }, orderBy: { createdAt: 'desc' } })
    const metadata = marker?.metadata as { additionalContact?: boolean; primaryContactId?: string } | null
    if (!metadata?.additionalContact || metadata.primaryContactId !== selected.selectedContactId) return fail('The selected recipient changed; review a new revision.')
  }
  if (selected && /^(?:stopped|excluded|rejected|closed|paused)$/.test(selected.status)) return fail('Outreach research is stopped by the operator.')
  const recipient = await recipientState(db, draft.contact, context.company.canonicalDomain, now)
  if (!recipient.ready) return fail(recipient.detail)
  const validated = await validateComposition(db, draft.composition, TEMPLATE_IDS)
  if (!validated.ok) return fail(`${validated.problem}: ${validated.detail}`)
  const composition = validated.value
  if (composition.layout !== 'v5' || composition.promptVersion !== draft.promptVersion || composition.subject !== draft.subject || renderBody(composition) !== draft.bodyText ||
    !same(compositionEvidenceIds(composition), draft.citedEvidenceIds) || !same(compositionClaimIds(composition), draft.approvedClaimIds)) return fail('Draft text, citations and composition do not match exactly.')
  const cited = context.currentEvidence.filter((e) => draft.citedEvidenceIds.includes(e.id))
  const target = { ...context.company, companyId: context.company.id, contactId: draft.contact.id, verifiedPersonEvidenceIds: new Set(recipient.research?.citedEvidenceIds ?? []) }
  if (cited.length !== draft.citedEvidenceIds.length || cited.some((e) => !isBoundEvidenceInScope(e, target, e.id))) return fail('Draft evidence is stale, future dated, superseded or bound to the wrong entity.')
  const hook = composition.sentences.filter((s) => s.role === 'company' || s.role === 'person')
  if (!hook.some((s) => s.evidenceIds.some((id) => cited.some((e) => e.id === id && hasConcreteHook(e.excerpt))))) return fail('No concrete supported product/work hook.')
  if (draft.lead.leadKind === 'posted_role') {
    const role = context.currentRoles.find((o) => o.id === draft.lead.opportunityId)
    if (!role) return fail('Listed role is closed, stale, changed or lacks current verified ATS ownership.')
    const roleError = listedRoleContextV5Error(composition, role, cited)
    if (roleError) return fail(roleError)
  } else if (draft.outreachCase !== 'intern_availability_inquiry') return fail('Speculative outreach must honestly ask about availability.')
  const ties = composition.sentences.filter((s) => s.role === 'tie')
  if (!ties.length || ties.some((s) => !/\b(could|would|might|if)\b/i.test(s.text))) return fail('Contribution ideas must be explicitly conditional.')
  if (draft.lead.leadKind === 'speculative' && /\b(?:your|the|this) (?:open |advertised |available )?(?:vacancy|opening|internship position)\b|\byou(?:'re| are) hiring\b/i.test(`${draft.subject} ${draft.bodyText}`)) return fail('Speculative draft implies an unverified vacancy.')
  if (!draft.resumeVersion?.isActive || !draft.resumeVersion.linkUrl.startsWith('https://') || !composition.sentences.some((s) => s.role === 'resume_link' && s.text.includes(draft.resumeVersion!.linkUrl))) return fail('The active matching resume link is missing or changed.')
  const track = Object.entries(RESUME_LABEL).find(([, label]) => label === draft.resumeVersion?.label)?.[0]
  if (!track || (draft.resumeVersion.trackKey !== context.assessment.primaryTrack && !(context.assessment.primaryTrack === 'ios_android' && draft.resumeVersion.trackKey === 'ios_android'))) return fail('Resume does not match current supported fit.')
  const opener = composition.sentences.find((s) => s.role === 'opener')?.text ?? ''
  if ((track === 'ios' && /android/i.test(opener)) || (track === 'android' && /\biOS\b/.test(opener))) return fail('Draft platform does not match its resume.')
  if (wordCount(draft.bodyText ?? '') > MAX_WORDS_V4) return fail('Draft exceeds the 280-word ceiling.')
  for (const line of [...composition.sentences.filter((s) => s.role === 'person' || isPersonAttribution(s.text)), ...(isPersonAttribution(composition.subject) ? [{ text: composition.subject, evidenceIds: draft.citedEvidenceIds }] : [])]) {
    const errors = validatePersonHook({ text: line.text, evidenceIds: line.evidenceIds, contactId: draft.contact.id },
      { companyId: context.company.id, contactId: draft.contact.id, identityVerified: recipient.ready && !!recipient.research }, cited, personFacts(recipient.research?.hooks))
    if (errors.length) return fail(errors.join(' '))
  }
  const identities = await db.approvedClaim.findMany({ where: { key: { in: ['identity.full_name', 'identity.portfolio', 'identity.github'] }, isActive: true } })
  const name = identities.find((c) => c.key === 'identity.full_name')?.text
  if (!name) return fail('Approved candidate identity is unavailable.')
  const vars = { companyName: context.company.displayName, roleTitle: draft.lead.opportunity?.title ?? null, resumeUrl: draft.resumeVersion.linkUrl,
    candidateName: name, candidateFirstName: name.split(/\s+/)[0]!, recipientFirstName: draft.contact.fullName?.split(/\s+/)[0] ?? null,
    candidateLinks: ['identity.portfolio', 'identity.github'].map((k) => identities.find((c) => c.key === k)?.text.replace(/^https?:\/\//, '')).filter(Boolean).join(' · ') || null }
  for (const sentence of composition.sentences.filter((s) => s.source === 'deterministic' && s.templateId)) {
    try { if (renderTemplate(sentence.templateId!, vars) !== sentence.text) return fail('Fixed greeting, ask, resume or sign-off changed from its current approved inputs.') }
    catch { return fail('Fixed copy template is unavailable.') }
  }
  const claims = await db.approvedClaim.findMany({ where: { id: { in: draft.approvedClaimIds }, isActive: true } })
  if (claims.length !== draft.approvedClaimIds.length) return fail('Candidate claim was withdrawn.')
  if (factCheck(composition.subject, [...cited.map((e) => e.excerpt), ...claims.map((c) => c.text), context.company.displayName].join('\n')).length) return fail('Subject claims exceed the cited company facts and approved candidate claims.')
  const fixedClaims = await db.approvedClaim.findMany({ where: { key: { in: FIXED_V5_KEYS }, isActive: true } })
  const fixedError = fixedCandidateV5Error(composition, fixedClaims)
  if (fixedError) return fail(fixedError)
  if (composition.sentences.some((s) => s.source === 'deterministic' && !s.templateId && s.role !== 'intro' && s.role !== 'availability')) return fail('Unsupported deterministic claim role.')
  for (const s of composition.sentences.filter((s) => s.source === 'operator')) return fail(`Operator content needs a new supported revision: ${s.role}.`)
  for (const s of composition.sentences.filter((s) => s.source === 'llm')) {
    const source = [...cited.filter((e) => s.evidenceIds.includes(e.id)).map((e) => e.excerpt), ...claims.filter((c) => s.approvedClaimIds.includes(c.id)).map((c) => c.text), context.company.displayName].join('\n')
    if (factCheck(s.text, source).length) return fail('Generated facts exceed their exact source/approved project links.')
  }
  if (!currentObservation(new Date(composition.composedAt), now, 30)) return fail('The draft composition is stale or future dated.')
  const quality = runQualityGate({ subject: draft.subject ?? '', bodyText: draft.bodyText ?? '', composition, companyName: context.company.displayName }, now)
  if (!quality.passed) return fail(quality.checks.filter((c) => !c.passed).map((c) => c.detail).join('; '))
  const support = await draftSupportStatus(db, draft)
  return { ready: support.supported, detail: support.detail }
}
