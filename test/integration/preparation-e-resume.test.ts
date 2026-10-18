import { afterAll, beforeEach, expect, it } from 'vitest'
import { Client } from 'pg'
import type { Db } from '../../src/core/audit/audit-log.js'
import { truncateAll, closeTestDb } from '../helpers/db.js'
import { configuredTestTarget, verifyTestTarget } from '../helpers/test-target.js'
import { prepWorld, request, clock, NOW } from '../fixtures/preparation-e/world.js'
import { prepareOutreach } from '../../src/outreach/preparation/run.js'
import { preparationStop, guardedCompanyGate } from '../../src/outreach/preparation/stops.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { fetchPage } from '../../src/ingest/fetch-page.js'
import { addRoute } from '../fixtures/preparation-e/world.js'
import { html, org, job } from '../fixtures/discovery-expansion/fixtures.js'
import { boardSnapshot, syntheticJob } from '../fixtures/discovery-support.js'
import { EXPANDED_ROUTES } from '../../src/ingest/discovery/expanded/registry.js'
import { preparationStatus } from '../../src/outreach/preparation/status.js'
const url=()=>configuredTestTarget().url
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return{promise,resolve}}
beforeEach(truncateAll);afterAll(closeTestDb)
it('E session serialization returns busy from an independent client during HTTP with no held transaction or D lock',async()=>{
  const w=await prepWorld(),entered=deferred(),release=deferred(),base=w.gate.fetchText.bind(w.gate)
  w.gate.fetchText=async(u,...args)=>{if(u==='https://acme.example/'){entered.resolve();await release.promise}return base(u,...args)}
  const active=prepareOutreach(w.db,w.gate,url(),request('serialized'),clock)
  await entered.promise
  const observer=new Client({connectionString:url()});await observer.connect()
  try{
    const locks=(await observer.query("SELECT a.pid,a.state,a.xact_start,l.granted FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND l.objid=(hashtextextended($1,17) & 4294967295)::oid AND l.classid=((hashtextextended($1,17) >> 32) & 4294967295)::oid",['preparation:serialized'])).rows
    expect(locks).toHaveLength(1);expect(locks[0]).toMatchObject({granted:true,state:'idle',xact_start:null})
    expect((await observer.query("SELECT count(*)::int AS n FROM discovery_run WHERE coverage->>'batchId'='prep_serialized'")).rows[0].n).toBe(EXPANDED_ROUTES.length)
    const busy=await prepareOutreach(w.db,w.gate,url(),{runId:'serialized',resume:true},clock);expect(busy.status).toBe('busy')
    console.log('E concurrent PG observation',JSON.stringify(locks),JSON.stringify(busy))
  }finally{release.resolve();await active;await observer.end()}
  expect(await w.db.preparationRun.count()).toBe(1);expect(await w.db.draft.count()).toBe(1)
})
it.each(['create','discovery','draft'])('E unknown %s commit acknowledgement resumes exact committed work without a replacement batch/draft',async(stage)=>{
  const w=await prepWorld();let armed=true
  const proxy=new Proxy(w.db,{get(t,k){
    if(k==='preparationRun' && stage==='create')return new Proxy(t.preparationRun,{get(model,key){if(key==='create')return async(...args: Parameters<typeof model.create>)=>{const r=await model.create(...args);if(armed){armed=false;throw new Error('synthetic unknown create acknowledgement')}return r};return Reflect.get(model,key)}})
    if(k==='$transaction' && stage!=='create')return async(...args: Parameters<typeof t.$transaction>)=>{
      const result=await Reflect.apply(t.$transaction,t,args)
      if(armed && (stage==='discovery' && await t.discoveryRun.count()===EXPANDED_ROUTES.length || stage==='draft' && await t.draft.count()>0)){armed=false;throw new Error(`synthetic unknown ${stage} commit acknowledgement`)}return result
    }
    const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value
  }}) as Db
  if(stage==='draft')await prepareOutreach(proxy,w.gate,url(),request(`ack-${stage}`),clock)
  else await expect(prepareOutreach(proxy,w.gate,url(),request(`ack-${stage}`),clock)).rejects.toThrow(`ack-${stage}`)
  const before=await w.db.preparationRun.findUniqueOrThrow({where:{id:`ack-${stage}`}})
  expect(before.checkpoint).toMatchObject({batchId:`prep_ack-${stage}`})
  const recovered=await prepareOutreach(w.db,w.gate,url(),{runId:`ack-${stage}`,resume:true},clock)
  expect(recovered.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('composing')
  expect(await w.db.discoveryRun.count()).toBe(EXPANDED_ROUTES.length);expect(await w.db.draft.count()).toBe(1);expect(await w.db.lead.count()).toBe(1)
})
it('E changed options and malformed/foreign checkpoint fail without overwriting forensic state',async()=>{
  const w=await prepWorld();await prepareOutreach(w.db,w.gate,url(),request('frozen'),clock)
  const row=await w.db.preparationRun.findUniqueOrThrow({where:{id:'frozen'}}),requests=w.gate.requested.length
  await expect(prepareOutreach(w.db,w.gate,url(),{runId:'frozen',resume:true,options:{limit:2}},clock)).rejects.toThrow('Changed frozen')
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'frozen'}})).toEqual(row)
  const c=JSON.parse(JSON.stringify(row.checkpoint));c.entries[0].selected=false
  await w.db.preparationRun.update({where:{id:'frozen'},data:{checkpoint:c}})
  const malformed=await w.db.preparationRun.findUniqueOrThrow({where:{id:'frozen'}})
  await expect(prepareOutreach(w.db,w.gate,url(),{runId:'frozen',resume:true},clock)).rejects.toThrow('Changed frozen candidate')
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'frozen'}})).toEqual(malformed);expect(w.gate.requested.length).toBe(requests)
  await expect(prepareOutreach(w.db,w.gate,url(),{runId:'absent',resume:true},clock)).rejects.toThrow('Unknown preparation')
})
it.each(['company','assessment','lead','contact','suppression'])('E %s stopped at entry does no company HTTP/tasks/drafts and preserves association',async(kind)=>{
  const w=await prepWorld({withLead:true})
  if(kind==='company')await w.db.company.update({where:{id:w.company.id},data:{status:'excluded'}})
  if(kind==='assessment')await w.db.outreachAssessment.create({data:{companyId:w.company.id,status:'stopped',researchPriority:1,blockers:[],citedEvidenceIds:[],assessedAt:NOW}})
  if(kind==='lead')await w.db.lead.update({where:{id:w.lead!.id},data:{status:'deferred'}})
  if(kind==='contact')await w.db.contact.update({where:{id:w.contact.id},data:{status:'suppressed'}})
  // Without a selected marker an unrelated inactive contact is not a company stop.
  if(kind==='contact')await w.db.outreachAssessment.create({data:{companyId:w.company.id,status:'contact_needed',researchPriority:1,blockers:[],citedEvidenceIds:[],assessedAt:NOW,selectedContactId:w.contact.id}})
  if(kind==='suppression')await w.db.suppression.create({data:{scope:'domain',emailHmac:'synthetic-domain',domain:'acme.example',reasonCode:'opt_out'}})
  const before=await w.db.lead.findMany();const result=await prepareOutreach(w.db,w.gate,url(),request(`stop-${kind}`),clock)
  expect(result.checkpoint!.entries.find(e=>e.companyId===w.company.id)).toMatchObject({selected:false,stage:'blocked'})
  expect(w.gate.requested.filter(u=>new URL(u).hostname==='acme.example')).toEqual([])
  expect(await w.db.llmTask.count()).toBe(0);expect(await w.db.draft.count()).toBe(0);expect(await w.db.lead.findMany()).toEqual(before)
})
it('E stop after awaited primary request prevents evidence advancement, recipients, tasks and drafts',async()=>{
  const w=await prepWorld(),base=w.gate.fetchText.bind(w.gate)
  w.gate.fetchText=async(u,...args)=>{const result=await base(u,...args);if(u==='https://acme.example/')await w.db.company.update({where:{id:w.company.id},data:{status:'excluded'}});return result}
  const r=await prepareOutreach(w.db,w.gate,url(),request('after-http'),clock)
  expect(r.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('operator_stopped')
  expect(await w.db.evidence.count({where:{sourceUrl:'https://acme.example/'}})).toBe(0);expect(await w.db.draft.count()).toBe(0);expect(await w.db.llmTask.count()).toBe(0)
})
it('E redirect and internal this.check recheck stops before the next request',async()=>{
  const w=await prepWorld();let stopped=false
  const base=new StubFetcher({'https://acme.example/':{statusCode:302,headers:{location:'/next'},body:''},'https://acme.example/next':{body:'should not fetch'}})
  const readStub=base.fetchText.bind(base);base.fetchText=async(u)=>{const r=await readStub(u);stopped=true;return r}
  const guarded=guardedCompanyGate(base,async()=>{if(stopped)throw new Error('operator_stopped')})
  expect((await fetchPage(guarded,'https://acme.example/')).ok).toBe(false);expect(base.requested).toEqual(['https://acme.example/'])
  const internal={check:async()=>{stopped=true;return {allowed:true as const,rateDelayMs:0}},async fetchText(u:string){await this.check();return readStub(u)}}
  stopped=false;await expect(guardedCompanyGate(internal,async()=>{if(stopped)throw new Error('operator_stopped')}).fetchText('https://acme.example/')).rejects.toThrow('operator_stopped')
  expect(base.requested).toHaveLength(1);expect(await preparationStop(w.db,w.company.id,'2026-10')).toBeNull()
})
it('E current selected contact and closed draft survive resume without network or new work',async()=>{
  const w=await prepWorld();const first=await prepareOutreach(w.db,w.gate,url(),request('closed'),clock),e=first.checkpoint!.entries.find(e=>e.selected)!
  await w.db.draft.update({where:{id:e.draftIds[0]!},data:{status:'closed'}})
  const before=await w.db.draft.findMany(),count=w.gate.requested.length
  const next=await prepareOutreach(w.db,w.gate,url(),{runId:'closed',resume:true},clock)
  expect(next.checkpoint!.entries.find(e=>e.selected)!).toMatchObject({contactId:w.contact.id,blockers:['draft_stopped']})
  expect(await w.db.draft.findMany()).toEqual(before);expect(w.gate.requested.length).toBe(count)
})
it.each([false,true])('E committed primary evidence before lost checkpoint acknowledgement is reconciled without refetch; redirect=%s',async redirect=>{
  const w=await prepWorld();let fail=false
  const capturedUrl=redirect?'https://acme.example/captured':'https://acme.example/'
  if(redirect){w.pages[capturedUrl]=w.pages['https://acme.example/']!;w.pages['https://acme.example/']={body:'',statusCode:302,headers:{location:'/captured'}}}
  const proxy=new Proxy(w.db,{get(t,k){if(k==='preparationRun')return new Proxy(t.preparationRun,{get(model,key){if(key==='updateMany')return async(...args:Parameters<typeof model.updateMany>)=>{
    if(await t.evidence.count({where:{sourceUrl:capturedUrl}})>0){fail=true;throw new Error('synthetic checkpoint unavailable after capture commit')}return model.updateMany(...args)
  };return Reflect.get(model,key)}});const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value}}) as Db
  await expect(prepareOutreach(proxy,w.gate,url(),request('capture-ack'),clock)).rejects.toThrow('capture-ack');expect(fail).toBe(true)
  const row=await w.db.preparationRun.findUniqueOrThrow({where:{id:'capture-ack'}})
  expect(row.checkpoint).toMatchObject({entries:[expect.objectContaining({pages:[expect.objectContaining({status:'planned'})]})]})
  const count=w.gate.requested.filter(u=>u==='https://acme.example/').length
  const resumed=await prepareOutreach(w.db,w.gate,url(),{runId:'capture-ack',resume:true},clock)
  expect(resumed.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('composing')
  expect(w.gate.requested.filter(u=>u==='https://acme.example/')).toHaveLength(count)
})
it('E a stop committed independently immediately before D is enforced in the atomic selection branch',async()=>{
 const w=await prepWorld(),observer=new Client({connectionString:url()});await observer.connect();let stopped=false
 const proxy=new Proxy(w.db,{get(t,k){if(k==='$transaction')return async(...args:Parameters<typeof t.$transaction>)=>{
   const row=await t.preparationRun.findUnique({where:{id:'before-d'}}),c=row?.checkpoint as {entries?:{contactId?:string}[]}|undefined
   if(!stopped && c?.entries?.some(e=>e.contactId)){await observer.query("UPDATE company SET status='excluded' WHERE id=$1",[w.company.id]);stopped=true}
   return Reflect.apply(t.$transaction,t,args)
 };const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value}}) as Db
 try{const r=await prepareOutreach(proxy,w.gate,url(),request('before-d'),clock);expect(stopped).toBe(true);expect(r.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('operator_stopped');expect(await w.db.lead.count()).toBe(0);expect(await w.db.draft.count()).toBe(0)}finally{await observer.end()}
})
it('E lost ownership connection fences a stale in-flight invocation after an independent exact resume',async()=>{
 const w=await prepWorld(),entered=deferred(),release=deferred(),base=w.gate.fetchText.bind(w.gate)
 w.gate.fetchText=async(u,...args)=>{if(u==='https://acme.example/'){entered.resolve();await release.promise}return base(u,...args)}
 const active=prepareOutreach(w.db,w.gate,url(),request('lost-owner'),clock)
 const rejected=expect(active).rejects.toThrow('lost-owner');await entered.promise
 const observer=new Client({connectionString:url()});await observer.connect()
 try{
  const locks=(await observer.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=(hashtextextended($1,17) & 4294967295)::oid AND classid=((hashtextextended($1,17) >> 32) & 4294967295)::oid AND granted",['preparation:lost-owner'])).rows
  expect(locks).toHaveLength(1);expect((await observer.query('SELECT pg_terminate_backend($1) AS terminated',[locks[0].pid])).rows[0].terminated).toBe(true)
  const recovered=await prepareOutreach(w.db,new StubFetcher(w.pages),url(),{runId:'lost-owner',resume:true},clock)
  expect(recovered.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('composing')
  const row=await w.db.preparationRun.findUniqueOrThrow({where:{id:'lost-owner'}}),drafts=await w.db.draft.findMany()
  release.resolve();await rejected
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'lost-owner'}})).toEqual(row);expect(await w.db.draft.findMany()).toEqual(drafts);expect(drafts).toHaveLength(1)
  console.log('E terminated owned-session PID',locks[0].pid)
 }finally{release.resolve();await rejected;await observer.end()}
})
it('E a connection lost immediately before the first owner claim cannot overwrite a completed independent takeover',async()=>{
 const w=await prepWorld(),observer=new Client({connectionString:url()});await observer.connect();let armed=true,claimedCheckpoint:unknown
 const proxy=new Proxy(w.db,{get(t,k){
  if(k==='preparationRun')return new Proxy(t.preparationRun,{get(model,key){const method=Reflect.get(model,key)
   if(key==='update' || key==='updateMany')return async(args:unknown)=>{
    if(armed){
     armed=false
     const locks=(await observer.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=(hashtextextended($1,17) & 4294967295)::oid AND classid=((hashtextextended($1,17) >> 32) & 4294967295)::oid AND granted",['preparation:claim-window'])).rows
     expect(locks).toHaveLength(1);expect((await observer.query('SELECT pg_terminate_backend($1) AS terminated',[locks[0].pid])).rows[0].terminated).toBe(true)
     const takeover=await prepareOutreach(w.db,new StubFetcher(w.pages),url(),{runId:'claim-window',resume:true},clock)
     expect(takeover.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('composing')
     claimedCheckpoint=(await w.db.preparationRun.findUniqueOrThrow({where:{id:'claim-window'}})).checkpoint
     console.log('E first-claim terminated PID',locks[0].pid)
    }
    return Reflect.apply(method,model,[args])
   }
   return method
  }})
  const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value
 }}) as Db
 try{
  await expect(prepareOutreach(proxy,w.gate,url(),request('claim-window'),clock)).rejects.toThrow('claim-window')
  expect(armed).toBe(false)
  expect((await w.db.preparationRun.findUniqueOrThrow({where:{id:'claim-window'}})).checkpoint).toEqual(claimedCheckpoint)
  expect(await w.db.draft.count()).toBe(1)
 }finally{await observer.end()}
})
it('E ownership loss inside X cannot refetch later sources or replace the takeover source checkpoints',async()=>{
 const w=await prepWorld(),entered=deferred(),release=deferred(),base=w.gate.fetchText.bind(w.gate)
 w.gate.fetchText=async(u,...args)=>{if(u==='https://yc-oss.github.io/api/companies/all.json'){entered.resolve();await release.promise}return base(u,...args)}
 const active=prepareOutreach(w.db,w.gate,url(),request('lost-discovery'),clock),rejected=expect(active).rejects.toThrow('lost-discovery');await entered.promise
 const observer=new Client({connectionString:url()});await observer.connect()
 try{
  const locks=(await observer.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=(hashtextextended($1,17) & 4294967295)::oid AND classid=((hashtextextended($1,17) >> 32) & 4294967295)::oid AND granted",['preparation:lost-discovery'])).rows
  expect(locks).toHaveLength(1);await observer.query('SELECT pg_terminate_backend($1)',[locks[0].pid])
  const takeover=await prepareOutreach(w.db,new StubFetcher(w.pages),url(),{runId:'lost-discovery',resume:true},clock)
  expect(takeover.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('composing')
  const sources=await w.db.discoveryRun.findMany({orderBy:{id:'asc'}}),run=await w.db.preparationRun.findUniqueOrThrow({where:{id:'lost-discovery'}})
  release.resolve();await rejected
  expect(w.gate.requested).toEqual(['https://yc-oss.github.io/api/companies/all.json'])
  expect(await w.db.discoveryRun.findMany({orderBy:{id:'asc'}})).toEqual(sources)
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'lost-discovery'}})).toEqual(run);expect(await w.db.draft.count()).toBe(1)
  console.log('E X in-flight terminated PID',locks[0].pid)
 }finally{release.resolve();await rejected;await observer.end()}
})
it('E discovery facade preserves actual standalone/transaction identity and never permits network in an outer transaction',async()=>{
 const w=await prepWorld(),{fencedDiscoveryDb}=await import('../../src/outreach/preparation/discovery-fence.js'),{isStandaloneDatabaseClient}=await import('../../src/core/joboss/database-scope.js'),{prepareDiscovery}=await import('../../src/ingest/discovery/prepare.js')
 await w.db.preparationRun.create({data:{id:'scope',status:'discovery',limit:1,provider:'codex',checkpoint:{owner:'token'}}})
 const facade=fencedDiscoveryDb(w.db,'scope','token',async()=>{})
 expect(isStandaloneDatabaseClient(facade)).toBe(true)
 if(!isStandaloneDatabaseClient(facade))throw new Error('Not a standalone client')
 await facade.$transaction(async tx=>{
  expect(isStandaloneDatabaseClient(tx)).toBe(false)
  expect(()=>fencedDiscoveryDb(tx,'scope','token',async()=>{})).toThrow('standalone')
  await expect(prepareDiscovery(tx,w.gate,{mode:'expanded-v1',runId:'outer',limit:1,now:NOW,delayMs:0})).rejects.toThrow('standalone')
  await expect(prepareOutreach(tx,w.gate,url(),request('outer'),clock)).rejects.toThrow('standalone')
 })
 expect(w.gate.requested).toEqual([]);expect(await w.db.discoveryRun.count()).toBe(0)
})
// Corrections 01 controls (R-E O1/O4/S1 shapes). Written red before the corrections.
it.each(['positive-first-page','low-fit-first-page'])('E corrections01 RP-01 %s: no cohort or company work until bounded discovery finishes, then one complete ranking',async kind=>{
  // SX1 (Part B 4): SPC listing rows bind no identity; Seedcamp carries this paged-directory coverage.
  const w=await prepWorld(),spc=EXPANDED_ROUTES.find(r=>r.id==='seedcamp:companies')!
  // Acme exists on SPC page 2 only: StartupDB/HN stay valid finished sources that emit no Acme.
  for(const key of Object.keys(w.pages)){const u=new URL(key)
    if(u.hostname==='startupdb.com'&&u.pathname.endsWith('/portfolio'))w.pages[key]={body:JSON.stringify({data:[],pagination:{total:0}})}
    if(u.hostname==='hacker-news.firebaseio.com'&&/\/item\/\d+1\.json$/.test(u.pathname))w.pages[key]={body:JSON.stringify({...JSON.parse(String(w.pages[key]!.body)),text:'No company link here.'})}}
  const first=kind==='positive-first-page'?org('Beta','https://beta.example',{description:'Beta builds iOS apps with Swift for clinics.'}):org('Oldco','https://oldco.example',{description:'Oldco sells regional insurance policies.'})
  w.pages[spc.url!]={body:html([first],`<a rel="next" href="${spc.url}?page=2">Next</a>`)};w.pages[`${spc.url}?page=2`]={body:html([org()])}
  const id=`rp01-${kind}`,companyHosts=['acme.example','beta.example','oldco.example']
  const base=w.gate.fetchText.bind(w.gate);let inspected=false
  w.gate.fetchText=async(u:string)=>{if(u===`${spc.url}?page=2`){inspected=true
    expect((await w.db.preparationRun.findUniqueOrThrow({where:{id}})).cohort).toEqual([])
    expect(w.gate.requested.filter(u=>companyHosts.includes(new URL(u).hostname))).toEqual([])
    expect([await w.db.lead.count(),await w.db.llmTask.count(),await w.db.draft.count(),await w.db.outreachAssessment.count()]).toEqual([0,0,0,0])
  }return base(u)}
  const r=await prepareOutreach(w.db,w.gate,url(),{...request(id),options:{...request(id).options,discoveryLimit:1}},clock)
  expect(inspected).toBe(true)
  expect(r.checkpoint!.discoveryFinished).toBe(true)
  const acme=r.checkpoint!.entries.find(e=>e.companyId===w.company.id)!,other=r.checkpoint!.entries.find(e=>e.companyId!==w.company.id)!
  expect(acme).toMatchObject({selected:true,reason:'canonical_bounded_research_priority'})
  expect(other.selected).toBe(false);expect(['outside_target_cohort','zero_or_unsupported_priority']).toContain(other.reason)
  expect(other.priority).toBeLessThan(acme.priority);expect(w.gate.requested).toContain('https://acme.example/')
  expect(w.gate.requested.filter(u=>['beta.example','oldco.example'].includes(new URL(u).hostname))).toEqual([])
  console.log('E corrections01 RP-01',JSON.stringify({kind,discoveryPasses:c02Window(r,spc.id).passes,entries:r.checkpoint!.entries.map(e=>({domain:e.domain,priority:e.priority,selected:e.selected,reason:e.reason,stage:e.stage}))}))
})
it('E corrections01 RP-01 an access-blocked source ends bounded execution as a visible gap, never coverage',async()=>{
  const w=await prepWorld(),spc=EXPANDED_ROUTES.find(r=>r.id==='southparkcommons:companies')!;w.pages[spc.url!]={statusCode:403,body:'forbidden'}
  const r=await prepareOutreach(w.db,w.gate,url(),request('rp01-blocked'),clock),d=r.checkpoint!.discovery as {complete:boolean;sources:{source:string;status:string;coverage:{executionFinished?:boolean;reason?:string}}[]}
  const blocked=d.sources.find(s=>s.source==='southparkcommons:companies')!
  expect(r.checkpoint!.discoveryFinished).toBe(true);expect(blocked.coverage.executionFinished).not.toBe(true);expect(blocked.coverage.reason).toBe('access_blocked');expect(d.complete).toBe(false)
  expect(r.checkpoint!.entries.find(e=>e.selected)).toMatchObject({companyId:w.company.id});expect(r.status).not.toBe('review')
  const status=await preparationStatus(w.db,'rp01-blocked');expect(status!.sources.find(s=>s.source==='southparkcommons:companies')).toMatchObject({status:'paused'})
})
it('E corrections01 RP-01 pre-correction checkpoint version is rejected visibly without modification',async()=>{
  const w=await prepWorld();await prepareOutreach(w.db,w.gate,url(),request('old-version'),clock)
  const row=await w.db.preparationRun.findUniqueOrThrow({where:{id:'old-version'}})
  await w.db.preparationRun.update({where:{id:'old-version'},data:{checkpoint:{...(row.checkpoint as object),version:'preparation-e@1'}}})
  const old=await w.db.preparationRun.findUniqueOrThrow({where:{id:'old-version'}}),requests=w.gate.requested.length
  await expect(prepareOutreach(w.db,w.gate,url(),{runId:'old-version',resume:true},clock)).rejects.toThrow('preparation-e@1')
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'old-version'}})).toEqual(old);expect(w.gate.requested.length).toBe(requests)
  const status=await preparationStatus(w.db,'old-version');expect(status).toMatchObject({status:'invalid_checkpoint'});expect(status!.error).toContain('preparation-e@1')
})
it('E corrections01 RP-03 unchanged ATS re-observation by actual ingestPostings keeps a listed entry bound',async()=>{
  const w=await prepWorld({listed:true});addRoute(w,'seedcamp:talent',true) // SX1 (Part B 8): yc:jobs is never requested
  await boardSnapshot(w.company.id,NOW,[syntheticJob('j1'),syntheticJob('decoy','iOS Engineer Intern')])
  const first=await prepareOutreach(w.db,w.gate,url(),request('rp03-listed'),clock),e=first.checkpoint!.entries.find(e=>e.selected)!
  const role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id,externalId:'j1'}});expect(e).toMatchObject({intent:'listed',opportunityId:role.id})
  const ingest=await boardSnapshot(w.company.id,new Date(NOW.getTime()+3600_000),[syntheticJob('j1'),syntheticJob('decoy','iOS Engineer Intern')])
  const after=await w.db.opportunity.findUniqueOrThrow({where:{id:role.id}})
  expect(ingest.unchanged).toBeGreaterThanOrEqual(1);expect(Object.keys(after).filter(k=>JSON.stringify((after as Record<string,unknown>)[k])!==JSON.stringify((role as Record<string,unknown>)[k])).sort()).toEqual(['lastSeenAt','updatedAt'])
  const resumed=await prepareOutreach(w.db,w.gate,url(),{runId:'rp03-listed',resume:true},{now:()=>new Date(NOW.getTime()+2*3600_000),delayMs:0})
  const entry=resumed.checkpoint!.entries.find(x=>x.selected)!
  expect(entry.blockers).not.toContain('selected_role_changed');expect(entry).toMatchObject({opportunityId:role.id,intent:'listed'});expect(entry.stage).not.toBe('blocked')
})
it('E corrections01 RP-04 stop committed during recipient capture records the helper-created task as stop_orphaned',async()=>{
  const w=await prepWorld();await w.db.contact.update({where:{id:w.contact.id},data:{verified:false}})
  const stopper=new Client({connectionString:url()});await stopper.connect()
  let roots=0,stopAt:Date|null=null,tasksAtStop:string[]=[];const afterStop:string[]=[],base=w.gate.fetchText.bind(w.gate)
  w.gate.fetchText=async(u,...args)=>{
    const host=new URL(u).hostname,root=new URL(u).pathname==='/'
    if(host==='acme.example'&&root)roots++
    if(stopAt)afterStop.push(u)
    else if(host==='acme.example'&&(!root||roots>1)){tasksAtStop=(await w.db.llmTask.findMany({select:{id:true}})).map(t=>t.id);await stopper.query("UPDATE company SET status='excluded' WHERE id=$1",[w.company.id]);stopAt=new Date()}
    return base(u,...args)
  }
  try{
    const r=await prepareOutreach(w.db,w.gate,url(),request('rp04-stop'),clock),e=r.checkpoint!.entries.find(x=>x.selected)!
    const created=(await w.db.llmTask.findMany({where:{id:{notIn:tasksAtStop}},select:{id:true}})).map(t=>t.id).sort()
    expect(stopAt).not.toBeNull();expect(e.blockers).toContain('operator_stopped');expect(created.length).toBeGreaterThan(0)
    expect(e.taskIds).toEqual(expect.arrayContaining(created));expect([...e.orphanedTaskIds].sort()).toEqual(created)
    expect(afterStop).toEqual([]);expect(await w.db.draft.count()).toBe(0)
    const status=await preparationStatus(w.db,'rp04-stop')
    expect(status!.stopOrphaned.map(t=>t.id).sort()).toEqual(created);expect(status!.stopOrphanedInstruction).toMatch(/do not fulfil/i)
    const requests=w.gate.requested.length,again=await prepareOutreach(w.db,w.gate,url(),{runId:'rp04-stop',resume:true},clock)
    expect(w.gate.requested.length).toBe(requests);expect(await w.db.draft.count()).toBe(0)
    expect([...again.checkpoint!.entries.find(x=>x.selected)!.orphanedTaskIds].sort()).toEqual(created)
    expect((await w.db.llmTask.findMany({where:{id:{in:created}}})).every(t=>t.status==='pending')).toBe(true)
    console.log('E corrections01 RP-04',JSON.stringify({stopAt,created,orphaned:e.orphanedTaskIds,afterStop}))
  }finally{await stopper.end()}
})

