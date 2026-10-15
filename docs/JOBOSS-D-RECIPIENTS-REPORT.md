# D — People, drafts and review report

15 October 2026, Asia/Kolkata. Sole D assignment in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. Implemented and verified the bounded deterministic/manual recipient → revision → support → individual review path. **Yielding D for a fresh independent R-D review.** This is not acceptance of automatic execution, source coverage, scoring integration, a real cohort or sending.

Read the worker packet, Downloads/PLAN.md, coordination/roadmap, accepted A/B/C correction reviews, original C exports and product research. No agents, chat dispatch, new chat, live preparation/approval/rescoring, mailbox/auth/provider inference, sending, paid enrichment or scheduled work. CI workflow repairs remain with E. Extra spend: ₹0.

## What was inherited and what D completed

Inherited partial code already permitted several responsibility categories, captured some person evidence, supported the @5 schema/layout, queued support tasks and introduced draft revisions. It had no review route, trusted stored fit/identity flags, omitted subjects from support, hashed only draft content, and could reuse a legacy composing draft with null promptVersion.

D completed:

- Current published-route, employment identity and responsibility checks; founder/CEO/technical leadership support; explicit commercial-title-only/unknown refusals; a captured employer product responsibility can qualify someone despite a commercial title. Existing executive classification remains descriptive for compatibility, not a targeting veto.
- Employer person cards/metadata, exact full names, employer-linked external authorship, person/company bindings and immutable source snapshots. Third-person mentions, quotations, mismatched employer/author identity, unsupported built/led attribution and future/stale/changed proof fail closed. Authorship establishes writing, not product ownership. Missing personal work retains an explicit company-hook limitation. Recruiting inboxes invent no person.
- Bounded candidate URL/manual research resumption through the existing gateway, fresh route recapture without reviving stopped contacts, positive-credit real-gateway regression, preservation of deliberate selections and strongest reachable ordering. No alternative transport or paid provider was added.
- A new identifiable @5 revision rather than legacy-row reuse; explicit revision anchors, company-lock serialization, stable contact slots, task/input snapshot matching, no inherited approval/hash and no scoring mutation. Listed roles use C's current ownership/content/freshness checks; speculative emails explicitly ask whether internships are available.
- Exact generated-sentence **and subject** support, matching citations, actual source/claim/resume/identity snapshots, conditional contribution ideas, approved project links, matching hosted resumes and the existing 280-word counting semantics. Semantic review is a separate manual task; unsupported/uncertain/incomplete review remains blocked. Source/claim changes invalidate unchanged text. New support cannot silently renew an old human approval.
- The read-only readiness seam, directly accessible `/outreach` and `/outreach/[id]`, current fit/trigger/eligibility/route/source age, exact email/resume, source and approved-claim excerpts, per-sentence support, pending/blocked/ready states and earlier-revision access. Individual approve/revoke actions compare the exact displayed snapshot under locks and call the existing approval APIs. No send or bulk-approval UI exists.

All production edits are D-owned. Existing `src/outreach/draft/approve.ts`, schema/migrations, core/task registry/config/policy, scoring/discovery, mail/send, tools/run-send.ts, package/lockfiles and shared app root/navigation remain untouched by D.

## Published integration interfaces

The exact exports are in the source files below. `Db` accepts an ordinary client or transaction-scoped client.

```ts
// src/outreach/contacts/prepare.ts
prepareRecipients(
  db: Db,
  gate: GatedFetcher,
  companyIds: string[],
  opts?: { now?: Date; limit?: number; maxPages?: number; interPageDelayMs?: number },
): Promise<{
  selected: { companyId: string; contactId: string }[];
  blockers: { companyId: string; contactId?: string; reason: string; detail: string }[];
  researched: number;
  limitations: { companyId: string; contactId: string; detail: string }[];
  taskIds: string[];
}>

// src/outreach/draft/prepare.ts
prepareOutreachDrafts(db: Db, opts: {
  companyIds: string[];
  limit: number;
  now?: Date;
  upgradeExisting?: boolean;
  campaignCycle?: string;
  additionalContacts?: number;
  reviseDraftId?: string;
}): Promise<{
  draftIds: string[];
  taskIds: string[];
  blockers: { companyId: string; reason: string; detail: string }[];
}>

// src/outreach/review/readiness.ts
export async function evaluateOutreachReadiness(
  db: Db, draftId: string, now: Date,
): Promise<{ ready: boolean; detail: string }>
```

