import type { Contact, Evidence } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { CsvRow } from '../../ingest/file/csv.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { MAX_EXCERPT_CHARS } from '../../core/evidence/write-evidence.js'
import { preparationLimit } from '../review/context.js'
import { importContactRow, providerAttestsDeliverable } from './import.js'
import { classifyLocal, isCompanyDomain } from './classify.js'
import { recipientSuitability } from './suitability.js'
import { personNameMatches, personNameText, type EmailFindInput, type EmailLookupResult, type EmailProviderProjection } from './provider.js'
import { mapEmailStatus, normalizeFind, type EmailProviderAdapter } from './email-providers.js'
import type { EmailProviderSlug, EmailOperation } from './email-ledger.js'

/** Historical field name: worstCaseCredits is the cost of ONE call, not a lookup. */
export type EmailPlanStep = { provider: EmailProviderSlug; operation: EmailOperation; worstCaseCredits: number }
const FINDERS = new Set(['hunter', 'tomba', 'prospeo'])
const VERIFIERS = new Set(['hunter', 'tomba', 'zerobounce'])

/** Runtime and accounting share the same unique provider/operation list. */
function executableSteps(plan: readonly EmailPlanStep[]): EmailPlanStep[] {
  const unique = new Map<string, EmailPlanStep>()
  for (const step of plan) {
    const unit = step.operation === 'verify' && step.provider === 'hunter' ? 0.5 : 1
    if (!(step.operation === 'find' ? FINDERS : VERIFIERS).has(step.provider) ||
        !['find', 'verify'].includes(step.operation) || step.worstCaseCredits !== unit) throw new Error('invalid_email_lookup_plan')
    unique.set(`${step.provider}.${step.operation}`, step)
  }
  return [...unique.values()]
}
export function emailLookupPlan(finders: readonly EmailProviderSlug[] = ['hunter', 'tomba'], verifier: 'zerobounce'|'hunter' = 'zerobounce'): EmailPlanStep[] {
  return executableSteps([...finders.filter((p) => FINDERS.has(p)).map((provider) => ({ provider, operation: 'find' as const, worstCaseCredits: 1 })),
    { provider: verifier, operation: 'verify', worstCaseCredits: verifier === 'hunter' ? 0.5 : 1 }])
}

/** Structural maxima only: every distinct page/finder mailbox can need verification.
 * Free balances, enabled state, quotas and research headroom can only reduce these. */
export function emailLookupBounds(plan: readonly EmailPlanStep[] = emailLookupPlan(), people = 1) {
  preparationLimit(people)
  const steps = executableSteps(plan), branches = 1 + steps.filter((s) => s.operation === 'find').length
  const calls = steps.map((s) => ({ provider: s.provider, operation: s.operation, unitCredits: s.worstCaseCredits,
    maxCalls: s.operation === 'find' ? 1 : branches, credits: s.worstCaseCredits * (s.operation === 'find' ? 1 : branches) }))
  const providers: Partial<Record<EmailProviderSlug, { maxCalls: number; credits: number }>> = {}
  for (const call of calls) {
    const prior = providers[call.provider] ?? { maxCalls: 0, credits: 0 }
    providers[call.provider] = { maxCalls: prior.maxCalls + call.maxCalls, credits: prior.credits + call.credits }
  }
  const aggregate = Object.fromEntries(Object.entries(providers).map(([p, v]) => [p, { maxCalls: v.maxCalls * people, credits: v.credits * people }]))
  return { people, perPerson: { calls, providers }, aggregate: { providers: aggregate } }
}

