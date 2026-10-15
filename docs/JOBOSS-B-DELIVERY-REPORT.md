# B — Inbox and delivery report

14 October 2026. Delivery assignment complete within B's ownership; ready for independent read-only review. This is not a claim of pilot readiness.

## Changes and ownership

Edited only these existing delivery files:

- `src/outreach/mail/gmail.ts`: paginated inbox/search reads, strict provider response validation, loop/cap/truncation failures, full automatic-response headers, multipart text/DSN extraction, attachment-backed classification bodies, and actual stored RFC Message-ID after send/reconciliation. A successful POST with malformed response or failed metadata read remains ambiguous.
- `src/outreach/mail/fake.ts`: actual rewritten RFC ID in returned references; paginated fake inbox/read seams and injected inbox failures. No real transport used.
- `src/outreach/send/ingest-outcomes.ts`: provider-identity advisory locks plus unique provider IDs for bounce/opt-out/reply records. Outcome, suppression, contact retirement, draft/lead/attempt transitions and audit commit in one transaction. Duplicate ingestion preserves prior facts and adds no duplicate outcome audit. Hard bounce/opt-out/wrong-contact suppress; soft bounce and human reply stop without permanent suppression; automatic replies leave conversation state unchanged. Unknown legacy reply classification is reported as unclassified. Stronger existing draft stops are retained. Manual wrong-contact writes are atomic too.
- `src/outreach/send/classify-outcome.ts`: case-insensitive automatic headers and whitespace/parameter handling for Auto-Submitted.
- `src/outreach/send/counters.ts`: `replies` now counts classification `reply` only. Automatic, wrong-contact and unclassified replies are separate; opt-outs remain their own counter. Referrals/interviews and provider complaint/reputation signals explicitly report unavailable.
- `src/outreach/send/send.ts`: a new send requires complete all-received-mail ingestion. Partial ingestion refuses before an attempt/provider call. Resumed coverage must finish and then pass a fresh scan, so mail arriving on already-read pages is considered. Disabled sending does not read the inbox. Gate and attempt reservation run together under a transaction lock, preserving caps and dedup under concurrent invocations. The actual RFC ID is persisted separately from the stable client ID; X-Outreach-Ref remains the reconciliation handle. Existing attempts reconcile/report and never perform another send. Recording sent metadata does not reopen an outcome-stopped draft.
- `src/outreach/send/gate.ts`: an explicit final-readiness callback for `outreach_draft@5`, failing closed when absent. @5 uses the supplied current readiness instead of the legacy application score predicate. Approval hashes, contact verification/status, suppression, recipient policy, freshness, caps, breakers and dedup remain enforced.
- `tools/run-inbox.ts`: checkpointed complete coverage by default; explicit `--days` is labeled diagnostic coverage; incomplete ingestion sets failure exit status; counters expose separate classes and unavailable signals.
- `tools/run-send.ts`: list/dry results explicitly identify offline gates with inbox unchecked; counter labels distinguish human/automatic/stop replies. Reconciliation remains a separate no-send path.

Added:

- `src/outreach/inbox/contracts.ts`: local additive `DeliveryMessageRef`, `InboxPage`, `InboxProvider`, `isInboxProvider`.
- `src/outreach/inbox/sync.ts`: `syncInbox`, `InboxSyncOptions`, `InboxSyncResult`. Append-only audit checkpoints store query, page cursor, prior cursors, counts and completeness. Completed scans start fresh; partial pages replay safely through idempotent outcomes. Cursor field names avoid the audit sink's credential-key redaction. Defaults: 50 messages/page, 200 pages and 10,000 messages per invocation. Reaching a cap is incomplete; later invocations can resume. Query mismatch, corrupt checkpoints and provider failures block coverage.
- `test/delivery/db.ts`, `test/delivery/vitest.config.ts`: B-only test target validation and an alias for delivery tests' existing helper imports. Shared `test/helpers/db.ts`, setup/global setup and package files were not edited. Existing global setup deploys migrations normally; the existing setup disables outbound HTTP through the mock dispatcher.
- `test/delivery/gmail-pagination.test.ts`, `test/delivery/inbox-delivery.test.ts`, `test/delivery/caps.test.ts`: delivery acceptance regressions.
- This report.

All pre-existing partial work outside the assignment was left in place. No schema/migration, config/stage/flag, shared interface/policy, contact/draft implementation, UI, package or other worker document was edited by B. `tools/send-test.ts` was neither edited nor run.

## Exported interfaces and shared requests

`InboxProvider` requires `listInboxPage(query, pageToken?, maxResults?) -> { messages, nextPageToken }` and `getMessage(id) -> GmailMessage`. `DeliveryMessageRef` extends the current shared provider reference with optional nullable `rfc822MessageId` containing the provider's stored RFC ID. `syncInbox(db, provider, options)` returns `{ complete, resumed, scanned, matched, detail }`; counters expose automatic/wrong-contact/unclassified counts and unavailable referral/interview signals.

Requests for A/D/integration, without editing their files:

1. **D: provide the final @5 readiness validator.** The delivery seam is `SendGateOptions.evaluateOutreachReadiness(db, draftId, now): Promise<{ ready: boolean; detail: string }>`. It must validate current supported outreach fit, suitable verified recipient/contact route, exact current draft support and a supported hook, including evidence binding/hash freshness and any application-submitted restrictions. It must work using the transaction client, without network calls. Integration must wire the final owner-supplied validator into `tools/run-send.ts` options. No weaker delivery-side validator was invented; @5 currently refuses with `@5 readiness validator is not integrated`.
2. **A: incorporate the additive stored RFC ID into the shared `ProviderMessageRef` contract**, preferably `rfc822MessageId?: string | null` to match the local contract. Existing providers remain structurally compatible; a provider omitting it stores null, never the derived ID as an alleged provider ID.
3. **A: consider a shared `inbox_ingestion_incomplete` reason code.** Until a compatible shared enum/registry migration is provided, the refusal uses existing `weak_evidence` with an explicit incomplete-ingestion detail and dedicated `send.inbox_incomplete` audit action.
4. **D: repair the three existing backend type errors:** `src/outreach/draft/compose.ts:590:115`, `src/outreach/draft/queue-draft.ts:223:76`, and `:223:267`; each passes `contactId: string | undefined` to an optional `string | null` field under exact optional property types.
5. The shared test helper only permits `outreach_test`. B avoided changing it by using a strictly validated dedicated test configuration. A may generalize shared test-target validation for worker databases later; B verification does not depend on that change.

## Checks actually executed and results

Database identity was verified using local Postgres: live target `/outreach_dev`, B target `/outreach_test_joboss_b` on localhost, distinct from `/outreach_test` and other worker names. Created the dedicated B database because it did not exist. Each focused run explicitly overrode `TEST_DATABASE_URL`; migration deployment used the test global setup's `prisma migrate deploy` with `DATABASE_URL` overridden to the B URL. No `db push`, reset or constraint drop was used. Only test fixtures in B's database were truncated by test hooks.

The credential-free reproduction shape for the focused run is:

```js
// Run with node --input-type=module; load DB configuration without printing it.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const test = new URL(process.env.TEST_DATABASE_URL);
test.pathname = '/outreach_test_joboss_b';
const result = spawnSync('npx', ['vitest', 'run', '--config', 'test/delivery/vitest.config.ts', '--reporter=verbose'], {
  env: { ...process.env, TEST_DATABASE_URL: test.toString() }, stdio: 'inherit',
});
process.exit(result.status ?? 1);
```

Final focused run used `fileParallelism: false`:

```text
Test Files  8 passed (8)
Tests       114 passed (114)
Duration    8.52s
```

Files exercised: the three new delivery test files plus existing outcome-ingestion, send-gate, owned-inbox, classification and send-attempt-index tests. Verified 61 messages across pages; later-page refusal/status/truncation/malformed JSON/data; loops and caps; automatic headers; multipart/attachment DSNs and attachment failure; missing/non-UTF-8 bodies; repeated and six-way concurrent duplicate hard/soft bounce and opt-out ingestion; rollback when suppression fails; rewritten Message-ID matching with absent/broken threads, References and DSN quotes; separate human/automatic/stop/unclassified counters; incomplete pre-send refusal; fresh scan after resume reveals a new opt-out; bounce ingestion before a new individually approved send; disabled sending avoids mailbox access; approval mutation after ingestion; concurrent invocation yields one send; ambiguous response/crash reconciliation without second send; @5 missing/rejected/supplied readiness; daily caps 5/10/20 including in-flight reservations; existing contact/company-slot partial uniqueness and manual outcome behavior.

Earlier failing runs exposed an advisory-lock result deserialization error, an injection seam issue and incomplete test fixtures. Those were corrected and the final focused suite passed; historical handover assertions were not used as evidence.

Other checks:

- `npm run lint`: exit 0 on the final implementation/tests.
- `npm run check:no-raw-http`: exit 0, `clean — no network access outside src/core/policy/http/raw-client.ts`.
- `git diff --check` on B-owned paths: exit 0.
- `npm run typecheck`: exit 2, exactly the three unowned draft errors listed above; no B-owned diagnostic. The backend failure short-circuits the combined command's UI step.
- `npx tsc --noEmit`: independently executed UI typecheck, exit 0.
- Read-only SQL on **B's test database** confirmed `current_database() = outreach_test_joboss_b`; all 12 migration records applied through `20261014170000_joboss_preparation`; both `one_first_touch_per_contact_per_cycle` and `one_first_touch_per_company_slot_per_cycle` indexes present.

## Remaining limits and untested cases

The final @5 readiness validator/CLI integration and the three unowned type errors remain blockers. The full repository suite, integrated preparation/review UI and any pilot rollout were outside this assignment. CLI commands were reviewed/edited but not executed against a live database or mailbox.

All Gmail transport validation used fake gates/providers; no real mailbox operations, send diagnostics, OAuth refresh or outreach occurred. Actual provider header rewriting is a modeled historical behavior, not newly measured live evidence. The adapter follows Google's documented [pagination](https://developers.google.com/workspace/gmail/api/guides/list-messages), [full payload](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format), and [attachment retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get) contracts.

Complete scans deliberately cover all received mail, including spam/trash, and can be slow at the existing request spacing. Expired provider cursors, malformed mail, unsupported non-UTF-8 bodies, excessive MIME depth/bytes or coverage caps stop ingestion; they never license sending. There is no history/delta optimization or automatic cursor reset. Human reply classification remains heuristic and does not prove referrals, interviews or positive interest. Legacy bounce/opt-out records without provider IDs cannot be retroactively deduplicated safely; no live backfill was attempted. Missing stored RFC IDs remain null; thread matching may still work, but no provider ID is fabricated. The 5→10→20 ramp policy was preserved: default pilot floor remains 5, later caps require explicit existing operator control, and no automatic escalation or bulk send was added.

Preservation confirmation: B performed no live DB reads/writes/migrations, live mailbox operations, sending, external outreach, approvals on stored live drafts, stage/flag changes, credential/OAuth changes, cleanup/resets or commits. Test approvals and suppression writes were confined to newly created synthetic fixtures in B's database. Existing live data/drafts and credentials were untouched by B. No independent live baseline re-audit was performed in this assignment. No agents were spawned and no other chats were messaged.
