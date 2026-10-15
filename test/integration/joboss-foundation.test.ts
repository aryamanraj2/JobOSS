import { runOfflinePendingTasks } from '../helpers/joboss-offline-runner.js'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, testDb, truncateAll } from '../helpers/db.js'
import { checkBudget, currentPeriodMonth, reserveBudget } from '../../src/core/policy/budget.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { HandoffLlmGateway, claimNextTask, fulfilTask, rejectTask } from '../../src/core/llm/handoff-gateway.js'
import { runPendingTasks, taskPacket } from '../../src/core/llm/subscription-runner.js'
import { writeEvidence } from '../../src/core/evidence/write-evidence.js'
import { mockAgent } from '../setup.js'

const NOW = new Date('2026-10-14T12:00:00Z')
const db = () => testDb()
beforeEach(async () => truncateAll())
afterAll(async () => closeTestDb())
const result = { urls: [], limitations: ['No verified facts supplied'] }
async function queued(input: Record<string, unknown> = {}) {
  return (await new HandoffLlmGateway(db()).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1',
    subjectType: 'Company', subjectId: 'bounded-fixture', input, allowedEvidenceIds: [] })).taskId
}
async function budget(cap = 1, companyId: string | null = null) {
  return db().researchBudget.create({ data: { companyId, periodMonth: currentPeriodMonth(NOW), creditsCap: cap, vendorCreditsCap: cap, billedUsdCap: 99 } })
}
function gate() { return new FetchPolicyGate(db(), { userAgent: 'joboss-foundation-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 0, now: () => NOW }) }

async function personWorld() {
  const company = await db().company.create({ data: { canonicalDomain: 'person.example', displayName: 'Person' } })
  const other = await db().company.create({ data: { canonicalDomain: 'other.example', displayName: 'Other' } })
  const ev = await db().evidence.create({ data: { companyId: company.id, sourceUrl: 'https://person.example/team', sourceType: 'company_page', excerpt: 'Jane Doe, CTO', contentHash: 'person-identity', observedAt: NOW, confidence: 1, fetchedVia: 'static_fetch' } })
  const contact = await db().contact.create({ data: { companyId: company.id, emailNormalized: 'jane@person.example', contactType: 'named_employee', discoveryMethod: 'page_published', evidenceId: ev.id, capturedAt: NOW } })
  return { company, other, contact, ev }
}

describe('bounded API policy and budget reservations', () => {
  it('keeps API access narrow while website paths obey robots, with terms and host denial ahead of API contracts', async () => {
    await budget()
    const policy = await db().hostPolicy.create({ data: { host: 'startupdb.com', mode: 'allow', origin: 'operator' } })
    let probes = 0, pages = 0
    mockAgent.get('https://startupdb.com').intercept({ path: '/robots.txt' }).reply(() => { probes++; return { statusCode: 200, data: 'User-agent: *\nDisallow: /\n' } }).persist()
    mockAgent.get('https://startupdb.com').intercept({ path: '/api/v1/startups?q=acme&limit=5' }).reply(() => { pages++; return { statusCode: 200, data: '{}' } })
    expect((await gate().fetchText('https://startupdb.com/api/v1/startups?q=acme&limit=5')).ok).toBe(true)
    expect(probes).toBe(0)
    expect(await gate().fetchText('https://startupdb.com/startups/acme')).toMatchObject({ ok: false, reason: 'robots_disallowed' })
    expect(await gate().fetchText('https://startupdb.com/api/v1/startups?secret=yes')).toMatchObject({ ok: false, reason: 'robots_disallowed' })
    expect(await gate().postJson('https://startupdb.com/api/v1/startups', {})).toMatchObject({ ok: false, reason: 'robots_disallowed' })
    await db().hostPolicy.update({ where: { id: policy.id }, data: { termsProhibited: true } })
    expect(await gate().fetchText('https://startupdb.com/api/v1/startups')).toMatchObject({ ok: false, reason: 'terms_prohibited' })
    await db().hostPolicy.update({ where: { id: policy.id }, data: { mode: 'deny', termsProhibited: false } })
    expect(await gate().fetchText('https://startupdb.com/api/v1/startups')).toMatchObject({ ok: false, reason: 'host_denied' })
    expect(pages).toBe(1)
  })
  it('fails closed on missing global/company envelopes and paid spending even with a large cap', async () => {
    const company = await db().company.create({ data: { canonicalDomain: 'budget.example', displayName: 'Budget' } })
    expect(await reserveBudget(db(), null, 1, NOW)).toEqual({ allowed: false, scope: 'global' })
    await budget(10)
    expect(await reserveBudget(db(), company.id, 1, NOW)).toEqual({ allowed: false, scope: 'company' })
    expect(await reserveBudget(db(), null, { credits: 0, billedUsd: 0.01 }, NOW)).toEqual({ allowed: false, scope: 'billed_usd' })
    expect(await checkBudget(db(), null, { credits: -1 }, NOW)).toMatchObject({ allowed: false })
    expect(await reserveBudget(db(), null, 0, NOW)).toEqual({ allowed: true })
    expect((await db().researchBudget.findFirstOrThrow()).creditsSpent).toBe(0)
  })
  it('gives exactly one concurrent worker the shared last credit without charging the losing company', async () => {
    const companies = await Promise.all(['one', 'two'].map((name) => db().company.create({ data: { canonicalDomain: `${name}.example`, displayName: name } })))
    await budget(1)
    for (const company of companies) await budget(10, company.id)
    const verdicts = await Promise.all(companies.map((company) => reserveBudget(db(), company.id, 1, NOW)))
    expect(verdicts.filter((v) => v.allowed)).toHaveLength(1)
    const rows = await db().researchBudget.findMany()
    expect(rows.find((r) => r.companyId === null)?.creditsSpent).toBe(1)
    expect(rows.filter((r) => r.companyId !== null).reduce((sum, row) => sum + row.creditsSpent, 0)).toBe(1)
  })
  it('reserves the last vendor credit atomically and resumes when its envelope is extended', async () => {
    const global = await budget(2)
    await db().researchBudget.update({ where: { id: global.id }, data: { vendorCreditsCap: 1 } })
    const spend = { credits: 1, vendorCredits: 1 }
    const results = await Promise.all([reserveBudget(db(), null, spend, NOW), reserveBudget(db(), null, spend, NOW)])
    expect(results.filter((r) => r.allowed)).toHaveLength(1)
    expect(results.find((r) => !r.allowed)).toEqual({ allowed: false, scope: 'global_vendor' })
    await db().researchBudget.update({ where: { id: global.id }, data: { vendorCreditsCap: 2 } })
    expect(await reserveBudget(db(), null, spend, NOW)).toEqual({ allowed: true })
  })
  it('reserves before the transport and reports exhaustion for concurrent separate gate instances', async () => {
    await budget(1)
    await db().hostPolicy.create({ data: { host: 'hacker-news.firebaseio.com', mode: 'allow', origin: 'operator' } })
    let requests = 0
    mockAgent.get('https://hacker-news.firebaseio.com').intercept({ path: /^\/v0\/item\/[12]\.json$/ }).reply(() => { requests++; return { statusCode: 200, data: '{}' } }).persist()
    const results = await Promise.all([gate().fetchText('https://hacker-news.firebaseio.com/v0/item/1.json'), gate().fetchText('https://hacker-news.firebaseio.com/v0/item/2.json')])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(requests).toBe(1)
    expect(await db().auditLog.count({ where: { reasonCode: 'budget_exhausted' } })).toBe(1)
  })
  it('retains a reservation after an uncertain transport failure', async () => {
    await budget(1)
    await db().hostPolicy.create({ data: { host: 'hacker-news.firebaseio.com', mode: 'allow', origin: 'operator' } })
    await expect(gate().fetchText('https://hacker-news.firebaseio.com/v0/item/987654321.json')).rejects.toThrow()
    expect((await db().researchBudget.findFirstOrThrow()).creditsSpent).toBe(1)
  })
})

describe('company/person storage guards', () => {
  it('rejects person evidence without a company and cross-company person bindings, including raw database writers', async () => {
    const { company, other, contact } = await personWorld()
    const input = { sourceUrl: 'https://person.example/blog', sourceType: 'external_source' as const, excerpt: 'Jane wrote this.', contentHash: 'work', observedAt: NOW, confidence: 1, fetchedVia: 'static_fetch' as const, contactId: contact.id }
    await expect(writeEvidence(db(), input)).rejects.toThrow()
    await expect(writeEvidence(db(), { ...input, companyId: other.id })).rejects.toThrow()
    expect(await writeEvidence(db(), { ...input, companyId: company.id })).toHaveProperty('id')
    await expect(db().contactResearch.create({ data: { contactId: contact.id, companyId: other.id, identityStatus: 'verified', facts: [], citedEvidenceIds: [], limitations: [], researchedAt: NOW } })).rejects.toThrow()
  })
})

describe('durable fenced task ownership and resumption', () => {
  it('claims only once during a race, always returns a token, and forbids un-tokened manual fulfilment', async () => {
    const id = await queued()
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimNextTask(db(), { now: NOW, taskIds: [id] })))
    expect(claims.filter(Boolean)).toHaveLength(1)
    const owner = claims.find((c) => c !== null)!
    expect(owner.claimToken).toBeTruthy()
    expect(await fulfilTask(db(), id, result, { now: NOW })).toMatchObject({ ok: false, problem: 'wrong_status' })
    expect(await fulfilTask(db(), id, result, { now: NOW, claimToken: owner.claimToken })).toMatchObject({ ok: true })
  })
  it('allows manual fulfilment on an unclaimed task and preserves terminal output on rejection', async () => {
    const id = await queued()
    expect(await fulfilTask(db(), id, result)).toMatchObject({ ok: true })
    expect(await rejectTask(db(), id, 'weak_evidence')).toEqual({ ok: false })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).output).toEqual(result)
  })
  it('recovers stale leases and refuses the previous worker, even when its output is invalid', async () => {
    const id = await queued()
    const old = (await claimNextTask(db(), { taskIds: [id], now: NOW, leaseMs: 1000 }))!
    const later = new Date(NOW.getTime() + 1001)
    const current = (await claimNextTask(db(), { taskIds: [id], now: later, leaseMs: 1000 }))!
    expect(current.claimToken).not.toBe(old.claimToken)
    expect(await fulfilTask(db(), id, {}, { now: later, claimToken: old.claimToken })).toMatchObject({ ok: false, problem: 'wrong_status' })
    expect(await rejectTask(db(), id, 'weak_evidence', undefined, { now: later, claimToken: old.claimToken })).toEqual({ ok: false })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).attempts).toBe(0)
    expect(await fulfilTask(db(), id, result, { now: later, claimToken: current.claimToken })).toMatchObject({ ok: true })
  })
  it('rejects expired fulfilment before recovery and recovers legacy claims', async () => {
    const id = await queued()
    const claim = (await claimNextTask(db(), { taskIds: [id], now: NOW, leaseMs: 1000 }))!
    expect(await fulfilTask(db(), id, result, { now: new Date(NOW.getTime() + 1000), claimToken: claim.claimToken })).toMatchObject({ ok: false, problem: 'wrong_status' })
    await db().llmTask.update({ where: { id }, data: { claimToken: null, leaseExpiresAt: null, claimedAt: new Date(NOW.getTime() - 2000) } })
    expect((await claimNextTask(db(), { taskIds: [id], now: NOW, leaseMs: 1000 }))?.claimToken).toBeTruthy()
  })
  it('recovers a legacy claim with no timestamp or token', async () => {
    const id = await queued()
    await db().llmTask.update({ where: { id }, data: { status: 'claimed', claimedAt: null, claimToken: null, leaseExpiresAt: null } })
    expect((await claimNextTask(db(), { taskIds: [id] }))?.claimToken).toBeTruthy()
  })
  it.each(['quota_exhausted', 'timed_out', 'invalid_output', 'failed'] as const)('records %s and resumes without changing provider or activating billing', async (state) => {
    const id = await queued()
    const first = await runOfflinePendingTasks(db(), { taskIds: [id], execute: async (request) => {
      expect(request.provider).toBe('codex')
      return { ok: false, state, detail: 'bounded fixture' }
    } })
    expect(first.resumable).toBe(true)
    const saved = await db().llmTask.findUniqueOrThrow({ where: { id } })
    expect(saved).toMatchObject({ status: 'pending', claimToken: null, runnerMetadata: { provider: 'codex', state, costUsd: 0 } })
    const resumed = await runOfflinePendingTasks(db(), { taskIds: [id], execute: async () => ({ ok: true, value: result, usage: { input_tokens: 3, output_tokens: 4, secret: 'never store' } }) })
    expect(resumed).toMatchObject({ resumable: false, results: [{ state: 'fulfilled' }] })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).runnerMetadata).toMatchObject({ usage: { input_tokens: 3, output_tokens: 4 } })
    const history = await db().auditLog.findMany({ where: { action: 'llm.runner_attempt', subjectId: id }, orderBy: { createdAt: 'asc' } })
    expect(history).toHaveLength(2)
    expect(history[0]?.metadata).toMatchObject({ provider: 'codex', state })
    expect(history[1]?.metadata).toMatchObject({ state: 'fulfilled', usage: { input: 3, output: 4 } })
  })
  it('returns schema-invalid results to pending for a new validated attempt', async () => {
    const id = await queued()
    expect((await runOfflinePendingTasks(db(), { taskIds: [id], provider: 'claude', execute: async () => ({ ok: true, value: {} }) })).results[0]?.state).toBe('invalid_output')
    expect((await runOfflinePendingTasks(db(), { taskIds: [id], provider: 'claude', execute: async () => ({ ok: true, value: result }) })).results[0]?.state).toBe('fulfilled')
  })
  it('does not overwrite a superseding worker with results or runner metadata', async () => {
    const id = await queued()
    const run = await runOfflinePendingTasks(db(), { taskIds: [id], timeoutMs: 1, now: NOW, execute: async () => {
      await db().llmTask.update({ where: { id }, data: { leaseExpiresAt: new Date(NOW.getTime() - 1) } })
      await claimNextTask(db(), { taskIds: [id], now: NOW })
      return { ok: true, value: result }
    } })
    expect(run.results[0]?.state).toBe('lease_lost')
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).runnerMetadata).toBeNull()
  })
  it('leaves tasks open with the manual provider and does not execute a model', async () => {
    const id = await queued()
    const run = await runOfflinePendingTasks(db(), { taskIds: [id], provider: 'manual', execute: async () => { throw new Error('must not run') } })
    expect(run.results[0]?.state).toBe('manual_pending')
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).status).toBe('pending')
  })
  it('stops a batch on quota and leaves later tasks available for resumption', async () => {
    const id = await queued()
    const second = await new HandoffLlmGateway(db()).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1', subjectType: 'Company', subjectId: 'second', input: {}, allowedEvidenceIds: [] })
    const run = await runOfflinePendingTasks(db(), { taskIds: [id, second.taskId], execute: async () => ({ ok: false, state: 'quota_exhausted', detail: 'limit reached' }) })
    expect(run.results).toHaveLength(1)
    expect(await db().llmTask.count({ where: { status: 'pending' } })).toBe(2)
  })
  it('drains the entire bounded batch when every task succeeds', async () => {
    const ids = []
    for (let i = 0; i < 3; i++) ids.push((await new HandoffLlmGateway(db()).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1', subjectType: 'Company', subjectId: `batch-${i}`, input: {}, allowedEvidenceIds: [] })).taskId)
    const run = await runOfflinePendingTasks(db(), { taskIds: ids, execute: async () => ({ ok: true, value: result }) })
    expect(run.results).toHaveLength(3)
    expect(run.resumable).toBe(false)
  })
  it('does not pause indefinitely when a resumed scope already contains fulfilled tasks', async () => {
    const id = await queued()
    await fulfilTask(db(), id, result)
    const run = await runOfflinePendingTasks(db(), { taskIds: [id], execute: async () => { throw new Error('already completed') } })
    expect(run).toEqual({ results: [], resumable: false })
    expect(await runPendingTasks(db(), { taskIds: [id], provider: 'manual' })).toEqual({ results: [], resumable: false })
  })
  it('blocks credential packets without consuming or mutating them at the production boundary', async () => {
    const id = await queued({ password: 'private value' })
    const run = await runPendingTasks(db(), { taskIds: [id], execute: async () => { throw new Error('must not execute') } })
    expect(run.results[0]).toMatchObject({ state: 'isolation_blocked' })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id } })).status).toBe('pending')
  })
  it('includes approved project links in queued support tasks and refuses changed citations', async () => {
    const sentence = { text: 'The company builds mobile apps.', evidenceIds: ['e1'], approvedClaimIds: [] }
    const { taskId } = await new HandoffLlmGateway(db()).enqueue({ kind: 'draft_support', promptVersion: 'draft_support@1', subjectType: 'DraftSupport', subjectId: 'draft:hash', input: { sentences: [sentence] }, allowedEvidenceIds: ['e1', 'e2'] })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })).input).toHaveProperty('projectLinks')
    const output = { claims: [{ ...sentence, evidenceIds: ['e2'], kind: 'company', verdict: 'supported', reason: 'source' }], overall: 'supported', limitations: [] }
    expect(await fulfilTask(db(), taskId, output)).toMatchObject({ ok: false, problem: 'source_mismatch' })
  })
  it('accepts independently verified authorship flags through both packet and fulfilment credential checks', async () => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue({ kind: 'contact_research', promptVersion: 'contact_research@1', subjectType: 'Contact', subjectId: 'person', input: { verification: { identityVerified: true, identityEvidenceIds: ['e1'], verifiedAuthorshipEvidenceIds: ['e1'] } }, allowedEvidenceIds: ['e1'] })
    // Manual packet/fulfilment remains usable; this is not automatic model execution.
    const task = await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })
    expect(taskPacket(task)).toContain('verifiedAuthorshipEvidenceIds')
    expect(await fulfilTask(db(), taskId, { identityStatus: 'verified', facts: [], hooks: [{ text: 'Jane wrote an article.', evidenceIds: ['e1'], authorshipVerified: true }], limitations: [] })).toMatchObject({ ok: true })
  })
  it('does not accept identity or authorship verification solely from model output', async () => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue({ kind: 'contact_research', promptVersion: 'contact_research@1', subjectType: 'Contact', subjectId: 'person', input: {}, allowedEvidenceIds: ['e1'] })
    expect(await fulfilTask(db(), taskId, { identityStatus: 'verified', facts: [], hooks: [], limitations: [] })).toMatchObject({ ok: false, problem: 'source_mismatch' })
  })
})
