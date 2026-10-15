# JOBOSS orchestrator handover

Updated **15 October 2026**, Asia/Kolkata (Asia/Calcutta), **after D corrections01 report; same R-D re-review next; CI with E later**. This is the continuation checkpoint for a **fresh orchestrator chat**, replacing the need to load the entire previous conversation. Continue the same project, constraints and accepted work; do not restart the project or its audits.

## 1. Read this first: operating contract

**You coordinate human-run chats. You do not spawn agents, create/dispatch worker chats, send messages to other chats, or edit application code.** The user explicitly corrected an earlier misunderstanding: they want copyable prompts, run workers/reviewers themselves, return labeled reports, and receive the next prompt. Tools for inspecting code, reading reports, read-only probes/checks and maintaining assignment/coordination documents are allowed. Delegate every application/integration fix through a human-run builder prompt.

**One assignment at a time.** Only the initial A/B builds and a later explicitly authorized R-A/R-B review pair overlapped. Those exceptions ended. Do not infer continuing parallel permission from old plan tables or initial authorization. Independent reviews use fresh chats; fixes stay in the original corresponding builder chat. Re-review stays in the original reviewer chat. Keep worker/reviewer labels stable and always say **which chat**, **same or new**, and **what runs now**. User manages the chats manually; do not guess a chat is running from an issued prompt.

Do not repeatedly reconfirm settled decisions. Ask only for a material scope/cost/permission/behavior change. Give short updates: confirmed result, actual verification, next step. Avoid invented completion percentages. A worker's “done” is not acceptance: read the report and source, require independent evidence for substantial work and record scoped verdicts. Preserve already closed findings unless new concrete regressions appear; avoid reopening entire subsystems every correction pass.

Every worker packet must specify objective/behavior, owned files, dependencies/interfaces, preservation/constraints, acceptance/verification and required report. One owner for schema/migrations/core configuration/task registry; no overlapping editors. Reviewers keep code/tests/configuration read-only and write their own separate report. Return reports to the **new orchestrator chat** from this checkpoint onward.

## 2. Current state — exact next action

| Work | Verified status | Chat usage now |
|---|---|---|
| A — Shared foundation | **Accepted** by final independent R-A review | A/R-A complete and idle |
| B — Inbox/delivery | **Accepted in mocked-provider/local-PostgreSQL scope** by final R-B review | B/R-B complete and idle |
| C — Discovery/funding/freshness | **Accepted in reviewed deterministic/synthetic scope**, final R-C 265/265 plus independent controls | C complete/idle; broader YC is separate queued work |
| R-C — Discovery review | **RC-1/RC-2/RC-3 closed**; scorer integration still blocked | Complete/idle; do not reopen correction loop |
| CI — Verification repair | Actual failures/config conflict retained; **standalone packet deferred by human** | Workflow/artifact repairs join E later; no CI start confirmed |
| S — Scorer persistence | RC-4/RC-5 independently confirmed; distinct future ownership reserved, not reopened A | Queued; no packet/chat started |
| D — People/drafts/review | Corrections01 claims RD-1–RD-6 fixed,293 unique/11 files; **independent acceptance pending** | Yielded/idle |
| R-D — People/drafts/review | Initial review six findings; corrections01 re-review packet ready | **Same reviewer sole next assignment; start unconfirmed** |
| Runtime isolation/enablement | **Unverified; automatic execution intentionally blocked** | Separate future bounded assignment/review required |
| E — Preparation/integration and V — final verification | Not started; packets not finalized | Queued |

**Immediate next report:** `docs/JOBOSS-D-CORRECTIONS-01-REVIEW.md`, labeled **R-D — People, drafts and review corrections 01 review report**. Builder correction report returned; claims293 tests/all six corrected. Human-run prompt returns to the **same existing R-D reviewer chat**, using `docs/JOBOSS-REVIEW-D-CORRECTIONS-01.md`; start unconfirmed. Read-only source/tests/config/Git; fixtures only outreach_test_joboss_d. D/all other chats idle. Target original findings/meaningful regressions/new transaction contracts, not a duplicate initial audit. CI with E later stands; no standalone CI/parallel chats or automatic quota scheduling.

