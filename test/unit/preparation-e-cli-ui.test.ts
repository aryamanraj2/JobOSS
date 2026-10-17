import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Entry, Options, scopeHash } from '../../src/outreach/preparation/contracts.js'
import { EXPANDED_ROUTES, expandedManifest, expandedManifestHash } from '../../src/ingest/discovery/expanded/registry.js'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'
const mocks=vi.hoisted(()=>({db:{preparationRun:{findUnique:vi.fn(),findMany:vi.fn()},llmTask:{findMany:vi.fn()},contact:{findMany:vi.fn()}},disconnect:vi.fn(),open:vi.fn(),gate:vi.fn(),prepare:vi.fn()}))
vi.mock('dotenv/config',()=>({}))
vi.mock('../../src/core/db/client.js',()=>({prisma:()=>{mocks.open();return mocks.db},disconnectPrisma:mocks.disconnect}))
vi.mock('../../app/lib/db.js',()=>({db:mocks.db}))
vi.mock('../../src/core/config/config.js',()=>({env:()=>({DATABASE_URL:'synthetic-only'})}))
vi.mock('../../src/core/policy/fetch-policy-gate.js',()=>({FetchPolicyGate:class{constructor(){mocks.gate()}}}))
vi.mock('../../src/outreach/preparation/run.js',async original=>({...await original<object>(),prepareOutreach:mocks.prepare}))
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('synthetic-not-found')}}))
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:unknown})=>createElement('a',{href},children as string)}))
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(console,'log').mockImplementation(()=>undefined);mocks.db.llmTask.findMany.mockResolvedValue([]);mocks.db.contact.findMany.mockResolvedValue([])})
it('E CLI import is inert; invalid and absent campaign input fail before environment/DB/gate construction',async()=>{
  const {main}=await import('../../tools/run-outreach-prepare.js')
  expect(mocks.open).not.toHaveBeenCalled();expect(mocks.gate).not.toHaveBeenCalled()
  for(const args of [[],['--limit','0','--campaign','c'],['--resume'],['--campaign','c','--provider','paid'],['--campaign','c','--unknown'],['--campaign','c','--limit','1','--limit','2']])await expect(main(args)).rejects.toThrow()
  expect(mocks.open).not.toHaveBeenCalled();expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.gate).not.toHaveBeenCalled()
})
it('E CLI preserves codex default and exact manual/claude/resume choices through isolated production main',async()=>{
  const {main}=await import('../../tools/run-outreach-prepare.js')
  mocks.prepare.mockResolvedValue({runId:'explicit',status:'paused',reviewUrl:'/preparation/explicit'})
  for(const provider of ['codex','manual','claude']){
    await main(['--campaign','authorized','--run-id','explicit',...(provider==='codex'?[]:['--provider',provider])])
    expect(mocks.prepare.mock.lastCall![3]).toMatchObject({runId:'explicit',resume:false,options:{campaignCycle:'authorized',...(provider==='codex'?{}:{provider})}})
  }
  await main(['--resume','--run-id','explicit']);expect(mocks.prepare.mock.lastCall![3]).toMatchObject({runId:'explicit',resume:true,options:{}})
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('/preparation/explicit'))
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No browser was opened'))
  expect(mocks.disconnect).toHaveBeenCalledTimes(4)
})
it('E CLI status and app list/detail are read-only, route exact IDs, expose malformed state and not-found',async()=>{
  const {main}=await import('../../tools/run-outreach-prepare.js')
  const options=Options.parse({campaignCycle:'authorized'})
  const checkpoint={version:'preparation-e@3',runId:'ui',options,optionsHash:contentHashOf(options),batchId:'prep_ui',manifestHash:expandedManifestHash(),scopeHash:scopeHash({candidateIds:[],entries:[]}),discovery:null,candidateIds:[],entries:[],errors:[],usage:[],owner:null,status:'paused',discoveryFinished:false,discoveryPass:1,discoveryPending:false}
  const entry=Entry.parse({companyId:'company-ui',name:'Synthetic company',domain:'synthetic.example',priority:100,reason:'canonical_bounded_research_priority',selected:true,sourceRoutes:['yc:companies'],provenance:[],hints:[],unresolved:false,intent:'speculative',opportunityId:null,roleHash:null,associationId:'lead-ui',contactId:'contact-ui',stage:'support',blockers:['Independent support pending'],pages:[],taskIds:['task-ui'],draftIds:['draft-ui'],refreshAttempted:false})
  const discovery={mode:'expanded-v1',manifestVersion:'expanded-v1',batchId:'prep_ui',manifestHash:expandedManifestHash(),companyIds:['company-ui'],runIds:EXPANDED_ROUTES.map((_,i)=>`source-${i}`),sources:EXPANDED_ROUTES.map((r,i)=>({source:r.id,runId:`source-${i}`,status:r.access,discovered:0,counts:{},errors:[],coverage:{...(r.kind==='unavailable'?{reason:r.access,scopeComplete:false}:{}),preparationWindow:{passes:1,lastPass:1,ended:true,gap:r.kind==='unavailable'?r.access:null},batchId:'prep_ui',manifestHash:expandedManifestHash(),manifest:expandedManifest(),executionFinished:true,remainingRequirement:r.remaining}})),handoff:{items:[{companyId:'company-ui',domain:'synthetic.example',listingHints:[],unresolvedAdvertisedHints:[],sourceRoutes:['yc:companies']}]}}
  const visible={...checkpoint,discovery,discoveryFinished:true,candidateIds:['company-ui'],entries:[entry],scopeHash:scopeHash({candidateIds:['company-ui'],entries:[entry]})}
  mocks.db.llmTask.findMany.mockResolvedValue([{id:'task-ui',kind:'draft_support',status:'pending'}]);mocks.db.contact.findMany.mockResolvedValue([{id:'contact-ui',emailNormalized:'careers@synthetic.example'}])
  mocks.db.preparationRun.findUnique.mockResolvedValue({id:'ui',checkpoint:visible,status:'paused'})
  mocks.db.preparationRun.findMany.mockResolvedValue([{id:'ui',status:'paused',limit:20,startedAt:new Date('2026-10-17')}])
  await main(['--status','--run-id','ui']);expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.gate).not.toHaveBeenCalled()
  const listPath='../../app/preparation/page.js',detailPath='../../app/preparation/[id]/page.js'
  const List=(await import(listPath)).default,Detail=(await import(detailPath)).default
  expect(renderToStaticMarkup(await List())).toContain('href="/preparation/ui"')
  const html=renderToStaticMarkup(await Detail({params:Promise.resolve({id:'ui'})}))
  expect(html).toContain('href="/outreach/draft-ui"');expect(html).toContain('careers@synthetic.example');expect(html).toContain('draft_support: pending');expect(html).toContain('yc:work-at-a-startup');expect(html).toContain('--run-id ui');expect(html).toContain('Source coverage and gaps');expect(html).not.toContain('<form')
  expect(mocks.db.preparationRun.findUnique).toHaveBeenCalledWith({where:{id:'ui'}})
  mocks.db.preparationRun.findUnique.mockResolvedValue({checkpoint:{foreign:true},status:'paused'})
  expect(renderToStaticMarkup(await Detail({params:Promise.resolve({id:'ui'})}))).toContain('incompatible or damaged')
  mocks.db.preparationRun.findUnique.mockResolvedValue(null)
  await expect(Detail({params:Promise.resolve({id:'absent'})})).rejects.toThrow('synthetic-not-found')
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.gate).not.toHaveBeenCalled()
})

