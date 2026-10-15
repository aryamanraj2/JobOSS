# Worker 01 — foundation handoff report

Date: 14 October 2026. Assignment: `docs/JOBOSS-WORKER-01-FOUNDATION.md`.

The bounded foundation implementation is ready for an independent read-only review. This is not acceptance of JOBOSS, an integrated preparation command, a review cohort, or delivery readiness. Repository typecheck and older regression tests still have the failures documented below.

## Scope and preservation

Read the assignment, `/Users/aryamanjaiswal/Downloads/PLAN.md`, coordination record, current diff, and partial foundation implementation before editing. No applicable AGENTS.md was found in repository or ancestor locations. No subagents were spawned or messaged.

This worker edited only these owned files:

- `src/core/joboss/contracts.ts`: explicit shared persistence exports and supported-fit type.
- `src/core/joboss/project-links.ts` (new): reexports the existing operator-approved project-link allowlist without duplicating it.
- `src/core/policy/budget.ts`: atomic reservation and invalid/billed-spend denial.
- `src/core/policy/fetch-policy-gate.ts`: reserves before every GET/JSON POST/form POST; rechecks rate before opening a socket.
- `src/core/llm/handoff-gateway.ts`: durable tokens for every claimant; fenced fulfilment, validation accounting and rejection; stale recovery; support/person validation; approved project links on support tasks.
- `src/core/llm/tasks.ts`: retained partial new schemas and all historical versions; excludes credential-bearing candidate URLs.
- `src/core/llm/subscription-runner.ts`: subscription-only authentication, isolated CLI arguments, bounded packets/processes, provider defaults, safe usage, resumption and durable attempt history.
- `src/core/llm/foundation-validation.ts` (new): independent identity/authorship metadata and exact sentence/citation support checks.
- `src/core/llm/packet-safety.ts` (new): credential checks with narrowly typed exceptions for legitimate authorship provenance.
- `tools/llm.ts`: manual fulfil/reject accept the claim token printed by `llm:next`; usage text explains it.
- `test/helpers/db.ts`: safe test URL guard, independently reads the configured live URL, checks actual database identity before truncation; preserves the partial JOBOSS table cleanup list.
- `test/integration/joboss-foundation.test.ts` (new).
- `test/unit/joboss-runner.test.ts` (new).
- `docs/JOBOSS-FOUNDATION-REPORT.md` (new).

The inherited schema, applied migration, evidence writer, provider interface, API-contract registry and host lists were reviewed and preserved without further edits. Existing discovery, scoring, contacts, drafts, application/UI and other tools were not edited. Package files, sending configuration, stage and environment files were not edited. There were no resets, commits, cleanup of existing files, approvals or outreach actions.

A start-of-assignment file hash manifest detected concurrent edits to delivery-owned files (`src/outreach/mail/**`, `src/outreach/send/**`, `tools/run-send.ts`, `tools/run-inbox.ts`) and new delivery files/docs appeared during execution. These were made outside this worker's actions and were left intact. The overall working-tree diff therefore includes inherited partial work and concurrent work; it is not this worker's change list.

## Finalized contracts and behavior

### Shared persistence and provider types

`src/core/joboss/contracts.ts` exports `PreparationProvider` (`codex | claude | manual`), `PreparationStage`, `PreparationCheckpoint`, `PreparationBlocker`, `RankedOutreachCompany`, `OutreachFit` (including required `supported`), `FundingDatePrecision`, `FundingVerificationStatus`, and the exact Prisma row types `FundingRecord`, `DiscoveryRun`, `OutreachAssessment`, `ContactResearch`, `PreparationRun`, `Evidence`, `Draft`, `LlmTask`.

The inherited `AtsProvider.listSnapshot?` remains `Promise<{ postings: Posting[]; complete: boolean }>` alongside `listPostings`. This foundation does not decide ATS ownership or close jobs.

`BudgetSpend`, `BudgetVerdict`, `checkBudget`, `reserveBudget`, and `recordSpend` remain exported. `checkBudget` is advisory. Every actual gated network request uses `reserveBudget`, which locks the current global/company envelope rows in a fixed order, checks headroom and commits both increments before transport. Reservations serialize across processes and gate instances. Missing nonzero-spend envelopes fail closed. Direct billed spending is denied even if a stored cap allows it. Zero-spend operations stay compatible. Reservations are retained after uncertain transport failure or a rate refusal after reservation; an attempted request cannot silently reuse its last credit. `recordSpend` is retained for compatibility/accounting; adapters must not combine an advisory check with a later ledger write as their authorization path.

