// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {CampaignRegistry} from "../../pb15/CampaignRegistry.sol";
import {AcceptanceVerifier} from "../../pb16/AcceptanceVerifier.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {ICampaignRegistry} from "../../pb15/ICampaignRegistry.sol";

/// @notice TEST-ONLY campaign stand-in. It is the policy's `campaign` address, so it is the only caller allowed to
/// consume receipts. It reserves one unit after a successful consume, optionally reverting afterwards to prove that
/// consumption is rolled back with the rest of the claim transaction. It holds no funds.
contract FixtureCampaignHarness {
    IAcceptanceVerifier public immutable verifier;
    uint256 public reserved;

    constructor(IAcceptanceVerifier verifier_) {
        verifier = verifier_;
    }

    function claim(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata proof,
        bool revertAfterConsume
    ) external {
        verifier.consumeReceipt(receipt, signature, proof);
        reserved += 1;
        if (revertAfterConsume) revert("FIXTURE: reservation failed after consume");
    }
}

/// @notice Shared fixtures and helpers for the PB-16 tests. Every address, id, hash, key and timestamp is a labeled
/// FIXTURE value. The signing key is a disposable test key derived from a label and has no value anywhere.
abstract contract AcceptanceVerifierBase is Test {
    CampaignRegistry internal registry;
    AcceptanceVerifier internal verifier;
    FixtureCampaignHarness internal campaign;

    bytes32 internal constant FIXTURE_CAMPAIGN_ID = keccak256("FIXTURE PB-16 campaign A");
    bytes32 internal constant FIXTURE_CAMPAIGN_ID_B = keccak256("FIXTURE PB-16 campaign B");
    uint256 internal constant FIXTURE_SOURCE_CHAIN_ID = 11155111;
    uint256 internal constant FIXTURE_DEST_CHAIN_ID = 5042002;
    bytes32 internal constant FIXTURE_TEST_PACK_HASH = keccak256("FIXTURE test pack");
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal supplier = makeAddr("FIXTURE supplier");
    address internal reviewer = makeAddr("FIXTURE reviewer");
    address internal token = makeAddr("FIXTURE token");
    address internal relayer = makeAddr("FIXTURE relayer");
    address internal attacker = makeAddr("FIXTURE attacker");
    address internal verifierAddr;
    uint256 internal verifierKey;
    address internal otherAddr;
    uint256 internal otherKey;

    address[3] internal recipients;
    bytes32[3] internal depKeys;
    bytes32[3] internal leaves;
    bytes32 internal root;

    function setUp() public virtual {
        vm.chainId(FIXTURE_DEST_CHAIN_ID);
        vm.warp(1_800_000_000);
        (verifierAddr, verifierKey) = makeAddrAndKey("FIXTURE disposable verifier signer");
        (otherAddr, otherKey) = makeAddrAndKey("FIXTURE disposable other signer");

        registry = new CampaignRegistry();
        verifier = new AcceptanceVerifier(registry);
        campaign = new FixtureCampaignHarness(verifier);

        for (uint256 i = 0; i < 3; i++) {
            recipients[i] = makeAddr(string.concat("FIXTURE recipient ", vm.toString(i)));
            depKeys[i] = PatchBondTypes.deploymentKey(
                FIXTURE_SOURCE_CHAIN_ID, makeAddr(string.concat("FIXTURE entrypoint ", vm.toString(i))), bytes32(0)
            );
            leaves[i] = PatchBondTypes.eligibilityLeaf(
                FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[i], recipients[i]
            );
        }
        root = _pair(_pair(leaves[0], leaves[1]), leaves[2]);

        _createCampaign(_policy());
    }

    // ------------------------------------------------------------------ registry fixtures

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _proof(uint256 i) internal view returns (bytes32[] memory p) {
        if (i == 2) {
            p = new bytes32[](1);
            p[0] = _pair(leaves[0], leaves[1]);
        } else {
            p = new bytes32[](2);
            p[0] = leaves[i == 0 ? 1 : 0];
            p[1] = leaves[2];
        }
    }

    function _policy() internal view returns (PatchBondTypes.Policy memory p) {
        p.campaignId = FIXTURE_CAMPAIGN_ID;
        p.supplier = supplier;
        p.sourceChainId = FIXTURE_SOURCE_CHAIN_ID;
        p.destinationChainId = block.chainid;
        p.sourceRegistry = address(0); // direct-signed mode
        p.campaign = address(campaign);
        p.eligibilityRoot = root;
        p.eligibleCount = 3;
        p.grantAmount = 20_000_000;
        p.token = token;
        p.tokenDecimals = 6;
        p.repairPolicyHash = keccak256("FIXTURE repair policy");
        p.testPackHash = FIXTURE_TEST_PACK_HASH;
        p.verifier = verifierAddr;
        p.challenger = supplier;
        p.reviewer = reviewer;
        p.claimDeadline = uint64(block.timestamp + 30 days);
        p.challengeWindow = 1 days;
        p.reviewTimeout = 2 days;
        p.maxReceiptAge = 300;
        p.confirmations = 2;
        p.evidenceRetention = 365 days;
    }

    function _createCampaign(PatchBondTypes.Policy memory p) internal returns (bytes32) {
        vm.prank(p.supplier);
        return registry.createCampaign(p);
    }

    // ------------------------------------------------------------------ receipt fixtures

    function _snapshotHash(PatchBondTypes.AcceptanceReceipt memory r) internal pure returns (bytes32) {
        return PatchBondTypes.snapshotHash(
            PatchBondTypes.Snapshot({
                chainId: r.sourceChainId,
                blockNumber: r.observedBlockNumber,
                blockHash: r.observedBlockHash,
                blockTimestamp: r.observedBlockTimestamp
            })
        );
    }

    /// @dev A fully valid receipt for fixture deployment `i` at the current block time.
    function _receipt(uint256 i) internal view returns (PatchBondTypes.AcceptanceReceipt memory r) {
        r.campaignId = FIXTURE_CAMPAIGN_ID;
        r.campaignPolicyHash = registry.policyHashOf(FIXTURE_CAMPAIGN_ID);
        r.sourceChainId = FIXTURE_SOURCE_CHAIN_ID;
        r.deploymentKey = depKeys[i];
        r.recipient = recipients[i];
        r.observedBlockNumber = 10;
        r.observedBlockHash = keccak256("FIXTURE observed block hash");
        r.observedBlockTimestamp = uint64(block.timestamp - 20);
        r.snapshotHash = _snapshotHash(r);
        r.testPackHash = FIXTURE_TEST_PACK_HASH;
        r.evidenceDigest = keccak256("FIXTURE evidence digest");
        r.purpose = 1;
        r.mode = 1;
        r.result = 1;
        r.issuedAt = uint64(block.timestamp - 10);
        r.expiresAt = uint64(block.timestamp + 200);
        r.receiptId = keccak256(abi.encode("FIXTURE receipt id", i));
    }

    function _digest(uint256 chainId, address verifyingContract, PatchBondTypes.AcceptanceReceipt memory r)
        internal
        pure
        returns (bytes32)
    {
        return PatchBondTypes.receiptDigest(chainId, verifyingContract, r);
    }

    function _signDigest(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(key, digest);
        return abi.encodePacked(rr, ss, v);
    }

    /// @dev Sign under the correct domain (destination chain, policy.campaign) with the policy verifier key.
    function _sign(PatchBondTypes.AcceptanceReceipt memory r) internal view returns (bytes memory) {
        return _signDigest(verifierKey, _digest(block.chainid, address(campaign), r));
    }

    /// @dev Sign `r` as-is with a valid signature, then require the verifier to revert with `err`.
    function _expectSignedRevert(PatchBondTypes.AcceptanceReceipt memory r, uint256 i, bytes memory err) internal {
        bytes memory sig = _sign(r);
        bytes32[] memory proof = _proof(i);
        vm.expectRevert(err);
        verifier.validateReceipt(r, sig, proof);
    }

    function _expectRevert(
        PatchBondTypes.AcceptanceReceipt memory r,
        bytes memory sig,
        bytes32[] memory proof,
        bytes memory err
    ) internal {
        vm.expectRevert(err);
        verifier.validateReceipt(r, sig, proof);
    }
}
