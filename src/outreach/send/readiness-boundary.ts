import type { Db } from '../../core/audit/audit-log.js'
import { tryReviewLocks } from '../review/locks.js'
import { lockReservationSnapshot, reservationSnapshot } from './reservation.js'

function lockUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const row = error as Record<string, unknown>
  return row['code'] === '55P03' || row['sqlState'] === '55P03' ||
    ['meta', 'cause', 'driverAdapterError', 'originalError'].some(key => lockUnavailable(row[key]))
}

/** Enclosing @5 reservation boundary, not a readiness evaluator. The caller owns
 * a fresh READ COMMITTED transaction and has taken no conflicting locks/writes.
 *
 * D try advisory -> draft NOWAIT -> D's complete support/predicate SHARE locks ->
 * B outcome/stop SHARE locks -> write-intent upgrades NOWAIT -> B TRY reservation
 * advisory -> route rows NOWAIT.
 * All survive success until the reservation commits. Any miss rolls the whole
 * acquisition back, including D's advisory, before returning retry-later.
 *
 * B must be TRY here: a legacy sender can hold B then need a support write/row.
 * Waiting for it while holding D/SHARE would form a cycle. D/S enter D first;
 * other writers either win first (NOWAIT refusal) or wait until our commit.
 * Broad table locks intentionally freeze inserts/deletes/newer matching rows,
 * not just today's cited IDs. This also blocks unrelated writers/maintenance.
 */
export async function tryReadinessReservation(db: Db, draftId: string): Promise<boolean> {
  await db.$executeRaw`SAVEPOINT joboss_e_readiness_reservation`
  const release = async (rollback: boolean) => {
    if (rollback) await db.$executeRaw`ROLLBACK TO SAVEPOINT joboss_e_readiness_reservation`
    await db.$executeRaw`RELEASE SAVEPOINT joboss_e_readiness_reservation`
  }
  try {
    if (!await tryReviewLocks(db, draftId)) { await release(true); return false }
    // D covers suppression/attempt predicates. B additionally reads current kill
    // switches and outcome counters, including their empty predicate sets.
    await db.$executeRaw`LOCK TABLE kill_switch, bounce, reply, opt_out IN SHARE MODE NOWAIT`
    // Reserve our own later write modes now. Merely taking SHARE could leave an
    // upgrade waiting behind a compatible SHARE reader after validation. D/S are
    // serialized by D, but arbitrary support readers need this explicit guard.
    await db.$executeRaw`LOCK TABLE send_attempt, audit_log IN SHARE ROW EXCLUSIVE MODE NOWAIT`
    await db.$executeRaw`LOCK TABLE draft IN ROW EXCLUSIVE MODE NOWAIT`
    const available = await db.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended('outreach-send-reservation', 0)) AS locked`
    if (!available[0]?.locked) { await release(true); return false }
    await lockReservationSnapshot(db, await reservationSnapshot(db, draftId), true)
    await release(false)
    return true
  } catch (error) {
    await release(true)
    if (lockUnavailable(error)) return false
    throw error
  }
}
