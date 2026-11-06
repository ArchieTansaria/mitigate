// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ExtraArgsCodec} from "@chainlink/contracts-ccip/contracts/libraries/ExtraArgsCodec.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {ClaimBase} from "../pb18/ClaimBase.sol";
import {CampaignMessageSender} from "../../pb20/messaging/CampaignMessageSender.sol";
import {CampaignMessageReceiver} from "../../pb20/messaging/CampaignMessageReceiver.sol";
import {SimulationRouter} from "./SimulationRouter.sol";

/*
 * PB-20 TEST-FIRST SPECIFICATION (CCIP 2.0.0, `@chainlink/contracts-ccip` 2.0.0)
 * ------------------------------------------------------------------------------------------------------------------
 * Everything that uses `SimulationRouter` is a SIMULATION. It is not live evidence. Every selector, address, key,
 * amount and fee below is a labelled FIXTURE; live selectors/routers come from the CCIP Directory at deployment time.
 *
 * WIRE FORMAT (the CCIP `data` field, no tokens): abi.encode(WireMessageV1) with exactly the struct below.
 *   schemaVersion      1
 *   outcome            1 = ACCEPTED (the only value; anything else is rejected)
 *   businessMessageId  keccak256(abi.encode(receipt.campaignId, receipt.deploymentKey, receipt.receiptId)),
 *                      recomputed by the receiver; a caller-chosen value is rejected. It is a different identifier
 *                      from the CCIP transport messageId.
 *   receipt            the full PatchBondTypes.AcceptanceReceipt, unchanged
 *   signature          the verifier's 65-byte signature over the receipt (verified by the PB-16 verifier at claim time)
 *   eligibilityProof   the Merkle proof for (campaignId, sourceChainId, deploymentKey, recipient)
 *
 * CampaignMessageSender (source chain; its address MUST equal the campaign policy's `sourceRegistry`)
 *   constructor(address router, uint64 destinationChainSelector, address destinationReceiver,
 *               bytes32 destinationCampaignId, bytes32 destinationPolicyHash, address reporter)
 *   all six are immutable and exposed by getters of the same name. No setter, no owner, no caller-chosen route.
 *   quote(receipt, signature, proof) view returns (uint256 fee)   -> router.getFee with the exact message send() uses
 *   send(receipt, signature, proof) payable returns (bytes32 transportMessageId)   -> reporter only, router.ccipSend
 *       message = { receiver: abi.encode(destinationReceiver), data: abi.encode(WireMessageV1), tokenAmounts: [],
 *                   feeToken: address(0) (native), extraArgs: ExtraArgsCodec._getBasicEncodedExtraArgsV3(
 *                   CALLBACK_GAS_LIMIT, bytes4(0)) }; msg.value must equal getFee exactly; the sender holds no funds.
 *       Rejects a receipt whose campaignId / campaignPolicyHash differ from the immutables, and any receipt that is
 *       not purpose 1 / mode 1 / result 1, BEFORE calling the router.
 *   CALLBACK_GAS_LIMIT  public constant uint32 > 0
 *
 * CampaignMessageReceiver is CCIPReceiver (source chain -> this chain)
 *   constructor(address router, uint64 sourceChainSelector, address sourceSender, uint256 sourceChainId,
 *               address campaign, bytes32 campaignId, bytes32 policyHash, uint256 maxPending,
 *               uint256 maxPayloadBytes, uint256 maxProofLength)
 *   `sourceSender` must equal campaign.policy().sourceRegistry; sourceChainId, campaignId and policyHash must equal
 *   the campaign's; all limits nonzero. Immutable, exposed by getters of the same name (router via getRouter()).
 *   ccipReceive (router only; nothing here calls the campaign) validates, then stores the message as Pending:
 *       source selector, source sender, no tokens, payload/proof bounds, schema, outcome, campaign / policy / source
 *       chain, purpose 1 / mode 1 / result 1, businessMessageId derivation, not expired, claim window open.
 *       Identical redelivery (same transport ID, or same business message under a new transport ID) is an idempotent
 *       no-op; the same ID with different content reverts. A full queue reverts.
 *   processMessage(businessMessageId)  anyone; calls campaign.submitClaim(receipt, signature, proof) and bubbles the
 *       campaign / verifier revert, leaving the message Pending and retryable. Success -> Processed.
 *   dropStale(businessMessageId)       anyone; only once the receipt has expired or the claim deadline has passed;
 *       Pending -> Dropped. Terminal states (Processed, Dropped) are never revived.
 *   messageStatus(businessMessageId), pendingCount(), businessIdOfTransport(transportMessageId)
 *   No admin, no owner, no pass-marking path: acceptance only ever happens through the campaign's own checks.
 *   getCCVsAndFinalityConfig keeps the CCIPReceiver default (no faster-than-finality opt-in).
 */

