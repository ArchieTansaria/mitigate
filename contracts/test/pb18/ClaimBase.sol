// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {CampaignFundingBase} from "../pb17/CampaignFundingBase.sol";

interface IFixtureMintable {
    function mint(address to, uint256 amount) external;
}

/*
 * PB-18 EXPECTED API (test-first). None of this exists yet; these tests are the specification, and until it is
 * implemented this suite fails to compile with "member not found" errors. Production code is NOT touched by this
 * suite. The API extends the existing PB-17 `RemediationCampaign` / `IRemediationCampaign`:
 *
 *   enum ClaimStatus { None, Pending, Disputed, Rejected, Awarded, Withdrawn }   // PB-14 states; Disputed and
 *                                                                                 // Rejected arrive with PB-19
 *   submitClaim(PatchBondTypes.AcceptanceReceipt receipt, bytes signature, bytes32[] eligibilityProof)
 *       Anyone may relay. Requires: campaign active; block.timestamp < policy.claimDeadline; no existing claim for
 *       receipt.deploymentKey. Calls verifier.consumeReceipt (so every PB-16 check, including replay, applies and
 *       its custom errors bubble up). On success: status Pending, recipient = receipt.recipient (fixed by the
 *       committed leaf, never msg.sender), receiptId stored, challengeCutoff = now + policy.challengeWindow,
 *       reserves exactly one grant: unallocated -= G, reserved += G. Transfers no tokens.
 *   finalizeClaim(bytes32 deploymentKey)
 *       Anyone. Requires status Pending and now >= challengeCutoff. Moves reserved -> awardedUnwithdrawn and sets
 *       Awarded. Transfers no tokens.
 *   withdrawGrant(bytes32 deploymentKey)
 *       Requires status Awarded and msg.sender == the fixed recipient. Pays exactly G to the recipient and moves
 *       awardedUnwithdrawn -> paid, status Withdrawn. If the token transfer reverts, the whole call reverts and
 *       nothing changes (the claim stays Awarded and can be retried). Other deployments are unaffected.
 *   claimOf(bytes32 deploymentKey) view
 *       returns (ClaimStatus status, address recipient, bytes32 receiptId, uint64 challengeCutoff,
 *                uint256 withdrawable). `withdrawable` is G while Awarded, otherwise 0.
 *   events:  ClaimSubmitted(bytes32 indexed deploymentKey, address indexed recipient, bytes32 indexed receiptId,
 *                           address submitter, uint64 challengeCutoff)
 *            ClaimFinalized(bytes32 indexed deploymentKey, address indexed recipient, uint256 amount)
 *            GrantWithdrawn(bytes32 indexed deploymentKey, address indexed recipient, uint256 amount)
 *   errors:  CampaignNotActive()
 *            ClaimDeadlinePassed(uint64 claimDeadline, uint256 nowTs)
 *            DeploymentAlreadyClaimed(bytes32 deploymentKey)
 *            ChallengeWindowOpen(uint64 challengeCutoff, uint256 nowTs)
 *            ClaimNotPending(bytes32 deploymentKey, ClaimStatus status)
 *            ClaimNotAwarded(bytes32 deploymentKey, ClaimStatus status)
 *            NotRecipient(address caller, address recipient)
 *
 * Accounting identity at every step: deposited = unallocated + reserved + awardedUnwithdrawn + paid + refunded.
 * Every address, key, id and amount below is a labeled FIXTURE. The real PB-15 registry and PB-16 verifier are used.
 */

