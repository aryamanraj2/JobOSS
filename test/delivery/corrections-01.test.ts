import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb, truncateAll, closeTestDb, assertSafeTestDatabase } from './db.js'
import { createPrismaClient } from '../../src/core/db/client.js'
import { makeSendWorld, sendGateOptions, SEND_TEST_SALT, OWNED_INBOX } from '../helpers/send-world.js'
import { approveDraft, revokeApproval } from '../../src/outreach/draft/approve.js'
import { sendApprovedDraft, reconcileInFlight } from '../../src/outreach/send/send.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import { GmailApiError, type GmailMessage } from '../../src/outreach/mail/gmail.js'
import { classifyReply } from '../../src/outreach/send/classify-outcome.js'
import { ingestInboundMessage, matchSendAttemptDetailed } from '../../src/outreach/send/ingest-outcomes.js'
import { syncInbox } from '../../src/outreach/inbox/sync.js'
import { evaluateSendGate } from '../../src/outreach/send/gate.js'
import { sentOnDay, sentToDomainOnDay } from '../../src/outreach/send/counters.js'
import type { Db } from '../../src/core/audit/audit-log.js'
import type { Prisma } from '../../generated/prisma/client.js'

const opts = sendGateOptions()
const ingestOpts = { suppressionSalt: SEND_TEST_SALT }
beforeEach(truncateAll)
afterAll(closeTestDb)
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
function inbound(id: string, over: Partial<GmailMessage> = {}): GmailMessage & { providerMessageId: string } {
  return { id, providerMessageId: id, threadId: 'unknown-thread', from: OWNED_INBOX, to: 'me@owned.example',
    subject: 'Re: enquiry', bodyText: 'Please stop emailing me', inReplyTo: null, headers: {}, receivedAt: new Date(),
    rfc822MessageId: null, snippet: '', labelIds: [], fromIsSelf: false, ...over }
}
async function revision(draftId: string, over: { contactId?: string; touchSlot?: number } = {}) {
  const db = testDb(); const old = await db.draft.findUniqueOrThrow({ where: { id: draftId } })
  const last = await db.draft.aggregate({ where: { leadId: old.leadId }, _max: { revision: true } })
  const draft = await db.draft.create({ data: {
    leadId: old.leadId, contactId: over.contactId ?? old.contactId, touchSlot: over.touchSlot ?? old.touchSlot,
    revision: (last._max.revision ?? 1) + 1, composition: old.composition as Prisma.InputJsonValue,
    resumeVersionId: old.resumeVersionId, subject: old.subject, bodyText: old.bodyText, outreachCase: old.outreachCase,
    citedEvidenceIds: old.citedEvidenceIds, approvedClaimIds: old.approvedClaimIds, promptVersion: old.promptVersion, status: 'awaiting_approval',
  } })
  expect(await approveDraft(db, draft.id, 'correction-fixture')).toMatchObject({ ok: true })
  return draft
}
async function sent(over = {}) {
  const db = testDb(); const w = await makeSendWorld(db, over); const mail = new FakeMailProvider()
  expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'sent' })
  const a = await db.sendAttempt.findFirstOrThrow({ where: { draftId: w.draftId } })
  return { db, w, mail, a }
}

