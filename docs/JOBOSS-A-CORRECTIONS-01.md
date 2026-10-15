# A — Foundation corrections 01

Run this in the original **A — Shared foundation** chat. R-A has returned `changes required`; A is not accepted. All implementation ownership below belongs to this builder. Work directly without subagents or messages to other chats. Stop after the report; the original R-A chat will recheck the corrections.

Read `docs/JOBOSS-FOUNDATION-REVIEW.md`, `docs/JOBOSS-FOUNDATION-REPORT.md`, `docs/JOBOSS-B-DELIVERY-REPORT.md`, the original A assignment, `/Users/aryamanjaiswal/Downloads/PLAN.md` and the current diff. Keep original reviewed requirements and preserved work. Do not redo unrelated discovery, recipient or delivery features.

## Objective

Correct all six R-A findings, establish dedicated-database verification, and incorporate B's additive RFC Message-ID interface request. Preserve the existing source/task contracts and sending safeguards. Independent tests and actual failure-trigger regressions are required; a response saying the code is fixed is insufficient.

## Ownership and extensions

Keep A's original foundation/schema/core/LLM/policy ownership. Additional explicitly authorized files:

- `test/global-setup.ts` and `test/setup.ts` for shared test-target validation before any database write or environment substitution.
- A small new shared test-target validator, if needed, to avoid importing Vitest hooks during global setup. `test/helpers/db.ts` remains A-owned.
- `test/integration/budget-envelopes.test.ts` only to align obsolete billed-spend expectations with the settled ₹0 rule and test corrected accounting. Do not restore billed spending.
- New/updated foundation-owned regression tests and correction report.

Do not edit B's mail/send/inbox files, B's dedicated test configuration/helper, or discovery/recipient/draft/UI files. Do not edit `test/integration/llm-handoff.test.ts` or relax its citation validation; its ownership/fixture corrections remain tracked for the feature integration owner. Do not alter the three recipient type errors or disable strict TypeScript checks.

## Required fixes

### 1. Dedicated test isolation and pre-migration guard (P1)

Support the common local test target and explicitly approved JOBOSS worker/reviewer databases while independently excluding the configured live database. Validate protocol, local host and exact allowed name; do not accept arbitrary strings merely containing “test”. Capture configured live identity before test setup replaces `DATABASE_URL`. Compare `current_database()` with the validated selected target before destructive operations.

Validate `TEST_DATABASE_URL` before `prisma migrate deploy` in global setup and before fixture writes/truncation. Normal migrations must remain the schema path. Include negative tests for live aliases, invalid/remote/unapproved targets and global setup refusing to launch migration on an unsafe URL. Preserve B's existing dedicated verification without editing its files; account for module aliases used by B's configuration.

Use `outreach_test_joboss_a` for A verification, not the common database. Create this local test database if absent using the existing local Postgres connection without printing credentials. No live creation or deployment. Do not reset or truncate another worker's database.

### 2. Research cannot bypass budget with zero credits (P1)

At the gateway's actual network boundary, every research request must declare positive integer base credits; vendor-only cost cannot bypass that requirement. Reject invalid/fractional/negative/nonfinite spending consistently across all exported accounting paths. Zero-cost mail/OAuth operations retain a narrowly defined exemption matching existing HTTPS endpoint/method/operation combinations. Do not accept a caller-controlled arbitrary skip flag or exempt an entire Google domain. Host denial, terms, applicable robots/API contracts and rate checks remain.

Existing B transport uses Gmail message list, full message read, attachment read, send and reconciliation operations, plus OAuth token exchange. Read the actual callers; preserve these exact operations without editing B. Prove offline HN/StartupDB/company research cannot send a request with `{cost:0}` even when envelopes are absent or exhausted; prove allowed mail/OAuth zero-cost requests still work. No live transport tests.

### 3. One global monthly envelope; exact validated accounting (P1)

Add a new migration with a partial unique global-per-period index for rows where company_id is null. The applied `20261014170000_joboss_preparation` migration is immutable. Do not drop any existing constraints, delete/merge duplicates automatically, increase caps, or rewrite applied SQL. If any target contains duplicates, fail with a precise reconciliation requirement; read-only R-A inspection found none live.

Budget checks/reservations must fail closed on ambiguous envelopes and charge exactly the validated global/company rows. Existing fixed lock order is preserved. Add concurrent envelope-creation and independent-connection last-credit tests, including company and vendor credit dimensions. Ensure direct accounting cannot disagree with validation.

