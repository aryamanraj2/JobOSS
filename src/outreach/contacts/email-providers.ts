import type { Env } from '../../core/config/config.js'
import { registerSecretValue, redact } from '../../core/logging/redact.js'
import type { FetchPolicyGate } from '../../core/policy/fetch-policy-gate.js'
import { matchApiContract } from '../../core/policy/api-contracts.js'
import { canonicalizeDomain } from '../../ingest/domain/canonicalize.js'
import type { EmailFindInput, EmailLookupResult, EmailStatus, VerifiedContactProvider } from './provider.js'
import { EmailProviderLedger, allowanceActive, emailInputKey, type EmailOperation, type EmailProviderSlug, type ProviderAllowance } from './email-ledger.js'

const disabledForProcess = new Set<EmailProviderSlug>()
/** Test seam only. Production resets this state by restarting the process. */
export function resetEmailProviderProcessState(): void { disabledForProcess.clear() }

export type EmailGate = Pick<FetchPolicyGate, 'fetchText' | 'postJson'>
export type ProviderSettings = { key?: string | undefined; secret?: string | undefined; allowance: ProviderAllowance; verificationAllowance?: ProviderAllowance; unifiedCredits?: boolean }
type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {}
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null
const blank = (now: Date, outcome: string): EmailLookupResult => ({email:null,status:'unknown',rawStatus:'unknown',fullName:null,title:null,sourceUrl:null,observedAt:now.toISOString(),outcome})

export function mapEmailStatus(provider: EmailProviderSlug, raw: string): EmailStatus {
  if (raw === (provider === 'prospeo' ? 'VERIFIED' : 'valid')) return 'deliverable'
  if (['invalid','spamtrap','abuse','do_not_mail','disposable','INVALID'].includes(raw)) return 'invalid'
  if (['accept_all','catch-all','risky','webmail','CATCH_ALL'].includes(raw)) return 'risky'
  return 'unknown'
}
export function normalizeFind(input: EmailFindInput): EmailFindInput | null {
  const domain = canonicalizeDomain(input.domain), firstName=input.firstName.trim().toLowerCase(), lastName=input.lastName.trim().toLowerCase()
  if (!domain.ok || !firstName || !lastName || firstName.length>100 || lastName.length>100) return null
  return {firstName,lastName,domain:domain.domain}
}
export function providerRequest(provider: EmailProviderSlug, operation: EmailOperation, input: EmailFindInput | string, settings: ProviderSettings) {
  const params = new URLSearchParams()
  if (typeof input === 'string') params.set('email',input)
  else { params.set('domain',input.domain);params.set('first_name',input.firstName);params.set('last_name',input.lastName) }
  let url: string, headers: Record<string,string> = {}, body: unknown
  if (provider === 'hunter') { params.set('api_key',settings.key ?? ''); url=`https://api.hunter.io/v2/email-${operation === 'find' ? 'finder' : 'verifier'}?${params}` }
  else if (provider === 'tomba') { url=`https://api.tomba.io/v1/email-${operation === 'find' ? 'finder' : 'verifier'}?${params}`;headers={'X-Tomba-Key':settings.key ?? '', 'X-Tomba-Secret':settings.secret ?? ''} }
  else if (provider === 'prospeo' && typeof input !== 'string') {
    url='https://api.prospeo.io/enrich-person';headers={'X-KEY':settings.key ?? ''};body={only_verified_email:true,data:{first_name:input.firstName,last_name:input.lastName,company_website:input.domain}}
  } else {params.set('api_key',settings.key ?? '');url=`https://api.zerobounce.net/v2/validate?${params}`}
  return {url,headers,body,method: body ? 'POST' as const : 'GET' as const}
}
export function decodeEmailResult(provider: EmailProviderSlug, operation: EmailOperation, payload: unknown, now: Date): EmailLookupResult {
  const root=obj(payload), data=obj(root.data), person=obj(root.person)
  const node=provider==='prospeo' ? obj(person.email) : provider==='zerobounce' ? root : provider==='tomba' && operation==='verify' ? obj(data.email) : data
  const raw=str(provider==='hunter' && operation==='find' || provider==='tomba' && operation==='find' ? obj(data.verification).status : node.status) ?? 'unknown'
  const email=str(provider==='zerobounce'?node.address:node.email)
  const sources=Array.isArray(data.sources) ? data.sources : []
  const source=obj(sources[0]); let sourceUrl=str(source.uri)
  // Provider URLs are untrusted; never preserve query credentials or userinfo.
  if (sourceUrl) {try {const u=new URL(sourceUrl);sourceUrl=u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash ? u.href : null} catch {sourceUrl=null}}
  return {email:email?.trim().toLowerCase() ?? null,status:mapEmailStatus(provider,raw),rawStatus:raw,
    fullName:provider==='prospeo' ? str(person.full_name) : str(data.full_name) ?? ([str(data.first_name),str(data.last_name)].filter(Boolean).join(' ') || null),
    title:provider==='prospeo' ? str(person.current_job_title) : str(data.position),sourceUrl,observedAt:now.toISOString(),outcome:email?'result':'no_result'}
}
export function chargedCredits(provider: EmailProviderSlug, operation: EmailOperation, result: EmailLookupResult): number | undefined {
  if (!result.email) return 0
  if (provider==='tomba' && ['unknown',...(operation==='verify'?['disposable']:[])].includes(result.rawStatus)) return 0
  if (provider==='zerobounce' && result.rawStatus==='unknown') return 0
  if (provider==='prospeo' && result.rawStatus!=='VERIFIED') return 0
  if (provider==='hunter' && operation==='verify' && result.rawStatus==='unknown') return undefined
  return provider==='hunter' && operation==='verify' ? 0.5 : 1
}

