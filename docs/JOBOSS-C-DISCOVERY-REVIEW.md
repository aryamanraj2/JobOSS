# R-C — Discovery, funding and freshness review report

15 October 2026, Asia/Kolkata. Independent read-only review in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. Reviewed the R-C brief, C assignment/report, PLAN, current owned changes and interfaces, tests/fixtures, latest coordination entries and accepted foundation/delivery boundaries. Worked directly; no agents or messages to other chats.

## Separate verdicts

**C-owned deterministic discovery/funding/ATS/research ranking: CHANGES REQUIRED.** The prescribed **203/203 tests across nine files pass independently**, and substantial discovery, coverage and ranking behavior is demonstrated. Supplemental production-function probes nevertheless confirm two false-verification defects and an interrupted YC provenance defect (RC-1–RC-3). C feature acceptance is withheld pending bounded corrections/review. The YC defect is inherited within C's ingestion scope; it is not claimed as introduced by this diff.

**Application-scoring persistence/integration: BLOCKED.** Both reported defects in the unedited scorer are independently **confirmed**, with additional controls (RC-4/RC-5). Do not run live application rescoring or treat joboss-v4 integration/history preservation as accepted. Neither blocker reopens accepted foundation or scoped delivery. Ownership for the scorer requires a coordinated bounded assignment; this review assigns no worker or migration strategy.

What may proceed: human review of these findings and separately authorized bounded corrections, using the existing deterministic/manual interfaces. Passing source traversal and positive fixture results remain useful evidence. What remains blocked: C feature sign-off, scorer persistence integration, final preparation/cohort acceptance and automatic execution. Research priority never establishes sending readiness. No real 20-company cohort or 15-company supported early-stage target was produced here.

## Confirmed actionable findings

### RC-1 — P1: funding verification borrows stage/date from unrelated clauses or investor names

Location: [funding.ts:66](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/discovery/funding.ts:66), especially the independent sentence-wide stage/date tests at lines 66–71. Propagates through `storeFundingRound` and `assessOutreachCompany`'s reuse of the same matcher.

With indexed Acme / Seed / 2026-09-01 and an allowed fetched company page, each of these actual source sentences was accepted:

- “Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.”
- “Acme raised funding from Seed Capital on September 1, 2026.”
- “Acme raised Seed funding in 2023 and presented its product on September 1, 2026.”

All three persisted **primary_verified**, metadata marked stage/date primary_verified, and research ranking returned **earlyStageVerified=true**, a **verified funding trigger**, and priority **1280**, exactly like the valid control “Acme raised a Seed funding round on September 1, 2026.” These are synthetic records with real production functions, not an alternative verifier. The negative assertions in the existing suite do not cover these same-sentence relations. Rejecting Seedcamp as an embedded substring does not reject the separate words in an investor's name such as Seed Capital.

Actual other-company reproduction: FundingRecord `01a13e63-3e3b-74d8-bcdd-b8ebef6cf02e`, evidence `01a13e63-3e3a-730e-9594-d153be4e9ace`. The captured excerpt explicitly attributes Acme's Series B to 2023; it does not establish Acme's Seed on September 1, 2026. Matching citation IDs therefore fails the substantive support requirement.

Bounded request to C: require the company, funding action, round stage and announcement date to belong to the same supported fact; conservatively leave ambiguous compound clauses/investor-name stages/unrelated dates indexed. Add semantic negative controls through persistence and ranking. Amount/currency/participants must retain their independent indexed status. No schema or gateway expansion is needed by this finding.

### RC-2 — P1: nested ATS URLs on an allowed vendor host bypass exact board binding

Location: [verified.ts:31](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/ats/verified.ts:31); used by [detect.ts:74](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/ats/detect.ts:74), ATS ingestion, collector and research assessment.

`belongsToBoard` first allows any supported ATS hostname, then searches the entire original URL for a matching vendor/token. The URL `https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme` therefore belongs to Greenhouse/acme according to production code, although its real origin/path is Lever with no Greenhouse board. A foreign Lever posting with an embedded Greenhouse URL is likewise accepted by the pure check.

Full synthetic reproduction: fetched employer careers markup containing only that link yielded **found=true**, Greenhouse/acme, and `saveDetection` persisted that binding. Separately, a genuinely verified Greenhouse/acme board fixture returned a role whose `absolute_url` was that Lever URL. Ingestion returned **fetched=1, created=1, complete=true**; the collector admitted one eligible posting; ranking returned **fit.supported=true**, priority **1130** with ATS citations. This is distinct from RC-4: eligibility is already wrong before persistence. The ordinary evil-domain nested-link negative still passes because its hostname fails the earlier allowlist.

