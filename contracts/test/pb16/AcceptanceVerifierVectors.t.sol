// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {CampaignRegistry} from "../../pb15/CampaignRegistry.sol";
import {ICampaignRegistry} from "../../pb15/ICampaignRegistry.sol";
import {AcceptanceVerifier} from "../../pb16/AcceptanceVerifier.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";

/// @dev TEST-ONLY registry that serves the frozen PB-03 vector policy. The vector's `eligibilityRoot`
/// (0x2222...) is a placeholder that is not a Merkle root over the vector's leaf, so a real registry can never prove
/// that leaf. This stand-in answers `isEligible` true for exactly the vector leaf and otherwise behaves like a
/// registry. It exists only to run the frozen signed vector through the real verifier end to end.
contract VectorPolicyRegistry is ICampaignRegistry {
    PatchBondTypes.Policy private _p;
    bytes32 private immutable _vectorLeaf;

    constructor(PatchBondTypes.Policy memory p, bytes32 vectorLeaf) {
        _p = p;
        _vectorLeaf = vectorLeaf;
    }

    function createCampaign(PatchBondTypes.Policy calldata) external pure returns (bytes32) {
        revert("FIXTURE: read-only");
    }

    function registerEligibleDeployment(bytes32, uint256, bytes32, address, bytes32[] calldata) external pure {
        revert("FIXTURE: read-only");
    }

    function campaignExists(bytes32 id) external view returns (bool) {
        return id == _p.campaignId;
    }

    function policyOf(bytes32) external view returns (PatchBondTypes.Policy memory) {
        return _p;
    }

    function policyHashOf(bytes32) external view returns (bytes32) {
        return PatchBondTypes.policyHash(_p);
    }

    function requiredFundingOf(bytes32) external view returns (uint256) {
        return _p.eligibleCount * _p.grantAmount;
    }

    function isEligible(bytes32 id, uint256 chainId, bytes32 key, address recipient, bytes32[] calldata)
        external
        view
        returns (bool)
    {
        return PatchBondTypes.eligibilityLeaf(id, chainId, key, recipient) == _vectorLeaf;
    }

    function isDeploymentRegistered(bytes32, bytes32) external pure returns (bool) {
        return false;
    }

    function recipientOf(bytes32, bytes32) external pure returns (address) {
        return address(0);
    }

    function registeredCountOf(bytes32) external pure returns (uint256) {
        return 0;
    }
}

