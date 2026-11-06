// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {EncodingHarness} from "../../pb03/EncodingHarness.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";

/// @dev Independent reference: OpenZeppelin's EIP712 implementation, used only to cross-check the library.
contract OzEip712Reference is EIP712 {
    constructor() EIP712("PatchBond", "1") {}

    function domainSep() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function typedDigest(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }
}

/// @notice PB-03 tests. ALL addresses, keys, chain ids and hashes below are labelled TEST FIXTURES,
/// not real deployments. The signing key is a throwaway test key and must never hold funds.
contract EncodingHarnessTest is Test {
    EncodingHarness internal h;

    // ---- TEST FIXTURES (not real deployments) ----
    uint256 internal constant SOURCE_CHAIN = 11155111; // fixture: Ethereum Sepolia chain id
    uint256 internal constant DEST_CHAIN = 5042002; // fixture: Arc Testnet chain id
    uint256 internal constant TEST_SIGNER_PK = 0xA11CE; // TEST-ONLY key, vm.sign only
    address internal constant FX_CAMPAIGN = address(uint160(0xCA3D));
    address internal constant FX_ENTRYPOINT = address(uint160(0xE17));
    address internal constant FX_RECIPIENT = address(uint160(0x2EC1));
    bytes32 internal constant FX_CAMPAIGN_ID = keccak256("fixture-campaign-id");
    bytes32 internal constant FX_SELECTOR = keccak256("fixture-market-selector");

    // Spec string copied verbatim, independent of the library constant.
    string internal constant SPEC_RECEIPT_TYPE =
        "AcceptanceReceipt(bytes32 campaignId,bytes32 campaignPolicyHash,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32 snapshotHash,uint256 observedBlockNumber,bytes32 observedBlockHash,uint64 observedBlockTimestamp,bytes32 testPackHash,bytes32 evidenceDigest,uint8 purpose,uint8 mode,uint8 result,uint64 issuedAt,uint64 expiresAt,bytes32 receiptId)";

    function setUp() public {
        h = new EncodingHarness();
    }

    // ---------------------------------------------------------------- builders

    function _a(uint256 n) internal pure returns (address) {
        return address(uint160(0x1000 + n));
    }

    function _b(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode("fixture", n));
    }

    function _word(bytes memory b, uint256 i) internal pure returns (bytes32 w) {
        assembly {
            w := mload(add(add(b, 32), mul(i, 32)))
        }
    }

    function _policy() internal pure returns (PatchBondTypes.Policy memory p) {
        p.campaignId = _b(1);
        p.supplier = _a(2);
        p.sourceChainId = 11155111;
        p.destinationChainId = 5042002;
        p.sourceRegistry = _a(5);
        p.campaign = _a(6);
        p.eligibilityRoot = _b(7);
        p.eligibleCount = 8;
        p.grantAmount = 9_000_000;
        p.token = _a(10);
        p.tokenDecimals = 6;
        p.repairPolicyHash = _b(12);
        p.testPackHash = _b(13);
        p.verifier = _a(14);
        p.challenger = _a(15);
        p.reviewer = _a(16);
        p.claimDeadline = 17;
        p.challengeWindow = 18;
        p.reviewTimeout = 19;
        p.maxReceiptAge = 20;
        p.confirmations = 21;
        p.evidenceRetention = 22;
    }

    function _snapshot() internal pure returns (PatchBondTypes.Snapshot memory s) {
        s.chainId = 11155111;
        s.blockNumber = 123456;
        s.blockHash = _b(100);
        s.blockTimestamp = 1_700_000_000;
    }

    function _receipt() internal pure returns (PatchBondTypes.AcceptanceReceipt memory r) {
        r.campaignId = FX_CAMPAIGN_ID;
        r.campaignPolicyHash = _b(201);
        r.sourceChainId = SOURCE_CHAIN;
        r.deploymentKey = PatchBondTypes.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR);
        r.recipient = FX_RECIPIENT;
        r.snapshotHash = _b(202);
        r.observedBlockNumber = 123456;
        r.observedBlockHash = _b(203);
        r.observedBlockTimestamp = 1_700_000_000;
        r.testPackHash = _b(204);
        r.evidenceDigest = _b(205);
        r.purpose = 1;
        r.mode = 1;
        r.result = 1;
        r.issuedAt = 1_700_000_100;
        r.expiresAt = 1_700_003_700;
        r.receiptId = _b(206);
    }

    /// @dev Flip exactly one receipt field (index 0..16, declaration order).
    function _mutateReceipt(PatchBondTypes.AcceptanceReceipt memory r, uint256 i) internal pure {
        if (i == 0) r.campaignId = ~r.campaignId;
        else if (i == 1) r.campaignPolicyHash = ~r.campaignPolicyHash;
        else if (i == 2) r.sourceChainId += 1;
        else if (i == 3) r.deploymentKey = ~r.deploymentKey;
        else if (i == 4) r.recipient = address(uint160(r.recipient) + 1);
        else if (i == 5) r.snapshotHash = ~r.snapshotHash;
        else if (i == 6) r.observedBlockNumber += 1;
        else if (i == 7) r.observedBlockHash = ~r.observedBlockHash;
        else if (i == 8) r.observedBlockTimestamp += 1;
        else if (i == 9) r.testPackHash = ~r.testPackHash;
        else if (i == 10) r.evidenceDigest = ~r.evidenceDigest;
        else if (i == 11) r.purpose = 0;
        else if (i == 12) r.mode = 0;
        else if (i == 13) r.result = 2;
        else if (i == 14) r.issuedAt += 1;
        else if (i == 15) r.expiresAt += 1;
        else r.receiptId = ~r.receiptId;
    }

    /// @dev Flip exactly one policy field (index 0..21, declaration order).
    function _mutatePolicy(PatchBondTypes.Policy memory p, uint256 i) internal pure {
        if (i == 0) p.campaignId = ~p.campaignId;
        else if (i == 1) p.supplier = address(uint160(p.supplier) + 1);
        else if (i == 2) p.sourceChainId += 1;
        else if (i == 3) p.destinationChainId += 1;
        else if (i == 4) p.sourceRegistry = address(uint160(p.sourceRegistry) + 1);
        else if (i == 5) p.campaign = address(uint160(p.campaign) + 1);
        else if (i == 6) p.eligibilityRoot = ~p.eligibilityRoot;
        else if (i == 7) p.eligibleCount += 1;
        else if (i == 8) p.grantAmount += 1;
        else if (i == 9) p.token = address(uint160(p.token) + 1);
        else if (i == 10) p.tokenDecimals += 1;
        else if (i == 11) p.repairPolicyHash = ~p.repairPolicyHash;
        else if (i == 12) p.testPackHash = ~p.testPackHash;
        else if (i == 13) p.verifier = address(uint160(p.verifier) + 1);
        else if (i == 14) p.challenger = address(uint160(p.challenger) + 1);
        else if (i == 15) p.reviewer = address(uint160(p.reviewer) + 1);
        else if (i == 16) p.claimDeadline += 1;
        else if (i == 17) p.challengeWindow += 1;
        else if (i == 18) p.reviewTimeout += 1;
        else if (i == 19) p.maxReceiptAge += 1;
        else if (i == 20) p.confirmations += 1;
        else p.evidenceRetention += 1;
    }

    function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
        return ecrecover(digest, v, r, s);
    }

    // ---------------------------------------------------------------- policy

    function test_PolicyHash_MatchesAbiEncode() public view {
        PatchBondTypes.Policy memory p = _policy();
        assertEq(h.policyHash(p), keccak256(abi.encode(p)));
    }

    function test_PolicyEncoding_Is22StaticWordsInSpecOrder() public pure {
        PatchBondTypes.Policy memory p = _policy();
        bytes memory e = abi.encode(p);
        assertEq(e.length, 22 * 32, "policy must encode as 22 inline static words");
        assertEq(_word(e, 0), p.campaignId);
        assertEq(_word(e, 1), bytes32(uint256(uint160(p.supplier))));
        assertEq(_word(e, 2), bytes32(p.sourceChainId));
        assertEq(_word(e, 3), bytes32(p.destinationChainId));
        assertEq(_word(e, 4), bytes32(uint256(uint160(p.sourceRegistry))));
        assertEq(_word(e, 5), bytes32(uint256(uint160(p.campaign))));
        assertEq(_word(e, 6), p.eligibilityRoot);
        assertEq(_word(e, 7), bytes32(p.eligibleCount));
        assertEq(_word(e, 8), bytes32(p.grantAmount));
        assertEq(_word(e, 9), bytes32(uint256(uint160(p.token))));
        assertEq(_word(e, 10), bytes32(uint256(p.tokenDecimals)));
        assertEq(_word(e, 11), p.repairPolicyHash);
        assertEq(_word(e, 12), p.testPackHash);
        assertEq(_word(e, 13), bytes32(uint256(uint160(p.verifier))));
        assertEq(_word(e, 14), bytes32(uint256(uint160(p.challenger))));
        assertEq(_word(e, 15), bytes32(uint256(uint160(p.reviewer))));
        assertEq(_word(e, 16), bytes32(uint256(p.claimDeadline)));
        assertEq(_word(e, 17), bytes32(uint256(p.challengeWindow)));
        assertEq(_word(e, 18), bytes32(uint256(p.reviewTimeout)));
        assertEq(_word(e, 19), bytes32(uint256(p.maxReceiptAge)));
        assertEq(_word(e, 20), bytes32(uint256(p.confirmations)));
        assertEq(_word(e, 21), bytes32(uint256(p.evidenceRetention)));
    }

    function test_PolicyHash_EveryFieldMutationChangesHash() public view {
        bytes32 base = h.policyHash(_policy());
        bytes32[22] memory seen;
        for (uint256 i = 0; i < 22; i++) {
            PatchBondTypes.Policy memory p = _policy();
            _mutatePolicy(p, i);
            bytes32 mutated = h.policyHash(p);
            assertTrue(mutated != base, "field mutation must change policyHash");
            for (uint256 j = 0; j < i; j++) {
                assertTrue(mutated != seen[j], "distinct mutations must give distinct hashes");
            }
            seen[i] = mutated;
        }
    }

    function test_PolicyHash_DoesNotRejectSemanticallyInvalidInput() public view {
        // BOUNDARY: all-zero policy (zero campaign/verifier/token...) still hashes. Validation lives elsewhere.
        PatchBondTypes.Policy memory z;
        assertEq(h.policyHash(z), keccak256(new bytes(22 * 32)));
    }

    // ---------------------------------------------------------------- snapshot

    function test_SnapshotHash_MatchesAbiEncodeAndOrder() public view {
        PatchBondTypes.Snapshot memory s = _snapshot();
        bytes memory e = abi.encode(s);
        assertEq(e.length, 4 * 32);
        assertEq(_word(e, 0), bytes32(s.chainId));
        assertEq(_word(e, 1), bytes32(s.blockNumber));
        assertEq(_word(e, 2), s.blockHash);
        assertEq(_word(e, 3), bytes32(uint256(s.blockTimestamp)));
        assertEq(h.snapshotHash(s), keccak256(e));
    }

    function test_SnapshotHash_EachFieldChangesHash() public view {
        bytes32 base = h.snapshotHash(_snapshot());
        PatchBondTypes.Snapshot memory s = _snapshot();
        s.chainId += 1;
        assertTrue(h.snapshotHash(s) != base);
        s = _snapshot();
        s.blockNumber += 1;
        assertTrue(h.snapshotHash(s) != base);
        s = _snapshot();
        s.blockHash = ~s.blockHash;
        assertTrue(h.snapshotHash(s) != base);
        s = _snapshot();
        s.blockTimestamp += 1;
        assertTrue(h.snapshotHash(s) != base);
    }

    // ---------------------------------------------------------------- deploymentKey

    function test_DeploymentKey_MatchesAbiEncode() public view {
        assertEq(
            h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR),
            keccak256(abi.encode(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR))
        );
    }

    function test_DeploymentKey_ChangesWithChainEntrypointSelector() public view {
        bytes32 base = h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR);
        assertTrue(h.deploymentKey(SOURCE_CHAIN + 1, FX_ENTRYPOINT, FX_SELECTOR) != base);
        assertTrue(h.deploymentKey(SOURCE_CHAIN, _a(99), FX_SELECTOR) != base);
        assertTrue(h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, ~FX_SELECTOR) != base);
    }

    function test_DeploymentKey_ZeroSelectorMeansNoSubmarketAndIsDistinct() public view {
        bytes32 none = h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, bytes32(0));
        assertEq(none, keccak256(abi.encode(SOURCE_CHAIN, FX_ENTRYPOINT, bytes32(0))));
        assertTrue(none != h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR));
    }

    function testFuzz_DeploymentKey_AnyInputChangeChangesKey(
        uint256 chainA,
        address epA,
        bytes32 selA,
        uint256 chainB,
        address epB,
        bytes32 selB
    ) public view {
        vm.assume(chainA != chainB || epA != epB || selA != selB);
        assertTrue(h.deploymentKey(chainA, epA, selA) != h.deploymentKey(chainB, epB, selB));
    }

    // ---------------------------------------------------------------- eligibility leaf

    function test_EligibilityLeaf_IsDoubleHashed() public view {
        bytes32 dk = h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR);
        bytes32 inner = keccak256(abi.encode(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, FX_RECIPIENT));
        bytes32 leaf = h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, FX_RECIPIENT);
        assertEq(leaf, keccak256(bytes.concat(inner)));
        assertTrue(leaf != inner, "leaf must not be the single hash");
    }

    function test_EligibilityLeaf_ChangesWithCampaignIdChainKeyRecipient() public view {
        bytes32 dk = h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR);
        bytes32 base = h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, FX_RECIPIENT);
        assertTrue(h.eligibilityLeaf(~FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, FX_RECIPIENT) != base, "campaignId");
        assertTrue(h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN + 1, dk, FX_RECIPIENT) != base, "source chain");
        assertTrue(h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, ~dk, FX_RECIPIENT) != base, "deploymentKey");
        assertTrue(h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, _a(77)) != base, "recipient");
    }

    function test_EligibilityLeaf_WorksInSortedPairMerkleTree() public view {
        bytes32 dk = h.deploymentKey(SOURCE_CHAIN, FX_ENTRYPOINT, FX_SELECTOR);
        bytes32 leafA = h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, FX_RECIPIENT);
        bytes32 leafB = h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, _a(78));
        bytes32 root = leafA < leafB
            ? keccak256(abi.encodePacked(leafA, leafB))
            : keccak256(abi.encodePacked(leafB, leafA));
        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = leafB;
        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = leafA;
        assertTrue(MerkleProof.verify(proofA, root, leafA));
        assertTrue(MerkleProof.verify(proofB, root, leafB));
        // An address that is not in the tree cannot reuse a proof.
        bytes32 outsider = h.eligibilityLeaf(FX_CAMPAIGN_ID, SOURCE_CHAIN, dk, _a(79));
        assertFalse(MerkleProof.verify(proofA, root, outsider));
    }

    // ---------------------------------------------------------------- receipt hashing

    function test_ReceiptTypehash_MatchesSpecStringExactly() public view {
        assertEq(h.receiptTypehash(), keccak256(bytes(SPEC_RECEIPT_TYPE)));
    }

    function test_ReceiptStructHash_EncodingIsTypehashPlus17WordsInSpecOrder() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes memory e = abi.encode(h.receiptTypehash(), r);
        assertEq(e.length, 18 * 32);
        assertEq(_word(e, 0), keccak256(bytes(SPEC_RECEIPT_TYPE)));
        assertEq(_word(e, 1), r.campaignId);
        assertEq(_word(e, 2), r.campaignPolicyHash);
        assertEq(_word(e, 3), bytes32(r.sourceChainId));
        assertEq(_word(e, 4), r.deploymentKey);
        assertEq(_word(e, 5), bytes32(uint256(uint160(r.recipient))));
        assertEq(_word(e, 6), r.snapshotHash);
        assertEq(_word(e, 7), bytes32(r.observedBlockNumber));
        assertEq(_word(e, 8), r.observedBlockHash);
        assertEq(_word(e, 9), bytes32(uint256(r.observedBlockTimestamp)));
        assertEq(_word(e, 10), r.testPackHash);
        assertEq(_word(e, 11), r.evidenceDigest);
        assertEq(_word(e, 12), bytes32(uint256(r.purpose)));
        assertEq(_word(e, 13), bytes32(uint256(r.mode)));
        assertEq(_word(e, 14), bytes32(uint256(r.result)));
        assertEq(_word(e, 15), bytes32(uint256(r.issuedAt)));
        assertEq(_word(e, 16), bytes32(uint256(r.expiresAt)));
        assertEq(_word(e, 17), r.receiptId);
        assertEq(h.receiptStructHash(r), keccak256(e));
    }

    function test_DomainSeparator_MatchesSpecAndOpenZeppelinReference() public {
        // Spec domain built field by field with literal strings.
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("PatchBond")),
                keccak256(bytes("1")),
                DEST_CHAIN,
                FX_CAMPAIGN
            )
        );
        assertEq(h.domainSeparator(DEST_CHAIN, FX_CAMPAIGN), expected);

        // Independent implementation: deploy OZ EIP712 at a known chain id and compare.
        vm.chainId(DEST_CHAIN);
        OzEip712Reference ref = new OzEip712Reference();
        assertEq(h.domainSeparator(DEST_CHAIN, address(ref)), ref.domainSep());
    }

    function test_ReceiptDigest_MatchesEip712Layout() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32 expected = keccak256(
            abi.encodePacked(
                hex"1901", h.domainSeparator(DEST_CHAIN, FX_CAMPAIGN), keccak256(abi.encode(h.receiptTypehash(), r))
            )
        );
        assertEq(h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r), expected);
    }

    function test_ReceiptDigest_MatchesOpenZeppelinTypedDataHash() public {
        vm.chainId(DEST_CHAIN);
        OzEip712Reference ref = new OzEip712Reference();
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        assertEq(h.receiptDigest(DEST_CHAIN, address(ref), r), ref.typedDigest(h.receiptStructHash(r)));
    }

    function test_ReceiptDigest_SourceAndDestinationChangesAlterDigest() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32 base = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r);

        // Destination chain (domain chainId) changes digest.
        assertTrue(h.receiptDigest(DEST_CHAIN + 1, FX_CAMPAIGN, r) != base, "destination chain");
        // Campaign (verifyingContract) changes digest.
        assertTrue(h.receiptDigest(DEST_CHAIN, _a(55), r) != base, "verifying campaign");
        // Source chain (bound inside the receipt) changes digest.
        r.sourceChainId += 1;
        assertTrue(h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r) != base, "source chain");
    }

    function test_ReceiptDigest_SameReceiptSameDigestRegardlessOfSourceRegistry() public view {
        // The domain takes only (destinationChainId, campaign): no source registry/source chain input exists,
        // so the identical signed receipt is carried through CCIP without re-signing.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        assertEq(h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r), h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, _receipt()));
    }

    function test_ReceiptDigest_DoesNotRejectInvalidSemanticInput() public view {
        // BOUNDARY: unset result, unknown enum values, zero recipient, expired window all hash fine.
        PatchBondTypes.AcceptanceReceipt memory r;
        r.purpose = 250;
        r.mode = 251;
        r.result = 252;
        bytes32 d = h.receiptDigest(0, address(0), r);
        assertTrue(d != bytes32(0));
    }

    // ---------------------------------------------------------------- signing (test-only EOA)

    function test_Signature_RecoversTestSignerOverDigest() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32 digest = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(TEST_SIGNER_PK, digest);
        assertEq(_recover(digest, v, rr, s), vm.addr(TEST_SIGNER_PK));
    }

    function test_Signature_AnyReceiptFieldMutationBreaksBinding() public view {
        PatchBondTypes.AcceptanceReceipt memory base = _receipt();
        bytes32 digest = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, base);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(TEST_SIGNER_PK, digest);
        address signer = vm.addr(TEST_SIGNER_PK);
        assertEq(_recover(digest, v, rr, s), signer);

        // Covers recipient (4), evidenceDigest (10), campaignId (0), testPackHash (9), purpose (11), mode (12)
        // and every other receipt field.
        for (uint256 i = 0; i < 17; i++) {
            PatchBondTypes.AcceptanceReceipt memory m = _receipt();
            _mutateReceipt(m, i);
            bytes32 mutatedDigest = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, m);
            assertTrue(mutatedDigest != digest, "mutated receipt must have a different digest");
            assertTrue(_recover(mutatedDigest, v, rr, s) != signer, "old signature must not authorize mutated receipt");
        }
    }

    function test_Signature_DoesNotTransferToOtherCampaignOrDestination() public view {
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        bytes32 digest = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(TEST_SIGNER_PK, digest);
        address signer = vm.addr(TEST_SIGNER_PK);

        assertTrue(_recover(h.receiptDigest(DEST_CHAIN, _a(55), r), v, rr, s) != signer, "other campaign");
        assertTrue(_recover(h.receiptDigest(DEST_CHAIN + 1, FX_CAMPAIGN, r), v, rr, s) != signer, "other dest chain");
    }

    function test_Signature_ValidSignatureAloneIsNotAcceptance_LibraryHasNoEligibilityCheck() public view {
        // BOUNDARY: a correctly signed diagnostic/preview/fail receipt still hashes and recovers.
        // Rejecting purpose != 1, mode != 1 or result != 1 is the job of consuming contracts.
        PatchBondTypes.AcceptanceReceipt memory r = _receipt();
        r.purpose = 0;
        r.mode = 0;
        r.result = 2;
        bytes32 digest = h.receiptDigest(DEST_CHAIN, FX_CAMPAIGN, r);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(TEST_SIGNER_PK, digest);
        assertEq(_recover(digest, v, rr, s), vm.addr(TEST_SIGNER_PK));
    }
}
