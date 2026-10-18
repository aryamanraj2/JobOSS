import { isStandaloneDatabaseClient } from '../joboss/database-scope.js'
import { isZeroCostMailOperation, type NetworkOperation } from './zero-cost-operations.js'
import type { Db } from '../audit/audit-log.js'
import { writeAudit } from '../audit/audit-log.js'
import type { ReasonCodeValue } from '../reason-codes/registry.js'
import { normalizeHost } from './host-lists.js'
import { resolveHostPolicy } from './host-policy.js'
import { checkRobots, RobotsPacingShortfall } from './robots.js'
import { matchApiContract } from './api-contracts.js'
import { checkBudget, reserveBudget, validateBudgetSpend, type BudgetSpend } from './budget.js'
import { HostRateLimiter, effectiveDelayMs } from './rate-limit.js'
import { rawGet, rawPostForm, rawPostJson, type RawResponse } from './http/raw-client.js'

export type PreflightAllow = { allowed: true; rateDelayMs: number }
export type PreflightRefusal = {
  allowed: false
  reason: Extract<
    ReasonCodeValue,
    'host_denied' | 'robots_disallowed' | 'terms_prohibited' | 'rate_limited' | 'budget_exhausted'
  >
}
export type PreflightResult = PreflightAllow | PreflightRefusal

export type GateContext = {
  /** Bounded source walks opt into one scheduler wait; ordinary content calls still refuse. */
  sourceDelayMs?: number
  /** Continuation of the same bounded source walk, after its first dispatch. */
  sourceWait?: boolean
  /** Attributes spend and budget headroom. Null for global-budget-only fetches. */
  companyId?: string | null
  /**
   * Credits this request consumes against the research budget.
   *
   * Defaults to 1. **Zero is allowed only for exact existing HTTPS mail/OAuth operations**;
   * research must declare positive integer base credits. That is
   * how the mail transport passes through this gate — it is here because
   * `FetchPolicyGate` is the only path to the network, not because it consumes a
   * research allowance, and a research cap must never be able to abort an approved
   * message (F5 §4.3).
   */
  cost?: number
  /**
   * The part of `cost` that consumes a PAID vendor allowance — Firecrawl credits,
   * today. Defaults to 0, which is correct for every free tier-2 fetch. Counted
   * alongside `cost` rather than instead of it: `creditsCap` still bounds every unit,
   * so "cap zero -> all research no-ops" still covers the free half (F2 §4.7), while
   * `vendorCreditsCap` bounds the part that is money (F5 §4.3).
   */
  vendorCost?: number
  /** Direct currency spend, for a per-lookup billed provider. Bounded by `billedUsdCap`. */
  billedUsd?: number
  /**
   * Response byte ceiling for this request. The default suits research pages;
   * a structured feed raises it deliberately, at the call site, so nothing is
   * ever truncated by accident. `RawResponse.truncated` reports the outcome —
   * see raw-client.ts.
   */
  maxBytes?: number
  /**
   * Extra request headers. The only current use is an `Authorization` bearer on an
   * authenticated vendor or provider API; the value never reaches an audit row,
   * because redaction runs at the sink and the gate logs no header at all.
   */
  headers?: Record<string, string>
}

/** The three-axis spend a `GateContext` declares, in `checkBudget`'s shape. */
function spendOf(ctx: GateContext): BudgetSpend {
  return {
    credits: ctx.cost ?? 1,
    vendorCredits: ctx.vendorCost ?? 0,
    billedUsd: ctx.billedUsd ?? 0,
  }
}

export type FetchPolicyGateOptions = {
  userAgent: string
  robotsTtlSeconds: number
  defaultRateDelayMs: number
  now?: () => Date
  /** Test clocks can advance with the scheduler; production uses ordinary timers. */
  waitForDelay?: (ms: number) => Promise<void>
}