/// @notice Runs the frozen PB-03 public vector (pb03-vectors.json) through the PB-16 verifier. Values are copied
/// verbatim from the vector file. They are disposable fixtures, not live configuration.
contract AcceptanceVerifierVectorTest is Test {
    uint256 internal constant DEST_CHAIN = 5042002;
    address internal constant VECTOR_CAMPAIGN = 0x2222222222222222222222222222222222222222;
    address internal constant VECTOR_SIGNER = 0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1;

    bytes32 internal constant EXPECTED_POLICY_HASH = 0x1d09ea62ac151f60a710cbbaf2dc77cb794ce988b5aa25bf5760ce3dd0d51da4;
    bytes32 internal constant EXPECTED_SNAPSHOT_HASH = 0x29cfc9d77fa61e6dbd5941c04eca051abed9d5373bc35325c8e9147d6855e41a;
    bytes32 internal constant EXPECTED_DEPLOYMENT_KEY = 0xeac4b38624b36ed38a9df3e40d15f13f7c8b9ed392ea339acdbb03a922a42b48;
    bytes32 internal constant EXPECTED_LEAF = 0x40460171f81d0e9b24a8acf98a020a092c71cfce4e6992618d22b35fb6c4c30f;
    bytes32 internal constant EXPECTED_DIGEST = 0x4a1c204bfcf9793fd58a119bf3b96cec98e654dd05ba860791989c17f2bb0b99;
    bytes internal constant VECTOR_SIGNATURE =
        hex"f187c371dc304b9efe17958eb3c1cc6a3561e892fc18b776ec463a10f41c84fa5e94c7f4dd76eea295f676111c3f78636c50aa57966a0a0f63e3f8d2b4ab5c401b";

    function setUp() public {
        vm.chainId(DEST_CHAIN);
        vm.warp(1100); // issuedAt 1010, expiresAt 1300, maxReceiptAge 300, claimDeadline 2000
    }

    function _policy() internal pure returns (PatchBondTypes.Policy memory p) {
        p.campaignId = 0x1111111111111111111111111111111111111111111111111111111111111111;
        p.supplier = 0x1111111111111111111111111111111111111111;
        p.sourceChainId = 11155111;
        p.destinationChainId = 5042002;
        p.sourceRegistry = address(0);
        p.campaign = VECTOR_CAMPAIGN;
        p.eligibilityRoot = 0x2222222222222222222222222222222222222222222222222222222222222222;
        p.eligibleCount = 3;
        p.grantAmount = 20000000;
        p.token = 0x3600000000000000000000000000000000000000;
        p.tokenDecimals = 6;
        p.repairPolicyHash = 0x3333333333333333333333333333333333333333333333333333333333333333;
        p.testPackHash = 0x4444444444444444444444444444444444444444444444444444444444444444;
        p.verifier = VECTOR_SIGNER;
        p.challenger = 0x1111111111111111111111111111111111111111;
        p.reviewer = 0x3333333333333333333333333333333333333333;
        p.claimDeadline = 2000;
        p.challengeWindow = 60;
        p.reviewTimeout = 120;
        p.maxReceiptAge = 300;
        p.confirmations = 2;
        p.evidenceRetention = 86400;
    }

    function _receipt() internal pure returns (PatchBondTypes.AcceptanceReceipt memory r) {
        r.campaignId = 0x1111111111111111111111111111111111111111111111111111111111111111;
        r.campaignPolicyHash = EXPECTED_POLICY_HASH;
        r.sourceChainId = 11155111;
        r.deploymentKey = EXPECTED_DEPLOYMENT_KEY;
        r.recipient = 0x4444444444444444444444444444444444444444;
        r.snapshotHash = EXPECTED_SNAPSHOT_HASH;
        r.observedBlockNumber = 10;
        r.observedBlockHash = 0x5555555555555555555555555555555555555555555555555555555555555555;
        r.observedBlockTimestamp = 1000;
        r.testPackHash = 0x4444444444444444444444444444444444444444444444444444444444444444;
        r.evidenceDigest = 0x6666666666666666666666666666666666666666666666666666666666666666;
        r.purpose = 1;
        r.mode = 1;
        r.result = 1;
        r.issuedAt = 1010;
        r.expiresAt = 1300;
        r.receiptId = 0x7777777777777777777777777777777777777777777777777777777777777777;
    }

    // ------------------------------------------------------------------ hashing parity (PB-03 library vs vector)

    function test_vector_hashesMatchFrozenExpectedValues() public pure {
        PatchBondTypes.Policy memory p = _policy();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        assertEq(PatchBondTypes.policyHash(p), EXPECTED_POLICY_HASH, "policyHash");
        assertEq(
            PatchBondTypes.snapshotHash(PatchBondTypes.Snapshot(11155111, 10, r.observedBlockHash, 1000)),
            EXPECTED_SNAPSHOT_HASH,
            "snapshotHash"
        );
        // deploymentKey: the vector publishes the key but not its entrypoint preimage, so it is used as a given
        // input here (it is part of the leaf and receipt digest checked below).
        assertEq(
            PatchBondTypes.eligibilityLeaf(r.campaignId, r.sourceChainId, r.deploymentKey, r.recipient),
            EXPECTED_LEAF,
            "eligibilityLeaf"
        );
        assertEq(PatchBondTypes.receiptDigest(DEST_CHAIN, VECTOR_CAMPAIGN, r), EXPECTED_DIGEST, "receiptDigest");
    }

    function test_vector_signatureRecoversFrozenSigner() public pure {
        bytes memory sig = VECTOR_SIGNATURE;
        bytes32 rr;
        bytes32 ss;
        uint8 v;
        assembly {
            rr := mload(add(sig, 32))
            ss := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        assertEq(ecrecover(EXPECTED_DIGEST, v, rr, ss), VECTOR_SIGNER, "signer");
        assertLe(uint256(ss), 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "vector signature is low-s");
        assertTrue(v == 27 || v == 28);
    }

    // ------------------------------------------------------------------ real PB-15 registry accepts the vector policy

    function test_vector_policyHashesIdenticallyInRealRegistry() public {
        CampaignRegistry registry = new CampaignRegistry();
        PatchBondTypes.Policy memory p = _policy();
        vm.prank(p.supplier);
        bytes32 h = registry.createCampaign(p);
        assertEq(h, EXPECTED_POLICY_HASH);
        assertEq(registry.policyHashOf(p.campaignId), EXPECTED_POLICY_HASH);
    }

    // ------------------------------------------------------------------ frozen signed vector through the verifier

    function _verifierForVector() internal returns (AcceptanceVerifier v, VectorPolicyRegistry reg) {
        reg = new VectorPolicyRegistry(_policy(), EXPECTED_LEAF);
        v = new AcceptanceVerifier(reg);
    }

    function test_vector_verifierAcceptsFrozenSignedReceipt() public {
        (AcceptanceVerifier v,) = _verifierForVector();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32 d = v.validateReceipt(r, VECTOR_SIGNATURE, new bytes32[](0));
        assertEq(d, EXPECTED_DIGEST);
        assertEq(v.receiptDigestOf(r), EXPECTED_DIGEST);
    }

    function test_vector_onlyVectorCampaignMayConsumeAndReplayFails() public {
        (AcceptanceVerifier v,) = _verifierForVector();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32[] memory proof = new bytes32[](0);

        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.CallerNotCampaign.selector, address(this), VECTOR_CAMPAIGN));
        v.consumeReceipt(r, VECTOR_SIGNATURE, proof);

        vm.prank(VECTOR_CAMPAIGN);
        assertEq(v.consumeReceipt(r, VECTOR_SIGNATURE, proof), EXPECTED_DIGEST);
        assertTrue(v.isConsumed(r.campaignId, r.receiptId));

        vm.prank(VECTOR_CAMPAIGN);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, r.campaignId, r.receiptId));
        v.consumeReceipt(r, VECTOR_SIGNATURE, proof);
    }

    function test_vector_alteringAnySignedFieldRejectsTheFrozenSignature() public {
        (AcceptanceVerifier v,) = _verifierForVector();
        bytes32[] memory proof = new bytes32[](0);

        // Recipient, evidence digest, receipt id, timing: scope checks pass, so the signature is what fails.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        r.evidenceDigest = bytes32(uint256(r.evidenceDigest) ^ 1);
        vm.expectRevert();
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);

        r = _receipt();
        r.receiptId = bytes32(uint256(r.receiptId) ^ 1);
        vm.expectRevert();
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);

        r = _receipt();
        r.recipient = address(0x5555555555555555555555555555555555555555);
        vm.expectRevert(IAcceptanceVerifier.NotEligible.selector);
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);

        r = _receipt();
        r.expiresAt = 1301;
        vm.expectRevert();
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);
    }

    function test_vector_wrongDomainChangesDigestAndRejects() public {
        (AcceptanceVerifier v,) = _verifierForVector();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        assertTrue(PatchBondTypes.receiptDigest(1, VECTOR_CAMPAIGN, r) != EXPECTED_DIGEST, "other chain");
        assertTrue(
            PatchBondTypes.receiptDigest(DEST_CHAIN, address(0x3333333333333333333333333333333333333333), r) != EXPECTED_DIGEST,
            "other verifying contract"
        );
        vm.chainId(1); // verifier now sits on the wrong chain for this policy
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.WrongDestinationChain.selector, DEST_CHAIN, 1));
        v.validateReceipt(r, VECTOR_SIGNATURE, new bytes32[](0));
    }

    function test_vector_timeWindowOnFrozenReceipt() public {
        (AcceptanceVerifier v,) = _verifierForVector();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32[] memory proof = new bytes32[](0);

        vm.warp(1009); // before issuedAt
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptNotYetValid.selector, 1010, 1009));
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);

        vm.warp(1310); // after expiresAt (and older than maxReceiptAge)
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, 1300, 1310));
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);

        vm.warp(1300); // expiresAt boundary, age 290 <= 300
        v.validateReceipt(r, VECTOR_SIGNATURE, proof);
    }
}
