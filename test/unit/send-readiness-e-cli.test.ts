import { afterEach, describe, expect, it, vi } from 'vitest'

// The CLI executes as a module, but every environment/database/provider boundary
// is replaced BEFORE importing it. No live configuration or OAuth class is loaded.
const mock = vi.hoisted(() => ({
  db: { draft: { findMany: vi.fn() } }, disconnect: vi.fn(), gate: vi.fn(), send: vi.fn(), reconcile: vi.fn(),
  config: { OWNED_INBOXES: ['owner@owned.example'], SEND_EXTERNAL_RECIPIENTS_ENABLED: false, SENDING_ENABLED: false,
    GMAIL_SENDING_ACCOUNT: 'candidate@example.invalid', MESSAGE_ID_DOMAIN: 'owned.example', SUPPRESSION_HMAC_SALT: 'synthetic-E',
    GMAIL_OAUTH_CLIENT_ID: 'synthetic-id', GMAIL_OAUTH_CLIENT_SECRET: 'synthetic-secret', KEY_PROVIDER: 'env' },
  mail: vi.fn(), tokens: vi.fn(), policy: vi.fn(), secret: vi.fn(), key: vi.fn(),
}))
vi.mock('dotenv/config', () => ({}))
vi.mock('../../src/core/db/client.js', () => ({ prisma: () => mock.db, disconnectPrisma: mock.disconnect }))
vi.mock('../../src/core/config/config.js', () => ({ env: () => mock.config }))
vi.mock('../../src/core/policy/fetch-policy-gate.js', () => ({ FetchPolicyGate: class { constructor() { mock.policy() } } }))
vi.mock('../../src/core/crypto/secret-store.js', () => ({ SecretStore: class { constructor() { mock.secret() } } }))
vi.mock('../../src/core/crypto/keychain-key-provider.js', () => ({ KeychainKeyProvider: class { constructor() { mock.key() } } }))
vi.mock('../../src/core/crypto/env-key-provider.js', () => ({ EnvKeyProvider: class { constructor() { mock.key() } } }))
vi.mock('../../src/outreach/mail/oauth.js', () => ({ GmailTokenProvider: class { constructor() { mock.tokens() } } }))
vi.mock('../../src/outreach/mail/gmail.js', () => ({ GmailProvider: class { constructor() { mock.mail() } } }))
vi.mock('../../src/outreach/send/gate.js', () => ({ evaluateSendGate: mock.gate }))
vi.mock('../../src/outreach/send/send.js', () => ({ sendApprovedDraft: mock.send, reconcileInFlight: mock.reconcile }))
vi.mock('../../src/outreach/send/counters.js', () => ({ deliverabilityCounters: async () => ({
  windowDays: 30, sent: 0, inFlight: 0, failed: 0, hardBounces: 0, softBounces: 0, replies: 0, automaticReplies: 0,
  wrongContactReplies: 0, unclassifiedReplies: 0, optOuts: 0, hardBounceRate: null,
  referralSignal: { state: 'unavailable' }, interviewSignal: { state: 'unavailable' }, complaintSignal: { state: 'unavailable', why: 'synthetic' },
  providerReputationNote: 'synthetic',
}) }))

const argv = process.argv
const exitCode = process.exitCode
afterEach(() => { process.argv = argv; process.exitCode = exitCode; vi.restoreAllMocks(); vi.clearAllMocks() })
describe('E actual CLI shared canonical callback wiring, isolated module execution', () => {
  it.each(['list', 'dry', 'send'] as const)('%s passes the canonical function in options without evaluating it at startup', async mode => {
    vi.resetModules()
    const readiness = await import('../../src/outreach/review/readiness.js')
    const canonical = vi.spyOn(readiness, 'evaluateOutreachReadiness')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    process.argv = ['node', 'isolated-E-cli', ...(mode === 'list' ? ['--list'] : ['--id', 'synthetic-draft', ...(mode === 'dry' ? ['--dry'] : [])])]
    mock.db.draft.findMany.mockResolvedValue([{ id: 'synthetic-draft', subject: 'Synthetic', contact: { emailNormalized: 'owner@owned.example' }, lead: { company: { displayName: 'Synthetic' } } }])
    mock.gate.mockResolvedValue({ allowed: true, plan: { to: 'owner@owned.example', fromIdentity: 'Synthetic', rfc822MessageId: '<e@owned.example>', idempotencyKey: 'synthetic' } })
    mock.send.mockResolvedValue({ status: 'refused', reason: 'sending_disabled', detail: 'synthetic invocation' })
    await import('../../tools/run-send.js')
    const target = mode === 'send' ? mock.send : mock.gate
    expect(target).toHaveBeenCalledOnce()
    const options = target.mock.calls[0]![mode === 'send' ? 3 : 2]
    expect(options.evaluateOutreachReadiness).toBe(readiness.evaluateOutreachReadiness)
    expect(options).toMatchObject({ envFlag: false, externalRecipientsEnabled: false, ownedInboxes: ['owner@owned.example'] })
    expect(canonical).not.toHaveBeenCalled(); expect(mock.disconnect).toHaveBeenCalledOnce()
    if (mode !== 'send') {
      expect(log.mock.calls.flat().join('\n')).toContain('inbox unchecked')
      expect(mock.send).not.toHaveBeenCalled(); expect(mock.mail).not.toHaveBeenCalled(); expect(mock.tokens).not.toHaveBeenCalled()
    } else {
      expect(mock.mail).toHaveBeenCalledOnce(); expect(mock.tokens).toHaveBeenCalledOnce()
    }
  })
})
