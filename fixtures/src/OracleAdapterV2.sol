// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {OracleAdapterV1} from "./OracleAdapterV1.sol";

/// @notice Artificial repair. Same storage layout and customer settings as V1; no reinitialization.
contract OracleAdapterV2 is OracleAdapterV1 {
    error StalePrice(uint256 updatedAt, uint256 maxAge);

    function latestPrice() public view override returns (uint256 price, uint256 updatedAt) {
        (price, updatedAt) = super.latestPrice();
        if (block.timestamp - updatedAt > maxAge) revert StalePrice(updatedAt, maxAge);
    }
}
