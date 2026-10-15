# B — Delivery corrections 03: residual DSN consistency

Continue in the original **B — Inbox/delivery** chat. This is the sole active assignment; R-B and other chats are idle. Work directly, no agents or messages to other chats. Read `docs/JOBOSS-B-CORRECTIONS-02-REVIEW.md`, your corrections-02 report, current DSN guard/matching code and relevant delivery tests.

## Objective and confirmed defect

Fix only the residual **RB-3b** contradiction: without Status, Action and Diagnostic-Code are never checked against each other. The independent reviewer confirmed that this body, with B's exact original Message-ID and a postmaster sender, causes hard bounce/permanent suppression and complete coverage:

```text
Final-Recipient: rfc822; owner+b@owned.example
Action: delayed
Diagnostic-Code: smtp; 550 5.1.1 user unknown
```

Root separately reproduced the pure helper/classifier gap: `issue:null` and hard bounce/550 with no database/provider calls. End-to-end suppression/coverage evidence is the reviewer's actual PostgreSQL/fake-provider execution, not a root rerun. Retained review evidence if present: `/tmp/joboss-rb-c02-oq9xxl/`.

RB-3a is now independently closed. Original mixed-recipient DSNs are fixed. RB-1/RB-2/RB-4/RB-5 and stop-preserving failure remain accepted; preserve them. No broad DSN/MIME redesign, parser replacement, foundation changes or runtime/provider investigation.

## Ownership and agreed behavior

Edit only `src/outreach/mail/dsn-evidence.ts`, focused delivery regression tests and `docs/JOBOSS-B-CORRECTIONS-03-REPORT.md`. A small private helper in that same DSN file is allowed. Existing matcher/classifier/sync contracts should carry the new issue into unresolved/incomplete behavior without edits. If that proves impossible, report a precise request rather than changing other source files.

Evaluate the consistency of available Action, Status and Diagnostic-Code evidence rather than gating every comparison on Status. A contradictory or unbindable combination relevant to a known conversation must produce an issue before downstream classification/outcome mutation. Use the existing unresolved → bounded audit → incomplete/replayable coverage contract; do not resolve contradictory evidence by choosing one field or converting it into an ordinary unmatched/reply/success result.

Use a small explicit decision table or equivalent shared consistency rule. Cover the combinations where Status is absent as well as present, so the fix addresses the missing pairing rather than special-casing one literal string. Preserve the current supported compatibility of unambiguous exact-ID-only legacy DSNs and consistent diagnostic fallbacks. Do not reject all diagnostic-only evidence merely to pass the bad fixture, reinterpret accepted status/action conventions unnecessarily, add a schema status or weaken suppression/dedup constraints. Record the supported combinations and intentional unresolved boundaries in your report.

## Acceptance and tests

1. Exact regression above through DSN guard, detailed matcher, real ingestion, sync/replay and pre-send. Require unresolved, one bounded audit under repeat/concurrent ingestion, zero Bounce/Reply/OptOut/suppression, unchanged original contact/draft/lead/attempt state, incomplete resumable coverage and zero new provider sends/attempts.
2. Focused consistency matrix for existing action classes with diagnostic classes 2/4/5 and Status missing/present. Contradictory pairings must not silently pass merely because a third field is missing; consistent existing fallbacks remain usable. Test field order/case or equivalent formatting where it could affect the implementation. Do not count a successful script asserting old bad behavior as a passing product test.
3. Positive consistent no-Status diagnostic fallbacks through actual ingestion: an unambiguous temporary failure stays soft/no permanent suppression and an unambiguous permanent failure stays hard with appropriate attribution. Preserve existing exact-ID-only legacy, same-recipient and known single-recipient DSNs. Existing mixed/multiple recipient/unbindable block checks and sender controls remain intact.
4. Run the full existing ten-file delivery configuration (201 previous tests) plus new cases, serially on **outreach_test_joboss_b** only. Use process-only test URL, shared configured-live exclusion and actual-identity verification, normal immutable migration setup, HTTP mocking/net refusal and fake providers. No test removals, guards bypass, db push/reset, dropped constraints or other-worker/common/live fixtures.

Run lint, network guard, schema validation, whitespace and backend/UI checking separately with incremental writes disabled. Report exact counts and results; keep the three unchanged D-owned type errors tracked. No full repository/foundation rerun, real mailbox, model/auth/OAuth/inbox/send operation or product research is needed.

Confirm applied migration hashes/index predicates and protected files unchanged. Any live baseline check must be read-only against the existing 57-draft/11-index baseline, zero sends/live JOBOSS migrations, F5 and disabled flags. Preserve all current work/Git state. No live approval/write/deploy, outreach, sending enablement, paid service, staging, commit, reset, dependency replacement or agents.

## Required report and yield

Save and return **B — Inbox and delivery corrections 03 report** at `docs/JOBOSS-B-CORRECTIONS-03-REPORT.md`:

- Changed files; residual fix → matrix/end-to-end executed evidence → actual results.
- Explicit available-field consistency rule, supported fallbacks and unresolved boundaries; confirmation existing interfaces unchanged.
- Actual checks/file-test counts, meaningful outputs, blocked/skipped checks and preservation evidence.
- Previously closed findings preserved and remaining D/provider/runtime limits.

Yield for an independent R-B recheck of this residual condition and preservation. Do not claim delivery/JOBOSS/pilot acceptance before review or start another assignment.
