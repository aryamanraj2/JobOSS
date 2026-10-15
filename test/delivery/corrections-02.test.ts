import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from './db.js'
import { makeSendWorld, sendGateOptions, SEND_TEST_SALT } from '../helpers/send-world.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import type { GmailMessage } from '../../src/outreach/mail/gmail.js'
import { senderAddress } from '../../src/outreach/mail/headers.js'
import { readDsnEvidence } from '../../src/outreach/mail/dsn-evidence.js'
import { ingestInboundMessage, matchSendAttemptDetailed } from '../../src/outreach/send/ingest-outcomes.js'
import { sendApprovedDraft } from '../../src/outreach/send/send.js'
import { syncInbox } from '../../src/outreach/inbox/sync.js'

const opts = sendGateOptions()
const ingestOpts = { suppressionSalt: SEND_TEST_SALT }
beforeEach(truncateAll)
afterAll(closeTestDb)
function message(id: string, over: Partial<GmailMessage> = {}): GmailMessage & { providerMessageId: string } {
  return { id, providerMessageId: id, threadId: 'shared-thread', from: 'owner+b@owned.example', to: 'me@owned.example',
    subject: 'Re: enquiry', bodyText: 'Please stop emailing me', inReplyTo: null, headers: {}, receivedAt: new Date(),
    rfc822MessageId: null, snippet: '', labelIds: [], fromIsSelf: false, ...over }
}
async function pair() {
  const db = testDb(); const mail = new FakeMailProvider()
  const a = await makeSendWorld(db, { domain: 'a.example', contactEmail: 'owner+a@owned.example' })
  const b = await makeSendWorld(db, { domain: 'b.example', contactEmail: 'owner+b@owned.example' })
  for (const world of [a, b]) expect(await sendApprovedDraft(db, mail, world.draftId, opts)).toMatchObject({ status: 'sent' })
  await db.sendAttempt.updateMany({ data: { providerThreadId: 'shared-thread' } })
  const attempts = await db.sendAttempt.findMany()
  return { db, a, b, originalB: attempts.find((attempt) => attempt.draftId === b.draftId)! }
}
async function protectedStates() {
  const db = testDb()
  return { contacts: await db.contact.findMany({ orderBy: { id: 'asc' } }), drafts: await db.draft.findMany({ orderBy: { id: 'asc' } }),
    leads: await db.lead.findMany({ orderBy: { id: 'asc' } }), attempts: await db.sendAttempt.findMany({ orderBy: { id: 'asc' } }) }
}
async function assertQuarantined(m: ReturnType<typeof message>) {
  const db = testDb(); const before = await protectedStates()
  expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'unresolved', reasonCode: null, suppressed: false })
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => ingestInboundMessage(db, m, ingestOpts)))
  expect(concurrent.every((result) => result.kind === 'unresolved')).toBe(true)
  expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'unresolved' })
  expect(await protectedStates()).toEqual(before)
  expect(await db.bounce.count()).toBe(0); expect(await db.reply.count()).toBe(0)
  expect(await db.optOut.count()).toBe(0); expect(await db.suppression.count()).toBe(0)
  const audit = await db.auditLog.findMany({ where: { action: 'inbox.unresolved', subjectId: m.id } })
  expect(audit).toHaveLength(1)
  const metadata = audit[0]!.metadata as { candidateAttemptIds: string[]; from: string; threadId: string }
  expect(metadata.candidateAttemptIds.length).toBeLessThanOrEqual(50)
  expect(metadata.from.length).toBeLessThanOrEqual(200)
  expect(metadata.threadId.length).toBeLessThanOrEqual(200)
  const mail = new FakeMailProvider(); mail.inbox.push(m)
  const syncOpts = { ...ingestOpts, checkpointKey: 'ambiguous-evidence' }
  expect(await syncInbox(db, mail, syncOpts)).toMatchObject({ complete: false, resumed: false, scanned: 0,
    detail: expect.stringContaining(`unresolved inbound ${m.id}`) })
  expect(await syncInbox(db, mail, syncOpts)).toMatchObject({ complete: false, resumed: true, scanned: 0 })
  const checkpoint = await db.auditLog.findFirstOrThrow({ where: { action: 'inbox.checkpoint', subjectId: syncOpts.checkpointKey },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  expect(checkpoint.metadata).toMatchObject({ pageCursor: null, complete: false })
  expect(await protectedStates()).toEqual(before)
  const target = await makeSendWorld(db, { domain: 'target.example', contactEmail: 'owner+target@owned.example' })
  expect(await sendApprovedDraft(db, mail, target.draftId, opts)).toMatchObject({ status: 'refused',
    detail: expect.stringContaining('incomplete outcome ingestion: unresolved inbound') })
  expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(before.attempts.length)
  expect(await db.auditLog.count({ where: { action: 'inbox.unresolved', subjectId: m.id } })).toBe(1)
}

const multipleSenders = [
  'other@outside.example, Person B <owner+b@owned.example>',
  'Person B <owner+b@owned.example>, other@outside.example',
  'Person A <owner+a@owned.example>, Person B <owner+b@owned.example>',
  'other@outside.example Person B <owner+b@owned.example>',
]
describe('RB-3a one supported sender mailbox', () => {
  it.each([
    [' owner+b@OWNED.EXAMPLE ', 'owner+b@owned.example'],
    ['Person B <OWNER+B@OWNED.EXAMPLE>', 'owner+b@owned.example'],
    ['<owner+b@owned.example>', 'owner+b@owned.example'],
    ['"Last, First" <owner+b@owned.example>', 'owner+b@owned.example'],
    ['"Last, \\"First\\"" <owner+b@owned.example>', 'owner+b@owned.example'],
    ['"Back\\\\Slash, First" <owner+b@owned.example>', 'owner+b@owned.example'],
    ['Person "Last, First" <owner+b@owned.example>', 'owner+b@owned.example'],
    ['owner+distinct@owned.example', 'owner+distinct@owned.example'],
  ])('parses supported single sender %j', (from, expected) => { expect(senderAddress(from!)).toBe(expected) })
  it.each([...multipleSenders, 'Group: owner+b@owned.example;', '"unterminated <owner+b@owned.example>',
    '"escaped\\" <owner+b@owned.example>', 'Person B (comment) <owner+b@owned.example>',
    'Person <owner+b@owned.example> trailing', '"name"unexpected <owner+b@owned.example>'])('refuses multiple/unsupported sender %j', (from) => {
    expect(senderAddress(from)).toBeNull()
  })
  it.each(multipleSenders)('quarantines shared-thread stop from %j through ingestion and pre-send', async (from) => {
    await pair()
    expect(senderAddress(from)).toBeNull()
    await assertQuarantined(message('multiple-from', { from, headers: { From: from } }))
    console.log('RB-3a: ambiguous From unresolved; 1 audit; 0 outcomes/suppressions/new sends; replay incomplete')
  })
  it('retains a valid quoted-comma sender B while preserving contact A', async () => {
    const { db, a, b, originalB } = await pair()
    const from = '"Last, First" <OWNER+B@OWNED.EXAMPLE>'
    const m = message('quoted-human', { from, headers: { FrOm: from } })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: originalB.id } })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'opt_out', sendAttemptId: originalB.id })
    expect((await db.contact.findUniqueOrThrow({ where: { id: a.contactId } })).status).toBe('active')
    expect((await db.contact.findUniqueOrThrow({ where: { id: b.contactId } })).status).toBe('suppressed')
  })
  it('separate From disagreement or unsupported form remains unresolved, but unrelated mail stays unmatched', async () => {
    await pair()
    for (const from of ['owner+a@owned.example', multipleSenders[0]!]) {
      expect(await ingestInboundMessage(testDb(), message(`header-${from}`, { headers: { From: from } }), ingestOpts)).toMatchObject({ kind: 'unresolved' })
    }
    expect(await matchSendAttemptDetailed(testDb(), message('unrelated-list', { threadId: 'unrelated',
      from: multipleSenders[0]!, headers: { From: multipleSenders[0]! } }))).toMatchObject({ kind: 'unmatched' })
    expect(await testDb().suppression.count()).toBe(0)
  })
})

