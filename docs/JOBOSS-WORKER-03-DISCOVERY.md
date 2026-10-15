# C — Discovery, funding, freshness and research priority

Start **now in a fresh local chat** on `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`, named **C — Discovery/funding/freshness**. This is the sole active assignment. A/shared foundation and B/scoped delivery are independently accepted; their builders/reviewers stay idle. D/E are queued. Work directly without agents or messages to other chats. Return your report through the human/orchestrator.

## Read first and objective

Read `/Users/aryamanjaiswal/Downloads/PLAN.md`, latest entries of `docs/JOBOSS-COORDINATION.md`, `docs/JOBOSS-FOUNDATION-CORRECTIONS-02-REVIEW.md`, `docs/JOBOSS-B-CORRECTIONS-03-REVIEW.md` (accepted downstream contracts/limits only), `docs/JOBOSS-PRODUCT-RESEARCH.md`, current relevant source and the existing diff. Earlier audit defects describe historical baselines; preserved partial discovery code already addresses some. Verify current behavior before deciding what needs implementation. No full history from the delivery correction loop is needed.

Complete the existing deterministic discovery/funding/ATS feature and additive outreach research ranking. Relevant early mobile/AI startups should become explainable research candidates even without ATS/location certainty. Preserve the application-ranking system and current data/drafts; do not turn a research score into outreach readiness. Deliver bounded, tested interfaces for D/E, then yield for independent R-C review.

## Ownership

Own `src/ingest/**`, `src/intel/outreach/**`, `src/intel/scoring/collect.ts`, immutable input-derivation version additions in `src/intel/scoring/score-version.ts`, `tools/run-seed-ingest.ts`, `tools/run-intelligence.ts`, related discovery/funding/ATS/YC/scoring tests/fixtures and your report/current subsystem documentation.

**Narrow test extension:** fix the known stale ATS fixture in `test/integration/llm-handoff.test.ts`, which currently causes three historical failures. Supply genuine synthetic employer-owned board proof/current supported ATS evidence using production paths; preserve foreign-evidence rejection, redaction, ownership/hash and allowset assertions. Do not edit shared handoff/citation validation to make the fixture pass. Existing ATS/scoring fixtures may similarly need explicit supported ownership rather than invented flags.

Do not edit core/shared interfaces/schema/migrations/config/task registry, test global/shared helper setup, package/lockfile, contacts/drafts/approval, mail/send/inbox, UI or another worker's report. A remains sole owner of shared changes; return a concrete bounded request if needed. Do not reset/overwrite inherited work, rewrite applied SQL, stage or commit.

## Agreed dependencies and interface contracts

Use accepted models FundingRecord, DiscoveryRun, OutreachAssessment and `RankedOutreachCompany` from `src/core/joboss/contracts.ts`. Keep its fields `companyId`, `name`, `domain`, `priority`, `primaryTrack`, `status`, `blockers`, `eligibility`, `fit`, `trigger`, `citedEvidenceIds`; do not substitute `companyName` or invent a parallel shared schema.

Retain these existing exports/call forms and evolve their **local** options/results additively when useful:

- `prepareDiscovery(db, gate, {limit, runId?, now?, resume?, delayMs?}) -> Promise<DiscoverySummary>` in `src/ingest/discovery/prepare.ts`.
- `refreshDiscoveryBoards(db, gate, companyIds, {now?, delayMs?})` for only the selected companies; expose typed per-company coverage/failure/complete results and appropriate bounds.
- `rankOutreachCompanies(db, {limit, now?}) -> Promise<RankedOutreachCompany[]>` and pure assessment in `src/intel/outreach/assess.ts`.

Counting decision: discovery `limit` bounds accepted/emitted candidates **per source per invocation**, not the final review-cohort size. Duplicate identities must not inflate distinct source/run/company totals. Top-level discovered-company total is distinct across sources, not the sum of overlapping source totals; expose the company-ID union and separate attributable source counts so E can report the funnel. Add bounded scan/request/page caps separately from emitted-company limit. Record exact semantics and actual signatures in the report.

