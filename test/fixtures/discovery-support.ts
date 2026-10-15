/** Synthetic employer markup and board responses, through production ownership/ingest paths. */
import { detectAtsForCompany, saveDetection } from '../../src/ingest/ats/detect.js'
import { ingestPostings } from '../../src/ingest/ats/ingest-postings.js'
import { GreenhouseProvider } from '../../src/ingest/ats/greenhouse.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { testDb } from '../helpers/db.js'
export async function proveBoard(companyId: string, now: Date, token = 'acme') {
  const db = testDb(), company = await db.company.findUniqueOrThrow({ where: { id: companyId } })
  const url = `https://${company.canonicalDomain}/careers`
  const gate = new StubFetcher({ [url]: { body: `<a href="https://job-boards.greenhouse.io/${token}">Open roles</a>` } })
  const outcome = await detectAtsForCompany(db, gate, { ...company, careersUrl: url }, { now: () => now })
  if (!outcome.found) throw new Error(outcome.detail)
  await saveDetection(db, companyId, outcome.detection, outcome.sourceUrl)
  return db.company.findUniqueOrThrow({ where: { id: companyId } })
}
export async function boardSnapshot(companyId: string, now: Date, jobs: Record<string, unknown>[], total = jobs.length, token = 'acme') {
  const provider = new GreenhouseProvider(new StubFetcher({
    [`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`]: { body: JSON.stringify({ jobs, meta: { total } }) },
  }))
  return ingestPostings(testDb(), provider, { id: companyId, atsBoardToken: token }, { now: () => now })
}
export const syntheticJob = (id: string, title = 'iOS Engineer Intern', content = 'Build iOS apps in Swift and SwiftUI.', token = 'acme') => ({
  id, title, content, absolute_url: `https://job-boards.greenhouse.io/${token}/jobs/${id}`, location: { name: 'Bengaluru, India' },
})
