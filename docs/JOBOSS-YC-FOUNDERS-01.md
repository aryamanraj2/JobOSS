# JOBOSS-YC-FOUNDERS-01 — YC founders with confirmed emails

For: **JOBOSS Full-list Builder**. Lean: one pass, short report, PARTIAL report if usage runs low.

## Why

The human decided on 24–26 October 2026 to take founder names from YC company pages (the approach in `/Users/aryamanjaiswal/Downloads/Github_pulls/yc-outreach/yc_scraper.py`), then confirm each founder's address with free checks before spending provider credits. Hunter/Snov and the human's weekend Apollo/SalesQL work are kept for up to two non-founder employees per company later. Guessed addresses are now allowed **for founders only**, always labelled with how they were confirmed.

## Scope

- Catalog: `docs/JOBOSS-NEXT-CHAT-20261021/COMPANY-BASELINE.csv`. Match its `domain` against website domains in `https://yc-oss.github.io/api/companies/all.json` (root's check: 99 of 245 match, 90 eligible).
- Keep eligible rows with no hold/skip. Exclude the 16 already-contacted companies and every address in `docs/JOBOSS-NEXT-CHAT-20261021/DO-NOT-RESEND.json`. Expect about 70–75 companies; report the exact number.
- Per company, one GET of `https://www.ycombinator.com/companies/<slug>` (robots.txt allows `/companies/<slug>`, disallows `/companies?*`). Read `props.company.founders` (`full_name`, `title`, `linkedin_url`) and `team_size` from the embedded `data-page` JSON. Sequential, about one request per second, one retry at most on 429/5xx.
- Founders: up to two per company, CEO first, then CTO, then others. List any extra founders in the CSV but do not import them.
- Do **not** use YC's Algolia key, scrape company websites, fetch LinkedIn, use Apify, or sign up for any new service.

## Confirmation ladder

Candidates per founder, in this order (ASCII-folded, lowercase): `first@`, `first.last@`, `flast@`, `firstlast@`. Stop at the first step that settles the founder.

1. **Cache (free).** Look in C contacts/evidence and the saved Hunter/Snov/site results under `scratch/joboss-contacts-*` and `scratch/joboss-full-list-0*`. Exact address present → `confirmed`. A real colleague address at the domain shows the pattern → put the matching candidate first and record it as `pattern_source`; continue to step 2.
2. **Mailbox check (free, own machine).** First test `nc -z aspmx.l.google.com 25`; if port 25 is blocked, skip this step for the whole run and say so in the report.
   - Look up MX. No MX → `no_mail`, hold.
   - One SMTP session per domain to its top MX: `EHLO` with a plain hostname, `MAIL FROM:<>`, then `RCPT TO` a random address such as `xq7zk3@domain`, then the candidates in order (at most 5 `RCPT` per session), then `QUIT`. **Never send `DATA`.**
   - Random address rejected and a candidate gets `250` → that candidate is `mailbox_ok`. Every candidate rejected with `550/551/553` → `no_candidate`, hold.
   - Random address accepted → `catch_all`; go to step 3.
   - Any `4xx`, timeout, or rejection at `MAIL FROM` → `unknown`; go to step 3. No retry loops.
   - At least 5 seconds between domains. Stop the whole step if 3 domains in a row refuse the connection, and report it.
3. **GitHub (free)** for `catch_all`/`unknown` founders only: `https://api.github.com/search/commits?q=author-email:<candidate>`, respecting the keyless search limit (10 per minute). A hit → `github` with the commit URL as evidence.
4. **Hunter Email Finder** for founders still unsettled: reuse the Hunter finder path from FULL-LIST-07. At most **7 calls** in total (10 free left, keep the 3-credit reserve); check the account balance first. A returned address at the domain → `hunter` with Hunter's score and sources. No Snov lookups (known 402 branches).
5. **Still unsettled:** on a `catch_all` domain → `first@` as `catchall_guess` (a wrong guess cannot bounce there). Otherwise → `hold`.

## Output and import

1. `scratch/joboss-yc-founders-01/founders.csv`: company, domain, slug, team_size, founder, title, linkedin_url (text only), chosen_email, tier (`confirmed` / `mailbox_ok` / `github` / `hunter` / `catchall_guess` / `hold` / `no_mail` / `no_candidate`), evidence, other_candidates, existing_c_contact. Also save the raw per-domain SMTP replies (codes and text, no secrets).
2. If C already has the same person, keep the existing contact and import nothing for them.
3. Import non-hold rows into C `outreach_real_joboss_c` only, never `outreach_dev`, using `npm run contacts:import` with `--provider yc-founder-<tier>`, `email_status` blank (rows land `verified = false`), `source_url` = the YC company page, and the tier and evidence in `notes`. Run `--dry-run` first, then the real additive import with the usual fresh before/after preservation check. Stop if any existing row would change.
4. Report `docs/JOBOSS-YC-FOUNDERS-01-REPORT.md`: companies in scope, founders found, counts per tier, Hunter calls and balance after, whether port 25 worked, imports, and `team_size` per company so the human can see where employees probably exist.

No drafts, approvals, Gmail, goals, sends or app/schema/guard edits. ₹0.
