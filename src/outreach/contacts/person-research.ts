import { parseHTML } from 'linkedom'
import { extractReadable, textWithElementBoundaries } from '../../intel/research/readability.js'
import { scanForInjection } from '../../intel/research/injection.js'
import { isCompanyDomain } from './classify.js'

export type PersonObservation = {
  identityVerified: boolean
  authorshipVerified: boolean
  excerpt: string | null
  workExcerpt: string | null
  links: string[]
  limitation: string | null
}

const normalized = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const windowAround = (text: string, name: string, radius: number) => {
  const at = text.toLowerCase().indexOf(name.toLowerCase())
  return text.slice(Math.max(0, at - radius), Math.min(text.length, at + name.length + radius)).trim()
}

/** Only explicit Person metadata tied to the exact published address supplies a name. */
export function publishedIdentity(html: string, email: string): { fullName: string; title: string } | null {
  const { document } = parseHTML(html)
  let result: { fullName: string; title: string } | null = null
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    const row = value as Record<string, unknown>
    if (row['@type'] === 'Person' && String(row['email'] ?? '').replace(/^mailto:/i, '').toLowerCase() === email.toLowerCase() && typeof row['name'] === 'string' && typeof row['jobTitle'] === 'string') {
      result = { fullName: row['name'], title: row['jobTitle'] }
    }
    for (const key of ['@graph', 'employee', 'founder', 'member']) if (row[key]) visit(row[key])
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent ?? '')) } catch { /* Malformed metadata is not identity evidence. */ }
  }
  return result
}

/** A name alone is not identity: require an employer source plus its responsibility. */
export function observePersonPage(input: {
  html: string; url: string; companyDomain: string; fullName: string; publicTitle: string | null;
  /** External sources must have been linked by an already verified employer identity page. */
  employerLinked?: boolean
}): PersonObservation {
  const text = textWithElementBoundaries(input.html)
  const empty = (limitation: string): PersonObservation => ({ identityVerified: false, authorshipVerified: false, excerpt: null, workExcerpt: null, links: [], limitation })
  if (scanForInjection(text).detected) return empty('Instruction-shaped source text was excluded.')
  const name = normalized(input.fullName)
  if (name.split(' ').length < 2) return empty('A full public name is required to disambiguate identity.')
  if (!normalized(text).includes(name)) return empty('Source does not identify this person.')
  let host: string
  try { host = new URL(input.url).hostname } catch { return empty('Source URL is invalid.') }
  const employer = isCompanyDomain(`source@${host}`, input.companyDomain)
  const context = windowAround(text, input.fullName, 230)
  const title = input.publicTitle?.trim()
  const responsibility = title && normalized(context).includes(normalized(title))
  // A provider name and a similarly named author on another site cannot validate each other.
  const identityVerified = Boolean(employer && responsibility)
  const { document } = parseHTML(input.html)
  const links: string[] = []
  for (const link of document.querySelectorAll('a[href]')) {
    const label = normalized(link.textContent ?? '')
    if (!label.includes(name)) continue
    try {
      const url = new URL(link.getAttribute('href')!, input.url)
      if (url.protocol === 'https:') links.push(url.toString())
    } catch { /* An invalid link supplies no evidence. */ }
  }
  let author = false
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) { value.forEach(visit); return }
        if (!value || typeof value !== 'object') return
        const row = value as Record<string, unknown>
        if (row['author']) {
          const authors = Array.isArray(row['author']) ? row['author'] : [row['author']]
          author ||= authors.some((a) => typeof a === 'string' ? normalized(a) === name : a && typeof a === 'object' && normalized(String((a as Record<string, unknown>)['name'] ?? '')) === name)
        }
        if (row['@graph']) visit(row['@graph'])
      }
      visit(JSON.parse(script.textContent ?? ''))
    } catch { /* Malformed metadata cannot establish authorship. */ }
  }
  const byline = [...document.querySelectorAll('[rel="author"], [itemprop="author"]')].some((el) => normalized(el.textContent ?? '') === name)
  const authorshipVerified = Boolean((employer || input.employerLinked) && (author || byline))
  // A byline verifies authorship, but navigation beside a name is not a usable hook.
  const article = authorshipVerified ? extractReadable(input.html)?.text : null
  const authoredExcerpt = article && article.length >= 200 ? article.slice(0, 500) : null
  return {
    identityVerified,
    authorshipVerified,
    excerpt: authoredExcerpt ?? context.slice(0, 500),
    workExcerpt: authoredExcerpt,
    links: [...new Set(links)],
    limitation: identityVerified || authorshipVerified ? null : 'Name appeared, but employer responsibility and authorship were not corroborated.',
  }
}