Verify the gate's transaction-client contract: a network request must not become authorized by a reservation that a surrounding transaction later rolls back. Establish a concrete enforceable boundary or refuse that unsupported usage; inspect all callers and keep correct ordinary-client behavior. Report any caller changes required outside ownership.

### 4. Authorship always requires captured identity evidence (P2)

Whenever an authorship-verified hook is accepted, require independently captured identityVerified plus nonempty identity evidence contained in the task's allowed evidence set, regardless of the model's identityStatus label. Reject inconsistent capture metadata. Regression: output identityStatus unverified, authorshipVerified true, empty identityEvidenceIds must not fulfil. Also test unknown/out-of-allowset identity evidence. Do not weaken recipient-owned company/person binding or promote a model flag into verification.

### 5. Terminate descendants on timeout (P2)

Complete termination/escalation of the owned process group independently of the immediate child's close event. Do not report cleanup or remove temporary artifacts while a timed-out owned descendant remains running. Cover the review's fixture: parent exits on SIGTERM, descendant ignores SIGTERM and disconnects its streams. Add timeout/output-overflow/launch-failure cleanup verification as appropriate. Signal only processes created by the runner; do not scan or kill unrelated user processes.

### 6. Atomic open-task enqueue deduplication (P2)

Enforce one open task per `(kind, promptVersion, subjectType, subjectId)` for pending/claimed statuses, using a new migration/database invariant plus safe atomic create/conflict reread or serialization. Terminal historical tasks remain intact; intentional subsequent tasks after terminal status and new prompt/subject versions remain possible. If duplicates already exist, report them for explicit reconciliation rather than deleting/abandoning records automatically. Preserve durable lease fencing and historical task schemas.

Prove simultaneous enqueue through independent PostgreSQL connections/processes yields one task and consistent created flags, then claim/reclaim/fulfil/reject races cannot let superseded workers write output/accounting/metadata. Handle conflicts without querying inside an already aborted transaction. Do not implement a plain read-then-create retry that still races.

## B shared-interface request

Add `rfc822MessageId?: string | null` to shared `ProviderMessageRef`, documenting that it is the provider's actual stored RFC header, not the client's deterministic reconciliation ID. Preserve providers that omit it and B's local compatible extension. No transport or send behavior changes in this correction task.

B's optional `inbox_ingestion_incomplete` reason-code request is deferred: its existing weak_evidence refusal plus explicit detail/audit action remains in place. Do not enlarge this correction with a reason-code enum rollout; record the deferred request.

## Constraints and migrations

₹0 additional spending. No live database writes/deployment, live mailbox operations, outreach, approvals, sending flag/stage changes, paid APIs, resets, destructive cleanup, commits or another worker's edits. Protect all 57 original live drafts and eleven protected index definitions. Use new corrective migrations, normal deploy on A's dedicated test target only, then Prisma generation. Preserve previously applied checksums. Do not modify live rows to make a migration pass.

## Verification and acceptance

1. Add meaningful regressions for each concrete R-A reproduction, with real PostgreSQL concurrency rather than only in-memory fixtures where storage/locks matter.
2. Run A's focused selection on its assigned dedicated database; report exact file/test counts rather than assuming the original 83 remains the count.
3. Run corrected budget regression tests and other safe owned regressions; report the separately owned ATS-fixture failures without relaxing allowsets.
4. Run schema validation/generation, network guard, lint, diff checks and backend/UI typechecking separately. Report unowned diagnostics honestly.
5. If existing subscription quota permits, run a minimal synthetic operational smoke for Codex/Claude with no repository, mailbox or external-source access and no paid fallback. Check actual runtime/catalog isolation, not merely successful `--help` parsing. If unavailable, report the exact remaining validation limit; do not claim effective model-visible isolation from mocks.
6. Confirm new migrations and both send deduplication indexes on A's test database. Recheck protected live state only through read-only transactions; if inaccessible, say so.

Required report: **A — Foundation corrections 01 report**, saved to `docs/JOBOSS-A-CORRECTIONS-01-REPORT.md` and returned in chat. Map each of the six findings to changes, tests executed/results and remaining limitations; list changed files, finalized interfaces, new migration names/status, B request handling, external failures and preservation evidence. Do not claim overall JOBOSS or pilot readiness. Yield files for R-A re-review.
