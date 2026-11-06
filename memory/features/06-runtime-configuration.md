# 06 — Explicit runtime configuration (PB-04)

`packages/config/src/index.ts` validates supplied network manifests and private environment values. It separates local fixtures from testnet identities, pins USDC's ERC-20 decimals, bounds limits and returns safe status fields. `config/networks/README.md` defines how real deployment outputs will be added later.

Validation: seven tests passed. No runtime financial addresses or signing key are fabricated. API startup performs actual chain-ID/token-decimal checks separately in PB-06. Do not duplicate loadConfig or silently default missing credentials.
