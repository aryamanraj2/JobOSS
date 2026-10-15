# R-A — Foundation corrections 01 re-review report

Date: 15 October 2026. Independent continuation of R-A, following `docs/JOBOSS-REVIEW-A-CORRECTIONS-01.md`. Read the correction assignment/report, original review and A/B handoffs, relevant PLAN/coordination context, current shared implementation, tests, migration SQL, and actual callers. The original review report is preserved. No agents were spawned and no other chats were messaged.

## Scoped verdicts

- **Core foundation: changes required before acceptance.** Five original implementation findings are closed by current code and independent evidence. Finding 1 is reopened for a reproducible live-alias exclusion failure. The required eight-file run also fails because a child fixture hardcodes A's database. These are foundation test-safety/verification corrections; the reviewed budget, provenance, task, and additive provider interfaces otherwise have substantial passing evidence.
- **Automatic subscription runner/isolation: blocked.** Successful synthetic inference, recognized feature flags, and a runtime diagnostic that Code Mode fails closed do not establish complete writer/support tool, filesystem, network, MCP, skill, or delegation isolation. The code currently has no isolation-readiness guard preventing automatic execution of real untrusted packets. This block is separate from the core corrections above.

This is not overall JOBOSS, preparation/cohort, review UI, pilot, or send-readiness acceptance. Current core fixes should be preserved. A should receive the bounded corrections below; the unverified automatic runner must not be wired to real research/draft material. Manual task interfaces remain available, subject to downstream validation and the required core acceptance.

## Original findings: closed or reopened

| Original finding | Status | Independent evidence |
|---|---|---|
| 1. Dedicated test database / pre-migration guard | **Reopened, P1** | Normal reviewer URL is now accepted, `current_database()` is checked before deployment/truncation, and normal deployment to the reviewer database succeeded. Invalid/remote/query/encoded-name/basic-loopback-alias negative tests pass. B's config/helper and the shared validator accept B's target without accessing its database. However, a configured live `localhost.` URL and selected `localhost` URL for the same database pass exclusion. Read-only connections proved both resolve to the same database/server. Even `deployTestMigrations` reaches an injected no-write deployment callback after its actual identity probe in this case. See finding C1. |
| 2. Zero-credit research bypass | **Closed** | Actual mocked-transport tests reject HN, StartupDB, and company research at zero/vendor-only credits with missing and exhausted envelopes. Exact list/full-read/attachment/send and both existing OAuth grant shapes pass without research envelopes. Unknown endpoints/queries/methods/encodings and host/terms denial are covered. Supplemental real-gate checks refused four invalid costs before transport and verified that a second exempt mail read on the same gate returns `rate_limited`; exactly one intercepted message request occurred. No real mail or OAuth request was made. |
| 3. Envelope uniqueness / validated accounting | **Closed** | Both migrations deployed normally on the dedicated reviewer database. Partial global-period uniqueness is present. Tests verify concurrent creation, ambiguity refusal, duplicate migration refusal with both rows preserved/no index created, exact charged rows, direct accounting ceilings/invalid spends, and rollback. Independent-connection tests pass. Supplemental four-process tests separately competed for the last global, company, and vendor credit: four distinct PostgreSQL backend PIDs, one winner per dimension, three correct refusals, and exact global/company counters. Transaction-client network use is refused before source/robots access; a supplemental company-website probe had zero host-policy reads. |
| 4. Authorship without captured identity evidence | **Closed** | Actual PostgreSQL fulfilment tests reject empty, unknown-only, and mixed allowed/unknown identity evidence even when model identity is `unverified` and its hook claims verified authorship. Tasks remain pending. Source now applies the complete captured-identity predicate to authorship independently of the model identity label; existing allowset/scope checks remain. |
| 5. Descendant survives timeout | **Closed on this macOS environment** | Timeout and overflow regressions pass with a SIGTERM-exiting parent and stream-disconnected SIGTERM-ignoring descendant; both stop before packet removal. Launch-failure cleanup passes. A supplemental normal-success-parent-exit fixture also terminated its ignoring descendant before removing artifacts. A bounded simulated EPERM on the reviewer's own process-group signal returned explicit failure and retained artifacts while that fixture process was alive. The reviewer restored signaling, stopped only that owned group, confirmed disappearance, and then removed only its owned fixtures. Other operating systems remain unverified. |
| 6. Concurrent enqueue duplicates tasks | **Closed for implementation behavior; new test portability defect tracked** | The unmodified repository four-process test fails before READY because it requires A's database. Without editing it, an independent four-process fixture on the approved reviewer target produced one task identity, one `created:true`, and one queue audit. Real tests also cover conflict inside caller transactions, task/audit rollback, terminal history/new versions, simultaneous claim/fulfil/reject, stale success/invalid/reject writes, and stale runner success/quota metadata. A supplemental real-PostgreSQL interleaving completed the conflict winner between INSERT and reread; enqueue retried and created a distinct new pending task while preserving the fulfilled predecessor. |

