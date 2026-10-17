import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { prepareDiscovery } from '../../src/ingest/discovery/prepare.js'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'
import { candidateKey } from '../../src/ingest/discovery/expanded/snapshot.js'
import type { PageCursor } from '../../src/ingest/discovery/expanded/adapter.js'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { seedHostPolicies } from '../../src/core/policy/host-policy.js'
import { responses, html, org, job, NOW } from '../fixtures/discovery-expansion/fixtures.js'

const db = testDb(), options = { mode: 'expanded-v1' as const, limit: 20, now: NOW, delayMs: 0 }
const NEXT = new Date(NOW.getTime() + 86400000), FEED = 'https://yc-oss.github.io/api/companies/all.json'
const DIR = 'scratch/joboss-x-corrections-02-20261017-a'
const route = (id: string) => EXPANDED_ROUTES.find((r) => r.id === id)!
const src = (s: Awaited<ReturnType<typeof prepareDiscovery>>, id: string) => s.sources.find((r) => r.source === id)!
const json = (v: unknown) => JSON.parse(JSON.stringify(v))
function evidence(name: string, value: unknown) { mkdirSync(DIR, { recursive: true }); writeFileSync(`${DIR}/synthetic-${name}.json`, JSON.stringify(value, null, 2) + '\n') }
beforeEach(async () => { vi.restoreAllMocks(); await truncateAll() })
afterAll(closeTestDb)

it('RX-03-R1 actual lost YC COMMIT acknowledgement repairs next day with original X and per-key Evidence exactly once', async () => {
  const pages = responses(), seed = { id: 99, name: 'YC Replay', website: 'https://yc-replay.example', status: 'Active', batch: 'Summer 2026' }
  pages[FEED] = { body: JSON.stringify([seed]) }
  const original = db.$transaction.bind(db); let fired = false
  const spy = vi.spyOn(db, '$transaction').mockImplementation((async (...args: unknown[]) => {
    const result = await Reflect.apply(original, db, args)
    if (!fired && result?.id && await db.company.findUnique({ where: { canonicalDomain: 'yc-replay.example' } })) { fired = true; throw Error('RX03-R1 real COMMIT acknowledged as lost') }
    return result
  }) as typeof db.$transaction)
  const first = await prepareDiscovery(db, new StubFetcher(pages), options); spy.mockRestore()
  const company = await db.company.findUniqueOrThrow({ where: { canonicalDomain: 'yc-replay.example' } })
  const beforeEvidence = await db.evidence.findMany({ where: { companyId: company.id }, orderBy: { id: 'asc' } })
  const saved = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, 'yc:companies').runId } })
  const gate = new StubFetcher(pages), second = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  const afterEvidence = await db.evidence.findMany({ where: { companyId: company.id }, orderBy: { id: 'asc' } })
  const terminalGate = new StubFetcher({}), third = await prepareDiscovery(db, terminalGate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  const fourth = await prepareDiscovery(db, terminalGate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  evidence('yc-later-day-commit-ack', { fired, first: src(first, 'yc:companies'), saved, beforeEvidence, second: src(second, 'yc:companies'), afterEvidence, third: src(third, 'yc:companies'), fourth: src(fourth, 'yc:companies'), requests: gate.requested, terminalRequests: terminalGate.requested })
  expect(fired).toBe(true); expect(src(first, 'yc:companies').status).toBe('paused')
  expect(src(first, 'yc:companies').discovered).toBe(1); expect(src(first, 'yc:companies').coverage.records).toHaveLength(1)
  expect((saved.cursor as { processed: string[] }).processed).toEqual([])
  expect(beforeEvidence.filter((e) => e.sourceType === 'external_source')).toHaveLength(1)
  expect(beforeEvidence.filter((e) => e.sourceType === 'yc')).toHaveLength(6)
  expect(new Set(beforeEvidence.filter((e) => e.sourceType === 'yc').map((e) => e.contentHash)).size).toBe(6)
  expect(beforeEvidence.every((e) => e.observedAt.getTime() === NOW.getTime())).toBe(true)
  expect(gate.requested.filter((u) => u === FEED)).toHaveLength(1)
  expect(src(second, 'yc:companies').status).toBe('completed'); expect(src(second, 'yc:companies').discovered).toBe(1)
  expect(src(second, 'yc:companies').coverage.records).toEqual(src(first, 'yc:companies').coverage.records)
  expect(afterEvidence.filter((e) => e.sourceType === 'external_source')).toEqual(beforeEvidence.filter((e) => e.sourceType === 'external_source'))
  expect(afterEvidence.filter((e) => e.sourceType !== 'external_source')).toEqual(beforeEvidence.filter((e) => e.sourceType !== 'external_source'))
  expect(await db.company.count({ where: { canonicalDomain: 'yc-replay.example' } })).toBe(1)
  expect(terminalGate.requested).toEqual([])
  expect(src(third, 'yc:companies').coverage.records).toEqual(src(first, 'yc:companies').coverage.records)
  expect(src(fourth, 'yc:companies').coverage.records).toEqual(src(first, 'yc:companies').coverage.records)
})
it('RX-03-R1 distinct YC records retain their own next-day capture and unchanged feed order is safe', async () => {
  const pages = responses(), seeds = [1, 2].map((id) => ({ id, name: `YC ${id}`, website: `https://yc-${id}.example`, batch: 'Summer 2026' }))
  pages[FEED] = { body: JSON.stringify(seeds) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  pages[FEED] = { body: JSON.stringify(seeds.toReversed()) }
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, now: NEXT, resume: true, runId: first.batchId })
  const records = src(second, 'yc:companies').coverage.records as { observedAt: string; externalId: string }[]
  expect(records.map((r) => [r.externalId, r.observedAt])).toEqual([['1', NOW.toISOString()], ['2', NEXT.toISOString()]])
  for (const id of [1, 2]) expect(await db.evidence.count({ where: { sourceType: 'external_source', company: { canonicalDomain: `yc-${id}.example` } } })).toBe(1)
  evidence('yc-distinct-partial', { first: src(first, 'yc:companies'), second: src(second, 'yc:companies') })
})
it('RX-03-R1 meaningful changed YC bytes still pause frozen feed before persistence', async () => {
  const pages = responses(), first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  const seeds = JSON.parse(pages[FEED]!.body); seeds[1].one_liner += ' changed product'; pages[FEED] = { body: JSON.stringify(seeds) }
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(second, 'yc:companies').status).toBe('paused'); expect(src(second, 'yc:companies').coverage.reason).toBe('changed_feed_hash_new_batch_required')
  expect(src(second, 'yc:companies').coverage.records).toEqual(src(first, 'yc:companies').coverage.records)
})

