# C — Discovery corrections 01 report

15 October 2026, Asia/Kolkata. Original C builder, working directly in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`; no agents or chat dispatch.

## Disposition

**RC-1, RC-2 and RC-3 corrected within the assigned ownership; ready for independent R-C re-review.** This is builder verification, not independent acceptance. Final prescribed selection: **265/265 passed across nine files**, preserving all original 203 tests and adding 62 regressions. No shared change is requested for these three findings.

**RC-4/RC-5 remain blocked and untouched.** No scorer persistence edit, live rescoring, automatic execution or sending occurred. This report is returned through the human to the current orchestrator; no reviewer/scorer/D/E chat was started.

Read the correction packet, full R-C review, prior C report, original C assignment, PLAN, latest coordination/roadmap and current implementation. Read the reviewer reproduction scripts as evidence; did not rerun their expected-defect scripts or the scorer probes. Snapshotted 347 initial file hashes, HEAD and staged diff before edits. All fixture writes used **outreach_test_joboss_c** with the existing configured-live exclusion and actual read-only identity guards.

## Pre-fix evidence

Added the initial corrections regressions before changing production code and ran the three affected files through normal guarded setup:

```text
Test Files 3 failed (3)
Tests      31 failed | 107 passed (138)
Duration   3.70s
Exit       1
```

The failing assertions reproduced all three original funding sentences through actual persistence, nested supported-host URLs through ingestion/detection and membership, and second/later evidence and signal failures plus the already-partial YC hash. These were desired-correct-behavior assertions against the pre-correction source; their failures corroborate the review. Additional positive/negative controls were added subsequently. The red log is `/tmp/joboss-c-c01-evidence/red.log`.

RC-1/RC-2 correct false-verification paths in C's prior feature. RC-3 corrects the inherited record-hash-as-completion shortcut within the assigned YC ingestion scope. Prior positive source coverage, snapshots, ranking, handoff and accepted A/B behavior were retained.

## RC-1 — one supported funding relation

`fundingSupportExcerpt` now recognizes a deliberately narrow affirmative statement joining **company subject → funding action → attributed stage/round → event date**. The date must follow that round fact through a supported on/in clause, with no unrelated event or qualification borrowed before/after it. Stage cannot be taken from a participant such as Seed Capital. Supported direct examples include “Acme raised a Seed funding round on September 1, 2026”, has-secured/closed forms, exact/month/year precision and a numeric investor-count bridge. Existing calendar validation and the 180-day interval rule are unchanged.

Compound clauses, reported speech, negation, investor-name stages, different-company events and dates of product presentations stay indexed. Supported stages in this narrow verifier are pre-seed, Seed and Series-letter rounds. Amount-before-stage wording, named-investor prose and other free-form phrasing may require further primary research; this is not a general semantic checker. Amount/currency/participants retain independent **indexed** metadata even when stage/date pass.

Persistence uses the corrected rule for initial verification and revalidation/downgrade. Ranking already called this helper and now also excludes rejected historical funding proof from fallback fit/launch/citation reuse. This prevents an old unsupported funding row from being reinterpreted as a verified launch hook. Ranking does not mutate those FundingRecords; actual live repair remains unauthorized.

Executed four persistence/legacy-ranking controls, including all three exact reported sentences and a semicolon/other-company variation:

| Input relation | Fresh storage | Already-stored false primary row in ranking | Subsequent controls |
|---|---|---|---|
| Other company's Seed/date borrowed from Acme's old Series B | indexed | early stage false; no trigger; bad evidence uncited | valid source verifies, changed source downgrades |
| Seed Capital investor mistaken for Seed stage | indexed | early stage false; no trigger; bad evidence uncited | valid source verifies, changed source downgrades |
| Old Seed plus a recent product-presentation date | indexed | early stage false; no trigger; bad evidence uncited | valid source verifies, changed source downgrades |
| Semicolon with Otherco's announced Seed | indexed | early stage false; no launch/funding trigger; bad evidence uncited | valid source verifies, changed source downgrades |

Representative actual synthetic FundingRecord `01a13e86-7e2a-76e8-a201-f2666153db4d`, old bad evidence `01a13e86-7e2d-70aa-8091-621a8ec0b88c`: fresh indexed, legacy earlyStageVerified=false, trigger kind=none/verified=false, bad evidence cited=false. Full executed outputs: `rc1.json`. The old row fixture includes an actual publishedAt, so the fallback-trigger rejection is exercised.

The required 14-investors/October-month versus October-14 regression, stage/investor substring and company identity negatives, impossible/future dates, exact/month/year/unknown precision, 180-day boundary/partial intervals, original-source retries/downgrades, round deduplication and field uncertainty all remain passing.

## RC-2 — exact parsed ATS identity through every consumer

A single `detectAtsInUrl` parser now binds the **actual parsed global hostname and supported pathname** to its own vendor/token. Query/fragment/path text describing another URL cannot supply that identity. Whole outer URLs are extracted once from text rather than rescanning their nested substrings. Hosted board/posting paths and approved API URL shapes remain supported. The only query-derived token is a single valid `for` parameter on the supported Greenhouse embed job_board(/js) path and Greenhouse board origin. Both legacy/current Greenhouse board hosts, valid Lever/Ashby formats and ordinary ambiguity handling are preserved.

HTTPS, credentials, port, token, wrong-vendor/token and regional/custom refusal boundaries remain. No API registry or transport exemption was changed. Stored ownership validates its complete URL text through the same parser. Fresh detection/save also uses that exact identity and the matching fetched company evidence excerpt; no truncated regex substring is treated as a separate board proof.

Actual synthetic end-to-end results for the review URL and three query/fragment/path variations:

```text
verified Greenhouse/acme board returns nested foreign URL:
  fetched=0, created=0, complete=false; no new Opportunity