Bounded request to C: bind vendor/token to the parsed URL's actual hostname and supported path, accepting only documented embed parameters in their proper URL structure. Apply the same exact identity to detection and posting membership. Reject query/fragment/path substrings that describe another URL; retain the existing narrow API registry. Add the full ownership→ingest→collector/ranking negative and ordinary real-link controls.

### RC-3 — P2: interrupted YC evidence writes are treated as complete on retry

Location: [seed-loader.ts:259](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/ingest/yc/seed-loader.ts:259), early return on any existing record hash, before per-key writes at lines 289–308 and the signal at 311–317. This is an inherited non-atomic ingestion seam inside the reviewed feature scope.

Injected a single database storage exception on the **second Evidence.create** while running the actual `runSeedIngest`. The first record-level row committed; per-field evidence and yc_profile signal did not. Retrying the same seed returned **seen=1, updated=1, unchanged=1**, while evidence remained **one record-only row** and yc_profile signals remained **zero**. The company still contained batch, team size, one-liner and lifecycle fields without their promised per-key provenance.

Independently repeated this through actual `prepareDiscovery`: first YC source **paused**; resuming the same batch returned **complete=true**, with the same one YC evidence row and zero yc_profile signals. The cursor replayed the candidate, but the evidence-completeness shortcut made the replay ineffective. This refutes the report's broad safe-storage-replay claim despite its passing checkpoint-only interruption test.

Bounded request to C: make a seed's required provenance durable as one operation, or resume/repair missing per-key evidence/signals before treating the record hash as finished. Preserve idempotence and applied constraints; test a mid-item storage failure through preparation, not only a cursor-update failure. This review chooses no shared migration strategy.

### RC-4 — P1: persistence attaches an Opportunity rejected by its collector — CONFIRMED

Location: [run.ts:138](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/intel/scoring/run.ts:138), independent `findFirst` of any open row, followed by Lead `opportunityId`/`leadKind` at lines 164–166. File is unchanged by C.

Each control used actual employer proof and an ingested posting, then altered only the indicated fixture fact. Fresh company-page proof allowed company scoring independently of the posting. Actual results:

| Posting state | Collector eligible IDs | Persisted lead kind | Attachment |
|---|---:|---|---|
| closed | 0 | speculative | none |
| stale | 0 | posted_role | rejected row attached |
| wrong-board | 0 | posted_role | rejected row attached |
| hash-mismatch | 0 | posted_role | rejected row attached |
| future | 0 | posted_role | rejected row attached |
| valid | 1 | posted_role | eligible row attached |
| returning | 1 | posted_role | eligible row attached |

The stale case used lastSeenAt 2026-01-01; wrong-board used foreign Greenhouse token; hash mismatch changed current body without its evidence; future used 2026-10-16 against the 2026-10-15 observation. Rejected open rows were attached even though `opportunityTracks` was empty and posting evidence was excluded from score inputs/citations. A closed row is correctly not selected; valid and returning roles are correctly admitted. Thus the report's central stale/foreign-row claim is confirmed, with the boundary precisely limited to rejected **open** opportunities.

Bounded shared-owner request: carry authoritative collector eligibility IDs into persistence and select exclusively from that set; zero eligible IDs must retain speculative semantics. An additive explicit eligible-ID result or the existing assignment IDs can define the reviewed contract. Validate closed/stale/foreign/current-hash/future negatives and a supported returning role. No live rescoring or send-dedup changes are authorized.

### RC-5 — P1: same-cycle v3 Lead/version and operator status are overwritten — CONFIRMED

Location: [run.ts:181](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/intel/scoring/run.ts:181)–187: lookup is only company/cycle, then updates the existing row with version, score components, citations, opportunity and computed status. No version/review guard exists. File is unchanged by C.

Actual production-function reproduction:

- Created a joboss-v3 Lead in the real current synthetic cycle **2026-10**, set its operator status to **deferred**, and attached a synthetic already-reviewed Draft with status **approved**. This was direct fixture creation on C only; no approval/send function was invoked.
- Before rescoring, research reranking preserved the entire Lead and Draft byte-for-byte.
- Default scoring reused Lead `01a13e63-3dc9-7798-b484-61f243f5dcfb`: scoreVersionId **`01a13e63-3dc7-75ab-add5-a5f459495dde` → `01a13e63-3de9-75cd-89a0-2b8680982c98`**, joboss-v3 → joboss-v4, **deferred → rejected**. Score components were replaced with v4-labelled content.
- Draft `01a13e63-3ddc-770f-b90b-035483dc4267` remained byte-for-byte unchanged and still attached to the mutated Lead. No new draft revision/reapproval or explicit refusal occurred. This proves a changed parent assessment beneath reviewed content; it does not claim that any send gate was bypassed or that mail was sent.
- Old audit rows remained intact; `score.computed` now records both joboss-v3 and joboss-v4 against that same Lead ID. Immutable v3 weights/thresholds stayed intact (its active flag was deactivated when v4 was created). Those preserved rows do not preserve the former Lead snapshot.
- Same-version rescoring reused the current ID as designed. A separately dated **2026-09** control Lead remained unchanged during current-cycle rescoring. These controls distinguish the cross-version/current-cycle failure from the passing separate-cycle history test.

Affected current caller: [run-intelligence.ts:161](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/tools/run-intelligence.ts:161) calls default scoring for every company, including the no-network `npm run intel:run` path. C changed ACTIVE_SCORE_VERSION to v4; this existing caller can now migrate current-cycle Leads destructively without an explicit version argument. The CLI was inspected, not executed against live data.

Bounded shared-owner request: review a persistence boundary that preserves historical/reviewed Leads, statuses and attached drafts across versions, or explicitly refuse such rescoring until that strategy is accepted. Keep ordinary same-version behavior separately specified. Do not invent a new campaign cycle or remove first-touch deduplication to escape this constraint. This is an unowned integration blocker, not a request for C to change accepted core/delivery.

## Independently executed verification

All fixture writes used **outreach_test_joboss_c exclusively**. The process-only URL was derived locally and checked with shared `configuredTestTarget` (including configured-live exclusion), followed by shared `verifyTestTarget`'s actual `BEGIN READ ONLY` identity query before normal global setup/migrate-deploy and fixtures. No `.env` edit, db push/reset, generation, install, constraint change or target bypass occurred. The standard suite retained serial files, shared setup, MockAgent outbound network refusal and normal fakes. Supplemental probes also installed a net-disabled MockAgent and used the same target guards and actual production functions.

Exact prescribed selection, independently executed with the validated process-only TEST_DATABASE_URL:

```text
./node_modules/.bin/vitest run test/unit/discovery-sources.test.ts test/integration/discovery-c.test.ts test/integration/ats-ingest.test.ts test/integration/ats-adapters.test.ts test/integration/seed-loader.test.ts test/integration/scoring-persistence.test.ts test/integration/llm-handoff.test.ts test/unit/scoring.test.ts test/unit/ats-signatures.test.ts --reporter=verbose
Test Files 9 passed (9); Tests 203 passed (203); exit 0; duration 10.70s
```

| File | Passed |
|---|---:|
| test/unit/discovery-sources.test.ts | 47 |
| test/integration/discovery-c.test.ts | 26 |
| test/integration/ats-ingest.test.ts | 14 |
| test/integration/ats-adapters.test.ts | 22 |
| test/integration/seed-loader.test.ts | 21 |
| test/integration/scoring-persistence.test.ts | 19 |
| test/integration/llm-handoff.test.ts | 15 |
| test/unit/scoring.test.ts | 25 |
| test/unit/ats-signatures.test.ts | 14 |

| Separate check | Actual result |
|---|---|
| npm run lint | exit 0 |
| npm run check:no-raw-http | exit 0 |
| prisma validate | exit 0 |
| git diff --check | exit 0 |
| tsc --noEmit --incremental false | UI exit 0 |
| tsc --noEmit --incremental false -p tsconfig.backend.json | exit 2; exactly three existing D-owned TS2379 errors |
| guarded probes.mjs | exit 0; RC-1/2/3/4/5 reproductions and history/runtime controls |
| guarded discovery-probes.mjs | exit 0; independent funnel, storage-resume defect, feed-change and raw-cap checks |
| pure.mjs | exit 0; semantic funding and nested-URL controls |
| guarded preservation.mjs | exit 0; actual live/C read-only comparisons |

D errors remain compose.ts **590:115**, queue-draft.ts **223:76** and **223:267**, all explicit possibly-undefined optional contactId under strict optional-property typing. No C diagnostic appeared. The first temporary preservation script attempt stopped before any query because of a CommonJS named-import mistake; corrected only that temporary script and reran successfully. No application/test/config repair was made. Supplemental checks assert and record defects; exit 0 means their expected reproductions succeeded, not that the feature is defect-free.

