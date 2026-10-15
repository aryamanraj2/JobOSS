# JOBOSS coordination record

Current implementation contract: `/Users/aryamanjaiswal/Downloads/PLAN.md`, supplied by the operator on 14 October 2026. Its settled decisions supersede older handovers. The historical architecture plan remains an audit artifact.

## Baseline

Two independent read-only audits completed. Database backup: `scratch/joboss-baseline-20261014/outreach_dev.dump`. Starting contents of the five initially dirty files were incorporated into existing HEAD `266d711` during investigation; these contents remain the preservation baseline.

- 3,085 companies; 262 boards; 5,084 opportunities, all open; 45,143 evidence rows.
- Latest qualified company leads: 150; mobile 4, AI 50. Of these mobile/AI companies, 23 have seed-reported size 1–50, two have active verified contacts, none has an active draft.
- Funding records/signals: zero. Existing sizes and YC batches do not prove funding stage or date.
- 126 contacts; 92 verified; 109 named; 59 companies.
- 57 stored drafts: 21 awaiting approval (@4), 21 composing, 15 closed. No approval hashes or sends.
- Sending and external-recipient flags are false; stage F5. Test database is distinct from live database.
- Confirmed defects: missing job closure/reopening/current-hash checks, unverified ATS ownership, small startup filtering, no discovery cursors/funding, application ranking controlling outreach, blanket executive exclusion, no person brief, overbroad ATS citation scope, competing task claims, incomplete/duplicate inbox ingestion and inaccurate reply counts.
- Hypothesis only: two domains sharing one Lever board may reflect an acquisition; ownership must be verified rather than assumed.
- Typecheck and network guard passed initially. Lint and full test startup stalled; investigate before accepting historical green-test claims.

## Architecture and ownership

Keep TypeScript, Next, Prisma/Postgres, pg-boss, the fetch gateway and local CLI handoff.

1. One foundation owner controls schema/migrations, shared interfaces, core configuration/budget/API contract registry, LLM registry/runner and preparation orchestration. Add additive funding provenance, discovery checkpoints, recipient briefs, outreach assessments and preparation checkpoints. Preserve send indexes and approval/suppression fields. Draft revision uniqueness extends draft identity; send dedup remains unchanged.
2. Discovery builder controls ingest, ATS adapters/ownership/freshness, YC/StartupDB/HN discovery, funding and additive outreach priority. Preserve application ranking history.
3. Recipient builder controls contact suitability/research, citation scope, @5 drafting and review. Preserve all current written drafts. New versions require new approval.
4. Delivery work follows recipient work, with mail/send/inbox ownership explicitly reassigned. Independent reviewers receive substantial changes only after the owning builder yields its files.

Shared behavior: only an exact documented API method/path can use its API contract; websites always undergo robots checks. Deny/terms/rate/budget checks remain. No paid fallback. Missing budget produces a bounded resumable result; preparation may create a free-only envelope. Funding date precision is separate from observation time. External evidence binds company/person explicitly, never by trusting a whole vendor domain. Readiness depends on supported fit, suitable reachable recipient and concrete supported hook, independently of ATS/geography.

Preparation command: `npm run outreach:prepare -- --limit 20`. Persist per-stage checkpoints; use existing Codex access by default with Claude/manual alternatives; sanitized bounded task packets; never approve or send. First contact per company is the strongest suitable contact. Final cohort report exposes source coverage, eligibility uncertainty, provenance, support and blockers; 20 distinct companies targeting 15 evidenced early-stage mobile/AI startups is an acceptance measure, not permission to fabricate missing data.

## Next actions

Publish exact model/function contracts to builders; complete foundation; integrate discovery and recipient work; independent review and fixes; repair delivery defects; run checks serially against the separate test database; run integrated preparation and inspect actual cohort. REA setup runs independently with Node 24.12.0 and configuration backups.

## Verified progress

