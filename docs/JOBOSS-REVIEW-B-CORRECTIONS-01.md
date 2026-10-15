# R-B — Delivery corrections 01 targeted re-review

Continue in the existing **R-B — Inbox/delivery review** chat. B has yielded its files. This is the sole active assignment; all builders and other reviewers remain idle. Work directly without agents or messages to other chats. Application, tests, schema, migrations and configuration are read-only. Save only the new review report specified below; preserve earlier reports and all current work.

## Objective, scope and dependencies

Independently close or reopen **RB-1 through RB-5** from your `docs/JOBOSS-B-DELIVERY-REVIEW.md`. Read `docs/JOBOSS-B-CORRECTIONS-01.md`, `docs/JOBOSS-B-CORRECTIONS-01-REPORT.md`, the current diff/new files and relevant callers/tests. Review the executed behavior, not the statement that all five are fixed.

Determine whether delivery implementation is accepted within mocked-provider/local-test scope. No overall JOBOSS, real Gmail, pilot, preparation/cohort or automatic-runtime acceptance. D's substantive @5 readiness validator/CLI integration and three backend errors remain pending. Verify the existing fail-closed seam, not a substitute validator. Foundation was independently accepted; its automatic-execution block/manual interface remain in force.

Preserve previous positive evidence for pagination/resumption, duplicate atomic outcomes, counters, ordinary identity/reconciliation, caps and missing @5 refusal unless the corrections demonstrate a concrete regression. No broad redesign or new product/source investigation. No new provider inference or real mailbox test is required or authorized.

B's inventory adds `src/outreach/send/reservation.ts`, `src/outreach/mail/headers.ts` and `test/delivery/corrections-01.test.ts`, and changes the authorized delivery paths plus narrowly scoped `revokeApproval` coordination in `src/outreach/draft/approve.ts`. Review that ownership boundary and the updated B test guard/config. B reports no schema/core/package/migration changes. The wider diff includes orchestrator documents and earlier work; do not treat it all as B's edits.

## Focused acceptance checks

### RB-1 — Exact approval reservation versus revocation

Review pre-gate/locked snapshots, row locks, transport-plan comparison, second frozen-hash verification and conditional approved→sending transition. The transition and new attempt must commit together before transport. Revocation takes the same draft lock and must clear approval/audit atomically or refuse once an attempt exists. New sends from a transaction-scoped client must refuse before transport rather than reserving inside an uncommitted outer transaction.

Independently reproduce both deterministic orderings with actual separate PostgreSQL connections: revoke-first returns success with zero attempt/provider sends; reservation-first makes revocation wait and then refuse `send_attempted`, with one send. Avoid a test deadlock from awaiting the blocked revoker before releasing its lock holder. Check body/hash/recipient mutation, change-and-restore intermediate plans, rollback after attempt-write failure and unchanged concurrent approved sends. Verify snapshot/plan binding rather than accepting before/after equality as sufficient on its own.

### RB-2 — Uncertain delivery keeps dedup/cap reservations

Reproduce stripped-handle modeled delivery and failed/missing/bounded provider lookup. Require visible `pending_reconciliation`, retained `in_flight`, unchanged original attempt time and no second send through same-key retry or no-send recovery. New approved draft keys must not evade contact/cycle or company/cycle/slot reservations: check readable gates and actual protected index rejection, including a different contact in the same slot. Original attempt-day/domain caps continue counting uncertainty; legitimate next-day accounting remains per day.

Later successful lookup must resolve the original attempt with actual IDs and no provider send, preserving any stopped draft. Genuine definite provider refusal remains distinct. Review B-owned CLI handling/exit status for pending results without executing a real inbox/send command. Check concurrent recovery/status observations for a demonstrated regression; do not infer provider correctness from fakes.

B also reports newly demonstrating the former `markFailed` concurrent-stop overwrite, previously only your hypothesis. Independently verify the permanent regression: opt-out during a definite refusal leaves a failed transport attempt and stopped opted-out draft/suppression, while ordinary definite refusal remains usable. No need to rerun an old transpiled source copy to establish current correctness.

### RB-3 — Attribution and incomplete coverage

Review detailed candidate gathering and sender/DSN consistency, not first-row order. Independently check shared-thread sender B identifies B without suppressing A; conflicting exact IDs across contacts/conversations yield explicit unresolved; a strong DSN ID beats an unrelated weak thread; contradictory DSN recipients remain unresolved. Preserve rewritten IDs, same-conversation References history, valid human thread matching and recipient-only DSN cases within the documented evidence rules.