it.each(['pending-single', 'pending-multi', 'unknown-multi', 'replaced-multi', 'unknown-terminal', 'replaced-terminal'])('RX-04-R1 %s refuses unsupported progress before requests or credits with forensic cursor intact', async (mode) => {
  const r = route('ef:companies'), pages = responses(), multi = mode.includes('multi'), terminal = mode.includes('terminal')
  const entries = Array.from({ length: 21 }, (_, i) => org(i === 20 ? 'Pending' : `Before ${i}`, i === 20 ? 'https://pending.example' : `https://before-${i}.example`))
  pages[r.url!] = { body: multi ? html(entries.slice(0, 1), '<a rel="next" href="?p=2">Next</a>') : html(terminal ? entries.slice(0, 2) : entries) }
  if (multi) pages[r.url! + '?p=2'] = { body: html(entries.slice(1)) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options)
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } }), cursor = json(row.cursor) as PageCursor
  if (mode.startsWith('pending')) cursor.processed.push(candidateKey(cursor.snapshot!.parsed.candidates.find((c) => c.companyName === 'Pending')!))
  else if (mode.startsWith('replaced')) cursor.processed[0] = 'b'.repeat(64)
  else cursor.processed.push('b'.repeat(64))
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: json(cursor) } })
  const before = { companies: await db.company.count(), evidence: await db.evidence.findMany({ orderBy: { id: 'asc' } }), records: src(first, r.id).coverage.records }
  await seedHostPolicies(db)
  await db.researchBudget.create({ data: { companyId: null, periodMonth: '2026-10', creditsCap: 20, billedUsdCap: 0 } })
  const gate = new FetchPolicyGate(db, { userAgent: 'x-corrections02-offline/1', robotsTtlSeconds: 86400, defaultRateDelayMs: 5000, now: () => NOW })
  const requests = vi.spyOn(gate, 'fetchText')
  const second = await prepareDiscovery(db, gate, { ...options, resume: true, runId: first.batchId }), s = src(second, r.id)
  const after = await db.discoveryRun.findUniqueOrThrow({ where: { id: row.id } })
  evidence(`progress-${mode}`, { original: row, contradictory: cursor, before, second: s, after, calls: requests.mock.calls, credits: (await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })).creditsSpent })
  expect(s.status).toBe('paused'); expect(s.coverage.scopeComplete).toBe(false); expect(s.coverage.executionFinished).toBe(false)
  expect(after.cursor).toEqual(cursor); expect(s.discovered).toBe(src(first, r.id).discovered); expect(s.coverage.records).toEqual(before.records)
  expect(await db.company.count()).toBe(before.companies); expect(await db.company.findUnique({ where: { canonicalDomain: 'pending.example' } })).toBeNull()
  expect(await db.evidence.findMany({ orderBy: { id: 'asc' } })).toEqual(before.evidence)
  expect(requests).not.toHaveBeenCalled(); expect(await db.robotsCache.count()).toBe(0)
  expect((await db.researchBudget.findFirstOrThrow({ where: { companyId: null } })).creditsSpent).toBe(0)
  expect(s.coverage.countsThisInvocation).toMatchObject({ requests: 0 })
})

