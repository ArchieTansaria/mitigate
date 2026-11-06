# Feature 03 — Arc Studio CCIP receiver prototype

Status: **generated in Arc Studio; not yet pulled into the repo, independently reviewed, or live-deployed.**

## Project
Studio project: https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52

Files visible in Studio include `contracts/PatchBondReceiver.sol`, `contracts/test/PatchBondReceiver.t.sol`, and `docs/pb-01-ccip-feasibility.md`. The prototype is intended to record `(reportId, evidenceHash)` only after checking the CCIP router, source selector and trusted sender. The report says tokens/malformed data/duplicate report IDs are rejected and the source/router/sender values are configurable.

## Verification status
Studio reports 39 Foundry tests passed (including fuzz tests) and `bun run check` passed. The Studio run banner also says “with errors,” so inspect the full output and independently rerun tests after a selective CLI pull before relying on these results. Tests use a fake router. No contracts were deployed, no message was sent, and no destination state change is evidenced.

## Next
Teammate B owns PB-01: inspect this existing app (do not create a duplicate), capture session and artifact provenance, pull only receiver/test/report files to scratch after dry-run, audit and rerun them, then integrate the final receipt shape only after PB-03 freezes the shared campaign receipt schema. Keep `.env` and secrets excluded.

This prototype is a useful Arc/CCIP starting component, not the remediation-campaign product and not proof of bounty qualification. The grant campaign architecture in Feature 02 remains the current product direction.
