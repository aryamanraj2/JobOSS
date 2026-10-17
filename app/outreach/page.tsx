import { db } from '../lib/db.js'
import { outreachReviewQueue } from '../../src/outreach/review/queue.js'
import styles from './review.module.css'
import { ReviewCard } from './review.js'
export const dynamic = 'force-dynamic'
export default async function OutreachPage() {
  const rows = await outreachReviewQueue(db)
  return <main>{process.env.JOBOSS_D_SYNTHETIC_PREVIEW === '1' && <div className="warnbox">Synthetic demonstration · Dedicated D test database · No real cohort or live approvals.</div>}<h1>People, drafts and review</h1><p><a href="/preparation">Preparation runs and manual tasks</a></p><p className="note">Review the person, the evidence and one exact email. Speculative inquiries do not imply a vacancy.</p>
    <div className="warnbox">Automatic research and drafting are paused pending isolation verification. Manual tasks remain available. Sending is disabled.</div>
    <div className="queues">{(['pending', 'blocked', 'ready'] as const).map((state) => <div className="queue" key={state}><div className="n">{rows.filter((r) => r.state === state).length}</div><div className="l">{state === 'ready' ? 'Ready for review' : state === 'pending' ? 'Pending' : 'Needs attention'}</div></div>)}</div>
    {rows.length ? <div className={styles.queue}>{rows.map((row) => <ReviewCard row={row} key={row.draft.id} />)}</div> : <p>No @5 revisions yet. Prepare selected companies to start this queue.</p>}
    <p className="note">Showing up to 20 most recent revisions. Existing earlier drafts remain preserved.</p></main>
}
