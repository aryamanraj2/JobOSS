import type { Db } from '../../core/audit/audit-log.js'

/** Content and approval read before validation; compare again under row locks. */
export async function reservationSnapshot(db: Db, draftId: string) {
  const draft = await db.draft.findUnique({ where: { id: draftId }, include: {
    contact: true, resumeVersion: true, lead: true,
  } })
  const profile = await db.candidateProfile.findFirst()
  return { draft, profile }
}

/** Same draft row is locked by revokeApproval. Related mutable hash/route rows stay
 * locked until the approved->sending transition and attempt commit together. */
export async function lockReservationSnapshot(db: Db, snapshot: Awaited<ReturnType<typeof reservationSnapshot>>): Promise<void> {
  const draft = snapshot.draft
  if (!draft) return
  await db.$queryRaw`SELECT id FROM draft WHERE id = ${draft.id} FOR UPDATE`
  if (draft.contactId) await db.$queryRaw`SELECT id FROM contact WHERE id = ${draft.contactId} FOR UPDATE`
  if (draft.resumeVersionId) await db.$queryRaw`SELECT id FROM resume_version WHERE id = ${draft.resumeVersionId} FOR UPDATE`
  await db.$queryRaw`SELECT id FROM lead WHERE id = ${draft.leadId} FOR UPDATE`
  if (snapshot.profile) await db.$queryRaw`SELECT id FROM candidate_profile WHERE id = ${snapshot.profile.id} FOR UPDATE`
}

/** The gate can have read an intermediate row version even when the before/after
 * snapshots agree again. Bind the actual transport plan to the locked snapshot. */
export function planMatchesSnapshot(
  plan: import('./gate.js').SendPlan,
  snapshot: Awaited<ReturnType<typeof reservationSnapshot>>,
): boolean {
  const draft = snapshot.draft
  return !!draft?.contact && plan.draftId === draft.id && plan.leadId === draft.leadId &&
    plan.contactId === draft.contactId && plan.companyId === draft.lead.companyId &&
    plan.campaignCycle === draft.lead.campaignCycle && plan.touchSlot === draft.touchSlot &&
    plan.to === draft.contact.emailNormalized && plan.subject === (draft.subject ?? '') &&
    plan.bodyText === (draft.bodyText ?? '') &&
    plan.fromIdentity === (draft.senderIdentity ?? snapshot.profile?.senderIdentity) &&
    plan.replyTo === snapshot.profile?.replyToEmail
}
