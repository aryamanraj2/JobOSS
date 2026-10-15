import { isStandaloneDatabaseClient } from '../joboss/database-scope.js'
import { randomUUID } from 'node:crypto'
import { assertCredentialFreeTaskData } from './packet-safety.js'
import { APPROVED_PROJECT_LINKS } from '../joboss/project-links.js'
import { validateContactResearch, validateDraftSupport, type ContactVerification, type SupportSentence } from './foundation-validation.js'
import type { ContactResearchResponse, DraftSupportResponse } from './tasks.js'
import type { z } from 'zod'
import type { Db } from '../audit/audit-log.js'
import { writeAudit } from '../audit/audit-log.js'
import type { Prisma } from '../../../generated/prisma/client.js'
import type { LlmGateway } from '../interfaces/providers.js'
import type { ReasonCodeValue } from '../reason-codes/registry.js'
import {
  collectCitedApprovedClaimIds,
  collectCitedEvidenceIds,
  findTaskSchema,
  findTaskSchemaByPromptVersion,
  jsonSchemaFor,
  type LlmTaskKind,
} from './tasks.js'

/**
 * `HandoffLlmGateway` — the app never calls a model.
 *
 * Full design: `docs/handoff-llm-gateway.md`. This is that design as built.
 *
 * F0's deviation §4.9, a user decision: the LLM in this system is the operator's
 * own Claude Code session, not the Claude API, which makes marginal LLM cost zero.
 * A session is not callable from a pg-boss worker, so the gateway inverts the call:
 * the app records a request and moves on, and a session drains the backlog later
 * through the `llm:*` CLI.
 *
 * Four properties hold regardless of which implementation is in use:
 *
 *  1. **The app never calls a model.** `complete()` on this implementation cannot
 *     return a value; it writes a row and throws `LlmTaskPendingError`. Callers
 *     that expect an answer must tolerate "not yet" — which is why `enqueue()`
 *     exists as the non-throwing form, and why every F2 caller uses it.
 *  2. **The session never fetches.** `input` carries `Evidence` excerpts that
 *     `FetchPolicyGate` already captured. One direction: gate fetches, code writes
 *     Evidence, session reads Evidence from a payload. A session reading live pages
 *     while holding Bash and database access is the tool-calling LLM in the research
 *     path that Part G forbids, and it would break provenance, since an excerpt must
 *     be verbatim and a summary is not.
 *  3. **Validation lives in the CLI**, not in the session's discipline — the session
 *     is the thing being validated. See `fulfilTask` below.
 *  4. **Everything deterministic stays deterministic.** Scoring, normalization,
 *     dedup, HMAC, state transitions, the send gate and every ATS/JSON parse are
 *     unaffected by whether any of this is switched on (H10).
 */

export class LlmDisabledError extends Error {
  constructor(readonly promptVersion: string) {
    super(
      `LLM is disabled; "${promptVersion}" must be produced manually. H10: the pipeline degrades to ` +
        `manual drafting, never to a broken pipeline.`,
    )
    this.name = 'LlmDisabledError'
  }
}

export class LlmTaskPendingError extends Error {
  constructor(readonly taskId: string, readonly promptVersion: string) {
    super(`LLM task ${taskId} (${promptVersion}) is queued for a Claude Code session; no value yet.`)
    this.name = 'LlmTaskPendingError'
  }
}

/**
 * H10's floor. Always available, never throws at construction, and turns every
 * request into a typed error the caller converts into a manual task.
 */
export class NullLlmGateway implements LlmGateway {
  readonly enabled = false

  complete<T>(s: { promptVersion: string; schema: z.ZodType<T>; input: unknown; maxTokens: number }): Promise<{
    value: T
    costUsd: number
  }> {
    return Promise.reject(new LlmDisabledError(s.promptVersion))
  }
}

export type EnqueueSpec = {
  kind: LlmTaskKind
  promptVersion: string
  /** Payload. Evidence excerpts are quoted here; nothing is fetched at fulfil time. */
  input: Record<string, unknown>
  /** The only evidence ids a response may cite. */
  allowedEvidenceIds: string[]
  /**
   * The only `ApprovedClaim` ids a response may cite (F3). Optional because most
   * kinds make no candidate claims; an omitted or empty set means "cite none", never
   * "cite anything", which is what makes the check safe to add to existing kinds.
   */
  allowedApprovedClaimIds?: string[]
  subjectType: string
  subjectId: string
}

export class HandoffLlmGateway implements LlmGateway {
  /** True: the gateway works. It queues rather than answers, which is not the same as off. */
  readonly enabled = true

  constructor(private readonly db: Db) {}

