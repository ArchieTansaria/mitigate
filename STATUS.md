# Orryn / PatchBond status
Updated: 2026-11-07 (Asia/Kolkata). Repository: /Users/aryapathak/Documents/patchbond.

## Implemented
- PB-00/02/03: genuine Codex-driven Arc Studio shared Solidity build/test/pull, matching TS vectors and bounded runtime probes.
- PB-04–06: validated config, durable PostgreSQL documents/jobs, lease/retry fencing, content-verified storage and authenticated diagnostic API.
- PB-07: artificial stale-price oracle family, original/repaired/unsafe fixtures and mined local provenance.
- PB-08: confirmed canonical-snapshot inspection of actual application routing, exact supported bytecode/admin recognition, separate authority/configuration explanations.
- PB-09: original observed bytecode/state replayed in a networkless bounded container; independent fresh/stale scenarios; exact error checks; approved-source/compiled-harness consistency.
- PB-10: complete ordered diagnostic evidence, scope/snapshot/coverage validation, dedicated host-side verifier signing and independent signature/freshness verification.
- PB-11: separate executable API/worker, real queue-to-evidence flow, crash recovery, cancellation, completion deadline enforcement and standalone offline replay. A completed job can report failed or unknown repair checks.
- PB-12: private unsigned repair proposals/revalidation, known-family layout/source checks, supplier/customer authority separation, real snapshot/current-state simulation and owner-executed local repair followed by a fresh diagnostic. No automatic execution or payout.
- PB-13 ENS work was retired from active scope on 2026-11-07; the existing local code and tests are historical and are not being integrated or deployed.
- CRE capability gate: actual WASM CLI simulation verifies shared EIP-712 fixtures, HTTP and finalized Sepolia reads. This is not the PB-21 product workflow or DON deployment.
- PB-21 local workflow slice: fail-closed campaign evidence evaluator, CRE project manifests, CLI WASM compilation, deterministic JSON validation and six unit cases. Studio compilation and scoped tests also pass. Campaign-claim evidence production, a valid real config, end-to-end simulation, receipt issuance and delivery remain blocked; see `docs/handoffs/PB-21.md`.
- PB-29 (`f1dece3`): standalone Orynn public landing page in `apps/web`, converted from the provided Stitch export with Next.js App Router and Tailwind CSS 4. It is read-only, has no wallet prompt, and labels the CRE-to-Arc acceptance integration as not live. It is deployable to Vercel from `apps/web`; not deployed yet. See `docs/handoffs/PB-29.md`.

- PB-25/26 local frontend: Orryn workspace, authenticated diagnostic onboarding/evidence/public reports, owner repair controls and configured campaign contract console implemented. See PB-25/PB-26 handoffs; live wallet/worker/settlement validation and Studio frontend integration remain open.

## Parallel owners and next work
A: PB-12 local repair flow and PB-21 fail-closed CRE workflow compile in Studio; receipt integration remains gated on campaign-claim evidence production. PB-22 is blocked pending reviewed PB-15–20 ABI exports and a deployment manifest with start blocks. PB-23 API/worker/storage/RPC outage tests pass; chain reorg/CRE/CCIP coverage remains gated by PB-21/22. PB-24 campaign handoff and two-machine replay remain blocked. B: PB-14–19 contracts and PB-20 sender/receiver pass local and Studio contract suites. PB-20 deployment templates exist, but executable deployment, actual campaign terms and live Arc testnet CCIP route remain outstanding. No live campaign deployment, payout/refund or CCIP delivery is claimed.

## Honest limits
The diagnostic pipeline is functional locally for one exact artificial oracle/proxy family. Offline replay recreates recognized view dependencies; it is not a general fork or proof of RPC honesty. Reports bind an observed state and named verifier, not universal security. No participant upgrade key is loaded; diagnostic evidence cannot pay a grant.

Physical second-machine/Linux verification, hosted API/worker/S3/Studio callback, testnet fixtures, live campaign payouts, delivered CCIP acceptance, deployed DON workflow and live frontend-to-settlement integration remain unproven or unfinished. The frontend implementation exists; acceptance gates remain open. A fresh repair integration attempt encountered Docker execution stalls, including simple shell probes; no current end-to-end success is claimed. CRE deploy access is disabled. ENS is out of active scope. GitHub CI last reported an account billing lock; remote CI success is not claimed.

Startup: docs/runbooks/backend-start.md. Repair walkthrough: docs/runbooks/repair.md (`pnpm test:repair`). Replay: docs/runbooks/replay.md. Validation: docs/evidence/pipeline-validation.md. Do not put secrets or generated private artifacts in Git.

## Recording demo (PB-30)
A standalone `/demo` now illustrates repair detection, owner action, fresh recheck and grant accounting with explicit simulated data. It is usable without wallet/API/Docker and does not change the real dashboard. Script: `docs/demo/RECORDING-SCRIPT.md`. This is recording material, not new live integration proof.