The budget and enqueue database invariants were verified against actual PostgreSQL, not accepted solely from in-memory fixtures. Claim/reclaim fencing cases in the focused run passed; the single focused failure is the A-only enqueue child startup.

## Actionable corrections and blockers

### C1 — P1: configured live aliases can bypass test exclusion

Location: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/helpers/test-target.ts:13`–15, used by line 29 and `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/global-setup.ts:18`–20.

`databaseIdentity` recognizes `localhost`, `127.0.0.1`, and `::1` as loopback but preserves `localhost.` as a different hostname. The exact permitted target host remains `localhost`; the bypass is in normalization of the separately configured live endpoint.

Safe reproduction used only the reviewer's own database:

```text
simulated configured live: localhost.:5432/outreach_test_joboss_ra
selected test:             localhost:5432/outreach_test_joboss_ra
guard result:              accepted
selected identity:         loopback:5432/outreach_test_joboss_ra
captured live identity:    localhost.:5432/outreach_test_joboss_ra
```

Read-only connections to both forms returned `current_database() = outreach_test_joboss_ra`, address `::1/128`, port 5432, and the same postmaster start timestamp. Calling `deployTestMigrations` with this simulated source and a no-write injected deploy function reached that function once after the actual read-only identity verification. No migration or truncation was attempted using the alias reproduction.

Consequence: if a configured live database uses an approved test name through such an alias, global setup can deploy to it and later test setup can truncate it. The current real live database is still `outreach_dev`; this reproduction did not access it as a writable target and does not establish that its present name passes the allowlist.

**Request to A:** normalize equivalent configured live host forms, including terminal-dot loopback names, before comparison. Fail closed when endpoint/database separation cannot be established; use read-only connected identity comparison for ambiguous aliases or a conservatively stricter exclusion. Add this negative pre-migration regression and retain local-host/name restrictions. Do not solve it by weakening the approved-target checks.

### C2 — P2: enqueue acceptance test cannot run on the assigned reviewer database

Location: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/helpers/joboss-enqueue-child.ts:7`.

After validating the target through the shared guard, the fixture additionally requires `outreach_test_joboss_a`. The mandated reviewer run therefore fails with `Enqueue fixture exited before ready: 1` at `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/integration/joboss-corrections.test.ts:205`. All four children are pointed at the approved reviewer database but exit before performing the race. This explains why A's 161-pass result does not reproduce unchanged on R-A.

**Request to A:** let the child use the validated explicitly selected worker/reviewer target, with consistent parent/child actual-identity verification. Retain fail-closed safety and never redirect the reviewer to A/common databases. Re-run the exact eight-file selection on the assigned target; do not count the independent reviewer probe as an unchanged-suite pass.

### C3 — P1 automatic-runner boundary: isolation is unproven and not an execution precondition

