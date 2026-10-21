# Full-list coverage — saved-evidence inventory

21 October 2026. **245 companies retained. Current C coverage is unknown.** This task used the packet's saved-file fallback. No DB connection was attempted under the no-external-call boundary, so database identity/read-only transaction checks were not freshly performed. The saved C snapshot records `outreach_real_joboss_c`, `readonly=on`, at **2026-10-20T18:23:04.329Z**. These are historical observations.

The CSV preserves 232 baseline-eligible and 13 excluded companies, plus Firebender's skip and the GloGlo / ion design / Keystroke holds. That leaves 228 eligible companies without a hold/skip. IDs/domains match the two saved full catalogs; no saved additions were found. Current additions/status changes remain unknown. The later saved name **Dime** differs from baseline **DimeHealth** and is shown separately. No merges or re-ranking occurred.

| Population | Zero saved provisional people | One | Two-plus | Current counts |
|---|---:|---:|---:|---|
| All 245 | 237 | 7 | 1 | Unknown for all 245 |
| Baseline eligible: 232 | 224 | 7 | 1 | Unknown |
| Eligible without hold/skip: 228 | 220 | 7 | 1 | Unknown |

**Definition:** provisional usable coverage counts named, role-relevant, own-domain contact records in the latest saved C contact details. Affiliation is still unverified; this is neither independently confirmed coverage nor permission to send. Zero means no qualifying saved contact evidence under this definition, not an observed current absence. Cache-only leads and unresolved manual identities stay separate. The old catalog's zero-contact export is not used as current coverage.

Saved C has **24 contact rows across 19 companies: nine provisional people, six generic inboxes, nine unresolved manual contact records**. Duckie has Joel Ritossa and Valerie Li. Andon Labs, Baud, Clarion, Conduit, DryMerge, Ellipsis and Momentic each have one. None of the 24 has an independent identity-verification timestamp. The historical gap is **455 people** across eligible companies, or **447** excluding the four held/skipped companies; neither is a fresh DB gap.

Remaining evidence work:

- **21 sent addresses across 16 companies** exactly reconcile with saved receipts: 22 dispatches, including Peter's two historical dispatches. Every address remains excluded from repeat outreach. Sent status proves neither affiliation nor delivery.
- **64 uncertain candidate records collapse to 63 groups.** Lukas Petersson's two cached addresses count as one candidate. Five cached-only, role-relevant own-domain addresses are retained for Lukas, Marcelo Chaman, Joe Kimlinger, Nicole Sgarlato and Zach Bellay. No candidate was imported or promoted based on a provider-valid flag. Hunter-generated addresses retain that provenance.
- Aidy's two founders are supported by saved own-site excerpts, but `aidygrants.com` remains unresolved. Driver's `driverai.com` links, Cora/Gumloop personal-email affiliations and Dime's missing supplied names require review. Two Dime mailboxes do not prove two distinct people. Conduit's two held Gmail alternatives remain outside saved C. Exact-pair exceptions stay unverified and authorize no new pairs.
- Own-site material exists for **17 companies**. It is missing from the inventoried evidence for **228 total / 215 eligible / 212 eligible without hold/skip**. Provider URL pointers and directory feeds are not captured own-site evidence. GloGlo's old gummies pointer conflicts with saved diabetes-company material; preserve its hold. Some repeated evidence IDs carry different saved observation times; both observations are retained, with no freshness claim.

## Proposed next research pass — not executed, ₹0

Use the **same builder** and existing tools for a bounded **20-company** pass, preserving baseline order within each group:

1. Reuse caches and resolve identities for Aidy, Andon Labs, Baud, Clarion, Conduit, Cora, DimeHealth, Driver, Gumloop and Momentic. Start with the five existing cached addresses and named prospects. Seek primary affiliation evidence before any additional address lookup.
2. Begin the remaining catalog with ranks 21–30: Monumint, MSPilot, Navier AI, nCompass Technologies, Nuanced, Paradigm, Poka Labs, Precip, Raindrop and Respan.

After separate research authorization, use public own-site about/team/careers pages, at most two new pages per company (**40 maximum**), and human-provided manual exports. Stop once two distinct suitable people have adequate evidence; keep missing emails/statuses explicit. Check current free entitlements before considering any provider use; recorded balances are stale. No paid fallback or provider calls are included in this proposed pass. Return evidence and an updated coverage sheet; no imports, approvals, drafts or sends. Keep all exclusions/holds, the completed S2 queue, receipts and frozen payloads intact.

Supporting evidence: `scratch/joboss-full-list-01/` contains bounded candidate/own-site records, source hashes, receipt reconciliation and validation. All hashed inputs were checked unchanged after output generation. No external/provider/model calls, DB access, contact imports, app changes, sends or automation occurred. One read-only Git status check ran before the no-Git rule was read; no Git mutation or later Git use occurred.
