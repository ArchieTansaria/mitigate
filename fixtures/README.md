# PB-07 local application fixtures

Artificial stale-price regression family, built with Solidity **0.8.28**, OpenZeppelin Contracts **5.4.0** and repository-pinned Foundry **1.7.1**. These contracts are intentionally limited examples, not production lending/oracle code. V1 deliberately omits the max-age check. V2 preserves V1's storage and initialization ABI and rejects `block.timestamp - updatedAt > maxAge` with `StalePrice(updatedAt,maxAge)`. Both reject zero prices, zero timestamps and future timestamps.

The supplier owns the **ProxyAdmin contract created by each OZ 5.4 transparent proxy**. The customer owns adapter configuration and the market's adapter selection/pause controls. The supplier account is not itself the proxy's admin address. Supplier upgrades retain arbitrary implementation power; the distinct configuration owner does not stop a malicious future implementation from rewriting state. Initializers are disabled on both implementation instances and called atomically in each proxy constructor. No upgrade initializer is needed. Proxy storage/upgrade compatibility is tested for this V1→V2 pair, not certified generically.

RiverMarket is a quote-only operation, with 18-decimal collateral in and 18-decimal quote currency out. It uses full-precision multiplication/division and rounds down. There are no deposits, debt balances, borrowing or transfers. The source owner can set malformed observations intentionally for isolated test interventions. A structurally valid six-decimal setting for an eight-decimal source remains unsafe; the test pack must reject it independently of the stale-price fix. Same for a wrong source or permissive max age. Pausing cannot count as successful rejection of stale input.

## Commands (from repository root)

Dependencies must already be installed using the repository's lockfile and vendored libraries present. No fixture-specific dependency install or lockfile is needed.

```sh
node fixtures/forge.mjs build
node fixtures/forge.mjs test --match-contract FixtureBehaviorTest
node --test fixtures/test/deploy-local.test.mjs
node fixtures/deploy-local.mjs
```

`fixtures/forge.mjs` resolves the repository-pinned Forge binary and **absolute** `scripts/solc.mjs` compiler path. It does not edit the shared wrappers or download solc. The equivalent native invocation on this checkout is:

```sh
forge test --root fixtures --use /Users/aryapathak/Documents/patchbond/scripts/solc.mjs --match-contract FixtureBehaviorTest
```

`forge` is not on PATH in the development environment; the Node wrapper is the tested CLI. It supports Forge build/test/inspect/script commands that accept `--use`; use the underlying Forge binary directly for `fmt` or `--version`. Suggested parent-owned package scripts: `build:fixtures` → `node fixtures/forge.mjs build`, `test:fixtures` → `node fixtures/forge.mjs test`, `test:fixtures:deploy` → `node --test fixtures/test/deploy-local.test.mjs`, `deploy:fixtures:local` → `node fixtures/deploy-local.mjs`. None are added by PB-07.

Relative symlinks under `fixtures/lib` reuse the existing pinned libraries in `contracts/lib` read-only. `fixtures/testpack` resolves to the owned `testpacks/oracle-adapter` directory. This avoids external relative-import resolution problems in the shared solc-js standard-JSON adapter. Keep symlinks intact on checkout. Library revisions are the ones recorded in `contracts/foundry.lock`; PB-07 does not modify or reinstall them.

## Local deployment and provenance

```sh
node fixtures/deploy-local.mjs --count 6 --max-age 1800 --price 150000000000 --unsafe-decimals 6
node fixtures/deploy-local.mjs --keep-alive
```

Count is 3–12; scenarios repeat old V1, repaired V2, V2 with unsafe decimals. Every instance gets a fresh source, proxy/ProxyAdmin and market; two implementations are shared. Prices are integer base units; eight decimals is the expected policy. `--max-age` accepts 1–86400 seconds; settings shorter than compilation/deployment time may expire before export and correctly fail. Unsafe decimals must be 0–18 and differ from eight.

The launcher creates its **own fresh, unforked loopback Anvil**, uses two distinct unlocked local accounts and stops it in `finally`. It never reads a private key or accepts an RPC URL, key, fork, external output directory or live-send option. Child environments contain only platform paths and explicit local fixture parameters. Anvil startup is silent so its test account keys are not printed. `--keep-alive` prints the temporary RPC URL and keeps the chain available until Ctrl-C; the integration test uses this option to independently read back all generated runtime code and transaction receipts.

Each run prints a unique path under ignored `fixtures/generated/run-*/` and the canonical manifest's keccak256 digest. Contents:

- `manifest.json`: explicitly local-only, `claimEligible:false`; chain snapshot, actual addresses, observed dependency/authority/configuration, runtime bytecode/hashes, mined transaction objects and receipts.
- `repair-N.json`: generated and validated using the shared `ManifestSchema`, with actual approved V2 runtime hash, per-instance intended source, age/decimals/customer predicates and test-pack digest. These are candidate local manifests, not policy approval or acceptance receipts.
- `abi/*.json`: compiled ABI exports including separate transparent upgrade interface and ProxyAdmin.
- `testpack/`: exact source/spec/readme bytes and content-hashed canonical index.
- `manifest-digest.json`, `forge.log`, `address-map.simulation.json`: digest metadata, local Forge output, and an explicitly labelled simulation address map. The map alone is never deployment evidence.

Only after successful mined receipts, code reads, ERC-1967 slot reads, AdminChanged log checks, owner/configuration reads at one block and an unchanged snapshot hash does export write `manifest.json`. Missing code/receipts and mismatches throw. Failed attempts may leave partial directories without a final manifest. Exported implementation runtime must equal the just-built artifacts. Artifacts contain no verdict, fabricated transaction ID, signing key or live RPC credential. Their existence cannot qualify a campaign claim.

Default execution stops the chain, so the saved block becomes historical local evidence, not a still-queryable deployment. Re-running recreates the scenario; block/transaction/code hashes may change with timestamps/compiler metadata. Use `--keep-alive` for the next inspector's immediate local smoke test. No Sepolia/Arc deployment, Studio mutation or testnet key is needed or included. PB-08/PB-09 still own deployed-state inspection, snapshot isolation, scenario execution/evidence assembly and integration; the candidate test pack needs parent review before a policy pins it.
