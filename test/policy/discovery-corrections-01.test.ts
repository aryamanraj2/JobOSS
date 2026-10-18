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
async function gate(delay = 0) {
  await db.hostPolicy.create({ data: { host: 'pace.example', mode: 'allow', origin: 'derived_company', includeSubdomains: true } })
  await db.researchBudget.create({ data: { companyId: null, periodMonth: currentPeriodMonth(new Date()), creditsCap: 40, billedUsdCap: 0 } })
  return new FetchPolicyGate(db, { userAgent: 'DC1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: delay })
}
it('RR1-03 spaces every same-host robots/content hop, applies Crawl-delay and fetches www robots once', async () => {
  const g = await gate(40), calls: { host: string; path: string; time: number }[] = []
  for (const [host, path, statusCode, data, headers] of [
    ['pace.example', '/robots.txt', 301, '', { location: 'https://www.pace.example/robots.txt' }],
    ['www.pace.example', '/robots.txt', 200, 'User-agent: *\nAllow: /\nCrawl-delay: 0.06', {}],
    ['pace.example', '/seed', 301, '', { location: 'https://www.pace.example/seed' }],
    ['www.pace.example', '/seed', 200, 'company page', {}],
  ] as const) {
    mockAgent.get(`https://${host}`).intercept({ path }).reply(() => { calls.push({ host, path, time: Date.now() }); return { statusCode, data, responseOptions: { headers } } })
  }
  const page = await fetchPage(g, 'https://pace.example/seed')
  expect(page.ok).toBe(true)
  expect(calls.filter((c) => c.host === 'www.pace.example' && c.path === '/robots.txt')).toHaveLength(1)
  for (const host of ['pace.example', 'www.pace.example']) {
    const times = calls.filter((c) => c.host === host).map((c) => c.time)
    expect(times.length).toBe(2)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(60)
  }
  expect(await db.auditLog.count({ where: { action: 'fetch.robots_performed' } })).toBe(2)
})
it('RR1-03 a limiter clock that never advances cannot hang fetchText: one bounded wait, then rate_limited', async () => {
  await gate()
  const frozen = Date.now(), waits: number[] = []
  const g = new FetchPolicyGate(db, { userAgent: 'DC1-test', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000,
    waitForDelay: (ms) => { waits.push(ms); return new Promise((resolve) => setTimeout(resolve, 0)) } }, new HostRateLimiter(5000, () => frozen))
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(200, 'User-agent: *\nAllow: /\n')
  expect(await g.fetchText('https://pace.example/seed')).toEqual({ ok: false, reason: 'rate_limited' })
  expect(waits.length).toBe(1)
}, 2_000)
it.each([401, 403, 429, 500, 503])('RR1-08 robots %i refuses/pauses without fetching content, including cache', async (status) => {
  const g = await gate(), calls: string[] = []
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(() => { calls.push('robots'); return { statusCode: status, data: 'refused', responseOptions: { headers: { 'retry-after': '120' } } } })
  mockAgent.get('https://pace.example').intercept({ path: '/seed' }).reply(() => { calls.push('content'); return { statusCode: 200, data: 'page' } })
  const reason = status === 401 || status === 403 ? 'robots_disallowed' : 'rate_limited'
  expect(await g.fetchText('https://pace.example/seed')).toEqual({ ok: false, reason })
  expect(await g.fetchText('https://pace.example/seed')).toEqual({ ok: false, reason })
  expect(calls).toEqual(['robots'])
  const audits = await db.auditLog.findMany({ where: { action: 'fetch.refused' } })
  if (reason === 'rate_limited') expect(audits[0]?.metadata).toMatchObject({ retryAfterMs: expect.any(Number), robotsStatus: status })
})
it.each([404, 410])('RR1-08 robots %i remains absence of rules on explicitly allowed host', async (status) => {
  const g = await gate()
  mockAgent.get('https://pace.example').intercept({ path: '/robots.txt' }).reply(status, '')
  mockAgent.get('https://pace.example').intercept({ path: '/seed' }).reply(200, 'page')
  expect((await g.fetchText('https://pace.example/seed')).ok).toBe(true)
})
it('RR1-09 fetchPage propagates truncation as failure before treating a prefix as a page', async () => {
  const { StubFetcher } = await import('../helpers/fixtures.js')
  const page = await fetchPage(new StubFetcher({ 'https://pace.example/seed': { body: 'matching prefix', truncated: true } }), 'https://pace.example/seed')
  expect(page).toMatchObject({ ok: false, reason: 'source_unavailable', detail: expect.stringMatching(/truncat/i), truncated: true })
})