it('E corrections02 RPC-01 discovery passes validate before construction and checkpoint decode preserves the frozen option',async()=>{
 const {parsePreparationArgs}=await import('../../src/outreach/preparation/cli.js'),{Checkpoint,decodeCheckpoint,CHECKPOINT_VERSION}=await import('../../src/outreach/preparation/contracts.js')
 expect(Options.parse({campaignCycle:'c'})).toHaveProperty('discoveryPasses',3)
 for(const v of ['0','11','1.5','NaN'])expect(()=>parsePreparationArgs(['--campaign','c','--discovery-passes',v])).toThrow()
 expect(parsePreparationArgs(['--campaign','c','--discovery-passes','1']).options).toHaveProperty('discoveryPasses',1)
 const options=Options.parse({campaignCycle:'c',discoveryPasses:10}),c={version:CHECKPOINT_VERSION,runId:'decode',options,optionsHash:contentHashOf(options),batchId:'prep_decode',manifestHash:expandedManifestHash(),scopeHash:scopeHash({candidateIds:[],entries:[]}),discovery:null,candidateIds:[],entries:[],errors:[],usage:[],owner:null,status:'discovery',discoveryFinished:false,discoveryPass:0,discoveryPending:false}
 expect(decodeCheckpoint(c,'decode').options).toHaveProperty('discoveryPasses',10)
 expect(()=>Checkpoint.parse({...c,options:{...options,discoveryPasses:11}})).toThrow()
 expect(()=>decodeCheckpoint({...c,options:{...options,discoveryPasses:9}},'decode')).toThrow()
})