describe('RB-1 atomic approval reservation versus independent mutators', () => {
  it('revocation commits after hash validation but before reservation: no send or surviving attempt', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const other = createPrismaClient(assertSafeTestDatabase())
    const paused = deferred(); const resume = deferred(); let once = false
    const racing = db.$extends({ query: { sendAttempt: { async count({ args, query }) {
      if (!once) { once = true; paused.resolve(); await resume.promise }
      return query(args)
    } } } })
    const mail = new FakeMailProvider(); const sending = sendApprovedDraft(racing as unknown as Db, mail, w.draftId, opts)
    try {
      await paused.promise
      const revoked = await revokeApproval(other, w.draftId, 'human-revoker')
      expect(revoked).toMatchObject({ ok: true }); resume.resolve()
      expect(await sending).toMatchObject({ status: 'refused', reason: 'approval_hash_mismatch' })
      expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
      expect(await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).toMatchObject({ status: 'composing', approvalHash: null, approvedAt: null })
      expect(await db.auditLog.count({ where: { action: 'draft.approval_revoked', subjectId: w.draftId } })).toBe(1)
      console.log('RB-1 revoke-first: success; provider calls=0; reservations=0')
    } finally { resume.resolve(); await sending; await other.$disconnect() }
  })
  it('reservation holds its row first: the independent revoker waits then refuses send_attempted', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const other = createPrismaClient(assertSafeTestDatabase())
    const paused = deferred(); const resume = deferred()
    const racing = db.$extends({ query: { sendAttempt: { async create({ args, query }) {
      const row = await query(args); paused.resolve(); await resume.promise; return row
    } } } })
    const mail = new FakeMailProvider(); const sending = sendApprovedDraft(racing as unknown as Db, mail, w.draftId, opts)
    let revoking: ReturnType<typeof revokeApproval> | undefined
    try {
      await paused.promise
      revoking = revokeApproval(other, w.draftId, 'human-revoker')
      // Prove a real second PostgreSQL connection waits on the draft row; do not
      // await that blocked operation while retaining the sending transaction lock.
      await vi.waitFor(async () => {
        const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%SELECT id FROM draft WHERE id =%'`
        expect(Number(rows[0]!.count)).toBeGreaterThan(0)
      }, { timeout: 5_000, interval: 10 })
      resume.resolve()
      expect(await sending).toMatchObject({ status: 'sent' })
      expect(await revoking).toMatchObject({ ok: false, reason: 'send_attempted' })
      expect(mail.sendCalls).toBe(1)
      expect(await db.auditLog.count({ where: { action: 'draft.approval_revoked' } })).toBe(0)
      console.log('RB-1 reservation-first: real row-lock waiter observed; revocation refused; provider calls=1')
    } finally { resume.resolve(); await sending; await revoking; await other.$disconnect() }
  })
  it.each(['body', 'hash', 'recipient'] as const)('rejects a changed %s after hash validation using an independent connection', async (field) => {
    const db = testDb(); const w = await makeSendWorld(db); const other = createPrismaClient(assertSafeTestDatabase())
    let once = false
    const racing = db.$extends({ query: { sendAttempt: { async count({ args, query }) {
      if (!once) {
        once = true
        if (field === 'recipient') await other.contact.update({ where: { id: w.contactId }, data: { emailNormalized: 'owner+changed@owned.example' } })
        else await other.draft.update({ where: { id: w.draftId }, data: field === 'body' ? { bodyText: 'changed after validation' } : { approvalHash: 'changed hash' } })
      }
      return query(args)
    } } } })
    const mail = new FakeMailProvider()
    try {
      expect(await sendApprovedDraft(racing as unknown as Db, mail, w.draftId, opts)).toMatchObject({ status: 'refused', reason: 'approval_hash_mismatch' })
      expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
    } finally { await other.$disconnect() }
  })
  it.each(['body', 'recipient'] as const)('rejects an intermediate %s plan even if rows/timestamps are restored before hash validation', async (field) => {
    const db = testDb(); const w = await makeSendWorld(db); const other = createPrismaClient(assertSafeTestDatabase())
    const original = await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })
    const contact = await db.contact.findUniqueOrThrow({ where: { id: w.contactId } })
    let once = false
    const racing = db.$extends({ query: { draft: { async findUnique({ args, query }) {
      if (!once && args.select?.leadId && args.select?.contact) {
        once = true
        if (field === 'body') await other.draft.update({ where: { id: w.draftId }, data: { bodyText: 'intermediate unapproved body' } })
        else await other.contact.update({ where: { id: w.contactId }, data: { emailNormalized: 'owner+intermediate@owned.example' } })
        const row = await query(args)
        if (field === 'body') await other.draft.update({ where: { id: w.draftId }, data: { bodyText: original.bodyText, updatedAt: original.updatedAt } })
        else await other.contact.update({ where: { id: w.contactId }, data: { emailNormalized: contact.emailNormalized, updatedAt: contact.updatedAt } })
        return row
      }
      return query(args)
    } } } })
    const mail = new FakeMailProvider()
    try {
      expect(await sendApprovedDraft(racing as unknown as Db, mail, w.draftId, opts)).toMatchObject({ status: 'refused', reason: 'approval_hash_mismatch' })
      expect(once).toBe(true); expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
      expect((await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).approvalHash).toBe(original.approvalHash)
    } finally { await other.$disconnect() }
  })
  it('rolls back the approved->sending transition when attempt creation fails; nested transaction callers cannot transmit', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    const original = await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })
    const failing = db.$extends({ query: { sendAttempt: { async create() { throw new Error('injected reservation write failure') } } } })
    await expect(sendApprovedDraft(failing as unknown as Db, mail, w.draftId, opts)).rejects.toThrow('injected reservation write failure')
    expect(await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).toMatchObject({ status: 'approved', approvalHash: original.approvalHash, approvedAt: original.approvedAt })
    expect(await db.sendAttempt.count()).toBe(0)
    await db.$transaction(async (tx) => {
      expect(await sendApprovedDraft(tx, mail, w.draftId, opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('standalone database client') })
    })
    expect(mail.sendCalls).toBe(0)
  })
  it('keeps unchanged individual approvals usable and concurrent duplicates at one send', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    const hash = (await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).approvalHash
    const results = await Promise.all(Array.from({ length: 4 }, () => sendApprovedDraft(db, mail, w.draftId, opts)))
    expect(results.some((r) => r.status === 'sent')).toBe(true); expect(mail.sendCalls).toBe(1)
    expect(await db.sendAttempt.count()).toBe(1)
    expect((await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).approvalHash).toBe(hash)
  })
})

