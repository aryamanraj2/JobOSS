import { parseHTML } from 'linkedom'
import { detectAtsInUrl } from '../ats/signatures.js'
import { SEED_ALLOW_HOSTS } from '../../core/policy/host-lists.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { SourceError } from '../source-error.js'
import { object, str, discoveryJson, waitForSource, type CandidateHandler, type DiscoveryCandidate } from './common.js'

export const HN_API = 'https://hacker-news.firebaseio.com/v0'
export type HnCursor = { version: 2; submissionIndex: number; submissions: number[]; selectionDone: boolean;
  threadIds: number[]; threadIndex: number; commentIndex: number; scanned: number;
  commentIds: Record<string, number[]>; scopeNow?: string; selectionCapped: boolean; months: Record<string, string>; identityUnresolved?: Record<string, unknown>[] }
export const initialHnCursor = (): HnCursor => ({ version: 2, submissionIndex: 0, submissions: [], selectionDone: false,
  threadIds: [], threadIndex: 0, commentIndex: 0, scanned: 0, commentIds: {}, selectionCapped: false, months: {} })

const NON_COMPANY_DOMAINS = new Set(['linkedin.com', 'github.com', 'google.com', 'gmail.com', 'notion.so', 'notion.site',
  'youtube.com', 'youtu.be', 'calendly.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  'proton.me', 'protonmail.com', 'aol.com', 'fastmail.com', 'googlemail.com',
  'simplelogin.com', 'simplelogin.co', 'simplelogin.fr', 'anonaddy.me', 'addy.io', 'mozmail.com', 'duck.com', '33mail.com'])

// Existing exact ATS signatures + vendor host-policy entries cover supported and
// recognized unsupported ATS. Supplemental routes come from R-R1's saved posts.
const APPLICATION_DOMAINS = new Set(['greenhouse.io', 'grnh.se', 'lever.co', 'ashbyhq.com',
  'workable.com', 'myworkdayjobs.com', 'param.ai', 'gem.com', 'dover.com', 'wellfound.com',
  'ycombinator.com', 'workatastartup.com', 'nordictechjobs.com', 'perfectwiki.page',
  'bit.ly', 't.co', 'linktr.ee', 'notion.site', 'notion.so', 'webflow.io', 'wixsite.com', 'wordpress.com',
  'github.io', 'vercel.app', 'netlify.app', ...SEED_ALLOW_HOSTS.filter((h) => /ATS|hosted boards/i.test(h.note ?? '')).map((h) => h.host)])
function applicationRoute(route: string, domain: string): boolean {
  return !!detectAtsInUrl(route) || [...APPLICATION_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`))
}

/** A top-level hiring invitation with one identifiable company route. Ambiguous employer identity stays unimported. */
function parseHiringPost(item: Record<string, unknown>, threadId: number): DiscoveryCandidate | null {
  if (!str(item.by) || item.deleted || item.dead || item.type !== 'comment' || item.parent !== threadId || !str(item.text)) return null
  const { document } = parseHTML(`<html><body>${item.text as string}</body></html>`)
  const text = String(document.body.textContent ?? '')
  if (!/\b(hiring|apply|open roles|open positions|looking for.+engineer)\b/i.test(text)) return null
  if (/\b(seeking work|looking for work|recruitment agency|staffing agency|recruiter|recruiting for our client|on behalf of)\b/i.test(text)) return null
  const emails = [...new Set(text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])]
  const routes: string[] = [], identities: { website: string; source: string }[] = []
  const consider = (route: string, email = false) => {
    routes.push(route)
    const domain = canonicalizeDomain(email ? route.split('@')[1] ?? '' : route)
    if (domain.ok && !([...NON_COMPANY_DOMAINS].some((d) => domain.domain === d || domain.domain.endsWith(`.${d}`))) && !applicationRoute(email ? `https://${domain.domain}` : route, domain.domain)) {
      identities.push({ website: `https://${domain.domain}`, source: route })
    }
  }
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? ''
    if (/^mailto:/i.test(href)) consider(href.slice(7).split('?')[0]!, true)
    else consider(href)
  }
  for (const email of emails) consider(email, true)
  const unique = [...new Set(identities.map((i) => i.website))]
  const companyName = text.split(/[|\n]/)[0]?.trim().slice(0, 120)
  if (!companyName || companyName.length > 100 || !item.id) return null
  const publishedAt = typeof item.time === 'number' ? new Date(item.time * 1000) : null
  return { source: 'hn', externalId: String(item.id), companyName, website: unique.length === 1 ? unique[0]! : '',
    sourceUrl: `https://news.ycombinator.com/item?id=${String(item.id)}`, text, publishedAt,
    raw: { ...item, threadId, contactEmails: emails, routes: [...new Set(routes)],
      identitySourceFields: { nameHeader: companyName, route: identities.find((i) => i.website === unique[0])?.source ?? null },
      employerIdentity: unique.length === 1 ? 'public_post_unverified' : 'employer_identity_unresolved' }, contactEmails: emails }
}

/** Public parser only emits a single non-application employer route. */
export function hiringCandidate(item: Record<string, unknown>, threadId: number): DiscoveryCandidate | null {
  const candidate = parseHiringPost(item, threadId)
  return candidate?.website ? candidate : null
}

