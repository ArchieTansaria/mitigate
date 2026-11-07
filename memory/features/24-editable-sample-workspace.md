# PB-31 — Editable browser sample workspace

## Implemented
- `/demo/workspace`: separate dashboard-style overview, policy/inventory JSON editors, per-deployment conditions, repair/recheck, history/export and campaign ledger.
- Zod validates inputs; version/configuration/fresh-input fields drive results. Repair invalidates old results. Funding freezes policy/inventory. Failed checks and duplicate claims are rejected; reservations, awards, withdrawals and recovery conserve the sample budget.
- Browser-local persistence and reset. No production API, wallet signature, RPC, CRE, CCIP or token transfer. Sample labels remain visible. Downloadable JSON and a recording guide are included; `/dashboard` links to the sample explicitly.

## Validation
- 137 frontend tests passed across 14 files, including 3 sample transition tests.
- Web TypeScript and scoped Biome checks passed.
- `next build --webpack` passed and prerendered `/demo/workspace`.
- Browser: loaded/registered JSON, verified 1/3 pass, repaired Bazaar, verified 2/3 pass, funded 60, rejected Atlas, reserved/awarded/paid Bazaar 20, rejected duplicate, recovered 40; refresh preserved state.

## Limits
This is a presentation model, not new integration evidence. Chain behavior is represented by JSON fields, not EVM execution. No real identity/receipt or payment is created. Full disputes and finality are not modeled. Production backend and live sponsor gates remain open. Hosted availability requires the frontend deployment to pick up this commit.

Guide: docs/demo/WORKSPACE-WALKTHROUGH.md.
