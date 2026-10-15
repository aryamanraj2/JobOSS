import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb, truncateAll, closeTestDb } from './db.js'
import { makeSendWorld, sendGateOptions, SEND_TEST_SALT } from '../helpers/send-world.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import type { GmailMessage } from '../../src/outreach/mail/gmail.js'
import { ingestInboundMessage, matchSendAttempt } from '../../src/outreach/send/ingest-outcomes.js'
import { sendApprovedDraft, reconcileInFlight } from '../../src/outreach/send/send.js'
import { deliverabilityCounters } from '../../src/outreach/send/counters.js'
import { syncInbox } from '../../src/outreach/inbox/sync.js'
import { approveDraft } from '../../src/outreach/draft/approve.js'
import { evaluateSendGate } from '../../src/outreach/send/gate.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../src/core/audit/audit-log.js'

beforeEach(truncateAll)
afterAll(closeTestDb)
const syncOptions = { suppressionSalt: SEND_TEST_SALT, checkpointKey: 'test-mailbox' }
function message(id: string, body = 'Hello', over: Partial<GmailMessage> = {}): GmailMessage {
  return { id, threadId: 'broken-thread', from: 'human@example.com', to: 'owner@owned.example', subject: 'Re: enquiry',
    rfc822MessageId: `<${id}@example.com>`, inReplyTo: null, snippet: body, bodyText: body,
    labelIds: ['INBOX'], receivedAt: new Date(), fromIsSelf: false, headers: {}, ...over }
}
function inbound(m: GmailMessage) {
  return { ...m, providerMessageId: m.id }
}
async function sentWorld() {
  const db = testDb(); const world = await makeSendWorld(db); const mail = new FakeMailProvider()
  const result = await sendApprovedDraft(db, mail, world.draftId, sendGateOptions())
  expect(result.status).toBe('sent')
  const attempt = await db.sendAttempt.findFirstOrThrow()
  return { db, world, mail, attempt }
}

async function nextCycleDraft(db: ReturnType<typeof testDb>, draftId: string) {
  const original = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
  await db.lead.update({ where: { id: original.leadId }, data: { campaignCycle: 'next-test-cycle' } })
  const draft = await db.draft.create({ data: {
    leadId: original.leadId, contactId: original.contactId, revision: 2,
    composition: original.composition as Prisma.InputJsonValue,
    resumeVersionId: original.resumeVersionId, subject: original.subject, bodyText: original.bodyText,
    outreachCase: original.outreachCase, citedEvidenceIds: original.citedEvidenceIds,
    approvedClaimIds: original.approvedClaimIds, promptVersion: original.promptVersion,
    status: 'awaiting_approval',
  } })
  expect((await approveDraft(db, draft.id, 'test-operator')).ok).toBe(true)
  return draft
}