describe('RB-2 uncertain delivery remains reservation-bearing', () => {
  it('keeps dedup and original-day/domain capacity on repeated misses and lookup failures; resolves later without sending', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider({ preservesOutreachRef: false })
    mail.failNextSendAmbiguously()
    expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'pending_reconciliation' })
    const attempt = await db.sendAttempt.findFirstOrThrow()
    expect(attempt.status).toBe('in_flight')
    for (let i = 0; i < 2; i++) expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'pending_reconciliation' })
    vi.spyOn(mail, 'findByMessageId').mockRejectedValueOnce(new Error('lookup timeout'))
    expect(await reconcileInFlight(db, mail)).toMatchObject([{ status: 'pending_reconciliation' }])
    expect(await sentOnDay(db, attempt.attemptedAt)).toBe(1)
    expect(await sentToDomainOnDay(db, 'owned.example', attempt.attemptedAt)).toBe(1)
    expect(await sentOnDay(db, new Date(attempt.attemptedAt.getTime() + 86400_000))).toBe(0)
    const same = await revision(w.draftId)
    expect(await evaluateSendGate(db, same.id, opts)).toMatchObject({ allowed: false, reason: 'duplicate_contact' })
    expect(await sendApprovedDraft(db, mail, same.id, opts)).toMatchObject({ status: 'refused', reason: 'duplicate_contact' })
    const contact = await db.contact.findUniqueOrThrow({ where: { id: w.contactId } })
    const second = await db.contact.create({ data: { companyId: w.companyId, emailNormalized: 'owner+other@owned.example',
      contactType: contact.contactType, discoveryMethod: contact.discoveryMethod, verified: true,
      evidenceId: contact.evidenceId, capturedAt: new Date() } })
    const sameSlot = await revision(w.draftId, { contactId: second.id })
    expect(await evaluateSendGate(db, sameSlot.id, opts)).toMatchObject({ allowed: false, reason: 'duplicate_company' })
    for (const [i, d] of [same, sameSlot].entries()) {
      await expect(db.sendAttempt.create({ data: { draftId: d.id, contactId: d.contactId!, companyId: w.companyId,
        campaignCycle: w.campaignCycle, touchNumber: 1, touchSlot: 0, status: 'in_flight',
        idempotencyKey: `direct-duplicate-${i}`, rfc822MessageId: `<direct-${i}@owned.example>` } })).rejects.toMatchObject({ code: 'P2002' })
    }
    expect(mail.sendCalls).toBe(1); expect(mail.sent).toHaveLength(1)
    expect(await db.sendAttempt.findFirstOrThrow()).toMatchObject({ status: 'in_flight', attemptedAt: attempt.attemptedAt })
    expect(await db.deliveryEvent.count({ where: { eventType: 'pending_reconciliation' } })).toBe(4)
    // A real human stop can be known even while transport confirmation is pending.
    await ingestInboundMessage(db, inbound('pending-stop', { inReplyTo: attempt.rfc822MessageId }), ingestOpts)
    vi.spyOn(mail, 'findByMessageId').mockResolvedValue({ providerMessageId: mail.sent[0]!.providerMessageId,
      threadId: mail.sent[0]!.threadId, rfc822MessageId: mail.sent[0]!.storedMessageId })
    expect(await reconcileInFlight(db, mail)).toMatchObject([{ status: 'sent', attemptId: attempt.id }])
    expect(await db.sendAttempt.findFirstOrThrow()).toMatchObject({ status: 'sent', attemptedAt: attempt.attemptedAt })
    expect((await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).status).toBe('opted_out')
    expect(mail.sendCalls).toBe(1)
    console.log('RB-2: 1 call/delivery; 4 pending recoveries; both direct partial indexes refused; original day/domain=1; later no-send resolution')
  })
  it('definite refusal can fail without reopening a concurrent stop (newly demonstrated race regression)', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    vi.spyOn(mail, 'send').mockImplementation(async () => {
      const a = await db.sendAttempt.findFirstOrThrow()
      await ingestInboundMessage(db, inbound('stop-during-failure', { inReplyTo: a.rfc822MessageId }), ingestOpts)
      throw new GmailApiError('definite provider refusal', 400)
    })
    expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'failed' })
    expect((await db.sendAttempt.findFirstOrThrow()).status).toBe('failed')
    expect((await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).status).toBe('opted_out')
    expect(await db.suppression.count()).toBe(1)
  })
  it('provider lookup failure after an ambiguous send stays pending with no retry', async () => {
    const db = testDb(); const w = await makeSendWorld(db); const mail = new FakeMailProvider()
    mail.failNextSendAmbiguously(); vi.spyOn(mail, 'findByMessageId').mockRejectedValue(new Error('offline'))
    expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'pending_reconciliation' })
    expect(await sendApprovedDraft(db, mail, w.draftId, opts)).toMatchObject({ status: 'pending_reconciliation' })
    expect((await db.sendAttempt.findFirstOrThrow()).status).toBe('in_flight'); expect(mail.sendCalls).toBe(1)
  })
})

