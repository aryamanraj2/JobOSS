# R-B — Inbox and delivery review report

15 October 2026 (Asia/Kolkata). Independent review of B’s assignment, report, current implementation and tests, the settled `/Users/aryamanjaiswal/Downloads/PLAN.md`, and latest coordination entries. Work performed directly, without agents or messages to other chats.

## Verdict and boundary

**Bounded corrections required.** Independently reproduced **114/114 passing tests in all eight required files**, but supplemental synthetic PostgreSQL/fake-provider probes confirmed five defects below. Passing tests do not establish the required approval, stop-state, ambiguous-send and matching invariants in those cases.

Pagination/resumption, atomic duplicate ingestion, separate provider/client RFC IDs, normal reconciliation, serialized send reservations and the absent/rejected `@5` readiness seam have substantial positive evidence. Acceptance is conditional on correcting and independently rechecking the findings. This does not accept overall JOBOSS, automatic preparation, real Gmail operation, cohort quality or pilot readiness.

D’s substantive readiness validator and its integration into `tools/run-send.ts` remain outstanding. Its absence correctly refuses `@5`. The three existing D-owned backend typing errors remain. Provider/runtime isolation is independently unverified; automatic subscription execution remains blocked by the foundation isolation guard. No weaker readiness validator or isolation substitute was introduced.

## Confirmed actionable findings

### RB-1 — P1: approval can be revoked successfully while reservation still sends

Location: [send.ts:129](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/send.ts:129), especially the unconditional draft update at [send.ts:154](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/send.ts:154). Related approval mutation: [approve.ts:219](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/approve.ts:219).

Reproduction: create a normally individually approved synthetic draft. Use a Prisma query extension to pause at the first `sendAttempt.count` in the gate, after hash verification but before attempt creation. On another database connection, call the real `revokeApproval` for that draft, then resume the count/reservation. This is an actual concurrent database mutation at a deterministic query boundary, not a mocked gate verdict.

Observed: revocation returned `{ok:true}`; `sendApprovedDraft` returned `sent`; fake provider calls were **1**. Final draft was `sent` with **`approvedAt:null` and `approvalHash:null`**. The send reservation lock coordinates senders, but revocation does not acquire it, and reservation overwrites the revoked state.

Effect: a human can withdraw approval before an attempt exists and still have the message sent. B’s ingestion-time body mutation test passes, but does not exercise this later window.

Correction request: B, coordinate with D as owner of approval code. Make reservation conditional on the exact current approved state/hash/recipient/content and coordinate concurrent revocation/edits with that decision; roll back the reservation on disagreement. Add a deterministic revocation-during-gate regression. A common sender lock alone does not protect independent mutators.

### RB-2 — P1: an ambiguous reconciliation miss releases dedup and cap capacity

Location: [send.ts:286](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/send.ts:286), [send.ts:355](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/send.ts:355), and [counters.ts:114](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/counters.ts:114).

Reproduction: use `FakeMailProvider({preservesOutreachRef:false})`, call `failNextSendAmbiguously()`, and send an individually approved draft. The fake records a real modeled delivery but reconciliation cannot find its handle. Retry the original draft, then create and individually approve another draft revision on the same lead/contact/company/cycle/slot and send it as the same first touch.

Observed: first result `failed: reconciliation found no sent message`; same-key retry remained failed with no extra send; **`sentOnDay` returned 0 despite one modeled delivery**. The new revision sent successfully. Final counts: **2 provider calls, 2 deliveries** to the same contact/cycle/slot.

Effect: same-key at-most-once is preserved, but an unknown delivery becomes a definite failure, drops out of the partial unique indexes/counters, and allows another first touch under a new draft key. The existing header-stripping regression only retries the original key. A provider search miss, including a bounded-window miss, does not prove non-delivery.

Correction request: B retain unresolved ambiguity as a reservation-bearing state and visible uncertainty; do not free contact/company first-touch uniqueness or cap capacity merely on a search miss. Preserve later no-send reconciliation/operator resolution. Coordinate any necessary status/schema work with A rather than rewriting migrations.

