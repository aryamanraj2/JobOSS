# C — Discovery, funding and freshness report

15 October 2026, Asia/Kolkata. Workspace: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`.

## Result and acceptance boundary

Completed the owned deterministic discovery, funding, ATS freshness and additive research-priority implementation, with **203/203 tests passing across nine files**. This is a builder report for independent R-C review, not independent acceptance, a real-company cohort, or overall JOBOSS completion.

**Two reproduced application-scoring persistence defects remain outside C's ownership**, in `src/intel/scoring/run.ts`. They require the bounded shared-owner work below before integrating application rescoring under the new input version. C's filtered scoring inputs and research ranking pass their tests; this report does not claim the unowned persistence path is fixed.

Read PLAN, the assignment, accepted A/B reports, product survey, latest coordination, relevant source and initial dirty diff. Worked directly, without agents or messages to other chats. All application writes and fixtures used **outreach_test_joboss_c**. Automatic execution remains **isolation_blocked**. No outreach, sending enablement, live data writes/migrations, model/auth/mailbox calls, paid service, staging or commit occurred.

## Inherited behavior versus this implementation

The inherited partial feature already included conservative ISO date precision and interval recency, the exact-date pattern preventing “14 investors” from becoming October 14, recent YC small/unknown-size filtering, employer-link detection, snapshot completeness, missing-job closure and comparison against current posting content. Those were preserved and tested, not claimed as wholly new fixes. Historical acceptance reports were context; no pristine-baseline full suite was run in this assignment.

Current source inspection confirmed gaps: summed overlapping source totals; positional YC/HN resume; inadequate StartupDB funding checkpoints and drift/coverage handling; first-original-only funding checks and permanently trusted prior verification; timestamp-only ATS scoring trust; wrong-board/current-hash omissions; reranking that explicitly reset selectedContactId/status. Implemented durable scoped cursors and distinct unions, per-field funding uncertainty and revalidation, current ownership/content bindings, supported research fit and selection-safe reranking. Supplemental C-database probes independently demonstrated the two still-unfixed persistence seams below.

The stale handoff fixture now obtains synthetic employer proof through `detectAtsForCompany`/`saveDetection` and current ATS evidence through the production adapter/importer. Its allowset, citation, redaction, schema, ownership/task and validation assertions remain. No shared citation/handoff validator was changed. Related older ATS/scoring fixtures similarly use genuine synthetic fetched ownership. The real-gate ATS fixture now explicitly provisions its synthetic global budget rather than weakening the gateway.

## Exact interfaces and counting

```ts
prepareDiscovery(db, gate, { limit, runId?, now?, resume?, delayMs? }): Promise<DiscoverySummary>
// DiscoverySummary: { batchId, companyIds, sources, runIds, discovered, complete }
// SourceSummary: { source, runId, status, discovered, counts, coverage, errors }

refreshDiscoveryBoards(db, gate, companyIds, { now?, delayMs?, limit? } = {}): Promise<BoardRefreshResult[]>
// BoardRefreshResult: companyId, status, complete, optional detail/postings
// status: no_verified_board | source_failed | refreshed | partial | paused | missing_company

rankOutreachCompanies(db, { limit, now? }): Promise<RankedOutreachCompany[]>
assessOutreachCompany(company, now?): RankedOutreachCompany

