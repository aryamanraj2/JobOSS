import { notFound } from 'next/navigation'
import { db } from '../../lib/db.js'
import { outreachReview } from '../../../src/outreach/review/queue.js'
import { ReviewCard } from '../review.js'
export const dynamic = 'force-dynamic'
export default async function OutreachDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ message?: string; result?: string }> }) {
  const { id } = await params, query = await searchParams
  const row = await outreachReview(db, id)
  if (!row) notFound()
  return <main>{process.env.JOBOSS_D_SYNTHETIC_PREVIEW === '1' && <div className="warnbox">Synthetic demonstration · Dedicated D test database · No real cohort or live approvals.</div>}<p><a href="/outreach">← All outreach drafts</a></p>{query.message && <p role="status" className={query.result === 'ok' ? 'h8' : 'warnbox'}>{query.message}</p>}<ReviewCard row={row} detailed /></main>
}