Run IDs/cursors must identify the correct source/run scope and preserve interrupted candidates. `complete` means the declared bounded source scope was actually traversed; capped/truncated/failed/malformed-undetermined coverage stays partial/paused. It does not mean a global exhaustive startup census. Preserve readable errors/retry timing, attribution and uncertainty. Invalid run IDs/cursors should not silently resume unrelated work. New runs and resumed windows must have documented scope/time semantics.

The automatic subscription runner remains intentionally `isolation_blocked`. No inference is needed to complete this deterministic task. Preserve that result/manual handoff if encountered; no injection seam, test-only runner import, flag or provider fallback may enable real execution. Missing evidence/research remains a resumable blocker. Runtime enablement is a separate reviewed assignment.

## Implementation behavior and acceptance criteria

### 1. Sources, identity and resumable coverage

- YC: recent active cohorts from the plan's last-two-years scope, with an explicit recorded cutoff. Remove the ten-person floor from this new path; prefer 1–50, then 51–250, retain unknown sizes. Preserve explicit older commands/history where still useful. Batch membership is index evidence, not funding date or primary proof of size/stage.
- StartupDB: use officially documented investor search/identity, portfolio, company detail and funding-activity pagination. Seed Seedcamp, Antler, Techstars, Accel and Index Ventures. Corroborate exact investor/company identities/domains; similarly named or conflicting records are not verified relationships. Keep source/license/provenance/freshness/coverage disclosures, including funding previews and omitted pages. Resume interruptions within company/funding pages without skipping or duplicating candidate/round facts.
- HN: traverse the last three available monthly employer “Who is hiring?” threads within a recorded scope, verifying author/thread identities. Persist selection/comments/caps and missing-thread limitations. Reject deleted/dead/recruiter/seeking-work or ambiguous employer routes. Public contacts in the post may remain captured source material for D, but do not create verified contacts or infer author responsibility here.
- Malformed/omitted arrays, 429/Retry-After, provider refusal, truncation/loop/offset drift, fetch/storage/checkpoint interruption and missing sources must produce honest coverage. Save progress only after durable handling; retry is idempotent. Positional cursors over changing feeds must not silently skip changed identities. Preserve reviewed lifecycle/operator domains on re-import.

Verify current official API documentation before relying on endpoint shapes; record links and any version/access limits. All application source requests stay through the existing fetch gateway: exact approved API contracts only, normal website robots/terms/deny/rate/budget controls. `src/core/policy/api-contracts.ts` already holds narrow StartupDB/HN/ATS/YC matches; C cannot broaden it. If documentation requires a shared change, report the exact method/path/query/evidence and pause that affected operation, while completing independent work. No Recent Funding outreach source, paid enrichment, alternate transport or implicit API billing. Docs may be researched read-only; acceptance tests use fixtures and no live outreach-data mutation.

### 2. Funding facts and provenance

Store/deduplicate company rounds with stable event/source identity, source URLs/evidence, stage, amount/currency when supported, investor attribution, original date text/precision and observation time separately. Retrying/resuming or seeing a round through several portfolios must not produce duplicate facts or lose source disclosures.

`primary_verified` requires actually captured original company/investor evidence supporting the precise attributed fact. Company name plus unrelated numeric/date/stage words is insufficient. Do not let index-only amount/date/participants inherit primary verification for unsupported fields; preserve field-level uncertainty in existing metadata where needed. Try permitted original source candidates within explicit bounds rather than inventing verification on failure. Record stale/changed source and conflicting/later round uncertainty.

Required regression: “14 investors” plus “October 2026” does **not** establish October 14. Test exact/month/year/unknown, impossible/future dates, 180-day boundary and partial-date intervals. Recent funding is a priority signal, distinct from historical stage; no exact date synthesized from observation/batch/lastSyncedAt, no invented current-stage certainty from an old/latest-known incomplete round history.

### 3. ATS ownership and freshness

Require fetched employer-owned careers markup linking the exact vendor/board before ingestion/scoring/citation use. A stored third-party careers URL or another company's shared token alone is not proof. Reject ambiguous/mismatched/off-domain/stale ownership and current-board drift; keep evidence/company/hash/vendor/token binding explicit.

Close missing jobs only after a successful **complete verified** board snapshot. Partial/failed/capped/malformed snapshots never close missing jobs or claim a complete count. Successful empty boards can close missing jobs. Returning jobs reopen. Compare current stored content so A→B→A updates correctly; historical evidence alone cannot make the final A look unchanged from current B. Preserve no-op refresh semantics and valid observation timestamps. Refresh selected boards through the exported bounded function; no ATS must remain a visible research state, not disqualify the company.

