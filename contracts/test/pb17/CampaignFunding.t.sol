// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {CampaignFundingBase} from "./CampaignFundingBase.sol";
import {
    FixtureUSDC6,
    FixtureFeeToken,
    FixtureFalseReturnToken,
    FixtureHookToken,
    FixtureReentrantSupplier
} from "./FixtureTokens.sol";

/// @notice PB-17 escrow funding and activation tests.
contract CampaignFundingTest is CampaignFundingBase {
    // ------------------------------------------------------------------ supplier-only

    function test_onlySupplierMayFund() public {
        address[5] memory callers = [attacker, reviewer, verifierSigner, supplierB, address(this)];
        for (uint256 i = 0; i < callers.length; i++) {
            usdc.mint(callers[i], REQUIRED);
            vm.startPrank(callers[i]);
            usdc.approve(address(campaign), REQUIRED);
            vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotSupplier.selector, callers[i], supplierA));
            campaign.fund(GRANT);
            vm.stopPrank();
        }
        assertEq(campaign.funded(), 0);
        assertEq(usdc.balanceOf(address(campaign)), 0);
    }

    function test_onlySupplierMayActivate() public {
        _fundFull(campaign, supplierA);
        address[4] memory callers = [attacker, reviewer, verifierSigner, supplierB];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotSupplier.selector, callers[i], supplierA));
            campaign.activate();
        }
        assertFalse(campaign.active());
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
    }

    // ------------------------------------------------------------------ exact funding and activation

    function test_fundExactAmountInOneDepositThenActivate() public {
        vm.expectEmit(true, false, false, true, address(campaign));
        emit IRemediationCampaign.Funded(supplierA, REQUIRED, REQUIRED, 0);
        _fund(campaign, supplierA, REQUIRED);

        assertEq(campaign.funded(), REQUIRED);
        assertEq(campaign.remainingFunding(), 0);
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED);
        assertFalse(campaign.active(), "funding alone never activates");

        vm.expectEmit(true, false, false, true, address(campaign));
        emit IRemediationCampaign.Activated(ID_A, REQUIRED);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
    }

    function test_splitDepositsSumExactlyAndTrackProgress() public {
        uint256[4] memory parts = [uint256(1), 19_999_999, 25_000_000, 15_000_000];
        uint256 total;
        for (uint256 i = 0; i < parts.length; i++) {
            total += parts[i];
            uint256 supplierBefore = usdc.balanceOf(supplierA);
            vm.expectEmit(true, false, false, true, address(campaign));
            emit IRemediationCampaign.Funded(supplierA, parts[i], total, REQUIRED - total);
            _fund(campaign, supplierA, parts[i]);
            assertEq(campaign.funded(), total);
            assertEq(campaign.remainingFunding(), REQUIRED - total);
            assertEq(usdc.balanceOf(address(campaign)), total);
            assertEq(supplierBefore - usdc.balanceOf(supplierA), parts[i], "exactly the requested amount is pulled");
            if (total < REQUIRED) {
                vm.prank(supplierA);
                vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, total, REQUIRED));
                campaign.activate();
            }
        }
        assertEq(total, REQUIRED);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
    }

    function test_accountingIdentityHoldsAfterFunding() public {
        _fund(campaign, supplierA, 12_345_678);
        IRemediationCampaign.Accounting memory a = campaign.accounting();
        assertEq(a.deposited, 12_345_678);
        assertEq(a.unallocated, 12_345_678);
        assertEq(a.reserved + a.awardedUnwithdrawn + a.paid + a.refunded, 0);
        assertEq(a.deposited, a.unallocated + a.reserved + a.awardedUnwithdrawn + a.paid + a.refunded);
        assertEq(a.deposited, usdc.balanceOf(address(campaign)));
    }

    function test_allowanceIsConsumedExactly() public {
        vm.prank(supplierA);
        usdc.approve(address(campaign), 100_000_000);
        _fund(campaign, supplierA, GRANT);
        assertEq(usdc.allowance(supplierA, address(campaign)), 100_000_000 - GRANT);
    }

    function test_activateTwiceReverts() public {
        _fundFull(campaign, supplierA);
        vm.startPrank(supplierA);
        campaign.activate();
        vm.expectRevert(IRemediationCampaign.AlreadyActive.selector);
        campaign.activate();
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ zero, under- and overfunding

    function test_zeroAmountReverts() public {
        vm.prank(supplierA);
        vm.expectRevert(IRemediationCampaign.ZeroAmount.selector);
        campaign.fund(0);
    }

    function test_activationWithNoFundingReverts() public {
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, 0, REQUIRED));
        campaign.activate();
    }

    function test_underfundedByOneBaseUnitCannotActivate() public {
        _fund(campaign, supplierA, REQUIRED - 1);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, REQUIRED - 1, REQUIRED));
        campaign.activate();
        assertFalse(campaign.active());
        // The last base unit completes it.
        _fund(campaign, supplierA, 1);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
    }

    function test_singleDepositAboveRequiredReverts() public {
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.Overfunding.selector, REQUIRED + 1, REQUIRED));
        campaign.fund(REQUIRED + 1);
        assertEq(campaign.funded(), 0);
        assertEq(usdc.balanceOf(address(campaign)), 0);
    }

    function test_depositExceedingRemainderByOneReverts() public {
        _fund(campaign, supplierA, 40_000_000);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.Overfunding.selector, 20_000_001, 20_000_000));
        campaign.fund(20_000_001);
        assertEq(campaign.funded(), 40_000_000);
        _fund(campaign, supplierA, 20_000_000); // the exact remainder is fine
        assertEq(campaign.funded(), REQUIRED);
    }

    function test_anyDepositAfterFullFundingReverts() public {
        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.Overfunding.selector, 1, 0));
        campaign.fund(1);
        vm.prank(supplierA);
        campaign.activate();
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.Overfunding.selector, 1, 0));
        campaign.fund(1);
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED);
    }

    function testFuzz_fundNeverExceedsRequired(uint256 a, uint256 b) public {
        a = bound(a, 1, REQUIRED);
        b = bound(b, 1, 2 * REQUIRED);
        _fund(campaign, supplierA, a);
        vm.prank(supplierA);
        if (b > REQUIRED - a) {
            vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.Overfunding.selector, b, REQUIRED - a));
            campaign.fund(b);
            assertEq(campaign.funded(), a);
        } else {
            campaign.fund(b);
            assertEq(campaign.funded(), a + b);
        }
        assertLe(campaign.funded(), REQUIRED);
        assertEq(campaign.funded(), usdc.balanceOf(address(campaign)));
    }

    // ------------------------------------------------------------------ transfer and allowance failures

    function test_missingAllowanceReverts() public {
        vm.prank(supplierA);
        usdc.approve(address(campaign), 0);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSignature("ERC20InsufficientAllowance(address,uint256,uint256)", address(campaign), 0, GRANT));
        campaign.fund(GRANT);
        assertEq(campaign.funded(), 0, "failed transfer leaves tracked funding untouched");
    }

    function test_allowanceOneUnitShortReverts() public {
        vm.prank(supplierA);
        usdc.approve(address(campaign), GRANT - 1);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSignature("ERC20InsufficientAllowance(address,uint256,uint256)", address(campaign), GRANT - 1, GRANT));
        campaign.fund(GRANT);
        assertEq(campaign.funded(), 0);
    }

    function test_insufficientBalanceReverts() public {
        address poor = makeAddr("FIXTURE poor supplier");
        FixtureUSDC6 t = new FixtureUSDC6();
        RemediationCampaign c = _deploy(ID_B, poor, address(t));
        t.mint(poor, GRANT - 1);
        vm.startPrank(poor);
        t.approve(address(c), REQUIRED);
        vm.expectRevert(abi.encodeWithSignature("ERC20InsufficientBalance(address,uint256,uint256)", poor, GRANT - 1, GRANT));
        c.fund(GRANT);
        vm.stopPrank();
        assertEq(c.funded(), 0);
    }

    function test_tokenReturningFalseReverts() public {
        FixtureFalseReturnToken t = new FixtureFalseReturnToken();
        RemediationCampaign c = _deploy(ID_B, supplierB, address(t));
        t.mint(supplierB, REQUIRED);
        vm.startPrank(supplierB);
        t.approve(address(c), REQUIRED);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(t)));
        c.fund(GRANT);
        vm.stopPrank();
        assertEq(c.funded(), 0);
    }

    function test_feeOnTransferTokenIsRejectedAndNothingIsCounted() public {
        FixtureFeeToken t = new FixtureFeeToken();
        RemediationCampaign c = _deploy(ID_B, supplierB, address(t));
        t.mint(supplierB, REQUIRED);
        vm.startPrank(supplierB);
        t.approve(address(c), REQUIRED);
        // 1% fee: 20,000,000 requested, 19,800,000 arrives.
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.FeeOnTransferDetected.selector, GRANT, 19_800_000));
        c.fund(GRANT);
        vm.stopPrank();
        assertEq(c.funded(), 0);
        assertEq(t.balanceOf(address(c)), 0, "the short transfer was rolled back");
        assertEq(t.balanceOf(supplierB), REQUIRED);
    }

    // ------------------------------------------------------------------ direct transfers

    function test_directTransferIsNotCounted() public {
        usdc.mint(donor, REQUIRED);
        vm.prank(donor);
        usdc.transfer(address(campaign), REQUIRED);

        assertEq(usdc.balanceOf(address(campaign)), REQUIRED, "tokens are there");
        assertEq(campaign.funded(), 0, "but not tracked");
        assertEq(campaign.accounting().deposited, 0);
        assertEq(campaign.accounting().unallocated, 0);
        assertEq(campaign.remainingFunding(), REQUIRED);
        assertEq(campaign.untrackedTokenBalance(), REQUIRED);

        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, 0, REQUIRED));
        campaign.activate();
        assertFalse(campaign.active());
    }

    function test_directTransferByTheSupplierIsAlsoNotCounted() public {
        vm.prank(supplierA);
        usdc.transfer(address(campaign), REQUIRED);
        assertEq(campaign.funded(), 0);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, 0, REQUIRED));
        campaign.activate();
    }

    function test_donationBeforeAndAfterFundingDoesNotChangeTrackedAmounts() public {
        usdc.mint(donor, 10_000_000);
        vm.prank(donor);
        usdc.transfer(address(campaign), 5_000_000);

        _fund(campaign, supplierA, 30_000_000); // balance delta is measured, so the donation does not confuse it
        assertEq(campaign.funded(), 30_000_000);

        vm.prank(donor);
        usdc.transfer(address(campaign), 5_000_000);
        assertEq(campaign.funded(), 30_000_000);
        assertEq(campaign.untrackedTokenBalance(), 10_000_000);

        // Overfunding is judged against tracked funding, so the exact remainder still goes in.
        _fund(campaign, supplierA, 30_000_000);
        assertEq(campaign.funded(), REQUIRED);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED + 10_000_000);
        assertEq(campaign.untrackedTokenBalance(), 10_000_000);
    }

    function test_noWithdrawalPathExists() public {
        // There is no sweep, rescue or refund. Probe common selectors: every call must fail.
        usdc.mint(donor, 1_000_000);
        vm.prank(donor);
        usdc.transfer(address(campaign), 1_000_000);
        bytes[7] memory calls = [
            abi.encodeWithSignature("sweep(address)", donor),
            abi.encodeWithSignature("rescue(address,uint256)", address(usdc), 1_000_000),
            abi.encodeWithSignature("withdraw()"),
            abi.encodeWithSignature("withdraw(uint256)", 1_000_000),
            abi.encodeWithSignature("refund()"),
            abi.encodeWithSignature("upgradeTo(address)", attacker),
            abi.encodeWithSignature("transferOwnership(address)", attacker)
        ];
        for (uint256 i = 0; i < calls.length; i++) {
            vm.prank(supplierA);
            (bool ok,) = address(campaign).call(calls[i]);
            assertFalse(ok, "no privileged exit exists");
        }
        assertEq(usdc.balanceOf(address(campaign)), 1_000_000);
    }

    function test_strandedDirectTransfersStayStrandedThroughActivationAndDeadline() public {
        usdc.mint(donor, 7_000_000);
        vm.prank(donor);
        usdc.transfer(address(campaign), 7_000_000);

        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        campaign.activate();
        vm.warp(uint256(campaign.policy().claimDeadline) + 365 days);

        // Nothing in PB-17 can move them, for any caller, and tracked state never absorbs them.
        address[3] memory callers = [donor, supplierA, address(this)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            (bool ok,) = address(campaign).call(abi.encodeWithSignature("withdraw(uint256)", 7_000_000));
            assertFalse(ok);
        }
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED + 7_000_000);
        assertEq(campaign.untrackedTokenBalance(), 7_000_000);
        assertEq(campaign.funded(), REQUIRED);
        assertEq(campaign.accounting().unallocated, REQUIRED);
        assertTrue(campaign.active());
    }

    function test_nativeValueSendsRevert() public {
        vm.deal(address(this), 3);
        vm.deal(supplierA, 3);

        (bool plain,) = address(campaign).call{value: 1}("");
        assertFalse(plain, "no receive function");

        // Called by the real supplier with a valid allowance, so only the attached value can make this fail.
        vm.prank(supplierA);
        (bool viaFund,) = address(campaign).call{value: 1}(abi.encodeCall(campaign.fund, (GRANT)));
        assertFalse(viaFund, "fund is not payable");
        assertEq(campaign.funded(), 0);

        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        (bool viaActivate,) = address(campaign).call{value: 1}(abi.encodeCall(campaign.activate, ()));
        assertFalse(viaActivate, "activate is not payable");
        assertFalse(campaign.active());

        assertEq(address(campaign).balance, 0);
    }

    // ------------------------------------------------------------------ stable accounting state for PB-18/19

    function test_accountingStructLayoutIsStable() public {
        assertEq(IRemediationCampaign.accounting.selector, bytes4(keccak256("accounting()")));
        _fund(campaign, supplierA, 12_345_678);

        (bool ok, bytes memory ret) = address(campaign).staticcall(abi.encodeWithSignature("accounting()"));
        assertTrue(ok);
        assertEq(ret.length, 6 * 32, "six static words: deposited, unallocated, reserved, awardedUnwithdrawn, paid, refunded");
        (uint256 deposited, uint256 unallocated, uint256 reserved, uint256 awardedUnwithdrawn, uint256 paid, uint256 refunded) =
            abi.decode(ret, (uint256, uint256, uint256, uint256, uint256, uint256));
        assertEq(deposited, 12_345_678);
        assertEq(unallocated, 12_345_678);
        assertEq(reserved, 0, "PB-18 slot");
        assertEq(awardedUnwithdrawn, 0, "PB-18 slot");
        assertEq(paid, 0, "PB-18 slot");
        assertEq(refunded, 0, "PB-19 slot");
        assertEq(deposited, campaign.funded());
    }

    // ------------------------------------------------------------------ deadline

    function test_fundAndActivateRejectedAtOrAfterClaimDeadline() public {
        uint64 deadline = campaign.policy().claimDeadline;
        _fund(campaign, supplierA, 10_000_000);

        vm.warp(deadline);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeadlinePassed.selector, deadline, deadline));
        campaign.fund(1);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeadlinePassed.selector, deadline, deadline));
        campaign.activate();
        assertEq(campaign.funded(), 10_000_000);
    }

    function test_fullyFundedButDeadlinePassedCannotActivate() public {
        uint64 deadline = campaign.policy().claimDeadline;
        _fundFull(campaign, supplierA);
        vm.warp(uint256(deadline) + 1);
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.DeadlinePassed.selector, deadline, uint256(deadline) + 1));
        campaign.activate();
        assertFalse(campaign.active());
    }

    function test_oneSecondBeforeDeadlineStillWorks() public {
        uint64 deadline = campaign.policy().claimDeadline;
        vm.warp(uint256(deadline) - 1);
        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
    }

    // ------------------------------------------------------------------ campaign isolation

    function test_campaignsAreIsolated() public {
        RemediationCampaign b = _deploy(ID_B, supplierB, address(usdc)); // same token, different supplier
        usdc.mint(supplierB, REQUIRED);
        vm.prank(supplierB);
        usdc.approve(address(b), type(uint256).max);

        // Fund and activate A.
        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        campaign.activate();

        // B is untouched.
        assertEq(b.funded(), 0);
        assertFalse(b.active());
        assertEq(b.accounting().deposited, 0);
        assertEq(b.policyHash(), registry.policyHashOf(ID_B));
        assertTrue(b.policyHash() != campaign.policyHash());
        assertEq(usdc.balanceOf(address(b)), 0);

        // A's supplier cannot touch B and B's cannot touch A.
        vm.prank(supplierA);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotSupplier.selector, supplierA, supplierB));
        b.fund(GRANT);
        vm.prank(supplierB);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotSupplier.selector, supplierB, supplierA));
        campaign.fund(1);

        // Tokens that A holds do not count toward B, even though both use the same token.
        vm.prank(supplierB);
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NotFullyFunded.selector, 0, REQUIRED));
        b.activate();

        // B funds separately and A's state does not move.
        _fund(b, supplierB, 25_000_000);
        assertEq(b.funded(), 25_000_000);
        assertEq(campaign.funded(), REQUIRED);
        assertEq(usdc.balanceOf(address(b)), 25_000_000);
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED);
    }

    function test_directTransferToOneCampaignDoesNotAffectAnother() public {
        RemediationCampaign b = _deploy(ID_B, supplierB, address(usdc));
        usdc.mint(donor, REQUIRED);
        vm.prank(donor);
        usdc.transfer(address(campaign), REQUIRED);
        assertEq(campaign.funded(), 0);
        assertEq(b.funded(), 0);
        assertEq(b.untrackedTokenBalance(), 0);
    }

    // ------------------------------------------------------------------ reentrancy

    function test_reentrantFundFromTokenHookIsBlocked() public {
        FixtureHookToken t = new FixtureHookToken();
        FixtureReentrantSupplier s = new FixtureReentrantSupplier();

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        PatchBondTypes.Policy memory p = _policy(ID_B, predicted, address(s), address(t));
        _register(p);
        RemediationCampaign c = new RemediationCampaign(registry, verifier, ID_B, IERC20(address(t)));
        s.setCampaign(address(c));
        t.mint(address(s), REQUIRED);
        s.approveToken(address(t), REQUIRED);

        s.callFund(GRANT, true);

        assertFalse(s.reentrySucceeded(), "re-entry must not succeed");
        assertEq(bytes4(s.reentryError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(c.funded(), GRANT, "only the outer deposit was counted");
        assertEq(t.balanceOf(address(c)), GRANT);
    }
}
