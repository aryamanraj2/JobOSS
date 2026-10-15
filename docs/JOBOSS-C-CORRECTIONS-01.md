# C — Discovery corrections 01: RC-1–RC-3

15 October 2026, Asia/Kolkata. Run in the **same original C — Discovery/funding/freshness builder chat**, in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. This is the **sole next assignment** once the human runs the prompt; start is not confirmed by issuing this packet. R-C has yielded and stays idle during edits. A/R-A/B/R-B remain accepted/idle; scorer work, D/E/V and runtime enablement remain queued. Do not spawn agents, create/dispatch chats or message other chats.

## Objective and reading order

Correct only the three independently confirmed C-feature findings in `docs/JOBOSS-C-DISCOVERY-REVIEW.md`: **RC-1 P1 funding relational support; RC-2 P1 exact ATS URL binding; RC-3 P2 interrupted YC provenance**. C feature verdict remains changes required until independent R-C re-review. The two confirmed scorer defects RC-4/RC-5 remain integration blockers and are outside this edit assignment.

Read this packet, the full independent review, your existing `docs/JOBOSS-C-DISCOVERY-REPORT.md`, `docs/JOBOSS-WORKER-03-DISCOVERY.md`, `/Users/aryamanjaiswal/Downloads/PLAN.md`, and the latest coordination/roadmap checkpoint. Preserve prior positive evidence and closed A/B findings; do not restart broad audits. Reviewer evidence, if still present: `/tmp/joboss-rc-evidence/probes.mjs`, `discovery-probes.mjs`, `pure.mjs` and their JSON/logs. Read scripts before reuse. Their expected-defect exit 0 is not proof of corrected behavior.

## Single ownership and interfaces

C owns only the following production edits for this pass:

- `src/ingest/discovery/funding.ts` and, only as required to apply the same support rule to stored evidence, `src/intel/outreach/assess.ts`.
- `src/ingest/ats/verified.ts`, with narrowly necessary exact-URL extraction changes in `src/ingest/ats/detect.ts` and `src/ingest/ats/signatures.ts`. Existing posting ingestion and downstream collection/ranking should consume the corrected shared board check. If another production consumer requires an edit beyond this list, report the exact bounded request before editing it; complete independent in-scope work meanwhile.
- `src/ingest/yc/seed-loader.ts` for durable/repairable per-seed provenance. `src/ingest/discovery/prepare.ts` is a read-only caller for interruption/resume verification, not a cursor redesign assignment.

Owned regression files: `test/unit/discovery-sources.test.ts`, `test/unit/ats-signatures.test.ts`, `test/integration/discovery-c.test.ts`, `test/integration/ats-adapters.test.ts`, `test/integration/ats-ingest.test.ts`, `test/integration/seed-loader.test.ts`, plus narrowly necessary synthetic helpers in `test/fixtures/discovery-support.ts`. Other tests are read-only regression inputs. Write a new report, `docs/JOBOSS-C-CORRECTIONS-01-REPORT.md`; preserve earlier implementation/review reports and orchestrator documents.

All core/schema/migrations/configuration/task-registry/test-safety helpers, package/lockfile, contacts/drafts/mail/send code and **`src/intel/scoring/run.ts`** remain read-only. No ownership transfer to A is implied. The orchestrator reserves a separate future **S — Scorer persistence** assignment for RC-4/RC-5; no S chat or packet is launched now. Collector eligibility and same-cycle preservation contracts will be bounded there after this feature correction/review. Do not partially fix scorer persistence here or call it accepted.

Keep public discovery/refresh/ranking signatures and shared `RankedOutreachCompany` unchanged. Preserve source/batch IDs, distinct counts, frozen scopes/cursors, partial/error states, gateway contracts, caller-serialized same-batch behavior, recipient selections and later assessment fields. No schema/migration/API registry expansion, historical score retuning, automatic execution enablement or live data repair is authorized.

## RC-1 — bind one funding fact through persistence and ranking

The current sentence-wide matcher independently finds the company/action, stage and date, allowing them to describe different events or people. With indexed Acme / Seed / 2026-09-01, all three reviewer sources incorrectly became primary_verified and generated verified early-stage/recent-funding output:

1. `Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.`
2. `Acme raised funding from Seed Capital on September 1, 2026.`
3. `Acme raised Seed funding in 2023 and presented its product on September 1, 2026.`

Require supported company, funding action, round stage and event date to describe the **same fact**. Conservatively retain ambiguous clauses, investor-name stages and unrelated dates as indexed rather than verified. A positive source such as `Acme raised a Seed funding round on September 1, 2026.` must still verify. Document conservative unsupported phrasing instead of claiming a general semantic checker.

Verify both fresh `storeFundingRound` results and ranking of already-stored synthetic primary_verified rows with unsupported excerpts: changing persistence alone must not leave ranking trusting the old false support. Cover revalidation/downgrade and ensure bad support produces neither verified early stage nor a verified funding trigger/citation. Indexed hints may remain explicitly indexed. Amount/currency/participants keep independent indexed status; do not promote them with stage/date. Retain the 14-investors/month, investor substring, company identity, impossible/future/year/month precision, 180-day interval, dedup and original-source controls. Test meaningful variations, not only equality with the three reported strings.

## RC-2 — bind the actual parsed origin/path to one vendor/board

`https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme` currently passes Greenhouse/acme membership because an allowed outer hostname is combined with regex hits anywhere in the original string. The reviewer reproduced both employer detection/save and a foreign posting admitted through ingestion, collector and ranking.

