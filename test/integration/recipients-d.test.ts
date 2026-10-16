import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { dWorld, NOW, prepareWritten, fulfillSupport } from '../fixtures/joboss-d/world.js'
import { prepareRecipients } from '../../src/outreach/contacts/prepare.js'
import { prepareOutreachDrafts } from '../../src/outreach/draft/prepare.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { reviewSnapshot } from '../../src/outreach/review/snapshot.js'
import { outreachReview, outreachReviewQueue } from '../../src/outreach/review/queue.js'
import { reviewAction } from '../../src/outreach/review/actions.js'
import { gateDraft } from '../../src/outreach/draft/compose.js'
import { verifyApprovalHash } from '../../src/outreach/draft/approve.js'
import { queueDraftSupport, supportSentences } from '../../src/outreach/draft/support.js'
import { fulfilTask } from '../../src/core/llm/handoff-gateway.js'
import { DraftComposition } from '../../src/outreach/draft/message.js'
import { emailHmac } from '../../src/core/crypto/secret-store.js'
const db = testDb()
beforeEach(async () => { vi.restoreAllMocks(); mkdirSync('scratch/joboss-d-corrections-01', { recursive: true }); await truncateAll() })
afterAll(closeTestDb)

describe('D recipient research and resumable selection', () => {
  it('verifies a founder at a no-ATS older startup, records external work and resumes without network', async () => {
    const w = await dWorld({ named: true })
    const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
    expect(research.identityStatus).toBe('verified'); expect((research.hooks as unknown[]).length).toBe(1)
    expect(await db.evidence.count({ where: { contactId: w.contact.id, sourceType: 'external_source' } })).toBe(1)
    const gate = new StubFetcher({}), out = await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(out.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }]); expect(gate.requested).toEqual([])
  })
  it.each([null, 1000])('researches unknown or large company sizes without an ATS gate: %s', async (teamSize) => {
    const w = await dWorld({ teamSize }); expect((await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW })).selected).toHaveLength(1)
  })
  it('uses a company fallback for a verified person without authored work', async () => {
    const w = await dWorld({ named: true, personWork: false }); const out = await prepareWritten(w)
    expect((await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })).limitations.join()).toContain('company hook')
    expect(DraftComposition.parse(out.draft.composition).sentences.some((s) => s.role === 'person')).toBe(false)
  })
  it.each(['wrong_name', 'wrong_title', 'quoted', 'former'])('does not verify an ambiguous/incorrect employer identity: %s', async (mode) => {
    const w = await dWorld({ named: true })
    await db.contactResearch.deleteMany(); await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
    const text = mode === 'wrong_name' ? '<section><h2>Jamie Ray</h2><p>Co-Founder &amp; CEO</p></section>' : mode === 'wrong_title' ? '<section><h2>Jamie Rao</h2><p>Guest author from Otherco</p></section>' : mode === 'quoted' ? '<blockquote>Jamie Rao, Co-Founder &amp; CEO, says something.</blockquote>' : '<section><h2>Jamie Rao</h2><p>Former Co-Founder &amp; CEO</p></section>'
    const gate = new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${text}</body></html>` } })
    expect((await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })).selected).toHaveLength(0)
  })
  it('preserves a deliberate stopped selection instead of silently replacing it', async () => {
    const w = await dWorld(); await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    await db.contact.update({ where: { id: w.contact.id }, data: { status: 'retired' } })
    const gate = new StubFetcher({}), out = await prepareRecipients(db, gate, [w.company.id], { now: NOW })
    expect(out.blockers[0]?.reason).toBe('selected_contact_stopped'); expect(gate.requested).toEqual([])
  })
  it('chooses the strongest reachable contact, while respecting a deliberate recruiting selection', async () => {
    const w = await dWorld({ named: true }); const route = await db.evidence.create({ data: { ...w.route, id: randomUUID(), excerpt: 'Contact careers@acme.example about engineering internships.', sourceUrl: 'https://acme.example/recruiting' } })
    const inbox = await db.contact.create({ data: { companyId: w.company.id, emailNormalized: 'careers@acme.example', contactType: 'careers_alias', verified: true, discoveryMethod: 'page_published', evidenceId: route.id, capturedAt: NOW } })
    expect((await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW })).selected[0]?.contactId).toBe(w.contact.id)
    await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    await db.outreachAssessment.update({ where: { companyId: w.company.id }, data: { selectedContactId: inbox.id } })
    expect((await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW })).selected[0]?.contactId).toBe(inbox.id)
    await db.contact.update({ where: { id: w.contact.id }, data: { verified: false } })
    expect((await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW })).selected[0]?.contactId).toBe(inbox.id)
  })
  it.each(['robots_disallowed', 'budget_exhausted', 'source_unavailable'])('keeps a resumable honest blocker: %s', async (reason) => {
    const w = await dWorld({ named: true }); await db.contactResearch.deleteMany(); await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
    const gate = reason === 'source_unavailable' ? new StubFetcher({}) : new StubFetcher({}, { 'https://acme.example/team': reason as 'robots_disallowed' | 'budget_exhausted', 'https://acme.example/about': reason as 'robots_disallowed' | 'budget_exhausted' })
    const out = await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(out.selected).toHaveLength(0); expect(out.taskIds.length).toBeGreaterThan(0); expect(out.blockers.some((b) => b.reason === 'recipient_research_incomplete')).toBe(true)
  })
})

describe('D draft revisions, exact support and readiness', () => {
  it('completes speculative founder @5 through manually fulfilled writer/support tasks', async () => {
    const w = await dWorld({ named: true }), written = await prepareWritten(w, true)
    expect((await evaluateOutreachReadiness(db, written.draftId, NOW)).ready).toBe(false)
    const support = await fulfillSupport(w, written.draftId)
    expect(await gateDraft(db, written.draftId, NOW)).toMatchObject({ ok: true })
    expect(await evaluateOutreachReadiness(db, written.draftId, NOW)).toMatchObject({ ready: true })
    mkdirSync('scratch/joboss-d', { recursive: true })
    writeFileSync('scratch/joboss-d/synthetic-person.json', JSON.stringify({ recipient: w.contact, research: await db.contactResearch.findUnique({ where: { contactId: w.contact.id } }), draft: await db.draft.findUnique({ where: { id: written.draftId } }), output: written.writerOutput, support, review: await outreachReview(db, written.draftId, NOW) }, null, 2))
  })
  it('completes a current listed-role inquiry, then refuses changed/closed postings', async () => {
    const w = await dWorld({ listed: true }), written = await prepareWritten(w)
    await fulfillSupport(w, written.draftId)
    expect(await evaluateOutreachReadiness(db, written.draftId, NOW)).toMatchObject({ ready: true })
    await db.opportunity.updateMany({ where: { companyId: w.company.id }, data: { description: 'Changed description' } })
    expect((await evaluateOutreachReadiness(db, written.draftId, NOW)).detail).toContain('Listed role')
    await db.opportunity.updateMany({ where: { companyId: w.company.id }, data: { status: 'closed' } })
    expect((await evaluateOutreachReadiness(db, written.draftId, NOW)).ready).toBe(false)
  })
  it.each(['composing', 'closed', 'awaiting_approval', 'approved'] as const)('preserves all original fields for a legacy %s draft', async (status) => {
    const w = await dWorld()
    const original = await db.draft.create({ data: { leadId: w.lead!.id, contactId: w.contact.id, status, touchSlot: 3, revision: 1,
      subject: 'Original immutable subject', bodyText: 'Original immutable body', composition: { old: true }, promptVersion: status === 'composing' ? null : 'outreach_draft@4',
      approvedAt: status === 'approved' ? NOW : null, approvalHash: status === 'approved' ? 'old-frozen-hash' : null, approvedBy: status === 'approved' ? 'original reviewer' : null } })
    const out = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true })
    expect(await db.draft.findUnique({ where: { id: original.id } })).toEqual(original)
    if (status === 'closed') expect(out.blockers.some((b) => b.reason === 'draft_closed')).toBe(true)
    else { const revision = await db.draft.findUniqueOrThrow({ where: { id: out.draftIds[0]! } }); expect(revision).toMatchObject({ revisionOfId: original.id, revision: 2, touchSlot: 3, approvedAt: null, approvalHash: null, status: 'composing' }) }
  })
  it('repeats and competes idempotently, preserving Lead scoring/operator fields', async () => {
    const w = await dWorld(), before = await db.lead.findUnique({ where: { id: w.lead!.id } })
    const opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true }
    const [a, b] = await Promise.all([prepareOutreachDrafts(db, opts), prepareOutreachDrafts(db, opts)])
    expect(a.draftIds).toEqual(b.draftIds); expect(a.taskIds).toEqual(b.taskIds); expect(await db.draft.count()).toBe(1)
    expect(await db.lead.findUnique({ where: { id: w.lead!.id } })).toEqual(before)
    expect((await prepareOutreachDrafts(db, opts)).draftIds).toEqual(a.draftIds)
  })
  it('requires an explicit cycle for a new speculative FK and records unscored provenance', async () => {
    const w = await dWorld({ withLead: false })
    expect((await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })).blockers[0]?.reason).toBe('campaign_cycle_required')
    const result = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW, campaignCycle: '2026-10' })
    expect(result.draftIds).toHaveLength(1); expect(await db.lead.findFirst()).toMatchObject({ score: null, scoreVersionId: null, status: 'candidate', leadKind: 'speculative' })
    expect(await db.auditLog.count({ where: { action: 'lead.speculative_association_created' } })).toBe(1)
  })
  it.each(['excerpt', 'hash', 'claim', 'resume', 'recipient', 'identity', 'stale', 'future', 'superseded', 'fit', 'suppressed'])('unchanged text loses readiness after current support changes: %s', async (mutation) => {
    const previousSalt = process.env.SUPPRESSION_HMAC_SALT
    if (mutation === 'suppressed') process.env.SUPPRESSION_HMAC_SALT = 'joboss-d-synthetic-suppression-salt'
    try {
      const w = await dWorld({ named: true }), { draftId } = await prepareWritten(w, true); await fulfillSupport(w, draftId)
      expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
      if (mutation === 'excerpt') await db.evidence.update({ where: { id: w.product.id }, data: { excerpt: `${w.product.excerpt} Changed claim.` } })
      if (mutation === 'hash') await db.evidence.update({ where: { id: w.product.id }, data: { contentHash: 'changed' } })
      if (mutation === 'claim') await db.approvedClaim.update({ where: { key: 'project.saldo.ios' }, data: { text: 'Changed approved candidate fact' } })
      if (mutation === 'resume') await db.resumeVersion.update({ where: { id: w.resume.id }, data: { fileSha256: 'b'.repeat(64) } })
      if (mutation === 'recipient') await db.contact.update({ where: { id: w.contact.id }, data: { emailNormalized: 'other@acme.example' } })
      if (mutation === 'identity') await db.evidence.updateMany({ where: { contactId: w.contact.id }, data: { excerpt: 'Same-name person at Otherco' } })
      if (mutation === 'stale' || mutation === 'future') await db.evidence.update({ where: { id: w.product.id }, data: { observedAt: new Date(NOW.getTime() + (mutation === 'future' ? 1 : -61 * 86400000)) } })
      if (mutation === 'superseded') await db.evidence.create({ data: { ...w.product, id: randomUUID(), observedAt: new Date(NOW.getTime() + 1), excerpt: 'Newer changed capture' } }); else if (mutation === 'fit') await db.evidence.updateMany({ where: { companyId: w.company.id, contactId: null }, data: { excerpt: 'Unrelated generic company' } })
      if (mutation === 'suppressed') await db.suppression.create({ data: { emailHmac: emailHmac(w.contact.emailNormalized, process.env.SUPPRESSION_HMAC_SALT!), scope: 'contact', reasonCode: 'opt_out' } })
      expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
    } finally {
      if (mutation === 'suppressed') {
        if (previousSalt === undefined) delete process.env.SUPPRESSION_HMAC_SALT
        else process.env.SUPPRESSION_HMAC_SALT = previousSalt
      }
    }
    if (mutation === 'suppressed') expect(process.env.SUPPRESSION_HMAC_SALT === previousSalt).toBe(true)
  })
  it('rejects partial coverage, changed citations, uncertain semantics and omitted subject through production fulfilment', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w), support = await queueDraftSupport(db, draftId)
    const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
    const claims = supportSentences(DraftComposition.parse(draft.composition)).map((s) => ({ ...s, kind: 'company', verdict: 'supported', reason: 'synthetic' }))
    expect((await fulfilTask(db, support.taskId, { claims: claims.slice(1), overall: 'supported', limitations: [] }, { now: NOW })).ok).toBe(false)
    expect((await fulfilTask(db, support.taskId, { claims: claims.map((c, i) => i ? c : { ...c, evidenceIds: [] }), overall: 'supported', limitations: [] }, { now: NOW })).ok).toBe(false)
    expect((await fulfilTask(db, support.taskId, { claims: claims.map((c, i) => i ? c : { ...c, verdict: 'uncertain' }), overall: 'supported', limitations: [] }, { now: NOW })).ok).toBe(false)
    await fulfillSupport(w, draftId, 'uncertain'); expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
  })
  it('runs readiness in an actual READ ONLY transaction without tasks, audits or other writes', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId)
    const tasks = await db.llmTask.findMany(), audit = await db.auditLog.count()
    await db.$transaction(async (tx) => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; expect(await evaluateOutreachReadiness(tx, draftId, NOW)).toMatchObject({ ready: true }) })
    expect(await db.llmTask.findMany()).toEqual(tasks); expect(await db.auditLog.count()).toBe(audit)
  })
  it('reviews exact snapshots, refuses changes, approves once and preserves B atomic revoke contract', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    const before = await reviewSnapshot(db, draftId)
    await db.resumeVersion.update({ where: { id: w.resume.id }, data: { fileSha256: 'b'.repeat(64) } })
    expect(await reviewAction(db, { draftId, snapshot: before, by: 'synthetic reviewer', action: 'approve', now: NOW })).toMatchObject({ ok: false, detail: expect.stringContaining('snapshot changed') })
    expect((await db.draft.findUniqueOrThrow({ where: { id: draftId } })).approvedAt).toBeNull()
    await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    const result = await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic reviewer', action: 'approve', now: NOW })
    expect(result.ok).toBe(true); expect(await verifyApprovalHash(db, draftId)).toEqual({ matches: true })
    const approved = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
    expect((await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic reviewer', action: 'revoke' })).ok).toBe(true)
    expect(await db.draft.findUniqueOrThrow({ where: { id: draftId } })).toMatchObject({ status: 'composing', approvalHash: null, approvedAt: null, approvedBy: null, senderIdentity: null })
    expect((await db.auditLog.findFirstOrThrow({ where: { action: 'draft.approval_revoked' } })).metadata).toMatchObject({ revokedHash: approved.approvalHash, approvedBy: 'synthetic reviewer' })
  })
  it('renders queue states from actual persisted pending/blocked/ready revisions', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w)
    expect((await outreachReview(db, draftId, NOW))?.state).toBe('pending')
    await fulfillSupport(w, draftId, 'uncertain'); expect((await outreachReview(db, draftId, NOW))?.state).toBe('blocked')
    const newer = await queueDraftSupport(db, draftId)
    // A fulfilled needs-research check must not be overwritten to make it green.
    expect((await db.llmTask.findUniqueOrThrow({ where: { id: newer.taskId } })).status).toBe('fulfilled')
    expect(await outreachReviewQueue(db, { now: NOW })).toHaveLength(1)
  })
})

describe('D additional preservation and resumption boundaries', () => {
  it('creates an explicit new written revision with a fresh approval and idempotent resume', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    expect((await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic reviewer', action: 'approve', now: NOW })).ok).toBe(true)
    const before = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
    const opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true, reviseDraftId: draftId }
    const a = await prepareOutreachDrafts(db, opts), b = await prepareOutreachDrafts(db, opts)
    expect(a.draftIds).toEqual(b.draftIds); expect(a.draftIds[0]).not.toBe(draftId)
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(before)
    expect(await db.draft.findUnique({ where: { id: a.draftIds[0]! } })).toMatchObject({ revisionOfId: draftId, revision: 2, approvedAt: null, approvalHash: null })
  })
  it('allows additional independently reviewed contacts with distinct slots and preserved primary selection', async () => {
    const w = await dWorld({ named: true })
    const route = await db.evidence.create({ data: { ...w.route, id: randomUUID(), excerpt: 'Engineering internships: careers@acme.example', sourceUrl: 'https://acme.example/recruiting' } })
    const second = await db.contact.create({ data: { companyId: w.company.id, emailNormalized: 'careers@acme.example', contactType: 'careers_alias', verified: true, discoveryMethod: 'page_published', evidenceId: route.id, capturedAt: NOW } })
    const opts = { companyIds: [w.company.id], limit: 1, additionalContacts: 2, now: NOW, upgradeExisting: true }
    const out = await prepareOutreachDrafts(db, opts)
    expect(out.draftIds).toHaveLength(2)
    const drafts = await db.draft.findMany({ orderBy: { touchSlot: 'asc' } })
    expect(drafts.map((d) => d.contactId)).toEqual([w.contact.id, second.id]); expect(drafts.map((d) => d.touchSlot)).toEqual([0, 1])
    expect((await db.outreachAssessment.findUniqueOrThrow({ where: { companyId: w.company.id } })).selectedContactId).toBe(w.contact.id)
    expect((await prepareOutreachDrafts(db, opts)).draftIds).toEqual(out.draftIds)
  })
  it('does not apply a fulfilled writer task after its source changes or overwrite an existing written revision', async () => {
    const w = await dWorld(), opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true }
    const initial = await prepareOutreachDrafts(db, opts), draftId = initial.draftIds[0]!
    const { writerOutput } = await import('../fixtures/joboss-d/world.js')
    const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'outreach_draft', subjectId: draftId } })
    await fulfilTask(db, task.id, await writerOutput(w), { now: NOW, fulfilledBy: 'synthetic supplied output' })
    const before = await db.draft.findUnique({ where: { id: draftId } })
    await db.evidence.update({ where: { id: w.product.id }, data: { contentHash: 'changed after task' } })
    const { applyOutreachDraft } = await import('../../src/outreach/draft/queue-draft.js')
    expect(await applyOutreachDraft(db, task.id)).toMatchObject({ merged: false, reason: 'work_changed' })
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(before)
  })
  it('honors a manual contact-review uncertainty rather than promoting its verified label', async () => {
    const w = await dWorld({ named: true })
    const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'contact_research' } })
    expect((await fulfilTask(db, task.id, { identityStatus: 'uncertain', facts: [], hooks: [], limitations: ['Synthetic ambiguity needs another source.'] }, { now: NOW })).ok).toBe(true)
    const out = await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW })
    expect(out.selected).toHaveLength(0); expect((await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })).identityStatus).toBe('uncertain')
  })
  it.each(['route_stale', 'identity_future', 'research_stale', 'wrong_company', 'unknown_responsibility', 'commercial_only'])('keeps recipient readiness blocked for %s', async (mode) => {
    const w = await dWorld({ named: true }), { draftId } = await prepareWritten(w, true); await fulfillSupport(w, draftId)
    if (mode === 'route_stale') await db.contact.update({ where: { id: w.contact.id }, data: { capturedAt: new Date(NOW.getTime() - 31 * 86400000) } })
    if (mode === 'identity_future') await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: new Date(NOW.getTime() + 1) } })
    if (mode === 'research_stale') await db.contactResearch.update({ where: { contactId: w.contact.id }, data: { researchedAt: new Date(NOW.getTime() - 31 * 86400000) } })
    if (mode === 'wrong_company') await db.evidence.update({ where: { id: w.product.id }, data: { companyId: null } })
    if (mode === 'unknown_responsibility') await db.contact.update({ where: { id: w.contact.id }, data: { publicTitle: null } })
    if (mode === 'commercial_only') await db.contact.update({ where: { id: w.contact.id }, data: { publicTitle: 'Field Engineer' } })
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
  })
  it.each([0, -1, 101, 1.5])('refuses invalid bounds before preparation writes: %s', async (limit) => {
    await expect(prepareOutreachDrafts(db, { companyIds: [], limit, now: NOW })).rejects.toThrow('limit')
    expect(await db.draft.count()).toBe(0)
  })
})

it('uses verified employer product responsibility behind a commercial title in the actual preparation path', async () => {
  const w = await dWorld({ named: true }); await db.contact.update({ where: { id: w.contact.id }, data: { publicTitle: 'Field Engineer', identityVerifiedAt: null } })
  const gate = new StubFetcher({ 'https://acme.example/team': { body: '<html><body><section><h2>Jamie Rao</h2><p>Field Engineer</p><p>Jamie Rao builds the iOS SDK product for our mobile app.</p></section></body></html>' } })
  const out = await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
  expect(out.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }])
})
it('captures manually supplied candidate URLs before using a newly found recruiting inbox', async () => {
  const w = await dWorld(); await db.contact.deleteMany()
  const first = await prepareRecipients(db, new StubFetcher({}), [w.company.id], { now: NOW, maxPages: 3, interPageDelayMs: 0 })
  const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'research_urls', subjectId: w.company.id } })
  expect(first.selected).toHaveLength(0)
  const candidate = 'https://acme.example/people/opportunities'
  expect((await fulfilTask(db, task.id, { urls: [{ url: candidate, purpose: 'Synthetic employer public internship route' }], limitations: [] }, { now: NOW })).ok).toBe(true)
  expect(await db.contact.count()).toBe(0)
  const gate = new StubFetcher({ [candidate]: { body: '<html><body><p>Engineering internship inquiries: careers@acme.example</p></body></html>' } })
  const resumed = await prepareRecipients(db, gate, [w.company.id], { now: NOW, maxPages: 3, interPageDelayMs: 0 })
  expect(resumed.selected).toHaveLength(1); expect(gate.requested).toEqual([candidate])
  const contact = await db.contact.findFirstOrThrow(); expect(contact.fullName).toBeNull()
  expect(await db.evidence.findUnique({ where: { id: contact.evidenceId } })).toMatchObject({ sourceUrl: candidate, excerpt: expect.stringContaining('careers@acme.example') })
})
it('charges positive credits through the production gateway and resumes under quota without opening another socket', async () => {
  const w = await dWorld({ named: true, personWork: false }); await db.contactResearch.deleteMany(); await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
  const { FetchPolicyGate } = await import('../../src/core/policy/fetch-policy-gate.js'), { mockAgent } = await import('../setup.js')
  await db.hostPolicy.create({ data: { host: 'acme.example', mode: 'allow', origin: 'derived_company' } })
  await db.researchBudget.create({ data: { companyId: null, periodMonth: NOW.toISOString().slice(0, 7), creditsCap: 1, billedUsdCap: 0 } })
  const pool = mockAgent.get('https://acme.example')
  pool.intercept({ path: '/robots.txt', method: 'GET' }).reply(200, 'User-agent: *\nAllow: /').persist()
  pool.intercept({ path: '/team', method: 'GET' }).reply(200, '<html><body><section><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p></section></body></html>')
  const gate = new FetchPolicyGate(db, { userAgent: 'synthetic-test', robotsTtlSeconds: 3600, defaultRateDelayMs: 0 })
  const first = await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
  expect(first.selected).toHaveLength(1)
  const global = await db.researchBudget.findFirstOrThrow({ where: { companyId: null } }); expect(global.creditsSpent).toBe(1)
  const resumed = await prepareRecipients(db, gate, [w.company.id], { now: NOW, interPageDelayMs: 0 })
  expect(resumed.selected).toHaveLength(1); expect((await db.researchBudget.findUniqueOrThrow({ where: { id: global.id } })).creditsSpent).toBe(1)
})
it('keeps an approved email unready after evidence changes even if another support task is fulfilled', async () => {
  const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
  expect((await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic reviewer', action: 'approve', now: NOW })).ok).toBe(true)
  expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
  await db.evidence.update({ where: { id: w.product.id }, data: { contentHash: 'changed after approval' } })
  await fulfillSupport(w, draftId)
  expect(await evaluateOutreachReadiness(db, draftId, NOW)).toMatchObject({ ready: false, detail: expect.stringContaining('since individual approval') })
})

describe('RD corrections: preserved-input regressions', () => {
  it('RD-1 refuses a neighboring person responsibility during capture and stored readiness', async () => {
    const w = await dWorld({ named: true, personWork: false })
    await db.contactResearch.deleteMany(); await db.evidence.deleteMany({ where: { contactId: w.contact.id } })
    await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
    await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@acme.example.' } })
    const html = '<section><div><h2>Jamie Rao</h2><p>Marketing analyst</p></div><div><h2>Alex Chen</h2><p>Co-Founder &amp; CEO</p></div></section>'
    const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${html}</body></html>` } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(out.selected).toHaveLength(0)
    const { recipientState } = await import('../../src/outreach/contacts/verification.js')
    expect((await recipientState(db, await db.contact.findUniqueOrThrow({ where: { id: w.contact.id } }), 'acme.example', NOW)).ready).toBe(false)
    expect((await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })).draftIds).toHaveLength(0)
  })
  it('RD-3 an old explicit anchor cannot reopen the latest closed revision', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w)
    const opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true, reviseDraftId: draftId }
    const next = await prepareOutreachDrafts(db, opts)
    expect(next.draftIds[0]).not.toBe(draftId)
    await db.draft.update({ where: { id: next.draftIds[0]! }, data: { status: 'closed' } })
    const rows = await db.draft.findMany(), tasks = await db.llmTask.findMany(), lead = await db.lead.findUnique({ where: { id: w.lead!.id } })
    const repeated = await prepareOutreachDrafts(db, opts)
    expect(repeated.blockers).toContainEqual(expect.objectContaining({ reason: 'draft_closed' }))
    expect(repeated.draftIds).toHaveLength(0); expect(repeated.taskIds).toHaveLength(0)
    expect(await db.draft.findMany()).toEqual(rows); expect(await db.llmTask.findMany()).toEqual(tasks)
    expect(await db.lead.findUnique({ where: { id: w.lead!.id } })).toEqual(lead)
  })
  it.each(['identity.full_name', 'education.year_of_study', 'education.degree', 'eligibility.internship_window'])('RD-4 current fixed facts refuse renewed synthetic support after %s changes', async (key) => {
    const w = await dWorld(), { draftId } = await prepareWritten(w)
    await fulfillSupport(w, draftId); expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
    await db.approvedClaim.update({ where: { key }, data: { text: key === 'identity.full_name' ? 'Another Candidate' : key === 'education.year_of_study' ? 'Graduated; no longer a student.' : key === 'education.degree' ? 'No university education claim is approved.' : 'Unavailable for internships during the stated windows.' } })
    await fulfillSupport(w, draftId)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
    expect((await gateDraft(db, draftId, NOW)).ok).toBe(false)
    expect((await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic fixed fact reviewer', action: 'approve', now: NOW })).ok).toBe(false)
  })
  it('RD-5 role-free supplied writer output cannot complete a listed inquiry', async () => {
    const w = await dWorld({ listed: true })
    const initial = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'outreach_draft', subjectId: initial.draftIds[0]! } })
    const { writerOutput } = await import('../fixtures/joboss-d/world.js')
    const output = await writerOutput(w); output.hook.text = `${w.company.displayName}'s app keeps receipt data offline and shows each extracted amount before users save it.`
    expect((await fulfilTask(db, task.id, output, { now: NOW })).ok).toBe(true)
    const { applyOutreachDraft } = await import('../../src/outreach/draft/queue-draft.js')
    expect(await applyOutreachDraft(db, task.id)).toMatchObject({ merged: false, reason: 'listed_role_context_missing' })
    expect((await evaluateOutreachReadiness(db, initial.draftIds[0]!, NOW)).ready).toBe(false)
  })
})