Recipient limits: default 20, maximum 100 unique selected companies; default four, maximum eight page attempts per company/pass, including curation; ten strongest contact candidates per company. The ten-contact bound reports its coverage limitation; an explicit selected recipient permits continuing beyond it. Candidate URLs are unverified until gateway capture. Existing current verified research is reused without network; matching fulfilled contact reviews can add limitations or downgrade uncertainty, never promote identity/authorship. Blocked search tasks return IDs for manual handoff and gateway-based resume. Missing routes, source access, suppressed/stopped choices and budgets remain visible.

Draft limits: 1–100 unique companies, 1–6 contacts/company, default strongest one. Additional contacts retain their own slots and individual reviews. Repeating/concurrent calls reuse the same identifiable current JOBOSS revision/tasks. Existing arbitrary/legacy composing rows are never reused. `upgradeExisting` permits a new revision where an earlier draft exists; it is not permission to overwrite it. To intentionally revise an already written current email, provide `reviseDraftId` plus `upgradeExisting`; the same explicit request resumes idempotently. A latest closed draft remains a deliberate stop. `draftIds` include pending or preserved approved emails and are **not a readiness guarantee**; consume blockers and the validator. Already approved @5 emails are revalidated without requeueing or rewriting them.

An existing Lead association is reused without updating any field. When no association exists, the caller must explicitly supply the authorized `campaignCycle`; D does not manufacture one. A new speculative association has candidate status, null score/version and audited current-fit provenance explicitly stating no application assessment/scoring occurred. Existing listed-role associations with stale/changed/closed/unowned postings return `listed_role_not_current` rather than being silently turned into speculative ones.

C's pure `assessOutreachCompany` is recomputed from current source rows. Stored `fit.supported`, assessment status, foreign keys and ATS host/title words alone cannot establish readiness. D preserves existing selected contacts/later statuses and does not rerank or rescore them. New associations/selection writes occur only in the authorized preparation path, not readiness.

Additional D exports:

```ts
queueDraftSupport(db: Db, draftId: string): Promise<{taskId: string; created: boolean}>
draftSupportStatus(db: Db, draft: {id: string}): Promise<{supported: boolean; detail: string; taskId?: string}>
supportSnapshot(db: Db, draftId: string) // current persisted inputs + hash
reviewSnapshot(db: Db, draftId: string): Promise<string>
outreachReview(db: Db, draftId: string, now?: Date) // full review or null
outreachReviewQueue(db: Db, opts?: {limit?: number; now?: Date}) // default 20, max 100
reviewAction(db: Db, input: {
  draftId: string; snapshot: string; by: string;
  action: 'approve' | 'revoke'; now?: Date;
}): Promise<{ok: boolean; detail: string}>
```

Support task identities use `DraftSupport / <draftId>:<supportSnapshotHash>` with the accepted `draft_support@1` schema. Generated paragraphs are split into exact sentence units; the subject is a separate unit with its draft citation set. Every unit must appear exactly once with unchanged text/citations. Personal attribution receives person checking even when placed outside the optional personHook. Semantic output must support every unit; overall labels alone do not pass. The snapshot includes current draft/composition, recipient/route/research, company/evidence/opportunities/ownership/funding/assessment, relevant approved claims and candidate links, resume, sender identity, suppressions and approved project-link metadata. Identical claim reseeding timestamps do not change its semantic fingerprint. Old content-only support tasks cannot grant @5 readiness.

