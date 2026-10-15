# B — Inbox and delivery corrections 02 report

15 October 2026 (Asia/Kolkata), updated after the requested continuation. RB-3a/RB-3b corrections implemented within the assigned boundary. **201/201 delivery tests passed across 10 files**, including all 154 previous tests and 47 new cases. Lint, network guard, schema validation, whitespace and UI typecheck passed. Backend typecheck completed with exactly the three pre-existing D-owned errors. Dependency hydration recovered; the earlier startup failures are retained below as historical evidence. Yielding for independent review; no overall delivery/JOBOSS/pilot acceptance claim.

## Fix → executed regression → actual result

| Finding | Bounded fix | Actual execution evidence |
|---|---|---|
| **RB-3a: mixed From mailbox list collapses to final angle address** | Validate the entire supported display-name prefix rather than extracting a convenient final address. Reject unquoted mailbox/list material, unsupported groups/comments/routes, malformed quotes and trailing material. Preserve ordinary bare/angle forms, quoted display-name commas, quoted-pair escapes, lowercase/outer whitespace normalization and distinct plus tags. Require a single supported sender and agreement with an independently supplied From header before either human or DSN outcome mutation for known conversations. | **Four** mixed/reverse/angle-list/unquoted-extra-mailbox forms, including the reviewer's exact string in both From representations, returned unresolved through the real matcher/ingester. For each: six concurrent ingestions plus repeat produced **one unresolved audit**, unchanged original contacts/drafts/leads/attempts, **zero Reply/Bounce/OptOut/suppression**, incomplete sync/replay, and **zero new sends**. A valid `"Last, First" <owner+b@owned.example>` positive control selected B and retained A active. Direct parser checks rejected the exact bad example and accepted quoted commas/escaped quotes. |
| **RB-3b: another DSN recipient's status is applied to B** | Keep every explicit recipient declaration, including unknown addresses and null markers for unreadable/unsupported declarations. Before whole-body classification, reject mixed recipients, repeated/unbindable recipient/outcome blocks and contradictory status/action/diagnostic evidence for known conversations. The existing classifier is unchanged. | **Five** mixed-recipient variants exercised detailed match, ingestion, sync/replay and pre-send: the exact unknown-failed/B-delivered case, reversed blocks, swapped failed/delivered recipients in both orders, and two-known-contact conflict. All returned unresolved with B still active/sent, one audit after concurrency/repeat, **zero irreversible outcomes/suppressions/new sends**, and replayable incomplete coverage. **Thirteen** additional repeated/unreadable/unsupported/unbound/conflicting DSN fixtures also returned unresolved with unchanged state and zero outcomes. Positive single-recipient **4.1.1/5.1.1** DSNs still ingested as soft/hard bounces. |

These are **25 directly executed fixture scenarios** in `direct.mjs` (4 sender conflicts + 5 mixed DSNs + 13 other ambiguous DSNs + 3 positive controls), using actual production functions and PostgreSQL. Separately, all **47/47 new Vitest cases passed** in the required standard harness, including parser controls, exact mixed sender/DSN fixtures, concurrency/repeat audit bounds, unchanged states, incomplete/replayable coverage, zero new sends, single-recipient hard/soft DSNs, strong-ID precedence and unknown-only unrelated DSNs. These direct and Vitest counts are separate evidence, not added together as one test count.

## Exact changed files and interfaces

Only these existing source files changed during corrections 02:

- `src/outreach/mail/headers.ts`: `senderAddress` and its directly necessary private `supportedDisplayName` helper. `normalizedHeaders` and the independently closed Auto-Submitted implementation were not changed.
- `src/outreach/send/ingest-outcomes.ts`: detailed matching imports/uses the DSN evidence guard, retains all explicit recipient evidence through consistency checking, and rejects unsupported/multiple sender claims before outcome writes. Existing outcome transactions, suppression and conversation mutations were not otherwise changed.

Added:

- `src/outreach/mail/dsn-evidence.ts`: narrow, dependency-free flattened-DSN consistency helper. `readDsnEvidence` returns `{ recipients: Array<string | null>; issue: string | null }`; null preserves unreadable explicit recipient evidence instead of silently filtering it away.
- `test/delivery/corrections-02.test.ts`: **47** parameterized/new cases, automatically included by the unchanged delivery configuration; **47/47 passed**. Backend checking produced no diagnostics in these new tests or the owned source files.
- This report.

`DetailedMatch` and `IngestResult` are unchanged: matched, ordinary unmatched, or explicit unresolved with bounded candidate IDs, null reason code and `suppressed:false`. The existing provider-message lock/audit path records unresolved mail once under repeats/concurrency. The existing sync code leaves the current page replayable and incomplete, and pre-send refuses. No sync/classifier/interface expansion or orchestrator request is needed for these two fixes.

## Supported syntax and conservative boundaries