Locations: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/core/llm/subscription-runner.ts:135`–142 and line 210 / 229.

The executor checks subscription authentication and timeout, then launches the generated command. `runPendingTasks` defaults to Codex; only an explicit manual provider avoids execution. There is no provider/runtime isolation-readiness check. A syntactically accepted untrusted packet can therefore reach the automatic default once an integration caller uses this exported interface. Repository search found no existing production preparation caller, so this is an unguarded integration boundary, not a claim that real research tasks have already been automatically executed.

**Request to A/orchestrator:** make automatic handling of real untrusted inputs unavailable or explicitly fail closed until the provider/runtime's required isolation is established. Preserve a clearly bounded synthetic diagnostic path. Do not treat prompt instructions, subscription authentication, successful JSON, or the absence of tool calls in one smoke as authorization for general execution. Retain sanitized event/config/catalog evidence needed to evaluate the boundary. Keep the `research_urls` read-only search exception distinct from writer/support sessions, without granting execution, filesystem, arbitrary fetch/browser, mailbox, or delegation capabilities.

## Actual checks and results

The reviewer created only local `outreach_test_joboss_ra`, after explicit URL/live separation checks; a read-only actual-identity probe preceded normal migration setup. Every database-backed run used a process-only `TEST_DATABASE_URL` override selecting that database. Common and A/B databases were not migrated, truncated, or used for fixtures. Standard HTTP mocking and guarded migration setup remained enabled.

The exact focused command was `npx vitest run` with these eight arguments:

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

| Executed check | Independent result |
|---|---|
| Eight-file focused selection, normal guarded migration setup | **7 files passed, 1 failed; 160 tests passed, 1 failed, 161 total; 12.07 seconds; exit 1.** Failed test: simultaneous independent-process enqueue, before READY. Corrections file alone: 37 passed / 1 failed out of 38. |
| `npx vitest run test/integration/budget-envelopes.test.ts test/integration/llm-handoff.test.ts` on reviewer target | **1 file passed, 1 failed; 25 passed, 3 failed, 28 total; 4.97 seconds; exit 1.** Budget: 13/13 pass. Handoff: 12/15 pass; the three tracked ATS-fixture failures reproduce. Counts overlap the focused run and are not additive. |
| Supplemental independent four-process enqueue | Passed: one created winner, one returned identity, one task, one queue audit. |
| Supplemental four-process budgets, separately global/company/vendor | All three passed: four distinct backend PIDs per scenario, one winner, exact counters; losing scopes respectively global/company/global_vendor. |
| Supplemental terminal-winner interleaving | Passed: conflict winner fulfilled between INSERT and reread; a new pending task was created and terminal history preserved. |
| Supplemental transaction-client website probe | Ordinary-client discriminator true, actual transaction-client false; refusal before host-policy/robots/source access, with zero policy reads. |
| Supplemental zero-cost-mail rate check and invalid gate costs | First intercepted read allowed, second rate-limited, one intercepted request; NaN/Infinity/negative/fractional costs all refused before transport. |
| Supplemental normal-exit and unconfirmed-cleanup fixtures | Both expected outcomes observed; only owned fixture processes/artifacts cleaned after confirmation. |
| Configured live terminal-dot alias and pre-deploy reproduction | **Safety check failed**: alias accepted and injected no-write deployment callback reached. Actual endpoint identity comparison used read-only transactions. |
| B config/helper/shared guard import and validation | Passed without B database access; B's alias, setup, target and helper are compatible in the ordinary configuration. Not a B-suite acceptance. |
| `npm run check:no-raw-http` | Passed, exit 0. |
| `npm run lint` | Passed, exit 0. |
| `npx tsc --noEmit -p tsconfig.backend.json` | Exit 2: exactly the three unchanged recipient TS2379 errors; no foundation diagnostics. |
| `npx tsc --noEmit --incremental false` | UI check passed independently, exit 0; incremental writes disabled for review. |
| `npx prisma validate` | Passed, exit 0. Generation intentionally skipped to preserve project/generated files. |
| `git diff --check` | Passed, exit 0. |
| Installed CLI versions and local subscription auth | Codex 0.147.0; Claude 2.1.296; both local auth checks passed. No credentials printed. |
| Generated Codex feature controls via installed `features list` | All 23 recognized and reported false. The generated-help tests also passed as part of the unit file; neither proves complete capability isolation. |
| Read-only reviewer migration/index/checksum inspection | 13 completed migrations; all 13 match disk. Both new partial indexes and both protected send dedup indexes present. |
| Read-only protected live-state comparison | 57/57 baseline drafts, 11/11 exact protected index definitions, 57 total drafts, 0 send attempts, 0 completed live JOBOSS migrations. |

Real gate constructor searches covered all nine current production tool callers. They construct the gate with `prisma()` or the ordinary client returned from it; no transaction-client caller fix outside foundation ownership was identified. The discriminator's two Prisma transaction symbols exist in installed Prisma 7.10 runtime source, and actual transaction/rollback regressions pass. Retain these tests when upgrading Prisma because this scope detection uses private runtime markers.

## Installed runtime and synthetic evidence

Used the `reverse-engineer-anything` skill for shipped-runtime inspection, not repository source analysis. REA opened the installed arm64 Mach-O Codex target at `/Users/aryamanjaiswal/.codex/packages/standalone/releases/0.147.0-aarch64-apple-darwin/bin/codex`, SHA-256 `19c4f144c5226a9f17c58e6f0fa854843b0f77a6eb420f40e2745a12f10f5d37`. Deep native analysis was unavailable: Ghidra/IDA were not configured and Hopper was absent. No engine installation/configuration change was attempted. The REA target was closed. This establishes artifact identity and an analysis limitation, not recovered implementation behavior.

A fresh Codex account check reported ordinary subscription usage allowed, 17% used in the five-hour window and 18% in the weekly window, with no purchased credit balance. No credit reset, purchase, or configuration change was used.

Two minimal synthetic writer/support turns used the actual generated Codex command, authentication check, filtered environment, isolated temporary directory, output schema, 30-second timeout, and process-group cleanup. A local observation wrapper forwarded CLI input/output and retained sanitized JSONL evidence only; it did not change model flags or request tools. The sole synthetic task was 1+1 with schema `{ok:boolean,sum:integer}` and an explicit no-tools instruction. No repository/mailbox/source material, secret-reading probe, side-effect probe, or paid fallback was supplied.

- First turn: **4,812 ms**, returned `{ok:true,sum:2}`; **11,659 input / 19 output tokens**, zero cached/reasoning output. Five event summaries were retained; an error item triggered a bounded diagnostic follow-up.
- Follow-up: **4,910 ms**, same schema-valid result; **11,656 input / 19 output tokens**, zero cached/reasoning output. Sanitized event payloads established this sequence:

```text
thread.started
item.completed: error
  "Code Mode is unavailable because code-mode host is disabled.
   Code mode will fail closed; enable `features.code_mode_host`
   and install `codex-code-mode-host`."
