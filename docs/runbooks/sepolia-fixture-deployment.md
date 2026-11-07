# Sepolia demo fixture deployment (prepared, not broadcast)

This runbook deploys the artificial PB-07 oracle-proxy demo to **Ethereum Sepolia only**. It uses a new `fixtures/script/DeploySepolia.s.sol`; the existing local-only `fixtures/script/Deploy.s.sol` and `fixtures/deploy-local.mjs` remain unchanged. This fixture is not a production oracle, lending market, campaign, or acceptance receipt.

## What will be deployed

The script uses one configured supplier address and one distinct customer address. The supplier owns the fixture price sources and the OpenZeppelin `ProxyAdmin` created inside each transparent proxy. The customer owns adapter configuration and the quote-only markets.

It submits 11 deployment transactions and creates 14 contract instances:

1. `OracleAdapterV1` implementation.
2. `OracleAdapterV2` implementation.
3. `TestPriceSource` for `old-v1`, initialized at the transaction block timestamp.
4. `TransparentUpgradeableProxy` for `old-v1`, using V1, supplier-owned ProxyAdmin, and atomic adapter initialization for the customer.
5. `RiverMarket` for `old-v1`, owned by the customer.
6. `TestPriceSource` for `repaired-v2`, initialized at the transaction block timestamp.
7. `TransparentUpgradeableProxy` for `repaired-v2`, using V2, supplier-owned ProxyAdmin, and atomic adapter initialization for the customer.
8. `RiverMarket` for `repaired-v2`, owned by the customer.
9. `TestPriceSource` for `unsafe-decimals-v2`, initialized at the transaction block timestamp.
10. `TransparentUpgradeableProxy` for `unsafe-decimals-v2`, using V2, supplier-owned ProxyAdmin, and atomic adapter initialization for the customer.
11. `RiverMarket` for `unsafe-decimals-v2`, owned by the customer.

Each proxy constructor also creates one `ProxyAdmin`, giving 14 resulting contracts in total. There are no token transfers, approvals, upgrades, or campaign actions.

## Configuration

The values match the existing local demo integration test where applicable:

| Setting | Value | Meaning |
| --- | --- | --- |
| Chain ID | `11155111` | Hard guard in the script; every other chain reverts before deployment. |
| Supplier | Required public address | Owns demo sources and each proxy's ProxyAdmin. |
| Customer | Required, distinct public address | Owns adapter configuration and markets. |
| Price | `150000000000` | Integer price units at 8 decimals (`$1,500.00000000`). |
| Max age | `1800` seconds | V2 stale-price window. |
| Source timestamp | `block.timestamp` per transaction | Fresh at deployment; not fabricated historical evidence. |
| Scenario decimals | `8`, `8`, `6` | Expected, expected, deliberately unsafe configuration. |
| Implementations | V1 for old; V2 for repaired and unsafe | The unsafe-decimals case remains unsafe despite V2. |

Public-address placeholders are in `fixtures/deployments/sepolia-demo.env.example`. Fill the two role addresses locally before running a dry run. The script reads no signing key; Forge's selected wallet/account is the only signing mechanism if a later, separately approved broadcast is initiated.

## Review-only dry run

From the repository root, after setting the public role addresses and an RPC endpoint in the shell:

```sh
export PB07_SEPOLIA_SUPPLIER=0x...
export PB07_SEPOLIA_CUSTOMER=0x...
export SEPOLIA_RPC_URL=https://...
export PB07_SEPOLIA_PRICE=150000000000
export PB07_SEPOLIA_MAX_AGE=1800
node fixtures/forge.mjs script script/DeploySepolia.s.sol:DeploySepolia --root fixtures --use scripts/solc.mjs --rpc-url "$SEPOLIA_RPC_URL" --sender "$PB07_SEPOLIA_SUPPLIER"
```

This command deliberately omits `--broadcast`. Review the resulting 11 simulated transactions, constructor arguments, predicted contract addresses, chain ID, and fees. The RPC endpoint must report Sepolia chain ID `11155111`; the script independently enforces that chain ID. Do not use `fixtures/deploy-local.mjs` for this workflow.

**Stop after the dry run and show the transaction plan to the wallet owner.** No broadcast command is included here. A separate explicit approval is required before any wallet is asked to sign or any deployment transaction is broadcast. Never paste a private key, seed phrase, or wallet password into chat, this repository, Studio, or the script configuration.

## Limits

The script compiles and is Sepolia-chain guarded, but has not been run against a Sepolia RPC and no transaction has been broadcast. The addresses, nonces, gas estimates and fees depend on the eventual public role addresses and current network state. The demo's owner-controlled source can provide arbitrary observations and must never be treated as a trusted oracle. The V1 scenario is deliberately vulnerable; the unsafe-decimals scenario is deliberately misconfigured. Neither scenario constitutes campaign-eligible evidence.
