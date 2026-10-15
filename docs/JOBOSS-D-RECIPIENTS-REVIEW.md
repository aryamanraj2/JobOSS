# R-D — People, drafts and review report

15 October 2026, Asia/Kolkata. Independent review in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`, under `docs/JOBOSS-REVIEW-D-RECIPIENTS.md`. This report is returned to the current orchestrator through the human; no chat dispatch or agents were used.

## Verdicts

**D's deterministic/manual recipient → revision → support → individual review scope: NOT ACCEPTED yet.** Independently reproduced **257 passing unique tests across all 11 prescribed files**, green backend/UI typechecks and local checks, and the actual guarded browser workflow. Six independently reproduced gaps remain: false responsibility verification from a multi-person section, approval of supporting inputs the displayed page did not show, bypass of a later closed revision, unchecked fixed candidate facts after claim changes, loss of listed-role intent, and a real review/writer deadlock. Return bounded corrections to the original D builder; this review made no implementation changes.

**Remaining integration/readiness: OPEN/BLOCKED separately.** The read-only transaction-compatible callback exists and ordinary fail-closed behavior works. That does not establish final send reservation stability, automatic/runtime isolation, real source/model quality, broad discovery coverage, scorer persistence or cohort readiness. E still owns integration and deferred CI work. Accepted A/B/C findings, including RC-1–RC-3 closure, remain preserved. RC-4/RC-5 remain open and were not rerun or repaired.

## Confirmed findings and bounded requests

### RD-1 — P1: a person's title can be borrowed from another person in the same section

Location: [person-research.ts:80](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/contacts/person-research.ts:80), with the consumer at [verification.ts:24](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/contacts/verification.ts:24).

`observePersonPage` treats an entire `section` as a person card when any descendant heading matches the name and any text in that section contains the expected title. Those need not describe the same person. Independently supplied employer HTML:

```html
<section>
  <div><h2>Jamie Rao</h2><p>Marketing analyst</p></div>
  <div><h2>Alex Chen</h2><p>Co-Founder &amp; CEO</p></div>
</section>
```

The contact candidate was Jamie Rao with the unverified candidate title Co-Founder & CEO. Before capture, removed the earlier person evidence/research and cleared identity verification; the route excerpt was only `Engineering inquiries: jamie@acme.example.` It did not corroborate the title. Called real `prepareRecipients` with the supplied page through `StubFetcher` and ordinary production capture. It selected Jamie, persisted identity `verified`, and `recipientState.ready` returned **true**, with founder suitability. The captured fact was `Jamie Rao Marketing analyst Alex Chen Co-Founder & CEO`. Thus a genuine captured hash/person FK does not cure the mistaken attribution.

**D request:** bind name and responsibility within one unambiguous person record; reject containers spanning other named cards and conflicting roles. Preserve supported founders/commercial-title product responsibility. Add production-path negatives for this markup and similarly named people. Evidence: [fixed-probe.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/fixed-probe.json), `ambiguous`. An earlier probe with the literal word “Guest” correctly refused; the successful reproduction above deliberately removes that keyword shortcut.

### RD-2 — P1: the page can display one snapshot and submit approval for a later one

Location: [queue.ts:13](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/review/queue.ts:13), especially the separate `reviewSnapshot` read at [queue.ts:29](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/review/queue.ts:29).

`outreachReview` reads the display rows first, then independently rereads the current database to create the hidden approval snapshot. They are not one consistent view. Independently placed an awaited barrier after its real task query, between the display reads and final snapshot read. A separate real connection changed the product evidence excerpt, fulfilled new synthetic support for that current evidence through `fulfilTask`, and gated it. The returned review still displayed the old excerpt, while its hidden snapshot **matched the newer current database before approval**. Passing that displayed snapshot to real `reviewAction` returned `ok:true` and wrote approval.

The excerpts differed by the new sentence `The receipt review screen also shows confidence.` This demonstrates approval of supporting evidence the reviewer did not see, without changing the email. A second probe changed subject/composition in that interval and also approved the newer subject while returning the older displayed subject. The unchanged-email/source reproduction is the principal finding; it does not depend on arbitrary email editing. The probes call production functions; the wrapper only schedules a concurrent fixture update at a particular query boundary.

Locks in `reviewAction` correctly prevent writes during comparison/approval, but cannot establish that the previously displayed rows belonged to the submitted token. Normal changes **after** a completed page load do refuse, as verified separately in the browser.

**D request:** produce display data, evidence/claims/support and the submitted token from the same consistent database view, or verify/retry the view before returning it. Retain the existing action-time current comparison and B approval API. Add a controlled production-read race regression. Evidence: [probes-extra.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/probes-extra.json), `source_render_snapshot_race`; [probes.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/probes.json), `render_snapshot_race`. The first subject probe's `snapshotMatchesCurrent:false` was measured **after approval** changed status; the source probe explicitly measures equality **before approval**.

### RD-3 — P1: an older explicit revision anchor bypasses a later closed draft

Location: [prepare.ts:76](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/prepare.ts:76).

Prepared a written revision 1, then a revision 2 with `upgradeExisting:true, reviseDraftId:<revision1>`. Closed revision 2. Repeated the same explicit revision-1 request. The code assigns `previous = anchor`, tests only that old anchor's status, excludes the closed revision from reuse and creates **revision 3**, returning a new writer task and `draft_pending`. Revision 2 remains closed, but its deliberate stop is bypassed.

**D request:** independently check the actual latest draft/operator stop for the company/contact/campaign/slot before honoring an older anchor. An anchor chooses history, not permission to resume a stopped chain. Preserve every original row and existing constraints/campaign. Evidence: [probes.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/probes.json), `closed_latest_explicit_old_anchor` (returned new status `composing`). No send/dedup constraint was removed.

### RD-4 — P1: changed claims can leave contradictory fixed candidate copy ready again

Locations: [readiness.ts:81](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/review/readiness.ts:81) and [support.ts:20](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/support.ts:20).

Prepared a supported email containing `I'm Aryaman, a third-year student at NSUT Delhi.` Changed its still-active approved education claims to `Graduated; no longer a student.` and `No university education claim is approved.` The snapshot correctly invalidated old support. Fulfilled the newly queued support task through the shared production handoff, then gated again: **readiness returned true** with the old contradictory introduction unchanged.

