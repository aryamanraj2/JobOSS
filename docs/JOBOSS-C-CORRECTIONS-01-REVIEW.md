# R-C — Discovery corrections 01 review report

15 October 2026, Asia/Kolkata. Independent review of C corrections 01 in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. Read the re-review/correction packets, C correction report, original R-C findings, corrected production/tests and latest coordination/roadmap. Worked directly, without agents or chat dispatch. Source/tests/configuration and existing reports remained read-only.

## Verdicts

**RC-1 CLOSED. RC-2 CLOSED. RC-3 CLOSED. C feature corrections accepted within the reviewed synthetic/deterministic scope.** Independently reproduced **265/265 passing tests across the prescribed nine files**, then verified the original failure boundaries and meaningful additional controls through production functions. No residual actionable defect was demonstrated within this correction scope. Prior positive discovery/funding/freshness/ranking evidence and accepted A/B findings remain intact; their broad reviews were not restarted.

**Scorer persistence/integration STILL BLOCKED.** RC-4 (attaching a collector-rejected open posting) and RC-5 (same-cycle cross-version Lead/status mutation beneath reviewed drafts) remain independently confirmed and untouched. Passing scoring-persistence tests do not close them. `src/intel/scoring/run.ts` and its default caller/interface are unchanged. The known-defect probes were deliberately not rerun; no live scoring occurred.

This closes the bounded C correction gate so the human/orchestrator can select the next separately authorized assignment. It does not launch S, D, coverage work, runtime or E. Broader YC directory/listed-job/speculative coverage, real source completeness, recipient/readiness integration, automatic isolation/enablement and the real 20-company/15 evidenced early-stage mobile/AI cohort remain open. No outreach or sending is accepted or enabled.

## RC-1: relational funding support and old stored evidence

Reviewed [funding.ts:54](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/discovery/funding.ts:54), its same-fact prefix/date checks, and [assess.ts:34](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/intel/outreach/assess.ts:34)'s exclusion of rejected old funding proof from fit, trigger and citation inputs.

Independently executed `storeFundingRound`, pure assessment and persisted research ranking for all three original sentences:

1. “Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.”
2. “Acme raised funding from Seed Capital on September 1, 2026.”
3. “Acme raised Seed funding in 2023 and presented its product on September 1, 2026.”

Added two independently selected wording controls:

- “Acme closed a Series B round in 2023; Otherco secured its Seed round on September 1, 2026.”
- “Acme raised Seed funding in 2023 and introduced our iOS SwiftUI mobile app on September 1, 2026.”

Each used indexed Acme / Seed / 2026-09-01, an allowed synthetic employer announcement page and actual production capture/persistence. All **five** stored **indexed** with stage/date/amount/currency/investors explicitly indexed in metadata. Original date text **2026-09-01** and **date** precision remained separate from observation time. Actual indexed evidence was `external_source`, pointing to the index rather than falsely capturing primary support.

For each case, then created an already-stored synthetic **primary_verified** FundingRecord pointing to the bad company-page excerpt, with **publishedAt=2026-09-01** and fresh observation. Neither the pure assessment nor `rankOutreachCompanies` trusted it: **fit.supported=false, earlyStageVerified=false, trigger.kind=none**, and the bad evidence ID was uncited. The fifth case contains mobile vocabulary and “introduced”, so this checks fallback fit/launch reuse, not just absence of a funding trigger. Ranking left that FundingRecord, an existing deferred Lead and its attached awaiting-approval Draft byte-for-byte unchanged in all five cases. No scorer/approval/send function was invoked to construct these synthetic preservation fixtures.

Explicitly revalidated each round against **“Acme raised a Seed funding round on September 1, 2026.”**: all five became **primary_verified**, the captured primary excerpt exactly matched the valid sentence/company/source URL, and assessment returned **earlyStageVerified=true** with a **verified funding trigger**. Amount/currency/participants stayed **indexed**. Changing the same synthetic source back to its unsupported text downgraded all five to **indexed** without duplicating the stable event record.

Representative independent synthetic record: `01a13ea2-1aac-7008-a83c-ea1d0b53a3c9`; old rejected evidence `01a13ea2-1ab1-75f7-b85a-21b9a76373cc`. Full persisted fields, metadata, excerpts, ranks and revalidation outputs are retained in `recheck.json`.

The prescribed tests preserve the 14-investors/October-month versus October-14 negative, impossible/future dates, exact/month/year/unknown precision, conservative 180-day intervals, deduplication, original-source retry and field-level uncertainty. Supplemental date controls also passed: exact 180-day boundary accepted; September month accepted; overlapping/future October month, year-only and future exact date rejected; February 30 remains unknown. Valid has-secured/closed/pre-seed/Series A and investor-count-bridge controls pass in the suite.

