# A — Foundation corrections 01 report

Date: 15 October 2026. Bounded corrections to the original A foundation after R-A review. All six findings have implementation changes and executed regressions; acceptance belongs to the original R-A re-review. This report does not establish overall JOBOSS, automatic preparation, or pilot readiness. Actual subscription tool/catalog isolation remains unproven as described below.

Read before editing: corrections assignment, original A assignment and report, R-A review, B delivery report, coordination record/roadmap, referenced `/Users/aryamanjaiswal/Downloads/PLAN.md`, and existing work/diff. Work was performed directly, without spawning agents or messaging another chat.

## Findings mapped to fixes and evidence

| Finding | Implemented correction | Executed verification / result | Remaining limit |
|---|---|---|---|
| **R-A1 — Dedicated database and pre-migration guard** | New hook-free shared target validator accepts only exact local PostgreSQL targets `outreach_test`, `outreach_test_joboss_a`, `_b`, `_c`, `_d`, `_ra`. Rejects remote/unapproved names, URL overrides/query/hash, unsupported protocols, and normalized live aliases. Captures independently configured live identity before environment substitution; only identity metadata is retained. Global setup validates URL and actual `current_database()` before normal migration deployment; setup and truncation validate actual selected identity before writes. Imports avoid B's aliased `db` helper. | Negative target/alias/substitution tests; unsafe global setup never invokes migration or connection probe; identity failure prevents migration. All focused tests ran on **outreach_test_joboss_a** through the normal guarded harness. | B's helper/config files were preserved. B's database and suite were not operated; compatibility is supported by target/alias handling and tests, not a new B run. |
| **R-A2 — Zero-credit research bypass** | Gate requires positive integer base credits for research, including vendor-attributed requests. Exact HTTPS Gmail message list/full-read/attachment-read/send and OAuth token grant operations receive the narrow zero-cost exception, including method, encoding, path, query/body shape, and absence of company attribution. No arbitrary skip option or domain-wide exception. Host/terms, applicable robots/API contracts, and rate checks remain. | Offline HN, StartupDB and company research with zero/vendor-only cost cannot reach transport with missing or exhausted envelopes. Exact mail/OAuth operations work with no research envelopes; unrelated Google URLs, wrong method/encoding/query/body, host denial and terms denial are rejected. Existing no-raw-HTTP guard passes. | No mailbox, OAuth exchange or live transport was exercised. Zero spending remains an accounting no-op; its network eligibility is enforced at the gate. |
| **R-A3 — Unique envelope and exact accounting** | New partial unique global-period index. Migration locks inspection/index creation and refuses duplicate global periods with explicit reconciliation required; no automatic merge/delete/cap increase. Checks fail closed on ambiguity. Reservations lock global first, then company, and charge only the exact validated locked IDs. All exported accounting paths share safe nonnegative integral credit/vendor validation; nonfinite/negative amounts and all positive billed USD are refused. `recordSpend` uses the same checked atomic reservation and throws on refusal. | Actual independent PostgreSQL connections, distinct backend PIDs, last-credit competition for global/company/vendor dimensions: one winner and exact counters. Concurrent global creation permits one row. Direct accounting cannot bypass caps; invalid spend paths reject consistently. Exact migration tested with duplicate fixtures in an isolated schema on A: fails, preserves rows, creates no index. Transaction rollback preserves provisional accounting; gate refuses transaction-client networking before any transport. | The transaction-client discriminator uses Prisma 7.10 runtime transaction symbols, verified against installed source and real clients. Keep these regressions when upgrading Prisma. All inspected real gate callers use ordinary clients; no outside-owned caller edit was required. |
| **R-A4 — Captured identity for authorship** | Every accepted verified-authorship hook requires captured `identityVerified`, nonempty identity evidence, and every identity evidence ID inside the task allowset, regardless of model `identityStatus`. Inconsistent capture metadata is refused. | Real fulfil regressions with model status `unverified` and identity evidence `[]`, unknown-only, or allowed-plus-unknown fail with source mismatch and leave tasks pending. Existing citation/source validation remains. | Recipient-owned person/company binding and capture semantics remain separate dependencies and were not broadened. |
| **R-A5 — Descendant termination** | Runner termination awaits the entire owned detached process group independently of immediate child closure. SIGTERM escalates to SIGKILL after grace; timeout, overflow and normal-close descendants use the same bounded group cleanup. Cleanup is reported and artifacts removed only after group disappearance. Unconfirmed disappearance returns failure and retains the owned directory. | Timeout and output-overflow fixtures reproduce parent exit on SIGTERM while a descendant ignores SIGTERM with disconnected streams. Both are gone before packet-directory removal. Launch-failure cleanup also passes. Signals target only fixture/runner-owned processes. | Process-group behavior was verified on this macOS environment, not every OS. An OS-level failure to terminate remains an explicit failure with retained artifacts, rather than a cleanup success. |
| **R-A6 — Atomic open-task deduplication** | New partial unique index covers pending/claimed `(kind, prompt_version, subject_type, subject_id)`. Enqueue uses `INSERT ... ON CONFLICT ... DO NOTHING RETURNING`, then reads the winner; bounded retry handles a winner becoming terminal. Task creation and queue audit share the caller/ordinary transaction. Duplicate legacy open identities cause migration reconciliation failure. Terminal history and subsequent/versioned tasks remain valid. | Four independent Node processes synchronize before enqueue: one open row, one `created:true`, one queue audit, consistent task ID. Existing-transaction conflict remains usable; rollback commits neither task nor audit. Independent claimant/fulfil/reject and stale-owner success/invalid/reject/runner-metadata regressions preserve replacement state and accounting. Duplicate migration fixtures are preserved on refusal. | PostgreSQL-specific invariant/SQL is intentional. Re-review must independently reproduce the new concurrency tests. |

