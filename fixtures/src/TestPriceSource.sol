// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Artificial, owner-controlled source. Accepts invalid data intentionally for regression interventions.
/// @dev It is not a production oracle or an attestation of price correctness.
contract TestPriceSource is Ownable {
    uint256 private storedPrice;
    uint256 private storedTimestamp;

    constructor(address operator, uint256 initialPrice, uint256 timestamp) Ownable(operator) {
        storedPrice = initialPrice;
        storedTimestamp = timestamp;
    }

    function setPrice(uint256 value, uint256 timestamp) external onlyOwner {
        storedPrice = value;
        storedTimestamp = timestamp;
    }

    function latestPrice() external view returns (uint256 price, uint256 updatedAt) {
        return (storedPrice, storedTimestamp);
    }
}
