# R-A — Foundation corrections 02 re-review report

Date: 15 October 2026. Targeted independent review under `docs/JOBOSS-REVIEW-A-CORRECTIONS-02.md`. Read A's corrections-02 assignment/report, the previous R-A re-review, relevant current implementation and tests, and normal setup/fixture consumers. Earlier reports were context, not substituted for executed evidence. No agents or other-chat messages were used.

## Scoped verdicts

**Shared foundation: accepted for dependent discovery, recipient, and manual-preparation implementation.** C1, C2 and C3 are closed within the agreed acceptance boundary. No concrete regression warrants reopening the five previously closed implementation findings. No new actionable foundation defect was demonstrated in this targeted pass.

**Automatic execution: blocked and correctly unavailable.** Provider/runtime isolation is still unverified. Production direct and batch entry points now return an honest resumable `isolation_blocked` result before execution or task mutation. This closes the missing-guard finding; it does not verify runtime isolation or complete the eventual automatic preparation requirement.

Dependent workers may consume the accepted persistence, budget, evidence, handoff/lease, provider-reference and manual interfaces. They must preserve the automatic block, handle its structured checkpoint result, and offer manual handoff. This acceptance does not authorize live migration, sending, draft approval, automatic research/drafting, or overall JOBOSS/cohort/pilot readiness. The tracked recipient errors and ATS-fixture failures remain with their existing owners.

## C1 — Database alias safety: closed

Reviewed `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/helpers/test-target.ts:12`, line 35 and line 54, with `test/global-setup.ts`, `test/setup.ts`, `test/helpers/db.ts`, and the portable enqueue child.

The validator now rejects a selected test database whose name matches any captured configured live database name, regardless of host spelling or port. Endpoint normalization also handles terminal-dot/case/loopback forms. Saved identities are parsed as a nonempty validated array; malformed/indeterminate URLs or identities fail closed. The exact approved local target list remains enforced. Independently captured live identity survives the normal DATABASE_URL substitution; actual connected database verification remains before deployment and destructive fixtures.

Independent no-write probes covered 17 negative cases: the former `localhost.`/`localhost` same-name reproduction; uppercase/default-port/IPv4/IPv6/different-port and ambiguous-host forms; malformed/empty saved capture; malformed live URLs; and empty identity capture through the pure validator. **All 17 rejected. Migration callbacks: 0; identity-probe callbacks: 0.** All six approved names were accepted by pure validation with a distinct live name; no fixtures or deployment used those other names.

The prescribed target tests additionally passed connection/client-creation spies for rejection before truncation, default-port/case variants, malformed saved/live values, target portability, environment substitution, and actual-identity failure before deployment. The normal guarded setup successfully verified and migrated only the explicit reviewer target. No writable live-alias reproduction or safety bypass was used.

## C2 — Portable independent-process fixture: closed

Reviewed `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/helpers/joboss-enqueue-child.ts:6` and the parent race in `test/integration/joboss-corrections.test.ts`.

The child no longer hardcodes A's name. It inherits the parent's explicit selected URL, validates it, performs the read-only target probe, then verifies `current_database()` through its actual Prisma connection before printing READY. It contains no redirect to A/B/common targets.

The formerly failing, unchanged-path four-process test passed on **outreach_test_joboss_ra** as part of the eight-file run: one returned task identity, one `created:true` winner, one task row, and one queued audit. The entire prescribed selection passed: **8 files, 193 tests, 0 failures**.

Real independent-connection budget competitions, duplicate migration refusal with row preservation, transaction rollback/network refusal, enqueue conflict/rollback/history, simultaneous claimant/fulfil/reject, and stale-owner success/invalid/reject/metadata fencing remain in the passing selection. The relocated offline runner tests still call production claim/fulfil/reject and the owned process-group helper. They test synthetic lifecycle/accounting behavior, not actual provider execution.

## C3 — Unavailable automatic boundary: closed; execution readiness remains blocked

Reviewed `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/core/llm/subscription-runner.ts:123`, line 147, and `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/core/llm/isolation-readiness.ts:15`.