  /**
   * Writes the task and returns its id. The non-throwing form, and the one every
   * caller in F2 uses.
   *
   * Idempotent per (kind, promptVersion, subject): re-running a refresh must not
   * pile up identical asks in the operator's queue. An existing pending or claimed
   * row is returned as-is.
   */
  async enqueue(spec: EnqueueSpec): Promise<{ taskId: string; created: boolean }> {
    const entry = findTaskSchema(spec.kind, spec.promptVersion)
    if (!entry) {
      throw new Error(
        `No registered schema for ${spec.kind}/${spec.promptVersion}. A task nothing can validate must not be written.`,
      )
    }

    const persist = async (db: Db): Promise<{ taskId: string; created: boolean }> => {
      const input = spec.kind === 'draft_support' ? { ...spec.input, projectLinks: APPROVED_PROJECT_LINKS } : spec.input
      // A partial unique index is the arbiter. DO NOTHING keeps caller-owned
      // transactions usable: no reread inside a transaction aborted by P2002.
      for (let retry = 0; retry < 5; retry++) {
        const id = randomUUID()
        const rows = await db.$queryRaw<Array<{ id: string }>>`INSERT INTO llm_task
          (id, kind, prompt_version, response_schema, input, allowed_evidence_ids,
           allowed_approved_claim_ids, subject_type, subject_id)
          VALUES (${id}, ${spec.kind}, ${spec.promptVersion}, ${JSON.stringify(jsonSchemaFor(entry.schema))}::jsonb,
            ${JSON.stringify(input)}::jsonb, ${spec.allowedEvidenceIds}::text[], ${spec.allowedApprovedClaimIds ?? []}::text[],
            ${spec.subjectType}, ${spec.subjectId})
          ON CONFLICT (kind, prompt_version, subject_type, subject_id) WHERE status IN ('pending', 'claimed')
          DO NOTHING RETURNING id`
        if (rows[0]) {
          await writeAudit(db, { actorType: 'system', actorId: 'llm-gateway', action: 'llm.task_queued',
            subjectType: spec.subjectType, subjectId: spec.subjectId,
            metadata: { taskId: id, kind: spec.kind, promptVersion: spec.promptVersion,
              allowed: spec.allowedEvidenceIds.length, allowedClaims: spec.allowedApprovedClaimIds?.length ?? 0 } })
          return { taskId: id, created: true }
        }
        const existing = await db.llmTask.findFirst({ where: { kind: spec.kind, promptVersion: spec.promptVersion,
          subjectType: spec.subjectType, subjectId: spec.subjectId, status: { in: ['pending', 'claimed'] } }, select: { id: true } })
        if (existing) return { taskId: existing.id, created: false }
        // The conflict winner may have completed between INSERT and reread.
        // A later terminal task permits a new task; retry the atomic insertion.
      }
      throw new Error('Open task identity changed repeatedly; retry enqueue')
    }
    return isStandaloneDatabaseClient(this.db) ? this.db.$transaction(persist) : persist(this.db)
  }

  /**
   * The `LlmGateway` shape, for callers written against the interface. It queues
   * and then throws `LlmTaskPendingError`, because there is no honest value to
   * return: the answer arrives when a human opens a session, not when this promise
   * settles.
   */
  async complete<T>(s: {
    promptVersion: string
    schema: z.ZodType<T>
    input: unknown
    maxTokens: number
  }): Promise<{ value: T; costUsd: number }> {
    const entry = findTaskSchemaByPromptVersion(s.promptVersion)
    if (!entry) throw new Error(`No registered schema for prompt version ${s.promptVersion}.`)
    const { taskId } = await this.enqueue({
      kind: entry.kind,
      promptVersion: s.promptVersion,
      input: (s.input ?? {}) as Record<string, unknown>,
      allowedEvidenceIds: [],
      allowedApprovedClaimIds: [],
      subjectType: 'Unspecified',
      subjectId: 'unspecified',
    })
    throw new LlmTaskPendingError(taskId, s.promptVersion)
  }
}

// ---------------------------------------------------------------------------
// Fulfilment — the choke point (docs/handoff-llm-gateway.md)
// ---------------------------------------------------------------------------

export type FulfilFailure = {
  ok: false
  problem:
    | 'unknown_task'
    | 'wrong_status'
    | 'no_schema'
    | 'schema_mismatch'
    | 'uncited_evidence'
    | 'uncited_claim'
    | 'redaction'
    | 'source_mismatch'
  detail: string
}

export type FulfilResult = { ok: true; taskId: string } | FulfilFailure