Use actual parsed hostname and supported path structure for the same vendor/token. Only a documented embed parameter on its proper origin/path may supply a token; arbitrary query/fragment/path text describing a different URL cannot establish that board. Preserve HTTPS/credential/port/token checks, supported global hosts and the existing regional/custom refusal boundary. Detection and posting membership must use the same exact identity. Existing stored synthetic ownership proof containing the nested URL must also fail validation; a corrected fresh detector alone is insufficient.

Add end-to-end negative controls for fetched employer markup → detection/save, and for a genuinely verified board returning the nested foreign posting → ingest → collector/ranking. Unsupported URLs must not establish ownership, an eligible posting, supported fit or ATS-backed citations. Cover supported-host query/fragment/path variants and wrong vendor/token; ordinary hostile-host negatives still apply. Preserve actual valid hosted boards, posting paths, approved API URLs and documented Greenhouse embeds, with normal ambiguity handling. Consult first-party documentation read-only if a URL-format decision needs it; no new transport or registry exemption. Do not solve this by broadly trusting ATS domains or by hiding an invalid row only at final scoring.

## RC-3 — finish or repair YC provenance before marking a record complete

The current record-hash early return accepts any prior YC Evidence row as completion. The reviewer interrupted the second Evidence.create: record evidence committed, per-key evidence and yc_profile signal did not; retry then claimed unchanged and preparation complete with just one evidence row and zero signals.

Make required provenance durable together or repair missing required per-key rows/signal before treating a record hash as complete. Also handle the already-partial synthetic state left by the old implementation: retry must repair it or honestly remain blocked, rather than falsely completing. Use the existing transaction-compatible Db/helpers as applicable; do not change shared schema, constraints or safety helpers. Preserve company lifecycle/operator values, source bindings, verbatim per-key excerpts, legitimate unchanged-run idempotence, signals, host/budget setup and observation semantics.

Inject a real mid-item storage failure through **actual prepareDiscovery**, including the second Evidence.create case. Resume the same batch through production ingestion and verify complete per-key provenance plus a correctly bound yc_profile signal, or an explicit unresolved state. Include failure later in per-key/signal work and a pre-existing partial-hash fixture. A subsequent successful unchanged replay must add no duplicate evidence/signals. Do not replace the production handler with a test implementation or rely solely on a cursor-update failure test.

## Verification, preservation and limits

All fixture writes use **outreach_test_joboss_c exclusively**, while R-C is idle. Process-only test URL; shared configured-live exclusion and actual read-only identity verification before normal immutable migrate deploy/fixtures. No .env edits, db push/reset, guard bypass, constraint removal or writes to live/common/other workers' databases. Retain serial suite setup, MockAgent outbound-net refusal and fakes. Restore/hydrate existing cloud placeholders only without changing dependency versions/lockfile or bypassing timeouts.

Run the original nine-file selection (independently 203/203 at review), plus added regressions in the owned files, with actual final file/test counts:

```text
test/unit/discovery-sources.test.ts
test/integration/discovery-c.test.ts
test/integration/ats-ingest.test.ts
test/integration/ats-adapters.test.ts
test/integration/seed-loader.test.ts
test/integration/scoring-persistence.test.ts
test/integration/llm-handoff.test.ts
test/unit/scoring.test.ts
test/unit/ats-signatures.test.ts
```

Preserve all 15 passing handoff assertions and production ownership paths; no weakening of citation, schema, redaction or authorship checks. The existing scoring-persistence suite does not close RC-4/RC-5. Do not execute `intel:run` or live rescoring; scorer defects remain explicit.

Run lint, network guard, Prisma validation, whitespace and UI/backend typechecking separately with incremental writes disabled. Report the three unchanged D-owned TS2379 contactId errors (compose.ts:590 and queue-draft.ts:223, lines may shift); do not fix them. No broad A/B rerun or full repository audit is required. Retain migration disk/applied hashes and the 11 protected indexes on C (13 migrations at review). JOBOSS hashes: preparation `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

If accessible, compare protected live baseline only in BEGIN READ ONLY / ROLLBACK: 57 drafts/all 14 captured fields, 11 index definitions, zero SendAttempt rows and zero completed live JOBOSS migrations. F5 and both sending flags remain false. Snapshot/preserve existing unowned file contents, HEAD and staged diff. Never restore others' changes, stage, commit, reset, stash or clean.

₹0 additional spending. No live discovery/ATS ingestion, live rescoring/migrations/approvals/data repair, mailbox/OAuth/auth/model/provider operations, sending or enablement. Automatic runtime remains isolation_blocked; manual interface remains valid. No synthetic result counts toward the final real 20-company/15 early-stage mobile/AI cohort.

## Report and yield

Save `docs/JOBOSS-C-CORRECTIONS-01-REPORT.md` and return it to the **current orchestrator chat**, labeled **C — Discovery corrections 01 report**. Include:

- RC-1/RC-2/RC-3 disposition, exact changed files and production behavior; inherited versus new behavior; any precise shared request.
- Actual regression evidence through persistence/ranking, ownership/ingestion/collector and preparation interruption/resumption, with positive controls and synthetic outputs. Record pre-fix failures where practical and final assertion results; no invented counts.
- Exact test/check counts/results, remaining D errors, preservation evidence and unchanged interfaces/coverage limits.
- Explicit remaining RC-4/RC-5 integration blocks, automatic-runtime/D/E/cohort limitations, and any unfinished resumable work.

Yield after the report. Do not start a reviewer, scorer worker or D. The orchestrator will return this bounded pass to the **same existing R-C reviewer chat**; re-review will target these findings and meaningful regressions, retaining already-demonstrated positives and closed A/B work.
