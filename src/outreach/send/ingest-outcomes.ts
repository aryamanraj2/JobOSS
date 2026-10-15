import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { emailHmac, normalizeEmail, domainOf } from '../../core/crypto/secret-store.js'
import type { ReasonCodeValue } from '../../core/reason-codes/registry.js'
import { classifyBounce, classifyReply, type ReplyClassification } from './classify-outcome.js'

/**
 * Outcome ingestion — what comes back, and what it stops.
 *
 * `handover.md` §4: *"Replies, hard bounces, opt-outs, and manually marked 'wrong
 * person' outcomes create suppressions synchronously."* §8: *"Stop immediately for
 * reply, bounce, rejection, opt-out, wrong contact, application submitted, or user
 * pause."*
 *
 * ## Two different things, deliberately not conflated
 *
 * **Stopping** and **suppressing** are separate actions here, and A12 is the reason.
 *
 * *Stopping* ends this conversation: the draft moves to a terminal status, the lead
 * records why, and any scheduled follow-up is cancelled. Every outcome below stops.
 *
 * *Suppressing* writes an HMAC-backed `Suppression` row that A10 deliberately makes
 * outlive the `Contact` being deleted — which is to say, it is permanent and
 * effectively irreversible. Only a hard bounce, an opt-out and a wrong-contact report
 * do that.
 *
 * A soft bounce stops without suppressing. That is A12's rule, and the separation is
 * what makes it possible to honour it without also retrying a failing address: the
 * lead is stopped either way, so nothing is re-sent, and the difference is only
 * whether a permanent record is written on evidence that may be transient.
 *
 * A reply stops without suppressing either, and for a different reason: a person who
 * replied has not asked us to stop, they have started a conversation. Suppressing them
 * would prevent the operator's own answer. `replied` cancels the automated follow-up
 * and hands the thread to the human, which is what `handover.md` §5's Inbox/Outcome
 * worker is for.
 */

export type IngestedOutcome = {
  sendAttemptId: string
  kind: 'bounce' | 'reply' | 'opt_out' | 'wrong_contact' | 'auto_reply' | 'unclassified'
  reasonCode: ReasonCodeValue | null
  suppressed: boolean
  detail: string
}

export type InboundForIngest = {
  providerMessageId: string
  threadId: string
  from: string
  subject: string
  bodyText: string
  /** The `In-Reply-To` header, which is how a bounce names the message it is about. */
  inReplyTo: string | null
  receivedAt: Date
  headers?: Record<string, string>
}

/**
 * Finds the `SendAttempt` a received message is about.
 *
 * Matches In-Reply-To/References against both actual and client-supplied RFC IDs.
 * Thread matching is the fallback; a DSN may instead quote the original ID in its
 * body. Gmail's stored ID differs from the stable local reconciliation handle.
 */
export async function matchSendAttempt(
  db: Db,
  message: InboundForIngest,
): Promise<{ id: string; draftId: string; contactId: string; companyId: string } | null> {
  const select = { id: true, draftId: true, contactId: true, companyId: true }

  const ids = new Set([
    ...(message.inReplyTo?.match(/<[^<>\s]+>/g) ?? []),
    ...(message.headers?.['references']?.match(/<[^<>\s]+>/g)?.reverse() ?? []),
  ])
  for (const id of ids) {
    const hit = await db.sendAttempt.findFirst({
      where: { OR: [{ providerRfc822MessageId: id }, { rfc822MessageId: id }] }, select,
    })
    if (hit) return hit
  }
  if (message.threadId) {
    const byThread = await db.sendAttempt.findFirst({ where: { providerThreadId: message.threadId }, select })
    if (byThread) return byThread
  }

  for (const id of message.bodyText.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []) {
    const hit = await db.sendAttempt.findFirst({
      where: { OR: [{ providerRfc822MessageId: id }, { rfc822MessageId: id }] }, select,
    })
    if (hit) return hit
  }
  return null
}

