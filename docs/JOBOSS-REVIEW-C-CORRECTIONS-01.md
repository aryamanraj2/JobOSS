# R-C — Discovery corrections 01 re-review

15 October 2026, Asia/Kolkata. Use the **same existing R-C — Discovery review chat** in `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. C has returned corrections 01 and yielded. This is the **sole next assignment once the human runs the prompt**; issue of this packet does not confirm start. All builders, S, D/E/V and other reviewers stay idle. Work directly, without agents or messages/chat dispatch.

## Objective, reading order and ownership

Independently recheck **RC-1, RC-2 and RC-3** against `docs/JOBOSS-C-CORRECTIONS-01.md`. Read that packet, `docs/JOBOSS-C-CORRECTIONS-01-REPORT.md`, your original `docs/JOBOSS-C-DISCOVERY-REVIEW.md`, current corrected source/tests, and latest coordination/roadmap. Consult the original C assignment/PLAN only for relevant unchanged requirements. Do not repeat the full initial audit or broad accepted A/B reviews.

C reports **265/265 tests across the same nine files** (original 203 plus 62: 18 funding, 40 ATS, 4 YC). These are builder results pending your independent run. Root read the report/source and retained final suite log; root did not independently execute the correction suite or database probes.

Source/tests/configuration/schema/migrations, existing reports and Git state are **read-only**. Write only the new `docs/JOBOSS-C-CORRECTIONS-01-REVIEW.md`; supplemental scripts/logs may live under a new temporary directory. Do not repair code/tests, regenerate source, install dependencies or modify caches through incremental typechecking.

Corrected production inventory: `src/ingest/discovery/funding.ts`, `src/intel/outreach/assess.ts`, `src/ingest/ats/signatures.ts`, `src/ingest/ats/verified.ts`, `src/ingest/ats/detect.ts`, `src/ingest/yc/seed-loader.ts`. Changed tests: discovery-c integration, discovery-sources unit and ats-signatures unit. Verify scope/preservation against C's captured inventory where accessible. Core/schema/config/registry/runner/collector/preparation caller/scorer/mail/drafts/send were not assigned edits. Public discovery/refresh/ranking interfaces and shared RankedOutreachCompany must remain stable.

Retained evidence if available: `/tmp/joboss-c-c01-evidence/` (red.log, suite-final.log, rc1.json, rc2.json, rc3-*.json, preservation logs/snapshots); your earlier `/tmp/joboss-rc-evidence/` reproductions remain useful. Read scripts before reuse. Defect-asserting original probes may now need new desired-result assertions in your own temporary scripts; do not equate their exit code with feature acceptance. Material conclusions must be in the saved review, not depend solely on temporary files.

## RC-1 — relational funding support and old stored proof

Independently rerun the original three false-primary examples through actual storeFundingRound and research assessment/ranking, plus a meaningful changed clause or wording control:

- `Acme raised Series B funding in 2023, while Otherco raised Seed funding on September 1, 2026.`
- `Acme raised funding from Seed Capital on September 1, 2026.`
- `Acme raised Seed funding in 2023 and presented its product on September 1, 2026.`

Indexed Acme/Seed/2026-09-01 must not obtain primary_verified stage/date from these sources. Inspect actual persisted fields, metadata, excerpt/evidence and returned ranking. Seed Capital must remain an investor name, and another event/company's date cannot become the subject company's round date. Ambiguous unsupported prose may conservatively remain indexed.

Verify already-stored synthetic primary_verified rows with the old bad excerpts are not trusted by ranking. Include publishedAt so invalid funding evidence cannot become a verified fallback product-launch hook or a supported fit/citation. Ranking must not silently rewrite FundingRecords or Lead/draft history. A valid direct affirmative company/action/round/date control must still verify and rank appropriately; changing its source back to unsupported text must downgrade on explicit synthetic revalidation.

Preserve field-level indexed amount/currency/participants, date precision, the 14-investors/month negative, impossible/future dates and 180-day interval behavior. C explicitly uses a narrow deterministic grammar (pre-seed/Seed/Series-letter forms); unsupported named-investor/amount-before-stage/compound prose is a disclosed availability limit rather than authority for a general semantic-verifier rewrite. Assess meaningful false-verification regressions without inventing a requirement to accept all natural-language forms.

## RC-2 — actual URL identity through all consumers

Independently recheck the original supported-host nested URL `https://jobs.lever.co/?next=https://job-boards.greenhouse.io/acme` and representative query/fragment/path variations. Actual parsed origin/path and any documented embed identity must describe the same vendor/token; nested URL text cannot provide another board's identity. A real outer board URL remains attributable to its own valid board, never a different embedded one.

Exercise actual employer markup → detection/save; old synthetic stored ownership proof with otherwise correct hash/time/company fields; and genuinely verified board → returned foreign posting → ingestion → collector/research assessment. Confirm no false ownership, eligible opportunity, supported ATS fit or ATS-backed citation. Invalid snapshot rows must leave honest incomplete/error behavior and must not close previously valid roles as if an empty complete refresh occurred. No final-stage masking of a still-eligible bad posting.

Positive controls must preserve valid Greenhouse legacy/current hosted pages, documented embed forms and existing approved API shapes, plus Lever/Ashby hosted/posting/API paths. Check duplicate/missing embed identity, wrong vendor/token, hostile origin, credentials/protocol/port and regional/custom refusals as relevant to the changed parser. Detection, stored proof revalidation and posting membership should consume the same parsed identity. No gateway/registry expansion. Consult current first-party docs only where a technical URL-format claim actually needs verification; no live ingestion or alternate transport.