Final C acceptance evidence: `docs/JOBOSS-C-CORRECTIONS-01-REVIEW.md`; earlier review/correction packets are historical. **D fixtures exclusively outreach_test_joboss_d** using approved guards; no common/live/other-worker fixture writes. All other chats idle. Reserve S for RC-4/RC-5; finalize later contract before launch. Scorer run.ts stays read-only. Broader YC company/listed-job/speculative coverage remains queued after D/review, not implemented by C corrections or D's downstream processing. E later absorbs deferred workflow/artifact CI repairs from the superseded `JOBOSS-CI-REPAIR-01.md` evidence, with its scope refreshed against accepted reports.

## 3. Repository, documents and reading order

- Workspace: **`/Users/aryamanjaiswal/Documents/ChatGPT/scraper`**. TypeScript/Next, Prisma/Postgres, pg-boss, existing fetch gateway and provider-neutral local CLI handoff. Keep the stack.
- Authoritative plan: **`/Users/aryamanjaiswal/Downloads/PLAN.md`**. Latest human instructions and scoped acceptance supersede older historical plans.
- Current record: `docs/JOBOSS-COORDINATION.md` (chronological; earlier “next actions” are historical).
- Current schedule: `docs/JOBOSS-CHAT-ROADMAP.md`; its phase table is historical architecture, not parallel authorization.
- **Required before drafting discovery/E/V prompts:** `docs/JOBOSS-DISCOVERY-SOURCE-EXPANSION.md`, especially Mandatory carry-forward. Human explicitly requires actual JOBOSS implementation/use of South Park Commons, Alchemist, Entrepreneurs First, MassChallenge and Seedcamp alongside expanded YC, not a research-only recommendation. Builder/reviewer/E/V packets must name each, verify wired ingestion/dataflow/tests and later authorized real-source funnel, and carry unresolved access rows without silent omission. Queued/researched/unused sources do not count as delivered.
- Current re-review input: `docs/JOBOSS-REVIEW-D-CORRECTIONS-01.md`, `docs/JOBOSS-D-CORRECTIONS-01-REPORT.md`, correction scope `docs/JOBOSS-D-CORRECTIONS-01.md`, initial `docs/JOBOSS-D-RECIPIENTS-REVIEW.md`. Earlier D scope/report only as needed. Final C acceptance stays closed. `docs/JOBOSS-CI-REPAIR-01.md` is deferred E input, not a launch packet.
- C assignment: `docs/JOBOSS-WORKER-03-DISCOVERY.md`.
- Final A evidence: `docs/JOBOSS-FOUNDATION-CORRECTIONS-02-REVIEW.md` and `docs/JOBOSS-A-CORRECTIONS-02-REPORT.md`.
- Final B evidence: `docs/JOBOSS-B-CORRECTIONS-03-REVIEW.md` and `docs/JOBOSS-B-CORRECTIONS-03-REPORT.md`.
- Product comparison and actual REA observation: `docs/JOBOSS-PRODUCT-RESEARCH.md`.
- D assignment refreshed: `docs/JOBOSS-WORKER-04-RECIPIENTS.md` — single fresh human-run chat, current B/C/manual/readiness contracts, D-owned typing fixes and isolated test/UI scope.

For context efficiency, read this handover/current R-D re-review packet/D corrections01 report first; consult initial findings, PLAN/A/B/C interfaces only as needed. Don't reload whole old correction history. No application instruction file was found in prior repository/ancestor checks; check newly applicable instructions as usual before future edits.

## 4. Settled product/permission decisions

