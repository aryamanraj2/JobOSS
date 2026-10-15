# Chat B — Inbox and delivery

Start now in a fresh local chat on `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. This may run in parallel with Chat A. Do not spawn agents or message other chats. Return findings and requests to the human/orchestrator.

## Objective and behavior

Finish the plan's delivery defects without enabling or exercising live sending. Read `/Users/aryamanjaiswal/Downloads/PLAN.md`, `docs/JOBOSS-COORDINATION.md`, the current partial diff and relevant historical delivery notes. Historical assertions are not test evidence.

- Consume all Gmail inbox pages, preserving automatic-response headers and bodies needed for classification. Provider failures, malformed data, pagination loops or a coverage cap must produce incomplete ingestion rather than a successful empty result. Persist enough progress to resume safely.
- Make bounce/opt-out ingestion idempotent by provider message identity, including concurrent duplicate delivery; outcome, suppression and draft transitions must commit atomically.
- Count useful human replies separately from automatic replies, opt-outs and wrong-contact responses. Report missing/unobservable signals honestly.
- Persist Gmail's actual RFC Message-ID on send/reconciliation and use it for broken-thread matching; retain the stable X-Outreach-Ref reconciliation mechanism and existing at-most-once behavior. Never retry an ambiguous send blindly.
- Complete outcome ingestion before a send invocation/batch. Incomplete ingestion must block sending; offline list/dry checks and reconciliation behavior remain clearly identified.
- Preserve immutable individual approval, approval hashes, suppression, per-contact/company-slot dedup, manual follow-ups, caps and the existing 5→10→20 ramp. For future @5 drafts, readiness must depend on current supported outreach fit, suitable verified recipient and supported hook rather than the legacy application score. Request the final @5 readiness interface if needed; do not invent a weaker parallel validator.

## Ownership

Edit only `src/outreach/mail/**`, `src/outreach/send/**`, new `src/outreach/inbox/**`, `tools/run-inbox.ts`, `tools/run-send.ts`, and delivery-specific tests/documentation. Existing delivery tests include outcome-ingestion, send-gate, owned-inbox, classification and send-index tests. Do not edit `tools/send-test.ts` unless a concrete transport-interface fix requires it; never run it against a live mailbox.

Do not edit schema/migrations, core config/interfaces/LLM/policies, contacts/drafts, application UI, package files, test helpers or another worker's documents. Shared changes go in your report for Chat A's sole owner. Use mocks/fakes to validate transport; no real mailbox operations.

## Dependencies

Current generated schema already contains nullable unique `Bounce.providerMessageId` and `OptOut.providerMessageId`, plus `SendAttempt.providerRfc822MessageId`. Chat A owns compatible shared-contract changes. The current migration is applied to the existing test database only and must not be rewritten. Work against current fields; flag any shared dependency rather than editing it. Chat D later owns @5 support/readiness; final integration will connect these after review.

## Preservation and constraints

₹0 new spending; no API billing, live DB writes/migrations, emails, approvals, external sending, OAuth changes, stage/flag changes, resets/cleanup or commits. Preserve all existing uncommitted changes and all stored drafts. Use a separate local test database `outreach_test_joboss_b`; create if needed, deploy migrations normally, explicitly override `TEST_DATABASE_URL`, verify distinct from live and other worker databases. Never use `prisma db push` or drop dedup constraints. Do not run live inbox/send commands.

## Acceptance and checks

Test >50 inbox messages across pages; failures on later pages; pagination loops/caps; automatic-response headers; repeated and concurrent bounce/opt-out ingestion; hard versus soft suppression; actual rewritten Message-ID and missing-thread reply matching; useful-reply counters; incomplete pre-send ingestion; approval mutation and dedup; ambiguous send reconciliation with no second send. Execute focused tests serially in your dedicated test database, typecheck, lint and network guard. Report failures in unowned files without modifying them. Live inbox/send verification is outside this task.

## Required report

Changed files and behavior; exported interfaces and shared requests; checks actually executed with results/output evidence; incomplete/untested cases; confirmation that live data, drafts, sending and credentials were untouched. Stop when ready for an independent read-only review. Do not claim pilot readiness.
