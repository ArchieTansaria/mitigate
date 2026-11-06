// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DisputeBase, FixtureHookReceiveToken, FixtureReentrantParty} from "./DisputeBase.sol";
import {FixtureBlocklistToken} from "../pb18/FixtureBlocklistToken.sol";

/// @notice PB-19 test-first: retry after rejection with fresh evidence only, replay denial, post-deadline claims,
/// independent progress, terminal states, failed-transfer retry, and reentrancy across claims.
/// (The contract name keeps the "CampaignDisputesTest" prefix so the plan's match-contract filter finds it.)
contract CampaignDisputesTestRetry is DisputeBase {
    bytes32 internal constant FRESH_ID = keccak256("FIXTURE PB-19 fresh receipt id");

    // ================================================================== retry after rejection

    function test_rejectedDeploymentMayRetryWithAFreshReceipt() public {
        _dispute(0);
        (, bytes32 oldReceiptId,,) = _unpack(0);
        _resolveAs(reviewer, dc, 0, false);
        assertEq(_status(dc, 0), uint8(REJECTED));

        vm.warp(block.timestamp + 3 hours);
        _submitOn(dc, ID_F, 0, FRESH_ID);

        ClaimState memory s = _state(dc, depKeys[0]);
        assertEq(uint8(s.status), uint8(PENDING), "a new claim");
        assertEq(s.receiptId, FRESH_ID, "tracks the fresh receipt");
        assertTrue(s.receiptId != oldReceiptId);
        assertEq(s.recipient, recipients[0]);
        assertEq(s.challengeCutoff, block.timestamp + W, "the new claim has its own window");
        (address challenger, bytes32 reason, uint64 deadline) = dc.challengeOf(depKeys[0]);
        assertEq(challenger, address(0), "old challenge record cleared");
        assertEq(reason, bytes32(0));
        assertEq(deadline, 0);

        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(a.reserved, GRANT, "exactly one grant reserved again");
        assertEq(a.unallocated, REQUIRED - GRANT);
        _assertIdentity(dc);
        assertTrue(verifier.isConsumed(ID_F, oldReceiptId), "the rejected claim's receipt stays consumed");
        assertTrue(verifier.isConsumed(ID_F, FRESH_ID));
    }

    function test_timedOutDisputeMayAlsoRetryAndThenComplete() public {
        _dispute(0);
        vm.warp(uint256(_reviewDeadlineOf(dc, 0)));
        dc.expireChallenge(depKeys[0]);
        assertEq(_status(dc, 0), uint8(REJECTED));

        _submitOn(dc, ID_F, 0, FRESH_ID);
        vm.warp(block.timestamp + W);
        dc.finalizeClaim(depKeys[0]);
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);

        assertEq(usdc.balanceOf(recipients[0]), GRANT, "paid exactly one grant despite two attempts");
        assertEq(dc.accounting().paid, GRANT);
        assertEq(dc.accounting().reserved, 0);
        _assertIdentity(dc);
    }

    function test_theRetryClaimCanBeChallengedAgainOnItsOwnWindow() public {
        _dispute(0);
        _resolveAs(reviewer, dc, 0, false);
        _submitOn(dc, ID_F, 0, FRESH_ID);
        uint64 newCutoff = _cutoffOf(dc, 0);

        vm.warp(uint256(newCutoff) - 1);
        _challengeAs(challengerAddr, dc, 0);
        assertEq(_status(dc, 0), uint8(DISPUTED));
        assertEq(_cutoffOf(dc, 0), newCutoff, "still the retry's own fixed cutoff");

        _resolveAs(reviewer, dc, 0, true);
        assertEq(_status(dc, 0), uint8(AWARDED));
        _assertIdentity(dc);
    }

    function test_replayOfTheRejectedReceiptFails() public {
        _dispute(0);
        bytes32 oldId = _receiptId(ID_F, 0);
        _resolveAs(reviewer, dc, 0, false);

        // Same receiptId, freshly signed so every freshness rule would pass: only replay protection can stop it.
        PatchBondTypes.AcceptanceReceipt memory replay = _receipt(ID_F, 0);
        replay.receiptId = oldId;
        bytes memory sig = _sign(dc, replay);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, ID_F, oldId));
        dc.submitClaim(replay, sig, proof);

        assertEq(_status(dc, 0), uint8(REJECTED), "still rejected");
        assertEq(dc.accounting().reserved, 0);
        assertEq(dc.accounting().unallocated, REQUIRED);
        _assertIdentity(dc);
    }

    function test_replayAfterTimeoutRejectionAlsoFails() public {
        _dispute(0);
        bytes32 oldId = _receiptId(ID_F, 0);
        vm.warp(uint256(_reviewDeadlineOf(dc, 0)));
        dc.expireChallenge(depKeys[0]);

        PatchBondTypes.AcceptanceReceipt memory replay = _receipt(ID_F, 0);
        replay.receiptId = oldId;
        bytes memory sig = _sign(dc, replay);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, ID_F, oldId));
        dc.submitClaim(replay, sig, proof);
        assertEq(_status(dc, 0), uint8(REJECTED));
    }

    function test_aReceiptIdUsedByAnotherDeploymentCannotBeReusedForTheRetry() public {
        _submit(1); // consumes deployment 1's receipt id
        _dispute(0);
        _resolveAs(reviewer, dc, 0, false);

        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 0);
        r.receiptId = _receiptId(ID_F, 1);
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, ID_F, r.receiptId));
        dc.submitClaim(r, sig, proof);
        assertEq(_status(dc, 0), uint8(REJECTED));
    }

    function test_retryStillNeedsAFreshValidReceipt() public {
        _dispute(0);
        _resolveAs(reviewer, dc, 0, false);

        // A freshly numbered receipt that is expired, or signed by the wrong key, or for the wrong recipient, fails.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 0);
        r.receiptId = FRESH_ID;
        r.expiresAt = uint64(block.timestamp - 1);
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, r.expiresAt, block.timestamp));
        dc.submitClaim(r, sig, proof);

        r = _receipt(ID_F, 0);
        r.receiptId = FRESH_ID;
        r.recipient = attacker;
        sig = _sign(dc, r);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
        dc.submitClaim(r, sig, proof);

        assertEq(_status(dc, 0), uint8(REJECTED));
        assertFalse(verifier.isConsumed(ID_F, FRESH_ID), "failed retries burn nothing");
        assertEq(dc.accounting().reserved, 0);
    }

    function test_retryRejectedAtOrAfterTheClaimDeadline() public {
        _dispute(0);
        _dispute(1);
        _resolveAs(reviewer, dc, 0, false);
        _resolveAs(reviewer, dc, 1, false);
        uint64 deadline = _claimDeadline(dc);

        vm.warp(uint256(deadline) - 1);
        _submitOn(dc, ID_F, 0, FRESH_ID); // one second before D: allowed
        assertEq(_status(dc, 0), uint8(PENDING));

        vm.warp(deadline); // at D: closed, with a perfectly fresh receipt
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 1);
        r.receiptId = keccak256("FIXTURE PB-19 retry at the deadline");
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 1);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, deadline, uint256(deadline))
        );
        dc.submitClaim(r, sig, proof);
        assertEq(_status(dc, 1), uint8(REJECTED), "a rejection after D can no longer be revived");
        assertFalse(verifier.isConsumed(ID_F, r.receiptId));
    }

    function test_rejectedByTimeoutAfterTheDeadlineCannotBeRevived() public {
        uint64 deadline = _claimDeadline(dc);
        vm.warp(uint256(deadline) - 1);
        _dispute(0);
        vm.warp(uint256(_reviewDeadlineOf(dc, 0)));
        assertTrue(block.timestamp > deadline);
        dc.expireChallenge(depKeys[0]);

        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 0);
        r.receiptId = FRESH_ID;
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 0);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, deadline, block.timestamp)
        );
        dc.submitClaim(r, sig, proof);
        assertEq(_status(dc, 0), uint8(REJECTED));
    }

    function test_manyRejectAndRetryCyclesLeakNothing() public {
        for (uint256 k = 0; k < 4; k++) {
            _submitOn(dc, ID_F, 0, keccak256(abi.encode("FIXTURE PB-19 cycle", k)));
            _challengeAs(k % 2 == 0 ? supplierA : challengerAddr, dc, 0);
            if (k % 2 == 0) {
                _resolveAs(reviewer, dc, 0, false);
            } else {
                vm.warp(uint256(_reviewDeadlineOf(dc, 0)));
                dc.expireChallenge(depKeys[0]);
            }
            assertEq(_status(dc, 0), uint8(REJECTED));
            IRemediationCampaign.Accounting memory a = dc.accounting();
            assertEq(a.reserved, 0);
            assertEq(a.unallocated, REQUIRED);
            _assertIdentity(dc);
            vm.warp(block.timestamp + 1 hours);
        }
        assertEq(usdc.balanceOf(address(dc)), REQUIRED);
    }

    function test_nonRejectedStatesStillBlockASecondClaim() public {
        bytes32 key = depKeys[0];
        bytes memory dup = abi.encodeWithSelector(IRemediationCampaign.DeploymentAlreadyClaimed.selector, key);

        _submit(0); // Pending
        _expectDuplicate(0, keccak256("dup pending"), dup);
        _challengeAs(supplierA, dc, 0); // Disputed
        _expectDuplicate(0, keccak256("dup disputed"), dup);
        _resolveAs(reviewer, dc, 0, true); // Awarded
        _expectDuplicate(0, keccak256("dup awarded"), dup);
        vm.prank(recipients[0]);
        dc.withdrawGrant(key); // Withdrawn
        _expectDuplicate(0, keccak256("dup withdrawn"), dup);
        assertEq(dc.accounting().reserved, 0);
    }

    function _expectDuplicate(uint256 i, bytes32 receiptId, bytes memory err) internal {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, i);
        r.receiptId = receiptId;
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, i);
        vm.prank(relayer);
        vm.expectRevert(err);
        dc.submitClaim(r, sig, proof);
        assertFalse(verifier.isConsumed(ID_F, receiptId));
    }

    // ================================================================== no new claims at or after D

    function test_noNewClaimAtOrAfterTheClaimDeadline() public {
        uint64 deadline = _claimDeadline(dc);
        vm.warp(uint256(deadline) - 1);
        _submit(0);
        assertEq(_status(dc, 0), uint8(PENDING));

        vm.warp(deadline);
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_F, 1);
        bytes memory sig = _sign(dc, r);
        bytes32[] memory proof = _proofFor(ID_F, 1);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, deadline, uint256(deadline))
        );
        dc.submitClaim(r, sig, proof);

        vm.warp(uint256(deadline) + 90 days);
        r = _receipt(ID_F, 2);
        sig = _sign(dc, r);
        proof = _proofFor(ID_F, 2);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, deadline, block.timestamp)
        );
        dc.submitClaim(r, sig, proof);
        assertEq(dc.accounting().reserved, GRANT);
    }

    // ================================================================== independent claims

    function test_claimsProgressIndependentlyThroughMixedOutcomes() public {
        _submit(0);
        _submit(1);
        _submit(2);
        uint64 cutoff = _cutoffOf(dc, 0);

        // 0 is challenged, 1 is left alone, 2 is challenged by the other authorized party.
        vm.warp(uint256(cutoff) - 1);
        _challengeAs(supplierA, dc, 0);
        _challengeAs(challengerAddr, dc, 2);
        assertEq(_status(dc, 1), uint8(PENDING), "challenging others does not touch deployment 1");
        assertEq(_cutoffOf(dc, 1), cutoff);

        // 1 finalizes at its own cutoff while 0 and 2 are in review.
        vm.warp(cutoff);
        dc.finalizeClaim(depKeys[1]);
        assertEq(_status(dc, 1), uint8(AWARDED));
        assertEq(_status(dc, 0), uint8(DISPUTED));
        assertEq(_status(dc, 2), uint8(DISPUTED));

        // 0 is awarded by the reviewer; 2 is left to time out.
        _resolveAs(reviewer, dc, 0, true);
        assertEq(_status(dc, 2), uint8(DISPUTED));
        IRemediationCampaign.Accounting memory a = dc.accounting();
        assertEq(a.reserved, GRANT, "only deployment 2 is still reserved");
        assertEq(a.awardedUnwithdrawn, 2 * GRANT);
        _assertIdentity(dc);

        vm.warp(uint256(_reviewDeadlineOf(dc, 2)));
        dc.expireChallenge(depKeys[2]);
        assertEq(_status(dc, 2), uint8(REJECTED));

        // Payouts are per recipient; the rejected deployment gets nothing.
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);
        vm.prank(recipients[1]);
        dc.withdrawGrant(depKeys[1]);
        vm.prank(recipients[2]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[2], REJECTED));
        dc.withdrawGrant(depKeys[2]);

        a = dc.accounting();
        assertEq(a.paid, 2 * GRANT);
        assertEq(a.reserved + a.awardedUnwithdrawn, 0);
        assertEq(a.unallocated, GRANT, "deployment 2's grant is unallocated again");
        assertEq(usdc.balanceOf(recipients[2]), 0);
        _assertIdentity(dc);
    }

    function test_reviewDeadlinesAreIndependentPerClaim() public {
        _submit(0);
        _submit(1);
        vm.warp(block.timestamp + 1 hours);
        _challengeAs(supplierA, dc, 0);
        vm.warp(block.timestamp + 5 hours);
        _challengeAs(supplierA, dc, 1);
        uint64 d0 = _reviewDeadlineOf(dc, 0);
        uint64 d1 = _reviewDeadlineOf(dc, 1);
        assertEq(uint256(d1) - uint256(d0), 5 hours);

        vm.warp(d0);
        dc.expireChallenge(depKeys[0]);
        // Claim 1 is still inside its own review window.
        _resolveAs(reviewer, dc, 1, true);
        assertEq(_status(dc, 1), uint8(AWARDED));
    }

    // ================================================================== terminal states cannot be revived

    function test_terminalClaimsCannotBeChallengedResolvedOrExpired() public {
        _dispute(0);
        _resolveAs(reviewer, dc, 0, true);
        vm.prank(recipients[0]);
        dc.withdrawGrant(depKeys[0]);

        vm.warp(block.timestamp + 365 days);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotPending.selector, depKeys[0], WITHDRAWN));
        dc.challengeClaim(depKeys[0], REASON);
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotDisputed.selector, depKeys[0], WITHDRAWN));
        dc.resolveChallenge(depKeys[0], false);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotDisputed.selector, depKeys[0], WITHDRAWN));
        dc.expireChallenge(depKeys[0]);
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimNotAwarded.selector, depKeys[0], WITHDRAWN));
        dc.withdrawGrant(depKeys[0]);
        assertEq(dc.accounting().paid, GRANT);
        _assertIdentity(dc);
    }

    // ================================================================== transfer failure and reentrancy

    function test_failedPayoutOfAReviewerAwardIsRetryableWithoutBlockingOthers() public {
        FixtureBlocklistToken blk = new FixtureBlocklistToken();
        RemediationCampaign g = _deployDispute(ID_G, address(blk), supplierA, 3);

        for (uint256 i = 0; i < 2; i++) {
            _submitOn(g, ID_G, i, _receiptId(ID_G, i));
            _challengeAs(supplierA, g, i);
            _resolveAs(reviewer, g, i, true);
        }
        blk.setBlocked(recipients[0], true);

        IRemediationCampaign.Accounting memory before = g.accounting();
        vm.prank(recipients[0]);
        vm.expectRevert();
        g.withdrawGrant(depKeys[0]);
        IRemediationCampaign.Accounting memory afterFail = g.accounting();
        assertEq(afterFail.awardedUnwithdrawn, before.awardedUnwithdrawn);
        assertEq(afterFail.paid, before.paid);
        assertEq(_status(g, 0), uint8(AWARDED));
        _assertIdentity(g);

        vm.prank(recipients[1]); // the other deployment is not blocked by it
        g.withdrawGrant(depKeys[1]);
        assertEq(blk.balanceOf(recipients[1]), GRANT);

        blk.setBlocked(recipients[0], false);
        vm.prank(recipients[0]);
        g.withdrawGrant(depKeys[0]);
        assertEq(blk.balanceOf(recipients[0]), GRANT);
        assertEq(g.accounting().paid, 2 * GRANT);
        _assertIdentity(g);
    }

    function test_reentrantRecipientCannotDrainAnotherClaim() public {
        FixtureHookReceiveToken hook = new FixtureHookReceiveToken();
        FixtureReentrantParty party = new FixtureReentrantParty();
        vm.etch(recipients[0], address(party).code); // recipient 0 becomes a contract with a payout callback
        RemediationCampaign h = _deployDispute(ID_H, address(hook), supplierA, 3);

        for (uint256 i = 0; i < 2; i++) {
            _submitOn(h, ID_H, i, _receiptId(ID_H, i));
            _challengeAs(supplierA, h, i);
            _resolveAs(reviewer, h, i, true);
        }
        // From inside its own payout callback, recipient 0 tries to pull deployment 1's grant.
        FixtureReentrantParty(recipients[0]).arm(
            address(h), abi.encodeWithSelector(h.withdrawGrant.selector, depKeys[1])
        );
        vm.prank(recipients[0]);
        h.withdrawGrant(depKeys[0]);

        FixtureReentrantParty rp = FixtureReentrantParty(recipients[0]);
        assertTrue(rp.attempted(), "the callback ran");
        assertFalse(rp.attemptSucceeded(), "re-entry failed");
        assertEq(bytes4(rp.attemptError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(_status(h, 1), uint8(AWARDED), "the other claim is untouched");
        assertEq(hook.balanceOf(recipients[0]), GRANT, "recipient 0 received exactly its own grant");
        assertEq(h.accounting().awardedUnwithdrawn, GRANT);
        _assertIdentity(h);
    }

    // ------------------------------------------------------------------ helper

    /// @dev (status, receiptId, cutoff, recipient) of deployment `i` on campaign F.
    function _unpack(uint256 i) internal view returns (uint8 status, bytes32 receiptId, uint64 cutoff, address recipient) {
        ClaimState memory s = _state(dc, depKeys[i]);
        return (uint8(s.status), s.receiptId, s.challengeCutoff, s.recipient);
    }
}