- **₹0 additional spending.** Existing Codex/Claude subscription access allowed; no new subscription, paid API billing, paid fallback or invented free allowance.
- **Optional email-finder APIs remain intended:** human supplies legitimate own free-tier credentials for supported providers (Apollo/Snov examples). Current code has only provider interface/disabled/fake plus CSV import, no live Apollo/Snov adapters or paste-any-key capability. Queue bounded adapters/private credential/quota/gateway work later; don't drop this requirement. Verify actual account API access (free UI isn't API entitlement), use only available free credits with visible skip/pause and no paid fallback, dedup/cache and preserve identity/provenance checks. D can keep optional providers disabled in its present scope; no parallel/live lookup authorized or key supplied. Never put keys in chat/Git/task packets/logs.
- **Additional discovery sources requested:** South Park Commons, Alchemist, Entrepreneurs First, MassChallenge and Seedcamp. Official-source research in `docs/JOBOSS-DISCOVERY-SOURCE-EXPANSION.md` confirms tech-company seed content and records canonical URLs/dynamic/auth/coverage limits. Only Seedcamp is already indirectly targeted via StartupDB; no direct adapters for these sources. Include them in the queued broader discovery packet after D/review with explicit source status, domain dedup, relationship/cohort provenance and listed/speculative modes. Research is not robots/terms clearance or live ingestion. D remains sole next assignment; no parallel source worker.
- On-demand one preparation command: **`npm run outreach:prepare -- --limit 20`**; never an autonomous sending command.
- Mobile + AI first, general software secondary. Global discovery; show eligibility/location/sponsorship/remote/relocation uncertainty, never invent arrangements.
- **Latest YC clarification:** the human does not want to miss a YC company they could join, through listed roles or speculative cold outreach. Recent/early-stage priority must not silently exclude relevant older/larger YC employers. Current recent-company path is narrower (active 2024–2026/team1–250-or-unknown; unknown batch fails) and isn't full YC job-board ingestion. Keep separate bounded coverage work queued after D/review before claiming broad coverage/final completeness; explicit source/cap/access/eligibility gaps, operator stops preserved, no guarantee of zero misses. D handles both outreach modes for supplied companies, not discovery expansion.
- Founders, relevant engineers, technical leaders and recruiting contacts can qualify by actual supported responsibilities. No blanket executive ban; Sales/Field Engineering title alone is insufficient.
- Preserve detailed email style and **280-word ceiling**. Use relevant approved project proof and matching resume.
- **Every email requires individual human approval** of its exact content/recipient. Follow-ups remain manual. Preserve approval hashes, suppression and per-contact/company-slot dedup/caps.
- Exact **published API contracts** govern documented API method/path/query matches; websites still obey robots/terms/deny/rate/budget. No broad vendor-domain trust, arbitrary endpoint exemption or alternate raw transport.
- Preserve every existing draft, including composing/closed. Upgrade creates a new revision needing new approval. No overwrite/reset/database shortcut dropping constraints.
- Current implementation/review packets authorize **no live writes/migrations/rescoring, mailbox operations, outreach or sending enablement**. Use synthetic dedicated test databases. Any later live-mutating step needs a concrete reviewed plan and appropriate explicit authorization; no permission question is needed now.
- No automatic runtime enablement by arbitrary flag/caller boolean/injected executor. Missing sources, quota, invalid evidence and failures must produce an honest resumable state.

## 5. Preservation baseline and database safety

Original audited baseline: 3,085 companies; 262 ATS boards; 5,084 roles initially all open; 45,143 evidence; 1,312 leads; 126 contacts across 59 companies. Initial funding records/signals zero. Those are historical baseline counts, not a claim of current live discovery quality. Live has **57 protected drafts** (21 awaiting approval, 21 composing, 15 closed at baseline), **11 protected index definitions** and **zero SendAttempt rows**. No approval hashes existed at baseline.

Files under ignored scratch:

- `scratch/joboss-baseline-20261014/outreach_dev.dump` — original database backup.
- `scratch/joboss-baseline-20261014/protected-state.json` — draft IDs/all 14 captured fields and exact 11 index definitions.

Latest independent A/B and C builder comparisons: **57/57 drafts and all captured fields, 11/11 indexes unchanged; send attempts 0; completed live JOBOSS migrations 0**. Stage **F5**; `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`. Live is **outreach_dev**. Keep config/credentials private; never print connection strings.

