# Full list 04 — ranks 31–40, link-led own-site research

**Destination chat: JOBOSS Full-list Builder; reuse the same builder.** Workspace `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`.

Read AGENTS.md, current handover, FULL-LIST-03-REPORT.md, this packet and FULL-LIST-03's C-only execution/preservation controls. Reuse its successful bounded runner and preservation helpers. No app/schema/guard changes or broad harness.

## Checkpoint and exact scope

FULL-LIST-03 confirmed C has 245 companies and 24 contacts: nine provisional named people across eight companies, no independent identity-verification timestamps. All contacts unchanged. Saved primary support includes four full names at Aidy/Momentic and three first-name-only Respan founders. Keep first-name records unresolved; do not present them as fully identified or email-ready people. All seven lack personal emails published in reviewed first-party text; older candidates retain their original uncertainty/sent exclusions.

Work only these baseline ranks, using their IDs/domains in FULL-LIST-03-COVERAGE.csv:

| Rank | Company | Saved domain |
|---|---|---|
| 31 | Tamarind Bio | tamarind.bio |
| 32 | Ubicloud | ubicloud.com |
| 33 | Upsolve AI | upsolve.ai |
| 34 | Saga AI | usesaga.ai |
| 35 | Wavelength | wavelength.cx |
| 36 | Zaymo | zaymo.com |
| 37 | applyapply | applyapply.xyz |
| 38 | ARTIFICIAL ANALYSIS | artificialanalysis.ai |
| 39 | Beacon AI | beaconai.co |
| 40 | Brilliant.org | brilliant.org |

These ten were baseline eligible without holds at the last root file check; check C for any conflicting hold/status and stop that company if found. Do not alter eligibility or backfill a skipped slot with another company. Carry the previous unresolved-company and Respan identity/email gaps forward without fetching them this pass.

## Research method and limits

₹0, caches first, existing guarded static own-site fetching only. **Ten companies, at most two new content starts per company / 20 total, and 50 total HTTP requests**, including all robots/redirect/retry hops. Stop before dispatch when the next request would exceed the bound. Existing budget/policy caps remain authoritative; never reset usage, raise a cap or edit an allowlist. Global research usage was 493/1,009 at pass03 end; recheck C before use, do not assume that is still current or equate those units with all HTTP hops.

Pass03 had 19 final content 404s. Prefer saved genuine team/about/company links or links from an accepted homepage capture, rather than guessing the same paths for every domain. If no supported page URL exists, the homepage is the first new content start; use a real first-party team/about/contact/careers link for the second. Choose an available page likely to identify suitable people. Read saved/raw HTML locally for navigation when available; any network request still goes through the accepted guard and counts. If extraction supplies no usable links, leave the gap explicit; do not add unbounded sitemap/search/browser requests or guessed fallback loops. No separate fetch just to inspect a URL. Stop once two distinct fully named suitable people have primary role/affiliation support; keep partial identities separate.

Capture exact full name, role, primary affiliation excerpt, source URL/retrieval time, and publicly published personal email if present. Seek founders, CTOs, relevant engineering people or recruiters; do not count investors, customers, testimonials, generic inboxes or repeated emails as separate people. Separate name/affiliation support, role suitability, email provenance and email validity. Missing emails stay missing; no guesses/provider lookup. A routine careers_page signal does not prove a vacancy. Redirects alone do not prove alternate-domain affiliation.

## C operations and preservation

The narrow builder-only C permission in FULL-LIST-03 applies to these ten IDs and their scoped hosts: explicit process-only override **before DB/config imports**, read-only identity check for exactly `outreach_real_joboss_c`, strict source-based write review, fresh before/after checks across all 34 tables (or current table inventory), and protected file hashes. Never contact live `outreach_dev` or print credentials/URLs. Root opens no DB.

Use existing guard/research functions unchanged. Only normal guard bookkeeping (actual budget increments, scoped robots refreshes, audits; missing standard envelopes without resetting caps) and append-only page Evidence/CompanySignal additions are permitted. Preserve every old evidence/signal and protected business row, including companies/status/scoring, contacts, jobs, drafts, approvals, outreach and host policies. Record IDs and attributable budget/cache/global deltas. Stop/report any unexpected mutation; no silent repair or rollback. No contact import/update, deletions, re-ranking, provider/model calls, paid fallback, Firecrawl, raw HTTP/browser bypass, LinkedIn scraping, logins, Git, chat/agent actions, drafts, approvals, sends or automation. Do not broaden the pass or retry around gate refusals.

Preserve all 245 rows, 13 baseline exclusions, Firebender skip, GloGlo/ion design/Keystroke holds, 21 sent-address exclusions and frozen S2 artifacts. Existing manual exceptions authorize no new pairs. Already-sent people may count toward coverage; never become pending outreach.

## Deliver

- `docs/JOBOSS-FULL-LIST-04-COVERAGE.csv`: all 245 rows, all prior observations preserved, clearly labelled new evidence and gaps.
- `docs/JOBOSS-FULL-LIST-04-REPORT.md`: lean results; fully identified suitable people versus partial names, available/missing personal emails, zero/one/two-plus research-supported coverage with assessed scope/denominator, actual content/HTTP usage and usable/404/refused outcomes, C deltas and preservation. Keep provisional C contact counts separate from primary research findings.
- Bounded captures, request ledger, preflight/preservation/delta evidence under `scratch/joboss-full-list-04/`; short coordination entry.

Propose the next bounded pass based on remaining coverage and actual budget; do not execute it. Preserve FULL-LIST-01/02/03 outputs. No separate reviewer chat.