### Coverage and provenance findings beyond the defects

The executed 47 source tests and 26 discovery integration tests establish >25 portfolio pagination, exact offsets, identity ambiguity/domain mismatch refusals, missing arrays/totals, repeated-page and offset-drift refusals, retained funding pages after 429 (Retry-After **17 seconds**) and safe continuation to **26 rounds**, 100-round omissions, 200-comment caps, frozen HN ID resumption, missing monthly threads, storage-handler interruption and checkpoint replay. Source refusal/truncation/invalid JSON stays an error/partial state. Additional raw-feed probe observed **10,001 input rows, 10,000 malformed rows scanned, scanCapped=true, emitted=0**. A reordered YC feed on resume returned paused with “YC feed changed; new batch required, no positional skip.” RC-3 narrows the otherwise good cursor behavior: advancing only after a handler returns is insufficient if that handler mistakes incomplete provenance for a finished record.

Positive funding fixtures deduplicate stable event IDs and cross-URL dated facts; retain index/original-source URLs, source/license/lastSyncedAt/coverage metadata and conflicts; revalidate/downgrade changed primary support and try later permitted originals. Amount/currency/participants remain indexed even when stage/date are verified. Required 14-investors/month regression, separate-company sentences, Seedcamp substring, impossible/future dates, exact 180-day boundary and whole-month intervals pass. Year-only/unknown/overlapping/future intervals are not recent; discovery/observation time is not fabricated as announcement time. Old Seed with incomplete history retains current-stage uncertainty. RC-1 demonstrates the unresolved relational support gap despite these positive controls.

Ordinary ATS controls pass for actual fetched employer markup, wrong domain/company/person/stale/hash/token proof, stored third-party hints, ambiguous links and ordinary nested evil-host links. Failed redetection clears ownership. Selected vendor drift follows the newly verified vendor; unselected companies are untouched; missing/no-board outcomes are explicit and bounded. Complete/empty snapshots close absent jobs; partial/failed/capped/malformed snapshots do not close or publish complete counts; returning roles reopen; A→B→A and no-op/evidence-renewal behavior pass. Current hash/body, 30-day ownership, 60-day evidence, closed/stale/future filters and distinct page sources are implemented; fragments/chunks do not become separate personalization sources. RC-2 is the supported-host nested-URL exception, and RC-4 is the later persistence exception.

The handoff fixture diff supplies employer detection/save/ingestion through production helpers instead of fabricated ATS flags. Existing foreign-citation rejection, schema/allowset and secret-redaction assertions remain; all **15 handoff tests** pass. V1/V2/V3 weights/thresholds/risk ceiling/freeze gate are unchanged by the version addition; v4 marks changed input derivation. RC-5 prevents accepting historical Lead preservation merely from those immutable specs or the separate-cycle test.

## Actual synthetic funnel and ranking

Independent supplemental funnel batch **`86c76253-f644-4e40-a5aa-0b6421176918`**, company **`01a13e65-0eb1-701a-ab71-d02890830b70`**: YC/StartupDB/HN attributable distinct counts **1/1/1**, cross-source union **1**, complete **true**. Resuming that completed batch at a later observation time made **zero requests**. Contacts/drafts/send attempts from discovery: **0/0/0**. This independently corroborates the prescribed suite's separate synthetic funnel; no fixture company counts toward the final real cohort.

The freshly executed ranking fixture produced:

| Synthetic case | Priority | Supported fit | Status | Blockers |
|---|---:|---|---|---|
| Acme | 1370 | true | contact_needed | suitable_verified_contact_needed |
| Historical Mobile | 1155 | true | contact_needed | early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed |
| Global AI | 1105 | true | contact_needed | early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed |
| Established Mobile | 850 | true | contact_needed | early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed |
| Indexed AI | 525 | false | research_needed | fit_needs_primary_evidence, early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed |
| Wrong Board | 30 | false | research_needed | fit_unknown, early_stage_unverified, suitable_verified_contact_needed, concrete_hook_needed |

Acme's primary mobile page and supported recent Seed stage/date produce the leading result without ATS. Historical Mobile's 2023 year-only indexed Seed produces no recent trigger/current-stage certainty. Global AI has unknown size/geography and remains eligible for research with primary AI support. Established Mobile receives the size deduction. Indexed AI supplies research hints without primary fit citations. The ordinary Wrong Board row supplies no supported fit. Excluded-company control is absent from ranked output. All six need recipient research; none becomes send-ready. Known location restrictions retain evidence IDs while sponsorship/relocation/international eligibility stay unconfirmed.

