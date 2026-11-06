# Task board
One active writer per task. Exact acceptance cases, paths and commands are in IMPLEMENTATION_PLAN.md. A = project owner + Codex; B = teammate + her agent. Update state only with reproducible evidence and a reviewed commit.

## Immediate split

| Owner | Start now | Then |
|---|---|---|
| A (owner + Codex) | Completed PB-00/PB-02/shared PB-03; close CRE login gate in PB-01 | PB-04–12 including fixtures PB-07; receipt producer; CRE PB-21; conditional ENS PB-13; integration/UI |
| B (teammate + agent) | Read completed PB-03 handoff/vectors; start PB-14 in existing Arc Studio app | PB-15 registry -> PB-16 receipt validator -> PB-17 funding -> PB-18 claims -> PB-19 challenges/accounting -> PB-20 messaging contracts |
| Joint boundary | Share exact ABI/receipt/hash vectors early; no concurrent edits to shared files | Require real evidence and transactions before declaring live integration complete |

B owns the missing prerequisites for PB-17/18. Full backend completion is not a prerequisite for unit-testing contract signatures and accounting. Studio setup is part of starting the build, not a separate audit-only assignment. Read docs/handoffs/TEAMMATE-START.md.

## Full board

| Task | Owner | Scope | State |
|---|---|---|---|
| PB-00 | A | Repository, docs and reproducible toolchain | toolchain/CI/scripts implemented; see PB-00 handoff and foundation evidence |
| PB-01 | B Studio/CCIP; A CRE | Arc Studio CLI / CRE / CCIP feasibility | Studio CLI build/test/pull verified; CRE auth pending; CCIP route read passes, live delivery pending PB-20 |
| PB-02 | A | Historical RPC and worker runtime probe | implemented/tested; live Arc/Sepolia reads and restricted Docker proof recorded |
| PB-03 | A completed shared foundation; B consumes | Shared receipt, campaign eligibility, encoding and ABI freeze | campaign/receipt boundary and cross-language vectors implemented; CRE runtime check pending login |
| PB-04–06 | A | Config, persistence/jobs and authenticated API | planned |
| PB-07 | A | Known-bug fixtures and per-deployment repair test pack | planned after PB-03 |
| PB-08–12 | A | Inspection, execution worker, evidence, replay and repair proposals | planned |
| PB-13 | A | ENS release publication | conditional on demonstrated user value and mentor fit |
| PB-14 | B policy docs; A TS validation | Supplier campaign policy, roles, economics and trust model | READY: consume PB-03 types and vectors; select actual campaign terms |
| PB-15–20 | B contracts; A receipt producer | Eligibility registry, signed receipt, fully funded USDC campaign, independent claims/challenges, CCIP | planned |
| PB-21 | A | CRE workflow for scoped remediation receipt | planned |
| PB-22–24 | Joint | Campaign indexer/API, outage/security tests and backend handoff | planned |
| PB-25–26 | A | Studio-compatible UI for verification and grant claims | gated on PB-24 |
| PB-27–28 | Joint | Deployment audit, demo and submission evidence | gated |