All application fixture writes belong only to the currently assigned target; use normal `prisma migrate deploy`, not db push/reset. Shared `test/helpers/test-target.ts`, global/setup guards enforce exact local allowlists, independently captured live identity/name exclusion across aliases/ports, and actual connected identity before deployment/fixtures. Approved names: outreach_test, outreach_test_joboss_a/b/c/d/ra. Do not weaken guards or run common-db destructive tests. R-B reused idle B; R-C reuses idle C; builders must be idle during review.

Test targets have **13 immutable migrations** at the last verified checkpoints. Original JOBOSS preparation was also applied to common outreach_test earlier; live was never migrated. Protected SQL disk hashes:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

Corrections add partial global-period/open-task uniqueness. Send first-touch indexes still cover touch 1 with statuses **in_flight,sent**, contact/cycle and company/cycle/slot. Never rewrite applied migration SQL or remove predicates/constraints to pass tests.

## 6. Git/environment checkpoint

Current HEAD observed: **6113f8d**, `Refactor scoring persistence tests and enhance evidence handling`, following earlier c858d3f. The human explicitly requested stage-all; root staged 66 relevant files and verified no remaining changes at that moment. A commit then happened **outside root**. At final R-C receipt, cached diff was empty and only the new R-C report was untracked before current coordination/CI-packet edits. Root did not commit; earlier 102-file and later 66-file staging requests are fulfilled, not standing authorization for new staging/commits. Preserve all work; do not reset/stash/clean or rewrite history.

No final full-repository suite yet. **R-D independently confirmed all three typing errors fixed and backend/UI green; preserve that closure.** Historical remote CI runs failed on those old errors and skipped Tests; no new remote success established. Root purely reproduced same-name live/test guard rejection. B-dedicated target/hardcoded C output directories remain clean-runner risks for **E with CI later**. R-D's257 passing tests aren't a full suite or D feature acceptance.

Shell default Node22.16; Node24.12 installed and used for REA. Workspace/dependencies sometimes become macOS cloud-only placeholders; reads/test startup stall despite no code defect. Prior workers restored/hydrated existing files, preserving versions/lockfile. Do not count zero-test startup failures as passes, bypass safety/timeouts or reinstall/change dependency versions casually. Root previously restored exact locked dependencies during initial audits; recent passes needed hydration only. Known pg concurrent-query deprecation warnings occur in synthetic concurrency tests; current assertions passed, future driver compatibility remains unverified.

## 7. Accepted foundation contracts — do not rebuild

Final independent R-A: **193 tests/eight files +22 isolation tests/two files passed**; old handoff selection then had three stale ATS fixture failures. Initial R-C independently confirmed C's fixture corrections with genuine synthetic employer proof and all 15 handoff tests passing. Corrections 01 reports those assertions retained; do not keep the old failures listed as permanently outstanding.

A accepted atomic budget accounting/reservations and global uniqueness; strict positive research credits with exact mail/OAuth exemptions; durable task tokens/leases/stale-worker fencing; atomic open-task enqueue; captured identity/authorship validation; owned descendant cleanup; test safety and shared schema/interfaces. No paid fallback. Evidence retains company/person binding; source IDs alone are not semantic support.

Shared models include FundingRecord, DiscoveryRun, OutreachAssessment, ContactResearch, PreparationRun, person-bound external Evidence, revisioned drafts and provider actual RFC ID. `RankedOutreachCompany` uses `companyId,name,domain,priority,primaryTrack,status,blockers,eligibility,fit,trigger,citedEvidenceIds` (not companyName).

**Automatic Codex/Claude execution is unavailable.** `runPendingTasks` defaults to intended Codex but returns resumable **isolation_blocked** before claim/auth/temp/launch/mutation; direct executor also blocks. Structured blocker: isolation_unverified, readiness unverified, provider/capability class, manualAvailable and detail. Fulfilled work stays complete. `provider:manual` returns manual_pending; existing `llm:next`/`llm:fulfil` remains valid. Caller execute injection is ignored/deprecated and cannot establish readiness. Research URL tasks remain blocked as well. The offline test helper must never enter production.

