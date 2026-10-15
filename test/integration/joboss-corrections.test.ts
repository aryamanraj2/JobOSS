import { runOfflinePendingTasks } from '../helpers/joboss-offline-runner.js'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { testDb, truncateAll, closeTestDb, assertSafeTestDatabase } from '../helpers/db.js'
import { configuredTestTarget } from '../helpers/test-target.js'
import { createPrismaClient, type PrismaClient } from '../../src/core/db/client.js'
import { checkBudget, reserveBudget, recordSpend, type BudgetSpend } from '../../src/core/policy/budget.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { HandoffLlmGateway, claimNextTask, fulfilTask, rejectTask } from '../../src/core/llm/handoff-gateway.js'
import type { Db } from '../../src/core/audit/audit-log.js'
import type { ProviderMessageRef } from '../../src/core/interfaces/providers.js'
import { mockAgent } from '../setup.js'

const NOW = new Date('2026-10-15T00:00:00Z'), PERIOD = '2026-10'
const db = () => testDb()
const connections: PrismaClient[] = []
let requests = 0
function connection() { const client = createPrismaClient(assertSafeTestDatabase()); connections.push(client); return client }
function gate(client: Db = db()) { return new FetchPolicyGate(client, { userAgent: 'joboss-corrections', robotsTtlSeconds: 86400, defaultRateDelayMs: 0, now: () => NOW }) }
const spec = { kind: 'research_urls' as const, promptVersion: 'research_urls@1', subjectType: 'Company', subjectId: 'race', input: {}, allowedEvidenceIds: [] }
const output = { urls: [], limitations: [] }
beforeEach(async () => { await truncateAll(); requests = 0 })
afterEach(async () => { await Promise.all(connections.splice(0).map((client) => client.$disconnect())) })
afterAll(async () => closeTestDb())
async function envelopes(globalCap: number, companyCap?: number, vendorCap = globalCap) {
  const global = await db().researchBudget.create({ data: { companyId: null, periodMonth: PERIOD, creditsCap: globalCap, vendorCreditsCap: vendorCap, billedUsdCap: 100 } })
  const company = companyCap === undefined ? null : await db().company.create({ data: { displayName: 'Credits', canonicalDomain: 'credits.example' } })
  if (company) await db().researchBudget.create({ data: { companyId: company.id, periodMonth: PERIOD, creditsCap: companyCap!, billedUsdCap: 100 } })
  return { global, company }
}
async function allow(host: string) { await db().hostPolicy.create({ data: { host, mode: 'allow', origin: 'operator' } }) }
function intercept(host: string) {
  for (const method of ['GET', 'POST']) mockAgent.get(`https://${host}`).intercept({ path: /.*/, method }).reply((options) => {
    if (options.path === '/robots.txt') return { statusCode: 200, data: 'User-agent: *\nAllow: /\n' }
    requests++; return { statusCode: 200, data: '{}' }
  }).persist()
}

function heldRead(client: PrismaClient) {
  let ready!: () => void, release!: () => void
  const read = new Promise<void>((resolve) => { ready = resolve })
  const resume = new Promise<void>((resolve) => { release = resolve })
  const wrapped = new Proxy(client, { get(target, key) {
    if (key !== 'llmTask') return Reflect.get(target, key)
    return new Proxy(target.llmTask, { get(delegate, method) {
      if (method !== 'findUnique') return Reflect.get(delegate, method)
      return async (args: Parameters<typeof delegate.findUnique>[0]) => { const row = await delegate.findUnique(args); ready(); await resume; return row }
    } })
  } })
  return { wrapped, read, release }
}

