/** Explicitly synthetic E fixtures, using accepted D manual-semantic preparation and approval. */
import { configuredTestTarget, verifyTestTarget } from '../../helpers/test-target.js'
import { dWorld, prepareWritten, fulfillSupport, NOW } from '../joboss-d/world.js'
import { seedCandidateProfile } from '../../../src/apply/claims/seed-profile.js'
import { gateDraft } from '../../../src/outreach/draft/compose.js'
import { reviewSnapshot } from '../../../src/outreach/review/snapshot.js'
import { reviewAction } from '../../../src/outreach/review/actions.js'
import { evaluateOutreachReadiness } from '../../../src/outreach/review/readiness.js'
import { sendGateOptions } from '../../helpers/send-world.js'

export async function approvedEWorld(listed = false) {
  const target = configuredTestTarget()
  if (target.database !== 'outreach_test_joboss_b') throw new Error('Synthetic E requires guarded B')
  await verifyTestTarget(target)
  const w = await dWorld({ named: true, listed })
  await w.db.approvedClaim.update({ where: { key: 'identity.email' }, data: { text: 'candidate@example.invalid' } })
  await seedCandidateProfile(w.db, { sendingAccount: 'candidate@example.invalid' })
  const { draftId } = await prepareWritten(w, true)
  const support = await fulfillSupport(w, draftId)
  const gate = await gateDraft(w.db, draftId, NOW)
  if (!gate.ok) throw new Error(gate.detail)
  const approved = await reviewAction(w.db, { draftId, snapshot: await reviewSnapshot(w.db, draftId),
    by: 'synthetic E individual reviewer', action: 'approve', now: NOW })
  if (!approved.ok) throw new Error(approved.detail)
  const ready = await evaluateOutreachReadiness(w.db, draftId, NOW)
  if (!ready.ready) throw new Error(ready.detail)
  const opts = sendGateOptions({ now: NOW, ownedInboxes: [w.contact.emailNormalized],
    sendingAccount: 'candidate@example.invalid', evaluateOutreachReadiness })
  return { ...w, draftId, support, opts }
}
export type EWorld = Awaited<ReturnType<typeof approvedEWorld>>
export { NOW }
