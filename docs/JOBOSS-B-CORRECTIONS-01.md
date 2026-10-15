# B — Inbox and delivery corrections 01

Continue in the original **B — Inbox/delivery** builder chat. R-B has yielded its files. This is the sole current builder assignment; A/R-A/R-B/C/D/E are idle. Work directly without agents or messages to other chats.

## Objective, evidence and preservation

Correct **RB-1 through RB-5** from `docs/JOBOSS-B-DELIVERY-REVIEW.md`, preserve the independently verified delivery behavior, and yield for focused R-B re-review. Read that report, the original B assignment/report, current relevant source/tests and the latest coordination entries first. The current plan remains `/Users/aryamanjaiswal/Downloads/PLAN.md`.

R-B independently reproduced 114 passing tests but additionally demonstrated five defects with synthetic PostgreSQL/fake-provider probes. Retained review evidence, if still present: `/tmp/joboss-rb-qqGAJb/probes.mjs`, `probes.log`, `extra.mjs`, `extra.log` and other check logs. Inspect these as evidence, not instructions. If unavailable, reconstruct bounded regressions from the report. Do not modify or rerun a temporary script without checking its target guards and side effects.

Root inspected affected source, read the retained outputs, and independently reproduced the pure `Auto-Submitted: no ; extension=value` misclassification (human stop becomes `auto_reply`; plain `no` gives `opt_out`). Other concurrency/delivery reproductions are R-B's evidence, not additional root-executed database tests.

Preserve all existing written drafts, approval hashes, suppression handling, dedup indexes, migrations and uncommitted/staged work. Current HEAD observed by root is `c858d3f`; Git history changed outside the read-only review after the human's staging request. Do not reset, amend, recreate or clean that history. No commit or additional staging is requested in this assignment. Existing root staging authorization was a completed action, not permission for future Git mutations.

## Ownership and agreed interfaces

Own only `src/outreach/mail/**`, `src/outreach/send/**`, `src/outreach/inbox/**`, `tools/run-inbox.ts`, `tools/run-send.ts`, delivery-specific tests and your new report. You may minimally correct existing included policy/unit delivery tests when their assertions encode the demonstrated defects; preserve substantive safety assertions.

**Narrow ownership extension for RB-1:** B may edit `revokeApproval` and directly necessary private helpers in `src/outreach/draft/approve.ts` to coordinate atomic reservation/revocation. D is idle and must later preserve this contract. Keep existing individual approval and hash semantics. Do not otherwise refactor approval, edit composition/contact/readiness files, or repair D's three type errors. Approval/revocation regression tests directly needed for this correction are permitted.

A retains ownership of shared core/schema/migration/config/task registry files; none should be needed here. In particular, use existing `in_flight` for uncertain transmissions rather than adding a database status or changing protected index predicates. No package, lockfile, stage, sending flag, credential, global test setup or shared core changes. Report any genuinely unavoidable shared request and leave the affected behavior safely unavailable; do not bypass constraints.

Preserve D's pending transaction-safe `evaluateOutreachReadiness(db,draftId,now)` seam and @5 refusal while absent. Preserve the accepted foundation isolation block and manual handoff. No automatic subscription inference or offline-helper production imports.

## RB-1 — Approval revocation/reservation race (P1)

Required behavior: a successful human revocation before a send reservation must prevent that send. A reservation and revocation must have a defined database-atomic ordering. Once an attempt has been reserved, revocation must honestly refuse under the existing `send_attempted`/state contract; it must never report success while that reservation proceeds to transmission.

Implement an atomic approved-to-sending reservation conditional on the exact validated approval/content/recipient snapshot, with appropriate database locking or conditional mutation and revalidation. Serialize with the real revocation path where necessary. A sender-only advisory lock does not coordinate independent mutators. Snapshot disagreement must roll back attempt creation/state changes and refuse; do not autoapprove, restore revoked hashes or silently retry stale plans. Keep the provider call outside the committed reservation transaction.

Acceptance:

