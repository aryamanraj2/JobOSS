import { afterAll, beforeEach, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { closeTestDb, testDb, truncateAll } from '../helpers/db.js'
import { dWorld, NOW, prepareWritten, fulfillSupport } from '../fixtures/joboss-d/world.js'
import { prepareOutreachDrafts } from '../../src/outreach/draft/prepare.js'
import { gateDraft } from '../../src/outreach/draft/compose.js'
import { outreachReview, outreachReviewQueue } from '../../src/outreach/review/queue.js'
import { reviewAction } from '../../src/outreach/review/actions.js'
const db = testDb()
beforeEach(truncateAll)
afterAll(closeTestDb)
it('retains a clearly synthetic D-only review preview, including revision and stale-snapshot refusal', async () => {
  const pending = await dWorld({ domain: 'pending.example', name: 'PendingCo' })
  await prepareOutreachDrafts(db, { companyIds: [pending.company.id], limit: 1, now: NOW })
  const blocked = await dWorld({ domain: 'blocked.example', name: 'BlockedCo' })
  const blockedDraft = await prepareWritten(blocked); await fulfillSupport(blocked, blockedDraft.draftId, 'uncertain'); await gateDraft(db, blockedDraft.draftId, NOW)
  const person = await dWorld({ domain: 'ready.example', name: 'ReadyCo', named: true })
  const ready = await prepareWritten(person, true); const support = await fulfillSupport(person, ready.draftId); await gateDraft(db, ready.draftId, NOW)
  const fallback = await dWorld({ domain: 'fallback.example', name: 'FallbackCo' })
  const fallbackDraft = await prepareWritten(fallback); const fallbackSupport = await fulfillSupport(fallback, fallbackDraft.draftId); await gateDraft(db, fallbackDraft.draftId, NOW)
  const revision = await dWorld({ domain: 'revision.example', name: 'RevisionCo' })
  const original = await db.draft.create({ data: { leadId: revision.lead!.id, contactId: revision.contact.id, subject: 'Synthetic earlier draft', bodyText: 'Synthetic earlier email retained unchanged.', composition: { original: true }, status: 'awaiting_approval', promptVersion: 'outreach_draft@4', touchSlot: 0 } })
  const revisionDraft = await prepareWritten(revision); await fulfillSupport(revision, revisionDraft.draftId); await gateDraft(db, revisionDraft.draftId, NOW)
  expect(await db.draft.findUnique({ where: { id: original.id } })).toEqual(original)
  const changed = await dWorld({ domain: 'changed.example', name: 'ChangedCo' })
  const changedDraft = await prepareWritten(changed); await fulfillSupport(changed, changedDraft.draftId); await gateDraft(db, changedDraft.draftId, NOW)
  const oldReview = await outreachReview(db, changedDraft.draftId, NOW)
  await db.contact.update({ where: { id: changed.contact.id }, data: { publicTitle: 'Changed source annotation' } })
  const refusal = await reviewAction(db, { draftId: changedDraft.draftId, snapshot: oldReview!.snapshot, by: 'synthetic reviewer', action: 'approve', now: NOW })
  expect(refusal.ok).toBe(false); expect(refusal.detail).toContain('snapshot changed')
  const rows = await outreachReviewQueue(db, { now: NOW })
  expect(rows.some((r) => r.state === 'pending')).toBe(true); expect(rows.some((r) => r.state === 'blocked')).toBe(true); expect(rows.filter((r) => r.state === 'ready')).toHaveLength(3)
  mkdirSync('scratch/joboss-d', { recursive: true })
  writeFileSync('scratch/joboss-d/preview.json', JSON.stringify({ synthetic: true, target: 'outreach_test_joboss_d', rows, readyDraftId: ready.draftId, fallbackDraftId: fallbackDraft.draftId, revisionDraftId: revisionDraft.draftId,
    changedDraftId: changedDraft.draftId, changedSnapshotRefusal: refusal, personExample: { writer: ready.writerOutput, support }, companyFallbackExample: { writer: fallbackDraft.writerOutput, support: fallbackSupport } }, null, 2))
  mkdirSync('scratch/joboss-d-corrections-01', { recursive: true })
  // Corrections preview extends the original six cases after every original assertion.
  const listedIds: string[] = []
  for (const [domain, name, title] of [['intern.example', 'InternRoleCo', 'iOS Engineer Intern'], ['senior.example', 'SeniorRoleCo', 'Senior iOS Platform Engineer']] as const) {
    const w = await dWorld({ domain, name, listed: true })
    const { boardSnapshot, syntheticJob } = await import('../fixtures/discovery-support.js')
    await boardSnapshot(w.company.id, NOW, [syntheticJob('j1', title)])
    const written = await prepareWritten(w); await fulfillSupport(w, written.draftId); await gateDraft(db, written.draftId, NOW)
    expect((await outreachReview(db, written.draftId, NOW))?.intent).toMatchObject({ kind: 'listed', title, supported: true })
    listedIds.push(written.draftId)
  }
  const roleless = await dWorld({ domain: 'roleless.example', name: 'RolelessCo', listed: true })
  const rolelessWritten = await prepareWritten(roleless)
  const { DraftComposition, renderBody } = await import('../../src/outreach/draft/message.js')
  const composition = DraftComposition.parse(rolelessWritten.draft.composition), hook = composition.sentences.find((s) => s.role === 'company')!
  hook.text = hook.text.slice(hook.text.indexOf('. ') + 2)
  await db.draft.update({ where: { id: rolelessWritten.draftId }, data: { composition, bodyText: renderBody(composition) } }); await fulfillSupport(roleless, rolelessWritten.draftId); await gateDraft(db, rolelessWritten.draftId, NOW)
  expect((await outreachReview(db, rolelessWritten.draftId, NOW))?.intent.supported).toBe(false)
  writeFileSync('scratch/joboss-d-corrections-01/preview.json', JSON.stringify({ synthetic: true, target: 'outreach_test_joboss_d', rows: await outreachReviewQueue(db, { now: NOW }), readyDraftId: ready.draftId, fallbackDraftId: fallbackDraft.draftId, listedIds, rolelessDraftId: rolelessWritten.draftId }, null, 2))

})
