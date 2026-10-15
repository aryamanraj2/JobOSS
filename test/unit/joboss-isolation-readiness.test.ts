import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as childProcess from 'node:child_process'
import * as files from 'node:fs/promises'
import type { Db } from '../../src/core/audit/audit-log.js'
import { createSubscriptionExecutor, executeSubscriptionTask, runPendingTasks, type ExecutionRequest } from '../../src/core/llm/subscription-runner.js'
import { createOfflineSubscriptionFixture, offlineRequest } from '../helpers/joboss-offline-runner.js'

vi.mock('node:child_process', { spy: true })
vi.mock('node:fs/promises', { spy: true })

const kinds = ['research_urls', 'research_brief', 'outreach_draft', 'contact_research', 'draft_support', 'packet_answers', 'offline_lifecycle_fixture', 'arbitrarily_renamed']
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.clearAllMocks())

describe('C3: production isolation is an unavailable execution boundary', () => {
  it.each(['codex', 'claude'] as const)('blocks direct %s execution for every task class before auth/temp/launch, despite injection or forged flags', async (provider) => {
    const authenticate = vi.fn(), command = vi.fn()
    const launch = vi.mocked(childProcess.spawn), temp = vi.mocked(files.mkdtemp), read = vi.mocked(files.readFile)
    vi.stubEnv('JOBOSS_ISOLATION_VERIFIED', 'true')
    try {
      for (const kind of kinds) {
        const request: ExecutionRequest = { provider, kind, prompt: 'untrusted source / repository packet', schema: {}, timeoutMs: 1 }
        Object.assign(request, { isolationVerified: true, diagnostic: true, input: { verified: true } })
        for (const execute of [executeSubscriptionTask, createSubscriptionExecutor({ authenticate, command })]) {
          expect(await execute(request)).toMatchObject({ ok: false, state: 'isolation_blocked', blocker: {
            code: 'isolation_unverified', readiness: 'unverified', provider, manualAvailable: true,
            capabilityClass: kind === 'research_urls' ? 'candidate_url_search' : kinds.slice(1, 6).includes(kind) ? 'writer_support' : 'unclassified',
          } })
        }
      }
      expect(authenticate).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled()
      expect(launch).not.toHaveBeenCalled(); expect(temp).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })
  it.each([undefined, 'codex', 'claude'] as const)('blocks default/explicit batch %s before claims and executor access', async (provider) => {
    const execute = vi.fn(), claim = vi.fn(), update = vi.fn(), audit = vi.fn()
    const findMany = vi.fn().mockResolvedValue(kinds.map((kind) => ({ id: kind, kind, status: 'pending' })))
    const db = { llmTask: { findMany, updateMany: update, findFirst: claim }, auditLog: { create: audit }, $queryRaw: claim } as unknown as Db
    const launch = vi.mocked(childProcess.spawn), temp = vi.mocked(files.mkdtemp), read = vi.mocked(files.readFile)
    const options = { taskIds: kinds, ...(provider ? { provider } : {}), execute }
    Object.assign(options, { isolationVerified: true, allowAutomatic: true, diagnostic: true })
    const result = await runPendingTasks(db, options)
    expect(result.resumable).toBe(true); expect(result.results).toHaveLength(kinds.length)
    expect(result.results.every((item) => item.state === 'isolation_blocked' && item.blocker?.provider === (provider ?? 'codex'))).toBe(true)
    expect(findMany.mock.calls[0]?.[0]).toHaveProperty('select', { id: true, kind: true, status: true })
    for (const spy of [execute, claim, update, audit, launch, temp, read]) expect(spy).not.toHaveBeenCalled()
  })
  it('does not even read injected executor properties; a caller cannot grant readiness', async () => {
    const deps = { get authenticate(): never { throw new Error('must not access injection') }, get command(): never { throw new Error('must not access injection') } }
    expect(await createSubscriptionExecutor(deps)({ provider: 'codex', kind: 'diagnostic', prompt: 'arbitrary packet', schema: {}, timeoutMs: 1 })).toHaveProperty('state', 'isolation_blocked')
    const db = { llmTask: { findMany: async () => [{ id: 'pending', kind: 'research_urls', status: 'pending' }] } } as unknown as Db
    expect(await runPendingTasks(db, { taskIds: ['pending'], get execute(): never { throw new Error('must not access executor') } })).toHaveProperty('resumable', true)
  })
})

describe('C3: separated offline fixture input and command boundary', () => {
  it.each(['prompt', 'schema', 'kind', 'input', 'packet', 'isolationVerified'])('rejects arbitrary %s input before temporary creation or command selection', async (key) => {
    const command = vi.fn(), temp = vi.mocked(files.mkdtemp)
    const options = Object.assign({ provider: 'codex' as const }, { [key]: 'repository/source content' })
    expect(() => offlineRequest(options)).toThrow(/no task packets/)
    await expect(createOfflineSubscriptionFixture({ command })(options)).rejects.toThrow(/no task packets/)
    expect(command).not.toHaveBeenCalled(); expect(temp).not.toHaveBeenCalled()
  })
  it.each(['codex', 'claude'])('cannot select the installed %s command in an offline fixture', async (command) => {
    const launch = vi.mocked(childProcess.spawn)
    await expect(createOfflineSubscriptionFixture({ command: () => ({ command, args: [] }) })({})).rejects.toThrow(/only the current Node runtime/)
    expect(launch).not.toHaveBeenCalled()
  })
  it('constructs only the fixed arithmetic packet internally', () => {
    expect(offlineRequest({})).toMatchObject({ kind: 'offline_lifecycle_fixture', prompt: 'Offline lifecycle fixture: return 2 for 1 + 1. No tools or source material.', schema: { additionalProperties: false } })
  })
})
