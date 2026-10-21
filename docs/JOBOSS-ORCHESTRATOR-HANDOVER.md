# JOBOSS — fresh-chat handover

Updated 22 October 2026 · `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`.
Read this page fully, then `AGENTS.md`, then only the last few coordination entries.

## Next objective

The human wants the **whole company list**, aiming for **at least two distinct suitable people per company where possible**. Treat this as the saved 245-company catalog, not just the previous twenty. First establish current coverage; do not invent a second person or count two addresses for one person. Existing suitable contacts count toward two total, not two additional. Generic inboxes are mailboxes, not named people. New emails still need exact recipient/content approval.

## Finished checkpoint

- First campaign finished: **21 unique recipients across 16 companies contacted**. S2 was twenty remaining emails, all exact Gmail SENT/readbacks verified. Peter had two earlier explicitly authorized dispatches; none during S2. No delivery/opening claim.
- `JOBOSS-SEND-20-COMPLETION-REPORT.md` and `...COMPLETION-AUDIT.json` prove completion. Receipts and actual bodies: `JOBOSS-SEND-01-RECEIPTS.json`, `JOBOSS-SEND-20-READBACKS.json`. Frozen payloads: `JOBOSS-EMAIL-EXPORT-21-V2.json`; wording review: `JOBOSS-DRAFTS-06-REVIEW.md`.
- Old queue is complete, goal complete, heartbeat `send-remaining-joboss-emails` **PAUSED**. Do not reactivate it or reuse successful recipients as pending.
- Last catalog snapshot: **245 companies, 232 eligible, 13 excluded/inactive** on 19 October. Last contact report: **24 contacts across 19/20 original companies**, eight provider-valid flags / sixteen unverified. These are saved checkpoints, not fresh full-catalog coverage.

## Start the next phase

FULL-LIST-01 is complete using saved evidence only; **current C coverage remains unknown**. Read `docs/JOBOSS-FULL-LIST-01-REPORT.md` for the returned checkpoint. All 245 rows retained; 228 eligible without holds/skips have historical provisional coverage of 220 zero / 7 one / 1 two-plus. Nine provisional people across eight companies are not independently verified coverage.

FULL-LIST-02 reviewed 16 saved captures: Aidy and Momentic each have two role/affiliation-supported people, without first-party-published personal emails in reviewed text. New fetching was blocked before invocation because the packet prohibited DB access required by the accepted guard. Zero HTTP requests; current C counts still unknown.

FULL-LIST-03 completed 18 companies: 36 content starts / 72 HTTP requests, 15 usable captures, 19 final content 404s, two short responses. Fresh C confirms 245 companies and 24 unchanged contacts; nine provisional people across eight companies, no independent identity-verification timestamps. Respan adds Andy/Raymond/Hendrix as three first-name-only founder records; surnames/emails unresolved. Keep partial names separate from fully identified people. Preservation passed; allowed evidence/signals/audits/cache additions and budget/cache updates are detailed in FULL-LIST-03-REPORT.md. Global research usage at completion: 493/1,009, stale until next check.

FULL-LIST-04 is also complete: ranks 31–40, 17 content starts / 33 HTTP requests, all 17 captures usable, no content 404s. Genuine site links improved results. Cumulative assessed scope is 30 companies: ten fully named suitable people across five companies, plus Respan's three partial identities separately. One personal email was published in reviewed first-party text; its validity is unverified and no outreach is approved. C contacts remain unchanged. Preservation passed; global research usage ended at 513/1,009, stale until next check. Details and personal contact information remain in the local FULL-LIST-04 report/coverage.

Next proposed pass, not executed or packeted yet: the seven eligible companies in baseline ranks 41–50, max 14 content starts / 35 HTTP requests; preserve excluded ranks 43, 44 and 49 without backfill. Reuse the same builder and narrow C-only identity/preflight/preservation, normal guard bookkeeping and append-only page evidence/signals; no business-row rewrites, contact imports, provider calls, drafts or sends. Root opens no DB and launches/messages no chats; human pastes the next packet when prepared. Preserve all prior outputs. One builder, at most one quick root check; no broad harness.

Prepared package: `docs/JOBOSS-NEXT-CHAT-20261021/START-HERE.md`, `COMPANY-BASELINE.csv`, `ALREADY-CONTACTED.csv`, `DO-NOT-RESEND.json`, `FILE-INDEX.md`, and preserved evidence copies. Baseline is an explicit old snapshot; blank qualified-contact counts mean not yet inventoried. Raw scoring input remains `scratch/joboss-v-parallel-preparation-20261019-a/c-export.json`.

## Rules that carry forward

- Root is orchestration-only: files/evidence/docs/packets and paste blocks naming another exact chat. No app code edits, DB writes, spawning or messaging chats. No Git unless the human explicitly requests it (commit/push requested on 22 October). Human clarified ordinary handoff “stage” means **prepare handover files**, not Git staging.
- ₹0; no paid fallback/upgrades or other people's keys. Keys only in `.env`; never print them. Reuse accepted tools; no login/CAPTCHA/gate bypass or LinkedIn scraping.
- Work DB is **C `outreach_real_joboss_c`**. `.env` points at live `outreach_dev`: never write live or print its URL. Builder must explicitly select C; imports later require dry run and preservation. Root opens no DB.
- Keep all 245 visible but retain exclusions. Firebender skipped; GloGlo held for identity; ion design held by human; Keystroke held with closure unverified. Broad scope does not silently erase these decisions.
- Aidy/Driver alternate-domain affiliations remain unresolved despite approved earlier manual exceptions. Provider-valid flags/manual imports are not independent identity proof. Do not generalize exact-pair exceptions. Conduit's two held Gmail alternatives remain outside C.
- New outreach approval is separate. The previous all-21 authorization is exhausted; no repeats, follow-ups or automatic new batch. Sender must be `aryamanj250@gmail.com`, never the burner login. Keep human-approved wording and concise linked signature, no attribution/CC/BCC/attachments. The prior Ellipsis gate-pass sentence was human-retained; it is not evidence a gate ran and must not become a new factual template.
- Gmail intermittently hit its connector's shared-project per-minute quota. Stop on failed/uncertain send; preserve ID/error, check Sent, never blindly resend. Four earlier rejections were resolved only after explicit human resumes. Five-minute spacing was the final old-batch setting, not permission for another campaign.

## Resumes and providers

Website `https://aryamanj.in`; AI `https://aryamanj.in/resume/ai.pdf`; iOS `https://aryamanj.in/resume/ios.pdf`. Both hosted PDFs matched supplied local versions on 21 October; not freshly fetched for this handover. Local files are under `/Users/aryamanjaiswal/Documents/Resume/resumes/`. Use supplied resume/project claims honestly; no invented availability, vacancy or accomplishments.

Last provider notes, not current balances: Hunter 13/50 used, 37 left, with unexplained earlier verification usage; prefer cache and recheck entitlement before calls. Snov free API returned 402; Apollo free APIs blocked; SalesQL Basic has no API. Manual exports/imports and public own-site evidence can fill gaps within existing rules. No new provider budget is authorized here.

Lean English, short packets. Strict review for sending or rewriting/deleting data only. Full prior handover preserved at `JOBOSS-ORCHESTRATOR-HANDOVER-ARCHIVE-20261021-S2.md`; do not read archives unless a specific fact is missing. Log each step briefly in `JOBOSS-COORDINATION.md`.
