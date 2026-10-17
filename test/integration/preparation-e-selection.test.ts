import { afterAll, beforeEach, expect, it } from 'vitest'
import { truncateAll, closeTestDb } from '../helpers/db.js'
import { dWorld, NOW } from '../fixtures/joboss-d/world.js'
import { prepareOutreachDrafts } from '../../src/outreach/draft/prepare.js'
import { roleFingerprint } from '../../src/outreach/preparation/selection.js'
import { Client } from 'pg'
import type { Db } from '../../src/core/audit/audit-log.js'
import { configuredTestTarget } from '../helpers/test-target.js'
import { approvedEWorld } from '../fixtures/send-readiness-e/world.js'
import { revokeApproval } from '../../src/outreach/draft/approve.js'
beforeEach(truncateAll)
afterAll(closeTestDb)
it('E listed selection creates only its exact minimal listed association when no campaign association exists', async () => {
  const w = await dWorld({ listed: true, withLead: false })
  const role = await w.db.opportunity.findFirstOrThrow({ where: { companyId: w.company.id } })
  const options = { companyIds: [w.company.id], limit: 1, campaignCycle: '2026-10', now: NOW,
    preparationSelection: { companyId: w.company.id, campaignCycle: '2026-10', intent: 'listed' as const,
      opportunityId: role.id, roleHash: roleFingerprint(role), contactId: w.contact.id } }
  const result = await prepareOutreachDrafts(w.db, options)
  expect(result.draftIds).toHaveLength(1)
  const lead = await w.db.lead.findFirstOrThrow({ where: { companyId: w.company.id } })
  expect(lead).toMatchObject({ leadKind: 'posted_role', opportunityId: role.id, campaignCycle: '2026-10', score: null, scoreVersionId: null })
})
it('E listed selection cannot silently reuse an existing speculative association or mutate its history', async () => {
  const w = await dWorld({ listed: true })
  await w.db.lead.update({ where: { id: w.lead!.id }, data: { leadKind: 'speculative', opportunityId: null } })
  const before = await w.db.lead.findUniqueOrThrow({ where: { id: w.lead!.id } })
  const role = await w.db.opportunity.findFirstOrThrow({ where: { companyId: w.company.id } })
  const options = { companyIds: [w.company.id], limit: 1, campaignCycle: '2026-10', now: NOW,
    preparationSelection: { companyId: w.company.id, campaignCycle: '2026-10', intent: 'listed' as const,
      opportunityId: role.id, roleHash: roleFingerprint(role), contactId: w.contact.id } }
  const result = await prepareOutreachDrafts(w.db, options)
  expect(result.draftIds).toEqual([]); expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'preparation_selection_conflict' })]))
  expect(await w.db.lead.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
  expect(await w.db.draft.count()).toBe(0)
})
it.each(['missing_campaign','foreign_role','changed_role','missing_association'])('E exact selection %s blocks atomically without history rewriting',async kind=>{
  const w=await dWorld({listed:true}),role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id}})
  const selection={companyId:w.company.id,campaignCycle:'2026-10',intent:'listed' as const,opportunityId:role.id,roleHash:roleFingerprint(role),contactId:w.contact.id,...(kind==='missing_association'?{associationId:'absent'}:{})}
  if(kind==='foreign_role')selection.opportunityId='foreign'
  if(kind==='changed_role')await w.db.opportunity.update({where:{id:role.id},data:{title:'Changed after selection'}})
  const before=await w.db.lead.findMany()
  const out=await prepareOutreachDrafts(w.db,{companyIds:[w.company.id],limit:1,now:NOW,...(kind==='missing_campaign'?{}:{campaignCycle:'2026-10'}),preparationSelection:selection})
  expect(out.draftIds).toEqual([]);expect(out.blockers.length).toBeGreaterThan(0);expect(await w.db.lead.findMany()).toEqual(before);expect(await w.db.llmTask.count()).toBe(0)
})
it('E company NOWAIT contention releases the selection savepoint cleanly, with no partial association or draft',async()=>{
  const {Client}=await import('pg'),{configuredTestTarget}=await import('../helpers/test-target.js')
  const w=await dWorld({listed:true,withLead:false}),role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id}})
  const holder=new Client({connectionString:configuredTestTarget().url});await holder.connect();await holder.query('BEGIN')
  try{
    const held=await holder.query('SELECT id,pg_backend_pid() AS pid FROM company WHERE id=$1 FOR UPDATE',[w.company.id])
    const out=await prepareOutreachDrafts(w.db,{companyIds:[w.company.id],limit:1,now:NOW,campaignCycle:'2026-10',preparationSelection:{companyId:w.company.id,campaignCycle:'2026-10',intent:'listed',opportunityId:role.id,roleHash:roleFingerprint(role),contactId:w.contact.id}})
    expect(out.blockers[0]?.reason).toBe('preparation_inputs_busy');expect(await w.db.lead.count()).toBe(0);expect(await w.db.draft.count()).toBe(0)
    expect((await w.db.$queryRaw<{n:number}[]>`SELECT 1::int AS n`)[0]?.n).toBe(1)
    console.log('E selection holder PID',held.rows[0].pid)
  }finally{await holder.query('ROLLBACK');await holder.end()}
})
// Corrections01 RP-02 controls: independent clients; proof is pg_blocking_pids/SQLSTATE, never a sleep.
async function pg(){const c=new Client({connectionString:configuredTestTarget().url});await c.connect();await c.query("SET statement_timeout='20000ms'");return{c,pid:(await c.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid}}
const waiters=async(monitor:Client,blocker:number)=>(await monitor.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers,left(query,120) AS query FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))',[blocker])).rows
const sqlState=(e:unknown)=>{const s=String(e instanceof Error?`${e.message} ${JSON.stringify((e as {meta?:unknown}).meta??'')}`:e);return /40P01|deadlock/i.test(s)?'40P01':/55P03/.test(s)?'55P03':s.slice(0,200)}
/** D's settled result, or the first observed blocking wait of D's backend on the holder. */
async function busyOrWait<T>(p:Promise<T>,monitor:Client,holder:number){
  let done=false;const settled=p.then(result=>{done=true;return{result}},error=>{done=true;return{error:sqlState(error)}})
  const watch=(async()=>{for(let i=0;i<800&&!done;i++){const rows=await waiters(monitor,holder);if(rows.length)return{waited:rows};await new Promise(r=>setTimeout(r,25))}return settled})()
  return Promise.race([settled,watch])
}
const reasons=(o:object)=>'result' in o?(o.result as {blockers:{reason:string}[]}).blockers.map(b=>b.reason):[]
async function speculative(w:{db:Db;company:{id:string};contact:{id:string}}){const lead=await w.db.lead.findFirstOrThrow({where:{companyId:w.company.id}})
  return{companyIds:[w.company.id],limit:1,now:NOW,campaignCycle:lead.campaignCycle,preparationSelection:{companyId:w.company.id,campaignCycle:lead.campaignCycle,intent:'speculative' as const,opportunityId:null,roleHash:null,contactId:w.contact.id,associationId:lead.id}}}