async function pair() {
  const a = await sent({ domain: 'a.example', contactEmail: 'owner+a@owned.example' })
  const b = await sent({ domain: 'b.example', contactEmail: 'owner+b@owned.example' })
  await a.db.sendAttempt.updateMany({ data: { providerThreadId: 'merged-thread' } })
  return { a, b, db: a.db }
}

describe('RB-3 attribution gathers identity evidence before mutating outcomes', () => {
  it('shared-thread opt-out selects the consistent human sender B and leaves A active', async () => {
    const { a, b, db } = await pair()
    const m = inbound('shared-thread-stop', { threadId: 'merged-thread', from: 'Person B <OWNER+B@OWNED.EXAMPLE>' })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: b.a.id } })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'opt_out', sendAttemptId: b.a.id })
    expect((await db.contact.findUniqueOrThrow({ where: { id: a.w.contactId } })).status).toBe('active')
    expect((await db.contact.findUniqueOrThrow({ where: { id: b.w.contactId } })).status).toBe('suppressed')
    expect(await db.suppression.count()).toBe(1)
    console.log('RB-3 shared thread: sender B selected; A active; B suppressed')
  })
  it('conflicting exact IDs quarantine once under repeats/concurrency, and block sync and pre-send', async () => {
    const { a, b, db } = await pair()
    const m = inbound('conflicting-stop', { threadId: 'merged-thread', from: 'owner+b@owned.example',
      inReplyTo: a.a.providerRfc822MessageId, headers: { ReFeReNcEs: b.a.providerRfc822MessageId! } })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'unresolved', reasonCode: null })
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => ingestInboundMessage(db, m, ingestOpts)))
    expect(outcomes.every((r) => r.kind === 'unresolved')).toBe(true)
    await ingestInboundMessage(db, m, ingestOpts)
    expect(await db.auditLog.count({ where: { action: 'inbox.unresolved', subjectId: m.id } })).toBe(1)
    expect(await db.reply.count()).toBe(0); expect(await db.optOut.count()).toBe(0); expect(await db.suppression.count()).toBe(0)
    expect(await db.contact.count({ where: { status: 'active' } })).toBe(2)
    const mail = new FakeMailProvider(); mail.inbox.push(m)
    const scan = { ...ingestOpts, checkpointKey: 'conflicting-mailbox' }
    expect(await syncInbox(db, mail, scan)).toMatchObject({ complete: false, detail: expect.stringContaining('conflicting-stop') })
    expect(await syncInbox(db, mail, scan)).toMatchObject({ complete: false, resumed: true })
    const target = await makeSendWorld(db, { domain: 'target.example', contactEmail: 'owner+target@owned.example' })
    expect(await sendApprovedDraft(db, mail, target.draftId, opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('unresolved inbound') })
    expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(2)
    console.log('RB-3 conflict: 1 unresolved audit after concurrent/repeat ingestion; zero irreversible outcomes; sync/send blocked')
  })
  it('strong DSN ID selects B before conflicting weak A thread; contradictory DSN recipient blocks instead', async () => {
    const { a, b, db } = await pair()
    await db.sendAttempt.update({ where: { id: a.a.id }, data: { providerThreadId: 'only-a' } })
    const m = inbound('dsn-id', { from: 'Mail Delivery <MAILER-DAEMON@provider.example>', threadId: 'only-a',
      subject: 'Delivery status notification', bodyText: `Status: 5.1.1\nOriginal Message-ID: ${b.a.providerRfc822MessageId}\nFinal-Recipient: rfc822; owner+b@owned.example` })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: b.a.id } })
    expect(await ingestInboundMessage(db, { ...m, providerMessageId: 'dsn-conflict',
      bodyText: m.bodyText.replace('Final-Recipient: rfc822; owner+b', 'Final-Recipient: rfc822; owner+a') }, ingestOpts)).toMatchObject({ kind: 'unresolved' })
    expect(await db.suppression.count()).toBe(0)
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'bounce', sendAttemptId: b.a.id })
    expect((await db.contact.findUniqueOrThrow({ where: { id: a.w.contactId } })).status).toBe('active')
  })
  it('a daemon thread alone cannot retire a contact, while its explicit recipient can resolve that thread', async () => {
    const { a, b, db } = await pair()
    const m = inbound('weak-dsn', { from: 'postmaster@provider.example', threadId: 'merged-thread', subject: 'Delivery incomplete', bodyText: 'Status: 4.1.1' })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'unresolved' })
    expect(await ingestInboundMessage(db, { ...m, providerMessageId: 'recipient-dsn',
      bodyText: `${m.bodyText}\nFinal-Recipient: rfc822; owner+b@owned.example` }, ingestOpts)).toMatchObject({ kind: 'bounce', sendAttemptId: b.a.id })
    expect((await db.draft.findUniqueOrThrow({ where: { id: a.w.draftId } })).status).toBe('sent')
    expect(await db.suppression.count()).toBe(0)
  })
  it('retains the strongest stop under concurrent different-message outcomes on one attempt', async () => {
    const { db, a, w } = await sent()
    await Promise.all([
      ingestInboundMessage(db, inbound('strong-opt', { inReplyTo: a.providerRfc822MessageId }), ingestOpts),
      ingestInboundMessage(db, inbound('strong-human', { inReplyTo: a.providerRfc822MessageId, bodyText: 'Thanks' }), ingestOpts),
      ingestInboundMessage(db, inbound('strong-soft', { from: 'mailer-daemon@provider.example', subject: 'Delivery incomplete',
        bodyText: 'Status: 4.1.1', inReplyTo: a.providerRfc822MessageId }), ingestOpts),
    ])
    expect((await db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).status).toBe('opted_out')
    expect((await db.lead.findUniqueOrThrow({ where: { id: w.leadId } })).statusReason).toBe('opt_out')
    expect((await db.sendAttempt.findUniqueOrThrow({ where: { id: a.id } })).statusReason).toBe('opt_out')
    expect(await db.reply.count()).toBe(2); expect(await db.bounce.count()).toBe(1); expect(await db.suppression.count()).toBe(1)
  })
  it('a DSN with only explicit recipient evidence resolves a unique conversation, but cross-contact recipients quarantine', async () => {
    const { a, b, db } = await pair()
    const m = inbound('recipient-only', { from: 'postmaster@provider.example', subject: 'Delivery incomplete',
      bodyText: 'Status: 4.1.1\nFinal-Recipient: rfc822; owner+b@owned.example' })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: b.a.id } })
    expect(await matchSendAttemptDetailed(db, { ...m, inReplyTo: a.a.providerRfc822MessageId,
      bodyText: `${m.bodyText}\nOriginal-Recipient: rfc822; owner+a@owned.example` })).toMatchObject({ kind: 'unresolved' })
    expect(await db.suppression.count()).toBe(0)
  })
  it('mismatched human sender and a distinct plus tag are unresolved, ordinary unrelated mail stays unmatched', async () => {
    const { db, a } = await sent({ contactEmail: 'owner+tag@owned.example' })
    for (const from of ['stranger@outside.example', 'owner@owned.example', 'owner+different@owned.example']) {
      expect(await ingestInboundMessage(db, inbound(`mismatch-${from}`, { from, inReplyTo: a.providerRfc822MessageId }), ingestOpts)).toMatchObject({ kind: 'unresolved' })
    }
    expect(await matchSendAttemptDetailed(db, inbound('conflicting-from', { from: 'owner+tag@owned.example', inReplyTo: a.providerRfc822MessageId, headers: { FrOm: 'stranger@outside.example' } }))).toMatchObject({ kind: 'unresolved' })
    expect(await matchSendAttemptDetailed(db, inbound('ordinary-unrelated', { from: 'stranger@outside.example' }))).toMatchObject({ kind: 'unmatched' })
    expect(await ingestInboundMessage(db, inbound('case-and-angle', { from: 'Person <OWNER+TAG@OWNED.EXAMPLE>',
      headers: { 'In-RePlY-To': a.providerRfc822MessageId! } }), ingestOpts)).toMatchObject({ kind: 'opt_out' })
  })
  it('normal thread replies and multiple references within the same contact conversation still match', async () => {
    const { db, w, a, mail } = await sent()
    const follow = await revision(w.draftId)
    expect(await sendApprovedDraft(db, mail, follow.id, { ...opts, touchNumber: 2 })).toMatchObject({ status: 'sent' })
    const b = await db.sendAttempt.findFirstOrThrow({ where: { draftId: follow.id } })
    expect(await matchSendAttemptDetailed(db, inbound('history', { inReplyTo: b.providerRfc822MessageId,
      headers: { REFERENCES: `${a.providerRfc822MessageId} ${b.providerRfc822MessageId}` } }))).toMatchObject({ kind: 'matched', attempt: { id: b.id } })
    expect(await ingestInboundMessage(db, inbound('thread-human', { threadId: a.providerThreadId!, bodyText: 'Thanks, let us talk' }), ingestOpts)).toMatchObject({ kind: 'reply' })
  })
})