- REA 6.5.0 installed globally for both clients with a Node 24.12.0 launcher. Fresh Codex app-server inventory and Claude connection expose 207 tools. Root independently checked launcher from `/tmp`. Setup evidence and configuration-preservation checks: `~/.local/share/rea/SETUP-REPORT.md`.
- Initial typecheck, network guard and lint passed. Full test startup was blocked by iCloud-offloaded dependency files; root confirmed blocked filesystem reads and restored dependencies from the exact lockfile without package changes. Prisma and lint then completed normally.
- Foundation schema generated successfully. Independent discovery-worker review and root review found no send-index/approval preservation regression. Additional composite company/person evidence guards were added before deployment.
- `20261014170000_joboss_preparation` deployed successfully to `outreach_test`; live database remains unmigrated at this checkpoint.
- Protected baseline records saved separately: all 57 drafts' stored text/composition/status/approvals/citations and eleven send/suppression index definitions. Final verification must compare these records by ID.
- Root reproduced a funding-date support false positive (number of investors mistaken for day of month); discovery owner corrected parsing to require actual date syntax. Targeted regression test required before acceptance.

## Preserved work ownership

`audit_discovery` now builds discovery/funding/ATS and additive outreach priority, including scorer input freshness with a new immutable input-derivation version. `audit_outreach` builds suitability/recipient briefs/@5 draft revisions/support checking/review. `rea_setup` now owns shared foundation, policies, task leases/registry/runner/preparation and current documentation. No overlapping builder files are authorized. Delivery remains the next separate assignment after recipient work yields.

## Human-run handoff — latest instruction

The operator clarified that this chat must coordinate human-run worker chats by issuing prompts and reviewing returned reports. Do not spawn, restart, or message implementation subagents. No application-code edits by the orchestrator. Open fresh worker chats for bounded assignments; use the same worker chat for its fixes; review substantial changes in a separate fresh read-only reviewer chat. Return reports to this orchestration chat before assigning the next dependent task.

All three previous workers exhausted their usage allowance and are no longer running. Their uncommitted partial source changes are preserved; none is accepted as complete. No new test files were delivered at this checkpoint. Preparation command/review UI/delivery fixes remain incomplete. The subscription runner exists but is not verified. No paid fallback is authorized.

Root rechecked the live database after stopping: all 57 protected drafts exactly match the baseline, all eleven protected index definitions match, no JOBOSS migration is applied to live, and send attempts remain zero. Test-only migration deployment is the sole schema deployment so far.

Final checkpoint typecheck was actually run and failed with three `exactOptionalPropertyTypes` errors in recipient-owned files: `src/outreach/draft/compose.ts:590` and `src/outreach/draft/queue-draft.ts:223` (two calls), passing `contactId: undefined` to a scope expecting `string | null` when present. These are unfinished integration errors for the recipient builder, not permission for the foundation owner to edit outside its boundary. No completed integrated test run or preparation run exists.

Human-run parallel schedule: **A Shared foundation** and **B Inbox/delivery** may start now with disjoint ownership and dedicated local test databases. **C Discovery** and **D People/drafts** may run in parallel after A's foundation is accepted. Each substantial change receives a fresh independent read-only review. **E Integration/preparation** follows accepted feature reports, then **V Final verification**. See `docs/JOBOSS-CHAT-ROADMAP.md` and worker packets 01–04. Integration/final prompts will be issued after reports establish actual interfaces. Do not change an already applied migration; any corrections need a subsequent migration.

Outstanding review findings to carry forward:

- Budget check/spend writes are separate; concurrent requests can overspend the last credit. Serialize shared-envelope live requests or implement atomic reservations.
- Exact-date funding support regression needs a test for "14 investors" being confused with October 14.
- Existing legacy composing drafts must be preserved as well as completed drafts. Only new JOBOSS revisions can be reused during resume.
- Person evidence requires both company/person binding and verified identity/authorship. External person pages use `external_source`; research costs one credit.
- Draft support must check interpretation, exact generated-sentence coverage, unchanged citations and content-hash freshness; include approved project link metadata when needed.
- Selected-cohort ATS refresh, semantic support drain, actual review UI and per-source cohort reporting still need integration.

## A report received — pending independent review

