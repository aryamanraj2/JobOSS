# R-B — Inbox and delivery corrections 01 re-review report

15 October 2026 (Asia/Kolkata). Targeted independent re-review of `JOBOSS-REVIEW-B-CORRECTIONS-01.md`, B’s corrections assignment/report, current changes/new files, relevant callers and tests, prior R-B evidence, and latest coordination entries. Work performed directly without agents or messages to other chats.

## Scoped verdict

**Bounded corrections still required: RB-3 reopened. RB-1, RB-2, RB-4 and RB-5 closed within mocked-provider/local-PostgreSQL scope.** The stop-preserving definite-failure regression also passes independently.

The required suite independently passed **154/154 tests across nine files**. Three newly owned supplemental scripts then exercised actual reservation/revocation ordering, uncertainty/constraints/failure handling and attribution/classification. Those probes confirmed two remaining RB-3 defects that the suite does not cover. Neither is a hypothetical provider behavior claim: both produced irreversible synthetic outcomes and incorrectly complete scans through the current ingestion/sync implementation.

Retain the passing corrections and previous positive pagination, replay, atomic duplicate-ingestion, counter, ordinary reconciliation, cap and readiness-seam evidence. No broad foundation or delivery redesign is requested. Delivery as a whole is not accepted yet.

D’s substantive `@5` readiness validator, CLI integration and three backend typing errors remain separate pending work. Real Gmail, authenticated mailbox identity, runtime isolation, integrated preparation/cohort quality, pilot readiness and overall JOBOSS are not accepted by this review. The foundation automatic-execution block/manual interface remains in force.

## Confirmed remaining RB-3 findings

### RB-3a — P1: a multiple-mailbox From value is reduced to its final angle address

Location: [headers.ts:15](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/mail/headers.ts:15), consumed by [ingest-outcomes.ts:118](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:118).

Reproduction, retained in `/tmp/joboss-rb-c01-at4347/attribution.mjs`:

1. Normally send two synthetic individually approved drafts to `owner+a@owned.example` and `owner+b@owned.example`; assign their attempts the same thread ID.
2. Ingest `Please stop emailing me` on that shared thread with both `message.from` and `headers.From` set to `other@outside.example, Person B <owner+b@owned.example>`.
3. Run `syncInbox` on the same message.

Actual output: `senderAddress` returned **`owner+b@owned.example`**; detailed match returned **matched**; ingestion returned **opt_out** selecting B. A stayed active, B became suppressed, suppression count **1**, and sync returned **`complete:true, scanned:1, matched:1`**.

The angle-address regex allows the entire preceding mailbox/list as a display-name prefix. Matching the separately supplied From header does not help because both parses discard the same first mailbox. Other multiple-mailbox shapes are rejected, so behavior depends on formatting rather than the single-mailbox requirement.

Effect: ambiguous authorship can trigger a permanent suppression without an unresolved audit/coverage blocker. This contradicts the correction packet’s explicit unreadable/multiple-mailbox boundary and B’s documented conservative parser contract.

Bounded correction request, B: reject additional unquoted mailbox/list material outside the one accepted mailbox, preserving valid quoted display-name commas, case normalization and plus distinctions. Unsupported/multiple forms related to a known conversation must return unresolved before outcome mutation, remain auditable and keep coverage incomplete. Add this exact mixed bare/angle-list case through parsing, ingestion and sync; a general RFC mailbox parser rewrite is not required.

### RB-3b — P1: mixed-recipient DSN status can suppress a contact reported as delivered

Location: [ingest-outcomes.ts:93](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:93), [ingest-outcomes.ts:103](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:103), [ingest-outcomes.ts:113](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:113); downstream first-status classification at [classify-outcome.ts:79](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/classify-outcome.ts:79).

Reproduction: normally send a synthetic draft to `owner+b@owned.example`. Ingest a postmaster DSN containing its exact stored original Message-ID and these recipient blocks, in order:

```text
Final-Recipient: rfc822; unknown@outside.example
Action: failed
Status: 5.1.1

Final-Recipient: rfc822; owner+b@owned.example
Action: delivered
Status: 2.0.0
```

Actual output: detailed match **matched B**; ingestion returned **`bounce / hard_bounce / suppressed:true`**; B’s draft became **bounced_hard**, contact **suppressed**, suppression count **1**. Sync returned **`complete:true, scanned:1, matched:1`**.

Only recipient addresses that already map to SendAttempts participate in the conflict check. The unknown recipient disappears from `recipientCandidates`; finding B among the remaining addresses is treated as consistency. The downstream classifier then uses the first status anywhere in the flattened body, applying the unknown recipient’s failure to B despite B’s delivered block.

