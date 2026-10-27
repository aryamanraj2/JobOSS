# D8 — founder drafts from YC-FOUNDERS-01

For: **JOBOSS YC Founders Builder** (same chat that ran YC-FOUNDERS-01). Lean, one pass, PARTIAL report if usage runs low.

Read `docs/JOBOSS-DRAFTS-07.md` (style, signature, resume rules, manifest shape), `docs/JOBOSS-DRAFTS-06-REVIEW.md` (human-approved tone), `docs/JOBOSS-RESUME-INPUTS-01.md` and `docs/JOBOSS-YC-FOUNDERS-01-REPORT.md`. D7's rules apply unless this file says otherwise.

## Scope

The **113 founders imported by YC-FOUNDERS-01** (`scratch/joboss-yc-founders-01/founders.csv`, `import_` set). One exact recipient, subject and body per founder, separate messages, never CC/BCC. Before drafting, recheck every address against `docs/JOBOSS-NEXT-CHAT-20261021/DO-NOT-RESEND.json` and the holds (root found no overlap).

## Company hook

Use saved facts only, no new fetches: the company's YC `one_liner`/`long_description` from `scratch/joboss-yc-founders-01/yc-all.json`, plus any saved C evidence or earlier captures for that company. One concrete fact about what they build. If nothing concrete supports an honest hook, hold the row.

## Founder angle

Use the YC title. CEO/business founder: product and impact angle. CTO/technical founder: the closest technical project from the resume. Co-founders at the same company get **different** bodies (not one text with the name swapped), each standing on its own. Pick the AI or iOS resume by the company's evidenced work, as in D7.

## Beside each draft (outside the email text)

Email tier from the founders CSV (`mailbox_ok` / `github` / `hunter` / `confirmed` / `catchall_guess`), with `catchall_guess` shown as **unconfirmed address**. Also: company, title, resume choice, hook source, and `founder_rank` (1 = first founder for that company, 2 = second) so the send plan can space co-founders apart.

## Output

- `docs/JOBOSS-DRAFTS-08-REVIEW.md`: readable list for the human, grouped by company, rank 1 first.
- `scratch/joboss-drafts-08/manifest.json`: same shape as D7's manifest plus `email_tier` and `founder_rank`; every row `approved=false`, `sending_authorized=false`.
- `docs/JOBOSS-DRAFTS-08-REPORT.md`: drafted versus held and why, counts per tier, resume split.

No website/provider/model API calls, DB writes, Gmail, approvals, send queue, goal, Git or app edits. ₹0. Read-only C access only if a needed saved fact is missing, under the same C-only rules as D7.
