# R-B — Inbox and delivery corrections 02 re-review report

15 October 2026 (Asia/Kolkata). Independent targeted review of the corrections-02 packet, assignment/report, prior corrections-01 review, changed source/new tests and latest coordination entries. Worked directly without agents or messages to other chats. Code, tests, configuration, schema and migrations remained read-only.

## Scoped verdict

**Bounded corrections required. RB-3a closed. RB-3b remains reopened for one narrower, newly demonstrated DSN consistency gap.** The original mixed-recipient reproduction is fixed, including reversed block order and swapped delivery/failure assignments. However, contradictory Action/Diagnostic-Code evidence without a Status field can still cause permanent suppression and successful coverage.

Independently executed **201/201 passing tests across ten files**, plus separate guarded PostgreSQL/fake-provider reproductions. Preserve the previously closed RB-1, RB-2, RB-4, RB-5 and definite-failure stop-preservation findings: their source/tests were unchanged and their regressions passed again. No concrete regression in those accepted corrections appeared.

Delivery as a whole is not yet accepted. D’s substantive `@5` readiness validator/CLI integration and three existing backend typing errors remain separate pending work. Actual provider/mailbox behavior, authenticated identity, runtime isolation, integrated preparation/cohort quality, pilot and overall JOBOSS acceptance remain outside this review. The foundation automatic-execution block/manual interface remains unchanged.

## Confirmed remaining finding

### RB-3b residual — P1: missing Status bypasses Action/Diagnostic-Code contradiction checking

Location: [dsn-evidence.ts:61](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/mail/dsn-evidence.ts:61), especially [dsn-evidence.ts:65](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/mail/dsn-evidence.ts:65). The match gate consumes this result at [ingest-outcomes.ts:114](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/send/ingest-outcomes.ts:114).

Reproduction: normally send synthetic A/B drafts. Supply B’s actual stored RFC Message-ID in `In-Reply-To`, a postmaster sender, delivery-status subject, and this body:

```text
Final-Recipient: rfc822; owner+b@owned.example
Action: delayed
Diagnostic-Code: smtp; 550 5.1.1 user unknown
```

Actual production-helper/matcher/ingester/sync outputs:

```text
readDsnEvidence: recipients=[owner+b@owned.example], issue=null
detailed match: matched
ingestion: bounce, hard_bounce, suppressed=true
B draft: bounced_hard
B contact: suppressed
suppression rows: 1
unresolved audits: 0
sync: complete=true, resumed=false, scanned=1, matched=1
```

The helper checks Action against Status and Diagnostic-Code against Status, but never checks the available Action against Diagnostic-Code when Status is absent. Its own delayed-action rule permits only class 4 when Status exists; without it, class 5 reaches the unchanged classifier and becomes a permanent hard bounce. This is contradictory/incomplete DSN evidence, not proof that either outcome is correct.

Effect: relevant contradictory mail bypasses unresolved quarantine, permanently suppresses a contact and licenses a complete scan. The packet explicitly requires contradictory/unbindable action/status/diagnostic evidence to use the existing safety path. The passing fixtures cover status/action and status/diagnostic conflicts, but omit this third pairing.

Bounded correction request, **B**: evaluate consistency among the outcome evidence that is actually present, including Action versus diagnostic class when Status is absent, or quarantine the ambiguous combination. Add this exact case through matching, ingestion and sync/pre-send, asserting zero outcome/suppression/state changes, one bounded audit and incomplete replayable coverage. Preserve supported unambiguous exact-ID-only legacy DSNs and diagnostic fallbacks; no general DSN/MIME rewrite, schema change or automatic resolution is needed. No fix was implemented here.

## RB-3a — Closed

Independent direct fixtures used normally sent A/B attempts with a shared thread, stop body, and the same sender value in `message.from` and `headers.From`. The exact prior reproduction now parses to **null**:

```text
other@outside.example, Person B <owner+b@owned.example>
```

Six direct sender scenarios covered that value, reverse bare/angle order, two angle addresses, unquoted extra mailbox material, unsupported group syntax and comments. For each:

- Detailed match returned **unresolved**; four concurrent ingestions plus a repeat all remained unresolved.
- Exactly **one unresolved audit**, candidate list ≤50, retained sender/thread strings ≤200.
- **Zero Bounce/Reply/OptOut/suppression** rows; complete contact/draft/lead/attempt snapshots unchanged.
- Sync returned **incomplete/scanned 0**; replay returned **incomplete/resumed true**, current cursor null and complete false.
- A fresh individually approved unrelated target refused pre-send for incomplete ingestion; **zero new provider sends/attempts**.

Positive controls independently accepted **six** supported bare/angle/quoted/escaped forms, including `"Last, First" <owner+b@owned.example>`, quoted-pair escapes, case and outer whitespace. Plus addresses stayed distinct. Actual quoted-comma stop ingestion selected B and suppressed B while A stayed active. Separate From disagreement returned unresolved; an unrelated unsupported-list message without known conversation evidence remained unmatched.

