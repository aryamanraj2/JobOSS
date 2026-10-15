import type { Db } from '../../core/audit/audit-log.js'

/** D mutations serialize before any company/draft/task write or row lock. Reentrant
 * in one transaction. Transaction-scoped callers must enter D before taking their
 * own conflicting locks. This is a D-only ordering contract, not E's reservation. */
export async function lockDMutation(db: Db): Promise<void> {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(741609, 4)::text`
}

function lockUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as Record<string, unknown>
  return row['code'] === '55P03' || row['sqlState'] === '55P03' || ['meta', 'cause', 'driverAdapterError', 'originalError'].some((key) => lockUnavailable(row[key]))
}

/** A decision never waits while holding a partial lock set: D busy, row busy or
 * supporting writer busy all yield an explicit refusal. Savepoint rollback also
 * leaves a caller-owned transaction usable. Supporting SHARE locks still freeze
 * all mutable inputs through comparison and B approval/revoke. */
export async function tryReviewLocks(db: Db, draftId: string): Promise<boolean> {
  const available = await db.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(741609, 4) AS locked`
  if (!available[0]?.locked) return false
  await db.$executeRaw`SAVEPOINT joboss_d_review_locks`
  try {
    await db.$queryRaw`SELECT id FROM draft WHERE id = ${draftId} FOR UPDATE NOWAIT`
    await db.$executeRaw`LOCK TABLE company, evidence, approved_claim, contact, contact_research, resume_version, role_track, candidate_profile, lead, opportunity, outreach_assessment, funding_record, suppression, send_attempt, llm_task, audit_log IN SHARE MODE NOWAIT`
    await db.$executeRaw`RELEASE SAVEPOINT joboss_d_review_locks`
    return true
  } catch (error) {
    await db.$executeRaw`ROLLBACK TO SAVEPOINT joboss_d_review_locks`
    await db.$executeRaw`RELEASE SAVEPOINT joboss_d_review_locks`
    if (lockUnavailable(error)) return false
    throw error
  }
}
