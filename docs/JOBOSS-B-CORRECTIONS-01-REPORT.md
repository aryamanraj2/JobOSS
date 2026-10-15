# B — Inbox and delivery corrections 01 report

15 October 2026 (Asia/Kolkata). RB-1 through RB-5 corrected within the assigned ownership and narrow revocation extension. Ready to yield for targeted independent R-B re-review. This report does not claim overall JOBOSS, automatic runtime isolation, preparation/cohort or pilot completion.

## Fix → executed regression → result

All regressions below use synthetic PostgreSQL fixtures on `outreach_test_joboss_b` and fake providers. The real gate, hash verification, reservation, revocation, ingestion and database constraints execute; gate verdicts are not mocked.

| Finding | Correction and executed regression | Actual result |
|---|---|---|
| **RB-1 — approval/reservation race** | Capture the approval/content/recipient snapshot before gate validation; lock its draft and related rows, compare again and reverify the frozen hash before a conditional approved→sending transition and attempt creation in one transaction. Real `revokeApproval` locks the same draft and commits its audit/approval clearing atomically. Pause at the first send-attempt count after hash verification; revoke or mutate through an independent Prisma connection. Exercise the opposite ordering by pausing attempt creation while a second connection attempts revocation. | Revoke-first returned success: **0 provider calls, 0 reservations**, draft composing with cleared approval. Reservation-first: PostgreSQL lock waiter observed, then revoker refused **send_attempted**, exactly **1 send**. Body/hash/recipient changes during the gate all refused; injected attempt-write failure rolled back the sending transition. Four unchanged concurrent invocations produced **1 reservation/send**, with approval hash unchanged. Nested-transaction send invocation refused before transport. |
| **RB-2 — ambiguous miss frees capacity** | Return local `pending_reconciliation`; keep uncertain attempts `in_flight` after search misses or lookup failures. Do not change draft status, attempt time or dedup predicates. Record pending audit/event details. Model a delivered send with stripped outreach reference, repeat recovery, approve another revision, approve a different contact using the company slot, and attempt direct constraint violations. Later resolve the original attempt without sending. | **1 modeled provider call/delivery** across initial send and repeated recovery; **4 pending events** before later resolution. Original-day and domain counters both **1**; next-day counter **0**, with original timestamp unchanged. Same-contact revision gate refused **duplicate_contact**; different-contact same-slot gate refused **duplicate_company**. Both direct inserts failed **P2002**. Later lookup marked the original attempt sent with no second call and preserved an already opted-out draft. Definite provider refusal remains a separate failed branch. |
| **RB-3 — first-row inbound attribution** | Detailed matching gathers provider/client RFC IDs from normalized In-Reply-To/References and body quotes; resolves stronger identity before thread fallback; checks human mailbox consistency without folding plus tags; DSNs require original-ID or explicit original/final-recipient evidence. Cross-contact/conversation conflict returns auditable `unresolved`, writes no outcome/suppression, and makes inbox coverage incomplete. | Shared-thread sender B selected **B**, leaving **A active** and suppressing B once. In-Reply-To A/References B returned unresolved; six concurrent ingestions plus repeat produced **1 unresolved audit**, **0 irreversible outcomes**, and blocked both sync and pre-send. A strong B DSN beat weak A thread; contradictory recipient evidence quarantined. Recipient-only DSN, normal human thread replies, same-conversation reference history, rewritten IDs, mixed-case headers, mismatched sender and distinct plus tags exercised. Concurrent opt-out/soft-bounce/human reply on one attempt retained the strongest opt-out stop. |
| **RB-4 — soft bounce permits follow-up** | Add `soft_bounce` to the existing send-time lead-stop gate. Send a normal first touch, ingest its 4.1.1 DSN, separately approve a revision, then try touches 1 and 2. | Both refused **soft_bounce**; total provider calls stayed **1**, permanent suppressions **0**, contact remained active. |
| **RB-5 — Auto-Submitted CFWS** | Parse the keyword with folding whitespace, nested comments and quoted-pair escapes before the parameter delimiter; normalize keyword case. Exercise eight valid human forms, five automatic forms, five malformed forms, and actual ingestion/sync. | All valid `no` forms retained **opt_out**, including `no ; extension=value`; genuine automatic keywords retained **auto_reply**. Malformed keyword/CFWS returned **unclassified**; actual ingestion surfaced it as unresolved and coverage incomplete, without suppression. Valid comment/parameter human stop suppressed through the real ingestion path. |

