import { z } from 'zod'
import type { Db } from '../../core/audit/audit-log.js'
import { writeAudit } from '../../core/audit/audit-log.js'
import { ingestInboundMessage } from '../send/ingest-outcomes.js'
import type { InboxProvider } from './contracts.js'

const Checkpoint = z.object({
  query: z.string().min(1), pageCursor: z.string().nullable(), seenCursors: z.array(z.string()),
  complete: z.boolean(), scanned: z.number().int().nonnegative(), matched: z.number().int().nonnegative(),
})
export type InboxSyncResult = { complete: boolean; resumed: boolean; scanned: number; matched: number; detail: string }
export type InboxSyncOptions = {
  suppressionSalt: string
  /** Distinct checkpoint per mailbox and coverage scope. */
  checkpointKey: string
  /** Default is all received mail, including spam/trash. A bounded query is diagnostic only. */
  query?: string
  maxPages?: number
  maxMessages?: number
  pageSize?: number
}

/** Replay of a partly consumed page is safe because outcomes commit by provider identity. */
export async function syncInbox(db: Db, mail: InboxProvider, opts: InboxSyncOptions): Promise<InboxSyncResult> {
  const previous = await db.auditLog.findFirst({
    where: { action: 'inbox.checkpoint', subjectId: opts.checkpointKey },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { metadata: true },
  })
  const parsed = previous ? Checkpoint.safeParse(previous.metadata) : null
  if (parsed && !parsed.success) return { complete: false, resumed: false, scanned: 0, matched: 0, detail: 'invalid inbox checkpoint; operator review required' }
  // Always rescan on a completed run. A time watermark alone can miss late delivery or
  // imported messages with old internalDate. No successful narrow scan licenses sending.
  const state = parsed?.success && !parsed.data.complete ? parsed.data : {
    query: opts.query ?? '-in:sent', pageCursor: null, seenCursors: [], complete: false, scanned: 0, matched: 0,
  }
  const resumed = parsed?.success === true && !parsed.data.complete
  if (state.query !== (opts.query ?? '-in:sent')) return { complete: false, resumed, scanned: state.scanned, matched: state.matched, detail: 'checkpoint coverage query differs; operator review required' }
  let scannedThisRun = 0
  let detail = 'complete outcome ingestion'
  try {
    for (let pageNumber = 0; ; pageNumber += 1) {
      if (pageNumber >= (opts.maxPages ?? 200)) throw new Error('inbox page coverage cap reached')
      const page = await mail.listInboxPage(state.query, state.pageCursor ?? undefined, opts.pageSize ?? 50)
      if (!Array.isArray(page.messages) || (page.nextPageToken !== null && (typeof page.nextPageToken !== 'string' || !page.nextPageToken))) {
        throw new Error('malformed inbox page')
      }
      let scannedPage = 0
      let matchedPage = 0
      for (const item of page.messages) {
        if (!item.id || !item.threadId) throw new Error('malformed inbox identity')
        if (scannedThisRun >= (opts.maxMessages ?? 10_000)) throw new Error('inbox message coverage cap reached')
        const message = await mail.getMessage(item.id)
        if (message.id !== item.id || !Number.isFinite(message.receivedAt.getTime())) throw new Error('malformed inbox message')
        if (!message.fromIsSelf) {
          const result = await ingestInboundMessage(db, {
            providerMessageId: message.id, threadId: message.threadId, from: message.from,
            subject: message.subject, bodyText: message.bodyText, inReplyTo: message.inReplyTo,
            receivedAt: message.receivedAt, headers: message.headers,
          }, { suppressionSalt: opts.suppressionSalt })
          if (result.kind !== 'unmatched') matchedPage += 1
        }
        scannedPage += 1
        scannedThisRun += 1
      }
      if (page.nextPageToken && (state.seenCursors.includes(page.nextPageToken) || page.nextPageToken === state.pageCursor)) {
        throw new Error('inbox pagination loop')
      }
      state.scanned += scannedPage
      state.matched += matchedPage
      if (state.pageCursor) state.seenCursors.push(state.pageCursor)
      state.pageCursor = page.nextPageToken
      state.complete = page.nextPageToken === null
      await checkpoint()
      if (state.complete) break
    }
  } catch (err) {
    state.complete = false
    detail = err instanceof Error ? err.message : 'inbox provider failure'
    await checkpoint()
  }
  return { complete: state.complete, resumed, scanned: state.scanned, matched: state.matched, detail }

  async function checkpoint(): Promise<void> {
    await writeAudit(db, {
      actorType: 'system', actorId: 'inbox', action: 'inbox.checkpoint',
      subjectType: 'Mailbox', subjectId: opts.checkpointKey, metadata: { ...state, detail },
    })
  }
}
