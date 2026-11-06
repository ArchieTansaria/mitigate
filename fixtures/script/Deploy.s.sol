// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Script} from "forge-std/Script.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {TestPriceSource} from "../src/TestPriceSource.sol";
import {OracleAdapterV1} from "../src/OracleAdapterV1.sol";
import {OracleAdapterV2} from "../src/OracleAdapterV2.sol";
import {RiverMarket} from "../src/RiverMarket.sol";

/// @notice Local-only deployment recipe; use ../deploy-local.mjs to own an ephemeral Anvil process and export provenance.
contract Deploy is Script {
    function run() external {
        require(block.chainid == 31337, "PB07: local chain only");
        address supplier = vm.envAddress("PB07_SUPPLIER");
        address customer = vm.envAddress("PB07_CUSTOMER");
        uint256 count = vm.envUint("PB07_COUNT");
        uint256 age = vm.envUint("PB07_MAX_AGE");
        uint256 price = vm.envUint("PB07_PRICE");
        uint256 unsafeDecimals = vm.envUint("PB07_UNSAFE_DECIMALS");
        require(supplier != address(0) && customer != address(0) && supplier != customer, "PB07: distinct roles");
        require(count >= 3 && count <= 12 && age > 0 && price > 0, "PB07: invalid parameters");
        require(unsafeDecimals <= 18 && unsafeDecimals != 8, "PB07: unsafe decimals must differ");
        address[] memory sources = new address[](count);
        address[] memory proxies = new address[](count);
        address[] memory markets = new address[](count);
        vm.startBroadcast(supplier); // Unlocked accounts on the wrapper's child Anvil; no signing key is read.
        OracleAdapterV1 v1 = new OracleAdapterV1();
        OracleAdapterV2 v2 = new OracleAdapterV2();
        for (uint256 i; i < count; ++i) {
            sources[i] = address(new TestPriceSource(supplier, price, block.timestamp));
            proxies[i] = address(
                new TransparentUpgradeableProxy(
                    i % 3 == 0 ? address(v1) : address(v2),
                    supplier,
                    abi.encodeCall(
                        OracleAdapterV1.initialize, (customer, sources[i], age, uint8(i % 3 == 2 ? unsafeDecimals : 8))
                    )
                )
            );
            markets[i] = address(new RiverMarket(customer, proxies[i]));
        }
        vm.stopBroadcast();
        // This is only a simulation address map. The wrapper must confirm every address against mined receipts/RPC.
        vm.serializeAddress("deployment", "v1", address(v1));
        vm.serializeAddress("deployment", "v2", address(v2));
        vm.serializeAddress("deployment", "sources", sources);
        vm.serializeAddress("deployment", "proxies", proxies);
        string memory json = vm.serializeAddress("deployment", "markets", markets);
        vm.writeJson(json, vm.envString("PB07_ADDRESS_MAP"));
    }
}