/**
 * D4's mandatory fetch preflight, and the only path in this system that reaches
 * the network.
 *
 * The five checks run in a fixed order and every failure records a reason code and
 * skips the source — nothing is retried around. Order is not arbitrary:
 *
 *   1. Host policy   — cheapest, and the one that must never be bypassed. A denied
 *                      host is refused before a URL is even constructed, so no
 *                      request exists to intercept.
 *   2. robots.txt    — evaluated for our declared user-agent against the exact path.
 *   3. Terms flag    — robots.txt permission does not override stated terms, so a
 *                      terms-prohibited host is skipped even when robots allows it.
 *   4. Rate policy   — a published crawl-delay beats our default (see step 2's
 *                      returned delay feeding into this one).
 *   5. Budget        — company envelope and monthly cap both need headroom.
 *
 * D5's structural invariant: no adapter reaches the network except through this
 * gate. The HTTP client is private to policy/http/raw-client.ts, adapters receive
 * a gate rather than a client, and tools/check-no-raw-http.ts fails the build if
 * any other module so much as imports one. That makes the preflight unskippable
 * rather than a convention someone forgets.
 *
 * The same preflight governs Firecrawl escalation in F2. Firecrawl enforces
 * robots.txt itself and gates the bypass flag behind Enterprise support, so that
 * is defence in depth — but host policy, terms and budget are ours to enforce, not
 * a vendor's.
 */
export class FetchPolicyGate {
  private readonly limiter: HostRateLimiter
  private readonly robotsDelays = new Map<string, number>()
  private readonly robotsQueues = new Map<string, Promise<unknown>>()
  /** Hosts whose latest limiter stamp came from a robots hop, not from content. */
  private readonly robotsStamped = new Set<string>()