export async function ingestInboundMessage(
  db: Db,
  message: InboundForIngest,
  opts: { suppressionSalt: string; now?: Date },
): Promise<IngestedOutcome | { kind: 'unmatched'; detail: string }> {
  if (!message.providerMessageId.trim()) throw new Error('inbound provider identity is required')
  return inTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inbox:${message.providerMessageId}`}, 0))::text`
    const existingBounce = await tx.bounce.findUnique({ where: { providerMessageId: message.providerMessageId } })
    if (existingBounce) return {
      sendAttemptId: existingBounce.sendAttemptId, kind: 'bounce' as const,
      reasonCode: existingBounce.hardness === 'hard' ? 'hard_bounce' as const : 'soft_bounce' as const,
      suppressed: existingBounce.hardness === 'hard', detail: 'duplicate provider message; unchanged',
    }
    const existingReply = await tx.reply.findUnique({ where: { providerMessageId: message.providerMessageId } })
    if (existingReply) {
      if (!['reply', 'auto_reply', 'opt_out', 'wrong_contact'].includes(existingReply.classification ?? '')) {
        return { sendAttemptId: existingReply.sendAttemptId, kind: 'unclassified', reasonCode: null, suppressed: false, detail: 'existing provider message has no observable reply classification' }
      }
      const kind = existingReply.classification as ReplyClassification
      return { sendAttemptId: existingReply.sendAttemptId, kind,
        reasonCode: kind === 'auto_reply' ? null : kind === 'opt_out' ? 'opt_out' as const : kind === 'wrong_contact' ? 'wrong_contact' as const : 'replied' as const,
        suppressed: kind === 'opt_out' || kind === 'wrong_contact', detail: 'duplicate provider message; unchanged' }
    }
    return ingestOnce(tx, message, opts)
  })
}

async function inTransaction<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  return '$transaction' in db && typeof db.$transaction === 'function' ? db.$transaction(work, { timeout: 30_000 }) : work(db)
}