Readiness performs **no network, task enqueue, provider invocation, audit or mutation**. An actual PostgreSQL READ ONLY transaction passed it successfully. It checks current fit, operator/delivery stops, suppression, verified exact route/identity, concrete cited hook, listed-role currency, exact rendered composition/citations, conditional speculative wording, current fixed copy/claims/project facts/resume, freshness, quality and snapshot-bound support. Approved messages additionally require D's audited support snapshot to match their frozen human approval. The ordinary B approval hash/API remains unchanged.

Review actions hold the draft lock and SHARE locks on supporting tables through comparison and approval/revoke. Approval calls B's `approveDraft` and records D's supporting snapshot in the same transaction; revoke calls B's `revokeApproval`, preserving its row lock, atomic clearing and audit. Snapshot changes refuse with: **“The review snapshot changed. Reload and review the current email before deciding.”** Approval never queues work or sends.

CLI: `contacts:curate -- --company-id <id>` selects bounded companies independently of qualified Leads/ATS; `--report` remains read-only. `drafts:run -- --prepare --company-id <id> [--upgrade-existing] [--campaign-cycle <authorized-cycle>] [--revision-of <id>]` uses the new revision path. CLI @5 approve/revoke requires the displayed `--snapshot`; `--review` prints it. `--recompose` is routed to explicit selected-company @5 revision preparation. Legacy @1–@4 task merging/rendering and existing approval contracts remain compatible. E should use the new preparation exports, not the historical application-ranked composer.

## Exact requests for E; no unowned file was edited

1. In `tools/run-send.ts`, inject D's exported `evaluateOutreachReadiness` into B's existing `SendGateOptions.evaluateOutreachReadiness` callback. B correctly refuses @5 without this callback. Do not substitute stored assessment bits or another weaker validator.
2. Before enabling a future send path, bind/lock D's mutable support inputs through the existing send reservation transaction as well. B's present reservation locks cover draft/contact/resume/Lead/profile; evidence, approved claims, person research, assessment/ownership/postings and support task inputs can also change. D readiness deliberately does not lock or mutate. E must preserve the same source snapshot through validation/reservation rather than assuming its callback alone solves concurrent source changes. This request does not reopen B's accepted delivery fixes or authorize sending now.
3. Wire the `/outreach` navigation and these selected-company/manual-stage results into the shared preparation command/checkpoints. Preserve C's RankedOutreachCompany fields and later operator selections/status. No package/dependency/schema change is required by D. Update the shared header's inherited “hard-disabled until F5” wording when E owns that UI; D's own screens state actual disabled/manual status.
4. CI workflow/test-artifact repairs remain deferred to E. Automatic isolation, RC-4/RC-5 scoring persistence, broader YC discovery and the real cohort are separately queued, not completed or launched here.

## Verification actually executed

Every test process selected **outreach_test_joboss_d** through the shared configured-live exclusion and read-only actual database identity probe. D was created as a dedicated database and migrated using normal immutable `migrate deploy` via repository global setup. No common/A/B/C/reviewer test database was written. Normal serial files, HTTP MockAgent net refusal and fake source adapters remained active; .env was untouched. No dependency versions or lockfiles changed; no placeholder hydration was needed for these checks.

