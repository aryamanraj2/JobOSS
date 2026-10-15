# R-C — Discovery, funding and freshness independent review

Start a **fresh local chat** in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`, named **R-C — Discovery review**. C has yielded. This is the sole active assignment; all builders/other reviewers are idle. Work directly without agents or messages to other chats. Source/tests/config/schema/migrations/Git state are read-only. Write only the new review report below; preserve all existing work/reports.

## Objective and evidence boundary

Independently review C against `docs/JOBOSS-WORKER-03-DISCOVERY.md` and `/Users/aryamanjaiswal/Downloads/PLAN.md`. Read `docs/JOBOSS-C-DISCOVERY-REPORT.md`, current changes, referenced interfaces/fixtures and latest coordination entries. Prior foundation and scoped delivery are accepted; their automatic-isolation/readiness/provider limits remain. Do not restart their broad reviews.

Give separate verdicts for **C-owned deterministic discovery/funding/ATS/ranking** and **application-scoring persistence/integration readiness**. C reports 203 tests/9 files but also two known reproduced defects in the unedited `src/intel/scoring/run.ts`. Independently confirm or reject those claims; do not waive them because their file was outside C's assignment. Conversely do not attribute inherited scorer defects to accepted core/delivery or require C to implement unowned fixes during your read-only review. The orchestrator will assign bounded ownership after your report.

Acceptance concerns traceable relevant company research inputs and honest partial states, not company-count inflation. No final real 20-company cohort, automatic-runtime, recipient/draft, real source completeness, mailbox or pilot acceptance. Synthetic outputs must stay labeled synthetic. No live discovery-data writes, provider inference or real mail operation is needed/authorized.

## Scope, ownership and agreed interfaces

Review C's inventory: `src/ingest/**`, `src/intel/outreach/**`, scoring collector/version additions, seed/intelligence tools, owned tests/fixtures, and the narrowly corrected ATS ownership fixture in `test/integration/llm-handoff.test.ts`. Inspect read-only `src/intel/scoring/run.ts` and its callers to assess the reported integration seams. Shared core/schema/config/task registry and all contacts/drafts/mail/send code are read-only references, not a feature-edit assignment.

Existing public exports:

- `prepareDiscovery(db,gate,{limit,runId?,now?,resume?,delayMs?})`: returned batchId/source row IDs, distinct companyIds/source counts, coverage/errors and completeness.
- `refreshDiscoveryBoards(db,gate,companyIds,{now?,delayMs?,limit?})`: bounded typed results per requested/missing company.
- `rankOutreachCompanies(db,{limit,now?})` returning shared RankedOutreachCompany, plus pure assessment.

Check actual signatures/count/resume semantics against the report rather than assuming prose is implemented. Limit is distinct accepted companies per source/run/invocation, separate from final cohort size. Top-level discovered is cross-source union; source discovered cumulative per run; already-known companies can still gain source attribution. Recipient selection/status must survive reranking. Automatic execution remains isolation_blocked/manual; no offline-test helper or injected executor may bypass it.

## Required substantive review

### Discovery/access/checkpoints

Verify recent active YC small/unknown-size discovery without the old ten-person floor and preservation of operator/lifecycle data. Check the explicit recorded cohort scope rather than calling it an exact rolling funding window. Review stable feed-hash/change behavior, malformed/raw scan caps and interrupted item storage/checkpoints.

StartupDB investor/company domain identity, >25 portfolio pagination, funding preview/activity pages, caps, missing arrays/totals, loops/drift, 429/Retry-After and partial coverage need actual fixture/probe evidence. Inspect durable pending funding state and revalidation: interrupted company/pages must replay safely without losing/duplicating facts. HN selection must use the correct author/three distinct monthly threads within recorded scope, freeze meaningful IDs against reordering, reject ambiguous/non-employer posts and disclose missing threads/caps. Public author/contact text is not verified identity or permission to send.

Check runId/batch/source-row identity, invalid/legacy cursors, resumed completed sources, frozen scope versus observation time, distinct company/source totals and error/disclosure persistence. A checkpoint/storage failure must not skip an interrupted candidate. Source scope exhaustion and primary-fact verification are distinct: unverified indexed facts are permissible only with honest labels; missing/capped source coverage must not falsely be complete. Same-batch concurrent execution is explicitly caller-serialized, not a claimed distributed lease; assess actual exposed callers against that contract.

Current documented endpoints must stay behind the accepted narrow API registry/gateway, with website robots/terms/deny/rate/budget rules preserved. Verify first-party documentation if a technical contract claim depends on it; distinguish doc verification from actual live dataset measurement. Do not make real source ingestion requests into live data or introduce paid/alternate transports. Regional/custom ATS coverage limits that visibly refuse are not automatically an invitation for scope expansion.

### Funding provenance

Independently check duplicate rounds across portfolios/event IDs and retries, source/excerpt/company/stage/date binding, field-level indexed versus primary support, metadata/disclosures, conflicting facts, multiple permitted original sources and downgrade/revalidation behavior. Do not accept primary_verified as blanket proof of indexed amount/currency/participants.

Test “14 investors” plus October/year cannot become October 14; stage words embedded in investor names cannot establish stage. Exact/month/year/unknown/impossible/future dates and conservative 180-day intervals must behave as described, separately from discovery/lastSyncedAt. Old latest-known Seed with incomplete later history is not verified current early stage. Verify fact-specific evidence supports the generated ranking explanation/citations, not merely a matching ID.

### ATS ownership/current facts and score inputs

Verify fetched employer careers markup binds exact vendor/token/domain/company/evidence/hash/time. Stored third-party URLs, nested spoof links, stale/person/wrong-company evidence and ambiguous boards must not establish ownership. Test vendor drift/redetection failure and old binding behavior.

Only successful complete verified snapshots may close missing jobs/publish complete counts; test empty complete, failed/partial/capped/malformed, missing/returning and A→B→A current content. Check evidence renewal/no-op observations, current-board/hash/body support and stale/future exclusions. Distinct page sources must not be inflated by chunks/fragments. Selected-company refresh is bounded and absent ATS stays visible rather than globally disqualifying research.

Review immutable joboss-v4 input derivation against unchanged V1/V2/V3 meanings/weights and existing history. Verify the collector's eligible posting IDs and citations reflect the actual filtered facts; then follow them into persistence under the separate seam check below.

### Research priority/output quality

Inspect actual synthetic funnel/ranking/funding outputs and independently reproduce representative cases: supported small mobile/AI no-ATS, unknown-size/global, indexed-only, old funding, wrong-board and established/excluded companies. Supported fit must require valid current primary proof. Research priority must remain independent of ATS/geography/application score and never become send readiness. Preserve eligibility uncertainty, meaningful triggers, old-stage limitations and D-owned recipient selection/status/blocks when reranking.

The reported synthetic source union 1 from YC/StartupDB/HN must really be one distinct company; resumed completed batch must not refetch. Ranking must leave existing Lead/draft history alone. The evidence needed for the final review cohort is still unfulfilled; do not count fixture companies toward it.

## Two reported scorer persistence blockers — independently reproduce

Retained evidence if present: `/tmp/joboss-c-evidence/shared-requests.mjs`, `.log`, `.json`. Read before any use; build your own bounded guard-verified probes as needed.

1. **Rejected opportunity attachment:** collector exposes zero usable posting inputs but `scoreCompanyAndPersist` independently selects any open Opportunity, attaches a stale foreign-board row and returns posted_role. Reproduce stale/closed/wrong-board/hash mismatch versus a valid supported/returning posting. Determine the collector-to-persistence eligibility interface needed; no production edit yet.
2. **Historical same-cycle Lead mutation:** existing joboss-v3 Lead in the current campaign cycle is reused and its scoreVersionId/content changes to joboss-v4. Inspect attached drafts/operator status and audits, not just immutable ScoreVersion weights. Reproduce actual row preservation failure across versions and identify which existing caller is affected now. Distinguish separate-cycle history, same-version rescoring and cross-version/reviewed-lead behavior. Do not suggest invented campaign cycles or removing send dedup as a remedy. An explicit safe refusal is an acceptable potential architecture if reviewed; assigning/implementing the strategy is the orchestrator's next step.

Root inspected the collector/run.ts mismatch and retained outputs (`scoringInputPostingCount:0`, rejected opportunity selected, sameCycleLeadIdReused:true, v3→v4). Those are source corroboration and C's executed probes, not root-run database reproduction. Validate independently and assign priorities/required boundary; label them confirmed or refuted with evidence. They do not authorize live rescoring.

## Verification and preservation

Use exclusively the yielded C target **outreach_test_joboss_c** (already on the approved shared allowlist), not an invented unapproved R-C target or another worker/common/live database. Validate configured-live exclusion/local target and read-only actual connection before normal immutable migrations/fixtures. Serial files, shared setup/HTTP mocking/net-connect refusal and fakes remain. No db push/reset, guard bypass, constraint removal, dependency replacement, source generation or tracked test changes.

Reproduce this exact nine-file selection with explicit process-only test URL:

```text
test/unit/discovery-sources.test.ts
test/integration/discovery-c.test.ts
test/integration/ats-ingest.test.ts
test/integration/ats-adapters.test.ts
test/integration/seed-loader.test.ts
test/integration/scoring-persistence.test.ts
test/integration/llm-handoff.test.ts
test/unit/scoring.test.ts
test/unit/ats-signatures.test.ts
```

C reports 203 passing tests, including all 15 handoff tests after proper employer proof. Review fixture changes for real production ownership paths and preservation of foreign-citation/redaction/schema assertions. Do not weaken a gate or rewrite a test during review. Supplemental semantic/failure/resume/known-blocker probes should use actual production functions rather than replacing them with a test implementation. Actual counts/outputs matter; no full delivery/foundation rerun needed.

Run lint, network guard, schema validation, whitespace and backend/UI typechecking separately with incremental writes disabled. Keep the three existing D-owned optional-contactId errors tracked; new C diagnostics are actionable. Check unchanged migration hashes/protected indexes on C; expected JOBOSS hashes remain preparation `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`, uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

If accessible, protected live baseline comparison is BEGIN READ ONLY/ROLLBACK only: all 57 drafts/14 captured fields, 11 index definitions, zero attempts/live JOBOSS migrations, F5/both flags false. Preserve current HEAD/staged/unstaged content. No real inbox/send/OAuth/auth/model calls, live approvals/writes/deployments, outreach, sending enablement, paid service, staging/commits/resets, install/generation or agents. New temporary supplemental fixtures/scripts may be owned by you; only C's test target receives writes.

## Report and yield

Save `docs/JOBOSS-C-DISCOVERY-REVIEW.md`, return it labeled **R-C — Discovery, funding and freshness review report**, then yield. Include:

- Separate C-owned feature and scorer-persistence/integration verdicts; exactly what may proceed and what remains blocked.
- Confirmed actionable defects with priority, absolute file/line, actual reproduction/effect and bounded ownership request. Distinguish hypotheses, historical documentation and acknowledged conservative availability limits.
- Exact checks/file-test counts/results, representative funnel/ranking/provenance outputs, both scorer seam reproductions, skipped/blocked checks and preservation evidence.
- Final local/shared interfaces, source scope/cursor/limit semantics and D/E/runtime compatibility notes.

Do not implement fixes or choose a new shared migration/ownership strategy in this review. Do not close the two reported integration gaps without evidence. Return through the human/orchestrator for coordinated bounded corrections; no next worker/reviewer assignment starts here.
