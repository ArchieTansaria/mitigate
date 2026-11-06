# PB-16 handoff: acceptance verifier

Scope: validate frozen PB-03 `AcceptanceReceipt`s against the PB-15 registry, and give the campaign contract a once-only consume path. No funding, claims, challenges, CCIP, deployment or UI. PB-03 and PB-15 files are unchanged.

## Files
- `contracts/pb16/IAcceptanceVerifier.sol`: events, errors, read and consume surface.
- `contracts/pb16/AcceptanceVerifier.sol`: implementation. Constructor takes the PB-15 `ICampaignRegistry`; it must have code. No owner, no setters.
- `contracts/test/pb16/AcceptanceVerifierBase.sol`: shared fixtures and a test-only campaign harness (not a test suite).
- `contracts/test/pb16/AcceptanceVerifier.t.sol`: scope, snapshot, enum, time, eligibility (41 tests).
- `contracts/test/pb16/AcceptanceVerifierSignature.t.sol`: signer, malformed signatures, authorization, replay, atomicity (20 tests).
- `contracts/test/pb16/AcceptanceVerifierVectors.t.sol`: frozen PB-03 vector parity and end-to-end (8 tests).

## API
- `validateReceipt(receipt, signature, proof) view returns (digest)`: full dry run, anyone may call, reverts with a specific error.
- `consumeReceipt(receipt, signature, proof) returns (digest)`: only `policy.campaign` may call. Runs the same validation, then marks `(campaignId, receiptId)` consumed and emits `ReceiptConsumed`.
- `receiptDigestOf(receipt) view`: digest under `PatchBond / 1 / policy.destinationChainId / policy.campaign`. Off-chain signers should produce the same bytes.
- `isConsumed(campaignId, receiptId) view`, `registry() view`.

## Checks, in order
1. Replay: `(campaignId, receiptId)` not consumed. Campaign id nonzero and present in the registry (`UnknownCampaign`).
2. Scope: `policy.destinationChainId == block.chainid`; registry hash equals the hash of the policy it returns; receipt `campaignPolicyHash`, `sourceChainId`, `testPackHash` equal the policy.
3. Snapshot: `observedBlockNumber`, `observedBlockHash`, `evidenceDigest`, `receiptId` nonzero; `observedBlockTimestamp` nonzero (`ZeroField("observedBlockTimestamp")`) and `<= issuedAt` (`SnapshotAfterIssuance`); `snapshotHash` equals `PatchBondTypes.snapshotHash(sourceChainId, observedBlockNumber, observedBlockHash, observedBlockTimestamp)`.
4. Enums: `purpose == 1`, `mode == 1`, `result == 1`.
5. Time: `expiresAt > issuedAt`, `issuedAt <= now`, `now <= expiresAt`, `now - issuedAt <= maxReceiptAge` (all inclusive).
6. Eligibility: registry `isEligible` (recipient-bound sorted-pair proof over the PB-03 leaf). If the deployment is already registered, its recorded recipient must equal the receipt recipient.
7. Signature: exactly 65 bytes (r,s,v), `v` in {27,28}, `s` in the lower half order, `ecrecover` nonzero and equal to `policy.verifier`. 64-byte EIP-2098 signatures are rejected.

`consumeReceipt` checks the caller before step 1's validation. Any failure reverts the whole call; if the campaign reverts later in the same transaction, the consumption reverts too.

## Commands and results (Studio sandbox, forge 1.7.1, solc 0.8.28, evm cancun)
- `forge test --match-path 'contracts/test/pb16/*'`: 69 passed, 0 failed (3 suites: 41 scope, 20 signature, 8 frozen vector; fuzz tests at 256 runs). The 8 frozen vector tests pass unchanged.
- `forge test --match-contract CampaignRegistryTest`: PB-15 suite still 67 passed (see final run below).
- Mutation spot checks (one guard disabled at a time, count of distinct failing tests, file restored afterwards): caller check removed 2; low-s check 1; consume write 8; test-pack check 1; zero-timestamp guard 3; timestamp-after-issuance guard 4. (An earlier revision of this note listed doubled counts from forge's repeated summary lines; these are the distinct counts.)

## Revision: snapshot time consistency
Added `ZeroField("observedBlockTimestamp")` and `SnapshotAfterIssuance(observedBlockTimestamp, issuedAt)` (new interface error). Both run before the snapshot-hash comparison and apply to `validateReceipt` and `consumeReceipt`. Equal to `issuedAt` and the smallest nonzero value are accepted. Two existing time tests (`test_olderThanMaxReceiptAge...`, `test_timeBoundariesAreInclusive`) now also set `observedBlockTimestamp = issuedAt` with a recomputed snapshot hash, so each still isolates its own condition. The frozen vector (observed 1000, issued 1010) is unaffected.

## Vector parity (`pb03-vectors.json`)
Matched exactly through the PB-03 library and the verifier: `policyHash` `0x1d09ea62…51da4`, `snapshotHash` `0x29cfc9d7…e41a`, `eligibilityLeaf` `0x40460171…c30f`, `receiptDigest` `0x4a1c204b…0b99`, and the frozen signature recovers signer `0x1a642f0E…14F1` and is low-s. The vector policy also hashes identically when created in the real PB-15 registry. `canonicalDigest` (`0x65ba3bb4…7b18`) is not a PB-03 Solidity output, so it is not checked here. The vector publishes `deploymentKey` without its entrypoint preimage, so it is used as an input, not re-derived.

## Limits
- The vector's `eligibilityRoot` (`0x2222…`) is a placeholder, not a Merkle root over its leaf. The end-to-end vector tests therefore use a test-only registry stand-in (`VectorPolicyRegistry`) that answers `isEligible` true for the vector leaf. All other tests use the real PB-15 registry and a real Merkle tree. The stand-in lives only in the test file.
- A valid signature means the policy verifier signed these fields. It does not prove the tests ran honestly, nor that the repair is secure.
- `policy.confirmations` is not verifiable: the frozen receipt has no confirmations field, so the signer attests to it. No per-condition field exists in the receipt, only the evidence digest and result.
- Not checked here (campaign contract, PB-18): `claimDeadline`, one active claim per deployment, reservation and accounting, retry after rejection. The verifier only dedupes receipt ids, so two different receipt ids for the same deployment both validate.
- Snapshot time consistency is enforced in the verifier only (zero timestamp and `observedBlockTimestamp > issuedAt` rejected). The PB-03 schema, type string, domain and hash functions are unchanged. The verifier does not compare `observedBlockTimestamp` to the source chain's real block time; the signer attests to that.
- Replay protection is per `(campaignId, receiptId)`. It relies on the campaign contract calling `consumeReceipt` in the same transaction that reserves the grant.
- Not deployed. Test keys are disposable labeled fixtures.