// Corrections02 desired-result controls, written before production changes. Synthetic B only.
const c02Feed=(n:number,tag='')=>JSON.stringify(Array.from({length:n},(_,i)=>({id:1000+i,name:`Seed ${i}${tag}`,website:`https://seed-${i}.example`,batch:'Winter 2025',team_size:10,status:'Active',one_liner:'Builds iOS apps.'})))
const c02Request=(id:string,passes=3,limit=20)=>({...request(id),options:{...request(id).options,discoveryPasses:passes,discoveryLimit:limit}})
const c02Source=(r:Awaited<ReturnType<typeof prepareOutreach>>,source='yc:companies')=>(r.checkpoint!.discovery as {sources:{source:string;coverage:Record<string,unknown>}[]}).sources.find(s=>s.source===source)!
const c02Window=(r:Awaited<ReturnType<typeof prepareOutreach>>,source='yc:companies')=>c02Source(r,source).coverage.preparationWindow as {passes:number;gap:string|null;ended:boolean}
it.each([1,3])('E corrections02 RPC-01 45-record YC feed passes %s selects the complete window once',async passes=>{
 const w=await prepWorld();w.pages['https://yc-oss.github.io/api/companies/all.json']={body:c02Feed(45)}
 const r=await prepareOutreach(w.db,w.gate,url(),c02Request(`c02-yc-${passes}`,passes) as never,clock)
 expect(r.checkpoint!.discoveryFinished).toBe(true);expect(r.checkpoint!.entries.some(e=>e.selected)).toBe(true)
 expect(c02Window(r)).toMatchObject({passes:passes===1?1:3,gap:passes===1?'discovery_window_exhausted':null,ended:true})
 expect(c02Source(r).coverage.pendingRecords).toBe(passes===1?25:0)
 const snapshot=JSON.stringify(r.checkpoint!.candidateIds),feedCalls=w.gate.requested.filter(u=>u.includes('all.json')).length
 const again=await prepareOutreach(w.db,w.gate,url(),{runId:r.runId,resume:true},clock)
 expect(JSON.stringify(again.checkpoint!.candidateIds)).toBe(snapshot);expect(w.gate.requested.filter(u=>u.includes('all.json')).length).toBe(feedCalls)
 console.log('E c02 YC window',JSON.stringify({passes,candidates:r.checkpoint!.candidateIds.length,window:c02Window(r)}))
})
it('E corrections02 RPC-01 transient pause checkpoints without company work; changed feed ends as a gap on resume',async()=>{
 const w=await prepWorld(),spc=EXPANDED_ROUTES.find(r=>r.id==='southparkcommons:companies')!.url!,base=w.gate.fetchText.bind(w.gate);let pause=true
 w.pages['https://yc-oss.github.io/api/companies/all.json']={body:c02Feed(45)}
 w.gate.fetchText=async(u:string)=>u===spc&&pause?{ok:false as const,reason:'rate_limited' as const}:base(u)
 const first=await prepareOutreach(w.db,w.gate,url(),c02Request('c02-changed') as never,clock)
 expect(first.status).toBe('discovery');expect(first.checkpoint!.entries).toEqual([])
 expect([await w.db.lead.count(),await w.db.llmTask.count(),await w.db.draft.count(),await w.db.outreachAssessment.count()]).toEqual([0,0,0,0]);expect(w.gate.requested).not.toContain('https://acme.example/')
 expect((await preparationStatus(w.db,first.runId)) as object).toMatchObject({discoveryState:'waiting_transient'})
 pause=false;w.pages['https://yc-oss.github.io/api/companies/all.json']={body:c02Feed(45,' renamed')}
 const next=await prepareOutreach(w.db,w.gate,url(),{runId:first.runId,resume:true},clock)
 expect(next.checkpoint!.discoveryFinished).toBe(true);expect(c02Window(next).gap).toBe('changed_feed_hash_new_batch_required')
 expect(next.checkpoint!.entries.some(e=>e.selected)).toBe(true)
})
it.each(['http_404','redirect_cycle','rate_limited'])('E corrections02 RPC-01 %s ends with the exact gap and visible remaining scope',async reason=>{
 const w=await prepWorld(),spc=EXPANDED_ROUTES.find(r=>r.id==='southparkcommons:companies')!.url!,base=w.gate.fetchText.bind(w.gate)
 if(reason==='http_404')delete w.pages[spc]
 if(reason==='redirect_cycle')w.pages[spc]={statusCode:302,body:'',headers:{location:spc}}
 if(reason==='rate_limited')w.gate.fetchText=async(u:string)=>u===spc?{ok:false as const,reason:'rate_limited' as const}:base(u)
 let r=await prepareOutreach(w.db,w.gate,url(),c02Request(`c02-${reason}`) as never,clock)
 if(reason==='rate_limited')for(let i=1;i<3;i++){expect(r.status).toBe('discovery');expect(r.checkpoint!.entries).toEqual([]);r=await prepareOutreach(w.db,w.gate,url(),{runId:r.runId,resume:true},clock)}
 expect(r.checkpoint!.discoveryFinished).toBe(true);expect(c02Window(r,'southparkcommons:companies').gap).toBe(reason==='rate_limited'?'discovery_window_exhausted_transient':reason)
 const status=await preparationStatus(w.db,r.runId) as unknown as {discoveryState:string;discoveryGaps:{source:string;reason:string;remaining:unknown}[]}
 expect(status.discoveryState).toBe('ended_with_gaps');expect(status.discoveryGaps.find(g=>g.source==='southparkcommons:companies')).toMatchObject({reason:reason==='rate_limited'?'discovery_window_exhausted_transient':reason,remaining:expect.anything()})
})
// This control churns X's large coverage/TOAST rows. Finish maintenance here so
// the next unchanged E01 NOWAIT review fixture does not inherit its autovacuum.
async function c03FinishCapMaintenance() {
 const target=configuredTestTarget();expect(target.database).toBe('outreach_test_joboss_b');await verifyTestTarget(target)
 const c=new Client({connectionString:target.url});await c.connect()
 const tables=['discovery_run','company','evidence','company_signal','host_policy','research_budget','audit_log','preparation_run','outreach_assessment','contact','lead','draft','llm_task']
 const started=Date.now();let observations=0
 const activity=async()=>({
  workers:(await c.query("SELECT pid,backend_type,state,left(query,180) AS query FROM pg_stat_activity WHERE datname=current_database() AND backend_type='autovacuum worker'")).rows,
  vacuums:(await c.query("SELECT v.pid,v.relid::regclass::text AS relation,v.phase,a.backend_type FROM pg_stat_progress_vacuum v JOIN pg_stat_activity a USING(pid) WHERE v.datid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND a.backend_type='autovacuum worker'")).rows,
 })
 const snapshot=async()=>({...await activity(),locks:(await c.query(`SELECT a.pid,a.backend_type,a.state,left(a.query,180) AS query,l.relation::regclass::text AS relation,l.mode,l.granted,pg_blocking_pids(a.pid) AS blockers
  FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()`)).rows})
 try{
  expect((await c.query('SELECT current_database() AS name')).rows[0].name).toBe('outreach_test_joboss_b')
  await c.query("SET statement_timeout='180s'")
  await c.query(`VACUUM (ANALYZE) ${tables.join(', ')}`)
  const deadline=Date.now()+180_000
  for(;;){
   const observed=await activity();observations++
   if(!observed.workers.length&&!observed.vacuums.length){console.log('E corrections03 RPD-03 cap maintenance observed idle',JSON.stringify({tables,observations,elapsedMs:Date.now()-started,...observed}));break}
   if(Date.now()>=deadline)throw new Error('Autovacuum did not become idle on guarded B within 180s')
   await new Promise(resolve=>setTimeout(resolve,50))
  }
 }catch(error){const state=await snapshot();throw new Error(`E cap maintenance failed: ${String(error)}; lock/activity snapshot: ${JSON.stringify(state)}`,{cause:error})}
 finally{await c.end()}
}
it('E corrections02 RPC-01 2001-record feed stops exactly at 2000 identities, selects, and never throws or appends',async()=>{
 try{
 const w=await prepWorld();w.pages['https://yc-oss.github.io/api/companies/all.json']={body:c02Feed(2001)}
 const r=await prepareOutreach(w.db,w.gate,url(),c02Request('c02-bound',10,200) as never,clock)
 expect(r.checkpoint!.candidateIds).toHaveLength(2000);expect(r.checkpoint!.entries).toHaveLength(2000);expect(r.checkpoint!.discoveryFinished).toBe(true)
 expect(c02Window(r).gap).toBe('candidate_bound_reached');expect(await w.db.company.count({where:{canonicalDomain:{startsWith:'seed-'}}})).toBe(1999)
 expect(r.checkpoint!.entries.filter(e=>e.selected)).toHaveLength(1)
 console.log('E c02 candidate bound',JSON.stringify({candidates:r.checkpoint!.candidateIds.length,window:c02Window(r),companies:await w.db.company.count()}))
 }finally{await c03FinishCapMaintenance()}
},600_000)
it.each([false,true])('E corrections02 RPC-02 stop orphan capture excludes unrelated tasks and labels shared=%s ambiguous',async shared=>{
 const w=await prepWorld();await w.db.contact.update({where:{id:w.contact.id},data:{verified:false}})
 const {HandoffLlmGateway}=await import('../../src/core/llm/handoff-gateway.js');let roots=0,stopped=false,foreign='',helper='';const base=w.gate.fetchText.bind(w.gate)
 w.gate.fetchText=async(u:string)=>{if(new URL(u).hostname==='acme.example'&&new URL(u).pathname==='/')roots++
  if(!stopped&&new URL(u).hostname==='acme.example'&&(new URL(u).pathname!=='/'||roots>1)){
   foreign=(await new HandoffLlmGateway(w.db).enqueue({kind:'research_urls',promptVersion:'research_urls@1',subjectType:'OtherWorkflowCompany',subjectId:w.company.id,allowedEvidenceIds:[],allowedApprovedClaimIds:[],input:{probe:'unrelated'}})).taskId
   if(shared){helper=(await new HandoffLlmGateway(w.db).enqueue({kind:'research_urls',promptVersion:'research_urls@1',subjectType:'RecipientSearch',subjectId:w.company.id,allowedEvidenceIds:[],allowedApprovedClaimIds:[],input:{probe:'shared'}})).taskId
    await w.db.preparationRun.create({data:{id:'c02-other-run',status:'paused',limit:1,provider:'manual',checkpoint:{entries:[{taskIds:[helper]}]}}})}
   await w.db.company.update({where:{id:w.company.id},data:{status:'excluded'}});stopped=true
  }return base(u)}
 const r=await prepareOutreach(w.db,w.gate,url(),request(`c02-orphan-${shared}`),clock),e=r.checkpoint!.entries.find(e=>e.selected)!
 const real=await w.db.llmTask.findFirstOrThrow({where:{subjectType:'RecipientSearch'}});helper=real.id
 const status=await preparationStatus(w.db,r.runId) as unknown as {stopOrphaned:{id:string;subjectType:string;kind:string}[];ambiguousShared:{id:string;classification:string}[];stopOrphanedInstruction:string;tasks:{id:string}[]}
 expect(stopped).toBe(true);expect(e.taskIds).not.toContain(foreign);expect(e.orphanedTaskIds).not.toContain(foreign);expect(status.stopOrphaned.map(t=>t.id)).not.toContain(foreign)
 if(shared){expect(e.orphanedTaskIds).not.toContain(helper);expect(status.ambiguousShared).toContainEqual(expect.objectContaining({id:helper,classification:'ambiguous_shared'}));expect(status.stopOrphaned.map(t=>t.id)).not.toContain(helper);expect(status.tasks.map(t=>t.id)).not.toContain(helper)}
 else{expect(e.orphanedTaskIds).toContain(helper);expect(status.stopOrphaned).toContainEqual(expect.objectContaining({id:helper,kind:'research_urls',subjectType:'RecipientSearch'}))}
 expect(status.stopOrphanedInstruction).toContain('created during the stage window in which this company was stopped');expect(await w.db.draft.count()).toBe(0)
 console.log('E c02 orphan',JSON.stringify({shared,foreign,helper,orphaned:e.orphanedTaskIds,status}))
})

