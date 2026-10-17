import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { emailHmac } from '../../core/crypto/secret-store.js'
/** Fresh stage/gateway checks. Already in-flight policy/HTTP cannot be cancelled. */
export async function preparationStop(db: Db, companyId: string, campaignCycle: string, selectedContactId?: string | null): Promise<string | null> {
  const company = await db.company.findUnique({ where: { id: companyId }, include: { outreachAssessment: true } })
  if (!company) return 'missing_company'
  if (/^(excluded|stopped|paused|closed|rejected)$/.test(company.status) || /^(stopped|excluded|rejected|closed|paused)$/.test(company.outreachAssessment?.status ?? '')) return 'operator_stopped'
  const leads = await db.lead.findMany({ where: { companyId, campaignCycle }, include: { drafts: true } })
  if (leads.some(l => ['rejected','deferred','excluded','closed','sent','suppressed'].includes(l.status) ||
    l.statusReason !== null && /reply|replied|opt_out|bounce|wrong_contact|user_paused|application_submitted/.test(l.statusReason))) return 'lead_stopped'
  if (leads.some(l => l.drafts.some(d => ['closed','sent','sending','scheduled','suppressed'].includes(d.status) || !!d.statusReason && d.statusReason !== 'weak_evidence'))) return 'draft_stopped'
  const chosen = selectedContactId ?? company.outreachAssessment?.selectedContactId ?? leads.find(l => l.contactId)?.contactId
  const contacts = chosen ? await db.contact.findMany({ where: { id: chosen, companyId } }) : []
  if (chosen && (!contacts.length || contacts.some(c => c.status !== 'active'))) return 'selected_contact_stopped'
  const suppression = await db.suppression.findMany()
  if (suppression.some(s => s.scope === 'global' || s.scope === 'domain' && s.domain === company.canonicalDomain || s.scope === 'contact' && contacts.some(c =>
    !process.env.SUPPRESSION_HMAC_SALT || emailHmac(c.emailNormalized, process.env.SUPPRESSION_HMAC_SALT) === s.emailHmac))) return 'suppressed'
  if (await db.sendAttempt.findFirst({ where: { companyId, campaignCycle } })) return 'already_attempted'
  return null
}
export function guardedCompanyGate(gate: GatedFetcher, check: (companyId?: string | null) => Promise<void>, beforeFetch?: (url: string) => Promise<void>): GatedFetcher {
  // A proxy preserves FetchPolicyGate's this.check interception. Re-check after
  // internal policy awaits before fetchText proceeds to its source request.
  const proxy = new Proxy(gate, { get(target, key, receiver) {
    const method = Reflect.get(target, key, receiver)
    if (key !== 'check' && key !== 'fetchText') return method
    return async (...args: unknown[]) => {
      const companyId = (args[1] as { companyId?: string | null } | undefined)?.companyId
      await check(companyId)
      if (key === 'fetchText' && beforeFetch) { await beforeFetch(String(args[0])); await check(companyId) }
      const result = await Reflect.apply(method, proxy, args)
      await check(companyId)
      return result
    }
  } })
  return proxy
}
