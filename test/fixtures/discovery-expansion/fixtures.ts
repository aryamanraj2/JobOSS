import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { StubFetcher, type StubResponse } from '../../helpers/fixtures.js'
import { EXPANDED_ROUTES } from '../../../src/ingest/discovery/expanded/registry.js'
import { INVESTOR_SEEDS, STARTUPDB_BASE as S } from '../../../src/ingest/discovery/startupdb.js'
import { HN_API as H } from '../../../src/ingest/discovery/hn.js'
export const NOW = new Date('2026-10-16T00:00:00Z')
export function fixture(name: string) { return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8') }
export const org = (name = 'Acme', website = 'https://acme.example', extra = {}) => ({ '@type': 'Organization', name, url: website, description: `${name} builds iOS apps with Swift and SwiftUI.`, ...extra })
export const html = (items: unknown[], tail = '') => `<html><body><script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: items.map((item) => ({ '@type': 'ListItem', item })) })}</script>${tail}</body></html>`
export const job = (extra = {}) => ({ '@type': 'JobPosting', identifier: { value: 'mobile-1' }, title: 'iOS Engineer', url: 'https://www.ycombinator.com/jobs/mobile-1',
  hiringOrganization: org(), description: 'Develop our iOS app in Swift and SwiftUI.', datePosted: '2026-10-01', validThrough: '2026-11-01', applicationUrl: 'https://acme.example/careers/mobile', ...extra })
export function responses(): Record<string, StubResponse> {
  const pages: Record<string, StubResponse> = {}
  for (const route of EXPANDED_ROUTES) if (route.url && ['directory', 'jobs'].includes(route.kind)) pages[route.url] = { body: fixture(`${route.id.replaceAll(':', '-')}.html`) }
  pages['https://yc-oss.github.io/api/companies/all.json'] = { body: JSON.stringify([
    { id: 1, name: 'Acme', website: 'https://acme.example', batch: 'Summer 2026', team_size: 2, status: 'Active', one_liner: 'iOS Swift SwiftUI mobile app' },
    { id: 2, name: 'Old Mobile', website: 'https://old-mobile.example', batch: 'Summer 2010', team_size: 900, status: 'Active', one_liner: 'mobile iOS Swift' },
    { id: 3, name: 'Unknown AI', website: 'https://unknown-ai.example', status: 'Active', one_liner: 'machine learning AI' },
    { id: 4, name: 'Historical', website: 'https://historical.example', status: 'Acquired', batch: 'Winter 2010', team_size: 5000 },
  ]) }
  for (const [i, seed] of INVESTOR_SEEDS.entries()) {
    pages[`${S}/investors?q=${encodeURIComponent(seed.name)}&limit=100&offset=0`] = { body: JSON.stringify({ data: [{ ...seed, slug: `f${i}` }], pagination: { total: 1 } }) }
    pages[`${S}/investors/f${i}/portfolio?limit=25&offset=0`] = { body: JSON.stringify({ data: i ? [] : [{ name: 'Acme', slug: 'acme', domain: 'acme.example' }], pagination: { total: i ? 0 : 1 } }) }
  }
  pages[`${S}/startups/acme`] = { body: JSON.stringify({ data: { name: 'Acme', slug: 'acme', domain: 'acme.example', profile: { shortDescription: 'iOS Swift SwiftUI mobile app' }, fundingHistory: [], fundingHistoryTotal: 0 } }) }
  pages[`${H}/user/whoishiring.json`] = { body: JSON.stringify({ id: 'whoishiring', submitted: [30, 20, 10] }) }
  for (const [i, id] of [30, 20, 10].entries()) {
    pages[`${H}/item/${id}.json`] = { body: JSON.stringify({ id, by: 'whoishiring', type: 'story', title: 'Ask HN: Who is hiring?', time: Date.UTC(2026, 9 - i, 1) / 1000, kids: [id + 1] }) }
    pages[`${H}/item/${id + 1}.json`] = { body: JSON.stringify({ id: id + 1, by: 'owner', type: 'comment', parent: id, time: Date.UTC(2026, 9 - i, 2) / 1000,
      text: 'Acme | Hiring iOS engineers <a href="https://acme.example">Apply</a> owner@acme.example' }) }
  }
  return pages
}
export const syntheticGate = () => new StubFetcher(responses())