| Check | Actual result |
|---|---|
| Ten-file focused contact/draft/claim/handoff/approval + D selection | **256 passed, 10 files, 0 failed**, 17.16 seconds. Log: `scratch/joboss-d/final-tests.log`. |
| Final relevant D regressions after the last preparation/readiness refinements | **79 passed, 2 files, 0 failed**, 6.71 seconds. These overlap the 256; do not add them. |
| Synthetic persisted review-preview fixture | **1 passed, 1 file**, 3.43 seconds; six company examples and preserved legacy revision. |
| Backend typecheck, `--noEmit -p tsconfig.backend.json --incremental false` | Passed, exit 0. All three D TS2379 diagnostics gone. |
| Separate UI typecheck, `--noEmit --incremental false` | Passed, exit 0; repeated after the final current-identity display refinement. |
| `npm run lint` | Passed, exit 0; final D/UI sources included. |
| `npm run check:no-raw-http` | Passed, exit 0. |
| Prisma validation with process-only D URL | Passed, exit 0. |
| `git diff --check` | Passed. |
| D read-only migration/index comparison | **13 completed migrations, 13 checksums match disk; 11/11 protected index definitions match.** |
| Live BEGIN READ ONLY / ROLLBACK comparison | **57/57 drafts, all 14 protected fields and 11/11 indexes match; attempts 0; completed JOBOSS migrations 0.** |
| Browser stale-snapshot submit | Actual Next server action refused; D database afterwards has **0 approvals, 0 approval audits, 0 send attempts**. |

The ten selected files were `test/unit/recipients-d.test.ts`, `test/integration/recipients-d.test.ts`, `test/policy/contact-curation.test.ts`, `test/policy/contact-import.test.ts`, `test/policy/contact-verification-backfill.test.ts`, `test/policy/outreach-draft.test.ts`, `test/unit/email-v4.test.ts`, `test/unit/pitch.test.ts`, `test/unit/contact-classify.test.ts`, and `test/integration/llm-handoff.test.ts`. D's new files contain 25 unit and 54 integration cases; the preview is a separate test. Unique tested total: **257 across 11 files**, not the sum of repeated runs.

Tests cover no-ATS founders; listed-role currency; older/large/unknown-size inputs; commercial/unknown responsibility and actual employer work; wrong person/company/quoted author/unsupported built attribution; stale/future/superseded/changed research; company fallback and recruiting inboxes; strongest/manual/stopped selection; source/quota/no-route resumption and manual candidate URLs; production gateway positive credits; every legacy state unchanged across D upgrades; explicit fresh revisions and concurrent preparation; approved proof/resume/word counts; exact subject/sentence/citation coverage and uncertainty; source/claim/resume/recipient mutation invalidation; real read-only readiness; exact approval refusal/hash; approved-support freezing; B revoke audit/atomic clearing; additional contact slots; and pending/blocked/ready review data.

The three optional-property errors were resolved without casts or compiler/type relaxation: queue scope passes `contactId: ... ?? null`; the former composing @5 scope branch is replaced by the single shared readiness path. All strict checks remain enabled.

Initial inherited contact tests exposed a missing global budget fixture and expectations for the superseded executive ban. D-owned fixtures were corrected to seed positive global credits and test supported founder candidates, unknown responsibility, genuine import refusals and preservation of deliberately retired rows. Alias subordering remains compatible within the stronger responsibility ordering. The original 25 failures are retained in the tool transcript; current focused runs pass. The handoff suite uses its existing synthetic scoring setup on D; D's production preparation never imports/calls the blocked scorer, and no live rescoring occurred. PostgreSQL/Prisma emits a pg query-concurrency deprecation warning in tests; current checks pass, with no dependency change.

Full repository/remote CI, B-dedicated suites, broad A/B/C re-audits and real model/provider/source runs were not performed. No runtime isolation smoke or automatic execution was attempted.

## Synthetic outputs and actual visual evidence

These are supplied fixture outputs through production `fulfilTask`, not claimed model-quality evidence or real recipient research. None counts toward the real 20-company/15 early-stage cohort.

