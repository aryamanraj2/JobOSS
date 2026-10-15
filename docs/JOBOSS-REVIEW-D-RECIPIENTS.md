# R-D — People, drafts and review independent review

15 October 2026, Asia/Kolkata. Start a **fresh human-run local chat named R-D — People, drafts and review**, workspace `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. D has returned its report and yielded. This is the **sole next assignment once the human submits the prompt**, start unconfirmed. All builders/other reviewers idle. No agents, chat dispatch or messages to other chats.

## Objective and evidence boundary

Independently review D against `docs/JOBOSS-WORKER-04-RECIPIENTS.md` and `/Users/aryamanjaiswal/Downloads/PLAN.md`. Read that packet, `docs/JOBOSS-D-RECIPIENTS-REPORT.md`, latest coordination/roadmap, actual changed source/tests and the relevant accepted interfaces. A/B/scoped deterministic C are accepted, RC-1–RC-3 closed: do not restart those broad reviews. Review D's consumer behavior where necessary; a concrete regression is actionable, not a reason to rerun every prior audit.

D claims 257 unique passing tests across 11 files, current backend/UI typechecks green, immutable live drafts and actual synthetic review-page inspection. Root read report/source/test assertions, final-tests.log (256/10), browser-result.json and two saved screenshots. Root has **not** independently run the D suite/database/preview or accepted D. Report claims and retained visuals are inputs, not your own execution.

Give separate verdicts for **D's deterministic/manual recipient → draft revision → support → exact individual review scope**, and **remaining integration readiness**. Source expansion, real-company/model-quality/cohort, scorer RC-4/RC-5 and automatic/runtime/send acceptance remain open. D's synthetic manually fulfilled tasks demonstrate lifecycle/invalidation, not the truth/quality of unreviewed model output or actual public-source coverage.

Source/tests/configuration/schema/migrations/Git and all existing documents are **read-only**. Write only new `docs/JOBOSS-D-RECIPIENTS-REVIEW.md`; supplemental temporary scripts/logs may be owned by you. Preserve unowned/concurrent coordination documents. Do not implement corrections, regenerate source, install dependencies or stage/commit/reset/stash/clean. After findings return, the orchestrator assigns bounded fixes to the original D builder.

## Actual scope and interfaces

Inspect `src/outreach/contacts/**`, D's changed `src/outreach/draft/{compose,prepare,queue-draft,support,v5}.ts`, new `src/outreach/review/{context,snapshot,readiness,actions,queue}.ts`, `app/outreach/**`, D's three CLI files, tests/fixtures and relevant callers. Check the inventory against D's starting hashes/diff in `scratch/joboss-d/`. Accepted `draft/approve.ts`, core/schema/config/registry/gateway/runner/scorer/discovery/mail/send and shared app root/actions/navigation were read-only in D and must remain preserved.

Verify actual exports/options/results, rather than assuming prose: prepareRecipients(db,gate,companyIds,opts), prepareOutreachDrafts(db,opts), queueDraftSupport/draftSupportStatus, supportSnapshot/reviewSnapshot, outreachReview/Queue and reviewAction. B callback seam is **evaluateOutreachReadiness(db: Db,draftId:string,now:Date): Promise<{ready:boolean;detail:string}>**. Check transaction-scoped Db compatibility and no network/enqueue/provider/audit/mutation. E owns later tools/run-send.ts injection and shared navigation/preparation command; absence correctly fails closed today.

Expected reported bounds: recipient default20/max100 unique companies, default4/max8 page attempts per company/pass including curation, ten strongest candidates with explicit selection continuation/coverage disclosure; drafts1–100 unique companies and1–6 contacts/company, default strongest one. Check actual invalid-option handling, distinct counting, selection, resumption/tasks and limitations. Returned draft IDs are not readiness guarantees. Explicit campaignCycle is required only to create a new association; it must not invent a cycle or invoke blocked scoring.

## Substantive review

### Identity, responsibility, public routes and research

Independently reproduce supported founders/CEOs, technical leaders/engineers/recruiters, generic/unknown and commercial-title-only negatives. A genuine captured relevant product responsibility may qualify despite a commercial title; do not impose a blanket Field/Sales Engineering or executive ban. Source prose about someone else, ambiguous cards, title proximity, page metadata, quotes/third-person mentions or similarly named people must not establish this person's employment/authorship. Writing an article is not proof they built/led the product.

Follow actual gated capture into ContactResearch and person/company Evidence: full identity/company/domain binding, exact excerpts, timestamp/current snapshot, external_source provenance and verified responsibilities. Test stale/future/changed/superseded evidence/caches, changed contact/company/full name/title, and incorrect source/person/capture fields. Inspect task/manual output handling: candidate URLs only, results cannot promote unverifiable identity/authorship, uncertainty produces blockers not successful verification. Normal gateway credits/robots/terms/rate/budget/deny remain; no source allowlist or zero-cost bypass.

Check strongest suitable **reachable** contact, deliberate selected-contact preservation, stopped/suppressed/manual-invalid choices, ten-candidate/page limits and missing/duplicate company inputs. Recruiting inbox fallback must invent no name; verified person without work must use a labeled company hook. Provider CSV attestation is distinct from verified employment/authorship; optional live Apollo/Snov adapters are intentionally not implemented here. Check exact route provenance and deliverability status rather than trusting verified=true. No inferred address or stopped-contact resurrection on recapture.

### Draft revisions, listed/speculative modes and history

Reproduce actual production preparation for founder/no-ATS speculative, valid listed role and older/larger/unknown-company inputs. Current C assessment/ownership/hash/role support must be consumed correctly without rewriting it; no vacancy/YC-cohort/size prerequisite for D research. Inspect advertised-role versus speculative email meaning and current-role revalidation; closed/stale/foreign/changed role associations must honestly refuse, not silently become valid vacancy claims. A listed-role workflow must still reflect the intended role even if the final ask concerns internships.

Preserve **all legacy draft states and captured fields**, especially null-prompt composing, closed and approved. Upgrade creates a distinct @5 revision with no inherited approval/hash; original body/composition/status/history stays intact. Test repeated and competing calls through actual database locks/constraints, exact work markers, explicit reviseDraftId+upgradeExisting semantics, changed input/fulfilled-task resumption, additional-contact slots and selected-recipient drift. Closed latest drafts/operator/Lead stops remain stops. Existing Lead/version/score/status and attached draft history must not mutate; new association has explicit cycle/current-fit provenance without pretending application scoring happened.

Review the relevant changed legacy tests for correct new founder policy and positive credit fixtures; ensure foreign-citation/redaction/schema/old @1–@4 behavior was retained, not weakened to pass. No bulk approval, dedup/cap/index/cycle evasion or original draft rewrite.

### Content, semantic support and final readiness

Inspect actual synthetic email outputs for detailed connected narrative, meaningful company/person hook, varied relevant approved project proof, correct matching resume and 280-word rule. No invented product features, availability, arrangements or unsupported built/led attribution. Conditional candidate contributions must read as hypothetical. Keep known location constraints/unknown eligibility visible.

Exercise the real shared handoff fulfilment/merge path with supplied **synthetic** valid and negative outputs, not direct replacement business logic. Verify exact generated sentence **and subject** units, no missing/duplicated/rewritten coverage or added/changed citations, correct person-claim kind even outside personHook, unsupported/uncertain overall output refusal, approved claims/links and current fixed copy. A supported label or ID membership alone must not bypass meaning checks. Be explicit that genuine semantic quality still depends on the human's real supplied support review, not a test verdict string.

Independently mutate unchanged draft dependencies: evidence excerpt/hash/company/person/source/freshness, claims/project metadata, resume/link/file/track, identity/route, assessment/selection/ownership/posting/funding and suppressions/stops. Verify support invalidates by current snapshot, approved support cannot be silently renewed by fulfilling a new task, and changed exact content/tasks cannot merge into another revision. Report conservative unnecessary re-reviews separately from false-ready defects. Test fixed-copy/candidate claims and listed/speculative meaning, not only custom llm lines.

Run evaluateOutreachReadiness in a real PostgreSQL **READ ONLY** transaction with a transaction client. Verify row/task/audit counts unchanged and no external request/provider/auth calls. Stored status/fit flags alone cannot satisfy it. Use ordinary ready and pending/blocked/malformed/expired/manual quota cases. Ensure default automatic runner remains blocked without importing offline helpers; no real runtime smoke required.

### Review snapshots, approvals, locking and UI

Follow page data → exact rendered subject/body/resume/recipient → displayed snapshot → server action → D reviewAction → existing B approve/revoke. One exact email per decision; refuse stale displayed data. Test independently selected changes before approval, races between source/claim/recipient update and snapshot validation, duplicate approvals, revoke and changed evidence after approval. Preserve B's accepted revoke lock/clearing/audit without alternate approval writer. A query-string status banner must not be mistaken for database acceptance. Review lock order/table SHARE locks for a **demonstrable** deadlock or incorrect ordering with existing preparation/revoke/reservation writers; report verified effects, not speculation or an unrequested lock redesign.

D requests E additionally hold its mutable source/claim/person/assessment/ownership/posting/support snapshots stable **through B's send reservation transaction**, as well as injecting readiness. Inspect that seam and state exact required integration contract; no send enablement or broad B reopening. Distinguish new-input integration work from B's already-closed delivery defects. Do not declare final send readiness merely because D's read-only callback passes before reservation.

Independently render/inspect `/outreach` and `/outreach/[id]` on a **guarded D-only** preview, including pending/blocked/ready, person/company fallback, evidence/claims/support, revision→untouched original, and an actual stale displayed snapshot refusal. Use a synthetic banner and explicit test target before server start; never open actions against live. Browser approval/revoke operations only on synthetic D fixtures are allowed. Compare resulting rows/audits, not only screenshots/status messages. Stop only your owned preview process tree and close your temporary browser afterward. Shared navigation/header wording is E-owned; D's screenshots aren't proof root inspected a live browser.

## Required execution and preservation

All fixture/preview writes **exclusively outreach_test_joboss_d**, yielded/idle builder target already approved. No invented R-D target/common/other worker/live fixture writes. Validate configured-live exclusion and actual read-only identity through shared helpers before normal immutable migrate deploy/setup/fixtures. .env unchanged; process-only environment captures live identity **before** DATABASE_URL substitution. Read D's command/preview/preservation helpers before use. Keep serial standard setup, network-disabled MockAgent/fakes. No db push/reset, dropped constraint, guard bypass, applied-SQL edit, dependency change or local generated-source write.

Execute the complete prescribed D selection on current final code, with exact per-file counts. Builder reports 256 across these ten, plus one preview, **257 unique/11 files**; its final79/2-file rerun overlaps and is not additive:

```text
test/unit/recipients-d.test.ts
test/integration/recipients-d.test.ts
test/policy/contact-curation.test.ts
test/policy/contact-import.test.ts
test/policy/contact-verification-backfill.test.ts
test/policy/outreach-draft.test.ts
test/unit/email-v4.test.ts
test/unit/pitch.test.ts
test/unit/contact-classify.test.ts
test/integration/llm-handoff.test.ts
test/integration/recipients-d-preview.test.ts
```

For a retained UI dataset, run the preview fixture last after ordinary serial tests finish; record any repeat accurately, not as new unique tests. Supplemental independent probes must call real functions, not solely duplicate the test helper's pre-attested happy path. Test helper-supplied manual semantic verdicts remain labeled synthetic. Inspect existing scratch outputs without overwriting builder evidence where possible; if normal tests emit to fixed D scratch locations, copy outputs to your new evidence folder and distinguish fresh versus retained runs.

Run backend/UI typechecks separately with incremental writes disabled (both expected exit0 now), lint/network guard/Prisma validation/whitespace. CI workflow fixes/full-repository suite stay with E and are not demanded here. No B-dedicated suites on D, no full A/B/C audits. Report any actual new error; don't repair it. Normal pg concurrency deprecation warning is not a passed future-driver claim.

Snapshot existing file hashes/HEAD/index/status before fixtures. D's original HEAD6113f8d/index may have changed externally; preserve actual current state without restoring others' work. Check the original protected live baseline only via BEGIN READ ONLY/ROLLBACK if accessible: **57 drafts/all14 captured fields, 11 index definitions, zero SendAttempt rows/completed live JOBOSS migrations, F5/both sending flags false**. D read-only migration/index comparison: **13 finished checksums**, no rolled-back rows; preparation hash `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`, uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. Source/config/Git preservation must be independently checked; no live approval/repair/migration/rescoring/source ingestion/mailbox/OAuth/auth/model/paid/provider operation or sending/enablement.

## Report and yield

Save **docs/JOBOSS-D-RECIPIENTS-REVIEW.md**, return labeled **R-D — People, drafts and review report** to the current orchestrator, then yield. Include:

- D feature verdict and separately remaining integration/runtime/source/cohort limits; confirmed findings with priority, absolute file/line, actual reproduction/effect and bounded owner request. Distinguish hypotheses/conservative availability from false verification/history or approval defects.
- Exact independent checks/file-test counts, meaningful representative recipient/draft/support/approval outputs, UI/action evidence, preservation and skipped/blocked checks. Don't add repeated79 tests or synthetic preview companies to real cohort counts.
- Verified signatures/limits/resume and E no-network readiness/snapshot/locking/navigation/manual integration contracts. If D passes, explicitly close its reviewed scope without pretending RC-4/RC-5/source expansion/automatic execution or sending passed.

**Broader YC and five requested portfolios remain mandatory separate implementation/use work:** South Park Commons, Alchemist, Entrepreneurs First, MassChallenge, Seedcamp, per `docs/JOBOSS-DISCOVERY-SOURCE-EXPANSION.md`; optional legitimate free-tier email-provider adapters likewise remain open. Do not impose those unassigned adapters as a new D correction or silently drop them. Future discovery/E/V prompts must carry them with per-source evidence. CI repairs stay with E later, per human schedule.

No next builder/reviewer, correction or E/S/coverage assignment starts here. Preserve all closed A/B/C findings; yield through the human for the orchestrator's next single assignment.