it('E corrections03 RPD-02 recovered source scope gap reaches normal CLI, status CLI and app',async()=>{
 const {nextWindow}=await import('../../src/outreach/preparation/discovery-window.js'),{preparationStatus}=await import('../../src/outreach/preparation/status.js'),{main}=await import('../../tools/run-outreach-prepare.js')
 const options=Options.parse({campaignCycle:'c03'}),id='c03-scope-ui'
 const recovered={status:'unverified',coverage:{executionFinished:true,scopeComplete:false,reason:'rate_limited'}}
 const window=nextWindow(recovered,{passes:1,lastPass:1,ended:false,gap:null},2,3,false)
 const discovery={mode:'expanded-v1',manifestVersion:'expanded-v1',batchId:`prep_${id}`,manifestHash:expandedManifestHash(),companyIds:[],runIds:EXPANDED_ROUTES.map((_,i)=>`source-${i}`),sources:EXPANDED_ROUTES.map((r,i)=>({source:r.id,runId:`source-${i}`,status:'unverified',discovered:0,counts:{},errors:[],coverage:{batchId:`prep_${id}`,manifestHash:expandedManifestHash(),manifest:expandedManifest(),...(r.id==='southparkcommons:companies'?{...recovered.coverage,preparationWindow:window}:{executionFinished:true,preparationWindow:{passes:1,lastPass:1,ended:true,gap:null}})}})),handoff:{items:[]}}
 const checkpoint={version:'preparation-e@3',runId:id,options,optionsHash:contentHashOf(options),batchId:`prep_${id}`,manifestHash:expandedManifestHash(),scopeHash:scopeHash({candidateIds:[],entries:[]}),discovery,candidateIds:[],entries:[],errors:[],usage:[],owner:null,status:'paused',discoveryFinished:true,discoveryPass:2,discoveryPending:false}
 mocks.db.preparationRun.findUnique.mockResolvedValue({id,checkpoint,status:'paused'});mocks.prepare.mockResolvedValue({runId:id,status:'paused',reviewUrl:`/preparation/${id}`})
 const status=await preparationStatus(mocks.db as never,id)
 await main(['--resume','--run-id',id]);const normal=(vi.mocked(console.log).mock.calls.flat() as string[]).join('\n')
 vi.mocked(console.log).mockClear();await main(['--status','--run-id',id]);const json=JSON.parse(vi.mocked(console.log).mock.calls[0]![0] as string)
 const detailPath='../../app/preparation/[id]/page.js',Detail=(await import(detailPath)).default,html=renderToStaticMarkup(await Detail({params:Promise.resolve({id})}))
 expect(status!.error).toBeNull();expect(window.gap).toBe('source_scope_incomplete')
 expect(status!.discoveryGaps.find(g=>g.source==='southparkcommons:companies')!.reason).toBe('source_scope_incomplete')
 expect(normal).toContain('southparkcommons:companies: source_scope_incomplete; remaining scope:');expect(normal).not.toContain('southparkcommons:companies: rate_limited;')
 expect(json.discoveryGaps.find((g:{source:string})=>g.source==='southparkcommons:companies').reason).toBe('source_scope_incomplete')
 expect(html).toContain('southparkcommons:companies: source_scope_incomplete');expect(html).not.toContain('southparkcommons:companies: rate_limited')
})
