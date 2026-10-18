import { afterAll, beforeEach, expect, it } from 'vitest'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { mockAgent } from '../setup.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { fetchPage } from '../../src/ingest/fetch-page.js'
import { HostRateLimiter } from '../../src/core/policy/rate-limit.js'
import { currentPeriodMonth } from '../../src/core/policy/budget.js'
const db = testDb()
beforeEach(truncateAll)
afterAll(closeTestDb)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
async function seed(host = 'pace.example') {
  await db.hostPolicy.create({ data: { host, mode: 'allow', origin: 'derived_company', includeSubdomains: true } })
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(new Date()), creditsCap: 40, billedUsdCap: 0 } })
}
function reply(host: string, path: string, statusCode: number, data: string, headers: Record<string, string>, delay: number, calls: string[]) {
  const scope = mockAgent.get(`https://${host}`).intercept({ path }).reply(() => { calls.push(`${host}${path}`); return { statusCode, data, responseOptions: { headers } } })
  if (delay) scope.delay(delay)
}

// DC1-R1: run-04 metaview asymmetry (apex robots 272 ms, apex content 50 ms), sequential real clock.
it.each([[272, 50], [0, 0], [50, 272]])('DC1-R1 apex->www funding hop succeeds: apex robots %i ms, apex content %i ms', async (robotsMs, contentMs) => {
  // A distinct apex per case keeps an unconsumed interceptor from leaking into the next case.
  const apex = `r${robotsMs}c${contentMs}.example`
  await seed(apex)
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 400 })
  const calls: string[] = []
  reply(apex, '/robots.txt', 308, '', { location: `https://www.${apex}/robots.txt` }, robotsMs, calls)
  reply(`www.${apex}`, '/robots.txt', 200, 'User-agent: *\nAllow: /\n', {}, 0, calls)
  reply(apex, '/news', 308, '', { location: `https://www.${apex}/news` }, contentMs, calls)
  reply(`www.${apex}`, '/news', 200, 'page', {}, 0, calls)
  const page = await fetchPage(g, `https://${apex}/news`, { sameHostDelayMs: 5_000 })
  expect(page).toMatchObject({ ok: true, url: `https://www.${apex}/news` })
  expect(calls).toEqual([`${apex}/robots.txt`, `www.${apex}/robots.txt`, `${apex}/news`, `www.${apex}/news`])
  expect(await db.auditLog.count({ where: { action: 'fetch.refused' } })).toBe(0)
}, 10_000)

it('DC1-R1 content-after-content inside the gap still refuses rate_limited without waiting', async () => {
  await seed()
  const waits: number[] = []
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 400,
    waitForDelay: async (ms) => { waits.push(ms); await sleep(ms) } })
  const calls: string[] = []
  reply('pace.example', '/robots.txt', 200, 'User-agent: *\nAllow: /\n', {}, 0, calls)
  reply('pace.example', '/a', 200, 'a', {}, 0, calls)
  reply('pace.example', '/b', 200, 'b', {}, 0, calls)
  expect((await g.fetchText('https://pace.example/a')).ok).toBe(true)
  const waitsAfterFirst = waits.length
  expect(await g.fetchText('https://pace.example/b')).toEqual({ ok: false, reason: 'rate_limited' })
  expect(waits.length).toBe(waitsAfterFirst)
  expect(calls).toEqual(['pace.example/robots.txt', 'pace.example/a'])
})

// DC1-R3: a robots hop that loses its spacing is a transient local pacing pause, never a cached robots refusal.
it('DC1-R3 robots hop losing spacing returns uncached rate_limited, then succeeds after spacing', async () => {
  await seed()
  const limiter = new HostRateLimiter(200)
  let interfere = false
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 200,
    // Models a concurrent same-host request recorded while this wait is pending.
    waitForDelay: async (ms) => { if (interfere) { await sleep(Math.max(0, ms - 20)); limiter.record('pace.example'); await sleep(20) } else await sleep(ms) } }, limiter)
  const calls: string[] = []
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(() => { calls.push('https robots'); return { statusCode: 200, data: 'User-agent: *\nAllow: /\n' } })
  mockAgent.get('https://pace.example').intercept({ path: '/a' }).reply(() => { calls.push('https /a'); return { statusCode: 200, data: 'a' } })
  mockAgent.get('http://pace.example').intercept({ path: '/robots.txt' }).reply(() => { calls.push('http robots'); return { statusCode: 200, data: 'User-agent: *\nAllow: /\n' } })
  mockAgent.get('http://pace.example').intercept({ path: '/c' }).reply(() => { calls.push('http /c'); return { statusCode: 200, data: 'c' } })
  expect((await g.fetchText('https://pace.example/a')).ok).toBe(true)
  interfere = true
  expect(await g.fetchText('http://pace.example/b')).toEqual({ ok: false, reason: 'rate_limited' })
  interfere = false
  expect(await db.robotsCache.findUnique({ where: { host: 'http://pace.example' } })).toBeNull()
  const refusals = await db.auditLog.findMany({ where: { action: 'fetch.refused' } })
  expect(refusals.map((r) => r.reasonCode)).toEqual(['rate_limited'])
  expect(refusals[0]?.metadata).toMatchObject({ retryAfterMs: expect.any(Number) })
  await sleep(450)
  expect((await g.fetchText('http://pace.example/c')).ok).toBe(true)
  expect(calls).toEqual(['https robots', 'https /a', 'http robots', 'http /c'])
  expect(await db.auditLog.count({ where: { action: 'fetch.refused', reasonCode: 'robots_disallowed' } })).toBe(0)
})