An additional later-page fixture committed one ordinary automatic reply on page one, then encountered the ambiguous sender on page two. First result was **incomplete/scanned 1**; replay was **incomplete/resumed true/scanned 1**. Observed cursors **[null,"1","1"]**, retained checkpoint cursor **"1"**, exactly **one prior-page outcome, one unresolved audit and zero suppressions**. This directly establishes resumption at the blocked page without replaying/duplicating the completed page.

The sender parser remains intentionally conservative, not authentication or a full RFC mailbox parser. Unsupported forms that explicitly quarantine relevant mail are availability limits, not new defects.

## RB-3b — Original mixed-recipient case fixed; residual above remains

Five independent direct fixtures covered the exact unknown-failed/B-delivered case, reverse order, both failure/delivery assignment swaps, and two-known-contact conflict. All explicit recipients remained visible in `readDsnEvidence`, including the unknown address. Each used the same end-to-end quarantine checks as above: **unresolved**, one audit after concurrent/repeated ingestion, no irreversible outcomes or state changes, incomplete replay, and zero pre-send calls.

Eight further direct fixtures exercised repeated same-recipient blocks, repeated Status, outcome fields detached from recipient blocks, unsupported x400/unreadable recipients, delivered-action versus hard-status conflict, soft-status versus hard-diagnostic conflict and repeated Action. Each returned an explicit issue/unresolved and passed the same snapshot/audit/coverage/pre-send checks. The required suite separately exercised all **13** added ambiguous DSN fixtures and confirmed the exported recipient list retains **unknown addresses and null unreadable markers**.

Positive direct controls retained:

- Same-recipient Original/Final declarations in one block, one consistent **4.1.1** outcome: soft bounce, no permanent suppression.
- Same-recipient consistent **5.1.1** outcome: hard bounce, one suppression; A unaffected.
- Strong B original ID over unrelated weak A thread: B matched.
- Known recipient-only DSN and exact-ID-only legacy DSN: B matched.
- Unknown-only unrelated DSN: ordinary unmatched.

The fixed original cases do not justify accepting the untested outcome combination demonstrated in the residual finding. Retaining a known recipient is necessary but does not establish consistency of all consumed outcome evidence.

## Executed checks and preserved acceptance

The suite runner loaded configuration without printing it, selected process-only `TEST_DATABASE_URL` pathname `/outreach_test_joboss_b`, and retained independently captured live configuration. Shared `configuredTestTarget`/`verifyTestTarget` established the approved local target and actual connection before execution; normal global migration/setup guards remained intact. Ran serially with the existing B config and normal MockAgent outbound HTTP refusal:

```text
vitest run --config test/delivery/vitest.config.ts --reporter=verbose
Test Files  10 passed (10)
Tests       201 passed (201)
Duration    18.00s
Exit        0
```

| File | Passed |
|---|---:|
| `test/delivery/corrections-02.test.ts` | 47 |
| `test/delivery/corrections-01.test.ts` | 40 |
| `test/delivery/gmail-pagination.test.ts` | 19 |
| `test/delivery/inbox-delivery.test.ts` | 16 |
| `test/delivery/caps.test.ts` | 4 |
| `test/policy/outcome-ingestion.test.ts` | 13 |
| `test/policy/send-gate.test.ts` | 27 |
| `test/policy/owned-inbox.test.ts` | 13 |
| `test/unit/classify-outcome.test.ts` | 12 |
| `test/integration/send-attempt-indexes.test.ts` | 10 |

All previous **154 tests** and substantive assertions remain. The suite again verified actual separate-connection approval/revocation ordering and lock waiter, body/hash/recipient mutation and change/restore rejection, reservation rollback and outer-transaction refusal, concurrent single-send behavior, uncertainty reservation/caps/direct unique constraints, later no-send recovery, stop-preserving definite refusal, soft-bounce stop and Auto-Submitted parsing. No accepted implementation review was restarted.

Pagination >50, later-page/attachment/malformed-message failures, loops/caps, partial replay/resumed fresh scan, concurrent duplicate outcomes/rollback, separate counters, suppression/freshness/breakers, rewritten IDs, crash recovery and missing/rejected `@5` readiness all passed again. The D readiness seam remains unchanged; no substitute substantive validator was supplied. CLI labeling/pending behavior remains as accepted in corrections-01; no real inbox/send CLI was executed.

