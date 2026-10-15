# R-B — Delivery corrections 02 targeted re-review

Continue in the existing **R-B — Inbox/delivery review** chat. B has yielded its files. This is the sole active assignment; all builders/other reviewers are idle. Work directly, without agents or messages to other chats. Code, tests, configuration, schema and migrations are read-only. Write only the new review report below; preserve prior reports and current Git state.

## Objective and bounded acceptance

Independently close or reopen **RB-3a and RB-3b** from `docs/JOBOSS-B-CORRECTIONS-01-REVIEW.md`. Read that review, `docs/JOBOSS-B-CORRECTIONS-02.md`, B's `docs/JOBOSS-B-CORRECTIONS-02-REPORT.md`, and the changed source/new tests. Existing shared foundation and RB-1/RB-2/RB-4/RB-5 plus definite-failure stop preservation stay accepted unless a concrete new regression is demonstrated. Do not restart their implementation/research reviews.

Determine whether delivery is accepted within the existing mocked-provider/local-PostgreSQL scope. D's substantive @5 readiness validator/CLI integration and three typing errors, actual provider/mailbox behavior, automatic-runtime isolation and preparation/cohort/pilot acceptance remain separate. Verify existing fail-closed boundaries without inventing substitutes. No real mailbox or provider inference is authorized or needed.

Corrections-02 changed only `src/outreach/mail/headers.ts` sender parsing and `src/outreach/send/ingest-outcomes.ts` attribution guards, adding `src/outreach/mail/dsn-evidence.ts` and `test/delivery/corrections-02.test.ts`. Shared interfaces, sync/classifier, closed corrections, schema/migrations/configuration should be unchanged during this pass. Distinguish this inventory from the wider inherited diff.

## RB-3a — One supported sender

Independently reproduce your exact mixed mailbox example through parser, detailed matcher, actual ingestion, sync/replay and pre-send:

```text
other@outside.example, Person B <owner+b@owned.example>
```

Use normal sent synthetic A/B attempts with a shared thread, this value in both From representations and a stop body. Required result: no convenient final-address extraction; unresolved, bounded audit once under concurrent/repeated ingestion, no Reply/Bounce/OptOut/suppression or contact/conversation mutation, incomplete resumable coverage and no new provider send. Check mixed bare/angle, reverse/list and unsupported forms within the documented conservative syntax.

Positive controls must retain `"Last, First" <owner+b@owned.example>`, quoted escapes, ordinary bare/angle forms, case/outer whitespace and distinct plus addresses. Separate From disagreement remains unresolved; unrelated messages without known conversation evidence remain ordinary unmatched. Sender parsing is not authentication or a full RFC mailbox parser. Unsupported syntaxes that explicitly fail closed are not alone a reason to demand a general parser rewrite.

## RB-3b — No cross-recipient DSN status borrowing

Independently reproduce your known-B original Message-ID with an unknown failed recipient block followed by B's delivered block. Reverse block order and swap failure/delivery assignments. Review that **all** explicit recipient evidence survives, including unmapped/null unreadable values, and that mixed or unbindable outcomes are rejected before whole-body classification writes an irreversible fact.

Required result for relevant mixed/conflicting DSNs: unresolved, no arbitrary bounce/reply/opt-out/suppression/state changes, bounded idempotent audit, incomplete/replayable sync and no new send. Confirm two-known conflicts, repeated blocks/fields, unreadable/unsupported recipient declarations and contradictory/unbound action/status/diagnostic evidence reach the same existing safety path. Do not treat a known exact message ID as permission to ignore contradictory recipients.

Preserve unambiguous known single-recipient 4.x.x/5.x.x outcomes, same-recipient Original/Final evidence in one supported block, exact-ID-only legacy cases within the documented scope, strong-ID precedence over weak unrelated thread, recipient-only known matching and unknown-only unrelated DSNs. Conservative quarantine of mixed/unbindable evidence is the agreed sufficient correction; no broad MIME redesign or generalized DSN feature expansion is required.

## Independent verification

Use only **outreach_test_joboss_b** with process-only test URL, shared configured-live exclusion and read-only actual-identity verification, normal immutable migration setup and `test/delivery/vitest.config.ts`. Run serially, outbound HTTP refused, fake providers only. Supplemental probes may use newly owned temporary files with the same guards. Do not modify tracked tests/configuration to get a result, install/replace dependencies, generate source, reset/db-push, drop constraints or bypass safety.

Run all ten delivery files: previous nine files/154 tests plus the new 47 cases. B reports **201/201, ten files**, supported by its retained `/tmp/joboss-b-corrections-02-evidence/suite.log`; record your independently executed counts. The existing selection preserves the closed race/uncertainty/stop/Auto-Submitted/failure regressions and positive pagination/atomicity/cap/readiness evidence. Reopen only on a demonstrated regression; avoid redundant broad investigations.

Root independently ran no-DB/no-provider pure assertions: exact multiple sender rejected, quoted comma accepted, plus tags distinct, mixed DSN issue raised with both recipients retained and single-recipient DSN accepted. Root matched the retained 201-test log and original/corrective migration disk hashes. These are supplemental checks, not independent ingestion/database acceptance.

Run lint, network guard, schema validation, whitespace and backend/UI typechecks separately, incremental writes disabled. Keep the three existing D-owned optional-contactId errors tracked; new correction-owned diagnostics are actionable. Full suite, foundation rerun, live mailbox test or inference is not required. B's earlier cloud-only dependency startup failures recovered before its final runs; if they recur, distinguish environment-blocked zero-test attempts from executed evidence, hydrate existing files without logical/package changes, and never disable guards or relax compiler settings.

Verify B's applied migrations/checksums and protected indexes. Expected JOBOSS hashes:

```text
20261014170000_joboss_preparation
4ba2ea670a9017418f97756e6a894d8a93c873043a2a223e792d2c7ad9df9b3c
20261015010000_joboss_foundation_uniqueness
31646f76d73ac25704e90803c34cf2a7e554ab597fd519c4bf6dfd6d201c0f3b
```

If accessible, compare live baseline only using BEGIN READ ONLY/ROLLBACK: 57 drafts/all protected fields, 11 index definitions, zero attempts/live JOBOSS migrations, F5 and both sending flags false. Preserve staged/unstaged files and HEAD. No live approval/write/deployment, inbox/send/OAuth/auth/model operation, outreach, sending enablement, paid service, staging, commit or reset.

## Required report and stopping point

Save `docs/JOBOSS-B-CORRECTIONS-02-REVIEW.md`, return it labeled **R-B — Inbox and delivery corrections 02 re-review report**, then yield. Include:

- Scoped delivery verdict and RB-3a/RB-3b each closed/reopened/verification-blocked with concrete actual outputs.
- Actual commands/checks, file/test counts, supplemental results, skipped/blocked checks and preservation evidence.
- Final unchanged attribution/coverage interfaces and D/provider/runtime integration limits.
- Newly demonstrated regressions only, with priority, absolute file/line, reproduction, effect and bounded correction ownership. Separate hypotheses and intentional fail-closed availability limits from defects.

If these two cases and preservation pass, explicitly close RB-3, accept scoped delivery and stop this review loop. Do not implement fixes, start another assignment or claim real-provider/pilot/overall JOBOSS completion. Return the report through the human/orchestrator.
