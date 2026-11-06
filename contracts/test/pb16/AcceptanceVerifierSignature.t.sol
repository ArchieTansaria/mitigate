// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {AcceptanceVerifierBase} from "./AcceptanceVerifierBase.sol";

/// @notice PB-16 signature, replay and consume-authorization tests. Signatures come from a disposable test key via
/// vm.sign (real secp256k1), never from a stub.
contract AcceptanceVerifierSignatureTest is AcceptanceVerifierBase {
    // ------------------------------------------------------------------ signer

    function test_signatureFromOtherKeyReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _signDigest(otherKey, _digest(block.chainid, address(campaign), r));
        _expectRevert(
            r, sig, _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, otherAddr, verifierAddr)
        );
    }

    function test_signatureFromSupplierOrReviewerKeyIsNotTheVerifier() public {
        // Only policy.verifier may sign; other configured roles cannot.
        (address supplierSigner, uint256 supplierKey) = makeAddrAndKey("FIXTURE disposable supplier signer");
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _signDigest(supplierKey, _digest(block.chainid, address(campaign), r));
        _expectRevert(
            r, sig, _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, supplierSigner, verifierAddr)
        );
    }

    function _expectRecoveredMismatch(PatchBondTypes.AcceptanceReceipt memory signed, PatchBondTypes.AcceptanceReceipt memory presented)
        internal
    {
        bytes memory sig = _sign(signed);
        bytes32 presentedDigest = _digest(block.chainid, address(campaign), presented);
        (uint8 v, bytes32 rr, bytes32 ss) = _split(sig);
        address recovered = ecrecover(presentedDigest, v, rr, ss);
        _expectRevert(
            presented, sig, _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, recovered, verifierAddr)
        );
    }

    function _split(bytes memory sig) internal pure returns (uint8 v, bytes32 rr, bytes32 ss) {
        rr = bytes32(_slice(sig, 0));
        ss = bytes32(_slice(sig, 32));
        v = uint8(sig[64]);
    }

    function _slice(bytes memory b, uint256 start) internal pure returns (uint256 out) {
        for (uint256 i = 0; i < 32; i++) {
            out = (out << 8) | uint8(b[start + i]);
        }
    }

    function test_fieldsChangedAfterSigningInvalidateTheSignature() public {
        PatchBondTypes.AcceptanceReceipt memory signed = _receipt(0);

        // Each of these keeps every scope/eligibility check passing, so only the signature can fail.
        PatchBondTypes.AcceptanceReceipt memory m = _receipt(0);
        m.evidenceDigest = keccak256("FIXTURE other evidence");
        _expectRecoveredMismatch(signed, m);

        m = _receipt(0);
        m.receiptId = keccak256("FIXTURE other receipt id");
        _expectRecoveredMismatch(signed, m);

        m = _receipt(0);
        m.issuedAt += 1;
        _expectRecoveredMismatch(signed, m);

        m = _receipt(0);
        m.expiresAt += 1;
        _expectRecoveredMismatch(signed, m);

        m = _receipt(0);
        m.observedBlockNumber = 11;
        m.snapshotHash = _snapshotHash(m);
        _expectRecoveredMismatch(signed, m);
    }

    // ------------------------------------------------------------------ malformed signatures

    function test_badSignatureLengthsRevert() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        uint256[5] memory lens = [uint256(0), 1, 64, 66, 130];
        for (uint256 i = 0; i < lens.length; i++) {
            bytes memory bad = new bytes(lens[i]);
            for (uint256 j = 0; j < lens[i] && j < 65; j++) {
                bad[j] = sig[j];
            }
            _expectRevert(r, bad, proof, abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignatureLength.selector, lens[i]));
        }
    }

    function test_compactEip2098SignatureIsRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(verifierKey, _digest(block.chainid, address(campaign), r));
        bytes32 vs = bytes32((uint256(v - 27) << 255) | uint256(ss));
        _expectRevert(
            r, abi.encodePacked(rr, vs), _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignatureLength.selector, 64)
        );
    }

    function test_invalidVRevertsIncludingZeroOneAndHighValues() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(verifierKey, _digest(block.chainid, address(campaign), r));
        v;
        uint8[6] memory badV = [uint8(0), 1, 26, 29, 35, 255];
        for (uint256 i = 0; i < badV.length; i++) {
            _expectRevert(
                r,
                abi.encodePacked(rr, ss, badV[i]),
                _proof(0),
                abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignatureV.selector, badV[i])
            );
        }
    }

    function test_flippedVRecoversDifferentSignerAndReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 d = _digest(block.chainid, address(campaign), r);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(verifierKey, d);
        uint8 flipped = v == 27 ? 28 : 27;
        address recovered = ecrecover(d, flipped, rr, ss);
        assertTrue(recovered != verifierAddr);
        bytes memory err = recovered == address(0)
            ? abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignature.selector)
            : abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, recovered, verifierAddr);
        _expectRevert(r, abi.encodePacked(rr, ss, flipped), _proof(0), err);
    }

    function test_highSMalleableTwinIsRejected() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 d = _digest(block.chainid, address(campaign), r);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(verifierKey, d);
        assertLe(uint256(ss), SECP256K1_N / 2, "vm.sign returns canonical low-s");

        bytes32 highS = bytes32(SECP256K1_N - uint256(ss));
        uint8 twinV = v == 27 ? 28 : 27;
        // The twin is a valid ECDSA signature of the same digest by the same key...
        assertEq(ecrecover(d, twinV, rr, highS), verifierAddr, "twin recovers the real signer");
        // ...but the verifier refuses it.
        _expectRevert(
            r, abi.encodePacked(rr, highS, twinV), _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.HighSSignature.selector, highS)
        );
        // The canonical form is accepted.
        verifier.validateReceipt(r, abi.encodePacked(rr, ss, v), _proof(0));
    }

    function test_zeroROrSRevertsAsInvalidSignature() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(verifierKey, _digest(block.chainid, address(campaign), r));
        bytes memory err = abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignature.selector);
        _expectRevert(r, abi.encodePacked(bytes32(0), ss, v), _proof(0), err);
        _expectRevert(r, abi.encodePacked(rr, bytes32(0), v), _proof(0), err);
        _expectRevert(r, abi.encodePacked(bytes32(0), bytes32(0), uint8(27)), _proof(0), err);
    }

    function test_rOutsideCurveOrderRevertsAsInvalidSignature() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        _expectRevert(
            r,
            abi.encodePacked(bytes32(SECP256K1_N), bytes32(uint256(1)), uint8(27)),
            _proof(0),
            abi.encodeWithSelector(IAcceptanceVerifier.InvalidSignature.selector)
        );
    }

    function testFuzz_randomSignatureNeverValidates(bytes32 rr, bytes32 ss, uint8 v) public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32[] memory proof = _proof(0);
        vm.expectRevert();
        verifier.validateReceipt(r, abi.encodePacked(rr, ss, v), proof);
    }

    // ------------------------------------------------------------------ consume: authorization

    function test_onlyPolicyCampaignMayConsume() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        address[5] memory callers = [attacker, relayer, recipients[0], verifierAddr, supplier];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.CallerNotCampaign.selector, callers[i], address(campaign)));
            verifier.consumeReceipt(r, sig, _proof(0));
        }
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId), "front-runner could not burn the receipt");
        // The legitimate campaign path still works afterwards.
        campaign.claim(r, sig, _proof(0), false);
        assertTrue(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function test_consumeMarksReceiptAndEmits() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(1);
        bytes memory sig = _sign(r);
        bytes32 d = _digest(block.chainid, address(campaign), r);
        vm.expectEmit(true, true, true, true, address(verifier));
        emit IAcceptanceVerifier.ReceiptConsumed(r.campaignId, r.receiptId, r.recipient, r.deploymentKey, d);
        vm.prank(relayer);
        campaign.claim(r, sig, _proof(1), false);
        assertTrue(verifier.isConsumed(r.campaignId, r.receiptId));
        assertEq(campaign.reserved(), 1);
    }

    // ------------------------------------------------------------------ replay and atomicity

    function test_replayOfConsumedReceiptReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        campaign.claim(r, sig, _proof(0), false);

        bytes memory err = abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, r.campaignId, r.receiptId);
        vm.prank(relayer);
        vm.expectRevert(err);
        campaign.claim(r, sig, _proof(0), false);
        // Validation also reports the replay so a campaign can dry-run it.
        _expectRevert(r, sig, _proof(0), err);
        assertEq(campaign.reserved(), 1, "no second reservation");
    }

    function test_revertAfterConsumeRollsBackConsumption() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        vm.expectRevert("FIXTURE: reservation failed after consume");
        campaign.claim(r, sig, proof, true);
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId), "consume rolled back with the failed claim");
        assertEq(campaign.reserved(), 0);
        campaign.claim(r, sig, proof, false); // receipt remains usable
        assertTrue(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function test_failedConsumeLeavesReceiptUnconsumed() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory badSig = _signDigest(otherKey, _digest(block.chainid, address(campaign), r));
        bytes32[] memory proof = _proof(0);
        vm.expectRevert();
        campaign.claim(r, badSig, proof, false);
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId));
        campaign.claim(r, _sign(r), proof, false);
        assertTrue(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function test_expiredReceiptCannotBeConsumed() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        vm.warp(r.expiresAt + 1);
        vm.expectRevert();
        campaign.claim(r, sig, proof, false);
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function test_differentReceiptIdsForSameDeploymentAreIndependentAtVerifierLevel() public {
        // One-active-claim-per-deployment belongs to the campaign contract; the verifier only dedupes receipt ids.
        PatchBondTypes.AcceptanceReceipt memory a = _receipt(0);
        PatchBondTypes.AcceptanceReceipt memory b = _receipt(0);
        b.receiptId = keccak256("FIXTURE second receipt for same deployment");
        campaign.claim(a, _sign(a), _proof(0), false);
        campaign.claim(b, _sign(b), _proof(0), false);
        assertTrue(verifier.isConsumed(a.campaignId, a.receiptId));
        assertTrue(verifier.isConsumed(b.campaignId, b.receiptId));
    }

    function test_independentDeploymentsConsumeIndependently() public {
        for (uint256 i = 0; i < 3; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(i);
            vm.prank(recipients[i]);
            campaign.claim(r, _sign(r), _proof(i), false);
        }
        assertEq(campaign.reserved(), 3);
    }

    function test_replayKeyIsPerCampaign() public {
        // Campaign B: single-leaf tree, same campaign contract address, same receiptId as a campaign A receipt.
        bytes32 leafB = PatchBondTypes.eligibilityLeaf(FIXTURE_CAMPAIGN_ID_B, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0]);
        PatchBondTypes.Policy memory pb = _policy();
        pb.campaignId = FIXTURE_CAMPAIGN_ID_B;
        pb.eligibilityRoot = leafB;
        pb.eligibleCount = 1;
        _createCampaign(pb);

        PatchBondTypes.AcceptanceReceipt memory a = _receipt(0);
        PatchBondTypes.AcceptanceReceipt memory b = _receipt(0);
        b.campaignId = FIXTURE_CAMPAIGN_ID_B;
        b.campaignPolicyHash = registry.policyHashOf(FIXTURE_CAMPAIGN_ID_B);
        assertEq(a.receiptId, b.receiptId, "same receipt id in both campaigns");

        campaign.claim(a, _sign(a), _proof(0), false);
        assertTrue(verifier.isConsumed(a.campaignId, a.receiptId));
        assertFalse(verifier.isConsumed(b.campaignId, b.receiptId), "campaign B unaffected");
        campaign.claim(b, _sign(b), new bytes32[](0), false);
        assertTrue(verifier.isConsumed(b.campaignId, b.receiptId));

        // A's signed receipt cannot be re-pointed at B: B's policy hash and leaf differ.
        PatchBondTypes.AcceptanceReceipt memory cross = _receipt(1);
        cross.campaignId = FIXTURE_CAMPAIGN_ID_B;
        vm.expectRevert();
        verifier.validateReceipt(cross, _sign(cross), _proof(1));
    }
}