  /**
   * Waits at most once, for the computed spacing, then reports whether it is met.
   * Callers refuse when it is not, so a limiter clock that never advances cannot
   * loop forever. The extra millisecond absorbs timers that fire a tick early.
   */
  private async waitForHost(host: string, delay: number): Promise<boolean> {
    const rate = this.limiter.check(host, delay)
    if (rate.allowed) return true
    await (this.opts.waitForDelay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(rate.retryAfterMs + 1)
    return this.limiter.check(host, delay).allowed
  }

  /** Robots hops use the same limiter timestamps as content and each is audited. */
  private async fetchRobots(url: string, sourceDelayMs = 0): Promise<RawResponse> {
    const host = normalizeHost(new URL(url).host)
    const previous = this.robotsQueues.get(host) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(async () => {
      const policy = await resolveHostPolicy(this.db, host)
      if (policy.kind !== 'allowed' || policy.termsProhibited) throw new Error('robots redirect host/terms refused')
      const delay = Math.max(sourceDelayMs, effectiveDelayMs(this.opts.defaultRateDelayMs, policy.rateDelayMsOverride, (this.robotsDelays.get(host) ?? 0) / 1000))
      // Local pacing shortfall: a transient, uncached pause in checkRobots, never a robots refusal.
      if (!(await this.waitForHost(host, delay))) {
        const rate = this.limiter.check(host, delay)
        throw new RobotsPacingShortfall(rate.allowed ? delay : rate.retryAfterMs)
      }
      this.limiter.record(host)
      this.robotsStamped.add(host)
      const response = await rawGet(url, { userAgent: this.opts.userAgent, maxBytes: 512 * 1024 })
      await writeAudit(this.db, { actorType: 'system', actorId: 'fetch-policy-gate', action: 'fetch.robots_performed',
        subjectType: 'Url', subjectId: url, metadata: { host, statusCode: response.statusCode,
          bytes: Buffer.byteLength(response.body), truncated: response.truncated } })
      return response
    })
    this.robotsQueues.set(host, pending)
    try { return await pending } finally { if (this.robotsQueues.get(host) === pending) this.robotsQueues.delete(host) }
  }

  constructor(
    private readonly db: Db,
    private readonly opts: FetchPolicyGateOptions,
    limiter?: HostRateLimiter,
  ) {
    this.limiter = limiter ?? new HostRateLimiter(opts.defaultRateDelayMs)
  }

  async check(url: string, ctx: GateContext = {}): Promise<PreflightResult> {
    return this.preflight(url, ctx, 'get')
  }

  private async preflight(url: string, ctx: GateContext, operation: NetworkOperation, body?: unknown): Promise<PreflightResult> {
    if (!isStandaloneDatabaseClient(this.db)) {
      await this.recordRefusal(url, 'budget_exhausted', { detail: 'transaction_client_network_forbidden' })
      return { allowed: false, reason: 'budget_exhausted' }
    }
    const method = operation === 'get' ? 'GET' : 'POST'
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      await this.recordRefusal(url, 'host_denied', { detail: 'unparseable_url' })
      return { allowed: false, reason: 'host_denied' }
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      await this.recordRefusal(url, 'host_denied', { detail: 'unsupported_scheme' })
      return { allowed: false, reason: 'host_denied' }
    }

    const host = normalizeHost(parsed.host)

    // 1. Host policy.
    const verdict = await resolveHostPolicy(this.db, host)
    if (verdict.kind === 'denied') {
      await this.recordRefusal(url, 'host_denied', { host, matched: verdict.matchedHost })
      return { allowed: false, reason: 'host_denied' }
    }
    if (verdict.kind === 'unknown') {
      await this.recordRefusal(url, 'host_denied', { host, detail: 'no_allow_entry' })
      return { allowed: false, reason: 'host_denied' }
    }

    // 3 (evaluated early, it is free): terms beat robots, so an allowed-but-prohibited
    // host must not even cause a robots.txt request.
    if (verdict.termsProhibited) {
      await this.recordRefusal(url, 'terms_prohibited', { host })
      return { allowed: false, reason: 'terms_prohibited' }
    }

    const validated = validateBudgetSpend(spendOf(ctx))
    if (!validated.allowed || (validated.cost.credits === 0 &&
        (ctx.companyId != null || !isZeroCostMailOperation(url, operation, body)))) {
      await this.recordRefusal(url, 'budget_exhausted', { detail: validated.allowed ? 'positive_research_credits_required' : validated.scope })
      return { allowed: false, reason: 'budget_exhausted' }
    }

    // Documented API contracts govern exact API requests. Website paths retain robots.
    const contract = matchApiContract(url, method)
    const robots = contract ? { allowed: true, crawlDelaySeconds: undefined } : await checkRobots(this.db, url, {
      userAgent: this.opts.userAgent,
      ttlSeconds: this.opts.robotsTtlSeconds,
      hostExplicitlyAllowed: true,
      request: (robotsUrl) => this.fetchRobots(robotsUrl, ctx.sourceDelayMs),
      ...(this.opts.now ? { now: this.opts.now } : {}),
    })
    if (!robots.allowed) {
      const reason = 'pause' in robots && robots.pause ? 'rate_limited' : 'robots_disallowed'
      await this.recordRefusal(url, reason, {
        host,
        parseOk: 'parseOk' in robots ? robots.parseOk : true,
        source: 'source' in robots ? robots.source : 'api_contract',
        ...('statusCode' in robots ? { robotsStatus: robots.statusCode } : {}),
        ...('retryAfterMs' in robots ? { retryAfterMs: robots.retryAfterMs } : {}),
      })
      return { allowed: false, reason }
    }

    // 4. Rate policy.
    // A documented API rate limit (e.g. StartupDB 120/min) is a floor on same-host spacing.
    const delay = Math.max(effectiveDelayMs(
      this.opts.defaultRateDelayMs,
      verdict.rateDelayMsOverride,
      robots.crawlDelaySeconds,
    ), contract?.minSpacingMs ?? 0, ctx.sourceDelayMs ?? 0)
    this.robotsDelays.set(host, delay)
    // A newly fetched robots policy, or a robots hop (e.g. the www destination of an apex
    // walk) holding this host's latest stamp, is part of this request's prerequisite walk.
    // Wait for it once before content; if spacing is still unmet the check below refuses.
    // Ordinary too-early content-after-content requests still refuse without waiting.
    if (ctx.sourceWait === true || ('source' in robots && robots.source === 'network') || this.robotsStamped.has(host)) await this.waitForHost(host, delay)
    const rate = this.limiter.check(host, delay)
    if (!rate.allowed) {
      await this.recordRefusal(url, 'rate_limited', { host, retryAfterMs: rate.retryAfterMs })
      return { allowed: false, reason: 'rate_limited' }
    }

    // 5. Budget.
    const budget = await checkBudget(
      this.db,
      ctx.companyId ?? null,
      spendOf(ctx),
      this.opts.now?.() ?? new Date(),
    )
    if (!budget.allowed) {
      await this.recordRefusal(url, 'budget_exhausted', { host, scope: budget.scope, detail: budget.detail })
      return { allowed: false, reason: 'budget_exhausted' }
    }

    return { allowed: true, rateDelayMs: delay }
  }

  /** Sequential bounded source scheduling shares robots/content timestamps and never waits twice. */
  async fetchSourceText(url: string, ctx: GateContext & { sourceDelayMs: number }) {
    if (!Number.isFinite(ctx.sourceDelayMs) || ctx.sourceDelayMs < 0) throw new Error('Invalid source pacing floor')
    return this.fetchText(url, ctx)
  }

