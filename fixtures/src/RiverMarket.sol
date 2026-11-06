// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IOracleAdapter {
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);
    function priceDecimals() external view returns (uint8);
}

/// @notice Artificial quote-only market: 18-decimal collateral in, 18-decimal quote currency out.
/// @dev No collateral custody, borrowing, token transfers or solvency model is claimed.
contract RiverMarket is Ownable {
    address public adapter;
    bool public paused;
    error InvalidAdapter();
    error MarketPaused();
    event AdapterChanged(address indexed adapter);
    event PauseChanged(bool paused);

    constructor(address customer, address adapter_) Ownable(customer) {
        _setAdapter(adapter_);
    }

    function setAdapter(address adapter_) external onlyOwner {
        _setAdapter(adapter_);
    }

    function _setAdapter(address adapter_) internal {
        if (adapter_.code.length == 0) revert InvalidAdapter();
        adapter = adapter_;
        emit AdapterChanged(adapter_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PauseChanged(paused_);
    }

    function quoteCollateral(uint256 amount) external view returns (uint256 value) {
        if (paused) revert MarketPaused();
        (uint256 price,) = IOracleAdapter(adapter).latestPrice();
        return Math.mulDiv(amount, price, 10 ** uint256(IOracleAdapter(adapter).priceDecimals()));
    }
}
