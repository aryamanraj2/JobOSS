/** Reviewed public API contracts; callers cannot declare arbitrary paths exempt from robots. */
export type ApiContract = { id: string; documentationUrl: string; minSpacingMs?: number }
/** StartupDB documents 120 requests per minute per IP: same-host requests are never closer than 500 ms. */
const startupLimit = 500
const startupDocs = 'https://startupdb.com/api'
const slug = '[A-Za-z0-9][A-Za-z0-9._-]*'

function queryAllowed(url: URL, names: string[]): boolean {
  for (const key of url.searchParams.keys()) {
    if (!names.includes(key) || url.searchParams.getAll(key).length !== 1) return false
  }
  const limit = url.searchParams.get('limit')
  const offset = url.searchParams.get('offset')
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) return false
  if (offset !== null && (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)))) return false
  return true
}

export function matchApiContract(input: string, method: 'GET' | 'POST' = 'GET'): ApiContract | null {
  let url: URL
  try { url = new URL(input) } catch { return null }
  if (method !== 'GET' || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  if (host === 'startupdb.com') {
    if (/^\/api\/v1\/(investors|startups)$/.test(path) && queryAllowed(url, ['q', 'limit', 'offset'])) {
      return { id: 'startupdb.search', documentationUrl: startupDocs, minSpacingMs: startupLimit }
    }
    if (new RegExp(`^/api/v1/(investors|startups)/${slug}$`).test(path) && queryAllowed(url, [])) {
      return { id: 'startupdb.detail', documentationUrl: startupDocs, minSpacingMs: startupLimit }
    }
    if (new RegExp(`^/api/v1/investors/${slug}/portfolio$`).test(path) && queryAllowed(url, ['limit', 'offset'])) {
      return { id: 'startupdb.portfolio', documentationUrl: startupDocs, minSpacingMs: startupLimit }
    }
    if (new RegExp(`^/api/v1/startups/${slug}/activity$`).test(path) && queryAllowed(url, ['kind', 'limit', 'offset']) &&
      (url.searchParams.get('kind') === null || url.searchParams.get('kind') === 'funding')) {
      return { id: 'startupdb.activity', documentationUrl: startupDocs, minSpacingMs: startupLimit }
    }
  }
  if (host === 'hacker-news.firebaseio.com' &&
    (/^\/v0\/item\/\d+\.json$/.test(path) || path === '/v0/user/whoishiring.json') && queryAllowed(url, [])) {
    return { id: 'hn.public', documentationUrl: 'https://github.com/HackerNews/API' }
  }
  if (host === 'boards-api.greenhouse.io' && new RegExp(`^/v1/boards/${slug}/jobs(?:/\\d+)?$`).test(path) &&
    queryAllowed(url, ['content']) && (url.searchParams.get('content') === null || url.searchParams.get('content') === 'true')) {
    return { id: 'greenhouse.job-board', documentationUrl: 'https://developers.greenhouse.io/job-board.html' }
  }
  if (host === 'api.lever.co' && new RegExp(`^/v0/postings/${slug}(?:/${slug})?$`).test(path) &&
    queryAllowed(url, ['mode', 'skip', 'limit']) && (url.searchParams.get('mode') === null || url.searchParams.get('mode') === 'json') &&
    (url.searchParams.get('skip') === null || /^\d+$/.test(url.searchParams.get('skip')!))) {
    return { id: 'lever.postings', documentationUrl: 'https://github.com/lever/postings-api' }
  }
  if (host === 'api.ashbyhq.com' && new RegExp(`^/posting-api/job-board/${slug}$`).test(path) && queryAllowed(url, [])) {
    return { id: 'ashby.job-board', documentationUrl: 'https://developers.ashbyhq.com/docs/public-job-posting-api' }
  }
  if ((host === 'yc-oss.github.io' && /^\/api\/(meta|companies\/(all|hiring))\.json$/.test(path)) ||
    (host === 'raw.githubusercontent.com' && /^\/yc-oss\/api\/(master|main)\/(meta|companies\/(all|hiring))\.json$/.test(path))) {
    if (queryAllowed(url, [])) return { id: 'yc-oss.index', documentationUrl: 'https://github.com/yc-oss/api' }
  }
  return null
}