### RB-3 — P1: ambiguous inbound identity can suppress the wrong contact

Location: [ingest-outcomes.ts:72](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:72), especially [ingest-outcomes.ts:83](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:83).

Reproduction: normally send two synthetic approved drafts to distinct plus-address contacts at distinct companies. Give their attempts the same provider thread ID, modeling a merged/reused thread. Ingest an opt-out whose sender is contact B with that thread ID and no exact reply header. Separately match a message whose `In-Reply-To` identifies A while `References` identifies B.

Observed: shared-thread lookup selected **A**, and ingestion suppressed **A** while **B stayed active**. Conflicting headers also selected A, without reporting ambiguity. The implementation returns the first match and never consults sender/contact consistency or gathers conflicting candidate conversations. DSN body IDs are considered only after the thread fallback.

Effect: an arbitrary match becomes a permanent suppression and the actual opt-out address can remain contactable. Ordinary unique rewritten-ID matching works; it does not resolve contradictory identities.

Correction request: B require an unambiguous conversation/contact attribution across relevant evidence; validate human sender consistency where applicable and distinguish daemon DSNs. Surface conflicts/shared-thread ambiguity for review rather than committing irreversible outcomes against the first row. Do not let a weak thread fallback override stronger contradictory DSN identity. Add multi-contact fixtures; do not assume header or thread presence alone is conclusive.

### RB-4 — P1: soft bounce does not block a subsequent manual follow-up

Location: [gate.ts:194](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/gate.ts:194).

Reproduction: normally send a synthetic first touch; ingest its `Status: 4.1.1` DSN. Clone the draft into a new individually approved revision on the same lead/contact, then call `sendApprovedDraft` with `touchNumber:2`.

Observed: lead reason was **`soft_bounce`**, but the follow-up returned **`sent`**. Provider calls increased from 1 to **2**. The gate’s lead-stop list includes hard bounce but omits soft bounce; the active contact is intentionally not permanently suppressed, and first-touch indexes do not block touch 2.

Effect: the promised conversation stop is ineffective for a later manually initiated follow-up. This is not a request to permanently suppress soft bounces or to automate follow-ups.

Correction request: B include `soft_bounce` in send-time conversation stops, with a regression using a separately approved follow-up. Retain the distinction between stopping the conversation and permanently suppressing the address.

### RB-5 — P2: whitespace before an Auto-Submitted parameter hides a human opt-out

Location: [classify-outcome.ts:164](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/classify-outcome.ts:164).

Reproduction: call `classifyReply` with body `Please stop emailing me` and header `Auto-Submitted: no ; extension=value` (also reproduced with leading/trailing whitespace).

Observed: **`auto_reply`** instead of `opt_out`. Trimming the whole header before splitting retains the space at the end of the `no ` token. Ordinary automatic values still classify as automatic.

