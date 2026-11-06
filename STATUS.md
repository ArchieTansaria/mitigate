# PatchBond status
Updated: 2026-11-06. Repository: /Users/aryapathak/Documents/patchbond.

## Implemented in the foundation batch
- Reproducible pnpm/TypeScript/Vitest/Biome/Foundry toolchain and GitHub CI definition.
- Codex-authenticated Arc Studio CLI build of PB-03 Solidity helpers/tests in the existing hosted app; files pulled unchanged and tests reproduced locally.
- Strict versioned campaign, snapshot, manifest, evidence and receipt schemas; canonical hashing, EIP-712 domain separation, recipient/chain/policy/freshness checks, optional normalized replay lookup and complete assertion coverage checks.
- Frozen Solidity/TypeScript vectors with real local Anvil parity tests. Fixture ABI exported for later PB-07.
- Bounded RPC probe with canonical block-hash reads and explicit unknown failures; actual successful Arc/Sepolia reads recorded.
- Restricted Docker Foundry probe and actual isolation tests; bounded trusted CLI supervision. The full repair test runner is later work.

## Teammate starts PB-14
Read docs/handoffs/PB-03-contracts.md and docs/handoffs/TEAMMATE-START.md. A completed the shared prerequisites at the user's request; B implements campaign rules/registry/acceptance/funding/claims/challenges PB-14–19, then messaging PB-20. Do not rebuild PB-03 or introduce a competing receipt shape.

## Still outstanding
- The user needs a Chainlink CRE account. Studio has a temporary CRE CLI, but simulation requires login. No CRE workflow or report delivery is claimed.
- CCIP router support was read successfully; no cross-chain message or testnet campaign deployment/payment has occurred.
- Verifier/API/database/repair test-pack execution and the product frontend are not yet implemented. Current evidence checks validate structure/signatures, not independent proof of security or honest test execution.
- Hosted Studio outbound RPC connectivity is proven; its authenticated connection to the future verifier service is not yet built.

## Verification and history
See docs/evidence/foundation-validation.md for commands, results and commit/fresh-clone evidence. Studio: https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52. Local test signatures use clearly labelled disposable keys; no user keys, tokens or authenticated RPC URLs are committed.
