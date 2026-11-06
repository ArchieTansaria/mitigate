# PatchBond: current implementation context
Updated 2026-11-07 (Asia/Kolkata). Implementation baseline: PB-12 feature commit on `main` (see Git log); context correction previously pushed as `74e904c`.

## Product and ownership
PatchBond verifies repairs to registered customer-owned smart-contract deployments. The financial direction is a supplier-funded remediation campaign with a fixed USDC allowance per eligible repaired deployment. No mandatory maintainer bond, customer repair fee, slashing or insurance. A diagnostic report cannot authorize a grant.

A owns the TypeScript API, PostgreSQL queue/storage, verifier, fixtures, CRE integration and eventual UI. B owns PB-14–20 campaign policy/acceptance/USDC/CCIP contracts and their Arc Studio workflow. Read `docs/handoffs/TEAMMATE-START.md` before B starts. Do not rebuild A's completed foundation or edit the other owner's active files.

## Actually implemented and committed
| Tasks | Behavior | Evidence/commit |
|---|---|---|
| PB-00/02/03 | Repo/toolchain, actual Arc Studio shared Solidity build/test/pull, shared encoding vectors, bounded RPC/container probes | Per-task handoffs; `b24b8e4`, `4e3b020` |
| PB-04–06 | Validated config, durable PostgreSQL jobs and immutable artifacts, authenticated diagnostic API | `2715a68`, `39720a8`, `ff3f953` |
| PB-07 | Artificial old/repaired/unsafe-config oracle deployments on fresh local Anvil | `20437ad` |
| CRE capability gate | Actual CRE CLI WASM simulation: EIP-712 verification, HTTP and finalized Sepolia reads | `b40c1ef`; not PB-21 product workflow |
| PB-08 | Confirmed snapshot inspection of actual application route, implementation, configuration and separate owners | `cf97a49` |
| PB-09 | Bounded networkless execution of approved regression tests over captured known EVM state | `9a7257b` |
| PB-10 | Complete scope-bound signed diagnostic evidence; freshness, coverage and signature verification | `38fc51a` |
| PB-11 | Separate API and leased worker, crash recovery/cancellation, actual evidence publication and independent offline replay | `2dbf24e` |
| PB-12 | Private unsigned upgrade/configuration proposals, exact-family compatibility checks, revalidation and owner-executed local repair with fresh evidence | Feature 15; `docs/handoffs/PB-12.md` |
| PB-13 local slice | ENSv2 candidate/approved manifest pointers, canonical content verification, resolver/chain preflight and proposer/approver separation | `integrations/ens/`; `docs/handoffs/PB-13.md`; live role flow/mentor fit still pending |

Completed feature descriptions are in `memory/features/INDEX.md`; feature-note numbers are not PB task numbers. The API now has a working diagnostic worker. Job completion is separate from whether a repair passed.

## What has actually been tested
Current PB-12 validation: `pnpm check` passed (62 TypeScript + 25 shared Solidity tests); `pnpm test:integration` passed (38 tests with PostgreSQL, Anvil, Docker, HTTP and separate API/worker processes); `pnpm vectors:check` passed; `pnpm test:fixtures` passed (20 Solidity tests including fuzzing). See `docs/evidence/repair-validation.md` for scope, two reproduced/fixed review findings and generated local before/after evidence. These are recorded results, not a claim that every future checkout has been tested.

No fixture-address shortcuts or canned pass results: deployment state is read from RPC; actual compiled regression assertions execute in isolated EVMs. The supported artificial proxy/oracle family is deliberately narrow. Captured-state replay is not a proof of RPC honesty or universal contract safety.

## Remaining work and integration gates
1. PB-12 is implemented locally; B upgrade-route boundary review remains pending. `pnpm test:repair` demonstrates actual owner execution and fresh evidence; see `docs/runbooks/repair.md` for generated inspectable artifacts.
2. B PB-14–20: authoritative campaign eligibility/policy, acceptance, funding/claims/challenges/accounting and actual CCIP delivery; do not claim these are implemented here.
3. A: authoritative per-deployment financial receipt producer and PB-21 product CRE workflow, consuming B's interfaces. CRE deploy access is currently disabled; CLI simulation is not a DON deployment.
4. PB-22–24: connected backend campaign flow and failure tests. Demonstrate actual state and balance changes before the backend handoff. Frontend PB-25–26 follows that gate.
5. Physical second-machine run, hosted worker/API, testnet deployments and sponsor demo evidence remain pending. ENS client code is implemented locally; live ENS proof and prize eligibility remain conditional.

## Agent rules and source of truth
Work directly on `main` at the user's explicit request, with meaningful tested commits and pushes. Fetch before pushing; never force-push or overwrite teammate work. Keep one writer per task in separate clones. A branch remaining on GitHub does not mean its work is unmerged.

Before new work read `AGENTS.md`, `STATUS.md`, `TASKS.md`, the assigned section of root `IMPLEMENTATION_PLAN.md`, relevant handoffs and feature notes. Update this context snapshot as well as those files at each meaningful feature completion. Do not leave a bootstrap-era snapshot describing the entire project as unbuilt.

GitHub Actions last reported an account billing lock; local test success is not remote CI success. Startup: `docs/runbooks/backend-start.md`; replay: `docs/runbooks/replay.md`. Never commit credentials, participant wallet keys, private evidence or generated runtime artifacts.
