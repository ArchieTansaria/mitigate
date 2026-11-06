# Diagnostic pipeline validation — 2026-11-07 Asia/Kolkata

Base ceecf07; branch feat/pb-verification-pipeline. PB-08 cf97a49, PB-09 9a7257b, PB-10 38fc51a, PB-11 see Git history. This is actual local execution, not a deployed sponsor workflow.

| Command | Observed final result |
|---|---|
| pnpm check | lint/typecheck passed; 55 TS tests across 11 files; 25 shared Solidity tests |
| pnpm test:integration | 37 tests across 11 files passed; real PostgreSQL, Anvil, networkless Docker, separate API/worker processes and HTTP |
| pnpm vectors:check | Frozen PB-03 vectors match |
| pnpm test:fixtures | 20 fixture Solidity tests passed, including 256-run fuzz |

The full diagnostic integration test authenticates with an actual signed wallet challenge, persists scope documents, queues a run, SIGKILLs a worker after claim, starts another worker, recovers the lease, rejects the original token's completion, verifies a real passing signed report, checks private/public access and replays through a separate CLI and fresh container. A second real run has approved code but unsafe decimals: job processing succeeds while signed repair coverage fails and names the responsible customer address.

No deployed address is used as a result switch. Runtime code, storage, snapshot hashes, conditions and EVM behavior are read/executed. Synthetic structural/signature fixtures remain confined to unit tests. The S3 adapter uses the pre-existing local HTTP SDK contract tests, not a hosted bucket.

Fresh independent review found two important issues: stale compiled assertions after test-source changes, and deadline expiry during final artifact readback. Both were reproduced with failing tests and fixed. Compiled harness metadata must match current assertion/helper source hashes; completion checks abort after readback and an absolute deadline in its fenced SQL update. An additional test exercises the database deadline with a non-aborted caller. No migrations or financial receipt schemas were altered.

Other observed regressions: local genesis header/EVM timestamp discrepancy (fixed by explicit mined context and checking EVM time/chain), unsupported replay bytecode, active-process cancellation and market-owner mismatch. Each relevant regression now passes. Test polling initially exceeded the production request budget; integration polling was slowed and given an explicit higher test allowance. Production defaults remain unchanged.

## Limits
- Offline replay materializes only the finite, exact-runtime-recognized view dependencies; it is not a generic fork, Merkle state proof, audit or warranty.
- Signature trusts the named evaluator and its configured RPC. Diagnostics/preview never become financial receipts.
- Fresh container/process replay occurred on the same Mac, not another physical machine or Linux runner.
- No product CRE callback, DON deployment, CCIP acceptance delivery, hosted Studio/verifier callback, actual campaign payment, frontend or production readiness is claimed.
- GitHub CI execution was not established. Local Node type-stripping and optional Foundry cache-write warnings are not failures; all commands listed above exited zero.
