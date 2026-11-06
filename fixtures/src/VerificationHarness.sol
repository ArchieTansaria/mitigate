// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {OracleAdapterAssertions} from "oracle-testpack/OracleAdapterAssertions.sol";
/// @notice Offline-only helper. Catches assertion failures without classifying arbitrary reverts as success.
contract VerificationHarness is OracleAdapterAssertions {
    function context() external view returns (uint256 timestamp, uint256 chainId) { return (block.timestamp, block.chainid); }
    function evaluate(bytes calldata assertion) external view returns (bool success, bytes memory result) {
        return address(this).staticcall(assertion);
    }
    function observe(address target, bytes calldata data) external view returns (bool success, bytes memory result) {
        return target.staticcall(data);
    }
}
