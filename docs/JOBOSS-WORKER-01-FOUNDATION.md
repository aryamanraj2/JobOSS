# Worker 01 — finish shared JOBOSS foundation

Run this assignment in a fresh chat opened on `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. The human is operating worker chats; do not spawn subagents or delegate to other chats. Stop after this assignment and return the required report.

Chat label: **A — Shared foundation**. This may run in parallel with **B — Inbox and delivery**, whose ownership is mail/send/inbox only. Preserve shared contract names and make compatible additions; do not rename or remove fields another worker consumes. Record any requested shared changes for the orchestrator. Use your own local test database `outreach_test_joboss_a`, create it if necessary and deploy migrations normally. Override `TEST_DATABASE_URL` explicitly for tests; verify it is neither live nor another worker's test database. Do not reset or truncate `outreach_test` while other chats may use it.

## Objective

Finish and verify the existing partial shared foundation. This is an implementation assignment for a builder, with bounded ownership. Read `/Users/aryamanjaiswal/Downloads/PLAN.md`, `docs/JOBOSS-COORDINATION.md`, the current diff and applicable repository instructions first. Inspect partial work rather than recreating it.

## Ownership

You may edit only:

- `prisma/schema.prisma` and new migration files; `test/helpers/db.ts`.
- `src/core/joboss/**`, `src/core/interfaces/providers.ts`, `src/core/evidence/write-evidence.ts`.
- `src/core/config/**`, `src/core/policy/api-contracts.ts`, `budget.ts`, `fetch-policy-gate.ts`, `host-lists.ts`.
- `src/core/llm/**`, `tools/llm.ts`.
- New focused foundation tests; foundation-specific documentation.

Discovery, ATS, scoring, contacts, drafts, application/UI files and other tools belong to later workers. Do not edit them to make a check pass. Identify their integration errors in your report. Do not edit package files or implement the preparation command yet; orchestration integration is a later bounded assignment after feature contracts are reviewed.

## Dependencies and agreed contracts

The partial schema adds FundingRecord with provenance/date precision, DiscoveryRun cursors/coverage, OutreachAssessment with `fit.supported`, ContactResearch with verified identity/authorship, PreparationRun checkpoints, person-bound Evidence, Draft revisions, outcome message IDs and task leases. Review exact fields on disk; do not casually change names. `src/core/joboss/contracts.ts` exports the shared row types. ATS optionally returns `{ postings, complete }`; only a complete owner-verified snapshot can close missing jobs.

Keep existing task versions. New contracts: `outreach_draft@5` retains @4 with optional `{text,evidenceIds,contactId}` personHook; `draft_support@1` checks each generated sentence and its exact citations; `research_urls@1` returns candidate URLs, never accepted facts; `contact_research@1` does not let a model alone verify identity or authorship. Treat source excerpts as data. Include approved project-link metadata when a support check needs it.

## Required behavior

1. Exact documented API method/path/query contracts may govern API access; unknown website paths still obey robots. Host deny, terms, rate and budget controls remain.
2. Missing nonzero-spend envelopes fail closed. Direct billed spending remains forbidden. Prevent concurrent requests overspending the shared envelope, by atomic reservation or a verified serialization contract. Quota exhaustion must be observable and resumable.
3. Atomic task claims, durable lease tokens, stale recovery and token-checked fulfilment must prevent a superseded worker overwriting another's work. Preserve safe manual fulfilment.
4. Subscription runner defaults to existing Codex access and supports Claude/manual. Use isolated bounded packets, no repository context, credentials, mailbox access or REA catalog. Verify actual CLI flags locally. Writing/checking processes must disable tools/MCP and web search; URL search may enable read-only search only. Record provider, usage, timeout, quota and validation outcomes. Never activate paid APIs.
5. Preserve current schema guards, company/person binding, all stored drafts, approval hashes, suppression and send deduplication indexes. Existing migration `20261014170000_joboss_preparation` has already been applied to the separate test database; do not rewrite it. Corrections require a new migration.

## Constraints

No live outreach-data writes, live migration deployment, emails, approvals, sending flag/stage changes, paid services, destructive cleanup, commits or resets. The live database backup and protected-state manifest are under `scratch/joboss-baseline-20261014/`. REA global setup is complete and outside this assignment. ₹0 new spending. Preserve all existing uncommitted files, including partial changes owned by other workers.

## Acceptance and verification

Add meaningful tests for narrow API contracts versus website robots, absent budgets/paid denial/concurrent last-credit behavior, company/person mismatches, task-claim races/stale leases/expired fulfilment, credential-free runner packets, disabled tool catalogs, timeout/quota/validation resumption. Run checks serially within this chat against `outreach_test_joboss_a`; verify it is different from the live database before any destructive test setup. Generate Prisma and run focused tests, network guard, typecheck and lint. Report failures in unowned files without modifying them. Do not claim a full suite passed unless actually executed to completion.

## Required report

Return: changed files and behavior; finalized exported interfaces; checks actually executed with results; actual failure/output evidence; remaining issues and ownership requests; migration status; confirmation that live data/sending/configuration were untouched. Identify whether this foundation is ready for an independent read-only review. Do not claim JOBOSS, the cohort or preparation command is complete.