The human returned `docs/JOBOSS-FOUNDATION-REPORT.md`. A yielded foundation ownership. Reported evidence: 83 focused tests passed, generation/network guard/lint/diff checks passed; three recipient-owned optional-property errors remain; older regression selection had 37 passes/four failures. No full suite/model inference/preparation/cohort run. Protected live state reported unchanged. These claims are not yet independent acceptance.

Root inspected the report, current budget/gateway/runner/validation/test code and confirmed an additional issue for review: `test/helpers/db.ts` restricts test URLs and actual database names to `outreach_test`, conflicting with the dedicated-worker test database contracts. A's report used the common database rather than its assigned `outreach_test_joboss_a`. Preserve live guards; fix flexibility through A after independent review. Do not run concurrent destructive tests on the common database.

Latest scheduling preference: only the initial A/B pair runs in parallel. After the pair, launch one new assignment at a time. B's report is pending here. Next queued assignment is fresh **R-A — Foundation review**, packet `docs/JOBOSS-REVIEW-A-FOUNDATION.md`; start after B finishes. Any A corrections return to the original A chat. C/D and later prompts await accepted foundation and will be issued sequentially under the new scheduling preference.

## B report received and R-A started

The human returned `docs/JOBOSS-B-DELIVERY-REPORT.md` and confirmed R-A started. B yielded delivery ownership and reported 114 tests passed in its dedicated database, lint/network/UI checks passed, with the same three recipient type errors remaining. B remains pending independent review. Requests for A correction: additive nullable provider RFC Message-ID on shared ProviderMessageRef; optional precise incomplete-ingestion reason code. D must export `evaluateOutreachReadiness(db, draftId, now): Promise<{ready:boolean;detail:string}>`, usable with a transaction client and no network. @5 sending currently fails closed while this seam is absent. Consolidate requests after R-A's findings; do not launch overlapping work.

## Product research correction

The operator clarified that comparison should cover actual competing job-outreach products. Public first-party workflows for Backdoor, PitchHired, AplyNow, ResuMail and FIRSTKNOCK were surveyed; OpenOutreach's README was examined as an adjacent OSS qualification reference. Actual REA observation captured AplyNow's public DOM/accessibility in a fresh temporary browser, with cleanup confirmed. No authenticated workflow/private matching accuracy was tested. Findings, limitations, source links and retained REA evidence are in `docs/JOBOSS-PRODUCT-RESEARCH.md`; incorporate relevant patterns before finalizing C/D/E packets. No application code, outreach data or sending configuration was changed for this research.

## R-A report received — changes required

The human returned `docs/JOBOSS-FOUNDATION-REVIEW.md`. Independent result: 47 offline tests passed; A's database-backed 83-test selection could not be reproduced on a dedicated database. Six actionable findings: hardcoded shared test target/pre-migration guard gap; zero-cost research bypass; duplicate global-envelope ambiguity; authorship accepted without identity evidence under an unverified output label; surviving descendant after timeout; concurrent duplicate enqueue. Three recipient type errors and unsafe ATS fixture failures remain external to A.

R-A independently confirmed 57/57 protected drafts and 11/11 indexes unchanged, zero send attempts/live JOBOSS migrations, original test migration checksum intact, and sending disabled. Actual model-visible runner isolation remains an operational validation gap.

Next sole active assignment: original A chat executes `docs/JOBOSS-A-CORRECTIONS-01.md`. Ownership extended to minimal test/global setup safety changes and obsolete budget regression expectations; no recipient/B edits. Additive actual provider RFC ID shared interface requested by B is included. Optional new inbox reason code deferred. New uniqueness migrations must not rewrite applied SQL or automatically reconcile records. After A reports, return to original R-A for recheck; B remains pending its separate review. Discovery/recipient/integration chats remain queued.

Root additionally ran a live read-only transaction after receiving R-A: no duplicate global budget periods and no duplicate pending/claimed task identity groups were present. This confirms current reconciliation is not needed for those groups; it does not establish race prevention or authorize a live migration. Source inspection corroborated the unfenced enqueue, conditional identity-evidence check, early child-close cleanup and missing pre-deploy test guard. No application edits or live writes were performed by root.

## A corrections 01 received — pending R-A re-review