The grammar intentionally supports a narrow direct affirmative company/action/round/date relation. Named-investor prose, amount-before-stage wording, compounds and other unsupported forms may remain indexed. That conservative availability limit is disclosed; this review neither requires a general language verifier nor certifies arbitrary natural-language truth.

## RC-2: actual ATS URL identity through detection, storage and consumers

Reviewed the shared exact parser in [signatures.ts:8](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/ats/signatures.ts:8), whole-outer-URL extraction, [verified.ts:14](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/ats/verified.ts:14) stored proof checks and [detect.ts:193](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/ats/detect.ts:193) save validation. Parsed hostname/path and the allowed Greenhouse embed parameter now provide one vendor/token identity; consumers share that identity.

Independent production-function probes used five outer-URL cases:

| Outer URL case | Actual parser/detection identity | Greenhouse/acme membership |
|---|---|---|
| Original `https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme` | none | refused |
| Lever foreign posting with nested Greenhouse URL in query | Lever/foreign | refused |
| Lever foreign posting with nested Greenhouse URL in fragment | Lever/foreign | refused |
| Lever path containing another full URL | none | refused |
| Greenhouse foreign posting with nested acme URL in query | Greenhouse/foreign | refused |

Each case first had a genuinely fetched/saved Greenhouse/acme ownership proof and one valid ingested role. A subsequent board snapshot containing only the foreign nested URL returned **fetched=0, complete=false**. The previously valid role stayed **open**, no invalid Opportunity was created, and no new complete numeric board-count signal was published. This explicitly checks that filtering an invalid row does not become an empty complete refresh that closes valid work.

Next created a legacy invalid open Opportunity with corresponding fresh ATS excerpt/current content hash. Actual collector returned **zero eligible opportunities**, excluded that ATS evidence from citations, and actual assessment returned **fit.supported=false** without that evidence citation. Existing valid posting was closed only as a direct fixture step to isolate the legacy invalid input; this was not importer behavior.

Then replaced only the stored ownership excerpt with the nested URL, keeping otherwise correct company/hash/time/evidence bindings. `verifiedOwnership` returned **false**, collector `hasBoardToken=false`, and ingestion refused with **weak_evidence**. Fresh employer markup containing only the original nested URL failed detection, and a forged Greenhouse/acme detection object could not be saved. For real outer foreign-board URLs, fresh detection correctly reports that actual outer vendor/token; it never takes acme from the nested URL. Thus the fix rejects the bad input before eligibility, rather than hiding it only in final ranking.

Positive supplemental controls exercised **13 URLs** through actual employer markup → detect → save → stored-proof verification → membership: legacy/current Greenhouse hosted/job paths, legacy/current supported embeds, Greenhouse API jobs URL, Lever hosted/apply/list/detail API URLs and Ashby hosted/application/API URLs. All retained their own expected vendor/acme identity. The suite additionally exercises valid Greenhouse proof → ingest → collector → supported research fit, and ordinary legacy/current token/ambiguity controls. Supplemental negatives reject duplicate/missing embed `for`, hostile/custom origin, HTTP, credentials, custom port, EU route and encoded slash tokens. A real outer board with a nested description remains its own board, never the embedded board.

