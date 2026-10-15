# D — People, drafts and review corrections 01 report

15 October 2026, Asia/Kolkata. Executed the sole assignment in `docs/JOBOSS-D-CORRECTIONS-01.md`. **RD-1–RD-6 are implemented and locally verified; yielded for independent R-D re-review, without claiming acceptance.** All 257 original tests remain, with 36 additional tests: **293 passing unique tests across the prescribed 11 files**. No agents, chat dispatch, live writes/rescoring, automatic execution, model/provider operation, sending or extra spend. CI remains with E.

Read the correction packet, independent review and retained production probes, original D report/assignment, PLAN, applicable repository instructions and current D/C/B interfaces. The reviewer probes were evidence of the original defects, not fixed-result tests. Their scripts and outputs remain unchanged.

## RD-1 — identity and responsibility belong to one person

Corrected capture to start at the exact full-name field and find its own bounded name/role record. It stops before a parent combines multiple headings. The first role field must match the candidate title exactly after normalization. Conflicting exact-name records or structured employer/title records refuse verification. Similar names cannot supply either the name or role.

The original Jamie-marketing/Alex-CEO markup now selects no recipient, stores unverified research and creates no draft. Production-path tests also cover similar names, conflicting duplicate-name records, valid structured employer metadata and a published address on an employer subdomain. Existing founder and captured commercial-title product-responsibility positives pass.

Identity excerpts include the name/role fields and only explicit work statements whose subject is this exact person. Neighboring prose such as “Alex Chen builds the iOS SDK…” cannot qualify Jamie's Field Engineer title. Original authorship-versus-built/led checks remain intact.

New captures retain a bounded `identityRecord: {version:2, html}` proof in the existing JSON facts. Read-only validation re-parses that captured record, checks the exact current name/title/employer and requires the resulting excerpt to equal the stored person-bound evidence. Existing timestamps, FKs and evidence hashes remain necessary. Historical facts lacking that proof, including the combined-person false fact with freshly matching evidence snapshots, cannot establish readiness. Nothing repairs or rewrites them during a read; explicit authorized research must recapture identity. This conservative refusal also applies to older valid captures until recaptured.

Changed: contacts `person-research.ts`, `prepare.ts`, `verification.ts`; D tests. No schema or shared curation changes.

## RD-2 — one coherent displayed view and token

`outreachReview` now constructs the email, recipient, resume, sources, claims, task/support output, limitations, recomputed readiness and token inside one **read-only PostgreSQL REPEATABLE READ transaction** for standalone clients. Every query sees that same MVCC snapshot, including the final token query. There is no network, task enqueue or data mutation.

Caller-owned review transactions must explicitly use REPEATABLE READ or SERIALIZABLE. READ COMMITTED scopes throw a descriptive error before construction; resume in a fresh supported transaction. A default transaction alone is not claimed to supply snapshot consistency. Queue rows each have their own coherent review snapshot; the entire queue is not claimed to share one transaction.

The action retains current comparison under stabilizing locks. It explicitly uses READ COMMITTED for standalone decisions and refuses caller-owned older snapshot isolation, since locks cannot refresh an already established MVCC view. Such refusal returns `ok:false` and performs no approval. This prevents a previously opened repeatable snapshot from approving changed supporting data it cannot see.

The review token additionally binds the displayed writer/support tasks (including their input/output/reviewer metadata), relevant preparation/approval audits and company attempts. Supporting audit/task tables remain stabilized during the action.

Two real-connection regressions pause after the production task query, change either just the supporting excerpt or subject/composition on another connection, fulfill fresh support and gate the new view. In both, the displayed data/token consistently describe the old view; the token differs from current state and `reviewAction` refuses. Both have **zero approval rows/audits**. Fresh evidence: [excerpt race](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/race-excerpt.json), [email race](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/race-email.json). No hidden-field editing or alternate approval writer was used.

