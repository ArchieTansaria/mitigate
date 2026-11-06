// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "../pb15/ICampaignRegistry.sol";
import {IAcceptanceVerifier} from "../pb16/IAcceptanceVerifier.sol";
import {IRemediationCampaign} from "./IRemediationCampaign.sol";

/// @title RemediationCampaign
/// @notice PB-17 escrow and PB-18 per-deployment claim lifecycle for one registered campaign policy.
/// @dev PB-17: the supplier funds the exact budget and activates. PB-18: once active, anyone can relay a signed
/// receipt for an eligible deployment; the PB-16 verifier consumes it and one grant is reserved for the receipt's
/// committed recipient. After the challenge cutoff anyone can finalize the claim, and only the recipient can pull
/// the grant. There are no challenges, reviews, refunds or cross-chain transport yet (later tasks). The contract is
/// not upgradeable, has no owner, and has no sweep or rescue function: tokens sent directly to this address are not
/// counted and cannot be withdrawn.
///
/// Each deployment key has its own claim, so claims progress independently of one another. A claim in Pending,
/// Disputed, Awarded or Withdrawn blocks a second claim for that deployment; only None or Rejected may be claimed
/// (Rejected is entered by the later challenge/review task, after it releases the reservation).
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
    address private immutable _challenger;
    address private immutable _reviewer;
    uint64 private immutable _claimDeadline;
    uint64 private immutable _challengeWindow;
    uint64 private immutable _reviewTimeout;
    uint256 private immutable _grantAmount;

    PatchBondTypes.Policy private _policy;
    Accounting private _accounting;
    bool private _active;

    struct Claim {
        ClaimStatus status;
        address recipient;
        bytes32 receiptId;
        uint64 challengeCutoff;
        uint64 reviewDeadline;
        address challenger;
        bytes32 reasonHash;
    }

    mapping(bytes32 deploymentKey => Claim) private _claims;

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
        _challenger = p.challenger;
        _reviewer = p.reviewer;
        _claimDeadline = p.claimDeadline;
        _challengeWindow = p.challengeWindow;
        _reviewTimeout = p.reviewTimeout;
        _grantAmount = p.grantAmount;
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

    // ------------------------------------------------------------------ claim lifecycle (PB-18)

    /// @inheritdoc IRemediationCampaign
    function submitClaim(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata eligibilityProof
    ) external nonReentrant {
        // Campaign-level preconditions come first, so nothing is consumed on a closed or inactive campaign.
        if (!_active) revert CampaignNotActive();
        if (block.timestamp >= _claimDeadline) revert ClaimDeadlinePassed(_claimDeadline, block.timestamp);

        bytes32 key = receipt.deploymentKey;
        ClaimStatus current = _claims[key].status;
        // Only an unclaimed or rejected deployment may take a (new) reservation.
        if (current != ClaimStatus.None && current != ClaimStatus.Rejected) revert DeploymentAlreadyClaimed(key);

        uint256 grant = _grantAmount;
        uint256 available = _accounting.unallocated;
        if (available < grant) revert InsufficientUnallocated(available, grant);

        // Effects: reserve exactly one grant and record the claim. The recipient is the receipt's recipient; the
        // verifier below only returns if that recipient is the one committed for this deployment in the
        // eligibility root, so a relayer cannot redirect the grant. Any revert below undoes these writes.
        uint64 cutoff = SafeCast.toUint64(block.timestamp + _challengeWindow);
        _accounting.unallocated = available - grant;
        _accounting.reserved += grant;
        _claims[key] = Claim({
            status: ClaimStatus.Pending,
            recipient: receipt.recipient,
            receiptId: receipt.receiptId,
            challengeCutoff: cutoff,
            reviewDeadline: 0,
            challenger: address(0),
            reasonHash: bytes32(0)
        });

        // Interaction: the verifier validates every PB-03/PB-16 rule against the registry and burns the receipt for
        // this campaign. It only accepts calls from `policy.campaign`, which is this contract.
        _verifier.consumeReceipt(receipt, signature, eligibilityProof);

        emit ClaimSubmitted(key, receipt.recipient, receipt.receiptId, msg.sender, cutoff);
    }

    /// @inheritdoc IRemediationCampaign
    function finalizeClaim(bytes32 deploymentKey) external nonReentrant {
        Claim storage claim = _claims[deploymentKey];
        if (claim.status != ClaimStatus.Pending) revert ClaimNotPending(deploymentKey, claim.status);
        // The cutoff was fixed when the claim was submitted and never moves.
        if (block.timestamp < claim.challengeCutoff) revert ChallengeWindowOpen(claim.challengeCutoff, block.timestamp);

        uint256 grant = _grantAmount;
        claim.status = ClaimStatus.Awarded;
        _accounting.reserved -= grant;
        _accounting.awardedUnwithdrawn += grant;

        emit ClaimFinalized(deploymentKey, claim.recipient, grant);
    }

    /// @inheritdoc IRemediationCampaign
    function withdrawGrant(bytes32 deploymentKey) external nonReentrant {
        Claim storage claim = _claims[deploymentKey];
        if (claim.status != ClaimStatus.Awarded) revert ClaimNotAwarded(deploymentKey, claim.status);
        address recipient = claim.recipient;
        if (msg.sender != recipient) revert NotRecipient(msg.sender, recipient);

        uint256 grant = _grantAmount;

        // Effects before the token call. A failed or short transfer reverts the whole call, undoing these.
        claim.status = ClaimStatus.Withdrawn;
        _accounting.awardedUnwithdrawn -= grant;
        _accounting.paid += grant;

        // Interaction: pay the committed recipient (never msg.sender by default) and verify the exact amounts that
        // moved, so a nonstandard token cannot record a full grant after a short or excessive transfer.
        uint256 recipientBefore = _token.balanceOf(recipient);
        uint256 campaignBefore = _token.balanceOf(address(this));
        _token.safeTransfer(recipient, grant);
        uint256 recipientAfter = _token.balanceOf(recipient);
        uint256 campaignAfter = _token.balanceOf(address(this));

        uint256 received = recipientAfter > recipientBefore ? recipientAfter - recipientBefore : 0;
        if (received != grant) revert PayoutAmountMismatch(grant, received);
        uint256 sent = campaignBefore > campaignAfter ? campaignBefore - campaignAfter : 0;
        if (sent != grant) revert PayoutAmountMismatch(grant, sent);

        emit GrantWithdrawn(deploymentKey, recipient, grant);
    }

    /// @inheritdoc IRemediationCampaign
    function claimOf(bytes32 deploymentKey)
        external
        view
        returns (
            ClaimStatus status,
            address recipient,
            bytes32 receiptId,
            uint64 challengeCutoff,
            uint256 withdrawable
        )
    {
        Claim storage claim = _claims[deploymentKey];
        status = claim.status;
        recipient = claim.recipient;
        receiptId = claim.receiptId;
        challengeCutoff = claim.challengeCutoff;
        withdrawable = status == ClaimStatus.Awarded ? _grantAmount : 0;
    }

    /// @inheritdoc IRemediationCampaign
    function reviewDeadlineOf(bytes32 deploymentKey) external view returns (uint64) {
        return _claims[deploymentKey].reviewDeadline;
    }

    /// @inheritdoc IRemediationCampaign
    function challengeOf(bytes32 deploymentKey)
        external
        view
        returns (address challenger, bytes32 reasonHash, uint64 reviewDeadline)
    {
        Claim storage claim = _claims[deploymentKey];
        return (claim.challenger, claim.reasonHash, claim.reviewDeadline);
    }

    // ------------------------------------------------------------------ challenges and bounded review (PB-19)

    /// @inheritdoc IRemediationCampaign
    function challengeClaim(bytes32 deploymentKey, bytes32 reasonHash) external nonReentrant {
        if (msg.sender != _supplier && msg.sender != _challenger) {
            revert NotChallenger(msg.sender);
        }
        if (reasonHash == bytes32(0)) revert ZeroReasonHash();

        Claim storage claim = _claims[deploymentKey];
        if (claim.status != ClaimStatus.Pending) revert ClaimNotPending(deploymentKey, claim.status);
        if (block.timestamp >= claim.challengeCutoff) {
            revert ChallengeWindowClosed(claim.challengeCutoff, block.timestamp);
        }

        uint64 reviewDeadline = SafeCast.toUint64(block.timestamp + _reviewTimeout);
        claim.status = ClaimStatus.Disputed;
        claim.reviewDeadline = reviewDeadline;
        claim.challenger = msg.sender;
        claim.reasonHash = reasonHash;

        emit ClaimChallenged(deploymentKey, msg.sender, reasonHash, reviewDeadline);
    }

    /// @inheritdoc IRemediationCampaign
    function resolveChallenge(bytes32 deploymentKey, bool award) external nonReentrant {
        if (msg.sender != _reviewer) revert NotReviewer(msg.sender, _reviewer);

        Claim storage claim = _claims[deploymentKey];
        if (claim.status != ClaimStatus.Disputed) revert ClaimNotDisputed(deploymentKey, claim.status);
        uint64 deadline = claim.reviewDeadline;
        if (block.timestamp >= deadline) revert ReviewWindowClosed(deadline, block.timestamp);

        uint256 grant = _grantAmount;
        _accounting.reserved -= grant;
        if (award) {
            claim.status = ClaimStatus.Awarded;
            _accounting.awardedUnwithdrawn += grant;
        } else {
            claim.status = ClaimStatus.Rejected;
            _accounting.unallocated += grant;
        }

        emit ChallengeResolved(deploymentKey, msg.sender, award, grant);
    }

    /// @inheritdoc IRemediationCampaign
    function expireChallenge(bytes32 deploymentKey) external nonReentrant {
        Claim storage claim = _claims[deploymentKey];
        if (claim.status != ClaimStatus.Disputed) revert ClaimNotDisputed(deploymentKey, claim.status);
        uint64 deadline = claim.reviewDeadline;
        if (block.timestamp < deadline) revert ReviewWindowOpen(deadline, block.timestamp);

        uint256 grant = _grantAmount;
        claim.status = ClaimStatus.Rejected;
        _accounting.reserved -= grant;
        _accounting.unallocated += grant;

        emit ChallengeExpired(deploymentKey, grant);
    }

    /// @inheritdoc IRemediationCampaign
    function recoverUnallocated() external nonReentrant returns (uint256 amount) {
        if (msg.sender != _supplier) revert NotSupplier(msg.sender, _supplier);
        if (block.timestamp < _claimDeadline) revert RecoveryNotOpen(_claimDeadline, block.timestamp);

        amount = _accounting.unallocated;
        if (amount == 0) revert NothingToRecover();

        // Checks-effects-interactions: reserved and awarded funds remain held for their claims. Failed or non-exact
        // token transfers revert the accounting update and can be retried by the supplier.
        _accounting.unallocated = 0;
        _accounting.refunded += amount;
        uint256 supplierBefore = _token.balanceOf(_supplier);
        uint256 campaignBefore = _token.balanceOf(address(this));
        _token.safeTransfer(_supplier, amount);
        uint256 supplierAfter = _token.balanceOf(_supplier);
        uint256 campaignAfter = _token.balanceOf(address(this));

        uint256 received = supplierAfter > supplierBefore ? supplierAfter - supplierBefore : 0;
        if (received != amount) revert PayoutAmountMismatch(amount, received);
        uint256 sent = campaignBefore > campaignAfter ? campaignBefore - campaignAfter : 0;
        if (sent != amount) revert PayoutAmountMismatch(amount, sent);

        emit UnallocatedRecovered(_supplier, amount);
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
        uint256 tracked = _accounting.deposited - _accounting.paid - _accounting.refunded;
        return balance > tracked ? balance - tracked : 0;
    }
}
