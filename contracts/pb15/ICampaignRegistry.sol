// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";

/// @title ICampaignRegistry
/// @notice PB-15 read surface and errors for the immutable campaign registry.
/// @dev Later campaign/acceptance contracts read policy, policy hash and eligibility state through this interface.
/// Nothing here edits terms, marks a receipt accepted, funds or activates a campaign.
interface ICampaignRegistry {
    // ---------------------------------------------------------------- events

    /// @notice Emitted once per campaign, at creation. The policy is immutable afterwards.
    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed supplier,
        bytes32 indexed policyHash,
        uint256 eligibleCount,
        uint256 grantAmount,
        uint256 requiredFunding
    );

    /// @notice Emitted once per (campaignId, deploymentKey): the recipient-bound proof was verified and recorded.
    event EligibleDeploymentRegistered(
        bytes32 indexed campaignId,
        bytes32 indexed deploymentKey,
        address indexed recipient,
        uint256 sourceChainId,
        address submitter
    );

    // ---------------------------------------------------------------- errors (creation)

    /// @dev `field` is a short ASCII label, e.g. bytes32("verifier").
    error ZeroAddress(bytes32 field);
    error ZeroHash(bytes32 field);
    error ZeroDuration(bytes32 field);
    error Unauthorized(address caller, address supplier);
    error CampaignAlreadyExists(bytes32 campaignId);
    error WrongDestinationChain(uint256 given, uint256 expected);
    error UnsupportedTokenDecimals(uint8 given);
    error ZeroEligibleCount();
    error ZeroGrantAmount();
    error RequiredFundingOverflow(uint256 eligibleCount, uint256 grantAmount);
    error DeadlineNotInFuture(uint64 claimDeadline, uint256 nowTs);
    error RoleSeparationViolated(address supplier, address reviewer);
    /// @dev The reviewer must differ from the verifier as well as the supplier.
    error ReviewerIsVerifier(address reviewer);
    error ZeroSourceChainId();
    error ZeroConfirmations();

    // ---------------------------------------------------------------- errors (eligibility)

    error CampaignNotFound(bytes32 campaignId);
    error ZeroRecipient();
    error ZeroDeploymentKey();
    error SourceChainMismatch(uint256 given, uint256 expected);
    error DeploymentAlreadyRegistered(bytes32 campaignId, bytes32 deploymentKey, address recipient);
    error EligibleCountReached(bytes32 campaignId, uint256 eligibleCount);
    error InvalidEligibilityProof();

    // ---------------------------------------------------------------- writes

    /// @notice Create a campaign. Only `policy.supplier` may call. All terms are fixed forever.
    /// @return policyHash keccak256(abi.encode(policy)) as defined by PatchBondTypes.policyHash.
    function createCampaign(PatchBondTypes.Policy calldata policy) external returns (bytes32 policyHash);

    /// @notice Verify a recipient-bound sorted-pair Merkle proof and record the deployment's fixed recipient.
    /// @dev Permissionless: any submitter may relay. The recipient comes from the leaf, never from msg.sender.
    /// A (campaignId, deploymentKey) pair can be recorded once, whoever submits.
    function registerEligibleDeployment(
        bytes32 campaignId,
        uint256 sourceChainId,
        bytes32 deploymentKey,
        address recipient,
        bytes32[] calldata proof
    ) external;

    // ---------------------------------------------------------------- reads

    function campaignExists(bytes32 campaignId) external view returns (bool);

    /// @dev Reverts CampaignNotFound.
    function policyOf(bytes32 campaignId) external view returns (PatchBondTypes.Policy memory);

    /// @dev Reverts CampaignNotFound.
    function policyHashOf(bytes32 campaignId) external view returns (bytes32);

    /// @dev eligibleCount * grantAmount, checked at creation. Reverts CampaignNotFound.
    function requiredFundingOf(bytes32 campaignId) external view returns (uint256);

    /// @notice Pure proof check; returns false (never reverts) for unknown campaign, wrong source chain,
    /// zero recipient/deployment key, or an invalid proof. Does not read or change registration state.
    function isEligible(
        bytes32 campaignId,
        uint256 sourceChainId,
        bytes32 deploymentKey,
        address recipient,
        bytes32[] calldata proof
    ) external view returns (bool);

    /// @notice True once the deployment's proof has been verified and recorded.
    function isDeploymentRegistered(bytes32 campaignId, bytes32 deploymentKey) external view returns (bool);

    /// @notice Fixed recipient recorded for a deployment; address(0) when not registered.
    function recipientOf(bytes32 campaignId, bytes32 deploymentKey) external view returns (address);

    /// @notice Number of deployments recorded so far (never exceeds the policy's eligibleCount).
    function registeredCountOf(bytes32 campaignId) external view returns (uint256);
}