it.each(['ef:companies', 'yc:jobs', 'seedcamp:talent'])('RX-04-R1 genuine multi-page v1 %s keys reconstruct from durable records through partial and terminal resume', async (id) => {
  const r = route(id), pages = responses(), make = (i: number) => r.kind === 'jobs' ? job({ identifier: `v1-${i}`, url: new URL(`/jobs/${i}`, r.url!).href,
    hiringOrganization: org(`V1 ${i}`, `https://v1-${i}.example`), applicationUrl: `https://v1-${i}.example/apply` }) : org(`V1 ${i}`, `https://v1-${i}.example`)
  pages[r.url!] = { body: html([make(0)], '<a rel="next" href="?p=2">Next</a>') }; pages[r.url! + '?p=2'] = { body: html(Array.from({ length: 20 }, (_, i) => make(i + 1))) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options), row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, id).runId } })
  // Model actual original v1: remove only the later optional normalized expiry, from both ledger and cursor, and recompute its actual keys.
  const cursor = json(row.cursor) as PageCursor, coverage = json(row.coverage)
  const remap = new Map<string, string>()
  for (const c of cursor.snapshot!.parsed.candidates) { const old = candidateKey(c); if (c.provenance?.listing) delete c.provenance.listing.validThrough; remap.set(old, candidateKey(c)) }
  for (const record of coverage.records) {
    const before = candidateKey({ externalId: record.externalId, raw: record.raw, provenance: record.provenance } as never)
    if (record.provenance.listing) delete record.provenance.listing.validThrough
    remap.set(before, candidateKey({ externalId: record.externalId, raw: record.raw, provenance: record.provenance } as never))
    record.key = contentHashOf({ route: id, externalId: record.externalId, raw: record.raw, provenance: record.provenance })
  }
  cursor.processed = cursor.processed.map((k) => remap.get(k) ?? k)
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: json(cursor), coverage } })
  const gate = new StubFetcher({}), second = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(second, id).status).toBe('unverified'); expect(src(second, id).discovered).toBe(21); expect(src(second, id).coverage.scopeComplete).toBe(true)
  expect(gate.requested).toEqual([])
  const third = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(third, id).coverage.records).toEqual(src(second, id).coverage.records); expect(gate.requested).toEqual([])
  expect((src(third, id).coverage.records as { observedAt: string }[]).every((r) => r.observedAt === NOW.toISOString())).toBe(true)
  evidence(`v1-multi-${id.replace(':', '-')}`, { cursor, second: src(second, id), third: src(third, id) })
})
it.each([false, true])('RX-04-R1 genuine unresolved/resolved redirected detail bookkeeping needs no invented durable candidate; resolved=%s', async (resolved) => {
  const r = route('southparkcommons:companies'), pages = responses(), requested = new URL('/companies/detail', r.url!).href, final = new URL('/company/detail', r.url!).href
  pages[r.url!] = { body: html(Array.from({ length: 21 }, (_, i) => org(`Plain ${i}`, `https://plain-${i}.example`)), '<article><h2><a href="/companies/detail">Detail</a></h2><p>member company</p></article>') }
  pages[requested] = { body: '', statusCode: 302, headers: { location: final } }; pages[final] = { body: html(resolved ? [org('Detail', 'https://detail.example')] : []) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options), row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } })
  const cursor = json(row.cursor) as PageCursor
  expect(cursor.processed).toContain(`detail:${requested}`)
  if (resolved) {
    const detail = cursor.snapshot!.parsed.candidates.find((c) => c.companyName === 'Detail')!
    delete detail.raw.detailHops; delete detail.raw.detailRequestedUrl
    await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: json(cursor) } })
  }
  const gate = new StubFetcher({}), second = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(second, r.id).status).toBe('unverified'); expect(src(second, r.id).discovered).toBe(resolved ? 22 : 21)
  expect(gate.requested).toEqual([]); expect(src(second, r.id).coverage.unresolved).toHaveLength(resolved ? 0 : 1)
  const third = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(third, r.id).coverage.records).toEqual(src(second, r.id).coverage.records); expect(gate.requested).toEqual([])
  evidence(`detail-${resolved}`, { cursor, second: src(second, r.id), third: src(third, r.id) })
})

