# Backend batch validation — 2026-11-07 Asia/Kolkata

Base: main at 730ebe6. Feature commits: PB-04 2715a68, PB-05 39720a8, PB-06 ff3f953, PB-07 20437ad, CRE probe b40c1ef. Work branch: feat/pb-backend-core. Configuration's first feature commit: 2715a68. Final commit hashes are available in Git history.

| Command | Observed result |
|---|---|
| pnpm check | Clean lint/typecheck, 39 TypeScript tests, 25 shared Solidity tests passed |
| pnpm test:integration | 25 tests passed across 8 files; actual local PostgreSQL, Anvil, Docker and HTTP |
| pnpm vectors:check | Frozen shared vectors unchanged and matching |
| pnpm test:fixtures | 20 Solidity fixture tests passed, including 256-run fuzz test |
| pnpm test:fixtures:deploy | 2 tests passed; fresh local chain, mined receipts/code hashes, invalid remote inputs rejected |
| workflows/cre-probe: bun run typecheck; bun test | Both typechecks and 6 host tests passed |
| CRE CLI simulation | All-mode WASM probe passed; two deliberate tampered-signature simulations failed as expected; details in cre-probe.json |

The S3 adapter tests use the real AWS SDK against a local HTTP fixture, not a hosted cloud bucket. The contract-wallet test deploys an actual EIP-1271 test wallet on Anvil. A separate API process checks network identities/migrations and serves real HTTP health/OpenAPI; it terminates while an incomplete upload is connected. Dummy/private test data is explicitly labelled and never produces a product verdict.

Independent review found five issues. Each was reproduced before its fix: unfinished uploads blocking shutdown; shared proxy rate buckets; unpruned expired rows; leaked partial files on failed fsync; and stale failure codes after successful retries. Regression tests now pass. Global admission (maximum 1,000/minute, before per-IP record allocation) and cleanup of 1,000/table every 30 seconds bound normal transient-record growth; monitor failed cleanup/backlog in hosting.

Migration 001 was edited only before its first release, against disposable test databases. There was no pre-existing persistent user database. From this release onward, add new migrations; checksum mismatch deliberately fails startup if old migration content changes.

No live grant/campaign, CCIP delivery, DON deployment, external fixture deployment, production repair execution, hosted verifier callback or frontend is claimed. CRE signature compatibility is proven only for this recorded SDK/runtime/EOA fixture. A cryptographically valid fixture is not a fresh, eligible repair receipt. PB-08–12 and PB-21 product integration remain.

Local checks do not establish remote CI success. Prior GitHub Actions runs were stopped before execution by an account billing lock. Harmless local warnings: Node 24.1 type-stripping notice and denied optional Foundry signature-cache writes; all stated commands exited successfully. A second-machine or Linux run was not performed in this batch.

`pnpm install --frozen-lockfile` also exited successfully after the dependency/workspace changes. The CRE probe remains isolated under Bun; no hidden workspace install is required.