  /**
   * The only way for an adapter to obtain page text. Runs the preflight, issues
   * the request, records the spend, and returns the raw response.
   *
   * A refusal is returned as a reason code, never thrown: a skipped source is an
   * ordinary outcome that must be counted, not an exception that unwinds a job.
   */
  async fetchText(
    url: string,
    ctx: GateContext = {},
  ): Promise<{ ok: true; response: RawResponse } | { ok: false; reason: PreflightRefusal['reason'] }> {
    const pre = await this.check(url, ctx)
    if (!pre.allowed) return { ok: false, reason: pre.reason }

    const reserved = await reserveBudget(this.db, ctx.companyId ?? null, spendOf(ctx), this.opts.now?.() ?? new Date())
    if (!reserved.allowed) {
      await this.recordRefusal(url, 'budget_exhausted', { scope: reserved.scope, phase: 'reservation' })
      return { ok: false, reason: 'budget_exhausted' }
    }
    const host = normalizeHost(new URL(url).host)
    // Preflight is advisory: another request may have used this gate while the
    // database reservation waited. Recheck synchronously before opening a socket.
    const rate = this.limiter.check(host, pre.rateDelayMs)
    if (!rate.allowed) {
      await this.recordRefusal(url, 'rate_limited', { host, retryAfterMs: rate.retryAfterMs, reserved: true })
      return { ok: false, reason: 'rate_limited' }
    }
    this.limiter.record(host)
    this.robotsStamped.delete(host)
    const response = await rawGet(url, {
      userAgent: this.opts.userAgent,
      ...(ctx.maxBytes === undefined ? {} : { maxBytes: ctx.maxBytes }),
      ...(ctx.headers === undefined ? {} : { headers: ctx.headers }),
    })

    await writeAudit(this.db, {
      actorType: 'system',
      actorId: 'fetch-policy-gate',
      action: 'fetch.performed',
      subjectType: 'Url',
      subjectId: url,
      metadata: {
        host,
        statusCode: response.statusCode,
        bytes: response.body.length,
        truncated: response.truncated,
      },
    })
    return { ok: true, response }
  }

  /**
   * The same preflight, for a vendor API that only speaks POST (F2: Firecrawl's
   * v2 scrape endpoint).
   *
   * Nothing about the policy changes. Host allow/deny, terms, robots, rate policy
   * and both budget envelopes are evaluated exactly as they are for a GET, because
   * what they protect is the host and the spend — neither of which cares about the
   * verb. The only difference is downstream: no redirect is followed for a POST
   * (see raw-client.ts), and the body is JSON.
   *
   * `redactedBodyKeys` names fields whose values must not reach the audit row. The
   * gate writes an audit entry for every request, and a vendor payload can carry a
   * key; redaction runs at the sink, but naming the keys here keeps a secret out of
   * the metadata object in the first place.
   */
  async postJson(
    url: string,
    body: unknown,
    ctx: GateContext & { headers?: Record<string, string>; redactedBodyKeys?: string[] } = {},
  ): Promise<{ ok: true; response: RawResponse } | { ok: false; reason: PreflightRefusal['reason'] }> {
    const pre = await this.preflight(url, ctx, 'json_post', body)
    if (!pre.allowed) return { ok: false, reason: pre.reason }

    const reserved = await reserveBudget(this.db, ctx.companyId ?? null, spendOf(ctx), this.opts.now?.() ?? new Date())
    if (!reserved.allowed) {
      await this.recordRefusal(url, 'budget_exhausted', { scope: reserved.scope, phase: 'reservation' })
      return { ok: false, reason: 'budget_exhausted' }
    }
    const host = normalizeHost(new URL(url).host)
    // Preflight is advisory: another request may have used this gate while the
    // database reservation waited. Recheck synchronously before opening a socket.
    const rate = this.limiter.check(host, pre.rateDelayMs)
    if (!rate.allowed) {
      await this.recordRefusal(url, 'rate_limited', { host, retryAfterMs: rate.retryAfterMs, reserved: true })
      return { ok: false, reason: 'rate_limited' }
    }
    this.limiter.record(host)
    this.robotsStamped.delete(host)
    const response = await rawPostJson(url, {
      userAgent: this.opts.userAgent,
      json: body,
      ...(ctx.headers === undefined ? {} : { headers: ctx.headers }),
      ...(ctx.maxBytes === undefined ? {} : { maxBytes: ctx.maxBytes }),
    })

    const redacted = new Set(ctx.redactedBodyKeys ?? [])
    const safeBody =
      body !== null && typeof body === 'object'
        ? Object.fromEntries(
            Object.entries(body as Record<string, unknown>).filter(([k]) => !redacted.has(k)),
          )
        : undefined

    await writeAudit(this.db, {
      actorType: 'system',
      actorId: 'fetch-policy-gate',
      action: 'fetch.performed',
      subjectType: 'Url',
      subjectId: url,
      metadata: {
        host,
        method: 'POST',
        statusCode: response.statusCode,
        bytes: response.body.length,
        truncated: response.truncated,
        ...(safeBody === undefined ? {} : { body: safeBody }),
      },
    })
    return { ok: true, response }
  }

