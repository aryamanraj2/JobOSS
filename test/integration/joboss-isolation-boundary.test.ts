import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeTestDb, testDb, truncateAll } from '../helpers/db.js'
import { runPendingTasks } from '../../src/core/llm/subscription-runner.js'
import { HandoffLlmGateway, claimNextTask, fulfilTask } from '../../src/core/llm/handoff-gateway.js'
import { LLM_TASK_SCHEMAS } from '../../src/core/llm/tasks.js'
import { runOfflinePendingTasks } from '../helpers/joboss-offline-runner.js'

const db = () => testDb()
beforeEach(async () => truncateAll())
afterAll(async () => closeTestDb())
const output = { urls: [], limitations: [] }
async function queue(input = {}) {
  return (await new HandoffLlmGateway(db()).enqueue({ kind: 'research_urls', promptVersion: 'research_urls@1',
    subjectType: 'Company', subjectId: 'isolation-fixture', input, allowedEvidenceIds: [] })).taskId
}

describe('C3: real database task state survives unavailable automatic execution', () => {
  it.each([undefined, 'codex', 'claude'] as const)('preserves every registered class/version, attempts, output and active/expired leases for %s', async (provider) => {
    const ids: string[] = []
    for (const entry of LLM_TASK_SCHEMAS) {
      const { taskId } = await new HandoffLlmGateway(db()).enqueue({ kind: entry.kind, promptVersion: entry.promptVersion,
        subjectType: 'Synthetic', subjectId: entry.promptVersion, input: { excerpt: 'Synthetic quoted input only.' }, allowedEvidenceIds: [] })
      ids.push(taskId)
    }
    await claimNextTask(db(), { taskIds: [ids[0]!], now: new Date('2020-01-01'), leaseMs: 1000 })
    await claimNextTask(db(), { taskIds: [ids[1]!], leaseMs: 100_000 })
    await db().llmTask.update({ where: { id: ids[2]! }, data: { attempts: 3, output: { prior: 'preserve' }, runnerMetadata: { prior: true } } })
    const completed = await queue(); await fulfilTask(db(), completed, output); ids.push(completed)
    const before = await db().llmTask.findMany({ orderBy: { id: 'asc' } }), audits = await db().auditLog.count()
    const execute = vi.fn().mockResolvedValue({ ok: true, value: output })
    const result = await runPendingTasks(db(), { taskIds: ids, ...(provider ? { provider } : {}), execute })
    expect(result.resumable).toBe(true)
    expect(result.results).toHaveLength(LLM_TASK_SCHEMAS.length)
    expect(result.results.every((item) => item.state === 'isolation_blocked' && item.blocker?.manualAvailable)).toBe(true)
    expect(result.results.some((item) => item.taskId === completed)).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    expect(await db().llmTask.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect(await db().auditLog.count()).toBe(audits)
  })
  it('offers manual handoff without mutation, accepts manual fulfilment, and preserves completion on automatic resume', async () => {
    const id = await queue()
    const before = await db().llmTask.findUniqueOrThrow({ where: { id } })
    expect(await runPendingTasks(db(), { provider: 'manual', taskIds: [id] })).toMatchObject({ resumable: true, results: [{ state: 'manual_pending' }] })
    expect(await db().llmTask.findUniqueOrThrow({ where: { id } })).toEqual(before)
    expect(await fulfilTask(db(), id, output)).toMatchObject({ ok: true })
    const fulfilled = await db().llmTask.findUniqueOrThrow({ where: { id } })
    for (const provider of ['codex', 'claude', 'manual'] as const) expect(await runPendingTasks(db(), { taskIds: [id], provider })).toEqual({ results: [], resumable: false })
    expect(await db().llmTask.findUniqueOrThrow({ where: { id } })).toEqual(fulfilled)
  })
  it.each([{ excerpt: 'Captured source packet' }, { repoContext: 'repository' }, { diagnostic: true, prompt: 'renamed real packet' }])('offline race harness rejects nonempty packets before claiming: %j', async (input) => {
    const id = await queue(input), before = await db().llmTask.findUniqueOrThrow({ where: { id } })
    const execute = vi.fn()
    await expect(runOfflinePendingTasks(db(), { taskIds: [id], execute })).rejects.toThrow(/no source packets/)
    expect(execute).not.toHaveBeenCalled()
    expect(await db().llmTask.findUniqueOrThrow({ where: { id } })).toEqual(before)
  })
})