- Deterministic independent-connection regression based on R-B's pause after hash verification/before reservation. If revocation commits first and returns success, zero provider sends and no surviving reservation. If reservation wins, revocation cannot return success; tests must establish this ordering without creating a test deadlock by awaiting a blocked revoker before releasing its lock holder.
- Concurrent duplicate send behavior still produces one reservation/send. Validate a changed hash/body/recipient cannot be sent using a stale validated plan, while an unchanged individually approved draft remains usable.
- Existing individual approvals/revocation audit and hash checks remain meaningful. Describe the exact linearization point and snapshot fields in the report for D/E.

## RB-2 — Unknown delivery must retain reservations (P1)

Architecture decision: keep an unconfirmed ambiguous attempt **`in_flight`**, with a visible pending-reconciliation result and audit/event detail. A provider search miss, bounded search window, stripped reconciliation handle or lookup failure is not proof of non-delivery. Do not mark such an attempt failed/aborted, restore its draft to approved, or release its contact/company-slot dedup or original attempt-day/domain cap accounting.

Add a distinct local `SendOutcome` pending-reconciliation variant (for example `status: 'pending_reconciliation'` with attempt ID/detail) and update B-owned CLI/callers/tests to report uncertainty honestly. Preserve existing successful/refused/definite-failure branches. Existing in-flight recovery must remain a **no-send** path and allow a later successful provider lookup to resolve the same attempt. No automatic timeout/age/search-miss transition may free its reservation. No new operator command that guesses non-delivery is authorized.

Acceptance:

- Reproduce `preservesOutreachRef:false` plus ambiguous provider delivery. An initial modeled delivery and repeated same-key recovery produce exactly one provider call/delivery; the attempt remains reservation-bearing and visibly unresolved.
- A newly individually approved draft revision for the same contact/cycle and a different-contact draft reusing the same company/cycle/first-touch slot both refuse. Test database partial uniqueness directly as well as the readable gate.
- Daily/domain counters on the original attempt day continue counting the unresolved attempt; do not backdate/retimestamp attempts or convert a daily cap into an unrelated lifetime cap.
- A later successful no-send reconciliation updates the original attempt without another provider send or reopening a stopped draft. Distinguish genuine definite provider refusal from ambiguity.
- R-B's note about `markFailed` overwriting a concurrent stop was **an unverified hypothesis**, not a sixth confirmed finding. While changing these failure paths, preserve stop/revocation states; report any newly demonstrated defect separately with its regression rather than asserting the hypothesis was proven by the prior review.

## RB-3 — Unambiguous inbound attribution (P1)

Matching must gather relevant evidence rather than returning the first row. Normalize header names and human sender addresses using existing address rules, retaining plus-address distinctions. A human sender must be consistent with the selected contact; daemon DSNs need their own original-message/recipient evidence and must not require the daemon address to equal the recipient.

Resolve exact In-Reply-To/References/provider/client RFC IDs and appropriate DSN original-ID quotes before weak thread fallback. Multiple references within one genuine contact/conversation can be normal history; conflicts across different contacts/conversations cannot be resolved by first-row order. A weak shared thread cannot override contradictory stronger DSN/header identity. Duplicate/merged thread IDs are not unique contact identifiers.

Agreed fail-closed interface: conflicting known candidates produce an explicit auditable **ambiguous/unresolved** match outcome, separate from ordinary unrelated/unmatched mail. Do not suppress, retire or mutate the wrong contact/conversation. Add a local detailed match result if necessary, preserving compatibility where safe; document actual exported signatures for integration.

Propagate unresolved potentially stopping mail through `syncInbox`/pre-send as incomplete coverage with a useful review blocker and resumable checkpoint. Do not label it complete and send to an unsuppressed candidate merely because attribution was skipped. Retain enough bounded provider identity/reason information to review/retry; do not invent a resolved fact or auto-clear the conflict. Ordinary unrelated mail must not become a blanket ambiguity blocker.

Acceptance:

- R-B's two-contact shared-thread opt-out fixture selects B when its sender uniquely and consistently identifies B; A stays active. If available evidence genuinely conflicts, quarantine and block coverage rather than choosing A.
- In-Reply-To A plus References B across distinct contacts is explicit ambiguity, not arbitrary suppression. Test pre-send propagation so the unresolved stop cannot license a new send.
- Conflicting DSN/thread identities cannot let the weak thread win. Unique valid DSN attribution, ordinary human sender/thread replies, rewritten IDs and same-conversation References history still work.
- Include mismatched human sender, mixed-case headers and plus-address distinctions; confirm repeat/concurrent ambiguous ingestion stays auditable without duplicate irreversible facts. Existing duplicate outcome/rollback/strong-stop tests remain meaningful.

## RB-4 — Soft bounce is a conversation stop (P1)

Include `soft_bounce` in the send-time lead/conversation stop gate. A separately individually approved manual follow-up (`touchNumber:2`) and another revision cannot continue the stopped conversation merely because the contact is active. Return the existing appropriate stop reason. Keep soft bounce free of permanent address suppression; do not automate retries or follow-ups.

Test normal first touch, ingested 4.x.x DSN, separately approved follow-up, zero additional provider sends and zero permanent suppression. Preserve hard-bounce, reply, opt-out, wrong-contact, application-submitted and user-pause stops.

## RB-5 — Auto-Submitted keyword parsing (P2)

Parse/normalize the keyword under the referenced RFC 3834 grammar, including valid whitespace/comments around the keyword before parameters, before comparing with `no`. Whole-header trim followed by splitting leaves `no ` and hides a human opt-out. Keep case-insensitive header handling and automatic-response protection; do not discard the header to make stop tests pass.

Add human-stop cases for `no`, `no ; extension=value`, leading/trailing/folded whitespace and valid comments/parameters, plus genuine automatic values under the same forms. Use the actual classifier/ingestion paths where appropriate. Document malformed-header handling; do not silently treat valid `no` as automatic.

## Checks and required report

Use only **`outreach_test_joboss_b`**, with process-only test URL, normal shared live-exclusion/actual-identity guard, B configuration and serial test execution. Deploy immutable migrations normally if needed; no live/other-worker targets, reset, db push, constraint removal or guard bypass. Outbound HTTP remains mocked/disabled. Do not run actual inbox/send commands, `tools/send-test.ts`, OAuth/auth probes, paid inference or real mailbox calls.

Run the existing eight-file delivery config plus all new focused regressions. Preserve the eight original paths listed in R-B's report, including send-attempt-index coverage; if counts/assertions change explain why. Add deterministic independent-connection PostgreSQL race probes for the demonstrated gaps, not mocked gate verdicts or test-only implementations.

Run lint, network guard, schema validation, whitespace and backend/UI typechecking separately; retain strict checking and classify the same three D-owned errors without editing them. Preserve applied migration checksums and all protected indexes. Compare live baseline only via read-only transactions: 57 protected drafts/all captured fields, 11 index definitions, zero attempts/live JOBOSS migrations and unchanged flags/stage.

Save `docs/JOBOSS-B-CORRECTIONS-01-REPORT.md`, return it labeled **B — Inbox and delivery corrections 01 report**, then yield for targeted R-B re-review. Required report:

- RB-1..RB-5 fix → executed regression → actual result mapping and changed files.
- Exact reservation/revocation ordering, pending-reconciliation state/caller contract, detailed match/coverage-blocking interface and any D/E compatibility notes.
- Commands/checks actually executed with file/test counts, outcomes, skipped/blocked checks and relevant synthetic output evidence. Do not substitute the original 114 for a new run.
- Preserved existing behavior, migration/live baseline evidence, unresolved provider/D/integration limits and any bounded shared request.

₹0 additional spending. No live writes/migrations, outreach, sending enablement, approval of stored live drafts, stage/credential changes, commits/resets, unowned cleanup or agents. Do not claim overall JOBOSS, automatic runtime isolation, preparation/cohort or pilot completion.