## RC-3 — durable repair through real preparation resume

The selected fix is **repairable sequential persistence**, not a new whole-item transaction or distributed lock. Independently inject storage failure through actual prepareDiscovery/production seed handling at the second Evidence.create, later per-key evidence and yc_profile signal, then resume the same batch. Validate each required nonempty source key's exact excerpt/hash/company/source/capture/person binding and exactly one record-bound profile signal before declaring completion.

Inspect actual durable rows before/after resume, paused/completed source states, stable batch/source row IDs, distinct source counts/union and replay behavior. Include a pre-existing record-only partial hash with an older observedAt: original record unchanged, repaired key captures honest about observation, profile signal time bound to its record. A subsequent successful unchanged ingestion must add no duplicate evidence/signals. Preserve operator status/website/tags, lifecycle stops, host/budget setup and existing constraints. Do not substitute a test handler for production or rely solely on cursor-update-failure replay.

Caller-serialized same-batch execution remains the existing documented contract. Do not demand a new distributed lease/schema strategy as a condition of this bounded correction; report any concrete exposed regression separately.

## Verification and preservation

Fixture writes **exclusively on yielded outreach_test_joboss_c**, which is already approved by the shared guards. No invented R-C target, other worker/common/live fixture database. Validate process-only TEST_DATABASE_URL using configured-live exclusion and actual read-only connection identity before normal immutable migrate deploy/setup. No .env edits, db push/reset, guard bypass, dropped constraint or migration rewrite. Retain serial files, standard setup, HTTP mocking/network refusal and fakes. Hydration of existing cloud placeholders may restore their existing contents, never change versions/lockfile or weaken timeouts/checks.

Independently execute the same nine-file selection; expected builder count **265**, report your actual per-file counts/results:

```text
test/unit/discovery-sources.test.ts
test/integration/discovery-c.test.ts
test/integration/ats-ingest.test.ts
test/integration/ats-adapters.test.ts
test/integration/seed-loader.test.ts
test/integration/scoring-persistence.test.ts
test/integration/llm-handoff.test.ts
test/unit/scoring.test.ts
test/unit/ats-signatures.test.ts
```

Review meaningful new assertions and preserve all original 203, including all 15 handoff tests and their actual production ownership, foreign-citation/schema/redaction assertions. Use independent production-function supplemental probes for the findings, keeping outputs synthetic. Do not repeatedly rerun unchanged passing suites or the full initial source matrix without new evidence justifying it.

Run lint, network guard, Prisma validation, whitespace and UI/backend typechecking separately with incremental writes disabled. Expected existing backend limit is three D-owned TS2379 contactId errors (compose.ts:590:115, queue-draft.ts:223:76/267; lines may shift). New correction-owned diagnostics matter; don't repair D or portray UI success as a clean backend check.

Verify immutable migrations/protected indexes on C: 13 completed migrations at the prior checkpoint, matching disk/applied SHA-256 and no rolled-back records. JOBOSS preparation hash `4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c`; uniqueness hash `31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b`. If accessible, protected live comparison is BEGIN READ ONLY / ROLLBACK only: 57 drafts/all 14 captured fields, 11 protected indexes, zero SendAttempt rows and completed live JOBOSS migrations, F5/both sending flags false. Snapshot/preserve current HEAD, staged diff and all existing unowned file contents; do not restore concurrent documentation changes.

No live discovery/ATS ingestion, live rescoring/data repair/migrations/approvals, mailbox/OAuth/auth/model/provider calls, automatic enablement, paid services, sending, staging/commits/resets or agent/chat dispatch. Automatic execution must remain isolation_blocked; manual interfaces remain available. No new provider/runtime smoke is required.

## Explicit boundaries and report

**RC-4/RC-5 remain independently confirmed, untouched scorer integration blockers.** Existing scoring-persistence tests passing cannot close them. Check preservation of the unowned scorer source/interface; do not rerun the full known-defect reproductions or assign/implement a strategy without new evidence. Future S owns the bounded correction packet; accepted A/B work stays closed.

**Broader YC coverage is a separately confirmed human requirement:** all potentially suitable batches/team sizes, listed jobs plus suitable speculative inquiries, with explicit gaps/unknowns. Current recent-company filtering is knowingly narrower. It was not assigned to corrections 01 and must not be represented as fixed by this report or newly demanded inside RC-1–RC-3. Record it as queued separate coverage work. D/E/runtime, real source completeness and the real 20-company/15 evidenced early-stage mobile/AI cohort remain open.

Save `docs/JOBOSS-C-CORRECTIONS-01-REVIEW.md`, return it labeled **R-C — Discovery corrections 01 review report**, then yield to the current orchestrator. Include:

- RC-1/RC-2/RC-3 separately closed or still actionable, with actual production-function evidence and relevant positive controls. For a residual defect: priority, absolute file/line, reproduction/effect and bounded owner request; distinguish a concrete failure from conservative unsupported phrasing/routes.
- Scoped C feature verdict (accepted within reviewed synthetic/deterministic scope, or changes required), and a separate **scorer integration still blocked** verdict. State what can proceed without implying broad YC/live-source/runtime/cohort/send acceptance.
- Exact independent test/check/file counts, focused outputs, preservation evidence, unchanged interfaces, skipped/blocked checks and known D errors. Keep prior positive coverage/closed findings intact absent concrete regression.

Do not edit fixes, overwrite prior reports, start S/D/a coverage worker or another reviewer. The human returns your report to the orchestrator for the next single assignment.