Effect: ingestion treats a human stop as an automatic reply, leaving the conversation/address unchanged. Whitespace before parameters is allowed by [RFC 3834 §5.1](https://datatracker.ietf.org/doc/html/rfc3834#section-5.1); §5.2 requires recognition of valid parameter-bearing keywords.

Correction request: B normalize the extracted keyword, including allowed whitespace/comments, before comparing with `no`; add positive human-stop and automatic-reply parameter/whitespace regressions. Do not fix this by discarding automatic-response headers.

## Acceptance evidence and practical limits

### Inbox coverage and resumption

- Adapter regression consumed **61 messages over two pages**, forwarded the cursor, and asserted `includeSpamTrash=true`. Default scan query is `-in:sent`; archived, spam and trash received mail are not restricted to the INBOX label. Explicit CLI `--days` uses a separate diagnostic checkpoint scope and prints that it cannot establish pre-send completeness.
- Required adapter tests rejected later-page HTTP failures, gate refusal, truncation, malformed identities/list data, claimed-but-omitted messages and invalid JSON. They rejected pagination loops, the 200-page cap, invalid dates/payloads/base64/non-UTF-8 text, missing readable bodies, and failed attachment-backed DSN retrieval. Multipart/attachment DSN text and automatic headers were retained.
- Required database test: failed second page produced `{complete:false,scanned:50}`; resumption began at cursor `50`, completed at `scanned:61,matched:61`, and stored **61 automatic replies, zero human replies**.
- Supplemental partial-page cap: first result `{complete:false,resumed:false,scanned:0,matched:0,detail:"inbox message coverage cap reached"}` even though one outcome had committed. Replay completed at `{complete:true,resumed:true,scanned:2,matched:2}` with exactly **2 outcome rows**. The next invocation started fresh (`resumed:false`) and still had 2 rows. Checkpoint counts represent committed whole pages, not all work done before a partial-page failure.
- Supplemental corrupt metadata and mismatched incomplete-query checkpoints both returned `complete:false`, with explicit operator-review details and **zero list calls**.
- Supplemental two concurrent scans, one failing mid-page: results were one incomplete (`second message fails`) and one complete (`scanned:2,matched:2`); a later fresh scan completed with exactly 2 outcomes. No duplicate outcome or false success was observed in this interleaving. Checkpoints are append-only and not mailbox-locked; this is not exhaustive concurrency proof.
- Required pre-send resumption test drained cursor `50`, then scanned a fresh first page (`["50",undefined]`), ingested a newly arrived opt-out and refused with `opt_out`. Incomplete ingestion refused before any attempt/provider send; disabled new sending performed zero inbox list calls.

Checkpoint identity is supplied by callers: CLI keys include configured account/scope, pre-send keys include configured account, and incomplete query mismatches are checked. The provider contract does not expose an authenticated-mailbox identity for independent comparison. Actual OAuth account/configuration mismatch and expired Gmail cursors were not exercised; they must not be described as verified. Expired cursors, unsupported bodies, depth/byte limits and caps remain visible fail-closed availability limits. No delta/history optimization or automatic checkpoint reset was accepted.

### Atomicity, suppression and counters

- Required suite ran **six concurrent ingestions plus a repeat** for each identical hard-bounce, soft-bounce and opt-out provider ID. Each produced one outcome identity/audit; hard bounce/opt-out produced one suppression, soft bounce produced none. Opt-out deliberately has one Reply plus one OptOut fact for the same event, not duplicate events.
- An injected suppression failure rolled back Reply/OptOut/suppression and draft/lead transitions. Hard-bounce retirement and manual wrong-contact paths are exercised by the existing policy tests. Manual wrong-contact uses a transaction in current source; its failure rollback was not independently fault-injected here.
- Supplemental different-message race on **the same attempt** combined opt-out, soft bounce and human reply: final draft `opted_out`, lead/attempt reasons `opt_out`, **2 replies, 1 bounce, 1 suppression**. This verifies the claimed stronger-stop ordering for this case; it does not prove serialization across different attempts sharing a lead/draft.
- Required tests confirm hard bounce, opt-out and wrong-contact suppress the address; soft bounce and human reply do not permanently suppress; automatic reply changes no conversation state. RB-4 and RB-5 qualify acceptance of stopping/classification.
- Required counter fixture returned **human replies 1, automatic 1, wrong-contact 1, opt-outs 1, unclassified 1**. A repeated legacy null-classification record returned `unclassified`, not a measured human reply. Referral, interview and complaint signals explicitly returned `unavailable`; provider reputation carries an observability caveat. The human-reply bucket is heuristic, not proof of positive interest or usefulness.

### Provider identity, reconciliation and gates

- Shared `ProviderMessageRef.rfc822MessageId?: string | null` is present at [providers.ts:180](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/core/interfaces/providers.ts:180); B’s local intersection is structurally compatible. Client-derived and provider-stored RFC IDs are persisted separately. Supplemental omission of the provider field stored **null**, while the derived field remained populated.
- Required tests match rewritten stored IDs with absent/broken threads, References and DSN quotes. Fake Gmail reconciliation paginated to a later matching `X-Outreach-Ref` and returned the actual stored RFC ID. RB-3 qualifies matching acceptance when identities conflict.
- Malformed successful POST response and failed post-send metadata read raised `AmbiguousSendError` in mocked adapter tests. Timeout/lost-response and crash-after-provider-call tests reconcile without another send. Same-key sent/terminal/in-flight paths never issue another send in the tested cases. RB-2 qualifies treatment of misses and new keys.
- Supplemental opt-out ingestion between provider success and metadata recording left the draft **`opted_out`**, despite a `sent` transport result. `markSent` did not reopen it. The separate `markFailed` path unconditionally restores `approved`; an equivalent concurrent-stop/failure race was not fault-injected and remains an unaccepted hypothesis, not an additional confirmed finding.
- Required tests cover ingestion-time approval body mutation (`approval_hash_mismatch`, zero provider calls), frozen sender identity, suppression scopes, stale evidence, dedup indexes, owned-inbox policy, caps and circuit breakers. Four concurrent same-draft invocations produced **one provider send/one attempt**. RB-1 qualifies concurrency acceptance for non-sender mutators.
- Supplemental real PostgreSQL cap fixtures counted **4/9/19 in-flight reservations** as allowed immediately below selected 5/10/20 daily caps, then refused at **5/10/20** respectively. A separate concurrent last-slot probe with cap 2 produced one sent result and one `cap_exceeded`; final totals were **2 sends/2 attempts** including the initial send. Pilot defaults remain 5/day and 3/domain/day at F6/F7, with no calendar-based escalation; later selected caps are explicit options. RB-2 identifies a state transition that evades these otherwise functioning counts.
- `@5` missing readiness returned `weak_evidence: @5 readiness validator is not integrated`; rejected readiness returned its supplied detail; a test-only successful callback permitted the seam independently of legacy score. Supplemental callback isolation witness inserted an audit marker: **inside transaction count 1, outside connection count 0**, with the correct draft ID and Date. This establishes use of the transaction-compatible client, rather than relying on the presence/absence of a `$transaction` property.
- With a successful seam-only callback, separate `@5` supplemental cases still refused hash mutation, stale evidence, suppression, dedup and cap exhaustion with their corresponding reason codes. These fixtures validate gate composition only; they do not implement or accept D’s substantive readiness criteria.
- CLI list/dry paths explicitly label inbox unchecked/offline results, and reconciliation remains a separate no-send operation. Source inspection only: no real inbox/send CLI, `tools/send-test.ts`, OAuth or live mailbox command was run.

## Executed checks and target safety

The delivery suite used the existing `test/delivery/vitest.config.ts`, B helper and shared guarded global/setup files, serially. Loaded configuration without printing credentials; changed only process `TEST_DATABASE_URL` pathname to `/outreach_test_joboss_b`, preserving independently configured live `DATABASE_URL`. Ran the local Vitest binary with `run --config test/delivery/vitest.config.ts --reporter=verbose`.

Inspected B’s exact-name helper/config guard and shared `configuredTestTarget`/`verifyTestTarget`: shared guards require an approved local PostgreSQL target, no URL overrides, independently captured live identities including `.env`, and conservative live-name exclusion across endpoint aliases. Explicit `verifyTestTarget` connected read-only to B before the suite; shared global setup verified again before normal `prisma migrate deploy`, and setup verified before fixtures. Supplemental scripts repeated this validation/actual-connection probe before every B-helper truncation. B’s standalone helper is weaker than the shared guard (no independent local-host/connection validation itself); it was never used without the shared validation and actual connection check in this review. No guard bypass, `db push`, reset, constraint removal, generation or dependency install occurred. Other workers’ fixture targets were not accessed.

| Check | Actual result |
|---|---|
| Required delivery Vitest config | Exit 0; **8 files, 114 tests passed**, duration 7.78s |
| `test/delivery/gmail-pagination.test.ts` | 19 passed |
| `test/delivery/inbox-delivery.test.ts` | 16 passed |
| `test/delivery/caps.test.ts` | 4 passed |
| `test/policy/outcome-ingestion.test.ts` | 13 passed |
| `test/policy/send-gate.test.ts` | 27 passed |
| `test/policy/owned-inbox.test.ts` | 13 passed |
| `test/unit/classify-outcome.test.ts` | 12 passed |
| `test/integration/send-attempt-indexes.test.ts` | 10 passed |
| `npm run lint` | Exit 0 |
| `npm run check:no-raw-http` | Exit 0; `clean — no network access outside src/core/policy/http/raw-client.ts` |
| `npx prisma validate` | Exit 0; schema valid |
| `git diff --check` | Exit 0 |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit 2; exactly 3 existing optional-`contactId` TS2379 diagnostics: `compose.ts:590:115`, `queue-draft.ts:223:76`, `queue-draft.ts:223:267` |
| `npx tsc --noEmit --incremental false` | Exit 0, independently executed despite backend failure |
| Supplemental scripts | Exited 0; surprising results asserted/reported as defects, not counted as additional passing Vitest tests |

Required tests retained normal undici MockAgent/net-connect refusal. Supplemental provider work used fakes; the principal provider/concurrency scripts also installed MockAgent with net connect disabled. Gate/cap-only supplemental scripts did not instantiate a network provider. No full suite was required or run. No actual mailbox/provider/runtime isolation verification was performed.

### Migration and preservation evidence

Read-only B queries found **13 completed migration records**, no rolled-back record, through `20261015010000_joboss_foundation_uniqueness`. **All 13 SHA-256 checksums match repository migration SQL**. Normal suite global setup applied the newly pending uniqueness migration to B only. The preparation checksum is `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness checksum is `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

Both contact/company-slot first-touch partial unique indexes remain present and are exercised by the required integration tests. Predicates remain `touch_number = 1` and status in `in_flight,sent`; keys are `(contact_id,campaign_cycle)` and `(company_id,campaign_cycle,touch_slot)`.

Live comparisons used explicit **`BEGIN READ ONLY` / `ROLLBACK`** only, against `scratch/joboss-baseline-20261014/protected-state.json`: **57/57 protected draft rows and every captured field matched; 11/11 protected index definitions matched; send attempts 0; completed live JOBOSS migrations 0**. Live identity was `outreach_dev`; the fixture target was `outreach_test_joboss_b`. No live fixture/write/migration was performed.

Observed flags: milestone **F5**, `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`. A content snapshot of **349 source/test/tool/schema/UI/generated/config files**, including `.env`, taken after the required suite and before supplemental work, had **zero differences** on recheck. No application/test/configuration file was edited by this reviewer. Git status changed from pre-existing modifications to clean while this read-only review was running; no Git mutation/commit command was issued here, and the content snapshot did not change. Consequently Git cleanliness alone is not used as preservation evidence.

Only this report was written in the workspace. Newly owned supplemental scripts/logs are under `/tmp/joboss-rb-qqGAJb/` (`suite.log`, `probes.mjs`/`probes.log`, `extra.mjs`/`extra.log`, `v5-gates.mjs`/`v5.log`, `caps-real.mjs`/`caps-real.log`, check logs and JSON results). They contain synthetic fixtures/evidence; live-state comparison output was kept local. No credentials/connection strings were printed. Synthetic approvals, suppressions and attempts were confined to B. No external communication, paid service, actual outreach, live mailbox access, sending enablement, credential change or cleanup of another worker’s data occurred.

## Dependencies and permitted next steps

Return these findings through the human/coordinator before starting corrections, so B/D/A ownership does not overlap R-A’s work. B can address delivery findings after that assignment. D must supply `evaluateOutreachReadiness(db,draftId,now): Promise<{ready:boolean;detail:string}>` using current supported fit, suitable verified recipient and evidence-backed hook, with no network inside the transaction; integration must wire it into `tools/run-send.ts` and fix the three draft typing errors. Shared RFC-ID compatibility is already satisfied. The optional precise incomplete-ingestion reason remains deferred; current `weak_evidence` detail plus `send.inbox_incomplete` audit is adequate to express refusal.

Read-only review, mocked regression work and preparation-side development can proceed within coordinated ownership. Delivery acceptance, actual sending and pilot readiness must remain withheld pending corrections, D/integration work and separate provider/runtime verification. No follow-up assignment was started.
