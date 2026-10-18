import { spcDetail, responses, html, org, job } from '../discovery-expansion/fixtures.js'
import { EXPANDED_ROUTES } from '../../../src/ingest/discovery/expanded/registry.js'
import { StubFetcher } from '../../helpers/fixtures.js'
import { dWorld, NOW } from '../joboss-d/world.js'
export { NOW }
export async function prepWorld(options: Parameters<typeof dWorld>[0] = {}) {
  const w = await dWorld({ withLead: false, ...options })
  const pages = responses()
  for (const r of EXPANDED_ROUTES) if (r.url && ['directory','jobs'].includes(r.kind)) pages[r.url] = { body: html([]) }
  pages['https://yc-oss.github.io/api/companies/all.json'] = { body: '[]' }
  pages['https://yc-oss.github.io/api/companies/hiring.json'] = { body: '[]' } // SX1 yc:hiring route
  // Retained StartupDB/HN adapters still exercise their actual synthetic paths.
  const primary = `<html><head><title>Acme mobile receipt tool</title></head><body><article><h1>Our offline receipt review app</h1><p>${w.product.excerpt}</p><p>${w.second.excerpt}</p><p>Our mobile product displays the original image alongside every extracted amount so a user can inspect the model result and correct it before saving. We build this feature in SwiftUI and Core ML for iOS devices.</p></article></body></html>`
  pages[`https://${w.company.canonicalDomain}/`] = { body: primary }
  return { ...w, pages, gate: new StubFetcher(pages) }
}
export function addRoute(w: Awaited<ReturnType<typeof prepWorld>>, id: string, listed = false) {
  const r = EXPANDED_ROUTES.find(r => r.id === id)!
  const data = listed ? job({ title: 'iOS Engineer Intern', applicationUrl: 'https://job-boards.greenhouse.io/acme/jobs/j1' }) : org()
  // SX1 (Part B 4): SPC identity comes only from the same-source detail page.
  if (id === 'southparkcommons:companies') {
    w.pages[r.url!] = { body: '<html><body><article><h2><a href="/companies/acme">Acme</a></h2></article></body></html>' }
    w.pages['https://www.southparkcommons.com/companies/acme'] = { body: spcDetail(data) }
  } else w.pages[r.url!] = { body: html([data]) }
}
export const request = (runId: string, provider: 'codex'|'claude'|'manual' = 'codex') => ({ runId, options: { limit: 1, discoveryLimit: 20, campaignCycle: '2026-10', provider } })
export const clock = { now: () => NOW, delayMs: 0 }