/**
 * Validates and accepts a session's output.
 *
 * Everything here is a check the session cannot perform on its own behalf, which is
 * the entire point: the session is the thing being validated, so a session that
 * writes sloppy output gets rejected by code it does not control.
 *
 *  1. The task exists and is still open.
 *  2. Its `kind`/`promptVersion` has a registered schema, and the output parses
 *     against it.
 *  3. **Every cited `evidenceId` is in `allowedEvidenceIds`.** This is the mechanism
 *     behind `handover.md` §11's golden test: an unsupported claim becomes a schema
 *     error rather than something a human is expected to catch.
 *  4. **Every cited `approvedClaimId` is in `allowedApprovedClaimIds`** (F3). The same
 *     rule, pointed at the candidate rather than the employer — an application answer
 *     asserts things about both, and only one of them was covered before.
 *  5. No field carries text matching the redaction patterns.
 */
export async function fulfilTask(
  db: Db,
  taskId: string,
  output: unknown,
  opts: { fulfilledBy?: string; now?: Date; claimToken?: string } = {},
): Promise<FulfilResult> {
  const task = await db.llmTask.findUnique({ where: { id: taskId } })
  if (!task) return { ok: false, problem: 'unknown_task', detail: `no task ${taskId}` }
  if (task.status === 'fulfilled' || task.status === 'abandoned') {
    return { ok: false, problem: 'wrong_status', detail: `task is ${task.status}` }
  }

  const fulfilNow = opts.now ?? new Date()
  if ((opts.claimToken !== undefined && opts.claimToken !== task.claimToken) ||
      ((task.status === 'claimed' || task.claimToken !== null) && (!task.claimToken || opts.claimToken !== task.claimToken || !task.leaseExpiresAt || task.leaseExpiresAt <= fulfilNow))) {
    return { ok: false, problem: 'wrong_status', detail: 'task claim was lost or expired; reclaim before fulfilling' }
  }

  const ownership = { id: taskId, status: task.status, claimToken: task.claimToken,
    claimedAt: task.claimedAt, ...(task.status === 'claimed' ? { leaseExpiresAt: { gt: fulfilNow } } : {}) }
  const recordInvalid = () => db.llmTask.updateMany({ where: ownership, data: { attempts: { increment: 1 } } })
  const entry = findTaskSchema(task.kind, task.promptVersion)
  if (!entry) {
    return {
      ok: false,
      problem: 'no_schema',
      detail: `no registered schema for ${task.kind}/${task.promptVersion}; refusing to accept unvalidated output`,
    }
  }

  const parsed = entry.schema.safeParse(output)
  if (!parsed.success) {
    await recordInvalid()
    return { ok: false, problem: 'schema_mismatch', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }

  const allowed = new Set(task.allowedEvidenceIds)
  const cited = collectCitedEvidenceIds(parsed.data)
  const uncited = [...cited].filter((id) => !allowed.has(id))
  if (uncited.length > 0) {
    await recordInvalid()
    return {
      ok: false,
      problem: 'uncited_evidence',
      detail: `cited evidence outside allowedEvidenceIds: ${uncited.join(', ')}`,
    }
  }

  const allowedClaims = new Set(task.allowedApprovedClaimIds)
  const citedClaims = collectCitedApprovedClaimIds(parsed.data)
  const uncitedClaims = [...citedClaims].filter((id) => !allowedClaims.has(id))
  if (uncitedClaims.length > 0) {
    await recordInvalid()
    return {
      ok: false,
      problem: 'uncited_claim',
      detail: `cited approved claims outside allowedApprovedClaimIds: ${uncitedClaims.join(', ')}`,
    }
  }

  const input = task.input as Record<string, unknown>
  let sourceProblem: string | null = null
  if (task.kind === 'contact_research') {
    sourceProblem = validateContactResearch(parsed.data as ContactResearchResponse,
      input.verification as ContactVerification | undefined, task.allowedEvidenceIds)
  }
  if (task.kind === 'draft_support') {
    sourceProblem = Array.isArray(input.sentences)
      ? validateDraftSupport(parsed.data as DraftSupportResponse, input.sentences as SupportSentence[])
      : 'Support task is missing the exact generated sentences'
  }
  if (sourceProblem) {
    await recordInvalid()
    return { ok: false, problem: 'source_mismatch', detail: sourceProblem }
  }

  // The output is about to become quotable by F3 and F4. A credential that reached
  // it — pasted from a page, echoed from a header — must not be stored, and
  // redacting it silently would hide that it happened.
  try { assertCredentialFreeTaskData(parsed.data) } catch {
    await recordInvalid()
    return { ok: false, problem: 'redaction', detail: 'output matched a secret pattern; not stored' }
  }

  const now = opts.now ?? new Date()
  const stored = await db.llmTask.updateMany({
    where: { ...ownership, ...(task.status === 'claimed' ? { leaseExpiresAt: { gt: now } } : {}) },
    data: {
      status: 'fulfilled',
      claimToken: null,
      leaseExpiresAt: null,
      output: parsed.data as Prisma.InputJsonValue,
      // Recorded so a brief's origin is auditable: a session, or a model id if the
      // API implementation is ever switched on.
      fulfilledBy: opts.fulfilledBy ?? 'claude-code-session',
      // Zero by construction on this path — that is the point of the handoff.
      costUsd: 0,
      fulfilledAt: now,
      attempts: { increment: 1 },
    },
  })

  if (stored.count !== 1) return { ok: false, problem: 'wrong_status', detail: 'task changed while validating output' }

  await writeAudit(db, {
    actorType: 'user',
    actorId: opts.fulfilledBy ?? 'claude-code-session',
    action: 'llm.task_fulfilled',
    subjectType: task.subjectType,
    subjectId: task.subjectId,
    costUsd: 0,
    metadata: {
      taskId,
      kind: task.kind,
      promptVersion: task.promptVersion,
      cited: [...cited],
      citedClaims: [...citedClaims],
    },
  })

  return { ok: true, taskId }
}

export type ClaimOptions = {
  kind?: string
  now?: Date
  leaseMs?: number
  taskIds?: string[]
  /** Compatibility option; every new claim is now leased regardless of this value. */
  leased?: boolean
}
export type ClaimedTask = {
  id: string
  kind: string
  promptVersion: string
  input: unknown
  responseSchema: unknown
  allowedEvidenceIds: string[]
  allowedApprovedClaimIds: string[]
  subjectType: string
  subjectId: string
  claimToken: string
  leaseExpiresAt: Date
}

/** Atomic compare-and-claim with stale lease recovery; no two workers own one task. */
export async function claimNextTask(
  db: Db,
  opts: ClaimOptions = {},
): Promise<ClaimedTask | null> {
  const now = opts.now ?? new Date()
  const leaseMs = opts.leaseMs ?? 15 * 60_000
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 86_400_000) throw new Error('leaseMs must be between 1000 and 86400000')
  const scope = { ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.taskIds ? { id: { in: opts.taskIds } } : {}) }
  await db.llmTask.updateMany({
    where: { ...scope, status: 'claimed', OR: [
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, claimedAt: { lt: new Date(now.getTime() - leaseMs) } },
      { leaseExpiresAt: null, claimedAt: null },
    ] },
    data: { status: 'pending', claimedAt: null, claimToken: null, leaseExpiresAt: null },
  })
  for (let retry = 0; retry < 30; retry += 1) {
    const task = await db.llmTask.findFirst({ where: { ...scope, status: 'pending' }, orderBy: { createdAt: 'asc' } })
    if (!task) return null
    // Every claimant, including the manual CLI, receives a durable fencing token.
    const claimToken = randomUUID()
    const claimed = await db.llmTask.updateMany({
      where: { id: task.id, status: 'pending' },
      data: { status: 'claimed', claimedAt: now, claimToken, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
    })
    if (claimed.count !== 1) continue
    return { id: task.id, kind: task.kind, promptVersion: task.promptVersion,
      input: task.input, responseSchema: task.responseSchema, allowedEvidenceIds: task.allowedEvidenceIds,
      allowedApprovedClaimIds: task.allowedApprovedClaimIds, subjectType: task.subjectType,
      subjectId: task.subjectId, claimToken, leaseExpiresAt: new Date(now.getTime() + leaseMs) }
  }
  return null
}