ingestPostings(db, provider, company, { now?, maxPostings? } = {}): Promise<PostingIngestResult>
```

Discovery limit is an integer 1–200 and bounds **new distinct accepted companies per source/run per invocation**. A company already in the database can still be attributable to a new source/run. Duplicate identities in that source/run do not consume the emitted limit; their additional funding/provenance can still be handled. Source discovered counts are cumulative distinct company IDs within that run. `emittedThisInvocation` records the invocation's additions. Top-level discovered is the cardinality of the cross-source company-ID union, never a source-count sum. This limit is independent of E's final review-cohort size.

`runId` is the caller's batch/group identifier, not a DiscoveryRun row ID. New calls generate a UUID batchId if omitted and atomically create three source runs. An existing batchId requires resume. Resume requires exactly the three matching source rows; unknown/incomplete IDs reject before creating work. Without an explicit ID, resume selects the latest batch, including a completed batch. Completed sources are returned without refetching. Legacy cursors without the new scope/version are refused; no unrelated run is silently substituted.

`scopeNow` is frozen at batch creation for YC cutoff and HN selection; `now` on each invocation is observation time. Source row IDs and batchId are both returned. Provider cursors are version 2; preparation passes mutable copies while retaining a separate last-successfully-stored cursor. Candidate/funding handling precedes positional advancement. A checkpoint failure replays the last durable item, with stable company/round identities; it does not skip the item. Errors and available disclosures survive resume. Callers should serialize work on one batch: this is not a distributed same-batch lease implementation.

- **YC:** all-feed hash plus processed index; a changed feed pauses and requires a new batch. Scan is capped at 10,000 raw rows and 96 MiB response bytes. Malformed/invalid-domain/capped coverage remains partial. Active cohorts **2024–2026 inclusive** at the synthetic 2026-10-15 scope; this is an explicit cohort-year cutoff, not a precise rolling funding/event date. Teams 1–50 precede 51–250, then unknown size. Older growth-band commands remain. Existing excluded status, operator website/tags and inactive/acquired/public lifecycle stops survive re-import.
- **StartupDB:** exact seeded investor identity/name/domain, portfolio page hashes/offset/entry, pending company detail and accumulated funding pages/offset/hashes. Prior pages are revalidated before advancing a positional scope. Changed pages, loops, inconsistent totals/offsets, missing arrays and identity conflicts pause. API cap **120 requests/invocation**, scan cap **500 portfolio entries/invocation**, page size **25**, funding history cap **100 rounds/company**. Funding caps retain explicit omissions and partial coverage; omitted later pages are not claimed complete. Three permitted original URLs may be tried per round, separately from the API request counter, under normal gateway budgets/redirect controls.
- **HN:** frozen whoishiring submission IDs (at most 90), selected monthly thread IDs and comment IDs, per-thread comment position, scope time/months and scanned counts. Selects three available distinct monthly employer threads in the author's submission traversal; it does not require three consecutive calendar months. Verifies returned IDs, author, story type/title/time and comment parent/author identity. Scan cap **200 comments/invocation**, request cap **250/invocation**; missing threads remain partial. Comment ranking/reordering after selection cannot move the saved ID positions. Null/malformed selection items stop rather than silently disappearing. Deleted/dead, seeking-work, explicit recruiters and ambiguous employer routes are rejected. A public post/author is still unverified employer responsibility; no verified contact is created. Source text capture is bounded at 5,000 characters, with truncation disclosures.

`complete` means the declared source scope was traversed with determinable coverage, never an exhaustive startup census. Capped funding, missing/ambiguous investors/threads, malformed data and source/storage failures are partial/paused. Terminal omissions can require a newly reviewed/new scope rather than repeated resume magically filling them. Selected board refresh defaults to at most 20 unique requested IDs; configurable 1–200. Missing IDs and absent ATS are explicit results. Ingest defaults to 2,000 postings, configurable 1–10,000; capped snapshots never close missing jobs or publish a complete count.

## Sources, documentation and access

Verified current first-party documentation read-only on 15 October:

- [StartupDB REST documentation](https://startupdb.com/api): GET investor search, investor portfolio, startup detail and funding activity; q/limit/offset and kind=funding match the unchanged approved contracts. Free/no account or key, documented 120 requests/minute and 429 retry-after seconds. Dataset attribution is StartupDB, CC BY 4.0; third-party text/assets have separate rights. Source/index URLs, licenseScope, attribution, lastSyncedAt, portfolio relationship, scopeDisclosures and omitted funding coverage are retained in run disclosures/funding metadata. Missing relationships/rounds do not establish absence.
- [Official HN v0 API](https://github.com/HackerNews/API): whoishiring user and item routes, item IDs/parents/authors/times/kids and deleted/dead fields. Frozen selection is a bounded observation of a mutable public feed.
- [yc-oss index documentation](https://github.com/yc-oss/api): treated as an index only, never primary company/funding evidence. No newly assumed license or batch-to-funding conversion.
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever postings API](https://github.com/lever/postings-api), [Ashby public job postings API](https://developers.ashbyhq.com/docs/public-job-posting-api): current public board response contracts. Only the existing approved global API paths are used; no application submission is invoked.

The docs were accessible; the optional StartupDB live-response open through the documentation browser was inaccessible. **No live discovery dataset or live board ingestion was performed.** Adapter acceptance uses synthetic fixtures and the older captured fixtures. Strict response-shape checks pause if a provider omits pagination totals/preview arrays or changes its contract. This is not a verified measurement of current live source completeness.

Regional ATS boards are conservatively unsupported rather than mapping an EU token onto a global endpoint. Custom employer role URLs that cannot be bound to the exact supported vendor board also remain partial/unverified. Any regional API expansion needs a separately reviewed exact shared contract; no registry broadening occurred. No Recent Funding outreach source, alternate transport or paid enrichment was introduced.

## Funding facts and freshness

Stable event IDs (including numeric IDs) deduplicate rounds per company. Without an event ID, equal dated stage/amount facts merge across source URLs; sparse/undated facts retain source-based identity rather than guessing equivalence. Existing matching legacy keys are retained. Source/index URLs and prior conflict facts remain disclosed; round persistence and its initial growth signal commit together. Equal-body primary evidence is reused only for the same supporting excerpt within the current observation window.

Primary verification requires an allowed original company/investor page, the correct served domain, a captured sentence binding the exact company to a funding action, the attributed stage as a separate phrase, and the supported date precision. Several allowed originals may be tried; failure/changed content is recorded and can downgrade earlier primary verification. Investor-name substrings such as Seedcamp cannot establish Seed stage. **Only supported stage/date fields get primary_verified**; amount, currency and participant attribution stay explicitly indexed in metadata unless independently supported by future work. The source's original date text/precision, event date and observation time are separate. Amount formats that cannot be parsed are retained only in original metadata.

The 180-day signal accepts exact dates or a whole supported month interval within the window, including the exact boundary; it rejects future dates, year-only/unknown precision and months overlapping the boundary/future. Tests retain impossible-date handling and the required “14 investors” plus “October 2026” negative exact-date regression. Historical latest-known Seed does not become verified current stage; incomplete/later-round uncertainty is always shown.

ATS ownership binds company/domain, evidence ID/type/company/person scope, observation time, vendor/token and deterministic ownership hash. Ownership expires after **30 days**; fresh company/ATS evidence uses **60 days**. A stored third-party careers URL alone is insufficient. Fetched employer careers markup must link the actual allowed vendor host; nested spoof URLs and ambiguous links fail. Failed/no-board redetection clears the old ownership binding. A positive current employer vendor move is followed through the selected refresh interface.

Only a successful complete verified snapshot closes missing roles and records a complete board count. Empty complete boards close roles; partial, capped, malformed and failed boards do not. Returning roles reopen. A→B→A compares current stored content, and fresh no-op refreshes write no new posting evidence. Missing/expired supporting evidence is renewed on a later capture. Posting body capture is bounded to eight 500-character windows; body-only scoring uses captured supporting windows, and additional uncaptured text is not promoted to cited research fit.

Scoring excludes closed/stale/future/wrong-board/current-hash-mismatched posting inputs and unrelated/person/stale company evidence. Multiple excerpts/fragments from one page count as one source while their supporting IDs remain available for citations. Current board-count/delta input is bound to the current vendor/token; stale failure history does not override a newer successful count. Source prose about customers/biographies alone is not promoted to own-product fit. These conservative deterministic text rules have false negatives and are not a general semantic fact checker.

**Active input version: joboss-v4.** V1/V2/V3 weights, thresholds, risk ceilings and freeze gate remain unchanged. V4 labels the new ownership, hash, observation/source and input-derivation semantics. Research ranking writes no Lead or ScoreVersion. Separate-cycle application history and existing audits pass preservation tests; same-cycle persistence remains the explicitly reproduced shared blocker below.

## Research priority and synthetic outputs

Supported mobile/AI fit receives the leading tier, followed by supported/indexed triggers, early-stage suitability, size and recency. General software remains secondary. No ATS or country prerequisite is imposed. Index-only hints never set fit.supported. Known eligibility restrictions have citations; sponsorship, relocation, international eligibility and remote arrangements remain unconfirmed unless explicitly recorded as restrictions. Outputs are research_needed/contact_needed, never approval/send-ready.

Reranking preserves recipient selections and later assessment status/blockers/content; it updates research priority/assessment time without replacing D's completed work. Operator-excluded and inactive/acquired/public companies have zero research priority.

### Actual synthetic funnel

Batch `6d33ed15-5f60-46e6-8789-9a4235d333ff` emitted the same synthetic company `01a13e16-b82d-75ef-a337-cee3b25dc7d7` through YC, StartupDB and HN: **1 / 1 / 1 attributable discovered companies; union 1, complete true**. HN's repeated company posts did not inflate it. A resumed completed batch made **zero requests**. Contacts/drafts/sends from discovery: **0 / 0 / 0**. This source-funnel fixture is separate from the ranking fixture and is not a final real cohort.

### Actual synthetic ranking

| Case | Priority | Research status | Explanation |
|---|---:|---|---|
| Acme | 1370 | contact_needed | 2-person mobile startup; primary mobile fit and a recent primary seed announcement; no ATS required. |
| Historical Mobile | 1155 | contact_needed | 8-person mobile company; supported fit; indexed Seed dated only 2023 gives no recent trigger or current-stage certainty. |
| Global AI | 1105 | contact_needed | Unknown team size and countries, no ATS; primary LLM/PyTorch fit; eligibility and trigger remain unknown. |
| Established Mobile | 850 | contact_needed | Supported mobile fit, but 1,500-person size receives the established-company deduction. |
| Indexed AI | 525 | research_needed | Recent YC/index mobile/AI research hint, unknown size; no primary fit citation, so research_needed. |
| Wrong Board | 30 | research_needed | Fresh-looking role on another board supplies no supported fit; size alone leaves a low research priority. |

All six remain blocked on suitable verified recipient/contact research. Historical/global/established cases also lack verified early stage and a concrete supported recent hook. Indexed AI additionally lacks primary fit. Wrong Board has unknown fit. The excluded-company control is absent from ranked output.

Actual primary supporting IDs from the final fixture execution:

- **Acme**: company `01a13e16-bb6c-71e2-8391-1849e8dd511c`; cited evidence: `01a13e16-bb6d-76fa-bc25-7ec97f58fd76`, `01a13e16-bb70-7651-9b0a-0c5c19cd2489`; blockers: suitable_verified_contact_needed.
- **Historical Mobile**: company `01a13e16-bb72-72cb-b65e-9f2ac5018735`; cited evidence: `01a13e16-bb73-71b7-853e-c8e2ad93f2e4`; blockers: early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed.
- **Global AI**: company `01a13e16-bb72-72cb-b65e-96bc52cbe01c`; cited evidence: `01a13e16-bb72-72cb-b65e-9aa7686b011e`; blockers: early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed.
- **Established Mobile**: company `01a13e16-bb75-72df-90b2-96ed386b136b`; cited evidence: `01a13e16-bb75-72df-90b2-997c292531eb`; blockers: early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed.
- **Indexed AI**: company `01a13e16-bb71-77ab-bde7-c057daee10e2`; cited evidence: none; blockers: fit_needs_primary_evidence, early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed.
- **Wrong Board**: company `01a13e16-bb74-76c8-80f9-d903dcadc9b4`; cited evidence: none; blockers: fit_unknown, early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed.

| Funding record ID | Evidence ID | Original date / precision | Verification |
|---|---|---|---|
| `01a13e16-bb70-7651-9b0a-137578884e4c` | `01a13e16-bb70-7651-9b0a-0c5c19cd2489` | 2026-09-01 / date | primary_verified |
| `01a13e16-bb74-76c8-80f9-d1a7645e2716` | `01a13e16-bb73-71b7-853e-cdd25f0ac3b9` | 2023 / year | indexed |

Acme's primary announcement supports Seed/date, while the fixture's USD 1,000,000 and Seedcamp lead attribution remain indexed. Historical Mobile's 2023 year precision is preserved and provides no recent funding trigger. These IDs belong to executed **synthetic** snapshots; serial tests truncate the dedicated fixture database between cases. JSON evidence is retained independently of the final database contents.

## Executed verification

Created only outreach_test_joboss_c after configured-live exclusion and a read-only local catalog/identity check. Shared configuredTestTarget and verifyTestTarget were used before normal immutable migrations/fixtures; .env was never edited and the test URL was process-local. The normal suite retained MockAgent outbound-net refusal, serial files and standard global setup. No database reset/push, helper bypass or dropped constraint was used.

```text
npx vitest run test/unit/discovery-sources.test.ts test/integration/discovery-c.test.ts \
  test/integration/ats-ingest.test.ts test/integration/ats-adapters.test.ts \
  test/integration/seed-loader.test.ts test/integration/scoring-persistence.test.ts \
  test/integration/llm-handoff.test.ts test/unit/scoring.test.ts \
  test/unit/ats-signatures.test.ts --reporter=verbose

