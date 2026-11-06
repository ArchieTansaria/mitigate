// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IAny2EVMMessageReceiver} from "@chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/// @title SimulationRouter
/// @notice SIMULATION ONLY. A test double for a CCIP router (`@chainlink/contracts-ccip` 2.0.0 `IRouterClient`
/// surface). It is NOT a Chainlink router, performs no verification, and proves nothing about live delivery. Every
/// PB-20 test that uses it is a simulation; live evidence needs a real source transaction, a real CCIP message ID,
/// a real receiver transaction and a destination state read (see the PB-20 task card).
///
/// One instance plays the source router (records what `ccipSend` was given) and another plays the destination router
/// (calls `ccipReceive` on a receiver as the router). The two roles never share an address in the tests, so a
/// production contract cannot accidentally be wired to "the other side".
contract SimulationRouter is IRouterClient {
    string public constant LABEL = "SIMULATION ONLY: not a Chainlink CCIP router";
    bool public constant SIMULATION_ONLY = true;

    /// @dev The source-chain selector this router presents to receivers when it delivers (destination-router role).
    uint64 public immutable simulatedSourceSelector;

    /// @dev Fixture fee, in native wei. `ccipSend` demands exactly this value.
    uint256 public fee;
    uint256 public sendCount;

    // What the last `ccipSend` saw (source-router role).
    uint64 public lastSendSelector;
    bytes public lastSendReceiver;
    bytes public lastSendData;
    bytes public lastSendExtraArgs;
    address public lastSendFeeToken;
    uint256 public lastSendTokenCount;
    uint256 public lastSendValue;
    address public lastSendCaller;
    bytes32 public lastSendMessageId;

    constructor(uint64 simulatedSourceSelector_) {
        simulatedSourceSelector = simulatedSourceSelector_;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    /// @notice The ID the next `ccipSend` will return (lets tests assert events before the send happens).
    function nextMessageId() external view returns (bytes32) {
        return keccak256(abi.encode("FIXTURE SIMULATED CCIP MESSAGE", address(this), sendCount + 1));
    }

    // ------------------------------------------------------------------ IRouterClient (source-router role)

    function isChainSupported(uint64) external pure returns (bool) {
        return true;
    }

    function getFee(uint64, Client.EVM2AnyMessage memory) external view returns (uint256) {
        return fee;
    }

    function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32 messageId)
    {
        if (message.feeToken != address(0)) revert InsufficientFeeTokenAmount();
        if (msg.value != fee) revert InvalidMsgValue();

        sendCount += 1;
        messageId = keccak256(abi.encode("FIXTURE SIMULATED CCIP MESSAGE", address(this), sendCount));

        lastSendSelector = destinationChainSelector;
        lastSendReceiver = message.receiver;
        lastSendData = message.data;
        lastSendExtraArgs = message.extraArgs;
        lastSendFeeToken = message.feeToken;
        lastSendTokenCount = message.tokenAmounts.length;
        lastSendValue = msg.value;
        lastSendCaller = msg.sender;
        lastSendMessageId = messageId;
    }

    // ------------------------------------------------------------------ delivery (destination-router role)

    /// @notice Deliver an authenticated-looking message: this router's simulated source selector, the given source
    /// sender (ABI-encoded as an address, exactly as a real EVM source presents it), no tokens.
    function deliver(address receiver, bytes32 messageId, address sourceSender, bytes calldata data) external {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: simulatedSourceSelector,
            sender: abi.encode(sourceSender),
            data: data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        IAny2EVMMessageReceiver(receiver).ccipReceive(m);
    }

    /// @notice Deliver an arbitrary message as this router (for wrong selector, malformed sender or token cases).
    function deliverCustom(address receiver, Client.Any2EVMMessage memory m) external {
        IAny2EVMMessageReceiver(receiver).ccipReceive(m);
    }

    /// @notice Relay what a SOURCE simulation router last received, to `receiver`, the way a real lane would:
    /// source selector = this router's simulated selector, sender = the contract that called the source `ccipSend`.
    function deliverLastFrom(SimulationRouter source, address receiver) external {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: source.lastSendMessageId(),
            sourceChainSelector: simulatedSourceSelector,
            sender: abi.encode(source.lastSendCaller()),
            data: source.lastSendData(),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        IAny2EVMMessageReceiver(receiver).ccipReceive(m);
    }
}
