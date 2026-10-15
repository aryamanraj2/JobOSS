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
  // Strong IDs win. Otherwise equal dated round facts merge across portfolio/source URLs.
  const eventId = str(round.eventId) ?? (Number.isSafeInteger(round.eventId) ? String(round.eventId) : null)
  if (eventId) return `startupdb:${eventId}`
  const stage = str(round.roundLabel)?.toLowerCase().trim() ?? null, date = str(round.eventDate), amount = object(round.amount)
  if (stage && date && parseFundingDate(date).announcedAt) return `facts:${contentHashOf({ stage, date, amount })}`
  // Sparse/undated facts cannot safely be identified as one event across sources.
  return `round:${contentHashOf({ stage, date, amount, sources: strings(round.sourceUrls).sort() })}`
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

/**
 * Recognize a narrow affirmative company/action/stage/date statement, not a bag
 * of sentence-wide words. Ambiguous compound clauses and investor-name stages
 * stay indexed. This intentionally is not a general language fact checker.
 */
export function fundingSupportExcerpt(text: string, companyName: string, stage: string, date: FundingDate): string | null {
  if (!date.announcedAt || !Number.isFinite(date.announcedAt.getTime()) || date.datePrecision === 'unknown') return null
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const company = normalize(companyName)
  const fundingStage = normalize(stage).replace(/ (?:round|funding)$/, '')
  if (!company || !/^(?:pre seed|preseed|seed|series [a-z])$/.test(fundingStage)) return null
  const year = String(date.announcedAt.getUTCFullYear())
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(date.announcedAt)
  const month = String.raw`(?:${monthName}|${monthName.slice(0, 3)}\.?)`
  const day = date.announcedAt.getUTCDate()
  const iso = date.announcedAt.toISOString().slice(0, date.datePrecision === 'date' ? 10 : date.datePrecision === 'month' ? 7 : 4)
  const datePattern = date.datePrecision === 'date'
    ? String.raw`\b(?:${iso}|${month}\s+${day}(?:st|nd|rd|th)?\s*,?\s*${year}|${day}(?:st|nd|rd|th)?\s+${month}\s*,?\s*${year})\b`
    : date.datePrecision === 'month'
      ? String.raw`\b(?:${iso}(?:-\d{2})?|${month}\s+(?:\d{1,2}(?:st|nd|rd|th)?\s*,?\s*)?${year})\b`
      : String.raw`\b${year}\b`
  const factPrefix = new RegExp(String.raw`^${company} (?:has )?(?:raised|raises|secured|closed|announced) (?:a |an |its )?${fundingStage} (?:funding(?: round)?|round|financing|investment)(?: from\s*\d+ investors)? (?:on|in)$`)
  // Readability may concatenate adjacent paragraphs without a space after punctuation.
  for (const sentence of text.split(/(?<=[.!?])(?:\s+|(?=[A-Z]))|[\r\n]+/)) {
    const excerpt = sentence.trim()
    if (!excerpt || excerpt.length > 500) continue
    const eventDate = new RegExp(datePattern, 'i').exec(excerpt)
    if (!eventDate || !factPrefix.test(normalize(excerpt.slice(0, eventDate.index)))) continue
    // A second event, qualification or attribution after the date is undetermined.
    if (!/^[.!?]?\s*$/.test(excerpt.slice(eventDate.index + eventDate[0].length))) continue
    return excerpt
  }
  return null
}