legacy foreign Opportunity + matching content-hash evidence:
  collector eligible=0; no ATS citation; research fit.supported=false
old ownership evidence with nested URL (other bindings/hash/time retained):
  hasBoardToken=false; ingestion weak_evidence; supported fit=false
fetched employer nested-only markup:
  found=false; forged old detection cannot be saved
```

Representative URL: `https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme`; synthetic company `01a13e86-7ef1-75fa-8b43-b32c3f8d3484`. All four outputs have empty citedEvidenceIds. Full snapshots: `rc2.json`.

Positive production-path controls fetch employer markup, detect/save proof, ingest a valid posting, admit one collector opportunity and obtain supported ATS fit for both legacy Greenhouse embeds, the current-host embed and the approved jobs API URL. Pure controls additionally preserve valid Lever/Ashby hosted/posting/API paths and the remaining Greenhouse formats. Nested supported-host queries/fragments/paths, duplicate/missing embed identity, malformed encoded token, hostile origin, wrong token/vendor, HTTP, credentials, custom port and regional URL negatives pass.

Read current first-party [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever postings API](https://github.com/lever/postings-api) and [Ashby public postings API](https://developers.ashbyhq.com/docs/public-job-posting-api) documentation read-only for format context. No live board dataset was ingested. Unrecognized routes remain unavailable rather than triggering a new transport. Earlier incomplete/ambiguous legacy proof may need fresh employer capture; this pass performs no live backfill.

## RC-3 — repair required YC provenance before completion

The record-hash lookup no longer returns early. It verifies/repairs the record row, each nonempty YC_SOURCE_KEYS row and a correctly record-bound yc_profile signal before reporting unchanged. Lookups bind company, source URL/type, structured-feed capture, person scope, content hash and exact verbatim excerpt. Missing rows are written idempotently; a failed write propagates to the existing paused preparation state. Progress already durable remains available for retry. This uses repairable sequential persistence, not a claim of new whole-item atomicity or distributed locking.

An existing record evidence row remains unchanged. Newly repaired per-key captures use the retry's observation time; the repaired profile signal retains its referenced record's original observedAt. The pre-existing partial fixture uses a record observed October 1 and an October 15 repair, verifies the original record byte-for-byte, and verifies signal/record timestamp binding. Company lifecycle/operator status, reviewed website/tags, verbatim source facts, host setup and budget behavior remain protected.

Injected real write failures while executing **actual prepareDiscovery**, with its unchanged production handler/cursor implementation:

| Failure point | Durable YC evidence / profile signals before resume | After same-batch resume | YC source state | Subsequent unchanged replay |
|---|---:|---:|---|---:|
| Second Evidence.create | 1 / 0 | 9 / 1 | paused → completed | 1 |
| Sixth Evidence.create | 5 / 0 | 9 / 1 | paused → completed | 1 |
| yc_profile signal create | 9 / 0 | 9 / 1 | paused → completed | 1 |

For each, every required key/excerpt/hash/source is checked, exactly one profile signal cites the record row, batch and all three source run IDs stay unchanged, source counts finish **1/1/1 with union 1**, and another runSeedIngest reports unchanged=1 without adding evidence/signals. Already-partial record-only provenance also repairs to 9 rows/1 signal while preserving excluded/acquired/operator fields.

Representative second-write recovery batch `4348684b-34ae-4f8b-b216-f792910d4824`, company `01a13e86-7fc6-764d-9ad4-626da88943b4`. Exact states/IDs/errors are retained in `rc3-second-evidence.json`, `rc3-later-evidence.json` and `rc3-signal.json`. These are executed synthetic observations, not the final real cohort.

## Verification

Final required selection, normal serial setup, guarded immutable migrate deploy, existing network-disabled MockAgent and fixture providers:

```text
npx vitest run test/unit/discovery-sources.test.ts test/integration/discovery-c.test.ts \
  test/integration/ats-ingest.test.ts test/integration/ats-adapters.test.ts \
  test/integration/seed-loader.test.ts test/integration/scoring-persistence.test.ts \
  test/integration/llm-handoff.test.ts test/unit/scoring.test.ts \
  test/unit/ats-signatures.test.ts --reporter=verbose

