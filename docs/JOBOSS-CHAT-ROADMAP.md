# Human-run JOBOSS chat roadmap

This orchestration chat provides prompts and reviews human-returned reports. It does not launch agents or edit application code.

**Latest scheduling preference overrides the parallel phases below:** the human has now authorized **R-B inbox/delivery review alongside R-A corrections-02 re-review**, maximum two active reviews. Both are read-only for source/configuration, use separate test databases (R-A: `outreach_test_joboss_ra`; R-B: `outreach_test_joboss_b`) and write separate reports. Builders remain idle until reports are coordinated. Outside this review pair, retain one assignment at a time; fixes return to the original builder chat. C and D remain sequential unless the human explicitly authorizes more parallel work.

**Current checkpoint:** R-A corrections-02 review has returned and the shared foundation is accepted. A/R-A are idle; **R-B is the sole active assignment**. Automatic Codex/Claude execution remains blocked until independently verified isolation and reviewed integration. Wait for R-B's report before launching the next builder; C discovery is the next feature priority after delivery findings are triaged. The table below describes phases, not authorization to start parallel builders now.

| Phase | Chats | Work |
|---|---|---|
| Start now | A Foundation + B Inbox/delivery | Independent shared infrastructure and mail/outcome repairs. Separate files and dedicated test databases. |
| Review | Fresh R-A and R-B | Read-only review each yielded change; returned findings go to its original builder chat. |
| After A accepted | C Discovery + D People/drafts | Independent feature work against the accepted shared contracts. |
| Review | Fresh R-C and R-D | Independent code/output review, then bounded fixes in original builder chats. |
| After A–D accepted | E Integration/preparation | Wire one resumable command, connect review navigation/readiness, update current docs, run integrated checks. |
| After E accepted | V Final verification | Independent preservation, cohort/output/support and completion review. Actual preparation follows reviewed live migrations; no approval/send. |

Start at most two builders simultaneously. A/B can run now; C/D wait for accepted foundation. Independent read-only reviews can overlap a builder in a different subsystem. Reviewers never edit files. Do not run destructive tests in another chat's database. Do not reset shared files or commit another builder's work.

Use fresh chats for each new subsystem and each independent review. Keep targeted fixes in the original builder chat while its context remains focused. Return reports here; do not paste the full chat history. The checked-in assignment packet supplies context.

Current packets: `JOBOSS-WORKER-01-FOUNDATION.md`, `JOBOSS-WORKER-02-DELIVERY.md`, `JOBOSS-WORKER-03-DISCOVERY.md`, `JOBOSS-WORKER-04-RECIPIENTS.md`. Integration/final review prompts are issued after actual reports lock final interfaces; avoid stale speculative prompts.

When a worker pauses on quota, preserve its state and report completed checks/remaining work. Continue with existing access later or another already available provider; no paid fallback. REA global setup is already complete and needs no new builder chat.
