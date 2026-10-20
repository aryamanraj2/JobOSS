import { prepareRecipients } from '../../src/outreach/contacts/prepare.js'
import { StubFetcher } from '../helpers/fixtures.js'
import { importContactRow, CONTACT_IMPORT_COLUMNS } from '../../src/outreach/contacts/import.js'
import { readImportedRow } from '../../src/outreach/contacts/verify-backfill.js'
import { parseCsv } from '../../src/ingest/file/csv.js'
import { contentHashOf } from '../../src/core/evidence/content-hash.js'
import { recipientState } from '../../src/outreach/contacts/verification.js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailProviderAdapter, resetEmailProviderProcessState, chargedCredits, decodeEmailResult, emailProviderSettings, mapEmailStatus, normalizeFind, providerRequest, type EmailGate } from '../../src/outreach/contacts/email-providers.js'
import { EmailProviderLedger, emailInputKey, ledgerRefusal, type EmailProviderSlug, type LedgerEntry, type ProviderAllowance } from '../../src/outreach/contacts/email-ledger.js'
import { emailLookupPlan, emailLookupBounds, readEmailProviderRoute, importEmailResult, lookupEmail, type LookupAdapter } from '../../src/outreach/contacts/email-lookup.js'
import type { EmailLookupResult } from '../../src/outreach/contacts/provider.js'
import { loadEnv } from '../../src/core/config/config.js'
import { writeAudit } from '../../src/core/audit/audit-log.js'
import { Logger } from '../../src/core/logging/logger.js'
import { FetchPolicyGate } from '../../src/core/policy/fetch-policy-gate.js'
import { matchApiContract } from '../../src/core/policy/api-contracts.js'
import { isCompanyDomain } from '../../src/outreach/contacts/classify.js'
import { emailLookupDryRun } from '../../tools/run-email-lookup.js'
import { testDb, truncateAll, closeTestDb } from '../helpers/db.js'
import { mockAgent } from '../setup.js'

const fixtures=JSON.parse(readFileSync(new URL('../fixtures/email-providers/doc-derived.json',import.meta.url),'utf8'))
const now=new Date('2026-10-19T12:00:00Z'), input={firstName:'Jane',lastName:'Doe',domain:'startup.example'}
const allowance: ProviderAllowance={cap:50,model:'one_time'}
const key=()=>`em1-${randomUUID()}`
const result=(overrides: Partial<EmailLookupResult>={}): EmailLookupResult=>({email:'jane@startup.example',status:'deliverable',rawStatus:'valid',fullName:'Jane Doe',title:'CTO',sourceUrl:'https://startup.example/team',observedAt:now.toISOString(),outcome:'result',...overrides})
function fakeGate(body: unknown=fixtures.hunter, statusCode=200, headers: Record<string,string>={}) {
  const response={ok:true as const,response:{body:JSON.stringify(body),statusCode,headers,url:'https://fixture.invalid',truncated:false}}
  return {fetchText:vi.fn(async()=>response),postJson:vi.fn(async()=>response)}
}
function adapter(slug: EmailProviderSlug, gate: EmailGate=fakeGate(fixtures[slug]), options: {balance?:ProviderAllowance;apiKey?:string;clock?:()=>Date}={}) {
  return new EmailProviderAdapter(slug,gate,new EmailProviderLedger(testDb()),{key:options.apiKey ?? key(),secret:key(),verificationAllowance:allowance,allowance:options.balance ?? allowance},'fixture-company',options.clock ?? (()=>now))
}
beforeEach(async()=>{resetEmailProviderProcessState();await truncateAll()})
afterAll(async()=>{await closeTestDb()})

describe('EM1 documented request and status contracts',()=>{
  it.each(['hunter','tomba','prospeo','zerobounce'] as const)('%s request shape matches only its exact contract',slug=>{
    const settings={key:key(),secret:key(),allowance}, operation=slug==='zerobounce'?'verify':'find'
    const r=providerRequest(slug,operation,operation==='find'?input:'jane@startup.example',settings),u=new URL(r.url)
    expect(matchApiContract(r.url,r.method)?.id).toBe(`${slug}.${operation}`)
    expect(matchApiContract(r.url,r.method==='GET'?'POST':'GET')).toBeNull()
    expect(matchApiContract(r.url.replace(u.pathname,u.pathname+'/extra'),r.method)).toBeNull()
    if(slug==='hunter'||slug==='zerobounce') expect(u.searchParams.get('api_key')===settings.key).toBe(true)
    if(slug==='hunter'||slug==='tomba') expect(Object.fromEntries([...u.searchParams].filter(([k])=>k!=='api_key'))).toEqual({domain:input.domain,first_name:input.firstName,last_name:input.lastName})
    if(slug==='tomba') expect(r.headers['X-Tomba-Key']===settings.key&&r.headers['X-Tomba-Secret']===settings.secret).toBe(true)
    if(slug==='prospeo') {expect(r.method).toBe('POST');expect(r.headers['X-KEY']===settings.key).toBe(true);expect(r.body).toEqual({only_verified_email:true,data:{first_name:input.firstName,last_name:input.lastName,company_website:input.domain}})}
    expect(matchApiContract(r.url+'&extra=1',r.method)).toBeNull()
  })
  it.each(['hunter','tomba'] as const)('%s verifier contract and method',slug=>{
    const r=providerRequest(slug,'verify','jane@startup.example',{key:key(),secret:key(),allowance})
    expect(new URL(r.url).searchParams.get('email')).toBe('jane@startup.example')
    expect(matchApiContract(r.url)?.id).toBe(`${slug}.verify`)
  })
  it.each([
    ['hunter','valid','deliverable'],['hunter','accept_all','risky'],['hunter','invalid','invalid'],['hunter','unknown','unknown'],
    ['hunter','Valid','unknown'],['tomba','valid','deliverable'],['tomba','accept_all','risky'],['tomba','disposable','invalid'],
    ['prospeo','VERIFIED','deliverable'],['prospeo','valid','unknown'],['zerobounce','catch-all','risky'],['zerobounce','spamtrap','invalid'],
    ['zerobounce','abuse','invalid'],['zerobounce','do_not_mail','invalid'],['zerobounce','new_status','unknown'],
  ] as const)('%s maps %s to %s',(slug,raw,status)=>{expect(mapEmailStatus(slug,raw)).toBe(status)})
  it.each(['hunter','tomba','prospeo','zerobounce'] as const)('%s decodes doc-derived projection and keeps its raw status',slug=>{
    const r=decodeEmailResult(slug,slug==='zerobounce'?'verify':'find',fixtures[slug],now)
    expect(r.email).toBe('jane@startup.example');expect(r.status).toBe('deliverable');expect(r.rawStatus).toBe(slug==='prospeo'?'VERIFIED':'valid')
  })
  it('Tomba verifier uses data.email.status, never deprecated result',()=>{
    expect(decodeEmailResult('tomba','verify',fixtures.tombaVerify,now).status).toBe('deliverable')
    expect(decodeEmailResult('tomba','verify',{data:{email:{email:'jane@startup.example',result:'deliverable'}}},now).status).toBe('unknown')
  })
  it.each([
    ['hunter','find','valid',1],['hunter','verify','valid',0.5],['hunter','verify','unknown',undefined],
    ['tomba','find','unknown',0],['tomba','find','accept_all',1],['tomba','verify','disposable',0],
    ['zerobounce','verify','unknown',0],['zerobounce','verify','invalid',1],['prospeo','find','VERIFIED',1],['prospeo','find','UNKNOWN',0],
  ] as const)('%s %s %s charged %s',(slug,op,raw,cost)=>expect(chargedCredits(slug,op,result({rawStatus:raw}))).toBe(cost))
  it('no-result costs zero and normalization is stable',()=>{
    expect(chargedCredits('hunter','find',result({email:null}))).toBe(0)
    expect(normalizeFind({firstName:' JANE ',lastName:' DOE ',domain:'https://Startup.Example/team'})).toEqual({firstName:'jane',lastName:'doe',domain:'startup.example'})
    expect(normalizeFind({...input,firstName:' '})).toBeNull()
  })
})