Actual browser submissions separately verify stale-page behavior through `app/outreach/actions.ts`, described below. The controlled during-construction scheduling is a production-function integration test; it is not misrepresented as a browser scheduling hook.

## RD-3 — historical anchors cannot reopen a closed chain

Preparation locks the existing company/campaign draft rows before inspecting them, then checks the latest relevant contact/slot chain independently of the requested historical anchor. An anchor selects the revision ancestry; it cannot override a later deliberate close.

The exact revision1 → explicit revision2 → close revision2 → repeat revision1 request returns `draft_closed`, **no draft IDs, no task IDs, no new row/task and no changed original row or Lead field**. An actual concurrent closure already holding the relevant draft is observed after the preparation lock waits; it produces the same refusal. Normal explicit/idempotent revisions, additional contact slots and selected-recipient behavior remain green. A closed chain does not block an independent company, other contact slot or explicitly selected independent fixture campaign. No campaign/slot is invented by the correction and no reopen action exists.

Changed: `draft/prepare.ts`; D regressions.

## RD-4 — current exact approved fixed candidate facts

@5 no longer copies the historical static INTRO/WINDOW facts. A private helper composes the introduction from the exact current active `identity.full_name`, `education.year_of_study` and `education.degree` texts, and quotes the full current `eligibility.internship_window` text. All four inputs must exist. It uses no static university/year/window fallback and does not infer education from dates. @1–@4 pitch, layouts, templates and claim-content files remain unchanged.

Preparation and writer input use that current copy. Merge refuses a base whose fixed copy/citations no longer match; after merge, readiness requires the exact currently rendered fixed text, roles, source and claim IDs. Changes after writing, semantic support or approval cannot renew incompatible wording by fulfilling another synthetic support task. Preserved drafts are refused rather than rewritten. Before initial preparation, changed approved facts are quoted honestly instead of the historical student/window wording; missing fixed facts block creation.

The semantic task additionally includes every factual deterministic @5 unit, marked **candidate**, with its exact candidate citations. @5 support coverage rejects company-kind labels for candidate units. The subject and all existing generated sentence/person/hypothetical coverage checks remain. The support snapshot version is now `joboss-d-support@3`, includes current fixed-claim inputs even if an old composition omitted a citation, and invalidates earlier generated-only support.

For the unchanged approved fixture, the introduction is exactly:

> I'm Aryaman Raj Jaiswal. Third-year B.Tech student at Netaji Subhas University of Technology in the 2026-27 academic year. Bachelor of Technology in Electronics and Communications at Netaji Subhas University of Technology, Dwarka, Delhi (Aug. 2024 - Present).

Its exact semantic units use the existing Intl sentence segmentation: `I'm Aryaman Raj Jaiswal.`, the full Third-year sentence, `Bachelor of Technology in Electronics and Communications at Netaji Subhas University of Technology, Dwarka, Delhi (Aug.`, and `2024 - Present).`. Each retains all three introduction claim citations and candidate kind. The abbreviation causes a split; exact current-copy equality independently validates the full introduction, and the checker also receives the full email and claims. The availability unit is `Available for an internship from December 2026 through January 2027, or from June 2027 through August 2027.`, citing the full-window claim with candidate kind. [Exact units and IDs](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/fixed-units.json).

The longer verbatim introduction preserves meaning at the cost of some brevity. Actual fixture bodies remain within 280 words: fallback **203**, named-person **216**, listed internship **218**, related internship motivated by senior role **223**. Supplied semantic outputs are synthetic, not evidence of real model judgment.

## RD-5 — substantive current listed-role context

The @5 task carries the intended title, exact current posting evidence IDs and a required substantive context sentence. The company hook must start with that sentence followed by its concrete product problem, citing the matching current ATS content hash and product evidence. This fits the existing hook schema; no task registry/schema or legacy template change was needed.

Supported internship context:

> I saw your iOS Engineer Intern posting and would like to ask about that internship.

Supported senior-role context:

> I saw your Senior iOS Platform Engineer posting; I'm asking whether a related engineering internship could fit that team's work.

These sentences motivate the inquiry and retain the specific intended role. They do not claim senior qualifications or an existing intern vacancy. The generic availability question remains after the project argument, with the role relationship already explicit in the body. The role sentence is an exact semantic support unit with ATS citations, followed by the existing product and conditional contribution units. A title token appended elsewhere cannot satisfy this contract. This is intentionally bounded wording; alternate phrasing requires a future supported revision of the private @5 contract.

Real task → fulfil → merge → semantic support → gate/review tests pass for internship and senior-role postings. Role-free writer output refuses merge with `listed_role_context_missing`; removing context or using the wrong role in a stored email refuses readiness even after fresh synthetic support. Old same-URL ATS evidence cannot support a changed role even when observation timestamps coincide. Current ownership/content-hash, changed/closed/stale/foreign role refusals remain enforced through C's unchanged context logic.

Review output adds `intent` with title, supported state and detail. UI shows the intended posting; role-free messages retain their Lead association but display **“Listed association · role context needs review”**, with approval disabled. Supported listed and true speculative paths remain distinct. The UI also uses the verified recipient suitability result, preserving a commercial-title recipient's actual supported responsibility in display.

## RD-6 — compatible D locks and honest contention outcomes

D preparation, @5 queue/merge/gate and support enqueue acquire the same transaction advisory lock **before** company/draft/task mutation or row locks. The order is D advisory → company/relevant drafts for preparation, or D advisory → draft for merge. Reentrant nested D operations share the caller's transaction. Standalone mutation entry points own a transaction; caller-owned mutation scopes must enter D before taking conflicting locks themselves. This conservative manual-path serialization sacrifices concurrent D throughput for a simple ordering contract.

Review uses **try advisory → draft FOR UPDATE NOWAIT → complete supporting-table SHARE NOWAIT**. It never waits while holding a partial review lock set. D work in progress returns explicit `ok:false` / “Review inputs are busy…” before attempting conflicting locks. A non-D draft/supporting writer similarly yields a bounded refusal. A savepoint rolls back partial row/table locks on PostgreSQL 55P03 and leaves a caller-owned transaction usable. Other errors propagate. This is lock-order/contention handling, not a timeout-only retry or swallowed success.

After all locks succeed, review compares the current snapshot, runs readiness and invokes unchanged B approve/revoke within that same transaction. SHARE locks cover company, evidence, claims, contacts/research, resumes/tracks/profile, Lead/opportunities/assessment/funding, suppressions, attempts, tasks and relevant audits. The draft lock and these locks remain through commit. B revoke's own draft lock, clearing and audit are preserved.

Regression scheduling holds the actual merge's draft lock before invoking actual review. Review safely refuses busy; merge resumes, commits and enqueues **one** support task, with **no 40P01 and no approval**. After genuine fixture support/gating, fresh approval and revoke succeed with one audit each. Representative preparation/review overlap also safely refuses, then preparation completes. Concurrent duplicate decisions produce exactly one approval and one supporting-snapshot audit. External draft/evidence lock cases refuse while subsequent caller-transaction queries still work. An old token remains refused after the merge.

The original pre-fix reviewer reproduction's SHARE-before-draft point is now unreachable while merge owns D's advisory lock. No B delivery/reservation code was changed, and this does not claim E's send reservation consistency is solved.

## Tests and local checks actually executed

Before implementation, newly written desired-result tests reproduced RD-1, RD-3, both education variants of RD-4 and RD-5 failures. `before-tests.log` contains five failed desired assertions, one unchanged valid refusal, plus one availability fixture error because the old task was already fulfilled; that error is not claimed as a clean desired-result reproduction. RD-2/RD-6 original defect evidence is the retained independent reviewer execution; fresh corrected real-connection regressions are in the final suite.

