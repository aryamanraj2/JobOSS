# Full list 01 — current coverage and two-person gaps

**Destination chat: JOBOSS Full-list Builder.** Workspace `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`.

Read `AGENTS.md`, current orchestrator handover, this packet and `docs/JOBOSS-NEXT-CHAT-20261021/FILE-INDEX.md`. Do not read the entire old chat/log or archives. One builder, plain short report; no reviewer round.

The human wants the full saved company catalog, aiming for two distinct suitable people per eligible company where possible. Existing suitable contacts count; two emails for one person count once. Prefer founders, CTOs, relevant engineering leaders/engineers or recruiters, with honest affiliation/source and email-validity status. Generic inboxes do not establish a named-person count.

## This first task

1. Read-only inventory of **C `outreach_real_joboss_c`**. Check database identity and read-only transaction before queries. Never open/write live. Never print credentials; `.env` points at live and must be overridden only in process. If safe access is unavailable, use saved files and mark current counts unknown rather than guessing.
2. Reconcile company IDs/domains against `COMPANY-BASELINE.csv`: 245 old rows, 232 then eligible, 13 ineligible. Preserve old baseline; include current additions/status differences visibly. No re-ranking writes, discovery rerun or silent company merges.
3. Inventory existing contacts/evidence/caches and collapse same-person alternate emails. Overlay `DO-NOT-RESEND.json` / real receipt log: 21 already-contacted addresses across 16 companies. Do not treat the old catalog export's zero-contact state as current. Do not assume address validity proves affiliation.
4. Produce one row per company: ID/name/domain, current eligibility/hold and source, usable distinct people and their roles/emails/evidence, uncertain/generic candidates separately, already-contacted addresses, gap to two, and next best free research route. Preserve all excluded/held rows. No fabricated “two” or guessed emails.
5. Summarize counts at zero / one / two-or-more suitable people, missing own-site evidence, unresolved affiliation/domain cases, and remaining review work. Separate fresh DB observations from old-file observations. Reuse cached results; no external/provider/model calls, import, DB writes, Git, app code, approvals, email or automation in this inventory task.

## Deliver

`docs/JOBOSS-FULL-LIST-01-COVERAGE.csv` and `docs/JOBOSS-FULL-LIST-01-REPORT.md`, plus a brief coordination entry. Save bounded supporting evidence in a fresh `scratch/joboss-full-list-01/` folder. Include a short proposed next research pass using the same builder, existing tools, public own sites/manual exports, current entitlement checks and ₹0. Do not execute it yet; no broad harness/guard expansion. Provider credits/balances are stale until confirmed.

Firebender stays skipped; GloGlo / ion design / Keystroke held. Existing exact-pair manual exceptions remain unverified and do not authorize new pairs. Never touch the completed S2 queue, send receipts or frozen payloads. New exact drafts require human approval later; the old all-21 sending permission does not transfer.