describe('atomic, idempotent outcomes', () => {
  it.each(['hard', 'soft', 'opt_out'] as const)('commits concurrent duplicate %s once', async (kind) => {
    const { db, world, attempt } = await sentWorld()
    const m = message('duplicate', kind === 'opt_out' ? 'Please do not contact me again' : `Status: ${kind === 'hard' ? '5' : '4'}.1.1`, {
      inReplyTo: attempt.providerRfc822MessageId,
      ...(kind === 'opt_out' ? {} : { from: 'mailer-daemon@example.com', subject: 'Delivery status notification' }),
    })
    await Promise.all(Array.from({ length: 6 }, () => ingestInboundMessage(db, inbound(m), { suppressionSalt: SEND_TEST_SALT })))
    await ingestInboundMessage(db, inbound(m), { suppressionSalt: SEND_TEST_SALT })
    expect(await db.bounce.count()).toBe(kind === 'opt_out' ? 0 : 1)
    expect(await db.optOut.count()).toBe(kind === 'opt_out' ? 1 : 0)
    expect(await db.reply.count()).toBe(kind === 'opt_out' ? 1 : 0)
    expect(await db.suppression.count()).toBe(kind === 'soft' ? 0 : 1)
    expect((await db.draft.findUniqueOrThrow({ where: { id: world.draftId } })).status).toBe(kind === 'opt_out' ? 'opted_out' : kind === 'hard' ? 'bounced_hard' : 'bounced_soft')
    expect(await db.auditLog.count({ where: { action: kind === 'opt_out' ? 'outcome.reply' : 'outcome.bounce' } })).toBe(1)
  })
  it('rolls back outcome and all transitions when suppression fails', async () => {
    const { db, world, attempt } = await sentWorld()
    const failing = db.$extends({ query: { suppression: { async upsert() { throw new Error('injected suppression failure') } } } }) as unknown as Db
    await expect(ingestInboundMessage(failing, inbound(message('rollback', 'Please stop emailing me', {
      inReplyTo: attempt.providerRfc822MessageId,
    })), { suppressionSalt: SEND_TEST_SALT })).rejects.toThrow('injected suppression failure')
    expect(await db.reply.count()).toBe(0); expect(await db.optOut.count()).toBe(0)
    expect(await db.suppression.count()).toBe(0)
    expect((await db.draft.findUniqueOrThrow({ where: { id: world.draftId } })).status).toBe('sent')
    expect((await db.lead.findUniqueOrThrow({ where: { id: world.leadId } })).statusReason).toBeNull()
  })
  it('matches rewritten RFC IDs with broken or absent thread, including References and DSN quotes', async () => {
    const { db, attempt } = await sentWorld()
    for (const over of [ { inReplyTo: attempt.providerRfc822MessageId },
      { headers: { references: `<old@example.com> ${attempt.providerRfc822MessageId}` } },
      { bodyText: `Original Message-ID: ${attempt.providerRfc822MessageId}` } ]) {
      expect((await matchSendAttempt(db, inbound(message('match', 'Hello', { threadId: '', ...over }))))?.id).toBe(attempt.id)
    }
  })
  it('counts human replies separately and exposes unrecorded referral/interview signals', async () => {
    const { db, attempt } = await sentWorld()
    const messages = [message('human', 'Thanks, let us talk'), message('auto', 'Not interested', { headers: { 'auto-submitted': 'auto-replied' } }),
      message('wrong', "I'm the wrong person"), message('opt', 'unsubscribe')]
    for (const m of messages) await ingestInboundMessage(db, inbound({ ...m, inReplyTo: attempt.providerRfc822MessageId }), { suppressionSalt: SEND_TEST_SALT })
    await db.reply.create({ data: { sendAttemptId: attempt.id, providerMessageId: 'legacy', receivedAt: new Date(), classification: null } })
    expect(await ingestInboundMessage(db, inbound(message('legacy', 'Hello', { inReplyTo: attempt.providerRfc822MessageId })), { suppressionSalt: SEND_TEST_SALT })).toMatchObject({ kind: 'unclassified', reasonCode: null })
    const counters = await deliverabilityCounters(db)
    expect(counters).toMatchObject({ replies: 1, automaticReplies: 1, wrongContactReplies: 1, optOuts: 1, unclassifiedReplies: 1,
      referralSignal: { state: 'unavailable' }, interviewSignal: { state: 'unavailable' }, complaintSignal: { state: 'unavailable' } })
  })
})