Effect: contradictory DSN evidence produces an irreversible fact against the wrong recipient/status, without blocking coverage. The first-status classifier predates this correction; the newly demonstrated acceptance gap is the current detailed matcher allowing this mixed evidence through as unambiguous.

Bounded correction request, B: retain all explicit recipient evidence when assessing consistency and bind any consumed status to the attributed recipient. If that cannot be established, quarantine as unresolved before writing a bounce/suppression and keep the page resumable/incomplete. Conservatively refusing mixed/conflicting DSNs is sufficient for this correction; no broad MIME redesign is required. Add this known-plus-unknown mixed-status fixture, alongside the existing two-known-contact conflict cases.

## RB-1 through RB-5 disposition and execution evidence

### RB-1 — Closed

Source review confirms pre-gate snapshot capture, actual plan comparison with the locked snapshot, second frozen-hash verification, conditional approved→sending transition, and attempt creation in one transaction before transport. Snapshot comparison covers the draft/contact/resume/lead and selected profile rows; the plan comparison additionally prevents an intermediate recipient/body plan from surviving a change-and-restore interleaving. Revocation locks the same draft and commits clearing/audit atomically.

Independently executed separate-client PostgreSQL probes:

- **Revoke-first:** paused after hash validation at the first send-attempt count. The independent revoker succeeded; send refused `approval_hash_mismatch`; **0 provider calls, 0 attempts, 1 revocation audit**.
- **Reservation-first:** paused after attempt creation while its transaction retained the draft lock. Observed **1 actual PostgreSQL lock waiter** from the independent revoker, then released the holder. Send returned sent; revocation refused **send_attempted**; **1 provider call**. The blocked revoker was not awaited before releasing the sender.
- **Changed-and-restored recipient:** a second client changed the contact before the gate read, then restored address and timestamp before final verification. The actual intermediate plan was refused; **0 calls/attempts**, frozen hash preserved. Required tests independently rerun here also passed body/hash/recipient mutation and both body/recipient change-and-restore variants.
- **Attempt-write fault:** transition rolled back to approved with no attempt/call. An invocation inside an outer transaction refused before transport with the standalone-client detail.
- **Revocation audit fault:** injected audit failure rolled back approval clearing; draft remained approved with identical hash and zero revocation audit rows.

Required unchanged four-way concurrent send regression still produced one reservation/send. No approval/hash algorithm change was found outside the narrowly authorized revocation extension.

### RB-2 — Closed; stop-preserving failure regression passes

Independent stripped-handle modeled delivery returned **pending_reconciliation**, as did same-key retry, lookup failure and two concurrent no-send recovery misses. Attempt remained **in_flight** with unchanged original time. Original-day count **1**, original-day/domain count **1**, next-day count **0**.

A new approved revision refused **duplicate_contact**; a different-contact revision in the same company/cycle/slot refused **duplicate_company**. Direct inserts against both protected reservations failed **P2002**. Later successful lookup resolved the original attempt with the actual provider RFC ID, unchanged attempt time and **one total provider call/delivery**. An already opted-out draft remained opted_out.

Independent definite-refusal probe committed a real synthetic opt-out during the provider call and then threw a definite 400: result/attempt **failed**, draft **opted_out**, reason **opt_out**, suppression count **1**. A separate ordinary definite refusal returned the unstopped draft to approved with approval retained and zero deliveries. This verifies current behavior without replaying B’s old transpiled source or misattributing B’s historical reproduction to the original review.

The current pending path does not mutate status/time; concurrent misses did not release capacity or issue transport calls. CLI source handles pending results in both send/reconciliation branches, warns that uncertainty retains reservations and sets exit status **2**. No real CLI was executed. Bounded provider search/missing handles remain uncertainty rather than failure; live provider completeness remains unverified.

### RB-3 — Reopened, with substantial positive evidence retained

Independently confirmed:

- Normal shared-thread sender B selected B; A stayed active and B was suppressed once.
- Conflicting exact IDs across contacts returned unresolved. **Four concurrent ingestions plus a repeat** produced **one unresolved audit, zero suppressions**. Sync returned incomplete; replay returned incomplete with `resumed:true`; pre-send refused before any provider call. Current page stayed replayable.
- Strong B DSN ID beat unrelated weak A thread. A known contradictory recipient, and a sole unknown contradictory recipient, both returned unresolved.
- Ordinary unrelated mail remained unmatched. A different plus address remained unresolved rather than being folded into the recipient.
- Required tests retained same-conversation References history, rewritten IDs, valid human thread matching, recipient-only DSNs, mixed-case headers, sender mismatch, duplicate rollback and strongest-stop ordering.