function normalizedRequest(input: EmailFindInput | undefined): EmailFindInput | null {
  if (!input || ![input.firstName, input.lastName, input.domain].every((v) => typeof v === 'string')) return null
  const normalized = normalizeFind(input)
  return normalized ? { ...normalized, firstName: personNameText(normalized.firstName), lastName: personNameText(normalized.lastName) } : null
}
function sameRequest(a: EmailFindInput, b: EmailFindInput): boolean {
  return a.firstName === b.firstName && a.lastName === b.lastName && a.domain === b.domain
}
export type LookupAdapter = Pick<EmailProviderAdapter, 'slug'|'enabled'|'findEmail'|'verify'|'cached'>
export async function lookupEmail(input: EmailFindInput, providers: readonly LookupAdapter[], options: {
  pagePublished?: EmailLookupResult | undefined
  plan?: readonly EmailPlanStep[] | undefined
} = {}): Promise<{ provider: EmailProviderSlug|'page'; result: EmailLookupResult } | null> {
  const request = normalizedRequest(input)
  if (!request) return null
  const plan = executableSteps(options.plan ?? emailLookupPlan())
  const matched = (r: EmailLookupResult) => !!r.email && isCompanyDomain(r.email, request.domain) &&
    classifyLocal(r.email).kind === 'named' && personNameMatches(r.fullName, request)
  const deliverable = (r: EmailLookupResult) => matched(r) && r.status === 'deliverable'
  const bound = (r: EmailLookupResult, finder: 'hunter'|'tomba'|'prospeo'|'page'): EmailLookupResult =>
    ({ ...r, request: { ...request }, finderProvider: finder })
  for (const step of plan.filter((s) => s.operation === 'find')) {
    const provider = providers.find((p) => p.slug === step.provider)
    const result = await provider?.cached('find', request)
    if (result && deliverable(result)) return { provider: step.provider, result: bound(result, step.provider as 'hunter'|'tomba'|'prospeo') }
  }
  const verifyFound = async (found: EmailLookupResult, finder: 'hunter'|'tomba'|'prospeo'|'page') => {
    for (const step of plan.filter((s) => s.operation === 'verify')) {
      const verifier = providers.find((p) => p.slug === step.provider)
      if (!verifier?.enabled) continue
      const verified = await verifier.verify(found.email!)
      // SMTP attestation only: retain the matched finder/page identity and original
      // observation time. Verifier names, titles and employer pointers are ignored.
      if (verified.email === found.email && verified.status === 'deliverable') return { provider: step.provider,
        result: bound({ ...found, status: verified.status, rawStatus: verified.rawStatus, outcome: verified.outcome }, finder) }
    }
    return null
  }
  if (options.pagePublished && matched(options.pagePublished)) {
    if (deliverable(options.pagePublished)) return { provider: 'page', result: bound(options.pagePublished, 'page') }
    if (options.pagePublished.status !== 'invalid') {
      const verified = await verifyFound(options.pagePublished, 'page')
      if (verified) return verified
    }
  }
  for (const step of plan.filter((s) => s.operation === 'find')) {
    const provider = providers.find((p) => p.slug === step.provider)
    if (!provider?.enabled) continue
    const found = await provider.findEmail(request)
    if (!matched(found)) continue
    const finder = step.provider as 'hunter'|'tomba'|'prospeo'
    if (deliverable(found)) return { provider: step.provider, result: bound(found, finder) }
    if (found.status === 'invalid') continue
    const verified = await verifyFound(found, finder)
    if (verified) return verified
  }
  return null
}

function providerProvenance(finder: string, attester: string): string | null {
  if (!(FINDERS.has(finder) || finder === 'page') || !(FINDERS.has(attester) || attester === 'zerobounce') ||
      (finder !== attester && !VERIFIERS.has(attester))) return null
  return finder === attester ? attester : `${finder}+${attester}`
}

function validSourcePointer(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.href === value
  } catch { return false }
}

/** One recoverable versioned projection, bounded before the unchanged importer can
 * take a 500-character prefix. The compact keys are documented by its type. */
