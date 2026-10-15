# R-A — Independent foundation review

Run in a fresh local chat on `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`, after the initial A/B pair has finished. A has yielded its files. This is an independent review, not a builder assignment. Do not spawn agents, edit application/test/schema/configuration files, send messages to other chats, or fix findings yourself. Return a report to the human for the orchestrator.

## Objective and scope

Determine whether A's bounded foundation is safe and correct enough for the dependent discovery/recipient work. Read `/Users/aryamanjaiswal/Downloads/PLAN.md`, `docs/JOBOSS-WORKER-01-FOUNDATION.md`, `docs/JOBOSS-FOUNDATION-REPORT.md`, `docs/JOBOSS-COORDINATION.md` and the actual current files/diff. Review report assertions against code and executed evidence, not historical documentation.

Review only A-owned shared foundation: `src/core/joboss/**`, core interfaces/evidence writer, core policy budget/gateway/API registry/host lists, `src/core/llm/**`, `tools/llm.ts`, schema/JOBOSS migration preservation and `test/helpers/db.ts`, `test/integration/joboss-foundation.test.ts`, `test/unit/joboss-runner.test.ts`. The working diff contains inherited discovery/recipient and B delivery work: do not attribute those edits to A or expand into a review of B.

## Known evidence and issues

A reports 83 focused tests passed, Prisma generation/network guard/lint passed, three recipient-owned typecheck errors and four older regression failures. No full suite, actual model inference or preparation/cohort run occurred. Verify what can be reproduced and clearly label blocked checks.

Root inspected `test/helpers/db.ts` and confirmed a scope conflict: `assertSafeTestDatabase` only permits `/outreach_test`, and `truncateAll` only permits the database name `outreach_test`. The assignments require separate worker databases. A's report says it ran on the common `outreach_test`. Review whether this prevents safe dedicated-worker verification; report a concrete fix request to A without relaxing live-database protections. Do not run destructive tests on the common database to bypass this guard.

Older billed-spend expectations conflict with the settled ₹0 rule; ATS citation fixtures may be unsafe or legitimately require verified-ownership setup. Distinguish intentional contract changes from implementation regressions. Assign fixes by ownership; do not suggest weakening allowsets or restoring paid spend.

## Review priorities

1. Atomic global/company/vendor last-credit reservation under concurrent processes. Missing envelopes and invalid/billed spend fail closed; no duplicate charges or unauthorized budget increments. Validate transaction/lock behavior and retained-reservation semantics. Zero-cost mail remains compatible; research cannot use zero cost to evade budgets.
2. Task claim races, stale lease recovery, fenced success/invalid-output/rejection/metadata writes and compatible manual workflows. Expired owners cannot mutate a successor. Quota/timeout/validation/launch failure preserve honest resumable state and durable attempt evidence.
3. Subscription runner: actual installed CLI flag validity, subscription authentication only, credential-free environment/payloads, bounded input/output/timeouts, temp cleanup and effective catalog/tool isolation. Help parsing and mocked child processes do not establish actual model-visible isolation. Identify any unsupported controls; separate verified controls from an operational smoke still needed. No paid APIs or real mailbox/source access.
4. Evidence support/identity/authorship validation cannot be manufactured by model flags. Exact sentence/citation coverage, consistent verdicts, allowed scope, approved project links and existing versions remain enforced. Recipient-owned current-content-hash and scope checks are dependencies, not work to implement here.
5. Narrow API contracts versus website robots; deny/terms/rate/budget checks cannot be bypassed through malformed hosts/paths/queries/methods. Preserve applied migrations, protected send indexes, suppression and drafts.
6. Test safety, assignment boundaries and whether the reported checks prove required behavior rather than mirroring code.

## Verification constraints

Read-only application/live review. Tests may write only an explicitly isolated local test database, `outreach_test_joboss_ra`, distinct from live/common/worker databases. Normal migration deploy to this isolated database is allowed; do not rewrite applied migrations, use db push, disable safety checks, or edit files to make tests run. If the hardcoded helper blocks isolated integration tests, report that block and run only safe independent checks. Never print credentials. No live migrations/data writes, mail/inbox commands, sending changes, approvals, paid calls, commits or cleanup of existing files.

Where safe, reproduce A's focused checks and known regressions. Include commands and actual results. Review the protected baseline manifest using read-only live queries, or explicitly report unavailable access. Do not claim overall JOBOSS readiness.

## Required report

Return **R-A — Foundation review report** with:

- Verdict: accepted / changes required / verification blocked, scoped to foundation only.
- Actionable findings with priority, absolute file path and line, concrete trigger/consequence and recommended correction; distinguish confirmed defects from hypotheses.
- Checks actually executed, exact pass/failure counts and blocked checks.
- Known external failures and responsible subsystem; shared-interface requests.
- Remaining operational validations and preservation evidence.

Return the report in chat. You may save only this review report to `docs/JOBOSS-FOUNDATION-REVIEW.md`; all other project files remain read-only. No implementation edits or new agent work.
