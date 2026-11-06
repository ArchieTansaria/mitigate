// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";

/// @title IAcceptanceVerifier
/// @notice PB-16 interface: validates PB-03 acceptance receipts against a PB-15 campaign registry and lets only the
/// campaign contract consume a receipt once.
/// @dev A passing validation proves only that the configured verifier signed these exact fields in scope for this
/// campaign. It never moves funds and never records a claim. The campaign contract performs its own accounting.
interface IAcceptanceVerifier {
    // ---------------------------------------------------------------- events

    event ReceiptConsumed(
        bytes32 indexed campaignId,
        bytes32 indexed receiptId,
        address indexed recipient,
        bytes32 deploymentKey,
        bytes32 digest
    );

    // ---------------------------------------------------------------- errors

    error InvalidRegistry();
    /// @dev Campaign id is zero or not present in the registry.
    error UnknownCampaign(bytes32 campaignId);
    error RegistryPolicyHashMismatch(bytes32 campaignId);
    error WrongDestinationChain(uint256 given, uint256 expected);
    error PolicyHashMismatch(bytes32 given, bytes32 expected);
    error SourceChainMismatch(uint256 given, uint256 expected);
    error TestPackMismatch(bytes32 given, bytes32 expected);
    /// @dev `field` is a short ASCII label, e.g. bytes32("receiptId").
    error ZeroField(bytes32 field);
    error SnapshotHashMismatch(bytes32 given, bytes32 expected);
    /// @dev The observed source block cannot be newer than the receipt's issuance time.
    error SnapshotAfterIssuance(uint64 observedBlockTimestamp, uint64 issuedAt);
    error InvalidPurpose(uint8 given);
    error InvalidMode(uint8 given);
    error InvalidResult(uint8 given);
    error InvalidTimeWindow(uint64 issuedAt, uint64 expiresAt);
    error ReceiptNotYetValid(uint64 issuedAt, uint256 nowTs);
    error ReceiptExpired(uint64 expiresAt, uint256 nowTs);
    error ReceiptTooOld(uint64 issuedAt, uint64 maxReceiptAge, uint256 nowTs);
    error RecipientMismatch(address given, address registered);
    error NotEligible();
    error InvalidSignatureLength(uint256 length);
    error InvalidSignatureV(uint8 v);
    error HighSSignature(bytes32 s);
    error InvalidSignature();
    error InvalidSigner(address recovered, address expected);
    error ReceiptAlreadyConsumed(bytes32 campaignId, bytes32 receiptId);
    error CallerNotCampaign(address caller, address campaign);

    // ---------------------------------------------------------------- reads

    /// @notice Registry the verifier reads policy and eligibility from. Fixed at construction.
    function registry() external view returns (address);

    /// @notice Full validation with no state change. Reverts with a specific error on any failure.
    /// @dev Callable by anyone: it is a dry run. It does not authorize consumption.
    /// @return digest The EIP-712 digest that the policy verifier signed.
    function validateReceipt(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata proof
    ) external view returns (bytes32 digest);

    /// @notice EIP-712 digest for `receipt` under domain PatchBond/1/policy.destinationChainId/policy.campaign.
    /// @dev Reverts UnknownCampaign. Use it to sign a receipt off-chain with the same bytes this contract checks.
    function receiptDigestOf(PatchBondTypes.AcceptanceReceipt calldata receipt) external view returns (bytes32);

    function isConsumed(bytes32 campaignId, bytes32 receiptId) external view returns (bool);

    // ---------------------------------------------------------------- write

    /// @notice Validate and mark a receipt consumed. Only `policy.campaign` may call.
    /// @dev Call this from the campaign in the same transaction that reserves the grant. Any later revert in that
    /// transaction also reverts the consumption. Reverts atomically on any failure.
    function consumeReceipt(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata proof
    ) external returns (bytes32 digest);
}
