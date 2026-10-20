# JOBOSS orchestrator handover (lean)

Updated **20 October 2026, Asia/Kolkata**. Workspace: `/Users/aryamanjaiswal/Documents/ChatGPT/scraper`. The previous long handover is archived byte-for-byte at `docs/JOBOSS-ORCHESTRATOR-HANDOVER-ARCHIVE-20261020-B.md` (SHA `8a4a300a6c113229b64d9bdee757028a49935f20ba3cf52aa7c296fc59530e15`). Read it only for a specific historical question.

## 1. What JOBOSS is and where we are

JOBOSS is a personal tool. It finds early-stage mobile/AI startups, researches them, finds people to email, and drafts short cold emails that the human approves one by one.

| Step | Status |
|---|---|
| 1. Find companies | **Done.** 245 in C DB `outreach_real_joboss_c`. Sources: YC directory (open-source mirror), HN Who's hiring, StartupDB, Seedcamp, a few SPC. |
| 2. Pick 20 | **Done.** Frozen cohort, all YC (3 mobile, 17 AI). |
| 3. Read their own sites | **Done.** Run 01, 20 Oct 10:41–11:04Z, 90 requests, exit 0. 17 have stored evidence; Firebender, ion design and Keystroke have none. Report `docs/JOBOSS-V-01-RUN-01-REPORT.md`, sheet `docs/JOBOSS-V-01-RUN-01-COMPANY-REVIEW.md`. |
| 4. Human Y/N | **Done.** All 20 marked Y ("all looks good"). |
| 5. Find people | **In progress; confirmed 5/20.** C1 Snov put 5 contacts in C: Andon, Baud and Clarion, plus founders@ for Breez and EHL. Snov free API then returned 402. **C2 Hunter PARTIAL:** an earlier run cached 14 domains and dry-ran 11 contacts across 10 companies; real import unconfirmed. Counter difference explained by Hunter's shared credit pool (13 used, 37 left; 26 is verification-equivalent usage). Cache-only continuation `docs/JOBOSS-CONTACTS-HUNTER-02.md` prepared for the same builder; expect `docs/JOBOSS-CONTACTS-HUNTER-02-REPORT.md`. |
| 6. Draft emails | Next. One chat drafts from stored evidence plus the resume. At most 280 words. No invented vacancy, person or work. |
| 7. Human approves each email | Required for every single email. |
| 8. Send | Manual, one by one. Follow-ups are manual too. |

## 2. LEAN MODE (human decision, 20 Oct): this overrides everything older

- The human judged the earlier builder→reviewer→correction loops far too heavy for the output.
- Read-only or additive work (research, provider lookups, contact import, drafting) gets **one builder chat and at most one quick root check**. No reviewer rounds and no long packets.
- **Strict review only** for anything that sends email or rewrites/deletes existing data.
- Replies stay plain-English and short. Packets stay about one page.
- Reuse existing scripts rather than building frameworks: `scratch/run-enrichment.ts` (Hunter) and `scratch/run-mobile-enrichment.ts` (Snov).
- The human prefers simple explanations and is annoyed by jargon, hash dumps and process talk.

## 3. Hard boundaries (unchanged)

- ₹0: no paid upgrades and no paid fallback. Use the human's existing paid credits only with an explicit OK.
- No login, CAPTCHA or gate bypass. The tool never scrapes LinkedIn.
- One account per provider. **No friends' or other people's API keys.** The human offered; root advised against it because it breaks provider terms.
- Keys live only in `.env` and are never printed or read into chat. Present now: `SNOV_USER_ID`, `SNOV_SECRET`, `HUNTER_API_KEY`.
- `.env` `DATABASE_URL` points at **live `outreach_dev`** (old system: 57 drafts, 1312 leads). Never write there. Work targets **C `outreach_real_joboss_c`**: override `DATABASE_URL` in the process env, and never print it.
- Every email requires the human's individual approval of the exact recipient and content. No automatic sending.
- The permission classifier blocks real launches of the guarded V harness from chat; the human runs them from Terminal.

## 4. Providers (facts)

| Provider | State |
|---|---|
| Snov | Free/Trial, 10/50 credits used. The free API returns 402: free API access is "test access", requested via help@snov.io. The web app is still usable by hand. |
| Apollo | The Free plan blocks all people/org APIs (confirmed by screenshot). The web app is usable by hand: names are free, each email reveal costs 1 credit. |
| SalesQL | Human has Basic, which has no API. CSV enrichment needs a person's name plus company, or a LinkedIn URL. |
| Hunter | Single account (university email). Key in `.env`. Last recorded and screenshot balance: 13/50 credits used, 37 left. C2 continuation uses cache only; no provider calls. |

Manual exports go to `scratch/inbox/` and are never pasted into chat. Import them against C, dry run first, then for real: `npm run contacts:import -- --file <csv> --provider <p> --dry-run`. The import refuses off-domain emails. It did not refuse founders in C1.

## 5. Human inputs still pending

- **Resumes:** the human is revising both the iOS and AI versions after a new project, and neither is final.
  - Local: `/Users/aryamanjaiswal/Documents/Resume/resumes/Resume_IOS.pdf` and `Resume_AI.pdf`.
  - Hosted: `https://aryamanj.in/resume/ios.pdf` and `.../ai.pdf` (see `src/apply/resumes/resumes-data.ts`).
  - Drafting needs the final versions plus supported project claims. Do not pick a version or approve one.
- More contacts by hand, if Hunter leaves gaps.

## 6. Chats

| Chat | Role |
|---|---|
| Orchestrator (root) | Reads evidence, writes docs and packets, gives paste blocks for other chats. Never gives a paste block addressed to itself. No app code edits, no Git, no DB writes. |
| Builder / V preparation chat (Sonnet high) | Runs, contacts, drafting. A new one onboards with `docs/JOBOSS-BUILDER-ONBOARDING-LEAN.md`. |
| Old reviewers / old V chats | Retired. |

## 7. Next actions

1. C2 PARTIAL has had its one quick check. Give `JOBOSS-CONTACTS-HUNTER-02.md` to the same builder for cache-only continuation. Earlier-run attribution/preservation is unknown; the counter difference alone is explained by official Hunter docs. When the continuation returns, quick-check zero provider calls, additive contact/evidence/audit rows in C, and live unchanged during that continuation.

   Then tell the human how many of the 20 now have a contact.
2. If there are gaps, offer manual Apollo/Snov web exports into `scratch/inbox/`.
3. Once the resumes are final, write a one-page drafting packet: one chat drafts from stored evidence, and the human approves each draft. Sending stays manual.

Log every step briefly in `docs/JOBOSS-COORDINATION.md`.
