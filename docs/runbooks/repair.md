# Repair proposals and a real local walkthrough (PB-12)

The service observes and prepares; the contract's authorized owner signs and executes. A wallet login grants access to private API records, not authority over a contract. An unsigned proposal and its simulation are not a security approval, an executed transaction, a new diagnostic pass or a grant receipt.

## Reproduce the connected flow

Prerequisites: the pinned toolchain/submodules/dependencies and running Docker from `backend-start.md`. No funded wallets, Arc or CRE credentials are needed for these disposable local tests.

```sh
pnpm test:repair
```

This starts real PostgreSQL, fresh Anvil deployments and separate HTTP API/worker processes. It authenticates a real test-wallet signature, registers scope, checks a vulnerable deployment, requests and revalidates a supplier-owned upgrade, executes it through the local owner wallet, and queues a new diagnostic. That new run must independently pass signature, code/configuration and isolated behavioral checks. The old report must remain failed. A reused stale proposal must be rejected. Other cases verify crash recovery, replay and correct-code/wrong-configuration failure. Services are cleaned up afterward; this is not a persistent dashboard.

To retain inspectable evidence from that actual run:

```sh
PATCHBOND_REPAIR_DEMO_DIR=.tmp-artifacts/repair-demo pnpm test:repair
```

The ignored directory receives `before.json`, `proposal.json`, `after.json`, `scope.json`, and `execution.json`. Compare block hashes/numbers, conditions, signatures and the transaction hash. These are generated from the run, not canned examples. The recorded local chain is deleted during cleanup, so its transaction hash is not a public explorer link. No private key, database password or session token is exported. A historical replay of `after.json` can be run using the existing replay CLI and `scope.json`; see `replay.md`.

## Use the API with your running local services

1. Follow `backend-start.md` through a completed **deployed diagnostic** with fresh signed evidence. Use the actual run ID and deployment key from its evidence, not sample addresses.
2. Authenticated `GET /v1/runs/:id/actions?deploymentKey=<key>` loads the caller-owned job and authoritative stored scope, verifies signed evidence, and re-inspects the pinned deployment. One deployment per request bounds the work.
3. `status: ready` returns an unsigned proposal with source chain, exact target/calldata/value, observed authority, original snapshot, state and manifest digests, compatibility metadata and simulation result. `blocked` explains an unsupported condition; `no-supported-action` is not proof of a passing repair. Preview evidence cannot create proposals.
4. Before signing, authenticated `POST /v1/runs/:id/actions/validate` with `{deploymentKey, proposal}` independently regenerates the proposal and compares it exactly. Changed calldata/target/policy, changed routing/owner/configuration/code, expired snapshots or invalid evidence reject. The API never accepts a user-provided RPC URL or arbitrary transaction for simulation.
5. The named authority uses its own wallet on the proposal's source chain to simulate and sign **exactly** `{to: target, data: calldata, value: BigInt(valueBaseUnits)}`. The login wallet may be a coordinator and need not be that authority. The API provides no signing key or broadcast endpoint.
6. After execution and configured confirmations, enqueue a **new** `/v1/runs` request using the same scope and a new idempotency key. Inspect its new evidence. A mined successful transaction does not automatically change the old report or award a grant. A deployment requiring both upgrade and configuration is repaired sequentially, with a new inspection between operations.

## Supported operations and limits

- The exact reviewed artificial V1/V2 adapter family behind the pinned OZ5 transparent proxy only.
- Upgrade: call the observed `ProxyAdmin.upgradeAndCall(proxy, approvedImplementation, 0x)` as its observed EOA owner. No arbitrary initializer, value transfer, implementation deployment or ownership change.
- Configuration: call the observed proxy's `configure(source, age, decimals)` as its observed customer EOA owner. Retain the recognized source and owner; restore the manifest's agreed age and supported eight-decimal quote units.
- Every proposal requires local compiler source hashes, equal exact storage layouts and matching inherited namespaced Initializable source. Missing/stale metadata blocks it. This is a restricted known-family check, not a replacement for generic OpenZeppelin upgrade validation or an audit.
- Unknown code, missing/changed owner, contract-wallet upgrade authorities, changed dependency path, source/ownership changes and paused markets require manual review. We do not automatically unpause an incident or guess governance transactions.
- Simulations use real `eth_call` from the observed authority at the original confirmed snapshot and a checked current block. No source-chain mutation occurs during preparation.
- Proposals expire at the earlier of scope freshness and 120 seconds from the original snapshot. Stale reports require a new diagnostic. Revalidation checks current code/storage; ongoing source price/timestamp samples are excluded from the repair-state lock, while source identity/owner remains bound.
- State can still change between revalidation and mining. A plain OZ upgrade transaction has no PatchBond precondition embedded in it; wallet-side simulation and fresh post-execution tests remain required. This is explicitly not an atomic execution guarantee or a warranty.
- The verifier trusts its configured RPC. Diagnostic acceptance remains separate from future campaign acceptance and Arc settlement.
