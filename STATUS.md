# PatchBond status
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

## Parallel owners and next work
A: PB-12 local repair flow and PB-21 fail-closed CRE workflow slice are implemented and compile in Studio; receipt integration remains gated on campaign-claim evidence production and delivery integration. B: PB-14–19 contracts and PB-20 sender/receiver are locally and Studio tested. PB-20 deployment configuration/runbook templates are prepared, but the executable deploy script, actual campaign terms, and live Arc testnet CCIP route remain outstanding. No live campaign deployment, payout/refund or CCIP delivery is claimed.

## Honest limits
The diagnostic pipeline is functional locally for one exact artificial oracle/proxy family. Offline replay recreates recognized view dependencies; it is not a general fork or proof of RPC honesty. Reports bind an observed state and named verifier, not universal security. No participant upgrade key is loaded; diagnostic evidence cannot pay a grant.

Physical second-machine/Linux verification, hosted API/worker/S3/Studio callback, testnet fixtures, live campaign payouts, delivered CCIP acceptance, deployed DON workflow and frontend remain unproven or unfinished. CRE deploy access is disabled. ENS is out of active scope. GitHub CI last reported an account billing lock; remote CI success is not claimed.

Startup: docs/runbooks/backend-start.md. Repair walkthrough: docs/runbooks/repair.md (`pnpm test:repair`). Replay: docs/runbooks/replay.md. Validation: docs/evidence/pipeline-validation.md. Do not put secrets or generated private artifacts in Git.