Direct execution always constructs an `isolation_unverified` blocker and returns `isolation_blocked`; the compatibility injection dependencies are not consulted. Batch execution defaults to Codex, selects only task ID/kind/status, skips fulfilled rows, and returns unavailable/manual status without claims, auth, packet construction, provider launch, rejection, audit writes, or task updates. No boolean, environment/caller/packet flag, diagnostic label, renamed kind, or supplied executor grants readiness. Search is classified separately but remains blocked too.

Independent direct probes exercised **32 blocked calls** across Codex/Claude, search, writer/support/contact, historical task-kind families and arbitrary diagnostic/renamed kinds, using both production entry forms. Throwing injected auth/command getters and throwing prompt/schema getters were untouched. Supplemental batch probes covered default Codex, explicit Codex, Claude, unknown IDs, fulfilled skipping, forged readiness fields, an executor getter, and manual availability. Results: four status-only queries, **0 injected getter reads and 0 forbidden accesses**.

The two new repository files independently passed **22/22 tests**. Spies established zero authentication seams/auth-file reads, temp creation, launch, claim/mutation and audit calls at the blocked boundary. PostgreSQL tests compare complete rows and audit counts across all registered kinds/versions, active and expired leases, previous attempts/output/metadata, and fulfilled tasks: all remain unchanged. Manual selection leaves state unchanged; valid manual fulfilment succeeds; automatic/manual resume of fulfilled work returns complete without execution. Existing citation, ownership and lease validation remains in production handoff tests.

The offline helper at `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/helpers/joboss-offline-runner.ts` is separated from production execution. Source search found **no production imports or calls** in `src`, `tools`, or `app`. Lifecycle requests construct fixed bounded arithmetic material internally and reject arbitrary prompt/schema/kind/input/packet fields before temporary creation. Command selection permits the trusted test Node runtime or an owned missing executable, and tests reject direct installed Codex/Claude commands. The batch helper validates the selected test target and actual database identity and accepts only empty-input/empty-allowset synthetic URL fixtures; it supplies callbacks the fixed synthetic request rather than a stored real packet.

This helper is trusted test machinery with executable fixture callbacks, not a general security sandbox or future provider integration path. Production cannot reach it through the retained injection options. The passing cleanup tests still create owned parent/descendant processes, verify timeout/overflow termination before artifact removal, and cover launch failure; they have not been replaced by trivial blocked-production assertions.

No new inference, provider authentication probe, product research, runtime decompilation, or isolation-establishment attempt was performed. CLI help parsing remains a local check in the existing unit suite and is not treated as isolation evidence. A future automatic implementation needs separately accepted provider/runtime/config/capability evidence and enforcement. This report verifies the present application-level unavailable boundary only.

## Checks actually executed

All three database-backed selections ran serially with the normal repository migration/HTTP-mocking setup. Each process received an explicit `TEST_DATABASE_URL` for **outreach_test_joboss_ra** after shared validation and read-only actual-identity verification. No config file was edited. The existing reviewer database was reused; no other database was deployed to or truncated.

| Command/check | Independent result |
|---|---|
| `npx vitest run test/integration/joboss-corrections.test.ts test/integration/joboss-foundation.test.ts test/unit/joboss-test-target.test.ts test/unit/joboss-process-cleanup.test.ts test/unit/joboss-runner.test.ts test/unit/rate-limit.test.ts test/integration/send-attempt-indexes.test.ts test/integration/budget-envelopes.test.ts` | **8 files passed; 193 tests passed, 0 failed; 14.75 seconds; exit 0.** |
| `npx vitest run test/unit/joboss-isolation-readiness.test.ts test/integration/joboss-isolation-boundary.test.ts` | **2 files passed; 22 tests passed, 0 failed; 2.17 seconds; exit 0.** |
| `npx vitest run test/integration/budget-envelopes.test.ts test/integration/llm-handoff.test.ts` | **1 file passed, 1 failed; 25 tests passed, 3 failed, 28 total; 3.74 seconds; exit 1.** Budget 13/13 pass; handoff 12/15 pass. These counts overlap the focused budget run and are not additive. |
| Inline Node/tsx pure C1 probes | 17 rejection cases, zero connection-verifier/migration callbacks; six approved names accepted with distinct live name. No alias connection attempted. |
| Inline Node/tsx direct/batch C3 probes | 32 direct calls blocked; four status-only batch queries; zero dependency/packet getter reads or forbidden accesses; manual availability preserved. |
| `npm run check:no-raw-http` | Passed, exit 0: clean; approved raw HTTP client remains the network boundary. |
| `npm run lint` | Passed, exit 0. |
| `npx tsc --noEmit -p tsconfig.backend.json` | Exit 2; exactly the three tracked recipient TS2379 errors, no foundation/test diagnostics. |
| `npx tsc --noEmit --incremental false` | Separate UI check passed, exit 0; no incremental-file write. |
| `npx prisma validate`, with process-only reviewer URL | Passed, exit 0. |
| `git diff --check` | Passed, exit 0; repeated after report creation. |
| Production source search for offline helper/functions | No matches in `src`, `tools`, or `app`. |
| Read-only reviewer migration/index queries and disk hashes | 13 completed migrations, all checksums match disk; 11/11 protected indexes match baseline; both corrective partial indexes present. |
| Read-only live protected-baseline comparison | 57/57 protected drafts and 11/11 exact index definitions match; total drafts 57; attempts 0; completed JOBOSS migrations 0. |

