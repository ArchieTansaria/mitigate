# PB-03 v1 shared interfaces and hashing: Studio build record

Date: 2026-11-06. Spec: `pb03-studio-spec.md` (provided read-only). Nothing deployed, no transactions, no faucet, no wallets, no frontend.

## Files added

- `contracts/pb03/PatchBondTypes.sol`: library with `Policy`, `Snapshot`, `AcceptanceReceipt` structs (field order exactly as specified), `RECEIPT_TYPEHASH`, `DOMAIN_TYPEHASH`, and internal pure hashing functions.
- `contracts/pb03/EncodingHarness.sol`: stateless contract exposing `policyHash`, `snapshotHash`, `deploymentKey`, `eligibilityLeaf`, `receiptStructHash`, `receiptDigest(chainId, campaign, receipt)`, plus two read helpers (`domainSeparator`, `receiptTypehash`).
- `contracts/test/pb03/EncodingHarness.t.sol`: 25 Foundry tests.
- `docs/pb03-studio-build.md`: this file.

No other file was edited. `PatchBondReceiver.sol`, its tests, `remappings.txt`, README and AGENTS.md are untouched.

## Tool and versions (actually run in Studio)

```
forge Version: 1.7.1
Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8
Build Timestamp: 2026-05-08T07:50:55.527285345Z
Solc 0.8.28 (pragma `0.8.28` exact), evm_version cancun, optimizer on (200 runs)
```

Commands:

```
forge test --match-path 'contracts/test/pb03/*' -vv
forge test            # whole project
```

Results:

- PB-03 suite: `Suite result: ok. 25 passed; 0 failed; 0 skipped` (fuzz: 256 runs).
- Whole project: `64 tests passed, 0 failed, 0 skipped` (25 PB-03 + 39 existing receiver tests).

## What the tests prove

- Policy: encoding is exactly 22 inline static words in spec order (each word checked); mutating each of the 22 fields changes `policyHash`, and all 22 mutated hashes are distinct.
- Snapshot: 4 words in order; each field changes the hash.
- `deploymentKey`: changes with source chain, entrypoint and selector; zero selector (no submarket) is distinct; fuzzed.
- `eligibilityLeaf`: double hash (differs from the single hash); changes with campaignId, source chain, deploymentKey and recipient; works in a sorted-pair Merkle tree using OpenZeppelin `MerkleProof`, and an outsider cannot reuse a proof.
- Receipt: type hash equals the spec string copied verbatim into the test; encoding is typehash plus 17 words in spec order.
- Domain and digest: matched against the spec built by hand and against OpenZeppelin `EIP712` (independent implementation), for both domain separator and typed digest.
- Chain binding: destination chain id, campaign (verifyingContract) and receipt source chain each change the digest. The domain has no source-chain or source-registry input.
- Signing: a test-only key (`vm.sign`) recovers via `ecrecover` to the signer. Mutating any of the 17 receipt fields (including recipient, evidence digest, campaignId, test pack, purpose, mode), the campaign address or the destination chain makes the old signature recover to a different address.
- Boundary tests: an all-zero policy, unknown enum values, and a signed diagnostic/preview/fail receipt all hash and recover without reverting.

All addresses, chain ids (Sepolia 11155111, Arc 5042002), hashes and the signing key in tests are labelled fixtures. The key is a throwaway used only with `vm.sign`.

## Contract responsibility boundary

This layer only computes hashes from caller-supplied inputs. It does not:

- reject zero addresses, zero hashes, zero `eligibleCount`, bad `tokenDecimals`, unknown purpose/mode/result values, or expired/future receipts;
- check that `policy.destinationChainId == block.chainid`, `policy.campaign == address(this)`, or that a receipt's `campaignPolicyHash` matches the stored policy;
- verify signatures, check signer role, or track replay (`receiptId`);
- enforce eligibility. Only `purpose == 1`, `mode == 1`, `result == 1` is eligible, and a valid signature alone is never acceptance. Later campaign contracts must enforce this;
- hold funds, have admin functions, make external calls, or store state.

TypeScript validation and the later campaign contracts own those checks (nonzero campaign, verifier, supplier, recipient and token; registry may be zero only for direct-signed transport before a registry exists).

## Spec notes and resolutions

No conflict changed a field order, domain value or type name. Two points were resolved minimally:

1. Test requirement says "recipient/campaign/source chain change eligibility leaf". The leaf (spec: `campaignId, sourceChainId, deploymentKey, recipient`) contains `campaignId` (bytes32), not the campaign contract address. I tested `campaignId`. The campaign address is bound in the receipt digest through the EIP-712 `verifyingContract`, and that is tested there.
2. The spec lists six helper names for the harness. I added two read-only helpers (`domainSeparator`, `receiptTypehash`) so off-chain code and tests can read the exact domain and typehash. They do not change any listed function.

Informational: the EIP-712 type string contains `type name` pairs (for example `bytes32 campaignId`), copied exactly from the spec. The struct hash is valid EIP-712 `encodeData` because every member is a static type.

## Not done

No audit, no Slither, no deployment, no live or fork test. The unit tests are the only verification.