On 15 October the human returned `docs/JOBOSS-A-CORRECTIONS-01-REPORT.md`. A reports all six corrections, B's optional actual provider RFC ID, 161 tests passed/eight files on `outreach_test_joboss_a`, thirteen migrations there, and protected live state unchanged. Backend retains three recipient type errors; old handoff tests retain three unsafe ATS fixture failures. These remain report evidence pending independent reproduction.

Root inspected corrected harness/target validator, exact zero-cost operation matcher, transaction-scope helper, shared RFC ID and new uniqueness SQL. Root independently matched both migration disk hashes: original `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; correction `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. No application edits or live deployment by root.

Operational boundary remains open: the genuine Codex smoke returned valid synthetic output but only self-reported its tools; no authoritative tool/catalog/event evidence was retained. Claude inference was skipped on a cached exhaustion snapshot. Do not describe automatic untrusted-task execution as isolated or ready on that evidence.

Next sole assignment: existing R-A chat runs `docs/JOBOSS-REVIEW-A-CORRECTIONS-01.md`; A and B remain idle. Re-review must assess core invariants independently and distinguish automatic-runner isolation readiness, including whether it fails closed pending proof. B independent review and C/D/E remain queued. Do not launch another builder while this one assignment runs.

## R-A corrections 01 re-review received — five original findings closed

Human supplied `docs/JOBOSS-FOUNDATION-CORRECTIONS-01-REVIEW.md` (duplicate attachment delivery refers to the same report; one review, not two). R-A independently closed zero-credit research, budget/enqueue storage invariants, authorship and descendant cleanup on macOS. Actual independent PostgreSQL/process probes support these conclusions. Exact eight-file suite: 160 passed/one failed, because the enqueue child requires A's database. Live preservation remains 57/57 drafts, 11/11 indexes, zero attempts/live JOBOSS migrations.

Remaining C1: test endpoint exclusion normalizes localhost but not localhost.; same live/test endpoint can be treated as distinct. Root independently reproduced the pure validator acceptance without connecting to the database. C2: child fixture hardcodes A instead of using the validated selected reviewer target. C3: automatic execution has no isolation-readiness guard; complete capability isolation is unverified. R-A's synthetic runtime trace says Code Mode unavailable/fail closed; that does not prove every capability absent.

Next sole assignment: original A executes `docs/JOBOSS-A-CORRECTIONS-02.md`. Architecture decision: conservatively exclude test names equal to any independently configured live database name regardless of endpoint alias, while retaining exact local allowlists. Real untrusted automatic execution must explicitly return a resumable isolation block before claim/auth/launch at batch and direct boundaries. Keep intended Codex default/manual interfaces; no arbitrary verification flags or inference-based claims. This temporary unavailable state does not finish the eventual subscription workflow; isolate/unblock it in a separately reviewed task before final automatic preparation acceptance. No new model smoke needed for this correction.

After A reports, existing R-A performs a targeted recheck. B independent review, discovery, recipient features and integration remain queued and idle. Preserve the five closed findings instead of reopening their implementation scopes unnecessarily.

## A corrections 02 received — targeted R-A acceptance check next

Human returned `docs/JOBOSS-A-CORRECTIONS-02-REPORT.md`: A reports C1/C2/C3 implemented, 193 tests in the prescribed eight files plus 22 new isolation-boundary tests, normal checks passed apart from the three unchanged recipient errors/three historical ATS-fixture failures. No new migration or actual provider inference. Automatic Codex/Claude execution explicitly returns `isolation_blocked`; manual handoff remains usable. The report yields all files for independent review; reported counts are not yet independent acceptance.

Root inspected actual source/tests and independently ran a no-write/no-provider probe: three former same-name alias/port targets rejected, distinct-name R-A target accepted, twenty direct automatic cases blocked despite injection seams, status-only batch returned a resumable block and skipped fulfilled work, manual selection remained available. Zero database connections/provider launches in this probe. Source search found no production import of the offline runner helper. Both original/corrective migration disk hashes still match the expected values; whitespace check passed. Root made no application edits or live writes.

