// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {CampaignRegistry} from "../../pb15/CampaignRegistry.sol";
import {AcceptanceVerifier} from "../../pb16/AcceptanceVerifier.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {CampaignFundingBase} from "./CampaignFundingBase.sol";
import {
    FixtureUSDC6,
    FixtureToken18,
    FixtureNoDecimalsToken,
    FixtureInconsistentRegistry
} from "./FixtureTokens.sol";

/// @notice PB-17 constructor binding: the campaign must match its registered policy exactly.
contract CampaignBindingTest is CampaignFundingBase {
    function _next() internal view returns (address) {
        return vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
    }

    // ------------------------------------------------------------------ positive

    function test_bindsRegisteredPolicyExactly() public view {
        PatchBondTypes.Policy memory expected = registry.policyOf(ID_A);
        assertEq(abi.encode(campaign.policy()), abi.encode(expected), "policy copy");
        assertEq(campaign.policyHash(), PatchBondTypes.policyHash(expected), "PB-03 policy hash");
        assertEq(campaign.policyHash(), registry.policyHashOf(ID_A), "registry hash");
        assertEq(campaign.campaignId(), ID_A);
        assertEq(campaign.registry(), address(registry));
        assertEq(campaign.verifier(), address(verifier));
        assertEq(campaign.token(), address(usdc));
        assertEq(campaign.token(), expected.token, "token comes from policy and configuration, not a constant");
        assertEq(campaign.supplier(), supplierA);
        assertEq(campaign.requiredFunding(), REQUIRED);
        assertEq(campaign.requiredFunding(), registry.requiredFundingOf(ID_A));
        assertEq(campaign.requiredFunding(), ELIGIBLE_COUNT * GRANT);
        assertEq(campaign.funded(), 0);
        assertFalse(campaign.active());
    }

    function test_accountingStartsAtZero() public view {
        IRemediationCampaign.Accounting memory a = campaign.accounting();
        assertEq(a.deposited, 0);
        assertEq(a.unallocated, 0);
        assertEq(a.reserved, 0);
        assertEq(a.awardedUnwithdrawn, 0);
        assertEq(a.paid, 0);
        assertEq(a.refunded, 0);
        assertEq(campaign.remainingFunding(), REQUIRED);
    }

    // ------------------------------------------------------------------ no embedded token address

    /// @dev True if the 20-byte `needle` appears anywhere in `hay`.
    function _contains(bytes memory hay, bytes20 needle) internal pure returns (bool) {
        if (hay.length < 20) return false;
        for (uint256 i = 0; i + 20 <= hay.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < 20; j++) {
                if (hay[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }

    /// @dev The Arc USDC ERC-20 value from the official docs, built without a literal. Used only to probe that the
    /// campaign does not treat this address specially.
    function _officialArcUsdc() internal pure returns (address) {
        return address(uint160(0x36) << 152);
    }

    function test_rawTokenAddressBytesAreNotEmbeddedInCampaignCode() public {
        // TRIPWIRE ONLY. The optimizer can compile a constant such as 0x36 00..00 into PUSH1/SHL arithmetic, which a
        // raw byte scan cannot see, so the behavioral tests below are the real evidence of non-branching.
        bytes20 arcUsdc = bytes20(_officialArcUsdc());
        assertFalse(_contains(type(RemediationCampaign).creationCode, arcUsdc), "creation code");
        assertFalse(_contains(address(campaign).code, arcUsdc), "runtime code");
        assertEq(campaign.token(), address(usdc), "the token the campaign holds is the policy's");
        // Positive control: an address stored as an immutable is found by the scanner.
        assertTrue(_contains(address(new HardcodedAddressProbe(_officialArcUsdc())).code, arcUsdc), "scanner control");
    }

    function test_behaviorDoesNotDependOnWhatLivesAtTheOfficialUsdcAddress() public {
        address official = _officialArcUsdc();

        // Put a hostile 18-decimal token at the official address. A campaign whose policy names a different,
        // 6-decimal token must be completely unaffected: it binds, funds and activates.
        vm.etch(official, address(new FixtureToken18()).code);
        assertEq(campaign.token(), address(usdc));
        _fundFull(campaign, supplierA);
        vm.prank(supplierA);
        campaign.activate();
        assertTrue(campaign.active());
        assertEq(usdc.balanceOf(address(campaign)), REQUIRED);
        assertEq(FixtureToken18(official).balanceOf(address(campaign)), 0, "official address is never touched");

        // A policy that names the official address is judged by what that token reports, not by its address.
        address predicted = _next();
        _register(_policy(ID_B, predicted, supplierB, official));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.UnsupportedTokenDecimals.selector, uint8(18)));
        new RemediationCampaign(registry, verifier, ID_B, IERC20(official));
    }

    function test_officialAddressIsAcceptedOnlyWhenPolicyNamesItAndItReportsSixDecimals() public {
        address official = _officialArcUsdc();
        vm.etch(official, address(new FixtureUSDC6()).code); // stand-in with 6 decimals at that address

        // Policy names the official address: binds because the policy says so.
        RemediationCampaign viaPolicy = _deploy(ID_B, supplierB, official);
        assertEq(viaPolicy.token(), official);

        // Policy names another token but the deployer passes the official address: rejected as a mismatch.
        address predicted = _next();
        bytes32 id3 = keccak256("FIXTURE policy names another token");
        _register(_policy(id3, predicted, supplierB, address(usdc)));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.TokenMismatch.selector, official, address(usdc)));
        new RemediationCampaign(registry, verifier, id3, IERC20(official));
    }

    function test_campaignBindsWhateverTokenThePolicyNamesAtAnyAddress() public {
        // Two different token addresses, each named by its own policy, both bind. Nothing branches on a value.
        FixtureToken18 unrelated = new FixtureToken18(); // only here to move the CREATE nonce
        unrelated;
        RemediationCampaign c1 = _deploy(ID_B, supplierB, address(usdc));
        FixtureUSDC6 secondToken = new FixtureUSDC6();
        RemediationCampaign c2 = _deploy(keccak256("FIXTURE second token campaign"), supplierB, address(secondToken));
        assertEq(c1.token(), address(usdc));
        assertEq(c2.token(), address(secondToken));
    }

    // ------------------------------------------------------------------ registry / verifier

    function test_registryWithoutCodeReverts() public {
        vm.expectRevert(IRemediationCampaign.InvalidRegistry.selector);
        new RemediationCampaign(CampaignRegistry(attacker), verifier, ID_A, IERC20(address(usdc)));
    }

    function test_verifierWithoutCodeReverts() public {
        vm.expectRevert(IRemediationCampaign.InvalidVerifier.selector);
        new RemediationCampaign(registry, AcceptanceVerifier(attacker), ID_A, IERC20(address(usdc)));
        vm.expectRevert(IRemediationCampaign.InvalidVerifier.selector);
        new RemediationCampaign(registry, AcceptanceVerifier(address(0)), ID_A, IERC20(address(usdc)));
    }

    function test_verifierBoundToDifferentRegistryReverts() public {
        CampaignRegistry other = new CampaignRegistry();
        AcceptanceVerifier otherVerifier = new AcceptanceVerifier(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRemediationCampaign.VerifierRegistryMismatch.selector, address(other), address(registry)
            )
        );
        new RemediationCampaign(registry, otherVerifier, ID_B, IERC20(address(usdc)));
    }

    function test_unknownCampaignReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.CampaignNotFound.selector, ID_B));
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(usdc)));
    }

    // ------------------------------------------------------------------ chain and campaign address

    function test_wrongBlockChainIdReverts() public {
        address predicted = _next();
        _register(_policy(ID_B, predicted, supplierB, address(usdc)));
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.WrongDestinationChain.selector, FIXTURE_CHAIN_ID, 1)
        );
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(usdc)));
    }

    function test_policyCampaignNotThisAddressReverts() public {
        address predicted = _next();
        address wrong = makeAddr("FIXTURE some other campaign address");
        _register(_policy(ID_B, wrong, supplierB, address(usdc)));
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.CampaignAddressMismatch.selector, wrong, predicted)
        );
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(usdc)));
    }

    function test_deployingTwiceForSameCampaignIdCannotBindTheSecondAddress() public {
        // The policy commits one campaign address. A second instance at another address is rejected.
        address second = _next();
        assertTrue(second != address(campaign));
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.CampaignAddressMismatch.selector, address(campaign), second)
        );
        new RemediationCampaign(registry, verifier, ID_A, IERC20(address(usdc)));
    }

    // ------------------------------------------------------------------ token

    function test_tokenArgumentMustEqualPolicyToken() public {
        FixtureToken18 other = new FixtureToken18(); // created first so the predicted address below stays valid
        address predicted = _next();
        _register(_policy(ID_B, predicted, supplierB, address(usdc)));
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.TokenMismatch.selector, address(other), address(usdc))
        );
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(other)));
    }

    function test_tokenWithoutCodeReverts() public {
        address eoaToken = makeAddr("FIXTURE token address with no code");
        address predicted = _next();
        _register(_policy(ID_B, predicted, supplierB, eoaToken));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.NoTokenCode.selector, eoaToken));
        new RemediationCampaign(registry, verifier, ID_B, IERC20(eoaToken));
    }

    function test_unsupportedDecimalsReverts() public {
        FixtureToken18 t18 = new FixtureToken18();
        address predicted = _next();
        // The policy's own tokenDecimals field says 6, but the token reports 18: the campaign checks the token.
        _register(_policy(ID_B, predicted, supplierB, address(t18)));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.UnsupportedTokenDecimals.selector, uint8(18)));
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(t18)));
    }

    function test_tokenWithoutDecimalsFunctionReverts() public {
        FixtureNoDecimalsToken t = new FixtureNoDecimalsToken();
        address predicted = _next();
        _register(_policy(ID_B, predicted, supplierB, address(t)));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.TokenDecimalsUnavailable.selector, address(t)));
        new RemediationCampaign(registry, verifier, ID_B, IERC20(address(t)));
    }

    // ------------------------------------------------------------------ policy hash and funding consistency

    /// @dev Deploys an inconsistent registry and a verifier bound to it. `reportedHash == 0` means "report the
    /// real hash of the served policy". Creation order is registry, verifier, then the campaign (nonce + 2).
    function _liar(bytes32 reportedHash, uint256 reportedFunding)
        internal
        returns (FixtureInconsistentRegistry liar, AcceptanceVerifier v)
    {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        PatchBondTypes.Policy memory p = _policy(ID_B, predicted, supplierB, address(usdc));
        if (reportedHash == bytes32(0)) reportedHash = PatchBondTypes.policyHash(p);
        liar = new FixtureInconsistentRegistry(p, reportedHash, reportedFunding);
        v = new AcceptanceVerifier(liar);
        assertEq(_next(), predicted, "predicted campaign address");
    }

    function test_policyHashMismatchReverts() public {
        bytes32 wrong = keccak256("FIXTURE wrong hash");
        (FixtureInconsistentRegistry liar, AcceptanceVerifier v) = _liar(wrong, REQUIRED);
        bytes32 computed = PatchBondTypes.policyHash(liar.policyOf(ID_B));
        vm.expectRevert(abi.encodeWithSelector(IRemediationCampaign.PolicyHashMismatch.selector, computed, wrong));
        new RemediationCampaign(liar, v, ID_B, IERC20(address(usdc)));
    }

    function test_requiredFundingMismatchReverts() public {
        (FixtureInconsistentRegistry liar, AcceptanceVerifier v) = _liar(bytes32(0), REQUIRED + 1);
        vm.expectRevert(
            abi.encodeWithSelector(IRemediationCampaign.RequiredFundingMismatch.selector, REQUIRED + 1, REQUIRED)
        );
        new RemediationCampaign(liar, v, ID_B, IERC20(address(usdc)));
    }

    function test_consistentFixtureRegistryBindsSuccessfully() public {
        // Control for the two tests above: the same stand-in with a truthful hash and funding figure binds.
        (FixtureInconsistentRegistry liar, AcceptanceVerifier v) = _liar(bytes32(0), REQUIRED);
        RemediationCampaign c = new RemediationCampaign(liar, v, ID_B, IERC20(address(usdc)));
        assertEq(c.requiredFunding(), REQUIRED);
    }
}

/// @dev TEST-ONLY positive control for the bytecode scanner: an immutable is written into runtime code, so a
/// contract built with the Arc USDC value as its constructor argument contains those 20 bytes. Never deployed
/// outside tests.
contract HardcodedAddressProbe {
    address public immutable embedded;

    constructor(address embedded_) {
        embedded = embedded_;
    }
}
