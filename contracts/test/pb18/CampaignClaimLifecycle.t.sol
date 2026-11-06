// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {ClaimBase} from "./ClaimBase.sol";
import {FixtureBlocklistToken} from "./FixtureBlocklistToken.sol";

/// @notice PB-18 test-first: finalize after the challenge window, recipient-only withdrawal, independent
/// per-deployment progress, and a failed recipient payout that rolls back and can be retried.
contract CampaignClaimLifecycleTest is ClaimBase {
    IRemediationCampaign.ClaimStatus internal constant NONE = IRemediationCampaign.ClaimStatus.None;
    IRemediationCampaign.ClaimStatus internal constant PENDING = IRemediationCampaign.ClaimStatus.Pending;
    IRemediationCampaign.ClaimStatus internal constant AWARDED = IRemediationCampaign.ClaimStatus.Awarded;
    IRemediationCampaign.ClaimStatus internal constant WITHDRAWN = IRemediationCampaign.ClaimStatus.Withdrawn;

    uint256 internal constant W = 1 days; // policy.challengeWindow in the fixture policy

    function _status(RemediationCampaign c, uint256 i) internal view returns (uint8) {
        return uint8(_state(c, depKeys[i]).status);
    }

    // ------------------------------------------------------------------ finalize: only at or after W

    function test_finalizeRejectedBeforeTheChallengeCutoff() public {
        _claimAs(relayer, 0);
        uint64 cutoff = _state(claimCampaign, depKeys[0]).challengeCutoff;
        assertEq(cutoff, block.timestamp + W);

        vm.warp(cutoff - 1);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ChallengeWindowOpen.selector, cutoff, uint256(cutoff) - 1));
        claimCampaign.finalizeClaim(depKeys[0]);
        assertEq(_status(claimCampaign, 0), uint8(PENDING));
        assertEq(claimCampaign.accounting().awardedUnwithdrawn, 0);
        assertEq(claimCampaign.accounting().reserved, GRANT);
    }

    function test_anyoneMayFinalizeExactlyAtTheCutoff() public {
        _claimAs(relayer, 0);
        uint64 cutoff = _state(claimCampaign, depKeys[0]).challengeCutoff;
        vm.warp(cutoff);

        vm.expectEmit(true, true, false, true, address(claimCampaign));
        emit IRemediationCampaign.ClaimFinalized(depKeys[0], recipients[0], GRANT);
        vm.prank(attacker); // neither recipient, supplier nor submitter
        claimCampaign.finalizeClaim(depKeys[0]);

        ClaimState memory s = _state(claimCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(AWARDED));
        assertEq(s.recipient, recipients[0]);
        assertEq(s.withdrawable, GRANT);

        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.reserved, 0, "reservation released");
        assertEq(a.awardedUnwithdrawn, GRANT, "moved to awarded");
        assertEq(a.paid, 0);
        assertEq(a.unallocated, REQUIRED - GRANT);
        _assertIdentity(claimCampaign);

        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED, "finalize moves no tokens");
        assertEq(usdc.balanceOf(recipients[0]), 0);
    }

    function test_anyoneMayFinalizeLongAfterTheCutoff() public {
        _claimAs(relayer, 1);
        vm.warp(block.timestamp + 365 days);
        vm.prank(supplierA);
        claimCampaign.finalizeClaim(depKeys[1]);
        assertEq(_status(claimCampaign, 1), uint8(AWARDED));
    }

    function test_finalizeRejectedForUnclaimedOrAlreadyFinalizedDeployments() public {
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotPending.selector, depKeys[0], NONE));
        claimCampaign.finalizeClaim(depKeys[0]);

        bytes32 unknown = keccak256("FIXTURE PB-18 unknown deployment key");
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotPending.selector, unknown, NONE));
        claimCampaign.finalizeClaim(unknown);

        _claimAs(relayer, 0);
        vm.warp(block.timestamp + W);
        claimCampaign.finalizeClaim(depKeys[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotPending.selector, depKeys[0], AWARDED));
        claimCampaign.finalizeClaim(depKeys[0]);
        assertEq(claimCampaign.accounting().awardedUnwithdrawn, GRANT, "second finalize did not double count");
    }

    // ------------------------------------------------------------------ withdraw: recipient only, once

    function _awarded(uint256 i) internal {
        _claimAs(relayer, i);
        vm.warp(block.timestamp + W);
        claimCampaign.finalizeClaim(depKeys[i]);
    }

    function test_withdrawRejectedBeforeFinalizeEvenAfterTheCutoff() public {
        _claimAs(relayer, 0);
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[0], PENDING));
        claimCampaign.withdrawGrant(depKeys[0]);

        vm.warp(block.timestamp + W + 1);
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[0], PENDING));
        claimCampaign.withdrawGrant(depKeys[0]);
        assertEq(usdc.balanceOf(recipients[0]), 0);
    }

    function test_withdrawRejectedForUnclaimedDeployment() public {
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[0], NONE));
        claimCampaign.withdrawGrant(depKeys[0]);
    }

    function test_onlyTheFixedRecipientMayWithdraw() public {
        _awarded(0);
        address[5] memory callers = [relayer, attacker, supplierA, verifierAddr, recipients[1]];
        for (uint256 k = 0; k < callers.length; k++) {
            vm.prank(callers[k]);
            vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotRecipient.selector, callers[k], recipients[0]));
            claimCampaign.withdrawGrant(depKeys[0]);
        }
        assertEq(_status(claimCampaign, 0), uint8(AWARDED), "unauthorized attempts changed nothing");
        assertEq(claimCampaign.accounting().awardedUnwithdrawn, GRANT);
        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED);
    }

    function test_recipientWithdrawsExactlyOneGrantOnce() public {
        _awarded(0);

        vm.expectEmit(true, true, false, true, address(claimCampaign));
        emit IRemediationCampaign.GrantWithdrawn(depKeys[0], recipients[0], GRANT);
        vm.prank(recipients[0]);
        claimCampaign.withdrawGrant(depKeys[0]);

        assertEq(usdc.balanceOf(recipients[0]), GRANT, "exactly G paid");
        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED - GRANT);
        ClaimState memory s = _state(claimCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(WITHDRAWN));
        assertEq(s.withdrawable, 0);

        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.paid, GRANT);
        assertEq(a.reserved, 0);
        assertEq(a.unallocated, REQUIRED - GRANT);
        assertEq(a.deposited, REQUIRED);
        _assertIdentity(claimCampaign);

        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[0], WITHDRAWN));
        claimCampaign.withdrawGrant(depKeys[0]);
        assertEq(usdc.balanceOf(recipients[0]), GRANT, "no double payout");
    }

    function test_withdrawnDeploymentCannotBeClaimedAgain() public {
        PatchBondTypes.AcceptanceReceipt memory r = _claimAs(relayer, 0);
        vm.warp(block.timestamp + W);
        claimCampaign.finalizeClaim(depKeys[0]);
        vm.prank(recipients[0]);
        claimCampaign.withdrawGrant(depKeys[0]);

        // A fresh receipt for the same deployment (new id, new time) is still a duplicate deployment claim.
        PatchBondTypes.AcceptanceReceipt memory again = _receipt(ID_C, 0);
        again.receiptId = keccak256("FIXTURE PB-18 receipt after withdrawal");
        bytes memory sig = _sign(claimCampaign, again);
        bytes32[] memory proof = _proofFor(ID_C, 0);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeploymentAlreadyClaimed.selector, depKeys[0]));
        claimCampaign.submitClaim(again, sig, proof);
        assertTrue(verifier.isConsumed(ID_C, r.receiptId));
        assertFalse(verifier.isConsumed(ID_C, again.receiptId));
        assertEq(claimCampaign.accounting().paid, GRANT);
    }

    // ------------------------------------------------------------------ deployments progress independently

    function test_deploymentsProgressIndependently() public {
        // t0: deployment 0 claimed.
        _claimAs(relayer, 0);
        uint64 cutoff0 = _state(claimCampaign, depKeys[0]).challengeCutoff;

        // t0 + 12h: deployment 1 claimed.
        vm.warp(block.timestamp + 12 hours);
        _claimAs(attacker, 1);
        uint64 cutoff1 = _state(claimCampaign, depKeys[1]).challengeCutoff;
        assertEq(uint256(cutoff1) - uint256(cutoff0), 12 hours, "each claim has its own window");

        // At cutoff0, deployment 0 can be finalized; deployment 1 cannot.
        vm.warp(cutoff0);
        claimCampaign.finalizeClaim(depKeys[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ChallengeWindowOpen.selector, cutoff1, uint256(cutoff0)));
        claimCampaign.finalizeClaim(depKeys[1]);
        assertEq(_status(claimCampaign, 0), uint8(AWARDED));
        assertEq(_status(claimCampaign, 1), uint8(PENDING));
        assertEq(_status(claimCampaign, 2), uint8(NONE));

        // Deployment 0 is paid out while 1 is still pending and 2 untouched.
        vm.prank(recipients[0]);
        claimCampaign.withdrawGrant(depKeys[0]);
        assertEq(_status(claimCampaign, 0), uint8(WITHDRAWN));
        assertEq(_status(claimCampaign, 1), uint8(PENDING));
        assertEq(usdc.balanceOf(recipients[0]), GRANT);
        assertEq(usdc.balanceOf(recipients[1]), 0);

        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.paid, GRANT);
        assertEq(a.reserved, GRANT, "deployment 1 still holds its reservation");
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.unallocated, REQUIRED - 2 * GRANT, "deployment 2's grant is still unallocated");
        _assertIdentity(claimCampaign);

        // Deployment 2 can be claimed on its own, then 1 finalizes and pays out; 2 stays pending.
        _claimAs(relayer, 2);
        vm.warp(cutoff1);
        claimCampaign.finalizeClaim(depKeys[1]);
        vm.prank(recipients[1]);
        claimCampaign.withdrawGrant(depKeys[1]);
        assertEq(_status(claimCampaign, 2), uint8(PENDING));
        assertEq(usdc.balanceOf(recipients[1]), GRANT);
        assertEq(usdc.balanceOf(recipients[2]), 0);

        a = claimCampaign.accounting();
        assertEq(a.paid, 2 * GRANT);
        assertEq(a.reserved, GRANT);
        assertEq(a.unallocated, 0);
        _assertIdentity(claimCampaign);
    }

    function test_oneRecipientCannotWithdrawAnothersGrant() public {
        _awarded(0);
        _awarded(1);
        vm.prank(recipients[1]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotRecipient.selector, recipients[1], recipients[0]));
        claimCampaign.withdrawGrant(depKeys[0]);
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotRecipient.selector, recipients[0], recipients[1]));
        claimCampaign.withdrawGrant(depKeys[1]);
    }

    function test_allThreeGrantsCanBePaidAndTheBudgetIsExactlySpent() public {
        for (uint256 i = 0; i < 3; i++) _claimAs(relayer, i);
        vm.warp(block.timestamp + W);
        for (uint256 i = 0; i < 3; i++) {
            claimCampaign.finalizeClaim(depKeys[i]);
            vm.prank(recipients[i]);
            claimCampaign.withdrawGrant(depKeys[i]);
            assertEq(usdc.balanceOf(recipients[i]), GRANT);
        }
        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.paid, REQUIRED);
        assertEq(a.unallocated + a.reserved + a.awardedUnwithdrawn, 0);
        assertEq(usdc.balanceOf(address(claimCampaign)), 0);
        _assertIdentity(claimCampaign);
    }

    // ------------------------------------------------------------------ failed payout: atomic, retryable, non-blocking

    function test_failedRecipientTransferRevertsAccountingAndIsRetryable() public {
        FixtureBlocklistToken blk = new FixtureBlocklistToken();
        RemediationCampaign d = _deployClaimCampaign(ID_D, address(blk), true, true);

        // Claim and finalize deployments 0 and 1 on campaign D.
        for (uint256 i = 0; i < 2; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_D, i);
            bytes memory sig = _sign(d, r);
            bytes32[] memory proof = _proofFor(ID_D, i);
            vm.prank(relayer);
            d.submitClaim(r, sig, proof);
        }
        vm.warp(block.timestamp + W);
        d.finalizeClaim(depKeys[0]);
        d.finalizeClaim(depKeys[1]);
        assertEq(d.accounting().awardedUnwithdrawn, 2 * GRANT);

        // Recipient 0 is blocked by the token: the payout reverts and nothing moves.
        blk.setBlocked(recipients[0], true);
        IRemediationCampaign.Accounting memory before = d.accounting();
        vm.prank(recipients[0]);
        vm.expectRevert();
        d.withdrawGrant(depKeys[0]);

        IRemediationCampaign.Accounting memory afterFail = d.accounting();
        assertEq(afterFail.awardedUnwithdrawn, before.awardedUnwithdrawn, "awarded unchanged");
        assertEq(afterFail.paid, before.paid, "nothing marked paid");
        assertEq(afterFail.unallocated, before.unallocated);
        assertEq(afterFail.reserved, before.reserved);
        assertEq(uint8(_state(d, depKeys[0]).status), uint8(AWARDED), "still withdrawable");
        assertEq(_state(d, depKeys[0]).withdrawable, GRANT);
        assertEq(blk.balanceOf(address(d)), REQUIRED, "no tokens moved");
        _assertIdentity(d);

        // The failure does not block deployment 1.
        vm.prank(recipients[1]);
        d.withdrawGrant(depKeys[1]);
        assertEq(blk.balanceOf(recipients[1]), GRANT);
        assertEq(uint8(_state(d, depKeys[1]).status), uint8(WITHDRAWN));
        assertEq(uint8(_state(d, depKeys[0]).status), uint8(AWARDED));
        assertEq(d.accounting().awardedUnwithdrawn, GRANT);
        assertEq(d.accounting().paid, GRANT);
        _assertIdentity(d);

        // Retry still fails while blocked, then succeeds after the block is lifted.
        vm.prank(recipients[0]);
        vm.expectRevert();
        d.withdrawGrant(depKeys[0]);
        blk.setBlocked(recipients[0], false);
        vm.prank(recipients[0]);
        d.withdrawGrant(depKeys[0]);

        assertEq(blk.balanceOf(recipients[0]), GRANT);
        assertEq(uint8(_state(d, depKeys[0]).status), uint8(WITHDRAWN));
        IRemediationCampaign.Accounting memory fin = d.accounting();
        assertEq(fin.paid, 2 * GRANT);
        assertEq(fin.awardedUnwithdrawn, 0);
        assertEq(fin.unallocated, REQUIRED - 2 * GRANT);
        assertEq(blk.balanceOf(address(d)), REQUIRED - 2 * GRANT);
        _assertIdentity(d);
    }

    function test_blockedRecipientDoesNotPreventAnotherDeploymentFromBeingClaimedOrFinalized() public {
        FixtureBlocklistToken blk = new FixtureBlocklistToken();
        RemediationCampaign d = _deployClaimCampaign(ID_D, address(blk), true, true);
        blk.setBlocked(recipients[0], true); // blocked before any claim exists

        // Claiming and finalizing never touches the token, so a blocked recipient cannot stop other deployments.
        PatchBondTypes.AcceptanceReceipt memory r0 = _receipt(ID_D, 0);
        PatchBondTypes.AcceptanceReceipt memory r1 = _receipt(ID_D, 1);
        bytes memory sig0 = _sign(d, r0);
        bytes memory sig1 = _sign(d, r1);
        bytes32[] memory p0 = _proofFor(ID_D, 0);
        bytes32[] memory p1 = _proofFor(ID_D, 1);
        vm.prank(relayer);
        d.submitClaim(r0, sig0, p0);
        vm.prank(relayer);
        d.submitClaim(r1, sig1, p1);
        vm.warp(block.timestamp + W);
        d.finalizeClaim(depKeys[0]);
        d.finalizeClaim(depKeys[1]);

        vm.prank(recipients[1]);
        d.withdrawGrant(depKeys[1]);
        assertEq(blk.balanceOf(recipients[1]), GRANT);
        assertEq(uint8(_state(d, depKeys[0]).status), uint8(AWARDED));
        _assertIdentity(d);
    }
}