export async function storeFundingRound(db: Db, gate: GatedFetcher,
  company: { id: string; canonicalDomain: string; displayName: string }, round: Record<string, unknown>,
  indexUrl: string, now: Date, investor?: { name: string; domain: string }): Promise<void> {
  let sourceKey = fundingSourceKey(round)
  let existing = await db.fundingRecord.findUnique({ where: { companyId_sourceKey: { companyId: company.id, sourceKey } } })
  const date = parseFundingDate(round.eventDate)
  if (!existing && !str(round.eventId) && date.announcedAt && str(round.roundLabel)) {
    const legacy = await db.fundingRecord.findMany({ where: { companyId: company.id, stage: str(round.roundLabel), dateText: date.dateText }, take: 10 })
    const matching = legacy.filter((r) => r.sourceKey.startsWith('round:') &&
      r.amount?.toString() === (str(object(round.amount).original) ?? undefined) && r.currency === str(object(round.amount).currency))
    if (matching.length === 1) { existing = matching[0]!; sourceKey = existing.sourceKey }
  }
  const stage = str(round.roundLabel)
  const amount = object(round.amount)
  const numericAmount = str(amount.original)
  const parsedAmount = numericAmount && /^\d+(?:\.\d+)?$/.test(numericAmount) ? numericAmount : null
  const sources = strings(round.sourceUrls)
  let evidenceId: string | null = null
  let verificationStatus = 'indexed'
  let sourceUrl = indexUrl
  const attempts: Record<string, unknown>[] = []
  const primaries = [...new Set(sources)].filter((url) => {
    const domain = canonicalizeDomain(url)
    return domain.ok && (domain.domain === company.canonicalDomain || domain.domain === investor?.domain)
  }).slice(0, 3)
  for (const primary of primaries) {
    if (!stage || !date.announcedAt || date.announcedAt > now) break
    try {
      const domain = canonicalizeDomain(primary)
      if (domain.ok) await ensureDerivedCompanyHost(db, { companyId: company.id, host: domain.domain, sourceUrl: indexUrl })
      const page = await fetchPage(gate, primary, { companyId: company.id, cost: 1, sameHostDelayMs: 5_000 })
      if (!page.ok) { attempts.push({ url: primary, failure: page.detail }); continue }
      const servedDomain = canonicalizeDomain(page.url)
      const readable = extractReadable(page.body)
      const excerpt = servedDomain.ok && (servedDomain.domain === company.canonicalDomain || servedDomain.domain === investor?.domain)
        ? fundingSupportExcerpt(readable?.text ?? '', company.displayName, stage, date) : null
      attempts.push({ url: primary, servedUrl: page.url, contentHash: contentHashOf(page.body), supported: !!excerpt })
      if (!excerpt) continue
      const hash = contentHashOf(page.body)
      const evidence = await db.evidence.findFirst({ where: { companyId: company.id, sourceUrl: page.url, contentHash: hash, excerpt,
        observedAt: { gte: new Date(now.getTime() - 60 * 86_400_000), lte: now } } }) ??
        await writeEvidence(db, { companyId: company.id, sourceUrl: page.url,
          sourceType: servedDomain.ok && servedDomain.domain === company.canonicalDomain ? 'company_page' : 'external_source',
          excerpt, contentHash: hash, observedAt: now, publishedAt: date.announcedAt,
          confidence: 0.95, fetchedVia: 'static_fetch' })
      evidenceId = evidence.id
      sourceUrl = page.url
      verificationStatus = 'primary_verified'
      break
    } catch (error) { attempts.push({ url: primary, failure: error instanceof Error ? error.message : String(error) }) }
  }
  if (!evidenceId) {
    const evidence = await db.evidence.findFirst({ where: { companyId: company.id, sourceUrl: indexUrl, contentHash: contentHashOf(round) } }) ?? await writeEvidence(db, { companyId: company.id, sourceUrl: indexUrl, sourceType: 'external_source',
      excerpt: verbatimExcerpt(JSON.stringify({ roundLabel: round.roundLabel, eventDate: round.eventDate,
        amount: round.amount, sourceUrls: round.sourceUrls })), contentHash: contentHashOf(round),
      observedAt: now, confidence: 0.65, fetchedVia: 'structured_feed' })
    evidenceId = evidence.id
  }
  const investorNames = array(round.participants).map((participant) => str(object(participant).name)).filter((name): name is string => !!name)
  const data = { companyId: company.id, sourceKey, sourceUrl, evidenceId, stage, amount: parsedAmount,
    currency: str(amount.currency), ...date, investorNames, verificationStatus, observedAt: now,
    metadata: { originalSourceUrls: [...new Set([...strings(object(existing?.metadata).originalSourceUrls), ...sources])],
      indexUrls: [...new Set([...strings(object(existing?.metadata).indexUrls), indexUrl])],
      primaryAttempts: attempts, previousVerification: existing?.verificationStatus ?? null,
      fields: { stage: verificationStatus, date: verificationStatus, amount: 'indexed', currency: 'indexed', investors: 'indexed' },
      currentStageUncertainty: 'Incomplete round history; latest known round is not verified current stage',
      conflicts: [...array(object(existing?.metadata).conflicts), ...(existing &&
        (existing.stage !== stage || existing.dateText !== date.dateText || existing.amount?.toString() !== (parsedAmount ?? undefined) || existing.currency !== str(amount.currency))
        ? [{ previousStage: existing.stage, previousDateText: existing.dateText, previousAmount: existing.amount?.toString() ?? null, previousCurrency: existing.currency, detectedAt: now.toISOString() }] : [])].slice(-20),
      original: round, attribution: 'StartupDB (https://startupdb.com)',
      license: 'CC BY 4.0', dateMeaning: round.dateMeaning ?? 'unknown' } as Prisma.InputJsonValue }
  const persist = async (tx: Db) => {
    await tx.fundingRecord.upsert({ where: { companyId_sourceKey: { companyId: company.id, sourceKey } }, create: data, update: data })
    if (!existing) await writeCompanySignal(tx, { companyId: company.id, evidenceId, signalType: 'funding_or_growth',
      observedAt: now, confidence: verificationStatus === 'primary_verified' ? 0.95 : 0.65 })
  }
  if ('$transaction' in db) await db.$transaction(persist)
  else await persist(db)
}
