import type { Prisma } from '../../../generated/prisma/client.js'
import type { Db } from '../../core/audit/audit-log.js'
import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { contentHashOf } from '../../core/evidence/content-hash.js'
import { verbatimExcerpt, writeEvidence, writeCompanySignal } from '../../core/evidence/write-evidence.js'
import { canonicalizeDomain } from '../domain/canonicalize.js'
import { fetchPage } from '../fetch-page.js'
import { ensureDerivedCompanyHost } from '../host/derived-company-host.js'
import { object, str, strings, array } from './common.js'
import { extractReadable } from '../../intel/research/readability.js'

export type FundingDate = { announcedAt: Date | null; datePrecision: 'date' | 'month' | 'year' | 'unknown'; dateText: string | null }

/** Store an interval's lower bound with explicit precision. Never replace unknown event dates with discovery time. */
export function parseFundingDate(value: unknown): FundingDate {
  const text = str(value)
  const match = text && /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text)
  if (!match) return { announcedAt: null, datePrecision: 'unknown', dateText: text }
  const year = Number(match[1]), month = Number(match[2] ?? 1), day = Number(match[3] ?? 1)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { announcedAt: null, datePrecision: 'unknown', dateText: text }
  }
  return { announcedAt: date, datePrecision: match[3] ? 'date' : match[2] ? 'month' : 'year', dateText: text }
}

export function fundingSourceKey(round: Record<string, unknown>): string {
  // Event IDs identify the same round across investor portfolios; deterministic fields cover sources without IDs.
  return str(round.eventId) ? `startupdb:${str(round.eventId)!}` : `round:${contentHashOf({
    stage: str(round.roundLabel), date: str(round.eventDate), amount: object(round.amount),
    sources: strings(round.sourceUrls).sort(),
  })}`
}

export function earlyFundingStage(stage: string | null): boolean {
  return stage !== null && /^(pre[ -]?seed|seed|series[ -]?a)(?:\s+(round|funding))?$/i.test(stage.trim())
}

export function fundingRecent(date: FundingDate, now: Date, days = 180): boolean {
  if (!date.announcedAt || date.datePrecision === 'unknown' || date.datePrecision === 'year') return false
  const start = date.announcedAt.getTime()
  const end = date.datePrecision === 'month'
    ? Date.UTC(date.announcedAt.getUTCFullYear(), date.announcedAt.getUTCMonth() + 1, 1) - 1 : start
  return start >= now.getTime() - days * 86_400_000 && end <= now.getTime()
}

/** Conservative source support: the source must name the company, funding stage and matching event date. */
export function fundingSupportExcerpt(text: string, companyName: string, stage: string, date: FundingDate): string | null {
  if (!date.announcedAt || date.datePrecision === 'unknown') return null
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const company = normalize(companyName), fundingStage = normalize(stage)
  const year = String(date.announcedAt.getUTCFullYear())
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(date.announcedAt)
  const month = `(?:${monthName}|${monthName.slice(0, 3)}\\.?)`
  const day = date.announcedAt.getUTCDate()
  const exactDate = date.datePrecision === 'date'
    ? new RegExp(`\\b(?:${date.dateText}|${month}\\s+${day}(?:st|nd|rd|th)?\\s*,?\\s*${year}|${day}(?:st|nd|rd|th)?\\s+${month}\\s*,?\\s*${year})\\b`, 'i')
    : date.datePrecision === 'month'
      ? new RegExp(`\\b(?:${date.dateText}(?:-\\d{2})?|${month}\\s+(?:\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s*)?${year})\\b`, 'i')
      : new RegExp(`\\b${year}\\b`)
  for (let offset = 0; offset < text.length; offset += 250) {
    const excerpt = text.slice(offset, offset + 500)
    const normalized = normalize(excerpt)
    if (!normalized.includes(company) || !normalized.includes(fundingStage) || !/rais|fund|invest|financ/i.test(excerpt)) continue
    if (!exactDate.test(excerpt)) continue
    return excerpt
  }
  return null
}

