import { parseHTML } from 'linkedom'
import { extractReadable, textWithElementBoundaries } from '../../intel/research/readability.js'
import { scanForInjection } from '../../intel/research/injection.js'
import { isCompanyDomain } from './classify.js'

export type PersonObservation = {
  identityRecord?: { version: 2; html: string }
  identityVerified: boolean
  authorshipVerified: boolean
  excerpt: string | null
  workExcerpt: string | null
  links: string[]
  limitation: string | null
  publishedAt?: Date | null
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
  let host: string
  try { host = new URL(input.url).hostname } catch { return empty('Source URL is invalid.') }
  const employer = isCompanyDomain(`source@${host}`, input.companyDomain)
  const context = windowAround(text, input.fullName, 230)
  const title = input.publicTitle?.trim()
  const { document } = parseHTML(input.html)
  const structured: { record: Record<string, unknown>; title: string; sameEmployer: boolean }[] = []
  let publishedAt: Date | null = null
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(inspect); return }
    if (!value || typeof value !== 'object') return
    const row = value as Record<string, unknown>
    if (typeof row['datePublished'] === 'string') {
      const date = new Date(row['datePublished'])
      if (Number.isFinite(date.getTime())) publishedAt = date
    }
    if (row['@type'] === 'Person' && normalized(String(row['name'] ?? '')) === name) {
      const organization = row['worksFor'] as Record<string, unknown> | undefined
      let sameEmployer = !organization?.['url']
      try { if (organization?.['url']) sameEmployer = isCompanyDomain(`source@${new URL(String(organization['url'])).hostname}`, input.companyDomain) } catch { sameEmployer = false }
      structured.push({ record: row, title: normalized(String(row['jobTitle'] ?? '')), sameEmployer })
    }
    for (const key of ['@graph', 'employee', 'founder', 'member']) if (row[key]) inspect(row[key])
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { inspect(JSON.parse(script.textContent ?? '')) } catch { /* Unparseable data is unverified. */ }
  }
  // Walk upward from the exact name, stopping before a container combines people.
  // The first role field belongs to this name; a later sibling title cannot supply it.
  const nameSelector = 'h2,h3,h4,[itemprop="name"]'
  const records = [...document.querySelectorAll(nameSelector)].filter((h) => normalized(h.textContent ?? '') === name).flatMap((heading) => {
    let parent = heading.parentElement
    while (parent && !['BODY', 'HTML'].includes(parent.tagName)) {
      if (parent.querySelectorAll(nameSelector).length !== 1) break
      const role = parent.querySelector('[itemprop="jobTitle"],p,[data-title]')
      if (role) return [{ element: parent, title: normalized(role.textContent ?? '') }]
      parent = parent.parentElement
    }
    return []
  })
  const expectedTitle = normalized(title ?? '')
  const conflict = structured.some((r) => !r.sameEmployer || r.title !== expectedTitle) || records.some((r) => r.title !== expectedTitle)
  const card = records.find((r) => r.title === expectedTitle && !r.element.querySelector('blockquote,q') && !r.element.closest('blockquote,q') &&
    !/\b(former|previously|ex-employee|guest|quoted|according to)\b/i.test(r.element.textContent ?? ''))?.element
  // Persist only the name/role fields and explicit statements with this person
  // as the grammatical subject. Nearby prose about another person's work cannot
  // turn a commercial title into product responsibility.
  const cardText = card ? [input.fullName, card.querySelector('[itemprop="jobTitle"],p,[data-title]')?.textContent ?? '',
    ...[...card.querySelectorAll('p')].map((p) => p.textContent?.trim() ?? '').filter((line) => {
      const words = normalized(line), prefix = `${name} `
      return words.startsWith(prefix) && /^(?:builds?|develops?|implements?|maintains?)\b/.test(words.slice(prefix.length))
    })].join(' ').trim() : null
  const metadata = structured.find((r) => r.sameEmployer && r.title === expectedTitle)
  const recordHtml = metadata ? `<script type="application/ld+json">${JSON.stringify(metadata.record)}</script>` : card?.toString()
  const identityVerified = Boolean(employer && expectedTitle && !conflict && recordHtml && recordHtml.length <= 4000 &&
    !/\b(former|previously|ex-employee|guest|quoted|according to)\b/i.test(metadata ? JSON.stringify(metadata.record) : card?.textContent ?? ''))
  const links: string[] = []
  for (const link of document.querySelectorAll('a[href]')) {
    const label = normalized(link.textContent ?? '')
    if (label !== name) continue
    try {
      const url = new URL(link.getAttribute('href')!, input.url)
      if (url.protocol === 'https:') links.push(url.toString())
    } catch { /* An invalid link supplies no evidence. */ }
  }
  let author = false
  let conflictingEmployer = false
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) { value.forEach(visit); return }
        if (!value || typeof value !== 'object') return
        const row = value as Record<string, unknown>
        if (row['author'] && ['Article', 'BlogPosting', 'TechArticle', 'ScholarlyArticle'].includes(String(row['@type']))) {
          const authors = Array.isArray(row['author']) ? row['author'] : [row['author']]
          author ||= authors.some((a) => {
            if (typeof a === 'string') return normalized(a) === name
            if (!a || typeof a !== 'object') return false
            const person = a as Record<string, unknown>
            if (normalized(String(person['name'] ?? '')) !== name) return false
            const organization = person['worksFor'] as Record<string, unknown> | string | undefined
            if (organization) {
              try {
                const employerUrl = typeof organization === 'object' ? organization['url'] : organization
                if (!employerUrl || !isCompanyDomain(`source@${new URL(String(employerUrl)).hostname}`, input.companyDomain)) { conflictingEmployer = true; return false }
              } catch { conflictingEmployer = true; return false }
            }
            return true
          })
        }
        if (row['@graph']) visit(row['@graph'])
      }
      visit(JSON.parse(script.textContent ?? ''))
    } catch { /* Malformed metadata cannot establish authorship. */ }
  }
  const main = document.querySelector('article,main')
  const byline = [...(main?.querySelectorAll('[rel="author"], [itemprop="author"]') ?? [])].some((el) => normalized(el.textContent ?? '') === name && !el.closest('blockquote,q'))
  const authorshipVerified = Boolean(!conflictingEmployer && (employer || input.employerLinked) && (author || byline))
  // A byline verifies authorship, but navigation beside a name is not a usable hook.
  for (const quoted of document.querySelectorAll('blockquote,q')) quoted.remove()
  const readable = authorshipVerified ? extractReadable(document.toString()) : null
  const article = readable && main ? textWithElementBoundaries(main.toString()) : null
  const authoredExcerpt = article && article.length >= 200 ? article.slice(0, 500) : null
  return {
    identityVerified,
    authorshipVerified,
    ...(identityVerified ? { identityRecord: { version: 2 as const, html: recordHtml! } } : {}),
    excerpt: identityVerified ? (metadata ? `${String(metadata.record['name'])} — ${String(metadata.record['jobTitle'])}.` : cardText!).slice(0, 500) : authoredExcerpt ?? context.slice(0, 500),
    workExcerpt: authoredExcerpt,
    links: [...new Set(links)],
    publishedAt,
    limitation: identityVerified || authorshipVerified ? null : 'Name appeared, but employer responsibility and authorship were not corroborated.',
  }
}