async function ingestOnce(
  db: Db, message: InboundForIngest, opts: { suppressionSalt: string; now?: Date },
): Promise<IngestedOutcome | { kind: 'unmatched'; detail: string }> {
  const now = opts.now ?? new Date()
  const attempt = await matchSendAttempt(db, message)
  if (!attempt) {
    // Recorded rather than dropped. A bounce we cannot attribute is still a fact about
    // deliverability, and silently discarding it is how "nothing is bouncing" becomes
    // a belief rather than a measurement (B3).
    const recorded = await db.auditLog.findFirst({ where: { action: 'inbox.unmatched', subjectId: message.providerMessageId }, select: { id: true } })
    if (!recorded) await writeAudit(db, {
      actorType: 'system',
      actorId: 'inbox',
      action: 'inbox.unmatched',
      subjectType: 'InboundMessage',
      subjectId: message.providerMessageId,
      metadata: { from: message.from, subject: message.subject.slice(0, 200) },
    })
    return { kind: 'unmatched', detail: 'no SendAttempt matched this message' }
  }

  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outcome:${attempt.id}`}, 0))::text`
  const contact = await db.contact.findUniqueOrThrow({
    where: { id: attempt.contactId },
    select: { emailNormalized: true },
  })

  const bounce = classifyBounce(message)
  if (bounce.kind === 'bounce') {
    await db.bounce.create({
      data: {
        sendAttemptId: attempt.id,
        providerMessageId: message.providerMessageId,
        hardness: bounce.hardness,
        providerCode: bounce.providerCode,
        diagnostic: bounce.diagnostic?.slice(0, 1000) ?? null,
        occurredAt: message.receivedAt,
      },
    })
    const reasonCode: ReasonCodeValue = bounce.hardness === 'hard' ? 'hard_bounce' : 'soft_bounce'

    await stopConversation(db, attempt, reasonCode, bounce.hardness === 'hard' ? 'bounced_hard' : 'bounced_soft')

    let suppressed = false
    if (bounce.hardness === 'hard') {
      await suppressContact(db, contact.emailNormalized, reasonCode, opts.suppressionSalt, now)
      suppressed = true
    }

    await writeAudit(db, {
      actorType: 'system',
      actorId: 'inbox',
      action: 'outcome.bounce',
      subjectType: 'SendAttempt',
      subjectId: attempt.id,
      reasonCode,
      metadata: {
        hardness: bounce.hardness,
        providerCode: bounce.providerCode,
        // A12: recorded so an operator can see that the hardness was a default rather
        // than a reading, and can correct it before a lead is written off.
        inferred: bounce.inferred,
        suppressed,
      },
    })
    return {
      sendAttemptId: attempt.id,
      kind: 'bounce',
      reasonCode,
      suppressed,
      detail: `${bounce.hardness} bounce${bounce.inferred ? ' (hardness inferred: no readable code)' : ''}`,
    }
  }

  const classification: ReplyClassification = classifyReply({
    subject: message.subject,
    bodyText: message.bodyText,
    ...(message.headers ? { headers: message.headers } : {}),
  })

  await db.reply.create({
    data: {
      sendAttemptId: attempt.id,
      providerMessageId: message.providerMessageId,
      classification,
      snippet: message.bodyText.slice(0, 500),
      receivedAt: message.receivedAt,
    },
  })

  if (classification === 'auto_reply') {
    // Not an outcome. An out-of-office says nothing about whether the recipient wants
    // to hear from us, and treating it as a reply would cancel a follow-up on the
    // strength of a vacation.
    await writeAudit(db, {
      actorType: 'system',
      actorId: 'inbox',
      action: 'outcome.auto_reply',
      subjectType: 'SendAttempt',
      subjectId: attempt.id,
      metadata: { subject: message.subject.slice(0, 200) },
    })
    return { sendAttemptId: attempt.id, kind: 'auto_reply', reasonCode: null, suppressed: false, detail: 'auto-reply; no state change' }
  }

  const reasonCode: ReasonCodeValue =
    classification === 'opt_out' ? 'opt_out' : classification === 'wrong_contact' ? 'wrong_contact' : 'replied'

  await stopConversation(
    db,
    attempt,
    reasonCode,
    classification === 'opt_out' ? 'opted_out' : classification === 'wrong_contact' ? 'closed' : 'replied',
  )

  let suppressed = false
  if (classification === 'opt_out') {
    await db.optOut.create({
      data: {
        sendAttemptId: attempt.id,
        providerMessageId: message.providerMessageId,
        emailHmac: emailHmac(contact.emailNormalized, opts.suppressionSalt),
        occurredAt: message.receivedAt,
      },
    })
    await suppressContact(db, contact.emailNormalized, 'opt_out', opts.suppressionSalt, now)
    suppressed = true
  }
  if (classification === 'wrong_contact') {
    // §8: a wrong-contact report suppresses the ADDRESS, not the company. The company
    // may well have a correct route and the whole point of the report is that this was
    // not it.
    await suppressContact(db, contact.emailNormalized, 'wrong_contact', opts.suppressionSalt, now)
    suppressed = true
  }

  await writeAudit(db, {
    actorType: 'system',
    actorId: 'inbox',
    action: 'outcome.reply',
    subjectType: 'SendAttempt',
    subjectId: attempt.id,
    reasonCode,
    metadata: { classification, suppressed },
  })

  return { sendAttemptId: attempt.id, kind: classification, reasonCode, suppressed, detail: classification }
}

/**
 * Ends the conversation: the draft reaches a terminal status and the lead records why.
 *
 * Cancelling a *scheduled* follow-up job is the queue's business
 * (`cancelScheduledSends`) and F6 is the milestone that schedules one. What matters
 * now is that the lead carries the stop reason, because the send gate reads it: a lead
 * whose `statusReason` is `replied`, `opt_out`, `wrong_contact` or `hard_bounce` is
 * refused before anything else is evaluated.
 */
