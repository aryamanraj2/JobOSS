# Full-list 07 — ranks 61–70

23 October 2026. **Ten named contacts added to C; zero generic imports.** C now has **60 contacts**. Dry run accepted all ten without writes; real import added all ten, zero duplicates/refusals. Five match primary full-name/role evidence and five remain provider-only. All 245 rows and 156 prior CSV columns are unchanged; 28 pass07 columns are appended.

| Company | Imported people |
|---|---|
| CVector | Richard Zhang, cofounder/CEO; Tyler Ruggles, cofounder/CTO — primary-supported |
| Hestus | Sohrab Haghighat, CEO; Kevin Chu, CTO — primary-supported |
| Pond AI | Lightman Miao, software engineer — provider-only |
| Linkup | Phil Mizrahi, CEO; Denis Charrier, CTO — provider-only |
| Propel Labs | Woody de Kafou, founder/CEO — primary-supported; published DeKafou spelling corroborates provider variant |
| RINSE | Ajay Prakash, CEO — provider full surname; primary image caption gives Ajay only |
| malibou | Théo Dollé, software engineer — provider-only, email unverified |
| La Fraise / Neywa / Marble | No import: empty provider results and no supported full name for a finder |

**Nine exact Hunter `valid` flags; one unverified row.** CVector’s two `valid` verdicts coexist with domain `accept_all=true`; that concern is retained without changing the existing importer rule. No separate verification occurred. Provider-generated addresses, verdict dates and primary identity evidence remain distinct; no identity-verification timestamp was set. The CLI’s blanket unverified footer is stale; stored flags were checked against inputs.

**Research:** five full names at CVector/Hestus/Propel and two separate Rinse partial records, James (cofounder/COO) and Ajay (CEO caption). Neither primary record supplies a surname. Other named Rinse results lacked suitable roles; malibou testimonials/payroll/sales roles were excluded. Pond’s unnamed mailbox was not turned into a guessed second person. No new first-party personal email appeared; Propel’s hello inbox adds zero people.

| Deduplicated coverage basis | Companies | Zero | One | Two-plus |
|---|---:|---:|---:|---:|
| Primary full names, this pass | 10 | 7 | 1 | 2 |
| Primary full names, cumulative assessed | 57 | 42 | 2 | 13 |
| Primary plus provider candidates, this pass | 10 | 3 | 4 | 3 |
| Primary plus provider candidates, cumulative assessed | 57 | 34 | 5 | 18 |

Cumulative: **30 primary full names, 13 partial primary records, 48 combined primary/provider candidates**. Partial records never add people to full-name counts, including when a provider supplies a surname. One cumulative personal email was published in reviewed first-party text; 29 primary people lack such publication. Provider emails are a separate layer. Earlier gaps and stopped navigation were retained without out-of-scope fetching/enrichment.

**Usage:** **16/20 content starts; 40/50 website HTTP** (21 content, 19 robots hops). Twelve pages stored, three unreadable homepages and one robots refusal (Neywa). Six genuine second links retained their original authorization; no workaround/retry or guessed path. One normal robots 404, zero content 404s/injection results. All 40 request/response/fetch-audit records reconcile; routine careers signals prove no vacancy.

Hunter Free: **19 → 10 remaining**, **31 → 40 used / 50**, nine actual credits. **15 Hunter HTTP** = three account reads, ten domain searches, two finders; **12/14 lookup ceiling**, no pagination/separate verification, three-credit reserve preserved. Snov OAuth/balance: **two calls**, balance **40**, zero new debit; known blocked lookup endpoints were not retried, ten-credit reserve/original forty-credit ceiling retained. Only Hunter/Snov were configured. **17 provider HTTP; ₹0**, no new keys/integration or paid fallback.

**C preservation:** exact C identity was confirmed in read-only transactions; live was never opened. All **34 tables / 367 protected hashes** passed. Original business/contact rows and old append-only records remain intact; intended research bookkeeping is attributed below.

| C table | Before → after | Addition |
|---|---|---:|
| Contact | 50 → 60 | 10 |
| Evidence | 2,287 → 2,314 | 17 page + ten import records |
| CompanySignal | 375 → 387 | 12 |
| AuditLog | 1,268 → 1,336 | 57 research/fetch + 11 import |
| RobotsCache | 99 → 115 | 16; no existing refresh |

Ten existing budget rows recorded **+21 global / +21 mirrored company units**. Global usage **571/1,009**, leaving **438**. No envelope creation, cap/policy change, reset, refund, paid/vendor increment or old-contact update. All 13 exclusions, four holds/skips, 21 sent exclusions and frozen S2 artifacts remain preserved.

**Read-only draft-candidate summary — new pass05–07 imports only:** 36 contact rows across 23 companies. After applying saved sent/person exclusions and current C hold/eligibility checks, **zero pool rows needed exclusion**; the 21 earlier sent addresses remain excluded from any repeat outreach. Named pool: **33 people**, with three generic inboxes separate.

| Review group | Rows | Provider `valid` | Unverified |
|---|---:|---:|---:|
| Primary full-name/role support | 15 | 13 | 2 |
| Provider-only full identity/role review | 18 | 16 | 2 |
| Generic inboxes, zero people | 3 | 0 | 3 |

The two primary-supported unverified routes are Jake Barwell and Antti Mauno; provider-only Steve Perkins and Théo Dollé also lack valid verdicts. **Fourteen pool rows carry catch-all domain flags, including 13 with `valid` verdicts.** Full concerns and provenance are in `scratch/joboss-full-list-07/JOBOSS-FULL-LIST-07-DRAFT-CANDIDATES.csv`, inside the existing ignored scratch directory. This saved-evidence summary made zero external calls and created no email content, drafts, approvals or approved-recipient list. Provider validity does not establish independent identity or sending permission.

**Proposed only:** the nine baseline-eligible companies in ranks 71–80, excluding rank75 Chronograph’s vendor root without remapping/backfill: max18 starts/45 website HTTP, same provider/additive C-import flow. Recheck provider headroom; the current three-credit reserve leaves at most seven lookups, below the inherited14 ceiling. Separately hand the summary to human draft-selection/evidence review: primary-supported group first, resolve validity/catch-all concerns and provider-only identities before later drafting. Any eventual email needs fresh exact approval. Neither next pass nor draft creation was executed. No app/guard/schema edits, Git, agents/chats, sends or automation occurred. Captures/ledgers/receipts/preservation remain under `scratch/joboss-full-list-07/`.
