# R-A — Foundation corrections 02 targeted re-review

Continue in the existing **R-A — Foundation review** chat. A has yielded its files. The human subsequently authorized an independent **R-B** delivery review in parallel, maximum two active reviews: R-A exclusively uses `outreach_test_joboss_ra`, R-B exclusively uses `outreach_test_joboss_b`, and all builders stay idle. Work directly, without agents or messages to other chats. Application, tests, schema, migrations and configuration are read-only. Save only the new review report specified below; preserve previous reports and other workers' work. Avoid shared generated-file/build-cache writes while both reviews run.

## Objective and agreed acceptance boundary

Independently close or reopen **C1, C2 and C3** from `docs/JOBOSS-FOUNDATION-CORRECTIONS-01-REVIEW.md`. Decide whether the shared foundation can be accepted for dependent discovery, recipient and manual-preparation implementation. Give a separate verdict for automatic subscription execution, which must remain unavailable while provider/runtime isolation is unverified.

Read `docs/JOBOSS-A-CORRECTIONS-02.md`, `docs/JOBOSS-A-CORRECTIONS-02-REPORT.md`, your previous re-review, and the relevant current source and tests. Use the earlier A reports only for context. Five original findings were already independently closed: preserve that acceptance unless current changes introduce a concrete regression. Keep the three recipient type errors and three historical ATS-fixture failures tracked under their existing owners. They do not justify expanding this foundation correction assignment.

No new model inference, provider authentication probe, product research or attempt to establish runtime isolation is required. The property under review for C3 is **no automatic execution before accepted isolation evidence**. A passing review may conclude **core accepted / automatic execution blocked**. That does not complete the eventual automatic preparation requirement or authorize sending.

## Ownership and interfaces

Review the corrections-02 inventory in A's report, particularly:

- `test/helpers/test-target.ts`, the normal pre-migration/setup/fixture consumers, and `test/helpers/joboss-enqueue-child.ts`.
- `src/core/llm/subscription-runner.ts` and `src/core/llm/isolation-readiness.ts`.
- `test/helpers/joboss-offline-runner.ts` and the changed/new foundation, process, runner, target and isolation tests.

Shared interfaces for downstream workers: default provider remains Codex; unavailable automatic tasks return a distinct resumable `isolation_blocked` result with structured reason; `provider: 'manual'` offers existing handoff; fulfilled tasks stay fulfilled. No boolean/environment flag, injected executor, renamed task or diagnostic label grants readiness. No production source/tool imports may route real work through the offline harness. Check compatibility, but do not edit B/C/D or integrate their callers here.

## Targeted checks

### C1 — Database alias safety

Reproduce the former `localhost.` versus `localhost` same-name case as a **pure no-write rejection**. Check same-name aliases, loopback/case/default-port/different-port forms, malformed saved identity values, malformed live URLs and empty/indeterminate identity capture. Required contract: selected test names matching any independently configured live name are rejected regardless of endpoint spelling or port; exact approved local test targets and independently captured live configuration remain enforced.

Verify rejection happens before migration callback, identity connection or fixture/truncation writes. Check approved A/B/C/D/R-A/common target names with a distinct live name using pure tests; perform actual database fixtures only on your R-A target. Do not attempt a writable live alias reproduction, broaden allowlists or modify `.env`.

Root has independently reproduced three alias/port rejections and legitimate distinct-name acceptance without any database connection. That is supplemental evidence, not a substitute for your own review.

### C2 — Portable independent-process fixture

Run the prescribed selection on **`outreach_test_joboss_ra`**, using the normal guarded setup and process-only test URL. Confirm the child inherits the selected target, checks actual connected identity before READY, and no longer requires A's database. Reproduce the independent-process enqueue race: one task ID, one created winner and one queue audit. Keep the existing lease/fencing, terminal transition, real database budget races and cleanup regressions meaningful after their test-harness relocation.

Do not redirect to A/B/common targets. Do not deploy or truncate any database outside your R-A target. If environment/dependencies block verification, report that blocker rather than bypassing safety.

### C3 — Explicit unavailable automatic boundary

Independently exercise direct and batch interfaces for default Codex, explicit Codex and Claude, research URL tasks, writer/support/contact classes, historical versions and arbitrary renamed tasks. Establish no task claim/change, auth read/probe, temp packet creation or provider subprocess launch occurs. Check active/expired leases, attempts, output, metadata and audit counts survive unchanged. Already fulfilled work must be skipped; manual selection and valid manual fulfilment must remain usable with existing evidence/lease checks.

Probe injected executor/auth/command seams, getters, environment/caller/packet readiness flags and diagnostic/kind renaming. They must not enable production execution. Inspect the offline harness: synthetic material constructed internally, selected-test-database validation, no forwarding of real stored packets to providers, and no production imports. Verify lifecycle regressions still exercise owned process cleanup rather than silently removing that coverage.

Do not call a blanket block verified runtime isolation. The accepted behavior is an honest resumable unavailable state. Record provider/runtime isolation as a future integration requirement, not an endlessly retried task in this review.

Root separately exercised 20 direct blocked cases, status-only batch behavior, fulfilled skipping and manual availability with no database connection/provider launch. Root's source search found no production import of the offline helper. Independently check the substantive claims.

## Required verification

Run serially on your dedicated target with the repository's normal migration and HTTP-mocking setup. No `db push`, reset, guard bypass, real mailbox/source calls or paid fallback.

Eight-file selection from A's report:

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

Also run:

```text
test/unit/joboss-isolation-readiness.test.ts
test/integration/joboss-isolation-boundary.test.ts
```

A reports 193 tests in the eight files and 22 in the new files; report your actual independent results. Check safe older budget/handoff regressions and classify the three previously recorded ATS-fixture failures without weakening source allowsets. Run lint, network guard, schema validation, whitespace and backend/UI typechecking separately. Avoid generation that would mutate review-owned source; record a skip if necessary. The three unchanged recipient errors remain assigned to D.

Verify deployed migration checksums and protected indexes on R-A's target. Expected disk hashes, independently matched again by root:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

Compare the live protected baseline only through read-only transactions, if accessible: all 57 draft records/fields, 11 index definitions, zero send attempts and zero completed live JOBOSS migrations. Confirm sending/configuration remain unchanged. Never use live migration/fixture writes or loosen existing constraints.

## Required report and stopping point

Save `docs/JOBOSS-FOUNDATION-CORRECTIONS-02-REVIEW.md`, return it labeled **R-A — Foundation corrections 02 re-review report**, and yield. Include:

1. Core foundation verdict and separate automatic execution verdict, with exactly what may proceed.
2. C1/C2/C3 closed, reopened or verification-blocked, each with actual evidence.
3. Any newly demonstrated regression: priority, absolute file/line, reproduction, practical effect and bounded correction request. Separate confirmed defects from hypotheses and historical failures.
4. Commands/checks actually executed, exact file/test counts and results, and skipped/blocked checks.
5. Migration/protected-state evidence, unresolved automatic-runtime requirement and any downstream interface request.

If the three corrections and preserved invariants pass, explicitly accept the shared foundation with automatic execution blocked and stop. Do not turn this into a broad feature audit, implement fixes, claim overall JOBOSS/cohort/pilot readiness, enable sending, approve drafts, send outreach, commit or reset existing work.
