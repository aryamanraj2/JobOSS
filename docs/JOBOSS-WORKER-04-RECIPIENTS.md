# D — People, drafts and review

Updated 15 October 2026, Asia/Kolkata. **Human schedule: D now; CI repairs with E later.** Start a **fresh human-run local chat named D — People, drafts and review**, workspace `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. Sole next assignment once the human submits the prompt; start unconfirmed. All other workers/reviewers idle. No agents, chat dispatch or messages to other chats.

## Objective and reading order

Complete recipient suitability/research, credible narrative @5 drafting, substantive readiness/support checks and a usable review queue. Support **both advertised roles and speculative inquiries about roles/internships that may not be advertised**. Vacancy, ATS, young YC batch and small team are not prerequisites for D research. Mobile/AI first, general software secondary. Broader YC discovery is separately queued; D consumes selected companies and does not claim to fix source coverage.

Read this packet, `/Users/aryamanjaiswal/Downloads/PLAN.md`, latest coordination/roadmap, and accepted interfaces. Relevant final evidence: A `JOBOSS-FOUNDATION-CORRECTIONS-02-REVIEW.md`; B `JOBOSS-B-CORRECTIONS-03-REVIEW.md`; C `JOBOSS-C-CORRECTIONS-01-REVIEW.md`, under docs. Consult the original C report for exports and product research for review/fit implications. Inspect partial D source and current diff before editing. **A/B/scoped C are accepted; RC-1–RC-3 closed.** Do not repeat broad audits.

Scorer RC-4/RC-5 remain blocked in unowned `src/intel/scoring/run.ts`. Do not call that scorer, mutate existing Lead score/version/operator history or invent campaign cycles. Automatic execution stays **isolation_blocked**; manual tasks remain usable. Complete authorized deterministic/manual functionality despite Claude quota/runtime unavailability; no paid fallback or fake automatic acceptance.

## Ownership and interfaces

Own `src/outreach/contacts/**`, `src/outreach/draft/**` **except preserve approve.ts read-only**, new `src/outreach/review/**`, new `app/outreach/**` including local actions/components, `tools/run-contacts.ts`, `tools/run-drafts.ts`, `tools/verify-f4.ts`, contact/draft/review tests and D-specific fixtures, and new `docs/JOBOSS-D-RECIPIENTS-REPORT.md`.

**Fix the three TS2379 contactId errors in compose.ts:590 and queue-draft.ts:223 (two calls).** They belong to D again; CI's proposed temporary ownership is revoked. Respect optional/null semantics, without casts or relaxed compiler/evidence types. CI workflow/test-artifact repairs are deferred to E, not assigned here.

Core/schema/migrations/config/task registry/API policy/shared test-target/setup/helpers/package/lockfile, scoring/discovery, mail/send, tools/run-send.ts and shared app root/layout/actions/navigation stay read-only. `approve.ts` includes accepted B revokeApproval locking/atomic clearing/audit; consume it without altering that contract. Use D-owned wrappers for review actions. Report exact necessary shared changes before editing unowned files; continue independent work meanwhile. No overlapping owners.

Consume existing ContactResearch, person-bound Evidence, draft revisions, @5/contact_research/draft_support/research_urls task schemas, approved project-link metadata, durable handoff/validation and positive research credits. Candidate search URLs are unverified until captured through the gateway. Preserve accepted isolation/manual behavior; no offline test helper in production.

Reuse C's current fit/ownership/freshness assessment logic and shared RankedOutreachCompany (`companyId,name,domain,...`); don't replace it with weaker title/source-ID checks. Preserve C's source facts and later recipient selections/status. Finish and publish exact **prepareRecipients** and **prepareOutreachDrafts** signatures/results, bounded limits, returned IDs/blockers and resume semantics for E.

Publish **evaluateOutreachReadiness(db: Db, draftId: string, now: Date): Promise<{ready:boolean;detail:string}>** in D-owned code. It must accept a transaction-scoped Db and perform **no network, task enqueue, provider call or mutation**. Substantively check current supported fit, suitable verified route/identity, concrete hook and exact current draft/support/evidence. Use this single validator for D gating/review; E later injects it into B's SendGateOptions callback in tools/run-send.ts. B correctly refuses @5 while the callback is absent. D tests the seam directly; no send wiring or weaker parallel validator here.

## Required behavior

### Recipients and research

Founders/CEOs, technical leaders, relevant engineers and recruiting contacts qualify through supported responsibilities. Remove inherited blanket executive exclusions where they contradict that policy. Field/Sales Engineering alone is insufficient; relevant actual work matters. Unknown/ambiguous responsibility stays visible, not guessed from one title word.

Choose the strongest suitable **reachable** contact first; preserve deliberate selections/stops or explain why invalid. Additional contacts remain subject to existing per-contact/company-slot caps/dedup, not a new blanket one-contact ban. Preserve suppression/stopped-contact rules. No address-pattern guessing, invented names, paid enrichment or provider activation.

Verify disambiguated identity/current company relationship before naming a person; verify authorship/responsibility before saying built/led/wrote. Capture source, excerpts, observations and exact person/company bindings in ContactResearch/Evidence. External public work retains external_source provenance. A foreign key or source ID does not establish support. Reject same-name/wrong-company/third-person/quoted-author confusion; stale/future/changed evidence must not stay verified via cache timestamps.

Reuse company research under existing gateway robots/terms/deny/rate/budget controls; positive credits, no alternate transport/domain trust. If identity is verified but person work unavailable, use a supported company hook and explicit review limitation. A verified published recruiting inbox may qualify without inventing a person. Missing routes/identity/source access/quota yield honest resumable blockers. Optional paid-provider seams may remain disabled.

### Drafts, preservation and support

Preserve @1–@4 compatibility, detailed connected narrative and **280-word ceiling** with established counting semantics. Choose relevant approved project proofs and matching resume; don't force a repeated project sequence. Conditional contribution ideas stay hypothetical; no fabricated vacancy/product/remote/sponsorship/relocation claim. Show eligibility uncertainty without blocking global research by default.

**Every original draft remains intact, including composing, closed and approved.** Upgrading creates a new @5 revision/new approval. Never reuse a legacy composing row solely because promptVersion is null. Resume may reuse only an identifiable newly created JOBOSS composing revision for the same current work. Preserve all original fields/body/status/hash, not only IDs. Honor revision/touch-slot uniqueness; no invented campaign cycle/constraint removal. Repeat/concurrent preparation must be idempotent or honestly refuse, not overwrite history.

If a Lead FK is needed, reuse without changing scoring/version/operator state. A necessary new speculative association must use current safeguards and explicit provenance; never call blocked scoring or imply an application assessment exists. Listed-role messages validate the current role; speculative messages honestly ask rather than imply a vacancy.

Queue/reuse bounded tasks and apply only current matching fulfilled work. Semantic support covers **every generated sentence and generated subject claims as applicable**, using identical text/citations and exact approved claims/project links/person/company facts. Citation membership alone isn't truth. Unsupported/uncertain/incomplete support stays blocked. Bind support to current content **and evidence/claim/identity snapshots**: unchanged draft text must not retain readiness after its evidence excerpt/hash, candidate claim, resume or recipient changed. No invented citations, model-label shortcut or automatic approval.

### Review UI and approval

Build a directly accessible review route under app/outreach: fit/trigger/source age, eligibility, chosen recipient/suitability/route provenance, exact subject/body/resume, claim/evidence excerpts, support, limitations and blockers. Render pending/blocked/ready examples. Keep user-facing language practical. Shared navigation wiring belongs to E.

Review/approve **one exact email/recipient at a time** through existing approval/revoke APIs and frozen hash. Use D-owned wrappers/actions, refuse changed snapshots; no bulk or automatic approval, alternate approval writer, send action or enablement. Preserve accepted B approve.ts/revoke behavior. If wrappers cannot safely meet a necessary interface, report the exact request. Synthetic approval/revoke tests on D are allowed; no live approval.

## Verification and preservation

All fixtures/UI demonstrations use **outreach_test_joboss_d exclusively**. Shared configured-live exclusion and actual read-only target identity before normal immutable migrate deploy/setup. Process-only environment; .env untouched. No common/live/other-worker writes, db push/reset, guard bypass or dropped constraints. Standard serial setup, HTTP mocking/net refusal/fakes stay. UI preview must demonstrably target D after preserving independent live identity; never preview actions on live. Hydrate existing placeholders without changing dependency versions/lockfile or weakening checks.

Test actual production paths: founder/no-ATS speculative and valid listed-role readiness; older/larger/unknown-company D inputs; commercial-title-only/unknown responsibility; ambiguous identity/wrong-person/company/unsupported authorship; stale/future/changed research; recruiting inbox/company fallback; strongest reachable/manual selection; source/quota/no-route resumability; every legacy draft state unchanged; new revision/new approval/no inherited hash; repeat/competing preparation; approved project/resume/word limit; exact support coverage and mutation invalidation; no-network transaction-scoped readiness; review snapshot changes/approval refusal and preserved B revoke contract.

Use shared tasks/manual fulfillment with **synthetic supplied outputs** in fixtures; do not enable subscription execution or call fake output real model-quality evidence. Show complete representative synthetic recipient/evidence/detailed-draft/check outputs, including person hook and company fallback. No synthetic case counts toward the final real cohort.

Run focused existing contact/draft/claim/handoff/approval suites plus D regressions with actual file/test counts. Don't run B-dedicated files against D or repeat broad A/B/C reviews. Run backend/UI typechecks separately with incremental writes disabled, lint/network guard/Prisma validation/whitespace. **The three known drafting errors should be gone.** Remote CI green/full repository repair is deferred, not a D launch prerequisite; meaningful local checks remain required. Don't fix unrelated unowned failures silently.

Render/inspect actual review screens against synthetic D data, including pending/blocked/ready/revision and changed-snapshot refusal. Record actual visual evidence separately from component tests. No credentials in UI/logs. Keep package conventions; request shared dependency changes rather than adding casually.

Snapshot relevant file hashes, HEAD and index. Preserve others' work/reports; no staging/commit/reset/stash/clean/history rewrite. Immutable SQL hashes: preparation `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. Verify D's 13 finished migration checksums/11 protected indexes after normal deploy; no applied-SQL edits.

If accessible, live comparison is **BEGIN READ ONLY/ROLLBACK**: 57 protected drafts/all 14 fields, 11 indexes, zero SendAttempt rows/completed live JOBOSS migrations, F5/both sending flags false. This does not authorize live preparation. ₹0 extra spend. No live data/migration/approval/rescoring/repair, source ingestion, mailbox/OAuth/auth/model/provider call, sending or automatic enablement. No runtime smoke or scheduled work.

## Report and yield

Save `docs/JOBOSS-D-RECIPIENTS-REPORT.md`, return **D — People, drafts and review report** to the current orchestrator, then yield. Include changed files/inherited versus implemented behavior; exact prepare/readiness/support/review APIs and B callback wiring request; actual synthetic outputs/task resumption/check counts/rendered evidence/type-error resolution/preservation; precise shared requests and source/identity/quota limitations. If unfinished, retain a precise resumable checkpoint; don't call partial work complete because quota is exhausted.

No R-D/CI/E/S/coverage assignment starts here. Orchestrator issues a **fresh R-D** independent review after this report; corrections return to this original D chat. **CI repairs join E later** when the human's available Claude access refreshes: combined future scope, not parallel CI/E chats or waived checks. Broader YC coverage/scorer/runtime/real cohort remain explicit queued work; preserve all closed A/B/C findings.
