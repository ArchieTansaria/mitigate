// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {TestPriceSource} from "../src/TestPriceSource.sol";
import {OracleAdapterV1} from "../src/OracleAdapterV1.sol";
import {OracleAdapterV2} from "../src/OracleAdapterV2.sol";
import {RiverMarket} from "../src/RiverMarket.sol";

/// @notice Separate Sepolia deployment path for the artificial PB-07 oracle-proxy demo.
/// @dev Never use this fixture as an oracle or production market. It contains deliberately unsafe scenarios.
///      The script uses only public role/configuration inputs; Foundry's selected wallet/account handles signing.
contract DeploySepolia is Script {
    uint256 private constant SEPOLIA_CHAIN_ID = 11_155_111;
    uint256 private constant DEFAULT_MAX_AGE = 1_800;
    uint256 private constant DEFAULT_PRICE_8_DECIMALS = 150_000_000_000; // $1,500.00000000
    uint8 private constant UNSAFE_PRICE_DECIMALS = 6;

    function run() external {
        require(block.chainid == SEPOLIA_CHAIN_ID, "PB07: Sepolia only");

        address supplier = vm.envAddress("PB07_SEPOLIA_SUPPLIER");
        address customer = vm.envAddress("PB07_SEPOLIA_CUSTOMER");
        require(supplier != address(0) && customer != address(0), "PB07: zero role");
        require(supplier != customer, "PB07: roles must differ");

        uint256 price = vm.envOr("PB07_SEPOLIA_PRICE", DEFAULT_PRICE_8_DECIMALS);
        uint256 maxAge = vm.envOr("PB07_SEPOLIA_MAX_AGE", DEFAULT_MAX_AGE);
        require(price > 0 && maxAge > 0, "PB07: invalid configuration");

        vm.startBroadcast(supplier);

        OracleAdapterV1 v1 = new OracleAdapterV1();
        OracleAdapterV2 v2 = new OracleAdapterV2();
        emit DeploymentArtifact("implementation-v1", address(v1));
        emit DeploymentArtifact("implementation-v2", address(v2));

        _deployScenario("old-v1", address(v1), supplier, customer, price, maxAge, 8);
        _deployScenario("repaired-v2", address(v2), supplier, customer, price, maxAge, 8);
        _deployScenario("unsafe-decimals-v2", address(v2), supplier, customer, price, maxAge, UNSAFE_PRICE_DECIMALS);

        vm.stopBroadcast();
    }

    event DeploymentArtifact(string indexed name, address indexed deployedAddress);

    function _deployScenario(
        string memory label,
        address implementation,
        address supplier,
        address customer,
        uint256 price,
        uint256 maxAge,
        uint8 decimals_
    ) private {
        TestPriceSource source = new TestPriceSource(supplier, price, block.timestamp);
        OracleAdapterV1 adapter = OracleAdapterV1(
            address(
                new TransparentUpgradeableProxy(
                    implementation,
                    supplier,
                    abi.encodeCall(OracleAdapterV1.initialize, (customer, address(source), maxAge, decimals_))
                )
            )
        );
        RiverMarket market = new RiverMarket(customer, address(adapter));

        emit DeploymentArtifact(string.concat(label, "-source"), address(source));
        emit DeploymentArtifact(string.concat(label, "-proxy"), address(adapter));
        emit DeploymentArtifact(string.concat(label, "-market"), address(market));
    }
}
