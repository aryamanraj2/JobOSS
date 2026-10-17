import { sourceDate } from '../../ingest/discovery/expanded/dates.js'
import { canonicalizeDomain } from '../../ingest/domain/canonicalize.js'
import type { currentCompanyContext } from '../review/context.js'
import type { PreparationEntry } from './contracts.js'
type Context = NonNullable<Awaited<ReturnType<typeof currentCompanyContext>>>
/** X may reject a hosted ATS URL as an unbound aggregator application. E can
 * resolve precisely that case from an already current employer-owned ATS row.
 * Other unresolved input, dates, identity conflicts and ambiguity remain stops.
 * Original X input/coverage stays intact; this never promotes an index to proof. */
export function exactListedHint(entry: PreparationEntry, context: Context, now: Date) {
  if (!entry.unresolved) return entry.hints.length === 1 && entry.hints[0]!.title && entry.hints[0]!.url ? entry.hints[0]! : null
  const rawEntries = entry.provenance.filter(v => v && typeof v === 'object' && 'reason' in v) as { reason: string; raw?: Record<string, unknown> }[]
  if (entry.hints.length || rawEntries.length !== 1) return null
  const u = rawEntries[0]!, r = u.raw, org = r?.hiringOrganization as { name?: string; url?: string } | undefined
  if (u.reason !== 'listing_not_proven_current_or_bound' || !r || r.identityConflict || /acquired by|formerly known as|rebranded|redirected to/i.test(String(r.description ?? '')) || org?.name !== context.company.displayName) return null
  const domain = canonicalizeDomain(org.url ?? null), posted = sourceDate(r.datePosted), expires = sourceDate(r.validThrough)
  if (!domain.ok || domain.domain !== context.company.canonicalDomain || !posted || posted > now || (r.validThrough != null ? !expires || expires < now : now.getTime() - posted.getTime() > 90 * 86400000)) return null
  if (typeof r.url !== 'string' || !r.url || r.applicationUrl != null && typeof r.applicationUrl !== 'string') return null
  const urls = [r.url, r.applicationUrl].filter((v): v is string => typeof v === 'string')
  if (urls.some(v => { try { const url = new URL(v); return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.port } catch { return true } })) return null
  const roles = context.currentRoles.filter(role => role.title === r.title && role.roleUrl && urls.includes(role.roleUrl))
  if (roles.length !== 1) return null
  return { title: String(r.title), url: String(r.url), applicationUrl: typeof r.applicationUrl === 'string' ? r.applicationUrl : null }
}