This is more specific than trusting a bad semantic verdict: the new support task's nine units **omit the deterministic introduction entirely**. The manual checker was never asked to assess that sentence. Readiness checks the introduction against the static `INTRO.text`, not the current meanings of its cited education claims; active ID membership is sufficient here. `WINDOW.text` has the analogous static-copy branch. Newly supplied support must not restore readiness for fixed copy whose facts are no longer approved.

**D request:** validate all factual fixed candidate sentences against their current exact approved inputs, or include those statements in the actual semantic task with correct candidate citations/kinds and refusal behavior. Cover changes made before initial preparation as well as after preparation. Preserve legacy @1–@4 contracts; no core/schema change is requested by this review. Evidence: [fixed-probe.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/fixed-probe.json), `fixed` (before true → invalidated false → afterSupport true, and exact reviewed units).

### RD-5 — P2: a valid listed-role workflow can ignore the intended role completely

Locations: [prepare.ts:95](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/prepare.ts:95) and [readiness.ts:51](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/review/readiness.ts:51).

Production preparation validates listing currency, and the task receives the role, but the base always replaces the ask with the speculative internship-availability template. Readiness verifies the posting still exists without requiring the email to reflect its intended role. Independently ingested a current owned **Senior iOS Platform Engineer** posting through the existing synthetic board ingestion path, prepared/fulfilled/merged/supported/gated its draft, and obtained **ready:true**. The entire subject/body only discusses the receipt app and asks whether the company is taking engineering interns; it never mentions or relates to the senior role. The UI would label this a listed-role inquiry solely from the Lead.

The earlier ordinary `iOS Engineer Intern` fixture also passed while containing no explicit role reference; the senior-role control makes the distinction material. Asking about internships is allowed, but the packet explicitly requires the listed-role workflow still to reflect the intended role.

**D request:** preserve and substantively validate the role context in listed-role messages, even when asking about a related internship. Refuse or clearly distinguish a speculative inquiry that makes no use of the role rather than accepting it as a completed listed-role message. Keep closed/stale/foreign posting refusal. Evidence: [readiness-matrix.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/readiness-matrix.json), `listed_intended_role`, and the full initial output in `probes.json`.

### RD-6 — P2: review table locks deadlock with the actual writer merge

Location: [actions.ts:14](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/review/actions.ts:14), interacting with [queue-draft.ts:445](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/queue-draft.ts:445) and [queue-draft.ts:528](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/src/outreach/draft/queue-draft.ts:528).

