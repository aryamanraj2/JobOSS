/** Test-only fixture harness. Never imported by production. No installed Codex/Claude launch path. */
import { spawn } from 'node:child_process'
import { ownedProcessGroupExists, terminateOwnedProcessGroup } from '../../src/core/llm/process-group.js'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Prisma } from '../../generated/prisma/client.js'
import { writeAudit, type Db } from '../../src/core/audit/audit-log.js'
import { redact } from '../../src/core/logging/redact.js'
import { claimNextTask, fulfilTask } from '../../src/core/llm/handoff-gateway.js'
import { findTaskSchema } from '../../src/core/llm/tasks.js'
import { boundedTimeout, safeRunnerUsage, subscriptionEnvironment, type ExecutionRequest, type ExecutionResult,
  type RunPendingTaskOptions, type TaskExecutor, type TaskRunResult, type TaskBatchResult } from '../../src/core/llm/subscription-runner.js'
import { configuredTestTarget } from './test-target.js'

type OfflineOptions = { provider?: 'codex' | 'claude'; timeoutMs?: number }
export function offlineRequest(options: OfflineOptions): ExecutionRequest {
  if (Object.keys(options).some((key) => !['provider', 'timeoutMs'].includes(key)) ||
      (options.provider !== undefined && !['codex', 'claude'].includes(options.provider))) throw new Error('Offline probe accepts only provider/timeout; no task packets')
  return { provider: options.provider ?? 'codex', timeoutMs: boundedTimeout(options.timeoutMs ?? 5000),
    kind: 'offline_lifecycle_fixture', prompt: 'Offline lifecycle fixture: return 2 for 1 + 1. No tools or source material.',
    schema: { type: 'object', properties: { sum: { const: 2 } }, required: ['sum'], additionalProperties: false } }
}

const quota = (text: string) => /usage limit|rate.?limit|quota|insufficient credits|limit reached|try again.*(?:hours|tomorrow)|exceeded.*limit/i.test(text)

