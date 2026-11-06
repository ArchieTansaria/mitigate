// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {ClaimBase, IFixtureMintable} from "../pb18/ClaimBase.sol";

/*
 * PB-19 EXPECTED API (test-first). None of this exists yet; these tests are the specification, and until it is
 * implemented this suite fails to compile with "member not found" errors. Production code is NOT touched by this
 * suite. It extends the PB-17/PB-18 `RemediationCampaign` / `IRemediationCampaign` without changing PB-18 behavior.
 * Source: IMPLEMENTATION_PLAN.md PB-19, the demo campaign policy and the trust model.
 *
 *   challengeClaim(bytes32 deploymentKey, bytes32 reasonHash)
 *       Callable only by policy.supplier or policy.challenger. Requires reasonHash != 0, status Pending and
 *       block.timestamp STRICTLY BEFORE the claim's original challengeCutoff. Sets Disputed and
 *       reviewDeadline = now + policy.reviewTimeout. The claim's challengeCutoff never moves. The reservation stays.
 *   resolveChallenge(bytes32 deploymentKey, bool award)
 *       Callable only by policy.reviewer, only while Disputed and STRICTLY BEFORE reviewDeadline.
 *       award = true : reserved -> awardedUnwithdrawn (exactly one grant), status Awarded.
 *       award = false: reserved -> unallocated (exactly one grant), status Rejected.
 *       Transfers no tokens.
 *   expireChallenge(bytes32 deploymentKey)
 *       Anyone, only while Disputed and AT OR AFTER reviewDeadline. Rejects the claim (reserved -> unallocated,
 *       status Rejected). A timeout never awards. Transfers no tokens.
 *   recoverUnallocated()
 *       policy.supplier only, AT OR AFTER policy.claimDeadline. Pays the entire `unallocated` balance to
 *       policy.supplier (never to anyone else) and moves it unallocated -> refunded. Reverts if it is zero.
 *       Reserved (Pending/Disputed) and awardedUnwithdrawn amounts are untouched. Works whether or not the campaign
 *       was ever activated (so partly funded deposits are not trapped). Can be called again later if more
 *       reservations are released. A failed token transfer reverts everything and is retryable.
 *   challengeOf(bytes32 deploymentKey) view
 *       returns (address challenger, bytes32 reasonHash, uint64 reviewDeadline). Zeros when never challenged.
 *       Kept after a resolution for audit and cleared when a Rejected deployment is claimed again.
 *   submitClaim (PB-18) is extended only in that a Rejected deployment may be claimed again before claimDeadline
 *       with a fresh signed receipt and a never-used receiptId. A consumed receiptId can never be replayed.
 *       The new claim gets its own status Pending and its own challengeCutoff = now + challengeWindow.
 *
 *   events:  ClaimChallenged(bytes32 indexed deploymentKey, address indexed challenger, bytes32 indexed reasonHash,
 *                            uint64 reviewDeadline)
 *            ClaimResolved(bytes32 indexed deploymentKey, address indexed recipient, bool awarded, uint256 amount)
 *            ChallengeExpired(bytes32 indexed deploymentKey, address indexed recipient, uint256 amount)
 *            UnallocatedRecovered(address indexed supplier, uint256 amount)
 *   errors:  NotChallenger(address caller)
 *            ZeroReasonHash()
 *            ChallengeWindowClosed(uint64 challengeCutoff, uint256 nowTs)
 *            NotReviewer(address caller)
 *            ClaimNotDisputed(bytes32 deploymentKey, ClaimStatus status)
 *            ReviewWindowClosed(uint64 reviewDeadline, uint256 nowTs)
 *            ReviewWindowOpen(uint64 reviewDeadline, uint256 nowTs)
 *            RecoveryNotOpen(uint64 claimDeadline, uint256 nowTs)
 *            NothingToRecover()
 *   Existing errors reused: ClaimNotPending, ClaimNotAwarded, NotSupplier, DeploymentAlreadyClaimed,
 *            ClaimDeadlinePassed, PayoutAmountMismatch, and the PB-16 verifier errors (ReceiptAlreadyConsumed ...).
 *
 * No fees, bonds, slashing or penalties. Accounting identity after every step:
 *   deposited = unallocated + reserved + awardedUnwithdrawn + paid + refunded.
 * All keys, addresses, ids and amounts are labeled fixtures. The real PB-15 registry and PB-16 verifier are used.
 */

interface IReceiveHook {
    function onTokenReceived() external;
}

/// @notice TEST-ONLY six-decimal token that calls the receiving contract after a transfer lands (ERC-777 style),
/// used to attempt reentrancy from a recipient or supplier callback.
contract FixtureHookReceiveToken is ERC20 {
    constructor() ERC20("FIXTURE hook-on-receive token", "fHOOKR") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to.code.length > 0) {
            try IReceiveHook(to).onTokenReceived() {} catch {}
        }
    }
}

/// @notice TEST-ONLY contract that, when paid, makes one armed low-level call back into a target and records the
/// result. It is a recipient or supplier stand-in; it never holds privileges of its own.
contract FixtureReentrantParty is IReceiveHook {
    address public target;
    bytes public attempt;
    bool public attempted;
    bool public attemptSucceeded;
    bytes public attemptError;

    function arm(address target_, bytes calldata attempt_) external {
        target = target_;
        attempt = attempt_;
        attempted = false;
    }

    function onTokenReceived() external {
        if (attempted || target == address(0)) return;
        attempted = true;
        (bool ok, bytes memory ret) = target.call(attempt);
        attemptSucceeded = ok;
        attemptError = ret;
    }
}