/** Rejects a task with one of the closed reason codes. */
export async function rejectTask(
  db: Db,
  taskId: string,
  reason: ReasonCodeValue,
  detail?: string,
  opts: { claimToken?: string; now?: Date } = {},
): Promise<{ ok: boolean }> {
  const task = await db.llmTask.findUnique({ where: { id: taskId }, select: { id: true, subjectType: true, subjectId: true, status: true, claimToken: true, leaseExpiresAt: true } })
  const now = opts.now ?? new Date()
  if (!task || !['pending', 'claimed', 'rejected'].includes(task.status) ||
      (opts.claimToken !== undefined && opts.claimToken !== task.claimToken) ||
      ((task.status === 'claimed' || task.claimToken !== null) && (!task.claimToken || task.claimToken !== opts.claimToken || !task.leaseExpiresAt || task.leaseExpiresAt <= now))) return { ok: false }
  const stored = await db.llmTask.updateMany({
    where: { id: taskId, status: task.status, claimToken: task.claimToken,
      ...(task.status === 'claimed' ? { leaseExpiresAt: { gt: now } } : {}) },
    data: { status: 'rejected', statusReason: reason, claimToken: null, leaseExpiresAt: null, attempts: { increment: 1 } },
  })
  if (stored.count !== 1) return { ok: false }
  await writeAudit(db, {
    actorType: 'user',
    actorId: 'claude-code-session',
    action: 'llm.task_rejected',
    subjectType: task.subjectType,
    subjectId: task.subjectId,
    reasonCode: reason,
    metadata: { taskId, ...(detail === undefined ? {} : { detail }) },
  })
  return { ok: true }
}