The preserved registry matches only reviewed HTTPS API method/path/query combinations. Unknown website paths, extra query keys and POSTs continue through robots. Host denial, terms, rate and budgets remain mandatory. StartupDB's paths/queries were checked against its [published API contract](https://startupdb.com/api).

### Task ownership and response validation

`EnqueueSpec`, `FulfilResult`/`FulfilFailure`, `ClaimOptions`, `ClaimedTask`, `claimNextTask`, `fulfilTask`, and `rejectTask` are the handoff interfaces. Every `ClaimedTask` has a non-null durable `claimToken` and `leaseExpiresAt`. The historical `leased` option remains accepted but no longer disables tokens. Expired/legacy claims can be reclaimed; a former claimant cannot overwrite output, attempt accounting, rejection or latest runner metadata. Manual fulfilment of an unclaimed task still works. After `llm:next`, manual fulfil/reject must supply `--claim-token`.

All existing task versions are retained. New contracts remain `outreach_draft@5` (optional `{ text, evidenceIds, contactId }` personHook), `draft_support@1`, `research_urls@1`, and `contact_research@1`. URL candidates are not accepted facts; URLs containing login credentials are rejected.

`ContactVerification` carries independently captured `identityVerified`, `identityEvidenceIds`, `verifiedAuthorshipEvidenceIds`; provide it as `input.verification` when fulfilling contact-research tasks that claim verification. A model's verified flag alone fails validation. This metadata is a capture-code contract, not permission to bypass the recipient owner's company/person, identity or authorship checks.

`SupportSentence`, `validateDraftSupport` and `validateContactResearch` enforce exact generated-sentence coverage/citations and consistent support verdicts. Source-verification failures return `source_mismatch`. Support tasks include the existing approved project links. Recipient-owned code remains responsible for binding actual evidence and checking current draft content hashes before readiness.

### Subscription execution

`TaskExecutor`, `ExecutionRequest`, `ExecutionResult`, `TaskRunResult`, `RunnerState`, `RunPendingTaskOptions`, `TaskBatchResult`, `runPendingTasks`, `executeSubscriptionTask`, and `createSubscriptionExecutor` are exported. Helpers include `taskPacket`, `subscriptionEnvironment`, `subscriptionCommand`, `disabledSubscriptionSkills`, `assertSubscriptionAuth`, `boundedTimeout`, `safeRunnerUsage`, `assertCredentialFreeTaskData`.

`runPendingTasks` defaults to Codex, accepts Claude/manual, limits a batch to at most 200 specified tasks and a timeout to 1–600,000 ms, drains its fixed batch bound and skips already-fulfilled tasks on resume. It records provider, state, elapsed time, zero additional billed cost, sanitized usage and diagnostic outcomes in latest `runnerMetadata`; append-only `llm.runner_attempt` audit events retain outcomes after a successful resume. Quota/timeout stops the batch and leaves work resumable. Invalid JSON/schema/source support and launch failures leave tasks pending when ownership is still valid. `lease_lost` reports supersession without overwriting the new owner.

Packets contain bounded task data/citation IDs, treat excerpts as untrusted data, reject credential-shaped/forbidden context and injected excerpts, and allow at most 80KB input/90KB total packet. Auth stays in local CLI subscription storage. Child environment excludes database/mailbox credentials, API keys, custom CLI configuration paths, proxies and Node injection options. Fresh temporary directories contain only bounded task artifacts and are removed after completion; no repository is used as cwd.

Verified local versions: Codex CLI **0.147.0**, Claude Code **2.1.296**. Actual generated argument lists parse under each installed CLI's `--help` without model requests. Codex ignores user config/rules, disables tool/MCP-bearing features, hooks, plugins, personal skill catalogs, memories and repository docs, uses a read-only sandbox and forces ChatGPT authentication. Claude uses safe/restricted modes, an empty strict MCP configuration, disabled personal settings/hooks/skills and an explicit tool allowlist. Writing/checking disables search; URL discovery alone enables Codex live search or Claude WebSearch. Local authentication checks confirmed ChatGPT and Claude subscription authentication. No paid API was activated or probed.