describe('RD-2 coherent displayed reviews', () => {
  it.each(['excerpt', 'email'])('retains the exact old display/token during a two-connection %s change and refuses its action', async (change) => {
    const w = await dWorld(), { draftId } = await prepareWritten(w)
    await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    const before = await outreachReview(db, draftId, NOW)
    let intercepted = false
    // Only schedule concurrent work. All reads and writes use production functions.
    const wrapped = new Proxy(db, { get(target, key, receiver) {
      if (key === '$transaction') return (fn: (tx: typeof db) => unknown, options: unknown) => target.$transaction(async (tx) => {
        const scheduled = new Proxy(tx, { get(client, modelKey) {
          if (modelKey === 'llmTask') return new Proxy(client.llmTask, { get(model, method) {
            if (method === 'findMany') return async (args: Parameters<typeof model.findMany>[0]) => {
              const rows = await model.findMany(args)
              if (!intercepted) {
                intercepted = true
                if (change === 'excerpt') await db.evidence.update({ where: { id: w.product.id }, data: { excerpt: `${w.product.excerpt} The receipt review screen also shows confidence.` } })
                else {
                  const row = await db.draft.findUniqueOrThrow({ where: { id: draftId } }), composition = DraftComposition.parse(row.composition)
                  composition.subject = `Intern interested in ${w.company.displayName}'s receipt app`
                  await db.draft.update({ where: { id: draftId }, data: { subject: composition.subject, composition } })
                }
                await fulfillSupport(w, draftId); expect((await gateDraft(db, draftId, NOW)).ok).toBe(true)
              }
              return rows
            }
            const value = Reflect.get(model, method); return typeof value === 'function' ? value.bind(model) : value
          } })
          const value = Reflect.get(client, modelKey); return typeof value === 'function' ? value.bind(client) : value
        } })
        return fn(scheduled as typeof db)
      }, options as { timeout: number; isolationLevel: 'RepeatableRead' })
      const value = Reflect.get(target, key, receiver); return typeof value === 'function' ? value.bind(target) : value
    } })
    const displayed = await outreachReview(wrapped, draftId, NOW)
    expect(intercepted).toBe(true); expect(displayed?.draft.subject).toBe(before?.draft.subject)
    expect(displayed?.evidence.find((e) => e.id === w.product.id)?.excerpt).toBe(w.product.excerpt)
    expect(displayed?.snapshot).toBe(before?.snapshot); expect(displayed?.readiness.ready).toBe(true)
    expect(displayed?.snapshot).not.toBe(await reviewSnapshot(db, draftId))
    const decision = await reviewAction(db, { draftId, snapshot: displayed!.snapshot, by: 'synthetic race reviewer', action: 'approve', now: NOW })
    expect(decision).toMatchObject({ ok: false, detail: expect.stringContaining('snapshot changed') })
    writeFileSync(`scratch/joboss-d-corrections-01/race-${change}.json`, JSON.stringify({ old: before, displayed, current: await outreachReview(db, draftId, NOW), decision, approvals: await db.auditLog.count({ where: { action: 'draft.approved' } }) }, null, 2))
    expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(0)
    expect((await db.draft.findUniqueOrThrow({ where: { id: draftId } })).approvedAt).toBeNull()
  })
  it('refuses READ COMMITTED caller scopes and supports explicit read-only repeatable scopes without writes', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId)
    const counts = [await db.llmTask.count(), await db.auditLog.count(), await db.draft.count()]
    await db.$transaction(async (tx) => { await expect(outreachReview(tx, draftId, NOW)).rejects.toThrow('READ COMMITTED'); expect(await tx.draft.count()).toBe(1) })
    await db.$transaction(async (tx) => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; expect((await outreachReview(tx, draftId, NOW))?.readiness.ready).toBe(true) }, { isolationLevel: 'RepeatableRead' })
    expect([await db.llmTask.count(), await db.auditLog.count(), await db.draft.count()]).toEqual(counts)
  })
})