- [Complete person/recipient/evidence/draft/support output](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/synthetic-person-ready.json): ReadyCo, Jamie Rao, Co-Founder & CEO, published `jamie@ready.example`; exact company and person-bound employer/external excerpts; conditional project argument; iOS resume; **182 words, ten exact support units including subject**. Personal hook: “I read your article about keeping the original receipt visible while reviewing extracted values.” Authorship is supported, and no built/led ownership is invented.
- [Complete recruiting-inbox/company-fallback output](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/synthetic-company-fallback.json): FallbackCo, published `careers@fallback.example`, no named person, company receipt-review hook, explicit personal-work/eligibility limitation, **169 words, nine exact support units including subject**.
- [Complete preview/task results](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/preview.json): initial queue **1 pending / 2 blocked / 3 ready**, including RevisionCo revision 2 with revision 1 retained. Pending writer task, uncertain support, changed-support blocker, person hook and company fallback are all represented.
- [Actual browser-action/database result](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/browser-result.json): after opening ReadyCo, a D-only helper changed its recipient title, and clicking its stale displayed approval form refused. The email/hash/approval stayed unapproved. The retained queue then became **1 pending / 3 blocked / 2 ready**. No stale cached “verified” identity label remains on the current screen.

The actual Next review route was launched on 127.0.0.1:3104 only after shared D target verification, with a synthetic-environment banner. Browser inspection covered queue, ready exact email, source/claim excerpts, sentence checks, revision 2 → untouched original, and the real changed-snapshot refusal. These are screenshots of the running application, separate from component/data tests:

| View | Saved visual evidence |
|---|---|
| Pending/blocked/ready/revision queue | [Queue](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-queue.jpg) |
| Named recipient, exact email | [Ready email](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-ready.jpg) |
| Approved claim excerpts | [Claims](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-claims.jpg) |
| Sentence checks and individual action | [Support](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-support.jpg) |
| Revision and original | [Revision 2](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-revision.jpg), [untouched original](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-original.jpg) |
| Actual stale approval refusal | [Changed snapshot](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/review-snapshot-refused.jpg) |

The temporary browser was closed and D's owned preview processes were stopped. No server or scheduled task was left running.

## File and preservation evidence

D changed existing `src/outreach/contacts/{curate,executive-filter,import,person-research,prepare,suitability,verify-backfill}.ts`, `src/outreach/draft/{compose,prepare,queue-draft,support,v5}.ts`, `tools/{run-contacts,run-drafts,verify-f4}.ts` and the three contact policy test files. D added `src/outreach/contacts/{tasks,verification}.ts`, `src/outreach/review/{context,snapshot,readiness,actions,queue}.ts`, the `app/outreach` route/actions/component/CSS files, `test/{unit,integration}/recipients-d.test.ts`, the preview fixture test and `test/fixtures/joboss-d` helpers, and this report. Existing draft layout/message/email code and B approve.ts were not rewritten.

Before editing, saved HEAD `6113f8db59cd8c3a213f090cdfd3946e80bc5e42`, index/file/.env hashes and existing diff in `scratch/joboss-d/baseline-files.json` and `baseline.diff`. [Final preservation result](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-d/preservation.json) confirms HEAD/index/.env unchanged. No staging, commit, reset, stash, clean, constraint drop, db push/reset or history rewrite. Shared coordination/roadmap/orchestrator documents changed externally during D; D did not edit or revert them. Other unowned protected source/config/schema/package/report files match the starting snapshot.

Immutable JOBOSS migration hashes still match both disk and D deployment:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

Live remains **F5**, both sending flags false, all protected drafts/indexes unchanged, zero SendAttempt rows and no completed JOBOSS migrations. No live migration or repair was attempted.

## Remaining boundaries and handoff

Real source access/identity coverage, unavailable public personal work, no verified contact route and source/global quota can still block individual companies honestly. The implementation deliberately cannot infer a missing address, current employment, authorship, vacancy, eligibility or funding stage to fill a cohort. Manual semantic quality still requires genuine supplied review; the synthetic fixtures establish lifecycle/invalidation behavior only. Automatic execution remains the accepted `isolation_blocked` boundary, with manual handoff available and no fallback billing.

D implementation and local verification are yielded for independent R-D. E receives the exact interfaces and shared wiring/transaction requests above; CI repairs remain E's future scope. No R-D/E/CI/S/coverage chat or assignment was started here.