export async function importEmailResult(db: Db, domain: string, provider: EmailProviderSlug, result: EmailLookupResult,
  requested: EmailFindInput | undefined, dryRun = false) {
  if (typeof result.email !== 'string' || !isCompanyDomain(result.email, domain)) return { outcome: 'off_domain' as const }
  if (classifyLocal(result.email).kind !== 'named') return { outcome: 'named_route_required' as const }
  const request = normalizedRequest(requested), embedded = result.request ? normalizedRequest(result.request) : null
  if (!request || request.domain !== domain || !personNameMatches(result.fullName, request) ||
      (result.request && (!embedded || !sameRequest(request, embedded)))) return { outcome: 'request_binding_refused' as const }
  const suitability = recipientSuitability({ emailNormalized: result.email, contactType: 'named_employee', publicTitle: result.title })
  if (suitability.category === 'unsuitable') return { outcome: 'recipient_unsuitable' as const }
  const finder = result.finderProvider ?? provider, provenance = providerProvenance(finder, provider)
  if (!provenance) return { outcome: 'provider_provenance_refused' as const }
  if (!Number.isFinite(Date.parse(result.observedAt)) || new Date(result.observedAt).toISOString() !== result.observedAt ||
      typeof result.rawStatus !== 'string' || (result.title !== null && typeof result.title !== 'string') ||
      !validSourcePointer(result.sourceUrl)) return { outcome: 'projection_refused' as const }
  const projection: EmailProviderProjection = { v: 1, q: [request.firstName, request.lastName, request.domain], e: result.email,
    n: result.fullName!.trim().replace(/\s+/gu, ' '), t: result.title?.trim() || null, f: finder as EmailProviderProjection['f'],
    a: provider, s: result.rawStatus, o: result.observedAt, u: result.sourceUrl }
  const raw = JSON.stringify(projection)
  if (raw.length > MAX_EXCERPT_CHARS) return { outcome: 'projection_too_large' as const }
  const verdict = result.status === 'deliverable' && mapEmailStatus(provider, result.rawStatus) === 'deliverable' ? 'valid' : undefined
  const cells = { domain, email: result.email, full_name: projection.n, title: projection.t ?? '', provider: provenance,
    source_url: projection.u ?? '', email_status: providerAttestsDeliverable(verdict) ? 'valid' : '' }
  const row: CsvRow = { line: 1, cells, raw }
  return importContactRow(db, row, { provider: provenance, operator: 'email-provider', providerApi: true, dryRun }, new Date(result.observedAt))
}

/** Exact machine-route proof only. Human CSV remains with readImportedRow. Source
 * pointer u is the original provider pointer, not independent employer identity;
 * prepareRecipients may later replace the contact's primary identity URL. */
export function readEmailProviderRoute(route: Evidence, contact: Contact, companyDomain: string): boolean {
  if (route.sourceType !== 'external_source' || route.fetchedVia !== 'structured_feed' || route.companyId !== contact.companyId ||
      (route.contactId !== null && route.contactId !== contact.id) || route.id !== contact.evidenceId ||
      contact.discoveryMethod !== 'lookup_provider' || !contact.contactType.startsWith('named') ||
      route.excerpt.length > MAX_EXCERPT_CHARS) return false
  let p: EmailProviderProjection
  try {
    const parsed: unknown = JSON.parse(route.excerpt)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || JSON.stringify(parsed) !== route.excerpt) return false
    const r = parsed as Record<string, unknown>
    const keys = ['v','q','e','n','t','f','a','s','o','u']
    if (Object.keys(r).length !== keys.length || keys.some((k) => !Object.hasOwn(r, k)) || r.v !== 1 ||
        !Array.isArray(r.q) || r.q.length !== 3 || !r.q.every((s) => typeof s === 'string') ||
        !['e','n','f','a','s','o'].every((k) => typeof r[k] === 'string') ||
        !(r.t === null || typeof r.t === 'string') || !(r.u === null || typeof r.u === 'string')) return false
    p = r as unknown as EmailProviderProjection
  } catch { return false }
  const request = normalizedRequest({ firstName: p.q[0], lastName: p.q[1], domain: p.q[2] })
  if (!request || !sameRequest(request, { firstName: p.q[0], lastName: p.q[1], domain: p.q[2] }) || request.domain !== companyDomain ||
      !personNameMatches(p.n, request) || !personNameMatches(contact.fullName, request) || contact.publicTitle !== p.t ||
      p.e !== contact.emailNormalized || !isCompanyDomain(p.e, request.domain) || classifyLocal(p.e).kind !== 'named' || !Number.isFinite(Date.parse(p.o)) ||
      !validSourcePointer(p.u) || new Date(p.o).toISOString() !== p.o || route.observedAt.toISOString() !== p.o || contact.capturedAt.toISOString() !== p.o) return false
  const provenance = providerProvenance(p.f, p.a)
  return provenance !== null && route.sourceUrl === `provider-api://${encodeURIComponent(provenance)}` &&
    providerAttestsDeliverable(mapEmailStatus(p.a, p.s) === 'deliverable' ? 'valid' : undefined) &&
    route.contentHash === contentHashOf({ provider: provenance, operator: 'email-provider', email: p.e, row: route.excerpt })
}
