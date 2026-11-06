# Feature 02 — Supplier-funded remediation campaign

Status: **product/architecture decision recorded; implementation not started.**

## Decision
PatchBond's Arc flow is a supplier-funded remediation campaign. The supplier publishes a fixed eligibility set and repair policy, fully funds `N × G` in USDC on Arc, and offers one capped grant `G` per eligible customer deployment. The deployment owner performs repairs and transactions. PatchBond verifies the deployed result and issues a fresh, scoped attestation. A passing receipt reserves one grant, subject to a bounded challenge/review flow.

## Removed from MVP
- Mandatory maintainer bond or collateral.
- Customer repair fee.
- Automatic penalties, slashing or maintainer-liability adjudication.
- One global “all deployments must pass” settlement gate.

## Evidence and caveat
Thirdweb reported its 2023 tool mitigated over 9,800 contracts across 37 chains and offered retroactive gas grants subject to eligibility. This validates the precedent, not PatchBond demand: https://blog.thirdweb.com/vulnerability-report/ and https://blog.thirdweb.com/security/contract-mitigation/.

## Trust and limits
The verifier signature attests to a report; it does not prove honest test execution. Supplier challenge and an independent reviewer are explicit assumptions. Reviewer timeout rejects/releases the reservation and may hurt an honest claimant. Grants are fixed allowances, not exact gas reimbursement, and retroactive grants do not finance the initial repair transaction.

## Team split
- A: finish PB-00/PB-02, own shared schemas/API/verifier/evidence/replay and later frontend.
- B: verify Studio CLI workflow (PB-01); after PB-03, build fixtures (PB-07), campaign policy/registry/receipt/funding/claims/disputes/CCIP (PB-14–20), and CRE (PB-21).
- Both: freeze PB-03 interfaces and jointly review money/evidence semantics.

## Source of truth
Read `IMPLEMENTATION_PLAN.md` and `docs/planning/DECISIONS.md`; older handbook passages about bilateral maintenance fees/bonds are superseded for this MVP. ENS remains conditional. This feature is a product/architecture decision only; the separate Studio CCIP prototype exists, but no remediation campaign contract, grant or testnet deployment is verified.

## Current implementation ownership (2026-11-06)
B owns the complete campaign contract stream PB-14–20 and its Solidity PB-03 prerequisites in the existing Arc Studio project. A owns verifier/backend, fixture contracts, TypeScript receipt producer, CRE and conditional ENS. See docs/handoffs/TEAMMATE-START.md. This records an assignment, not implemented campaign functionality.
