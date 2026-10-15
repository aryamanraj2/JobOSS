import type { GatedFetcher } from '../../core/interfaces/providers.js'
import { SourceError } from '../source-error.js'

export class DiscoveryPaused extends Error {
  constructor(readonly sourceUrl: string, readonly reason: string, readonly retryAfterSeconds: number | null = null) {
    super(`${reason}: ${sourceUrl}${retryAfterSeconds === null ? '' : `; retry after ${retryAfterSeconds}s`}`)
  }
}

/** Contract APIs stay behind the gate. A 429 saves the cursor instead of spinning or changing provider. */
export async function discoveryJson(gate: GatedFetcher, url: string): Promise<unknown> {
  const result = await gate.fetchText(url, { cost: 1, maxBytes: 16 * 1024 * 1024 })
  if (!result.ok) throw new DiscoveryPaused(url, result.reason)
  const response = result.response
  if (response.statusCode === 429) {
    const retry = response.headers['retry-after']
    const seconds = typeof retry === 'string' && /^\d+$/.test(retry) ? Number(retry) : null
    throw new DiscoveryPaused(url, 'source_rate_limited', seconds)
  }
  if (response.truncated || response.statusCode < 200 || response.statusCode >= 300) {
    throw SourceError.unusable(url, response.truncated ? 'truncated response' : `HTTP ${response.statusCode}`)
  }
  try { return JSON.parse(response.body) as unknown } catch { throw SourceError.unusable(url, 'invalid JSON') }
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
export function str(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null }
export function strings(value: unknown): string[] { return array(value).filter((v): v is string => typeof v === 'string') }
export const waitForSource = (ms: number): Promise<void> => ms > 0
  ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

export type DiscoveryCandidate = {
  source: 'startupdb' | 'hn' | 'yc'
  externalId: string
  companyName: string
  website: string
  sourceUrl: string
  text: string
  publishedAt: Date | null
  raw: Record<string, unknown>
  contactEmails?: string[]
  investor?: { name: string; domain: string }
  funding?: Record<string, unknown>[]
}

export type CandidateHandler = (candidate: DiscoveryCandidate) => Promise<void>