Scoring inputs must exclude closed/stale/wrong-board/current-hash-mismatched opportunities/evidence; multiple excerpts from one page are not several meaningful sources. Preserve existing immutable score versions/leads/audit meaning. Add a new input-version label only where semantics change relative to an already persisted version; do not retune historical weights or rewrite rows. Explain the selected active version and why in your report.

### 4. Explainable research priority, separate readiness

Prioritize supported mobile/AI fit, then meaningful hiring/funding/launch triggers, early-stage suitability and recency; general software is secondary. Seed/index fit invites research but never sets `fit.supported` without valid current primary supporting evidence. Verify cited evidence actually supports the match; no dangling/stale/person/wrong-company citations. ATS-only support requires verified current ownership and current posting facts.

No geography/ATS prerequisite for research, no fabricated remote/sponsorship/relocation. Surface known restrictions with citations and unknown eligibility. Prefer 1–50/early stage, show unknown size and incomplete stage histories. Excluded lifecycle/operator stops must not be overwritten by discovery. Keep application scores separate. Emit `research_needed`/`contact_needed` plus reasons, never approval/send-ready. Reranking must not silently wipe later recipient selections or completed work; D owns those fields/decisions. Product survey implications are explainable fit/trigger/source dimensions, not copying unverifiable product success claims.

## Verification and evidence requirements

Only synthetic data on dedicated **outreach_test_joboss_c**; create locally if absent, process-only test URL, shared configured-live exclusion and read-only actual-identity verification before normal immutable `prisma migrate deploy`/fixtures. Preserve `.env`, all applied checksums/protected indexes and other worker databases. No db push/reset, guard bypass, dropping constraints or live migration/write. Normal MockAgent outbound-net refusal stays active. Dependency hydration may restore existing cloud-only files; do not alter versions or weaken checks to handle a stall.

Run meaningful focused tests for source pagination/caps/429/errors/resume and duplicate/ambiguous identities; funding dates/provenance/duplicates; small/unknown YC companies; ATS ownership, complete/empty/partial/failed/missing/returning/A→B→A snapshots; current-hash freshness/distinct-source inputs; ranking without ATS/global uncertainty and immutable application history. Include the related older ATS/YC/scoring suites and the narrowly corrected handoff fixture file. Do not run another full delivery/foundation review; preserved accepted code is outside scope. Run lint, network guard, schema validation, whitespace and backend/UI typechecks separately (incremental writes disabled), reporting unchanged D errors rather than editing them.

Provide actual fixture-driven funnel/ranking outputs across representative relevant small mobile/AI, indexed-only, no-ATS, unknown-size/global, historical-funding, wrong-board and established-company cases. Clearly label synthetic evidence. Explain why each ranks/blocks and show primary source IDs/date precision. This is acceptance evidence for C, not the final real 20-company cohort. The end-to-end goal remains 20 distinct companies targeting 15 supported early-stage mobile/AI startups; never manufacture data to meet it. Final live preparation/cohort is E/V work.

If accessible, protected live comparison is only BEGIN READ ONLY/ROLLBACK against the existing baseline: 57 drafts/all protected fields, 11 indexes, zero sends/live JOBOSS migrations, F5 and both sending flags false. All actual discovery/ATS writes in this assignment remain on C fixtures, not live. No send/inbox CLI, mailbox/OAuth/auth/model calls, live approval, sending enablement, paid service, stage/credential edits, staging/commits or unowned cleanup.

## Required report and stopping point

Save `docs/JOBOSS-C-DISCOVERY-REPORT.md`, return it labeled **C — Discovery, funding and freshness report**, then yield. Include changed files; confirmed inherited defects versus implemented behavior; exact interfaces/count semantics/run scopes/cursors; source documentation/access and coverage limitations; tests/checks actually executed with exact results and representative outputs; preservation evidence; remaining D/E/runtime blockers and bounded shared requests. If quota/source/environment blocks completion, retain a precise resumable checkpoint and honest unfinished list. Do not claim full JOBOSS/cohort/pilot completion or start D/R-C yourself.