Previously closed findings remain closed. Passing tests continue to cover positive research-credit enforcement/narrow mail exemptions, exact budget reservation/uniqueness, captured identity/authorship, owned process-group cleanup, and atomic open-task/lease behavior. As supplemental historical evidence, independently computed current hashes of 17 selected prior files match A's available pre-corrections-02 snapshot, including those closed implementations, provider interface, schema/migrations, `.env`, stage/package files, and both earlier R-A reports. The snapshot is builder-supplied history, not a replacement for the executed checks.

**Skipped/out of scope:** Prisma generation (would mutate generated files); full repository suite; B's suite/database fixtures; preparation/cohort/UI integration; live migrations; real mail/source calls; new provider inference/auth/isolation investigation. No required targeted check was blocked.

## Existing external failures and downstream contracts

The three backend TS2379 errors remain at `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/compose.ts:590` and `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/queue-draft.ts:223` (two calls). The recipient owner must omit undefined `contactId` properties or supply null; strict optional-property checks stay enabled. These existing integration errors do not reopen accepted foundation behavior.

The three old handoff failures remain at `/Users/aryamanjaiswal/Documents/ChatGPT/scraper/test/integration/llm-handoff.test.ts:110`, line 159 and line 203. The ATS fixture lacks required verified ownership: one evidence ID is excluded, fulfilment citing it is refused, and `uncited_evidence` precedes the expected redaction error. They remain with the feature/regression owner. Do not broaden citation allowsets or restore positive billed spending; all 13 corrected budget regressions pass.

For C/D/E, handle `isolation_blocked` as a paused/resumable checkpoint and expose manual handoff. Its blocker carries `code: isolation_unverified`, `readiness: unverified`, requested provider, capability class, `manualAvailable: true`, and detail. Codex remains the intended default, not an enabled runtime. `RunPendingTaskOptions.execute` is retained but ignored/deprecated; dependencies passed to `createSubscriptionExecutor` cannot enable execution. Do not import the offline helper into production. Already fulfilled tasks remain complete. No downstream caller was integrated or edited here.

## Migration and preservation evidence

Normal guarded setup ran only on the reviewer target. Its 13 applied migrations match current disk checksums, including:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

`one_global_research_budget_per_period` retains its null-company predicate; `one_open_llm_task_per_identity` retains pending/claimed uniqueness. All eleven protected index definitions match the baseline on the reviewer database, including both contact/company-slot send dedup guards. No schema or migration implementation was changed.

Live comparison used only `BEGIN READ ONLY` / `ROLLBACK`, comparing each protected draft ID and all baseline text/composition/status/approval/citation fields plus exact index definitions. Result: **57/57 drafts, 11/11 indexes, zero attempts, zero completed live JOBOSS migrations**. Sending and external-recipient flags remain false; source stage remains F5. Previous R-A reports are preserved.

Only this new report was saved. No application/test/schema/configuration edits, live data or migration writes, mail/outreach, approvals, sending enablement, paid services, commits, resets, agents, or cleanup of existing files occurred. Fixture writes/deployments stayed on the reviewer database; process tests used their own temporary artifacts and owned Node processes.

**Final disposition: shared foundation accepted; automatic execution blocked until independently verified isolation and separately reviewed integration. Yielded to the human/orchestrator for the next assignment.**
