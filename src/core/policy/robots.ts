import robotsParser from 'robots-parser'
import type { Db } from '../audit/audit-log.js'
import { rawGet, type RawResponse } from './http/raw-client.js'
import { normalizeHost } from './host-lists.js'
import { isSameSite } from './registrable-domain.js'

export type RobotsVerdict = {
  allowed: boolean
  crawlDelaySeconds: number | null
  /** False when the file was missing, errored, or could not be parsed. */
  parseOk: boolean
  source: 'cache' | 'network'
  statusCode?: number | null
  pause?: boolean
  retryAfterMs?: number
}

/** The shared host scheduler could not space a robots hop. Transient: never cached or read as rules. */
export class RobotsPacingShortfall extends Error {
  constructor(readonly retryAfterMs: number) { super('robots same-host spacing not met') }
}

export type RobotsOptions = {
  userAgent: string
  ttlSeconds: number
  /** Explicitly allowlisted hosts tolerate a missing robots.txt; unknown hosts do not. */
  hostExplicitlyAllowed: boolean
  now?: () => Date
  /** Production gate supplies its shared host scheduler and transport accounting. */
  request?: (url: string) => Promise<RawResponse>
}

/**
 * D4 preflight step 2.
 *
 * robots.txt is fetched, cached with a TTL, and evaluated for OUR declared
 * user-agent against the EXACT path — not the origin, and not a prefix.
 *
 * The asymmetry that matters: a missing or unparseable robots file is treated as
 * restrictive, not permissive, for hosts that are not explicitly allowlisted. The
 * common default (absent robots means crawl freely) is wrong for this system,
 * because the hosts we reach without an explicit allow entry are exactly the ones
 * we know least about.
 *
 * That asymmetry only produces honest answers if we actually READ the file. A
 * `robots.txt` served with a 30x — overwhelmingly apex-to-`www` — was previously
 * recorded as unparseable and therefore refused, so `robots_disallowed` came to
 * mean "the host redirected" for 19 of the first 45 hosts F1 tried. Wrong twice
 * over: it silently dropped permitted sources, and it corrupted the very
 * refusal counter Part G relies on to notice a source disappearing behind a
 * policy change. Redirects are now followed, bounded, and only within the same
 * registrable domain — a `robots.txt` that points at somebody else's site does
 * not speak for this one, and is treated as restrictive.
 */
export async function checkRobots(
  db: Db,
  url: string,
  opts: RobotsOptions,
): Promise<RobotsVerdict> {
  const parsed = new URL(url)
  const host = robotsCacheKey(parsed)
  const now = (opts.now ?? (() => new Date()))()

  const cached = await db.robotsCache.findUnique({ where: { host } })
  const fresh =
    cached && now.getTime() - cached.fetchedAt.getTime() < cached.ttlSeconds * 1000

  if (cached && fresh) {
    return evaluate(cached.body, cached.parseOk, url, opts, 'cache', cached.statusCode, Math.max(0, cached.ttlSeconds * 1000 - (now.getTime() - cached.fetchedAt.getTime())))
  }

  const fetched = await fetchRobotsFollowingRedirects(
    `${parsed.protocol}//${parsed.host}/robots.txt`,
    opts, db,
  )
  if (fetched.pacingShortfallMs !== undefined) {
    return { allowed: false, crawlDelaySeconds: null, parseOk: false, source: 'network', statusCode: null, pause: true, retryAfterMs: fetched.pacingShortfallMs }
  }
  const { body, parseOk, statusCode } = fetched
  const fetchedAt = opts.now?.() ?? new Date()
  const ttlSeconds = fetched.retryAfterMs === undefined ? Math.min(opts.ttlSeconds, fetched.remainingTtlSeconds ?? opts.ttlSeconds) : Math.max(1, Math.ceil(fetched.retryAfterMs / 1000))

  await db.robotsCache.upsert({
    where: { host },
    create: { host, body, parseOk, ttlSeconds, fetchedAt, statusCode },
    update: { body, parseOk, ttlSeconds, fetchedAt, statusCode },
  })

  return evaluate(body, parseOk, url, opts, 'network', statusCode, fetched.retryAfterMs)
}

const ROBOTS_MAX_BYTES = 512 * 1024
const ROBOTS_MAX_REDIRECTS = 3
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308])

/**
 * Fetches `robots.txt`, following same-site redirects.
 *
 * Redirects are followed here rather than by an undici interceptor for the same
 * reason as everywhere else in this system: an automatically-followed redirect
 * lands somewhere nobody checked. Each hop is re-derived and re-checked against
 * the original host's registrable domain before it is issued, and a cross-site
 * hop ends the walk with `parseOk = false` — restrictive.
 *
 * Only 404/410 mean no published rules. Refusal and throttling never grant access.
 */