The Codex controls were also cross-checked with [official CLI guidance](https://learn.chatgpt.com/docs/cli/reference) and [configuration documentation](https://learn.chatgpt.com/docs/config-file/config-reference). No real model inference was performed: CLI parsing/auth checks were local; process/output/timeout tests used offline Node child processes. Actual model availability, quota and end-to-end model-visible catalogs still need operational validation before an integrated preparation rollout.

## Checks actually executed

Checks were run serially in this chat. Before destructive test setup, verified URL identities: test `/outreach_test`, live `/outreach_dev`, distinct. The test helper now additionally checks `current_database()` before each truncation. Vitest's existing harness disables real HTTP connections and deploys migrations only with the test URL.

| Check | Result |
|---|---|
| `npm run db:generate` | Passed; Prisma Client 7.10.0 generated from preserved schema. |
| `npx vitest run test/integration/joboss-foundation.test.ts test/unit/joboss-runner.test.ts test/unit/rate-limit.test.ts test/integration/send-attempt-indexes.test.ts` | Final run: **4 files passed, 83 tests passed**, 4.88 seconds. |
| `npm run check:no-raw-http` | Passed: `check-no-raw-http: clean — no network access outside src/core/policy/http/raw-client.ts`. |
| `npm run typecheck` | Final run failed, exit 2: three existing recipient-owned TS2379 errors; no foundation errors reported. Backend command failure prevents the script's chained UI check from running. |
| `npm run lint` | Passed, exit 0. |
| Older regression run: `npx vitest run test/integration/budget-envelopes.test.ts test/integration/llm-handoff.test.ts test/unit/rate-limit.test.ts test/integration/send-attempt-indexes.test.ts` | **37 passed, 4 failed**, 4 files, 3.36 seconds. Failures below. |
| Read-only live protected-state comparison | All 57 protected draft rows matched by ID; all 11 protected index definitions matched; no applied live JOBOSS migration; zero send attempts. |
| Read-only test migration check | `outreach_test` has `20261014170000_joboss_preparation` applied. |

The first new focused run had 63 passes/one test failure because a persistent HTTP test interceptor also matched the simulated transport-failure URL. Its match was narrowed, then the focused checks passed. Further runs followed substantive fixes and new regressions; only the final completed results above are acceptance evidence. No full suite or integrated preparation command was run.

### Actual failure evidence and ownership requests

Final typecheck output:

```text
src/outreach/draft/compose.ts(590,115): error TS2379
src/outreach/draft/queue-draft.ts(223,76): error TS2379
src/outreach/draft/queue-draft.ts(223,267): error TS2379
Types of property 'contactId' are incompatible.
Type 'string | undefined' is not assignable to type 'string | null'.
```

Request to the recipient owner: omit the optional property when undefined or provide null at these calls; preserve strict optional-property checks. Do not weaken the foundation to accommodate it. Two temporary Gmail TS2375 errors also appeared in an intermediate run during concurrent delivery edits; they were absent from the final run, without edits by this worker.

Older regression failures:

- `test/integration/budget-envelopes.test.ts:169`: `expected false to be true` when requesting `billedUsd: 0.25`. This older test expects currency spending to be permitted below its cap; JOBOSS explicitly forbids direct billed spending. Request a separately authorized test update to reflect the ₹0 contract. This worker's ownership permits new focused tests, not edits to existing test files.
- `test/integration/llm-handoff.test.ts:110`: `allowedEvidenceIds` expected two IDs, received one. The fixture's ATS evidence is excluded under the partial ownership/citation-scope behavior.
- Same file, line 159: expected successful fulfilment, received `{ ok: false }`; its response cites the excluded evidence.
- Same file, line 203: expected `problem: 'redaction'`, received `problem: 'uncited_evidence'`; citation validation refuses first.

Request to discovery/recipient owners and the regression-test owner: align ATS fixtures with verified ownership/current evidence contracts, retaining exclusion of unsafe evidence. Re-run affected integrated checks after that work. Do not relax allowsets to make these failures disappear.

Remaining later assignments: discovery/funding regressions and ownership/freshness integration; recipient identity/authorship, content-hash support freshness, revisions and readiness integration; preparation orchestration/UI/cohort reporting; delivery verification. These were deliberately not implemented here.

## Migration and protected-state status

No schema correction or new migration was required by this worker. `20261014170000_joboss_preparation/migration.sql` and `prisma/schema.prisma` retain their starting contents. Test verification used the previously applied migration; it was not rewritten. Live remains unmigrated for JOBOSS.

Read-only comparison against `scratch/joboss-baseline-20261014/protected-state.json` confirmed the stored text, composition, statuses, approval fields and citations of all **57** protected drafts, including legacy composing drafts, and all **11** protected send/suppression index definitions match. Live send attempts remain **0**. Sending remains disabled, external-recipient sending remains disabled, stage remains F5, and configuration files were not changed by this worker. No live data writes, live deployment, email, outreach, approvals, paid-service activation, commits or resets were performed.

Foundation ownership is yielded for independent read-only review. The failures and later assignments above prevent claiming overall JOBOSS/preparation completion.