Reproduced with real concurrent PostgreSQL transactions and actual `applyOutreachDraft`/`reviewAction`, adding only scheduling barriers around their SQL calls:

1. Writer merge holds the draft `FOR UPDATE` lock and pauses.
2. Review acquires its supporting-table SHARE locks, including `llm_task`, then waits for that draft.
3. Writer resumes and enqueues support, requiring a conflicting write lock on `llm_task` while retaining the draft lock.

PostgreSQL returned **40P01, deadlock detected** to review (Prisma P2010); writer committed. This is a demonstrated availability/action failure, **not** evidence that a stale approval slipped through. A pending browser normally disables approval, but the action remains callable, and completed-page decisions can overlap other work; lock correctness must not rely on the disabled button.

**D request:** resolve the demonstrated lock-order cycle within D's review/merge/preparation paths, retaining atomic snapshot validation and accepted B revoke behavior. Include the real two-transaction reproduction. Do not use this as a request to redesign accepted B delivery. Evidence: [probes-extra.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/probes-extra.json), `merge_review_lock_cycle`.

## Independent execution and results

Read the D worker/reviewer packets, Downloads/PLAN.md, D report, current coordination/roadmap, accepted A/B/C correction reviews, starting diff/hash manifests, actual D source/tests/helpers and relevant accepted callers. Read the installed Next 16.3.4 documentation for server functions/actions before inspecting the live UI flow. D's retained report/screenshots were inputs, not substituted for this execution.

All fixture writes used **outreach_test_joboss_d only**. Read D's command/preservation/preview helpers and shared target/setup helpers before use. The command helper captures configured live identity before replacing process `DATABASE_URL`; shared `configuredTestTarget` and actual `BEGIN READ ONLY` identity verification ran before standard immutable migrate deploy and fixture setup. Tests stayed serial with the existing network-disabled MockAgent. No dependencies, generated source, configuration or environment files were changed.

### Prescribed tests

| File | Independently passed |
|---|---:|
| `test/unit/recipients-d.test.ts` | 25 |
| `test/integration/recipients-d.test.ts` | 54 |
| `test/policy/contact-curation.test.ts` | 22 |
| `test/policy/contact-import.test.ts` | 16 |
| `test/policy/contact-verification-backfill.test.ts` | 13 |
| `test/policy/outreach-draft.test.ts` | 78 |
| `test/unit/email-v4.test.ts` | 3 |
| `test/unit/pitch.test.ts` | 9 |
| `test/unit/contact-classify.test.ts` | 21 |
| `test/integration/llm-handoff.test.ts` | 15 |
| `test/integration/recipients-d-preview.test.ts` | 1 |
| **Unique total / files** | **257 / 11** |

First ten-file run: **256/256**, 17.62 seconds. Repeated the same selection with JSON reporting solely to obtain exact per-file counts: **256/256 again**, not additional unique tests. Preview fixture ran last after ordinary suites: **1/1**, preserving the browser dataset. Independent scratch probes are separate experiments and are not added to the test total. D's earlier overlapping 79 tests are not added either. JSON evidence: [tests-per-file.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/tests-per-file.json), [preview-tests.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/preview-tests.json).

Separate backend `--noEmit -p tsconfig.backend.json --incremental false` and UI `--noEmit --incremental false`: **exit 0**. Lint, network-access guard, process-only D Prisma validation and whitespace check: **exit 0**. The three reported contactId typing errors are gone. The normal pg query-concurrency deprecation warning remains; this is no claim about a future pg driver. Logs are in `scratch/joboss-rd/`.

### Positive recipient/revision/support controls retained

The suite independently exercised founders/CEOs, technical leaders/engineers/recruiters, commercial-title-only/unknown negatives and genuinely captured product responsibility despite a commercial title; wrong name/title, quoted/former/conflicting-employer authorship refusals; external work provenance, stale/future/superseded proof; strongest reachable contact and deliberate selections/stops; published recruiting inbox without a person; no-ATS/old/large/unknown-size companies; bounded/manual URL research, source/quota blockers and positive-credit gateway capture. These positives do not close RD-1's untested multi-person markup.

Legacy null-prompt composing, closed, awaiting-approval and approved rows retained all captured row fields; ordinary upgrade created a different revision with no inherited approval/hash. Actual competing preparation calls returned the same revision/task, and existing Lead scoring/operator fields stayed unchanged. An absent association required explicit campaignCycle and recorded unscored speculative provenance. Additional contacts received distinct slots. Changed writer inputs could not merge stale work; already written/approved content was preserved. RD-3 is the specific older-anchor exception.