// Corrections03: desired-result controls, written against corrections02 before product edits.
it.each([false,true])('E corrections03 RPD-01 stopped resumed D support is orphaned even when window capture is unavailable=%s',async noWindow=>{
 const w=await prepWorld(),stopper=new Client({connectionString:url()});await stopper.connect()
 const {fulfilTask}=await import('../../src/core/llm/handoff-gateway.js'),{writerOutput}=await import('../fixtures/joboss-d/world.js')
 let armed=false,stopped=false,windowQueries=0
 const db=new Proxy(w.db,{get(t,k){
  if(k==='$transaction')return async(fn:unknown,opts?:object)=>{
   const result=await (t.$transaction as (f:unknown,o?:object)=>Promise<unknown>)(fn,opts)
   if(armed&&!stopped&&typeof fn==='function'&&(await stopper.query("SELECT count(*)::int AS n FROM llm_task WHERE kind='draft_support'")).rows[0].n>0){
    await stopper.query("UPDATE company SET status='excluded' WHERE id=$1",[w.company.id]);stopped=true
   }return result
  }
  if(k==='llmTask')return new Proxy(t.llmTask,{get(model,key){const method=Reflect.get(model,key)
   if(key==='findMany')return async(a:Parameters<typeof model.findMany>[0])=>{
    if(stopped&&JSON.stringify(a?.where).includes('createdAt')){windowQueries++;if(noWindow)return []}
    return model.findMany(a)
   };return typeof method==='function'?method.bind(model):method}})
  const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value
 }}) as Db
 try{
  const first=await prepareOutreach(db,w.gate,url(),request(`c03-support-${noWindow}`,'manual'),clock),e1=first.checkpoint!.entries.find(e=>e.selected)!
  const writer=await w.db.llmTask.findFirstOrThrow({where:{kind:'outreach_draft',subjectId:e1.draftIds[0]!}})
  expect((await fulfilTask(w.db,writer.id,await writerOutput(w),{now:NOW,fulfilledBy:'synthetic-E-c03'})).ok).toBe(true)
  armed=true
  const r=await prepareOutreach(db,w.gate,url(),{runId:first.runId,resume:true},clock),e=r.checkpoint!.entries.find(e=>e.selected)!
  const support=await w.db.llmTask.findFirstOrThrow({where:{kind:'draft_support'}}),status=await preparationStatus(w.db,r.runId)
  const usage=(r.checkpoint!.usage as {taskId:string}[]).map(u=>u.taskId)
  console.log('E c03 support stop',JSON.stringify({noWindow,stopped,windowQueries,support:{id:support.id,kind:support.kind,subjectType:support.subjectType,subjectId:support.subjectId},orphaned:e.orphanedTaskIds,usage,manual:status!.tasks.map(t=>t.id),instruction:status!.stopOrphanedInstruction}))
  expect(stopped).toBe(true);expect(windowQueries).toBeGreaterThan(0);expect(e.blockers).toContain('operator_stopped')
  expect(support).toMatchObject({subjectType:'DraftSupport',subjectId:expect.stringMatching(new RegExp(`^${e.draftIds[0]}:`)),status:'pending'})
  expect(e.taskIds).toContain(support.id);expect(e.orphanedTaskIds).toContain(support.id)
  expect(usage).not.toContain(support.id);expect(status!.tasks.map(t=>t.id)).not.toContain(support.id)
  expect(status!.stopOrphaned).toContainEqual(expect.objectContaining({id:support.id,kind:'draft_support',subjectType:'DraftSupport'}));expect(status!.stopOrphanedInstruction).toMatch(/Do not fulfil, claim or apply/)
 }finally{await stopper.end()}
})
it('E corrections03 RPD-02 recovered incomplete source uses scope gap despite stale transient reason',async()=>{
 const w=await prepWorld(),spc=EXPANDED_ROUTES.find(r=>r.id==='southparkcommons:companies')!.url!,base=w.gate.fetchText.bind(w.gate);let pause=true
 w.pages[spc]={body:html([org(),job()])}
 w.gate.fetchText=async(u:string)=>u===spc&&pause?{ok:false as const,reason:'rate_limited' as const}:base(u)
 const first=await prepareOutreach(w.db,w.gate,url(),c02Request('c03-scope'),clock);expect(first.status).toBe('discovery');pause=false
 const r=await prepareOutreach(w.db,w.gate,url(),{runId:first.runId,resume:true},clock),source=c02Source(r,'southparkcommons:companies'),status=await preparationStatus(w.db,r.runId)
 console.log('E c03 recovered scope',JSON.stringify({coverage:source.coverage,gap:status!.discoveryGaps.find(g=>g.source==='southparkcommons:companies')}))
 expect(source.coverage).toMatchObject({executionFinished:true,scopeComplete:false,reason:'rate_limited'})
 expect(c02Window(r,'southparkcommons:companies').gap).toBe('source_scope_incomplete')
 expect(status!.discoveryGaps.find(g=>g.source==='southparkcommons:companies')!.reason).toBe('source_scope_incomplete')
})
