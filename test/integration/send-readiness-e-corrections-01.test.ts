/** RE-01: synthetic manual-semantic @5 approval, actual guarded B, fake mail only. */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { truncateAll, closeTestDb } from '../helpers/db.js'
import { configuredTestTarget, verifyTestTarget } from '../helpers/test-target.js'
import { approvedEWorld, type EWorld } from '../fixtures/send-readiness-e/world.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { supportSnapshot } from '../../src/outreach/review/snapshot.js'
import { tryReadinessReservation } from '../../src/outreach/send/readiness-boundary.js'
import { sendApprovedDraft } from '../../src/outreach/send/send.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import type { SendOutcome } from '../../src/outreach/send/send.js'
import type { Db } from '../../src/core/audit/audit-log.js'

const dir = `scratch/joboss-e-send-readiness-corrections-01-tests-${randomUUID()}`
mkdirSync(dir, { recursive: true })
const record = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2) + '\n')
const protectedTables = ['draft', 'company', 'evidence', 'approved_claim', 'contact', 'contact_research', 'resume_version', 'role_track',
  'candidate_profile', 'lead', 'opportunity', 'outreach_assessment', 'funding_record', 'suppression', 'send_attempt', 'llm_task',
  'audit_log', 'kill_switch', 'bounce', 'reply', 'opt_out']
beforeEach(truncateAll)
afterEach(() => vi.restoreAllMocks())
afterAll(closeTestDb)
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
async function bounded<T>(p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('RE-01 did not return busy while company row remained held')), 2500) })]) }
  finally { clearTimeout(timer) }
}
async function connection() {
  const target = configuredTestTarget(); expect(target.database).toBe('outreach_test_joboss_b'); await verifyTestTarget(target)
  const c = new Client({ connectionString: target.url }); await c.connect()
  await c.query("SET statement_timeout = '8000ms'")
  const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  return { c, pid }
}
async function inputs(w: EWorld) {
  return { draft: await w.db.draft.findUniqueOrThrow({ where: { id: w.draftId } }),
    support: await supportSnapshot(w.db, w.draftId), tasks: await w.db.llmTask.findMany({ orderBy: { id: 'asc' } }),
    approval: await w.db.auditLog.findMany({ where: { subjectId: w.draftId }, orderBy: { id: 'asc' } }) }
}
async function independentLocks(c: Client) {
  await c.query('BEGIN')
  try {
    const advisories = (await c.query(`SELECT pg_try_advisory_xact_lock(741609,4) AS d,
      pg_try_advisory_xact_lock(hashtextextended('outreach-send-reservation',0)) AS b`)).rows[0]
    expect(advisories).toEqual({ d: true, b: true })
    await c.query('LOCK TABLE audit_log IN ROW EXCLUSIVE MODE NOWAIT')
    return { ...advisories, auditWriteIntent: true }
  } finally { await c.query('ROLLBACK') }
}

