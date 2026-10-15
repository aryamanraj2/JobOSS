import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from './db.js'
import { makeSendWorld, sendGateOptions, SEND_TEST_SALT } from '../helpers/send-world.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import type { GmailMessage } from '../../src/outreach/mail/gmail.js'
import { readDsnEvidence } from '../../src/outreach/mail/dsn-evidence.js'
import { ingestInboundMessage, matchSendAttemptDetailed } from '../../src/outreach/send/ingest-outcomes.js'
import { sendApprovedDraft } from '../../src/outreach/send/send.js'
import { syncInbox } from '../../src/outreach/inbox/sync.js'

type CodeClass = 'absent' | '2' | '4' | '5'
const classes: CodeClass[] = ['absent', '2', '4', '5']
const codes = { '2': '2.0.0', '4': '4.1.1', '5': '5.1.1' }
const diagnostics = { '2': 'smtp; 250 2.0.0 accepted', '4': 'smtp; 450 4.1.1 try later', '5': 'smtp; 550 5.1.1 user unknown' }
type MatrixRow = { action: string | null; status: CodeClass; acceptedDiagnostics: CodeClass[] }
// Explicit expected behavior, including the existing failed+4 convention and
// unbindable success without Status. Each row tests all four diagnostic choices.
const matrixRows: MatrixRow[] = [
  { action: null, status: 'absent', acceptedDiagnostics: ['absent', '4', '5'] },
  { action: null, status: '2', acceptedDiagnostics: ['absent', '2'] },
  { action: null, status: '4', acceptedDiagnostics: ['absent', '4'] },
  { action: null, status: '5', acceptedDiagnostics: ['absent', '5'] },
  { action: 'failed', status: 'absent', acceptedDiagnostics: ['absent', '4', '5'] },
  { action: 'failed', status: '2', acceptedDiagnostics: [] },
  { action: 'failed', status: '4', acceptedDiagnostics: ['absent', '4'] },
  { action: 'failed', status: '5', acceptedDiagnostics: ['absent', '5'] },
  { action: 'delayed', status: 'absent', acceptedDiagnostics: ['absent', '4'] },
  { action: 'delayed', status: '2', acceptedDiagnostics: [] },
  { action: 'delayed', status: '4', acceptedDiagnostics: ['absent', '4'] },
  { action: 'delayed', status: '5', acceptedDiagnostics: [] },
  ...['delivered', 'relayed', 'expanded'].flatMap((action): MatrixRow[] => [
    { action, status: 'absent', acceptedDiagnostics: [] },
    { action, status: '2', acceptedDiagnostics: ['absent', '2'] },
    { action, status: '4', acceptedDiagnostics: [] },
    { action, status: '5', acceptedDiagnostics: [] },
  ]),
]
const matrix = matrixRows.flatMap(({ action, status, acceptedDiagnostics }) => classes.map((diagnostic) => ({
  action, status, diagnostic, accepted: acceptedDiagnostics.includes(diagnostic),
})))
function outcomeFields(action: string | null, status: CodeClass, diagnostic: CodeClass): string[] {
  return [
    ...(action ? [`Action: ${action}`] : []),
    ...(status === 'absent' ? [] : [`Status: ${codes[status]}`]),
    ...(diagnostic === 'absent' ? [] : [`Diagnostic-Code: ${diagnostics[diagnostic]}`]),
  ]
}
describe('RB-3b consistency across available Action/Status/Diagnostic-Code fields', () => {
  it.each(matrix)('Action=$action Status=$status Diagnostic=$diagnostic accepted=$accepted', ({ action, status, diagnostic, accepted }) => {
    const fields = ['Final-Recipient: rfc822; owner+b@owned.example', ...outcomeFields(action, status, diagnostic)]
    const standard = fields.join('\n')
    const reordered = fields.toReversed().map((field) => field.toUpperCase().replace(': ', ':\t')).join('\r\n')
    for (const body of [standard, reordered]) {
      expect(readDsnEvidence(body).issue === null).toBe(accepted)
      expect(readDsnEvidence(body).recipients).toEqual(['owner+b@owned.example'])
    }
  })
})

