import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { truncateAll, closeTestDb, testDb } from '../helpers/db.js'
import { configuredTestTarget, verifyTestTarget } from '../helpers/test-target.js'
import { approvedEWorld, NOW, type EWorld } from '../fixtures/send-readiness-e/world.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { sendApprovedDraft } from '../../src/outreach/send/send.js'
import { FakeMailProvider } from '../../src/outreach/mail/fake.js'
import { revokeApproval } from '../../src/outreach/draft/approve.js'
import { createPrismaClient } from '../../src/core/db/client.js'
import { makeSendWorld, sendGateOptions } from '../helpers/send-world.js'
import { tryReviewLocks } from '../../src/outreach/review/locks.js'
import { tryReadinessReservation } from '../../src/outreach/send/readiness-boundary.js'
import { scoreCompanyAndPersist } from '../../src/intel/scoring/run.js'
import * as readiness from '../../src/outreach/review/readiness.js'
import type { Db } from '../../src/core/audit/audit-log.js'

const evidenceDir = `scratch/joboss-e-send-readiness-01-tests-${randomUUID()}`
mkdirSync(evidenceDir, { recursive: true })
const record = (name: string, value: unknown) => writeFileSync(`${evidenceDir}/${name}.json`, JSON.stringify(value, null, 2) + '\n')
beforeEach(truncateAll)
afterEach(() => vi.restoreAllMocks())
afterAll(closeTestDb)
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
async function bounded<T>(p: Promise<T>, ms = 2500): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('E retry-later bound exceeded')), ms) })]) }
  finally { clearTimeout(timer) }
}
async function connection() {
  const target = configuredTestTarget(); expect(target.database).toBe('outreach_test_joboss_b'); await verifyTestTarget(target)
  const c = new Client({ connectionString: target.url }); await c.connect()
  await c.query("SET statement_timeout = '8000ms'")
  const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
  return { c, pid }
}
async function noReservation(w: EWorld, mail: FakeMailProvider) {
  expect(mail.sendCalls).toBe(0); expect(await w.db.sendAttempt.count()).toBe(0)
  expect(await w.db.draft.findUnique({ where: { id: w.draftId } })).toMatchObject({ status: 'approved' })
}

// The SQL writer cases deliberately include non-cited rows and inserts. A list of
// cited IDs or a before/after hash without predicate locks cannot pass these races.
const changes = {
  evidence: (w: EWorld) => ({ sql: 'UPDATE evidence SET content_hash=$1 WHERE id=$2', values: ['withdrawn', w.product.id] }),
  company: (w: EWorld) => ({ sql: "UPDATE company SET display_name='Changed employer' WHERE id=$1", values: [w.company.id] }),
  phantom: (w: EWorld) => ({ sql: `INSERT INTO evidence(id,company_id,source_url,source_type,excerpt,content_hash,observed_at,confidence,fetched_via)
    VALUES ($1,$2,$3,'company_page','Superseding changed source','superseded',$4,0.9,'static_fetch')`,
    values: [`e-${randomUUID()}`, w.company.id, w.product.sourceUrl, new Date(NOW.getTime() + 1000)] }),
  'new-source': (w: EWorld) => ({ sql: `INSERT INTO evidence(id,company_id,source_url,source_type,excerpt,content_hash,observed_at,confidence,fetched_via)
    VALUES ($1,$2,'https://index.example/new','external_source','New unrelated index support','new-source',$3,0.5,'static_fetch')`,
    values: [`e-${randomUUID()}`, w.company.id, NOW] }),
  person: (w: EWorld) => ({ sql: "UPDATE contact_research SET identity_status='unverified' WHERE contact_id=$1", values: [w.contact.id] }),
  claim: (_w: EWorld) => ({ sql: "UPDATE approved_claim SET is_active=false WHERE key='project.saldo.ios'", values: [] }),
  resume: (w: EWorld) => ({ sql: 'UPDATE resume_version SET is_active=false WHERE id=$1', values: [w.resume.id] }),
  assessment: (w: EWorld) => ({ sql: "UPDATE outreach_assessment SET status='stopped' WHERE company_id=$1", values: [w.company.id] }),
  task: (w: EWorld) => ({ sql: "UPDATE llm_task SET status='pending',output=NULL WHERE id=$1", values: [w.support.taskId] }),
  marker: (w: EWorld) => ({ sql: "UPDATE audit_log SET metadata='{}'::jsonb WHERE subject_id=$1 AND action='draft.outreach_snapshot_approved'", values: [w.draftId] }),
  profile: (_w: EWorld) => ({ sql: "UPDATE candidate_profile SET sender_identity='Changed <candidate@example.invalid>'", values: [] }),
  stop: (w: EWorld) => ({ sql: "UPDATE lead SET status='deferred',status_reason='user_paused' WHERE id=$1", values: [w.lead!.id] }),
  suppression: (_w: EWorld) => ({ sql: "INSERT INTO suppression(id,email_hmac,scope,reason_code) VALUES ($1,'synthetic-global','global','opt_out')", values: [`s-${randomUUID()}`] }),
  content: (w: EWorld) => ({ sql: "UPDATE draft SET body_text='Changed unapproved content' WHERE id=$1", values: [w.draftId] }),
} as const
async function change(w: EWorld, key: keyof typeof changes) {
  return changes[key](w)
}

