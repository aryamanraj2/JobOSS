/** Explicit existing mail operations. This is not caller-controlled permission to skip research spend. */
export type NetworkOperation = 'get' | 'json_post' | 'form_post'
export function isZeroCostMailOperation(input: string, operation: NetworkOperation, body?: unknown): boolean {
  let url: URL
  try { url = new URL(input) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
  const query = (keys: string[]) => [...url.searchParams.keys()].every((key) => keys.includes(key) && url.searchParams.getAll(key).length === 1)
  if (url.hostname === 'gmail.googleapis.com') {
    const root = '/gmail/v1/users/me/messages'
    if (operation === 'get' && url.pathname === root && query(['q', 'maxResults', 'includeSpamTrash', 'pageToken'])) {
      const max = url.searchParams.get('maxResults')
      return max !== null && /^\d+$/.test(max) && Number(max) >= 1 && Number(max) <= 500 &&
        url.searchParams.get('includeSpamTrash') === 'true' && url.searchParams.has('q') &&
        (!url.searchParams.has('pageToken') || !!url.searchParams.get('pageToken'))
    }
    if (operation === 'get' && /^\/gmail\/v1\/users\/me\/messages\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      return query(['format']) && url.searchParams.get('format') === 'full'
    }
    if (operation === 'get' && /^\/gmail\/v1\/users\/me\/messages\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+$/.test(url.pathname)) return query([])
    if (operation === 'json_post' && url.pathname === `${root}/send` && query([]) && body && typeof body === 'object') {
      const row = body as Record<string, unknown>
      return Object.keys(row).length === 1 && typeof row.raw === 'string' && row.raw.length > 0
    }
  }
  if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' && operation === 'form_post' && query([]) && body && typeof body === 'object') {
    const row = body as Record<string, unknown>
    const keys = row.grant_type === 'refresh_token' ? ['grant_type', 'client_id', 'client_secret', 'refresh_token']
      : row.grant_type === 'authorization_code' ? ['grant_type', 'client_id', 'client_secret', 'code', 'redirect_uri'] : []
    return keys.length > 0 && Object.keys(row).length === keys.length && keys.every((key) => typeof row[key] === 'string' && row[key].length > 0)
  }
  return false
}