const failed = (recipient: string) => `Final-Recipient: rfc822; ${recipient}\nAction: failed\nStatus: 5.1.1`
const delivered = (recipient: string) => `Final-Recipient: rfc822; ${recipient}\nAction: delivered\nStatus: 2.0.0`
const mixedBodies = [
  `${failed('unknown@outside.example')}\n\n${delivered('owner+b@owned.example')}`,
  `${delivered('owner+b@owned.example')}\n\n${failed('unknown@outside.example')}`,
  `${delivered('unknown@outside.example')}\n\n${failed('owner+b@owned.example')}`,
  `${failed('owner+b@owned.example')}\n\n${delivered('unknown@outside.example')}`,
  `${failed('owner+a@owned.example')}\n\n${delivered('owner+b@owned.example')}`,
]
const ambiguousBodies = [
  `${failed('owner+b@owned.example')}\n\n${delivered('owner+b@owned.example')}`,
  `${failed('owner+b@owned.example')}\n\n${failed('owner+b@owned.example')}`,
  'Final-Recipient: rfc822; owner+b@owned.example\nStatus: 5.1.1\nStatus: 2.0.0',
  'Final-Recipient: rfc822; owner+b@owned.example\n\nAction: failed\nStatus: 5.1.1',
  'Status: 5.1.1\n\nFinal-Recipient: rfc822; owner+b@owned.example\nStatus: 2.0.0',
  'Final-Recipient: rfc822; owner+b@owned.example\nOriginal-Recipient: rfc822; unreadable\nStatus: 5.1.1',
  'Final-Recipient: rfc822; owner+b@owned.example\nOriginal-Recipient: x400; unsupported\nStatus: 5.1.1',
  'Final-Recipient: rfc822; owner+b@owned.example\nFinal-Recipient:\nStatus: 5.1.1',
  'Final-Recipient rfc822; unreadable\nStatus: 5.1.1',
  'Final-Recipient: rfc822; owner+b@owned.example\nStatus: 5.1.1\nStatus 2.0.0',
  'Final-Recipient: rfc822; owner+b@owned.example\nAction: delivered\nStatus: 5.1.1',
  'Final-Recipient: rfc822; owner+b@owned.example\nAction: failed\nStatus: 2.0.0',
  'Final-Recipient: rfc822; owner+b@owned.example\nStatus: 4.1.1\nDiagnostic-Code: smtp; 550 5.1.1',
]
describe('RB-3b preserve all explicit DSN evidence before consuming a status', () => {
  it.each(mixedBodies)('mixed-recipient status attribution quarantines regardless of order: %j', async (bodyText) => {
    const { originalB } = await pair()
    await assertQuarantined(message('mixed-dsn', { from: 'postmaster@provider.example', subject: 'Delivery status notification',
      bodyText: `Reporting-MTA: dns; mx.provider.example\nOriginal Message-ID: ${originalB.providerRfc822MessageId}\n\n${bodyText}` }))
    console.log('RB-3b: mixed DSN unresolved; 1 audit; B active/sent; 0 outcomes/suppressions/new sends; replay incomplete')
  })
  it.each(ambiguousBodies)('ambiguous/unreadable DSN evidence is unresolved: %j', async (bodyText) => {
    const { db, originalB } = await pair()
    const m = message('ambiguous-dsn', { from: 'postmaster@provider.example', subject: 'Delivery status notification',
      inReplyTo: originalB.providerRfc822MessageId, bodyText })
    expect(readDsnEvidence(bodyText).issue).not.toBeNull()
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'unresolved' })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'unresolved' })
    expect(await db.bounce.count()).toBe(0); expect(await db.reply.count()).toBe(0)
    expect(await db.optOut.count()).toBe(0); expect(await db.suppression.count()).toBe(0)
  })
  it('retains unknown and unreadable explicit recipients rather than filtering them out', () => {
    expect(readDsnEvidence('Final-Recipient: rfc822; unknown@outside.example\nOriginal-Recipient: x400; unsupported').recipients)
      .toEqual(['unknown@outside.example', null])
  })
  it.each(['4.1.1', '5.1.1'])('preserves an unambiguous single-recipient %s DSN through actual ingestion', async (status) => {
    const { db, a, originalB } = await pair()
    const m = message('single-dsn', { from: 'postmaster@provider.example', subject: 'Delivery status notification',
      inReplyTo: originalB.providerRfc822MessageId,
      bodyText: `Original-Recipient: rfc822; OWNER+B@OWNED.EXAMPLE\nFinal-Recipient: rfc822; owner+b@owned.example\nAction: ${status.startsWith('4') ? 'delayed' : 'failed'}\nStatus: ${status}` })
    expect(readDsnEvidence(m.bodyText).issue).toBeNull()
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: originalB.id } })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'bounce', reasonCode: status.startsWith('4') ? 'soft_bounce' : 'hard_bounce' })
    expect(await db.bounce.count()).toBe(1); expect(await db.suppression.count()).toBe(status.startsWith('4') ? 0 : 1)
    expect((await db.contact.findUniqueOrThrow({ where: { id: a.contactId } })).status).toBe('active')
  })
  it('preserves strong original-ID precedence and recipient-only matching for a single known recipient', async () => {
    const { db, a, originalB } = await pair()
    await db.sendAttempt.updateMany({ where: { draftId: a.draftId }, data: { providerThreadId: 'only-a' } })
    const m = message('strong-single', { from: 'postmaster@provider.example', threadId: 'only-a',
      inReplyTo: originalB.providerRfc822MessageId, subject: 'Delivery incomplete', bodyText: 'Final-Recipient: rfc822; owner+b@owned.example\nStatus: 4.1.1' })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: originalB.id } })
    expect(await matchSendAttemptDetailed(db, { ...m, threadId: '', inReplyTo: null })).toMatchObject({ kind: 'matched', attempt: { id: originalB.id } })
  })
  it('unknown-only unrelated DSNs remain ordinary unmatched, distinct from a known-ID conflict', async () => {
    const { db, originalB } = await pair()
    const m = message('unknown-only', { from: 'postmaster@provider.example', threadId: 'unrelated', bodyText: failed('unknown@outside.example') })
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'unmatched' })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'unmatched' })
    expect(await matchSendAttemptDetailed(db, { ...m, inReplyTo: originalB.providerRfc822MessageId })).toMatchObject({ kind: 'unresolved' })
  })
})