However, RB-3a/b above bypass the intended unresolved branch. Therefore incomplete-coverage propagation is accepted only when matching actually returns unresolved, not for all required ambiguous inputs.

Audits bound candidate IDs to 50 and sender/thread strings to 200 characters; checkpoint error identity is sliced to 200. Compatibility `matchSendAttempt` maps unresolved to null, but current production ingestion uses the detailed result and sync consumes `IngestResult`; no production coverage caller was found using compatibility null to discard the unresolved branch.

### RB-4 — Closed

Independent actual 4.1.1 ingestion after a first touch, followed by a separately individually approved revision: both touch **1** and manual touch **2** refused **soft_bounce**. Total provider calls stayed **1**; permanent suppressions **0**; contact remained active. Existing other stop-state tests remained green.

### RB-5 — Closed within documented keyword/CFWS parser scope

Independent human forms included `no ; extension=value`, leading/trailing tabs/spaces, folded whitespace, nested comments, quoted-pair escapes and a quoted parameter containing a semicolon. All returned **opt_out**. Genuine auto-replied/auto-generated forms returned **auto_reply**. Malformed unfinished-comment input produced unresolved ingestion, **incomplete sync and zero suppression**; a valid comment/parameter stop then suppressed through real ingestion.

Required tests also passed all **8 human forms, 5 automatic forms and 5 malformed forms**, plus actual ingestion/sync. Parameters do not alter keyword meaning and are not generally MIME-validated by this helper; this documented scope is not treated as a new defect. Header/sender parsing does not authenticate the sender.

## Required checks actually executed

Invocation: loaded configuration without printing it; changed only process `TEST_DATABASE_URL` pathname to `/outreach_test_joboss_b`; retained independently configured live identity. Ran shared `configuredTestTarget` and read-only `verifyTestTarget` before launching the existing delivery config with the local Vitest binary. Normal shared migration/setup guards and MockAgent outbound-net refusal remained active. Files ran serially.

```text
vitest run --config test/delivery/vitest.config.ts --reporter=verbose
Test Files  9 passed (9)
Tests       154 passed (154)
Duration    11.10s
Exit        0
```

| File | Passed tests |
|---|---:|
| `test/delivery/corrections-01.test.ts` | 40 |
| `test/delivery/gmail-pagination.test.ts` | 19 |
| `test/delivery/inbox-delivery.test.ts` | 16 |
| `test/delivery/caps.test.ts` | 4 |
| `test/policy/outcome-ingestion.test.ts` | 13 |
| `test/policy/send-gate.test.ts` | 27 |
| `test/policy/owned-inbox.test.ts` | 13 |
| `test/unit/classify-outcome.test.ts` | 12 |
| `test/integration/send-attempt-indexes.test.ts` | 10 |

The original **114 tests remain**. Inspected both sender-fixture adjustments: they align the human sender with the actual fixture recipient; assertions for outcomes, idempotency, rollback and counters remain. The changed header-stripping expectation strengthens uncertainty handling by requiring pending/in_flight. The renamed definite-refusal test still exercises actual rejection. No original test was removed.

Pagination >50, later-page/attachment/malformed-body failures, loop/caps, partial replay/resumed fresh scan, duplicate outcome rollback, separate counters, ingestion-time approval mutation, suppression, caps/breakers, rewritten IDs, crash recovery and absent/rejected `@5` all passed again. Independent `@5` probe returned the missing-validator refusal and a supplied rejection; callback transaction witness read its marker **inside=1/outside=0**, received current draft ID/Date, and produced **0 calls/attempts**. No substitute substantive validator was accepted.

| Separate check | Actual result |
|---|---|
| `npm run lint` | Exit 0 |
| `npm run check:no-raw-http` | Exit 0; clean, only approved raw-client network boundary |
| `npx prisma validate` | Exit 0; schema valid |
| `git diff --check` | Exit 0 |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit 2; exactly the three pre-existing D-owned TS2379 errors |
| `npx tsc --noEmit --incremental false` | Exit 0, independently executed UI check |
| Three guarded supplemental scripts | Each exit 0; assertion of a demonstrated bad result is evidence of a defect, not an additional passing product test |

Backend diagnostics remain `compose.ts:590:115`, `queue-draft.ts:223:76` and `queue-draft.ts:223:267`, optional `contactId`/undefined under exact optional property types. No correction-owned diagnostic appeared.