/** Bounded Node-only subprocess fixture; cannot launch installed providers or consume task packets. */
export function createOfflineSubscriptionFixture(deps: {
  command: (request: ExecutionRequest, cwd: string) => { command: string; args: string[] }
}): (options: OfflineOptions) => Promise<ExecutionResult> {
  return async (options) => {
    const request = offlineRequest(options)
    const cwd = await mkdtemp(join(tmpdir(), 'joboss-judgment-'))
    let cleanupSafe = true
    try {
      await writeFile(join(cwd, 'schema.json'), JSON.stringify(request.schema), { mode: 0o600 })
      const { command, args } = deps.command(request, cwd)
      if (command !== process.execPath && command !== join(cwd, 'missing-executable')) throw new Error('Offline fixtures may launch only the current Node runtime or an owned missing executable')
      const processResult = await new Promise<{ code: number | null; stdout: string; stderr: string; timeout: boolean; overflow: boolean }>((resolve) => {
        const child = spawn(command, args, { cwd, env: subscriptionEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], detached: true })
        let stdout = '', stderr = '', timeout = false, settled = false, finalizing = false, overflow = false
        let termination: Promise<boolean> | undefined
        const stop = () => termination ??= child.pid ? terminateOwnedProcessGroup(child.pid).catch(() => false) : Promise.resolve(true)
        const finish = async (code: number | null) => {
          if (finalizing) return
          finalizing = true
          clearTimeout(timer)
          // A parent close does not prove its owned descendants have stopped.
          if (!termination && child.pid) {
            try { if (ownedProcessGroupExists(child.pid)) stop() } catch { cleanupSafe = false }
          }
          if (termination) cleanupSafe = await termination
          settled = true
          resolve({ code, stdout, stderr, timeout, overflow })
        }
        const timer = setTimeout(() => { timeout = true; void stop().then(() => finish(null)) }, request.timeoutMs)
        const collect = (which: 'stdout' | 'stderr', chunk: Buffer) => {
          if (settled || overflow) return
          if (which === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString()
          if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 1_000_000) {
            overflow = true; stdout = ''; stderr = 'Runner output exceeds 1MB'
            void stop().then(() => finish(1))
          }
        }
        child.stdout.on('data', (chunk: Buffer) => collect('stdout', chunk))
        child.stderr.on('data', (chunk: Buffer) => collect('stderr', chunk))
        child.on('error', (error) => { stderr = error.message; void finish(1) })
        child.on('close', (code) => { void finish(code) })
        child.stdin.on('error', () => undefined)
        child.stdin.end(request.prompt)
      })
      if (!cleanupSafe) return { ok: false, state: 'failed', detail: `Owned process group termination could not be confirmed; temporary artifacts retained at ${cwd}` }
      const diagnostic = String(redact(processResult.stderr || processResult.stdout)).slice(0, 1000)
      if (processResult.timeout) return { ok: false, state: 'timed_out', detail: 'Subscription task exceeded its bounded timeout' }
      if (processResult.overflow) return { ok: false, state: 'failed', detail: 'Runner output exceeds 1MB' }
      if (processResult.code !== 0) return { ok: false, state: quota(diagnostic) ? 'quota_exhausted' : 'failed', detail: diagnostic || `CLI exited ${processResult.code}` }
      try {
        if (request.provider === 'claude') {
          const envelope = JSON.parse(processResult.stdout) as { structured_output?: unknown; result?: string; is_error?: boolean; usage?: Record<string, unknown> }
          if (envelope.is_error) return { ok: false, state: quota(envelope.result ?? '') ? 'quota_exhausted' : 'failed', detail: String(redact(envelope.result ?? 'Claude CLI error')).slice(0, 1000) }
          const value = envelope.structured_output ?? JSON.parse(envelope.result ?? '')
          return { ok: true, value, ...(envelope.usage ? { usage: envelope.usage } : {}) }
        }
        if ((await stat(join(cwd, 'output.json'))).size > 1_000_000) return { ok: false, state: 'invalid_output', detail: 'Structured response exceeds 1MB' }
        const value: unknown = JSON.parse(await readFile(join(cwd, 'output.json'), 'utf8'))
        let usage: Record<string, unknown> | undefined
        for (const line of processResult.stdout.split('\n')) {
          try { const event = JSON.parse(line) as { type?: string; usage?: Record<string, unknown> }; if (event.type === 'turn.completed') usage = event.usage } catch { /* stdout includes non-event diagnostics */ }
        }
        return { ok: true, value, ...(usage ? { usage } : {}) }
      } catch { return { ok: false, state: quota(diagnostic) ? 'quota_exhausted' : 'invalid_output', detail: 'Subscription CLI did not return valid structured JSON' } }
    } finally { if (cleanupSafe) await rm(cwd, { recursive: true, force: true }) }
  }
}

