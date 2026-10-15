# B — Delivery corrections 02: remaining RB-3 attribution

Continue in the original **B — Inbox/delivery** chat. This is the sole active builder assignment. All other chats are idle; no agents or messages to other chats. R-B has yielded its files.

## Objective and accepted boundary

Fix only **RB-3a and RB-3b** from `docs/JOBOSS-B-CORRECTIONS-01-REVIEW.md`, then yield for targeted R-B review. Read that review, your corrections-01 report, current matching/header/sync code and relevant tests before editing. Retained independent probes, if present: `/tmp/joboss-rb-c01-at4347/attribution.mjs` and `attribution.log`; inspect before using as evidence or executing anything.

R-B independently passed 154 tests across nine files and closed RB-1, RB-2, RB-4, RB-5 and the stop-preserving definite-failure regression. Those findings stay closed unless a concrete new regression appears. Preserve atomic approval/revocation ordering, pending in-flight reservations/caps/dedup, soft-bounce stops and the accepted Auto-Submitted parser. No foundation/delivery rewrite or provider research is requested.

Architecture decision: use the existing explicit **unresolved → auditable → incomplete/resumable coverage** path for attribution that cannot be established. A bounded conservative refusal is sufficient; no general RFC mailbox/MIME parser replacement is required. Do not invent a recipient/status association or silently treat relevant ambiguous mail as unrelated.

## Ownership and interfaces

Own only:

- `src/outreach/mail/headers.ts`: the single-mailbox `senderAddress` parser and directly necessary private parsing helpers. Keep the closed Auto-Submitted behavior unchanged.
- `src/outreach/send/ingest-outcomes.ts`: detailed matching/DSN-consistency validation and directly necessary pre-outcome guards.
- A narrowly scoped new local DSN-evidence helper under `src/outreach/mail/` if needed; no new dependency.
- Delivery-specific tests for the two fixes and your new report. The existing delivery config discovers new delivery tests automatically; shared setup/config changes are not expected.

Preserve the current `DetailedMatch`/`IngestResult` contracts: matched, ordinary unmatched and explicit unresolved with bounded candidate IDs, null reason code and suppressed:false. The existing unresolved audit/checkpoint/pre-send behavior should carry the new refusals without interface changes. If a small sync/classifier change is genuinely necessary, report the concrete requirement to the orchestrator rather than editing outside this assignment.

Do not edit approval/reservation/send/gate/counters, core/schema/migrations/configuration/task registry, contacts/drafts, UI/package files or other workers' documents. In particular do not fix D's three backend errors or enable subscription execution. Preserve all current staged/unstaged work and reports; no staging, commit, reset or cleanup.

## RB-3a — Multiple From mailboxes must not collapse to the last address

Exact confirmed case:

```text
other@outside.example, Person B <owner+b@owned.example>
```

The current angle regex accepts everything before `<...>` as display text. Both message.from and headers.From can discard the first mailbox identically, so comparing their parsed values does not establish a single sender.

Required behavior:

- Accept only one supported, unambiguous mailbox. Detect additional **unquoted** list/mailbox material outside that mailbox; reject malformed or unsupported forms instead of extracting a convenient final angle address.
- Preserve valid quoted display-name commas, ordinary bare/angle forms, case/outer-whitespace normalization and distinct plus addresses. Handle quotes/escapes consistently; do not solve the bug by rejecting every comma including a valid quoted display name.
- For mail tied to a known conversation, unsupported/multiple From forms return unresolved before any Reply/OptOut/Bounce/suppression or conversation mutation. Keep one bounded unresolved audit under repeats/concurrency, and incomplete/resumable sync/pre-send coverage.
- Independently supplied From header disagreement remains unresolved. Unrelated mail with no known conversation remains ordinary unmatched under the existing contract.

Required regression: two normally sent synthetic recipients A/B with shared thread; this exact mixed bare/angle list in both From representations; stop body. Parser must refuse the single-sender claim, detailed match/ingestion must be unresolved, both contacts/drafts remain unchanged, no irreversible outcome/suppression is written, sync/pre-send cannot report complete or call send. Include reverse/angle-list variants and a valid `"Last, First" <owner+b@owned.example>` positive control.