/** No transport owned here. A gate refusal is a free non-attempt. Uncertain transport,
 * malformed payload or 5xx retains worst-case reservation; no retry or polling. */
export class EmailProviderAdapter implements VerifiedContactProvider {
  private disabled = false
  constructor(readonly slug: EmailProviderSlug, private readonly gate: EmailGate, private readonly ledger: EmailProviderLedger,
    private readonly settings: ProviderSettings, private readonly companyId: string, private readonly clock: () => Date = () => new Date()) {
    for (const key of [settings.key,settings.secret]) if (key) {registerSecretValue(key);registerSecretValue(encodeURIComponent(key))}
  }
  get enabled(): boolean { return !this.disabled && !disabledForProcess.has(this.slug) && !!this.settings.key && this.settings.key.length>=8 && (this.slug!=='tomba' || (this.settings.secret?.length ?? 0)>=8) &&
    this.slug!=='prospeo' && allowanceActive(this.settings.allowance,this.clock()) }
  // Prospeo enrich free-plan eligibility is UNCONFIRMED; never inferred from a key.
  lookup(): Promise<[]> { return Promise.resolve([]) }
  findEmail(input: EmailFindInput): Promise<EmailLookupResult> {return this.run('find',input)}
  verify(email: string): Promise<EmailLookupResult> {return this.run('verify',email)}
  async cached(operation: EmailOperation, input: EmailFindInput | string): Promise<EmailLookupResult | null> {
    const normalized=typeof input==='string'?input.trim().toLowerCase():normalizeFind(input)
    return normalized ? this.ledger.cached(this.slug,operation,emailInputKey(this.slug,operation,normalized),this.clock()) : null
  }
  private async run(operation: EmailOperation, input: EmailFindInput | string): Promise<EmailLookupResult> {
    const now=this.clock(), normalized=typeof input==='string'?input.trim().toLowerCase():normalizeFind(input)
    if (!normalized || (typeof normalized==='string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized))) return blank(now,'invalid_input')
    if ((this.slug==='zerobounce' && operation!=='verify') || (this.slug==='prospeo' && operation!=='find')) return blank(now,'unsupported_operation')
    const inputKey=emailInputKey(this.slug,operation,normalized)
    const cached=await this.ledger.cached(this.slug,operation,inputKey,now)
    if (cached) return cached
    if (!this.enabled) return blank(now,this.slug==='prospeo'?'free_plan_UNCONFIRMED':'provider_disabled')
    if (this.slug==='hunter' && operation==='verify' && !this.settings.unifiedCredits) return blank(now,'credit_pool_UNCONFIRMED')
    const allowance=this.slug==='tomba' && operation==='verify' ? this.settings.verificationAllowance ?? {cap:0,model:'one_time' as const} : this.settings.allowance
    if (!allowanceActive(allowance,now)) return blank(now,'provider_balance_disabled')
    const request=providerRequest(this.slug,operation,normalized,this.settings)
    if (!matchApiContract(request.url,request.method)) return blank(now,'contract_UNCONFIRMED')
    const cost=this.slug==='hunter' && operation==='verify'?0.5:1
    const reservation=await this.ledger.reserve(this.slug,operation,inputKey,allowance,cost,now)
    if ('reason' in reservation) return await this.cached(operation,normalized) ?? blank(now,reservation.reason)
    const entry={id:reservation.id,provider:this.slug,operation,inputKey,at:now.toISOString(),reserved:cost}
    const ctx={companyId:this.companyId,cost:1,vendorCost:0,billedUsd:0,headers:request.headers,maxBytes:256*1024}
    let result=blank(now,'transport_uncertain'), charged: number | undefined, attempted=true, pauseUntil: string | undefined
    try {
      const response=request.method==='POST'?await this.gate.postJson(request.url,request.body,ctx):await this.gate.fetchText(request.url,ctx)
      if (!response.ok) {result=blank(now,`gate_${response.reason}`);charged=0;attempted=false}
      else {
        const res=response.response, status=res.statusCode
        if (status===401 || status===403) {this.disabled=true;disabledForProcess.add(this.slug)}
        if (status===429) {
          const raw=res.headers['retry-after'];const value=Array.isArray(raw)?raw[0]:raw
          const retry=value && /^\d+(?:\.\d+)?$/.test(value)?now.getTime()+Number(value)*1000:Date.parse(value ?? '')
          // Absent/invalid Retry-After: pause through the next UTC day, never guess a fast retry.
          const fallback=Math.max(Date.parse(now.toISOString().slice(0,10))+86400000,Date.parse(allowance.end ?? '') || 0)
          pauseUntil=new Date(Math.max(Number.isFinite(retry)?retry:fallback,now.getTime()+60000)).toISOString()
        }
        if (status!==200 || res.truncated) {
          result=blank(now,status===451?'gap_451':`http_${status}`)
          if ([400,401,402,403,404,422,429,451].includes(status)) charged=0
        } else {
          const payload: unknown=JSON.parse(res.body)
          result=decodeEmailResult(this.slug,operation,payload,now)
          const root=obj(payload)
          const data=obj(root.data)
          const node=this.slug==='tomba' && operation==='verify'?obj(data.email):data
          const recognized=this.slug==='prospeo' ? typeof obj(obj(root.person).email).status==='string' && typeof obj(obj(root.person).email).email==='string' : this.slug==='zerobounce' ? typeof root.status==='string' && typeof root.address==='string' :
            Object.hasOwn(node,'email') && (node.email===null || (typeof node.email==='string' &&
              typeof (operation==='find'?obj(data.verification).status:node.status)==='string'))
          if (!recognized || root.error) result=blank(now,'malformed_result')
          else charged=this.slug==='prospeo' && root.free_enrichment===true?0:chargedCredits(this.slug,operation,result)
        }
      }
    } catch { /* Do not echo transport errors, request URLs or response bodies. */ }
    result=redact(result) as EmailLookupResult
    // Cache all deterministic answers, including misses; never replay an uncertain call.
    const cacheable=['result','no_result','gap_451'].includes(result.outcome)
    const expiresAt=new Date(Math.min(now.getTime()+(this.slug==='prospeo'?90:this.slug==='tomba'?30:1)*86400000,
      this.slug!=='prospeo' && allowance.model==='monthly'?Date.parse(allowance.end!):Infinity)).toISOString()
    await this.ledger.settle({...entry,settledAt:this.clock().toISOString(),outcome:result.outcome,...(charged===undefined?{}:{charged}),attempted,...(pauseUntil?{pauseUntil}:{}),
      ...(cacheable?{result,expiresAt}:{})})
    return result
  }
}
export function emailProviderSettings(config: Env): Record<EmailProviderSlug, ProviderSettings> {
  const settings = (name: 'HUNTER'|'TOMBA'|'PROSPEO'|'ZEROBOUNCE'): ProviderSettings => ({key:config[`${name}_API_KEY`],
    allowance:{cap:config[`${name}_FREE_CREDITS`],model:config[`${name}_CREDIT_MODEL`],start:config[`${name}_CREDIT_WINDOW_START`],end:config[`${name}_CREDIT_WINDOW_END`]}})
  return {hunter:{...settings('HUNTER'),unifiedCredits:config.HUNTER_UNIFIED_CREDITS},tomba:{...settings('TOMBA'),secret:config.TOMBA_API_SECRET,verificationAllowance:{...settings('TOMBA').allowance,cap:config.TOMBA_FREE_VERIFICATION_CREDITS}},prospeo:settings('PROSPEO'),zerobounce:settings('ZEROBOUNCE')}
}