const one = (applicationUrl: string, url = 'https://www.ycombinator.com/jobs/1') => job({ identifier: 'role-1', url, hiringOrganization: org('Employer One', 'https://employer-one.example'), applicationUrl })
const ten = () => job({ identifier: 'role-10', url: 'https://www.ycombinator.com/jobs/10', hiringOrganization: org('Employer Ten', 'https://employer-ten.example'), applicationUrl: 'https://www.ycombinator.com/jobs/10/apply' })
it.each([
  ['https://www.ycombinator.com/jobs/10/apply', '/jobs/1'],
  ['https://www.ycombinator.com/jobs/10/apply', '/jobs/1/'],
  ['https://ycombinator.com/jobs/1/apply', '/jobs/1'],
  ['https://www.ycombinator.com/jobs/1ish', '/jobs/1'],
  ['https://www.ycombinator.com/jobs/1', '/jobs/1/'],
])('RX-06-R1 parser preserves contradictory raw %s against %s while independent Ten stays bound', (application, role) => {
  const r = route('yc:jobs'), bad = one(application, new URL(role, r.url!).href), parsed = parseExpandedPage(html([bad, ten()]), r.url!, r, NOW)
  evidence(`parser-negative-${contentHashOf([application, role]).slice(0, 10)}`, parsed)
  expect(parsed.candidates.map((c) => c.companyName)).toEqual(['Employer Ten']); expect(parsed.unresolved).toHaveLength(1)
  expect(parsed.unresolved[0]?.raw).toEqual(bad)
})
it.each([
  ['https://www.ycombinator.com/jobs/1', '/jobs/1'],
  ['https://www.ycombinator.com/jobs/1/apply', '/jobs/1'],
  ['https://www.ycombinator.com/jobs/1/', '/jobs/1/'],
  ['https://www.ycombinator.com/jobs/1/apply', '/jobs/1/'],
  ['https://employer-one.example/careers/mobile', '/jobs/1'],
])('RX-06-R1 parser accepts supported exact/segment/employer route %s for %s', (application, role) => {
  const r = route('yc:jobs'), parsed = parseExpandedPage(html([one(application, new URL(role, r.url!).href), ten()]), r.url!, r, NOW)
  expect(parsed.candidates.map((c) => c.companyName)).toEqual(['Employer One', 'Employer Ten']); expect(parsed.unresolved).toEqual([])
})
it('RX-06-R1 production two-employer sibling path rejects One before canonical/Evidence/hosts/ledger/bound handoff', async () => {
  const r = route('yc:jobs'), pages = responses(), bad = one('https://www.ycombinator.com/jobs/10/apply')
  pages[r.url!] = { body: html([bad, ten()]) }
  const result = await prepareDiscovery(db, new StubFetcher(pages), options), s = src(result, r.id)
  const companies = await db.company.findMany({ where: { canonicalDomain: { in: ['employer-one.example', 'employer-ten.example'] } } })
  const sourceEvidence = await db.evidence.findMany({ where: { sourceUrl: r.url! } })
  const hosts = await db.hostPolicy.findMany({ where: { host: { in: ['employer-one.example', 'employer-ten.example'] }, origin: 'derived_company' } })
  evidence('two-employer-persistence', { result, companies, sourceEvidence, hosts, bad })
  expect(s.coverage.records).toHaveLength(1); expect(s.coverage.unresolved).toMatchObject([{ name: 'Employer One', raw: bad }])
  expect(companies.map((c) => c.canonicalDomain)).toEqual(['employer-ten.example'])
  expect(sourceEvidence).toHaveLength(1); expect(sourceEvidence[0]?.companyId).toBe(companies[0]?.id)
  expect(hosts.some((h) => h.host === 'employer-one.example')).toBe(false)
  expect(result.handoff!.items.some((i) => i.domain === 'employer-one.example')).toBe(false)
  expect(result.handoff!.items.find((i) => i.domain === 'employer-ten.example')?.listingHints).toHaveLength(1)
})
it('RX-06-R1 independently discovered rejected employer keeps only its truthful company attribution and unresolved advertised input', async () => {
  const pages = responses(), r = route('yc:jobs'); pages[r.url!] = { body: html([one('https://www.ycombinator.com/jobs/10/apply'), ten()]) }
  pages[route('ef:companies').url!] = { body: html([org('Employer One', 'https://employer-one.example')]) }
  const result = await prepareDiscovery(db, new StubFetcher(pages), options), item = result.handoff!.items.find((i) => i.domain === 'employer-one.example')!
  expect(item.sourceRoutes).toEqual(['ef:companies']); expect(item.listingHints).toEqual([]); expect(item.unresolvedAdvertisedHints).toHaveLength(1)
  expect(await db.evidence.count({ where: { companyId: item.companyId, sourceUrl: r.url! } })).toBe(0)
})
it('RX-06-R1 persisted pending job with sibling application refuses identically without overwriting forensic JSON', async () => {
  const r = route('yc:jobs'), pages = responses(); pages[r.url!] = { body: html(Array.from({ length: 21 }, (_, i) => job({ identifier: `restore-${i}`, url: new URL(`/jobs/${i}`, r.url!).href,
    hiringOrganization: org(`Restore ${i}`, `https://restore-${i}.example`), applicationUrl: new URL(`/jobs/${i}/apply`, r.url!).href }))) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), options), row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, r.id).runId } })
  const cursor = json(row.cursor) as PageCursor, pending = cursor.snapshot!.parsed.candidates[20]!
  pending.raw.applicationUrl = 'https://www.ycombinator.com/jobs/200/apply'; pending.provenance!.listing!.applicationUrl = String(pending.raw.applicationUrl)
  await db.discoveryRun.update({ where: { id: row.id }, data: { cursor: json(cursor) } })
  const gate = new StubFetcher({}), second = await prepareDiscovery(db, gate, { ...options, now: NEXT, resume: true, runId: first.batchId })
  evidence('sibling-snapshot-refusal', { cursor, second: src(second, r.id), requests: gate.requested })
  expect(src(second, r.id).status).toBe('paused'); expect(src(second, r.id).coverage.scopeComplete).toBe(false)
  expect((await db.discoveryRun.findUniqueOrThrow({ where: { id: row.id } })).cursor).toEqual(cursor)
  expect(await db.company.findUnique({ where: { canonicalDomain: 'restore-20.example' } })).toBeNull(); expect(gate.requested).toEqual([])
})
it('RX-06-R1 external ATS listing remains raw unresolved and creates no company', async () => {
  const r = route('yc:jobs'), pages = responses(), bad = one('https://jobs.lever.co/employer-one/mobile')
  pages[r.url!] = { body: html([bad]) }; const result = await prepareDiscovery(db, new StubFetcher(pages), options)
  expect(src(result, r.id).coverage.records).toEqual([]); expect(src(result, r.id).coverage.unresolved).toMatchObject([{ raw: bad }])
  expect(await db.company.findUnique({ where: { canonicalDomain: 'employer-one.example' } })).toBeNull()
})
it('RX-03-R1 ambiguous historical YC duplicates pause replay and preserve all original forensic rows', async () => {
  const pages = responses()
  pages[FEED] = { body: JSON.stringify([99, 100].map((id) => ({ id, name: `Historical YC ${id}`, website: `https://historical-yc-${id}.example`, batch: 'Summer 2026' }))) }
  const first = await prepareDiscovery(db, new StubFetcher(pages), { ...options, limit: 1 })
  const row = await db.discoveryRun.findUniqueOrThrow({ where: { id: src(first, 'yc:companies').runId } }), coverage = json(row.coverage), cursor = json(row.cursor)
  coverage.records.push({ ...coverage.records[0], key: 'c'.repeat(64) }); cursor.processed = []
  await db.discoveryRun.update({ where: { id: row.id }, data: { coverage, cursor } })
  const before = await db.evidence.findMany({ orderBy: { id: 'asc' } })
  const second = await prepareDiscovery(db, new StubFetcher(pages), { ...options, now: NEXT, resume: true, runId: first.batchId })
  expect(src(second, 'yc:companies').status).toBe('paused'); expect(src(second, 'yc:companies').errors.join(' ')).toContain('Inconsistent frozen YC source records')
  expect(src(second, 'yc:companies').coverage.records).toEqual(coverage.records); expect(src(second, 'yc:companies').discovered).toBe(1)
  expect(await db.evidence.findMany({ where: { companyId: coverage.records[0].companyId }, orderBy: { id: 'asc' } })).toEqual(before.filter((e) => e.companyId === coverage.records[0].companyId))
  evidence('yc-inconsistent-history', { coverage, second: src(second, 'yc:companies') })
})