/// @notice Shared PB-19 fixtures: a funded, active campaign F whose configured challenger is a different address
/// from the supplier, so both authorized roles are tested. Builds on the unchanged PB-17/PB-18 test bases.
abstract contract DisputeBase is ClaimBase {
    bytes32 internal constant ID_F = keccak256("FIXTURE PB-19 dispute campaign F");
    bytes32 internal constant ID_G = keccak256("FIXTURE PB-19 dispute campaign G (blocklist token)");
    bytes32 internal constant ID_H = keccak256("FIXTURE PB-19 dispute campaign H (hook token)");
    bytes32 internal constant ID_I = keccak256("FIXTURE PB-19 dispute campaign I (partly funded)");
    bytes32 internal constant ID_J = keccak256("FIXTURE PB-19 dispute campaign J (unfunded)");
    bytes32 internal constant REASON = keccak256("FIXTURE PB-19 challenge reason");

    uint256 internal constant W = 1 days; // policy.challengeWindow in the fixture policy
    uint256 internal constant A = 2 days; // policy.reviewTimeout in the fixture policy

    IRemediationCampaign.ClaimStatus internal constant NONE = IRemediationCampaign.ClaimStatus.None;
    IRemediationCampaign.ClaimStatus internal constant PENDING = IRemediationCampaign.ClaimStatus.Pending;
    IRemediationCampaign.ClaimStatus internal constant DISPUTED = IRemediationCampaign.ClaimStatus.Disputed;
    IRemediationCampaign.ClaimStatus internal constant REJECTED = IRemediationCampaign.ClaimStatus.Rejected;
    IRemediationCampaign.ClaimStatus internal constant AWARDED = IRemediationCampaign.ClaimStatus.Awarded;
    IRemediationCampaign.ClaimStatus internal constant WITHDRAWN = IRemediationCampaign.ClaimStatus.Withdrawn;

    address internal challengerAddr = makeAddr("FIXTURE PB-19 challenger (not the supplier)");
    RemediationCampaign internal dc; // campaign F: USDC-fixture token, funded and active

    function setUp() public virtual override {
        super.setUp(); // PB-17 funding setup and the PB-18 claim campaign are preserved
        dc = _deployDispute(ID_F, address(usdc), supplierA, 3);
    }

    // ------------------------------------------------------------------ deployment

    /// @param mode 0 = deployed only, 1 = half funded, 2 = fully funded but not active, 3 = fully funded and active
    function _deployDispute(bytes32 id, address tokenAddr, address supplier_, uint8 mode)
        internal
        returns (RemediationCampaign c)
    {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        PatchBondTypes.Policy memory p = _policy(id, predicted, supplier_, tokenAddr);
        p.challenger = challengerAddr;
        p.eligibilityRoot = _root(id);
        p.verifier = verifierAddr;
        _register(p);
        c = new RemediationCampaign(registry, verifier, id, IERC20(tokenAddr));
        assertEq(address(c), predicted);

        if (mode >= 1) {
            uint256 amount = mode == 1 ? REQUIRED / 2 : REQUIRED;
            IFixtureMintable(tokenAddr).mint(supplier_, amount);
            vm.startPrank(supplier_);
            IERC20(tokenAddr).approve(address(c), amount);
            c.fund(amount);
            if (mode == 3) c.activate();
            vm.stopPrank();
        }
    }

    // ------------------------------------------------------------------ actions on a campaign

    function _submitOn(RemediationCampaign c, bytes32 id, uint256 i, bytes32 receiptId) internal {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(id, i);
        r.receiptId = receiptId;
        bytes memory sig = _sign(c, r);
        bytes32[] memory proof = _proofFor(id, i);
        vm.prank(relayer);
        c.submitClaim(r, sig, proof);
    }

    function _submit(uint256 i) internal {
        _submitOn(dc, ID_F, i, _receiptId(ID_F, i));
    }

    function _challengeAs(address who, RemediationCampaign c, uint256 i) internal {
        vm.prank(who);
        c.challengeClaim(depKeys[i], REASON);
    }

    /// @dev Submit and challenge (as the supplier) deployment `i` of campaign F.
    function _dispute(uint256 i) internal {
        _submit(i);
        _challengeAs(supplierA, dc, i);
    }

    function _resolveAs(address who, RemediationCampaign c, uint256 i, bool award) internal {
        vm.prank(who);
        c.resolveChallenge(depKeys[i], award);
    }

    // ------------------------------------------------------------------ reads

    function _status(RemediationCampaign c, uint256 i) internal view returns (uint8) {
        return uint8(_state(c, depKeys[i]).status);
    }

    function _cutoffOf(RemediationCampaign c, uint256 i) internal view returns (uint64) {
        return _state(c, depKeys[i]).challengeCutoff;
    }

    function _reviewDeadlineOf(RemediationCampaign c, uint256 i) internal view returns (uint64 d) {
        (, , d) = c.challengeOf(depKeys[i]);
    }

    function _claimDeadline(RemediationCampaign c) internal view returns (uint64) {
        return c.policy().claimDeadline;
    }

    /// @dev Total accounted value against the real token balance: the campaign must always hold at least what it owes.
    function _assertBacked(RemediationCampaign c) internal view {
        IRemediationCampaign.Accounting memory a = c.accounting();
        uint256 owed = a.unallocated + a.reserved + a.awardedUnwithdrawn;
        assertGe(IERC20(c.token()).balanceOf(address(c)), owed, "token balance covers every liability");
    }
}