First-party format context was checked read-only: [Greenhouse's embed instructions](https://support.greenhouse.io/hc/en-us/articles/46365908766875-Embed-a-Greenhouse-job-board-on-your-career-site) require the script/token to match the board; its [Job Board API](https://docs.greenhouse.io/job-board.html) documents the board-token GET routes. [Lever](https://github.com/lever/postings-api) documents separate global/EU sites and namespaced posting routes; [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api) documents its board-name GET route. These are documentation checks plus synthetic supported-format tests, not live board measurements or a claim every current embedding style is supported. Regional/custom/unknown routes remain conservative refusals. No gateway/API-registry expansion occurred.

## RC-3: repairable sequential YC persistence through real preparation

Reviewed [seed-loader.ts:263](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/yc/seed-loader.ts:263) onward. A prior record hash is no longer completion: required record/key rows must match company, source URL/type, capture method, null person scope, exact excerpt and content hash, and a yc_profile signal must cite the record with its observation time. Missing work repairs sequentially before unchanged is returned. No new whole-item transaction, schema or distributed lease is claimed.

Independently injected database storage failures through **actual prepareDiscovery → production YC seed handling**, using only a proxy that fails the selected database create call. No replacement candidate handler or altered preparation/scoring logic was used. Resume occurred the next day, **2026-10-16**, against the same frozen synthetic batch scope:

| Injected failure | Durable YC evidence / profile signals before resume | After resume | YC state | Subsequent unchanged ingestion |
|---|---:|---:|---|---:|
| second-evidence | 1 / 0 | 9 / 1 | paused → completed | 1 |
| later-evidence | 5 / 0 | 9 / 1 | paused → completed | 1 |
| signal | 9 / 0 | 9 / 1 | paused → completed | 1 |

Each recovery verified **all eight required nonempty YC source keys**, plus the record row, with exact source URL, `yc` source type, `structured_feed` capture, null contact/person scope, correct company/hash/excerpt and observation timestamps. Exactly **one** profile signal cites the record and uses its original observation time. Original record captured October 15 remains October 15; newly repaired rows honestly use the October 16 retry time. Durable earlier key rows may keep their earlier capture time. Host policy and company budget setup exist afterward.

Each resumed summary preserved batchId and all three source row IDs, returned **1/1/1 source counts, distinct union 1, complete=true**, and retained the source error history. Another unchanged production seed ingestion returned **unchanged=1** with byte-for-byte identical evidence/signals. Another completed-batch resume made **zero requests**. Independent recovery batches:

- second-evidence: `5415dc96-cca0-44b6-9c34-f7a6a5992b07`; source IDs: `01a13ea2-1c39-757b-8e1b-49c7e6e47510`, `01a13ea2-1c39-757b-8e1b-4deea1afe3ce`, `01a13ea2-1c39-757b-8e1b-52d88ee942da`.
- later-evidence: `d6ef1e5d-aaf5-4cb2-95fd-28073729e8e8`; source IDs: `01a13ea2-1c92-7489-b829-037de9b5a0c5`, `01a13ea2-1c92-7489-b829-0426b969f9f3`, `01a13ea2-1c92-7489-b829-0a19d9e7b73c`.
- signal: `8e63fb3d-ad03-44e5-a82c-4cb439fe3acd`; source IDs: `01a13ea2-1cdc-707f-908f-5cc5054f1a57`, `01a13ea2-1cdc-707f-908f-600618fc63d6`, `01a13ea2-1cdc-707f-908f-65fee93ed73c`.

The already-partial old-hash control used a record captured **October 1** and repair **October 15**. It also included **three misleading same-key evidence rows**, respectively wrong source URL, wrong capture method and person-bound; none satisfied required provenance. Preparation repaired all eight keys and one correctly record-bound signal: **9 valid required rows**, **12 total including untouched decoys**. The original record remained byte-for-byte unchanged; repaired keys use October 15, while the profile signal retains October 1. The next replay added no evidence/signals.

Operator state remained **excluded**, lifecycle **Acquired**, reviewed website `https://reviewed.acme.example`, and operator tags were preserved alongside mobile. Host/budget setup and constraints remain. This closes the original inherited mid-item provenance defect without a cursor redesign. Same-batch work remains caller-serialized as before.

## Exact independent verification

All fixture writes used **outreach_test_joboss_c exclusively**, via a process-only TEST_DATABASE_URL. Shared configured-live exclusion and `verifyTestTarget`'s actual read-only database identity check ran before normal immutable migration setup and fixtures. Standard serial files, shared setup, network-disabled MockAgent and fixture fetchers were retained. Supplemental probes also installed outbound-network refusal. No `.env` edit, guard bypass, db push/reset, dropped constraint, dependency install or generation occurred.

Executed once, without repeating the unchanged successful selection:

```text
vitest run test/unit/discovery-sources.test.ts test/integration/discovery-c.test.ts test/integration/ats-ingest.test.ts test/integration/ats-adapters.test.ts test/integration/seed-loader.test.ts test/integration/scoring-persistence.test.ts test/integration/llm-handoff.test.ts test/unit/scoring.test.ts test/unit/ats-signatures.test.ts --reporter=verbose
Test Files 9 passed (9)
Tests 265 passed (265)
Duration 11.01s; exit 0
```

| File | Passed |
|---|---:|
| `test/integration/seed-loader.test.ts` | 21 |
| `test/integration/discovery-c.test.ts` | 43 |
| `test/integration/llm-handoff.test.ts` | 15 |
| `test/integration/scoring-persistence.test.ts` | 19 |
| `test/integration/ats-ingest.test.ts` | 14 |
| `test/integration/ats-adapters.test.ts` | 22 |
| `test/unit/discovery-sources.test.ts` | 61 |
| `test/unit/scoring.test.ts` | 25 |
| `test/unit/ats-signatures.test.ts` | 45 |

Matched every **203 original passing test titles** from the retained independent initial suite against this execution: none missing. Added regression count is **62**: 18 funding, 40 ATS, four YC. Reviewed new production-path assertions and confirmed the narrowly corrected handoff file/helper are unchanged in this pass; all **15 handoff tests** retain production ownership, foreign-citation/schema/allowset/redaction checks. Tests of source pagination/resume, funding dates, ATS incomplete/empty/returning/A→B→A, research ranking without ATS, unknown eligibility and recipient-selection preservation continue to pass. These meaningful regressions preserve earlier evidence without restarting the initial audit or A/B review.

| Separate check | Actual result |
|---|---|
| npm run lint | exit 0 |
| npm run check:no-raw-http | exit 0 |
| prisma validate | exit 0 |
| git diff --check | exit 0 |
| tsc --noEmit --incremental false | UI exit 0 |
| tsc --noEmit --incremental false -p tsconfig.backend.json | exit 2; only three existing D-owned TS2379 errors |
| Guarded independent recheck.mjs | exit 0; all desired-result controls above |
| Guarded preservation.mjs | exit 0; actual live/C read-only comparison |

D errors remain **compose.ts:590:115**, **queue-draft.ts:223:76** and **223:267**, from possibly-undefined optional contactId under strict optional-property typing. No correction-owned diagnostic appeared. UI success is not represented as a clean backend build. No required check stalled or was skipped.

## Preservation and unchanged contracts

Captured **349 existing file hashes**, HEAD/status and staged binary diff before execution. All captured file contents remain unchanged by this review; the only new workspace file is this report. HEAD **6113f8db59cd8c3a213f090cdfd3946e80bc5e42** and staged diff are unchanged. No Git mutation, staging/commit/reset/stash/clean occurred. Existing tests write freshly executed synthetic snapshots to their established C temporary paths; those were copied into the new R-C evidence directory, not represented as the builder's earlier run.

Compared C's retained start inventory to current files: exactly the **six assigned production files** and **three assigned test files** differ within application/tests. Three orchestration documents changed after C's inventory checkpoint; these are current orchestration context and were preserved. C's report and the review packet were later additions. Shared core/schema/migrations/config/registry/runner/collector/preparation/scorer, handoff, delivery, package/lockfile and earlier reports retain their captured contents. In particular no scorer fix or automatic-runtime change was smuggled into the correction.

Live comparison used **BEGIN READ ONLY / ROLLBACK**, confirmed transaction_read_only=on, and matched **57/57 drafts across all 14 captured fields** and **11/11 protected index definitions**. Live SendAttempt rows **0**; completed live JOBOSS migrations **0**. C-target read-only inspection matched **13 finished immutable migration checksums**, no rolled-back record, and the same **11 protected indexes**. JOBOSS preparation hash remains `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness hash remains `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. Config independently reports **F5**, **SENDING_ENABLED=false**, **SEND_EXTERNAL_RECIPIENTS_ENABLED=false**.

Public prepareDiscovery/refreshDiscoveryBoards/rankOutreachCompanies signatures and shared RankedOutreachCompany are stable. Batch/source IDs, distinct counting, frozen scopes, caps/errors/partial states and caller-serialized same-batch contract remain. D-owned selected recipients/later assessment state and Lead/draft history remain protected by ranking. This says nothing new about the separate scorer mutation boundary.

Automatic execution remains the accepted **isolation_blocked** interface with manual handoff available: runner/readiness files are unchanged; no automatic/auth/model execution was invoked in this review. D's recipient/readiness/CLI work and three type errors, E integration, actual provider/mailbox/runtime behavior and final cohort remain unfinished.

**Broader YC coverage remains separately queued.** Current recent-company filtering is still 2024–2026 cohort years/team 1–250 or unknown and is narrower than the human's all-potentially-suitable-company requirement. Corrections 01 does not implement broader batches/sizes, full current YC listed-job coverage or suitable speculative inquiries across that broader directory. Those gaps are retained explicitly; they are not newly imposed on RC-1–RC-3 or counted as corrected here.

Retained independent evidence: `/tmp/joboss-rc-c01-evidence/` contains `recheck.mjs/.json/.log`, suite/check logs, copied fresh suite synthetic outputs, preservation script/results, inventory and start/final file/Git snapshots. Material results and representative IDs are embedded in this report so conclusions do not depend solely on temporary files.

Explicitly unperformed: full repository/initial-source/A/B reruns, RC-4/RC-5 defect reprobes, live discovery/ATS ingestion or rescoring/repair/migrations/approval, mailbox/OAuth/provider/model operations, automatic enablement, paid services and sending. No source/test/config edits, fixes, next worker/reviewer assignment or chat dispatch occurred.

**Final disposition: RC-1–RC-3 closed; C corrections accepted within reviewed deterministic/synthetic scope; scorer integration remains blocked. Yielding this report to the current human/orchestrator.**