Sender parsing supports one ordinary bare address or angle address, with an empty/simple display name or whitespace-separated display words/quoted strings. Quoted strings may contain commas and quoted-pair escapes. Additional unquoted `@`, commas/list delimiters, angle groups, group/route syntax, comments, unbalanced quotes, unsupported quoted local-parts/domain literals, controls or trailing material refuse the single-sender claim. Mailbox case/outer whitespace normalize using the existing rules; dots and plus tags are not folded. This deliberately remains a conservative parser, not a full RFC mailbox implementation or sender-authentication check. Unsupported sender representations tied to a known conversation are unresolved; unrelated messages without known identity evidence remain ordinary unmatched.

The DSN helper inspects explicit Original-Recipient/Final-Recipient, Status, Action and Diagnostic-Code declarations in flattened text. All recipient declarations survive interpretation, including unknown/unmapped values and unreadable/unsupported address types. Supported readable recipients use `rfc822;` followed by a single supported mailbox. Original/final declarations for the **same address in one block**, with one consistent outcome, remain usable. Strong original-ID precedence over an unrelated weak thread and recipient-only known matching are retained.

Conservative unresolved cases include:

- Different explicit recipients, including known plus unknown; unreadable recipient declarations or unsupported recipient types.
- Repeated recipient blocks, even if they repeat the same address/status; repeated outcome fields; status/action/diagnostic fields split into unbindable blocks.
- Outcome fields separated from the explicit recipient block, malformed recognizable outcome declarations, unreadable status/action values, or contradictory status/action/SMTP diagnostic classes.

A valid original B ID does not override these contradictions. Unknown-only unrelated DSNs remain distinct from conflicts involving known candidates because no relevant known candidate still yields ordinary unmatched. No block is selected to borrow its status, no mixed case falls through as a human reply/automatic success, and no classifier change or general MIME redesign was introduced. Exact-ID-only legacy DSNs with one unambiguous outcome remain supported; the existing inference behavior for unreadable bounce hardness is otherwise unchanged.

## Checks actually executed

All synthetic writes used **outreach_test_joboss_b** only. Process-only `TEST_DATABASE_URL` override selected that exact local name; shared `configuredTestTarget`/read-only `verifyTestTarget` and the B helper guarded every fixture reset. Outbound HTTP was refused by Undici MockAgent; providers were fake. The successful suite ran normal immutable migration deployment through the unchanged global setup; all 13 applied migrations were independently verified below. No guards/setup were disabled to bypass the earlier migration CLI stall.

Evidence is retained under `/tmp/joboss-b-corrections-02-evidence/`.

| Command/check | Actual result |
|---|---|
| `node --import tsx /tmp/joboss-b-corrections-02-evidence/run-suite.mjs` → local Vitest `run --config test/delivery/vitest.config.ts --reporter=verbose`, guarded process-only B URL, serial files | Exit **0**: **10 files passed, 201 tests passed**, duration **17.86 seconds**. Normal migration deployment and shared identity/live-exclusion/setup guards ran. Final log: `suite.log`. |
| Existing selection preserved | All previous **9 files / 154 tests** retained untouched during this assignment and **passed again**; new file adds **47 passing cases**. No failed or skipped tests in the final selection. |
| `node --import tsx …/direct.mjs` | Exit **0**; **25** current-code PostgreSQL/fake-provider attribution fixtures passed with the results above. Log: `direct.log`. |
| Guarded copies of inspected R-B `races.mjs` and `delivery.mjs` | Both exit **0**; **5 logged race groups** and **5 logged delivery/readiness groups** passed against current production code. Reviewer originals were not modified or run in place; only copied output paths point into B's new evidence directory. Logs: `races.log`, `delivery.log`. |
| Actual `classifyReply` over the existing RB-5 fixtures | **8 human, 5 automatic, 5 malformed forms passed**; `auto-submitted.json`. |
| `npm run check:no-raw-http` | Exit **0** on both executions; clean, no network access outside the approved raw-client boundary. `network.log`, `network-resume.log`. |
| `git diff --check`, plus trailing-whitespace checks on new files | Passed, exit **0**. |
| `npm run lint` | Exit **0**, no lint diagnostics. `lint-resume.log`. |
| `npx prisma validate` | Exit **0**, schema valid. `schema-resume.log`. |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit **2**, exactly **three pre-existing D-owned TS2379 diagnostics** at `compose.ts:590:115`, `queue-draft.ts:223:76`, `queue-draft.ts:223:267`; no additional diagnostics. `backend-resume.log`. |
| `npx tsc --noEmit --incremental false` | Exit **0**, no UI diagnostics. Executed separately from backend checking, with incremental writes disabled. `ui-resume.log` (empty on success). |

