# B — Inbox and delivery corrections 03 report

15 October 2026 (Asia/Kolkata). Residual RB-3b correction completed within the assigned boundary. **320/320 tests passed across 11 files**, including all previous 201 tests. Lint, network guard, schema validation, whitespace and UI checking passed. Backend checking completed with exactly the three unchanged D-owned errors. Yielding for independent R-B review; no overall delivery/JOBOSS/pilot acceptance claim.

## Changes and available-field rule

Changed only:

- `src/outreach/mail/dsn-evidence.ts`: one explicit private action-class table now governs comparison with both available Status and Diagnostic-Code classes. Action/diagnostic consistency no longer depends on Status being present. The delayed/550/no-Status case returns `issue: "DSN action contradicts diagnostic"` before downstream classification.
- Added `test/delivery/corrections-03.test.ts`: 119 focused cases.
- Added this report.

The table preserves the previously supported conventions:

| Action | Compatible Status or readable SMTP diagnostic class |
|---|---|
| absent | No action restriction |
| failed | 4 or 5 |
| delayed | 4 |
| delivered, relayed, expanded | 2 |

Apply every comparison whose fields are available: Action versus Status, Action versus diagnostic, and Status versus diagnostic. When Status and readable diagnostic class are both present, their classes must agree. A missing third field cannot disable comparison between the other two. The helper retains its existing readable SMTP-code extraction, matching the classifier's fallback; it does not add a general diagnostic-text/MIME parser.

The existing conservative success boundary also remains: without Status, a success Action or class-2 diagnostic is unresolved, including when those two agree, because downstream classification cannot safely consume it as a delivery receipt. This correction does not reinterpret it as an ordinary reply or success. Existing unreadable/unsupported fields, repeated/mixed recipients, repeated outcomes and detached/unbindable blocks still quarantine relevant messages.

Supported fallbacks remain:

- No Status, `delayed` plus SMTP 450: soft bounce, no permanent suppression.
- No Status, `failed` plus SMTP 450 or 550: soft or hard respectively; the accepted failed+4 convention is unchanged.
- No Action/Status, diagnostic-only 450/550: soft/hard respectively, for a known single recipient or unambiguous exact-ID-only legacy DSN.
- Exact-ID-only legacy failure notifications with no readable code retain the existing inferred-soft behavior; `failed`/`delayed` alone also retain that behavior. This is compatibility with the existing classifier, not proof of a measured failure class.
- Same-address Original/Final declarations in one block remain supported. Existing normal single-recipient Status-based DSNs and strong-ID precedence are preserved by the unchanged prior tests.

No matcher, classifier, sync, sender parser, approval, reservation, send, gate, counter, schema, configuration or interface edits were needed. `DsnEvidence`, `DetailedMatch` and `IngestResult` are unchanged. The new issue flows through the existing unresolved → bounded audit → incomplete/replayable coverage → pre-send refusal path.

## Executed regression evidence

Before editing the guard, the new tests ran through the normal guarded delivery configuration: **2 failed, 117 passed, 119 total**. The failures were the missing-Status delayed/class-5 matrix case and the exact end-to-end fixture's guard assertion. This was a failing product-regression run, not a successful assertion of bad behavior. The latter stopped at its guard assertion, so that run did not independently repeat the reviewer's irreversible suppression reproduction. Prior review evidence was inspected, not modified or executed in place.

After the fix, all 119 new cases passed:

- **96 matrix cases:** six Action choices (absent plus five recognized actions) × four Status choices (absent/2/4/5) × four diagnostic choices (absent/2/4/5). Every case checked both ordinary formatting and reversed field order with uppercase values/field names, tab separation and CRLF: **192 helper evaluations**. Explicit expectations cover the missing pairing, all pairwise contradictions, consistent three-field combinations, success-without-Status quarantine and legacy absence cases.
- **13 end-to-end no-Status quarantine cases:** nine contradictory Action/diagnostic pairings and four existing unbindable class-2 success combinations. Each used normally sent synthetic A/B attempts with a shared thread and B's exact stored original Message-ID. The first fixture is the exact `Action: delayed` / `Diagnostic-Code: smtp; 550 5.1.1 user unknown` reproduction.
- **10 actual-ingestion positive controls:** seven consistent diagnostic fallback cases with/without Action and explicit recipients, plus three inferred-soft legacy cases. Verified correct B attribution, soft versus hard outcome/provider code, appropriate suppression count, unchanged A, B's transport/stop state, complete ingestion coverage and exactly one outcome after sync replay.

Every quarantine case exercised the actual helper, detailed matcher, ingestion, sync/replay and pre-send. Six concurrent ingestions plus a repeat remained unresolved, `reasonCode:null`, `suppressed:false`. Full original contact/draft/lead/attempt snapshots stayed equal. There were **zero Bounce/Reply/OptOut/suppression facts**, **one unresolved audit**, candidate IDs ≤50, sender/thread metadata ≤200 characters. Sync returned **incomplete/scanned 0**, then **incomplete/resumed true**; the blocked page cursor remained null and complete false. A fresh individually approved target refused pre-send for unresolved ingestion with **zero new provider calls or attempts**. These assertions passed for the exact delayed/550 fixture and all 12 companion cases.

