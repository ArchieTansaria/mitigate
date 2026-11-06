// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {CampaignRegistry} from "../../pb15/CampaignRegistry.sol";
import {AcceptanceVerifier} from "../../pb16/AcceptanceVerifier.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {FixtureUSDC6} from "./FixtureTokens.sol";

/// @notice Shared fixtures for the PB-17 tests. Every role address, id, hash, amount and timestamp is a labeled
/// FIXTURE value. The token is a labeled six-decimal mock; no live token address appears anywhere in this suite.
abstract contract CampaignFundingBase is Test {
    CampaignRegistry internal registry;
    AcceptanceVerifier internal verifier;
    FixtureUSDC6 internal usdc;
    RemediationCampaign internal campaign;

    bytes32 internal constant ID_A = keccak256("FIXTURE PB-17 campaign A");
    bytes32 internal constant ID_B = keccak256("FIXTURE PB-17 campaign B");
    uint256 internal constant FIXTURE_CHAIN_ID = 5042002;
    uint256 internal constant ELIGIBLE_COUNT = 3;
    uint256 internal constant GRANT = 20_000_000; // FIXTURE: 20 USDC at 6 decimals
    uint256 internal constant REQUIRED = 60_000_000; // 3 x 20 USDC

    address internal supplierA = makeAddr("FIXTURE supplier A");
    address internal supplierB = makeAddr("FIXTURE supplier B");
    address internal verifierSigner = makeAddr("FIXTURE verifier signer");
    address internal reviewer = makeAddr("FIXTURE reviewer");
    address internal attacker = makeAddr("FIXTURE attacker");
    address internal donor = makeAddr("FIXTURE donor");

    function setUp() public virtual {
        vm.chainId(FIXTURE_CHAIN_ID);
        vm.warp(1_800_000_000);
        registry = new CampaignRegistry();
        verifier = new AcceptanceVerifier(registry);
        usdc = new FixtureUSDC6();

        campaign = _deploy(ID_A, supplierA, address(usdc));
        usdc.mint(supplierA, 1_000_000_000);
        vm.prank(supplierA);
        usdc.approve(address(campaign), type(uint256).max);
    }

    function _policy(bytes32 id, address campaignAddr, address supplier_, address tokenAddr)
        internal
        view
        returns (PatchBondTypes.Policy memory p)
    {
        p.campaignId = id;
        p.supplier = supplier_;
        p.sourceChainId = 11155111;
        p.destinationChainId = block.chainid;
        p.sourceRegistry = address(0);
        p.campaign = campaignAddr;
        p.eligibilityRoot = keccak256(abi.encode("FIXTURE root", id));
        p.eligibleCount = ELIGIBLE_COUNT;
        p.grantAmount = GRANT;
        p.token = tokenAddr;
        p.tokenDecimals = 6;
        p.repairPolicyHash = keccak256("FIXTURE repair policy");
        p.testPackHash = keccak256("FIXTURE test pack");
        p.verifier = verifierSigner;
        p.challenger = supplier_;
        p.reviewer = reviewer;
        p.claimDeadline = uint64(block.timestamp + 30 days);
        p.challengeWindow = 1 days;
        p.reviewTimeout = 2 days;
        p.maxReceiptAge = 300;
        p.confirmations = 2;
        p.evidenceRetention = 365 days;
    }

    function _register(PatchBondTypes.Policy memory p) internal {
        vm.prank(p.supplier);
        registry.createCampaign(p);
    }

    /// @dev Predict the next CREATE address of this test contract, register a policy that names it, then deploy.
    function _deploy(bytes32 id, address supplier_, address tokenAddr) internal returns (RemediationCampaign c) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        _register(_policy(id, predicted, supplier_, tokenAddr));
        c = new RemediationCampaign(registry, verifier, id, IERC20(tokenAddr));
        assertEq(address(c), predicted, "campaign deployed at the address its policy commits to");
    }

    function _fund(RemediationCampaign c, address as_, uint256 amount) internal {
        vm.prank(as_);
        c.fund(amount);
    }

    function _fundFull(RemediationCampaign c, address as_) internal {
        _fund(c, as_, c.requiredFunding());
    }
}
