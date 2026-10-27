# JOBOSS-YC-FOUNDERS-01 report

27 October 2026. Complete (not partial). ₹0. No drafts, sends, Gmail, approvals, Git, or app/schema edits.

## Result
- Catalog 245 → 99 match YC domains → **70 companies in scope** (eligible, no hold/skip, not contacted, ycombinator.com page fetched OK for all 70, one GET each at ~1/s).
- **128 founders found; 122 are first two per company (CEO, CTO, others); 6 extras listed only in founders.csv.**
- Tiers for the 122: {'catchall_guess': 54, 'mailbox_ok': 43, 'github': 8, 'no_candidate': 7, 'hunter': 7, 'confirmed': 3}.
- **Imported to C `outreach_real_joboss_c`: 113 additive contacts** (60 → 173), all `verified=false`, `email_status` blank, `source_url` = YC page, tier + evidence in `notes`, provider `yc-founder-<tier>`. Not imported: 2 already in C (Hestus Sohrab, Kevin), 7 `no_candidate` holds.
- Dry run first: 113 imported, 0 refused/duplicate. Real run matched.
- **Preservation:** 34 tables compared before/after; 0 existing rows modified or deleted. Only additions: contact +113, evidence +113, audit_log +118. Live `outreach_dev` never opened; URL not printed.

## Method notes
- **Port 25 worked** (aspmx.l.google.com reachable). Almost all domains are Google Workspace. Never sent DATA; ≥5 s between sessions.
- Cache step found 3 exact addresses (Hestus ×2 already in C; Malibou Maxence).
- SMTP: 41 first-pass `mailbox_ok` + 67 `catch_all`; a rerun of 3 domains with transient lookup/conn errors (malibou, zaymo, yondu) settled 3 more. Yondu's MX closed the connection both times (unknown).
- GitHub commit search: 255 queries (10/min), 9 hits (8 imported; Daniel Jones at Zaymo upgraded to `mailbox_ok` by the rerun).
- **Hunter: 7 finder calls, 7 results (all score 78–84).** Balance **10 → 3 remaining** (reserve kept). Used on 2 unknown (Yondu) then 5 catch-all CEOs (smallest teams first). Hunter scores are not verification. No Snov.
- Remaining 54 catch-all founders imported as `catchall_guess` (`first@`). Treat as unverified guesses; do not count as confirmed.

## Holds (not imported)
- Raindrop / Zubin Koticha: no_candidate
- Stoke Space / Andy Lapsa: no_candidate
- Stoke Space / Tom Feldman: no_candidate
- jo / Kevin Li: no_candidate
- Basalt / Maximillian Bhatti: no_candidate
- Carousel Technologies / Daniel Wolf: no_candidate
- Carousel Technologies / Jude Rizzo: no_candidate

## Extra founders (not imported)
- Raindrop: Ben Hylak (Founder)
- Ubicloud: Ozgun Erdogan (Founder)
- Metal: Sergio Prada (Founder)
- Fractal Labs: Jason Cai (Founder)
- Greptile: Vaishant Kameswaran (Founder)
- Opencall: Arthur Silverstein (Founder)

## team_size per company (YC page)
| Company | Domain | team_size |
|---|---|---|
| Stoke Space | stokespace.com | 305 |
| Airbyte | airbyte.com | 90 |
| Rootly | rootly.com | 75 |
| autone | autone.io | 70 |
| Embrace | embrace.io | 62 |
| FurtherAI | furtherai.com | 36 |
| Greenboard | greenboard.com | 35 |
| Greptile | greptile.com | 35 |
| PointOne | pointone.com | 35 |
| Garage | shopgarage.com | 35 |
| Trellis AI | runtrellis.com | 34 |
| Spade | spade.com | 30 |
| Alex | alex.com | 30 |
| Reducto | reducto.ai | 30 |
| CodeAnt AI | codeant.ai | 25 |
| OffDeal | offdeal.io | 25 |
| Open | open.cx | 21 |
| Respan | respan.ai | 20 |
| Tamarind Bio | tamarind.bio | 20 |
| Zaymo | zaymo.com | 18 |
| Metal | metal.ai | 17 |
| Arini | arini.ai | 17 |
| Ubicloud | ubicloud.com | 15 |
| ProSights | prosights.co | 14 |
| Monumint | monumint.com | 10 |
| Thunder Compute (YC S24) | thundercompute.com | 10 |
| Basalt | basalt.space | 10 |
| Raindrop | raindrop.ai | 9 |
| ego | egoai.com | 9 |
| ROE | getroe.ai | 9 |
| Centralize | usecentralize.com | 9 |
| Paradigm | paradigmai.com | 8 |
| Argil | argil.ai | 8 |
| Pivot Robotics | pivotrobotics.com | 8 |
| Navier AI | navier.ai | 7 |
| GovernGPT | governgpt.com | 7 |
| Opencall | opencall.ai | 7 |
| Sonia | soniahealth.com | 7 |
| Tuesday Labs | tuesdaylabs.com | 7 |
| Yondu | yondu.ai | 7 |
| Poka Labs | pokalabs.com | 5 |
| Upsolve AI | upsolve.ai | 5 |
| Carma | joincarma.com | 5 |
| Meticulate | meticulate.ai | 5 |
| Shiboleth | shiboleth.ai | 5 |
| Andy AI | with-andy.com | 5 |
| Yenmo | yenmo.in | 5 |
| Fractal Labs | fractal-labs.gg | 4 |
| Newton | joinnewton.com | 4 |
| Relari | relari.ai | 4 |
| Carousel Technologies | usecarousel.com | 4 |
| MSPilot | mspilot.io | 3 |
| nCompass Technologies | ncompass.tech | 3 |
| Precip | precip.ai | 3 |
| Wavelength | wavelength.cx | 3 |
| Hestus | hestus.co | 3 |
| Scout | cpgscout.ai | 3 |
| Goldbridge | goldbridgebanking.com | 3 |
| Happenstance | happenstance.ai | 3 |
| Menza | menza.ai | 3 |
| Tekton Dynamics | tekton-dynamics.com | 3 |
| Nuanced | nuanced.dev | 2 |
| Saga AI | usesaga.ai | 2 |
| malibou | malibou.com | 2 |
| Agentic Labs | agenticlabs.com | 2 |
| Argon AI, Inc. | argon-ai.com | 2 |
| jo | askjo.ai | 2 |
| Leaping | leaping.io | 2 |
| Maia | ourmaia.com | 2 |
| Pretzel AI | withpretzel.com | 2 |

Larger teams (e.g. Stoke Space 305, Airbyte 90, Rootly 75, Autone 70, Embrace 62) likely have non-founder employees for the later Hunter/Apollo/SalesQL pass.

## Files
`scratch/joboss-yc-founders-01/`: founders.csv, smtp-results.json (raw reply codes), smtp-rerun.json, github-results.json, hunter-results.json, import-*.csv, dry-/real- logs and reports, before/after-state.json.
