// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {AcceptanceVerifier} from "../../pb16/AcceptanceVerifier.sol";
import {ICampaignRegistry} from "../../pb15/ICampaignRegistry.sol";
import {AcceptanceVerifierBase} from "./AcceptanceVerifierBase.sol";

/// @notice PB-16 scope tests: campaign/policy/chain/test-pack/snapshot/enum/time/eligibility binding.
/// Each negative test signs the altered receipt with the real policy verifier key, so the only reason to revert
/// is the field under test (not a broken signature).
contract AcceptanceVerifierScopeTest is AcceptanceVerifierBase {
    // ------------------------------------------------------------------ positive

    function test_validate_acceptsValidReceiptForEachDeployment() public view {
        for (uint256 i = 0; i < 3; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(i);
            bytes32 d = verifier.validateReceipt(r, _sign(r), _proof(i));
            assertEq(d, _digest(block.chainid, address(campaign), r), "digest");
        }
    }

    function test_validate_anyoneMayDryRunButNothingIsConsumed() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        vm.prank(attacker);
        verifier.validateReceipt(r, sig, _proof(0));
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function test_receiptDigestOf_usesPolicyDomain() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(1);
        assertEq(verifier.receiptDigestOf(r), PatchBondTypes.receiptDigest(FIXTURE_DEST_CHAIN_ID, address(campaign), r));
    }

    function test_registryAccessorAndConstructorGuard() public {
        assertEq(verifier.registry(), address(registry));
        vm.expectRevert(IAcceptanceVerifier.InvalidRegistry.selector);
        new AcceptanceVerifier(ICampaignRegistry(address(0)));
        vm.expectRevert(IAcceptanceVerifier.InvalidRegistry.selector);
        new AcceptanceVerifier(ICampaignRegistry(attacker)); // EOA, no code
    }

    // ------------------------------------------------------------------ unknown / zero campaign

    function test_unknownCampaignReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.campaignId = keccak256("FIXTURE unknown campaign");
        bytes memory sig = _sign(r);
        _expectRevert(r, sig, _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.UnknownCampaign.selector, r.campaignId));

        vm.prank(address(campaign));
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.UnknownCampaign.selector, r.campaignId));
        verifier.consumeReceipt(r, sig, _proof(0));

        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.UnknownCampaign.selector, r.campaignId));
        verifier.receiptDigestOf(r);
    }

    function test_zeroCampaignIdReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.campaignId = bytes32(0);
        bytes memory sig = _sign(r);
        _expectRevert(r, sig, _proof(0), abi.encodeWithSelector(IAcceptanceVerifier.UnknownCampaign.selector, bytes32(0)));
    }

    // ------------------------------------------------------------------ destination chain / domain

    function test_wrongBlockChainIdReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        vm.chainId(1);
        _expectRevert(
            r, sig, proof, abi.encodeWithSelector(IAcceptanceVerifier.WrongDestinationChain.selector, FIXTURE_DEST_CHAIN_ID, 1)
        );
    }

    function test_signatureForOtherChainDomainReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _signDigest(verifierKey, _digest(FIXTURE_SOURCE_CHAIN_ID, address(campaign), r));
        _expectInvalidSigner(r, sig, _proof(0), _recover(_digest(block.chainid, address(campaign), r), sig));
    }

    function test_signatureForOtherVerifyingContractReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        // Signed against the verifier or the registry instead of the campaign.
        bytes32 dVerifier = _digest(block.chainid, address(verifier), r);
        bytes32 dRegistry = _digest(block.chainid, address(registry), r);
        bytes memory s1 = _signDigest(verifierKey, dVerifier);
        bytes memory s2 = _signDigest(verifierKey, dRegistry);
        _expectInvalidSigner(r, s1, _proof(0), _recover(_digest(block.chainid, address(campaign), r), s1));
        _expectInvalidSigner(r, s2, _proof(0), _recover(_digest(block.chainid, address(campaign), r), s2));
    }

    function test_signatureForOtherDomainNameOrVersionReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 structHash = PatchBondTypes.receiptStructHash(r);
        bytes32 badName = keccak256(
            abi.encode(PatchBondTypes.DOMAIN_TYPEHASH, keccak256("PatchBondX"), keccak256("1"), block.chainid, address(campaign))
        );
        bytes32 badVersion = keccak256(
            abi.encode(PatchBondTypes.DOMAIN_TYPEHASH, keccak256("PatchBond"), keccak256("2"), block.chainid, address(campaign))
        );
        bytes32 d1 = keccak256(abi.encodePacked(hex"1901", badName, structHash));
        bytes32 d2 = keccak256(abi.encodePacked(hex"1901", badVersion, structHash));
        bytes memory s1 = _signDigest(verifierKey, d1);
        bytes memory s2 = _signDigest(verifierKey, d2);
        _expectInvalidSigner(r, s1, _proof(0), _recover(_digest(block.chainid, address(campaign), r), s1));
        _expectInvalidSigner(r, s2, _proof(0), _recover(_digest(block.chainid, address(campaign), r), s2));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        bytes32 rr;
        bytes32 ss;
        uint8 v;
        assembly {
            rr := mload(add(sig, 32))
            ss := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return ecrecover(digest, v, rr, ss);
    }

    function _expectInvalidSigner(
        PatchBondTypes.AcceptanceReceipt memory r,
        bytes memory sig,
        bytes32[] memory proof,
        address recovered
    ) internal {
        _expectRevert(r, sig, proof, abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, recovered, verifierAddr));
    }

    // ------------------------------------------------------------------ policy / scope binding

    function test_wrongPolicyHashReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 expected = r.campaignPolicyHash;
        r.campaignPolicyHash = keccak256("FIXTURE mutated policy hash");
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.PolicyHashMismatch.selector, r.campaignPolicyHash, expected));
    }

    function test_policyHashOfMutatedTermsReverts() public {
        // A hash of the same policy with one changed term (grant) is a different policy and must not be accepted.
        PatchBondTypes.Policy memory m = _policy();
        m.grantAmount += 1;
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 expected = r.campaignPolicyHash;
        r.campaignPolicyHash = PatchBondTypes.policyHash(m);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.PolicyHashMismatch.selector, r.campaignPolicyHash, expected));
    }

    function test_wrongSourceChainReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.sourceChainId = 1;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SourceChainMismatch.selector, 1, FIXTURE_SOURCE_CHAIN_ID));
    }

    function test_wrongTestPackReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.testPackHash = keccak256("FIXTURE other test pack");
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.TestPackMismatch.selector, r.testPackHash, FIXTURE_TEST_PACK_HASH));
    }

    function test_wrongDeploymentKeyReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.deploymentKey = keccak256("FIXTURE ineligible deployment");
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
    }

    function test_substitutedRecipientReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.recipient = attacker;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
        r.recipient = recipients[1]; // another eligible recipient, wrong for this deployment
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
        r.recipient = address(0);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
    }

    function test_badProofReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory empty = new bytes32[](0);
        bytes32[] memory wrong = _proof(1);
        bytes32[] memory truncated = new bytes32[](1);
        truncated[0] = _proof(0)[0];
        bytes32[] memory tampered = _proof(0);
        tampered[1] = bytes32(uint256(tampered[1]) ^ 1);
        bytes memory err = abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector);
        _expectRevert(r, sig, empty, err);
        _expectRevert(r, sig, wrong, err);
        _expectRevert(r, sig, truncated, err);
        _expectRevert(r, sig, tampered, err);
    }

    function test_registeredRecipientIsRecordedButProofStillRequired() public {
        vm.prank(relayer);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0));
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        verifier.validateReceipt(r, _sign(r), _proof(0)); // registered recipient matches: still valid
        r.recipient = attacker;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.NotEligible.selector));
    }

    // ------------------------------------------------------------------ snapshot

    function test_alteredSnapshotFieldsRevert() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 original = r.snapshotHash;

        r = _receipt(0);
        r.observedBlockNumber = 11;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotHashMismatch.selector, original, _snapshotHash(r)));

        r = _receipt(0);
        r.observedBlockHash = keccak256("FIXTURE other block hash");
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotHashMismatch.selector, original, _snapshotHash(r)));

        r = _receipt(0);
        r.observedBlockTimestamp += 1;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotHashMismatch.selector, original, _snapshotHash(r)));
    }

    function test_wrongSnapshotHashReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 expected = r.snapshotHash;
        r.snapshotHash = keccak256("FIXTURE other snapshot hash");
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotHashMismatch.selector, r.snapshotHash, expected));
    }

    function test_snapshotHashFromDifferentChainReverts() public {
        // Snapshot hash built over the destination chain id instead of the receipt's source chain id.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes32 expected = r.snapshotHash;
        r.snapshotHash = PatchBondTypes.snapshotHash(
            PatchBondTypes.Snapshot(FIXTURE_DEST_CHAIN_ID, r.observedBlockNumber, r.observedBlockHash, r.observedBlockTimestamp)
        );
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotHashMismatch.selector, r.snapshotHash, expected));
    }

    function test_zeroObservedBlockNumberReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockNumber = 0;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("observedBlockNumber")));
    }

    function test_zeroObservedBlockHashReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockHash = bytes32(0);
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("observedBlockHash")));
    }

    function test_zeroEvidenceDigestReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.evidenceDigest = bytes32(0);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("evidenceDigest")));
    }

    function test_zeroReceiptIdReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.receiptId = bytes32(0);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("receiptId")));
    }

    // ------------------------------------------------------------------ snapshot time consistency
    // Every receipt below has its snapshotHash recomputed for the altered timestamp and is signed with the real
    // policy verifier key, so the timestamp rule is the only thing that can reject it.

    function test_zeroObservedBlockTimestampReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockTimestamp = 0;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("observedBlockTimestamp")));
    }

    function test_observedBlockTimestampAfterIssuedAtReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockTimestamp = r.issuedAt + 1;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(
            r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, r.observedBlockTimestamp, r.issuedAt)
        );

        // Far in the future (also after now) and the maximum value are rejected the same way.
        r.observedBlockTimestamp = uint64(block.timestamp + 1 days);
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(
            r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, r.observedBlockTimestamp, r.issuedAt)
        );
        r.observedBlockTimestamp = type(uint64).max;
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(
            r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, r.observedBlockTimestamp, r.issuedAt)
        );
    }

    function test_observedBlockTimestampBoundariesAccepted() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);

        r.observedBlockTimestamp = r.issuedAt; // equal to issuedAt is allowed
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));

        r.observedBlockTimestamp = r.issuedAt - 1;
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));

        r.observedBlockTimestamp = 1; // smallest nonzero timestamp is allowed
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));
    }

    function test_staleSnapshotHashDoesNotMaskTimestampRule() public {
        // Timestamp changed but snapshotHash left stale: the explicit timestamp rule reports first.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockTimestamp = r.issuedAt + 1;
        _expectSignedRevert(
            r, 0, abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, r.observedBlockTimestamp, r.issuedAt)
        );
        r = _receipt(0);
        r.observedBlockTimestamp = 0;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("observedBlockTimestamp")));
    }

    function test_timestampRuleAppliesOnConsumeToo() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockTimestamp = r.issuedAt + 1;
        r.snapshotHash = _snapshotHash(r);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        vm.expectRevert(
            abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, r.observedBlockTimestamp, r.issuedAt)
        );
        campaign.claim(r, sig, proof, false);
        assertFalse(verifier.isConsumed(r.campaignId, r.receiptId));
    }

    function testFuzz_observedBlockTimestampMustBeWithinZeroExclusiveAndIssuedAtInclusive(uint64 ts) public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.observedBlockTimestamp = ts;
        r.snapshotHash = _snapshotHash(r);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        if (ts == 0) {
            vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ZeroField.selector, bytes32("observedBlockTimestamp")));
        } else if (ts > r.issuedAt) {
            vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.SnapshotAfterIssuance.selector, ts, r.issuedAt));
        }
        verifier.validateReceipt(r, sig, proof);
    }

    // ------------------------------------------------------------------ enums

    function test_purposeMustBeCampaignClaim() public {
        uint8[3] memory bad = [uint8(0), uint8(2), uint8(255)];
        for (uint256 i = 0; i < bad.length; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
            r.purpose = bad[i];
            _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidPurpose.selector, bad[i]));
        }
    }

    function test_modeMustBeDeployed() public {
        uint8[3] memory bad = [uint8(0), uint8(2), uint8(255)];
        for (uint256 i = 0; i < bad.length; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
            r.mode = bad[i];
            _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidMode.selector, bad[i]));
        }
    }

    function test_resultMustBePass() public {
        uint8[5] memory bad = [uint8(0), uint8(2), uint8(3), uint8(4), uint8(255)];
        for (uint256 i = 0; i < bad.length; i++) {
            PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
            r.result = bad[i];
            _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidResult.selector, bad[i]));
        }
    }

    function testFuzz_onlyPurposeModeResultOneAccepted(uint8 purpose, uint8 mode, uint8 result) public {
        vm.assume(!(purpose == 1 && mode == 1 && result == 1));
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.purpose = purpose;
        r.mode = mode;
        r.result = result;
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        vm.expectRevert();
        verifier.validateReceipt(r, sig, proof);
    }

    // ------------------------------------------------------------------ time

    function test_expiresAtMustBeAfterIssuedAt() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.expiresAt = r.issuedAt;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidTimeWindow.selector, r.issuedAt, r.expiresAt));
        r.expiresAt = r.issuedAt - 1;
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.InvalidTimeWindow.selector, r.issuedAt, r.expiresAt));
    }

    function test_issuedInTheFutureReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.issuedAt = uint64(block.timestamp + 1);
        r.expiresAt = uint64(block.timestamp + 100);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptNotYetValid.selector, r.issuedAt, block.timestamp));
    }

    function test_expiredReverts() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.expiresAt = uint64(block.timestamp - 1);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, r.expiresAt, block.timestamp));
    }

    function test_olderThanMaxReceiptAgeRevertsEvenIfNotExpired() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        r.issuedAt = uint64(block.timestamp - 301); // maxReceiptAge = 300
        r.expiresAt = uint64(block.timestamp + 1000);
        r.observedBlockTimestamp = r.issuedAt; // keep the snapshot rule satisfied: only age is invalid
        r.snapshotHash = _snapshotHash(r);
        _expectSignedRevert(r, 0, abi.encodeWithSelector(IAcceptanceVerifier.ReceiptTooOld.selector, r.issuedAt, 300, block.timestamp));
    }

    function test_timeBoundariesAreInclusive() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);

        r.issuedAt = uint64(block.timestamp); // issuedAt == now
        r.expiresAt = uint64(block.timestamp + 1);
        r.observedBlockTimestamp = r.issuedAt;
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));

        r.issuedAt = uint64(block.timestamp - 1);
        r.expiresAt = uint64(block.timestamp); // expiresAt == now
        r.observedBlockTimestamp = r.issuedAt;
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));

        r.issuedAt = uint64(block.timestamp - 300); // age == maxReceiptAge
        r.expiresAt = uint64(block.timestamp + 5);
        r.observedBlockTimestamp = r.issuedAt;
        r.snapshotHash = _snapshotHash(r);
        verifier.validateReceipt(r, _sign(r), _proof(0));
    }

    function test_receiptBecomesInvalidAsTimePasses() public {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt(0);
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(0);
        verifier.validateReceipt(r, sig, proof);
        vm.warp(block.timestamp + 291); // age 301 > 300, expiresAt (now0+200) also passed
        vm.expectRevert();
        verifier.validateReceipt(r, sig, proof);
    }
}