Real handoff fulfilment and merge paths accepted supplied synthetic outputs and rejected incomplete/changed citations, missing subjects and uncertain support. Exact generated subject/sentence coverage, person-attribution kind and approved links are enforced for the units actually supplied. Unsupported/uncertain overall results remained blocked. The changed legacy policy tests reflect the authorized founder policy and positive budgets; retained contact-import refusal/provenance, stopped-row preservation, foreign-citation/redaction/schema and old draft-layout coverage passed. RD-4 identifies a gap outside the generated-only support unit selection.

The actual synthetic person message was **182 words**, ten support units including subject; fallback was **169 words**, nine units. Both used the matching hosted iOS resume, connected Saldo/AquaSense proofs and a conditional receipt-review contribution. The named message says `I read your article about keeping the original receipt visible while reviewing extracted values.` It does not assert that writing proved built/led responsibility. The fallback greets the company team, invents no person and labels missing personal work/eligibility. Complete newly executed outputs are retained in [preview-fresh.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/preview-fresh.json). These repeated supplied projects demonstrate rendering/validation, not genuine selection diversity or real model quality.

### Snapshot invalidation and read-only readiness

Existing regressions independently passed changes to evidence excerpt/hash/freshness/supersession, candidate claims, resume file, contact email/identity, fit and suppression. Supplemental production-function probes also refused changed company/person/source bindings, resume link/valid alternate track, claim metadata, company stop, selected contact, full-name change and future route capture. Snapshot hashes changed. Approved support did not silently renew after evidence changed, even with a new fulfilled support task. These are substantive refusals beyond stored `fit.supported` or draft status.

Ran the callback with a transaction-scoped client under actual PostgreSQL **SET TRANSACTION READ ONLY** for ordinary ready, pending, uncertain/blocked, expired, missing, malformed support coverage and synthetic manual quota-pending states. Draft/task/audit/attempt counts remained identical before/after every call. Ready returned true; all other states returned false with specific details. No network/provider/auth operation was invoked; supplementary probes used disabled network transport. The default production executor returned `isolation_blocked` with authenticate/command counters **0/0**, without importing offline runner helpers. Evidence: [readiness-matrix.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/readiness-matrix.json), [probes.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/probes.json).

Probe limitations are explicit: an initial scratch attempt used invalid `backend` instead of the real resume enum and an invalid quota reason code; Prisma rejected them before applying those updates. Corrected controls used `sde` and pending task/runner metadata and passed. These were reviewer-script errors, not source defects. Quota metadata is synthetic; no real quota/provider was called. No full-repository suite, B-dedicated suites, model/source-quality run, live scorer or runtime smoke was attempted.

The support fingerprint conservatively includes all company evidence/opportunities/funding and global suppressions, plus complete contact/resume/Lead rows. Unrelated supporting-row/timestamp changes can demand another review or revision. This is conservative availability behavior, not a false-ready finding. The read-only callback intentionally does not lock concurrent source changes; callers needing atomic decisions must stabilize its inputs.

## Actual guarded UI and individual actions

Launched only the owned preview process tree at **127.0.0.1:3105**, after explicit D target verification, with `JOBOSS_D_SYNTHETIC_PREVIEW=1` and the visible synthetic D banner. Inspected `/outreach` and detail pages in an actual temporary in-app browser. Initial queue was **1 pending / 2 blocked / 3 ready**, six synthetic companies. Inspected pending/uncertain blocked detail (approval disabled), ready named recipient, recruiting/company fallback, full exact subject/body/resume, current fit/eligibility, source/claim excerpts and sentence support, revision 2 → original revision 1. Original subject/body remained `Synthetic earlier draft` / `Synthetic earlier email retained unchanged.`

Loaded ReadyCo's approval form, entered a synthetic reviewer, then changed its title in D through the guarded helper. Clicking the still-displayed form invoked the actual Next server action and refused: **“The review snapshot changed. Reload and review the current email before deciding.”** The rerender showed identity needs verification and approval disabled. Database comparison: **0 approved rows, 0 approval audits, 0 attempts**. This verifies ordinary stale-page refusal and does not negate RD-2's change during page construction.