describe('RD-1 and RD-4 capture and fixed fact contracts', () => {
  it('RD-1 refuses historical combined-person facts despite matching evidence hashes and timestamps', async () => {
    const w = await dWorld({ named: true }), { draftId } = await prepareWritten(w, true); await fulfillSupport(w, draftId)
    const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
    const { personFacts, evidenceSnapshot, recipientState } = await import('../../src/outreach/contacts/verification.js')
    const fact = personFacts(research.facts)[0]!, id = fact.evidenceIds[0]!
    const falseText = 'Jamie Rao Marketing analyst Alex Chen Co-Founder & CEO'
    const e = await db.evidence.update({ where: { id }, data: { excerpt: falseText } })
    const historical = { text: falseText, evidenceIds: [id], observation: 'identity', authorshipVerified: false, snapshots: [{ id, hash: evidenceSnapshot(e) }] }
    await db.contactResearch.update({ where: { contactId: w.contact.id }, data: { facts: [historical] } })
    const before = await db.contactResearch.findUnique({ where: { contactId: w.contact.id } }), tasks = await db.llmTask.count()
    expect((await recipientState(db, w.contact, 'acme.example', NOW)).ready).toBe(false)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
    expect(await db.contactResearch.findUnique({ where: { contactId: w.contact.id } })).toEqual(before)
    expect(await db.llmTask.count()).toBe(tasks)
  })
  it.each(['education.year_of_study', 'education.degree', 'identity.full_name', 'eligibility.internship_window'])('RD-4 initial preparation quotes current %s rather than historical fixed facts', async (key) => {
    const w = await dWorld()
    const text = key === 'identity.full_name' ? 'Another Candidate' : key === 'education.year_of_study' ? 'Graduated; no longer a student.' : key === 'education.degree' ? 'No university education claim is approved.' : 'Unavailable for internships during the earlier windows.'
    await db.approvedClaim.update({ where: { key }, data: { text } })
    const initial = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    const draft = await db.draft.findUniqueOrThrow({ where: { id: initial.draftIds[0]! } })
    const fixed = DraftComposition.parse(draft.composition).sentences.filter((s) => s.role === 'intro' || s.role === 'availability')
    expect(fixed.map((s) => s.text).join(' ')).toContain(text)
    const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'outreach_draft', subjectId: draft.id } })
    expect(JSON.stringify((task.input as { fixedCopy: unknown }).fixedCopy)).toContain(text)
    expect(fixed.map((s) => s.text)).not.toContain("I'm Aryaman, a third-year student at NSUT Delhi.")
  })
  it('RD-4 supplies all fixed candidate units and exact current claims, and refuses wrong candidate kinds', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w)
    const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId } }), composition = DraftComposition.parse(draft.composition)
    const task = await db.llmTask.findFirstOrThrow({ where: { kind: 'draft_support' } })
    const input = task.input as { sentences: { role: string; text: string; approvedClaimIds: string[] }[]; claims: { key: string; text: string }[] }
    for (const s of composition.sentences.filter((s) => s.source === 'deterministic' && !s.templateId)) {
      expect(input.sentences.filter((u) => u.role === 'candidate').map((u) => u.text).join(' ')).toContain(s.text)
      expect(input.sentences.filter((u) => u.text === s.text || s.text.includes(u.text)).every((u) => u.role === 'candidate')).toBe(true)
    }
    for (const key of ['identity.full_name', 'education.year_of_study', 'education.degree', 'eligibility.internship_window']) expect(input.claims.find((c) => c.key === key)?.text).toBe((await db.approvedClaim.findUniqueOrThrow({ where: { key } })).text)
    const output = { overall: 'supported', limitations: [], claims: supportSentences(composition).map((u) => ({ text: u.text, evidenceIds: u.evidenceIds, approvedClaimIds: u.approvedClaimIds, kind: 'company', verdict: 'supported', reason: 'Deliberately wrong candidate-kind fixture.' })) }
    expect((await fulfilTask(db, task.id, output, { now: NOW })).ok).toBe(true)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).detail).toContain('candidate-kind')
  })
  it('RD-4 approved fixed facts remain frozen after changes and renewed support', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    expect((await reviewAction(db, { draftId, snapshot: await reviewSnapshot(db, draftId), by: 'synthetic fixed review', action: 'approve', now: NOW })).ok).toBe(true)
    const before = await db.draft.findUnique({ where: { id: draftId } })
    await db.approvedClaim.update({ where: { key: 'education.degree' }, data: { text: 'No university education claim is approved.' } }); await fulfillSupport(w, draftId)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(before)
  })
})

