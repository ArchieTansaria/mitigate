// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    TransparentUpgradeableProxy,
    ITransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {TestPriceSource} from "../src/TestPriceSource.sol";
import {OracleAdapterV1} from "../src/OracleAdapterV1.sol";
import {OracleAdapterV2} from "../src/OracleAdapterV2.sol";
import {RiverMarket} from "../src/RiverMarket.sol";
import {OracleAdapterAssertions} from "oracle-testpack/OracleAdapterAssertions.sol";

contract FixtureBehaviorTest is Test {
    address internal supplier = makeAddr("supplier");
    address internal customer = makeAddr("customer");
    address internal outsider = makeAddr("outsider");
    bytes32 internal constant ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);
    TestPriceSource internal source;
    OracleAdapterV1 internal v1;
    OracleAdapterV2 internal v2;
    OracleAdapterV1 internal adapter;
    RiverMarket internal market;
    TransparentUpgradeableProxy internal proxy;
    ProxyAdmin internal admin;
    OracleAdapterAssertions internal checks;

    function setUp() public {
        vm.warp(1_000_000);
        source = new TestPriceSource(supplier, 2_000e8, block.timestamp);
        v1 = new OracleAdapterV1();
        v2 = new OracleAdapterV2();
        proxy = new TransparentUpgradeableProxy(address(v1), supplier, initData(customer, address(source), 3600, 8));
        adapter = OracleAdapterV1(address(proxy));
        market = new RiverMarket(customer, address(proxy));
        admin = ProxyAdmin(address(uint160(uint256(vm.load(address(proxy), ADMIN_SLOT)))));
        checks = new OracleAdapterAssertions();
    }

    function initData(address owner, address feed, uint256 age, uint8 decimals_) internal pure returns (bytes memory) {
        return abi.encodeCall(OracleAdapterV1.initialize, (owner, feed, age, decimals_));
    }

    function upgrade() internal {
        vm.prank(supplier);
        admin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(v2), "");
    }

    function setPrice(uint256 price, uint256 timestamp) internal {
        vm.prank(supplier);
        source.setPrice(price, timestamp);
    }

    function testV1DeliberatelyAcceptsStalePrice() public {
        setPrice(2_000e8, block.timestamp - 3601);
        assertEq(market.quoteCollateral(3e18), 6_000e18);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("stale-rejected"))
        );
        checks.assertStaleRejected(address(market));
    }

    function testV2RejectsStalePriceWithExactReason() public {
        upgrade();
        setPrice(2_000e8, block.timestamp - 3601);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapterV2.StalePrice.selector, block.timestamp - 3601, 3600));
        market.quoteCollateral(3e18);
        checks.assertStaleRejected(address(market));
    }

    function testRepairPreservesStateAndLegitimateOperation() public {
        upgrade();
        assertEq(adapter.configurationOwner(), customer);
        assertEq(adapter.priceSource(), address(source));
        assertEq(adapter.maxAge(), 3600);
        assertEq(adapter.priceDecimals(), 8);
        assertEq(market.adapter(), address(proxy));
        assertEq(market.owner(), customer);
        checks.assertConfiguration(address(market), address(source), 3600, 8, customer);
        checks.assertQuote(address(market), 3e18, 6_000e18);
        setPrice(1_500e8, block.timestamp);
        checks.assertQuote(address(market), 2e18, 3_000e18);
    }

    function testAgeBoundaryInclusiveThenRejectsNextSecond() public {
        upgrade();
        vm.warp(block.timestamp + 3600);
        assertEq(market.quoteCollateral(1e18), 2_000e18);
        vm.warp(block.timestamp + 1);
        checks.assertStaleRejected(address(market));
    }

    function testZeroPriceZeroTimestampAndFutureTimestampRejected() public {
        upgrade();
        setPrice(0, block.timestamp);
        vm.expectRevert(OracleAdapterV1.InvalidPrice.selector);
        market.quoteCollateral(1e18);
        setPrice(2_000e8, 0);
        vm.expectRevert(OracleAdapterV1.InvalidTimestamp.selector);
        market.quoteCollateral(1e18);
        setPrice(2_000e8, block.timestamp + 1);
        vm.expectRevert(OracleAdapterV1.InvalidTimestamp.selector);
        market.quoteCollateral(1e18);
    }

    function testUnsafeDecimalsAreNotARepairEvenWithCorrectCode() public {
        upgrade();
        vm.prank(customer);
        adapter.configure(address(source), 3600, 6);
        assertEq(market.quoteCollateral(3e18), 600_000e18);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("configuration"))
        );
        checks.assertConfiguration(address(market), address(source), 3600, 8, customer);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("valid-quote"))
        );
        checks.assertQuote(address(market), 3e18, 6_000e18);
        setPrice(2_000e8, block.timestamp - 3601);
        checks.assertStaleRejected(address(market)); // Stale-only success is insufficient.
    }

    function testUnsafeMaxAgeAndWrongSourceDetected() public {
        upgrade();
        vm.prank(customer);
        adapter.configure(address(source), 7200, 8);
        setPrice(2_000e8, block.timestamp - 3601);
        assertEq(market.quoteCollateral(3e18), 6_000e18);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("configuration"))
        );
        checks.assertConfiguration(address(market), address(source), 3600, 8, customer);
        TestPriceSource wrong = new TestPriceSource(supplier, 1e8, block.timestamp);
        vm.prank(customer);
        adapter.configure(address(wrong), 3600, 8);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("configuration"))
        );
        checks.assertConfiguration(address(market), address(source), 3600, 8, customer);
        assertEq(market.quoteCollateral(3e18), 3e18);
    }

    function testPausedMarketCannotMasqueradeAsStaleRejection() public {
        upgrade();
        vm.prank(customer);
        market.setPaused(true);
        vm.expectRevert(RiverMarket.MarketPaused.selector);
        checks.assertQuote(address(market), 3e18, 6_000e18);
        setPrice(2_000e8, block.timestamp - 3601);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("stale-rejected"))
        );
        checks.assertStaleRejected(address(market));
        vm.prank(customer);
        market.setPaused(false);
        checks.assertStaleRejected(address(market));
        setPrice(2_000e8, block.timestamp);
        checks.assertQuote(address(market), 3e18, 6_000e18);
    }

    function testCustomerCannotUpgradeSupplierCannotConfigure() public {
        assertEq(admin.owner(), supplier);
        assertTrue(address(admin) != supplier); // OZ 5.x creates the admin; initialOwner is not the admin address.
        vm.prank(customer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, customer));
        admin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(v2), "");
        vm.prank(supplier);
        vm.expectRevert(OracleAdapterV1.Unauthorized.selector);
        adapter.configure(address(source), 1, 8);
        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, supplier));
        market.setPaused(true);
        vm.prank(supplier);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, supplier));
        market.setAdapter(address(v2));
        upgrade();
        vm.prank(customer);
        adapter.configure(address(source), 1800, 8);
        assertEq(adapter.maxAge(), 1800);
    }

    function testOutsiderCannotChangeFeedOrCustomerConfiguration() public {
        vm.startPrank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        source.setPrice(1, block.timestamp);
        vm.expectRevert(OracleAdapterV1.Unauthorized.selector);
        adapter.configure(address(source), 1, 8);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        market.setAdapter(address(v1));
        vm.stopPrank();
    }

    function testInitializationLockedOnBothImplementationsAndProxyAfterUpgrade() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        v1.initialize(outsider, address(source), 1, 8);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        v2.initialize(outsider, address(source), 1, 8);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        adapter.initialize(outsider, address(source), 1, 8);
        upgrade();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        adapter.initialize(outsider, address(source), 1, 8);
        assertEq(adapter.configurationOwner(), customer);
    }

    function testInitializationRejectsZeroOwnerMissingSourceZeroAgeAndUnsupportedDecimals() public {
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        new TransparentUpgradeableProxy(address(v1), supplier, initData(address(0), address(source), 3600, 8));
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        new TransparentUpgradeableProxy(address(v1), supplier, initData(customer, outsider, 3600, 8));
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        new TransparentUpgradeableProxy(address(v1), supplier, initData(customer, address(0), 3600, 8));
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        new TransparentUpgradeableProxy(address(v1), supplier, initData(customer, address(source), 0, 8));
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        new TransparentUpgradeableProxy(address(v1), supplier, initData(customer, address(source), 3600, 19));
    }

    function testInvalidReconfigurationIsAtomic() public {
        vm.startPrank(customer);
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        adapter.configure(outsider, 3600, 8);
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        adapter.configure(address(source), 0, 8);
        vm.expectRevert(OracleAdapterV1.InvalidConfiguration.selector);
        adapter.configure(address(source), 3600, 255);
        vm.expectRevert(RiverMarket.InvalidAdapter.selector);
        market.setAdapter(outsider);
        vm.stopPrank();
        assertEq(adapter.priceSource(), address(source));
        assertEq(adapter.maxAge(), 3600);
        assertEq(adapter.priceDecimals(), 8);
        assertEq(market.adapter(), address(proxy));
    }

    function testCustomerCanSelectFreshAdapter() public {
        TransparentUpgradeableProxy replacement =
            new TransparentUpgradeableProxy(address(v2), supplier, initData(customer, address(source), 3600, 8));
        vm.prank(customer);
        market.setAdapter(address(replacement));
        assertEq(market.adapter(), address(replacement));
        checks.assertQuote(address(market), 3e18, 6_000e18);
        setPrice(2_000e8, block.timestamp - 3601);
        checks.assertStaleRejected(address(market));
    }

    function testFuzzLegitimateQuotesPreserveUnits(uint128 amount, uint64 price) public {
        vm.assume(price > 0);
        upgrade();
        setPrice(price, block.timestamp);
        assertEq(market.quoteCollateral(amount), uint256(amount) * uint256(price) / 1e8);
    }

    function testLargeQuoteUsesFullPrecisionAndRoundsDown() public {
        upgrade();
        setPrice(2e8, block.timestamp);
        assertEq(market.quoteCollateral(type(uint256).max / 2), type(uint256).max - 1);
        setPrice(1, block.timestamp);
        assertEq(market.quoteCollateral(100_000_001), 1);
    }

    function testUpgradePreservesNonDefaultConfigurationAndPausedState() public {
        TestPriceSource alternate = new TestPriceSource(supplier, 7e6, block.timestamp);
        vm.startPrank(customer);
        adapter.configure(address(alternate), 123, 6);
        market.setPaused(true);
        vm.stopPrank();
        upgrade();
        assertEq(adapter.priceSource(), address(alternate));
        assertEq(adapter.maxAge(), 123);
        assertEq(adapter.priceDecimals(), 6);
        assertEq(adapter.configurationOwner(), customer);
        assertTrue(market.paused());
        vm.prank(customer);
        market.setPaused(false);
        assertEq(market.quoteCollateral(2e18), 14e18);
    }

    function testProxyAdminCannotUseApplicationFallback() public {
        vm.prank(address(admin));
        vm.expectRevert(TransparentUpgradeableProxy.ProxyDeniedAdminAccess.selector);
        adapter.latestPrice();
    }

    function testPackRejectsFreshInputInStaleScenarioAndZeroQuoteWitness() public {
        upgrade();
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("stale-precondition"))
        );
        checks.assertStaleRejected(address(market));
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapterAssertions.AssertionFailed.selector, bytes32("valid-quote"))
        );
        checks.assertQuote(address(market), 0, 0);
    }

    function testPackRejectsMissingContracts() public view {
        (bool configOk,) = address(checks)
            .staticcall(abi.encodeCall(checks.assertConfiguration, (outsider, address(source), 3600, 8, customer)));
        (bool quoteOk,) = address(checks).staticcall(abi.encodeCall(checks.assertQuote, (outsider, 3e18, 6_000e18)));
        (bool staleOk,) = address(checks).staticcall(abi.encodeCall(checks.assertStaleRejected, (outsider)));
        assertFalse(configOk);
        assertFalse(quoteOk);
        assertFalse(staleOk);
    }
}
