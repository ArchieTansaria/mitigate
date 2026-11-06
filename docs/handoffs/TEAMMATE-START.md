# Teammate handoff — PatchBond current direction

Read first: `AGENTS.md`, `IMPLEMENTATION_PLAN.md`, `TASKS.md`, `STATUS.md`, and `memory/features/02-supplier-funded-remediation-campaign.md`. This note is the current product decision; older maintenance-bond wording in the handbook is superseded for the MVP.

## What we are building
PatchBond verifies each affected customer-owned smart-contract deployment after its owner performs an authorized repair. A supplier funds a capped USDC grant per eligible deployment. Only that deployment's fresh passing receipt can reserve/release its grant. Arc enforces budget, unique claims and bounded challenge/review rules. The verifier and reviewer remain explicit trust assumptions. No maintainer bond, customer fee, penalty or slashing.

Existing Studio project: https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52.

## Your first task (B): PB-01
Use the already-authenticated normal terminal; do not retry `login --paste`. In `~/Documents/patchbond`, run `pnpm exec arc-studio whoami`, `pnpm exec arc-studio apps --json`, and `pnpm exec arc-studio sessions --json`. Determine if the stopped TUI made an app. If needed, create/use the PatchBond workspace through `pnpm exec arc-studio run ... --output json`. Test a harmless `pull --dry-run` artifact round-trip. Capture share URL, session/app IDs, changes and failures in PB-01 evidence. Ask Arc mentors if a Codex-driven Studio CLI session qualifies as building “in Arc Studio,” especially for “without leaving Studio.” Never share credentials. See PB-01 card and `docs/handoffs/PB-01.md`.

## Next work
After PB-00 and joint PB-03 interface freeze, implement PB-07 fixtures: old oracle adapter, repaired adapter, and correct implementation with unsafe configuration; tests must show rejected bad inputs and preserved legitimate behavior. Then proceed to PB-14–20 campaign work in order. Do not start financial contract code against a guessed receipt or campaign ABI.

## Collaboration rules
One owner per task/branch; small reviewable commits with task IDs; no simultaneous edits to shared schema/lockfiles. Record feature-level progress in `memory/features/` and handoff evidence. Never commit keys, tokens, private RPC URLs or unverified deployment claims.