const opts = sendGateOptions()
const ingestOpts = { suppressionSalt: SEND_TEST_SALT }
function message(bodyText: string, inReplyTo: string | null): GmailMessage & { providerMessageId: string } {
  return { id: 'action-diagnostic', providerMessageId: 'action-diagnostic', threadId: 'shared-thread',
    from: 'postmaster@provider.example', to: 'me@owned.example', subject: 'Delivery status notification',
    bodyText, inReplyTo, headers: {}, receivedAt: new Date(), rfc822MessageId: null,
    snippet: '', labelIds: [], fromIsSelf: false }
}
async function pair() {
  const db = testDb(); const mail = new FakeMailProvider()
  const a = await makeSendWorld(db, { domain: 'a.example', contactEmail: 'owner+a@owned.example' })
  const b = await makeSendWorld(db, { domain: 'b.example', contactEmail: 'owner+b@owned.example' })
  for (const world of [a, b]) expect(await sendApprovedDraft(db, mail, world.draftId, opts)).toMatchObject({ status: 'sent' })
  await db.sendAttempt.updateMany({ data: { providerThreadId: 'shared-thread' } })
  const originalB = await db.sendAttempt.findFirstOrThrow({ where: { draftId: b.draftId } })
  return { db, a, b, originalB }
}
async function protectedStates() {
  const db = testDb()
  return { contacts: await db.contact.findMany({ orderBy: { id: 'asc' } }), drafts: await db.draft.findMany({ orderBy: { id: 'asc' } }),
    leads: await db.lead.findMany({ orderBy: { id: 'asc' } }), attempts: await db.sendAttempt.findMany({ orderBy: { id: 'asc' } }) }
}
const quarantined = [
  // The exact independent reproduction must be checked end to end.
  { action: 'delayed', diagnostic: '5' },
  { action: 'delayed', diagnostic: '2' },
  { action: 'failed', diagnostic: '2' },
  ...['delivered', 'relayed', 'expanded'].flatMap((action) => (['2', '4', '5'] as const).map((diagnostic) => ({ action, diagnostic }))),
  { action: null, diagnostic: '2' },
] satisfies Array<{ action: string | null; diagnostic: CodeClass }>
const fallbacks = [
  { action: 'delayed', diagnostic: '4', recipients: true },
  { action: 'failed', diagnostic: '4', recipients: true },
  { action: 'failed', diagnostic: '5', recipients: true },
  { action: null, diagnostic: '4', recipients: true },
  { action: null, diagnostic: '5', recipients: true },
  { action: null, diagnostic: '4', recipients: false },
  { action: null, diagnostic: '5', recipients: false },
  { action: 'failed', diagnostic: 'absent', recipients: false },
  { action: 'delayed', diagnostic: 'absent', recipients: false },
  { action: null, diagnostic: 'absent', recipients: false },
] satisfies Array<{ action: string | null; diagnostic: CodeClass; recipients: boolean }>
describe('RB-3b no-Status attribution through ingestion and coverage', () => {
  beforeEach(truncateAll)
  afterAll(closeTestDb)
  it.each(quarantined)('quarantines Action=$action Diagnostic=$diagnostic without Status', async ({ action, diagnostic }) => {
    const { db, originalB } = await pair()
    const bodyText = ['Final-Recipient: rfc822; owner+b@owned.example', ...outcomeFields(action, 'absent', diagnostic)].join('\n')
    const m = message(bodyText, originalB.providerRfc822MessageId)
    const before = await protectedStates()
    expect(readDsnEvidence(bodyText).issue).not.toBeNull()
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'unresolved', reasonCode: null, suppressed: false })
    const results = await Promise.all(Array.from({ length: 6 }, () => ingestInboundMessage(db, m, ingestOpts)))
    for (const result of results) expect(result).toMatchObject({ kind: 'unresolved', reasonCode: null, suppressed: false })
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'unresolved' })
    expect(await protectedStates()).toEqual(before)
    for (const count of [await db.bounce.count(), await db.reply.count(), await db.optOut.count(), await db.suppression.count()]) expect(count).toBe(0)
    const audit = await db.auditLog.findMany({ where: { action: 'inbox.unresolved', subjectId: m.id } })
    expect(audit).toHaveLength(1)
    const metadata = audit[0]!.metadata as { candidateAttemptIds: string[]; from: string; threadId: string }
    expect(metadata.candidateAttemptIds).toContain(originalB.id)
    expect(metadata.candidateAttemptIds.length).toBeLessThanOrEqual(50)
    expect(metadata.from.length).toBeLessThanOrEqual(200); expect(metadata.threadId.length).toBeLessThanOrEqual(200)
    const mail = new FakeMailProvider(); mail.inbox.push(m)
    const syncOpts = { ...ingestOpts, checkpointKey: 'action-diagnostic-coverage' }
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
    for (const count of [await db.bounce.count(), await db.reply.count(), await db.optOut.count(), await db.suppression.count()]) expect(count).toBe(0)
    console.log(`RB-3b no Status: Action=${action} Diagnostic=${diagnostic}; unresolved; 1 bounded audit; unchanged originals; 0 outcomes/suppressions/new sends; replay incomplete`)
  })
  it.each(fallbacks)('retains no-Status fallback Action=$action Diagnostic=$diagnostic explicitRecipient=$recipients', async ({ action, diagnostic, recipients }) => {
    const { db, a, b, originalB } = await pair()
    const beforeA = await db.contact.findUniqueOrThrow({ where: { id: a.contactId } })
    const bodyText = [
      ...(recipients ? ['Original-Recipient: rfc822; OWNER+B@OWNED.EXAMPLE', 'Final-Recipient: rfc822; owner+b@owned.example'] : []),
      ...outcomeFields(action, 'absent', diagnostic),
    ].join('\n')
    const m = message(bodyText, originalB.providerRfc822MessageId)
    expect(readDsnEvidence(bodyText).issue).toBeNull()
    expect(await matchSendAttemptDetailed(db, m)).toMatchObject({ kind: 'matched', attempt: { id: originalB.id } })
    const hard = diagnostic === '5'
    expect(await ingestInboundMessage(db, m, ingestOpts)).toMatchObject({ kind: 'bounce', sendAttemptId: originalB.id,
      reasonCode: hard ? 'hard_bounce' : 'soft_bounce', suppressed: hard })
    expect(await db.bounce.findMany()).toMatchObject([{ sendAttemptId: originalB.id,
      hardness: hard ? 'hard' : 'soft', providerCode: diagnostic === 'absent' ? null : `${diagnostic}50` }])
    expect(await db.suppression.count()).toBe(hard ? 1 : 0)
    expect(await db.contact.findUniqueOrThrow({ where: { id: a.contactId } })).toEqual(beforeA)
    expect((await db.contact.findUniqueOrThrow({ where: { id: b.contactId } })).status).toBe(hard ? 'suppressed' : 'active')
    expect((await db.draft.findUniqueOrThrow({ where: { id: b.draftId } })).status).toBe(hard ? 'bounced_hard' : 'bounced_soft')
    const mail = new FakeMailProvider(); mail.inbox.push(m)
    expect(await syncInbox(db, mail, { ...ingestOpts, checkpointKey: 'consistent-fallback' })).toMatchObject({ complete: true, scanned: 1, matched: 1 })
    expect(await db.bounce.count()).toBe(1); expect(await db.suppression.count()).toBe(hard ? 1 : 0)
    expect(await db.auditLog.count({ where: { action: 'inbox.unresolved', subjectId: m.id } })).toBe(0)
  })
})
