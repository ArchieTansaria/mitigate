# Backend startup and current boundary

This batch provides a working diagnostic request API, persistent PostgreSQL queue and immutable artifact storage. The repair execution consumer is PB-08–11 and is not implemented by this API. Runs remain queued until that consumer exists. No endpoint marks a repair accepted or pays a grant.

1. Install Node 24, pnpm 11.22.0 and Docker. Run `pnpm install --frozen-lockfile` and `git submodule update --init --recursive`.
2. Provide PostgreSQL and two local Anvil nodes with chain IDs 31337 and 31338, or actual Sepolia/Arc endpoints for testnet mode. Copy `.env.example` to ignored `.env.local`; replace database credentials and evaluator public address. Keep private keys out of this file.
3. Use the matching `NETWORK_MANIFEST`. Testnet mode uses `runtime.testnet.json`, HTTPS RPCs, the correct token and S3 storage; local file storage is rejected there.
4. Run `pnpm api:start`. Startup checks chain IDs (and USDC decimals in testnet mode), applies checksum-guarded migrations, then binds the API. Local mode binds only 127.0.0.1. Testnet hosting must provide HTTPS termination and use the configured API_ORIGIN. Do not expose PostgreSQL publicly. Set TRUSTED_PROXY_IPS only to the exact IPs of your controlled HTTPS reverse proxies; forwarded client headers from every other peer are ignored. Health probes have no database rate bucket.
5. `GET /health` returns non-secret readiness metadata. `GET /openapi.json` is generated from actual route definitions. API bodies never accept an RPC endpoint or executable code.
6. `POST /v1/auth/challenge` with address/source chain; sign the returned SIWE message in your wallet. `POST /v1/auth/verify` exchanges challengeId/signature for a random, expiring Bearer token. Tokens are hashed in PostgreSQL; never log/store them in Git. EOA and already-deployed EIP-1271 wallets are supported; counterfactual-wallet deployment is not.
7. With Bearer authorization: create `/v1/inventories`, `/v1/manifests`, then `/v1/verification-scopes` with their IDs, maxSnapshotAge and confirmations. The scope fixes the manifest/inventory/test-pack hashes and configured evaluator.
8. `POST /v1/runs` uses the returned scope fields and an `Idempotency-Key`; identical retries return the same run, conflicting payloads return 409. Only diagnostic requests are accepted until campaign integration exists. Read `/v1/runs/:id` or cancel through `/v1/runs/:id/cancel`.
9. Evidence is private. `/v1/runs/:id/evidence` is available only for an owner's completed run. To publish a diagnostic report intentionally, the owner calls `/v1/runs/:id/publish`; only then can `/v1/public/runs/:id/evidence` return it without login. Publication is irreversible in this initial API; do not publish sensitive reports. No public scope/manifest inventory enumeration exists.

## Reproduce tests

`docker pull postgres@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac`

`pnpm check` and `pnpm test:integration` exercise real disposable PostgreSQL, Anvil and Docker (Foundry image is documented in docs/toolchain.md). The S3 adapter contract tests use the actual AWS SDK against a local HTTP fixture; they do not prove access to your hosted bucket. No cloud database/account is needed for tests.

Wallet signatures authenticate API access only; no contract upgrade, transfer or grant authority is delegated. Signed security receipts and the execution worker remain separate, later modules.

Requests and sockets have bounded timeouts; shutdown forcibly closes unfinished connections and has a 10-second process deadline. Expired challenges, sessions and old rate buckets are pruned in batches of at most 1,000 rows per table at startup and every 30 seconds. A global request admission limit (default 600/minute, maximum 1,000) is applied before per-IP bucket allocation, keeping new transient rows below normal cleanup capacity. Exempt health checks do not write database rows. Monitor cleanup failures and backlog.
