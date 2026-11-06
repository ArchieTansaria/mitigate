// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";

/// @title IRemediationCampaign
/// @notice Read surface, errors and lifecycle of the supplier-funded campaign escrow. PB-17 funds and activates it;
/// PB-18 adds the per-deployment claim lifecycle (submit, finalize, withdraw).
/// @dev Accounting identity from the trust model:
///      deposited = unallocated + reserved + awardedUnwithdrawn + paid + refunded.
/// PB-17 moves `deposited` and `unallocated`. PB-18 moves value between `unallocated`, `reserved`,
/// `awardedUnwithdrawn` and `paid`. `refunded` stays zero until a later task adds recovery.
interface IRemediationCampaign {
    struct Accounting {
        uint256 deposited;
        uint256 unallocated;
        uint256 reserved;
        uint256 awardedUnwithdrawn;
        uint256 paid;
        uint256 refunded;
    }

    /// @notice Lifecycle of one deployment's claim. Disputed and Rejected are entered by the later challenge/review
    /// task; nothing in PB-18 sets them. A deployment may be claimed again only from None or Rejected.
    enum ClaimStatus {
        None,
        Pending,
        Disputed,
        Rejected,
        Awarded,
        Withdrawn
    }

    // ---------------------------------------------------------------- events

    /// @notice `amount` was pulled from the supplier and counted. `remaining` is the shortfall still to fund.
    event Funded(address indexed supplier, uint256 amount, uint256 totalFunded, uint256 remaining);

    /// @notice Full funding was confirmed and the campaign activated. No term can change afterwards.
    event Activated(bytes32 indexed campaignId, uint256 funded);

    /// @notice A valid receipt reserved one grant for `deploymentKey`. `recipient` is fixed by the committed leaf.
    event ClaimSubmitted(
        bytes32 indexed deploymentKey,
        address indexed recipient,
        bytes32 indexed receiptId,
        address submitter,
        uint64 challengeCutoff
    );

    /// @notice The challenge window ended without a challenge; the reservation became an unwithdrawn award.
    event ClaimFinalized(bytes32 indexed deploymentKey, address indexed recipient, uint256 amount);

    /// @notice The recipient pulled their awarded grant.
    event GrantWithdrawn(bytes32 indexed deploymentKey, address indexed recipient, uint256 amount);

    // ---------------------------------------------------------------- errors (construction)

    error InvalidRegistry();
    error InvalidVerifier();
    error VerifierRegistryMismatch(address verifierRegistry, address registry);
    error CampaignNotFound(bytes32 campaignId);
    error WrongDestinationChain(uint256 given, uint256 expected);
    error CampaignAddressMismatch(address policyCampaign, address thisCampaign);
    error TokenMismatch(address configured, address policyToken);
    error NoTokenCode(address token);
    error TokenDecimalsUnavailable(address token);
    error UnsupportedTokenDecimals(uint8 given);
    error PolicyHashMismatch(bytes32 computed, bytes32 registryHash);
    error RequiredFundingMismatch(uint256 registryValue, uint256 computed);

    // ---------------------------------------------------------------- errors (funding)

    error NotSupplier(address caller, address supplier);
    error ZeroAmount();
    error Overfunding(uint256 amount, uint256 remaining);
    error FeeOnTransferDetected(uint256 expected, uint256 received);
    error DeadlinePassed(uint64 claimDeadline, uint256 nowTs);
    error NotFullyFunded(uint256 funded, uint256 required);
    error AlreadyActive();

    // ---------------------------------------------------------------- errors (claims)

    error CampaignNotActive();
    error ClaimDeadlinePassed(uint64 claimDeadline, uint256 nowTs);
    error DeploymentAlreadyClaimed(bytes32 deploymentKey);
    /// @dev Unreachable when the committed eligibility root has at most `eligibleCount` leaves; guards a root that
    /// commits more deployments than the funded budget can pay.
    error InsufficientUnallocated(uint256 available, uint256 required);
    error ChallengeWindowOpen(uint64 challengeCutoff, uint256 nowTs);
    error ClaimNotPending(bytes32 deploymentKey, ClaimStatus status);
    error ClaimNotAwarded(bytes32 deploymentKey, ClaimStatus status);
    error NotRecipient(address caller, address recipient);
    /// @dev The token moved a different amount than the grant (short or excessive transfer). `actual` is the
    /// recipient's balance change or the campaign's balance change, whichever differed.
    error PayoutAmountMismatch(uint256 expected, uint256 actual);

    // ---------------------------------------------------------------- reads

    /// @notice The bound campaign policy, exactly as registered in PB-15.
    function policy() external view returns (PatchBondTypes.Policy memory);

    /// @notice PB-03 policy hash of `policy()`.
    function policyHash() external view returns (bytes32);

    function campaignId() external view returns (bytes32);
    function registry() external view returns (address);
    function verifier() external view returns (address);
    function token() external view returns (address);
    function supplier() external view returns (address);

    /// @notice eligibleCount * grantAmount in token base units (6 decimals).
    function requiredFunding() external view returns (uint256);

    /// @notice Amount counted through `fund` only. Direct token transfers are not included.
    function funded() external view returns (uint256);

    /// @notice requiredFunding - funded.
    function remainingFunding() external view returns (uint256);

    function active() external view returns (bool);

    function accounting() external view returns (Accounting memory);

    /// @notice State of one deployment's claim. `recipient` is fixed by the committed leaf and `challengeCutoff` is
    /// fixed at submission (`submission time + policy.challengeWindow`). `withdrawable` is the grant while Awarded,
    /// otherwise 0. An unclaimed deployment returns all zeros.
    function claimOf(bytes32 deploymentKey)
        external
        view
        returns (
            ClaimStatus status,
            address recipient,
            bytes32 receiptId,
            uint64 challengeCutoff,
            uint256 withdrawable
        );

    /// @notice Token balance held beyond the tracked deposit (direct transfers). Never counted, never withdrawable.
    function untrackedTokenBalance() external view returns (uint256);

    // ---------------------------------------------------------------- writes (supplier only)

    /// @notice Pull exactly `amount` from the supplier. Reverts on zero, overfunding, a short transfer or after the
    /// claim deadline.
    function fund(uint256 amount) external;

    /// @notice Activate once tracked funding equals the required funding and the claim deadline is still ahead.
    function activate() external;

    // ---------------------------------------------------------------- claim lifecycle

    /// @notice Validate a receipt through the PB-16 verifier and reserve exactly one grant for its deployment.
    /// @dev Anyone may relay. Requires an active campaign, `now < claimDeadline`, and no live claim for the
    /// deployment. The reservation and the verifier's consumption of the receipt happen in one transaction, so a
    /// failure anywhere rolls both back. The recipient comes from the receipt's committed leaf, never `msg.sender`.
    /// Transfers no tokens.
    function submitClaim(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata eligibilityProof
    ) external;

    /// @notice Turn a Pending claim into an Awarded one once its original challenge cutoff has been reached.
    /// @dev Anyone may call. Moves one grant from `reserved` to `awardedUnwithdrawn`. Transfers no tokens.
    function finalizeClaim(bytes32 deploymentKey) external;

    /// @notice Pay an Awarded grant to its fixed recipient. Only the recipient may call.
    /// @dev Moves one grant from `awardedUnwithdrawn` to `paid` and transfers exactly that amount. If the token
    /// transfer fails or moves a different amount, the whole call reverts and the claim stays Awarded.
    function withdrawGrant(bytes32 deploymentKey) external;
}
