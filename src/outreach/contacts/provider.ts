import type { ContactType } from '../../../generated/prisma/enums.js'

/** Tier B receives a FetchPolicyGate, never a transport. Provider results still
 * pass recipientSuitability, company-domain and independent identity/evidence rules.
 * Founders and technical leaders are eligible; isExecutiveContact is not a filter.
 * Automatic execution remains isolation_blocked; EM1 exposes only a dry-run CLI.
 */
export type EmailStatus = 'deliverable' | 'risky' | 'invalid' | 'unknown'
export type EmailFindInput = { firstName: string; lastName: string; domain: string }
export type EmailLookupResult = {
  email: string | null
  status: EmailStatus
  rawStatus: string
  fullName: string | null
  title: string | null
  sourceUrl: string | null
  observedAt: string
  outcome: string
  /** Normalized authoritative request, supplied by lookup; never by a verifier. */
  request?: EmailFindInput
  /** Finder metadata can accompany a separate verifier's SMTP attestation. */
  finderProvider?: 'hunter' | 'tomba' | 'prospeo' | 'page'
}

/** Exact full-name comparison: canonical Unicode, case and whitespace only.
 * No initials, token overlap, local-part inference, transliteration or fuzzy match. */
export function personNameText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
}
export function personNameMatches(fullName: string | null, request: EmailFindInput): boolean {
  return typeof fullName === 'string' && !!personNameText(request.firstName) && !!personNameText(request.lastName) &&
    personNameText(fullName) === `${personNameText(request.firstName)} ${personNameText(request.lastName)}`
}
/** Version 1 bounded machine projection: request tuple, email, returned name/title,
 * finder, SMTP attester, raw status, original observation time and source pointer. */
export type EmailProviderProjection = {
  v: 1; q: [string, string, string]; e: string; n: string; t: string | null
  f: 'hunter' | 'tomba' | 'prospeo' | 'page'
  a: 'hunter' | 'tomba' | 'prospeo' | 'zerobounce'
  s: string; o: string; u: string | null
}

export type VerifiedContactQuery = {
  companyId: string
  canonicalDomain: string
  companyName: string
  /** What the caller is looking for. A provider that cannot filter returns everything. */
  wanted: 'role_alias' | 'recruiting_person' | 'any_non_executive'
  limit: number
}

export type VerifiedContactResult = {
  email: string
  /** The provider's own confidence that the address deliverable, 0..1. */
  confidence: number
  /** Published title, when the provider has one. Fed to recipientSuitability. */
  title: string | null
  fullName: string | null
  /** The provider's own evidence URL, when it publishes one. */
  sourceUrl: string | null
  suggestedType: ContactType
}

export interface VerifiedContactProvider {
  readonly slug: string
  /** False when no key is configured. Callers must check before spending anything. */
  readonly enabled: boolean
  findEmail?(input: EmailFindInput): Promise<EmailLookupResult>
  verify?(email: string): Promise<EmailLookupResult>
  lookup(query: VerifiedContactQuery): Promise<VerifiedContactResult[]>
}

/**
 * H9's floor for an absent optional adapter: present, disabled, and correct.
 *
 * The pipeline must be right with every optional capability missing, so the default
 * implementation returns nothing rather than throwing. A caller that treats "no
 * provider" as an error would make Tier B a dependency instead of an enhancement.
 */
export class DisabledContactProvider implements VerifiedContactProvider {
  readonly slug = 'disabled'
  readonly enabled = false

  lookup(): Promise<VerifiedContactResult[]> {
    return Promise.resolve([])
  }
}

/**
 * A fake with a fixed table, for contract tests. Part G requires every adapter to be
 * exercised against **both** a real-with-fixtures implementation and a fake; this is
 * the fake half, and it is all F4 has because no real one exists yet.
 */
export class FakeContactProvider implements VerifiedContactProvider {
  readonly slug = 'fake'
  readonly enabled = true

  constructor(private readonly table: Record<string, VerifiedContactResult[]> = {}) {}

  lookup(query: VerifiedContactQuery): Promise<VerifiedContactResult[]> {
    return Promise.resolve((this.table[query.canonicalDomain] ?? []).slice(0, query.limit))
  }
}
