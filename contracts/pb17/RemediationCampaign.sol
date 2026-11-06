// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "../pb15/ICampaignRegistry.sol";
import {IAcceptanceVerifier} from "../pb16/IAcceptanceVerifier.sol";
import {IRemediationCampaign} from "./IRemediationCampaign.sol";

/// @title RemediationCampaign
/// @notice PB-17: supplier-funded USDC escrow and full-funding activation for one registered campaign policy.
/// @dev Scope is deliberately narrow. There are no claims, challenges, refunds, receipt consumption or cross-chain
/// transport here (PB-18 and later extend this contract). It is not upgradeable, has no owner, and has no sweep or
/// rescue function: tokens sent directly to this address are not counted and cannot be withdrawn.
///
/// The campaign address must be known before the policy is registered (the policy commits `campaign`), so deploy
/// with CREATE2 or a computed CREATE address. The constructor takes only the registry, verifier, campaign id and
/// token, none of which depend on this contract's address.
///
/// Token assumptions: a plain ERC-20 with exactly 6 decimals. Fee-on-transfer tokens are rejected at deposit time.
/// Tokens that can blocklist or pause (such as USDC) can still block deposits for the blocked account.
contract RemediationCampaign is IRemediationCampaign, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev The only token decimal count accepted (USDC ERC-20 view).
    uint8 private constant _TOKEN_DECIMALS = 6;

    ICampaignRegistry private immutable _registry;
    IAcceptanceVerifier private immutable _verifier;
    IERC20 private immutable _token;
    bytes32 private immutable _campaignId;
    bytes32 private immutable _policyHash;
    uint256 private immutable _requiredFunding;
    address private immutable _supplier;
    uint64 private immutable _claimDeadline;

    PatchBondTypes.Policy private _policy;
    Accounting private _accounting;
    bool private _active;

    constructor(ICampaignRegistry registry_, IAcceptanceVerifier verifier_, bytes32 campaignId_, IERC20 token_) {
        if (address(registry_).code.length == 0) revert InvalidRegistry();
        if (address(verifier_).code.length == 0) revert InvalidVerifier();
        // The verifier must validate receipts against the same registry this campaign is bound to.
        address verifierRegistry = verifier_.registry();
        if (verifierRegistry != address(registry_)) revert VerifierRegistryMismatch(verifierRegistry, address(registry_));

        if (!registry_.campaignExists(campaignId_)) revert CampaignNotFound(campaignId_);
        PatchBondTypes.Policy memory p = registry_.policyOf(campaignId_);

        if (p.destinationChainId != block.chainid) revert WrongDestinationChain(p.destinationChainId, block.chainid);
        if (p.campaign != address(this)) revert CampaignAddressMismatch(p.campaign, address(this));

        if (address(token_) != p.token) revert TokenMismatch(address(token_), p.token);
        if (address(token_).code.length == 0) revert NoTokenCode(address(token_));
        try IERC20Metadata(address(token_)).decimals() returns (uint8 d) {
            if (d != _TOKEN_DECIMALS) revert UnsupportedTokenDecimals(d);
        } catch {
            revert TokenDecimalsUnavailable(address(token_));
        }

        // Exact PB-03 hash, and the registry's stored hash, must agree with the policy that is being bound.
        bytes32 computedHash = PatchBondTypes.policyHash(p);
        bytes32 registryHash = registry_.policyHashOf(campaignId_);
        if (computedHash != registryHash) revert PolicyHashMismatch(computedHash, registryHash);

        // Required funding is eligibleCount * grantAmount in integer base units, cross-checked with the registry.
        uint256 required = p.eligibleCount * p.grantAmount;
        uint256 registryRequired = registry_.requiredFundingOf(campaignId_);
        if (required != registryRequired) revert RequiredFundingMismatch(registryRequired, required);

        _registry = registry_;
        _verifier = verifier_;
        _token = token_;
        _campaignId = campaignId_;
        _policyHash = computedHash;
        _requiredFunding = required;
        _supplier = p.supplier;
        _claimDeadline = p.claimDeadline;
        _policy = p;
    }

    // ------------------------------------------------------------------ supplier actions

    /// @inheritdoc IRemediationCampaign
    function fund(uint256 amount) external nonReentrant {
        if (msg.sender != _supplier) revert NotSupplier(msg.sender, _supplier);
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= _claimDeadline) revert DeadlinePassed(_claimDeadline, block.timestamp);

        uint256 alreadyFunded = _accounting.deposited;
        uint256 remaining = _requiredFunding - alreadyFunded;
        if (amount > remaining) revert Overfunding(amount, remaining);

        // Effects first. If the transfer is short or fails, the whole call reverts and these are undone.
        uint256 newTotal = alreadyFunded + amount;
        _accounting.deposited = newTotal;
        _accounting.unallocated = newTotal;

        // Interaction: pull exactly `amount` and measure what actually arrived.
        uint256 balanceBefore = _token.balanceOf(address(this));
        _token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = _token.balanceOf(address(this));
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert FeeOnTransferDetected(amount, received);

        emit Funded(msg.sender, amount, newTotal, _requiredFunding - newTotal);
    }

    /// @inheritdoc IRemediationCampaign
    function activate() external nonReentrant {
        if (msg.sender != _supplier) revert NotSupplier(msg.sender, _supplier);
        if (_active) revert AlreadyActive();
        if (block.timestamp >= _claimDeadline) revert DeadlinePassed(_claimDeadline, block.timestamp);

        // Tracked funding only. The token balance is deliberately never consulted here.
        uint256 deposited = _accounting.deposited;
        if (deposited != _requiredFunding) revert NotFullyFunded(deposited, _requiredFunding);

        _active = true;
        emit Activated(_campaignId, deposited);
    }

    // ------------------------------------------------------------------ reads

    /// @inheritdoc IRemediationCampaign
    function policy() external view returns (PatchBondTypes.Policy memory) {
        return _policy;
    }

    /// @inheritdoc IRemediationCampaign
    function policyHash() external view returns (bytes32) {
        return _policyHash;
    }

    /// @inheritdoc IRemediationCampaign
    function campaignId() external view returns (bytes32) {
        return _campaignId;
    }

    /// @inheritdoc IRemediationCampaign
    function registry() external view returns (address) {
        return address(_registry);
    }

    /// @inheritdoc IRemediationCampaign
    function verifier() external view returns (address) {
        return address(_verifier);
    }

    /// @inheritdoc IRemediationCampaign
    function token() external view returns (address) {
        return address(_token);
    }

    /// @inheritdoc IRemediationCampaign
    function supplier() external view returns (address) {
        return _supplier;
    }

    /// @inheritdoc IRemediationCampaign
    function requiredFunding() external view returns (uint256) {
        return _requiredFunding;
    }

    /// @inheritdoc IRemediationCampaign
    function funded() external view returns (uint256) {
        return _accounting.deposited;
    }

    /// @inheritdoc IRemediationCampaign
    function remainingFunding() external view returns (uint256) {
        return _requiredFunding - _accounting.deposited;
    }

    /// @inheritdoc IRemediationCampaign
    function active() external view returns (bool) {
        return _active;
    }

    /// @inheritdoc IRemediationCampaign
    function accounting() external view returns (Accounting memory) {
        return _accounting;
    }

    /// @inheritdoc IRemediationCampaign
    function untrackedTokenBalance() external view returns (uint256) {
        uint256 balance = _token.balanceOf(address(this));
        uint256 tracked = _accounting.deposited;
        return balance > tracked ? balance - tracked : 0;
    }
}
