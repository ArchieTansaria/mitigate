// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {DisputeBase, FixtureHookReceiveToken, FixtureReentrantParty} from "./DisputeBase.sol";
import {FixtureBlocklistToken} from "../pb18/FixtureBlocklistToken.sol";

/// @notice PB-19 test-first: supplier recovery of unallocated funds after the claim deadline, and the accounting
/// identity after every transition. (Named with the "CampaignInvariantTest" prefix so the plan's match-contract
/// filter `Campaign(Disputes|Invariant)Test` finds it.)
contract CampaignInvariantTestRecovery is DisputeBase {
    uint256 internal supplierStart;

    function setUp() public override {
        super.setUp();
        supplierStart = usdc.balanceOf(supplierA); // after the campaign was funded
    }

    /// @dev Deployment 0 Pending, 1 Disputed, 2 never claimed; the clock is then moved to the claim deadline.
    function _mixedAtDeadline() internal returns (uint64 deadline) {
        deadline = _claimDeadline(dc);
        vm.warp(uint256(deadline) - 2);
        _submit(0);
        _submit(1);
        _challengeAs(supplierA, dc, 1);
        vm.warp(deadline);
    }

    // ================================================================== when and who

    function test_recoveryIsClosedBeforeTheClaimDeadline() public {
        uint64 deadline = _claimDeadline(dc);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.RecoveryNotOpen.selector, deadline, block.timestamp));
        dc.recoverUnallocated();

        vm.warp(uint256(deadline) - 1);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.RecoveryNotOpen.selector, deadline, uint256(deadline) - 1));
        dc.recoverUnallocated();
        assertEq(dc.accounting().refunded, 0);
        assertEq(usdc.balanceOf(address(dc)), REQUIRED);
    }

    function test_onlyTheSupplierMayRecover() public {
        vm.warp(_claimDeadline(dc));
        address[7] memory callers =
            [challengerAddr, reviewer, recipients[0], relayer, verifierAddr, attacker, address(this)];
        for (uint256 k = 0; k < callers.length; k++) {
            vm.prank(callers[k]);
            vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotSupplier.selector, callers[k], supplierA));
            dc.recoverUnallocated();
        }
        assertEq(usdc.balanceOf(address(dc)), REQUIRED);
    }

    // ================================================================== what is protected

    function test_recoversOnlyTheUnallocatedBalanceAtTheDeadline() public {
        _mixedAtDeadline();

        vm.expectEmit(true, false, false, true, address(dc));
        emit IRemediationCampaign.UnallocatedRecovered(supplierA, GRANT);
        vm.prank(supplierA);
        dc.recoverUnallocated();

        assertEq(usdc.balanceOf(supplierA) - supplierStart, GRANT, "exactly deployment 2's unclaimed grant");
        assertEq(usdc.balanceOf(address(dc)), REQUIRED - GRANT);
        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(a.unallocated, 0);
        assertEq(a.reserved, 2 * GRANT, "Pending and Disputed reservations untouched");
        assertEq(a.refunded, GRANT);
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.paid, 0);
        assertEq(a.deposited, REQUIRED);
        _assertIdentity(dc);
        _assertBacked(dc);
        assertEq(_status(dc, 0), uint8(PENDING));
        assertEq(_status(dc, 1), uint8(DISPUTED));
    }

    function test_awardedBalancesAreNeverRecovered() public {
        _submit(0);
        _submit(1);
        vm.warp(block.timestamp + W);
        dc.finalizeClaim(depKeys[0]); // Awarded, unwithdrawn
        dc.finalizeClaim(depKeys[1]);
        vm.prank(recipients[1]);
        dc.withdrawGrant(depKeys[1]); // Withdrawn
        vm.warp(_claimDeadline(dc));

        vm.prank(supplierA);
        dc.recoverUnallocated(); // only deployment 2's grant
        assertEq(usdc.balanceOf(supplierA) - supplierStart, GRANT);
        assertEq(dc.accounting().awardedUnwithdrawn, GRANT, "the unwithdrawn award is untouched");
        assertEq(dc.accounting().paid, GRANT);
        assertEq(dc.accounting().refunded, GRANT);

        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.NothingToRecover.selector);
        dc.recoverUnallocated();

        // The awarded recipient can still be paid after the supplier's recovery.
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);
        assertEq(usdc.balanceOf(recipients[0]), GRANT);
        assertEq(usdc.balanceOf(address(dc)), 0);
        _assertIdentity(dc);
    }

    function test_reservationsReleasedAfterTheDeadlineBecomeRecoverableLater() public {
        _mixedAtDeadline();
        vm.prank(supplierA);
        dc.recoverUnallocated(); // deployment 2's grant
        uint256 afterFirst = usdc.balanceOf(supplierA);

        // The dispute times out after D: its reservation is released and only then recoverable.
        vm.warp(uint256(_reviewDeadlineOf(dc, 1)));
        dc.expireChallenge(depKeys[1]);
        assertEq(dc.accounting().unallocated, GRANT);
        vm.prank(supplierA);
        dc.recoverUnallocated();
        assertEq(usdc.balanceOf(supplierA) - afterFirst, GRANT);

        // The Pending claim (its cutoff has now passed) still holds its reservation and finalizes normally after D.
        assertTrue(block.timestamp >= _cutoffOf(dc, 0));
        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.NothingToRecover.selector);
        dc.recoverUnallocated();
        dc.finalizeClaim(depKeys[0]);
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);

        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(a.refunded, 2 * GRANT);
        assertEq(a.paid, GRANT);
        assertEq(a.unallocated + a.reserved + a.awardedUnwithdrawn, 0);
        assertEq(usdc.balanceOf(address(dc)), 0, "everything is accounted for and nothing is stuck");
        _assertIdentity(dc);
    }

    function test_nothingToRecoverWhenEveryGrantIsClaimed() public {
        _submit(0);
        _submit(1);
        _submit(2);
        vm.warp(_claimDeadline(dc));
        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.NothingToRecover.selector);
        dc.recoverUnallocated();
        assertEq(dc.accounting().reserved, REQUIRED);
    }

    function test_noNewClaimsOrRevivalAfterRecovery() public {
        vm.warp(_claimDeadline(dc));
        vm.prank(supplierA);
        dc.recoverUnallocated(); // everything is unallocated and returned

        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 0);
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, _claimDeadline(dc), block.timestamp)
        );
        dc.submitClaim(r, sig, proof);
        assertEq(dc.accounting().reserved, 0);
        assertEq(dc.accounting().refunded, REQUIRED);
        assertEq(usdc.balanceOf(address(dc)), 0);
    }

    // ================================================================== never-activated campaigns (closes the PB-17 limit)

    function test_partlyFundedCampaignDepositsAreRecoverableAfterTheDeadline() public {
        RemediationCampaign i = _deployDispute(ID_I, address(usdc), supplierA, 1); // half funded, not active
        uint256 half = REQUIRED / 2;
        uint256 start = usdc.balanceOf(supplierA);
        assertEq(i.accounting().deposited, half);

        uint64 deadline = _claimDeadline(i);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.RecoveryNotOpen.selector, deadline, block.timestamp));
        i.recoverUnallocated();

        vm.warp(_claimDeadline(i));
        vm.prank(supplierA);
        i.recoverUnallocated();
        assertEq(usdc.balanceOf(supplierA) - start, half);
        assertEq(usdc.balanceOf(address(i)), 0);
        IRemediationCampaign.Accounting memory a = i.accounting();
        assertEq(a.deposited, half);
        assertEq(a.unallocated, 0);
        assertEq(a.refunded, half);
        assertFalse(i.active());
        _assertIdentity(i);

        // Funding and activation stay closed.
        vm.prank(supplierA);
        vm.expectRevert();
        i.fund(1);
        vm.prank(supplierA);
        vm.expectRevert();
        i.activate();
    }

    function test_fullyFundedButNeverActivatedCampaignCanBeRecovered() public {
        RemediationCampaign i = _deployDispute(ID_I, address(usdc), supplierA, 2);
        assertFalse(i.active());
        uint256 start = usdc.balanceOf(supplierA);
        vm.warp(_claimDeadline(i));
        vm.prank(supplierA);
        i.recoverUnallocated();
        assertEq(usdc.balanceOf(supplierA) - start, REQUIRED);
        assertEq(i.accounting().refunded, REQUIRED);
        _assertIdentity(i);
    }

    function test_unfundedCampaignHasNothingToRecover() public {
        RemediationCampaign j = _deployDispute(ID_J, address(usdc), supplierA, 0);
        vm.warp(_claimDeadline(j));
        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.NothingToRecover.selector);
        j.recoverUnallocated();
    }

    // ================================================================== failed transfers and reentrancy

    function test_failedRecoveryTransferRevertsAndIsRetryable() public {
        FixtureBlocklistToken blk = new FixtureBlocklistToken();
        RemediationCampaign g = _deployDispute(ID_G, address(blk), supplierA, 3);
        _submitOn(g, ID_G, 0, _receiptId(ID_G, 0));
        vm.warp(block.timestamp + W);
        g.finalizeClaim(depKeys[0]); // an unrelated claim that must stay payable
        vm.warp(_claimDeadline(g));

        blk.setBlocked(supplierA, true);
        IRemediationCampaign.Accounting memory before = g.accounting();
        vm.prank(supplierA);
        vm.expectRevert();
        g.recoverUnallocated();
        IRemediationCampaign.Accounting memory afterFail = g.accounting();
        assertEq(afterFail.unallocated, before.unallocated, "accounting rolled back");
        assertEq(afterFail.refunded, 0);
        assertEq(blk.balanceOf(address(g)), REQUIRED);

        // The supplier's problem does not block a recipient's payout.
        vm.prank(recipients[0]);
        g.withdrawGrant(depKeys[0]);
        assertEq(blk.balanceOf(recipients[0]), GRANT);

        blk.setBlocked(supplierA, false);
        uint256 start = blk.balanceOf(supplierA);
        vm.prank(supplierA);
        g.recoverUnallocated();
        assertEq(blk.balanceOf(supplierA) - start, REQUIRED - GRANT);
        assertEq(g.accounting().refunded, REQUIRED - GRANT);
        _assertIdentity(g);
    }

    function test_reentrantSupplierCannotRecoverTwice() public {
        FixtureHookReceiveToken hook = new FixtureHookReceiveToken();
        FixtureReentrantParty party = new FixtureReentrantParty(); // the supplier is a contract with a payout callback
        RemediationCampaign h = _deployDispute(ID_H, address(hook), address(party), 3);
        party.arm(address(h), abi.encodeWithSelector(h.recoverUnallocated.selector));

        vm.warp(_claimDeadline(h));
        vm.prank(address(party));
        h.recoverUnallocated();

        assertTrue(party.attempted(), "the callback ran");
        assertFalse(party.attemptSucceeded(), "re-entry failed");
        assertEq(bytes4(party.attemptError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(hook.balanceOf(address(party)), REQUIRED, "paid exactly once");
        assertEq(h.accounting().refunded, REQUIRED);
        assertEq(hook.balanceOf(address(h)), 0);
        _assertIdentity(h);
    }

    // ================================================================== untracked tokens

    function test_directDonationsAreNeverRecoveredAndAreReportedCorrectly() public {
        _submit(0);
        vm.warp(block.timestamp + W);
        dc.finalizeClaim(depKeys[0]);
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]); // a payout has happened, so balance < deposited

        usdc.mint(donor, 5_000_000);
        vm.prank(donor);
        usdc.transfer(address(dc), 5_000_000);

        vm.warp(_claimDeadline(dc));
        vm.prank(supplierA);
        dc.recoverUnallocated();

        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(usdc.balanceOf(supplierA) - supplierStart, REQUIRED - GRANT, "only tracked unallocated funds");
        assertEq(usdc.balanceOf(address(dc)), 5_000_000, "the donation stays, stranded as designed");
        // untracked = balance - (deposited - paid - refunded). This view must stay correct after payouts and refunds.
        assertEq(dc.untrackedTokenBalance(), 5_000_000);
        assertEq(a.deposited - a.paid - a.refunded, 0);
        _assertIdentity(dc);
    }

    function test_untrackedBalanceViewIsCorrectAfterAPayoutAlone() public {
        _submit(0);
        vm.warp(block.timestamp + W);
        dc.finalizeClaim(depKeys[0]);
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);
        assertEq(dc.untrackedTokenBalance(), 0, "no donation yet");

        usdc.mint(donor, 3_000_000);
        vm.prank(donor);
        usdc.transfer(address(dc), 3_000_000);
        IRemediationCampaign.Accounting memory a = dc.accounting();
        uint256 expected = usdc.balanceOf(address(dc)) - (a.deposited - a.paid - a.refunded);
        assertEq(expected, 3_000_000);
        assertEq(dc.untrackedTokenBalance(), expected, "counts the donation even though a grant has left");
    }

    // ================================================================== accounting identity after every transition

    function test_identityHoldsAfterEveryTransition() public {
        _assertIdentity(dc); // funded and active

        _submit(0);
        _assertIdentity(dc); // reserve
        _submit(1);
        _assertIdentity(dc);
        _submit(2);
        _assertIdentity(dc);

        _challengeAs(supplierA, dc, 0);
        _assertIdentity(dc); // dispute
        _challengeAs(challengerAddr, dc, 2);
        _assertIdentity(dc);

        _resolveAs(reviewer, dc, 0, true);
        _assertIdentity(dc); // award
        vm.warp(uint256(_reviewDeadlineOf(dc, 2)));
        dc.expireChallenge(depKeys[2]);
        _assertIdentity(dc); // timeout reject
        dc.finalizeClaim(depKeys[1]);
        _assertIdentity(dc); // finalize

        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);
        _assertIdentity(dc); // pay
        vm.prank(recipients[1]);
        dc.withdrawGrant(depKeys[1]);
        _assertIdentity(dc);

        vm.warp(_claimDeadline(dc));
        vm.prank(supplierA);
        dc.recoverUnallocated();
        _assertIdentity(dc); // refund
        _assertBacked(dc);

        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(a.deposited, REQUIRED);
        assertEq(a.paid, 2 * GRANT);
        assertEq(a.refunded, GRANT);
        assertEq(a.unallocated + a.reserved + a.awardedUnwithdrawn, 0);
        assertEq(usdc.balanceOf(address(dc)), 0);
    }
}