describe('RD-5 real listed-role intent', () => {
  it.each(['iOS Engineer Intern', 'Senior iOS Platform Engineer'])('completes supplied task, merge, support, gate and review for %s', async (title) => {
    const w = await dWorld({ listed: true })
    const { boardSnapshot, syntheticJob } = await import('../fixtures/discovery-support.js')
    await boardSnapshot(w.company.id, NOW, [syntheticJob('j1', title)])
    const { draftId, writerTaskId } = await prepareWritten(w); const support = await fulfillSupport(w, draftId)
    expect((await db.llmTask.findUniqueOrThrow({ where: { id: writerTaskId } })).input).toMatchObject({ opportunityIntent: 'listed_role_inquiry', role: { title, requiredContext: expect.stringContaining(title) } })
    expect(support.output.claims.some((u) => u.text.includes(title) && u.evidenceIds.length > 0)).toBe(true)
    expect((await gateDraft(db, draftId, NOW)).ok).toBe(true)
    const review = await outreachReview(db, draftId, NOW)
    expect(review?.intent).toMatchObject({ kind: 'listed', title, supported: true }); expect(review?.readiness.ready).toBe(true)
    expect(review?.draft.bodyText).toContain(title)
    expect(review!.words).toBeLessThanOrEqual(280)
    if (title.startsWith('Senior')) { expect(review?.draft.bodyText).toContain('related engineering internship'); expect(review?.draft.bodyText).not.toContain('qualified for') }
    for (const mode of ['wrong-role', 'removed-context'] as const) {
      const composition = DraftComposition.parse(review?.draft.composition), hook = composition.sentences.find((s) => s.role === 'company')!
      hook.text = mode === 'wrong-role' ? hook.text.replace(title, 'Unrelated Sales Director') : hook.text.slice(hook.text.indexOf('. ') + 2)
      const { renderBody } = await import('../../src/outreach/draft/message.js')
      await db.draft.update({ where: { id: draftId }, data: { composition, bodyText: renderBody(composition) } }); await fulfillSupport(w, draftId)
      expect((await evaluateOutreachReadiness(db, draftId, NOW)).detail).toContain('Listed role context')
      expect((await outreachReview(db, draftId, NOW))?.intent.supported).toBe(false)
    }
  })
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
describe('RD-6 compatible D transaction order', () => {
  it('actual merge holds the draft before review, then enqueues support without a deadlock; fresh approval/revoke succeeds', async () => {
    const w = await dWorld(), initial = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    const draftId = initial.draftIds[0]!, task = await db.llmTask.findFirstOrThrow({ where: { kind: 'outreach_draft', subjectId: draftId } })
    const { writerOutput } = await import('../fixtures/joboss-d/world.js'), { applyOutreachDraft } = await import('../../src/outreach/draft/queue-draft.js')
    expect((await fulfilTask(db, task.id, await writerOutput(w), { now: NOW })).ok).toBe(true)
    const snapshot = await reviewSnapshot(db, draftId), held = deferred(), resume = deferred()
    const writer = db.$transaction(async (tx) => {
      let once = false
      const scheduled = new Proxy(tx, { get(target, key) {
        if (key === '$queryRaw') return async (...args: Parameters<typeof target.$queryRaw>) => {
          const result = await target.$queryRaw(...args)
          if (!once && String(args[0]).includes('FOR UPDATE')) { once = true; held.resolve(); await resume.promise }
          return result
        }
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
      } })
      return applyOutreachDraft(scheduled, task.id)
    }, { timeout: 15_000 })
    await held.promise
    let refused
    try { refused = await reviewAction(db, { draftId, snapshot, by: 'synthetic concurrent review', action: 'approve', now: NOW }) }
    finally { resume.resolve() }
    expect(refused).toMatchObject({ ok: false, detail: expect.stringContaining('busy') })
    expect(await writer).toMatchObject({ merged: true, draftId })
    expect(await db.llmTask.count({ where: { kind: 'draft_support' } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(0)
    expect((await reviewAction(db, { draftId, snapshot, by: 'synthetic stale review', action: 'approve', now: NOW })).ok).toBe(false)
    await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    expect((await reviewAction(db, { draftId, snapshot: (await outreachReview(db, draftId, NOW))!.snapshot, by: 'synthetic fresh review', action: 'approve', now: NOW })).ok).toBe(true)
    expect((await reviewAction(db, { draftId, snapshot: (await outreachReview(db, draftId, NOW))!.snapshot, by: 'synthetic fresh review', action: 'revoke', now: NOW })).ok).toBe(true)
    expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'draft.approval_revoked' } })).toBe(1)
  })
  it('preparation holds the company before review and completes without reopening or duplicate decisions', async () => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    const snapshot = await reviewSnapshot(db, draftId), held = deferred(), resume = deferred()
    const preparation = db.$transaction(async (tx) => {
      const scheduled = new Proxy(tx, { get(target, key) {
        if (key === '$queryRaw') return async (...args: Parameters<typeof target.$queryRaw>) => {
          const result = await target.$queryRaw(...args)
          if (String(args[0]).includes('FROM company') && String(args[0]).includes('FOR UPDATE')) { held.resolve(); await resume.promise }
          return result
        }
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
      } })
      return prepareOutreachDrafts(scheduled, { companyIds: [w.company.id], limit: 1, now: NOW })
    }, { timeout: 15_000 })
    await held.promise
    try { expect(await reviewAction(db, { draftId, snapshot, by: 'synthetic preparation review', action: 'approve', now: NOW })).toMatchObject({ ok: false, detail: expect.stringContaining('busy') }) }
    finally { resume.resolve() }
    expect((await preparation).draftIds).toContain(draftId)
    const current = await reviewSnapshot(db, draftId)
    const decisions = await Promise.all([1, 2].map(() => reviewAction(db, { draftId, snapshot: current, by: 'synthetic duplicate review', action: 'approve', now: NOW })))
    expect(decisions.filter((d) => d.ok)).toHaveLength(1)
    expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'draft.outreach_snapshot_approved' } })).toBe(1)
  })
  it.each(['draft', 'evidence'])('external %s locks cause a safe refusal and leave caller transaction usable', async (kind) => {
    const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    const snapshot = await reviewSnapshot(db, draftId), held = deferred(), resume = deferred()
    const blocker = db.$transaction(async (tx) => {
      if (kind === 'draft') await tx.$queryRaw`SELECT id FROM draft WHERE id = ${draftId} FOR UPDATE`
      else await tx.evidence.update({ where: { id: w.product.id }, data: { excerpt: `${w.product.excerpt} The user verifies a value.` } })
      held.resolve(); await resume.promise
    }, { timeout: 15_000 })
    await held.promise
    try {
      await db.$transaction(async (tx) => {
        expect(await reviewAction(tx, { draftId, snapshot, by: 'synthetic contention review', action: 'approve', now: NOW })).toMatchObject({ ok: false, detail: expect.stringContaining('busy') })
        expect(await tx.draft.count()).toBe(1)
      })
    } finally { resume.resolve(); await blocker }
    expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(0)
  })
})