## Commands and results

Evidence retained under `/tmp/joboss-b-corrections-03-evidence/`. The newly owned runner sets only process-local `TEST_DATABASE_URL` pathname `/outreach_test_joboss_b`, then calls shared `configuredTestTarget` and read-only `verifyTestTarget` before launching Vitest. The unchanged B configuration runs files serially; normal immutable migration setup, configured-live exclusion, actual-identity guards, shared MockAgent net refusal and fake providers remained active. Synthetic fixture writes used B's database only.

| Actual command/check | Result |
|---|---|
| `node --import tsx /tmp/joboss-b-corrections-03-evidence/run-suite.mjs red.log test/delivery/corrections-03.test.ts` before guard edit | Exit 1; **2 failed / 117 passed**, expected defect-catching regression evidence; `red.log` |
| `node --import tsx /tmp/joboss-b-corrections-03-evidence/run-suite.mjs suite.log` → `vitest run --config test/delivery/vitest.config.ts --reporter=verbose` | Exit 0; **11 files / 320 tests passed**, **20.66 seconds**; no failures or skips; `suite.log` |
| `npm run lint` | Exit 0; no diagnostics; `lint.log` |
| `npm run check:no-raw-http` | Exit 0; approved raw-client boundary clean; `network.log` |
| `npx prisma validate` | Exit 0; schema valid; `schema.log` |
| `git diff --check` and trailing-whitespace checks on both added files | Exit 0; clean |
| `npx tsc --noEmit --incremental false -p tsconfig.backend.json` | Exit 2; exactly three existing D-owned TS2379 diagnostics; `backend.log` |
| `npx tsc --noEmit --incremental false` | Exit 0; separate UI check; `ui.log` (empty on success) |
| Guarded read-only `migrations.mjs` and read-only `live-preservation.mjs` | Both exit 0; preservation results below; `migrations.log`, `preservation.log` |

Backend diagnostics remain `compose.ts:590:115`, `queue-draft.ts:223:76` and `queue-draft.ts:223:267`, from optional `contactId` including undefined under exact optional property types. No new diagnostic appeared. No required check was blocked or skipped; no full repository/foundation rerun was performed.

Actual passing file counts, also retained in `test-counts.json`:

| File | Passed |
|---|---:|
| `test/delivery/corrections-03.test.ts` | 119 |
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

The existing pg concurrent-query deprecation warning appeared in synthetic concurrency runs; assertions completed successfully. It remains a future driver-upgrade compatibility limit and was not hidden.

## Preservation and remaining limits

All previous **201 tests and their assertions were unchanged and passed again**. This preserves independently closed RB-3a, original mixed-recipient RB-3b checks, RB-1 atomic approval/revocation ordering, RB-2 in-flight uncertainty/caps/dedup, RB-4 soft-bounce stops, RB-5 Auto-Submitted behavior and stop-preserving definite provider refusal. No accepted implementation was reopened for redesign.

Post-suite read-only B verification confirmed **13 completed immutable migrations**, every disk/applied SHA-256 checksum matching, no rolled-back record, and **11/11 protected index definitions matching**. Contact/company-slot first-touch predicates still require `touch_number=1` with `in_flight,sent`. The suite used normal `prisma migrate deploy`; no db push/reset, schema deployment to live, dropped constraint or migration edit occurred.

The protected live comparison used **BEGIN READ ONLY / ROLLBACK** only: **57/57 drafts, all 14 captured fields, 11/11 index definitions matched**; live send attempts **0**, completed live JOBOSS migrations **0**. All **16** protected file hashes (`.env`, stage, schema and 13 migration SQL files) matched the prior verified checkpoint. Stage remains **F5**; both `SENDING_ENABLED` and `SEND_EXTERNAL_RECIPIENTS_ENABLED` remain **false**.

An initial snapshot captured **332 existing workspace files**. Excluding the one authorized DSN-helper edit, **331/331 existing files remained unchanged**, including prior reports/tests, headers/matcher/classifier/sync, closed findings, shared configuration and current dirty work. Git HEAD and the exact staged diff matched the initial capture. New workspace files are only the focused test and this report. Content evidence: `files-before.json`, `git-before.json`, `content-preservation.json`.

D's substantive readiness validator/CLI integration and the three backend errors remain outside this assignment. Provider/mailbox authentication, full RFC/MIME parsing, runtime isolation, preparation/cohort integration, pilot operation and overall acceptance remain unverified. The existing automatic-execution isolation block/manual interface is unchanged. Ambiguous evidence deliberately keeps coverage incomplete for review/retry.

No outreach, real mailbox/inbox/send/OAuth/auth/model operation, live write/approval/deployment, sending enablement, paid service, dependency replacement, staging, commit, reset, agent or other-chat message occurred. All modeled sends, approvals and outcomes were synthetic fake-provider B fixtures. Yielding for independent review of this residual correction and preservation; no further assignment started.