abstract contract Pb20Base is ClaimBase {
    // ---- FIXTURE route constants (not live CCIP values)
    uint64 internal constant FIXTURE_SOURCE_SELECTOR = 1_111_111; // what the destination router reports for the source
    uint64 internal constant FIXTURE_DESTINATION_SELECTOR = 2_222_222; // what the source sender targets
    uint256 internal constant MAX_PENDING = 4;
    uint256 internal constant MAX_PAYLOAD = 8192;
    uint256 internal constant MAX_PROOF = 8;
    uint256 internal constant FIXTURE_FEE = 0.01 ether; // FIXTURE native fee

    bytes32 internal constant ID_P = keccak256("FIXTURE PB-20 route campaign");
    bytes32 internal constant ID_Q = keccak256("FIXTURE PB-20 second route campaign");

    address internal reporter = makeAddr("FIXTURE PB-20 authorized reporter");

    SimulationRouter internal sourceRouter; // SIMULATION ONLY
    SimulationRouter internal destinationRouter; // SIMULATION ONLY
    CampaignMessageSender internal sender;
    CampaignMessageReceiver internal receiver;
    RemediationCampaign internal routeCampaign;
    bytes32 internal routePolicyHash;
    bytes32 internal routeId; // campaign ID of the route currently held in `sender` / `receiver` / `routeCampaign`

    struct WireMessageV1 {
        uint16 schemaVersion;
        uint8 outcome;
        bytes32 businessMessageId;
        PatchBondTypes.AcceptanceReceipt receipt;
        bytes signature;
        bytes32[] eligibilityProof;
    }

    struct Bundle {
        PatchBondTypes.AcceptanceReceipt receipt;
        bytes signature;
        bytes32[] proof;
        WireMessageV1 wire;
        bytes data;
        bytes32 businessId;
    }

    function setUp() public virtual override {
        super.setUp(); // PB-17 funding setup and PB-18 claim fixtures stay intact
        sourceRouter = new SimulationRouter(FIXTURE_DESTINATION_SELECTOR);
        destinationRouter = new SimulationRouter(FIXTURE_SOURCE_SELECTOR);
        sourceRouter.setFee(FIXTURE_FEE);
        _deployRoute(ID_P, MAX_PENDING, true);
    }

    // ------------------------------------------------------------------ route deployment (real PB-15/16/17 contracts)

    /// @dev Creation order matters because the policy commits `sourceRegistry` (the sender) and `campaign`:
    /// sender (nonce n), campaign (n+1), receiver (n+2). The sender also needs the receiver's address up front.
    function _deployRoute(bytes32 id, uint256 maxPending, bool activate) internal {
        routeId = id;
        uint256 n = vm.getNonce(address(this));
        address senderAddr = vm.computeCreateAddress(address(this), n);
        address campaignAddr = vm.computeCreateAddress(address(this), n + 1);
        address receiverAddr = vm.computeCreateAddress(address(this), n + 2);

        PatchBondTypes.Policy memory p = _policy(id, campaignAddr, supplierA, address(usdc));
        p.sourceRegistry = senderAddr;
        p.eligibilityRoot = _root(id);
        p.verifier = verifierAddr;
        routePolicyHash = PatchBondTypes.policyHash(p);
        _register(p);

        sender = new CampaignMessageSender(
            address(sourceRouter), FIXTURE_DESTINATION_SELECTOR, receiverAddr, id, routePolicyHash, reporter
        );
        routeCampaign = new RemediationCampaign(registry, verifier, id, IERC20(address(usdc)));
        receiver = new CampaignMessageReceiver(
            address(destinationRouter),
            FIXTURE_SOURCE_SELECTOR,
            address(sender),
            SOURCE_CHAIN,
            address(routeCampaign),
            id,
            routePolicyHash,
            maxPending,
            MAX_PAYLOAD,
            MAX_PROOF
        );
        assertEq(address(sender), senderAddr, "sender address predicted");
        assertEq(address(routeCampaign), campaignAddr, "campaign address predicted");
        assertEq(address(receiver), receiverAddr, "receiver address predicted");

        if (activate) _fundAndActivate(routeCampaign);
    }

    function _fundAndActivate(RemediationCampaign c) internal {
        usdc.mint(supplierA, REQUIRED);
        vm.startPrank(supplierA);
        usdc.approve(address(c), REQUIRED);
        c.fund(REQUIRED);
        c.activate();
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ messages

    function _businessId(PatchBondTypes.AcceptanceReceipt memory r) internal pure returns (bytes32) {
        return keccak256(abi.encode(r.campaignId, r.deploymentKey, r.receiptId));
    }

    function _wireOf(PatchBondTypes.AcceptanceReceipt memory r, bytes memory sig, bytes32[] memory proof)
        internal
        pure
        returns (WireMessageV1 memory w)
    {
        w.schemaVersion = 1;
        w.outcome = 1;
        w.businessMessageId = _businessId(r);
        w.receipt = r;
        w.signature = sig;
        w.eligibilityProof = proof;
    }

    /// @dev A fresh, validly signed message for deployment `i` of the route campaign. `salt != 0` gives it a new
    /// receipt ID (a fresh receipt for the same deployment).
    function _bundle(uint256 i, uint256 salt) internal view returns (Bundle memory b) {
        b.receipt = _receipt(routeId, i);
        if (salt != 0) b.receipt.receiptId = keccak256(abi.encode("FIXTURE PB-20 fresh receipt", i, salt));
        b.signature = _sign(routeCampaign, b.receipt);
        b.proof = _proofFor(routeId, i);
        b.wire = _wireOf(b.receipt, b.signature, b.proof);
        b.data = abi.encode(b.wire);
        b.businessId = b.wire.businessMessageId;
    }

    /// @dev Re-encode `b.wire` after a test edited it (leaves signature and proof as the test set them).
    function _reencode(Bundle memory b) internal pure {
        b.data = abi.encode(b.wire);
        b.businessId = b.wire.businessMessageId;
    }

    /// @dev After a test edited `b.wire.receipt`, recompute the derived business ID so ONLY the edit is wrong.
    function _rewire(Bundle memory b) internal pure {
        b.wire.businessMessageId = _businessId(b.wire.receipt);
        b.data = abi.encode(b.wire);
        b.businessId = b.wire.businessMessageId;
    }

    function _transportId(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode("FIXTURE PB-20 transport message", n));
    }

    /// @dev Deliver as the (simulated) destination router with the authenticated selector and the source sender.
    function _deliver(uint256 transportN, bytes memory data) internal {
        destinationRouter.deliver(address(receiver), _transportId(transportN), address(sender), data);
    }

    function _deliverBundle(uint256 transportN, Bundle memory b) internal {
        _deliver(transportN, b.data);
    }

    function _status(bytes32 businessId) internal view returns (CampaignMessageReceiver.MessageStatus) {
        return receiver.messageStatus(businessId);
    }

    function _expectedExtraArgs() internal view returns (bytes memory) {
        return ExtraArgsCodec._getBasicEncodedExtraArgsV3(sender.CALLBACK_GAS_LIMIT(), bytes4(0));
    }

    function _anyMessage(bytes32 id, uint64 selector, bytes memory senderBytes, bytes memory data)
        internal
        pure
        returns (Client.Any2EVMMessage memory m)
    {
        m = Client.Any2EVMMessage({
            messageId: id,
            sourceChainSelector: selector,
            sender: senderBytes,
            data: data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }
}