// This test observes both a safe refusal and, before correction, the exact blocked
// query for diagnosis. The timeout is a failing safety assertion, never lock proof.
// Cleanup releases the holder before awaiting a potentially blocked send.
describe('RE-01 company FK target is acquired before readiness', () => {
  it.each(['before-invocation', 'after-preflight'] as const)('%s holder yields busy, rolls back, then the same approval sends once after release', async phase => {
    const w = await approvedEWorld(), holder = await connection(), monitor = await connection(), mail = new FakeMailProvider()
    const before = await inputs(w); const callback = vi.fn(evaluateOutreachReadiness)
    let held = false; let holderObservation: unknown; let settled = false; let result: SendOutcome | undefined
    const hold = async () => {
      await holder.c.query('BEGIN'); held = true
      await holder.c.query('SELECT id FROM company WHERE id=$1 FOR UPDATE', [w.company.id])
      holderObservation = (await monitor.c.query(`SELECT a.pid,a.state,a.query,l.mode FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid
        WHERE a.pid=$1 AND l.relation='company'::regclass AND l.granted`, [holder.pid])).rows
      expect(holderObservation).toEqual(expect.arrayContaining([expect.objectContaining({ pid: holder.pid, state: 'idle in transaction', mode: 'RowShareLock' })]))
    }
    if (phase === 'before-invocation') await hold()
    const page = mail.listInboxPage.bind(mail)
    const inbox = vi.spyOn(mail, 'listInboxPage').mockImplementation(async (...args) => {
      if (phase === 'after-preflight' && !held) {
        // Actual independent acquisition proves that preflight released its locks.
        const preflightReleased = await independentLocks(monitor.c)
        const locks = (await monitor.c.query(`SELECT locktype,mode FROM pg_locks WHERE pid <> pg_backend_pid() AND granted AND
          (locktype='advisory' OR mode IN ('ShareLock','ShareRowExclusiveLock'))`)).rows
        expect(locks).toEqual([]); record('preflight-released', { preflightReleased, locks })
        await hold()
      }
      return page(...args)
    })
    const sending = sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: callback }).then(value => {
      settled = true; result = value; return value
    })
    try {
      try { result = await bounded(sending) }
      catch (error) {
        const blocked = (await monitor.c.query(`SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,left(query,180) AS query
          FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))`, [holder.pid])).rows
        record(`red-${phase}`, { error: String(error), holderPid: holder.pid, holderObservation, settled, callbackCalls: callback.mock.calls.length, blocked })
        throw error
      }
      expect(held).toBe(true); expect(settled).toBe(true)
      expect(result).toMatchObject({ status: 'refused', reason: 'weak_evidence', detail: expect.stringMatching(/busy.*retry/i) })
      expect(callback).not.toHaveBeenCalled(); expect(mail.sendCalls).toBe(0); expect(await w.db.sendAttempt.count()).toBe(0)
      expect(await inputs(w)).toEqual(before)
      const available = await independentLocks(monitor.c)
      expect(inbox.mock.calls.length).toBe(phase === 'before-invocation' ? 0 : 1)
      record(`busy-${phase}`, { result, holderPid: holder.pid, holderObservation, available, callbackCalls: callback.mock.calls.length, attempts: 0, inputsUnchanged: true })
    } finally {
      if (held) await holder.c.query('ROLLBACK')
      try { await sending } finally { await holder.c.end(); await monitor.c.end() }
    }
    // This uses the same exact approved fixture, no support refresh/reapproval.
    const sent = await sendApprovedDraft(w.db, mail, w.draftId, w.opts)
    expect(sent).toMatchObject({ status: 'sent', reconciled: false }); expect(mail.sendCalls).toBe(1)
    expect(await w.db.sendAttempt.count()).toBe(1); record(`success-after-release-${phase}`, sent)
  })

  it('company NOWAIT failure releases the entire enclosing savepoint while the outer transaction stays usable', async () => {
    const w = await approvedEWorld(), holder = await connection(), monitor = await connection()
    await holder.c.query('BEGIN'); await holder.c.query('SELECT id FROM company WHERE id=$1 FOR UPDATE', [w.company.id])
    try {
      await w.db.$transaction(async tx => {
        const ok = await tryReadinessReservation(tx, w.draftId)
        const residue = await tx.$queryRaw<{ locktype: string; relation: string | null; mode: string }[]>`
          SELECT locktype,relation::regclass::text AS relation,mode FROM pg_locks WHERE pid=pg_backend_pid() AND granted
          AND (locktype='advisory' OR relation::regclass::text=ANY(${protectedTables}))`
        const available = await independentLocks(monitor.c)
        const usable = await tx.$queryRaw`SELECT 1 AS usable`
        record('company-savepoint-rollback', { ok, holderPid: holder.pid, residue, available, usable })
        expect(ok).toBe(false); expect(residue).toEqual([]); expect(usable).toEqual([{ usable: 1 }])
      }, { isolationLevel: 'ReadCommitted' })
    } finally { await holder.c.query('ROLLBACK'); await holder.c.end(); await monitor.c.end() }
  })

  it('successful final boundary holds the company FK row through commit, with committed reservation visible before fake transport', async () => {
    const w = await approvedEWorld(), contender = await connection(), monitor = await connection(), mail = new FakeMailProvider()
    const entered = deferred(), resume = deferred(); let reservationPid = 0
    const callback = vi.fn(async (tx: Db, id: string, now: Date) => {
      reservationPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid
      const ready = await evaluateOutreachReadiness(tx, id, now); expect(ready.ready).toBe(true)
      entered.resolve(); await resume.promise; return ready
    })
    const send = mail.send.bind(mail)
    vi.spyOn(mail, 'send').mockImplementation(async (...args) => {
      const attempts = (await monitor.c.query('SELECT status FROM send_attempt WHERE draft_id=$1', [w.draftId])).rows
      const draft = (await monitor.c.query('SELECT status FROM draft WHERE id=$1', [w.draftId])).rows
      const held = (await monitor.c.query(`SELECT locktype,mode FROM pg_locks WHERE pid=$1 AND granted
        AND (locktype='advisory' OR mode IN ('ShareLock','ShareRowExclusiveLock'))`, [reservationPid])).rows
      expect(attempts).toEqual([{ status: 'in_flight' }]); expect(draft).toEqual([{ status: 'sending' }]); expect(held).toEqual([])
      record('company-commit-before-fake-transport', { reservationPid, attempts, draft, held }); return send(...args)
    })
    const sending = sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: callback })
    try {
      await bounded(entered.promise)
      const locks = (await monitor.c.query(`SELECT locktype,relation::regclass::text AS relation,mode FROM pg_locks WHERE pid=$1 AND granted
        AND (locktype='advisory' OR relation='company'::regclass)`, [reservationPid])).rows
      expect(locks.filter(l => l.locktype === 'advisory')).toHaveLength(2)
      await contender.c.query('BEGIN')
      let code: string | undefined
      try { await contender.c.query('SELECT id FROM company WHERE id=$1 FOR UPDATE NOWAIT', [w.company.id]) }
      catch (error) { code = (error as { code?: string }).code }
      finally { await contender.c.query('ROLLBACK') }
      record('company-fk-protected', { reservationPid, contenderPid: contender.pid, code: code ?? 'acquired', locks })
      expect(code).toBe('55P03')
      // KEY SHARE is deliberately weaker than UPDATE: compatible row readers can
      // still take NO KEY UPDATE without changing any company data.
      await contender.c.query('BEGIN')
      try { await contender.c.query('SELECT id FROM company WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [w.company.id]) }
      finally { await contender.c.query('ROLLBACK') }
      resume.resolve(); expect(await sending).toMatchObject({ status: 'sent', reconciled: false })
      expect(callback).toHaveBeenCalledOnce(); expect(mail.sendCalls).toBe(1)
      expect(await w.db.sendAttempt.count()).toBe(1)
    } finally { resume.resolve(); await sending; await contender.c.end(); await monitor.c.end() }
  })
})
