# Chat D — People, drafts and review

Start only after the orchestrator accepts Chat A's shared foundation. Fresh local chat on `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`; may run in parallel with Chat C. No subagents. Read `/Users/aryamanjaiswal/Downloads/PLAN.md`, `docs/JOBOSS-COORDINATION.md`, accepted contracts and preserved diff.

## Objective and behavior

Finish recipient suitability, company/person research, narrative @5 drafting and a real review queue. Founders, technical leaders, relevant product engineers and recruiting contacts qualify through supported responsibilities; Field/Sales Engineering must not pass merely on title wording. Select the strongest reachable contact first. Discover routes only from permitted public sources; no inferred addresses or paid enrichment.

Verify full identity/employment before naming a recipient and verify authorship before crediting work. Bind every person excerpt to the exact person/company; external sources retain external_source provenance. Search supplies candidate URLs only, then code performs allowed fetches and stores evidence. Company research is reused; absent person work gets an honest company hook with an explicit limitation. Research consumes bounded credits, never cost-zero bypasses.

Retain the detailed narrative and 280-word ceiling; select relevant project proofs and the matching resume from approved claims. Preserve @1–@4 compatibility. Every original draft, including composing/closed drafts, stays intact; upgrading creates a new @5 revision requiring individual approval. Reuse only newly created JOBOSS composing revisions on resume.

Separate application score from outreach readiness. Live `fit.supported`, suitable verified route and a concrete valid hook govern @5 readiness. Preserve application Lead scores/statuses if used as draft FKs. Semantic support checks must cover every generated sentence with identical text/citations, content-hash freshness and verified company/person scope; unsupported/uncertain results remain blocked. Include approved project-link metadata so valid links can be checked.

Review shows company fit/trigger, eligibility uncertainty, recipient suitability/identity, route provenance, support excerpts, person-hook limitations and blockers. Approval remains one email at a time through the established hash mechanism. Do not send.

## Ownership and dependencies

Own `src/outreach/contacts/**`, `src/outreach/draft/**`, new `src/outreach/review/**`, new `app/outreach/**`, `tools/run-contacts.ts`, `tools/run-drafts.ts`, `tools/verify-f4.ts`, recipient/draft tests and own documentation. No core/schema/config/registry/package/mail/send/scoring/shared app page/action edits; request shared navigation changes for integration.

Consume Chat A's ContactResearch, person-bound Evidence, revision schema, @5/support/URL/contact task contracts and runner. Consume Chat C's assessment shape; do not edit its ranking. Finish exact `prepareRecipients`/`prepareOutreachDrafts` APIs and publish a reusable readiness/support interface for Chat B and integration. Current typecheck errors in compose.ts/queue-draft.ts are yours to fix.

## Constraints, acceptance and report

No live data writes/migrations/approvals/sends, ₹0 extra spending, preserve all partial work and protected baseline. Use dedicated local `outreach_test_joboss_d`, normal migrations and explicit TEST_DATABASE_URL; no db push. Test founder/no-ATS readiness, commercial engineers excluded, ambiguous identity/unsupported authorship, wrong person/company citations, labeled company fallback, strongest contact first, legacy composing/written draft preservation, new revision/new approval, word limit/resume matching and support-check resumption/hash mutation. Run focused tests, typecheck, lint, network guard and render/inspect the new review page using test data.

Return changed files, behavior, exact exported interfaces, executed checks/results/actual output, unresolved blockers/shared requests and draft preservation evidence. Stop for independent review.