Actual fresh fixture supporting IDs:

- **Acme**: company `01a13e60-d190-735d-b99a-e701451962df`; supporting IDs: `01a13e60-d191-7024-a50e-b82873635fec`, `01a13e60-d194-72d1-b071-5f689d6913ce`.
- **Historical Mobile**: company `01a13e60-d198-7672-a907-967550b9f313`; supporting IDs: `01a13e60-d199-7108-b6ff-3413f9a452a1`.
- **Global AI**: company `01a13e60-d197-71eb-89b7-390a81e858df`; supporting IDs: `01a13e60-d198-7672-a907-93bd717e2853`.
- **Established Mobile**: company `01a13e60-d19d-71ae-b681-13448f74a0e6`; supporting IDs: `01a13e60-d19d-71ae-b681-142c88a1f1e4`.
- **Indexed AI**: company `01a13e60-d196-70a9-9dfb-41aaa042c114`; supporting IDs: none.
- **Wrong Board**: company `01a13e60-d19b-729b-867b-8a8b6408eacf`; supporting IDs: none.

Acme funding record **`01a13e60-d195-762b-a1af-bb939c8b3826`** cites **`01a13e60-d194-72d1-b071-5f689d6913ce`**, date **2026-09-01 / date**, with USD 1,000,000 and investor attribution still indexed. Historical funding retains **2023 / year / indexed**. These positive synthetic outputs reproduce C's reported order/priorities; RC-1/2 demonstrate that other unsupported inputs can still obtain similarly confident output.

Reranking preserved D's selectedContactId, later assessment status/blockers/content in the passing suite. Supplemental reranking also preserved the entire existing Lead and reviewed Draft. Ranking itself creates neither Lead nor draft. Fixtures are serially truncated between cases; retained JSON, not the final fixture database contents, holds the snapshots.

## Final interface and access assessment

- `prepareDiscovery(db,gate,{limit,runId?,now?,resume?,delayMs?})` returns batchId, source row runIds, companyIds, source summaries and complete. Limit **1–200** means newly accepted distinct company IDs per source/run/invocation; already-known database companies can still gain source attribution. Source discovered is cumulative per run; top-level discovered is the union, not the sum. The limit is separate from final cohort size.
- `runId` is a batch identifier, not an individual source-row ID. New IDs create three source runs; known batches require resume; unknown/incomplete batches reject. Resume without ID selects the latest batch, including a completed one. Completed sources do not refetch. Cursors are version 2 and bind source scope; legacy/invalid cursors are refused. Frozen `scopeNow` controls YC/HN selection; invocation `now` is observation time. Errors/disclosures survive. Same-batch concurrency is **caller-serialized**, not a distributed lease. Current exposed discovery CLI awaits one invocation; no scheduler or production overlapping-batch caller was found. Concurrent independent CLI launches remain the caller's responsibility.
- YC scope at this date is active **2024–2026 cohort years inclusive**, team 1–250 or unknown, ordering 1–50 then 51–250 then unknown. This is not an exact rolling two-year funding window. Feed hash, 10,000 raw scan cap and 96 MiB response cap disclose changed/malformed/capped scope. Operator exclusion/website/tags and inactive/acquired/public lifecycle stops survive ordinary repeated imports.
- StartupDB scope is the five named investors, exact name/domain/slug/company identity, pages of **25**, **120 API requests/invocation**, **500 portfolio entries/invocation**, and **100 funding rounds/company**. Durable pending detail/funding pages are replayed; saved portfolio/funding page hashes reject positional shifts before extension. Funding caps/omissions remain partial even after source cursor exhaustion. Primary fetches try at most three allowed originals per round through normal website budget/redirect controls, separately from the API request counter.
- HN freezes up to **90** author submissions, selects **three distinct monthly** verified whoishiring employer threads within the recorded observation scope, then freezes comment IDs; **200 comments / 250 requests per invocation**. Missing threads/caps are explicit. It does not promise consecutive calendar months or a globally exhaustive feed. Recruiters, seeking-work/deleted/dead and ambiguous employer routes are rejected. Public authors/emails remain unverified source text, never verified contacts or permission to send.
- `refreshDiscoveryBoards(db,gate,companyIds,{now?,delayMs?,limit?})` returns typed refreshed/partial/source_failed/paused/no_verified_board/missing_company results. Default **20 unique IDs**, configurable **1–200**; missing ATS remains visible research state. Posting bound defaults to **2,000**, configurable **1–10,000**.
- `rankOutreachCompanies(db,{limit,now?})` and pure assessment retain shared `RankedOutreachCompany` names/fields; ranking limit **1–10,000**. Fit, trigger, eligibility and contact blockers remain distinct from application score. D-owned later work is preserved, although returned fresh ranking assessments still describe research/contact needs rather than claiming D's completed readiness.