Check mixed-case headers, mismatched human sender, unreadable/multiple mailboxes and plus-address distinctions. The conservative parser is not sender authentication; record its actual supported syntax and limits. Unresolved attribution must create no irreversible outcome or arbitrary contact transition, remain auditable/idempotent under repeats/concurrency, preserve a resumable page checkpoint and block sync/pre-send completeness. Ordinary unrelated unmatched mail must remain distinct. Audit/cursor contents must remain bounded and no conflict may silently disappear because a compatibility lookup returned null.

### RB-4 — Soft-bounce stop

Use actual 4.x.x ingestion after a first touch and a separately individually approved follow-up/revision. Touches 1 and 2 must refuse with soft-bounce stop, zero extra sends and no permanent address suppression. Retain the other conversation-stop behaviors.

### RB-5 — Auto-Submitted parsing

Independently reproduce `no ; extension=value`, valid folding/leading/trailing whitespace, nested comments/quoted-pair escapes and genuine automatic values. Valid human forms must retain opt-out handling; genuine auto replies retain their protection. Malformed keyword/CFWS should surface unclassified/unresolved and block coverage, rather than silently dismiss a human stop. Review actual parser scope and parameter handling against its claimed contract; no general mailbox/MIME parser rewrite is requested.

Root independently spot-checked four human-stop forms, two automatic forms, malformed unclassified handling and plus-address preservation, with zero database/provider calls. Root also read B's retained verbose suite log (154/154) and matched the two migration disk hashes. Those checks supplement, not replace, your independent race/constraint/coverage verification.

## Required verification and preservation

Exclusively use **`outreach_test_joboss_b`** with process-only test URL, normal shared independent-live-exclusion/actual-target guards, B's `test/delivery/vitest.config.ts` and serial execution. No other-worker/common/live fixture target, db push/reset, safety bypass, constraint drop, dependency install or generated-source mutation. Supplemental reproduction files may be newly owned temporary files, with the same explicit guards and outbound HTTP refusal; do not change tracked tests to make the review pass.

Run the delivery configuration: all eight original paths plus `test/delivery/corrections-01.test.ts`. B reports **9 files, 154 tests**, including 40 new corrections tests and the original 114. Record your actual counts/output. Inspect the two sender-fixture adjustments and changed ambiguous-miss expectations to confirm safety assertions were preserved rather than weakened. Retain original pagination, attachment failure, partial/resumed scans, duplicate rollback, counters, approval mutation, caps/breakers, rewritten IDs, crash recovery and @5 fail-closed coverage. Classify the reported pg concurrent-query deprecation warning honestly; investigate only if it compromises these results.

Run lint, network guard, schema validation, whitespace and backend/UI checks separately with incremental file writes disabled. Keep exactly the three existing D errors tracked if unchanged; any new correction-owned diagnostic is actionable. No full suite or repeated A foundation suite is needed for this bounded review.

Verify B's actual migrations/checksums and all protected index definitions without changing SQL. Expected original/corrective JOBOSS disk hashes:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

If accessible, compare the live protected baseline only through `BEGIN READ ONLY`/`ROLLBACK`: 57 stored drafts/all protected fields, 11 index definitions, zero attempts/live JOBOSS migrations; F5 and both sending flags false. Preserve current staged/unstaged/history state. No staging, commits, resets, live writes, approvals of live drafts, real inbox/send/OAuth/auth operations, sending enablement, external communication or paid services.

## Required report and stopping point

Save `docs/JOBOSS-B-CORRECTIONS-01-REVIEW.md`, return it labeled **R-B — Inbox and delivery corrections 01 re-review report**, then yield. Include:

1. Scoped delivery verdict, exactly what may proceed, and distinct D/integration/provider limitations.
2. RB-1..RB-5 each closed, reopened or verification-blocked with concrete evidence; include the stop-preserving definite-failure regression.
3. Actual checks/results/file-test counts, retained synthetic outputs, skipped/blocked checks and preservation evidence.
4. Newly demonstrated regressions only: priority, absolute file/line, reproduction, effect and bounded correction request. Separate hypotheses from defects and acknowledged availability limits.
5. Final reservation/revocation, pending-reconciliation and detailed-attribution/coverage interfaces for D/E.

If the corrections and preserved invariants pass, explicitly accept delivery within this scope and stop. Do not implement findings, start another assignment, reopen foundation without new evidence, weaken gates or claim pilot/overall completion. Return the report through the human/orchestrator.
