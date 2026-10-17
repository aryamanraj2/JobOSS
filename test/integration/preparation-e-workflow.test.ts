import { afterAll, beforeEach, expect, it } from 'vitest'
import { truncateAll, closeTestDb } from '../helpers/db.js'
import { prepWorld, addRoute, request, clock, NOW } from '../fixtures/preparation-e/world.js'
import { prepareOutreach } from '../../src/outreach/preparation/run.js'
import { fulfilTask } from '../../src/core/llm/handoff-gateway.js'
import { writerOutput, fulfillSupport } from '../fixtures/joboss-d/world.js'
import { preparationStatus } from '../../src/outreach/preparation/status.js'
import { evaluateOutreachReadiness } from '../../src/outreach/review/readiness.js'
import { boardSnapshot, syntheticJob } from '../fixtures/discovery-support.js'
import { configuredTestTarget } from '../helpers/test-target.js'
const run = (w: Awaited<ReturnType<typeof prepWorld>>, id: string, resume = false, provider: 'codex'|'manual' = 'codex') => prepareOutreach(w.db,w.gate,configuredTestTarget().url,resume ? { runId:id,resume } : request(id,provider),clock)
beforeEach(truncateAll); afterAll(closeTestDb)
it.each(['yc:companies','southparkcommons:companies','alchemist:highlights','alchemist:class29','ef:companies','masschallenge:ch-uk-2026','masschallenge:us-2023','seedcamp:companies','startupdb','hn'])('E source %s reaches real bounded research, recipients and composing; resume reuses writes', async route => {
  const w = await prepWorld()
  if (route === 'yc:companies') w.pages['https://yc-oss.github.io/api/companies/all.json'] = { body: JSON.stringify([{ id: 1,name:'Acme',website:'https://acme.example',one_liner:'SwiftUI iOS mobile app',batch:'Summer 2026',team_size:2,status:'Active' }]) }
  else if (!['startupdb','hn'].includes(route)) addRoute(w,route)
  const first = await run(w,`source-${route.replaceAll(':','-')}`), c = first.checkpoint!, e = c.entries.find(e=>e.selected)!
  expect(c.discovery).toMatchObject({mode:'expanded-v1'})
  console.log('E synthetic funnel',JSON.stringify({route,candidates:c.candidateIds.length,selected:1,primary:1,contactable:1,composing:1,ready:0,sourceComplete:(c.discovery as {complete:boolean}).complete}))
  expect(e.sourceRoutes).toContain(route); expect(e.intent).toBe('speculative'); expect(e.stage).toBe('composing')
  expect(e.pages[0]).toMatchObject({status:'stored',evidenceId:expect.any(String)})
  expect(await w.db.evidence.findUnique({where:{id:e.pages[0]!.evidenceId!}})).toMatchObject({companyId:w.company.id,sourceType:'company_page',fetchedVia:'static_fetch'})
  expect(e.contactId).toBe(w.contact.id); expect(e.draftIds).toHaveLength(1)
  expect(c.usage).toEqual(expect.arrayContaining([expect.objectContaining({state:'isolation_blocked'})]))
  const before = { fetch:w.gate.requested.length,tasks:await w.db.llmTask.findMany(), drafts:await w.db.draft.findMany(), leads:await w.db.lead.findMany() }
  const again = await run(w,c.runId,true)
  expect(again.checkpoint!.entries.find(e=>e.selected)!.draftIds).toEqual(e.draftIds)
  expect(w.gate.requested.length).toBe(before.fetch); expect(await w.db.llmTask.findMany()).toEqual(before.tasks)
  expect(await w.db.draft.findMany()).toEqual(before.drafts); expect(await w.db.lead.findMany()).toEqual(before.leads)
  expect(await w.db.scoreVersion.count()).toBe(0); expect(await w.db.sendAttempt.count()).toBe(0)
  expect(before.drafts.every(d=>d.status==='composing' && !d.approvedAt)).toBe(true)
  const writer=await w.db.llmTask.findFirstOrThrow({where:{kind:'outreach_draft',subjectId:e.draftIds[0]!}})
  expect((await fulfilTask(w.db,writer.id,await writerOutput(w),{now:NOW,fulfilledBy:'synthetic-E-source'})).ok).toBe(true)
  await run(w,c.runId,true);await fulfillSupport(w,e.draftIds[0]!)
  const review=await run(w,c.runId,true)
  expect(review.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('ready')
  expect((await w.db.draft.findUniqueOrThrow({where:{id:e.draftIds[0]!}})).approvedAt).toBeNull()
  console.log('E synthetic review funnel',JSON.stringify({route,discovered:c.candidateIds.length,ranked:c.entries.length,selected:1,primaryResearched:1,contactable:1,drafted:1,humanReviewReady:1,approved:0,sent:0,liveAccessVerified:false}))
})
it('E manual writer and support handoff applies validators and reaches canonical human review without approval', async()=>{
  const w=await prepWorld(), first=await run(w,'manual',false,'manual'), e=first.checkpoint!.entries.find(e=>e.selected)!, draftId=e.draftIds[0]!
  expect(first.checkpoint!.usage).toEqual(expect.arrayContaining([expect.objectContaining({state:'manual_pending'})]))
  const task=await w.db.llmTask.findFirstOrThrow({where:{kind:'outreach_draft',subjectId:draftId}})
  expect((await fulfilTask(w.db,task.id,{invalid:'output'},{now:NOW,fulfilledBy:'synthetic-E'})).ok).toBe(false)
  expect((await fulfilTask(w.db,task.id,await writerOutput(w),{now:NOW,fulfilledBy:'synthetic-E'})).ok).toBe(true)
  const second=await run(w,'manual',true);; expect(second.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('support')
  await fulfillSupport(w,draftId)
  const third=await run(w,'manual',true); expect(third.checkpoint!.entries.find(e=>e.selected)!.stage).toBe('ready')
  expect((await evaluateOutreachReadiness(w.db,draftId,NOW)).ready).toBe(true)
  const draft=await w.db.draft.findUniqueOrThrow({where:{id:draftId}});expect(draft.approvedAt).toBeNull(); expect(draft.status).toBe('awaiting_approval')
  expect(draft.bodyText!.split(/\s+/).length).toBeLessThanOrEqual(280)
  const before=await w.db.preparationRun.findUniqueOrThrow({where:{id:'manual'}})
  expect((await preparationStatus(w.db,'manual'))!.resume).toContain('--run-id manual')
  expect(await w.db.preparationRun.findUniqueOrThrow({where:{id:'manual'}})).toEqual(before)
  expect(await w.db.sendAttempt.count()).toBe(0)
})
it.each(['yc:jobs','seedcamp:talent'])('E %s exact employer ATS resolves raw hosted hint, never a decoy/newer role', async route=>{
  const w=await prepWorld({listed:true}); addRoute(w,route,true)
  await boardSnapshot(w.company.id,NOW,[syntheticJob('j1'),syntheticJob('decoy','iOS Engineer Intern')])
  const first=await run(w,'listed'),e=first.checkpoint!.entries.find(e=>e.selected)!
  const role=await w.db.opportunity.findFirstOrThrow({where:{companyId:w.company.id,externalId:'j1'}})
  expect(e).toMatchObject({intent:'listed',opportunityId:role.id,stage:'composing'})
  expect(await w.db.lead.findUnique({where:{id:e.associationId!}})).toMatchObject({leadKind:'posted_role',opportunityId:role.id,score:null})
  const writer=await w.db.llmTask.findFirstOrThrow({where:{kind:'outreach_draft',subjectId:e.draftIds[0]!}})
  const lead=await w.db.lead.findUniqueOrThrow({where:{id:e.associationId!}})
  expect((await fulfilTask(w.db,writer.id,await writerOutput({...w,lead}),{now:NOW,fulfilledBy:'synthetic-E-listed'})).ok).toBe(true)
  await run(w,'listed',true);await fulfillSupport(w,e.draftIds[0]!)
  expect((await run(w,'listed',true)).checkpoint!.entries.find(e=>e.selected)!.stage).toBe('ready')
  console.log('E synthetic listed review funnel',JSON.stringify({route,selectedRole:role.id,primaryResearched:1,contactable:1,drafted:1,humanReviewReady:1,approved:0,sent:0,liveAccessVerified:false}))
  const before=await w.db.draft.findMany(); await w.db.opportunity.update({where:{id:role.id},data:{status:'closed'}})
  const next=await run(w,'listed',true); expect(next.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('selected_role_changed')
  expect(await w.db.draft.findMany()).toEqual(before)
})
it.each([false,true])('E unverified advertised input blocks before primary/recipient/D work, prior speculative=%s',async withLead=>{
  const w=await prepWorld({withLead});addRoute(w,'yc:jobs',true)
  const before=await w.db.lead.findMany(), first=await run(w,'unverified'),e=first.checkpoint!.entries.find(e=>e.selected)!
  expect(e.stage).toBe('blocked');expect(e.blockers).toContain('unresolved_or_ambiguous_advertised_intent')
  expect(w.gate.requested).not.toContain('https://acme.example/');expect(await w.db.draft.count()).toBe(0);expect(await w.db.llmTask.count()).toBe(0)
  expect(await w.db.lead.findMany()).toEqual(before)
})
it('E two advertised source hints remain ambiguous, even with a supported role',async()=>{
 const w=await prepWorld({listed:true});addRoute(w,'yc:jobs',true);addRoute(w,'seedcamp:talent',true)
 const r=await run(w,'ambiguous');expect(r.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('unresolved_or_ambiguous_advertised_intent');expect(await w.db.draft.count()).toBe(0)
})
it('E listed request with conflicting speculative campaign preserves its association and score history',async()=>{
 const w=await prepWorld({listed:true,withLead:true});addRoute(w,'yc:jobs',true)
 await w.db.lead.update({where:{id:w.lead!.id},data:{leadKind:'speculative',opportunityId:null,score:77,primaryTrackReason:'Preserve operator history'}})
 const before=await w.db.lead.findMany();const r=await run(w,'history')
 expect(r.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('preparation_selection_conflict');expect(await w.db.lead.findMany()).toEqual(before);expect(await w.db.draft.count()).toBe(0)
})
it('E partial advertised discovery blocks downstream work; later hints never silently reinterpret the frozen speculative cohort',async()=>{
 const w=await prepWorld(),{html,org,job}=await import('../fixtures/discovery-expansion/fixtures.js'),{EXPANDED_ROUTES}=await import('../../src/ingest/discovery/expanded/registry.js')
 w.pages[EXPANDED_ROUTES.find(r=>r.id==='yc:jobs')!.url!]={body:html([job({identifier:'other',hiringOrganization:org('Other','https://other.example'),applicationUrl:'https://other.example/jobs/apply'})],'<a rel="next" href="https://www.ycombinator.com/jobs?page=2">Next</a>')}
 w.pages['https://www.ycombinator.com/jobs?page=2']={body:html([job({identifier:'acme',applicationUrl:'https://job-boards.greenhouse.io/acme/jobs/j1'})])}
 // Corrections02: later hints arrive within this CLI invocation's frozen window, before selection.
 const base=w.gate.fetchText.bind(w.gate);let inspected=false
 w.gate.fetchText=async(u:string)=>{if(u==='https://www.ycombinator.com/jobs?page=2'){inspected=true
  expect((await w.db.preparationRun.findUniqueOrThrow({where:{id:'partial'}})).cohort).toEqual([])
  expect(await w.db.draft.count()).toBe(0);expect(await w.db.llmTask.count()).toBe(0);expect(w.gate.requested).not.toContain('https://acme.example/')
 }return base(u)}
 const first=await prepareOutreach(w.db,w.gate,configuredTestTarget().url,{...request('partial'),options:{...request('partial').options,discoveryLimit:1}},clock)
 expect(inspected).toBe(true);expect(first.checkpoint!.discoveryFinished).toBe(true)
 const second=await run(w,'partial',true),same=second.checkpoint!.entries.find(e=>e.companyId===w.company.id)!
 expect(second.checkpoint!.discoveryFinished).toBe(true);expect(same).toMatchObject({selected:true,intent:'listed',stage:'blocked'})
 expect(await w.db.draft.count()).toBe(0);expect(await w.db.lead.count({where:{leadKind:'speculative'}})).toBe(0)
})
it('E zero-priority candidates remain visible with no application ranking or off-cohort writes',async()=>{
 const w=await prepWorld();w.pages['https://yc-oss.github.io/api/companies/all.json']={body:JSON.stringify([{id:20,name:'Unknown activity',website:'https://unknown-activity.example',status:'Acquired',batch:'Winter 2010',team_size:5000}])}
 const r=await run(w,'dispositions'),other=r.checkpoint!.entries.find(e=>e.domain==='unknown-activity.example')!
 expect(other).toMatchObject({selected:false,priority:0,reason:'zero_or_unsupported_priority'})
 expect(await w.db.lead.count({where:{companyId:other.companyId}})).toBe(0);expect(await w.db.scoreVersion.count()).toBe(0)
})
it.each(['missing_url','invalid_date','expired'])('E raw advertised %s is not resolved merely because a matching current role exists',async kind=>{
 const w=await prepWorld({listed:true}),{html,job}=await import('../fixtures/discovery-expansion/fixtures.js'),{EXPANDED_ROUTES}=await import('../../src/ingest/discovery/expanded/registry.js')
 const invalid=job({title:'iOS Engineer Intern',applicationUrl:'https://job-boards.greenhouse.io/acme/jobs/j1',...(kind==='missing_url'?{url:undefined}:kind==='invalid_date'?{datePosted:'2026-02-30'}:{validThrough:'2026-10-01'})})
 w.pages[EXPANDED_ROUTES.find(r=>r.id==='yc:jobs')!.url!]={body:html([invalid])}
 const r=await run(w,`bad-${kind}`)
 expect(r.checkpoint!.entries.find(e=>e.selected)!.blockers).toContain('unresolved_or_ambiguous_advertised_intent');expect(await w.db.draft.count()).toBe(0);expect(await w.db.llmTask.count()).toBe(0)
})
