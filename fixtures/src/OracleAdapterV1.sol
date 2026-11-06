// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

interface IPriceSource {
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);
}

/// @notice Artificial baseline: deliberately accepts stale prices. Never use in production.
/// @dev Customer configuration ownership is separate from the supplier-owned OZ ProxyAdmin.
contract OracleAdapterV1 is Initializable {
    address public configurationOwner;
    address public priceSource;
    uint256 public maxAge;
    uint8 public priceDecimals;

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidPrice();
    error InvalidTimestamp();
    event Configured(address indexed priceSource, uint256 maxAge, uint8 priceDecimals);

    constructor() {
        _disableInitializers();
    }

    function initialize(address customer, address source, uint256 age, uint8 decimals_) external initializer {
        if (customer == address(0)) revert InvalidConfiguration();
        configurationOwner = customer;
        _configure(source, age, decimals_);
    }

    function configure(address source, uint256 age, uint8 decimals_) external {
        if (msg.sender != configurationOwner) revert Unauthorized();
        _configure(source, age, decimals_);
    }

    function _configure(address source, uint256 age, uint8 decimals_) internal {
        // Structurally valid settings can still violate the agreed policy (e.g. 6 instead of 8 decimals).
        if (source.code.length == 0 || age == 0 || decimals_ > 18) revert InvalidConfiguration();
        priceSource = source;
        maxAge = age;
        priceDecimals = decimals_;
        emit Configured(source, age, decimals_);
    }

    function latestPrice() public view virtual returns (uint256 price, uint256 updatedAt) {
        (price, updatedAt) = IPriceSource(priceSource).latestPrice();
        if (price == 0) revert InvalidPrice();
        if (updatedAt == 0 || updatedAt > block.timestamp) revert InvalidTimestamp();
        // Known defect: maxAge is stored but not enforced.
    }
}