it('RD-3 waits for an already-in-flight relevant closure and preserves all stopped rows/tasks', async () => {
  const w = await dWorld(), { draftId } = await prepareWritten(w)
  const opts = { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true, reviseDraftId: draftId }
  const next = await prepareOutreachDrafts(db, opts), latestId = next.draftIds[0]!, held = deferred(), resume = deferred(), waiting = deferred()
  const closure = db.$transaction(async (tx) => { await tx.draft.update({ where: { id: latestId }, data: { status: 'closed' } }); held.resolve(); await resume.promise }, { timeout: 15_000 })
  await held.promise
  const preparation = db.$transaction(async (tx) => {
    const scheduled = new Proxy(tx, { get(target, key) {
      if (key === '$queryRaw') return async (...args: Parameters<typeof target.$queryRaw>) => {
        if (String(args[0]).includes('FOR UPDATE OF d')) waiting.resolve()
        return target.$queryRaw(...args)
      }
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
    } })
    return prepareOutreachDrafts(scheduled, opts)
  }, { timeout: 15_000 })
  try { await waiting.promise } finally { resume.resolve() }
  await closure; const out = await preparation
  expect(out.blockers).toContainEqual(expect.objectContaining({ reason: 'draft_closed' })); expect(out.draftIds).toEqual([]); expect(out.taskIds).toEqual([])
  expect(await db.draft.count()).toBe(2); expect(await db.llmTask.count({ where: { kind: 'outreach_draft' } })).toBe(2)
  expect((await db.draft.findUniqueOrThrow({ where: { id: latestId } })).status).toBe('closed')
})

it('RD-2 a caller-owned old repeatable snapshot cannot approve newer unseen supporting rows', async () => {
  const w = await dWorld(), { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
  await db.$transaction(async (tx) => {
    const displayed = await outreachReview(tx, draftId, NOW)
    await db.evidence.update({ where: { id: w.product.id }, data: { excerpt: `${w.product.excerpt} The user verifies the original.` } }); await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    expect(await reviewAction(tx, { draftId, snapshot: displayed!.snapshot, by: 'synthetic old snapshot', action: 'approve', now: NOW })).toMatchObject({ ok: false, detail: expect.stringContaining('READ COMMITTED') })
  }, { isolationLevel: 'RepeatableRead' })
  expect((await db.draft.findUniqueOrThrow({ where: { id: draftId } })).approvedAt).toBeNull()
  expect(await db.auditLog.count({ where: { action: 'draft.approved' } })).toBe(0)
})

it('RD-3 a stopped chain does not stop other contacts, companies or an explicitly selected independent campaign', async () => {
  const w = await dWorld(), { draftId } = await prepareWritten(w)
  await db.draft.update({ where: { id: draftId }, data: { status: 'closed' } })
  const route = await db.evidence.create({ data: { ...w.route, id: randomUUID(), excerpt: 'Engineering internships: recruiting@acme.example', sourceUrl: 'https://acme.example/recruiting' } })
  const contact = await db.contact.create({ data: { companyId: w.company.id, emailNormalized: 'recruiting@acme.example', contactType: 'talent_alias', verified: true, discoveryMethod: 'page_published', evidenceId: route.id, capturedAt: NOW } })
  const otherContact = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, additionalContacts: 2, now: NOW, upgradeExisting: true })
  expect(otherContact.blockers.some((b) => b.reason === 'draft_closed')).toBe(true)
  expect(await db.draft.findUnique({ where: { id: otherContact.draftIds[0]! } })).toMatchObject({ contactId: contact.id, touchSlot: 1 })
  const independent = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, campaignCycle: 'explicit-independent-fixture', now: NOW })
  expect(independent.draftIds).toHaveLength(1)
  const independentDraft = await db.draft.findUniqueOrThrow({ where: { id: independent.draftIds[0]! }, include: { lead: true } })
  expect(independentDraft.lead.campaignCycle).toBe('explicit-independent-fixture')
  const other = await dWorld({ domain: 'independent.example', name: 'IndependentCo' })
  expect((await prepareOutreachDrafts(db, { companyIds: [other.company.id], limit: 1, now: NOW })).draftIds).toHaveLength(1)
  expect((await db.draft.findUniqueOrThrow({ where: { id: draftId } })).status).toBe('closed')
})