Test Files  9 passed (9)
Tests       203 passed (203)
Duration    8.67s
Exit        0
```

| File | Passed |
|---|---:|
| `test/integration/seed-loader.test.ts` | 21 |
| `test/integration/discovery-c.test.ts` | 26 |
| `test/integration/ats-ingest.test.ts` | 14 |
| `test/integration/scoring-persistence.test.ts` | 19 |
| `test/integration/llm-handoff.test.ts` | 15 |
| `test/integration/ats-adapters.test.ts` | 22 |
| `test/unit/discovery-sources.test.ts` | 47 |
| `test/unit/scoring.test.ts` | 25 |
| `test/unit/ats-signatures.test.ts` | 14 |

This retains 130 older ATS/YC/scoring/handoff assertions and adds 73 focused source/funding/freshness/ranking cases. Cases include >25 portfolio pagination, funding-page 429/retry with preserved 25 rounds, durable company/checkpoint interruption, repeated pages/offset drift, missing arrays, duplicate/ambiguous identities, 100-round and 200-comment caps, frozen HN comments under reordering, small/unknown YC sizes, funding intervals/conflicts/deduplication, all required ATS snapshots, selected vendor drift, stale/current-hash/distinct-source inputs, global/no-ATS priority and D selection/history preservation. Earlier development runs exposed fixture/schema/expectation mismatches which were corrected; only the final executed counts are claimed above.

Separate checks actually executed:

| Check | Result |
|---|---|
| npm run lint | Exit 0 |
| npm run check:no-raw-http | Exit 0 |
| npx prisma validate | Exit 0 |
| git diff --check | Exit 0 |
| npx tsc --noEmit --incremental false | Exit 0, UI checked separately |
| npx tsc --noEmit --incremental false -p tsconfig.backend.json | Exit 2, exactly the three unchanged D-owned TS2379 diagnostics |
| Guarded shared-requests.mjs | Exit 0; two persistence reproductions, rank preservation and blocked/manual runner probes |
| Guarded read-only preservation.mjs | Exit 0; protected live comparison and C migration/index checks |

D diagnostics remain compose.ts:590:115 and queue-draft.ts:223:76 / 223:267 (optional contactId/undefined). No C-owned backend diagnostic remains. No broader foundation/delivery review was rerun. No required check stalled or needed dependency/version/guard changes.

## Preservation evidence

Protected live access was exclusively **BEGIN READ ONLY / ROLLBACK** against the existing baseline: **57/57 drafts and all 14 captured fields unchanged; 11/11 protected index definitions unchanged; zero live SendAttempt rows; zero completed live JOBOSS migrations**. F5 and both SENDING_ENABLED/SEND_EXTERNAL_RECIPIENTS_ENABLED flags remain false. C has **13 completed immutable migrations**, every disk/applied SHA-256 checksum matching, no rolled-back record, and the same 11 protected index definitions. The two JOBOSS migration files were not modified.

Captured 337 initial tracked/untracked/configuration file hashes plus the staged diff. Existing unowned source, reports, coordination/assignment/roadmap documents, schema/migrations/configuration, shared test setup/helpers, package/lockfile, automatic runner and all inherited delivery changes remain unchanged by C. Final hash/index evidence is saved under `/tmp/joboss-c-evidence/`; the final report is the only new documentation written by C.

## Bounded shared requests and remaining limitations

1. **A/shared scoring persistence — rejected opportunity attachment.** `src/intel/scoring/run.ts:138` independently queries any open Opportunity after collectScoreInput. C's supplemental synthetic probe had zero usable posting inputs, but the persisted Lead still attached the stale foreign-board opportunity and became posted_role. Request: have persistence select exclusively from the collector's eligible opportunity IDs; when none are eligible, preserve speculative semantics. Verify closed/stale/wrong-board/hash-mismatch negatives plus a supported returning posting. No schema change is requested.
2. **A/shared scoring persistence — same-cycle historical Lead mutation.** `src/intel/scoring/run.ts:181`–186 selects by company/cycle and updates the existing Lead even when its stored version is joboss-v3 and the active input version is joboss-v4. Actual probe: same lead ID reused, stored scoreVersionId changed. Request: preserve an existing historical/reviewed Lead and its attached drafts/status when crossing versions; create a reviewable new assessment/lead under the existing campaign-cycle safeguards or return an explicit refusal until a reviewed persistence strategy is supplied. Do not invent a new campaign cycle merely to bypass deduplication. No live rescoring is authorized by C's report.

The guarded probe also proved research reranking left the original Lead byte-for-byte unchanged. It returned isolation_blocked with **zero auth calls**, and manual_pending through the unchanged manual interface. These persistence findings do not reopen accepted foundation/delivery behavior; they are new bounded downstream integration evidence in an unowned scorer file.

Other remaining limits: real source completeness/access and exact live portfolio response variants are not certified by fixtures; changed positional feeds require a new source batch; terminal omissions/caps remain visible rather than automatically exhaustive; regional/custom ATS routes and semantic funding phrasing outside the conservative matcher require further supported research. No current-stage certainty is inferred from incomplete round history, and no verified contact is produced from an HN author/address alone.

D still owns recipient identity/contact research, substantive @5 readiness/drafting and its three type errors. E owns resumable preparation/review integration and the final real company cohort. Runtime isolation/enablement remains a separate reviewed assignment. The goal of 20 distinct companies targeting 15 supported early-stage mobile/AI startups remains unfulfilled here; synthetic fixtures do not count toward it.

## Changed files and review handoff

Only the following owned files differ from the initial content snapshot or were added by C:

- `src/ingest/ats/detect.ts`
- `src/ingest/ats/ingest-postings.ts`
- `src/ingest/discovery/common.ts`
- `src/ingest/discovery/funding.ts`
- `src/ingest/discovery/hn.ts`
- `src/ingest/discovery/prepare.ts`
- `src/ingest/discovery/startupdb.ts`
- `src/ingest/yc/seed-loader.ts`
- `src/ingest/yc/yc-oss.ts`
- `src/intel/outreach/assess.ts`
- `src/intel/scoring/collect.ts`
- `src/intel/scoring/score-version.ts`
- `test/integration/ats-adapters.test.ts`
- `test/integration/ats-ingest.test.ts`
- `test/integration/llm-handoff.test.ts`
- `test/integration/scoring-persistence.test.ts`
- `tools/run-intelligence.ts`
- `tools/run-seed-ingest.ts`
- `src/ingest/ats/verified.ts`
- `src/intel/outreach/support.ts`
- `test/fixtures/discovery-support.ts`
- `test/integration/discovery-c.test.ts`
- `test/unit/discovery-sources.test.ts`
- `docs/JOBOSS-C-DISCOVERY-REPORT.md`

Evidence retained at `/tmp/joboss-c-evidence/`: suite-final.log; individual check logs; synthetic-funnel.json, synthetic-ranking.json, synthetic-funding.json; shared-requests.mjs/log/json; preservation.mjs/json and preservation-final.log; start-hashes.json, start-status.txt and start-index.patch, plus final preservation snapshots. Temporary evidence is local and may need copying before OS cleanup; the material results and synthetic IDs are embedded in this report.

**Yielding now for independent R-C review through the human/orchestrator.** No reviewer, D/E worker or further assignment has been started.
