# Task board
One active writer per task. Exact acceptance cases, paths and commands are in IMPLEMENTATION_PLAN.md. A = project owner + Codex; B = teammate + her agent. Update state only with reproducible evidence and a reviewed commit.

## Immediate split

| Owner | Start now | Then |
|---|---|---|
| A (owner + Codex) | PB-00/PB-02; TypeScript half of PB-03 using B's Solidity vectors | PB-04–12 including fixtures PB-07; receipt producer; CRE PB-21; conditional ENS PB-13; integration/UI |
| B (teammate + agent) | Existing Arc Studio access/setup; PB-03 Solidity types/vectors, then campaign policy PB-14 | PB-15 registry -> PB-16 receipt validator -> PB-17 funding -> PB-18 claims -> PB-19 challenges/accounting -> PB-20 messaging contracts |
| Joint boundary | Share exact ABI/receipt/hash vectors early; no concurrent edits to shared files | Require real evidence and transactions before declaring live integration complete |

B owns the missing prerequisites for PB-17/18. Full backend completion is not a prerequisite for unit-testing contract signatures and accounting. Studio setup is part of starting the build, not a separate audit-only assignment. Read docs/handoffs/TEAMMATE-START.md.

## Full board

| Task | Owner | Scope | State |
|---|---|---|---|
| PB-00 | A | Repository, docs and reproducible toolchain | docs/context done; CI, scripts, Foundry pin and fresh-clone checks remain |
| PB-01 | B Studio/CCIP; A CRE | Arc Studio CLI / CRE / CCIP feasibility | Studio app confirmed in browser; CLI listing/session, artifact pull and live tests outstanding |
| PB-02 | A | Historical RPC and worker runtime probe | planned |
| PB-03 | B Solidity; A TypeScript | Shared receipt, campaign eligibility, encoding and ABI freeze | planned |
| PB-04–06 | A | Config, persistence/jobs and authenticated API | planned |
| PB-07 | A | Known-bug fixtures and per-deployment repair test pack | planned after PB-03 |
| PB-08–12 | A | Inspection, execution worker, evidence, replay and repair proposals | planned |
| PB-13 | A | ENS release publication | conditional on demonstrated user value and mentor fit |
| PB-14 | B policy docs; A TS validation | Supplier campaign policy, roles, economics and trust model | planned |
| PB-15–20 | B contracts; A receipt producer | Eligibility registry, signed receipt, fully funded USDC campaign, independent claims/challenges, CCIP | planned |
| PB-21 | A | CRE workflow for scoped remediation receipt | planned |
| PB-22–24 | Joint | Campaign indexer/API, outage/security tests and backend handoff | planned |
| PB-25–26 | A | Studio-compatible UI for verification and grant claims | gated on PB-24 |
| PB-27–28 | Joint | Deployment audit, demo and submission evidence | gated |
