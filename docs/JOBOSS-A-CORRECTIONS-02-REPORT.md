# A — Foundation corrections 02 report

Date: 15 October 2026. Bounded implementation of **C1, C2 and C3** from `JOBOSS-FOUNDATION-CORRECTIONS-01-REVIEW.md`. Read the assignment, referenced re-review, corrections 01 report, coordination record and relevant current files before editing. Work was direct: no agents, messages to other chats, or new subscription inference.

The three corrections are implemented and verified as described below. Files are yielded for targeted R-A recheck. Core acceptance remains the reviewer's decision. **Automatic Codex/Claude task execution is explicitly unavailable**, and this report does not establish runtime isolation, overall JOBOSS, preparation or pilot completion.

## Fix → test → result

| Correction | Change | Executed evidence and result |
|---|---|---|
| **C1 — Database alias safety** | Shared target validation now excludes any selected database **name** matching any independently configured live name, regardless of host alias or port, in addition to endpoint comparison. Captured live identities are parsed and validated rather than trusted as an arbitrary iterable. Terminal-dot/case/loopback forms normalize consistently; malformed/empty/indeterminate captures and live URLs fail closed. Exact selected-host/database allowlists remain unchanged. Existing pre-migration, fixture and truncation paths all use this validator. | Added **33** regressions to the existing target file: same-name terminal-dot/case/loopback/ambiguous host forms and different ports; default-port equivalence; malformed captures/configured live URLs; and every approved target with a distinct live name. Negative migration tests assert zero deployment and identity-probe callbacks. Negative truncation tests assert rejection before any PostgreSQL connection or Prisma-client creation. All target tests pass in the eight-file run. Alias reproductions are no-write tests; no writable live-alias connection was attempted. |
| **C2 — Portable enqueue race fixture** | Removed the redundant A-only name restriction. The child uses the explicit shared validated target, performs the existing read-only probe, and additionally checks `current_database()` through the actual Prisma connection before READY/enqueue. It has no redirect/default to another worker target. Parent passes the same validated selected URL. | Pure no-write target selection covers A/B/C/D/R-A/common approved names against a distinct live name; invalid/same-live-name targets are rejected. The prescribed four-independent-process race passes on **outreach_test_joboss_a**: one task ID, one created winner, one queue audit. The original eight-file selection passes in full. No reviewer/B/common database was accessed for fixtures or deployment; R-A portability on its actual database remains for its independent run. |
| **C3 — Explicit unavailable automatic boundary** | Added fixed unverified readiness information. Both the direct executor and batch return **`isolation_blocked`** for Codex/Claude, including default Codex, search, writer/support/contact, historical task kinds and arbitrary renamed kinds. Direct execution does not authenticate, build packets/temp directories or launch children. Batch reads only ID/kind/status and never claims, rejects, fulfils or changes tasks. Injected executors/auth/command dependencies cannot establish readiness. Manual handoff remains usable. | **15 new unit tests + 7 new PostgreSQL tests pass.** Spies establish zero auth, command selection, launch, temp creation, auth-file reads, claim/mutation/audit calls at blocked boundaries. Forged flags, an environment flag, renamed kinds and injected getter/function seams cannot enable execution. Database comparisons cover every registered kind/version, active and expired leases, attempts, prior output/metadata, and already fulfilled work: rows and audit counts are unchanged. Manual selection leaves rows unchanged, manual fulfilment succeeds, and fulfilled resume stays complete. |

Five previously closed implementation findings were preserved: positive research credits/exact mail exemptions, validated envelope accounting and uniqueness, captured authorship evidence, owned process-group termination, and atomic enqueue/lease fencing. The prescribed suite still exercises the real gate, PostgreSQL independent-connection/process races, duplicate migration refusal, fulfil/reject fencing and process-group termination. No budget, provenance, handoff-gateway, process-group or migration implementation was edited in this pass.

## Readiness, manual and diagnostic interfaces

Production interfaces remain in `src/core/llm/subscription-runner.ts`:

- `runPendingTasks(db, options)` still defaults to **Codex**. Each unfinished task returns `state: 'isolation_blocked'`, `elapsedMs: 0`, a useful reason, and a structured `blocker`; the batch is resumable. Already fulfilled tasks are skipped and remain fulfilled. A completely fulfilled scope returns `{results: [], resumable: false}`. The status query selects no task input/output/source material.
- `executeSubscriptionTask(request)` and `createSubscriptionExecutor(deps)(request)` return `{ok:false, state:'isolation_blocked', detail, blocker}` before authentication or execution. Legacy factory dependencies and `RunPendingTaskOptions.execute` are retained for source compatibility but **ignored**, including property getters; the batch option is marked deprecated.
- `IsolationBlocker` has `code: 'isolation_unverified'`, `readiness: 'unverified'`, requested `provider`, `capabilityClass`, `manualAvailable: true`, and `detail`. Classes are `candidate_url_search`, `writer_support`, or `unclassified`. All are unavailable. The future search-only exception grants no current capability.
- `provider: 'manual'` returns `manual_pending` with existing `llm:next` / `llm:fulfil` handoff guidance and makes no task changes. Existing handoff validation and lease fencing are unchanged. Returning manual availability does not bypass citation, identity, ownership or output checks.
- There is **no environment/caller/packet verification switch**, accepted-evidence registry, provider fallback, paid route, or live diagnostic executor. The readiness helper always reports unverified. The command/auth/environment utilities remain compatible but command construction is explicitly documented as an inert, unaccepted configuration blueprint, not isolation evidence.

For C/D/E: treat `isolation_blocked` as a paused/resumable checkpoint and expose manual handoff; do not interpret default Codex selection, CLI auth, generated flags, or a supplied executor as execution readiness. Consumers performing exhaustive state handling must add the new state and may display the structured blocker. No current production preparation caller needed editing; source search found no production import of the offline harness.

The former injectable subprocess lifecycle and fenced runner regression machinery now live in **`test/helpers/joboss-offline-runner.ts`**, separated from production entry points. Its lifecycle fixture accepts only provider/timeout options, constructs a fixed trusted arithmetic prompt/schema internally, rejects arbitrary prompt/kind/schema/input/packet fields before temp creation, and permits only the current Node executable or a missing executable inside its own directory. Tests prove installed `codex`/`claude` command selection is rejected. It is an offline fixture, **not a real provider diagnostic and not isolation proof**.

The test-only batch harness validates the selected test database/actual identity and accepts only empty-input, empty-allowset synthetic URL-task fixtures. It never forwards a stored task packet to an installed provider; callback requests use the fixed internal fixture. Captured source/repository/renamed diagnostic packets are rejected before claims. Existing synthetic lifecycle/fencing regressions were routed through this harness; manual packet/fulfilment coverage remains on production handoff functions. The actual production `claimNextTask`, `fulfilTask`, `rejectTask` and process-group implementation remain unchanged and are exercised by regressions. Future verified execution needs separately reviewed integration; this pass fabricates no accepted provider/runtime/config/capability evidence.

## Checks actually executed

All database-backed tests used a process-only override selecting **`outreach_test_joboss_a`**, with the normal shared pre-migration guard, normal `prisma migrate deploy` and actual-target verification. `.env` was not edited. Runs were serial on A's target.

| Check | Actual final result |
|---|---|
| Prescribed eight-file Vitest selection, listed below | **8 files passed; 193 tests passed, 0 failed; 13.83 seconds; exit 0.** |
| New `joboss-isolation-readiness.test.ts` and `joboss-isolation-boundary.test.ts` | **2 files passed; 22 tests passed, 0 failed; 2.24 seconds; exit 0.** |
| Safe older budget/handoff regression selection | **1 file passed, 1 failed; 25 tests passed, 3 failed, 28 total; 5.29 seconds; exit 1.** Budget 13/13 pass; unchanged handoff 12/15 pass. Overlaps the eight-file budget run; counts are not additive. |
| `npm run check:no-raw-http` | Passed, exit 0. |
| `npm run lint` | Passed, exit 0. |
| `npx prisma validate`, with A's process-only database URL | Passed, exit 0. No schema changes or generation needed. |
| `npx tsc --noEmit -p tsconfig.backend.json` | Executed separately; exit 2, exactly three unchanged recipient TS2379 errors, no foundation/test diagnostics. |
| `npx tsc --noEmit --incremental false` | Separate UI check passed, exit 0. |
| `git diff --check` | Passed before report; repeated after saving. |
| Read-only A migration/index comparison | 13 completed migrations; all applied checksums match disk; 11 protected index definitions match baseline; both corrective partial indexes retained. |
| Read-only live protection comparison | 57/57 protected drafts and 11/11 protected index definitions match baseline; total drafts 57; send attempts 0; completed live JOBOSS migrations 0. |