Independently checked current first-party documentation read-only: StartupDB documents the used investor search/portfolio/startup/activity routes, free keyless access, 120 requests/minute, Retry-After seconds and source/CC BY 4.0 limitations. Missing records do not establish absence. [StartupDB API](https://startupdb.com/api). HN documents user/item identities, author/parent/time and ranked kids; freezing IDs avoids later comment reorder changing the cursor. [Official HN API](https://github.com/HackerNews/API). YC's repository documents the all-companies feed; it remains index evidence. [yc-oss API](https://github.com/yc-oss/api).

Current supported ATS GET formats are documented by [Greenhouse](https://docs.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api) and [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api). Lever separately documents EU/global bases; refusing unsupported regional routes is an acknowledged availability limit, not authority to map them to global tokens. Strict missing-total/preview handling may pause on live variants; current live dataset completeness was not measured.

Production source transports remain behind FetchPolicyGate and the unchanged exact GET registry. Supplemental funnel's actual requested API URLs all matched that registry; website originals retain host deny/robots/terms/rate/budget controls. Network-guard check passed; no alternate transport, paid source, Recent Funding feed or live ingestion request was used. Documentation retrieval is evidence of the documented contract, not of a real dataset's current completeness or identity correctness.

D retains recipient research, substantive @5 no-network transaction-compatible readiness/CLI integration and its three type errors. E must preserve source IDs/counts/partial states, serialize same-batch work, refresh only selected companies and surface missing research/manual blocks. Subscription executor probe returned **isolation_blocked with zero authentication calls** despite an injected authentication dependency; manual task interface returned **manual_pending**. The offline helper was not used to enable execution. Foundation/delivery acceptances and real provider/runtime limitations remain separate.

## Preservation, evidence and stopping point

Captured **344 initial file hashes**, HEAD, status and staged binary diff before fixtures. Existing application code/tests/config/schema/migrations/package/lockfile/credentials/reports remain byte-for-byte unchanged by this review. **HEAD and staged diff match the capture**; no staging/commit/reset/Git mutation occurred. Two existing documentation files changed during the review outside this review's writes: `docs/JOBOSS-CHAT-ROADMAP.md`, `docs/JOBOSS-COORDINATION.md`. An additional `docs/JOBOSS-ORCHESTRATOR-HANDOVER.md` also appeared externally during final verification. These external documentation changes were not restored or overwritten. The requested new report is this review's only workspace write; temporary scripts/logs are under `/tmp/joboss-rc-evidence/`. Normal existing tests also emit synthetic JSON to their pre-existing C temporary-evidence paths; freshly executed outputs were copied into R-C evidence.

Live comparison executed **BEGIN READ ONLY / ROLLBACK**, confirmed transaction_read_only=on: **57/57 protected drafts, all 14 captured fields and 11/11 index definitions unchanged**, zero SendAttempt rows and zero completed live JOBOSS migrations. C-only read-only inspection confirmed **13 completed migrations**, disk/applied SHA-256 matches for every migration, no rolled-back records, and the same 11 protected indexes. JOBOSS hashes remain preparation **4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c**, uniqueness **31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b**. F5, SENDING_ENABLED=false and SEND_EXTERNAL_RECIPIENTS_ENABLED=false were checked independently.

Retained executable probes and results: `probes.mjs/.json/.log`, `discovery-probes.mjs/.json/.log`, `pure.mjs/.json`, `preservation.mjs/.json/.log`, suite/check logs, freshly reproduced suite synthetic JSON and initial preservation snapshots, all under `/tmp/joboss-rc-evidence/`. Material conclusions/IDs are embedded above because temporary files may be cleaned later.

No required local check remains unattempted. Explicitly unperformed/out of scope: full repository or broad foundation/delivery reruns; source generation/install/build-cache writes; live source dataset/ATS ingestion or rescoring; real mailbox/OAuth/provider/model calls; outreach, sending enablement, paid services, deployments and final real cohort/pilot validation. These are not implied by fixture acceptance. No fixes or next worker/reviewer assignment were started.

**Yielded to the human/orchestrator with C feature changes required and scorer persistence/integration blocked.**
