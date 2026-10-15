# R-B — Inbox and delivery independent review

Start a fresh local chat in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`, named **R-B — Inbox/delivery review**. This is an independent review of B's yielded implementation. Work directly without spawning agents or messaging other chats. Return findings to the human/orchestrator.

## Objective and acceptance boundary

Verify B's inbox/delivery behavior against its assignment and actual code/output. B reports 114 tests passed across eight files; independently reproduce the result rather than treating the report as acceptance. Decide whether delivery implementation is accepted, requires bounded corrections, or has verification blocked.

Read `docs/JOBOSS-WORKER-02-DELIVERY.md`, `docs/JOBOSS-B-DELIVERY-REPORT.md`, current delivery source/tests, the settled delivery requirements in `/Users/aryamanjaiswal/Downloads/PLAN.md`, and the latest coordination entries. Older documentation is historical when it conflicts with the current plan. Foundation corrections-02 introduced an explicit automatic-execution block and safer shared test setup; do not reopen A's entire review here.

Scope is mocked inbox/send behavior, invariants and interfaces. Do not claim overall JOBOSS, real Gmail behavior, integrated preparation, cohort quality or pilot readiness. D's final @5 readiness validator and integration remain outstanding; verify the delivery seam fails closed while absent. No actual outreach or live mailbox verification is authorized.

## Ownership, dependencies and parallel safety

Application, tests, schema, migration and configuration files are read-only. Inspect:

- `src/outreach/mail/gmail.ts`, `fake.ts` and related mail interfaces/helpers.
- `src/outreach/inbox/contracts.ts`, `sync.ts`.
- `src/outreach/send/ingest-outcomes.ts`, `classify-outcome.ts`, `counters.ts`, `send.ts`, `gate.ts` and their callers.
- `tools/run-inbox.ts`, `tools/run-send.ts`.
- `test/delivery/**` and the existing tests included by its Vitest configuration.

Write only `docs/JOBOSS-B-DELIVERY-REVIEW.md`. Temporary supplemental reproductions may use newly owned temporary files and synthetic fixtures on B's target; do not modify tracked tests or other reports.

The human explicitly authorized **R-A and R-B reviews in parallel**, maximum two active worker/reviewer chats. R-A owns review fixtures on `outreach_test_joboss_ra`; you exclusively use **`outreach_test_joboss_b`** while B is idle. Do not touch R-A/A/common/other worker targets. Root remains the prompt/report coordinator; no automatic agent dispatch. Builders stay idle until both review reports return and the coordinator assigns corrections.

Use the existing `test/delivery/vitest.config.ts`, B helper and normal shared guarded global/setup files. Validate the selected local B target and independent live identity before any migrate/fixture/truncate write, then verify the actual connection. Inspect both B-specific and shared guards rather than relying on a database name alone. The existing B target may receive pending immutable repository migrations through normal `prisma migrate deploy` only. Never use `db push`, reset, constraint drops, guard bypasses or edits to `.env`/package/configuration. If safe verification cannot run, report that exact blocker.

Do not generate Prisma artifacts, install dependencies, edit shared source or run tests against another chat's database while R-A is reviewing. Use non-incremental typechecking to avoid shared build-cache writes. Both reviews may read shared source and perform live baseline comparisons only in read-only transactions.

## Required behavior and independent probes

### 1. Complete, resumable inbox coverage

Verify >50 messages across pages and a stop response on a later page. Inspect all-received-mail coverage including spam/trash and the distinction between complete coverage and diagnostic `--days` queries. Later-page failures, malformed/truncated responses or messages, missing bodies/attachments, pagination loops, message/page caps and corrupt/mismatched checkpoints must produce incomplete coverage, never a successful empty scan.

Check partial-page replay and checkpoint resumption are safe and do not duplicate outcomes. A completed scan must begin fresh on the next invocation. After draining a resumed scan, pre-send must require fresh complete coverage so a newly arrived first-page opt-out is ingested. Check checkpoint mailbox/scope identity, concurrent scans and error paths for actual consequences. Treat untested hypotheses as such; expired cursors and bounded coverage are acknowledged limitations when they fail closed and remain visible.

### 2. Atomic outcomes, suppression and classification

Reproduce repeated and concurrent ingestion of the same provider message for hard/soft bounces and opt-outs. Require a single outcome identity/audit and atomic commit of outcome, suppression, contact retirement and draft/lead/attempt transitions; induce a failure to establish rollback. Check different inbound messages racing on the same conversation preserve stronger stops where the implementation claims that behavior.

Hard bounce, opt-out and wrong-contact must suppress the address; soft bounce and human reply stop the conversation without permanent suppression; automatic replies leave conversation state unchanged. Check case-insensitive automatic headers, parameters/whitespace, multipart/attachment-backed DSNs, manual wrong-contact handling and legacy unclassified outcomes. Useful human replies, automatic replies, wrong-contact/opt-out and unclassified records must be separate; unavailable referral/interview/reputation signals must not appear measured.

### 3. Provider identity and at-most-once recovery

Verify the actual stored RFC Message-ID is persisted separately from the client-derived ID after send/reconciliation, with missing values kept null. Test rewritten IDs, absent/broken thread association, In-Reply-To/References and DSN quote matching, while retaining stable X-Outreach-Ref reconciliation. Inspect matching for cross-contact/conversation ambiguity rather than assuming a thread/header is conclusive.

Provider success followed by malformed response, failed metadata retrieval, timeout or a crash must retain an honest ambiguous outcome and reconcile without another send. Existing in-flight, sent or terminal attempts must never cause a second provider send under the same key. Confirm recording sent metadata cannot reopen an outcome-stopped draft.

### 4. Pre-send safety and readiness contract

Incomplete ingestion must refuse before attempt reservation/provider send. Disabled sending must avoid inbox access. Offline list/dry checks must explicitly say inbox coverage is unchecked and cannot establish live readiness. Reconciliation remains a separate no-send operation.

Reproduce individual approval/hash mutation during ingestion, suppression, stale evidence, dedup and concurrent gate/reservation behavior. Preserve per-contact/company-slot partial uniqueness and the 5/10/20 caps, including in-flight reservations, without automatic escalation. Confirm approval is for the exact recipient and draft content and follow-ups remain manual.

For `outreach_draft@5`, absence or rejection of the owner-supplied readiness callback must refuse. A supplied callback must receive the transaction-compatible database client and current draft/time; all other approval/suppression/freshness/cap/dedup gates remain enforced. Review the seam, not a fabricated substitute for D's future substantive validator.

## Shared interfaces and tracked integration limits

- A has already added `ProviderMessageRef.rfc822MessageId?: string | null`; verify structural compatibility with B's additive local contract.
- D owns `SendGateOptions.evaluateOutreachReadiness(db, draftId, now): Promise<{ready:boolean;detail:string}>`, with a transaction-compatible client and no network. Integration must wire D's final implementation into `tools/run-send.ts`. Its absence is a known integration block, not permission to weaken the gate.
- The optional precise incomplete-ingestion reason code remains deferred. Existing `weak_evidence` plus explicit detail and `send.inbox_incomplete` audit may be assessed for correctness without requiring schema/registry work in this review.
- Three existing backend optional-`contactId` errors in `compose.ts`/`queue-draft.ts` remain D-owned. Do not fix them or disable strict checking.
- Full provider/runtime isolation remains unverified; automatic subscription task execution is blocked independently of this delivery review.

## Verification and evidence

Run the delivery config serially with process-only `TEST_DATABASE_URL` selecting B's dedicated target, leaving independently captured live configuration intact. Keep normal HTTP mocking/net-connect refusal. B's report includes a credential-free invocation shape; never print credentials or connection strings. The expected selection is:

```text
test/delivery/gmail-pagination.test.ts
test/delivery/inbox-delivery.test.ts
test/delivery/caps.test.ts
test/policy/outcome-ingestion.test.ts
test/policy/send-gate.test.ts
test/policy/owned-inbox.test.ts
test/unit/classify-outcome.test.ts
test/integration/send-attempt-indexes.test.ts
```

Report actual counts/results and any supplemental probes. Run lint, network guard, schema validation, whitespace check and backend/UI typechecking separately with incremental writes disabled where applicable. No full suite is required for this bounded review. Record skipped/blocked checks honestly.

Verify all currently applied B-target migration checksums match repository SQL and the contact/company-slot send indexes remain enforced. B originally had 12 migrations; current shared source includes a subsequent uniqueness migration, so record actual current deployment rather than assuming a stale count. Do not rewrite any applied SQL.

If accessible, compare live state solely using `BEGIN READ ONLY`/`ROLLBACK` against `scratch/joboss-baseline-20261014/protected-state.json`: 57 protected drafts and fields, 11 protected index definitions, zero send attempts and zero completed live JOBOSS migrations. Confirm stage/sending flags remain unchanged. No real inbox/send CLI, `tools/send-test.ts`, live mailbox/OAuth action, approval, sending enablement, external communication, paid service, commit or reset.

## Required report

Save and return **R-B — Inbox and delivery review report** at `docs/JOBOSS-B-DELIVERY-REVIEW.md`, then yield. Include:

1. Scoped verdict and explicit remaining D/integration/provider limitations.
2. Confirmed actionable findings with priority, absolute file/line, reproduction, practical effect and bounded correction/ownership request. Separate hypotheses and historical documentation from defects.
3. Acceptance evidence for pagination/resume, atomic/idempotent outcomes, identity/reconciliation, approval/suppression/caps/dedup and @5 fail-closed behavior.
4. Checks actually executed, exact results/counts, actual mocked outputs, blocked/skipped checks and preservation evidence.
5. Final interface dependencies and what may proceed safely.

Review only. Do not implement findings or start a follow-up assignment. Return the report here through the human so corrections can be coordinated with A's review without overlapping edits.