describe('E complete current support through B reservation', () => {
  it('canonical evaluator uses the reservation transaction/time; COMMIT precedes fake transport', async () => {
    const w = await approvedEWorld(); const other = await connection(); const mail = new FakeMailProvider()
    const actualReadiness = readiness.evaluateOutreachReadiness
    const call = vi.spyOn(readiness, 'evaluateOutreachReadiness').mockImplementation(async (tx, id, now) => {
      expect(tx).not.toBe(w.db); expect(id).toBe(w.draftId); expect(now).toEqual(NOW)
      const settings = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`
      expect(settings[0]?.transaction_isolation).toBe('read committed')
      const locks = await tx.$queryRaw<{ relation: string; mode: string }[]>`SELECT relation::regclass::text AS relation, mode FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='relation' AND granted`
      const shared = locks.filter(l => ['ShareLock', 'ShareRowExclusiveLock'].includes(l.mode)).map(l => l.relation)
      expect(shared).toEqual(expect.arrayContaining(['company', 'evidence', 'approved_claim', 'contact', 'contact_research', 'resume_version', 'role_track', 'candidate_profile', 'lead', 'opportunity', 'outreach_assessment', 'funding_record', 'suppression', 'send_attempt', 'llm_task', 'audit_log', 'kill_switch', 'bounce', 'reply', 'opt_out']))
      record('current-complete-locks', { settings, locks })
      const before = await other.c.query('SELECT count(*)::int AS n FROM send_attempt'); expect(before.rows[0].n).toBe(0)
      return actualReadiness(tx, id, now)
    })
    const originalPage = mail.listInboxPage.bind(mail)
    vi.spyOn(mail, 'listInboxPage').mockImplementation(async (...args) => {
      const locks = (await other.c.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=741609 AND objid=4 AND granted")).rows
      expect(locks).toEqual([{ n: 0 }]); record('preflight-released-before-inbox', locks)
      return originalPage(...args)
    })
    const originalSend = mail.send.bind(mail)
    vi.spyOn(mail, 'send').mockImplementation(async (...args) => {
      const attempt = (await other.c.query('SELECT status FROM send_attempt WHERE draft_id=$1', [w.draftId])).rows
      const draft = (await other.c.query('SELECT status FROM draft WHERE id=$1', [w.draftId])).rows
      expect(attempt).toEqual([{ status: 'in_flight' }]); expect(draft).toEqual([{ status: 'sending' }])
      record('committed-before-transport', { attempt, draft }); return originalSend(...args)
    })
    try {
      const result = await sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: call })
      expect(result).toMatchObject({ status: 'sent', reconciled: false }); expect(call).toHaveBeenCalledOnce(); expect(mail.sendCalls).toBe(1)
    } finally { await other.c.end() }
  })

  it.each(Object.keys(changes) as (keyof typeof changes)[])('fresh %s change before locking refuses without reservation', async key => {
    const w = await approvedEWorld(); const { c } = await connection(); const mail = new FakeMailProvider()
    try {
      const q = await change(w, key); const updated = await c.query(q.sql, q.values); expect(updated.rowCount).toBeGreaterThan(0)
      const result = await sendApprovedDraft(w.db, mail, w.draftId, w.opts)
      expect(result.status).toBe('refused'); await noReservation(w, mail); record(`changed-before-${key}`, result)
    } finally { await c.end() }
  })

  it.each(['phantom', 'new-source', 'company', 'person', 'claim', 'resume', 'assessment', 'task', 'marker', 'profile', 'stop', 'suppression', 'content'] as const)(
    'independent %s writer started during validation waits for the reservation COMMIT', async key => {
      const w = await approvedEWorld(); const { c, pid } = await connection(); const entered = deferred(), resume = deferred()
      const mail = new FakeMailProvider(); let transactionPid = 0; let ready = false
      const callback = vi.fn(async (tx: Db, id: string, now: Date) => {
        transactionPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid
        const result = await evaluateOutreachReadiness(tx, id, now); ready = result.ready; entered.resolve(); await resume.promise; return result
      })
      const sending = sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: callback })
      let writing: Promise<unknown> | undefined; let queryDone = false
      try {
        await bounded(entered.promise); expect(ready).toBe(true)
        const q = await change(w, key); writing = c.query(q.sql, q.values).then(r => { queryDone = true; return r })
        // Query start, exact writer PID, and blocker PID prove the wait. Polling is
        // only an observation bound; elapsed time is never used as lock proof.
        let observation: unknown
        await vi.waitFor(async () => {
          const rows = await w.db.$queryRaw<{ pid: number; wait_event_type: string; blockers: number[] }[]>`
            SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${pid}`
          expect(rows[0]?.wait_event_type).toBe('Lock'); expect(rows[0]?.blockers).toContain(transactionPid); expect(queryDone).toBe(false); observation = rows
        }, { timeout: 2000, interval: 10 })
        resume.resolve(); const result = await sending; await writing
        expect(result.status).toBe('sent'); expect(mail.sendCalls).toBe(1); expect(callback).toHaveBeenCalledOnce()
        expect((await w.db.sendAttempt.findFirstOrThrow()).status).toBe('sent')
        record(`waiter-${key}`, { result, observation, transactionPid, writerPid: pid, queryDone })
      } finally { resume.resolve(); await sending; await writing; await c.end() }
    })

  it.each(['D', 'support', 'draft', 'contact-row', 'B', 'kill-switch', 'bounce', 'send-attempt-reader', 'audit-reader', 'draft-reader'] as const)(
    'busy %s inputs refuse promptly with no partial reservation or deadlock', async key => {
      const w = await approvedEWorld(); const { c } = await connection(); const mail = new FakeMailProvider()
      await c.query('BEGIN')
      if (key === 'D') await c.query('SELECT pg_advisory_xact_lock(741609,4)')
      if (key === 'support') await c.query('UPDATE evidence SET content_hash=content_hash WHERE id=$1', [w.product.id])
      if (key === 'draft') await c.query('SELECT id FROM draft WHERE id=$1 FOR UPDATE', [w.draftId])
      if (key === 'contact-row') await c.query('SELECT id FROM contact WHERE id=$1 FOR UPDATE', [w.contact.id])
      if (key === 'B') await c.query("SELECT pg_advisory_xact_lock(hashtextextended('outreach-send-reservation',0))")
      if (key === 'kill-switch') await c.query('LOCK TABLE kill_switch IN ROW EXCLUSIVE MODE')
      if (key === 'bounce') await c.query('LOCK TABLE bounce IN ROW EXCLUSIVE MODE')
      if (key === 'send-attempt-reader') await c.query('LOCK TABLE send_attempt IN SHARE MODE')
      if (key === 'audit-reader') await c.query('LOCK TABLE audit_log IN SHARE MODE')
      if (key === 'draft-reader') await c.query('LOCK TABLE draft IN SHARE MODE')
      const callback = vi.fn(evaluateOutreachReadiness)
      const sending = sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: callback })
      try {
        const result = await bounded(sending); expect(result).toMatchObject({ status: 'refused', detail: expect.stringMatching(/busy.*retry|retry.*busy/i) })
        expect(callback).not.toHaveBeenCalled(); await noReservation(w, mail); record(`busy-${key}`, result)
      } finally { await c.query('ROLLBACK'); await sending; await c.end() }
      expect((await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).status).toBe('sent')
    })

  it('writer commits before acquisition: a busy call then a fresh call refuses the changed support', async () => {
    const w = await approvedEWorld(); const { c } = await connection(); const mail = new FakeMailProvider()
    await c.query('BEGIN'); await c.query('UPDATE evidence SET content_hash=$1 WHERE id=$2', ['writer-won', w.product.id])
    const sending = sendApprovedDraft(w.db, mail, w.draftId, w.opts)
    try { expect(await bounded(sending)).toMatchObject({ status: 'refused', detail: expect.stringMatching(/busy/i) }) }
    finally { await c.query('COMMIT'); await sending; await c.end() }
    expect(await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('since individual approval') })
    await noReservation(w, mail)
  })

  it('reservation first makes the independent revoker wait and refuse send_attempted', async () => {
    const w = await approvedEWorld(); const other = createPrismaClient(configuredTestTarget().url); const entered = deferred(), resume = deferred()
    const mail = new FakeMailProvider()
    const sending = sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: async (tx, id, now) => {
      const result = await evaluateOutreachReadiness(tx, id, now); entered.resolve(); await resume.promise; return result
    } })
    let revoking: ReturnType<typeof revokeApproval> | undefined
    try {
      await bounded(entered.promise); revoking = revokeApproval(other, w.draftId, 'synthetic E revoker')
      await vi.waitFor(async () => {
        const rows = await w.db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM draft WHERE id =%'`
        expect(Number(rows[0]?.n)).toBeGreaterThan(0)
      }, { timeout: 2000, interval: 10 })
      resume.resolve(); expect((await sending).status).toBe('sent'); expect(await revoking).toMatchObject({ ok: false, reason: 'send_attempted' })
    } finally { resume.resolve(); await sending; await revoking; await other.$disconnect() }
  })

  it('missing callback stays fail-closed; standalone transaction callers cannot transport', async () => {
    const w = await approvedEWorld(), mail = new FakeMailProvider()
    const opts = { ...w.opts }; delete opts.evaluateOutreachReadiness
    expect(await sendApprovedDraft(w.db, mail, w.draftId, opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('validator is not integrated') })
    await w.db.$transaction(async tx => {
      expect(await sendApprovedDraft(tx, mail, w.draftId, w.opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('standalone') })
    })
    await noReservation(w, mail)
  })

  it('current exact listed role remains usable with canonical D readiness', async () => {
    const w = await approvedEWorld(true), mail = new FakeMailProvider()
    expect((await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).status).toBe('sent'); expect(mail.sendCalls).toBe(1)
  })

  it('failed acquisition rolls back every E lock/savepoint and leaves the caller transaction usable', async () => {
    const w = await approvedEWorld(); const { c } = await connection()
    await c.query('BEGIN'); await c.query('SELECT id FROM contact WHERE id=$1 FOR UPDATE', [w.contact.id])
    try {
      await w.db.$transaction(async tx => {
        expect(await tryReadinessReservation(tx, w.draftId)).toBe(false)
        const locks = await tx.$queryRaw<{ mode: string; locktype: string }[]>`SELECT mode,locktype FROM pg_locks WHERE pid=pg_backend_pid() AND granted`
        expect(locks.filter(l => l.locktype === 'advisory' || ['ShareLock', 'ShareRowExclusiveLock'].includes(l.mode))).toEqual([])
        expect(await tx.$queryRaw`SELECT 1 AS usable`).toEqual([{ usable: 1 }]); record('rollback-clean', locks)
      }, { isolationLevel: 'ReadCommitted' })
    } finally { await c.query('ROLLBACK'); await c.end() }
  })

  it('real scorer holds its D-first boundary: E yields, scorer preserves history, then E can reserve', async () => {
    const w = await approvedEWorld(); const entered = deferred(), resume = deferred(); let once = false
    const scoringDb = w.db.$extends({ query: { company: { async findUniqueOrThrow({ args, query }) {
      if (!once) { once = true; entered.resolve(); await resume.promise }
      return query(args)
    } } } })
    // Catch the expected protected-history outcome immediately to avoid an unhandled rejection.
    const scoring = scoreCompanyAndPersist(scoringDb as unknown as Db, w.company, { now: NOW }).then(
      value => ({ value }), error => ({ error: error as { outcome: { reason: string } } }))
    const mail = new FakeMailProvider()
    try {
      await bounded(entered.promise)
      expect(await bounded(sendApprovedDraft(w.db, mail, w.draftId, w.opts))).toMatchObject({ status: 'refused', detail: expect.stringMatching(/busy/i) })
      await noReservation(w, mail); resume.resolve()
      expect(await scoring).toMatchObject({ error: { outcome: { reason: 'history_protected' } } })
      expect((await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).status).toBe('sent')
    } finally { resume.resolve(); await scoring }
  })

  it('revocation committed first removes approval and permits no attempt or transport', async () => {
    const w = await approvedEWorld(), mail = new FakeMailProvider()
    expect(await revokeApproval(w.db, w.draftId, 'synthetic E revoke first')).toMatchObject({ ok: true })
    expect(await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).toMatchObject({ status: 'refused', reason: 'approval_hash_mismatch' })
    expect(mail.sendCalls).toBe(0); expect(await w.db.sendAttempt.count()).toBe(0)
  })

  it.each(['stale', 'foreign', 'task-input', 'role', 'ownership'] as const)('current %s support refuses despite unchanged draft text', async key => {
    const w = await approvedEWorld(key === 'role' || key === 'ownership'), mail = new FakeMailProvider()
    const oldText = (await w.db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).bodyText
    if (key === 'stale') await w.db.evidence.update({ where: { id: w.product.id }, data: { observedAt: new Date(NOW.getTime() - 61 * 86400000) } })
    if (key === 'foreign') {
      const foreign = await w.db.company.create({ data: { canonicalDomain: 'foreign-e.example', displayName: 'Foreign E' } })
      await w.db.evidence.update({ where: { id: w.product.id }, data: { companyId: foreign.id } })
    }
    if (key === 'task-input') await w.db.llmTask.update({ where: { id: w.support.taskId }, data: { input: {} } })
    if (key === 'role') await w.db.opportunity.update({ where: { id: w.lead!.opportunityId! }, data: { status: 'closed' } })
    if (key === 'ownership') await w.db.company.update({ where: { id: w.company.id }, data: { atsOwnershipEvidenceId: null } })
    expect((await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).status).toBe('refused')
    await noReservation(w, mail); expect((await w.db.draft.findUniqueOrThrow({ where: { id: w.draftId } })).bodyText).toBe(oldText)
  })

  it.each(['after-protocol-read', 'after-content-snapshot'] as const)('legacy -> @5 at %s never runs readiness outside the support boundary', async when => {
    const db = testDb(), w = await makeSendWorld(db), { c } = await connection(); let once = false; let protocolReads = 0
    const racing = db.$extends({ query: { draft: { async findUnique({ args, query }) {
      const row = await query(args)
      if (args.select?.promptVersion && !args.select?.id) protocolReads++
      if (!once && (when === 'after-protocol-read' ? protocolReads === 2 && args.select?.promptVersion && !args.select?.id : args.include?.resumeVersion)) {
        once = true; await c.query("UPDATE draft SET prompt_version='outreach_draft@5' WHERE id=$1", [w.draftId])
      }
      return row
    } } } })
    const callback = vi.fn(evaluateOutreachReadiness), mail = new FakeMailProvider()
    try {
      expect((await sendApprovedDraft(racing as unknown as Db, mail, w.draftId, sendGateOptions({ evaluateOutreachReadiness: callback }))).status).toBe('refused')
      expect(once).toBe(true); expect(callback).not.toHaveBeenCalled(); expect(mail.sendCalls).toBe(0); expect(await db.sendAttempt.count()).toBe(0)
    } finally { await c.end() }
  })


  it('a complete D review boundary acquired after inbox sync causes final reservation busy, with no callback', async () => {
    const w = await approvedEWorld(), other = createPrismaClient(configuredTestTarget().url), mail = new FakeMailProvider()
    const held = deferred(), resume = deferred(); let reads = 0; let holding: Promise<void> | undefined
    const racing = w.db.$extends({ query: { draft: { async findUnique({ args, query }) {
      const row = await query(args)
      if (args.select?.promptVersion && !args.select?.id && ++reads === 2) {
        holding = other.$transaction(async tx => {
          expect(await tryReviewLocks(tx, w.draftId)).toBe(true); held.resolve(); await resume.promise
        }); await bounded(held.promise)
      }
      return row
    } } } })
    const callback = vi.fn(evaluateOutreachReadiness)
    try {
      expect(await bounded(sendApprovedDraft(racing as unknown as Db, mail, w.draftId, { ...w.opts, evaluateOutreachReadiness: callback }))).toMatchObject({ status: 'refused', detail: expect.stringMatching(/busy/i) })
      expect(callback).not.toHaveBeenCalled(); await noReservation(w, mail)
    } finally { resume.resolve(); await holding; await other.$disconnect() }
  })

  it('B held by an actual paused legacy sender makes E yield without a lock-order cycle', async () => {
    const w = await approvedEWorld(); const legacy = await makeSendWorld(w.db, { domain: 'legacy-e.example', withProfile: false })
    const held = deferred(), resume = deferred(); let once = false
    const racing = w.db.$extends({ query: { draft: { async findUnique({ args, query }) {
      const row = await query(args)
      if (!once && args.select?.id && args.select?.contact && args.select?.leadId) { once = true; held.resolve(); await resume.promise }
      return row
    } } } })
    const legacyMail = new FakeMailProvider(), eMail = new FakeMailProvider()
    const sending = sendApprovedDraft(racing as unknown as Db, legacyMail, legacy.draftId, sendGateOptions({ sendingAccount: 'candidate@example.invalid' }))
    try {
      await bounded(held.promise)
      expect(await bounded(sendApprovedDraft(w.db, eMail, w.draftId, w.opts))).toMatchObject({ status: 'refused', detail: expect.stringMatching(/busy/i) })
      expect(eMail.sendCalls).toBe(0)
      resume.resolve(); expect((await sending).status).toBe('sent'); expect(legacyMail.sendCalls).toBe(1)
      expect(await w.db.sendAttempt.count({ where: { draftId: w.draftId } })).toBe(0)
    } finally { resume.resolve(); await sending }
  })

  it('an existing conflicting attempt with another key refuses the current company/recipient predicate', async () => {
    const w = await approvedEWorld(), mail = new FakeMailProvider()
    await w.db.sendAttempt.create({ data: { draftId: w.draftId, contactId: w.contact.id, companyId: w.company.id,
      campaignCycle: w.lead!.campaignCycle, touchNumber: 1, touchSlot: 0, idempotencyKey: 'other-synthetic-key', rfc822MessageId: '<other-e@owned.example>', status: 'in_flight' } })
    expect(await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).toMatchObject({ status: 'refused', detail: expect.stringContaining('send attempt') })
    expect(mail.sendCalls).toBe(0); expect(await w.db.sendAttempt.count()).toBe(1)
  })

  it.each(['sending-disabled', 'external-recipient'] as const)('%s remains independently blocked with canonical readiness installed', async key => {
    const w = await approvedEWorld(), mail = new FakeMailProvider(), callback = vi.fn(evaluateOutreachReadiness)
    const page = vi.spyOn(mail, 'listInboxPage')
    const opts = { ...w.opts, evaluateOutreachReadiness: callback, ...(key === 'sending-disabled' ? { envFlag: false } : { ownedInboxes: [] }) }
    expect(await sendApprovedDraft(w.db, mail, w.draftId, opts)).toMatchObject({ status: 'refused', reason: key === 'sending-disabled' ? 'sending_disabled' : 'recipient_not_owned' })
    expect(callback).not.toHaveBeenCalled(); if (key === 'sending-disabled') expect(page).not.toHaveBeenCalled()
    await noReservation(w, mail)
  })

  it('in-flight @5 reconciliation runs before readiness and disabled flags, retaining original reservation on misses', async () => {
    const w = await approvedEWorld(), mail = new FakeMailProvider({ preservesMessageId: false, preservesOutreachRef: false })
    mail.failNextSendAmbiguously()
    expect((await sendApprovedDraft(w.db, mail, w.draftId, w.opts)).status).toBe('pending_reconciliation')
    const attempt = await w.db.sendAttempt.findFirstOrThrow(); expect(attempt.status).toBe('in_flight')
    await w.db.evidence.update({ where: { id: w.product.id }, data: { contentHash: 'withdrawn after reservation' } })
    const callback = vi.fn(evaluateOutreachReadiness), lookup = vi.spyOn(mail, 'findByMessageId')
    expect((await sendApprovedDraft(w.db, mail, w.draftId, { ...w.opts, envFlag: false, evaluateOutreachReadiness: callback })).status).toBe('pending_reconciliation')
    expect(lookup).toHaveBeenCalledWith(attempt.rfc822MessageId, { to: w.contact.emailNormalized })
    expect(callback).not.toHaveBeenCalled(); expect(mail.sendCalls).toBe(1)
    expect(await w.db.sendAttempt.findFirstOrThrow()).toEqual(attempt)
  })

})