  /**
   * The same preflight, for a form-encoded POST — an OAuth 2.0 token endpoint (F5).
   *
   * RFC 6749 requires `application/x-www-form-urlencoded` for a token request, so
   * this could not be `postJson` with a different header. It is the third and, by
   * intent, last narrow method on this gate: one verb, one encoding, no general
   * request builder. Host policy, terms, robots, rate policy and the budget run
   * exactly as for a GET, because what they protect is the host.
   *
   * **No part of the body is ever audited.** `postJson` takes `redactedBodyKeys` and
   * logs the rest, which suits a vendor payload whose non-secret fields are worth
   * seeing. Every field of a token request is either a credential
   * (`client_secret`, `refresh_token`, `code`) or a constant, so the correct
   * allowlist is empty and an opt-out list would be one forgotten key away from
   * writing a refresh token into `audit_log`. A5: no plaintext credential in the
   * database, and none in a log line.
   */
  async postForm(
    url: string,
    form: Record<string, string>,
    ctx: GateContext = {},
  ): Promise<{ ok: true; response: RawResponse } | { ok: false; reason: PreflightRefusal['reason'] }> {
    const pre = await this.preflight(url, ctx, 'form_post', form)
    if (!pre.allowed) return { ok: false, reason: pre.reason }

    const reserved = await reserveBudget(this.db, ctx.companyId ?? null, spendOf(ctx), this.opts.now?.() ?? new Date())
    if (!reserved.allowed) {
      await this.recordRefusal(url, 'budget_exhausted', { scope: reserved.scope, phase: 'reservation' })
      return { ok: false, reason: 'budget_exhausted' }
    }
    const host = normalizeHost(new URL(url).host)
    // Preflight is advisory: another request may have used this gate while the
    // database reservation waited. Recheck synchronously before opening a socket.
    const rate = this.limiter.check(host, pre.rateDelayMs)
    if (!rate.allowed) {
      await this.recordRefusal(url, 'rate_limited', { host, retryAfterMs: rate.retryAfterMs, reserved: true })
      return { ok: false, reason: 'rate_limited' }
    }
    this.limiter.record(host)
    this.robotsStamped.delete(host)
    const response = await rawPostForm(url, {
      userAgent: this.opts.userAgent,
      form,
      ...(ctx.headers === undefined ? {} : { headers: ctx.headers }),
      ...(ctx.maxBytes === undefined ? {} : { maxBytes: ctx.maxBytes }),
    })

    await writeAudit(this.db, {
      actorType: 'system',
      actorId: 'fetch-policy-gate',
      action: 'fetch.performed',
      subjectType: 'Url',
      subjectId: url,
      metadata: {
        host,
        method: 'POST',
        encoding: 'form',
        statusCode: response.statusCode,
        bytes: response.body.length,
        truncated: response.truncated,
        // Deliberately no body, and deliberately not even the key names: the key
        // names of a token request are a fixed, public set, so printing them buys
        // nothing and normalises logging near a credential.
      },
    })
    return { ok: true, response }
  }

  private async recordRefusal(
    url: string,
    reason: PreflightRefusal['reason'],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await writeAudit(this.db, {
      actorType: 'system',
      actorId: 'fetch-policy-gate',
      action: 'fetch.refused',
      subjectType: 'Url',
      subjectId: url,
      reasonCode: reason,
      metadata,
    })
  }
}
