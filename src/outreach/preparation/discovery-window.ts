import type { Db } from '../../core/audit/audit-log.js'
import type { DiscoverySummary, SourceSummary } from '../../ingest/discovery/prepare.js'
import { object, DiscoveryPaused } from '../../ingest/discovery/common.js'
import { EXPANDED_ROUTES } from '../../ingest/discovery/expanded/registry.js'
import { restoredPageCursor } from '../../ingest/discovery/expanded/adapter.js'
import { validateCommittedProgress } from '../../ingest/discovery/expanded/snapshot.js'
import { z } from 'zod'

export const Window = z.object({ passes: z.number().int().min(1).max(10), lastPass: z.number().int().min(1).max(10), ended: z.boolean(), gap: z.string().nullable() }).strict()
export type SourceWindow = z.infer<typeof Window>
const ACCESS = ['access_blocked','unsupported','unsupported_redirect_or_auth','robots_disallowed','terms_prohibited','host_denied']
// X run.ts:111-112,227; page.ts:17,41,45,53,56-61. Caps whose counters
// reset per invocation are window-bounded, not declared deterministic here.
const DETERMINISTIC = ['changed_feed_hash_new_batch_required','conflicting_yc_id_same_domain_needs_review','cross_source_union_cap_2000',
  'redirect_cycle','redirect_hop_cap','invalid_source_route_url','truncated_response','truncated_or_byte_cap']
export const deterministicPause = (reason: string) => DETERMINISTIC.includes(reason) || /^http_4\d\d$/.test(reason) && !['http_408','http_429'].includes(reason)
export function intrinsicEnd(s: Pick<SourceSummary,'status'|'coverage'>) {
  return s.coverage.executionFinished === true || s.status === 'access_blocked' || ACCESS.includes(String(s.coverage.reason)) || deterministicPause(String(s.coverage.reason))
}
export function sourceWindow(s: Pick<SourceSummary,'coverage'>): SourceWindow | null {
  return s.coverage.preparationWindow === undefined ? null : Window.parse(s.coverage.preparationWindow)
}
export const transientPause = (s: SourceSummary) => s.status === 'paused' && !intrinsicEnd(s) && !sourceWindow(s)?.ended
export function endedForSelection(s: SourceSummary) { return sourceWindow(s)?.ended ?? intrinsicEnd(s) }
export function nextWindow(s: Pick<SourceSummary,'status'|'coverage'>, previous: SourceWindow | null, pass: number, max: number, bound: boolean): SourceWindow {
  const passes = (previous?.passes ?? 0) + 1, intrinsic = intrinsicEnd(s)
  const gap = intrinsic ? s.status === 'paused' || s.status === 'access_blocked' || ACCESS.includes(String(s.coverage.reason))
    ? String(s.coverage.reason ?? s.status) : s.coverage.scopeComplete === false ? 'source_scope_incomplete' : null
    : bound ? 'candidate_bound_reached' : passes >= max ? s.status === 'paused' ? 'discovery_window_exhausted_transient' : 'discovery_window_exhausted' : null
  return { passes, lastPass: pass, ended: intrinsic || bound || passes >= max, gap }
}
/** X has no per-route invocation option. This E-only facade presents already ended
 * or already checkpointed routes as terminal for this invocation, WITHOUT changing
 * their durable cursor/coverage/status. Originals replace these local views in the
 * result. A validated local terminal cursor is never stored or claimed as coverage.
 * Per-source pass receipts commit with X's final source update; interrupted passes
 * replay the same batch/pass and skip receipts already committed. */
