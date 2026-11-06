// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {FinalityCodec} from "@chainlink/contracts-ccip/contracts/libraries/FinalityCodec.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IAcceptanceVerifier} from "../../pb16/IAcceptanceVerifier.sol";
import {CampaignMessageSender} from "../../pb20/messaging/CampaignMessageSender.sol";
import {CampaignMessageReceiver} from "../../pb20/messaging/CampaignMessageReceiver.sol";
import {Pb20Base} from "./Pb20Base.sol";

/// @notice PB-20 test-first behavior and security tests for the CCIP acceptance route. Every test that touches a
/// router uses `SimulationRouter`: SIMULATION ONLY, not live evidence. The wire format and API are specified in the
/// header of `Pb20Base.sol`. These tests do not compile until `contracts/pb20/messaging/` exists.
contract CampaignMessageOrderingTest is Pb20Base {
    CampaignMessageReceiver.MessageStatus internal constant NONE = CampaignMessageReceiver.MessageStatus.None;
    CampaignMessageReceiver.MessageStatus internal constant PENDING = CampaignMessageReceiver.MessageStatus.Pending;
    CampaignMessageReceiver.MessageStatus internal constant PROCESSED = CampaignMessageReceiver.MessageStatus.Processed;
    CampaignMessageReceiver.MessageStatus internal constant DROPPED = CampaignMessageReceiver.MessageStatus.Dropped;

    // ------------------------------------------------------------------ helpers

    function _expectedMessage(Bundle memory b) internal view returns (Client.EVM2AnyMessage memory m) {
        m = Client.EVM2AnyMessage({
            receiver: abi.encode(address(receiver)),
            data: b.data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: _expectedExtraArgs()
        });
    }

    /// @dev Each signature must NOT exist on `target`: a call with that selector fails (no fallback, no receive).
    function _assertAbsent(address target, string[] memory sigs) internal {
        for (uint256 i = 0; i < sigs.length; i++) {
            (bool ok,) = target.call(abi.encodeWithSelector(bytes4(keccak256(bytes(sigs[i])))));
            assertFalse(ok, string.concat("function must not exist: ", sigs[i]));
        }
    }

    function _claimStatus(uint256 i) internal view returns (IRemediationCampaign.ClaimStatus) {
        return _state(routeCampaign, depKeys[i]).status;
    }

    function _assertNoClaim(uint256 i) internal view {
        ClaimState memory s = _state(routeCampaign, depKeys[i]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.None), "no claim exists");
        assertEq(s.recipient, address(0));
    }

    function _assertNothingStoredOrReserved(bytes32 businessId) internal view {
        assertEq(uint8(_status(businessId)), uint8(NONE), "nothing stored");
        assertEq(receiver.pendingCount(), 0);
        assertEq(routeCampaign.accounting().reserved, 0, "nothing reserved");
    }

    // ================================================================== source sender

    function test_senderExposesItsImmutableRoute() public view {
        assertEq(sender.router(), address(sourceRouter));
        assertEq(sender.destinationChainSelector(), FIXTURE_DESTINATION_SELECTOR);
        assertEq(sender.destinationReceiver(), address(receiver));
        assertEq(sender.destinationCampaignId(), ID_P);
        assertEq(sender.destinationPolicyHash(), routePolicyHash);
        assertEq(sender.reporter(), reporter);
        assertTrue(sender.CALLBACK_GAS_LIMIT() > 0, "a nonzero callback gas limit is part of the route");
        // The sender's address is what the campaign policy commits as `sourceRegistry`.
        assertEq(routeCampaign.policy().sourceRegistry, address(sender));
        assertEq(routeCampaign.policy().sourceChainId, SOURCE_CHAIN);
    }

    function test_senderRejectsAnIncompleteRoute() public {
        address r = address(sourceRouter);
        address rx = address(receiver);
        bytes32 ph = routePolicyHash;
        uint64 sel = FIXTURE_DESTINATION_SELECTOR;

        vm.expectRevert();
        new CampaignMessageSender(address(0), sel, rx, ID_P, ph, reporter);
        vm.expectRevert(); // an EOA is not a router
        new CampaignMessageSender(attacker, sel, rx, ID_P, ph, reporter);
        vm.expectRevert();
        new CampaignMessageSender(r, 0, rx, ID_P, ph, reporter);
        vm.expectRevert();
        new CampaignMessageSender(r, sel, address(0), ID_P, ph, reporter);
        vm.expectRevert();
        new CampaignMessageSender(r, sel, rx, bytes32(0), ph, reporter);
        vm.expectRevert();
        new CampaignMessageSender(r, sel, rx, ID_P, bytes32(0), reporter);
        vm.expectRevert();
        new CampaignMessageSender(r, sel, rx, ID_P, ph, address(0));
    }

    function test_onlyTheAuthorizedReporterCanSend() public {
        Bundle memory b = _bundle(0, 0);
        address[6] memory callers = [attacker, supplierA, reviewer, verifierAddr, relayer, address(this)];
        for (uint256 k = 0; k < callers.length; k++) {
            vm.deal(callers[k], FIXTURE_FEE);
            vm.prank(callers[k]);
            vm.expectRevert(
                abi.encodeWithSelector(CampaignMessageSender.NotReporter.selector, callers[k], reporter)
            );
            sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);
        }
        assertEq(sourceRouter.sendCount(), 0, "the router was never reached");
        assertEq(address(sender).balance, 0);
    }

    function test_quoteAsksTheRouterForTheExactMessageAndSendsNothing() public {
        Bundle memory b = _bundle(0, 0);
        vm.expectCall(
            address(sourceRouter),
            abi.encodeCall(IRouterClient.getFee, (FIXTURE_DESTINATION_SELECTOR, _expectedMessage(b)))
        );
        vm.prank(attacker); // quoting is read-only and open
        uint256 fee = sender.quote(b.receipt, b.signature, b.proof);

        assertEq(fee, FIXTURE_FEE, "the quote is the router's getFee, not a local guess");
        assertEq(sourceRouter.sendCount(), 0, "quoting never sends");
    }

    function test_sendUsesCcipSendWithEmptyTokensFixedRouteAndTheExactFee() public {
        Bundle memory b = _bundle(0, 0);
        Client.EVM2AnyMessage memory expected = _expectedMessage(b);
        assertEq(expected.tokenAmounts.length, 0);

        vm.deal(reporter, FIXTURE_FEE);
        vm.expectCall(
            address(sourceRouter),
            FIXTURE_FEE,
            abi.encodeCall(IRouterClient.ccipSend, (FIXTURE_DESTINATION_SELECTOR, expected))
        );
        vm.expectEmit(true, true, true, true, address(sender));
        emit CampaignMessageSender.AcceptanceSent(sourceRouter.nextMessageId(), b.businessId, ID_P, FIXTURE_FEE);

        vm.prank(reporter);
        bytes32 transportId = sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);

        assertEq(transportId, sourceRouter.lastSendMessageId(), "the CCIP transport ID is returned unchanged");
        assertEq(sourceRouter.lastSendSelector(), FIXTURE_DESTINATION_SELECTOR, "fixed destination selector");
        assertEq(sourceRouter.lastSendReceiver(), abi.encode(address(receiver)), "fixed destination receiver");
        assertEq(sourceRouter.lastSendData(), b.data, "the full receipt, signature, proof, outcome and ids");
        assertEq(sourceRouter.lastSendExtraArgs(), _expectedExtraArgs(), "CCIP v2 extra args, default finality");
        assertEq(sourceRouter.lastSendFeeToken(), address(0), "native fee");
        assertEq(sourceRouter.lastSendTokenCount(), 0, "no token transfer");
        assertEq(sourceRouter.lastSendValue(), FIXTURE_FEE, "exactly the quoted fee");
        assertEq(sourceRouter.lastSendCaller(), address(sender));
        assertEq(address(sender).balance, 0, "the sender never holds funds");
        assertEq(reporter.balance, 0, "the reporter paid exactly the fee");
        assertTrue(transportId != b.businessId, "transport ID and business message ID are different identifiers");
    }

    function test_sendRequiresExactlyTheRoutersCurrentFee() public {
        Bundle memory b = _bundle(0, 0);
        vm.deal(reporter, 10 ether);

        uint256[3] memory wrong = [uint256(0), FIXTURE_FEE - 1, FIXTURE_FEE + 1];
        for (uint256 k = 0; k < wrong.length; k++) {
            vm.prank(reporter);
            vm.expectRevert(
                abi.encodeWithSelector(CampaignMessageSender.IncorrectFee.selector, wrong[k], FIXTURE_FEE)
            );
            sender.send{value: wrong[k]}(b.receipt, b.signature, b.proof);
        }
        assertEq(sourceRouter.sendCount(), 0);

        // A stale quote cannot be used once the router's fee changes.
        sourceRouter.setFee(2 * FIXTURE_FEE);
        vm.prank(reporter);
        vm.expectRevert(
            abi.encodeWithSelector(CampaignMessageSender.IncorrectFee.selector, FIXTURE_FEE, 2 * FIXTURE_FEE)
        );
        sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);

        vm.prank(reporter);
        sender.send{value: 2 * FIXTURE_FEE}(b.receipt, b.signature, b.proof);
        assertEq(sourceRouter.sendCount(), 1);
        assertEq(address(sender).balance, 0);
    }

    function test_senderRefusesReceiptsForAnotherCampaignOrPolicyBeforeCallingTheRouter() public {
        vm.deal(reporter, 1 ether);

        Bundle memory b = _bundle(0, 0);
        b.receipt.campaignId = ID_Q;
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageSender.CampaignIdMismatch.selector, ID_Q, ID_P));
        sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);

        Bundle memory c = _bundle(0, 0);
        c.receipt.campaignPolicyHash = keccak256("FIXTURE some other policy");
        vm.prank(reporter);
        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignMessageSender.PolicyHashMismatch.selector, c.receipt.campaignPolicyHash, routePolicyHash
            )
        );
        sender.send{value: FIXTURE_FEE}(c.receipt, c.signature, c.proof);
        assertEq(sourceRouter.sendCount(), 0);
    }

    function test_senderNeverReportsAnythingButAPassingDeployedClaimReceipt() public {
        vm.deal(reporter, 1 ether);
        uint8[4] memory badResults = [uint8(0), 2, 3, 4];
        for (uint256 k = 0; k < badResults.length; k++) {
            Bundle memory b = _bundle(0, 0);
            b.receipt.result = badResults[k];
            vm.prank(reporter);
            vm.expectRevert(abi.encodeWithSelector(CampaignMessageSender.ReceiptNotAccepted.selector, 1, 1, badResults[k]));
            sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);
        }
        Bundle memory d = _bundle(0, 0);
        d.receipt.purpose = 0; // diagnostic
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageSender.ReceiptNotAccepted.selector, 0, 1, 1));
        sender.send{value: FIXTURE_FEE}(d.receipt, d.signature, d.proof);

        Bundle memory e = _bundle(0, 0);
        e.receipt.mode = 0; // preview
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageSender.ReceiptNotAccepted.selector, 1, 0, 1));
        sender.send{value: FIXTURE_FEE}(e.receipt, e.signature, e.proof);
        assertEq(sourceRouter.sendCount(), 0);
    }

    function test_senderHasNoCallerChosenRouteAndNoAdminSurface() public {
        string[] memory sigs = new string[](14);
        sigs[0] = "send(uint64,address,bytes)";
        sigs[1] = "send(uint64,address,(bytes32,bytes32,uint256,bytes32,address,bytes32,uint256,bytes32,uint64,bytes32,bytes32,uint8,uint8,uint8,uint64,uint64,bytes32),bytes,bytes32[])";
        sigs[2] = "sendTo(uint64,address)";
        sigs[3] = "setRouter(address)";
        sigs[4] = "setDestination(uint64,address)";
        sigs[5] = "setReceiver(address)";
        sigs[6] = "setReporter(address)";
        sigs[7] = "setGasLimit(uint32)";
        sigs[8] = "transferOwnership(address)";
        sigs[9] = "owner()";
        sigs[10] = "withdraw(address)";
        sigs[11] = "rescue(address,uint256)";
        sigs[12] = "sweep()";
        sigs[13] = "updateRoute(uint64,address)";
        _assertAbsent(address(sender), sigs);

        (bool ok,) = address(sender).call{value: 1}("");
        assertFalse(ok, "the sender cannot be funded by a plain transfer");
    }

    function test_sourceAndDestinationSimulationsAreLabelledAndSeparate() public view {
        assertTrue(sourceRouter.SIMULATION_ONLY());
        assertTrue(destinationRouter.SIMULATION_ONLY());
        assertTrue(bytes(sourceRouter.LABEL()).length > 0);
        assertTrue(address(sourceRouter) != address(destinationRouter), "source and destination roles never share a router");
        assertEq(sender.router(), address(sourceRouter));
        assertEq(receiver.getRouter(), address(destinationRouter));
    }

    // ================================================================== destination receiver: bindings

    function test_receiverExposesItsImmutableBindings() public view {
        assertEq(receiver.getRouter(), address(destinationRouter));
        assertEq(receiver.sourceChainSelector(), FIXTURE_SOURCE_SELECTOR);
        assertEq(receiver.sourceSender(), address(sender));
        assertEq(receiver.sourceChainId(), SOURCE_CHAIN);
        assertEq(receiver.campaign(), address(routeCampaign));
        assertEq(receiver.campaignId(), ID_P);
        assertEq(receiver.policyHash(), routePolicyHash);
        assertEq(receiver.maxPending(), MAX_PENDING);
        assertEq(receiver.maxPayloadBytes(), MAX_PAYLOAD);
        assertEq(receiver.maxProofLength(), MAX_PROOF);
        assertEq(receiver.pendingCount(), 0);
        assertEq(receiver.sourceSender(), routeCampaign.policy().sourceRegistry, "authenticated sender = policy source registry");
    }

    function test_receiverRejectsBindingsThatDisagreeWithTheCampaignPolicy() public {
        address rt = address(destinationRouter);
        address c = address(routeCampaign);
        bytes32 ph = routePolicyHash;
        bytes32 directPolicyHash = registry.policyHashOf(ID_C);

        // The source sender must be exactly the campaign's committed sourceRegistry.
        vm.expectRevert(
            abi.encodeWithSelector(CampaignMessageReceiver.SourceSenderMismatch.selector, attacker, address(sender))
        );
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, attacker, SOURCE_CHAIN, c, ID_P, ph, address(registry), 4, 8192, 8);

        // A campaign in direct-signed mode (sourceRegistry == 0) cannot be fed by any CCIP sender.
        vm.expectRevert(
            abi.encodeWithSelector(CampaignMessageReceiver.SourceSenderMismatch.selector, address(sender), address(0))
        );
        new CampaignMessageReceiver(
            rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, address(claimCampaign), ID_C, directPolicyHash, address(registry), 4, 8192, 8
        );

        vm.expectRevert(); // wrong source chain ID
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN + 1, c, ID_P, ph, address(registry), 4, 8192, 8);
        vm.expectRevert(); // wrong campaign ID
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_Q, ph, address(registry), 4, 8192, 8);
        vm.expectRevert(); // wrong policy hash
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, keccak256("x"), address(registry), 4, 8192, 8);
        vm.expectRevert(); // campaign address is not the address committed by this policy
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, attacker, ID_P, ph, address(registry), 4, 8192, 8);
        vm.expectRevert(); // zero router
        new CampaignMessageReceiver(address(0), FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, ph, address(registry), 4, 8192, 8);
        vm.expectRevert(); // zero selector
        new CampaignMessageReceiver(rt, 0, address(sender), SOURCE_CHAIN, c, ID_P, ph, address(registry), 4, 8192, 8);
        vm.expectRevert(); // registry without code
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, ph, attacker, 4, 8192, 8);
        vm.expectRevert(); // zero capacity
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, ph, address(registry), 0, 8192, 8);
        vm.expectRevert(); // zero payload bound
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, ph, address(registry), 4, 0, 8);
        vm.expectRevert(); // zero proof bound
        new CampaignMessageReceiver(rt, FIXTURE_SOURCE_SELECTOR, address(sender), SOURCE_CHAIN, c, ID_P, ph, address(registry), 4, 8192, 0);
    }

    // ================================================================== destination receiver: authentication

    function test_onlyTheConfiguredRouterCanDeliver() public {
        Bundle memory b = _bundle(0, 0);
        Client.Any2EVMMessage memory m =
            _anyMessage(_transportId(1), FIXTURE_SOURCE_SELECTOR, abi.encode(address(sender)), b.data);
        // Not the router: even the authorized source sender, the reporter, the campaign and the OTHER simulated
        // router (a router on the wrong side of the lane) are refused.
        address[6] memory callers =
            [attacker, reporter, address(sender), address(routeCampaign), address(sourceRouter), address(this)];
        for (uint256 k = 0; k < callers.length; k++) {
            vm.prank(callers[k]);
            vm.expectRevert(abi.encodeWithSelector(CCIPReceiver.InvalidRouter.selector, callers[k]));
            receiver.ccipReceive(m);
        }
        _assertNothingStoredOrReserved(b.businessId);
    }

    function test_unexpectedSourceSelectorIsRejected() public {
        Bundle memory b = _bundle(0, 0);
        uint64[3] memory bad = [FIXTURE_SOURCE_SELECTOR + 1, FIXTURE_DESTINATION_SELECTOR, 0];
        for (uint256 k = 0; k < bad.length; k++) {
            Client.Any2EVMMessage memory m = _anyMessage(_transportId(1), bad[k], abi.encode(address(sender)), b.data);
            vm.expectRevert(
                abi.encodeWithSelector(CampaignMessageReceiver.UnexpectedSourceSelector.selector, bad[k], FIXTURE_SOURCE_SELECTOR)
            );
            destinationRouter.deliverCustom(address(receiver), m);
        }
        _assertNothingStoredOrReserved(b.businessId);
    }

    function test_onlyThePolicyCommittedSourceSenderIsAccepted() public {
        Bundle memory b = _bundle(0, 0);
        address[4] memory bad = [attacker, address(routeCampaign), reporter, address(0)];
        for (uint256 k = 0; k < bad.length; k++) {
            Client.Any2EVMMessage memory m =
                _anyMessage(_transportId(1), FIXTURE_SOURCE_SELECTOR, abi.encode(bad[k]), b.data);
            vm.expectRevert(
                abi.encodeWithSelector(CampaignMessageReceiver.UnauthorizedSourceSender.selector, bad[k], address(sender))
            );
            destinationRouter.deliverCustom(address(receiver), m);
        }
        // Malformed sender encodings are refused too (a real EVM source always presents abi.encode(address)).
        bytes[3] memory malformed = [abi.encodePacked(address(sender)), bytes(""), abi.encode(address(sender), address(sender))];
        for (uint256 k = 0; k < malformed.length; k++) {
            Client.Any2EVMMessage memory m = _anyMessage(_transportId(2), FIXTURE_SOURCE_SELECTOR, malformed[k], b.data);
            vm.expectRevert();
            destinationRouter.deliverCustom(address(receiver), m);
        }
        _assertNothingStoredOrReserved(b.businessId);
    }

    function test_messagesCarryingTokensAreRejected() public {
        Bundle memory b = _bundle(0, 0);
        Client.EVMTokenAmount[] memory toks = new Client.EVMTokenAmount[](1);
        toks[0] = Client.EVMTokenAmount({token: address(usdc), amount: 1});
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: _transportId(1),
            sourceChainSelector: FIXTURE_SOURCE_SELECTOR,
            sender: abi.encode(address(sender)),
            data: b.data,
            destTokenAmounts: toks
        });
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.TokensNotAllowed.selector, 1));
        destinationRouter.deliverCustom(address(receiver), m);
        _assertNothingStoredOrReserved(b.businessId);
    }

    // ================================================================== destination receiver: payload validation

    function _expectRejected(uint256 n, bytes memory data, bytes memory err) internal {
        vm.expectRevert(err);
        _deliver(n, data);
    }

    function test_payloadAndProofBoundsAreEnforced() public {
        // Oversized payload.
        bytes memory big = new bytes(MAX_PAYLOAD + 1);
        _expectRejected(1, big, abi.encodeWithSelector(CampaignMessageReceiver.PayloadTooLarge.selector, MAX_PAYLOAD + 1, MAX_PAYLOAD));

        // Proof one element too long.
        Bundle memory b = _bundle(0, 0);
        b.wire.eligibilityProof = new bytes32[](MAX_PROOF + 1);
        _reencode(b);
        _expectRejected(2, b.data, abi.encodeWithSelector(CampaignMessageReceiver.ProofTooLong.selector, MAX_PROOF + 1, MAX_PROOF));
        _assertNothingStoredOrReserved(b.businessId);

        // Exactly at the proof bound is accepted at delivery (validity is judged when the claim is processed).
        b.wire.eligibilityProof = new bytes32[](MAX_PROOF);
        _reencode(b);
        _deliver(3, b.data);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));
    }

    function test_unsupportedSchemaVersionsAreRejected() public {
        uint16[3] memory bad = [uint16(0), 2, type(uint16).max];
        for (uint256 k = 0; k < bad.length; k++) {
            Bundle memory b = _bundle(0, 0);
            b.wire.schemaVersion = bad[k];
            _reencode(b);
            _expectRejected(k + 1, b.data, abi.encodeWithSelector(CampaignMessageReceiver.UnsupportedSchemaVersion.selector, bad[k]));
        }
    }

    function test_onlyTheExplicitAcceptedOutcomeIsAccepted() public {
        uint8[3] memory bad = [uint8(0), 2, 255];
        for (uint256 k = 0; k < bad.length; k++) {
            Bundle memory b = _bundle(0, 0);
            b.wire.outcome = bad[k];
            _reencode(b);
            _expectRejected(k + 1, b.data, abi.encodeWithSelector(CampaignMessageReceiver.InvalidOutcome.selector, bad[k]));
        }
        _assertNothingStoredOrReserved(_bundle(0, 0).businessId);
    }

    function test_receiptsForAnotherCampaignPolicyOrSourceChainAreRejected() public {
        Bundle memory a = _bundle(0, 0);
        a.wire.receipt.campaignId = ID_Q;
        _rewire(a);
        _expectRejected(1, a.data, abi.encodeWithSelector(CampaignMessageReceiver.CampaignIdMismatch.selector, ID_Q, ID_P));

        Bundle memory b = _bundle(0, 0);
        b.wire.receipt.campaignPolicyHash = keccak256("FIXTURE other policy");
        _rewire(b);
        _expectRejected(
            2, b.data,
            abi.encodeWithSelector(CampaignMessageReceiver.PolicyHashMismatch.selector, b.wire.receipt.campaignPolicyHash, routePolicyHash)
        );

        Bundle memory c = _bundle(0, 0);
        c.wire.receipt.sourceChainId = SOURCE_CHAIN + 1;
        _rewire(c);
        _expectRejected(3, c.data, abi.encodeWithSelector(CampaignMessageReceiver.SourceChainMismatch.selector, SOURCE_CHAIN + 1, SOURCE_CHAIN));
        _assertNothingStoredOrReserved(_bundle(0, 0).businessId);
    }

    function test_nonPassingWrongPurposeOrWrongModeReceiptsCannotBeSmuggledAsAccepted() public {
        // The envelope says ACCEPTED (outcome 1) but the signed receipt it carries says otherwise: forged outcome.
        uint8[4] memory badResults = [uint8(0), 2, 3, 4];
        for (uint256 k = 0; k < badResults.length; k++) {
            Bundle memory b = _bundle(0, 0);
            b.wire.receipt.result = badResults[k];
            _rewire(b);
            _expectRejected(k + 1, b.data, abi.encodeWithSelector(CampaignMessageReceiver.InvalidReceiptScope.selector, 1, 1, badResults[k]));
        }
        Bundle memory p = _bundle(0, 0);
        p.wire.receipt.purpose = 0; // diagnostic
        _rewire(p);
        _expectRejected(10, p.data, abi.encodeWithSelector(CampaignMessageReceiver.InvalidReceiptScope.selector, 0, 1, 1));
        Bundle memory m = _bundle(0, 0);
        m.wire.receipt.mode = 0; // preview
        _rewire(m);
        _expectRejected(11, m.data, abi.encodeWithSelector(CampaignMessageReceiver.InvalidReceiptScope.selector, 1, 0, 1));
        assertEq(receiver.pendingCount(), 0);
    }

    function test_aCallerChosenBusinessMessageIdIsRejected() public {
        Bundle memory b = _bundle(0, 0);
        bytes32 expected = b.businessId;
        b.wire.businessMessageId = keccak256("FIXTURE chosen business id");
        _reencode(b);
        _expectRejected(
            1, b.data,
            abi.encodeWithSelector(CampaignMessageReceiver.BusinessMessageIdMismatch.selector, b.wire.businessMessageId, expected)
        );
        assertEq(receiver.pendingCount(), 0);
    }

    function test_expiredReportsAndAClosedClaimWindowCannotCreateMessages() public {
        Bundle memory b = _bundle(0, 0);
        uint64 expiresAt = b.receipt.expiresAt;

        // At expiresAt the report is still valid; one second later it is not.
        vm.warp(uint256(expiresAt) + 1);
        _expectRejected(1, b.data, abi.encodeWithSelector(CampaignMessageReceiver.ReportExpired.selector, expiresAt, uint256(expiresAt) + 1));
        _assertNothingStoredOrReserved(b.businessId);

        // A fresh receipt delivered after the claim deadline: the window is closed.
        uint64 d = routeCampaign.policy().claimDeadline;
        vm.warp(d);
        Bundle memory late = _bundle(1, 0);
        _expectRejected(2, late.data, abi.encodeWithSelector(CampaignMessageReceiver.ClaimWindowClosed.selector, d, uint256(d)));
        _assertNothingStoredOrReserved(late.businessId);
    }

    function test_aReportDeliveredExactlyAtItsExpiryIsStillAccepted() public {
        Bundle memory b = _bundle(0, 0);
        vm.warp(b.receipt.expiresAt);
        _deliver(1, b.data);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));
    }

    // ================================================================== storing and processing (reception is separate)

    function test_aValidMessageIsStoredPendingAndNeverTouchesTheCampaign() public {
        Bundle memory b = _bundle(0, 0);
        vm.expectEmit(true, true, true, true, address(receiver));
        emit CampaignMessageReceiver.MessageReceived(_transportId(1), b.businessId, depKeys[0]);
        _deliverBundle(1, b);

        assertEq(uint8(_status(b.businessId)), uint8(PENDING));
        assertEq(receiver.pendingCount(), 1);
        assertEq(receiver.businessIdOfTransport(_transportId(1)), b.businessId, "transport ID is tracked separately");
        _assertNoClaim(0);
        assertEq(routeCampaign.accounting().reserved, 0, "reception reserves nothing");
        assertFalse(verifier.isConsumed(ID_P, b.receipt.receiptId), "reception does not consume the receipt");
    }

    function test_anyoneCanProcessAPendingMessageIntoAnIndependentClaim() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);

        vm.expectEmit(true, true, true, true, address(routeCampaign));
        emit IRemediationCampaign.ClaimSubmitted(
            depKeys[0], recipients[0], b.receipt.receiptId, address(receiver), uint64(block.timestamp + 1 days)
        );
        vm.expectEmit(true, true, true, false, address(receiver));
        emit CampaignMessageReceiver.MessageProcessed(b.businessId, depKeys[0], recipients[0]);
        vm.prank(attacker); // the processor has no say in who gets paid
        receiver.processMessage(b.businessId);

        ClaimState memory s = _state(routeCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(s.recipient, recipients[0], "the recipient is the receipt's committed recipient");
        assertEq(s.receiptId, b.receipt.receiptId);
        assertEq(s.challengeCutoff, block.timestamp + 1 days);
        assertEq(uint8(_status(b.businessId)), uint8(PROCESSED));
        assertEq(receiver.pendingCount(), 0);
        assertTrue(verifier.isConsumed(ID_P, b.receipt.receiptId));
        assertEq(routeCampaign.accounting().reserved, GRANT, "exactly one grant reserved");
        assertEq(usdc.balanceOf(address(routeCampaign)), REQUIRED, "no tokens moved");
        assertEq(usdc.balanceOf(recipients[0]), 0);
        _assertIdentity(routeCampaign);
    }

    function test_processingAnUnknownOrFinishedMessageReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.MessageNotPending.selector, bytes32(uint256(7)), NONE));
        receiver.processMessage(bytes32(uint256(7)));

        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);
        receiver.processMessage(b.businessId);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.MessageNotPending.selector, b.businessId, PROCESSED));
        receiver.processMessage(b.businessId);
        assertEq(routeCampaign.accounting().reserved, GRANT, "a second call reserves nothing more");
    }

    // ================================================================== duplicates, conflicts and replay

    function test_duplicateTransportDeliveryIsAnIdempotentNoOp() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);

        vm.expectEmit(true, true, false, false, address(receiver));
        emit CampaignMessageReceiver.DuplicateIgnored(_transportId(1), b.businessId);
        _deliverBundle(1, b); // CCIP may redeliver; this must not revert and must not double count
        assertEq(receiver.pendingCount(), 1);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));

        receiver.processMessage(b.businessId);
        _deliverBundle(1, b); // redelivered after processing
        assertEq(uint8(_status(b.businessId)), uint8(PROCESSED));
        assertEq(routeCampaign.accounting().reserved, GRANT, "one grant, never two");
    }

    function test_theSameTransportIdWithDifferentContentIsAConflict() public {
        Bundle memory b0 = _bundle(0, 0);
        Bundle memory b1 = _bundle(1, 0);
        _deliverBundle(1, b0);

        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.TransportMessageConflict.selector, _transportId(1)));
        _deliverBundle(1, b1);
        assertEq(receiver.pendingCount(), 1);
        assertEq(uint8(_status(b1.businessId)), uint8(NONE));
    }

    function test_businessReplayThroughASecondTransportIdIsIgnoredAndNeverDoubleClaims() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);
        _deliverBundle(2, b); // same business fact, new CCIP transport ID
        assertEq(receiver.pendingCount(), 1, "one pending business message");

        receiver.processMessage(b.businessId);
        _deliverBundle(3, b); // and again after it was processed
        assertEq(uint8(_status(b.businessId)), uint8(PROCESSED));
        assertEq(receiver.pendingCount(), 0);
        assertEq(routeCampaign.accounting().reserved, GRANT, "replay reserves nothing more");
    }

    function test_theSameBusinessMessageWithDifferentContentIsAConflict() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);

        Bundle memory alt = _bundle(0, 0);
        alt.wire.signature = _signWith(otherKey, routeCampaign, alt.receipt); // same business ID, different bytes
        _reencode(alt);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.BusinessMessageConflict.selector, b.businessId));
        _deliverBundle(2, alt);

        receiver.processMessage(b.businessId);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.BusinessMessageConflict.selector, b.businessId));
        _deliverBundle(3, alt);
        assertEq(routeCampaign.accounting().reserved, GRANT);
    }

    function test_aRejectedClaimIsNotRevivedByAnOldMessageButAFreshReceiptCanClaim() public {
        Bundle memory old = _bundle(0, 0);
        _deliverBundle(1, old);
        receiver.processMessage(old.businessId);

        // PB-19: the supplier challenges and the reviewer rejects, releasing the reservation.
        vm.prank(supplierA);
        routeCampaign.challengeClaim(depKeys[0], keccak256("FIXTURE PB-20 challenge reason"));
        vm.prank(reviewer);
        routeCampaign.resolveChallenge(depKeys[0], false);
        assertEq(uint8(_claimStatus(0)), uint8(IRemediationCampaign.ClaimStatus.Rejected));
        assertEq(routeCampaign.accounting().reserved, 0);

        // The old message, replayed late under a new transport ID, does nothing; neither does the old receipt.
        _deliverBundle(2, old);
        assertEq(uint8(_status(old.businessId)), uint8(PROCESSED), "terminal states are never revived");
        assertEq(uint8(_claimStatus(0)), uint8(IRemediationCampaign.ClaimStatus.Rejected));
        assertEq(routeCampaign.accounting().reserved, 0);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptAlreadyConsumed.selector, ID_P, old.receipt.receiptId));
        routeCampaign.submitClaim(old.receipt, old.signature, old.proof);

        // Only a fresh, validly signed receipt can claim again.
        vm.warp(block.timestamp + 1 hours);
        Bundle memory fresh = _bundle(0, 1);
        _deliverBundle(3, fresh);
        receiver.processMessage(fresh.businessId);
        ClaimState memory s = _state(routeCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(s.receiptId, fresh.receipt.receiptId);
        assertEq(routeCampaign.accounting().reserved, GRANT);
        _assertIdentity(routeCampaign);
    }

    // ================================================================== bounded pending queue

    function test_pendingQueueIsBoundedAndFreesOnProcessAndOnDrop() public {
        _deployRoute(ID_Q, 2, true); // capacity 2
        Bundle memory b0 = _bundle(0, 0);
        Bundle memory b1 = _bundle(1, 0);
        Bundle memory b2 = _bundle(2, 0);
        _deliverBundle(1, b0);
        _deliverBundle(2, b1);
        assertEq(receiver.pendingCount(), 2);

        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.PendingQueueFull.selector, 2));
        _deliverBundle(3, b2);
        assertEq(uint8(_status(b2.businessId)), uint8(NONE));
        _deliverBundle(1, b0); // a duplicate needs no room, so it is still a quiet no-op when the queue is full
        assertEq(receiver.pendingCount(), 2);

        receiver.processMessage(b0.businessId); // processing frees a slot
        assertEq(receiver.pendingCount(), 1);
        _deliverBundle(3, b2);
        assertEq(receiver.pendingCount(), 2);

        vm.warp(uint256(b1.receipt.expiresAt) + 1); // b1 and b2 are stale now
        receiver.dropStale(b1.businessId); // dropping frees a slot too
        assertEq(receiver.pendingCount(), 1);
        Bundle memory fresh = _bundle(1, 9);
        _deliverBundle(4, fresh);
        assertEq(receiver.pendingCount(), 2);
    }

    // ================================================================== completion before campaign

    function test_aMessageArrivingBeforeActivationIsHeldAndProcessedAfterwards() public {
        _deployRoute(ID_Q, 4, false); // deployed, not funded, not active
        assertFalse(routeCampaign.active());
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b); // reception does not depend on the campaign being ready
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));

        vm.expectRevert(IRemediationCampaign.CampaignNotActive.selector);
        receiver.processMessage(b.businessId);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING), "a failed attempt leaves the message retryable");
        assertEq(receiver.pendingCount(), 1);
        _assertNoClaim(0);
        assertFalse(verifier.isConsumed(ID_Q, b.receipt.receiptId));

        _fundAndActivate(routeCampaign);
        receiver.processMessage(b.businessId);
        assertEq(uint8(_status(b.businessId)), uint8(PROCESSED));
        assertEq(uint8(_claimStatus(0)), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(routeCampaign.accounting().reserved, GRANT);
    }

    function test_aMessageArrivingBeforeCampaignDeploymentIsHeldUntilTheCampaignExists() public {
        routeId = ID_Q;
        uint256 n = vm.getNonce(address(this));
        address senderAddr = vm.computeCreateAddress(address(this), n);
        address receiverAddr = vm.computeCreateAddress(address(this), n + 1);
        address campaignAddr = vm.computeCreateAddress(address(this), n + 2);

        PatchBondTypes.Policy memory p = _policy(routeId, campaignAddr, supplierA, address(usdc));
        p.sourceRegistry = senderAddr;
        p.eligibilityRoot = _root(routeId);
        p.verifier = verifierAddr;
        routePolicyHash = PatchBondTypes.policyHash(p);
        _register(p);

        sender = new CampaignMessageSender(
            address(sourceRouter), FIXTURE_DESTINATION_SELECTOR, receiverAddr, routeId, routePolicyHash, reporter
        );
        receiver = new CampaignMessageReceiver(
            address(destinationRouter),
            FIXTURE_SOURCE_SELECTOR,
            address(sender),
            SOURCE_CHAIN,
            campaignAddr,
            routeId,
            routePolicyHash,
            address(registry),
            MAX_PENDING,
            MAX_PAYLOAD,
            MAX_PROOF
        );
        assertEq(campaignAddr.code.length, 0, "policy and receiver are ready before campaign deployment");

        Bundle memory b;
        b.receipt = _receipt(routeId, 0);
        b.signature = _signWith(verifierKey, RemediationCampaign(campaignAddr), b.receipt);
        b.proof = _proofFor(routeId, 0);
        b.wire = _wireOf(b.receipt, b.signature, b.proof);
        b.data = abi.encode(b.wire);
        b.businessId = b.wire.businessMessageId;
        _deliverBundle(1, b);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));

        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.CampaignUnavailable.selector, campaignAddr));
        receiver.processMessage(b.businessId);
        assertEq(receiver.pendingCount(), 1, "a pre-deployment report remains retryable");

        routeCampaign = new RemediationCampaign(registry, verifier, routeId, IERC20(address(usdc)));
        assertEq(address(routeCampaign), campaignAddr, "campaign deployed at its committed prediction");
        _fundAndActivate(routeCampaign);
        receiver.processMessage(b.businessId);

        assertEq(uint8(_status(b.businessId)), uint8(PROCESSED));
        assertEq(uint8(_claimStatus(0)), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(routeCampaign.accounting().reserved, GRANT);
        assertTrue(verifier.isConsumed(routeId, b.receipt.receiptId));
    }

    // ================================================================== forged inputs and failure isolation

    function test_aForgedSignatureIsStoredButCanNeverClaimAndNeverBlocksOtherMessages() public {
        Bundle memory good0 = _bundle(0, 0);
        Bundle memory bad = _bundle(1, 0);
        Bundle memory good2 = _bundle(2, 0);
        bad.wire.signature = _signWith(otherKey, routeCampaign, bad.receipt); // not the policy verifier
        _reencode(bad);
        address recovered =
            _recoverSigner(PatchBondTypes.receiptDigest(block.chainid, address(routeCampaign), bad.receipt), bad.wire.signature);
        _deliverBundle(1, good0);
        _deliverBundle(2, bad);
        _deliverBundle(3, good2);

        receiver.processMessage(good0.businessId);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.InvalidSigner.selector, recovered, verifierAddr));
        receiver.processMessage(bad.businessId);
        receiver.processMessage(good2.businessId);

        assertEq(uint8(_status(bad.businessId)), uint8(PENDING), "the failed one stays pending, retryable or droppable");
        assertEq(receiver.pendingCount(), 1);
        assertEq(uint8(_claimStatus(0)), uint8(IRemediationCampaign.ClaimStatus.Pending));
        _assertNoClaim(1);
        assertEq(uint8(_claimStatus(2)), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(routeCampaign.accounting().reserved, 2 * GRANT, "only the two valid receipts reserved a grant");
        assertFalse(verifier.isConsumed(ID_P, bad.receipt.receiptId), "a failed attempt consumes nothing");
        _assertIdentity(routeCampaign);
    }

    function test_aForgedRecipientCannotClaim() public {
        Bundle memory b = _bundle(0, 0);
        b.wire.receipt.recipient = attacker; // not the committed recipient of this deployment
        _rewire(b);
        _deliverBundle(1, b); // structurally valid, so it is stored
        vm.expectRevert(IAcceptanceVerifier.NotEligible.selector);
        receiver.processMessage(b.businessId);
        _assertNoClaim(0);
        assertEq(routeCampaign.accounting().reserved, 0);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    // ================================================================== arbitrary processing order

    function _perm(uint256 seed) internal pure returns (uint256[3] memory p) {
        p = [uint256(0), 1, 2];
        for (uint256 i = 2; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (p[i], p[j]) = (p[j], p[i]);
        }
    }

    function testFuzz_independentMessagesAreOrderInsensitiveInDeliveryAndProcessing(uint256 deliverSeed, uint256 processSeed)
        public
    {
        Bundle[3] memory bs;
        for (uint256 i = 0; i < 3; i++) {
            bs[i] = _bundle(i, 0);
        }
        uint256[3] memory d = _perm(deliverSeed);
        for (uint256 k = 0; k < 3; k++) {
            _deliverBundle(100 + d[k], bs[d[k]]);
        }
        assertEq(receiver.pendingCount(), 3);

        uint256[3] memory q = _perm(processSeed);
        for (uint256 k = 0; k < 3; k++) {
            receiver.processMessage(bs[q[k]].businessId);
            // Only the processed deployments have claims; the others are untouched.
            for (uint256 i = 0; i < 3; i++) {
                bool done = false;
                for (uint256 j = 0; j <= k; j++) {
                    if (q[j] == i) done = true;
                }
                assertEq(
                    uint8(_claimStatus(i)),
                    done ? uint8(IRemediationCampaign.ClaimStatus.Pending) : uint8(IRemediationCampaign.ClaimStatus.None)
                );
            }
        }

        assertEq(receiver.pendingCount(), 0);
        for (uint256 i = 0; i < 3; i++) {
            ClaimState memory s = _state(routeCampaign, depKeys[i]);
            assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
            assertEq(s.recipient, recipients[i]);
            assertEq(s.receiptId, bs[i].receipt.receiptId);
            assertEq(uint8(_status(bs[i].businessId)), uint8(PROCESSED));
        }
        assertEq(routeCampaign.accounting().reserved, 3 * GRANT);
        assertEq(routeCampaign.accounting().unallocated, 0);
        _assertIdentity(routeCampaign);
    }

    // ================================================================== late and expired reports

    function test_aMessageThatExpiresBeforeProcessingCannotClaimAndCanBeDroppedButNeverRevived() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);
        uint64 exp = b.receipt.expiresAt;

        vm.warp(uint256(exp) + 1);
        vm.expectRevert(abi.encodeWithSelector(IAcceptanceVerifier.ReceiptExpired.selector, exp, uint256(exp) + 1));
        receiver.processMessage(b.businessId);
        _assertNoClaim(0);
        assertFalse(verifier.isConsumed(ID_P, b.receipt.receiptId));
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));

        vm.expectEmit(true, false, false, false, address(receiver));
        emit CampaignMessageReceiver.MessageDropped(b.businessId);
        vm.prank(attacker);
        receiver.dropStale(b.businessId);
        assertEq(uint8(_status(b.businessId)), uint8(DROPPED));
        assertEq(receiver.pendingCount(), 0);

        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.MessageNotPending.selector, b.businessId, DROPPED));
        receiver.processMessage(b.businessId);

        // Redelivery of the dropped fact (new transport ID) is an inert no-op; it cannot revive anything.
        _deliverBundle(2, b);
        assertEq(uint8(_status(b.businessId)), uint8(DROPPED));
        assertEq(receiver.pendingCount(), 0);
        _assertNoClaim(0);
        assertEq(routeCampaign.accounting().reserved, 0);
    }

    function test_dropStaleRequiresAnExpiredReceiptOrAPassedClaimDeadline() public {
        Bundle memory b = _bundle(0, 0);
        _deliverBundle(1, b);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.MessageNotStale.selector, b.businessId));
        receiver.dropStale(b.businessId);
        vm.expectRevert(abi.encodeWithSelector(CampaignMessageReceiver.MessageNotPending.selector, bytes32(uint256(1)), NONE));
        receiver.dropStale(bytes32(uint256(1)));

        // A receipt that outlives the claim deadline is still stale once the deadline has passed.
        uint64 d = routeCampaign.policy().claimDeadline;
        vm.warp(uint256(d) - 100);
        Bundle memory c = _bundle(1, 0); // expires at d + 100
        _deliverBundle(2, c);
        vm.warp(d);
        assertTrue(c.receipt.expiresAt > d, "the receipt itself has not expired");
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.ClaimDeadlinePassed.selector, d, uint256(d)));
        receiver.processMessage(c.businessId);
        receiver.dropStale(c.businessId);
        assertEq(uint8(_status(c.businessId)), uint8(DROPPED));
        _assertNoClaim(1);
    }

    // ================================================================== SIMULATION: sender -> router -> receiver -> campaign

    function test_simulation_endToEndAcrossTheTwoSimulatedRouters() public {
        Bundle memory b = _bundle(0, 0);
        vm.deal(reporter, FIXTURE_FEE);
        vm.prank(reporter);
        bytes32 transportId = sender.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);

        // SIMULATION ONLY: the destination router relays what the source router saw, with the source router's
        // caller (the sender contract) as the CCIP source sender. This is not live delivery evidence.
        destinationRouter.deliverLastFrom(sourceRouter, address(receiver));

        assertEq(sourceRouter.lastSendCaller(), address(sender));
        assertEq(receiver.businessIdOfTransport(transportId), b.businessId);
        assertTrue(transportId != b.businessId);
        assertEq(uint8(_status(b.businessId)), uint8(PENDING));
        _assertNoClaim(0);

        receiver.processMessage(b.businessId);
        ClaimState memory s = _state(routeCampaign, depKeys[0]);
        assertEq(uint8(s.status), uint8(IRemediationCampaign.ClaimStatus.Pending));
        assertEq(s.recipient, recipients[0]);
        assertEq(routeCampaign.accounting().reserved, GRANT);
    }

    function test_aMessageFromADifferentSenderContractIsNotTheCommittedSourceRegistry() public {
        // A second, otherwise identical sender at another address cannot feed this receiver, because the campaign
        // policy commits exactly one source registry.
        CampaignMessageSender rogue = new CampaignMessageSender(
            address(sourceRouter), FIXTURE_DESTINATION_SELECTOR, address(receiver), ID_P, routePolicyHash, reporter
        );
        Bundle memory b = _bundle(0, 0);
        vm.deal(reporter, FIXTURE_FEE);
        vm.prank(reporter);
        rogue.send{value: FIXTURE_FEE}(b.receipt, b.signature, b.proof);

        vm.expectRevert(
            abi.encodeWithSelector(CampaignMessageReceiver.UnauthorizedSourceSender.selector, address(rogue), address(sender))
        );
        destinationRouter.deliverLastFrom(sourceRouter, address(receiver));
        _assertNothingStoredOrReserved(b.businessId);
    }

    // ================================================================== no bypass, no custody

    function test_receiverHasNoAdminOrAcceptanceBypassSurface() public {
        string[] memory sigs = new string[](13);
        sigs[0] = "setRouter(address)";
        sigs[1] = "setSourceSender(address)";
        sigs[2] = "setCampaign(address)";
        sigs[3] = "setMaxPending(uint256)";
        sigs[4] = "markAccepted(bytes32)";
        sigs[5] = "acceptClaim(bytes32)";
        sigs[6] = "simulateReceive(bytes32)";
        sigs[7] = "owner()";
        sigs[8] = "transferOwnership(address)";
        sigs[9] = "withdraw(address)";
        sigs[10] = "rescue(address,uint256)";
        sigs[11] = "sweep()";
        sigs[12] = "retryFailedMessage(bytes32,address)";
        _assertAbsent(address(receiver), sigs);

        (bool ok,) = address(receiver).call{value: 1}("");
        assertFalse(ok, "the receiver cannot be funded by a plain transfer");
        assertEq(usdc.balanceOf(address(receiver)), 0, "the receiver never custodies tokens");
    }

    function test_receiverAdvertisesTheCcipReceiverInterfaceAndDoesNotOptIntoFasterThanFinality() public view {
        assertTrue(receiver.supportsInterface(type(IAny2EVMMessageReceiver).interfaceId));
        (address[] memory requiredCCVs, address[] memory optionalCCVs, uint8 threshold, bytes4 allowed) =
            receiver.getCCVsAndFinalityConfig(FIXTURE_SOURCE_SELECTOR, abi.encode(address(sender)));
        assertEq(requiredCCVs.length, 0, "default CCV selection");
        assertEq(optionalCCVs.length, 0);
        assertEq(threshold, 0);
        assertEq(allowed, FinalityCodec.WAIT_FOR_FINALITY_FLAG, "finality is required, never faster-than-finality");
    }
}