Eight-file selection (same required paths as corrections 01):

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

Count change from 161 to 193: 33 added target regressions, and the obsolete injected-authentication lifecycle test removed from that selection; production auth-before-launch behavior is replaced by stricter no-auth/no-launch guard evidence in the new unit file. Existing lifecycle tests still run offline. Initial development runs failed due to native ESM spy setup and two test assertions (import-time read counts and the exact authorship metadata key); those test issues were corrected before the final passing runs. They are not counted as passes. No new model inference/auth probe was attempted; the existing CLI-help parsing regression remains a local parsing check only.

Outstanding external failures remain unchanged:

- Backend: `src/outreach/draft/compose.ts:590` and two calls at `src/outreach/draft/queue-draft.ts:223`, passing explicitly undefined `contactId` where an optional present value requires `string | null`. Strict checking remains enabled; recipient files were preserved.
- Old handoff: `test/integration/llm-handoff.test.ts:110` expects excluded ATS evidence; `:159` expects fulfilment citing it; `:203` expects redaction before the actual `uncited_evidence` refusal. Verified ATS-ownership fixtures remain the feature/regression owner's work. The file and allowsets were not relaxed.

No full suite, preparation/cohort run, B suite, reviewer database run, or actual subscription inference/catalog check was performed. Complete provider/runtime isolation remains unverified; the newly verified property is **unavailability of production automatic execution** while that evidence is missing.

## Changed files and preservation

Eight existing files changed relative to this pass's pre-edit snapshot:

```text
src/core/llm/subscription-runner.ts
test/helpers/test-target.ts
test/helpers/joboss-enqueue-child.ts
test/integration/joboss-foundation.test.ts
test/integration/joboss-corrections.test.ts
test/unit/joboss-test-target.test.ts
test/unit/joboss-runner.test.ts
test/unit/joboss-process-cleanup.test.ts
```

Five new files, including this report:

```text
src/core/llm/isolation-readiness.ts
test/helpers/joboss-offline-runner.ts
test/integration/joboss-isolation-boundary.test.ts
test/unit/joboss-isolation-readiness.test.ts
docs/JOBOSS-A-CORRECTIONS-02-REPORT.md
```

Pre-edit SHA-256 snapshot covered **293** existing source/test/schema/tool/document/config files. Comparison found only the eight owned changes above and **no missing files**. All other captured files match, including previous corrections/review/coordination reports, B helpers/delivery, recipient/discovery/UI work, budget/provenance/task implementations, schema and every migration, `.env`, package/lockfile and TypeScript/Vitest configuration. Session-local evidence: `/tmp/joboss-a-corrections02-start-hashes.json` and `/tmp/joboss-a-corrections02-preservation.json`.

No new schema or migration was needed. A's 13 applied checksums all match disk. JOBOSS checksums remain:

```text
20261014170000_joboss_preparation
  4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
  31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

The global-budget and open-task partial unique indexes retain their expected predicates. A's 11 protected indexes match the original baseline, including `one_first_touch_per_contact_per_cycle` and `one_first_touch_per_company_slot_per_cycle`.

Final live comparison used only **`BEGIN READ ONLY` / `ROLLBACK`** on `outreach_dev`, comparing baseline IDs and every protected draft field plus exact index definitions from `scratch/joboss-baseline-20261014/protected-state.json`: **57/57 drafts and 11/11 indexes unchanged**, 0 send attempts, 0 completed JOBOSS migrations. Sending remains disabled; source stage/configuration files match the pre-edit snapshot (F5, both sending flags false).

No live writes/deployment, mailbox/source operations, outreach, sending/approval/stage changes, paid services, commits, resets, other-worker cleanup or applied-migration rewrite occurred. Database fixtures/deployments stayed on A's assigned test target; process fixtures used only their newly owned temporary artifacts/processes. Yielded for independent R-A review.