Next sole assignment: existing R-A executes `docs/JOBOSS-REVIEW-A-CORRECTIONS-02.md`. Scope is C1/C2/C3 and meaningful preservation regressions, with the original five findings retained as closed unless a concrete regression is demonstrated. Acceptance can be core foundation accepted / automatic execution blocked. Provider/runtime isolation remains a separate prerequisite for final automatic preparation acceptance. No additional model smoke or broad research in this review. A/B/C/D/E remain idle; do not launch parallel work. After R-A returns, choose the next single assignment from the verified verdict; B independent review remains queued.

## Human authorized parallel R-B review

The human asked to begin B review while R-A re-review is pending. This supersedes the preceding one-assignment restriction for this **pair of independent reviews only**. Root inspected B's report, delivery config/helper, current guarded shared setup and delivery entry points. R-A fixtures use `outreach_test_joboss_ra`; R-B is assigned the idle B target `outreach_test_joboss_b`. Source/schema/config remain read-only, reports have disjoint paths, and shared generation/build-cache mutations are excluded. No builders are authorized to run concurrently with the reviews.

Fresh R-B receives `docs/JOBOSS-REVIEW-B-DELIVERY.md`; existing R-A continues its targeted corrections-02 review. Maximum two active worker/reviewer chats. B's original 114-test result remains unaccepted until independent reproduction. Its provider RFC ID request has been implemented by A; D's final transaction-safe @5 readiness callback and integration remain explicit blockers, with absence required to fail closed. Optional precise inbox reason code remains deferred. No live inbox, sending, approval or paid operations are authorized.

Return both labeled reports to this orchestration chat. Coordinate findings/ownership before issuing any builder corrections; C/D/E remain queued. Updated roadmap and R-A packet record the limited parallel-review exception. No application edits or agent dispatch by root.

## R-A corrections 02 accepted — foundation review closed

Human returned `docs/JOBOSS-FOUNDATION-CORRECTIONS-02-REVIEW.md`. Root read the full independent report and accepts its scoped conclusion: **shared foundation accepted for dependent discovery, recipient and manual-preparation implementation; automatic subscription execution remains blocked**. C1/C2/C3 are closed, and the five earlier findings remain closed with no concrete regression. Do not issue another foundation correction/re-review assignment unless later work demonstrates a new defect.

Independent R-A execution on `outreach_test_joboss_ra`: prescribed eight files 193 passed/zero failed; two isolation files 22 passed/zero failed; older budget/handoff selection 25 passed/three historical ATS-fixture failures (overlapping budget counts, not additive). Seventeen no-write target rejections, six approved distinct-name target selections and 32 direct blocked calls plus batch/manual probes corroborate the code boundaries already spot-checked by root. Lint, network guard, schema validation, UI checking and whitespace passed. Three existing recipient backend errors remain D-owned. The three historical handoff ATS fixtures require bounded feature/regression-owner correction without weakening citation/ownership rules.

R-A independently reports thirteen reviewer migrations with matching checksums, both corrective indexes, 57/57 live protected drafts and 11/11 protected indexes unchanged, zero send attempts/live JOBOSS migrations, F5 and both sending flags false. No application changes or real provider/mail/source operations in that review. Root performed coordination-document updates only on receipt; no redundant rerun of the already reproduced suites or live writes.

**Current active assignment: R-B inbox/delivery review only.** A and R-A are complete/idle. Retain the authorized scheduling boundary: wait for R-B's report before launching a builder or another review. Discovery C is the next feature priority after B's findings have been triaged and any prerequisite/shared correction assigned; a prompt will be issued then. C/D/E must consume `isolation_blocked` honestly and preserve manual handoff. Accepted core status does not authorize automatic inference, a live migration, approval, sending or final preparation/cohort acceptance.

Remaining end-to-end gates: B independent acceptance/corrections; C discovery/funding/ATS freshness and outreach priority; D recipient research/drafting/readiness and its type errors; separately verified subscription-runtime capability isolation and reviewed enablement; E resumable preparation/review integration; final integrated checks, live preservation and evidenced cohort assessment. Runtime isolation remains an explicit unfinished requirement for automatic preparation and is not waived by this acceptance.
