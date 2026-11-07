// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeploySepolia} from "../script/DeploySepolia.s.sol";

contract DeploySepoliaGuardTest is Test {
    function test_deploymentRevertsBeforeReadingConfigOnNonSepoliaChain() external {
        vm.chainId(31_337);
        DeploySepolia script = new DeploySepolia();
        vm.expectRevert(bytes("PB07: Sepolia only"));
        script.run();
    }
}
