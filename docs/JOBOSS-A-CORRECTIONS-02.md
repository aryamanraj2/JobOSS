# A — Foundation corrections 02

Continue in the original **A — Shared foundation** chat. Work directly; no subagents or messages to other chats. A/R-A remain the only current builder/reviewer pair, running one assignment at a time. The original R-A re-review closed five original findings; preserve those fixes. This task addresses only C1–C3 from `docs/JOBOSS-FOUNDATION-CORRECTIONS-01-REVIEW.md`.

Read that report, `docs/JOBOSS-A-CORRECTIONS-01-REPORT.md`, this assignment and the relevant current files. Do not repeat broad research, rebuild working subsystems or keep spending subscription turns trying to prove isolation with arithmetic self-reports. Core acceptance and future automatic-runtime acceptance are distinct.

## C1 — Database alias safety (P1)

Root independently reproduced `configuredTestTarget` accepting simulated live `postgresql://localhost.:5432/outreach_test_joboss_ra` and selected test `postgresql://localhost:5432/outreach_test_joboss_ra`. This was a pure validation probe with no database connection. R-A additionally established the endpoints were identical using read-only probes and a no-write migration callback.

Fix the common target validator/pre-migration/fixture path so equivalent or ambiguous configured live aliases cannot license writes. Preserve exact local target-name/host allowlists, independently captured live configuration and actual connected-target checks.

Architecture decision for this repository: use a conservative exclusion of **any selected test database name matching an independently configured live database name, regardless of hostname spelling, alias or port**, in addition to existing endpoint checks. All assigned worker targets have names distinct from the actual live `outreach_dev`, so this does not remove a required workflow. Normalize terminal-dot/loopback forms consistently; fail closed on malformed or indeterminate captured identity rather than guessing. Do not broaden test-target host/name permissions or rely on NODE_ENV/overridden DATABASE_URL to establish separation. A read-only identity comparison may strengthen this boundary; do not introduce unnecessary DNS assumptions.

Add concrete no-write pre-migration regressions for `localhost.` versus `localhost`, case/default-port/loopback variants and same-name ambiguous host forms. No actual writable live alias reproduction. Prove rejected targets do not invoke the migration callback, identity connection or truncation. Validate legitimate A/B/C/D/R-A targets still work when live name differs.

## C2 — Portable enqueue concurrency fixture (P2)

`test/helpers/joboss-enqueue-child.ts` currently validates the selected target and then rejects every name except A's. Remove this redundant hardcoded A-only restriction and rely on the shared approved target plus actual database-identity verification. Keep parent/child on the same explicitly selected target and fail closed on mismatch. Do not redirect the reviewer to A/common databases.

Run the prescribed eight-file focused suite unchanged on **outreach_test_joboss_a** and report exact results. Add portable selection/negative-target regression coverage; do not touch/truncate the reviewer's database. R-A will independently run the same suite on its own target. Preserve independent-process enqueue, one-created winner/one audit checks, real database races and cleanup.

## C3 — Explicit unavailable automatic execution boundary (P1)

Complete provider/runtime isolation is **not verified**. The Code Mode fail-closed diagnostic proves only that specific capability; neither recognized disable flags nor successful synthetic JSON establishes the full tools/filesystem/network/MCP/skills/delegation boundary. This assignment must implement a fail-closed application guard; do not try to claim broader isolation from previous smokes.

Required behavior:

- Keep Codex as the intended default provider, but real task execution for Codex and Claude is unavailable until isolation is independently accepted for the relevant provider/runtime/config/task-capability class. A request for a default or explicit provider must return an honest `isolation_blocked`/equivalent distinct resumable result with a useful reason; never silently switch providers, pay for APIs or mark a blocked task fulfilled.
- Enforce this in both the batch interface and direct real-task executor. Guard **before claims, subscription auth, temp packet creation or child launch** so a blocked attempt leaves task status/output/attempts/leases intact. Reading task status or recording a sanitized block audit is permissible; claiming/rejecting tasks is not. Manual handoff remains usable and clearly reported. Already fulfilled work remains fulfilled on resume.
- Both research_urls and writer/support/contact tasks remain blocked under unverified isolation. The future read-only URL-search exception is a separate capability class, not permission to grant other tools.
- Do not introduce an arbitrary environment switch, caller boolean, model self-report, packet-provided verification or injected executor that enables real automatic execution. Default installed-provider readiness must remain explicitly unverified. A future accepted evidence mechanism needs provider/runtime/config identity and enforced capabilities; this pass must not fabricate one.
- Offline lifecycle/race tests may use a clearly separated synthetic harness that never launches installed Codex/Claude or accepts repository/source task packets. Ensure the production batch/direct executor cannot use that test injection to bypass readiness. Keep public interfaces compatible where possible; document necessary explicit changes for C/D/E.
- If preserving a real synthetic diagnostic entry point, it must construct a fixed trusted bounded probe internally (for example finite integer arithmetic with a fixed schema), accept no arbitrary prompt/source input, never enter real task fulfilment, and identify itself as a diagnostic with no isolation proof. Arbitrary task-kind renaming must not allow a production packet through. Prefer no new live inference in this pass: R-A already recorded the operational limit.
- Return enough structured blocker information for future preparation checkpoints to pause honestly and offer the existing manual handoff. This is a temporary readiness boundary, not abandonment of the required subscription workflow.

Add tests with spies/offline launch seams proving both providers and all real task classes cause zero auth/claim/launch calls when unverified, attempts/leases/output are unchanged, manual handoff works, no injected executor/renamed-kind/flag bypass works, and bounded offline test/diagnostic paths cannot consume untrusted packets. Preserve fenced claim/fulfil behavior for the eventual verified execution path.

## Ownership and constraints

Edit only A-owned target/harness/concurrency helper, subscription runner and focused readiness helper under `src/core/llm/**`, related shared types only when necessary, foundation tests and correction report. No B delivery, contacts/drafts, discovery/scoring, UI, package/configuration or sending changes. No schema/migration changes should be needed; report a concrete need before broadening. Never rewrite applied migrations.

₹0 additional spending. No live database writes/deployments, mailbox/source operations, outreach, stored approvals, stage/flag changes, paid fallback, commits, resets or cleanup of other work. Use only A's assigned dedicated database for fixtures and migrations; do not use R-A/B/common targets. Preserve all unrelated partial work and protected live draft/index baseline.

## Verification and report

Run the existing eight-file selection from corrections 01 plus any new focused regressions, real independent-process/database checks preserved. Report actual counts, not an assumed 161. Run safe budget/handoff regressions, network guard, lint, schema validation, diff checks and backend/UI checks separately. Keep three recipient errors/three unsafe ATS-fixture failures tracked rather than editing outside ownership or weakening allowsets.

Confirm existing migration checksums and indexes unchanged. Protected live comparison, if performed, is read-only. No need to repeat expensive actual subscription inference; the required C3 evidence is the explicit no-execution boundary plus meaningful guard tests. Save and return **A — Foundation corrections 02 report** at `docs/JOBOSS-A-CORRECTIONS-02-REPORT.md`: C1/C2/C3 fix→test→result mapping, changed files, exact readiness/manual/diagnostic interfaces, outstanding limits and preservation evidence. Yield for a targeted R-A recheck; do not claim full JOBOSS/automatic runner/pilot completion.
