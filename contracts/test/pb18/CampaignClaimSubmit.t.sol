// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {ClaimBase} from "./ClaimBase.sol";

/// @notice PB-18 test-first: claim submission. A valid receipt reserves exactly one grant and moves no tokens;
/// every invalid receipt reserves and consumes nothing; duplicates and replays are rejected; the submitter can
/// never change the recipient.
contract CampaignClaimSubmitTest is ClaimBase {
    // ------------------------------------------------------------------ helpers

    /// @dev Submit as the relayer and require `err`; afterwards nothing may have been reserved, consumed or paid.
    function _expectRejected(
        PatchBondTypes.AcceptanceReceipt memory r,
        bytes memory sig,
        bytes32[] memory proof,
        bytes memory err,
        uint256 i
    ) internal {
        vm.prank(relayer);
        vm.expectRevert(err);
        claimCampaign.submitClaim(r, sig, proof);
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId), "rejected receipt is not consumed");
        _assertNothingHappened(claimCampaign, ID_C, i);
    }

    /// @dev Sign `r` with the real verifier key and expect `err`.
    function _expectSignedRejected(PatchBondTypes.AcceptanceReceipt memory r, uint256 i, bytes memory err) internal {
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, i);
        _expectRejected(r, sig, proof, err, i);
    }

    // ------------------------------------------------------------------ valid claim

    function test_validReceiptReservesExactlyOneGrantAndTransfersNothing() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, 0);
        uint64 cutoff = uint64(block.timestamp + 1 days); // policy.challengeWindow = 1 days

        vm.expectEmit(true, true, true, true, address(claimCampaign));
        emit IRemediationCampaign.ClaimSubmitted(depKeys[0], recipients[0], r.receiptId, relayer, cutoff);
        vm.prank(relayer);
        claimCampaign.submitClaim(r, sig, proof);

        ClaimState memory s = _state(claimCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(s.recipient, recipients[0], "recipient fixed by the committed leaf");
        assertEq(s.receiptId, r.receiptId);
        assertEq(s.challengeCutoff, cutoff);
        assertEq(s.withdrawable, 0, "pending claims are not withdrawable");

        IRemediationCampaign.Accounting memory a = claimCampaign.accounting();
        assertEq(a.deposited, REQUIRED);
        assertEq(a.reserved, GRANT, "exactly one grant reserved");
        assertEq(a.unallocated, REQUIRED - GRANT);
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.paid, 0);
        _assertIdentity(claimCampaign);

        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED, "no tokens leave on submit");
        assertEq(usdc.balanceOf(recipients[0]), 0);
        assertEq(usdc.balanceOf(relayer), 0);
        assertTrue(verifier.isConsumed(ID_C, r.receiptId), "receipt consumed with the claim");
    }

    function test_resultIsIndependentOfWhoSubmits() public {
        address[3] memory submitters = [recipients[0], relayer, supplierA];
        for (uint256 i = 0; i < 3; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _claimAs(submitters[i], i);
            ClaimState memory s = _state(claimCampaign, depKeys[i]);
            assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
            assertEq(s.recipient, recipients[i], "recipient comes from the receipt leaf, not the submitter");
            assertEq(s.receiptId, r.receiptId);
        }
        assertEq(claimCampaign.accounting().reserved, 3 * GRANT);
        assertEq(claimCampaign.accounting().unallocated, 0);
        _assertIdentity(claimCampaign);
    }

    function testFuzz_anySubmitterYieldsTheSameFixedRecipient(address submitter) public {
        vm.assume(submitter != address(0));
        _claimAs(submitter, 1);
        assertEq(_state(claimCampaign, depKeys[1]).recipient, recipients[1]);
    }

    // ------------------------------------------------------------------ campaign state

    function test_inactiveCampaignRejectsClaims() public {
        // Funded in full but never activated.
        RemediationCampaign e = _deployClaimCampaign(ID_E, address(usdc), true, false);
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_E, 0);
        bytes memory sig = _sign(e, r);
        bytes32[] memory proof = _proofFor(ID_E, 0);
        vm.prank(relayer);
        vm.expectRevert(IRemediationCampaign.CampaignNotActive.selector);
        e.submitClaim(r, sig, proof);
        assertFalse(verifier.isConsumed(ID_E, r.receiptId));
        assertEq(e.accounting().reserved, 0);
    }

    function test_claimsRejectedAtOrAfterClaimDeadline() public {
        uint64 deadline = claimCampaign.policy().claimDeadline;

        // One second before the deadline a fresh receipt still works.
        vm.warp(uint256(deadline) - 1);
        _claimAs(relayer, 0);
        assertEq(uint8(_state(claimCampaign, depKeys[0]).status), uint8(IRemediationCampaign.ClaimStatus.Pending));

        // At the deadline, with a fresh receipt, the only failing rule is the deadline.
        vm.warp(deadline);
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 1);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, 1);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, deadline, uint256(deadline)));
        claimCampaign.submitClaim(r, sig, proof);
        assertEq(uint8(_state(claimCampaign, depKeys[1]).status), uint8(IRemediationCampaign.ClaimStatus.None));
        assertFalse(verifier.isConsumed(ID_C, r.receiptId));
        assertEq(claimCampaign.accounting().reserved, GRANT, "only the first claim holds a reservation");
    }

    // ------------------------------------------------------------------ invalid receipts reserve and consume nothing

    function test_invalidSignatureFromWrongKey() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _signWith(otherKey, claimCampaign, r);
        _expectRejected(
            r,
            sig,
            _proofFor(ID_C, 0),
            abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, otherAddr, verifierAddr),
            0
        );
    }

    function test_malformedSignatureRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory good = _sign(claimCampaign, r);
        bytes memory shortSig = new bytes(64);
        for (uint256 j = 0; j < 64; j++) shortSig[j] = good[j];
        _expectRejected(
            r, shortSig, _proofFor(ID_C, 0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignatureLength.selector, 64), 0
        );
        _expectRejected(
            r, "", _proofFor(ID_C, 0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignatureLength.selector, 0), 0
        );
    }

    function test_unknownCampaignReceiptRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.campaignId = keccak256("FIXTURE PB-18 unknown campaign");
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.UnknownCampaign.selector, r.campaignId));
    }

    function test_receiptForAnotherRegisteredCampaignRejected() public {
        // A receipt for a different, real campaign cannot reserve funds here: its policy hash is not this policy's.
        RemediationCampaign d = _deployClaimCampaign(ID_D, address(usdc), false, false);
        d; // registered with its own policy hash
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.campaignPolicyHash = registry.policyHashOf(ID_D);
        _expectSignedRejected(
            r,
            0,
            abi.encodeWithSelector(
                IAcceptanceVerifier.PolicyHashMismatch.selector, r.campaignPolicyHash, registry.policyHashOf(ID_C)
            )
        );
    }

    function test_previewModeRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.mode = 0;
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidMode.selector, uint8(0)));
    }

    function test_diagnosticPurposeRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.purpose = 0;
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidPurpose.selector, uint8(0)));
    }

    function test_nonPassingResultsRejected() public {
        uint8[4] memory bad = [uint8(0), 2, 3, 4]; // unset, fail, unknown, unsupported
        for (uint256 k = 0; k < bad.length; k++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
            r.result = bad[k];
            _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidResult.selector, bad[k]));
        }
    }

    function test_staleReceiptsRejected() public {
        // Older than maxReceiptAge (300) but not yet expired.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.issuedAt = uint64(block.timestamp - 301);
        r.observedBlockTimestamp = r.issuedAt;
        r.snapshotHash = _snapshotHash(r);
        r.expiresAt = uint64(block.timestamp + 1000);
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptTooOld.selector, r.issuedAt, 300, block.timestamp));

        // Expired.
        r = _receipt(ID_C, 0);
        r.expiresAt = uint64(block.timestamp - 1);
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, r.expiresAt, block.timestamp));

        // Issued in the future.
        r = _receipt(ID_C, 0);
        r.issuedAt = uint64(block.timestamp + 1);
        r.expiresAt = uint64(block.timestamp + 100);
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptNotYetValid.selector, r.issuedAt, block.timestamp));
    }

    function test_receiptTurnsStaleBeforeSubmission() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, 0);
        vm.warp(block.timestamp + 291); // past expiresAt (+200); also older than maxReceiptAge
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, r.expiresAt, block.timestamp));
        claimCampaign.submitClaim(r, sig, proof);
        assertFalse(verifier.isConsumed(ID_C, r.receiptId));
        assertEq(claimCampaign.accounting().reserved, 0);
    }

    function test_wrongRecipientRejected() public {
        // Signed by the real verifier but the recipient is not the one committed for this deployment.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.recipient = attacker;
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));

        r = _receipt(ID_C, 0);
        r.recipient = recipients[1]; // another eligible recipient, wrong for this deployment
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
    }

    function test_deploymentOutsideTheEligibleSetRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.deploymentKey = keccak256("FIXTURE PB-18 ineligible deployment");
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
    }

    function test_badEligibilityProofRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(claimCampaign, r);
        bytes memory err = abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector);
        _expectRejected(r, sig, new bytes32[](0), err, 0);
        _expectRejected(r, sig, _proofFor(ID_C, 1), err, 0);
        bytes32[] memory tampered = _proofFor(ID_C, 0);
        tampered[0] = bytes32(uint256(tampered[0]) ^ 1);
        _expectRejected(r, sig, tampered, err, 0);
    }

    function test_testPackAndScopeMismatchesRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        r.testPackHash = keccak256("FIXTURE PB-18 other test pack");
        _expectSignedRejected(
            r, 0, abi.encodeWithSelector(IAcceptanceVerifier.TestPackMismatch.selector, r.testPackHash, registry.policyOf(ID_C).testPackHash)
        );

        r = _receipt(ID_C, 0);
        r.sourceChainId = 1;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRejected(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SourceChainMismatch.selector, 1, SOURCE_CHAIN));
    }

    function test_signatureForAnotherCampaignAddressRejected() public {
        // Signed for the PB-17 campaign A's address instead of this campaign: the domain differs, so the signer
        // recovered under this campaign's domain is not the verifier.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(campaign, r); // campaign A address as verifyingContract
        address recovered =
            _recoverSigner(PatchBondTypes.receiptDigest(block.chainid, address(claimCampaign), r), sig);
        assertTrue(recovered != verifierAddr, "fixture sanity: wrong domain does not recover the verifier");
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, recovered, verifierAddr));
        claimCampaign.submitClaim(r, sig, _proofFor(ID_C, 0));
        assertFalse(verifier.isConsumed(ID_C, r.receiptId));
        assertEq(claimCampaign.accounting().reserved, 0);
    }

    // ------------------------------------------------------------------ duplicates and replay

    function test_duplicateDeploymentWithSameReceiptRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _claimAs(relayer, 0);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, 0);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeploymentAlreadyClaimed.selector, depKeys[0]));
        claimCampaign.submitClaim(r, sig, proof);

        // A different submitter, including the recipient, gets the same answer.
        vm.prank(recipients[0]);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeploymentAlreadyClaimed.selector, depKeys[0]));
        claimCampaign.submitClaim(r, sig, proof);

        assertEq(claimCampaign.accounting().reserved, GRANT, "still exactly one grant reserved");
        _assertIdentity(claimCampaign);
    }

    function test_duplicateDeploymentWithFreshReceiptIdRejected() public {
        _claimAs(relayer, 0);
        PatchBondTypes.AcceptanceReceipt memory second = _receipt(ID_C, 0);
        second.receiptId = keccak256("FIXTURE PB-18 second receipt for the same deployment");
        bytes memory sig = _sign(claimCampaign, second);
        bytes32[] memory proof = _proofFor(ID_C, 0);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeploymentAlreadyClaimed.selector, depKeys[0]));
        claimCampaign.submitClaim(second, sig, proof);
        assertFalse(verifier.isConsumed(ID_C, second.receiptId), "the second receipt was not burned");
        assertEq(claimCampaign.accounting().reserved, GRANT);
    }

    function test_receiptReplayAcrossDeploymentsRejected() public {
        // The verifier signed two receipts that reuse one receiptId for different deployments. The second must fail
        // on replay protection even though deployment 1 has no claim yet.
        PatchBondTypes.AcceptanceReceipt memory first = _claimAs(relayer, 0);
        PatchBondTypes.AcceptanceReceipt memory replay = _receipt(ID_C, 1);
        replay.receiptId = first.receiptId;
        bytes memory sig = _sign(claimCampaign, replay);
        bytes32[] memory proof = _proofFor(ID_C, 1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, ID_C, first.receiptId)
        );
        claimCampaign.submitClaim(replay, sig, proof);

        assertEq(uint8(_state(claimCampaign, depKeys[1]).status), uint8(IRemediationCampaign.ClaimStatus.None));
        assertEq(claimCampaign.accounting().reserved, GRANT);
        _assertIdentity(claimCampaign);
    }

    // ------------------------------------------------------------------ submitter cannot change the recipient

    function test_frontRunnerCannotSubstituteRecipient() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, 0);
        bytes memory sig = _sign(claimCampaign, r);

        // The attacker rewrites the recipient in the receipt and reuses the verifier's signature.
        PatchBondTypes.AcceptanceReceipt memory tampered = _receipt(ID_C, 0);
        tampered.recipient = attacker;
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
        claimCampaign.submitClaim(tampered, sig, _proofFor(ID_C, 0));
        assertEq(uint8(_state(claimCampaign, depKeys[0]).status), uint8(IRemediationCampaign.ClaimStatus.None));
        assertFalse(verifier.isConsumed(ID_C, r.receiptId), "the failed front-run did not burn the receipt");

        // The attacker even proves a leaf for itself under a different deployment key: still not eligible here.
        tampered = _receipt(ID_C, 0);
        tampered.recipient = attacker;
        tampered.deploymentKey = depKeys[2];
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
        claimCampaign.submitClaim(tampered, sig, _proofFor(ID_C, 2));

        // The honest receipt still goes through afterwards, with the committed recipient.
        vm.prank(recipients[0]);
        claimCampaign.submitClaim(r, sig, _proofFor(ID_C, 0));
        assertEq(_state(claimCampaign, depKeys[0]).recipient, recipients[0]);
    }

    function test_relayingSomeoneElsesValidReceiptDoesNotRedirectFunds() public {
        // The attacker relays the genuine receipt. The claim exists, but it still belongs to the real recipient.
        _claimAs(attacker, 0);
        ClaimState memory s = _state(claimCampaign, depKeys[0]);
        assertEq(s.recipient, recipients[0]);
        assertTrue(s.recipient != attacker);
        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(usdc.balanceOf(address(claimCampaign)), REQUIRED);
    }
}
