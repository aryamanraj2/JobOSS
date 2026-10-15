import type { OutreachReview } from '../../src/outreach/review/queue.js'
import { decideOutreach } from './actions.js'

function SourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return <a href={url} rel="noreferrer" target="_blank">{children}</a> } catch { /* Non-web provenance remains visible text. */ }
  return <span>{children}</span>
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
function triggerLabel(value: unknown): string {
  const t = record(value)
  if (t.kind === 'none') return 'No verified recent trigger; use the supported product hook.'
  return [String(t.kind ?? 'Unknown').replaceAll('_', ' '), t.stage, t.date, t.verified ? 'Primary source verified' : 'Needs corroboration'].filter(Boolean).join(' · ')
}
function restrictions(value: unknown): string[] {
  const rows = record(value).restrictions
  return Array.isArray(rows) ? rows.flatMap((r) => typeof record(r).text === 'string' ? [String(record(r).text)] : []) : []
}
export function ReviewCard({ row, detailed = false }: { row: OutreachReview; detailed?: boolean }) {
  return <article className="panel">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
      <div><h2 style={{ marginBottom: 4 }}><a href={`/outreach/${row.draft.id}`}>{row.company.name}</a></h2>
        <p className="note" style={{ marginTop: 0 }}>{row.company.domain} · Revision {row.draft.revision}{row.draft.revisionOfId ? ' · earlier draft preserved' : ''} · {row.intent.kind === 'listed' ? row.intent.supported ? 'Listed role · related internship inquiry' : 'Listed association · role context needs review' : 'Speculative internship inquiry'}</p></div>
      <span className={`tag ${row.state === 'ready' ? 'good' : row.state === 'blocked' ? 'bad' : 'warn'}`}>{row.state === 'ready' ? 'Ready for your review' : row.state === 'pending' ? 'Research or draft pending' : 'Needs attention'}</span>
    </div>
    <p><strong>{row.contact?.contactType.startsWith('named') ? row.recipientVerification.ready ? row.contact.fullName : 'Named contact; identity needs verification' : 'Recruiting inbox'}</strong> · {row.contact?.publicTitle ?? 'No public title'}<br />
      {row.contact?.emailNormalized ?? 'No verified route'} · {row.suitability?.reason ?? 'Recipient research needed'}</p>
    {row.intent.kind === 'listed' && <p><strong>Intended posting: {row.intent.title ?? 'Unavailable'}</strong><br />{row.intent.detail}</p>}
    <p className={row.readiness.ready ? 'h8' : 'warnbox'}>{row.readiness.detail}</p>
    <p><strong>{row.draft.subject ?? 'Subject pending'}</strong>{!detailed && <span className="note"> · Email preview</span>}</p>
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{detailed ? row.draft.bodyText ?? 'Drafting is pending.' : row.draft.bodyText ? `${row.draft.bodyText.slice(0, 360)}${row.draft.bodyText.length > 360 ? '…' : ''}` : 'Drafting is pending.'}</div>
    <p className="note">{row.words}/280 words · {row.draft.resumeVersion ? <SourceLink url={row.draft.resumeVersion.linkUrl}>{row.draft.resumeVersion.label} resume</SourceLink> : 'Matching resume needed'} · {row.draft.status.replaceAll('_', ' ')}</p>
    {detailed ? <>
      <section><h2>Why this company</h2><p>Current fit: {row.assessment?.fit.supported ? 'Supported' : 'Needs evidence'} · {row.assessment?.primaryTrack?.replaceAll('_', ' ') ?? 'Unknown'} · Team size: {String(row.assessment?.fit.teamSize ?? 'Unknown')} (index, unverified)</p>
        <p>Trigger: {triggerLabel(row.assessment?.trigger)}</p><p>Eligibility: international work eligibility, sponsorship and remote arrangements are unconfirmed.</p>
        {restrictions(row.assessment?.eligibility).length ? <ul>{restrictions(row.assessment?.eligibility).map((r) => <li key={r}>{r}</li>)}</ul> : <p className="note">No verified location restrictions recorded. That does not establish eligibility.</p>}
        <p className="note">Fit is recomputed from current sources; source age and excerpts are shown below.</p></section>
      <section><h2>Recipient and route</h2><p>Published route: {row.contact?.discoveryMethod.replaceAll('_', ' ')} · Captured {row.contact?.capturedAt.toISOString()}<br />
        Current identity and route: {row.recipientVerification.ready ? row.research ? 'Verified' : 'Verified recruiting inbox; no named person' : 'Needs verification'} · Last research {row.research?.researchedAt.toISOString() ?? 'Not applicable'}</p>
        {row.contact?.identitySourceUrl && <SourceLink url={row.contact.identitySourceUrl}>Public identity source</SourceLink>}</section>
      <section style={{ marginTop: 22 }}><h2>Claims and source excerpts</h2>
        {row.evidence.map((e) => <div className="evidence" id={`e-${e.id}`} key={e.id}><div className="meta"><SourceLink url={e.sourceUrl}>{e.sourceUrl}</SourceLink><span>{e.ageDays < 0 ? 'Future dated' : `${e.ageDays} days old`} · {e.sourceType.replaceAll('_', ' ')} · {e.contactId ? 'Person bound' : 'Company bound'}</span></div><blockquote>{e.excerpt}</blockquote><small>{e.id}</small></div>)}
        {row.claims.map((c) => <div className="evidence" id={`c-${c.id}`} key={c.id}><div className="meta">Approved candidate claim · {c.key} · {c.isActive ? 'Active' : 'Withdrawn'} · {c.sourceRef}</div><blockquote>{c.text}</blockquote><small>{c.id}</small></div>)}
      </section>
      <section><h2>Sentence support</h2><p className="note">{row.support ? `${row.support.status} · ${row.support.fulfilledBy ?? 'Manual review pending'}` : 'No support review for the current content and evidence.'}</p>
        {row.supportClaims.map((claim, i) => <div className="evidence" key={`${i}-${claim.text}`}><div className="meta"><span className={`tag ${claim.verdict === 'supported' ? 'good' : 'warn'}`}>{claim.verdict}</span><span>{claim.kind === 'hypothetical' ? 'Conditional contribution idea' : claim.kind === 'person' ? 'Person attribution' : claim.kind === 'candidate' ? 'Candidate proof' : 'Company or subject statement'}</span></div><p>{claim.text}</p><p className="note">{claim.reason}</p><div className="meta">{claim.evidenceIds.map((id) => <a key={id} href={`#e-${id}`}>Source excerpt</a>)}{claim.approvedClaimIds.map((id) => <a key={id} href={`#c-${id}`}>Approved claim</a>)}</div></div>)}
        <p className="note">Manual task IDs: {row.tasks.map((t) => `${t.kind}: ${t.id} (${t.status})`).join(' · ') || 'None'}</p></section>
      <section><h2>Limitations and blockers</h2><ul>{row.limitations.map((l) => <li key={l}>{l}</li>)}</ul></section>
      {row.draft.revisionOfId && <p><a href={`/outreach/${row.draft.revisionOfId}`}>Read the preserved earlier revision</a></p>}
      <form action={decideOutreach} className="actions">
        <input type="hidden" name="draftId" value={row.draft.id} /><input type="hidden" name="snapshot" value={row.snapshot} />
        <label>Your name <input name="by" required maxLength={200} autoComplete="name" /></label>
        {row.draft.status === 'approved' ? <button name="decision" value="revoke">Withdraw this approval</button> : <button className="primary" name="decision" value="approve" disabled={!row.readiness.ready || row.draft.status !== 'awaiting_approval'}>Approve this exact email</button>}
      </form><p className="note">One recipient and one frozen email per decision. Source or message changes require a fresh review. Sending stays disabled.</p>
    </> : <a href={`/outreach/${row.draft.id}`}>Review recipient, sources and email →</a>}
  </article>
}
