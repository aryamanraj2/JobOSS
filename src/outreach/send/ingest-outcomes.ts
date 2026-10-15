import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { emailHmac, normalizeEmail, domainOf } from '../../core/crypto/secret-store.js'
import { isStandaloneDatabaseClient } from '../../core/joboss/database-scope.js'
import { readDsnEvidence } from '../mail/dsn-evidence.js'
import { normalizedHeaders, senderAddress } from '../mail/headers.js'
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

export type MatchedAttempt = { id: string; draftId: string; contactId: string; companyId: string }
export type DetailedMatch =
  | { kind: 'matched'; attempt: MatchedAttempt }
  | { kind: 'unmatched'; detail: string }
  | { kind: 'unresolved'; detail: string; candidateAttemptIds: string[]; reasonCode: null; suppressed: false }
export type UnresolvedInbound = Extract<DetailedMatch, { kind: 'unresolved' }>
export type IngestResult = IngestedOutcome | Extract<DetailedMatch, { kind: 'unmatched' | 'unresolved' }>

/** Compatibility lookup: unresolved returns null; ingestion MUST use the detailed result. */
export async function matchSendAttempt(db: Db, message: InboundForIngest): Promise<MatchedAttempt | null> {
  const result = await matchSendAttemptDetailed(db, message)
  return result.kind === 'matched' ? result.attempt : null
}

/** Exact IDs precede weak thread history. Never choose a contact by first-row order. */
export async function matchSendAttemptDetailed(db: Db, message: InboundForIngest): Promise<DetailedMatch> {
  const headers = normalizedHeaders(message.headers)
  const ids = new Set([
    ...(message.inReplyTo?.match(/<[^<>\s]+>/g) ?? []),
    ...(headers['in-reply-to']?.match(/<[^<>\s]+>/g) ?? []),
    ...(headers['references']?.match(/<[^<>\s]+>/g) ?? []),
    ...(message.bodyText.match(/<[^<>\s]+@[^<>\s]+>/g) ?? []),
  ])
  const select = { id: true, draftId: true, contactId: true, companyId: true, campaignCycle: true,
    attemptedAt: true, draft: { select: { leadId: true } }, contact: { select: { emailNormalized: true } } }
  const exact = ids.size ? await db.sendAttempt.findMany({ where: {
    OR: [{ providerRfc822MessageId: { in: [...ids] } }, { rfc822MessageId: { in: [...ids] } }],
  }, select }) : []
  const thread = message.threadId ? await db.sendAttempt.findMany({ where: { providerThreadId: message.threadId }, select }) : []
  const sender = senderAddress(message.from)
  const daemon = sender !== null && /^(mailer-daemon|postmaster|mail\.delivery\.subsystem)@/i.test(sender)
  const evidence = readDsnEvidence(message.bodyText)
  const dsn = daemon || evidence.recipients.length > 0 || /^reporting-mta:/im.test(message.bodyText) || classifyBounce(message).kind === 'bounce'
  // Only readable addresses can be queried, but all explicit values (including
  // unknown and unreadable recipients) remain in evidence for the consistency gate.
  const recipients = new Set(evidence.recipients.filter((recipient): recipient is string => recipient !== null))
  const recipientCandidates = dsn && recipients.size ? await db.sendAttempt.findMany({
    where: { contact: { emailNormalized: { in: [...recipients] } } }, select,
  }) : []
  const candidates = exact.length ? exact : recipientCandidates.length ? recipientCandidates : thread
  const unresolved = (detail: string): DetailedMatch => ({ kind: 'unresolved', detail, reasonCode: null, suppressed: false,
    candidateAttemptIds: [...new Set([...exact, ...recipientCandidates, ...thread].map((a) => a.id))].sort().slice(0, 50) })
  const conversations = (rows: typeof candidates) => new Set(rows.map((a) => `${a.contactId}:${a.draft.leadId}:${a.campaignCycle}`))
  if (conversations(exact).size > 1) return unresolved('conflicting exact message IDs identify different contacts/conversations')
  if (exact.length && recipientCandidates.some((a) => !exact.some((e) => e.contactId === a.contactId))) {
    return unresolved('DSN recipients conflict with exact original message contact')
  }
  if (!candidates.length) return { kind: 'unmatched', detail: 'no known original message ID or thread' }
  if (!sender) return unresolved('sender mailbox is unreadable, unsupported or multiple')
  if (headers['from'] !== undefined && senderAddress(headers['from']) !== sender) return unresolved('From header contradicts parsed sender')
  let consistent = candidates
  if (dsn) {
    if (evidence.issue) return unresolved(evidence.issue)
    // Daemon address is not the recipient. Require original ID or DSN recipient
    // evidence; a reused thread alone is insufficient even for a daemon message.
    if (!exact.length && !recipients.size) return unresolved('DSN has only weak thread identity; original message/recipient evidence required')
    if (recipients.size) {
      consistent = candidates.filter((a) => recipients.has(normalizeEmail(a.contact.emailNormalized)))
      if (consistent.length !== candidates.length && exact.length) return unresolved('DSN recipient contradicts original message identity')
      if (!consistent.length) return unresolved('DSN recipient does not identify a known conversation')
    }
  } else {
    consistent = candidates.filter((a) => normalizeEmail(a.contact.emailNormalized) === sender)
    if (!consistent.length) return unresolved('human sender contradicts known message/thread contact')
    if (exact.length && consistent.length !== candidates.length) return unresolved('human sender contradicts exact message identity')
  }
  if (conversations(consistent).size !== 1) return unresolved('multiple candidate conversations remain unresolved')
  // Same-contact conversation history is legitimate; attribute to its latest known
  // attempt, with a stable tie break. Distinct cycles/leads never collapse here.
  consistent.sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime() || a.id.localeCompare(b.id))
  const hit = consistent[0]!
  return { kind: 'matched', attempt: { id: hit.id, draftId: hit.draftId, contactId: hit.contactId, companyId: hit.companyId } }
}

