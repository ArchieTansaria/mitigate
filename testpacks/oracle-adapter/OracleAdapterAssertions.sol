// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Read boundary matches packages/schema/src/fixture-abi.ts. Ownership checks are fixture-specific extensions.
interface IFixtureMarket {
    function adapter() external view returns (address);
    function owner() external view returns (address);
    function paused() external view returns (bool);
    function quoteCollateral(uint256 amount) external view returns (uint256 value);
}

interface IFixtureAdapter {
    function priceSource() external view returns (address);
    function maxAge() external view returns (uint256);
    function priceDecimals() external view returns (uint8);
    function configurationOwner() external view returns (address);
}

interface IFixtureSource {
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);
}

/// @notice Reviewed-candidate assertions for this artificial family, not a verifier or grant receipt producer.
/// @dev Missing code, ABI errors and unavailable data revert; no catch-all success or address allowlist.
contract OracleAdapterAssertions {
    error AssertionFailed(bytes32 assertionId);

    function assertConfiguration(address market, address source, uint256 age, uint8 decimals_, address customer)
        external
        view
    {
        IFixtureMarket m = IFixtureMarket(market);
        IFixtureAdapter a = IFixtureAdapter(m.adapter());
        if (
            a.priceSource() != source || a.maxAge() != age || a.priceDecimals() != decimals_
                || a.configurationOwner() != customer || m.owner() != customer || m.paused()
        ) {
            revert AssertionFailed("configuration");
        }
    }

    function assertQuote(address market, uint256 amount, uint256 expectedValue) external view {
        if (amount == 0 || expectedValue == 0 || IFixtureMarket(market).quoteCollateral(amount) != expectedValue) {
            revert AssertionFailed("valid-quote");
        }
    }

    function assertStaleRejected(address market) external view {
        IFixtureAdapter a = IFixtureAdapter(IFixtureMarket(market).adapter());
        (uint256 price, uint256 timestamp) = IFixtureSource(a.priceSource()).latestPrice();
        uint256 age = a.maxAge();
        if (price == 0 || timestamp == 0 || timestamp > block.timestamp || block.timestamp - timestamp <= age) {
            revert AssertionFailed("stale-precondition");
        }
        (bool ok, bytes memory reason) = market.staticcall(abi.encodeCall(IFixtureMarket.quoteCollateral, (1e18)));
        if (
            ok || keccak256(reason) != keccak256(abi.encodeWithSignature("StalePrice(uint256,uint256)", timestamp, age))
        ) {
            revert AssertionFailed("stale-rejected");
        }
    }
}
