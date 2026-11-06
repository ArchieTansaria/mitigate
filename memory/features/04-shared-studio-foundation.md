# 04 — Shared Studio-built acceptance boundary (PB-00/01/03)

Codex drove the existing Arc Studio app to build/test PB-03 Solidity types and the encoding harness, then pulled exact reviewed sources. See docs/evidence/pb01-studio-provenance.json. Added pinned Foundry/Solidity/TypeScript tooling, strict schemas, canonical JSON/ABI/EIP-712 hashing, scoped receipt/evidence checks, fixture ABI and frozen cross-language vectors.

Why: verifier and campaign contracts must agree on what was inspected, who receives a grant and which campaign consumes the receipt.

Validation: 25 Solidity tests; TS/Anvil/Docker results in docs/evidence/foundation-validation.md. Studio’s older receiver tests were not locally reproduced.

Limits: Solidity library hashes only. Campaign contracts must enforce semantics, authorization, entitlement and persistent replay/paid state. CRE authentication remains pending; no deployed campaign or delivered CCIP message is claimed.

Next: B starts PB-14. Read docs/handoffs/PB-03-contracts.md. Do not recreate this foundation.