The real transaction regression exposed a Prisma 7.10 detail during implementation: transaction clients still expose `$transaction` through nested savepoints. Method presence alone was insufficient. The final scope check recognizes the runtime transaction markers; the final focused run includes the actual rollback/network reproduction.

## B interface request and public contracts

- `ProviderMessageRef` adds **`rfc822MessageId?: string | null`**. Documentation identifies the provider's actual stored RFC header, distinct from the client's deterministic reconciliation ID. Providers may omit it; B's compatible local extension and all transport/send files remain unchanged. A compatibility regression passes.
- B's optional `inbox_ingestion_incomplete` reason-code rollout remains **deferred**. Existing `weak_evidence` plus detail/audit behavior is preserved; no enum expansion.
- Budget APIs remain available: `checkBudget`, `reserveBudget`, `recordSpend`, `currentPeriodMonth`; consistent `validateBudgetSpend` and `BudgetSpendRefusedError` are exported. Refusals include invalid/ambiguous spend details. Positive billed USD is never restored. Direct accounting now refuses unchecked spending rather than incrementing blindly.
- Gate transaction clients are explicitly unsupported for network operations; ordinary-client reservations commit before transport. Existing task versions, source/citation allowsets, lease fencing, API contracts, historical schemas and sending guards remain in place.

## Changes in this correction pass

Existing files changed relative to the preserved start snapshot:

```text
prisma/schema.prisma                         # explanatory partial-index comments
src/core/interfaces/providers.ts
src/core/llm/foundation-validation.ts
src/core/llm/handoff-gateway.ts
src/core/llm/subscription-runner.ts
src/core/policy/budget.ts
src/core/policy/fetch-policy-gate.ts
test/global-setup.ts
test/setup.ts
test/helpers/db.ts
test/integration/budget-envelopes.test.ts
test/integration/joboss-foundation.test.ts
```

New files:

```text
prisma/migrations/20261015010000_joboss_foundation_uniqueness/migration.sql
src/core/joboss/database-scope.ts
src/core/llm/process-group.ts
src/core/policy/zero-cost-operations.ts
test/helpers/test-target.ts
test/helpers/joboss-enqueue-child.ts
test/unit/joboss-test-target.test.ts
test/unit/joboss-process-cleanup.test.ts
test/integration/joboss-corrections.test.ts
docs/JOBOSS-A-CORRECTIONS-01-REPORT.md
```

Existing unrelated partial changes were retained. No delivery, recipient, draft, discovery, UI, B test-helper/config or `llm-handoff.test.ts` edits were made in this pass.

## Checks actually executed

Database-backed runs explicitly selected `outreach_test_joboss_a` by a process-only `TEST_DATABASE_URL` override before starting Vitest. `.env` was not edited. Local creation of A's database, if absent, used the existing local PostgreSQL connection; no other worker/common database was reset, truncated or migrated.

| Check | Actual result |
|---|---|
| Guarded normal `prisma migrate deploy` on A, then `prisma validate` / `prisma generate` | Passed. Prisma Client 7.10 generated. No `db push`, migration reset or live deployment. |
| Final focused Vitest selection below | **8 files passed, 161 tests passed, 0 failed; 10.86 seconds.** Real PostgreSQL concurrency and offline transport/process fixtures included. |
| Separate older regressions: `budget-envelopes.test.ts` and `llm-handoff.test.ts` | **28 tests: 25 passed, 3 failed; 1 file passed, 1 failed; 2.38 seconds.** Corrected budget file: all 13 passed. Unmodified handoff file: 12 passed, 3 ATS-fixture failures. |
| `npm run check:no-raw-http` | Passed: transport remains confined to the approved raw client. |
| `npm run lint` | Passed, exit 0, after correcting a new test's `prefer-const` diagnostic. |
| `npx tsc --noEmit -p tsconfig.backend.json` | Executed separately; exit 2, exactly the three unchanged TS2379 recipient errors listed below. No foundation diagnostics. |
| `npx tsc --noEmit` | Executed separately; **passed, exit 0**. |
| `git diff --check` | Passed, exit 0. |
| Read-only A migration/index inspection | 13 completed migrations; every applied checksum matches disk. Both new partial indexes and both send deduplication indexes present. |
| Read-only live protection inspection | 57/57 original protected drafts and 11/11 protected index definitions match baseline; 0 send attempts; 0 live JOBOSS migrations. |

Final focused selection:

```text
test/integration/joboss-corrections.test.ts
test/integration/joboss-foundation.test.ts
test/unit/joboss-test-target.test.ts
test/unit/joboss-process-cleanup.test.ts
test/unit/joboss-runner.test.ts
test/unit/rate-limit.test.ts
test/integration/send-attempt-indexes.test.ts
test/integration/budget-envelopes.test.ts
```

The unchanged older handoff failures are at `test/integration/llm-handoff.test.ts:110` (expected two allowed evidence IDs, received one), `:159` (expected fulfil success, refused), and `:203` (expected redaction, received uncited evidence). Their ATS fixture lacks required verified ownership. The allowset and independently owned file were not relaxed. Backend errors remain `src/outreach/draft/compose.ts:590` and `src/outreach/draft/queue-draft.ts:223` (two calls): an explicitly present `contactId: undefined` is incompatible with optional `string | null` under strict optional-property checks. No strictness was disabled or recipient code changed.

Earlier exploratory runs are not counted as final passes: the first corrections run had two failures, resolved through the real Prisma transaction marker fix and an explicit host-denial fixture. A malformed parameterized test was corrected before the final run. The final 161-test run preceded only the test-local `let` to `const` lint correction; production logic did not change afterward. Offloaded dependency files also caused stalled/timed-out initial migration/typecheck attempts. Pinned dependency/runtime files were rehydrated from integrity-verified cache (and exact-version package archives); manifests and lockfile were not edited. Only completed results above are reported as passes.

Full suite, preparation/cohort run and another worker's suite were not run.

## Synthetic subscription smoke and isolation limitation

One actual Codex subscription invocation ran through `executeSubscriptionTask` with the generated isolation controls, fresh owned temporary directory, filtered environment, 30-second limit, strict synthetic output schema, and a request to use no tools. No repository, mailbox, or external source material was supplied. Result: successful schema-valid synthetic output in **11,875 ms**, usage **11,697 input / 104 output / 35 reasoning tokens**, zero cached input. Codex account inspection indicated subscription usage permitted, no purchased credits/balance. No paid API fallback or settings change was used.

The synthetic answer reported `repository:false` but self-reported nine tools: `functions.wait`, `functions.request_user_input`, `functions.exec`, and six `collaboration` tools (`followup_task`, `interrupt_agent`, `list_agents`, `send_message`, `spawn_agent`, `wait_agent`). A subsequent installed-runtime `features list` check recognized all **23** generated feature disables as false. These facts **do not establish effective model-visible tool/MCP/skill isolation**. The model's self-report is not an authoritative catalog, and the executor did not retain an independently inspectable full event/catalog trace. No tool use was requested in the probe; this report does not infer absence of actual tool calls from final JSON alone. Automatic preparation must not be represented as isolated on this evidence. R-A should recheck this remaining operational boundary before acceptance of broader automation.

Claude inference was not attempted: the local cached quota snapshot showed seven-day utilization **100%**, five-hour utilization **0%**, extra usage disabled. That is cached evidence, not a fresh quota verification. No quota/credit reset or paid-extra-usage setting was changed. Consequently actual Claude runtime/catalog isolation remains unverified. CLI help/mocks are not substituted for that evidence.

## Migration and preservation evidence

New migration **`20261015010000_joboss_foundation_uniqueness`** is applied only to A's dedicated test database. SHA-256 / applied checksum: `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. It creates `one_global_research_budget_per_period` and `one_open_llm_task_per_identity`; it drops no prior constraints and changes no duplicate rows automatically.

Previously applied **`20261014170000_joboss_preparation`** is unchanged: SHA-256 / A's applied checksum `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`. All 13 applied A migration checksums match their current files. A retains `one_first_touch_per_contact_per_cycle` and `one_first_touch_per_company_slot_per_cycle` with their original definitions.

A pre-edit SHA-256 snapshot of **276 existing source/test/schema/tool/document/config files** was compared after implementation: no missing files; only the 12 listed existing owned files differ. Every previously present migration file is unchanged. Delivery/recipient partial work, B's helper/config, original reports/coordination, and unowned tests match the start snapshot. `.env` and `package.json` hashes match; `git diff` for `package.json`/`package-lock.json` is empty. The snapshot is `/tmp/joboss-a-corrections01-verified-hashes.json` (session-local evidence).

Final protected-state comparison connected to `outreach_dev` using **`BEGIN READ ONLY` / `ROLLBACK`** and compared IDs plus all baseline-protected draft fields and exact index definitions from `scratch/joboss-baseline-20261014/protected-state.json`: **57/57 drafts unchanged, 11/11 indexes unchanged, send attempts 0, JOBOSS migrations 0**. Sending remains `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`, source stage **F5**; these files were not changed.

No live writes/deployment, live mail/inbox operations, outreach, approvals, sending changes, paid services, commits, applied-migration rewrites, other-worker cleanup, or automatic duplicate reconciliation occurred. Test fixtures operated only on A's assigned database and newly owned temporary process artifacts. Files are yielded for the original R-A re-review; the unowned ATS/type errors and subscription-isolation evidence limits remain explicit.