describe('EM1 windows and credit reservation',()=>{
  const entry=(at: string, overrides:Partial<LedgerEntry>={}): LedgerEntry=>({id:randomUUID(),provider:'tomba',operation:'find',inputKey:randomUUID(),at,reserved:1,charged:1,outcome:'result',attempted:true,...overrides})
  it('cap zero refuses and uncertain attempts retain worst case',()=>{
    expect(ledgerRefusal([],'tomba','find',{...allowance,cap:0},1,now)).toBe('provider_balance_disabled')
    expect(ledgerRefusal([{id:'pending',provider:'tomba',operation:'find',inputKey:'pending',at:now.toISOString(),reserved:1}],'tomba','find',{...allowance,cap:1},1,now)).toBe('provider_balance_exhausted')
  })
  it('one-time usage never resets at month boundaries; monthly requires explicit dashboard boundaries',()=>{
    const entries=[entry('2026-09-01T00:00:00Z')]
    expect(ledgerRefusal(entries,'tomba','find',{cap:1,model:'one_time'},1,now)).toBe('provider_balance_exhausted')
    expect(ledgerRefusal(entries,'tomba','find',{cap:1,model:'monthly'},1,now)).toBe('provider_balance_disabled')
    const monthly:ProviderAllowance={cap:1,model:'monthly',start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'}
    expect(ledgerRefusal(entries,'tomba','find',monthly,1,now)).toBeNull()
    expect(ledgerRefusal([],'tomba','find',monthly,1,new Date(monthly.end!))).toBe('provider_balance_disabled')
  })
  it('enforces second and idle-minute counters, including steady traffic beyond a rolling minute',()=>{
    expect(ledgerRefusal([entry('2026-10-19T11:59:59.500Z')],'tomba','find',allowance,1,now)).toBe('provider_second_window')
    expect(ledgerRefusal([entry('2026-10-19T11:59:00Z'),entry('2026-10-19T11:59:50Z')],'tomba','find',allowance,1,now)).toBe('provider_minute_window')
    expect(ledgerRefusal([entry('2026-10-19T11:58:00Z'),entry('2026-10-19T11:58:50Z'),entry('2026-10-19T11:59:40Z')],'tomba','find',allowance,1,now)).toBe('provider_minute_window')
    expect(ledgerRefusal([entry('2026-10-19T11:58:00Z'),entry('2026-10-19T11:59:00Z')],'tomba','find',allowance,1,now)).toBeNull()
  })
  it.each(['find','verify'] as const)('Tomba %s daily counter resets at exactly 00:00 UTC',operation=>{
    const cap=operation==='find'?5:10, entries=Array.from({length:cap},(_,i)=>entry(`2026-10-19T0${Math.floor(i/2)}:${i%2?'30':'00'}:00Z`,{operation}))
    expect(ledgerRefusal(entries,'tomba',operation,allowance,1,new Date('2026-10-19T23:59:59Z'))).toBe('provider_daily_window')
    expect(ledgerRefusal(entries,'tomba',operation,allowance,1,new Date('2026-10-20T00:00:00Z'))).toBeNull()
  })
  it('failed gate checks and 429 are excluded from accepted counters, but pauses are shared',()=>{
    expect(ledgerRefusal([entry(now.toISOString(),{attempted:false,charged:0})],'tomba','find',allowance,1,now)).toBeNull()
    expect(ledgerRefusal([entry(now.toISOString(),{outcome:'http_429',charged:0,pauseUntil:'2026-10-19T12:02:00Z'})],'tomba','verify',allowance,1,now)).toBe('provider_paused')
  })
  it('committed pending reservations serialize duplicate and cross-instance credit use',async()=>{
    const ledger=new EmailProviderLedger(testDb()),other=new EmailProviderLedger(testDb())
    const r=await Promise.all([ledger.reserve('hunter','find','same',{...allowance,cap:1},1,now),other.reserve('hunter','find','same',{...allowance,cap:1},1,now)])
    expect(r.filter(x=>'id' in x)).toHaveLength(1);expect(r.filter(x=>'reason' in x)).toEqual([{reason:'provider_pending'}])
    expect(await other.reserve('hunter','find','different',{...allowance,cap:1},1,now)).toEqual({reason:'provider_balance_exhausted'})
  })
})

describe('EM1 adapter accounting, disabled states, cache and errors',()=>{
  it.each(['hunter','tomba','prospeo','zerobounce'] as const)('%s has no call without key or free cap',async slug=>{
    const gate=fakeGate(),ledger=new EmailProviderLedger(testDb())
    const a=new EmailProviderAdapter(slug,gate,ledger,{allowance},'fixture-company',()=>now)
    expect(a.enabled).toBe(false);await a.findEmail(input);await a.verify('jane@startup.example')
    await adapter(slug,gate,{balance:{...allowance,cap:0}}).findEmail(input)
    expect(gate.fetchText).toHaveBeenCalledTimes(0);expect(gate.postJson).toHaveBeenCalledTimes(0)
  })
  it('Prospeo remains closed even with key and balance because free enrichment is UNCONFIRMED',async()=>{
    const gate=fakeGate(fixtures.prospeo),a=adapter('prospeo',gate)
    expect(a.enabled).toBe(false);expect((await a.findEmail(input)).outcome).toBe('free_plan_UNCONFIRMED');expect(gate.postJson).not.toHaveBeenCalled()
  })
  it.each(['hunter','tomba'] as const)('%s calls only gate with zero vendor and billed spend; caches across adapter instances',async slug=>{
    const gate=fakeGate(fixtures[slug]),a=adapter(slug,gate)
    expect((await a.findEmail(input)).status).toBe('deliverable')
    const b=adapter(slug,gate);await b.findEmail({...input,firstName:' JANE ',domain:'STARTUP.EXAMPLE'})
    expect(gate.fetchText).toHaveBeenCalledTimes(1)
    const calls=gate.fetchText.mock.calls as unknown as [string,Record<string,unknown>][]
    expect(calls[0]?.[1]).toMatchObject({cost:1,vendorCost:0,billedUsd:0,companyId:'fixture-company'})
    const rows=await testDb().auditLog.findMany({where:{action:'email_provider.settled'}})
    expect(rows[0]?.metadata).toMatchObject({charged:1,chargedFlag:true,provider:slug,outcome:'result'})
  })
  it('ZeroBounce address field is verified and unknown is free',async()=>{
    const gate=fakeGate({...fixtures.zerobounce,status:'unknown'}),a=adapter('zerobounce',gate)
    expect((await a.verify(' JANE@STARTUP.EXAMPLE ')).rawStatus).toBe('unknown');await a.verify('jane@startup.example')
    expect(gate.fetchText).toHaveBeenCalledTimes(1)
    const row=await testDb().auditLog.findFirst({where:{action:'email_provider.settled'}});expect(row?.metadata).toMatchObject({charged:0,chargedFlag:false})
  })
  it('Tomba verifier parses nested email and records its separate verifier window',async()=>{
    const a=adapter('tomba',fakeGate(fixtures.tombaVerify));expect((await a.verify('jane@startup.example')).status).toBe('deliverable')
    const row=await testDb().auditLog.findFirst({where:{action:'email_provider.settled'}});expect(row?.metadata).toMatchObject({operation:'verify',charged:1})
  })
  it.each([401,403])('%s disables the provider for the process with no subsequent call',async status=>{
    const gate=fakeGate({},status),a=adapter('hunter',gate);await a.findEmail(input);await a.findEmail({...input,lastName:'Other'})
    expect(a.enabled).toBe(false);await adapter('hunter',gate).findEmail({...input,lastName:'New instance'});expect(gate.fetchText).toHaveBeenCalledTimes(1)
  })
  it.each([{'retry-after':'120'},{'retry-after':'Mon, 19 Oct 2026 12:03:00 GMT'},{}])('429 pauses provider, persists across instances, never retries (%j)',async headers=>{
    const gate=fakeGate({},429,headers),a=adapter('hunter',gate);expect((await a.findEmail(input)).outcome).toBe('http_429')
    expect((await adapter('hunter',gate).findEmail({...input,lastName:'Other'})).outcome).toBe('provider_paused')
    expect(gate.fetchText).toHaveBeenCalledTimes(1)
    const row=await testDb().auditLog.findFirst({where:{action:'email_provider.settled'}});expect(row?.metadata).toMatchObject({charged:0})
  })
  it('451 is a cached gap and never returns an address',async()=>{
    const gate=fakeGate({},451),a=adapter('hunter',gate);expect((await a.findEmail(input)).outcome).toBe('gap_451');await a.findEmail(input)
    expect(gate.fetchText).toHaveBeenCalledTimes(1)
  })
  it('transport uncertainty retains the cap and never echoes an error',async()=>{
    const gate=fakeGate();gate.fetchText.mockRejectedValue(new Error('opaque transport error'))
    const a=adapter('hunter',gate,{balance:{cap:1,model:'one_time'}})
    expect((await a.findEmail(input)).outcome).toBe('transport_uncertain')
    expect((await a.findEmail({...input,lastName:'Other'})).outcome).toBe('provider_balance_exhausted')
    expect(gate.fetchText).toHaveBeenCalledTimes(1)
  })
  it('normalized provider/op/input keys do not collide',()=>{
    expect(emailInputKey('hunter','find',input)).not.toBe(emailInputKey('tomba','find',input))
    expect(emailInputKey('hunter','find',input)).not.toBe(emailInputKey('hunter','verify',input))
  })
})

describe('EM1 cheap-first lookup and importer safety',()=>{
  function stub(slug:EmailProviderSlug,r:EmailLookupResult|null):LookupAdapter {
    return {slug,enabled:true,cached:vi.fn(async()=>null),findEmail:vi.fn(async()=>r ?? result({email:null,status:'unknown'})),verify:vi.fn(async()=>r ?? result({email:null,status:'unknown'}))}
  }
  it('pure configurable order has worst-case costs and optional cheaper Hunter verifier',()=>{
    expect(emailLookupPlan().map(s=>`${s.provider}.${s.operation}`)).toEqual(['hunter.find','tomba.find','zerobounce.verify'])
    expect(emailLookupPlan(['tomba','hunter','tomba'],'hunter')).toEqual([{provider:'tomba',operation:'find',worstCaseCredits:1},{provider:'hunter',operation:'find',worstCaseCredits:1},{provider:'hunter',operation:'verify',worstCaseCredits:0.5}])
  })
  it('cache precedes page, and page precedes finders',async()=>{
    const h=stub('hunter',null),t=stub('tomba',null);vi.mocked(t.cached).mockResolvedValue(result())
    expect((await lookupEmail(input,[h,t],{pagePublished:result()}))?.provider).toBe('tomba');expect(h.findEmail).not.toHaveBeenCalled()
    vi.mocked(t.cached).mockResolvedValue(null)
    expect((await lookupEmail(input,[h,t],{pagePublished:result()}))?.provider).toBe('page');expect(h.findEmail).not.toHaveBeenCalled()
  })
  it('stops immediately on first deliverable and verifies a found risky address',async()=>{
    const h=stub('hunter',result()),t=stub('tomba',result()),z=stub('zerobounce',result())
    expect((await lookupEmail(input,[h,t,z]))?.provider).toBe('hunter');expect(t.findEmail).not.toHaveBeenCalled();expect(z.verify).not.toHaveBeenCalled()
    vi.mocked(h.findEmail).mockResolvedValue(result({status:'risky',rawStatus:'accept_all'}))
    expect((await lookupEmail(input,[h,t,z]))?.provider).toBe('zerobounce');expect(t.findEmail).not.toHaveBeenCalled()
  })
  it('never verifies off-domain results or accepts a verifier swapping mailboxes',async()=>{
    const h=stub('hunter',result({email:'jane@gmail.com'})),z=stub('zerobounce',result())
    expect(await lookupEmail(input,[h,z])).toBeNull();expect(z.verify).not.toHaveBeenCalled()
    vi.mocked(h.findEmail).mockResolvedValue(result({status:'unknown'}));vi.mocked(z.verify).mockResolvedValue(result({email:'other@startup.example'}))
    expect(await lookupEmail(input,[h,z])).toBeNull()
  })
  it.each([['jane@gmail.com','startup.example'],['jane@gmail.com','gmail.com'],['jane@greenhouse.io','greenhouse.io'],['jane@jobs.lever.co','lever.co'],['jane@sub.getro.com','getro.com']])('rejects vendor/free-mail %s for %s',async(email,domain)=>{
    expect(isCompanyDomain(email,domain)).toBe(false);expect((await importEmailResult(testDb(),domain,'hunter',result({email}),{...input,domain})).outcome).toBe('off_domain')
  })
  it('reuses importer, verifies only attested verdict and leaves independent identity unverified',async()=>{
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    expect((await importEmailResult(testDb(),input.domain,'prospeo',result({rawStatus:'VERIFIED'}),input)).outcome).toBe('imported')
    const c=await testDb().contact.findFirstOrThrow();expect(c).toMatchObject({verified:true,discoveryMethod:'lookup_provider',suitability:'technical_leader',identityVerifiedAt:null})
    const e=await testDb().evidence.findUniqueOrThrow({where:{id:c.evidenceId}});expect(e).toMatchObject({sourceUrl:'provider-api://prospeo',sourceType:'external_source',fetchedVia:'structured_feed'})
    expect(await testDb().draft.count()).toBe(0)
  })
  it('unknown responsibility remains visible, but a supplied unsupported verdict cannot verify',async()=>{
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    await importEmailResult(testDb(),input.domain,'hunter',result({rawStatus:'Valid',title:null}),input)
    expect(await testDb().contact.findFirstOrThrow()).toMatchObject({verified:false,suitability:'unknown'})
  })
  it('commercial responsibility is refused; dry import and CLI write nothing',async()=>{
    expect((await importEmailResult(testDb(),input.domain,'hunter',result({title:'Sales Director'}),input)).outcome).toBe('recipient_unsuitable')
    expect(()=>emailLookupDryRun(['--company-id','fixture-company'])).toThrow('email_lookup_requires_authorized_run')
    expect(emailLookupDryRun(['--company-id','fixture-company','--dry-run'])).toMatchObject({execution:'isolation_blocked',vendorCredits:0,billedUsd:0})
    expect(await testDb().auditLog.count()).toBe(0)
  })
})

describe('EM1 real gate and redaction boundary (mock transport only)',()=>{
  async function setupGate(cap=20) {
    const db=testDb();await db.hostPolicy.create({data:{host:'api.hunter.io',mode:'allow',origin:'seed_static'}})
    await db.researchBudget.create({data:{companyId:null,periodMonth:'2026-10',creditsCap:cap,billedUsdCap:0,vendorCreditsCap:0}})
    return new FetchPolicyGate(db,{userAgent:'EM1-fixture',robotsTtlSeconds:60,defaultRateDelayMs:0,now:()=>now})
  }
  it('GET exact API contract uses no robots, spends only research credits, redacts query key at audit sink',async()=>{
    const gate=await setupGate(),secret=key()
    mockAgent.get('https://api.hunter.io').intercept({path:/^\/v2\/email-finder\?/,method:'GET'}).reply(200,fixtures.hunter)
    const request=providerRequest('hunter','find',input,{key:secret,allowance})
    const r=await gate.fetchText(request.url,{cost:1,vendorCost:0,billedUsd:0});expect(r.ok).toBe(true)
    const logs:unknown[]=[];new Logger(record=>logs.push(record)).error('test',{url:request.url,'X-KEY':secret,'X-Tomba-Key':secret,'X-Tomba-Secret':secret})
    await writeAudit(testDb(),{actorType:'system',actorId:'em1',action:'fixture',subjectType:'Url',subjectId:request.url,metadata:{url:request.url,'X-KEY':secret}})
    const rows=await testDb().auditLog.findMany();expect(JSON.stringify({rows,logs}).includes(secret)).toBe(false)
    expect(rows.some(row=>row.action==='fetch.robots_performed')).toBe(false)
    const b=await testDb().researchBudget.findFirstOrThrow();expect(b).toMatchObject({creditsSpent:1,vendorCreditsSpent:0,vendorCreditsCap:0});expect(Number(b.billedUsdSpent)).toBe(0)
  })
  it('zero research cap prevents any provider transport',async()=>{
    const gate=await setupGate(0),request=providerRequest('hunter','find',input,{key:key(),allowance})
    expect(await gate.fetchText(request.url)).toEqual({ok:false,reason:'budget_exhausted'} as const)
  })
  it('unknown provider path and malformed POST fail closed before any robots or network',async()=>{
    const gate=await setupGate()
    expect(await gate.fetchText('https://api.hunter.io/v2/account')).toEqual({ok:false,reason:'host_denied'} as const)
    expect(await gate.postJson('https://api.prospeo.io/enrich-person',{only_verified_email:false})).toEqual({ok:false,reason:'host_denied'} as const)
    expect(await testDb().auditLog.count({where:{action:'fetch.performed'}})).toBe(0)
  })
  it('config has optional keys, zero balance defaults, and rejects negative balances',()=>{
    const source={DATABASE_URL:'fixture',SUPPRESSION_HMAC_SALT:'fixture',USER_AGENT:'fixture'}
    const settings=emailProviderSettings(loadEnv(source));expect(Object.values(settings).every(s=>s.key===undefined&&s.allowance.cap===0)).toBe(true)
    expect(()=>loadEnv({...source,HUNTER_FREE_CREDITS:'-1'})).toThrow('Invalid environment')
  })
})

describe('EM1 conservative edge cases',()=>{
  it('Tomba verifier cannot borrow search credits and Hunter verifier needs a confirmed unified pool',async()=>{
    const gate=fakeGate(fixtures.tombaVerify),ledger=new EmailProviderLedger(testDb())
    const t=new EmailProviderAdapter('tomba',gate,ledger,{key:key(),secret:key(),allowance},'fixture-company',()=>now)
    expect((await t.verify('jane@startup.example')).outcome).toBe('provider_balance_disabled')
    const h=adapter('hunter',gate)
    expect((await h.verify('jane@startup.example')).outcome).toBe('credit_pool_UNCONFIRMED');expect(gate.fetchText).not.toHaveBeenCalled()
  })
  it('malformed data retains a conservative reservation, never an attested contact',async()=>{
    const gate=fakeGate({data:{email:'jane@startup.example'}}),a=adapter('hunter',gate,{balance:{cap:1,model:'one_time'}})
    expect((await a.findEmail(input)).outcome).toBe('malformed_result')
    expect((await a.findEmail({...input,lastName:'Other'})).outcome).toBe('provider_balance_exhausted')
    const row=await testDb().auditLog.findFirstOrThrow({where:{action:'email_provider.settled'}})
    expect(row.metadata).toMatchObject({chargedFlag:null})
  })
  it('a cached miss is free and expires without refreshing its observation time',async()=>{
    let time=now;const gate=fakeGate({data:{email:null}}),a=adapter('hunter',gate,{clock:()=>time})
    const first=await a.findEmail(input);time=new Date(now.getTime()+60000)
    expect(await a.findEmail(input)).toEqual(first);expect(gate.fetchText).toHaveBeenCalledTimes(1)
    time=new Date(now.getTime()+86400000);expect((await a.findEmail(input)).observedAt).toBe(time.toISOString());expect(gate.fetchText).toHaveBeenCalledTimes(2)
  })
  it('monthly cache ends with the declared dashboard window',async()=>{
    let time=now;const gate=fakeGate(),a=adapter('hunter',gate,{clock:()=>time,balance:{cap:10,model:'monthly',start:'2026-10-01T00:00:00Z',end:'2026-10-19T13:00:00Z'}})
    await a.findEmail(input);time=new Date('2026-10-19T13:00:00Z')
    expect((await a.findEmail(input)).outcome).toBe('provider_disabled');expect(gate.fetchText).toHaveBeenCalledTimes(1)
  })
  it('an unresolved reservation blocks other work on the same provider before network',async()=>{
    const ledger=new EmailProviderLedger(testDb())
    await ledger.reserve('hunter','find','in-flight',allowance,1,now)
    expect(await ledger.reserve('hunter','verify','other',allowance,0.5,new Date(now.getTime()+2000))).toEqual({reason:'provider_pending'})
  })
  it('gate refusal is a free non-attempt and does not consume the provider window',async()=>{
    const gate:EmailGate={fetchText:vi.fn(async()=>({ok:false,reason:'budget_exhausted'} as const)),postJson:vi.fn(async()=>({ok:false,reason:'host_denied'} as const))}
    expect((await adapter('hunter',gate).findEmail(input)).outcome).toBe('gate_budget_exhausted')
    const row=await testDb().auditLog.findFirstOrThrow({where:{action:'email_provider.settled'}})
    expect(row.metadata).toMatchObject({attempted:false,charged:0,chargedFlag:false})
  })
  it('masked or malformed mailbox values are never company-domain evidence',()=>{
    expect(isCompanyDomain('jane.*****@startup.example',input.domain)).toBe(false)
    expect(isCompanyDomain('other@jane@startup.example',input.domain)).toBe(false)
  })
})

describe('EM1 published address and duplicate-window rules',()=>{
  it('verifies a published address before attempting any finder',async()=>{
    const h:LookupAdapter={slug:'hunter',enabled:true,cached:vi.fn(async()=>null),findEmail:vi.fn(async()=>result()),verify:vi.fn(async()=>result())}
    const z:LookupAdapter={...h,slug:'zerobounce',verify:vi.fn(async()=>result())}
    expect((await lookupEmail(input,[h,z],{pagePublished:result({status:'unknown',rawStatus:'unknown'})}))?.provider).toBe('zerobounce')
    expect(h.findEmail).not.toHaveBeenCalled()
  })
  it('Tomba keeps an answer for the documented 30-day window with no extra call',async()=>{
    let time=now;const gate=fakeGate(fixtures.tomba),a=adapter('tomba',gate,{clock:()=>time})
    const first=await a.findEmail(input);time=new Date(now.getTime()+29*86400000)
    expect(await a.findEmail(input)).toEqual(first);expect(gate.fetchText).toHaveBeenCalledTimes(1)
  })
})


describe('EM1 boundary completion and combined provenance',()=>{
  it('a request crossing midnight or billing renewal consumes the new window conservatively',()=>{
    const entries:LedgerEntry[]=[{id:'crossing',provider:'tomba',operation:'find',inputKey:'crossing',at:'2026-10-19T23:59:59Z',settledAt:'2026-10-20T00:00:01Z',reserved:1,charged:1,outcome:'result',attempted:true}]
    const at=new Date('2026-10-20T00:00:02Z')
    expect(ledgerRefusal(entries,'tomba','find',{cap:1,model:'monthly',start:'2026-10-20T00:00:00Z',end:'2026-11-19T00:00:00Z'},1,at)).toBe('provider_balance_exhausted')
    expect(ledgerRefusal(Array.from({length:5},(_,i)=>({...entries[0]!,id:String(i)})),'tomba','find',allowance,1,new Date('2026-10-20T00:02:00Z'))).toBe('provider_daily_window')
    expect(ledgerRefusal(entries,'tomba','find',allowance,1,new Date('2026-10-20T00:00:01.500Z'))).toBe('provider_second_window')
  })
  it('combined lookup evidence names both finder and verifier without promoting identity',async()=>{
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    const found=result({finderProvider:'hunter'})
    await importEmailResult(testDb(),input.domain,'zerobounce',found,input)
    const c=await testDb().contact.findFirstOrThrow();expect(c.identityVerifiedAt).toBeNull()
    const e=await testDb().evidence.findUniqueOrThrow({where:{id:c.evidenceId}})
    expect(e.sourceUrl).toBe('provider-api://hunter%2Bzerobounce');expect(JSON.parse(e.excerpt)).toMatchObject({f:'hunter',a:'zerobounce'})
  })
})


describe('EM1 encoded credential redaction',()=>{
  it('redacts an encoded query key even before a secret value has been registered',async()=>{
    const secret=key(), url=`https://api.hunter.io/v2/email-finder?api%5Fkey=${secret}`
    const records:unknown[]=[];new Logger(r=>records.push(r)).warn('transport',{url})
    await writeAudit(testDb(),{actorType:'system',actorId:'fixture',action:'fixture',subjectType:'Url',subjectId:url,metadata:{url}})
    expect(JSON.stringify({records,rows:await testDb().auditLog.findMany()}).includes(secret)).toBe(false)
  })
})

describe('EM1 named POST exception',()=>{
  it('permits only the Prospeo verified-email enrichment shape through the real gate',async()=>{
    const db=testDb();await db.hostPolicy.create({data:{host:'api.prospeo.io',mode:'allow',origin:'seed_static'}})
    await db.researchBudget.create({data:{companyId:null,periodMonth:'2026-10',creditsCap:2,billedUsdCap:0,vendorCreditsCap:0}})
    const gate=new FetchPolicyGate(db,{userAgent:'EM1-fixture',robotsTtlSeconds:60,defaultRateDelayMs:0,now:()=>now})
    const r=providerRequest('prospeo','find',input,{key:key(),allowance})
    mockAgent.get('https://api.prospeo.io').intercept({path:'/enrich-person',method:'POST',body:JSON.stringify(r.body)}).reply(200,fixtures.prospeo)
    expect((await gate.postJson(r.url,r.body,{headers:r.headers,cost:1,vendorCost:0,billedUsd:0})).ok).toBe(true)
    expect(await gate.postJson(r.url,{...(r.body as object),enrich_mobile:true})).toEqual({ok:false,reason:'host_denied'})
    expect(await gate.postJson('https://api.prospeo.io/enrich-company',r.body)).toEqual({ok:false,reason:'host_denied'})
    expect(await db.auditLog.count({where:{action:'fetch.performed'}})).toBe(1)
  })
})


describe('EM1C C1/C2/C3 red reproducers',()=>{
  it('reports the three reachable q7 verification branches and excludes disabled Prospeo',async()=>{
    const calls:string[]=[]
    const fake=(slug:'hunter'|'tomba'|'zerobounce',email:string):LookupAdapter=>({slug,enabled:true,cached:async()=>null,
      findEmail:async()=>{calls.push(`${slug}.find`);return result({email,status:'risky',rawStatus:'accept_all'})},
      verify:async(email)=>{calls.push(`${slug}.verify`);return result({email,status:'risky',rawStatus:'catch-all'})}})
    expect(await lookupEmail(input,[fake('hunter','jane.doe@startup.example'),fake('tomba','j.doe@startup.example'),fake('zerobounce','')],
      {pagePublished:result({email:'jane@startup.example',status:'unknown',rawStatus:'unknown'})})).toBeNull()
    expect(calls.filter(c=>c==='zerobounce.verify')).toHaveLength(3)
    const plan=emailLookupDryRun(['--company-id','fixture-company','--dry-run'])
    expect(plan.worstCaseCredits.zerobounce).toBe(3)
    expect(emailLookupPlan().filter(s=>s.operation==='find').map(s=>s.provider)).toEqual(['hunter','tomba'])
  })
  it('rejects the q8NameMismatch Jane-to-Bob substitution without a verifier call',async()=>{
    const verify=vi.fn(async()=>result()),h:LookupAdapter={slug:'hunter',enabled:true,cached:async()=>null,
      findEmail:async()=>result({email:'bob.smith@startup.example',fullName:'Bob Smith'}),verify}
    expect(await lookupEmail(input,[h])).toBeNull();expect(verify).not.toHaveBeenCalled()
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
  it('machine lookup/import reaches independent identity research in the actual recipientState path',async()=>{
    const db=testDb();await db.company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    const h:LookupAdapter={slug:'hunter',enabled:true,cached:async()=>null,findEmail:async()=>result(),verify:async()=>result()}
    const found=await lookupEmail(input,[h]);expect(found).not.toBeNull()
    // The explicit request is intentionally the fifth argument for the corrected import contract.
    await importEmailResult(db,input.domain,'hunter',found!.result,input)
    const c=await db.contact.findFirstOrThrow()
    expect((await recipientState(db,c,input.domain,now)).detail).toMatch(/^Person identity/)
    expect(c.identityVerifiedAt).toBeNull()
  })
})

describe('EM1C truthful bounds and CLI counts',()=>{
  it('sums shared-pool roles, deduplicates executable steps and scales 20 people',()=>{
    const defaults=emailLookupBounds(emailLookupPlan(),20)
    expect(defaults.perPerson.providers).toEqual({hunter:{maxCalls:1,credits:1},tomba:{maxCalls:1,credits:1},zerobounce:{maxCalls:3,credits:3}})
    expect(defaults.aggregate.providers).toEqual({hunter:{maxCalls:20,credits:20},tomba:{maxCalls:20,credits:20},zerobounce:{maxCalls:60,credits:60}})
    const plan=emailLookupPlan(['hunter','tomba','hunter'],'hunter'), shared=emailLookupBounds([...plan,...plan],20)
    expect(shared.perPerson.providers).toEqual({hunter:{maxCalls:4,credits:2.5},tomba:{maxCalls:1,credits:1}})
    expect(shared.aggregate.providers.hunter).toEqual({maxCalls:80,credits:50})
    expect(emailLookupBounds(emailLookupPlan(['prospeo','hunter'])).perPerson.providers.prospeo?.credits).toBe(1)
    expect(()=>emailLookupBounds([{provider:'hunter',operation:'find',worstCaseCredits:0}])).toThrow('invalid_email_lookup_plan')
  })
  it('CLI reports default one-person and explicit 20-person maxima, with Prospeo separately blocked',async()=>{
    const one=emailLookupDryRun(['--company-id','fixture-company','--dry-run'])
    const twenty=emailLookupDryRun(['--company-id','fixture-company','--dry-run','--people','20'])
    expect(one.people).toBe(1);expect(one.worstCaseCredits).toEqual({hunter:1,tomba:1,zerobounce:3})
    expect(twenty.aggregate.providers.zerobounce).toEqual({maxCalls:60,credits:60})
    expect(one.blockedProviders).toEqual([{provider:'prospeo',reason:'free_plan_UNCONFIRMED'}])
    expect(one.plannedCalls.find(s=>s.operation==='verify')).toMatchObject({unitCredits:1,maxCalls:3,credits:3})
    expect(await testDb().auditLog.count()).toBe(0);expect(await testDb().contact.count()).toBe(0)
  })
  it.each(['0','-1','101','1.2','NaN','Infinity','1e309','', '--dry-run'])('invalid people count %s fails without activity',async value=>{
    expect(()=>emailLookupDryRun(['--company-id','fixture-company','--dry-run','--people',value])).toThrow()
    expect(await testDb().auditLog.count()).toBe(0)
  })
  it.each([
    ['--company-id','x','--dry-run','--people'],['--company-id','x','--dry-run','--people','1','--people','2'],
    ['--company-id','x','--dry-run','--dry-run'],['--company-id','x','--company-id','y','--dry-run'],
    ['--dry-run'],['--company-id','--dry-run'],['--company-id','x','--dry-run','--unknown','2'],
  ])('missing/duplicate/unknown flags %j fail before any activity',async(...args)=>{
    expect(()=>emailLookupDryRun(args)).toThrow();expect(await testDb().auditLog.count()).toBe(0)
  })
})

const namedStub=(slug: 'hunter'|'tomba'|'zerobounce', value: EmailLookupResult):LookupAdapter=>({slug,enabled:true,
  cached:vi.fn(async()=>null),findEmail:vi.fn(async()=>value),verify:vi.fn(async()=>value)})

describe('EM1C requested-person binding',()=>{
  it.each([null,'','Jane','J. Doe','Bob Smith','Jane Doe / Bob Smith','Jane Mary Doe'])('missing/ambiguous/conflicting name %s is unresolved without verification',async fullName=>{
    const h=namedStub('hunter',result({fullName,status:'risky'})),z=namedStub('zerobounce',result())
    expect(await lookupEmail(input,[h,z])).toBeNull();expect(z.verify).not.toHaveBeenCalled()
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
  it('wrong cached and fresh responses cannot replace the request; a subsequent matched provider succeeds',async()=>{
    const h=namedStub('hunter',result({fullName:'Bob Smith'})),t=namedStub('tomba',result())
    vi.mocked(h.cached).mockResolvedValue(result({fullName:'Bob Smith'}))
    const out=await lookupEmail(input,[h,t]);expect(out?.provider).toBe('tomba')
    expect(out?.result.request).toEqual({firstName:'jane',lastName:'doe',domain:input.domain})
    expect(out?.result.fullName).toBe('Jane Doe')
  })
  it('normalizes complete multiword names without reducing them to shared tokens',async()=>{
    const request={firstName:' JANE   MARY ',lastName:' VAN  DOE ',domain:'STARTUP.EXAMPLE'}
    const h=namedStub('hunter',result({fullName:' Jane Mary  Van Doe '}))
    expect((await lookupEmail(request,[h]))?.result.request).toEqual({firstName:'jane mary',lastName:'van doe',domain:input.domain})
    vi.mocked(h.findEmail).mockResolvedValue(result({fullName:'Jane Doe'}));expect(await lookupEmail(request,[h])).toBeNull()
  })
  it('verifier cannot replace the matched identity, source, original observation or mailbox',async()=>{
    const original=result({status:'risky',rawStatus:'accept_all',observedAt:'2026-10-18T12:00:00.000Z'})
    const h=namedStub('hunter',original),z=namedStub('zerobounce',result({fullName:'Bob Smith',title:'CEO',sourceUrl:'https://other.example/team'}))
    const out=await lookupEmail(input,[h,z]);expect(out?.result).toMatchObject({fullName:'Jane Doe',title:'CTO',sourceUrl:original.sourceUrl,
      observedAt:original.observedAt,finderProvider:'hunter',request:{firstName:'jane',lastName:'doe',domain:input.domain}})
    vi.mocked(z.verify).mockResolvedValue(result({fullName:null}));expect((await lookupEmail(input,[h,z]))?.result.fullName).toBe('Jane Doe')
    vi.mocked(z.verify).mockResolvedValue(result({email:'bob@startup.example'}));expect(await lookupEmail(input,[h,z])).toBeNull()
  })
  it('a wrong-person adapter result retains its charged ledger/cache history',async()=>{
    const gate=fakeGate({data:{email:'bob@startup.example',first_name:'Bob',last_name:'Smith',verification:{status:'valid'}}})
    const h=adapter('hunter',gate),z=namedStub('zerobounce',result())
    expect(await lookupEmail(input,[h,z])).toBeNull();expect(z.verify).not.toHaveBeenCalled()
    const rows=await testDb().auditLog.findMany({where:{action:'email_provider.settled'}})
    expect(rows).toHaveLength(1);expect(rows[0]?.metadata).toMatchObject({charged:1,chargedFlag:true,result:{fullName:'Bob Smith'}})
    expect((await h.findEmail(input)).fullName).toBe('Bob Smith');expect(gate.fetchText).toHaveBeenCalledTimes(1)
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
  it.each(['missing','wrong_name','foreign_domain','embedded_conflict'])('direct importer refuses %s binding with no contact/evidence writes',async mode=>{
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    const r=result(mode==='wrong_name'?{fullName:'Bob Smith'}:mode==='embedded_conflict'?{request:{...input,firstName:'Bob'}}:{})
    const q=mode==='missing'?undefined:mode==='foreign_domain'?{...input,domain:'foreign.example'}:input
    expect((await importEmailResult(testDb(),input.domain,'hunter',r,q)).outcome).toBe('request_binding_refused')
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
})

async function machineWorld(overrides: Partial<EmailLookupResult>={}) {
  const db=testDb(),company=await db.company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
  const h=namedStub('hunter',result({...overrides})),found=await lookupEmail(input,[h])
  expect(found).not.toBeNull();expect((await importEmailResult(db,input.domain,'hunter',found!.result,input)).outcome).toBe('imported')
  const contact=await db.contact.findFirstOrThrow(),route=await db.evidence.findUniqueOrThrow({where:{id:contact.evidenceId}})
  return {db,company,contact,route}
}
const identityHtml='<html><body><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Person',name:'Jane Doe',jobTitle:'CTO',worksFor:{'@type':'Organization',name:'Startup',url:'https://startup.example'}})+'</script></body></html>'

describe('EM1C machine provenance production path',()=>{
  it('actual lookup/import/readiness and bounded employer capture can establish independent identity',async()=>{
    const {db,company,contact,route}=await machineWorld({sourceUrl:null})
    expect(route.excerpt.length).toBeLessThanOrEqual(500);expect(JSON.parse(route.excerpt)).toMatchObject({q:['jane','doe',input.domain],e:contact.emailNormalized,f:'hunter',a:'hunter',s:'valid'})
    expect(readImportedRow({...route,emailNormalized:contact.emailNormalized})).toEqual({ok:false,reason:'not_operator_entry'})
    expect(readEmailProviderRoute(route,contact,input.domain)).toBe(true)
    expect((await recipientState(db,contact,input.domain,now)).detail).toMatch(/^Person identity/)
    const sources=new StubFetcher({'https://startup.example/team':{body:identityHtml}})
    const prepared=await prepareRecipients(db,sources,[company.id],{now,maxPages:1,interPageDelayMs:0})
    expect(prepared.selected).toEqual([{companyId:company.id,contactId:contact.id}])
    const current=await db.contact.findUniqueOrThrow({where:{id:contact.id}})
    expect((await recipientState(db,current,input.domain,now)).ready).toBe(true)
    const research=await db.contactResearch.findUniqueOrThrow({where:{contactId:contact.id}})
    expect(JSON.stringify(research.facts)).toContain('"version":3')
    expect(current.identitySourceUrl).toBe('https://startup.example/team');expect(sources.requested).toEqual(['https://startup.example/team'])
  })
  it('missing and fabricated identity flags do not become ready from a valid SMTP projection',async()=>{
    const {db,company,contact}=await machineWorld()
    const missing=await prepareRecipients(db,new StubFetcher({}),[company.id],{now,maxPages:1,interPageDelayMs:0})
    expect(missing.selected).toHaveLength(0)
    const c=await db.contact.update({where:{id:contact.id},data:{identityVerifiedAt:now}})
    await db.contactResearch.update({where:{contactId:c.id},data:{identityStatus:'verified',verifiedAt:now,facts:[],hooks:[],citedEvidenceIds:[c.evidenceId]}})
    expect((await recipientState(db,c,input.domain,now)).ready).toBe(false)
  })
  it('preserves unchanged hand-entered CSV attestation and its production research path',async()=>{
    const db=testDb(),company=await db.company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    const parsed=parseCsv(CONTACT_IMPORT_COLUMNS.join(',')+'\nstartup.example,jane@startup.example,Jane Doe,CTO,named_employee,hunter,https://startup.example/team,,valid')
    await importContactRow(db,parsed.rows[0]!,{provider:'hunter',operator:'fixture'},now)
    const c=await db.contact.findFirstOrThrow(),e=await db.evidence.findUniqueOrThrow({where:{id:c.evidenceId}})
    expect(e.sourceUrl).toBe('operator-entry://hunter/fixture');expect(readImportedRow({...e,emailNormalized:c.emailNormalized}).ok).toBe(true)
    expect((await recipientState(db,c,input.domain,now)).detail).toMatch(/^Person identity/)
    const p=await prepareRecipients(db,new StubFetcher({'https://startup.example/team':{body:identityHtml}}),[company.id],{now,maxPages:1,interPageDelayMs:0})
    expect(p.selected).toEqual([{companyId:company.id,contactId:c.id}])
  })
  it('refuses oversize projections before the unchanged writer can truncate them',async()=>{
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    expect((await importEmailResult(testDb(),input.domain,'hunter',result({sourceUrl:'https://startup.example/'+ 'x'.repeat(600)}),input)).outcome).toBe('projection_too_large')
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
  it('a complete 500-character JSON projection is recoverable without treating it as truncated CSV',async()=>{
    const first=await machineWorld(), length=first.route.excerpt.length
    await truncateAll();const w=await machineWorld({sourceUrl:result().sourceUrl!+'x'.repeat(500-length)})
    expect(w.route.excerpt.length).toBe(500);expect((await recipientState(w.db,w.contact,input.domain,now)).detail).toMatch(/^Person identity/)
  })
  it.each(['json','truncated','missing_binding','wrong_mailbox','wrong_person','wrong_domain','wrong_provider','wrong_status','wrong_time','source_type','fetched_via','hash','title','version','extra_key'])('rejects %s machine provenance through actual recipientState',async mode=>{
    const {db,contact,route}=await machineWorld(),p=JSON.parse(route.excerpt)
    if(mode==='missing_binding')delete p.q
    if(mode==='wrong_mailbox')p.e='other@startup.example'
    if(mode==='wrong_person')p.n='Bob Smith'
    if(mode==='wrong_domain')p.q[2]='foreign.example'
    if(mode==='wrong_provider')p.a='invented'
    if(mode==='wrong_status')p.s='Valid'
    if(mode==='wrong_time')p.o='2026-10-18T12:00:00.000Z'
    if(mode==='title')p.t='CEO'
    if(mode==='version')p.v=2
    if(mode==='extra_key')p.verified=true
    let excerpt=JSON.stringify(p)
    if(mode==='json')excerpt='not-json'
    if(mode==='truncated')excerpt=excerpt.slice(0,-1)
    const e=await db.evidence.update({where:{id:route.id},data:{excerpt,
      contentHash:mode==='hash'?'invalid':contentHashOf({provider:'hunter',operator:'email-provider',email:contact.emailNormalized,row:excerpt}),
      ...(mode==='source_type'?{sourceType:'user_hint' as const}:{}),...(mode==='fetched_via'?{fetchedVia:'static_fetch'}:{})}})
    expect(readEmailProviderRoute(e,contact,input.domain)).toBe(false)
    const state=await recipientState(db,contact,input.domain,now);expect(state.ready).toBe(false);expect(state.detail).toMatch(/^Machine provider route/)
  })
  it('refuses foreign contact/company/evidence bindings even with a valid serialized projection',async()=>{
    const {route,contact}=await machineWorld()
    expect(readEmailProviderRoute({...route,companyId:randomUUID()},contact,input.domain)).toBe(false)
    expect(readEmailProviderRoute({...route,contactId:randomUUID()},contact,input.domain)).toBe(false)
    expect(readEmailProviderRoute({...route,id:randomUUID()},contact,input.domain)).toBe(false)
  })
})

describe('EM1C executable deduplication and final binding edges',()=>{
  it.each(['careers@startup.example','info@startup.example'])('keeps role mailbox %s outside the named-person lookup/import flow',async email=>{
    const r=result({email,status:'risky'}),h=namedStub('hunter',r),z=namedStub('zerobounce',result({email}))
    expect(await lookupEmail(input,[h,z],{pagePublished:r})).toBeNull();expect(z.verify).not.toHaveBeenCalled()
    vi.mocked(h.cached).mockResolvedValue({...r,status:'deliverable'})
    expect(await lookupEmail(input,[h,z])).toBeNull()
    await testDb().company.create({data:{canonicalDomain:input.domain,displayName:'Startup'}})
    expect((await importEmailResult(testDb(),input.domain,'hunter',result({email}),input)).outcome).toBe('named_route_required')
    expect(await testDb().contact.count()).toBe(0);expect(await testDb().evidence.count()).toBe(0)
  })
  it('a machine Contact cannot bypass independent named-person identity by becoming an alias',async()=>{
    const {db,contact}=await machineWorld()
    const c=await db.contact.update({where:{id:contact.id},data:{contactType:'careers_alias'}})
    const state=await recipientState(db,c,input.domain,now)
    expect(state.ready).toBe(false);expect(state.detail).toMatch(/^Machine provider route/)
  })
  it('actual duplicate/multiple-verifier branches agree with the shared structural bound',async()=>{
    const h=namedStub('hunter',result({email:'jane.doe@startup.example',status:'risky'})),t=namedStub('tomba',result({email:'j.doe@startup.example',status:'risky'})),z=namedStub('zerobounce',result({status:'risky'}))
    const original=emailLookupPlan(['hunter','tomba','hunter'],'hunter')
    original.push({provider:'zerobounce',operation:'verify',worstCaseCredits:1})
    const plan=[...original,...original]
    expect(await lookupEmail(input,[h,t,z],{plan,pagePublished:result({status:'unknown'})})).toBeNull()
    expect(h.findEmail).toHaveBeenCalledTimes(1);expect(t.findEmail).toHaveBeenCalledTimes(1)
    expect(h.verify).toHaveBeenCalledTimes(3);expect(z.verify).toHaveBeenCalledTimes(3)
    expect(emailLookupBounds(plan).perPerson.providers).toEqual({hunter:{maxCalls:4,credits:2.5},tomba:{maxCalls:1,credits:1},zerobounce:{maxCalls:3,credits:3}})
    expect(emailLookupDryRun(['--dry-run','--people','100','--company-id','fixture']).aggregate.providers.zerobounce?.credits).toBe(300)
  })
  it('existing Contact name/mailbox fields cannot be rebound to another person behind valid JSON',async()=>{
    const {db,contact}=await machineWorld()
    let c=await db.contact.update({where:{id:contact.id},data:{fullName:'Bob Smith'}})
    expect((await recipientState(db,c,input.domain,now)).detail).toMatch(/^Machine provider route/)
    c=await db.contact.update({where:{id:contact.id},data:{fullName:'Jane Doe',emailNormalized:'other@startup.example'}})
    expect((await recipientState(db,c,input.domain,now)).detail).toMatch(/^Machine provider route/)
  })
  it('valid-but-different provider labels and malformed source pointers do not pass projection checks',async()=>{
    const {db,contact,route}=await machineWorld(),p=JSON.parse(route.excerpt)
    p.a='tomba'
    let excerpt=JSON.stringify(p)
    let e=await db.evidence.update({where:{id:route.id},data:{excerpt,contentHash:contentHashOf({provider:'hunter+tomba',operator:'email-provider',email:contact.emailNormalized,row:excerpt})}})
    expect((await recipientState(db,contact,input.domain,now)).detail).toMatch(/^Machine provider route/)
    expect(readEmailProviderRoute(e,contact,input.domain)).toBe(false)
    p.a='hunter';p.u='https://startup.example/team?api_key=placeholder'
    excerpt=JSON.stringify(p)
    e=await db.evidence.update({where:{id:route.id},data:{excerpt,contentHash:contentHashOf({provider:'hunter',operator:'email-provider',email:contact.emailNormalized,row:excerpt})}})
    expect(readEmailProviderRoute(e,contact,input.domain)).toBe(false)
  })
})