export async function windowedDiscoveryDb(db: Db, batchId: string, pass: number, max: number, now: Date) {
  const rows = await db.discoveryRun.findMany({ where: { coverage: { path: ['batchId'], equals: batchId } } })
  const ids = new Set(rows.flatMap(r => {const c=object(r.coverage);return [...(Array.isArray(c.companyIds)?c.companyIds:[]),...(Array.isArray(c.records)?c.records.map(r=>object(r).companyId):[])].filter((v):v is string=>typeof v==='string')}))
  const skipped = new Map(rows.filter(r => {const w=sourceWindow({coverage:r.coverage as Record<string,unknown>});return w?.ended || w?.lastPass === pass}).map(r=>[r.id,r]))
  const view = (r: typeof rows[number]) => {
    if (!skipped.has(r.id)) return r
    const route = EXPANDED_ROUTES.find(x=>x.id===r.source)!, coverage = r.coverage as Record<string,unknown>
    let cursor = r.cursor
    if (route.kind === 'directory' || route.kind === 'jobs') {
      const original = restoredPageCursor(cursor,route,now);validateCommittedProgress(original,coverage.records,route)
      const {snapshot: _snapshot,...rest}=original;void _snapshot
      cursor = JSON.parse(JSON.stringify({...rest,next:null,scopeDone:true}))
    }
    return {...r,cursor,coverage:{...coverage,executionFinished:true}}
  }
  const scoped = (client: Db, pending: Set<string>, committedRead = false): Db => new Proxy(client,{get(t,k){
    if(k==='company')return new Proxy(t.company,{get(model,op){const method=Reflect.get(model,op)
      if(['create','update','upsert'].includes(String(op)))return async(...args:unknown[])=>{
        const a=args[0] as {where?:{id?:string;canonicalDomain?:string};data?:{canonicalDomain?:string};create?:{canonicalDomain?:string}}
        const where=a.where?.id?{id:a.where.id}:a.where?.canonicalDomain?{canonicalDomain:a.where.canonicalDomain}:null
        const existing = where ? await t.company.findUnique({where,select:{id:true}}) : null
        if((!existing || !ids.has(existing.id) && !pending.has(existing.id)) && ids.size+pending.size>=2000)throw new DiscoveryPaused(batchId,'candidate_bound_reached')
        const r=await Reflect.apply(method,model,args) as {id:string};if(!ids.has(r.id))pending.add(r.id);return r
      }
      return typeof method==='function'?method.bind(model):method}})
    if(k==='discoveryRun')return new Proxy(t.discoveryRun,{get(model,op){const method=Reflect.get(model,op)
      if(op==='findMany')return async(...args:unknown[]) => (await Reflect.apply(method,model,args) as typeof rows).map(view)
      if(op==='findUniqueOrThrow')return async(...args:unknown[]) => {const r=await Reflect.apply(method,model,args) as typeof rows[number];if(committedRead){const c=object(r.coverage);for(const id of Array.isArray(c.companyIds)?c.companyIds:[])if(typeof id==='string')ids.add(id)}return view(r)}
      if(op==='update')return async(...args:unknown[])=>{
        const a=args[0] as {where:{id:string};data:Record<string,unknown>}
        if(skipped.has(a.where.id))return skipped.get(a.where.id)
        if(Object.hasOwn(a.data,'completedAt')){
          const coverage=a.data.coverage as Record<string,unknown>, previous=sourceWindow({coverage})
          const w=nextWindow({status:String(a.data.status),coverage},previous,pass,max,ids.size+pending.size>=2000)
          const durable=await model.findUniqueOrThrow({where:a.where,select:{cursor:true}}),cursor=object(durable.cursor)
          const remaining={scope:coverage.sourceScope??null,requirement:coverage.remainingRequirement??null,pendingRecords:typeof coverage.feedRecordCount==='number'&&Array.isArray(cursor.processed)?Math.max(0,coverage.feedRecordCount-cursor.processed.length):coverage.pendingRecords??null,cursor:cursor.next??coverage.remainingCursor??null,scopeComplete:coverage.scopeComplete??false,limitations:coverage.limitations??[],sourceReason:coverage.reason??null}
          return Reflect.apply(method,model,[{...a,data:{...a.data,coverage:{...coverage,preparationWindow:w,preparationRemaining:remaining}}}])
        }
        return Reflect.apply(method,model,args)
      }
      return typeof method==='function'?method.bind(model):method}})
    const value=Reflect.get(t,k);return typeof value==='function'?value.bind(t):value
  }})
  // Keep X's short transactions, and add newly discovered identities only after COMMIT.
  const facade = new Proxy(scoped(db,new Set(),true),{get(t,k){
    if(k==='$transaction')return async(work:unknown,opts?:object)=>{
      if(typeof work!=='function')throw new Error('Discovery requires callback transactions')
      const pending=new Set<string>(),result=await db.$transaction(tx=>work(scoped(tx,pending)),opts as never)
      for(const id of pending)if(!ids.has(id))ids.add(id)
      return result
    }
    return Reflect.get(t,k)
  }})
  return { db:facade, atBound:()=>ids.size>=2000,
    async restore(summary:DiscoverySummary):Promise<DiscoverySummary>{
      const durable=await db.discoveryRun.findMany({where:{coverage:{path:['batchId'],equals:batchId}}})
      const sources=summary.sources.map(s=>{const r=durable.find(r=>r.id===s.runId);return r?{...s,status:r.status,coverage:r.coverage as Record<string,unknown>,counts:r.counts as Record<string,unknown>,errors:r.errors as string[],discovered:Number((r.counts as {discovered?:number}).discovered??0)}:s})
      if(ids.size>=2000)for(const s of sources)if(!endedForSelection(s)){
        const w=sourceWindow(s)!,coverage={...s.coverage,preparationWindow:{...w,ended:true,gap:'candidate_bound_reached'}}
        await db.discoveryRun.update({where:{id:s.runId},data:{coverage:JSON.parse(JSON.stringify(coverage))}});s.coverage=coverage
      }
      return {...summary,sources,complete:summary.complete&&!sources.some(s=>sourceWindow(s)?.gap)}
    }
  }
}
export function discoveryPresentation(discovery: DiscoverySummary | null, finished: boolean, pending = false) {
  const sources=discovery?.sources??[],gaps=sources.flatMap(s=>{const w=sourceWindow(s);return w?.gap?[{source:s.source,reason:w.gap,sourceReason:s.coverage.reason??null,passes:w.passes,
    remaining:(s.coverage.preparationRemaining??{scope:s.coverage.sourceScope,requirement:s.coverage.remainingRequirement,pendingRecords:s.coverage.pendingRecords??null,cursor:s.coverage.remainingCursor??null,scopeComplete:s.coverage.scopeComplete??false,limitations:s.coverage.limitations??[]}) as {scope:unknown;requirement:unknown;pendingRecords:unknown;cursor:unknown;scopeComplete:unknown;limitations:unknown}}]:[]})
  const state=finished?'ended_with_gaps':!pending&&sources.some(transientPause)?'waiting_transient':'discovering'
  const message=finished?'Discovery ended for selection; remaining source scope and access gaps are listed below.':state==='waiting_transient'?'Waiting on a transient pause. Resume this exact run later; no cohort or company work has started.':'Still discovering within the frozen window; no cohort or company work has started.'
  return {discoveryState:state,discoveryMessage:message,discoveryGaps:gaps}
}
