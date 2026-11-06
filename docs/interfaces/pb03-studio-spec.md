# PB-03 v1 contract boundary — build specification
Scope: shared hashing/types only, not campaign funding or authorization implementation. No deployment/funding in this turn.
Use Solidity 0.8.28 exactly, EVM cancun. Add files only under contracts/pb03/ and contracts/test/pb03/ plus docs/pb03-studio-build.md. Preserve all other project code. A teammate will implement the campaign next.

Create library PatchBondTypes and stateless contract EncodingHarness with public pure helpers. No admin functions, funds, external calls, acceptance flags or private keys. All addresses below are caller inputs. Tests use clearly labelled fixtures.

Policy struct fields in exactly this order:
bytes32 campaignId; address supplier; uint256 sourceChainId; uint256 destinationChainId; address sourceRegistry; address campaign; bytes32 eligibilityRoot; uint256 eligibleCount; uint256 grantAmount; address token; uint8 tokenDecimals; bytes32 repairPolicyHash; bytes32 testPackHash; address verifier; address challenger; address reviewer; uint64 claimDeadline; uint64 challengeWindow; uint64 reviewTimeout; uint64 maxReceiptAge; uint32 confirmations; uint64 evidenceRetention.
policyHash = keccak256(abi.encode(policy)); all fields are static. SourceRegistry can be zero only for direct-signed transport before a registry is deployed; campaign/verifier/supplier/recipient and token must be nonzero in consuming validation. Those semantic checks belong to TS validation and later campaign contracts, not the hashing library.

Snapshot struct fields in order: uint256 chainId; uint256 blockNumber; bytes32 blockHash; uint64 blockTimestamp.
snapshotHash = keccak256(abi.encode(snapshot)).

deploymentKey(uint256 sourceChainId, address entrypoint, bytes32 marketSelector) = keccak256(abi.encode(sourceChainId, entrypoint, marketSelector)). marketSelector zero represents no submarket selector.
eligibilityLeaf(bytes32 campaignId, uint256 sourceChainId, bytes32 deploymentKey, address recipient) = keccak256(bytes.concat(keccak256(abi.encode(campaignId, sourceChainId, deploymentKey, recipient)))). This is a double-hashed leaf compatible with a sorted-pair Merkle tree. Policy hash is NOT in the leaf (would make eligibilityRoot/policyHash circular).

AcceptanceReceipt struct in exactly this order:
bytes32 campaignId; bytes32 campaignPolicyHash; uint256 sourceChainId; bytes32 deploymentKey; address recipient; bytes32 snapshotHash; uint256 observedBlockNumber; bytes32 observedBlockHash; uint64 observedBlockTimestamp; bytes32 testPackHash; bytes32 evidenceDigest; uint8 purpose; uint8 mode; uint8 result; uint64 issuedAt; uint64 expiresAt; bytes32 receiptId.
EIP712 type string is exactly AcceptanceReceipt(bytes32 campaignId,bytes32 campaignPolicyHash,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32 snapshotHash,uint256 observedBlockNumber,bytes32 observedBlockHash,uint64 observedBlockTimestamp,bytes32 testPackHash,bytes32 evidenceDigest,uint8 purpose,uint8 mode,uint8 result,uint64 issuedAt,uint64 expiresAt,bytes32 receiptId)
Purpose 0=diagnostic,1=campaign-claim; Mode 0=preview,1=deployed; Result 0=unset,1=pass,2=fail,3=unknown,4=unsupported. Only purpose=1,mode=1,result=1 is eligible; subsequent contracts enforce this. A successful signature alone is never acceptance.
Domain EIP712Domain(string name,string version,uint256 chainId,address verifyingContract), name PatchBond, version 1, chainId destinationChainId, verifyingContract campaign address on Arc. Do not use source chain or source registry as verifyingContract. Source chain is bound in receipt; source registry is bound through campaignPolicyHash. This domain supports carrying the exact same signed receipt through CCIP without resigning it.
receiptStructHash = keccak256(abi.encode(RECEIPT_TYPEHASH,receipt)); receiptDigest = keccak256(abi.encodePacked(hex"1901",domainSeparator,receiptStructHash)). Expose policyHash, snapshotHash, deploymentKey, eligibilityLeaf, receiptStructHash, receiptDigest(chainId,campaign,receipt) in EncodingHarness with these names.

Tests: policy field mutation changes hash, source chain/entrypoint/selector change deploymentKey; recipient/campaign/source chain change eligibility leaf; source and destination changes alter receipt digest; test-only EOA signs and recovers correct digest using vm.sign/ecrecover. Altering recipient, evidence digest, campaign, test-pack, purpose or mode must invalidate the same signature/digest binding. Test helpers can use forge-std existing setup. Hashing does not reject invalid semantic input; explicitly state this boundary. Run actual Foundry tests in Studio and report exact tool version/command/output, never infer success from generated source.
Do not modify existing CCIP receiver. No live transaction, faucet request, wallet creation, configuration secret or frontend work.
