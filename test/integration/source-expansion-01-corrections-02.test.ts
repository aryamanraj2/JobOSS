import { afterAll, beforeEach, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { maskDirectArrayString } from '../../tools/passive-domain-mask.js'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { parseExpandedPage } from '../../src/ingest/discovery/expanded/parsers.js'
import { prepareDiscovery } from '../../src/ingest/discovery/prepare.js'
import { initialStartupDbCursor } from '../../src/ingest/discovery/startupdb.js'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { StubFetcher } from '../helpers/fixtures.js'
const db = testDb(), now = new Date('2026-10-18T12:00:00Z')
beforeEach(truncateAll); afterAll(closeTestDb)

// Extract each actual checker wrapper without executing the verifier or any mutant.
function checker(path: string): (file: string, source: string) => string {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let fn = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'passiveIdentityClassification') fn = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source); expect(fn).not.toBe('')
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return runInNewContext(`${js};passiveIdentityClassification`, { maskDirectArrayString })
}
it.each(['test/policy/application-packet.test.ts', 'tools/verify-f3.ts'])('SX1D %s exempts only direct passive array strings and leaves both executable mutants scanned', path => {
  const mask = checker(path), classifier = readFileSync('src/ingest/discovery/hn.ts', 'utf8'), file = 'src/ingest/discovery/hn.ts'
  const forbidden = /\bapplyToJob\b/i
  expect(forbidden.test(mask(file, classifier))).toBe(false)
  expect(forbidden.test(mask('src/other.ts', classifier))).toBe(true)
  const mutants = [
    "makeSubmissionEndpoint('applytojob.com')",
    "(() => gate.postForm('https://' + 'applytojob.com' + '/apply', form))()",
    "'applytojob.com' + '/apply'",
    '`applytojob.com`',
    "('applytojob.com')",
    "{host: 'applytojob.com'}",
    "...['applytojob.com']",
  ]
  for (const mutant of mutants) expect(forbidden.test(mask(file, classifier.replace("'applytojob.com'", mutant))), mutant).toBe(true)
  for (const unexpected of [classifier.replace('const APPLICATION_DOMAINS = new Set([', 'const APPLICATION_DOMAINS = new OtherSet(['), classifier.replace('const APPLICATION_DOMAINS', 'let APPLICATION_DOMAINS'), `${classifier}\nconst broken = ;`])
    expect(mask(file, unexpected)).toBe(unexpected)
})
it.each(['article', 'section', 'aside', 'h2', 'h3', 'h4', 'h5', 'h6'])('SX1D SPC rejects a Website in a nested %s identity group', tag => {
  const route = EXPANDED_ROUTES.find(r => r.id === 'southparkcommons:companies')!
  const body = `<html><body><main><h1>Acme</h1><${tag} aria-label="News"><a href="https://vendor.example/">Website</a></${tag}></main></body></html>`
  expect(parseExpandedPage(body, `${route.url!}/acme`, route, now).candidates).toHaveLength(0)
})
it('SX1D SPC binds the h1 shared identity group while excluding footer and duplicate links', () => {
  const route = EXPANDED_ROUTES.find(r => r.id === 'southparkcommons:companies')!, url = `${route.url!}/acme`
  const link = '<a href="https://acme.example/">Website</a>'
  const parse = (body: string) => parseExpandedPage(`<html><body>${body}</body></html>`, url, route, now)
  expect(parse(`<main><section><h1>Acme</h1><div>${link}</div></section></main>`).candidates).toHaveLength(1)
  expect(parse(`<main><h1>Acme</h1></main><footer>${link}</footer>`).candidates).toHaveLength(0)
  expect(parse(`<main><h1>Acme</h1>${link}${link}</main>`).candidates).toHaveLength(0)
})
it.each(['429', 'rate_limited', 'robots_disallowed'] as const)('SX1D legacy StartupDB immediate %s persists only sanitized authoritative state', async refusal => {
  const batchId = `sx1d-legacy-${refusal}`, marker = 'LEGACY_PENDING_THIRD_PARTY_DESCRIPTION'
  const pending = { slug: 'acme', detail: { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example', profile: { shortDescription: marker }, fundingHistory: [], fundingHistoryTotal: 0 }, entry: { name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example' }, funding: [], fundingOffset: 0, total: 0, fundingHashes: {}, fundingDone: true }
  for (const source of ['yc', 'startupdb', 'hn']) await db.discoveryRun.create({ data: { source, status: source === 'startupdb' ? 'paused' : 'completed', startedAt: now, counts: { discovered: 0 }, coverage: { batchId, scopeNow: now.toISOString(), companyIds: [] }, cursor: JSON.parse(JSON.stringify(source === 'startupdb' ? { ...initialStartupDbCursor(), investorSlug: 'f0', pending } : {})) } })
  const url = 'https://startupdb.com/api/v1/investors/f0/portfolio?limit=25&offset=0'
  const gate = new StubFetcher({ [url]: { body: '', statusCode: 429, headers: { 'retry-after': '42' } } })
  const called = gate.fetchText.bind(gate)
  if (refusal !== '429') gate.fetchText = async input => { gate.requested.push(input); return { ok: false, reason: refusal } }
  else gate.fetchText = called
  const result = await prepareDiscovery(db, gate, { now, limit: 20, delayMs: 0, resume: true, runId: batchId })
  const row = await db.discoveryRun.findFirstOrThrow({ where: { source: 'startupdb' } })
  expect(gate.requested).toEqual([url]); expect(row.status).toBe('paused')
  expect(JSON.stringify(row.cursor)).not.toContain(marker)
  expect(row.cursor).toMatchObject({ pending: { slug: 'acme', detail: { profile: {} } } })
  expect(result.sources.find(s => s.source === 'startupdb')!.coverage.reason).toBe(refusal === '429' ? 'source_rate_limited' : refusal)
  expect(await db.company.count()).toBe(0); expect(await db.evidence.count()).toBe(0)
})
