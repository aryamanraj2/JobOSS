import { parseHTML } from 'linkedom'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { SourceError } from '../source-error.js'
import { array, object, str, discoveryJson, waitForSource, type CandidateHandler, type DiscoveryCandidate } from './common.js'

export const HN_API = 'https://hacker-news.firebaseio.com/v0'
export type HnCursor = { submissionIndex: number; threadIds: number[]; threadIndex: number; commentIndex: number; scanned: number }
export const initialHnCursor = (): HnCursor => ({ submissionIndex: 0, threadIds: [], threadIndex: 0, commentIndex: 0, scanned: 0 })

const NON_COMPANY_DOMAINS = new Set(['linkedin.com', 'github.com', 'google.com', 'gmail.com', 'notion.so', 'notion.site',
  'ycombinator.com', 'ashbyhq.com', 'greenhouse.io', 'lever.co', 'youtube.com', 'youtu.be', 'calendly.com'])

/** A top-level hiring invitation with one identifiable company route. Ambiguous employer identity stays unimported. */
export function hiringCandidate(item: Record<string, unknown>, threadId: number): DiscoveryCandidate | null {
  if (item.deleted || item.dead || item.type !== 'comment' || item.parent !== threadId || !str(item.text)) return null
  const { document } = parseHTML(`<body>${item.text as string}</body>`)
  const text = String(document.body.textContent ?? '')
  if (!/\b(hiring|apply|open roles|open positions|looking for.+engineer)\b/i.test(text)) return null
  if (/\b(seeking work|looking for work|recruitment agency|staffing agency)\b/i.test(text)) return null
  const emails = [...new Set(text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])]
  const routes: string[] = []
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? ''
    const domain = canonicalizeDomain(href)
    if (domain.ok && !NON_COMPANY_DOMAINS.has(domain.domain)) routes.push(`https://${domain.domain}`)
  }
  for (const email of emails) {
    const domain = canonicalizeDomain(email.split('@')[1] ?? '')
    if (domain.ok && !NON_COMPANY_DOMAINS.has(domain.domain)) routes.push(`https://${domain.domain}`)
  }
  const unique = [...new Set(routes)]
  if (unique.length !== 1) return null
  const companyName = text.split(/[|\n]/)[0]?.trim().slice(0, 120)
  if (!companyName || companyName.length > 100 || !item.id) return null
  const publishedAt = typeof item.time === 'number' ? new Date(item.time * 1000) : null
  return { source: 'hn', externalId: String(item.id), companyName, website: unique[0]!,
    sourceUrl: `https://news.ycombinator.com/item?id=${String(item.id)}`, text, publishedAt,
    raw: { ...item, threadId, contactEmails: emails, employerIdentity: 'public_post_unverified' }, contactEmails: emails }
}

export class HnHiringProvider {
  constructor(private readonly gate: GatedFetcher, private readonly delayMs = 5_000) {}

  async discover(cursor: HnCursor, limit: number, handle: CandidateHandler,
    checkpoint: (cursor: HnCursor) => Promise<void>, now = new Date()): Promise<{ count: number; complete: boolean; coverage: Record<string, unknown> }> {
    const userUrl = `${HN_API}/user/whoishiring.json`
    const user = object(await discoveryJson(this.gate, userUrl))
    if (user.id !== 'whoishiring' || !Array.isArray(user.submitted)) throw SourceError.unusable(userUrl, 'whoishiring identity/submissions unavailable')
    const submissions = array(user.submitted).filter((v): v is number => typeof v === 'number')
    const earliest = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1) / 1000
    let scans = 0
    while (cursor.threadIds.length < 3 && cursor.submissionIndex < submissions.length && scans < 30) {
      await waitForSource(this.delayMs)
      const item = object(await discoveryJson(this.gate, `${HN_API}/item/${submissions[cursor.submissionIndex]!}.json`))
      cursor.submissionIndex += 1
      scans += 1
      if (item.by === 'whoishiring' && item.type === 'story' && /^Ask HN: Who is hiring\?/i.test(str(item.title) ?? '') &&
          typeof item.id === 'number' && typeof item.time === 'number' && item.time >= earliest && item.time <= now.getTime() / 1000) {
        if (!cursor.threadIds.includes(item.id)) cursor.threadIds.push(item.id)
      }
      await checkpoint({ ...cursor, threadIds: [...cursor.threadIds] })
      if (typeof item.time === 'number' && item.time < earliest) break
    }
    let count = 0
    let scannedThisRun = 0
    while (cursor.threadIndex < cursor.threadIds.length && count < limit && scannedThisRun < limit * 5) {
      const threadId = cursor.threadIds[cursor.threadIndex]!
      await waitForSource(this.delayMs)
      const thread = object(await discoveryJson(this.gate, `${HN_API}/item/${threadId}.json`))
      if (thread.by !== 'whoishiring' || !Array.isArray(thread.kids)) throw SourceError.unusable(`${HN_API}/item/${threadId}.json`, 'monthly thread changed or unavailable')
      const kids = array(thread.kids).filter((v): v is number => typeof v === 'number')
      while (cursor.commentIndex < kids.length && count < limit && scannedThisRun < limit * 5) {
        await waitForSource(this.delayMs)
        const item = object(await discoveryJson(this.gate, `${HN_API}/item/${kids[cursor.commentIndex]!}.json`))
        const candidate = hiringCandidate(item, threadId)
        if (candidate) { await handle(candidate); count += 1 }
        cursor.commentIndex += 1
        cursor.scanned += 1
        scannedThisRun += 1
        await checkpoint({ ...cursor, threadIds: [...cursor.threadIds] })
      }
      if (cursor.commentIndex < kids.length) break
      cursor.threadIndex += 1
      cursor.commentIndex = 0
      await checkpoint({ ...cursor, threadIds: [...cursor.threadIds] })
    }
    return { count, complete: cursor.threadIds.length === 3 && cursor.threadIndex >= cursor.threadIds.length,
      coverage: { requestedMonthlyThreads: 3, foundMonthlyThreads: cursor.threadIds.length,
        threadIds: cursor.threadIds, scannedPosts: cursor.scanned, identityPolicy: 'single_domain_top_level_employer_invitation', exhaustive: false } }
  }
}