| Separate command/check | Result |
|---|---|
| `npm run lint` | Exit 0 |
| `npm run check:no-raw-http` | Exit 0; clean, approved raw-client boundary only |
| `npx prisma validate` | Exit 0; schema valid |
| `git diff --check` | Exit 0 |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit 2; exactly three existing D-owned TS2379 diagnostics |
| `npx tsc --noEmit --incremental false` | Exit 0; UI checked separately |
| Guarded `direct.mjs` | Exit 0; 24 independent fixture groups: 19 quarantine groups, 4 positive-control groups and 1 asserted bad-result reproduction |
| Guarded `later-page.mjs` | Exit 0; blocked later-page cursor/replay evidence above |

Backend errors remain `compose.ts:590:115`, `queue-draft.ts:223:76` and `queue-draft.ts:223:267`, optional contactId/undefined under exact optional property types. No correction-owned diagnostic appeared.

The pg concurrent-query deprecation warning reappeared in synthetic concurrency runs; all actual queries/assertions completed. Keep it as driver-upgrade compatibility debt, not a failed test or proof of behavior on a future pg version. No full suite, repeated foundation review, provider inference or live mailbox check was required/run.

Supplemental scripts installed MockAgent with net connect disabled and imported current production functions. B-helper resets revalidate the local target, configured-live exclusion and actual connection every time. A supplemental script asserting the observed bad result exits successfully as a reproduction; it is not an additional passing acceptance test. No tracked tests/configuration were modified to obtain these results.

## Preservation and ownership evidence

Read-only B verification found **13 completed migrations**, all disk/applied SHA-256 checksums matching and no rolled-back record; **11/11 protected index definitions** match baseline, including contact/company-slot first-touch predicates over `in_flight,sent`. The suite used normal immutable migration deployment, with no schema migration introduced for this correction. Protected JOBOSS hashes remain:

- `20261014170000_joboss_preparation`: `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`.
- `20261015010000_joboss_foundation_uniqueness`: `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

Live baseline comparison used only explicit **BEGIN READ ONLY / ROLLBACK**: **57/57 drafts and all 14 protected fields matched, 11/11 index definitions matched, send attempts 0, completed live JOBOSS migrations 0**. Stage **F5**, `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`.

Captured **402 existing file hashes** before this review. Recheck found no differences; HEAD, exact staged diff and existing unstaged diff also matched the initial capture. Comparing the previous reviewer’s 396-file snapshot found only the two authorized existing source changes (`headers.ts`, `ingest-outcomes.ts`) and the three already identified coordinator documents; closed correction code/tests, sync/classifier, schema/migrations/configuration and earlier reports were preserved. New files for corrections-02 are the local DSN helper, new test file and assignment/report/review-packet documents; the wider dirty diff includes inherited corrections-01 work, not new corrections-02 edits.

Only this new report was written in the workspace. All fixture writes/approvals/suppressions/attempts were synthetic on **outreach_test_joboss_b**. No other-worker/common fixture target, live write/approval/migration/deployment, mailbox/OAuth/auth/model operation, real inbox/send command, `tools/send-test.ts`, sending enablement, paid service, staging, commit, reset, install, generation, guard bypass, constraint removal, agent or other-chat message occurred.

Evidence retained under `/tmp/joboss-rb-c02-oq9xxl/`: `suite.log`, separate check logs, newly owned `common.mjs`/`direct.mjs`/`later-page.mjs`, their logs/results, migration/index/live preservation evidence and file/Git snapshots. The preservation script’s first launch had a local CommonJS named-import error before any query; fixing only that newly owned temporary import allowed all checks to complete. No environment/cloud-hydration blocker, skipped required check or zero-test suite attempt occurred in this review. No credentials or connection strings were printed.

## Interfaces, limits and stopping point

Attribution/coverage interfaces are unchanged: `DetailedMatch`/`IngestResult` distinguish matched, ordinary unmatched and unresolved; unresolved carries bounded candidates, null reason and suppressed:false. The provider-message transaction lock deduplicates its audit; sync retains the current cursor and refuses completeness; pre-send refuses before reservation/provider call. Compatibility lookup null must not be interpreted as proof of unrelated mail. Complete the residual DSN consistency condition inside this existing contract.

Accepted reservation/revocation ordering, `pending_reconciliation` retaining in_flight/original-time/dedup, manual follow-ups, caps and `@5` fail-closed behavior remain in force. D must later supply the no-network transaction-compatible readiness validator and wire it into `tools/run-send.ts`, and fix its three typing errors. Provider/runtime isolation and final preparation/pilot acceptance remain distinct; none is established by fake-provider tests.

Full RFC mailbox/MIME coverage, sender authentication, authenticated mailbox identity and real Gmail behavior remain unverified. Conservative quarantine, expired-cursor/body/byte/coverage limits and indefinite uncertainty are explicit availability limits; no unexecuted hypothesis is promoted to a defect.

Return this report through the human/coordinator for a **bounded B correction to the single residual RB-3b case**. Keep RB-3a and all prior closed findings closed. No implementation or follow-up assignment was started, and no sending or rollout approval is given.