describe('RB-4 soft bounce stops separately approved follow-ups and revisions', () => {
  it('ingests a 4.x.x DSN after first touch and refuses both a manual second touch and new revision without suppressing', async () => {
    const { db, w, a, mail } = await sent()
    expect(await ingestInboundMessage(db, inbound('soft-stop', { from: 'mailer-daemon@provider.example', subject: 'Delivery status notification',
      bodyText: 'Status: 4.1.1', inReplyTo: a.providerRfc822MessageId }), ingestOpts)).toMatchObject({ kind: 'bounce', reasonCode: 'soft_bounce', suppressed: false })
    const next = await revision(w.draftId)
    for (const touchNumber of [1, 2]) expect(await sendApprovedDraft(db, mail, next.id, { ...opts, touchNumber })).toMatchObject({ status: 'refused', reason: 'soft_bounce' })
    expect(mail.sendCalls).toBe(1); expect(await db.sendAttempt.count()).toBe(1)
    expect(await db.suppression.count()).toBe(0)
    expect((await db.contact.findUniqueOrThrow({ where: { id: w.contactId } })).status).toBe('active')
    console.log('RB-4 soft stop: individually approved revision/touch 2 refused; total sends=1; suppressions=0')
  })
})

const humanForms = ['no', 'no ; extension=value', ' \tNO \t; extension=value ', '\r\n\tno\r\n ; extension=value',
  '(human) no (manual) ; extension="a;b"', '(nested (comment)) no(comment; with \\) escape) ; extension=value',
  'no (trailing comment)', '(leading) no']
