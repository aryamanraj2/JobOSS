# Products comparable to JOBOSS

Scope: public first-party product pages and creator documentation, plus one REA browser observation. This is a workflow comparison; matching accuracy, contact correctness, hiring results and private service internals were not tested. No signup, resume upload, mailbox connection, purchase or outreach occurred.

## Direct and close comparisons

| Product | Publicly described workflow | Design inference for JOBOSS |
|---|---|---|
| [Backdoor](https://backdoorai.app/) | Candidate background and preferences → startups triggered by funding, launches or hiring → founder-contact draft → send/edit/skip → reply tracking. | Explain a specific startup/candidate fit and trigger; make the review decision simple. Preserve JOBOSS's manual follow-up rule. |
| [PitchHired](https://pitchhired.com/) | Profile/CV, geography/industry filters, company research, hiring contacts, personalized draft, a second AI critique and Gmail delivery. | Separate writing from checking; expose target filters and the named recipient's responsibility. JOBOSS also requires individual human approval. |
| [AplyNow](https://www.aplynow.com/) | Role matching, hiring manager/recruiter/referral contact map, prepared message and Gmail review/reply workflow. | Present alternative recipient paths and readable fit reasons, rather than a flat contact list. Ranking probability and claimed results remain unverified. |
| [ResuMail](https://resumail.in/) | Resume matching, stack/stage/city/funding filters and named recruiting/engineering referral contacts. | Show funding, technology and recipient categories as separate explainable dimensions. This source was accessible as indexed first-party text; direct web retrieval returned 502. |
| [FIRSTKNOCK](https://www.iamaswinth.dev/work/firstknock) | Creator describes a resume-derived candidate graph and recently funded startup outreach design. | Organize approved project proofs against concrete company needs. Important status: the creator says the matching/email layer is still in development; it is not verified as a complete operational system. |

These pages document what their creators present; demos and marketing claims do not establish reliable results, provenance or lawful source access. JOBOSS source restrictions and approval rules govern independently.

## Open-source reference

[createdbyharsh/OpenOutreach](https://github.com/createdbyharsh/openoutreach) is a B2B lead qualification CLI. Its README describes person-fit reasons, conditional contact enrichment, CSV output and honest partial completion. It is a useful reference for qualification and checkpoint behavior, rather than a confirmed complete job-seeker replacement. Address enrichment uses a paid provider; it is not a mandatory dependency under JOBOSS's ₹0 spending rule. No source code was installed or executed; no license-compliance assessment was performed for code reuse.

## Actual REA observation

REA launched an owned temporary headless Chrome profile, navigated to AplyNow's public homepage, waited one second, and captured DOM/accessibility plus network metadata. Browser cleanup returned `terminated-owned-process`. The captured page exposes matched-role, hiring-contact/referral, message-review and reply stages. It also presents manual sending in the starter tier and automated outreach in higher tiers; those public descriptions do not resolve exact authenticated approval behavior.

Evidence: `ev_8593c2ea1b4c5aeb8a481455c7557231ec9fa4b7c761f1fea8282993bff714f9`. Full record: `scratch/joboss-product-research/aplynow-rea-evidence.json`. DOM and accessibility were captured. Overall capture completeness is incomplete because some network requests remained pending; no request/response bodies or header values were requested. No private matching implementation, database or contact-provider quality was observed. Two initial input-validation failures caused no target action; corrected documented action fields enabled the capture.

## Implications for upcoming assignments

C should rank meaningful startup triggers and explain fit; D should show ranked recipient categories, connect relevant approved project proofs and keep independent semantic review. E should expose a concise company → person → evidence → draft decision sequence with checkpoint state. These are design inferences from the surveyed public flows, not authority to relax source rules, infer addresses, buy services or enable automated sending.

Deeper product testing and OSS implementation inspection remain open. R-A foundation review continues independently; no additional builder/reviewer chat was launched by this survey.
