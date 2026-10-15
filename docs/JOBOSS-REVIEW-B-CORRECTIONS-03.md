# R-B — Delivery corrections 03 targeted re-review

Continue in the existing **R-B — Inbox/delivery review** chat. B has yielded. This is the sole active assignment; all builders/other reviewers are idle. Work directly without agents or messages to other chats. Code/tests/config/schema/migrations/Git state are read-only. Write only the new report specified below, preserving previous reports and current work.

## Objective and ownership

Independently close or reopen only the residual **RB-3b missing-Status Action/Diagnostic contradiction** in `docs/JOBOSS-B-CORRECTIONS-02-REVIEW.md`. Read that report, `docs/JOBOSS-B-CORRECTIONS-03.md`, `docs/JOBOSS-B-CORRECTIONS-03-REPORT.md`, current `src/outreach/mail/dsn-evidence.ts` and `test/delivery/corrections-03.test.ts`, and their unchanged ingestion/coverage callers.

B reports changing just the DSN helper, adding focused tests/report. RB-3a, all other prior findings and failure-stop preservation remain accepted unless a concrete regression is demonstrated. Preserve the original mixed-recipient/unknown-recipient fixes. No new general mailbox/MIME implementation, broad foundation/delivery investigation, provider research or inference is needed. Scope is synthetic PostgreSQL/fake-provider delivery correctness, not real Gmail, pilot, automatic runtime or overall JOBOSS acceptance.

## Required residual verification

Reproduce your exact postmaster DSN with B's original Message-ID, Final-Recipient B, `Action: delayed`, `Diagnostic-Code: smtp; 550 5.1.1 user unknown` and **no Status**. Independently require:

- Guard issue and detailed unresolved match before irreversible outcome writes.
- Repeat/concurrent ingestion yields one bounded unresolved audit; zero Bounce/Reply/OptOut/suppression; unchanged original contact/draft/lead/attempt snapshots.
- Sync/replay stays incomplete/resumable and pre-send refuses with zero new sends/attempts.

Review the explicit action-class rule and test matrix: comparisons must apply to every pair whose fields are present, not depend on a missing third field. Check Action/Status, Action/diagnostic and Status/diagnostic compatibility, including missing Status and field order/case. Independently inspect expectations rather than accepting a matrix that mirrors an erroneous implementation. Preserve existing supported action conventions; no new RFC-completeness requirement is introduced here.

Positive controls must preserve consistent no-Status diagnostic fallbacks (delayed/450, failed/450 and failed/550, diagnostic-only 450/550 with known attribution), exact-ID-only legacy inference within the existing scope, and normal single-recipient Status DSNs. The existing no-Status success quarantine remains a documented safety limit. Do not demand arbitrary guessed status/action reinterpretation or reject all missing-Status DSNs as a workaround. Existing mixed/repeated/unreadable/unbindable recipient/outcome guards and sender parsing must remain unchanged.

Root independently ran seven pure no-DB/no-provider cases: the exact residual now blocks, consistent temporary/permanent fallbacks stay supported and success/contradictory cases remain guarded. Root inspected B's retained red log (two failing regressions before the fix) and final log (320/320); these supplement but do not replace your own ingestion/coverage evidence.

## Checks and preservation

Only **outreach_test_joboss_b**, explicit process-only test URL, shared independent-live-exclusion and actual-identity checks, existing delivery config and normal immutable migration setup. Serial tests, outbound HTTP refusal and fake providers remain required. Supplemental probes may use newly owned temporary files with the same guards; no tracked code/test/config edits, other fixture targets, reset/db-push, guard bypass, constraint removal, installs or generated-source mutation.

Run the existing full delivery config, now eleven files/320 tests reported: all prior 201 tests plus 119 new cases (96 helper matrix cases, 13 end-to-end quarantine cases, ten positive controls). Record actual independent counts and meaningful outputs. The full selection preserves previously closed regressions; do not restart their broad reviews without demonstrated failures. B's failing-before/fixed-after logs are historical evidence, not a substitute for your executed results.

Run lint, network guard, schema validation, whitespace and backend/UI checking separately with incremental writes disabled. Keep exactly the three existing D-owned type errors tracked if unchanged. No full repository/foundation rerun or real mailbox/model/auth operation required. Driver concurrent-query warnings remain acknowledged upgrade debt unless current evidence shows a concrete failure.

Verify B migration checksums and protected indexes without changing SQL. Expected JOBOSS hashes:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

If accessible, protected live comparison is BEGIN READ ONLY/ROLLBACK only: 57 drafts/all protected fields, 11 indexes, zero attempts/live JOBOSS migrations, F5 and both sending flags false. No live approvals/writes/deployment, inbox/send/OAuth/auth/model calls, outreach, sending enablement, paid service, staging, commit or reset.

## Report and stopping point

Save `docs/JOBOSS-B-CORRECTIONS-03-REVIEW.md`, return it labeled **R-B — Inbox and delivery corrections 03 re-review report**, then yield. Include scoped verdict, residual closed/reopened/verification-blocked with actual outputs, independent checks/file-test counts, preservation, skipped/blocked checks and unchanged D/provider/runtime limits. New confirmed regressions require priority, absolute file/line, reproduction, practical effect and bounded ownership; distinguish hypotheses and deliberate fail-closed availability limits.

If this residual and preservation pass, **close RB-3b/RB-3 and accept scoped delivery**, retaining the other closed findings. Stop the review loop. D's no-network transaction-compatible readiness implementation/CLI wiring, three type errors, provider/runtime isolation and final preparation/cohort remain separate unfinished work. Do not implement fixes, launch another assignment or claim pilot/overall completion; return the report through the human/orchestrator.
