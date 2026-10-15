import type { Db } from '../../core/audit/audit-log.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { approveDraft, revokeApproval } from '../draft/approve.js'
import { evaluateOutreachReadiness } from './readiness.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { tryReviewLocks } from './locks.js'
import { supportSnapshot, reviewSnapshot } from './snapshot.js'

export type ReviewActionResult = { ok: boolean; detail: string }
/** One exact email. Locks snapshots through the existing approval/revoke API transaction. */
export async function reviewAction(db: Db, input: { draftId: string; snapshot: string; by: string; action: 'approve' | 'revoke'; now?: Date }): Promise<ReviewActionResult> {
  const act = async (tx: Db): Promise<ReviewActionResult> => {
    // A pre-existing MVCC snapshot cannot be refreshed by locks. Decisions use
    // current READ COMMITTED reads only after stabilizing the complete input set.
    const isolation = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
    if (isolation[0]?.transaction_isolation !== 'read committed') return { ok: false, detail: 'Review decisions require a fresh READ COMMITTED transaction. Reload and decide in a new action.' }
    if (!await tryReviewLocks(tx, input.draftId)) return { ok: false, detail: 'Review inputs are busy. Reload and review again after current preparation or changes finish.' }
    const draft = await tx.draft.findUnique({ where: { id: input.draftId }, select: { id: true } })
    if (!draft) return { ok: false, detail: 'Draft no longer exists.' }
    if (!input.by.trim() || input.by.length > 200) return { ok: false, detail: 'Reviewer name is required.' }
    if (await reviewSnapshot(tx, input.draftId) !== input.snapshot) return { ok: false, detail: 'The review snapshot changed. Reload and review the current email before deciding.' }
    if (input.action === 'revoke') {
      const result = await revokeApproval(tx, input.draftId, input.by)
      return { ok: result.ok, detail: result.ok ? 'Approval withdrawn; this email must be reviewed again.' : result.detail }
    }
    const ready = await evaluateOutreachReadiness(tx, input.draftId, input.now ?? new Date())
    if (!ready.ready) return { ok: false, detail: ready.detail }
    const supportHash = (await supportSnapshot(tx, input.draftId)).hash
    const result = await approveDraft(tx, input.draftId, input.by, { now: input.now ?? new Date() })
    if (result.ok) await writeAudit(tx, { actorType: 'user', actorId: input.by, action: 'draft.outreach_snapshot_approved', subjectType: 'Draft', subjectId: input.draftId,
      metadata: { supportHash, reviewSnapshot: input.snapshot, approvalHash: result.approvalHash } })
    return { ok: result.ok, detail: result.ok ? 'This exact email was approved. Sending remains disabled.' : result.detail }
  }
  return isStandaloneDatabaseClient(db) ? db.$transaction(act, { isolationLevel: 'ReadCommitted', timeout: 30_000 }) : act(db)
}
