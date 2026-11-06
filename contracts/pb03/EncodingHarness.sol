// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "./PatchBondTypes.sol";

/// @title EncodingHarness
/// @notice Stateless, callable wrapper over PatchBondTypes so off-chain code and tests can compute
/// the exact on-chain hashes. No storage, no admin, no funds, no external calls, no acceptance logic.
/// @dev Hashing only. This contract does not validate semantic input (zero addresses, enum ranges,
/// expiry, policy consistency). Consuming contracts and TypeScript validation own those checks.
/// Not intended for deployment in PB-03; used by Foundry tests and for ABI generation.
contract EncodingHarness {
    /// @notice EIP-712 typehash for AcceptanceReceipt.
    function receiptTypehash() external pure returns (bytes32) {
        return PatchBondTypes.RECEIPT_TYPEHASH;
    }

    /// @notice keccak256(abi.encode(policy)).
    function policyHash(PatchBondTypes.Policy memory policy) external pure returns (bytes32) {
        return PatchBondTypes.policyHash(policy);
    }

    /// @notice keccak256(abi.encode(snapshot)).
    function snapshotHash(PatchBondTypes.Snapshot memory snapshot) external pure returns (bytes32) {
        return PatchBondTypes.snapshotHash(snapshot);
    }

    /// @notice keccak256(abi.encode(sourceChainId, entrypoint, marketSelector)).
    function deploymentKey(uint256 sourceChainId, address entrypoint, bytes32 marketSelector)
        external
        pure
        returns (bytes32)
    {
        return PatchBondTypes.deploymentKey(sourceChainId, entrypoint, marketSelector);
    }

    /// @notice keccak256(bytes.concat(keccak256(abi.encode(campaignId, sourceChainId, deploymentKey, recipient)))).
    function eligibilityLeaf(bytes32 campaignId, uint256 sourceChainId, bytes32 deploymentKey_, address recipient)
        external
        pure
        returns (bytes32)
    {
        return PatchBondTypes.eligibilityLeaf(campaignId, sourceChainId, deploymentKey_, recipient);
    }

    /// @notice EIP-712 domain separator for (destinationChainId, campaign).
    function domainSeparator(uint256 destinationChainId, address campaign) external pure returns (bytes32) {
        return PatchBondTypes.domainSeparator(destinationChainId, campaign);
    }

    /// @notice keccak256(abi.encode(RECEIPT_TYPEHASH, receipt)).
    function receiptStructHash(PatchBondTypes.AcceptanceReceipt memory receipt) external pure returns (bytes32) {
        return PatchBondTypes.receiptStructHash(receipt);
    }

    /// @notice keccak256(0x1901 || domainSeparator(chainId, campaign) || receiptStructHash(receipt)).
    /// @param chainId The destination chain id (the chain where the campaign lives).
    /// @param campaign The campaign contract on the destination chain (EIP-712 verifyingContract).
    function receiptDigest(uint256 chainId, address campaign, PatchBondTypes.AcceptanceReceipt memory receipt)
        external
        pure
        returns (bytes32)
    {
        return PatchBondTypes.receiptDigest(chainId, campaign, receipt);
    }
}
