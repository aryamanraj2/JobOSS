/** Exact global ATS URL identities. Regional and custom routes remain unsupported. */
export type AtsVendor = 'greenhouse' | 'lever' | 'ashby'
export type AtsDetection = { vendor: AtsVendor; boardToken: string; matchedText: string }
const TOKEN = '[A-Za-z0-9_-]+'
const NOT_A_TOKEN = new Set(['embed', 'js', 'v1', 'v0', 'boards', 'jobs', 'api', 'posting-api'])

/** A URL's hostname, pathname and documented embed parameter must describe one board. */
export function detectAtsInUrl(input: string): AtsDetection | null {
  let url: URL
  try { url = new URL(input) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  let vendor: AtsVendor, token: string | undefined
  const path = url.pathname
  switch (url.hostname) {
    case 'boards.greenhouse.io':
    case 'job-boards.greenhouse.io': {
      vendor = 'greenhouse'
      if (/^\/embed\/job_board(?:\/js)?\/?$/.test(path)) {
        // This is the only supported query-supplied identity, on the documented embed origin/path.
        if (url.searchParams.getAll('for').length !== 1) return null
        token = url.searchParams.get('for') ?? undefined
        if (!token || !new RegExp(`^${TOKEN}$`).test(token)) return null
      } else token = new RegExp(`^/(${TOKEN})(?:/jobs/${TOKEN})?/?$`).exec(path)?.[1]
      break
    }
    case 'boards-api.greenhouse.io':
      vendor = 'greenhouse'
      token = new RegExp(`^/v1/boards/(${TOKEN})/jobs(?:/${TOKEN})?/?$`).exec(path)?.[1]
      break
    case 'jobs.lever.co':
      vendor = 'lever'
      token = new RegExp(`^/(${TOKEN})(?:/${TOKEN}(?:/apply)?)?/?$`).exec(path)?.[1]
      break
    case 'api.lever.co':
      vendor = 'lever'
      token = new RegExp(`^/v0/postings/(${TOKEN})(?:/${TOKEN})?/?$`).exec(path)?.[1]
      break
    case 'jobs.ashbyhq.com':
      vendor = 'ashby'
      token = new RegExp(`^/(${TOKEN})(?:/${TOKEN}(?:/(?:application|apply))?)?/?$`).exec(path)?.[1]
      break
    case 'api.ashbyhq.com':
      vendor = 'ashby'
      token = new RegExp(`^/posting-api/job-board/(${TOKEN})/?$`).exec(path)?.[1]
      break
    default: return null
  }
  if (!token || NOT_A_TOKEN.has(token.toLowerCase())) return null
  // Preserve the complete outer URL for stored ownership revalidation. Do not reduce it
  // to a regex substring that could have come from a different URL's query or fragment.
  return { vendor, boardToken: token, matchedText: input.replace(/^https:\/\//i, '') }
}

/** Text extraction consumes whole outer URLs once; nested URL text is never rescanned. */
export function detectAllAtsInText(text: string): AtsDetection[] {
  const found: AtsDetection[] = []
  const urls = /(?:https?:\/\/|(?:job-boards|boards|boards-api)\.greenhouse\.io\/|(?:jobs|api)\.lever\.co\/|(?:jobs|api)\.ashbyhq\.com\/)[^\s"'<>]+/gi
  for (const match of text.matchAll(urls)) {
    const value = match[0]
    const hit = detectAtsInUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    if (hit && !found.some((h) => h.vendor === hit.vendor && h.boardToken === hit.boardToken)) found.push(hit)
  }
  return found
}
export function detectAtsInText(text: string): AtsDetection | null {
  return detectAllAtsInText(text)[0] ?? null
}