## RB-3b — Keep all DSN recipient evidence; never borrow another recipient's status

Exact confirmed DSN: exact known B original Message-ID plus blocks in this order:

```text
Final-Recipient: rfc822; unknown@outside.example
Action: failed
Status: 5.1.1

Final-Recipient: rfc822; owner+b@owned.example
Action: delivered
Status: 2.0.0
```

Current matching retains only addresses that map to known attempts when checking conflict, then the global first-status classifier applies the unknown recipient's failure to B.

Required behavior:

- Retain **all explicit recipient evidence**, including unknown/unmapped and unreadable fields, when deciding if a DSN is consistent with a known contact. Do not make unknown/conflicting recipients disappear through a database lookup or parse filter.
- Any status/action consumed as a bounce must be attributable to that same recipient. If the flattened DSN cannot establish this, return unresolved **before** the existing whole-body classifier writes an outcome.
- For this pass, conservatively quarantine mixed/multiple-recipient or conflicting/unbindable outcome blocks associated with a known conversation. This avoids needing a broad MIME redesign. Repeated references to one recipient are not proof that contradictory statuses/actions belong together; ambiguous block/status association must remain unresolved.
- Unknown-only unrelated DSNs stay distinct from conflicts involving known candidates. Preserve normal unambiguous single-recipient hard/soft DSNs, strong original-ID precedence over a weak thread, recipient-only known DSNs, same-conversation history and existing two-known-contact conflicts. An exact B message ID alone cannot override contradictory explicit recipient/outcome evidence.

Required regression: exact fixture above through detailed matching, actual ingestion and sync/pre-send. B must stay active, draft transport/stop state unchanged, zero Bounce/Reply/OptOut/suppression facts, bounded unresolved audit, incomplete/replayable page, zero new sends. Reverse block order and swap which recipient has failed/delivered; outcome must not depend on the first status in the body. Include known-plus-unknown and two-known conflicts, repeated/ambiguous recipient-block cases, plus positive known single-recipient 4.x.x/5.x.x fixtures so valid attribution is retained. Do not reclassify the mixed case as ordinary unmatched, human reply or automatic success.

## Verification and report

Only synthetic fixtures on **outreach_test_joboss_b**, explicit process-only test URL, existing shared live-exclusion/actual-identity checks, normal immutable migration deployment and delivery Vitest configuration. Run tests serially with outbound HTTP refused and fake providers. No db push/reset, dropped constraints, guard bypass, other worker/common/live fixture targets or dependency/package changes.

Run all existing nine-file/154-test delivery selection plus new regressions; actual counts may increase. Preserve the prior tests and their substantive assertions, especially already closed RB-1/RB-2/RB-4/RB-5 and stop-preserving failure checks. Run lint, network guard, schema validation, whitespace and backend/UI checking separately with incremental writes disabled. Keep the three pre-existing D errors tracked without editing them.

Confirm schema/migration/index/flag files unchanged. Protected live comparison, if performed, must be read-only against the existing 57-draft/11-index baseline with zero attempts/live JOBOSS migrations. No real inbox/send/OAuth/auth/model operations, outreach, live approval/write/deployment, sending enablement, paid services, staging, commits or agents.

Save `docs/JOBOSS-B-CORRECTIONS-02-REPORT.md`, return it labeled **B — Inbox and delivery corrections 02 report**, then yield. Include:

- RB-3a/RB-3b fix → executed parser/matcher/ingestion/coverage regression → actual results and output counts.
- Exact changed files, supported sender/DSN syntax and conservative unresolved boundaries; existing interfaces preserved or any necessary bounded request.
- Actual commands/checks/file-test counts, failed/skipped/blocked checks, migration/live preservation evidence and unresolved D/provider/runtime limits.
- Confirmation the four closed findings and failure-stop regression stayed intact. No overall delivery/JOBOSS/pilot claim before independent review.

R-B will independently recheck these two attribution cases and preservation. Avoid repeating unrelated implementation or research work.
