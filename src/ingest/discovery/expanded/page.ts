import type { GatedFetcher } from '../../../core/interfaces/providers.js'
import { DiscoveryPaused, waitForSource } from '../common.js'
import type { ExpandedRoute } from './registry.js'

/** Each request including redirects uses the existing gate and a positive atomic credit. */
export function boundedSourceGate(gate: GatedFetcher, route: ExpandedRoute, delayMs: number) {
  let requests = 0, bytes = 0
  const fetchText: GatedFetcher['fetchText'] = async (url, opts) => {
    if (requests >= 250) throw new DiscoveryPaused(url, 'request_cap_250')
    if (bytes >= 100 * 1024 * 1024) throw new DiscoveryPaused(url, 'byte_cap_100MiB')
    if (requests) await waitForSource(delayMs)
    requests++
    const maxBytes = Math.min(opts?.maxBytes ?? 2 * 1024 * 1024, 100 * 1024 * 1024 - bytes)
    const result = await gate.fetchText(url, { ...opts, cost: 1, maxBytes })
    if (result.ok) {
      bytes += Buffer.byteLength(result.response.body)
      if (bytes > 100 * 1024 * 1024 || Buffer.byteLength(result.response.body) > maxBytes || result.response.truncated) throw new DiscoveryPaused(url, 'truncated_or_byte_cap')
      if (result.response.statusCode === 429) {
        const raw = result.response.headers['retry-after']
        const seconds = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null
        throw new DiscoveryPaused(url, 'source_rate_limited', seconds)
      }
    }
    return result
  }
  return { gate: { check: gate.check.bind(gate), fetchText }, stats: () => ({ requests, bytes, route: route.id }) }
}
export function sameRouteUrl(raw: string, base: string, route: ExpandedRoute): string | null {
  if (!raw.trim()) return null
  try {
    const url = new URL(raw, base)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !route.hosts.includes(url.hostname)) return null
    if (/\/(?:login|signin|sign-in|api)(?:\/|$)/i.test(url.pathname)) return null
    url.hash = ''
    return url.href
  } catch { return null }
}
/** No dynamic execution and no following auth, arbitrary external or guessed API routes. */
export async function publicPage(gate: GatedFetcher, start: string, route: ExpandedRoute) {
  const initial = sameRouteUrl(start, route.url ?? start, route)
  if (!initial || initial !== start) throw new DiscoveryPaused(start, 'invalid_source_route_url')
  let url = initial
  const visited = new Set<string>()
  for (let hop = 0; hop <= 3; hop++) {
    if (visited.has(url)) throw new DiscoveryPaused(url, 'redirect_cycle')
    visited.add(url)
    const result = await gate.fetchText(url, { cost: 1, maxBytes: 2 * 1024 * 1024 })
    if (!result.ok) throw new DiscoveryPaused(url, result.reason)
    const response = result.response
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      const location = response.headers.location
      const next = typeof location === 'string' ? sameRouteUrl(location, url, route) : null
      if (!next) throw new DiscoveryPaused(url, 'unsupported_redirect_or_auth')
      url = next; continue
    }
    if ([401, 403].includes(response.statusCode) || /\/(?:login|signin|sign-in)(?:\/|\?|$)/i.test(new URL(url).pathname)) throw new DiscoveryPaused(url, 'access_blocked')
    if (response.statusCode < 200 || response.statusCode >= 300) throw new DiscoveryPaused(url, `http_${response.statusCode}`)
    if (response.truncated) throw new DiscoveryPaused(url, 'truncated_response')
    return { url, html: response.body, hops: [...visited] }
  }
  throw new DiscoveryPaused(url, 'redirect_hop_cap')
}