it('RD-1 neighboring prose cannot lend product responsibility to a commercial title', async () => {
  const w = await dWorld({ named: true, personWork: false })
  await db.contactResearch.deleteMany(); await db.evidence.deleteMany({ where: { contactId: w.contact.id } })
  await db.contact.update({ where: { id: w.contact.id }, data: { publicTitle: 'Field Engineer', identityVerifiedAt: null } })
  const html = '<section><h2>Jamie Rao</h2><p>Field Engineer</p><p>Alex Chen builds the iOS SDK product for our mobile app.</p></section>'
  const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${html}</body></html>` } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
  expect(out.selected).toHaveLength(0)
  const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
  expect((research.facts as { text: string }[]).map((f) => f.text).join(' ')).not.toContain('Alex Chen builds')
  expect((await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })).draftIds).toEqual([])
})

it('RD-5 old same-URL ATS evidence cannot support a changed current role even at the same observation time', async () => {
  const w = await dWorld({ listed: true })
  const old = await db.evidence.findMany({ where: { companyId: w.company.id, sourceType: 'ats' } })
  const { boardSnapshot, syntheticJob } = await import('../fixtures/discovery-support.js')
  await boardSnapshot(w.company.id, NOW, [syntheticJob('j1', 'Senior iOS Platform Engineer')])
  const { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId)
  expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
  const draft = await db.draft.findUniqueOrThrow({ where: { id: draftId } }), composition = DraftComposition.parse(draft.composition)
  composition.sentences.find((s) => s.role === 'company')!.evidenceIds = [w.product.id, w.second.id, ...old.map((e) => e.id)]
  const { renderBody, compositionEvidenceIds } = await import('../../src/outreach/draft/message.js')
  await db.draft.update({ where: { id: draftId }, data: { composition, bodyText: renderBody(composition), citedEvidenceIds: compositionEvidenceIds(composition) } }); await fulfillSupport(w, draftId)
  expect((await evaluateOutreachReadiness(db, draftId, NOW)).detail).toContain('Listed role context')
})

it.each(['similar-name', 'conflicting-records', 'structured-positive'])('RD-1 production capture binds one exact person record: %s', async (mode) => {
  const w = await dWorld({ named: true, personWork: false })
  await db.contactResearch.deleteMany(); await db.evidence.deleteMany({ where: { contactId: w.contact.id } }); await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
  await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@acme.example.' } })
  const html = mode === 'structured-positive' ? `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'Co-Founder & CEO', worksFor: { url: 'https://acme.example' } })}</script>` : `<section><div><h2>Jamie Rao</h2><p>Marketing analyst</p></div><div><h2>${mode === 'similar-name' ? 'Jamie Rao Singh' : 'Jamie Rao'}</h2><p>Co-Founder &amp; CEO</p></div></section>`
  const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${html}</body></html>` } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
  const { recipientState } = await import('../../src/outreach/contacts/verification.js')
  const state = await recipientState(db, await db.contact.findUniqueOrThrow({ where: { id: w.contact.id } }), 'acme.example', NOW)
  expect(state.ready).toBe(mode === 'structured-positive'); expect(out.selected).toHaveLength(mode === 'structured-positive' ? 1 : 0)
  const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
  expect(research.identityStatus).toBe(mode === 'structured-positive' ? 'verified' : 'unverified')
})

it('RD-1 preserves root employer identity for a published contact on an employer subdomain', async () => {
  const w = await dWorld({ named: true, personWork: false })
  const contact = await db.contact.update({ where: { id: w.contact.id }, data: { emailNormalized: 'jamie@careers.acme.example' } })
  await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@careers.acme.example.' } })
  const { recipientState } = await import('../../src/outreach/contacts/verification.js')
  expect((await recipientState(db, contact, 'acme.example', NOW)).ready).toBe(true)
})

const identityMetadata02 = (worksFor: unknown = { url: 'https://acme.example' }) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Jamie Rao', jobTitle: 'Co-Founder & CEO', worksFor })}</script>`
async function cleanIdentityWorld02() {
  const w = await dWorld({ named: true, personWork: false })
  await db.contactResearch.deleteMany(); await db.evidence.deleteMany({ where: { contactId: w.contact.id } })
  await db.contact.update({ where: { id: w.contact.id }, data: { identityVerifiedAt: null } })
  await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@acme.example.' } })
  return w
}
describe('RD-1a/RD-1b corrections 02 production capture', () => {
  it.each(['wrong-employer', 'quoted-structured'])('refuses the exact residual on a clean neutral route: %s', async (mode) => {
    const w = await cleanIdentityWorld02()
    const markup = mode === 'wrong-employer' ? identityMetadata02({ name: 'Otherco' }) : `<blockquote>${identityMetadata02()}</blockquote>`
    const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${markup}</body></html>` } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
    const { recipientState } = await import('../../src/outreach/contacts/verification.js')
    const state = await recipientState(db, await db.contact.findUniqueOrThrow({ where: { id: w.contact.id } }), 'acme.example', NOW)
    const tasks = await db.llmTask.findMany({ orderBy: { id: 'asc' } })
    const prepared = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    mkdirSync('scratch/joboss-d-corrections-02', { recursive: true })
    writeFileSync(`scratch/joboss-d-corrections-02/capture-${mode}.json`, JSON.stringify({ markup, out, state, prepared, drafts: await db.draft.findMany() }, null, 2))
    expect(out.selected).toHaveLength(0); expect(state.ready).toBe(false)
    expect(state.research?.identityStatus).toBe('unverified'); expect(prepared.draftIds).toEqual([]); expect(prepared.taskIds).toEqual([])
    expect(await db.draft.count()).toBe(0); expect(await db.llmTask.findMany({ orderBy: { id: 'asc' } })).toEqual(tasks)
    expect(await db.llmTask.count({ where: { kind: { in: ['outreach_draft', 'draft_support'] } } })).toBe(0)
  })
})

describe('RD-1a/RD-1b employer/context capture boundaries', () => {
  it.each([
    ['employer-name-string', identityMetadata02('Otherco')],
    ['matching-name-only', identityMetadata02({ name: 'Acme' })],
    ['conflicting-name-and-url', identityMetadata02({ name: 'Otherco', url: 'https://acme.example' })],
    ['unsupported-employer-array', identityMetadata02(['https://acme.example'])],
    ['missing-employer', '<script type="application/ld+json">{"@type":"Person","name":"Jamie Rao","jobTitle":"Co-Founder & CEO"}</script>'],
    ['nested-quotation', `<blockquote><div><section>${identityMetadata02()}</section></div></blockquote>`],
    ['embedded-code-example', `<pre><code>${identityMetadata02()}</code></pre>`],
    ['explicit-example-context', `<div data-example><section>${identityMetadata02()}</section></div>`],
    ['contradictory-structured-records', identityMetadata02() + identityMetadata02('https://otherco.example')],
    ['card-cannot-override-conflicting-metadata', '<section><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p></section>' + identityMetadata02({ name: 'Otherco' })],
    ['oversize-full-source', identityMetadata02() + ' '.repeat(32_001) + `<blockquote>${identityMetadata02()}</blockquote>`],
  ])('does not select or draft from %s', async (mode, markup) => {
    const w = await cleanIdentityWorld02()
    const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: `<html><body>${markup}</body></html>` } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
    const tasks = await db.llmTask.findMany({ orderBy: { id: 'asc' } })
    const { recipientState } = await import('../../src/outreach/contacts/verification.js')
    expect(out.selected).toEqual([])
    expect((await recipientState(db, await db.contact.findUniqueOrThrow({ where: { id: w.contact.id } }), 'acme.example', NOW)).ready).toBe(false)
    const draft = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW })
    expect(draft.draftIds).toEqual([]); expect(draft.taskIds).toEqual([]); expect(await db.draft.count()).toBe(0)
    expect(await db.llmTask.findMany({ orderBy: { id: 'asc' } })).toEqual(tasks)
    if (mode === 'oversize-full-source') expect(out.limitations.some((l) => l.detail.includes('32,000'))).toBe(true)
  })
  it.each([
    ['canonical-employer', identityMetadata02()],
    ['employer-subdomain', identityMetadata02({ url: 'https://careers.acme.example' })],
    ['URL-string', identityMetadata02('https://acme.example')],
    ['named-Organization', identityMetadata02({ '@type': 'Organization', name: 'Acme', url: 'https://acme.example' })],
    ['legitimate-and-quoted', identityMetadata02() + `<blockquote>${identityMetadata02({ name: 'Otherco' })}</blockquote>`],
    ['card-and-quoted', '<section><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p></section>' + `<blockquote>${identityMetadata02({ name: 'Otherco' })}</blockquote>`],
    ['graph-container', `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Organization', employee: { '@type': 'Person', name: 'Jamie Rao', jobTitle: 'Co-Founder & CEO', worksFor: { url: 'https://acme.example' } } }] })}</script>`],
  ])('retains %s through real writer/support/gate/final readiness', async (mode, markup) => {
    const w = await cleanIdentityWorld02(), html = `<html><body>${markup}</body></html>`
    const out = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: html } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(out.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }])
    const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
    const facts = research.facts as { identityRecord: { version: number; html: string }; evidenceIds: string[]; text: string }[]
    expect(facts[0]?.identityRecord).toEqual({ version: 3, html })
    const { identityCaptureHash } = await import('../../src/outreach/contacts/person-research.js')
    const evidence = await db.evidence.findUniqueOrThrow({ where: { id: facts[0]!.evidenceIds[0]! } })
    expect(evidence.contentHash).toBe(identityCaptureHash(evidence.sourceUrl, evidence.excerpt, w.contact.id, html))
    const { draftId } = await prepareWritten(w); await fulfillSupport(w, draftId)
    expect((await gateDraft(db, draftId, NOW)).ok).toBe(true)
    const before = await identityRows02()
    await db.$transaction(async (tx) => { await tx.$executeRaw`SET TRANSACTION READ ONLY`; expect((await evaluateOutreachReadiness(tx, draftId, NOW)).ready).toBe(true) })
    expect(await identityRows02()).toEqual(before)
    const view = await outreachReview(db, draftId, NOW)
    expect(view?.readiness.ready).toBe(true); expect(view?.recipientVerification.ready).toBe(true)
    mkdirSync('scratch/joboss-d-corrections-02', { recursive: true })
    writeFileSync(`scratch/joboss-d-corrections-02/positive-${mode}.json`, JSON.stringify({ html, research, evidence, view }, null, 2))
  })
})