## Reservation/revocation contract for D/E

The database ordering point is the conditional `draft` update from **approved to sending**, under a `SELECT … FOR UPDATE` lock, committed together with the new `SendAttempt`. If attempt creation or transaction commit fails, the transition rolls back. No provider call occurs before this commit. New-send callers must supply a standalone database client; a transaction-scoped caller refuses rather than making a nested-savepoint reservation appear committed. This uses A's existing `isStandaloneDatabaseClient` helper, without editing shared code.

The pre-gate and locked post-gate snapshots compare **the complete draft row and its current contact, resume version and lead rows, plus the selected candidate profile row**. This includes approval status/hash/time/approver, subject/body/composition, recipient binding/address, resume ID/hash/link, cited evidence and approved-claim IDs, prompt/outreach case, sender identity, touch slot/revision/lead/cycle and profile reply route. The actual transport plan is also compared to that locked snapshot (draft/lead/contact/company/cycle/slot, recipient, subject/body, sender and reply route), so an intermediate read cannot escape approval even if values and timestamps are restored before revalidation. Independent-connection body/recipient change-and-restore regressions both refused. The existing hash verifier runs again under locks. The conditional mutation additionally names draft ID, approved status, hash, approval time, contact ID and `updatedAt`. A changed snapshot refuses `approval_hash_mismatch` and writes an audit; it does not restore approval, silently retry or create an attempt.

Lock order: sender's existing global cap/dedup advisory lock, then draft, contact, resume, lead and selected profile rows. Revocation takes the **same draft row lock**, checks for any attempt before reporting eligibility, conditionally clears approval and writes its existing revocation audit in the same transaction. If revocation commits first, sending observes the changed snapshot and refuses. If reservation wins, revocation waits, sees the committed attempt and refuses `send_attempted`. Approved hashes and the individual approval algorithm were not changed. D must retain this ordering and the transaction-safe readiness seam; do not replace the conditional transition with an unconditional status write.

## Pending reconciliation and inbound coverage interfaces

`SendOutcome` now also contains:

```ts
{ status: 'pending_reconciliation'; attemptId: string; detail: string }
```

Search miss, bounded-window miss, stripped handle and lookup failure are uncertainty, never proof of non-delivery. They retain existing `in_flight` status and original `attemptedAt`, keeping both partial uniqueness and original-day/domain cap accounting. Pending recovery writes `send.pending_reconciliation` and a `pending_reconciliation` delivery event. Successful recovery records actual provider IDs on the original attempt without reopening a stopped draft. No age-based release or guessed-non-delivery command was added. `tools/run-send.ts` prints the explicit unresolved result and reservation warning, setting exit status **2** for pending outcomes in both individual-send and reconciliation branches. CLI changes were inspected/typechecked, not executed against a mailbox.

`matchSendAttemptDetailed(db, message): Promise<DetailedMatch>` exports:

```ts
type MatchedAttempt = { id: string; draftId: string; contactId: string; companyId: string }
type DetailedMatch =
  | { kind: 'matched'; attempt: MatchedAttempt }
  | { kind: 'unmatched'; detail: string }
  | { kind: 'unresolved'; detail: string; candidateAttemptIds: string[];
      reasonCode: null; suppressed: false }
```

`IngestResult` is the existing `IngestedOutcome` plus unmatched/unresolved branches. The compatibility `matchSendAttempt` still returns an attempt or null, returning null for unresolved; **callers that decide coverage must use the detailed/ingestion result**, not treat compatibility null as proof of unrelated mail. `syncInbox` consumes `unresolved` as incomplete, retaining the current page cursor and a bounded provider-ID/reason blocker so replay retries attribution. An append-only `inbox.unresolved` audit stores at most 50 candidate attempt IDs, bounded sender/thread identity and reason once per immutable provider message, protected by the existing provider-message transaction lock. No Reply/Bounce/OptOut/suppression or conversation transition is written for unresolved mail. A retry re-evaluates current evidence; the conflict is not automatically cleared. Ordinary mail without a known ID/thread/DSN recipient stays unmatched and does not blanket-block unrelated messages.

Human sender comparison uses a single parsed mailbox, existing trim/lowercase normalization, and preserves dots and plus tags. If a separate From header disagrees, attribution is unresolved. Exact candidates across different `(contact, lead, campaignCycle)` conversations conflict; same-contact conversation history can legitimately identify several attempts and selects the most recent known attempt with a stable ID tie break. DSNs use original/final recipient evidence and exact IDs instead of requiring the daemon to be the recipient. Strong consistent identity can override an unrelated weak thread; conflicting strong IDs/recipients cannot.

