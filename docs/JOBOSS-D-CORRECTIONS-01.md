# D — People, drafts and review corrections 01

15 October 2026, Asia/Kolkata. Use the **same original D — People, drafts and review builder chat**, workspace `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. Fresh independent R-D has returned six findings and yielded. This is the **sole next assignment once the human submits the prompt**, start unconfirmed. R-D/other chats stay idle while D edits. No agents, chat dispatch or messages to other chats.

## Objective and reading order

Correct **RD-1–RD-6 only**, plus necessary meaningful preservation regressions, against `docs/JOBOSS-D-RECIPIENTS-REVIEW.md`. Read this packet, the full review, your original report, original D assignment and current source; consult PLAN and accepted A/B/C contracts as relevant. Do not restart prior broad audits. Independent initial review passed257/257 unique tests/11 files and all local checks, but D is **not accepted** because the supplemental production-function probes demonstrate six gaps. The three original TS2379 typing errors are independently closed; preserve the now-green typechecks.

Reviewer evidence: `scratch/joboss-rd/fixed-probe.{mjs,json}`, `probes.{mjs,json}`, `probes-extra.{mjs,json}`, `readiness-matrix.{mjs,json}`, screenshots/logs; inspect actual paths/scripts before reuse. Some scratch scripts assert expected defects: exit0 is not a fixed-result pass. Root read report/source/retained outputs and independently reproduced RD-1's pure observer false identity; the database/race/deadlock reproductions remain independent R-D evidence, not root reruns.

## Bounded ownership and preserved interfaces

Own correction edits in:

- `src/outreach/contacts/person-research.ts`, `verification.ts`, with minimal `prepare.ts`/`suitability.ts` changes only if needed for unambiguous responsibility propagation/cache revalidation.
- `src/outreach/review/queue.ts`, `snapshot.ts`, `actions.ts`, `readiness.ts`, `context.ts` as needed for consistent displayed snapshots, current facts/role validation and compatible locking. New private helper inside this D-owned review directory is allowed.
- `src/outreach/draft/prepare.ts`, `queue-draft.ts`, `support.ts`, `v5.ts`, and the @5-specific portion of `compose.ts` only as required for these findings. A private @5-specific helper in the draft directory is allowed. **Legacy pitch/message/templates/email layout modules remain read-only unless you first return a precise necessary request**; don't change @1–@4 historical contracts to fix @5.
- D's unit/integration/preview tests and `test/fixtures/joboss-d/**`; narrowly necessary `app/outreach/**` data/decision rendering only for RD-2/RD-5. Write new `docs/JOBOSS-D-CORRECTIONS-01-REPORT.md`; preserve all earlier reports/coordination packets.

All core/schema/migrations/configuration/registry/gateway/test-target/setup/shared helpers, package/lockfile, scorer/discovery, B approval/mail/send and shared app navigation/actions/root remain read-only. **Do not edit `draft/approve.ts` or B reservation/gate/revoke**, even for RD-6; solve D's lock cycle in its owned callers. If an unavoidable fix exceeds this scope, report exact file/interface/behavior and continue independent authorized fixes; do not silently expand ownership.

Preserve public preparation/review/readiness signatures where possible, including transaction-scoped Db support and no-network/no-write readiness. Document any precise signature change for E. Existing task schemas/atomic enqueue/approved links are sufficient unless a demonstrated shared request is returned. No new schema/migration, score version/cycle workaround, weaker approval/suppression/dedup or relaxed guard/compiler flags.

## RD-1 P1 — one person's identity and responsibility

The original successful negative markup is:

```html
<section>
  <div><h2>Jamie Rao</h2><p>Marketing analyst</p></div>
  <div><h2>Alex Chen</h2><p>Co-Founder &amp; CEO</p></div>
</section>
```

Candidate Jamie's unverified title Co-Founder & CEO was borrowed from Alex. Actual prepareRecipients captured `Jamie Rao Marketing analyst Alex Chen Co-Founder & CEO`, marked identity verified and returned recipientState.ready=true. The public route alone said `Engineering inquiries: jamie@acme.example.`; it did not corroborate responsibility. Root pure observePersonPage also returned identityVerified=true.

Bind exact name and current responsibility to one unambiguous person record; a parent section containing multiple named cards must not supply a joint fact. Reject conflicting roles/name/title relationships, including neighboring cards and similarly named people; don't patch only a keyword such as Guest. Make fresh capture **and previously stored false person facts** unable to establish readiness solely because hash/FK/timestamps match. Revalidate or refuse those snapshots without live repair. Preserve valid single-person/structured employer proof, supported founder targeting and actual relevant product responsibility despite commercial title, plus authorship-versus-product-ownership distinction. Add production capture→prepareRecipients→stored research→recipientState/readiness tests, not just a pure selector test.

## RD-2 P1 — displayed content and submitted snapshot are one view

outreachReview currently reads rows for display, later calls reviewSnapshot with fresh reads. Reviewer's barrier after the task query allowed a separate connection to change evidence, fulfill current support and gate: returned display showed old excerpt while its hidden snapshot matched the newer database **before** reviewAction; approval succeeded. A subject/composition variant likewise approved unseen newer text. Action-time locks alone do not prove what was displayed.

Return exact email/recipient/resume/evidence/claims/support/limitations/readiness and its submitted token from one coherent view, or detect/retry a changing view before returning it. Preserve action-time current comparison; never generate a new token for data the user hasn't seen. Handle standalone and transaction-scoped callers honestly; a transaction at READ COMMITTED does not automatically give multi-query snapshot consistency. Choose a bounded supported implementation (e.g. coherent snapshot isolation or equivalent version verification), describe its consistency and failure/resume semantics, and retain no network/task writes in reads.

Use real production reads with controlled two-connection barriers to cover **supporting-excerpt-only** changes and subject/composition changes during page construction, as well as ordinary changes after rendering. The returned display/token must consistently describe the old or new view, or refuse/retry; it must not approve the unseen view. Verify actual rows/audits and browser/server-action behavior, including stable positive approval/revoke. No editable hidden field/forged banner shortcut; no alternate approval writer or live preview.

## RD-3 P1 — latest closed chain overrides historical anchor

Reproduce written revision1 → revision2 (explicit revision1 anchor) → close revision2 → repeat revision1 anchor. Current code uses previous=anchor, misses latest closed state and creates revision3/new writer task.

Check the **actual latest relevant company/contact/campaign/slot chain and deliberate stops independently of the anchor**, before reuse/create/task enqueue. An older anchor selects history, not authority to reopen a stopped chain. Don't confuse unrelated contact slots/campaign histories or block legitimate independent companies. Preserve all original row fields and Lead/score/operator history, existing uniqueness/cycle/send constraints. No cycle/slot invention or closed-status reset. Include no-new-row/no-new-task assertions on the exact negative, normal explicit/idempotent revision controls, concurrent relevant closure where practical, and preservation of selected recipient/additional-contact semantics. No new reopen action is authorized; return a clear blocker for a deliberate stop.

## RD-4 P1 — fixed candidate facts remain bound to current approved meaning

The email's static introduction `I'm Aryaman, a third-year student at NSUT Delhi.` survived active education claims changed to `Graduated; no longer a student.` and `No university education claim is approved.` The snapshot initially invalidated; a new support task omitted the deterministic introduction, so fulfilling its generated-only units restored readiness=true. WINDOW has an analogous static branch. IDs staying active and static string equality are insufficient.

Every factual fixed @5 candidate sentence must be validated against its **current exact approved inputs/meaning**, or be included in the real semantic support task with correct candidate citations/kinds and complete coverage, plus appropriate current-input refusal behavior. Do not merely add another hash or require active IDs; the demonstrated issue remains after the checker sees a new task. Use current approved facts when composing, and invalidate/refuse incompatible existing wording rather than rewrite preserved drafts. Cover identity/education/year/university and availability/window, both **before initial preparation** and after writing/support/approval, with meaningful unchanged-valid controls. A synthetic support verdict cannot establish facts the checker wasn't supplied; expose exact reviewed units/candidate claims and validate them. Preserve @1–@4 layouts/claims/word rule; no core/schema/type change or claim-content edit to force a pass.

## RD-5 P2 — listed-role intent must be real message context

Production validates a current owned Senior iOS Platform Engineer posting, but replaces the ask with generic internship availability and permits no mention/relation to that role anywhere in subject/body. UI labels it listed-role inquiry solely from the Lead.

Make listed-role messages substantively reflect the intended current role, even when honestly asking about a **related internship**. Do not imply the candidate qualifies for the senior role or a nonexistent intern vacancy. A role-free speculative message cannot be accepted/labeled as a completed listed-role message; refuse or clearly separate its supported intent without altering existing Lead assessment/history or silently converting the association. A token appended solely to pass a check is not meaningful role context. Preserve true speculative no-vacancy eligibility, conditional contribution wording, role/evidence/resume support and stale/closed/foreign/current-hash refusal. Test actual task input → fulfil → merge → semantic support → gate/review for both internship and senior-role cases, with wrong-role/removed-context/current-role-change negatives and supported related-internship positives. Keep 280 words/approved projects.

## RD-6 P2 — compatible D lock order without stale approval

R-D demonstrated real 40P01 deadlock: actual applyOutreachDraft held draft FOR UPDATE; reviewAction acquired table SHARE including llm_task and waited for draft; merge then enqueued support needing conflicting llm_task write while holding draft. Review failed P2010; writer committed. This is an availability failure, not an accepted stale approval/send bypass.

Resolve the actual cycle across **D review/merge/preparation** with a documented compatible acquisition order or equivalent safe transaction design, while preserving RD-2 display consistency, atomic current action comparison and B revoke locks/audit. Consider D preparation's company/draft/task locks too; don't just swap two lines and assume every path is safe. No weakening of snapshot stabilization, disabled-button security, arbitrary timeout-only handling, swallowed success or removal of support enqueue. Retries may complement a consistent design but must retain honest bounded outcomes and idempotence. Don't edit B delivery/core or claim final E reservation locking solved.

Reproduce the original two-transaction scheduling sequence using **actual applyOutreachDraft/reviewAction** and retain positive writer/approval/revoke results. Verify completion or explicit safe bounded refusal with no deadlock/partial duplicate approval, correct commits/row states and no stale snapshot acceptance. Include representative D preparation/review interaction and duplicate decisions. Keep supplementary scripts outside tracked production code if desired; new meaningful regression tests are D-owned.

## Verification and preservation

All fixtures/UI/race writes **only outreach_test_joboss_d**, with R-D idle. Shared configured-live exclusion and actual read-only identity check before normal immutable migrate deploy/setup. Process-only environment and preserved independent live identity before preview DATABASE_URL substitution; .env unchanged. Standard serial files, HTTP mocking/net refusal/fakes. No common/live/other-worker writes, db push/reset, constraint drop, guard bypass, install/generation/version/lockfile changes or broader cleanup. Preserve reviewer evidence before reusing normal fixed scratch outputs; identify fresh versus retained executions.

Retain all257 initial assertions and add desired-behavior regressions for six findings. Run the same complete11-file selection on final corrected source, with actual counts (preview last if preserving UI dataset):

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

Use original production-function failure controls plus meaningful variants/positives; record pre-fix failing desired-result assertions where practical, not simply the old expected-defect scripts' exit0. Preserve named policy/identity/legacy/revision/foreign citation/redaction/word/claim/hash/approval controls; no assertion deletion or relaxed validator just to pass. Run final backend/UI typechecks separately with incremental writes disabled, lint/network guard/Prisma validation/whitespace. No full repository/remote CI or broad A/B/C rerun; CI remains with E.

Render/inspect actual D-only UI for stable ready/blocked and listed/speculative context, exact display/token race refusal and ordinary approval/revoke using synthetic rows. Demonstrate corrected read/action behavior through production calls and actual relevant server action; a screenshot alone isn't a database verdict. Stop only your owned preview process tree/browser afterward. No real cohort/model-quality claim from supplied synthetic outputs.

Capture current HEAD/index/file hashes; preserve all unowned reports/config/schema/application work. No staging/commit/reset/stash/clean. Check D13 finished immutable migration checksums/11 protected indexes; JOBOSS hashes preparation `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`, uniqueness `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. If accessible, protected live baseline comparison only BEGIN READ ONLY/ROLLBACK: all57 drafts/all14 fields,11 indexes unchanged, zero SendAttempt/completed live JOBOSS migrations, F5/both sending flags false.

₹0 extra spend. No live source/contact/draft writes/repair/migration/approval/rescoring, mailbox/OAuth/auth/model/provider operation, sending/automatic enablement or runtime smoke. Readiness stays no-network/no-mutation; test/manual supplied semantics remain synthetic. Existing scorer RC-4/RC-5 untouched. E's validated snapshot-through-reservation, navigation/integration and CI contract remains queued, not implemented by this packet.

## Report and yield

Save **docs/JOBOSS-D-CORRECTIONS-01-REPORT.md**, return labeled **D — People, drafts and review corrections 01 report** to the current orchestrator, then yield. Include each RD-1–RD-6 disposition, exact changed files and before/after reproduction/positive evidence; display/token consistency and D lock-order design; exact fixed-claim/role support units; tests/file counts/checks/actual UI/row/audit results; legacy/live/unowned preservation; unchanged or precisely changed APIs/E contracts; genuine unfinished/shared blockers. Don't claim acceptance yourself.

Orchestrator will issue a focused re-review in the **same existing R-D reviewer chat** after your report, preserving prior positives and closed A/B/C findings. No new reviewer/builder/CI/E/S/coverage assignment starts here. Human's CI-with-E schedule stands. Broader YC and **South Park Commons, Alchemist, Entrepreneurs First, MassChallenge, Seedcamp** remain mandatory separate implemented/wired discovery scope per the source-expansion document; optional legitimate free-tier email adapters remain queued, not demanded inside these six corrections or silently omitted later.
