# Task board
One active writer per task. Exact acceptance cases, paths and commands are in IMPLEMENTATION_PLAN.md. A = project owner + Codex; B = teammate + her agent. Update state only with reproducible evidence and a reviewed commit.

## Immediate split

| Owner | Start now | Then |
|---|---|---|
| A (owner + Codex) | PB-04–12 verifier/API; PB-21 local evaluator slice | PB-21 receipt boundary and runtime checks; PB-22 indexer/API; PB-23 outages/security; PB-24 backend handoff; then UI |
| B (teammate + agent) | Read completed PB-03 handoff/vectors; start PB-14 in existing Arc Studio app | PB-15 registry -> PB-16 receipt validator -> PB-17 funding -> PB-18 claims -> PB-19 challenges/accounting -> PB-20 messaging contracts |
| Joint boundary | Share exact ABI/receipt/hash vectors early; no concurrent edits to shared files | Require real evidence and transactions before declaring live integration complete |

B owns the missing prerequisites for PB-17/18. Full backend completion is not a prerequisite for unit-testing contract signatures and accounting. Studio setup is part of starting the build, not a separate audit-only assignment. Read docs/handoffs/TEAMMATE-START.md.

## Full board

| Task | Owner | Scope | State |
|---|---|---|---|
| PB-00 | A | Repository, docs and reproducible toolchain | toolchain/CI/scripts implemented; see PB-00 handoff and foundation evidence |
| PB-01 | B Studio/CCIP; A CRE | Arc Studio CLI / CRE / CCIP feasibility | Studio build/test/pull and CRE capability simulation verified; live CCIP delivery pending PB-20 |
| PB-02 | A | Historical RPC and worker runtime probe | implemented/tested; live Arc/Sepolia reads and restricted Docker proof recorded |
| PB-03 | A completed shared foundation; B consumes | Shared receipt, campaign eligibility, encoding and ABI freeze | campaign/receipt boundary and vectors implemented; EIP-712 verified in actual CRE WASM simulation |
| PB-04–06 | A | Config, persistence/jobs and authenticated API | implemented/tested; consumer now connected by PB-11 |
| PB-07 | A | Known-bug fixtures and per-deployment repair test pack | implemented/tested on fresh local Anvil; no external-chain deployment |
| PB-08–11 | A | Actual inspection, isolated execution, signed diagnostic evidence, leased worker and replay | implemented/tested locally; physical second-machine proof and hosted integration pending |
| PB-12 | A | Unsigned owner-executed repair proposals | implemented/tested locally; independent code review; B upgrade-route boundary review remains pending |
| PB-13 | A | ENS release publication | retired by owner decision 2026-11-07; existing code/evidence are historical and no live integration is planned |
| PB-14 | B policy docs; A TS validation | Supplier campaign policy, roles, economics and trust model | READY: consume PB-03 types and vectors; select actual campaign terms |
| PB-15–19 | B contracts; A receipt producer | Eligibility registry, signed receipt, fully funded USDC campaign, independent claims/challenges | local contracts and focused tests implemented; live deployment/payout evidence pending |
| PB-20 | B contracts; A receipt producer | Authenticated CCIP report delivery to Arc campaign | local and Studio contract suites pass; testnet config/runbook template prepared; deploy script, actual campaign terms and live route remain pending; see docs/handoffs/PB-20.md |
| PB-21 | A | CRE workflow for scoped remediation receipt | fail-closed CRE workflow compiles locally/in Studio; 6 tests pass; campaign-claim evidence production, truthful simulation inputs, receipt issuance and delivery remain pending; see docs/handoffs/PB-21.md |
| PB-22 | A | Chain indexer and campaign API views | blocked pending generated PB-15–20 ABI exports and deployment manifest with start blocks; see docs/handoffs/PB-22.md |
| PB-23 | Joint | Outage/security tests | API/worker/storage/RPC outage slice passes; CRE/CCIP, reorg and two-machine cases remain gated by PB-21/22; see docs/handoffs/PB-23.md |
| PB-24 | Joint | Backend handoff | blocked until PB-21 claim receipt/delivery, PB-22 chain-derived API, PB-20 Studio/live evidence and two-machine replay are available; no live end-to-end claim is claimed; see docs/handoffs/PB-24.md |
| PB-25–26 | A | Orryn verification, owner repair and campaign console | local frontend implemented at user request; real API/RPC adapters and tests; live PB-24/Studio/settlement gates open; see PB-25/PB-26 handoffs |
| PB-27–28 | Joint | Deployment audit, demo and submission evidence | gated |
| PB-29 | A | Orynn public landing page, independent of campaign console | implemented, committed and pushed (`f1dece3`); read-only Next.js/Tailwind page; no wallet or live campaign functionality; see docs/handoffs/PB-29.md |

PB-30: isolated `/demo` recording walkthrough and timed script implemented. Simulated checks and ledger, no live transactions. See `docs/handoffs/PB-30.md`.