`classifyReply` additionally exposes `unclassified` for malformed Auto-Submitted keyword/CFWS. Ingestion converts this case to unresolved, preserving coverage safety. Parser scope is the keyword and surrounding comments/folding whitespace; parameter contents do not change keyword semantics and are not a general MIME parameter validator. Unterminated comments, split tokens, bare newlines and empty/invalid keywords are unresolved rather than assumed automatic. Parsing follows [RFC 3834 §5.1–5.2](https://datatracker.ietf.org/doc/html/rfc3834#section-5.1) and its [RFC 2822 CFWS reference](https://datatracker.ietf.org/doc/html/rfc2822#section-3.2.3).

## Changed files

- `src/outreach/draft/approve.ts`: only revocation transaction/locking and directly necessary helper/import; approval/hash implementation unchanged.
- `src/outreach/send/reservation.ts` (new): snapshot, row-lock and actual-plan comparison helpers.
- `src/outreach/send/send.ts`: conditional reservation, committed-client guard, pending reconciliation and stop-preserving definite failure handling.
- `src/outreach/send/ingest-outcomes.ts`: detailed attribution, unresolved audit/result, malformed-classification blocker; uses existing shared scope helper to preserve caller transaction scope.
- `src/outreach/send/gate.ts`: soft-bounce stop only; D's missing/rejected @5 readiness behavior unchanged.
- `src/outreach/mail/headers.ts` (new): header-name normalization, single-mailbox parsing and Auto-Submitted keyword parsing.
- `src/outreach/send/classify-outcome.ts`: new parser integration and malformed-header classification.
- `src/outreach/inbox/sync.ts`: unresolved attribution blocks completeness and preserves resumability.
- `tools/run-send.ts`: pending outcome warning/exit status.
- `test/delivery/corrections-01.test.ts` (new): **40** focused regressions, including independent-connection race probes.
- `test/delivery/db.ts`, `test/delivery/vitest.config.ts`: retain exact B target, now directly use A's shared independent-live-exclusion guard and actual identity check before truncation; shared setup unchanged.
- `test/delivery/inbox-delivery.test.ts`, `test/policy/outcome-ingestion.test.ts`: human fixture senders now match the actual synthetic recipient, preserving substantive outcome/atomicity checks instead of encoding unsafe cross-sender attribution.
- `test/policy/send-gate.test.ts`: header-stripping ambiguity expects pending/in-flight instead of failed; definite-refusal test renamed to describe the branch it actually exercises. No tests removed.
- This new report. No other worker's documents were edited by B.

## Executed checks and retained evidence

Only `outreach_test_joboss_b` was used for synthetic writes/fixtures. The runner changes process-only `TEST_DATABASE_URL` to that exact pathname while preserving independently configured live identities. It calls shared `configuredTestTarget` and `verifyTestTarget` before Vitest; existing shared global/setup guards recheck the actual database before normal `prisma migrate deploy` and fixture work. B's helper now performs the same shared validation/actual-identity probe before each truncation. Undici MockAgent continues refusing outbound connections; provider tests use fakes. No temporary R-B script was modified or rerun; their source/retained outputs were inspected as prior evidence.

Final recorded focused run command:

```text
node --import tsx /tmp/joboss-b-corrections-01-evidence/run-suite.mjs
  -> node_modules/.bin/vitest run --config test/delivery/vitest.config.ts --reporter=verbose
Test Files  9 passed (9)
Tests       154 passed (154)
Duration    17.55s
Exit        0
```

All eight original paths remain, with unchanged test counts: Gmail pagination **19**, inbox-delivery **16**, caps **4**, outcome-ingestion **13**, send-gate **27**, owned-inbox **13**, classification **12**, send-attempt-indexes **10** (original total **114**). The new corrections file adds **40**, for **154**. Existing pagination/resume/attachment/malformed-data, concurrent duplicate outcomes/rollback, counters, approval mutation, suppression, caps/breakers, actual RFC-ID matching, owned-recipient gates, ambiguous-success/crash recovery and missing @5 seam regressions passed again. Test files ran serially (`fileParallelism:false`). A pg driver warning about concurrent `client.query` scheduling appeared in synthetic concurrency tests; it did not fail the run and was not hidden.

| Check actually executed | Result |
|---|---|
| `npm run lint` | Exit 0 |
| `npm run check:no-raw-http` | Exit 0; clean, only the approved raw-client network boundary |
| `npx prisma validate` | Exit 0; schema valid |
| `git diff --check` | Exit 0 |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit 2; exactly the existing three D-owned TS2379 diagnostics, no correction-owned diagnostic |
| `npx tsc --noEmit --incremental false` | Exit 0; independently executed UI check |
| B read-only migration/index verification | **13 completed migrations**, all disk/applied SHA-256 checksums match; **11/11 protected indexes** match baseline definitions, including both first-touch predicates on `in_flight,sent` |
| Live comparison, explicit `BEGIN READ ONLY`/`ROLLBACK`, before/after | **57/57 protected drafts, all 14 captured fields match**; **11/11 protected index definitions match**; attempts **0**; completed live JOBOSS migrations **0** |
| Protected local file comparison | All **16** pre-edit hashes match after: `.env`, stage source, schema and all 13 migration SQL files. Milestone **F5**, `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false` |

The backend diagnostics remain `compose.ts:590:115`, `queue-draft.ts:223:76`, `queue-draft.ts:223:267` (optional `contactId` receives undefined under exact optional property types). They were not edited. Lint/network/schema/typecheck outputs, verbose suite evidence, guarded runner, migration/index evidence and read-only preservation scripts are retained under `/tmp/joboss-b-corrections-01-evidence/`. Reported counts come from this run, not the original 114 or historical claims.

One early correction test run was stopped after exposing recursive nested transaction detection in the initial revocation wrapper. The wrapper now uses A's existing actual-scope helper and a private locked implementation; both real ordering regressions passed. Local test typing/fixture issues were corrected; final backend diagnostics are solely the three D-owned errors.

### Newly demonstrated definite-failure overwrite, separate from R-B's prior hypothesis

Using a temporary transpiled copy of **HEAD's pre-correction `send.ts`**, current safe attribution and a guarded B-only synthetic fixture, injected a committed opt-out during the provider call, then a definite 400 refusal. Observed **transport failed, draft approved, draft reason opt_out, suppression count 1**: the old `markFailed` reopened the stopped draft. This is new execution evidence from this correction pass, not a claim that R-B had proven it. The temporary script was inspected/guarded, used fake transport with outbound HTTP disabled, and did not alter repository code/history. Its first launch failed to resolve a temporary module dependency; after correcting only that temporary import, the reproduction exited 0.

The permanent regression now demonstrates **failed attempt plus opted_out draft plus one suppression**, because definite failure restores approved only from still-sending, unstopped drafts retaining approval. Ordinary definite-refusal recovery remains covered by the original send-gate test. Pending ambiguity never takes this branch.

## Preservation, unresolved limits and handoff

No schema, migration, index, core policy/registry/config, package/lockfile, credential or sending-stage/flag edit was needed. No staging, commit, reset, history rewrite, unowned cleanup, paid service, automatic inference, actual inbox/send CLI, `tools/send-test.ts`, OAuth probe, mailbox access, outreach or live mutation occurred. Synthetic approvals/outcomes are confined to B's database. Existing current work and live written drafts/approval hashes were preserved. Live access was read-only for the specifically requested baseline comparison. No agents were spawned and no other chats were messaged.

D's final transaction-safe `evaluateOutreachReadiness(db,draftId,now)` validator and CLI integration remain pending; absent readiness still blocks @5. The accepted foundation isolation block/manual handoff was not changed or represented as runtime-isolation proof. The optional precise incomplete-ingestion reason remains deferred; existing `weak_evidence` plus explicit detail/audit is used. No new shared schema request is required for these corrections.

Provider behavior remains tested with fakes, not real Gmail. Expired cursors, missing mailbox-identity proof, unsupported bodies/limits and large complete scans remain availability limits. Unresolved identities intentionally block pre-send until evidence can be reviewed/retried; no resolution/guessing command was added. Mailbox normalization is deliberately conservative and does not authenticate the sender or fully parse every RFC mailbox syntax. Human reply classification remains heuristic. Pending attempts can stay unresolved indefinitely; their original-day counts expire with the actual day window, while dedup reservations remain. Broader races across independent edits/outcome writers beyond the executed fixtures are not claimed exhaustively verified. Full repository tests, automatic preparation/cohort generation, real CLI mailbox effects and pilot operation were not run.

Yielding all assigned files for targeted independent R-B review of RB-1 through RB-5 and preservation regressions.