describe('complete inbox ingestion and send sequencing', () => {
  it('ingests 61 messages, preserves automatic headers, and resumes a failed later page', async () => {
    const { db, mail, attempt } = await sentWorld()
    mail.inbox.push(...Array.from({ length: 61 }, (_, i) => message(`in${i}`, 'Hello', { inReplyTo: attempt.providerRfc822MessageId, headers: { 'auto-submitted': 'auto-replied' } })))
    const original = mail.listInboxPage.bind(mail)
    const spy = vi.spyOn(mail, 'listInboxPage').mockImplementation(async (query, cursor, size) => {
      if (cursor === '50') throw new Error('later-page timeout')
      return original(query, cursor, size)
    })
    expect(await syncInbox(db, mail, syncOptions)).toMatchObject({ complete: false, scanned: 50 })
    expect(await db.reply.count()).toBe(50)
    spy.mockImplementation(original); spy.mockClear()
    expect(await syncInbox(db, mail, syncOptions)).toMatchObject({ complete: true, scanned: 61, matched: 61 })
    expect(spy.mock.calls[0]?.[1]).toBe('50')
    expect(await db.reply.count()).toBe(61)
    expect((await deliverabilityCounters(db)).automaticReplies).toBe(61)
    expect((await deliverabilityCounters(db)).replies).toBe(0)
  })
  it('detects loops and caps as incomplete, then replays a capped page safely', async () => {
    const db = testDb(); const mail = new FakeMailProvider()
    mail.inbox.push(message('one'), message('two'))
    const original = mail.listInboxPage.bind(mail)
    const spy = vi.spyOn(mail, 'listInboxPage').mockResolvedValue({ messages: [], nextPageToken: 'repeat' })
    expect(await syncInbox(db, mail, syncOptions)).toMatchObject({ complete: false, detail: 'inbox pagination loop' })
    spy.mockImplementation(original)
    expect(await syncInbox(db, mail, { ...syncOptions, checkpointKey: 'cap', maxMessages: 1 })).toMatchObject({ complete: false, detail: 'inbox message coverage cap reached' })
    expect(await syncInbox(db, mail, { ...syncOptions, checkpointKey: 'cap' })).toMatchObject({ complete: true, scanned: 2 })
    expect(await syncInbox(db, mail, { ...syncOptions, checkpointKey: 'page-cap', maxPages: 1, pageSize: 1 })).toMatchObject({ complete: false, detail: 'inbox page coverage cap reached' })
  })
  it('blocks new sending if ingestion fails; no attempt or provider call', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    mail.inboxFailure = new Error('inbox unavailable')
    const outcome = await sendApprovedDraft(db, mail, w.draftId, sendGateOptions())
    expect(outcome).toMatchObject({ status: 'refused', detail: 'incomplete outcome ingestion: inbox unavailable' })
    expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
  })
  it('blocks send after a resumed scan when a fresh first page reveals a new opt-out', async () => {
    const { db, mail, attempt, world } = await sentWorld()
    const target = await nextCycleDraft(db, world.draftId)
    const key = `pre-send:${sendGateOptions().sendingAccount}`
    await db.auditLog.create({ data: { actorType: 'system', actorId: 'inbox', action: 'inbox.checkpoint',
      subjectType: 'Mailbox', subjectId: key, metadata: { query: '-in:sent', pageCursor: '50', seenCursors: [], complete: false, scanned: 50, matched: 50 } } })
    mail.inbox.push(message('new-opt-out', 'Please stop emailing me', { inReplyTo: attempt.providerRfc822MessageId }))
    const spy = vi.spyOn(mail, 'listInboxPage').mockImplementation(async (_query, cursor) => ({
      messages: cursor === '50' ? [] : [{ id: 'new-opt-out', threadId: 'broken-thread' }], nextPageToken: null,
    }))
    expect(await sendApprovedDraft(db, mail, target.id, sendGateOptions())).toMatchObject({ status: 'refused', reason: 'opt_out' })
    expect(spy.mock.calls.map((args) => args[1])).toEqual(['50', undefined])
    expect(mail.sendCalls).toBe(1)
  })
  it('serializes concurrent invocations so the same approved draft is sent once', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => sendApprovedDraft(db, mail, w.draftId, sendGateOptions())))
    expect(outcomes.some((o) => o.status === 'sent')).toBe(true)
    expect(mail.sendCalls).toBe(1); expect(await db.sendAttempt.count()).toBe(1)
  })
  it('does not read the mailbox when sending is disabled', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    const spy = vi.spyOn(mail, 'listInboxPage')
    expect((await sendApprovedDraft(db, mail, w.draftId, sendGateOptions({ envFlag: false }))).status).toBe('refused')
    expect(spy).not.toHaveBeenCalled()
  })
  it('ingests a hard bounce before evaluating another individually approved send', async () => {
    const { db, mail, attempt, world } = await sentWorld()
    const target = await nextCycleDraft(db, world.draftId)
    mail.inbox.push(message('hard-before-send', 'Status: 5.1.1', { inReplyTo: attempt.providerRfc822MessageId,
      from: 'mailer-daemon@example.com', subject: 'Delivery status notification' }))
    expect(await sendApprovedDraft(db, mail, target.id, sendGateOptions())).toMatchObject({ status: 'refused', reason: 'hard_bounce' })
    expect(await db.bounce.count()).toBe(1); expect(mail.sendCalls).toBe(1)
  })
  it('rechecks approval mutation after ingestion before sending', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    vi.spyOn(mail, 'listInboxPage').mockImplementation(async () => {
      await db.draft.update({ where: { id: w.draftId }, data: { bodyText: 'mutated after approval' } })
      return { messages: [], nextPageToken: null }
    })
    expect(await sendApprovedDraft(db, mail, w.draftId, sendGateOptions())).toMatchObject({ status: 'refused', reason: 'approval_hash_mismatch' })
    expect(mail.sendCalls).toBe(0)
  })
  it('persists rewritten Message-ID on send and ambiguous reconciliation without second send', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    mail.failNextSendAmbiguously()
    const first = await sendApprovedDraft(db, mail, w.draftId, sendGateOptions())
    expect(first).toMatchObject({ status: 'sent', reconciled: true })
    expect((await db.sendAttempt.findFirstOrThrow()).providerRfc822MessageId).toBe(mail.sent[0]!.storedMessageId)
    await sendApprovedDraft(db, mail, w.draftId, sendGateOptions()); await reconcileInFlight(db, mail)
    expect(mail.sendCalls).toBe(1)
  })
  it('@5 fails closed without final readiness and uses supplied readiness independently of legacy score', async () => {
    const db = testDb(); const w = await makeSendWorld(db)
    await db.draft.update({ where: { id: w.draftId }, data: { promptVersion: 'outreach_draft@5', status: 'awaiting_approval', approvedAt: null, approvalHash: null } })
    await db.lead.update({ where: { id: w.leadId }, data: { score: 0 } })
    expect((await approveDraft(db, w.draftId, 'test-operator')).ok).toBe(true)
    expect(await evaluateSendGate(db, w.draftId, sendGateOptions())).toMatchObject({ allowed: false, detail: '@5 readiness validator is not integrated' })
    expect(await evaluateSendGate(db, w.draftId, sendGateOptions({ evaluateOutreachReadiness: async () => ({ ready: false, detail: 'unsupported hook' }) }))).toMatchObject({ allowed: false, detail: 'unsupported hook' })
    expect((await evaluateSendGate(db, w.draftId, sendGateOptions({ evaluateOutreachReadiness: async () => ({ ready: true, detail: 'test validator only' }) }))).allowed).toBe(true)
  })
})