it('DC1-R3 a frozen limiter clock on a robots hop still cannot hang and caches nothing', async () => {
  await seed()
  const frozen = Date.now(), limiter = new HostRateLimiter(5000, () => frozen)
  limiter.record('pace.example')
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000,
    waitForDelay: () => new Promise((resolve) => setTimeout(resolve, 0)) }, limiter)
  expect(await g.fetchText('https://pace.example/seed')).toEqual({ ok: false, reason: 'rate_limited' })
  expect(await db.robotsCache.count()).toBe(0)
}, 2_000)

// DC1-R6: Retry-After is delta-seconds or a genuine HTTP-date; anything else malformed pauses 60 s.
it.each([['1.5', 60], ['-1', 60], ['0.5', 60], ['1e3', 60], ['tomorrow', 60], ['120', 120], ['', 60]])('DC1-R6 robots 429 Retry-After %j pauses %i s', async (retryAfter, seconds) => {
  await seed()
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 0 })
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(429, 'slow down', { headers: retryAfter ? { 'retry-after': retryAfter } : {} })
  expect(await g.fetchText('https://pace.example/x')).toEqual({ ok: false, reason: 'rate_limited' })
  expect((await db.robotsCache.findUnique({ where: { host: 'pace.example' } }))?.ttlSeconds).toBe(seconds)
})
it('DC1-R6 a genuine IMF-fixdate Retry-After still governs the pause', async () => {
  await seed()
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 0 })
  const date = new Date(Math.ceil(Date.now() / 1000) * 1000 + 300_000).toUTCString()
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(503, 'down', { headers: { 'retry-after': date } })
  expect(await g.fetchText('https://pace.example/x')).toEqual({ ok: false, reason: 'rate_limited' })
  const ttl = (await db.robotsCache.findUnique({ where: { host: 'pace.example' } }))?.ttlSeconds ?? 0
  expect(ttl).toBeGreaterThan(290)
  expect(ttl).toBeLessThanOrEqual(301)
})

// Part B item 9: StartupDB's documented 120/min per IP is a same-host floor at the only network path.
it('StartupDB documented API contract spaces same-host requests >=500 ms even with a zero default delay', async () => {
  await db.hostPolicy.create({ data: { host: 'startupdb.com', mode: 'allow', origin: 'seed_static' } })
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(new Date()), creditsCap: 40, billedUsdCap: 0 } })
  const g = new FetchPolicyGate(db, { userAgent: 'SX1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 0 })
  const calls: string[] = []
  for (const path of ['/api/v1/startups/acme', '/api/v1/startups/acme/activity?kind=funding&limit=25&offset=0', '/api/v1/startups/acme/activity?kind=funding&limit=25&offset=25'])
    mockAgent.get('https://startupdb.com').intercept({ path }).reply(() => { calls.push(path); return { statusCode: 200, data: '{}' } })
  expect((await g.fetchText('https://startupdb.com/api/v1/startups/acme')).ok).toBe(true)
  expect(await g.fetchText('https://startupdb.com/api/v1/startups/acme/activity?kind=funding&limit=25&offset=0')).toEqual({ ok: false, reason: 'rate_limited' })
  const refusal = await db.auditLog.findFirstOrThrow({ where: { action: 'fetch.refused' } })
  expect((refusal.metadata as { retryAfterMs: number }).retryAfterMs).toBeLessThanOrEqual(500)
  await sleep(510)
  expect((await g.fetchText('https://startupdb.com/api/v1/startups/acme/activity?kind=funding&limit=25&offset=0')).ok).toBe(true)
  expect(calls).toEqual(['/api/v1/startups/acme', '/api/v1/startups/acme/activity?kind=funding&limit=25&offset=0'])
  expect(await db.auditLog.count({ where: { action: 'fetch.robots_performed' } })).toBe(0)
})