async function identityRows02() {
  return { drafts: await db.draft.findMany({ orderBy: { id: 'asc' } }), tasks: await db.llmTask.findMany({ orderBy: { id: 'asc' } }),
    audit: await db.auditLog.findMany({ orderBy: { id: 'asc' } }), research: await db.contactResearch.findMany({ orderBy: { id: 'asc' } }),
    contact: await db.contact.findMany({ orderBy: { id: 'asc' } }), evidence: await db.evidence.findMany({ orderBy: { id: 'asc' } }) }
}

describe('RD-1a/RD-1b stored proof, compatibility and final readiness', () => {
  it.each(['current-wrong-employer-name', 'current-wrong-employer-string', 'current-conflicting-name-url', 'current-quoted', 'current-nested-example', 'current-conflicting-records',
    'old-wrong-employer', 'old-context-lost-script', 'old-context-lost-card', 'version-only-upgrade', 'missing', 'malformed-json', 'malformed-shape', 'unsupported-version', 'empty', 'oversize'])('refuses %s after fresh matching evidence/support, without validation writes', async (mode) => {
    const w = await dWorld({ named: true, personWork: false }), { draftId } = await prepareWritten(w)
    await fulfillSupport(w, draftId); await gateDraft(db, draftId, NOW)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
    const originalDraft = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
    await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@acme.example.' } })
    const research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
    const first = (research.facts as { evidenceIds: string[] }[])[0]!, id = first.evidenceIds[0]!
    const card = '<section><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p></section>'
    const markup = mode.includes('wrong-employer-name') || mode === 'old-wrong-employer' ? identityMetadata02({ name: 'Otherco' }) :
      mode === 'current-wrong-employer-string' ? identityMetadata02('Otherco') : mode === 'current-conflicting-name-url' ? identityMetadata02({ name: 'Otherco', url: 'https://acme.example' }) :
      mode === 'current-quoted' ? `<blockquote>${identityMetadata02()}</blockquote>` : mode === 'current-nested-example' ? `<pre><div>${identityMetadata02()}</div></pre>` :
      mode === 'current-conflicting-records' ? identityMetadata02() + identityMetadata02('https://otherco.example') : mode === 'old-context-lost-card' ? card : mode === 'malformed-json' ? '<script type="application/ld+json">not JSON</script>' : identityMetadata02()
    // Old v2 really discarded parents. These bare scripts/cards intentionally carry
    // no recovered quotation context. No safe wrapper is invented for them.
    const html = mode.startsWith('old-') || mode === 'version-only-upgrade' ? markup : mode === 'empty' ? '' : mode === 'oversize' ? `<html><body>${markup}${' '.repeat(32_001)}</body></html>` : `<html><body>${markup}</body></html>`
    const proof = mode === 'missing' ? undefined : mode === 'malformed-shape' ? { version: 3, html: 42 } : { version: mode.startsWith('old-') ? 2 : mode === 'unsupported-version' ? 99 : 3, html }
    const text = mode === 'old-context-lost-card' ? 'Jamie Rao Co-Founder & CEO' : 'Jamie Rao — Co-Founder & CEO.'
    const { identityCaptureHash } = await import('../../src/outreach/contacts/person-research.js')
    const { contentHashOf } = await import('../../src/core/evidence/content-hash.js')
    const { evidenceSnapshot, recipientState } = await import('../../src/outreach/contacts/verification.js')
    const url = 'https://acme.example/team'
    const e = await db.evidence.update({ where: { id }, data: { excerpt: text, observedAt: NOW,
      contentHash: mode.startsWith('old-') || mode === 'version-only-upgrade' ? contentHashOf({ url, excerpt: text, contactId: w.contact.id }) : identityCaptureHash(url, text, w.contact.id, html) } })
    const fact = { text, evidenceIds: [id], observation: 'identity', authorshipVerified: false, snapshots: [{ id, hash: evidenceSnapshot(e) }], ...(proof ? { identityRecord: proof } : {}) }
    await db.contactResearch.update({ where: { contactId: w.contact.id }, data: { identityStatus: 'verified', verifiedAt: NOW, researchedAt: NOW, facts: [fact], hooks: [], citedEvidenceIds: [id] } })
    await fulfillSupport(w, draftId)
    const before = await identityRows02()
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`
      return { state: await recipientState(tx, await tx.contact.findUniqueOrThrow({ where: { id: w.contact.id } }), 'acme.example', NOW), readiness: await evaluateOutreachReadiness(tx, draftId, NOW) }
    })
    expect(result.state.ready).toBe(false); expect(result.readiness.ready).toBe(false)
    expect(await identityRows02()).toEqual(before)
    const view = await outreachReview(db, draftId, NOW)
    expect(view?.recipientVerification.ready).toBe(false); expect(view?.readiness.ready).toBe(false)
    expect(await identityRows02()).toEqual(before)
    const prepared = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true })
    expect(prepared.draftIds).toEqual([]); expect(prepared.taskIds).toEqual([])
    expect(await identityRows02()).toEqual(before); expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(originalDraft)
    mkdirSync('scratch/joboss-d-corrections-02', { recursive: true })
    writeFileSync(`scratch/joboss-d-corrections-02/stored-${mode}.json`, JSON.stringify({ fact, evidence: e, result, prepared, preservedDraft: originalDraft, validationUnchanged: true }, null, 2))
  })
  it('requires deliberate recapture of an old proof, preserving the written draft throughout', async () => {
    const w = await dWorld({ named: true, personWork: false }), { draftId } = await prepareWritten(w)
    const original = await db.draft.findUniqueOrThrow({ where: { id: draftId } }), research = await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })
    const facts = research.facts as { text: string; evidenceIds: string[]; snapshots: { id: string; hash: string }[]; observation: string; authorshipVerified: boolean; identityRecord: { version: number; html: string } }[]
    facts[0]!.identityRecord = { version: 2, html: '<section><h2>Jamie Rao</h2><p>Co-Founder &amp; CEO</p></section>' }
    await db.contactResearch.update({ where: { contactId: w.contact.id }, data: { facts } })
    await fulfillSupport(w, draftId)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
    const html = `<html><body>${identityMetadata02()}</body></html>`
    const captured = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: html } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(captured.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }])
    await fulfillSupport(w, draftId)
    expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(true)
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
  })
})
// RD-1b corrections03: a valid base identity must not certify secondary work.
import { personFacts, evidenceSnapshot, recipientState, validPersonFacts, type PersonFact } from '../../src/outreach/contacts/verification.js'
import { observePersonPage, identityCaptureHash } from '../../src/outreach/contacts/person-research.js'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'

const fieldCard03 = (work: string = '') => `<html><body><section><h2>Jamie Rao</h2><p>Field Engineer</p>${work ? `<p>Jamie Rao ${work}</p>` : ''}</section></body></html>`
const productWork03 = 'builds the iOS mobile SDK product.'
type MixedMode03 = 'old-context-lost' | 'quoted-current' | 'substituted-current'
type World03 = Awaited<ReturnType<typeof dWorld>>
function record03(name: string, result: unknown) {
  const dir = `scratch/joboss-d-corrections-03/${process.env.JOBOSS_D_CORRECTION03_PHASE ?? 'final'}`
  mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${name}.json`, JSON.stringify(result, null, 2))
}
async function fieldWorld03() {
  const w = await dWorld({ named: true })
  const authored = personFacts((await db.contactResearch.findUniqueOrThrow({ where: { contactId: w.contact.id } })).hooks)
  await db.contactResearch.deleteMany()
  await db.evidence.deleteMany({ where: { contactId: w.contact.id, sourceType: 'company_page' } })
  await db.contact.update({ where: { id: w.contact.id }, data: { publicTitle: 'Field Engineer', identityVerifiedAt: null } })
  await db.evidence.update({ where: { id: w.route.id }, data: { excerpt: 'Engineering inquiries: jamie@acme.example.' } })
  const captured = await prepareRecipients(db, new StubFetcher({ 'https://acme.example/team': { body: fieldCard03(productWork03) } }), [w.company.id], { now: NOW, interPageDelayMs: 0 })
  expect(captured.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }])
  const p = await prepareWritten(w)
  await fulfillSupport(w, p.draftId); expect((await gateDraft(db, p.draftId, NOW)).ok).toBe(true)
  return { w, draftId: p.draftId, original: await db.draft.findUniqueOrThrow({ where: { id: p.draftId } }), authored }
}
async function fact03(w: World03, path: string, work = '', mode?: MixedMode03): Promise<PersonFact> {
  const url = `https://acme.example/${path}`, source = fieldCard03(work)
  const html = mode === 'quoted-current' ? `<html><body><blockquote>${source}</blockquote></body></html>` : mode === 'substituted-current' ? fieldCard03() : source
  const observed = observePersonPage({ html: source, url, companyDomain: 'acme.example', companyName: 'Acme', fullName: 'Jamie Rao', publicTitle: 'Field Engineer' })
  expect(observed.identityVerified).toBe(true)
  const text = observed.excerpt!
  const e = await db.evidence.create({ data: { companyId: w.company.id, contactId: w.contact.id, sourceUrl: url, sourceType: 'company_page', excerpt: text,
    contentHash: mode === 'old-context-lost' ? contentHashOf({ url, excerpt: text, contactId: w.contact.id }) : identityCaptureHash(url, text, w.contact.id, mode === 'substituted-current' ? source : html),
    observedAt: NOW, confidence: 0.9, fetchedVia: 'static_fetch' } })
  return { text, evidenceIds: [e.id], observation: 'identity', authorshipVerified: false, identityRecord: { version: mode === 'old-context-lost' ? 2 : 3, html }, snapshots: [{ id: e.id, hash: evidenceSnapshot(e) }] }
}
async function storeFacts03(w: World03, facts: PersonFact[], hooks: PersonFact[] = []) {
  await db.contactResearch.update({ where: { contactId: w.contact.id }, data: { facts, hooks, citedEvidenceIds: [...facts, ...hooks].flatMap((f) => f.evidenceIds) } })
}
async function rows03() {
  return { ...await identityRows02(), leads: await db.lead.findMany({ orderBy: { id: 'asc' } }), assessments: await db.outreachAssessment.findMany({ orderBy: { id: 'asc' } }), attempts: await db.sendAttempt.findMany({ orderBy: { id: 'asc' } }) }
}
async function read03(w: World03, draftId: string, name: string) {
  const before = await rows03()
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const contact = await tx.contact.findUniqueOrThrow({ where: { id: w.contact.id } })
    const research = await tx.contactResearch.findUniqueOrThrow({ where: { contactId: contact.id } })
    return { valid: validPersonFacts(research, contact, await tx.evidence.findMany({ where: { companyId: w.company.id } }), NOW, 'acme.example', 'Acme'),
      recipient: await recipientState(tx, contact, 'acme.example', NOW), readiness: await evaluateOutreachReadiness(tx, draftId, NOW), review: await outreachReview(tx, draftId, NOW) }
  }, { isolationLevel: 'RepeatableRead' })
  const after = await rows03()
  record03(name, { result, before, after, validationUnchanged: contentHashOf(before) === contentHashOf(after) })
  expect(after).toEqual(before)
  return result
}
describe('RD-1b per-fact responsibility binding', () => {
  it('keeps a current Field Engineer identity without product work unsuitable', async () => {
    const { w, draftId, original } = await fieldWorld03()
    await storeFacts03(w, [await fact03(w, 'team')]); await fulfillSupport(w, draftId)
    const out = await read03(w, draftId, 'no-work')
    expect(out.valid).toBe(true); expect(out.recipient.ready).toBe(false)
    expect(out.readiness.ready).toBe(false); expect(out.review?.readiness.ready).toBe(false)
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
  })
  describe.each(['old-context-lost', 'quoted-current', 'substituted-current'] as const)('%s secondary proof', (mode) => {
    it.each(['first', 'middle', 'last'] as const)('refuses mixed facts with the invalid work %s despite fresh support', async (position) => {
      const { w, draftId, original } = await fieldWorld03()
      const base = await fact03(w, 'team'), other = await fact03(w, 'people/jamie', 'maintains the documentation.'), bad = await fact03(w, 'engineering/jamie', productWork03, mode)
      const facts = position === 'first' ? [bad, base, other] : position === 'middle' ? [base, bad, other] : [base, other, bad]
      await storeFacts03(w, facts); await fulfillSupport(w, draftId)
      const out = await read03(w, draftId, `${mode}-${position}`)
      expect(out.valid).toBe(false); expect(out.recipient.ready).toBe(false); expect(out.recipient.suitability.suitable).toBe(false)
      expect(out.readiness.ready).toBe(false); expect(out.review?.recipientVerification.ready).toBe(false); expect(out.review?.readiness.ready).toBe(false)
      const before = await rows03()
      const blocked = await prepareOutreachDrafts(db, { companyIds: [w.company.id], limit: 1, now: NOW, upgradeExisting: true })
      expect(blocked.draftIds).toEqual([]); expect(blocked.taskIds).toEqual([]); expect(await rows03()).toEqual(before)
      expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
    })
    it('recaptures instead of selecting an invalid cached mix, then restores readiness without rewriting email', async () => {
      const { w, draftId, original } = await fieldWorld03()
      await storeFacts03(w, [await fact03(w, 'team'), await fact03(w, 'second-source', productWork03, mode)])
      await fulfillSupport(w, draftId)
      const beforeTasks = await db.llmTask.findMany({ where: { kind: { in: ['outreach_draft', 'draft_support'] } }, orderBy: { id: 'asc' } })
      const failedSources = new StubFetcher({})
      const blocked = await prepareRecipients(db, failedSources, [w.company.id], { now: NOW, interPageDelayMs: 0 })
      record03(`cache-${mode}`, { blocked, requests: failedSources.requested, original })
      expect(blocked.selected).toEqual([]); expect(blocked.researched).toBe(1); expect(blocked.blockers.length).toBeGreaterThan(0)
      expect(failedSources.requested.length).toBeGreaterThan(0); expect(failedSources.requested.length).toBeLessThanOrEqual(4)
      expect(await db.llmTask.findMany({ where: { kind: { in: ['outreach_draft', 'draft_support'] } }, orderBy: { id: 'asc' } })).toEqual(beforeTasks)
      expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
      const sources = new StubFetcher({ 'https://acme.example/team': { body: fieldCard03(productWork03) } })
      const captured = await prepareRecipients(db, sources, [w.company.id], { now: NOW, interPageDelayMs: 0 })
      expect(captured.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }]); expect(sources.requested).toContain('https://acme.example/team')
      expect((await evaluateOutreachReadiness(db, draftId, NOW)).ready).toBe(false)
      await fulfillSupport(w, draftId)
      const restored = await read03(w, draftId, `recaptured-${mode}`)
      expect(restored.recipient.ready).toBe(true); expect(restored.readiness.ready).toBe(true); expect(restored.review?.readiness.ready).toBe(true)
      expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
    })
  })
  it.each([false, true])('retains individually validated multi-source work and distinct authored hooks, reverse=%s', async (reverse) => {
    const { w, draftId, original, authored } = await fieldWorld03()
    const facts = [await fact03(w, 'team'), await fact03(w, 'people/jamie', 'maintains the documentation.'), await fact03(w, 'engineering/jamie', productWork03)]
    await storeFacts03(w, reverse ? facts.reverse() : facts, authored); await fulfillSupport(w, draftId)
    expect(authored.length).toBeGreaterThan(0); expect(authored.every((f) => f.observation === 'authorship' && f.authorshipVerified && !f.identityRecord)).toBe(true)
    const out = await read03(w, draftId, `multi-source-${reverse}`)
    expect(out.valid).toBe(true); expect(out.recipient.ready).toBe(true); expect(out.readiness.ready).toBe(true); expect(out.review?.readiness.ready).toBe(true)
    const sources = new StubFetcher({})
    const reuse = await prepareRecipients(db, sources, [w.company.id], { now: NOW, interPageDelayMs: 0 })
    expect(reuse.selected).toEqual([{ companyId: w.company.id, contactId: w.contact.id }]); expect(reuse.researched).toBe(0); expect(sources.requested).toEqual([])
    expect(await db.draft.findUnique({ where: { id: draftId } })).toEqual(original)
  })
  it.each(['unlabelled', 'authorship-label', 'extra-unbound-citation', 'irrelevant-invalid'] as const)('cannot trust secondary work through %s', async (mode) => {
    const { w, draftId } = await fieldWorld03()
    const base = await fact03(w, 'team'), work = await fact03(w, 'engineering/jamie', productWork03, mode === 'extra-unbound-citation' ? undefined : 'quoted-current')
    if (mode === 'unlabelled') delete work.observation
    if (mode === 'authorship-label') { work.observation = 'authorship'; work.authorshipVerified = true }
    if (mode === 'extra-unbound-citation') {
      const other = await fact03(w, 'another-source', productWork03, 'quoted-current')
      work.evidenceIds.push(...other.evidenceIds); work.snapshots!.push(...other.snapshots!)
    }
    const validWork = await fact03(w, 'valid-product-source', productWork03)
    const facts = mode === 'irrelevant-invalid' ? [base, validWork, await fact03(w, 'invalid-documentation', 'maintains the documentation.', 'quoted-current')] : [base, work]
    await storeFacts03(w, facts); await fulfillSupport(w, draftId)
    const out = await read03(w, draftId, mode)
    expect(out.valid).toBe(false); expect(out.recipient.ready).toBe(false); expect(out.recipient.suitability.suitable).toBe(false)
    expect(out.readiness.ready).toBe(false); expect(out.review?.readiness.ready).toBe(false)
  })
})