export async function ingestInboundMessage(
  db: Db,
  message: InboundForIngest,
  opts: { suppressionSalt: string; now?: Date },
): Promise<IngestResult> {
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

async function recordUnresolved(db: Db, message: InboundForIngest, result: UnresolvedInbound): Promise<UnresolvedInbound> {
  // Called under provider-message lock. Retain bounded identity/reason for review,
  // but no irreversible outcome fact; retries re-evaluate current evidence.
  const prior = await db.auditLog.findFirst({ where: { action: 'inbox.unresolved', subjectId: message.providerMessageId }, select: { id: true } })
  if (!prior) await writeAudit(db, { actorType: 'system', actorId: 'inbox', action: 'inbox.unresolved',
    subjectType: 'InboundMessage', subjectId: message.providerMessageId,
    metadata: { detail: result.detail, candidateAttemptIds: result.candidateAttemptIds,
      threadId: message.threadId.slice(0, 200), from: message.from.slice(0, 200) } })
  return result
}

async function inTransaction<T>(db: Db, work: (tx: Db) => Promise<T>): Promise<T> {
  return isStandaloneDatabaseClient(db) ? db.$transaction(work, { timeout: 30_000 }) : work(db)
}

async function ingestOnce(
  db: Db, message: InboundForIngest, opts: { suppressionSalt: string; now?: Date },
): Promise<IngestResult> {
  const now = opts.now ?? new Date()
  const match = await matchSendAttemptDetailed(db, message)
  if (match.kind === 'unresolved') return recordUnresolved(db, message, match)
  if (match.kind === 'unmatched') {
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

  const attempt = match.attempt
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

  if (classification === 'unclassified') return recordUnresolved(db, message, {
    kind: 'unresolved', reasonCode: null, suppressed: false, candidateAttemptIds: [attempt.id], detail: 'malformed Auto-Submitted keyword; review inbound classification',
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