turn.started
item.completed: agent_message {"ok":true,"sum":2}
turn.completed
```

The diagnostic was treated as evidence, not as an instruction to enable anything. It supports that the installed runtime reports Code Mode unavailable/fail-closed under this configuration. It does not establish that every exposed execution/filesystem/network/delegation route is absent or rejected. No tool-call item appeared in these bounded CLI traces; that is not a capability-enforcement test. Neither trace included an authoritative model-visible tool/MCP/skill catalog or outbound tool-definition payload. A's earlier model self-report is likewise not an authoritative catalog.

The production executor currently discards most successful-run events and keeps usage/final JSON. The observer's sanitized findings are retained here; only its newly created temporary files were removed. Filtering environment variables does not prevent filesystem access to credentials if a readable-file capability exists. A read-only sandbox is not proof of a no-read boundary. Search-only `research_urls` execution was not independently exercised against actual search, to avoid source access in this review.

Claude local authentication passed, but a fresh subscription allowance was not established and Claude inference/catalog isolation was not tested. No fresh Claude quota rejection was observed; A's cached 100%-weekly snapshot is not used as current quota evidence. This is a verification limit, not a claimed current quota block.

Evidence still needed before automatic acceptance: authoritative per-provider effective tool/config/catalog evidence tied to the installed runtime, plus enforcement that writer/support cannot execute, read unrelated files/credentials, use network/mailbox/source tools, or delegate. The search exception must expose only its permitted candidate-URL search behavior. Until that is established, C3's explicit unavailable/manual boundary is needed before real integration.

## Migration, preservation, and downstream requests

Reviewer database normal deployment and read-only inspection confirm:

```text
20261014170000_joboss_preparation
  4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
  31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

Both match disk and applied checksums. `one_global_research_budget_per_period` and `one_open_llm_task_per_identity` have the expected partial predicates. Existing contact/company-slot send dedup indexes are retained. Duplicate migration fixtures operated in new schemas within the reviewer database; refusal preserved every duplicate row rather than reconciling automatically. No applied migration was rewritten.

The protected live-state comparison used `BEGIN READ ONLY` / `ROLLBACK` and the original baseline manifest: all 57 protected drafts match by ID and all protected content/composition/status/approval/citation fields; all eleven index definitions match exactly. Sending/external-recipient flags remain false; source milestone remains F5. Neither JOBOSS migration is deployed live. These preservation checks establish current protected state, not authorization for live deployment.

The three backend errors remain recipient-owned: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/compose.ts:590` and `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/queue-draft.ts:223` (two calls), passing an explicitly undefined `contactId` to an optional `string | null` property. Keep strict optional-property checking and fix those calls under recipient ownership.

The three reproduced handoff failures remain at `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/integration/llm-handoff.test.ts:110`, line 159, and line 203: missing ownership-supported ATS evidence, refused fulfilment citing it, and `uncited_evidence` preceding the expected redaction error. The feature/regression owner must supply legitimate verified-ownership fixtures and rerun without broadening allowsets. The old paid-spend expectation has been correctly changed to the zero-additional-spend contract; all 13 budget regressions pass. Do not restore billed spending.

B's requested `ProviderMessageRef.rfc822MessageId?: string | null` is present, documented as the actual provider RFC header, and compatible with omission/null/B's local extension. The optional `inbox_ingestion_incomplete` reason-code rollout remains deferred. B's entire delivery implementation/suite was not re-reviewed or operated.

Remaining broader dependencies include recipient company/person binding and capture semantics, current evidence/draft content hashes, semantic support/readiness, safe revisions/approval behavior, discovery ATS/funding integration, preparation/UI/cohort validation, and delivery acceptance. None is substituted by this foundation review.

No full suite or preparation/cohort run was executed. No implementation/test/schema/configuration edits, live writes/migrations/mail, approvals, sending enablement, paid services, commits, agents, or cleanup of existing files occurred. Only this new review report was saved. Database writes and normal deployments were confined to the newly created reviewer target; synthetic process fixtures cleaned only their owned processes/artifacts. The original review remains unchanged.