The reported pg concurrent-query deprecation warning was independently observed in three suite workers and supplemental concurrency runs. It did not fail queries/assertions or compromise the separately observed PostgreSQL lock ordering/rollback/constraint evidence. Treat it as driver-upgrade compatibility debt; this review does not establish pg@9 behavior. No full suite or repeated foundation suite was required/run.

## Preservation and verification limits

B’s updated helper/config directly use the shared local-target/live-name exclusion guards. The helper also verifies the actual connection before truncation. Supplemental scripts use the same guard/identity probe and B helper; all their HTTP transport is refused by MockAgent and provider actions are fake. Only **outreach_test_joboss_b** received synthetic approvals, truncations, outcomes, attempts or other fixture writes. Other worker/common fixture targets were not accessed.

Read-only B inspection found **13 completed migrations**, all applied checksums matching repository SQL, with no rolled-back record. **All 11 protected B index definitions matched the baseline**, including contact/company-slot first-touch uniqueness on `in_flight,sent`. Normal suite setup used immutable `prisma migrate deploy`; no new migration was needed. Protected JOBOSS hashes remain:

- Preparation: `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`.
- Uniqueness: `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

Live comparison used only explicit **BEGIN READ ONLY / ROLLBACK** against `scratch/joboss-baseline-20261014/protected-state.json`: **57/57 drafts and all 14 captured fields matched; 11/11 index definitions matched; attempts 0; completed live JOBOSS migrations 0**. Milestone remained **F5** and both sending flags **false**.

Captured **396 source/test/tool/schema/UI/generated/config/document file hashes before execution**. Recheck found zero content differences before writing this new report. HEAD, staged diff and existing unstaged diff also matched their initial snapshots. No code/tests/configuration were edited, generated or installed; no staging/commit/reset or history modification occurred. Only this new report was written in the workspace, preserving earlier reports.

macOS temporarily evicted workspace and installed dependency files to cloud-only placeholders after the required suite. Read calls stalled; normal file-hydration requests restored access without logical content changes, after which all supplemental scripts and B migration verification completed. This was a temporary environment delay, not a skipped acceptance check or database/provider failure.

Retained evidence: `/tmp/joboss-rb-c01-at4347/` contains `suite.log`; newly owned `common.mjs`, `races.mjs`, `attribution.mjs`, `delivery.mjs`; their logs/JSON results; separate check logs; migration/index evidence and preservation snapshots. No credential/connection string was printed. No live mailbox/OAuth/send CLI, `tools/send-test.ts`, live approval/write/migration, sending enablement, external communication, paid service, agent or other-chat message occurred.

Expired cursors, actual mailbox identity binding, malformed/unsupported bodies, coverage ceilings and large scans remain acknowledged fail-closed availability limits. Pending attempts may remain unresolved indefinitely, while their accounting remains tied to the original day. Exhaustive schedules and real provider behavior remain outside this review; no unexecuted hypothesis is promoted to a finding.

## Interfaces and next boundary for D/E

- Reservation requires a **standalone client**; draft/related-row locks, actual-plan binding, second hash check and conditional approved→sending transition/attempt commit must precede transport. Revocation shares the draft lock and atomically clears/audits or refuses send_attempted. Preserve this contract in D-owned approval work.
- `SendOutcome` includes `{status:'pending_reconciliation',attemptId,detail}`. Miss/lookup failure retains **in_flight**, original time and dedup reservations. Recovery performs no send; CLI pending exit is **2**. Consumers must not turn pending into definite failure or release capacity.
- `matchSendAttemptDetailed` distinguishes **matched/unmatched/unresolved**; unresolved carries bounded candidate IDs, null reason code and `suppressed:false`. Ingestion audits uncertainty without outcome facts; sync must retain the replayable page and refuse completeness. Compatibility null is not a coverage result. Complete this contract for RB-3a/b before delivery acceptance.
- D’s transaction-compatible, no-network `evaluateOutreachReadiness(db,draftId,now)` remains pending and must be wired into the send CLI; absent/rejected readiness remains fail-closed. Shared RFC-ID compatibility is already satisfied. The optional precise incomplete-ingestion reason remains deferred.

Only coordinated B corrections to the two remaining attribution cases and their targeted review should proceed as delivery work. Read-only/mock verification and separately authorized preparation-side development may proceed without interpreting this report as sending or rollout approval. Return this report through the human/coordinator; no correction implementation or follow-up assignment was started.
