// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title PatchBondTypes
/// @notice PB-03 v1 shared types and pure hashing helpers (spec: pb03-studio-spec.md).
/// @dev BOUNDARY: this library only hashes what it is given. It performs NO semantic validation:
/// it does not reject zero addresses, zero hashes, unknown purpose/mode/result values, expired receipts,
/// or inconsistent policies. Those checks belong to TypeScript validation and later campaign contracts.
/// A valid signature over a receipt digest is never acceptance by itself: consuming contracts must
/// enforce purpose == 1 (campaign-claim), mode == 1 (deployed) and result == 1 (pass).
/// Enum meanings (not enforced here):
///   purpose: 0 diagnostic, 1 campaign-claim
///   mode:    0 preview,    1 deployed
///   result:  0 unset, 1 pass, 2 fail, 3 unknown, 4 unsupported
library PatchBondTypes {
    /// @dev Field order is part of the hash. All fields are static, so abi.encode(policy) is 22 words.
    struct Policy {
        bytes32 campaignId;
        address supplier;
        uint256 sourceChainId;
        uint256 destinationChainId;
        address sourceRegistry;
        address campaign;
        bytes32 eligibilityRoot;
        uint256 eligibleCount;
        uint256 grantAmount;
        address token;
        uint8 tokenDecimals;
        bytes32 repairPolicyHash;
        bytes32 testPackHash;
        address verifier;
        address challenger;
        address reviewer;
        uint64 claimDeadline;
        uint64 challengeWindow;
        uint64 reviewTimeout;
        uint64 maxReceiptAge;
        uint32 confirmations;
        uint64 evidenceRetention;
    }

    /// @dev Field order is part of the hash (4 words).
    struct Snapshot {
        uint256 chainId;
        uint256 blockNumber;
        bytes32 blockHash;
        uint64 blockTimestamp;
    }

    /// @dev Field order is part of the EIP-712 struct hash (17 words after the typehash).
    struct AcceptanceReceipt {
        bytes32 campaignId;
        bytes32 campaignPolicyHash;
        uint256 sourceChainId;
        bytes32 deploymentKey;
        address recipient;
        bytes32 snapshotHash;
        uint256 observedBlockNumber;
        bytes32 observedBlockHash;
        uint64 observedBlockTimestamp;
        bytes32 testPackHash;
        bytes32 evidenceDigest;
        uint8 purpose;
        uint8 mode;
        uint8 result;
        uint64 issuedAt;
        uint64 expiresAt;
        bytes32 receiptId;
    }

    /// @notice keccak256 of the exact EIP-712 type string for AcceptanceReceipt.
    bytes32 internal constant RECEIPT_TYPEHASH = keccak256(
        "AcceptanceReceipt(bytes32 campaignId,bytes32 campaignPolicyHash,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32 snapshotHash,uint256 observedBlockNumber,bytes32 observedBlockHash,uint64 observedBlockTimestamp,bytes32 testPackHash,bytes32 evidenceDigest,uint8 purpose,uint8 mode,uint8 result,uint64 issuedAt,uint64 expiresAt,bytes32 receiptId)"
    );

    /// @notice keccak256 of the EIP-712 domain type string.
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice keccak256("PatchBond").
    bytes32 internal constant NAME_HASH = keccak256("PatchBond");

    /// @notice keccak256("1").
    bytes32 internal constant VERSION_HASH = keccak256("1");

    /// @notice policyHash = keccak256(abi.encode(policy)).
    function policyHash(Policy memory policy) internal pure returns (bytes32) {
        return keccak256(abi.encode(policy));
    }

    /// @notice snapshotHash = keccak256(abi.encode(snapshot)).
    function snapshotHash(Snapshot memory snapshot) internal pure returns (bytes32) {
        return keccak256(abi.encode(snapshot));
    }

    /// @notice deploymentKey = keccak256(abi.encode(sourceChainId, entrypoint, marketSelector)).
    /// @dev marketSelector == bytes32(0) means "no submarket selector".
    function deploymentKey(uint256 sourceChainId, address entrypoint, bytes32 marketSelector)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(sourceChainId, entrypoint, marketSelector));
    }

    /// @notice Double-hashed Merkle leaf compatible with a sorted-pair tree.
    /// @dev The policy hash is deliberately NOT part of the leaf (it would make eligibilityRoot and policyHash circular).
    function eligibilityLeaf(bytes32 campaignId, uint256 sourceChainId, bytes32 deploymentKey_, address recipient)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(bytes.concat(keccak256(abi.encode(campaignId, sourceChainId, deploymentKey_, recipient))));
    }

    /// @notice EIP-712 domain separator: name "PatchBond", version "1", chainId = destination chain,
    /// verifyingContract = the campaign on the destination chain (never the source chain or source registry).
    function domainSeparator(uint256 destinationChainId, address campaign) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, destinationChainId, campaign));
    }

    /// @notice receiptStructHash = keccak256(abi.encode(RECEIPT_TYPEHASH, receipt)).
    /// @dev Valid EIP-712 encodeData because every receipt member is a static type.
    function receiptStructHash(AcceptanceReceipt memory receipt) internal pure returns (bytes32) {
        return keccak256(abi.encode(RECEIPT_TYPEHASH, receipt));
    }

    /// @notice receiptDigest = keccak256(0x1901 || domainSeparator || receiptStructHash).
    function receiptDigest(uint256 destinationChainId, address campaign, AcceptanceReceipt memory receipt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(hex"1901", domainSeparator(destinationChainId, campaign), receiptStructHash(receipt))
        );
    }
}
