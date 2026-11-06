// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {ClaimBase, IFixtureMintable} from "../pb18/ClaimBase.sol";

/// @notice PB-19 behavior tests for challenge authority, bounded review, timeout and unallocated recovery.
contract CampaignDisputesTest is ClaimBase {
    IRemediationCampaign.ClaimStatus internal constant PENDING = IRemediationCampaign.ClaimStatus.Pending;
    IRemediationCampaign.ClaimStatus internal constant DISPUTED = IRemediationCampaign.ClaimStatus.Disputed;
    IRemediationCampaign.ClaimStatus internal constant REJECTED = IRemediationCampaign.ClaimStatus.Rejected;
    IRemediationCampaign.ClaimStatus internal constant AWARDED = IRemediationCampaign.ClaimStatus.Awarded;

    uint256 internal constant W = 1 days;
    uint256 internal constant A = 2 days;

    function _deployCampaignWithDifferentChallenger() internal returns (RemediationCampaign c) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        PatchBondTypes.Policy memory p = _policy(ID_D, predicted, supplierA, address(usdc));
        p.eligibilityRoot = _root(ID_D);
        p.verifier = verifierAddr;
        p.challenger = relayer;
        _register(p);
        c = new RemediationCampaign(registry, verifier, ID_D, IERC20(address(usdc)));
        IFixtureMintable(address(usdc)).mint(supplierA, REQUIRED);
        vm.startPrank(supplierA);
        usdc.approve(address(c), REQUIRED);
        c.fund(REQUIRED);
        c.activate();
        vm.stopPrank();
    }

    function _status(RemediationCampaign c, uint256 i) internal view returns (IRemediationCampaign.ClaimStatus) {
        return _state(c, depKeys[i]).status;
    }

    function _challenge(uint256 i) internal returns (uint64 reviewDeadline) {
        _claimAs(relayer, i);
        uint64 cutoff = _state(claimCampaign, depKeys[i]).challengeCutoff;
        vm.warp(cutoff - 1);
        vm.prank(supplierA);
        claimCampaign.challengeClaim(depKeys[i], keccak256("FIXTURE challenge reason"));
        reviewDeadline = uint64(block.timestamp + A);
    }

    function test_onlySupplierOrConfiguredChallengerCanChallengePendingClaim() public {
        _claimAs(relayer, 0);
        bytes32 reasonHash = keccak256("FIXTURE challenge reason");
        (address noChallenger, bytes32 noReason, uint64 noReviewDeadline) = claimCampaign.challengeOf(depKeys[0]);
        assertEq(noChallenger, address(0));
        assertEq(noReason, bytes32(0));
        assertEq(noReviewDeadline, 0);

        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.ZeroReasonHash.selector);
        claimCampaign.challengeClaim(depKeys[0], bytes32(0));

        vm.prank(attacker);
        vm.expectRevert();
        claimCampaign.challengeClaim(depKeys[0], reasonHash);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(PENDING));
        assertEq(claimCampaign.accounting().reserved, GRANT);

        vm.prank(supplierA);
        claimCampaign.challengeClaim(depKeys[0], reasonHash);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(DISPUTED));
        (address challenger, bytes32 recordedReason, uint64 recordedDeadline) = claimCampaign.challengeOf(depKeys[0]);
        assertEq(challenger, supplierA);
        assertEq(recordedReason, reasonHash);
        assertEq(recordedDeadline, claimCampaign.reviewDeadlineOf(depKeys[0]));
        _assertIdentity(claimCampaign);
    }

    function test_distinctConfiguredChallengerMayChallenge() public {
        RemediationCampaign c = _deployCampaignWithDifferentChallenger();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_D, 0);
        bytes memory sig = _sign(c, r);
        bytes32[] memory proof = _proofFor(ID_D, 0);
        vm.prank(relayer);
        c.submitClaim(r, sig, proof);
        vm.warp(_state(c, depKeys[0]).challengeCutoff - 1);
        vm.prank(relayer);
        c.challengeClaim(depKeys[0], keccak256("FIXTURE configured challenger reason"));
        assertEq(uint8(_state(c, depKeys[0]).status), uint8(DISPUTED));
        _assertIdentity(c);
    }

    function test_challengerMayChallengeStrictlyBeforeOriginalCutoffButNotAtIt() public {
        _claimAs(relayer, 0);
        _claimAs(relayer, 1);
        uint64 cutoff = _state(claimCampaign, depKeys[0]).challengeCutoff;
        vm.warp(cutoff - 1);
        vm.prank(supplierA); // fixture challenger equals supplier by immutable policy
        claimCampaign.challengeClaim(depKeys[0], keccak256("FIXTURE timely challenge"));
        assertEq(uint8(_status(claimCampaign, 0)), uint8(DISPUTED));

        uint64 cutoff1 = _state(claimCampaign, depKeys[1]).challengeCutoff;
        vm.warp(cutoff1);
        vm.prank(supplierA);
        vm.expectRevert();
        claimCampaign.challengeClaim(depKeys[1], keccak256("FIXTURE challenge at cutoff"));
        assertEq(uint8(_status(claimCampaign, 1)), uint8(PENDING));
        vm.prank(attacker);
        claimCampaign.finalizeClaim(depKeys[1]);
        assertEq(uint8(_status(claimCampaign, 1)), uint8(AWARDED));
        _assertIdentity(claimCampaign);
    }

    function test_challengeDoesNotExtendOriginalCutoffAndBlocksFinalization() public {
        uint64 reviewDeadline = _challenge(0);
        uint64 cutoff = _state(claimCampaign, depKeys[0]).challengeCutoff;
        assertEq(cutoff, reviewDeadline - 2 days + 1, "cutoff stays tied to claim submission");
        vm.warp(cutoff);
        vm.expectRevert();
        claimCampaign.finalizeClaim(depKeys[0]);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(DISPUTED));
        assertEq(claimCampaign.accounting().reserved, GRANT);
    }

    function test_onlyReviewerMayResolveAndOnlyBeforeReviewDeadline() public {
        uint64 reviewDeadline = _challenge(0);
        vm.prank(attacker);
        vm.expectRevert();
        claimCampaign.resolveChallenge(depKeys[0], true);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(DISPUTED));

        vm.warp(reviewDeadline - 1);
        vm.prank(reviewer);
        claimCampaign.resolveChallenge(depKeys[0], true);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(AWARDED));
        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.reserved, 0);
        assertEq(a.awardedUnwithdrawn, GRANT);
        assertEq(a.unallocated, REQUIRED - GRANT);
        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED, "decision transfers no tokens");
        _assertIdentity(claimCampaign);
    }

    function test_reviewerRejectionReleasesExactlyOneReservationAndAllowsFreshRetry() public {
        PatchBondTypes.AcceptanceReceipt memory original = _claimAs(relayer, 0);
        uint64 cutoff = _state(claimCampaign, depKeys[0]).challengeCutoff;
        vm.warp(cutoff - 1);
        vm.prank(supplierA);
        claimCampaign.challengeClaim(depKeys[0], keccak256("FIXTURE challenge for retry"));
        vm.prank(reviewer);
        claimCampaign.resolveChallenge(depKeys[0], false);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(REJECTED));
        assertEq(claimCampaign.accounting().reserved, 0);
        assertEq(claimCampaign.accounting().unallocated, REQUIRED);
        _assertIdentity(claimCampaign);

        bytes memory oldSig = _sign(claimCampaign, original);
        bytes32[] memory oldProof = _proofFor(ID_C, 0);
        vm.prank(relayer);
        vm.expectRevert();
        claimCampaign.submitClaim(original, oldSig, oldProof);

        PatchBondTypes.AcceptanceReceipt memory fresh = _receipt(ID_C, 0);
        fresh.receiptId = keccak256("FIXTURE fresh PB-19 retry receipt");
        fresh.issuedAt = uint64(block.timestamp - 1);
        fresh.expiresAt = uint64(block.timestamp + 200);
        bytes memory sig = _sign(claimCampaign, fresh);
        bytes32[] memory proof = _proofFor(ID_C, 0);
        vm.prank(relayer);
        claimCampaign.submitClaim(fresh, sig, proof);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(PENDING));
        assertEq(_state(claimCampaign, depKeys[0]).receiptId, fresh.receiptId);
        assertEq(claimCampaign.accounting().reserved, GRANT);
        _assertIdentity(claimCampaign);
    }

    function test_reviewTimeoutRejectsAndReleasesWithoutAwarding() public {
        uint64 reviewDeadline = _challenge(0);
        vm.warp(reviewDeadline - 1);
        vm.expectRevert();
        claimCampaign.expireChallenge(depKeys[0]);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(DISPUTED));

        vm.warp(reviewDeadline);
        vm.prank(attacker);
        claimCampaign.expireChallenge(depKeys[0]);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(REJECTED));
        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.reserved, 0);
        assertEq(a.awardedUnwithdrawn, 0, "review timeout never awards");
        assertEq(a.unallocated, REQUIRED);
        _assertIdentity(claimCampaign);
    }

    function test_supplierRecoversOnlyUnallocatedAfterClaimDeadline() public {
        _claimAs(relayer, 0);
        uint64 deadline = registry.policyOf(ID_C).claimDeadline;
        vm.warp(deadline);

        vm.prank(attacker);
        vm.expectRevert();
        claimCampaign.recoverUnallocated();
        vm.prank(supplierA);
        claimCampaign.recoverUnallocated();

        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.refunded, REQUIRED - GRANT);
        assertEq(a.reserved, GRANT, "pending reservation is protected");
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(usdc.balanceOf(address(claimCampaign)), GRANT);
        assertEq(usdc.balanceOf(supplierA), 1_000_000_000 + REQUIRED - GRANT);
        _assertIdentity(claimCampaign);

        vm.warp(_state(claimCampaign, depKeys[0]).challengeCutoff);
        claimCampaign.finalizeClaim(depKeys[0]);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(AWARDED));
        _assertIdentity(claimCampaign);
    }

    function test_recoveryCannotTakeDisputedReservationOrAwardedGrant() public {
        _claimAs(relayer, 0);
        uint64 cutoff0 = _state(claimCampaign, depKeys[0]).challengeCutoff;
        vm.warp(cutoff0);
        claimCampaign.finalizeClaim(depKeys[0]);
        _challenge(1);
        uint64 deadline = registry.policyOf(ID_C).claimDeadline;
        vm.warp(deadline);

        vm.prank(supplierA);
        claimCampaign.recoverUnallocated();
        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.reserved, GRANT, "disputed claim remains reserved");
        assertEq(a.awardedUnwithdrawn, GRANT, "reviewer award remains protected");
        assertEq(a.refunded, REQUIRED - 2 * GRANT);
        _assertIdentity(claimCampaign);

        vm.prank(attacker);
        claimCampaign.expireChallenge(depKeys[1]);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(AWARDED));
        assertEq(uint8(_status(claimCampaign, 1)), uint8(REJECTED));
        assertEq(claimCampaign.accounting().awardedUnwithdrawn, GRANT, "timeout on another claim cannot drain award");
        _assertIdentity(claimCampaign);
    }

    function test_claimDeadlineStillRejectsClaimsAfterRecovery() public {
        uint64 deadline = registry.policyOf(ID_C).claimDeadline;
        vm.warp(deadline);
        vm.prank(supplierA);
        claimCampaign.recoverUnallocated();

        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, 0);
        vm.prank(relayer);
        vm.expectRevert();
        claimCampaign.submitClaim(r, sig, proof);
        assertFalse(verifier.isConsumed(ID_C, r.receiptId));
        assertEq(claimCampaign.accounting().refunded, REQUIRED);
        _assertIdentity(claimCampaign);
    }

    function test_reviewCannotAwardAtOrAfterItsDeadlineAndCannotReviveRejectedClaim() public {
        uint64 reviewDeadline = _challenge(0);
        vm.warp(reviewDeadline);
        vm.prank(reviewer);
        vm.expectRevert();
        claimCampaign.resolveChallenge(depKeys[0], true);
        claimCampaign.expireChallenge(depKeys[0]);

        vm.prank(reviewer);
        vm.expectRevert();
        claimCampaign.resolveChallenge(depKeys[0], true);
        assertEq(uint8(_status(claimCampaign, 0)), uint8(REJECTED));
        _assertIdentity(claimCampaign);
    }
}
