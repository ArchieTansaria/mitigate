// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ExtraArgsCodec} from "@chainlink/contracts-ccip/contracts/libraries/ExtraArgsCodec.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";

/// @title CampaignMessageSender
/// @notice Sends a verifier-signed passing campaign receipt to one fixed destination over CCIP.
/// @dev The source campaign policy must commit this contract as `sourceRegistry`. Only the configured backend
/// reporter can send; this contract holds no fees and cannot select a route at call time.
contract CampaignMessageSender {
    uint16 public constant SCHEMA_VERSION = 1;
    uint8 public constant ACCEPTED_OUTCOME = 1;
    uint32 public constant CALLBACK_GAS_LIMIT = 500_000;

    struct WireMessageV1 {
        uint16 schemaVersion;
        uint8 outcome;
        bytes32 businessMessageId;
        PatchBondTypes.AcceptanceReceipt receipt;
        bytes signature;
        bytes32[] eligibilityProof;
    }

    address public immutable router;
    uint64 public immutable destinationChainSelector;
    address public immutable destinationReceiver;
    bytes32 public immutable destinationCampaignId;
    bytes32 public immutable destinationPolicyHash;
    address public immutable reporter;

    event AcceptanceSent(
        bytes32 indexed transportMessageId,
        bytes32 indexed businessMessageId,
        bytes32 indexed campaignId,
        uint256 fee
    );

    error InvalidRouter(address router);
    error InvalidDestinationChainSelector();
    error InvalidDestinationReceiver();
    error InvalidCampaignId();
    error InvalidPolicyHash();
    error InvalidReporter();
    error UnsupportedDestinationChain(uint64 selector);
    error NotReporter(address caller, address reporter);
    error CampaignIdMismatch(bytes32 given, bytes32 expected);
    error PolicyHashMismatch(bytes32 given, bytes32 expected);
    error ReceiptNotAccepted(uint8 purpose, uint8 mode, uint8 result);
    error IncorrectFee(uint256 given, uint256 expected);

    constructor(
        address router_,
        uint64 destinationChainSelector_,
        address destinationReceiver_,
        bytes32 destinationCampaignId_,
        bytes32 destinationPolicyHash_,
        address reporter_
    ) {
        if (router_.code.length == 0) revert InvalidRouter(router_);
        if (destinationChainSelector_ == 0) revert InvalidDestinationChainSelector();
        if (destinationReceiver_ == address(0)) revert InvalidDestinationReceiver();
        if (destinationCampaignId_ == bytes32(0)) revert InvalidCampaignId();
        if (destinationPolicyHash_ == bytes32(0)) revert InvalidPolicyHash();
        if (reporter_ == address(0)) revert InvalidReporter();
        if (!IRouterClient(router_).isChainSupported(destinationChainSelector_)) {
            revert UnsupportedDestinationChain(destinationChainSelector_);
        }
        router = router_;
        destinationChainSelector = destinationChainSelector_;
        destinationReceiver = destinationReceiver_;
        destinationCampaignId = destinationCampaignId_;
        destinationPolicyHash = destinationPolicyHash_;
        reporter = reporter_;
    }

    function quote(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata eligibilityProof
    ) external view returns (uint256) {
        _validateReceipt(receipt);
        return IRouterClient(router).getFee(destinationChainSelector, _message(receipt, signature, eligibilityProof));
    }

    function send(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata eligibilityProof
    ) external payable returns (bytes32 transportMessageId) {
        if (msg.sender != reporter) revert NotReporter(msg.sender, reporter);
        _validateReceipt(receipt);
        Client.EVM2AnyMessage memory message = _message(receipt, signature, eligibilityProof);
        uint256 fee = IRouterClient(router).getFee(destinationChainSelector, message);
        if (msg.value != fee) revert IncorrectFee(msg.value, fee);
        transportMessageId = IRouterClient(router).ccipSend{value: fee}(destinationChainSelector, message);
        emit AcceptanceSent(transportMessageId, _businessId(receipt), receipt.campaignId, fee);
    }

    function _validateReceipt(PatchBondTypes.AcceptanceReceipt calldata receipt) private view {
        if (receipt.campaignId != destinationCampaignId) {
            revert CampaignIdMismatch(receipt.campaignId, destinationCampaignId);
        }
        if (receipt.campaignPolicyHash != destinationPolicyHash) {
            revert PolicyHashMismatch(receipt.campaignPolicyHash, destinationPolicyHash);
        }
        if (receipt.purpose != 1 || receipt.mode != 1 || receipt.result != ACCEPTED_OUTCOME) {
            revert ReceiptNotAccepted(receipt.purpose, receipt.mode, receipt.result);
        }
    }

    function _message(
        PatchBondTypes.AcceptanceReceipt calldata receipt,
        bytes calldata signature,
        bytes32[] calldata eligibilityProof
    ) private view returns (Client.EVM2AnyMessage memory) {
        WireMessageV1 memory wire = WireMessageV1({
            schemaVersion: SCHEMA_VERSION,
            outcome: ACCEPTED_OUTCOME,
            businessMessageId: _businessId(receipt),
            receipt: receipt,
            signature: signature,
            eligibilityProof: eligibilityProof
        });
        return Client.EVM2AnyMessage({
            receiver: abi.encode(destinationReceiver),
            data: abi.encode(wire),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: ExtraArgsCodec._getBasicEncodedExtraArgsV3(CALLBACK_GAS_LIMIT, bytes4(0))
        });
    }

    function _businessId(PatchBondTypes.AcceptanceReceipt calldata receipt) private pure returns (bytes32) {
        return keccak256(abi.encode(receipt.campaignId, receipt.deploymentKey, receipt.receiptId));
    }
}