describe('R-A2: exact zero-cost operations and committed network authorization', () => {
  it.each(['missing', 'exhausted'])('blocks zero and vendor-only research with %s envelopes at the actual transport', async (state) => {
    if (state === 'exhausted') await envelopes(0)
    for (const host of ['hacker-news.firebaseio.com', 'startupdb.com', 'company.example']) { await allow(host); intercept(host) }
    for (const url of ['https://hacker-news.firebaseio.com/v0/item/1.json', 'https://startupdb.com/api/v1/startups?q=mobile', 'https://company.example/research']) {
      for (const context of [{ cost: 0 }, { cost: 0, vendorCost: 1 }]) {
        expect(await gate().fetchText(url, context)).toEqual({ ok: false, reason: 'budget_exhausted' })
      }
    }
    expect(requests).toBe(0)
    expect((await db().researchBudget.findMany()).every((row) => row.creditsSpent === 0 && row.vendorCreditsSpent === 0)).toBe(true)
  })
  it('preserves the exact existing mail list/read/attachment/send and OAuth zero-cost operations without research envelopes', async () => {
    for (const host of ['gmail.googleapis.com', 'oauth2.googleapis.com']) { await allow(host); intercept(host) }
    const root = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
    for (const url of [`${root}?q=in%3Aanywhere&maxResults=50&includeSpamTrash=true&pageToken=next`, `${root}/abc123?format=full`, `${root}/abc123/attachments/attachment_1`]) expect((await gate().fetchText(url, { cost: 0 })).ok).toBe(true)
    expect((await gate().postJson(`${root}/send`, { raw: 'synthetic-offline-payload' }, { cost: 0 })).ok).toBe(true)
    expect((await gate().postForm('https://oauth2.googleapis.com/token', { grant_type: 'refresh_token', client_id: 'fixture', client_secret: 'fixture', refresh_token: 'fixture' }, { cost: 0 })).ok).toBe(true)
    expect((await gate().postForm('https://oauth2.googleapis.com/token', { grant_type: 'authorization_code', client_id: 'fixture', client_secret: 'fixture', code: 'fixture', redirect_uri: 'http://localhost/fixture' }, { cost: 0 })).ok).toBe(true)
    expect(requests).toBe(6)
    expect(await db().researchBudget.count()).toBe(0)
  })
  it('does not exempt an entire Google domain, unknown mail paths/queries, different method/encoding or unrelated token operations', async () => {
    for (const host of ['gmail.googleapis.com', 'oauth2.googleapis.com']) { await allow(host); intercept(host) }
    const urls = ['https://gmail.googleapis.com/gmail/v1/users/me/profile', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=raw', 'https://gmail.googleapis.com/gmail/v1/users/other/messages/abc?format=full', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=full&unknown=true']
    for (const url of urls) expect(await gate().fetchText(url, { cost: 0 })).toMatchObject({ ok: false })
    expect(await gate().postJson('https://oauth2.googleapis.com/token', { grant_type: 'refresh_token' }, { cost: 0 })).toMatchObject({ ok: false })
    expect(await gate().postForm('https://oauth2.googleapis.com/token', { grant_type: 'client_credentials' }, { cost: 0 })).toMatchObject({ ok: false })
    expect(await gate().postForm('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw: 'fixture' }, { cost: 0 })).toMatchObject({ ok: false })
    expect(requests).toBe(0)
  })
  it('still enforces host denial and terms for exempt mail', async () => {
    intercept('gmail.googleapis.com')
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/a?format=full'
    const policy = await db().hostPolicy.create({ data: { host: 'gmail.googleapis.com', mode: 'deny', origin: 'operator' } })
    expect(await gate().fetchText(url, { cost: 0 })).toMatchObject({ reason: 'host_denied' })
    await db().hostPolicy.update({ where: { id: policy.id }, data: { mode: 'allow', termsProhibited: true } })
    expect(await gate().fetchText(url, { cost: 0 })).toMatchObject({ reason: 'terms_prohibited' })
    expect(requests).toBe(0)
  })
  it('refuses transaction-client networking before transport, so a later rollback cannot erase a request reservation', async () => {
    await envelopes(2); await allow('hacker-news.firebaseio.com'); intercept('hacker-news.firebaseio.com')
    await expect(db().$transaction(async (tx) => {
      expect(await gate(tx).fetchText('https://hacker-news.firebaseio.com/v0/item/8.json', { cost: 1 })).toEqual({ ok: false, reason: 'budget_exhausted' })
      throw new Error('intentional surrounding rollback')
    })).rejects.toThrow('rollback')
    expect(requests).toBe(0)
    expect((await db().researchBudget.findFirstOrThrow()).creditsSpent).toBe(0)
  })
})

describe('R-A3: unique envelopes and exact accounting on independent connections', () => {
  it('allows one concurrent global envelope creation and keeps the database invariant', async () => {
    const a = connection(), b = connection()
    const results = await Promise.allSettled([a, b].map((client) => client.researchBudget.create({ data: { companyId: null, periodMonth: PERIOD, creditsCap: 1, billedUsdCap: 0 } })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(await db().researchBudget.count()).toBe(1)
  })
  it.each(['global', 'company', 'vendor'])('reserves exactly one last %s credit across independent PostgreSQL connections', async (dimension) => {
    const { company } = await envelopes(dimension === 'global' ? 1 : 10, dimension === 'company' ? 1 : 10, dimension === 'vendor' ? 1 : 10)
    const a = connection(), b = connection()
    const pids = await Promise.all([a, b].map((client) => client.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`))
    expect(pids[0]![0]!.pid).not.toBe(pids[1]![0]!.pid)
    const spend = { credits: 1, vendorCredits: dimension === 'vendor' ? 1 : 0 }
    const results = await Promise.all([a, b].map((client) => reserveBudget(client, company!.id, spend, NOW)))
    expect(results.filter((r) => r.allowed)).toHaveLength(1)
    const rows = await db().researchBudget.findMany()
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row).toMatchObject({ creditsSpent: 1, vendorCreditsSpent: spend.vendorCredits })
  })
  it.each([1.5, -1, NaN, Infinity, { credits: 1, vendorCredits: 1.5 }, { credits: 1, vendorCredits: -1 }, { credits: 0, vendorCredits: 1 }, { credits: 1, billedUsd: NaN }, { credits: 1, billedUsd: -1 }] as Array<number | BudgetSpend>)('rejects invalid spend consistently through check, reserve and direct accounting: %j', async (spend) => {
    await envelopes(10, 10)
    expect(await checkBudget(db(), null, spend, NOW)).toMatchObject({ allowed: false, scope: 'invalid_spend' })
    expect(await reserveBudget(db(), null, spend, NOW)).toMatchObject({ allowed: false, scope: 'invalid_spend' })
    await expect(recordSpend(db(), null, spend, NOW)).rejects.toMatchObject({ verdict: { scope: 'invalid_spend' } })
    expect((await db().researchBudget.findMany()).every((row) => row.creditsSpent === 0 && row.vendorCreditsSpent === 0)).toBe(true)
  })
  it('keeps transaction-client accounting provisional until the surrounding transaction commits', async () => {
    await envelopes(2)
    await expect(db().$transaction(async (tx) => {
      expect(await reserveBudget(tx, null, 1, NOW)).toEqual({ allowed: true })
      throw new Error('provisional accounting rollback')
    })).rejects.toThrow('rollback')
    expect((await db().researchBudget.findFirstOrThrow()).creditsSpent).toBe(0)
  })
  it('direct accounting cannot increment outside the validated company/global caps', async () => {
    const { company } = await envelopes(1, 1)
    await recordSpend(db(), company!.id, 1, NOW)
    await expect(recordSpend(db(), company!.id, 1, NOW)).rejects.toThrow('Budget accounting refused: global')
    expect((await db().researchBudget.findMany()).every((row) => row.creditsSpent === 1)).toBe(true)
  })
  it('fails closed without charging when a pre-migration duplicate envelope is encountered', async () => {
    const row = (await envelopes(1)).global
    const update = vi.fn(), fake = { researchBudget: { findMany: async () => [row, { ...row, id: 'duplicate', creditsCap: 0 }], update }, $queryRaw: async () => [], $transaction: async (fn: (tx: unknown) => unknown) => fn(fake) } as unknown as Db
    expect(await checkBudget(fake, null, 1, NOW)).toMatchObject({ allowed: false, scope: 'ambiguous' })
    expect(await reserveBudget(fake, null, 1, NOW)).toMatchObject({ allowed: false, scope: 'ambiguous' })
    await expect(recordSpend(fake, null, 1, NOW)).rejects.toThrow('explicit reconciliation required')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('R-A3/R-A6: corrective migration refuses duplicates without automatic reconciliation', () => {
  it.each(['budget', 'task'])('refuses existing duplicate %s records and preserves every row', async (kind) => {
    const target = configuredTestTarget(), client = new Client({ connectionString: target.url })
    const schema = `correction_${randomUUID().replaceAll('-', '')}`
    await client.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"`)
      await client.query(`SET search_path TO "${schema}"`)
      await client.query('CREATE TABLE research_budget (company_id text, period_month text); CREATE TABLE llm_task (kind text, prompt_version text, subject_type text, subject_id text, status text)')
      if (kind === 'budget') await client.query("INSERT INTO research_budget VALUES (NULL,'2026-10'), (NULL,'2026-10')")
      else await client.query("INSERT INTO llm_task VALUES ('research_urls','research_urls@1','Company','duplicate','pending'), ('research_urls','research_urls@1','Company','duplicate','claimed')")
      const sql = await readFile(new URL('../../prisma/migrations/20261015010000_joboss_foundation_uniqueness/migration.sql', import.meta.url), 'utf8')
      await expect(client.query(sql)).rejects.toThrow(kind === 'budget' ? 'Duplicate global budget periods' : 'Duplicate open task identities')
      await client.query('ROLLBACK')
      expect(Number((await client.query(`SELECT count(*) AS n FROM ${kind === 'budget' ? 'research_budget' : 'llm_task'}`)).rows[0].n)).toBe(2)
      expect((await client.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1', [schema])).rowCount).toBe(0)
    } finally {
      await client.query('ROLLBACK'); await client.query('SET search_path TO public'); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.end()
    }
  })
})

describe('R-A4: captured identity is required regardless of model identity label', () => {
  it.each([{ ids: [] }, { ids: ['unknown'] }, { ids: ['e1', 'unknown'] }])('does not fulfil an unverified-label authorship hook with identity evidence $ids', async ({ ids }) => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue({ kind: 'contact_research', promptVersion: 'contact_research@1', subjectType: 'Contact', subjectId: 'identity', input: { verification: { identityVerified: true, identityEvidenceIds: ids, verifiedAuthorshipEvidenceIds: ['e1'] } }, allowedEvidenceIds: ['e1'] })
    expect(await fulfilTask(db(), taskId, { identityStatus: 'unverified', facts: [], hooks: [{ text: 'Jane authored the article.', evidenceIds: ['e1'], authorshipVerified: true }], limitations: [] })).toMatchObject({ ok: false, problem: 'source_mismatch' })
    expect((await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe('pending')
  })
})

describe('R-A6: atomic open-task enqueue and fenced race outcomes', () => {
  it('deduplicates simultaneous enqueue through independent operating-system processes', async () => {
    const children = Array.from({ length: 4 }, () => spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../helpers/joboss-enqueue-child.ts', import.meta.url))], { env: { ...process.env, TEST_DATABASE_URL: assertSafeTestDatabase() }, stdio: ['pipe', 'pipe', 'pipe'] }))
    try {
      const resultPromises = children.map((child) => new Promise<{ taskId: string; created: boolean }>((resolve, reject) => {
        let text = ''
        child.stdout.on('data', (chunk: Buffer) => { text += chunk.toString(); const lines = text.trim().split('\n'); if (text.endsWith('\n') && lines.length > 1) { try { resolve(JSON.parse(lines[1]!)) } catch { reject(new Error('Invalid enqueue fixture response')) } } })
        child.on('error', reject); child.on('exit', (code) => { if (code !== 0) reject(new Error(`Enqueue fixture exited ${code}`)) })
      }))
      const resultGroup = Promise.all(resultPromises)
      void resultGroup.catch(() => undefined)
      await Promise.all(children.map((child) => new Promise<void>((resolve, reject) => {
        let readyText = ''
        const timer = setTimeout(() => reject(new Error('Enqueue fixture readiness timeout')), 10000)
        child.stdout.on('data', (chunk: Buffer) => { readyText += chunk.toString(); if (readyText.includes('READY\n')) { clearTimeout(timer); resolve() } })
        child.on('error', (error) => { clearTimeout(timer); reject(error) })
        child.on('exit', (code) => { clearTimeout(timer); if (!readyText.includes('READY\n')) reject(new Error(`Enqueue fixture exited before ready: ${code}`)) })
      })))
      children.forEach((child) => child.stdin.end('GO\n'))
      const results = await resultGroup
      expect(new Set(results.map((r) => r.taskId)).size).toBe(1)
      expect(results.filter((r) => r.created)).toHaveLength(1)
      expect(await db().llmTask.count()).toBe(1)
      expect(await db().auditLog.count({ where: { action: 'llm.task_queued' } })).toBe(1)
    } finally { children.forEach((child) => { if (child.exitCode === null) child.kill('SIGTERM') }) }
  })
  it('handles duplicate enqueue inside an existing transaction without aborting that transaction', async () => {
    const first = await new HandoffLlmGateway(db()).enqueue(spec)
    const second = await db().$transaction(async (tx) => {
      const result = await new HandoffLlmGateway(tx).enqueue(spec)
      await tx.$queryRaw`SELECT 1`
      return result
    })
    expect(second).toEqual({ taskId: first.taskId, created: false })
  })
  it('does not commit an enqueued task or its audit outside a caller-owned transaction that rolls back', async () => {
    await expect(db().$transaction(async (tx) => {
      expect((await new HandoffLlmGateway(tx).enqueue(spec)).created).toBe(true)
      throw new Error('enqueue rollback')
    })).rejects.toThrow('rollback')
    expect(await db().llmTask.count()).toBe(0)
    expect(await db().auditLog.count({ where: { action: 'llm.task_queued' } })).toBe(0)
  })
  it('preserves terminal history while allowing intentional subsequent tasks and versioned identities', async () => {
    const first = await new HandoffLlmGateway(db()).enqueue(spec)
    await fulfilTask(db(), first.taskId, output)
    const second = await new HandoffLlmGateway(db()).enqueue(spec)
    expect(second.created).toBe(true); expect(second.taskId).not.toBe(first.taskId)
    await rejectTask(db(), second.taskId, 'weak_evidence')
    expect((await new HandoffLlmGateway(db()).enqueue(spec)).created).toBe(true)
    for (const version of [4, 5]) expect((await new HandoffLlmGateway(db()).enqueue({ ...spec, kind: 'outreach_draft', promptVersion: `outreach_draft@${version}` })).created).toBe(true)
    expect(await db().llmTask.count()).toBe(5)
  })
  it('allows only one simultaneous claimant and only one fulfil/reject winner across independent connections', async () => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue(spec), a = connection(), b = connection()
    const claims = await Promise.all([a, b].map((client) => claimNextTask(client, { taskIds: [taskId], now: NOW })))
    expect(claims.filter(Boolean)).toHaveLength(1)
    const token = claims.find(Boolean)!.claimToken
    const results = await Promise.all([fulfilTask(a, taskId, output, { claimToken: token, now: NOW }), rejectTask(b, taskId, 'weak_evidence', undefined, { claimToken: token, now: NOW })])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const saved = await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })
    expect(saved.attempts).toBe(1)
    expect(saved.output).toEqual(saved.status === 'fulfilled' ? output : null)
  })
  it.each(['success', 'invalid', 'rejection'])('fences a superseded worker after its initial read during %s', async (action) => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue(spec), a = connection(), b = connection()
    const old = (await claimNextTask(a, { taskIds: [taskId], now: NOW, leaseMs: 1000 }))!
    const held = heldRead(a)
    const pending = action === 'rejection' ? rejectTask(held.wrapped, taskId, 'weak_evidence', undefined, { claimToken: old.claimToken, now: NOW }) : fulfilTask(held.wrapped, taskId, action === 'success' ? output : {}, { claimToken: old.claimToken, now: NOW })
    await held.read
    const current = (await claimNextTask(b, { taskIds: [taskId], now: new Date(NOW.getTime() + 1001), leaseMs: 1000 }))!
    held.release()
    expect((await pending).ok).toBe(false)
    expect(await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({ status: 'claimed', claimToken: current.claimToken, output: null, attempts: 0, runnerMetadata: null })
  })
  it.each(['success', 'quota'])('does not overwrite a replacement worker with stale runner %s metadata', async (mode) => {
    const { taskId } = await new HandoffLlmGateway(db()).enqueue(spec), replacement = connection()
    const run = await runOfflinePendingTasks(db(), { taskIds: [taskId], timeoutMs: 1, now: NOW, execute: async () => {
      const claim = (await claimNextTask(replacement, { taskIds: [taskId], now: new Date(NOW.getTime() + 40000) }))!
      await replacement.llmTask.update({ where: { id: taskId }, data: { runnerMetadata: { owner: claim.claimToken } } })
      return mode === 'success' ? { ok: true, value: output } : { ok: false, state: 'quota_exhausted', detail: 'fixture quota' }
    } })
    expect(run.results[0]?.state).toBe('lease_lost')
    const saved = await db().llmTask.findUniqueOrThrow({ where: { id: taskId } })
    expect(saved).toMatchObject({ status: 'claimed', output: null, attempts: 0, runnerMetadata: { owner: saved.claimToken } })
  })
  it('preserves the additive optional actual RFC Message-ID interface', () => {
    const omitted: ProviderMessageRef = { providerMessageId: 'provider' }, absent: ProviderMessageRef = { providerMessageId: 'provider', rfc822MessageId: null }, actual: ProviderMessageRef = { providerMessageId: 'provider', rfc822MessageId: '<actual@provider.example>' }
    expect(omitted.rfc822MessageId).toBeUndefined(); expect(absent.rfc822MessageId).toBeNull(); expect(actual.rfc822MessageId).toContain('actual')
  })
})