export async function storeFundingRound(db: Db, gate: GatedFetcher,
  company: { id: string; canonicalDomain: string; displayName: string }, round: Record<string, unknown>,
  indexUrl: string, now: Date, investor?: { name: string; domain: string }): Promise<void> {
  const sourceKey = fundingSourceKey(round)
  const existing = await db.fundingRecord.findUnique({ where: { companyId_sourceKey: { companyId: company.id, sourceKey } } })
  if (existing?.verificationStatus === 'primary_verified') return
  const date = parseFundingDate(round.eventDate)
  const stage = str(round.roundLabel)
  const amount = object(round.amount)
  const numericAmount = str(amount.original)
  const parsedAmount = numericAmount && /^\d+(?:\.\d+)?$/.test(numericAmount) ? numericAmount : null
  const sources = strings(round.sourceUrls)
  let evidenceId: string | null = existing?.evidenceId ?? null
  let verificationStatus = 'indexed'
  let sourceUrl = indexUrl
  const primary = sources.find((url) => {
    const domain = canonicalizeDomain(url)
    return domain.ok && (domain.domain === company.canonicalDomain || domain.domain === investor?.domain)
  })
  if (primary && stage) {
    const domain = canonicalizeDomain(primary)
    if (domain.ok) await ensureDerivedCompanyHost(db, { companyId: company.id, host: domain.domain, sourceUrl: indexUrl })
    const page = await fetchPage(gate, primary, { companyId: company.id, cost: 1, sameHostDelayMs: 5_000 })
    if (page.ok) {
      const servedDomain = canonicalizeDomain(page.url)
      const readable = extractReadable(page.body)
      const excerpt = servedDomain.ok && (servedDomain.domain === company.canonicalDomain || servedDomain.domain === investor?.domain)
        ? fundingSupportExcerpt(readable?.text ?? '', company.displayName, stage, date) : null
      if (excerpt) {
        const evidence = await writeEvidence(db, { companyId: company.id, sourceUrl: page.url,
          sourceType: servedDomain.ok && servedDomain.domain === company.canonicalDomain ? 'company_page' : 'external_source',
          excerpt, contentHash: contentHashOf(page.body), observedAt: now, publishedAt: date.announcedAt,
          confidence: 0.95, fetchedVia: 'static_fetch' })
        evidenceId = evidence.id
        sourceUrl = page.url
        verificationStatus = 'primary_verified'
      }
    }
  }
  if (!evidenceId) {
    const evidence = await writeEvidence(db, { companyId: company.id, sourceUrl: indexUrl, sourceType: 'external_source',
      excerpt: verbatimExcerpt(JSON.stringify({ roundLabel: round.roundLabel, eventDate: round.eventDate,
        amount: round.amount, sourceUrls: round.sourceUrls })), contentHash: contentHashOf(round),
      observedAt: now, confidence: 0.65, fetchedVia: 'structured_feed' })
    evidenceId = evidence.id
  }
  const investorNames = array(round.participants).map((participant) => str(object(participant).name)).filter((name): name is string => !!name)
  const data = { companyId: company.id, sourceKey, sourceUrl, evidenceId, stage, amount: parsedAmount,
    currency: str(amount.currency), ...date, investorNames, verificationStatus, observedAt: now,
    metadata: { originalSourceUrls: sources, original: round, attribution: 'StartupDB (https://startupdb.com)',
      license: 'CC BY 4.0', dateMeaning: round.dateMeaning ?? 'unknown' } as Prisma.InputJsonValue }
  await db.fundingRecord.upsert({ where: { companyId_sourceKey: { companyId: company.id, sourceKey } }, create: data, update: data })
  if (!existing) await writeCompanySignal(db, { companyId: company.id, evidenceId, signalType: 'funding_or_growth',
    observedAt: now, confidence: verificationStatus === 'primary_verified' ? 0.95 : 0.65 })
}