async function stopConversation(
  db: Db,
  attempt: { id: string; draftId: string },
  reasonCode: ReasonCodeValue,
  draftStatus: 'bounced_hard' | 'bounced_soft' | 'replied' | 'opted_out' | 'closed',
): Promise<void> {
  const current = await db.draft.findUniqueOrThrow({ where: { id: attempt.draftId }, select: { statusReason: true } })
  const priority: Partial<Record<ReasonCodeValue, number>> = { soft_bounce: 1, replied: 2, wrong_contact: 3, hard_bounce: 4, opt_out: 5 }
  if ((priority[current.statusReason ?? 'replied'] ?? 0) > (priority[reasonCode] ?? 0) && current.statusReason) return
  const draft = await db.draft.update({
    where: { id: attempt.draftId },
    data: { status: draftStatus, statusReason: reasonCode },
    select: { leadId: true },
  })
  await db.lead.update({
    where: { id: draft.leadId },
    data: { statusReason: reasonCode },
  })
  await db.sendAttempt.update({
    where: { id: attempt.id },
    data: { statusReason: reasonCode },
  })
}

/**
 * A10: the suppression stores a salted HMAC of the normalized address and never the
 * address itself, so deleting the `Contact` cannot destroy the evidence that stops us
 * writing again next cycle.
 *
 * `SUPPRESSION_HMAC_SALT` is write-once in practice for the same reason: rotating it
 * orphans every existing row, which is how someone who asked never to be contacted
 * becomes contactable again.
 */
async function suppressContact(
  db: Db,
  email: string,
  reasonCode: ReasonCodeValue,
  salt: string,
  now: Date,
): Promise<void> {
  const normalized = normalizeEmail(email)
  const hmac = emailHmac(normalized, salt)
  await db.suppression.upsert({
    where: { emailHmac_scope: { emailHmac: hmac, scope: 'contact' } },
    create: { emailHmac: hmac, scope: 'contact', reasonCode, createdAt: now },
    // Never downgraded. A contact suppressed for opting out who later hard-bounces is
    // still someone who opted out, and the first reason is the one that matters.
    update: {},
  })
  await db.contact.updateMany({
    where: { emailNormalized: normalized },
    data: { status: 'suppressed' },
  })
}

/**
 * The operator marking a recipient as the wrong person by hand — `handover.md` §4's
 * *"manually marked 'wrong person' outcomes"*, which has no inbound message behind it.
 */
export async function markWrongContact(
  db: Db,
  contactId: string,
  opts: { suppressionSalt: string; actorId?: string; now?: Date },
): Promise<void> {
  return inTransaction(db, (tx) => markWrongContactOnce(tx, contactId, opts))
}

async function markWrongContactOnce(
  db: Db, contactId: string, opts: { suppressionSalt: string; actorId?: string; now?: Date },
): Promise<void> {
  const now = opts.now ?? new Date()
  const contact = await db.contact.findUniqueOrThrow({
    where: { id: contactId },
    select: { emailNormalized: true },
  })
  await suppressContact(db, contact.emailNormalized, 'wrong_contact', opts.suppressionSalt, now)
  await db.draft.updateMany({
    where: { contactId, status: { in: ['approved', 'scheduled', 'sending', 'sent'] } },
    data: { status: 'closed', statusReason: 'wrong_contact' },
  })
  await writeAudit(db, {
    actorType: 'user',
    actorId: opts.actorId ?? 'operator',
    action: 'outcome.wrong_contact_manual',
    subjectType: 'Contact',
    subjectId: contactId,
    reasonCode: 'wrong_contact',
    metadata: { domain: domainOf(contact.emailNormalized) },
  })
}

/**
 * The operator pausing a lead — the seventh stop in `handover.md` §8's list, and the
 * one D6's nine conditions do not contain.
 */
export async function pauseLead(
  db: Db,
  leadId: string,
  opts: { actorId?: string; note?: string } = {},
): Promise<void> {
  await db.lead.update({ where: { id: leadId }, data: { statusReason: 'user_paused' } })
  await writeAudit(db, {
    actorType: 'user',
    actorId: opts.actorId ?? 'operator',
    action: 'lead.paused',
    subjectType: 'Lead',
    subjectId: leadId,
    reasonCode: 'user_paused',
    metadata: { note: opts.note },
  })
}