On the untouched FallbackCo page, clicked actual individual approval. Database comparison found **one approved draft**, one `draft.approved` and one `draft.outreach_snapshot_approved` audit, no send attempts. Withdrew it through the actual form. Database returned to **zero approved rows**; approval hash/time/by/sender were atomically cleared, status `composing`, and B's `draft.approval_revoked` audit retained the old approval metadata. Separate production probes refused duplicate approval. No alternate approval writer was used. Status banners were checked against actual rows/audits, never taken as acceptance themselves. After revoke, readiness can still say ready while the composing status disables approval; a gate pass is still required.

Fresh screenshots and DOM evidence are in `scratch/joboss-rd/ui-*.jpg` / `.txt`: [queue](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-queue.jpg), [person](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-person.jpg), [fallback](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-fallback.jpg), [stale refusal](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-stale-refused.jpg), [approval](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-approved.jpg), [withdrawal](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-revoked.jpg), [revision](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-revision.jpg), [original](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-original.jpg). Row/audit evidence: `ui-db-{before,refused,approved,revoked}.json`. The temporary browser was closed and only the owned 3105 process tree was stopped; no preview process remains.

![Actual synthetic stale-review refusal](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/ui-stale-refused.jpg)

## Verified interfaces and integration contract

Actual exports/options/results match these shapes (`Db = PrismaClient | Prisma.TransactionClient`):

```ts
prepareRecipients(db: Db, gate: GatedFetcher, companyIds: string[], opts?: {
  now?: Date; limit?: number; maxPages?: number; interPageDelayMs?: number;
}): Promise<{
  selected: {companyId: string; contactId: string}[];
  blockers: {companyId: string; contactId?: string; reason: string; detail: string}[];
  researched: number;
  limitations: {companyId: string; contactId: string; detail: string}[];
  taskIds: string[];
}>
prepareOutreachDrafts(db: Db, opts: {
  companyIds: string[]; limit: number; now?: Date; upgradeExisting?: boolean;
  campaignCycle?: string; additionalContacts?: number; reviseDraftId?: string;
}): Promise<{
  draftIds: string[]; taskIds: string[];
  blockers: {companyId: string; reason: string; detail: string}[];
}>
evaluateOutreachReadiness(db: Db, draftId: string, now: Date):
  Promise<{ready: boolean; detail: string}>
queueDraftSupport(db: Db, draftId: string): Promise<{taskId: string; created: boolean}>
draftSupportStatus(db: Db, draft: {id: string}):
  Promise<{supported: boolean; detail: string; taskId?: string}>
reviewSnapshot(db: Db, draftId: string): Promise<string>
reviewAction(db: Db, input: {
  draftId: string; snapshot: string; by: string;
  action: 'approve' | 'revoke'; now?: Date;
}): Promise<{ok: boolean; detail: string}>
```

`supportSnapshot` returns the hash plus current draft/company/claims/person/profile/suppressions/attempts; `outreachReview` returns review data or null, and `outreachReviewQueue` returns bounded review rows. Results and IDs are not readiness guarantees.

Recipient limits are default20/max100 **distinct** companies, default4/max8 page attempts per company/pass including curation; ten strongest candidates with explicit selection continuation and coverage disclosure. Draft limit is 1–100 distinct companies, additionalContacts 1–6/default1. Shared `preparationLimit` rejects noninteger/out-of-range values. Missing company gives an honest blocker, duplicates are deduplicated before slicing. A page attempt may include bounded redirect hops; it is not a one-HTTP-request cap, and every hop still uses the gateway. Source robots/terms/deny/rate/positive budget checks remain. Candidate URLs cannot promote identity or public routes; manual contact labels cannot establish unsupported authorship. No source allowlist/zero-credit transport bypass or live Apollo/Snov adapter was introduced.

Only a missing Lead association needs explicit campaignCycle; none is invented. Existing Lead scores/version/operator history are not rewritten. Resume requires an active hosted matching track; exact content/claims/resume/suppression/source dependencies gate readiness. Closed/stale/changed listed roles refuse, subject to RD-5's separate missing-intent defect.

**E contract after bounded D corrections:**

