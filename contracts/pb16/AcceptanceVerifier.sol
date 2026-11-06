// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "../pb15/ICampaignRegistry.sol";
import {IAcceptanceVerifier} from "./IAcceptanceVerifier.sol";

/// @title AcceptanceVerifier
/// @notice PB-16: validates frozen PB-03 AcceptanceReceipts against the PB-15 campaign registry and provides a
/// campaign-only, once-per-(campaignId, receiptId) consume path.
/// @dev What a pass means: the policy's `verifier` signed exactly these receipt fields under the EIP-712 domain
/// PatchBond / 1 / policy.destinationChainId / policy.campaign, and the fields are consistent with the stored
/// policy, the eligibility root, the snapshot and the time rules. It does NOT prove tests were run honestly, does
/// not verify `policy.confirmations` (the receipt has no confirmations field; the signer attests to it), does not
/// check `claimDeadline` or one-active-claim-per-deployment (the campaign contract owns those), and holds no funds.
/// There is no owner, no admin and no way to change the registry.
contract AcceptanceVerifier is IAcceptanceVerifier {
    /// @dev secp256k1 curve order / 2. Signatures with s above this are malleable twins and are rejected.
    uint256 private constant _HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    ICampaignRegistry private immutable _registry;

    mapping(bytes32 campaignId => mapping(bytes32 receiptId => bool)) private _consumed;

    constructor(ICampaignRegistry registry_) {
        if (address(registry_).code.length == 0) revert InvalidRegistry();
        _registry = registry_;
    }

    // ------------------------------------------------------------------ reads

    /// @inheritdoc IAcceptanceVerifier
    function registry() external view returns (address) {
        return address(_registry);
    }

    /// @inheritdoc IAcceptanceVerifier
    function validateReceipt(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata proof
    ) external view returns (bytes32 digest) {
        PatchBondTypes.Policy memory policy = _loadPolicy(receipt.campaignId);
        return _validate(receipt, policy, signature, proof);
    }

    /// @inheritdoc IAcceptanceVerifier
    function receiptDigestOf(PatchBondTypes.AcceptanceReceipt calldata receipt) external view returns (bytes32) {
        PatchBondTypes.Policy memory policy = _loadPolicy(receipt.campaignId);
        return PatchBondTypes.receiptDigest(policy.destinationChainId, policy.campaign, receipt);
    }

    /// @inheritdoc IAcceptanceVerifier
    function isConsumed(bytes32 campaignId, bytes32 receiptId) external view returns (bool) {
        return _consumed[campaignId][receiptId];
    }

    // ------------------------------------------------------------------ consume

    /// @inheritdoc IAcceptanceVerifier
    function consumeReceipt(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata proof
    ) external returns (bytes32 digest) {
        PatchBondTypes.Policy memory policy = _loadPolicy(receipt.campaignId);
        // Only the campaign contract may burn a receipt. A public submitter can never consume (front-run) it.
        if (msg.sender != policy.campaign) revert CallerNotCampaign(msg.sender, policy.campaign);

        digest = _validate(receipt, policy, signature, proof);

        _consumed[receipt.campaignId][receipt.receiptId] = true;
        emit ReceiptConsumed(receipt.campaignId, receipt.receiptId, receipt.recipient, receipt.deploymentKey, digest);
    }

    // ------------------------------------------------------------------ validation

    function _loadPolicy(bytes32 campaignId) private view returns (PatchBondTypes.Policy memory policy) {
        if (campaignId == bytes32(0) || !_registry.campaignExists(campaignId)) revert UnknownCampaign(campaignId);
        policy = _registry.policyOf(campaignId);
    }

    function _validate(
        PatchBondTypes.AcceptanceReceipt calldata r,
        PatchBondTypes.Policy memory policy,
        bytes calldata signature,
        bytes32[] calldata proof
    ) private view returns (bytes32 digest) {
        if (_consumed[r.campaignId][r.receiptId]) revert ReceiptAlreadyConsumed(r.campaignId, r.receiptId);

        _checkScope(r, policy);
        _checkSnapshot(r);
        _checkEnums(r);
        _checkTime(r, policy);
        _checkEligibility(r, proof);

        digest = PatchBondTypes.receiptDigest(policy.destinationChainId, policy.campaign, r);
        _checkSignature(digest, signature, policy.verifier);
    }

    /// @dev Campaign, policy hash, chains and test pack must match the stored policy exactly.
    function _checkScope(PatchBondTypes.AcceptanceReceipt calldata r, PatchBondTypes.Policy memory policy)
        private
        view
    {
        // The EIP-712 domain uses policy.destinationChainId, so it must be this chain.
        if (policy.destinationChainId != block.chainid) {
            revert WrongDestinationChain(policy.destinationChainId, block.chainid);
        }

        // Defence in depth: the registry's stored hash must still equal the hash of the policy it returns.
        bytes32 policyHash = _registry.policyHashOf(r.campaignId);
        if (PatchBondTypes.policyHash(policy) != policyHash) revert RegistryPolicyHashMismatch(r.campaignId);

        if (r.campaignPolicyHash != policyHash) revert PolicyHashMismatch(r.campaignPolicyHash, policyHash);
        if (r.sourceChainId != policy.sourceChainId) revert SourceChainMismatch(r.sourceChainId, policy.sourceChainId);
        if (r.testPackHash != policy.testPackHash) revert TestPackMismatch(r.testPackHash, policy.testPackHash);
    }

    /// @dev Nonzero identifiers, observedBlockTimestamp in (0, issuedAt], and a snapshot hash rebuilt from the
    /// receipt's own observed-block fields.
    function _checkSnapshot(PatchBondTypes.AcceptanceReceipt calldata r) private pure {
        if (r.observedBlockNumber == 0) revert ZeroField("observedBlockNumber");
        if (r.observedBlockHash == bytes32(0)) revert ZeroField("observedBlockHash");
        if (r.evidenceDigest == bytes32(0)) revert ZeroField("evidenceDigest");
        if (r.receiptId == bytes32(0)) revert ZeroField("receiptId");

        // Snapshot time consistency: the observed block must have a timestamp and cannot postdate the receipt.
        if (r.observedBlockTimestamp == 0) revert ZeroField("observedBlockTimestamp");
        if (r.observedBlockTimestamp > r.issuedAt) revert SnapshotAfterIssuance(r.observedBlockTimestamp, r.issuedAt);

        bytes32 expected = PatchBondTypes.snapshotHash(
            PatchBondTypes.Snapshot({
                chainId: r.sourceChainId,
                blockNumber: r.observedBlockNumber,
                blockHash: r.observedBlockHash,
                blockTimestamp: r.observedBlockTimestamp
            })
        );
        if (r.snapshotHash != expected) revert SnapshotHashMismatch(r.snapshotHash, expected);
    }

    /// @dev Only purpose = 1 (campaign-claim), mode = 1 (deployed), result = 1 (pass) is acceptable.
    function _checkEnums(PatchBondTypes.AcceptanceReceipt calldata r) private pure {
        if (r.purpose != 1) revert InvalidPurpose(r.purpose);
        if (r.mode != 1) revert InvalidMode(r.mode);
        if (r.result != 1) revert InvalidResult(r.result);
    }

    /// @dev issuedAt <= now <= expiresAt, expiresAt > issuedAt, now - issuedAt <= maxReceiptAge.
    function _checkTime(PatchBondTypes.AcceptanceReceipt calldata r, PatchBondTypes.Policy memory policy)
        private
        view
    {
        if (r.expiresAt <= r.issuedAt) revert InvalidTimeWindow(r.issuedAt, r.expiresAt);
        if (r.issuedAt > block.timestamp) revert ReceiptNotYetValid(r.issuedAt, block.timestamp);
        if (block.timestamp > r.expiresAt) revert ReceiptExpired(r.expiresAt, block.timestamp);
        // issuedAt <= now is established above, so the subtraction cannot underflow.
        if (block.timestamp - r.issuedAt > policy.maxReceiptAge) {
            revert ReceiptTooOld(r.issuedAt, policy.maxReceiptAge, block.timestamp);
        }
    }

    /// @dev Recipient is fixed by the committed leaf. A deployment already recorded with a recipient must match it.
    function _checkEligibility(PatchBondTypes.AcceptanceReceipt calldata r, bytes32[] calldata proof) private view {
        if (!_registry.isEligible(r.campaignId, r.sourceChainId, r.deploymentKey, r.recipient, proof)) {
            revert NotEligible();
        }
        address registered = _registry.recipientOf(r.campaignId, r.deploymentKey);
        if (registered != address(0) && registered != r.recipient) revert RecipientMismatch(r.recipient, registered);
    }

    /// @dev Strict 65-byte (r, s, v) ECDSA: v in {27, 28}, s in the lower half order, nonzero recovered signer.
    function _checkSignature(bytes32 digest, bytes calldata signature, address expectedSigner) private pure {
        if (signature.length != 65) revert InvalidSignatureLength(signature.length);

        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);

        if (v != 27 && v != 28) revert InvalidSignatureV(v);
        if (uint256(s) > _HALF_N) revert HighSSignature(s);

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
        if (recovered != expectedSigner) revert InvalidSigner(recovered, expectedSigner);
    }
}
