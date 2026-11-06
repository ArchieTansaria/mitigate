# Feature 08 — fully funded campaign activation (PB-17)

PB-17 binds a non-upgradeable Arc campaign escrow to its immutable PB-15 policy, PB-16 verifier, destination chain, and configured six-decimal ERC-20. Only the supplier can transfer exact token amounts or activate, and activation requires the full integer `eligibleCount × grantAmount`. Direct transfers do not count. The contract rejects short/fee-on-transfer payments, overfunding, late funding, and reentrant calls; it has no refund or sweep path yet.

Arc Studio validated 52 PB-17 focused tests and 188 tests across the complete PB-15–17 Foundry suite. Official Arc Docs identify the Arc Testnet USDC ERC-20 as `0x3600000000000000000000000000000000000000` with 6 decimals; the contract accepts a configured token and does not hardcode that address. No deployment or live funding occurred. Stranded direct transfers and deposits left underfunded past the claim deadline remain explicit limitations for PB-19.