1. Inject D's exact exported read-only callback into B's existing `SendGateOptions.evaluateOutreachReadiness` in `tools/run-send.ts`. It is absent today; @5 correctly fails closed. Never replace it with stored status/fit flags. Do not import test/offline helpers.
2. Preserve one coherent snapshot of **all mutable inputs used by D validation and the approved support hash** through B's send reservation transaction, as well as the accepted draft/contact/resume/Lead/profile stability. This includes company/evidence/approved claims/contact research/assessment/selection/opportunities/ATS ownership/funding/suppressions/support tasks and relevant current inputs. Validate against a transaction-scoped client after acquiring compatible locks or equivalent serializable snapshot/version protection, and keep it stable until reservation/attempt commit. A pre-reservation successful callback alone is insufficient. Reconcile lock order with corrected D behavior; RD-6 is a demonstrated D review/merge cycle, not permission to reopen the closed B delivery audit.
3. Wire selected-company recipient/draft APIs, task/blocker/resume checkpoints and directly accessible `/outreach` navigation into the shared manual preparation command. Do not silently invoke blocked scorer RC-4/RC-5 or automatic execution. Returned pending/approved IDs require current readiness, not automatic approval. Shared header wording remains E-owned (the inspected inherited “until F5” message is stale).
4. Keep exact individual review through D's wrapper and B approve/revoke, with new revision/new human approval after substantive changes. Preserve B's revoke locking/audit/clearing and reservation protections. Deferred CI workflow/clean-runner work stays with E; no E assignment starts here.

## Preservation and boundaries

Saved the review-start HEAD/index/status and hashes of existing workspace files, `.env`, and retained D artifacts **before fixtures** in `scratch/joboss-rd/baseline.json`. Final independent comparison found **no existing source/test/configuration/generated-source/document/.env/index changes** and no mismatch against D's final-owned-file manifest. HEAD remains `6113f8db59cd8c3a213f090cdfd3946e80bc5e42`; index hash unchanged. D's baseline diff/manifests corroborate the stated owned inventory; shared accepted source/schema/migrations/approve.ts/config/gateway/scorer/mail/send/navigation stayed read-only. No staging/commit/reset/stash/clean or constraint change occurred. The only new document is this report; supplemental scripts/logs/screenshots are reviewer-owned scratch evidence.

The prescribed tests write two fixed builder scratch outputs, `scratch/joboss-d/synthetic-person.json` and `preview.json`. They were regenerated by the independent run, not misrepresented as retained builder evidence. Copied the scratch directory before the new preview run into `scratch/joboss-rd/retained-d-after-first-tests`; this preserves the original preview and other retained evidence, while that copy's synthetic-person output was already the fresh first-suite output. Fresh preview copied separately to `preview-fresh.json`. Original hashes disclose exactly those two changed scratch artifacts. Existing report/screenshots/preservation evidence were not overwritten.

Two independent **BEGIN READ ONLY / ROLLBACK** live comparisons during and after fixture work confirmed **57 drafts/all 14 protected captured fields unchanged**, **11 protected indexes unchanged**, **0 SendAttempt rows**, **0 completed live JOBOSS migrations**. Stage remains **F5**, `SENDING_ENABLED=false`, `SEND_EXTERNAL_RECIPIENTS_ENABLED=false`. D has **13 finished migrations**, disk checksum equality, **0 rolled-back/unfinished rows**, and **11 matching protected indexes**. Immutable hashes remain:

- preparation: `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`
- uniqueness: `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`

Evidence: [preservation.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/preservation.json), [files-preserved.json](/Users/aryamanjaiswal/Documents/ChatGPT/scraper/scratch/joboss-rd/files-preserved.json), `migrations-extra.json`. Only D fixtures were written; supplemental listed-role fixtures remain synthetic on D. They and the six preview companies count as **zero real cohort companies**. No live migration/preparation/approval/repair/rescoring, source ingestion, mailbox/OAuth/auth/model/paid/provider operation, sending or enablement occurred. Extra spend ₹0.

Broader YC coverage and **South Park Commons, Alchemist, Entrepreneurs First, MassChallenge, Seedcamp** remain mandatory separate implementation/use work with actual pipeline wiring and per-source evidence per `docs/JOBOSS-DISCOVERY-SOURCE-EXPANSION.md`. Optional legitimate free-tier email-provider adapters remain open; they are not new D correction requirements. Genuine semantic quality still depends on a human's real supplied review against captured facts, beyond the synthetic handoff lifecycle evidence here. Automatic/runtime isolation, RC-4/RC-5, source expansion, real 20-company/15 verified early-stage mobile/AI cohort, final integration and sending remain unaccepted.

**Yield:** six bounded findings returned to the current orchestrator. No next builder/reviewer/CI/E/S/coverage assignment, dispatch or automatic work has started.
