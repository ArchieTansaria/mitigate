// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";

/// @title IRemediationCampaign
/// @notice PB-17 read surface and errors for the supplier-funded campaign escrow. PB-18 extends the same contract
/// with claim state; the reads below are the stable part of that interface.
/// @dev Accounting identity from the trust model:
///      deposited = unallocated + reserved + awardedUnwithdrawn + paid + refunded.
/// In PB-17 only `deposited` and `unallocated` move; the other fields are always zero.
interface IRemediationCampaign {
    struct Accounting {
        uint256 deposited;
        uint256 unallocated;
        uint256 reserved;
        uint256 awardedUnwithdrawn;
        uint256 paid;
        uint256 refunded;
    }

    // ---------------------------------------------------------------- events

    /// @notice `amount` was pulled from the supplier and counted. `remaining` is the shortfall still to fund.
    event Funded(address indexed supplier, uint256 amount, uint256 totalFunded, uint256 remaining);

    /// @notice Full funding was confirmed and the campaign activated. No term can change afterwards.
    event Activated(bytes32 indexed campaignId, uint256 funded);

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

    /// @notice Token balance held beyond the tracked deposit (direct transfers). Never counted, never withdrawable.
    function untrackedTokenBalance() external view returns (uint256);

    // ---------------------------------------------------------------- writes (supplier only)

    /// @notice Pull exactly `amount` from the supplier. Reverts on zero, overfunding, a short transfer or after the
    /// claim deadline.
    function fund(uint256 amount) external;

    /// @notice Activate once tracked funding equals the required funding and the claim deadline is still ahead.
    function activate() external;
}
