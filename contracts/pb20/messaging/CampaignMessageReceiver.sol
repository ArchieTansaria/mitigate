// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {ICampaignRegistry} from "../../pb15/ICampaignRegistry.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";

/// @title CampaignMessageReceiver
/// @notice Authenticates CCIP acceptance reports, queues them, then submits through the campaign's PB-16 verifier.
/// @dev The CCIP callback only stores bounded data. A later permissionless call invokes the campaign. Failed claims
/// remain retryable; neither transport delivery nor this receiver can mark a campaign claim accepted.
contract CampaignMessageReceiver is CCIPReceiver {
    uint16 public constant SCHEMA_VERSION = 1;
    uint8 public constant ACCEPTED_OUTCOME = 1;

    enum MessageStatus { None, Pending, Processed, Dropped }

    struct WireMessageV1 {
        uint16 schemaVersion;
        uint8 outcome;
        bytes32 businessMessageId;
        PatchBondTypes.AcceptanceReceipt receipt;
        bytes signature;
        bytes32[] eligibilityProof;
    }

    struct StoredMessage {
        MessageStatus status;
        bytes32 contentHash;
        PatchBondTypes.AcceptanceReceipt receipt;
        bytes signature;
        bytes32[] eligibilityProof;
    }

    uint64 public immutable sourceChainSelector;
    address public immutable sourceSender;
    uint256 public immutable sourceChainId;
    address public immutable campaign;
    bytes32 public immutable campaignId;
    bytes32 public immutable policyHash;
    address public immutable registry;
    uint64 public immutable claimDeadline;
    uint256 public immutable maxPending;
    uint256 public immutable maxPayloadBytes;
    uint256 public immutable maxProofLength;

    uint256 public pendingCount;
    mapping(bytes32 businessMessageId => StoredMessage) private _messages;
    mapping(bytes32 transportMessageId => bytes32 businessMessageId) public businessIdOfTransport;
    mapping(bytes32 transportMessageId => bytes32 contentHash) private _transportContentHash;

    event MessageReceived(bytes32 indexed transportMessageId, bytes32 indexed businessMessageId, bytes32 indexed deploymentKey);
    event DuplicateIgnored(bytes32 indexed transportMessageId, bytes32 indexed businessMessageId);
    event MessageProcessed(bytes32 indexed businessMessageId, bytes32 indexed deploymentKey, address recipient);
    event MessageDropped(bytes32 indexed businessMessageId);

    error InvalidSourceChainSelector();
    error InvalidSourceSender();
    error InvalidSourceChainId();
    error InvalidCampaign();
    error InvalidRegistry();
    error InvalidCampaignId();
    error InvalidPolicyHash();
    error InvalidLimit();
    error CampaignUnavailable(address campaign);
    error SourceSenderMismatch(address given, address expected);
    error SourceChainMismatch(uint256 given, uint256 expected);
    error CampaignAddressMismatch(address given, address expected);
    error CampaignIdMismatch(bytes32 given, bytes32 expected);
    error PolicyHashMismatch(bytes32 given, bytes32 expected);
    error UnexpectedSourceSelector(uint64 given, uint64 expected);
    error UnauthorizedSourceSender(address given, address expected);
    error InvalidSenderEncoding();
    error TokensNotAllowed(uint256 count);
    error PayloadTooLarge(uint256 given, uint256 max);
    error ProofTooLong(uint256 given, uint256 max);
    error UnsupportedSchemaVersion(uint16 given);
    error InvalidOutcome(uint8 given);
    error BusinessMessageIdMismatch(bytes32 given, bytes32 expected);
    error InvalidReceiptScope(uint8 purpose, uint8 mode, uint8 result);
    error ReportExpired(uint64 expiresAt, uint256 nowTs);
    error ClaimWindowClosed(uint64 deadline, uint256 nowTs);
    error PendingQueueFull(uint256 max);
    error TransportMessageConflict(bytes32 transportMessageId);
    error BusinessMessageConflict(bytes32 businessMessageId);
    error MessageNotPending(bytes32 businessMessageId, MessageStatus status);
    error MessageNotStale(bytes32 businessMessageId);

    constructor(
        address router_,
        uint64 sourceChainSelector_,
        address sourceSender_,
        uint256 sourceChainId_,
        address campaign_,
        bytes32 campaignId_,
        bytes32 policyHash_,
        address registry_,
        uint256 maxPending_,
        uint256 maxPayloadBytes_,
        uint256 maxProofLength_
    ) CCIPReceiver(router_) {
        if (sourceChainSelector_ == 0) revert InvalidSourceChainSelector();
        if (sourceSender_ == address(0)) revert InvalidSourceSender();
        if (sourceChainId_ == 0) revert InvalidSourceChainId();
        if (campaign_ == address(0)) revert InvalidCampaign();
        if (campaignId_ == bytes32(0)) revert InvalidCampaignId();
        if (policyHash_ == bytes32(0)) revert InvalidPolicyHash();
        if (registry_.code.length == 0) revert InvalidRegistry();
        if (maxPending_ == 0 || maxPayloadBytes_ == 0 || maxProofLength_ == 0) revert InvalidLimit();

        ICampaignRegistry r = ICampaignRegistry(registry_);
        if (!r.campaignExists(campaignId_)) revert InvalidCampaignId();
        PatchBondTypes.Policy memory p = r.policyOf(campaignId_);
        if (p.sourceRegistry != sourceSender_) revert SourceSenderMismatch(sourceSender_, p.sourceRegistry);
        if (p.sourceChainId != sourceChainId_) revert SourceChainMismatch(sourceChainId_, p.sourceChainId);
        if (p.campaign != campaign_) revert CampaignAddressMismatch(p.campaign, campaign_);
        if (p.campaignId != campaignId_) revert CampaignIdMismatch(campaignId_, p.campaignId);
        bytes32 registeredHash = r.policyHashOf(campaignId_);
        bytes32 computedHash = PatchBondTypes.policyHash(p);
        if (computedHash != registeredHash) revert PolicyHashMismatch(policyHash_, registeredHash);
        if (policyHash_ != registeredHash) revert PolicyHashMismatch(policyHash_, registeredHash);

        sourceChainSelector = sourceChainSelector_;
        sourceSender = sourceSender_;
        sourceChainId = sourceChainId_;
        campaign = campaign_;
        campaignId = campaignId_;
        policyHash = policyHash_;
        registry = registry_;
        claimDeadline = p.claimDeadline;
        maxPending = maxPending_;
        maxPayloadBytes = maxPayloadBytes_;
        maxProofLength = maxProofLength_;
    }

    function messageStatus(bytes32 businessMessageId) external view returns (MessageStatus) {
        return _messages[businessMessageId].status;
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        if (message.sourceChainSelector != sourceChainSelector) {
            revert UnexpectedSourceSelector(message.sourceChainSelector, sourceChainSelector);
        }
        if (message.sender.length != 32) revert InvalidSenderEncoding();
        address authenticatedSender = abi.decode(message.sender, (address));
        if (authenticatedSender != sourceSender) revert UnauthorizedSourceSender(authenticatedSender, sourceSender);
        if (message.destTokenAmounts.length != 0) revert TokensNotAllowed(message.destTokenAmounts.length);
        if (message.data.length > maxPayloadBytes) revert PayloadTooLarge(message.data.length, maxPayloadBytes);

        WireMessageV1 memory wire = abi.decode(message.data, (WireMessageV1));
        if (wire.schemaVersion != SCHEMA_VERSION) revert UnsupportedSchemaVersion(wire.schemaVersion);
        if (wire.outcome != ACCEPTED_OUTCOME) revert InvalidOutcome(wire.outcome);
        if (wire.eligibilityProof.length > maxProofLength) revert ProofTooLong(wire.eligibilityProof.length, maxProofLength);
        PatchBondTypes.AcceptanceReceipt memory r = wire.receipt;
        if (r.campaignId != campaignId) revert CampaignIdMismatch(r.campaignId, campaignId);
        if (r.campaignPolicyHash != policyHash) revert PolicyHashMismatch(r.campaignPolicyHash, policyHash);
        if (r.sourceChainId != sourceChainId) revert SourceChainMismatch(r.sourceChainId, sourceChainId);
        if (r.purpose != 1 || r.mode != 1 || r.result != ACCEPTED_OUTCOME) {
            revert InvalidReceiptScope(r.purpose, r.mode, r.result);
        }
        if (wire.businessMessageId != _businessId(r)) {
            revert BusinessMessageIdMismatch(wire.businessMessageId, _businessId(r));
        }
        bytes32 contentHash = keccak256(message.data);
        bytes32 priorTransportHash = _transportContentHash[message.messageId];
        if (priorTransportHash != bytes32(0)) {
            if (priorTransportHash != contentHash) revert TransportMessageConflict(message.messageId);
            emit DuplicateIgnored(message.messageId, wire.businessMessageId);
            return;
        }
        _transportContentHash[message.messageId] = contentHash;
        businessIdOfTransport[message.messageId] = wire.businessMessageId;

        StoredMessage storage stored = _messages[wire.businessMessageId];
        if (stored.status != MessageStatus.None) {
            if (stored.contentHash != contentHash) revert BusinessMessageConflict(wire.businessMessageId);
            emit DuplicateIgnored(message.messageId, wire.businessMessageId);
            return;
        }
        if (block.timestamp > r.expiresAt) revert ReportExpired(r.expiresAt, block.timestamp);
        if (block.timestamp >= claimDeadline) revert ClaimWindowClosed(claimDeadline, block.timestamp);
        if (pendingCount >= maxPending) revert PendingQueueFull(maxPending);

        stored.status = MessageStatus.Pending;
        stored.contentHash = contentHash;
        stored.receipt = r;
        stored.signature = wire.signature;
        stored.eligibilityProof = wire.eligibilityProof;
        pendingCount += 1;
        emit MessageReceived(message.messageId, wire.businessMessageId, r.deploymentKey);
    }

    function processMessage(bytes32 businessMessageId) external {
        StoredMessage storage stored = _messages[businessMessageId];
        if (stored.status != MessageStatus.Pending) revert MessageNotPending(businessMessageId, stored.status);
        if (campaign.code.length == 0) revert CampaignUnavailable(campaign);
        // The campaign performs the authoritative PB-16 signature and eligibility checks. Any revert preserves
        // Pending status and the queue slot, so delivery can be retried after transient readiness/funding issues.
        IRemediationCampaign(campaign).submitClaim(stored.receipt, stored.signature, stored.eligibilityProof);
        stored.status = MessageStatus.Processed;
        pendingCount -= 1;
        emit MessageProcessed(businessMessageId, stored.receipt.deploymentKey, stored.receipt.recipient);
    }

    function dropStale(bytes32 businessMessageId) external {
        StoredMessage storage stored = _messages[businessMessageId];
        if (stored.status != MessageStatus.Pending) revert MessageNotPending(businessMessageId, stored.status);
        if (block.timestamp <= stored.receipt.expiresAt && block.timestamp < claimDeadline) {
            revert MessageNotStale(businessMessageId);
        }
        stored.status = MessageStatus.Dropped;
        pendingCount -= 1;
        emit MessageDropped(businessMessageId);
    }

    function _businessId(PatchBondTypes.AcceptanceReceipt memory receipt) private pure returns (bytes32) {
        return keccak256(abi.encode(receipt.campaignId, receipt.deploymentKey, receipt.receiptId));
    }
}
