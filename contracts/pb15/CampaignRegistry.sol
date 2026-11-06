// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "./ICampaignRegistry.sol";

/// @title CampaignRegistry
/// @notice PB-15: immutable campaign identity/terms and recipient-bound eligible-deployment proofs.
/// @dev Scope is deliberately narrow. This contract has no owner, no edit path, no token handling, no funding or
/// activation, no receipt/signature verification, no claim state and no cross-chain transport. A campaign's
/// policy is written once in `createCampaign` and can never change. Later contracts consume it through
/// `ICampaignRegistry`. `sourceRegistry` is the only address field allowed to be zero.
///
/// Deadline note: `claimDeadline` is validated at creation only. Whether eligibility registration or claims are
/// rejected after the deadline is for the later claim contract; registration here records nothing financial.
contract CampaignRegistry is ICampaignRegistry {
    /// @notice The only token decimal count this registry accepts (USDC, 6 decimals).
    uint8 public constant SUPPORTED_USDC_DECIMALS = 6;

    mapping(bytes32 campaignId => PatchBondTypes.Policy) private _policies;
    mapping(bytes32 campaignId => bytes32) private _policyHashes;
    mapping(bytes32 campaignId => uint256) private _registeredCount;
    /// @dev Keyed by (campaignId, deploymentKey); sourceChainId is fixed per campaign by its policy.
    mapping(bytes32 campaignId => mapping(bytes32 deploymentKey => address)) private _recipients;

    // ------------------------------------------------------------------ creation

    /// @inheritdoc ICampaignRegistry
    function createCampaign(PatchBondTypes.Policy calldata policy) external returns (bytes32 policyHash) {
        // Copy once: PatchBondTypes hashes memory structs, and storage copy reads from memory.
        PatchBondTypes.Policy memory p = policy;

        // Identity and authorization.
        if (p.campaignId == bytes32(0)) revert ZeroHash("campaignId");
        if (p.supplier == address(0)) revert ZeroAddress("supplier");
        if (msg.sender != p.supplier) revert Unauthorized(msg.sender, p.supplier);
        if (_policyHashes[p.campaignId] != bytes32(0)) revert CampaignAlreadyExists(p.campaignId);

        // Roles. `sourceRegistry` may be zero (explicit direct-signed mode); `campaign` may not, because the
        // PB-03 EIP-712 domain binds the campaign address as verifyingContract.
        if (p.campaign == address(0)) revert ZeroAddress("campaign");
        if (p.verifier == address(0)) revert ZeroAddress("verifier");
        if (p.challenger == address(0)) revert ZeroAddress("challenger");
        if (p.reviewer == address(0)) revert ZeroAddress("reviewer");
        // The reviewer must be independent of both the funder (supplier) and the receipt signer (verifier).
        if (p.reviewer == p.supplier) revert RoleSeparationViolated(p.supplier, p.reviewer);
        if (p.reviewer == p.verifier) revert ReviewerIsVerifier(p.reviewer);

        // Chain and token.
        if (p.sourceChainId == 0) revert ZeroSourceChainId();
        if (p.destinationChainId != block.chainid) revert WrongDestinationChain(p.destinationChainId, block.chainid);
        if (p.token == address(0)) revert ZeroAddress("token");
        if (p.tokenDecimals != SUPPORTED_USDC_DECIMALS) revert UnsupportedTokenDecimals(p.tokenDecimals);

        // Commitments.
        if (p.eligibilityRoot == bytes32(0)) revert ZeroHash("eligibilityRoot");
        if (p.repairPolicyHash == bytes32(0)) revert ZeroHash("repairPolicyHash");
        if (p.testPackHash == bytes32(0)) revert ZeroHash("testPackHash");

        // Budget: positive count and grant, and eligibleCount * grantAmount must not overflow.
        if (p.eligibleCount == 0) revert ZeroEligibleCount();
        if (p.grantAmount == 0) revert ZeroGrantAmount();
        if (p.grantAmount > type(uint256).max / p.eligibleCount) {
            revert RequiredFundingOverflow(p.eligibleCount, p.grantAmount);
        }

        // Time.
        if (p.claimDeadline <= block.timestamp) revert DeadlineNotInFuture(p.claimDeadline, block.timestamp);
        if (p.challengeWindow == 0) revert ZeroDuration("challengeWindow");
        if (p.reviewTimeout == 0) revert ZeroDuration("reviewTimeout");
        if (p.maxReceiptAge == 0) revert ZeroDuration("maxReceiptAge");
        if (p.evidenceRetention == 0) revert ZeroDuration("evidenceRetention");

        // Frozen policy controls: required source-chain confirmations must be positive.
        if (p.confirmations == 0) revert ZeroConfirmations();

        policyHash = PatchBondTypes.policyHash(p);
        _policies[p.campaignId] = p;
        _policyHashes[p.campaignId] = policyHash;

        emit CampaignCreated(p.campaignId, p.supplier, policyHash, p.eligibleCount, p.grantAmount, p.eligibleCount * p.grantAmount);
    }

    // ------------------------------------------------------------------ eligibility

    /// @inheritdoc ICampaignRegistry
    function registerEligibleDeployment(
        bytes32 campaignId,
        uint256 sourceChainId,
        bytes32 deploymentKey,
        address recipient,
        bytes32[] calldata proof
    ) external {
        if (_policyHashes[campaignId] == bytes32(0)) revert CampaignNotFound(campaignId);
        PatchBondTypes.Policy storage policy = _policies[campaignId];

        if (recipient == address(0)) revert ZeroRecipient();
        if (deploymentKey == bytes32(0)) revert ZeroDeploymentKey();
        if (sourceChainId != policy.sourceChainId) revert SourceChainMismatch(sourceChainId, policy.sourceChainId);

        address existing = _recipients[campaignId][deploymentKey];
        if (existing != address(0)) revert DeploymentAlreadyRegistered(campaignId, deploymentKey, existing);

        uint256 count = _registeredCount[campaignId];
        if (count >= policy.eligibleCount) revert EligibleCountReached(campaignId, policy.eligibleCount);

        if (!_verify(policy.eligibilityRoot, campaignId, sourceChainId, deploymentKey, recipient, proof)) {
            revert InvalidEligibilityProof();
        }

        _recipients[campaignId][deploymentKey] = recipient;
        _registeredCount[campaignId] = count + 1;

        emit EligibleDeploymentRegistered(campaignId, deploymentKey, recipient, sourceChainId, msg.sender);
    }

    // ------------------------------------------------------------------ reads

    /// @inheritdoc ICampaignRegistry
    function campaignExists(bytes32 campaignId) external view returns (bool) {
        return _policyHashes[campaignId] != bytes32(0);
    }

    /// @inheritdoc ICampaignRegistry
    function policyOf(bytes32 campaignId) external view returns (PatchBondTypes.Policy memory) {
        _requireCampaign(campaignId);
        return _policies[campaignId];
    }

    /// @inheritdoc ICampaignRegistry
    function policyHashOf(bytes32 campaignId) external view returns (bytes32) {
        _requireCampaign(campaignId);
        return _policyHashes[campaignId];
    }

    /// @inheritdoc ICampaignRegistry
    function requiredFundingOf(bytes32 campaignId) external view returns (uint256) {
        _requireCampaign(campaignId);
        PatchBondTypes.Policy storage policy = _policies[campaignId];
        return policy.eligibleCount * policy.grantAmount;
    }

    /// @inheritdoc ICampaignRegistry
    function isEligible(
        bytes32 campaignId,
        uint256 sourceChainId,
        bytes32 deploymentKey,
        address recipient,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (_policyHashes[campaignId] == bytes32(0)) return false;
        PatchBondTypes.Policy storage policy = _policies[campaignId];
        if (recipient == address(0) || deploymentKey == bytes32(0) || sourceChainId != policy.sourceChainId) {
            return false;
        }
        return _verify(policy.eligibilityRoot, campaignId, sourceChainId, deploymentKey, recipient, proof);
    }

    /// @inheritdoc ICampaignRegistry
    function isDeploymentRegistered(bytes32 campaignId, bytes32 deploymentKey) external view returns (bool) {
        return _recipients[campaignId][deploymentKey] != address(0);
    }

    /// @inheritdoc ICampaignRegistry
    function recipientOf(bytes32 campaignId, bytes32 deploymentKey) external view returns (address) {
        return _recipients[campaignId][deploymentKey];
    }

    /// @inheritdoc ICampaignRegistry
    function registeredCountOf(bytes32 campaignId) external view returns (uint256) {
        return _registeredCount[campaignId];
    }

    // ------------------------------------------------------------------ internals

    function _requireCampaign(bytes32 campaignId) private view {
        if (_policyHashes[campaignId] == bytes32(0)) revert CampaignNotFound(campaignId);
    }

    /// @dev Leaf is the frozen PB-03 double-hashed leaf; OpenZeppelin MerkleProof hashes each pair in sorted order.
    function _verify(
        bytes32 root,
        bytes32 campaignId,
        uint256 sourceChainId,
        bytes32 deploymentKey,
        address recipient,
        bytes32[] calldata proof
    ) private pure returns (bool) {
        bytes32 leaf = PatchBondTypes.eligibilityLeaf(campaignId, sourceChainId, deploymentKey, recipient);
        return MerkleProof.verifyCalldata(proof, root, leaf);
    }
}
