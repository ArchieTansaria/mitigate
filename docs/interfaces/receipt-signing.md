# PB-03 campaign receipt signing

This is the exact frozen v1 receipt contract. Do not add, omit, rename, reorder, or change the type of a field. The machine-readable fixture, including a disposable real EIP-712 signature and expected hashes, is [`pb03-vectors.json`](pb03-vectors.json); the canonical definition is [`pb03-studio-spec.md`](pb03-studio-spec.md).

## Typed data

Primary type: `AcceptanceReceipt`

```text
AcceptanceReceipt(bytes32 campaignId,bytes32 campaignPolicyHash,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32 snapshotHash,uint256 observedBlockNumber,bytes32 observedBlockHash,uint64 observedBlockTimestamp,bytes32 testPackHash,bytes32 evidenceDigest,uint8 purpose,uint8 mode,uint8 result,uint64 issuedAt,uint64 expiresAt,bytes32 receiptId)
```

EIP-712 domain:

```json
{"name":"PatchBond","version":"1","chainId":"<destinationChainId>","verifyingContract":"<policy.campaign>"}
```

`chainId` is the Arc destination chain ID and `verifyingContract` is the immutable campaign address on Arc. Never sign with the source chain ID, registry address, or verifier contract address. Numbers in JSON/API records are canonical decimal strings; pass `uint256`/`uint64` message fields to typed-data libraries as integers. The `uint8` enum fields are `purpose=1` (campaign claim), `mode=1` (deployed), `result=1` (pass).

## Viem example

The report producer must validate the report and policy before signing. It obtains the verifier signer from its protected signing service or operator wallet; participant keys never belong in the API/worker. The snippet shows encoding/signing only, not evidence approval:

```ts
const types = {
  AcceptanceReceipt: [
    { name: "campaignId", type: "bytes32" },
    { name: "campaignPolicyHash", type: "bytes32" },
    { name: "sourceChainId", type: "uint256" },
    { name: "deploymentKey", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "snapshotHash", type: "bytes32" },
    { name: "observedBlockNumber", type: "uint256" },
    { name: "observedBlockHash", type: "bytes32" },
    { name: "observedBlockTimestamp", type: "uint64" },
    { name: "testPackHash", type: "bytes32" },
    { name: "evidenceDigest", type: "bytes32" },
    { name: "purpose", type: "uint8" },
    { name: "mode", type: "uint8" },
    { name: "result", type: "uint8" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "receiptId", type: "bytes32" },
  ],
} as const;

const signature = await walletClient.signTypedData({
  account: verifierAddress,
  domain: {
    name: "PatchBond",
    version: "1",
    chainId: 5_042_002,
    verifyingContract: policy.campaign,
  },
  primaryType: "AcceptanceReceipt",
  types,
  message: {
    ...receipt,
    sourceChainId: BigInt(receipt.sourceChainId),
    observedBlockNumber: BigInt(receipt.observedBlockNumber),
    observedBlockTimestamp: BigInt(receipt.observedBlockTimestamp),
    issuedAt: BigInt(receipt.issuedAt),
    expiresAt: BigInt(receipt.expiresAt),
  },
});
```

The example chain ID is Arc Testnet. For another configured destination, derive the domain chain ID from the verified deployment configuration; do not silently default. The returned signature accompanies the unchanged receipt and evidence digest. The campaign verifier checks scope, eligibility, freshness, enums, domain, signature and receipt-ID replay. A valid signature attests only that the configured verifier signed those fields; it does not prove honest execution or security.

## Test evidence

PB-16 Studio tests compare `policyHash`, `snapshotHash`, `eligibilityLeaf`, and `receiptDigest` against the frozen JSON fixture, recover the published test signer, and exercise the receipt through the verifier. The vector's Merkle root is a placeholder, so its end-to-end eligibility uses a test-only registry stand-in; other eligibility tests use the actual PB-15 registry and computed Merkle proofs. See [`PB-16 handoff`](../handoffs/PB-16-acceptance-verifier.md) for commands, limits and current validation status.