/// @notice Shared PB-18 fixtures: a claim-ready campaign (real Merkle tree over three deployments, verifier key known
/// to the test) funded and activated through the unchanged PB-17 flow.
abstract contract ClaimBase is CampaignFundingBase {
    bytes32 internal constant ID_C = keccak256("FIXTURE PB-18 claim campaign C");
    bytes32 internal constant ID_D = keccak256("FIXTURE PB-18 claim campaign D (blocklist token)");
    bytes32 internal constant ID_E = keccak256("FIXTURE PB-18 inactive campaign E");
    uint256 internal constant SOURCE_CHAIN = 11155111;

    address internal verifierAddr;
    uint256 internal verifierKey;
    address internal otherAddr;
    uint256 internal otherKey;
    address internal relayer = makeAddr("FIXTURE PB-18 relayer");

    address[3] internal recipients;
    bytes32[3] internal depKeys;

    RemediationCampaign internal claimCampaign; // campaign C: USDC-fixture token, funded and active

    struct ClaimState {
        IRemediationCampaign.ClaimStatus status;
        address recipient;
        bytes32 receiptId;
        uint64 challengeCutoff;
        uint256 withdrawable;
    }

    function setUp() public virtual override {
        super.setUp(); // PB-17 funding setup is preserved: registry, verifier, fixture USDC, campaign A
        (verifierAddr, verifierKey) = makeAddrAndKey("FIXTURE PB-18 disposable verifier signer");
        (otherAddr, otherKey) = makeAddrAndKey("FIXTURE PB-18 disposable other signer");
        for (uint256 i = 0; i < 3; i++) {
            recipients[i] = makeAddr(string.concat("FIXTURE PB-18 recipient ", vm.toString(i)));
            depKeys[i] = PatchBondTypes.deploymentKey(
                SOURCE_CHAIN, makeAddr(string.concat("FIXTURE PB-18 entrypoint ", vm.toString(i))), bytes32(0)
            );
        }
        claimCampaign = _deployClaimCampaign(ID_C, address(usdc), true, true);
    }

    // ------------------------------------------------------------------ merkle fixtures (per campaign id)

    function _leaf(bytes32 id, uint256 i) internal view returns (bytes32) {
        return PatchBondTypes.eligibilityLeaf(id, SOURCE_CHAIN, depKeys[i], recipients[i]);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _root(bytes32 id) internal view returns (bytes32) {
        return _pair(_pair(_leaf(id, 0), _leaf(id, 1)), _leaf(id, 2));
    }

    function _proofFor(bytes32 id, uint256 i) internal view returns (bytes32[] memory p) {
        if (i == 2) {
            p = new bytes32[](1);
            p[0] = _pair(_leaf(id, 0), _leaf(id, 1));
        } else {
            p = new bytes32[](2);
            p[0] = _leaf(id, i == 0 ? 1 : 0);
            p[1] = _leaf(id, 2);
        }
    }

    // ------------------------------------------------------------------ campaign deployment (PB-17 flow)

    function _deployClaimCampaign(bytes32 id, address tokenAddr, bool fundIt, bool activateIt)
        internal
        returns (RemediationCampaign c)
    {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        PatchBondTypes.Policy memory p = _policy(id, predicted, supplierA, tokenAddr);
        p.eligibilityRoot = _root(id);
        p.verifier = verifierAddr;
        _register(p);
        c = new RemediationCampaign(registry, verifier, id, IERC20(tokenAddr));
        assertEq(address(c), predicted);

        if (fundIt) {
            IFixtureMintable(tokenAddr).mint(supplierA, REQUIRED);
            vm.startPrank(supplierA);
            IERC20(tokenAddr).approve(address(c), REQUIRED);
            c.fund(REQUIRED);
            if (activateIt) c.activate();
            vm.stopPrank();
        }
    }

    // ------------------------------------------------------------------ receipts

    function _snapshotHash(PatchBondTypes.AcceptanceReceipt memory r) internal pure returns (bytes32) {
        return PatchBondTypes.snapshotHash(
            PatchBondTypes.Snapshot(r.sourceChainId, r.observedBlockNumber, r.observedBlockHash, r.observedBlockTimestamp)
        );
    }

    function _receiptId(bytes32 id, uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("FIXTURE PB-18 receipt", id, i));
    }

    /// @dev A fully valid, fresh, deployed-mode passing receipt for deployment `i` of campaign `id` at the current time.
    function _receipt(bytes32 id, uint256 i) internal view returns (PatchBondTypes.AcceptanceReceipt memory r) {
        r.campaignId = id;
        r.campaignPolicyHash = registry.policyHashOf(id);
        r.sourceChainId = SOURCE_CHAIN;
        r.deploymentKey = depKeys[i];
        r.recipient = recipients[i];
        r.observedBlockNumber = 10;
        r.observedBlockHash = keccak256("FIXTURE PB-18 observed block hash");
        r.observedBlockTimestamp = uint64(block.timestamp - 20);
        r.snapshotHash = _snapshotHash(r);
        r.testPackHash = registry.policyOf(id).testPackHash;
        r.evidenceDigest = keccak256("FIXTURE PB-18 evidence digest");
        r.purpose = 1;
        r.mode = 1;
        r.result = 1;
        r.issuedAt = uint64(block.timestamp - 10);
        r.expiresAt = uint64(block.timestamp + 200);
        r.receiptId = _receiptId(id, i);
    }

    function _signWith(uint256 key, RemediationCampaign c, PatchBondTypes.AcceptanceReceipt memory r)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = PatchBondTypes.receiptDigest(block.chainid, address(c), r);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(key, digest);
        return abi.encodePacked(rr, ss, v);
    }

    function _sign(RemediationCampaign c, PatchBondTypes.AcceptanceReceipt memory r) internal view returns (bytes memory) {
        return _signWith(verifierKey, c, r);
    }

    /// @dev The address a 65-byte (r, s, v) signature recovers to for `digest`; used to predict InvalidSigner.
    function _recoverSigner(bytes32 digest, bytes memory sig) internal pure returns (address) {
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

    /// @dev Submit a valid claim for deployment `i` of the main claim campaign as `who`.
    function _claimAs(address who, uint256 i) internal returns (PatchBondTypes.AcceptanceReceipt memory r) {
        r = _receipt(ID_C, i);
        bytes memory sig = _sign(claimCampaign, r);
        bytes32[] memory proof = _proofFor(ID_C, i);
        vm.prank(who);
        claimCampaign.submitClaim(r, sig, proof);
    }

    // ------------------------------------------------------------------ reads and invariants

    function _state(RemediationCampaign c, bytes32 key) internal view returns (ClaimState memory s) {
        (s.status, s.recipient, s.receiptId, s.challengeCutoff, s.withdrawable) = c.claimOf(key);
    }

    function _assertIdentity(RemediationCampaign c) internal view {
        IRemediationCampaign.Accounting memory a = c.accounting();
        assertEq(
            a.deposited,
            a.unallocated + a.reserved + a.awardedUnwithdrawn + a.paid + a.refunded,
            "accounting identity: deposited = unallocated + reserved + awarded + paid + refunded"
        );
    }

    /// @dev Nothing was reserved, consumed or paid for deployment `i` of campaign `id` on `c`.
    function _assertNothingHappened(RemediationCampaign c, bytes32 id, uint256 i) internal view {
        ClaimState memory s = _state(c, depKeys[i]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.None), "no claim");
        assertEq(s.recipient, address(0));
        assertEq(s.receiptId, bytes32(0));
        assertEq(s.withdrawable, 0);
        assertFalse(verifier.isConsumed(id, _receiptId(id, i)), "receipt not consumed");
        IRemediationCampaign.Accounting memory a = c.accounting();
        assertEq(a.reserved, 0, "nothing reserved");
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.paid, 0);
        assertEq(a.unallocated, REQUIRED, "full budget still unallocated");
        assertEq(IERC20(c.token()).balanceOf(address(c)), REQUIRED, "no token left the campaign");
        assertEq(IERC20(c.token()).balanceOf(recipients[i]), 0);
        _assertIdentity(c);
    }
}