Test Files 9 passed (9)
Tests      265 passed (265)
Duration   13.67s
Exit       0
```

| File | Passed |
|---|---:|
| `test/integration/discovery-c.test.ts` | 43 |
| `test/integration/seed-loader.test.ts` | 21 |
| `test/integration/ats-ingest.test.ts` | 14 |
| `test/integration/scoring-persistence.test.ts` | 19 |
| `test/integration/llm-handoff.test.ts` | 15 |
| `test/integration/ats-adapters.test.ts` | 22 |
| `test/unit/discovery-sources.test.ts` | 61 |
| `test/unit/scoring.test.ts` | 25 |
| `test/unit/ats-signatures.test.ts` | 45 |

All 203 original assertions remain; added 62: 18 funding, 40 ATS and 4 YC interruption/legacy-repair tests. All **15 handoff** assertions and their production ownership helpers are unchanged. No weakening of shared citation/schema/redaction/authorship or test-target checks occurred. The 19 scoring-persistence tests are a required preservation input, not closure of RC-4/RC-5.

Separate checks:

| Check | Result |
|---|---|
| npm run lint | exit 0 |
| npm run check:no-raw-http | exit 0 |
| npx prisma validate | exit 0 |
| git diff --check | exit 0 |
| npx tsc --noEmit --incremental false | UI exit 0 |
| npx tsc --noEmit --incremental false -p tsconfig.backend.json | exit 2; only the same three D-owned TS2379 errors |
| Guarded read-only preservation script | exit 0 |

D errors remain compose.ts:590:115 and queue-draft.ts:223:76 / 223:267, possibly undefined optional contactId. No correction-owned diagnostic remains. Intermediate development failures were resolved; the final results above are actual completed runs. No install/version/lockfile changes, check bypass, broad foundation/delivery rerun or full repository audit was needed.

## Preservation, scope and remaining blocks

Protected live comparison used **BEGIN READ ONLY / ROLLBACK**, explicitly confirming transaction_read_only=on. Results: **57/57 drafts, all 14 captured fields and 11/11 protected index definitions unchanged; zero SendAttempt rows; zero completed live JOBOSS migrations**. Read-only C inspection confirms **13 finished migrations**, every disk/applied SHA-256 matching, no rolled-back row, and the same 11 indexes. JOBOSS preparation checksum remains `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness remains `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. **Stage remains F5; both sending flags remain false.**

Of 347 captured initial files, 338 remain unchanged and nine have authorized edits. Protected files, including .env, earlier reports, orchestration documents, core/schema/migrations/configuration, shared test safety, package/lockfile, contacts/drafts/mail/send, collector, preparation caller, runner and scorer persistence, retain their captured content hashes. HEAD and staged diff are unchanged. The only new workspace file is this report. No reset/stash/clean/stage/commit, live writes/repair/rescoring/migrations/approval, mail/OAuth/auth/model calls, sending/enablement or paid service occurred.

Discovery/refresh/ranking public signatures and shared RankedOutreachCompany remain unchanged. Batch/source IDs, distinct source/union counts, frozen scopes/cursors, errors/partial states, request/page/scan caps and caller-serialized same-batch behavior remain as reviewed. Recipient selections and later assessment work remain protected by existing passing controls. Score weights/versions and joboss-v4 derivation label are unchanged in this correction.

RC-4 (persisting a collector-rejected open opportunity) and RC-5 (same-cycle cross-version Lead/status mutation beneath reviewed drafts) remain assigned to the future **S — Scorer persistence** boundary. Its source was not edited and its supplemental reproductions were not rerun here. Do not interpret this feature correction as application-rescoring integration acceptance.

Automatic subscription execution remains isolation_blocked; runner/readiness files are unchanged and no runtime execution was invoked. D still owns recipient/contact research, substantive @5 readiness/drafting/CLI integration and its three type errors; E owns preparation/review integration. Source completeness, unsupported funding phrasing/regional or custom ATS routes, and actual runtime/provider behavior retain their documented limits. No synthetic result counts toward the real 20-company/15 supported early-stage mobile/AI target. No correction work remains knowingly unfinished within RC-1–RC-3; independent review is the next gate.

## Exact changed files and evidence

- `src/ingest/ats/verified.ts`
- `test/integration/discovery-c.test.ts`
- `test/unit/discovery-sources.test.ts`
- `src/ingest/ats/detect.ts`
- `src/ingest/ats/signatures.ts`
- `src/ingest/discovery/funding.ts`
- `src/ingest/yc/seed-loader.ts`
- `src/intel/outreach/assess.ts`
- `test/unit/ats-signatures.test.ts`
- `docs/JOBOSS-C-CORRECTIONS-01-REPORT.md`

Evidence retained under `/tmp/joboss-c-c01-evidence/`: red.log, suite-final.log, individual lint/network/schema/backend/ui/whitespace logs, rc1.json, rc2.json, rc3-*.json, preservation.mjs/json and preservation-final.log, start-hashes.json, head, staged.patch, status and file-preservation.json. Temporary evidence may be cleaned by the OS; the material results are embedded above.

**Yielding to the current human/orchestrator for the existing R-C reviewer's bounded re-review.** No next worker or reviewer has been dispatched.