Earlier attempts were blocked by dependency files carrying `compressed,dataless` flags. The initial suite hit an outer 180-second startup timeout; two subsequent attempts exited **1** at the unchanged global-setup 120-second migration-child timeout, executing zero tests. Historical logs: `startup-timeout.log`, `suite-before-resume.log`, `suite-resume-timeout.log`. Initial lint/backend runs were stopped after approximately 11 minutes and schema/UI runs after approximately 7 minutes (exit **130**, no completed results); their original logs remain separate from the successful resumed checks.

Normal macOS `brctl download`/Foundation requests eventually hydrated the needed files, including Prisma/ESLint dependencies and existing `.next/types` declarations. The resumed checks above then completed. No install, package replacement, dependency-version/content change, build-setting relaxation or test-guard bypass was used. No B verification process remains running. The same three D-owned `contactId` TS2379 errors were independently reconfirmed by the completed backend check; those files are unchanged and were not edited.

## Preservation of independently closed behavior

The closed implementations were not edited; complete file hashes confirm no change outside the two permitted existing source files. Current-code direct preservation probes additionally passed:

- **RB-1:** independent revoke-first succeeded with zero calls/reservations; reservation-first observed a real PostgreSQL lock waiter and revocation refused send_attempted with one call. Change-and-restore recipient plan refused. Attempt-write rollback, nested-transaction refusal and revocation-audit rollback preserved approval/hash.
- **RB-2:** stripped-handle/lookup/concurrent misses remained pending/in_flight; original day/domain counts **1/1**, next-day count **0**; readable contact/company-slot refusals and both direct **P2002** constraints held. Later no-send resolution preserved an opted-out draft and exactly one total modeled delivery.
- **RB-4:** separately approved revision and touch 2 both refused soft_bounce; total calls **1**, suppressions **0**, contact active.
- **RB-5:** all **18** existing keyword/CFWS forms passed through the actual classifier; its implementation is unchanged.
- **Definite-failure stop preservation:** actual opt-out during provider refusal left the draft opted_out and suppression count **1**; ordinary definite refusal retained approval. Missing/rejected @5 readiness and the transaction witness (**inside 1/outside 0**, zero sends) still passed.

These targeted results and the successful full **201-case** selection preserve the closed findings without reopening those implementations for redesign. The known pg concurrent-query deprecation warning also appeared in synthetic concurrency runs and the suite; it did not fail assertions and was not hidden.

## Migration, live-state and current-work preservation

Read-only B verification, repeated after the successful suite, confirmed **13 completed migrations**, all disk/applied SHA-256 checksums match, no rolled-back record, and **11/11 protected index definitions match**. Contact/company-slot first-touch predicates remain on `touch_number=1` and `in_flight,sent`; no constraints were removed. Normal immutable migration deployment succeeded through the unchanged global setup, with no pending schema change introduced by this assignment. Evidence: `migrations.log`, `migrations-resume.log`, `migrations.json`.

Live comparison, repeated after the successful suite, used only explicit **BEGIN READ ONLY / ROLLBACK**, against the existing protected baseline: **57/57 drafts, all 14 captured fields, and 11/11 index definitions matched; send attempts 0; completed live JOBOSS migrations 0**. Protected file hashes for `.env`, stage, schema and all 13 migration SQL files match the verified checkpoint. Milestone remains **F5**, `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`. Evidence: `preservation.log`, `preservation-resume.log`.

An initial content snapshot captured 326 existing workspace files. Excluding the two authorized source edits, **324/324 existing files were unchanged** on recheck, including closed correction code/tests, shared setup/configuration, earlier reports and the user's current dirty documents. Git HEAD and the exact staged diff also matched the initial capture. No staging, commit, reset, history rewrite, unowned cleanup or schema/package/core/draft/approval/sender-enable changes occurred. No agents or other-chat messages were used.

## Remaining limits and yield

The two attribution corrections are implemented; **201/201 required delivery tests passed**, and lint/network/schema/whitespace/UI checking passed. Backend checking remains non-green solely on the three reconfirmed D-owned errors. The earlier dependency-hydration blocker recovered and no longer blocks these checks. No unresolved production interface request is necessary for this bounded implementation. Independent R-B review remains required before acceptance.

D's substantive readiness validator/integration and three known type errors remain outside this assignment. The accepted automatic-execution isolation block/manual handoff is unchanged. Provider behavior, real mailbox identity/authentication, full RFC/MIME coverage, runtime isolation, integrated preparation/cohort quality and pilot operation remain unverified. Ambiguous/unsupported sender or DSN evidence intentionally blocks coverage until review/retry; no automatic resolution, guessed recipient association or live data backfill was added.

No outreach, real inbox/send/OAuth/auth/model operation, paid service, live approval/write/migration, sending enablement, credentials change, staging or commit occurred. All new approvals/outcomes/suppressions were synthetic B fixtures. Yielding the assigned files for independent RB-3a/RB-3b review with the stated D/provider/runtime limits.
