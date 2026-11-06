# Feature 15: owner repair proposals (PB-12)

Commit: see Git log `feat(actions)` tagged PB-12; base `74e904c`.

Implemented private proposal/revalidation API over actual signed deployed diagnostics. Prepares exact supplier ProxyAdmin upgrade or customer configuration calldata; validates known-family compiler sources/storage layout, approved deployed code, observed authority and pinned/current state. Simulates through real RPC without submitting. Blocks unsupported/manual-review cases, expires stale proposals and rejects tampering. Owner executes externally; a fresh worker run must independently verify repaired behavior. Existing failed evidence stays unchanged.

Files: services/verifier/src/actions/repair.ts; services/api/src/routes/actions.ts; app registration; fixtures compiler storage-layout output; action and full-flow tests. Runbook: docs/runbooks/repair.md. Actual validation: docs/evidence/repair-validation.md. `pnpm test:repair` is the connected local walkthrough, with optional ignored before/after artifact export.

No participant keys in services, generic upgrade support, onchain atomic execution guard, auto-unpause, campaign acceptance or grant payout. Exact artificial family and EOA repair authorities only. B/Studio contracts are untouched; B's boundary review and full sponsor integration remain separate gates.
