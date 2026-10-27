# JOBOSS-DRAFTS-08 report

27 October 2026. Complete. ₹0. All 109 drafts `approved=false`, `sending_authorized=false`.

## Accounting
- Scope: the 113 founders imported by YC-FOUNDERS-01 across 66 companies. All 113 addresses rechecked against `DO-NOT-RESEND.json` (21 addresses): **0 overlaps**; none of the four hold/skip companies are present.
- **Drafted: 109** (64 companies; rank 1 = 64, rank 2 = 45). **Held: 4.** 109 distinct bodies; co-founders at the same company got different bodies, subjects and resume projects, and each stands alone.
- Fractal Labs / Alan Du (hunter): YC page has no one-liner or description and no saved C evidence or capture; no concrete honest hook.
- Fractal Labs / Derrick Xin (catchall_guess): YC page has no one-liner or description and no saved C evidence or capture; no concrete honest hook.
- Pretzel AI / Ramon Garate (github): YC one-liner is only "AI tooling" with no description; no saved C evidence or capture; no concrete honest hook.
- Pretzel AI / Prasoon Shukla (github): YC one-liner is only "AI tooling" with no description; no saved C evidence or capture; no concrete honest hook.

## Per email tier (drafts)
- catchall_guess: 53 — shown as **unconfirmed address**
- mailbox_ok: 43
- github: 6
- hunter: 6
- confirmed: 1
Held rows by tier: {'hunter': 1, 'catchall_guess': 1, 'github': 2}.

## Resume split
AI 108, iOS 1. The only iOS draft is Maia (described as an app; mobile is not explicitly evidenced, so the human may switch it to AI). Both PDF hashes match RESUME-INPUTS-01 (unchanged).

## Style
Angle follows the YC title: CEO/business founders get product and impact hooks, CTO/technical founders get the closest technical project. One project link per email at most, from the PDF annotations. Signature and link formatting match D6/D7 (name, linked website, linked Resume; no email address, labels or attribution). Hooks come only from the saved YC `one_liner`/`long_description`; Argil, ProSights and Trellis AI have the one-liner only.

## Things for the human to look at
- **Length:** 82 of 109 drafts are shorter than D6's usual 90–150 words (range 63–110, hard max 280). They were kept short rather than padded with weaker lines.
- 53 drafts go to `catchall_guess` addresses that were never confirmed.
- Several different founders share the same resume facts (KilnWatch, Airtel, Examination Cell) but never in the same wording at one company.
- Company statements such as "says it has passed 1M interviews" are attributed to the company's own YC description; none are independently checked.

## Boundaries kept
No new fetches, provider/model API calls, DB writes, Gmail, approvals, send queue, goal, Git or app edits. One read-only transaction in C (identity checked as `outreach_real_joboss_c`) read contact IDs for the manifest. Live DB not opened.

## Files
`docs/JOBOSS-DRAFTS-08-REVIEW.md` (readable, grouped by company, rank 1 first, tier and rank beside each draft), `scratch/joboss-drafts-08/manifest.json`, builder in `scratch/joboss-drafts-08/`.