it('E corrections01 RP-02a campaign draft row holder gives preparation_inputs_busy; an independent audit writer is not held behind it',async()=>{
  const w=await approvedEWorld(),holder=await pg(),monitor=await pg(),writer=await pg(),before=await w.db.draft.findMany({orderBy:{id:'asc'}})
  await holder.c.query('BEGIN');await holder.c.query('SELECT id FROM draft WHERE id=$1 FOR UPDATE',[w.draftId])
  const preparing=prepareOutreachDrafts(w.db,await speculative(w))
  const audit=writer.c.query("INSERT INTO audit_log (id,actor_type,actor_id,action,subject_type,subject_id,metadata) VALUES (gen_random_uuid()::text,'system','e-c01','e.c01.probe','Probe','p','{}')").then(()=>'inserted',e=>sqlState(e))
  try{
    const outcome=await busyOrWait(preparing,monitor.c,holder.pid)
    const auditOutcome='waited' in outcome?'not_reached':await audit,stillHeld=(await monitor.c.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND relation='draft'::regclass AND granted",[holder.pid])).rows[0].n
    console.log('E corrections01 RP-02a',JSON.stringify({holderPid:holder.pid,outcome,auditOutcome,stillHeld}))
    expect(outcome).not.toHaveProperty('waited');expect(reasons(outcome)).toContain('preparation_inputs_busy');expect(auditOutcome).toBe('inserted');expect(stillHeld).toBeGreaterThan(0)
  }finally{await holder.c.query('ROLLBACK');await Promise.allSettled([preparing,audit]);await holder.c.end();await monitor.c.end();await writer.c.end()}
  expect(await w.db.draft.findMany({orderBy:{id:'asc'}})).toEqual(before)
})
it('E corrections01 RP-02b actual revokeApproval paused after its row lock gives busy, then the revoke completes without 40P01',async()=>{
  const w=await approvedEWorld(),monitor=await pg(),paused={} as {resolve:()=>void},go={} as {resolve:()=>void}
  const pausedP=new Promise<void>(r=>{paused.resolve=r}),goP=new Promise<void>(r=>{go.resolve=r});let revokePid=0
  const revoking=w.db.$transaction(async tx=>{
    revokePid=(await tx.$queryRaw<{pid:number}[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid
    const delegate=tx.sendAttempt
    const proxy=new Proxy(tx,{get(t,k){if(k==='sendAttempt')return{findFirst:async(...a:Parameters<typeof delegate.findFirst>)=>{paused.resolve();await goP;return delegate.findFirst(...a)}};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}}) as Db
    return revokeApproval(proxy,w.draftId,'synthetic E corrections01 revoker')
  },{timeout:40_000}).then(v=>({ok:v}),e=>({error:sqlState(e)}))
  let preparing:Promise<unknown>=Promise.resolve()
  try{
    await pausedP
    const p=prepareOutreachDrafts(w.db,await speculative(w));preparing=p
    const outcome=await busyOrWait(p,monitor.c,revokePid)
    go.resolve();const revoke=await revoking,draft=await w.db.draft.findUniqueOrThrow({where:{id:w.draftId},select:{approvedAt:true,status:true}})
    console.log('E corrections01 RP-02b',JSON.stringify({revokePid,outcome,revoke,draft}))
    expect(outcome).not.toHaveProperty('waited');expect(reasons(outcome)).toContain('preparation_inputs_busy')
    expect(revoke).toMatchObject({ok:{ok:true}});expect(draft.approvedAt).toBeNull()
  }finally{go.resolve();await Promise.allSettled([revoking,preparing]);await monitor.c.end()}
})
it('E corrections01 RP-02c resume_version row holder then legacy-reservation send_attempt intent: busy, no 40P01',async()=>{
  const w=await dWorld(),holder=await pg(),monitor=await pg()
  const resume=await w.db.resumeVersion.findFirstOrThrow({where:{label:'iOS / Android — iOS lead'}})
  await holder.c.query('BEGIN');await holder.c.query('SELECT id FROM resume_version WHERE id=$1 FOR UPDATE',[resume.id])
  const preparing=prepareOutreachDrafts(w.db,await speculative({...w,contact:w.contact}))
  try{
    const outcome=await busyOrWait(preparing,monitor.c,holder.pid)
    const intent=await holder.c.query('LOCK TABLE send_attempt IN ROW EXCLUSIVE MODE').then(()=>'acquired',e=>sqlState(e))
    console.log('E corrections01 RP-02c',JSON.stringify({holderPid:holder.pid,outcome,intent}))
    expect(outcome).not.toHaveProperty('waited');expect(reasons(outcome)).toContain('preparation_inputs_busy');expect(intent).toBe('acquired')
  }finally{await holder.c.query('ROLLBACK');await Promise.allSettled([preparing]);await holder.c.end();await monitor.c.end()}
  expect(await w.db.draft.count()).toBe(0)
})
it('E corrections01 RP-02d selected opportunity row holder gives busy with no association or draft',async()=>{
  const w=await dWorld({listed:true,withLead:false}),role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id}}),holder=await pg(),monitor=await pg()
  await holder.c.query('BEGIN');await holder.c.query('SELECT id FROM opportunity WHERE id=$1 FOR UPDATE',[role.id])
  const preparing=prepareOutreachDrafts(w.db,{companyIds:[w.company.id],limit:1,now:NOW,campaignCycle:'2026-10',preparationSelection:{companyId:w.company.id,campaignCycle:'2026-10',intent:'listed',opportunityId:role.id,roleHash:roleFingerprint(role),contactId:w.contact.id}})
  try{
    const outcome=await busyOrWait(preparing,monitor.c,holder.pid)
    console.log('E corrections01 RP-02d',JSON.stringify({holderPid:holder.pid,outcome}))
    expect(outcome).not.toHaveProperty('waited');expect(reasons(outcome)).toContain('preparation_inputs_busy')
  }finally{await holder.c.query('ROLLBACK');await Promise.allSettled([preparing]);await holder.c.end();await monitor.c.end()}
  expect([await w.db.lead.count(),await w.db.draft.count(),await w.db.llmTask.count()]).toEqual([0,0,0])
})
it.each(['lock_timeout','deadlock'])('E corrections01 RP-02 backstop: a residual %s inside the opt-in transaction maps to busy with nothing committed',runBackstop)
it('E corrections02 RPC-03 real deadlock loop exercises ten holder-victim outcomes',async()=>{for(let i=0;i<10;i++){await truncateAll();await runBackstop('deadlock_holder');console.log('E c02 deadlock iteration',i+1)}},120_000)
async function runBackstop(kind:string){
  const w=await dWorld(),holder=await pg(),monitor=await pg(),claim=await w.db.approvedClaim.findFirstOrThrow({where:{isActive:true}}),seen:string[]=[]
  const proxy=new Proxy(w.db,{get(t,k){
    if(k==='$transaction')return(fn:unknown,opts?:object)=>typeof fn==='function'?t.$transaction(async tx=>{if(kind==='deadlock_holder')await tx.$executeRaw`SET LOCAL deadlock_timeout='10s'`;const r=await (fn as (tx:Db)=>Promise<unknown>)(tx)
      seen.push((await tx.$queryRaw<{lock_timeout:string}[]>`SHOW lock_timeout`)[0]!.lock_timeout)
      await tx.$queryRaw`SELECT id FROM approved_claim WHERE id=${claim.id} FOR UPDATE`;return r},opts as never):t.$transaction(fn as never,opts as never)
    const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}}) as Db
  await holder.c.query('BEGIN');await holder.c.query('SELECT id FROM approved_claim WHERE id=$1 FOR UPDATE',[claim.id])
  if(kind==='deadlock_holder')await holder.c.query("SET LOCAL deadlock_timeout='10ms'")
  const preparing=prepareOutreachDrafts(proxy,await speculative({...w,contact:w.contact}))
  let escalation='none',committed=false
  try{
    if(kind.startsWith('deadlock')){const rows=await (async()=>{for(let i=0;i<400;i++){const r=await waiters(monitor.c,holder.pid);if(r.length)return r;await new Promise(x=>setTimeout(x,25))}return[]})();expect(rows).toHaveLength(1)
      escalation=await holder.c.query('LOCK TABLE audit_log IN ROW EXCLUSIVE MODE').then(()=>'acquired',e=>sqlState(e))}
    // The residual wait itself is expected; the backstop must end it while the holder still holds.
    const waited=kind==='lock_timeout'?await (async()=>{for(let i=0;i<400;i++){const r=await waiters(monitor.c,holder.pid);if(r.length)return r;await new Promise(x=>setTimeout(x,25))}return[]})():[]
    const settled=await Promise.race([preparing.then(result=>({result}),error=>({error:sqlState(error)})),new Promise<{unbounded:true}>(r=>setTimeout(()=>r({unbounded:true}),10_000))])
    const stillHeld=(await monitor.c.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND relation='approved_claim'::regclass AND granted",[holder.pid])).rows[0].n
    console.log('E corrections01 RP-02 backstop',JSON.stringify({kind,seen,escalation,waited,settled,stillHeld}))
    expect(settled).toHaveProperty('result');expect(seen).toEqual(['2s'])
    committed=escalation==='40P01'
    if(committed){expect(kind.startsWith('deadlock')).toBe(true);expect(reasons(settled)).not.toContain('preparation_inputs_busy');expect((settled as {result:{draftIds:string[]}}).result.draftIds).toHaveLength(1)}
    else{expect(reasons(settled)).toEqual(['preparation_inputs_busy']);expect(stillHeld).toBeGreaterThan(0);if(kind.startsWith('deadlock'))expect(escalation).toBe('acquired')}
    if(kind==='lock_timeout')expect(waited).toHaveLength(1)
  }finally{await holder.c.query('ROLLBACK');await Promise.allSettled([preparing]);await holder.c.end();await monitor.c.end()}
  expect([await w.db.draft.count(),await w.db.llmTask.count()]).toEqual(committed?[1,1]:[0,0])
}
it('E corrections01 RP-02e default D callers keep their unchanged blocking wait and no lock_timeout',async()=>{
  const w=await dWorld(),holder=await pg(),monitor=await pg(),seen:string[]=[]
  const resume=await w.db.resumeVersion.findFirstOrThrow({where:{label:'iOS / Android — iOS lead'}})
  const proxy=new Proxy(w.db,{get(t,k){
    if(k==='$transaction')return(fn:unknown,opts?:object)=>typeof fn==='function'?t.$transaction(async tx=>{seen.push((await tx.$queryRaw<{lock_timeout:string}[]>`SHOW lock_timeout`)[0]!.lock_timeout);return (fn as (tx:Db)=>Promise<unknown>)(tx)},opts as never):t.$transaction(fn as never,opts as never)
    const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v}}) as Db
  await holder.c.query('BEGIN');await holder.c.query('SELECT id FROM resume_version WHERE id=$1 FOR UPDATE',[resume.id])
  const preparing=prepareOutreachDrafts(proxy,{companyIds:[w.company.id],limit:1,now:NOW,campaignCycle:'2026-10'})
  try{
    const outcome=await busyOrWait(preparing,monitor.c,holder.pid)
    expect(outcome).toHaveProperty('waited');await holder.c.query('ROLLBACK')
    const result=await preparing
    console.log('E corrections01 RP-02e',JSON.stringify({outcome,seen,result}))
    expect(result.draftIds).toHaveLength(1);expect(result.blockers.map(b=>b.reason)).not.toContain('preparation_inputs_busy');expect(seen).toEqual(['0'])
  }finally{await holder.c.query('ROLLBACK');await Promise.allSettled([preparing]);await holder.c.end();await monitor.c.end()}
})
it.each([['title',{title:'Changed title'}],['roleUrl',{roleUrl:'https://job-boards.greenhouse.io/acme/jobs/other'}],['description',{description:'Changed body'}],['postedAt',{postedAt:new Date('2026-09-01T00:00:00Z')}],['status',{status:'closed'}],['closedAt',{closedAt:new Date('2026-10-15T00:00:00Z')}],['lastSeenAt bookkeeping',{lastSeenAt:new Date(NOW.getTime()-3600_000)}]] as const)('E corrections01 RP-03 role fingerprint at the seam: %s',async(field,data)=>{
  const w=await dWorld({listed:true,withLead:false}),role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id}}),roleHash=roleFingerprint(role)
  await w.db.opportunity.update({where:{id:role.id},data})
  const out=await prepareOutreachDrafts(w.db,{companyIds:[w.company.id],limit:1,now:NOW,campaignCycle:'2026-10',preparationSelection:{companyId:w.company.id,campaignCycle:'2026-10',intent:'listed',opportunityId:role.id,roleHash,contactId:w.contact.id}})
  if(field==='lastSeenAt bookkeeping'){expect(roleFingerprint(await w.db.opportunity.findUniqueOrThrow({where:{id:role.id}}))).toBe(roleHash);expect(out.draftIds).toHaveLength(1)}
  else{expect(out.draftIds).toEqual([]);expect(out.blockers.map(b=>b.reason)).toContain('preparation_selected_role_changed');expect(await w.db.lead.count()).toBe(0)}
})
