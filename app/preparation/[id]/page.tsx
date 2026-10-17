import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '../../lib/db.js'
import { preparationStatus } from '../../../src/outreach/preparation/status.js'
export const dynamic = 'force-dynamic'
export default async function PreparationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, run = await preparationStatus(db,id)
  if (!run) notFound()
  return <main><Link href="/preparation">← Preparation runs</Link><h1>Preparation {run.id}</h1><p>Status: {run.status}</p>
    <p>No approval or send is performed here. Automatic execution remains paused; manual tasks stay available.</p>
    {run.error ? <p role="alert">{run.error}</p> : <><p>Resume this exact run: <code>{run.resume}</code></p><p>Manual handoff: <code>{run.manual}</code></p>
      <h2>Cohort and dispositions</h2><p>{run.discoveryMessage}</p>{run.checkpoint!.entries.map(e => <section key={e.companyId}><h3>{e.name} {e.selected ? '· selected' : '· outside cohort'}</h3>
        <p>{e.stage} · {e.reason} · priority {e.priority} · {e.intent === 'listed' ? `Listed inquiry: ${e.hints.map(h => h.title).join(', ')}` : 'Speculative availability inquiry'}</p>
        <ul>{e.provenance.map((value,i) => { const p = value as {title?:string;url?:string;raw?:{title?:string;url?:string;applicationUrl?:string}}; const hint=p.raw ?? p; return <li key={i}>{hint.title ?? 'Source hint'} · {hint.url ?? 'Unbound advertised input'}{p.raw?.applicationUrl ? ` · application candidate: ${p.raw.applicationUrl}` : ''}</li> })}</ul>
        {e.opportunityId && <p>Selected role: {e.opportunityId}</p>}<p>{e.blockers.join('; ') || 'No stage blocker recorded.'}</p>
        <p>{e.contactId ? `Selected recipient: ${run.recipients.find(c=>c.id===e.contactId)?.emailNormalized ?? e.contactId}` : 'Recipient research pending'}</p>
        <ul>{e.pages.map(p=><li key={p.url}>{p.url}: {p.status}{p.detail ? ` · ${p.detail}` : ''}</li>)}</ul>
        <ul>{e.draftIds.map(d => <li key={d}><Link href={`/outreach/${d}`}>Review exact draft {d}</Link></li>)}</ul>
        <ul>{run.tasks.filter(t => e.taskIds.includes(t.id)).map(t => <li key={t.id}>{t.kind}: {t.status} · {t.id}</li>)}</ul>
        {run.stopOrphaned.filter(t=>t.companyId===e.companyId).map(t=><p role="alert" key={t.id}>Stop-orphaned: {t.id} · {t.kind} / {t.subjectType}. {run.stopOrphanedInstruction}</p>)}
        {run.ambiguousShared.filter(t=>e.taskIds.includes(t.id)).map(t=><p key={t.id}>ambiguous_shared: {t.id} · {t.kind} / {t.subjectType}. Also recorded in another preparation run; review its ownership before acting. Excluded from this run.</p>)}
      </section>)}<h2>Source coverage and gaps</h2><p>Synthetic/offline progress is not current access or complete coverage.</p>
      <ul>{run.discoveryGaps.map(g=><li key={g.source}>{g.source}: {g.reason} · remaining scope: {String(g.remaining.scope)} · pending records: {String(g.remaining.pendingRecords)} · cursor: {String(g.remaining.cursor)} · {String(g.remaining.requirement)}</li>)}</ul>
      <ul>{run.sources.map(s => <li key={s.runId}>{s.source}: {s.status} · {s.discovered} companies · {String(s.coverage.remainingRequirement ?? s.coverage.reason ?? s.coverage.accessStatus ?? 'Current publisher/access verification remains required.')}{s.errors.length ? ` · ${s.errors.join('; ')}` : ''}</li>)}</ul></>}
  </main>
}