Final main run: **292/292 in 10 files**, 19.78 seconds. Preview ran last: **1/1**, 3.37 seconds. **293 unique tests / 11 files**, comprising the original257 plus36 new tests. Intermediate overlapping runs are not added. All original assertions remain; no validator/compiler flags, shared setup or guard were relaxed.

| Prescribed file | Passed |
|---|---:|
| `test/unit/recipients-d.test.ts` | 29 |
| `test/integration/recipients-d.test.ts` | 86 |
| `test/policy/contact-curation.test.ts` | 22 |
| `test/policy/contact-import.test.ts` | 16 |
| `test/policy/contact-verification-backfill.test.ts` | 13 |
| `test/policy/outreach-draft.test.ts` | 78 |
| `test/unit/email-v4.test.ts` | 3 |
| `test/unit/pitch.test.ts` | 9 |
| `test/unit/contact-classify.test.ts` | 21 |
| `test/integration/llm-handoff.test.ts` | 15 |
| `test/integration/recipients-d-preview.test.ts` | 1 |

Fresh JSON/logs: [main suite](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/final-tests.json), [preview](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/preview-tests.json). Backend `tsc --noEmit -p tsconfig.backend.json --incremental false` and separate UI `tsc --noEmit --incremental false`: **exit0**. The three original D TS2379 errors remain closed; no casts or weakened optional semantics were used to restore them. Lint, network guard, guarded process-only Prisma validation and whitespace check: **exit0**. Normal pg query-concurrency deprecation warning remains; no dependency changes were made. No full repository/remote CI or broad A/B/C rerun.

All fixture writes selected **outreach_test_joboss_d** through the unchanged shared configured-live exclusion and actual read-only identity probe, then ordinary immutable migrate deploy/setup. Serial files, network-disabled MockAgent/fake sources, .env and independent live identity capture were preserved.

## Actual browser/server-action checks

Ran the guarded Next preview only at **127.0.0.1:3106**, with process-only D URL and the visible synthetic D banner. Inspected queue **1 pending / 3 blocked / 5 ready**, named recipient/company fallback, exact fixed-copy support/claims, intern/senior listed context, roleless blocker, pending disabled action and revision2 → preserved original. These nine companies are synthetic and count as zero real cohort companies.

On ReadyCo, retained the displayed form, changed only a product excerpt on D, supplied fresh support and gated the new view. The unchanged email's stale form invoked the real `decideOutreach` server action and refused snapshot change. On InternRoleCo, changed subject/composition, supplied support and gated; its stale form also refused. Both had zero approvals/audits/attempts before any positive approval.

On unchanged FallbackCo, real browser approval succeeded: one approved row, one `draft.approved` and one `draft.outreach_snapshot_approved` audit. Real withdrawal returned status `composing`, null approval hash/time/by/sender and B's `draft.approval_revoked` audit preserving the old approval metadata. Afterwards: zero approved rows, three decision audits total, zero attempts. [Actual approved rows/audits](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/ui-db-approved.json), [withdrawn rows/audits](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/ui-db-revoked.json), [source refusal](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/ui-db-refused-source.json). Actual server logs retain the action requests and responses. No forged banner or edited hidden field was used.

Screenshots/DOM captures: `scratch/joboss-d-corrections-01/ui-{queue,listed-senior,listed-intern,roleless-blocked,person-ready,pending,original,source-refused,email-refused,approved,revoked}.*`. The controlled race tests and actual browser actions are separate evidence. Final synthetic fixtures were regenerated after browser checks for re-review; browser captures/row results retain their own earlier fixture IDs. Final small refinements propagate canonical employer domain and verified suitability; their production tests and both typechecks pass. The owned temporary tabs and both preview process trees were closed/stopped; no D preview remains.

![Actual stale source-view refusal through the server action](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/ui-source-refused.jpg)

## Exact correction inventory and preservation

Modified existing-at-correction-start files only:

- `src/outreach/contacts/{person-research,prepare,verification}.ts`
- `src/outreach/draft/{compose,prepare,queue-draft,support}.ts` — compose changes confined to @5 gating; legacy implementations unchanged.
- `src/outreach/review/{actions,queue,readiness,snapshot}.ts`
- `app/outreach/review.tsx`
- `test/fixtures/joboss-d/world.ts`
- `test/unit/recipients-d.test.ts`, `test/integration/recipients-d.test.ts`, `test/integration/recipients-d-preview.test.ts`

Added private `src/outreach/draft/{fixed-v5,role-v5}.ts`, `src/outreach/review/locks.ts` and this report. No core/schema/migration/config/registry/gateway/shared helper/package/lockfile/scorer/discovery/B approve/mail/send/shared app file was edited. Existing original D report, all review/correction/coordination packets, accepted A/B/C source and previous D edits outside this inventory are unchanged from this correction's starting hashes.

Before editing, captured **374 workspace file hashes, HEAD/index/.env, existing diff and 88 reviewer scratch artifacts**. Copied prior `scratch/joboss-d` to `scratch/joboss-d-corrections-01/retained-d` before any fixture rerun. Standard fixtures legitimately regenerated the two old fixed scratch outputs; they were not confused with retained evidence. Reviewer scripts/outputs were neither rerun in place nor overwritten. [Baseline](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/baseline.json), [final correction file manifest](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/final-files.json).

Final read-only preservation: all **57 live drafts/all14 protected fields and all11 indexes match**; live SendAttempt0 and completed JOBOSS migrations0. Stage **F5**, both sending flags false. D has **13 finished migrations with disk-equal checksums**, zero unfinished/rolled-back records and all11 protected index definitions equal. Immutable JOBOSS checksums remain preparation `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c` and uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`.

HEAD remains `6113f8db59cd8c3a213f090cdfd3946e80bc5e42`; index/.env unchanged; reviewer hash mismatches0; unowned source/report mismatches0. [Fresh preservation evidence](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d-corrections-01/preservation.json). No staging/commit/reset/stash/clean, constraint drop, db push/reset or live repair/migration occurred. Extra spend ₹0.

## APIs and exact handoff to E

Published prepare/readiness/support/review function parameter/result signatures remain compatible. `OutreachReview` adds the `intent` display object. Internal exported `validPersonFacts` adds optional trailing `companyDomain?:string`; production callers pass the canonical employer domain so an employer-subdomain email does not narrow identity incorrectly.

Transaction contracts are now explicit: standalone `outreachReview` owns read-only REPEATABLE READ; a caller-owned review needs REPEATABLE READ/SERIALIZABLE and READ COMMITTED throws. Standalone `reviewAction` owns READ COMMITTED; caller-owned snapshot-isolation decisions return a refusal. D mutations take the D advisory lock first in a transaction; callers must not prelock conflicting rows before entering them. Busy review refusal requires a fresh read/decision after work completes, never silent retry into approval. Existing legacy @1–@4 APIs/layout/claims and B approval hash/revoke stay unchanged.

`evaluateOutreachReadiness(db,draftId,now)` still accepts transaction-scoped Db, with no network, task enqueue, audit or data mutation; its actual READ ONLY positive regression passes. It does not independently stabilize arbitrary external concurrent writes. E still must inject this exact validator into B's callback, preserve the full approved support snapshot through reservation under a compatible locking/snapshot design, and wire shared manual preparation/navigation. No send reservation, runtime isolation or E CI change was attempted here.

No required RD correction is intentionally left unfinished. Independent R-D acceptance remains outstanding. Broader YC and South Park Commons, Alchemist, Entrepreneurs First, MassChallenge and Seedcamp source expansion, optional legitimate free-tier email adapters, RC-4/RC-5, real cohort/source/model quality, final integration and sending remain separately queued. **Yield to the current orchestrator; no next chat, agent, CI, E or reviewer assignment was started.**