const autoForms = ['auto-replied', ' auto-replied ; extension=value ', '\r\n\tAUTO-GENERATED\r\n ; extension=value',
  '(system) auto-replied (automatic) ; extension=value', 'x-automatic (extension) ; a=b']
describe('RB-5 Auto-Submitted CFWS keyword parsing', () => {
  it.each(humanForms)('valid human keyword: %j retains opt-out meaning', (value) => {
    expect(classifyReply({ subject: 'Hello', bodyText: 'Please stop emailing me', headers: { 'AuTo-SuBmItTeD': value } })).toBe('opt_out')
  })
  it.each(autoForms)('valid automatic keyword: %j retains automatic protection', (value) => {
    expect(classifyReply({ subject: 'Hello', bodyText: 'Please stop emailing me', headers: { 'AUTO-SUBMITTED': value } })).toBe('auto_reply')
  })
  it.each(['no (unfinished', 'n(comment)o', 'no\nvalue', '', 'no, auto-replied'])('malformed header %j reports unclassified', (value) => {
    expect(classifyReply({ subject: 'Hello', bodyText: 'Please stop emailing me', headers: { 'Auto-Submitted': value } })).toBe('unclassified')
  })
  it('valid comment/parameter human opt-out suppresses through actual ingestion; malformed header blocks coverage', async () => {
    const { db, a, mail } = await sent()
    const malformed = inbound('malformed-auto', { inReplyTo: a.providerRfc822MessageId, headers: { 'Auto-Submitted': 'no (unfinished' } })
    mail.inbox.push(malformed)
    expect(await syncInbox(db, mail, { ...ingestOpts, checkpointKey: 'malformed-classification' })).toMatchObject({ complete: false, detail: expect.stringContaining('malformed Auto-Submitted') })
    expect(await db.suppression.count()).toBe(0)
    expect(await ingestInboundMessage(db, inbound('cfws-stop', { inReplyTo: a.providerRfc822MessageId,
      headers: { 'Auto-Submitted': '(human) no \r\n\t(comment) ; extension=value' } }), ingestOpts)).toMatchObject({ kind: 'opt_out', suppressed: true })
    expect(await db.suppression.count()).toBe(1)
  })
})
