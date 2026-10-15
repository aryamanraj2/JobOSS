import { describe, expect, it, vi } from 'vitest'
import { GmailProvider, AmbiguousSendError } from '../../src/outreach/mail/gmail.js'
import type { GmailTokenProvider } from '../../src/outreach/mail/oauth.js'
import type { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { classifyReply } from '../../src/outreach/send/classify-outcome.js'
import { deriveOutreachRef, deriveMessageId } from '../../src/outreach/mail/message-id.js'

function response(value: unknown, overrides = {}) {
  return { ok: true, response: { statusCode: 200, body: JSON.stringify(value), truncated: false, ...overrides } }
}
function provider(fetchText = vi.fn(), postJson = vi.fn()) {
  const gate = { fetchText, postJson } as unknown as FetchPolicyGate
  const tokens = { accessToken: async () => 'fake-access' } as unknown as GmailTokenProvider
  return { mail: new GmailProvider(gate, tokens, { messageIdDomain: 'owned.example', interRequestDelayMs: 0 }), fetchText, postJson }
}
function raw(id = 'm1', body = 'Hello', extraHeaders: Array<{ name: string; value: string }> = []) {
  return { id, threadId: 'thread', internalDate: '1791936000000', payload: {
    headers: [{ name: 'From', value: 'person@example.com' }, { name: 'Message-ID', value: '<actual@gmail.example>' }, ...extraHeaders],
    mimeType: 'text/plain', body: { data: Buffer.from(body).toString('base64url') },
  } }
}

describe('Gmail pagination and transport completeness (fake gate only)', () => {
  it('consumes 61 messages across pages and carries the cursor', async () => {
    const first = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, threadId: 't' }))
    const second = Array.from({ length: 11 }, (_, i) => ({ id: `n${i}`, threadId: 't' }))
    const { mail, fetchText } = provider(vi.fn().mockResolvedValueOnce(response({ messages: first, nextPageToken: 'p2' })).mockResolvedValueOnce(response({ messages: second })))
    expect(await mail.listInbox('-in:sent', 50)).toHaveLength(61)
    expect(fetchText.mock.calls[1]?.[0]).toContain('pageToken=p2')
    expect(fetchText.mock.calls[0]?.[0]).toContain('includeSpamTrash=true')
  })
  it.each([
    response({}, { statusCode: 503 }), response({}, { truncated: true }),
    response({ messages: [{ id: '', threadId: 't' }] }), response({ messages: null }),
    response({ resultSizeEstimate: 5 }), { ok: false, reason: 'rate_limited' },
  ])('rejects a failed/malformed later page instead of returning partial messages', async (bad) => {
    const { mail } = provider(vi.fn().mockResolvedValueOnce(response({ messages: [{ id: 'm', threadId: 't' }], nextPageToken: 'p2' })).mockResolvedValueOnce(bad))
    await expect(mail.listInbox('-in:sent')).rejects.toThrow()
  })
  it('rejects invalid JSON on a later page', async () => {
    const { mail } = provider(vi.fn().mockResolvedValueOnce(response({ nextPageToken: 'p2' })).mockResolvedValueOnce(response({}, { body: '{broken' })))
    await expect(mail.listInbox('-in:sent')).rejects.toThrow('unrecognised')
  })
  it('detects repeated pagination and the coverage cap', async () => {
    const looping = provider(vi.fn().mockResolvedValue(response({ nextPageToken: 'same' })))
    await expect(looping.mail.listInbox('-in:sent')).rejects.toThrow('loop')
    let n = 0
    const capped = provider(vi.fn().mockImplementation(async () => response({ nextPageToken: `p${++n}` })))
    await expect(capped.mail.listInbox('-in:sent')).rejects.toThrow('coverage cap')
    expect(capped.fetchText).toHaveBeenCalledTimes(200)
  })
  it('preserves automatic-response headers and multipart DSN bodies', async () => {
    const message = raw('m', 'not interested', [{ name: 'Auto-Submitted', value: 'auto-replied' }])
    const { mail } = provider(vi.fn().mockResolvedValue(response({ ...message, payload: { ...message.payload, mimeType: 'multipart/report', parts: [{ mimeType: 'message/delivery-status', body: { data: Buffer.from('Status: 5.1.1').toString('base64url') } }] } })))
    const got = await mail.getMessage('m')
    expect(got.bodyText).toContain('Status: 5.1.1')
    expect(classifyReply(got)).toBe('auto_reply')
  })
  it('fetches externally stored DSN text and rejects attachment failures', async () => {
    const data = Buffer.from('Status: 5.1.1\nDiagnostic-Code: smtp; 550 user unknown').toString('base64url')
    const dsn = { ...raw('dsn'), payload: { ...raw().payload, mimeType: 'multipart/report', body: {},
      parts: [{ mimeType: 'message/delivery-status', body: { attachmentId: 'dsn-body', size: 60 } }] } }
    const good = provider(vi.fn().mockResolvedValueOnce(response(dsn)).mockResolvedValueOnce(response({ data })))
    expect((await good.mail.getMessage('dsn')).bodyText).toContain('Status: 5.1.1')
    expect(good.fetchText.mock.calls[1]?.[0]).toContain('/messages/dsn/attachments/dsn-body')
    const failed = provider(vi.fn().mockResolvedValueOnce(response(dsn)).mockResolvedValueOnce(response({}, { statusCode: 500 })))
    await expect(failed.mail.getMessage('dsn')).rejects.toThrow('attachment read failed')
  })
  it.each([
    { ...raw(), internalDate: 'bad' }, { id: 'm1', threadId: 'thread' },
    { ...raw(), payload: { headers: raw().payload.headers, parts: [null] } },
    { ...raw(), payload: { ...raw().payload, body: { data: '*invalid' } } },
    { ...raw(), payload: { headers: raw().payload.headers } },
    { ...raw(), payload: { ...raw().payload, body: { data: Buffer.from([255]).toString('base64url') } } },
  ])('rejects unreadable message data', async (message) => {
    await expect(provider(vi.fn().mockResolvedValue(response(message))).mail.getMessage('m1')).rejects.toThrow()
  })
  it('captures Gmail rewritten Message-ID after send and on a later reconciliation page', async () => {
    const key = 'send-key'
    const fetchText = vi.fn().mockResolvedValueOnce(response(raw('sent')))
      .mockResolvedValueOnce(response({ nextPageToken: 'next' }))
      .mockResolvedValueOnce(response({ messages: [{ id: 'sent', threadId: 'thread' }] }))
      .mockResolvedValueOnce(response(raw('sent', 'body', [{ name: 'X-Outreach-Ref', value: deriveOutreachRef(key) }])))
    const { mail } = provider(fetchText, vi.fn().mockResolvedValue(response({ id: 'sent', threadId: 'thread' })))
    const ref = await mail.send({ to: 'person@example.com', fromIdentity: 'me@owned.example', replyTo: 'me@owned.example', subject: 'Hello', bodyText: 'body' }, key)
    expect(ref.rfc822MessageId).toBe('<actual@gmail.example>')
    expect((await mail.findByMessageId(deriveMessageId(key, 'owned.example')))?.rfc822MessageId).toBe('<actual@gmail.example>')
  })
  it('treats malformed successful send responses and failed metadata reads as ambiguous', async () => {
    const outbound = { to: 'person@example.com', fromIdentity: 'me@owned.example', replyTo: 'me@owned.example', subject: 'Hello', bodyText: 'body' }
    const malformed = provider(vi.fn(), vi.fn().mockResolvedValue(response({}, { body: '{broken' })))
    await expect(malformed.mail.send(outbound, 'key')).rejects.toBeInstanceOf(AmbiguousSendError)
    const unreadable = provider(vi.fn().mockRejectedValue(new Error('timeout')), vi.fn().mockResolvedValue(response({ id: 'sent', threadId: 'thread' })))
    await expect(unreadable.mail.send(outbound, 'key')).rejects.toBeInstanceOf(AmbiguousSendError)
  })
})
