# PB-03 contract handoff — ready for PB-14

The user asked A/Codex to complete the shared prerequisites. Do not regenerate these interfaces in B's campaign work.

Canonical definitions:
- contracts/pb03/PatchBondTypes.sol — Policy, Snapshot, AcceptanceReceipt and hashing.
- contracts/pb03/EncodingHarness.sol — pure helpers, no financial authorization.
- docs/interfaces/pb03-studio-spec.md — exact field/type/domain specification.
- docs/interfaces/pb03-vectors.json — frozen public test fixtures, digests and signature.
- packages/schema/src/types.ts, encoding.ts, validation.ts — matching TS schemas/encoding and receipt/evidence validation.

Built and tested in the existing Arc Studio project via Codex -> CLI -> Studio, then pulled unchanged. Studio provenance/source hashes: docs/evidence/pb01-studio-provenance.json. Local Foundry reproduces 25 tests. The integration test deploys EncodingHarness only to disposable local Anvil and compares real Solidity results with TS and frozen vectors.

B starts **PB-14** using these interfaces, then PB-15 registry, PB-16 contract acceptance, PB-17 funding, PB-18 claims and PB-19 accounting/challenges. The hashing library accepts all typed inputs; B must implement semantic checks in the actual contracts. TS checks are not an onchain security boundary.

Mandatory consuming checks: stored policy equality; source chain; destination chain == block.chainid; campaign == address(this); supported schema/type; eligibility proof and fixed recipient; authorized signer; snapshot/timestamp consistency; fresh issued/observed time and expiry; purpose=1, mode=1, result=1; deadline; one active claim per deployment; replay/paid state. The policy commits sourceRegistry, including zero only for explicitly direct-signed mode. CCIP transport later authenticates its own router/source/sender and cannot bypass these checks.

Domain: PatchBond / 1 / destinationChainId / campaign address. All receipt fields are static. Snapshot hash commits chain, number, hash and timestamp. Eligibility leaf double-hashes campaignId/sourceChainId/deploymentKey/recipient; it deliberately excludes policyHash to avoid a circular eligibilityRoot/policyHash definition. A policy's own hash is not one of its fields.

All numeric JSON blockchain values are canonical decimal strings; Solidity fields are uints. ERC-20 amounts are six-decimal USDC units. Test fixture addresses/keys/amounts are never production configuration. diagnosticTypedData uses a separate PatchBondDiagnostic domain and DiagnosticEvidence type and cannot settle grants.

The signature and complete assertion list do not prove that security tests were honestly executed. The trusted backend test runner is later work. CRE runtime signature verification now passes in the capability simulation; see CRE-PROBE.md. This does not prove full product acceptance or deployed DON verification.

Commands: pnpm check; pnpm vectors:check; pnpm test:integration (Docker running). Request an explicit coordinated interface change if a field must change; regenerate vectors only with matching Solidity/TS changes.