export async function runOfflinePendingTasks(db: Db, opts: RunPendingTaskOptions & { execute: TaskExecutor }): Promise<TaskBatchResult> {
  // Test-only harness: never accept captured source/repository packets or installed model executors.
  const target = configuredTestTarget()
  const identity = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
  if (identity[0]?.name !== target.database) throw new Error('Offline batch database mismatch')
  const rows = await db.llmTask.findMany({ where: { id: { in: opts.taskIds } } })
  if (rows.some((task) => task.kind !== 'research_urls' || task.promptVersion !== 'research_urls@1' ||
      task.subjectType !== 'Company' || JSON.stringify(task.input) !== '{}' ||
      task.allowedEvidenceIds.length || task.allowedApprovedClaimIds.length)) throw new Error('Offline batch requires empty synthetic URL fixtures; no source packets')
  const provider = opts.provider ?? 'codex'
  const timeoutMs = boundedTimeout(opts.timeoutMs ?? 180_000)
  if (!Number.isSafeInteger(opts.limit ?? opts.taskIds.length) || (opts.limit ?? opts.taskIds.length) < 0 || opts.taskIds.length > 200) throw new Error('Invalid bounded task batch')
  const completed = await db.llmTask.findMany({ where: { id: { in: opts.taskIds }, status: 'fulfilled' }, select: { id: true } })
  const completedIds = new Set(completed.map((task) => task.id))
  const taskIds = opts.taskIds.filter((id) => !completedIds.has(id))
  if (provider === 'manual') return { results: taskIds.map((taskId) => ({ taskId, state: 'manual_pending', elapsedMs: 0 })), resumable: taskIds.length > 0 }
  const remaining = new Set(taskIds)
  const limit = opts.limit ?? remaining.size
  const results: TaskRunResult[] = []
  for (let n = 0; n < limit && remaining.size; n += 1) {
    const task = await claimNextTask(db, { taskIds: [...remaining], leased: true, leaseMs: timeoutMs + 30_000, ...(opts.now ? { now: opts.now } : {}) })
    if (!task) break
    remaining.delete(task.id)
    const start = Date.now()
    let executed: ExecutionResult
    try {
      const entry = findTaskSchema(task.kind, task.promptVersion)
      if (!entry) throw new Error('Task has no registered schema')
      executed = await opts.execute(offlineRequest({ provider, timeoutMs }))
    } catch (error) { executed = { ok: false, state: 'failed', detail: String(redact(error instanceof Error ? error.message : String(error))).slice(0, 1000) } }
    if (executed.ok && executed.usage) executed.usage = safeRunnerUsage(executed.usage)
    if (!executed.ok) executed.detail = String(redact(executed.detail)).slice(0, 1000)
    let result: TaskRunResult
    if (executed.ok) {
      const saved = await fulfilTask(db, task.id, executed.value, { fulfilledBy: `${provider}-subscription-cli`, claimToken: task.claimToken!, ...(opts.now ? { now: new Date(opts.now.getTime() + Date.now() - start) } : {}) })
      result = { taskId: task.id, state: saved.ok ? 'fulfilled' : saved.problem === 'wrong_status' ? 'lease_lost' : 'invalid_output', elapsedMs: Date.now() - start,
        ...(!saved.ok ? { detail: saved.detail } : {}), ...(executed.usage ? { usage: executed.usage } : {}) }
    } else result = { taskId: task.id, state: executed.state, elapsedMs: Date.now() - start, detail: executed.detail }
    const safeMetadata = redact({ provider, state: result.state, elapsedMs: result.elapsedMs, detail: result.detail,
      usage: undefined, costUsd: 0, recordedAt: new Date().toISOString() }) as Prisma.InputJsonValue
    if (result.usage) (safeMetadata as Record<string, unknown>).usage = safeRunnerUsage(result.usage)
    const recorded = await db.llmTask.updateMany({ where: { id: task.id, ...(result.state === 'fulfilled' ? { status: 'fulfilled', fulfilledBy: `${provider}-subscription-cli` } : { status: 'claimed', claimToken: task.claimToken, leaseExpiresAt: { gt: opts.now ? new Date(opts.now.getTime() + Date.now() - start) : new Date() } }) },
      data: { runnerMetadata: safeMetadata, ...(result.state === 'fulfilled' ? {} : { status: 'pending', claimedAt: null, claimToken: null, leaseExpiresAt: null }) } })
    if (!recorded.count) result = { taskId: task.id, state: 'lease_lost', elapsedMs: Date.now() - start, detail: 'Lease superseded or expired; no result or metadata overwritten' }
    // Keep attempt history after resume replaces the task's latest metadata.
    const usage = result.usage
    await writeAudit(db, { actorType: 'system', actorId: 'subscription-runner', action: 'llm.runner_attempt',
      subjectType: 'LlmTask', subjectId: task.id, costUsd: 0,
      metadata: { provider, state: result.state, elapsedMs: result.elapsedMs, detail: result.detail,
        ...(usage ? { usage: { input: usage.input_tokens, output: usage.output_tokens,
          cachedInput: usage.cached_input_tokens, cacheReadInput: usage.cache_read_input_tokens,
          cacheCreationInput: usage.cache_creation_input_tokens, total: usage.total_tokens } } : {}) },
    })
    results.push(result)
    if (result.state === 'quota_exhausted' || result.state === 'timed_out') break
  }
  return { results, resumable: results.some((r) => r.state !== 'fulfilled') || remaining.size > 0 }
}
