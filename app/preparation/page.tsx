import Link from 'next/link'
import { db } from '../lib/db.js'
export const dynamic = 'force-dynamic'
export default async function PreparationRuns() {
  const rows = await db.preparationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30, select: { id: true, status: true, limit: true, startedAt: true } })
  return <main><h1>Preparation runs</h1><p>Choose a run to review its cohort, source gaps and manual tasks. Preparation ends at human review.</p>
    <p>Start explicitly from the command line with a campaign: <code>npm run outreach:prepare -- --limit 20 --campaign your-campaign</code>.</p>
    <p>Automatic research and writing are paused pending isolation verification. No work runs when opening this page.</p>
    <ul>{rows.map(r => <li key={r.id}><Link href={`/preparation/${r.id}`}>{r.id}</Link> · {r.status} · target {r.limit} · {r.startedAt.toISOString()}</li>)}</ul>
    {!rows.length && <p>No preparation runs yet.</p>}<Link href="/outreach">Outreach review queue</Link></main>
}