A real synthetic Codex output and recognized CLI disables did **not** prove complete model-visible tools/filesystem/network/MCP/skills/delegation isolation. No authoritative complete capability proof was accepted. A distinct future runtime task must establish/enforce and independently review provider/runtime/config/capability isolation before automatic preparation can be accepted. Do not treat the temporary fail-closed state as fulfilling the final automatic workflow or let it stop deterministic discovery work.

## 8. Accepted delivery contracts — preserve in D/E

Final independent R-B: **320/320 tests, eleven files**, plus independent quarantine/fallback/resumption/race evidence. B/R-B correction loop is **closed**. The following are accepted within fake-provider/local-Postgres scope:

- Complete resumable paginated received-mail ingestion; caps/provider/malformed/identity issues fail closed. A resumed scan drains then requires a fresh complete scan before new sending. Offline checks label inbox unchecked; disabled sending avoids mailbox reads.
- Atomic/idempotent bounce/opt-out/reply ingestion and suppression; human/automatic/stop/unclassified counts separated. Soft bounce stops conversations but does not permanently suppress.
- Actual provider RFC Message-ID stored separately from client-derived ID; stable X-Outreach-Ref recovery; no blind resend.
- Approval/reservation ordering: standalone send client, draft/related-row locks and exact snapshot/plan/hash revalidation, conditional approved→sending plus SendAttempt committed before transport. Real `revokeApproval` shares draft lock and atomic audit/clearing. D must preserve the corrected `src/outreach/draft/approve.ts` behavior.
- Unknown delivery returns **pending_reconciliation**, remains in_flight with original time/dedup/day-domain cap reservation; search miss never proves failure. Later recovery never sends; CLI exit2 for pending. Definite failure does not reopen a concurrently stopped draft.
- Detailed inbound matching distinguishes matched/unmatched/**unresolved**. Multiple/contradictory sender/DSN evidence quarantines before irreversible outcomes, one bounded audit, incomplete replayable sync/pre-send. Preserve conservative sender/DSN/Auto-Submitted guards; unsupported syntax is visible availability limitation, not guessed contact/status.

**Pending D/E seam:** `SendGateOptions.evaluateOutreachReadiness(db,draftId,now): Promise<{ready:boolean;detail:string}>`, transaction-compatible and **no network**. Must substantively validate current supported fit, suitable verified route, exact current draft support and concrete hook. @5 currently correctly refuses while callback absent; integration must wire D's validator into tools/run-send.ts. No weaker parallel validator. Shared ProviderMessageRef optional nullable rfc822MessageId is already satisfied. Optional precise inbox reason code deferred; existing weak_evidence + explicit detail/audit is accepted.

Real Gmail/mailbox identity behavior and pilot readiness are not verified/accepted. Keep sending off.

## 9. C result and initial independent R-C findings

**Latest: final R-C corrections 01 accepted; RC-1–RC-3 CLOSED.** Independent `docs/JOBOSS-C-CORRECTIONS-01-REVIEW.md` reproduced 265/265 tests/nine files (all original 203 retained +62), substantive additional funding/ATS/next-day repair/decoy controls and live preservation. Root read the full review; no redundant suite/database rerun. RC-1 uses same-fact grammar plus old-false-proof ranking exclusion; RC-2 shares parsed origin/path/token identity across consumers; RC-3 repairs exact per-key rows and record-bound signal before completion. C/R-C are complete/idle; no residual actionable correction defect. Preserve closure absent concrete new regression. CI's narrow test artifact-path repair is separate verification work, not a new application review. Initial findings below are history, not instructions to repeat their implementation/review.

**Historical initial verdict (feature portion superseded by final acceptance): C feature changes required; scorer integration blocked.** Initial R-C reproduced **203/203 tests/nine files**, the synthetic union/ranking and preservation controls, and confirmed five findings in `docs/JOBOSS-C-DISCOVERY-REVIEW.md`. Original C subsequently corrected the following three findings and final R-C independently closed them; scorer integration remains blocked:

- **RC-1 P1** `funding.ts:66`: sentence-wide stage/date matches borrow another company's event, investor-name stage or unrelated product date; false primary verification propagates to ranking. Require same-fact support and existing synthetic stored-row rechecks.
- **RC-2 P1** `ats/verified.ts:31`: allowed outer ATS hostname plus a nested foreign URL establishes false ownership/posting eligibility. Require actual parsed vendor/path/token binding through detection, stored proof, ingestion and collection/ranking.
- **RC-3 P2** `yc/seed-loader.ts:259`: a mid-item evidence failure leaves record-only provenance; hash early return then falsely completes retry. Require durable/repairable provenance, including already-partial hashes and actual preparation resume.

Positive existing fixture assertions remain useful and should be retained. Detailed implementation claims below are historical builder reporting, qualified by the initial findings and final correction acceptance. C/R-C are complete/idle; no duplicate reviewer prompt is needed. Scorer RC-4/RC-5 below are confirmed and separately queued for future S ownership.

C reports **203/203 tests/nine files**, lint/network/schema/whitespace/UI passed; three unchanged D typing errors. `docs/JOBOSS-C-DISCOVERY-REPORT.md` has exact signatures, fixture outputs and limits. Nine-file selection: discovery-sources, discovery-c, ats-ingest, ats-adapters, seed-loader, scoring-persistence, llm-handoff, scoring, ats-signatures (exact paths in R-C packet).

Builder-reported behavior:

- Deterministic YC/StartupDB/HN with versioned frozen scope/cursors, caps/errors/disclosures and durable interrupted candidate/funding handling. `runId` is batch/group ID; source row IDs returned separately. Discovery limit1–200 is distinct accepted companies per source/run/invocation, not final cohort size; top-level total is distinct cross-source union. Completed resume refetches nothing; changed positional feed/page pauses instead of silently skipping. Same-batch calls are caller-serialized, not distributed leased.
- Primary funding stage/date verification versus explicitly indexed amount/currency/participants, date precision separate from observation; dedup/revalidation/downgrade and exact 180-day intervals.
- Employer-owned exact current ATS evidence, 30-day ownership/60-day evidence window, complete-only missing-job closure, returning jobs, current A→B→A and hash/source support. Bounded selected-board refresh/no-ATS results.
- Research fit/priority separate from application score/readiness; preserves recipient selections and later assessment state. **Active derivation joboss-v4**; V1/V2/V3 meanings/weights unchanged.
- Actual **synthetic** source union1 across three sources and ranking outputs; these are not real final cohort members. Source docs checked but no live dataset/board ingestion.

Current entry points: prepareDiscovery; refreshDiscoveryBoards; rankOutreachCompanies/assessOutreachCompany. Shared RankedOutreachCompany stays stable. Regional/custom ATS and unsupported semantic/source variants visibly refuse/limit coverage.

### Two scorer persistence issues independently confirmed, not fixed

Both are in unedited **`src/intel/scoring/run.ts`**, not accepted foundation or delivery:

1. After collector rejects every usable posting, persistence independently selects any open opportunity (~line138) and attaches a stale foreign-board one, yielding posted_role. Candidate correction must use collector-eligible IDs and speculative semantics when none are valid.
2. Same-cycle existing Lead lookup/update (~line181–186) overwrites a joboss-v3 Lead with v4 scoreVersionId/score data, potentially affecting reviewed/history/draft bindings. Candidate strategy must preserve history/status/drafts and dedup; no invented campaign cycle to evade constraints. An explicit safe refusal could be acceptable until reviewed strategy exists.

C's `/tmp/joboss-c-evidence/shared-requests.log` first reported these issues. R-C independently confirmed **RC-4 P1** for rejected open stale/wrong-board/hash-mismatch/future rows (closed correctly speculative; valid/returning controls pass), and **RC-5 P1** current-cycle v3→v4 Lead mutation with deferred→rejected status beneath an unchanged reviewed draft. Same-version reuse and separate-cycle preservation controls pass. Existing `tools/run-intelligence.ts` default scoring reaches this seam even with no network. Root inspected source but **did not independently execute those database reproductions**. Reserve separate future **S — Scorer persistence** ownership; C corrections 01 may not edit run.ts. No live rescoring authorized.

Root separately passed pure funding checks (14 investors≠October14, invalid/future/year-only handling), matched migration hashes/whitespace and read the retained203-test log. These are supplemental, not C acceptance.

## 10. R-D returned — six findings and remaining work

**Latest: D corrections01 returned, targeted same-R-D re-review pending.** Builder claims all six fixed, original257+36=293 unique/11, all checks green, no shared/schema/core/B/send change. Root inspected report/source/final JSON292+1, not another independent suite/DB/browser run. New helpers: bounded identityRecordv2 reparsing/historical refusal; fixed-v5 exact current claims/candidate semantic coverage and snapshotv3; role-v5 exact current cited context; D advisory-first mutations/NOWAIT decision locks+savepoint; coherent read-only REPEATABLE READ display versus locked READ COMMITTED action with caller isolation checks. Tradeoffs: old proof recapture, verbose verbatim fixed facts, conservative D serialization/busy refusal. Verify independently, don't declare closed yet.

Current packet `JOBOSS-REVIEW-D-CORRECTIONS-01.md` targets six findings/new caller contracts and meaningful preservation; D idle, R-D start unconfirmed. Reported preservation57/all14/11 indexes, attempts0/live JOBOSS migrations0, D13 checksums/flags/F5 unchanged. E still owns exact callback + whole mutable approved support snapshot through reservation; must honor new D isolation/advisory contracts. Mandatory source/provider/S/runtime/CI-E gates remain open.

**Initial independent verdict (pending superseding re-review): D NOT ACCEPTED.** `docs/JOBOSS-D-RECIPIENTS-REVIEW.md` passed257/257/11 plus checks/UI/preservation but reproduced six findings. Root purely reproduced RD-1/source corroboration; database/race/deadlock executions belong to initial R-D. Original D has now returned correction implementation; these historical findings are the recheck basis, not a new builder assignment:

- RD-1 P1: parent multi-person section borrows another person's title; fresh/stored fact binding must refuse.
- RD-2 P1: display and approval token come from different views; real during-render source/text race approves unseen current data.
- RD-3 P1: explicit old anchor bypasses newer closed revision and creates more work.
- RD-4 P1: fixed candidate intro/window not semantically checked against changed current claims; new support restores contradictory copy.
- RD-5 P2: valid listed-role path loses role intent, generic intern ask mislabeled as listed-role message.
- RD-6 P2: actual D review-table-SHARE versus writer draft/task lock cycle produces40P01; no stale approval proven by this availability finding.

Initial review preserves A/B/C/RC-1–RC-3 closure and D positives/type fixes. Protection independently unchanged. Correction report is pending targeted same-R-D review; no other assignment starts or unowned schema/core/B/legacy/live edit authorized.

Historical D implementation report claims257/11 and completed scope; R-D independently reproduced counts/checks/preservation but withheld acceptance on the six gaps above. Retain prior positive behavior without treating counts as completion.

D exports prepareRecipients (selected/blockers/researched/limitations/taskIds; default20/max100 companies, bounded4–8 pages/ten candidates) and prepareOutreachDrafts (draftIds/taskIds/blockers;1–100 companies,1–6 contacts default1; explicit campaignCycle only when creating an unscored association; upgradeExisting/reviseDraftId revision flow). Exact details in report/source. Existing Lead/draft history preserved, manual tasks and support snapshots, review routes/actions implemented. Claims include exact subject/sentence support, source/claim/resume/identity invalidation, new-revision provenance and approved supporting snapshot freeze. Validate independently.

**E integration request:** inject read-only transaction-compatible no-network evaluateOutreachReadiness into tools/run-send.ts; also keep mutable evidence/claims/person/assessment/ownership/posting/support snapshots stable through B reservation. D callback does not lock/mutate. This is a pending integration contract for R-D assessment, not an automatic B reopening/send permission. ReviewAction uses supporting-table SHARE locks/draft lock and existing B APIs; reviewers check actual race/locking behavior. Navigation/preparation/manual checkpoints and CI remain E work.

1. **Same existing R-D corrections01 re-review now**, packet ready/start unconfirmed, D idle. Further fixes return original D if independently required. CI standalone schedule superseded; repairs join E later, no parallel/automatic dispatch.
2. Broader YC **plus mandatory SPC/Alchemist/EF/MassChallenge/Seedcamp implementation/use**, optional legitimate free-tier email-provider adapters and S scorer RC-4/RC-5 remain queued. Finalize bounded source/provider/S packets after R-D without dropping them or reopening A/B/C. D's257 synthetic/local tests don't establish real source/company/cohort coverage.
3. Separate subscription-runtime isolation/enablement work + independent review; do not abandon final automatic goal or falsely enable it. Schedule intentionally without blocking unrelated deterministic work.
4. **E integration WITH deferred CI repairs:** one resumable command, accepted interfaces, stage/checkpoint/usage/quota, source funnel/UI/navigation/drain, wire D readiness, update docs, workflow routing/clean test artifacts/full repository verification. Human wants this later when Claude access refreshes. E/V packets not finalized; use actual accepted D/S/coverage/runtime reports, preserve CI guard evidence, no paid fallback or parallel chat inference.
5. Independent final verification and **actual integrated preparation run**, preservation comparisons, approval/hash/dedup/suppression checks and a real review cohort: **20 distinct companies targeting ≥15 evidenced early-stage mobile/AI startups**, suitable reachable people, supported hooks and credible detailed drafts. Expose shortfalls/source uncertainty rather than inventing a count. No outreach/enablement during implementation.

No final integrated preparation/full repository suite/real cohort exists yet. No defensible overall completion percentage was established.

## 11. REA and actual product research

REA6.5.0 installed globally for Codex/Claude with Node24.12 stable launcher `/Users/aryamanjaiswal/.local/bin/rea`; package under `/Users/aryamanjaiswal/.local/share/rea/lib/node_modules/rea-agents`; setup report `/Users/aryamanjaiswal/.local/share/rea/SETUP-REPORT.md`. Fresh client inventory exposed207 tools at setup. Preserve config backups; no reinstall needed. Keep its catalog out of routine preparation. Installing REA does not prove runner isolation.

Actual first-party workflow survey: Backdoor, PitchHired, AplyNow, ResuMail, FIRSTKNOCK; adjacent OSS createdbyharsh/OpenOutreach README. Not private algorithm/quality validation, not installed OSS code. FIRSTKNOCK matching/email was described as under development. REA actually observed AplyNow public DOM/accessibility in an owned temporary headless browser and cleaned it up; evidence `ev_8593c2ea1b4c5aeb8a481455c7557231ec9fa4b7c761f1fea8282993bff714f9`, record `scratch/joboss-product-research/aplynow-rea-evidence.json`. Capture partially incomplete due pending network; no authenticated flow. Use `docs/JOBOSS-PRODUCT-RESEARCH.md` for links, limitations and design implications. Don't claim deeper research than performed; REA isn't required for normal repository analysis.

Temporary C evidence: `/tmp/joboss-c-evidence/` (suite/check logs, synthetic funnel/ranking/funding JSON, shared-request probes, preservation hashes). Final B review evidence: `/tmp/joboss-rb-c03-YaYuQd/`. Temporary paths may disappear; essential conclusions are embedded in saved reports. Do not depend on their permanence or print credentials.

## 12. First response in the new orchestrator chat

Read handover/current re-review packet/D corrections01 report; check whether independent re-review arrived. Confirm **A/B/scoped C accepted; D claims293/all six fixed and awaits same R-D; CI with E later; mandatory source/provider/S/runtime gaps open; no live writes/rescoring/sending.** Process re-review scoped verdict or supply ready same-R-D prompt/start unconfirmed. Don't launch another builder/CI, dispatch agents/chats or reopen closed loops. Carry mandatory source implementation rows into future discovery/E/V packets and keep checkpoint current.