async function fetchRobotsFollowingRedirects(
  startUrl: string,
  opts: RobotsOptions, db: Db,
): Promise<{ body: string; parseOk: boolean; statusCode: number | null; retryAfterMs?: number; remainingTtlSeconds?: number; pacingShortfallMs?: number }> {
  const originHost = new URL(startUrl).host
  let url = startUrl
  let statusCode: number | null = null

  for (let hop = 0; hop <= ROBOTS_MAX_REDIRECTS; hop += 1) {
    let res
    try {
      // Cache the exact standard robots destination independently from the apex
      // alias. Arbitrary redirect paths must never replace an origin's own rules.
      const target = new URL(url), host = robotsCacheKey(target)
      const standard = target.pathname === '/robots.txt' && !target.search && !target.hash
      if (hop > 0 && standard) {
        const cached = await db.robotsCache.findUnique({ where: { host } })
        const age = (opts.now?.() ?? new Date()).getTime() - (cached?.fetchedAt.getTime() ?? 0)
        if (cached && age < cached.ttlSeconds * 1000) return { body: cached.body, parseOk: cached.parseOk, statusCode: cached.statusCode, remainingTtlSeconds: Math.max(0, Math.floor(cached.ttlSeconds - age / 1000)),
          ...((cached.statusCode === 429 || (cached.statusCode ?? 0) >= 500) ? { retryAfterMs: Math.max(0, cached.ttlSeconds * 1000 - age) } : {}) }
      }
      res = opts.request ? await opts.request(url) : await rawGet(url, { userAgent: opts.userAgent, maxBytes: ROBOTS_MAX_BYTES })
      if (!REDIRECT_CODES.has(res.statusCode) && standard) {
        const absent = res.statusCode === 404 || res.statusCode === 410
        const parseOk = absent || (res.statusCode >= 200 && res.statusCode < 300 && !res.truncated)
        const retryAfterMs = pauseDelay(res, opts.now?.() ?? new Date())
        const data = { body: absent ? '' : res.body, parseOk, statusCode: res.statusCode,
          fetchedAt: opts.now?.() ?? new Date(), ttlSeconds: retryAfterMs === undefined ? opts.ttlSeconds : Math.max(1, Math.ceil(retryAfterMs / 1000)) }
        await db.robotsCache.upsert({ where: { host }, create: { host, ...data }, update: data })
      }
    } catch (error) {
      if (error instanceof RobotsPacingShortfall) return { body: '', parseOk: false, statusCode, pacingShortfallMs: Math.max(1, error.retryAfterMs) }
      return { body: '', parseOk: false, statusCode }
    }
    statusCode = res.statusCode

    if (res.statusCode >= 200 && res.statusCode < 300) {
      // A truncated robots file is worse than none: the rule that would have
      // disallowed us may be in the part we did not read.
      if (res.truncated) return { body: '', parseOk: false, statusCode }
      return { body: res.body, parseOk: true, statusCode }
    }
    if (res.statusCode === 404 || res.statusCode === 410) {
      return { body: '', parseOk: true, statusCode }
    }
    if (!REDIRECT_CODES.has(res.statusCode)) {
      return { body: res.body, parseOk: false, statusCode, ...(pauseDelay(res, opts.now?.() ?? new Date()) === undefined ? {} : { retryAfterMs: pauseDelay(res, opts.now?.() ?? new Date())! }) }
    }

    const raw = res.headers['location']
    const location = Array.isArray(raw) ? raw[0] : raw
    if (!location) return { body: '', parseOk: false, statusCode }

    let next: URL
    try {
      next = new URL(location, url)
    } catch {
      return { body: '', parseOk: false, statusCode }
    }
    if (next.protocol !== 'https:' && next.protocol !== 'http:') {
      return { body: '', parseOk: false, statusCode }
    }
    if (!isSameSite(next.host, originHost)) {
      return { body: '', parseOk: false, statusCode }
    }
    url = next.toString()
  }

  return { body: '', parseOk: false, statusCode }
}

function evaluate(
  body: string,
  parseOk: boolean,
  url: string,
  opts: RobotsOptions,
  source: 'cache' | 'network',
  statusCode: number | null, retryAfterMs?: number,
): RobotsVerdict {
  if (statusCode === 401 || statusCode === 403) return { allowed: false, crawlDelaySeconds: null, parseOk: false, source, statusCode }
  if (statusCode === 429 || (statusCode ?? 0) >= 500) return { allowed: false, crawlDelaySeconds: null, parseOk: false, source, statusCode, pause: true, retryAfterMs: retryAfterMs ?? 60_000 }
  if (!parseOk) {
    return { allowed: false, crawlDelaySeconds: null, parseOk: false, source }
  }
  if (body.trim() === '') {
    // No rules published. Permissive only where we already made a deliberate
    // allow decision about the host.
    return {
      allowed: opts.hostExplicitlyAllowed,
      crawlDelaySeconds: null,
      parseOk: true,
      source,
    }
  }

  const robots = robotsParser(url, body)
  const verdict = robots.isAllowed(url, opts.userAgent)
  const delay = robots.getCrawlDelay(opts.userAgent)
  return {
    // robots-parser returns undefined when it cannot decide. Undecided is a
    // refusal here, for the same reason unparseable is.
    allowed: verdict === undefined ? opts.hostExplicitlyAllowed : verdict,
    crawlDelaySeconds: typeof delay === 'number' ? delay : null,
    parseOk: true,
    source,
  }
}

// RFC 9110 HTTP-date forms: IMF-fixdate, obsolete RFC 850 and asctime. Anything else is malformed.
const HTTP_DATE = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/

/** Retry-After delta-seconds or a genuine HTTP-date; malformed values and unavailable rules pause a minute. */
function pauseDelay(response: RawResponse, now: Date): number | undefined {
  if (response.statusCode !== 429 && response.statusCode < 500) return undefined
  const header = response.headers['retry-after'], raw = (Array.isArray(header) ? header[0] : header)?.trim()
  if (raw && /^\d+$/.test(raw)) return Math.max(1000, Number(raw) * 1000)
  const date = raw && HTTP_DATE.test(raw) ? Date.parse(raw) : NaN
  return Number.isFinite(date) ? Math.max(1000, date - now.getTime()) : 60_000
}

/** HTTPS retains historical keys; other origins cannot borrow its policy. */
function robotsCacheKey(url: URL): string {
  return url.protocol === 'https:' && !url.port ? normalizeHost(url.host) : `${url.protocol}//${url.host.toLowerCase()}`
}