export class HnHiringProvider {
  constructor(private readonly gate: GatedFetcher, private readonly delayMs = 5_000) {}
  async discover(cursor: HnCursor, limit: number, handle: CandidateHandler,
    checkpoint: (cursor: HnCursor) => Promise<void>, now = new Date()): Promise<{ count: number; complete: boolean; coverage: Record<string, unknown> }> {
    if (cursor.version !== 2 || !Array.isArray(cursor.threadIds) || !Array.isArray(cursor.submissions) ||
      !cursor.commentIds || ![cursor.submissionIndex, cursor.threadIndex, cursor.commentIndex, cursor.scanned].every((n) => Number.isInteger(n) && n >= 0)) {
      throw new Error('Invalid HN cursor; start a new source run')
    }
    const save = () => checkpoint(structuredClone(cursor))
    let requests = 0
    const get = async (url: string) => {
      if (requests >= 250) throw new Error('HN request cap250 reached; resume this scope')
      if (requests++) await waitForSource(this.delayMs)
      return object(await discoveryJson(this.gate, url))
    }
    if (!cursor.scopeNow) {
      const url = `${HN_API}/user/whoishiring.json`, user = await get(url)
      if (user.id !== 'whoishiring' || !Array.isArray(user.submitted) ||
        user.submitted.some((id) => !Number.isSafeInteger(id) || Number(id) < 1)) throw SourceError.unusable(url, 'author/submissions malformed')
      cursor.submissions = [...new Set(user.submitted as number[])].slice(0, 90)
      cursor.selectionCapped = user.submitted.length > 90
      cursor.scopeNow = now.toISOString()
      await save()
    }
    const scopeTime = new Date(cursor.scopeNow).getTime() / 1000
    const validThread = (item: Record<string, unknown>, id: number) => item.id === id && item.by === 'whoishiring' &&
      item.type === 'story' && !item.deleted && !item.dead && /^Ask HN: Who is hiring\?/i.test(str(item.title) ?? '') &&
      typeof item.time === 'number' && item.time <= scopeTime && item.time > 0
    while (!cursor.selectionDone && cursor.submissionIndex < cursor.submissions.length && cursor.threadIds.length < 3) {
      const id = cursor.submissions[cursor.submissionIndex]!, url = `${HN_API}/item/${id}.json`, item = await get(url)
      if (item.id !== id || !item.type || typeof item.time !== 'number') throw SourceError.unusable(url, 'selection item identity unavailable')
      if (validThread(item, id)) {
        const month = new Date((item.time as number) * 1000).toISOString().slice(0, 7)
        // Submissions are newest first; retain a single verified thread per month.
        const months = cursor.months
        if (!Object.values(months).includes(month)) {
          if (!Array.isArray(item.kids) || item.kids.some((kid) => !Number.isSafeInteger(kid) || Number(kid) < 1)) throw SourceError.unusable(url, 'thread kids malformed/omitted')
          cursor.threadIds.push(id); cursor.commentIds[String(id)] = [...new Set(item.kids as number[])]
          cursor.months = { ...months, [id]: month }
        }
      }
      cursor.submissionIndex++; await save()
    }
    cursor.selectionDone = cursor.threadIds.length === 3 || cursor.submissionIndex >= cursor.submissions.length
    await save()
    let count = 0, scannedThisRun = 0
    while (cursor.threadIndex < cursor.threadIds.length && count < limit && scannedThisRun < 200) {
      const threadId = cursor.threadIds[cursor.threadIndex]!, url = `${HN_API}/item/${threadId}.json`, thread = await get(url)
      if (!validThread(thread, threadId)) throw SourceError.unusable(url, 'monthly thread identity changed')
      const kids = cursor.commentIds[String(threadId)]
      if (!Array.isArray(kids) || cursor.commentIndex > kids.length) throw new Error('Invalid saved HN comment scope')
      while (cursor.commentIndex < kids.length && count < limit && scannedThisRun < 200) {
        const id = kids[cursor.commentIndex]!, commentUrl = `${HN_API}/item/${id}.json`, item = await get(commentUrl)
        if (item.id !== id) throw SourceError.unusable(commentUrl, 'comment identity unavailable')
        const candidate = parseHiringPost(item, threadId)
        if (candidate && !candidate.website) {
          cursor.identityUnresolved ??= []
          if (!cursor.identityUnresolved.some((r) => r.externalId === candidate.externalId)) cursor.identityUnresolved.push({
            externalId: candidate.externalId, companyName: candidate.companyName, sourceUrl: candidate.sourceUrl,
            reason: 'employer_identity_unresolved', routes: candidate.raw.routes,
          })
        } else if (candidate && await handle(candidate) !== false) count++
        cursor.commentIndex++; cursor.scanned++; scannedThisRun++; await save()
      }
      if (cursor.commentIndex < kids.length) break
      cursor.threadIndex++; cursor.commentIndex = 0; await save()
    }
    return { count, complete: cursor.threadIds.length === 3 && cursor.threadIndex === cursor.threadIds.length,
      coverage: { requestedMonthlyThreads: 3, foundMonthlyThreads: cursor.threadIds.length, threadIds: cursor.threadIds,
        scopeNow: cursor.scopeNow, selectionSubmissionCap: 90, selectionCapped: cursor.selectionCapped,
        missingThreads: Math.max(0, 3 - cursor.threadIds.length), commentScope: 'frozen_ids_at_thread_selection',
        scannedPosts: cursor.scanned, scannedThisRun, scanCap: 200, requests, requestCap: 250,
        identityUnresolved: cursor.identityUnresolved ?? [],
        identityPolicy: 'verified_author_thread_single_domain_public_invitation_employer_unverified', exhaustive: false } }
  }
}
