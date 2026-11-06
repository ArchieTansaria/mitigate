// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PatchBondTypes} from "../pb03/PatchBondTypes.sol";
import {CampaignRegistry} from "../pb15/CampaignRegistry.sol";
import {ICampaignRegistry} from "../pb15/ICampaignRegistry.sol";

/// @notice PB-15 tests. Every address, id, hash, amount and timestamp below is a labeled FIXTURE value
/// generated for these tests. None is a production or live configuration.
contract CampaignRegistryTest is Test {
    CampaignRegistry internal registry;

    // FIXTURE terms. 3 eligible deployments x 20 USDC (6 decimals) per the PB-14 policy's published test fixture.
    bytes32 internal constant FIXTURE_CAMPAIGN_ID = keccak256("FIXTURE campaign A");
    bytes32 internal constant FIXTURE_CAMPAIGN_ID_B = keccak256("FIXTURE campaign B");
    uint256 internal constant FIXTURE_SOURCE_CHAIN_ID = 11155111;
    uint256 internal constant FIXTURE_ELIGIBLE_COUNT = 3;
    uint256 internal constant FIXTURE_GRANT = 20_000_000;
    bytes32 internal constant FIXTURE_REPAIR_POLICY_HASH = keccak256("FIXTURE repair policy");
    bytes32 internal constant FIXTURE_TEST_PACK_HASH = keccak256("FIXTURE test pack");

    address internal supplier = makeAddr("FIXTURE supplier");
    address internal verifier = makeAddr("FIXTURE verifier");
    address internal reviewer = makeAddr("FIXTURE reviewer");
    address internal token = makeAddr("FIXTURE token");
    address internal fixtureCampaign = makeAddr("FIXTURE campaign contract");
    address internal fixtureSourceRegistry = makeAddr("FIXTURE source registry");
    address internal relayer1 = makeAddr("FIXTURE relayer 1");
    address internal relayer2 = makeAddr("FIXTURE relayer 2");
    address internal attacker = makeAddr("FIXTURE attacker");

    address[3] internal recipients;
    bytes32[3] internal depKeys;
    bytes32[3] internal leaves;
    bytes32 internal root;

    function setUp() public {
        vm.chainId(5042002); // FIXTURE destination: Arc Testnet chain id, also asserted against block.chainid.
        vm.warp(1_800_000_000);
        registry = new CampaignRegistry();

        for (uint256 i = 0; i < 3; i++) {
            recipients[i] = makeAddr(string.concat("FIXTURE recipient ", vm.toString(i)));
            depKeys[i] = PatchBondTypes.deploymentKey(
                FIXTURE_SOURCE_CHAIN_ID, makeAddr(string.concat("FIXTURE entrypoint ", vm.toString(i))), bytes32(0)
            );
            leaves[i] = PatchBondTypes.eligibilityLeaf(
                FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[i], recipients[i]
            );
        }
        // 3-leaf sorted-pair tree: root = H(H(l0,l1), l2).
        root = _pair(_pair(leaves[0], leaves[1]), leaves[2]);
    }

    // ------------------------------------------------------------------ helpers

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _proof(uint256 i) internal view returns (bytes32[] memory p) {
        if (i == 2) {
            p = new bytes32[](1);
            p[0] = _pair(leaves[0], leaves[1]);
        } else {
            p = new bytes32[](2);
            p[0] = leaves[i == 0 ? 1 : 0];
            p[1] = leaves[2];
        }
    }

    function _policy() internal view returns (PatchBondTypes.Policy memory p) {
        p.campaignId = FIXTURE_CAMPAIGN_ID;
        p.supplier = supplier;
        p.sourceChainId = FIXTURE_SOURCE_CHAIN_ID;
        p.destinationChainId = block.chainid;
        p.sourceRegistry = fixtureSourceRegistry;
        p.campaign = fixtureCampaign;
        p.eligibilityRoot = root;
        p.eligibleCount = FIXTURE_ELIGIBLE_COUNT;
        p.grantAmount = FIXTURE_GRANT;
        p.token = token;
        p.tokenDecimals = 6;
        p.repairPolicyHash = FIXTURE_REPAIR_POLICY_HASH;
        p.testPackHash = FIXTURE_TEST_PACK_HASH;
        p.verifier = verifier;
        p.challenger = supplier;
        p.reviewer = reviewer;
        p.claimDeadline = uint64(block.timestamp + 30 days);
        p.challengeWindow = 1 days;
        p.reviewTimeout = 2 days;
        p.maxReceiptAge = 1 hours;
        p.confirmations = 12;
        p.evidenceRetention = 365 days;
    }

    function _create(PatchBondTypes.Policy memory p) internal returns (bytes32) {
        vm.prank(p.supplier);
        return registry.createCampaign(p);
    }

    function _createBase() internal returns (bytes32) {
        return _create(_policy());
    }

    function _register(address submitter, uint256 i) internal {
        vm.prank(submitter);
        registry.registerEligibleDeployment(
            FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[i], recipients[i], _proof(i)
        );
    }

    function _expectCreateRevert(PatchBondTypes.Policy memory p, bytes memory err) internal {
        vm.prank(p.supplier);
        vm.expectRevert(err);
        registry.createCampaign(p);
    }

    // ------------------------------------------------------------------ creation: positive

    function test_create_storesPolicyAndHash() public {
        PatchBondTypes.Policy memory p = _policy();
        bytes32 expectedHash = PatchBondTypes.policyHash(p);

        vm.expectEmit(true, true, true, true, address(registry));
        emit ICampaignRegistry.CampaignCreated(
            p.campaignId, supplier, expectedHash, FIXTURE_ELIGIBLE_COUNT, FIXTURE_GRANT, 60_000_000
        );
        bytes32 returned = _create(p);

        assertEq(returned, expectedHash, "returned hash");
        assertEq(registry.policyHashOf(p.campaignId), expectedHash, "stored hash");
        assertTrue(registry.campaignExists(p.campaignId));
        assertEq(registry.requiredFundingOf(p.campaignId), 60_000_000, "FIXTURE funding 3 x 20 USDC");

        PatchBondTypes.Policy memory s = registry.policyOf(p.campaignId);
        assertEq(PatchBondTypes.policyHash(s), expectedHash, "stored policy re-hashes to policyHash");
        assertEq(abi.encode(s), abi.encode(p), "all 22 fields stored exactly");
    }

    function test_create_allowsZeroSourceRegistryDirectSignedMode() public {
        PatchBondTypes.Policy memory p = _policy();
        p.sourceRegistry = address(0);
        _create(p);
        assertEq(registry.policyOf(p.campaignId).sourceRegistry, address(0));
    }

    function test_create_hashCommitsEveryTerm() public view {
        // Mutating any term changes the policy hash (mutated terms are a different policy).
        PatchBondTypes.Policy memory base = _policy();
        bytes32 h = PatchBondTypes.policyHash(base);

        PatchBondTypes.Policy memory m = _policy();
        m.grantAmount += 1;
        assertTrue(PatchBondTypes.policyHash(m) != h, "grant");
        m = _policy();
        m.eligibilityRoot = keccak256("FIXTURE other root");
        assertTrue(PatchBondTypes.policyHash(m) != h, "root");
        m = _policy();
        m.reviewer = attacker;
        assertTrue(PatchBondTypes.policyHash(m) != h, "reviewer");
        m = _policy();
        m.claimDeadline += 1;
        assertTrue(PatchBondTypes.policyHash(m) != h, "deadline");
    }

    // ------------------------------------------------------------------ creation: negative

    function test_create_revertsWhenCallerIsNotSupplier() public {
        PatchBondTypes.Policy memory p = _policy();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.Unauthorized.selector, attacker, supplier));
        registry.createCampaign(p);
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_revertsWhenReviewerTriesToCreateForSupplier() public {
        PatchBondTypes.Policy memory p = _policy();
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.Unauthorized.selector, reviewer, supplier));
        registry.createCampaign(p);
    }

    function test_create_revertsOnZeroCampaignId() public {
        PatchBondTypes.Policy memory p = _policy();
        p.campaignId = bytes32(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroHash.selector, bytes32("campaignId")));
    }

    function test_create_revertsOnZeroSupplier() public {
        PatchBondTypes.Policy memory p = _policy();
        p.supplier = address(0);
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("supplier")));
        registry.createCampaign(p);
    }

    function test_create_revertsOnZeroVerifier() public {
        PatchBondTypes.Policy memory p = _policy();
        p.verifier = address(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("verifier")));
    }

    function test_create_revertsOnZeroChallenger() public {
        PatchBondTypes.Policy memory p = _policy();
        p.challenger = address(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("challenger")));
    }

    function test_create_revertsOnZeroReviewer() public {
        PatchBondTypes.Policy memory p = _policy();
        p.reviewer = address(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("reviewer")));
    }

    function test_create_revertsOnZeroToken() public {
        PatchBondTypes.Policy memory p = _policy();
        p.token = address(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("token")));
    }

    function test_create_revertsOnZeroRoot() public {
        PatchBondTypes.Policy memory p = _policy();
        p.eligibilityRoot = bytes32(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroHash.selector, bytes32("eligibilityRoot")));
    }

    function test_create_revertsOnZeroRepairPolicyHash() public {
        PatchBondTypes.Policy memory p = _policy();
        p.repairPolicyHash = bytes32(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroHash.selector, bytes32("repairPolicyHash")));
    }

    function test_create_revertsOnZeroTestPackHash() public {
        PatchBondTypes.Policy memory p = _policy();
        p.testPackHash = bytes32(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroHash.selector, bytes32("testPackHash")));
    }

    function test_create_revertsOnWrongDestinationChain() public {
        PatchBondTypes.Policy memory p = _policy();
        p.destinationChainId = block.chainid + 1;
        _expectCreateRevert(
            p, abi.encodeWithSelector(ICampaignRegistry.WrongDestinationChain.selector, block.chainid + 1, block.chainid)
        );
    }

    function test_create_revertsWhenDestinationIsSourceChain() public {
        PatchBondTypes.Policy memory p = _policy();
        p.destinationChainId = FIXTURE_SOURCE_CHAIN_ID;
        _expectCreateRevert(
            p,
            abi.encodeWithSelector(
                ICampaignRegistry.WrongDestinationChain.selector, FIXTURE_SOURCE_CHAIN_ID, block.chainid
            )
        );
    }

    function test_create_revertsOnUnsupportedDecimals() public {
        uint8[3] memory bad = [uint8(0), uint8(18), uint8(7)];
        for (uint256 i = 0; i < bad.length; i++) {
            PatchBondTypes.Policy memory p = _policy();
            p.tokenDecimals = bad[i];
            _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.UnsupportedTokenDecimals.selector, bad[i]));
        }
    }

    function test_create_revertsOnZeroEligibleCount() public {
        PatchBondTypes.Policy memory p = _policy();
        p.eligibleCount = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroEligibleCount.selector));
    }

    function test_create_revertsOnZeroGrant() public {
        PatchBondTypes.Policy memory p = _policy();
        p.grantAmount = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroGrantAmount.selector));
    }

    function test_create_revertsOnFundingOverflow() public {
        PatchBondTypes.Policy memory p = _policy();
        p.eligibleCount = 2;
        p.grantAmount = type(uint256).max / 2 + 1;
        _expectCreateRevert(
            p, abi.encodeWithSelector(ICampaignRegistry.RequiredFundingOverflow.selector, p.eligibleCount, p.grantAmount)
        );
    }

    function test_create_acceptsLargestNonOverflowingFunding() public {
        PatchBondTypes.Policy memory p = _policy();
        p.eligibleCount = 1;
        p.grantAmount = type(uint256).max;
        _create(p);
        assertEq(registry.requiredFundingOf(p.campaignId), type(uint256).max);
    }

    function testFuzz_create_fundingProductIsExactOrRejected(uint128 count, uint256 grant) public {
        count = uint128(bound(count, 1, type(uint128).max));
        grant = bound(grant, 1, type(uint256).max);
        PatchBondTypes.Policy memory p = _policy();
        p.eligibleCount = count;
        p.grantAmount = grant;
        bool overflows = grant > type(uint256).max / count;
        vm.prank(supplier);
        if (overflows) {
            vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.RequiredFundingOverflow.selector, count, grant));
            registry.createCampaign(p);
        } else {
            registry.createCampaign(p);
            assertEq(registry.requiredFundingOf(p.campaignId), uint256(count) * grant);
        }
    }

    function test_create_revertsOnDeadlineNotInFuture() public {
        PatchBondTypes.Policy memory p = _policy();
        p.claimDeadline = uint64(block.timestamp); // equal to now is not "future"
        _expectCreateRevert(
            p, abi.encodeWithSelector(ICampaignRegistry.DeadlineNotInFuture.selector, p.claimDeadline, block.timestamp)
        );
        p.claimDeadline = uint64(block.timestamp - 1);
        _expectCreateRevert(
            p, abi.encodeWithSelector(ICampaignRegistry.DeadlineNotInFuture.selector, p.claimDeadline, block.timestamp)
        );
        p.claimDeadline = 0;
        _expectCreateRevert(
            p, abi.encodeWithSelector(ICampaignRegistry.DeadlineNotInFuture.selector, uint64(0), block.timestamp)
        );
    }

    function test_create_acceptsDeadlineOneSecondAhead() public {
        PatchBondTypes.Policy memory p = _policy();
        p.claimDeadline = uint64(block.timestamp + 1);
        _create(p);
    }

    function test_create_revertsOnZeroChallengeWindow() public {
        PatchBondTypes.Policy memory p = _policy();
        p.challengeWindow = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroDuration.selector, bytes32("challengeWindow")));
    }

    function test_create_revertsOnZeroReviewTimeout() public {
        PatchBondTypes.Policy memory p = _policy();
        p.reviewTimeout = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroDuration.selector, bytes32("reviewTimeout")));
    }

    function test_create_revertsOnZeroMaxReceiptAge() public {
        PatchBondTypes.Policy memory p = _policy();
        p.maxReceiptAge = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroDuration.selector, bytes32("maxReceiptAge")));
    }

    function test_create_revertsWhenSupplierEqualsReviewer() public {
        PatchBondTypes.Policy memory p = _policy();
        p.reviewer = supplier;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.RoleSeparationViolated.selector, supplier, supplier));
    }

    // ---- validation-gap predicates: campaign, sourceChainId, reviewer independence, confirmations, retention

    function test_create_revertsOnZeroCampaign() public {
        PatchBondTypes.Policy memory p = _policy();
        p.campaign = address(0);
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroAddress.selector, bytes32("campaign")));
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_revertsOnZeroSourceChainId() public {
        PatchBondTypes.Policy memory p = _policy();
        p.sourceChainId = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroSourceChainId.selector));
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_revertsWhenReviewerEqualsVerifier() public {
        PatchBondTypes.Policy memory p = _policy();
        p.reviewer = verifier;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ReviewerIsVerifier.selector, verifier));
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_acceptsVerifierEqualToSupplierWhenReviewerIsIndependent() public {
        // Only the reviewer must be independent; supplier == verifier is not rejected by this predicate.
        PatchBondTypes.Policy memory p = _policy();
        p.verifier = supplier;
        _create(p);
        assertTrue(registry.campaignExists(p.campaignId));
    }

    function test_create_revertsOnZeroConfirmations() public {
        PatchBondTypes.Policy memory p = _policy();
        p.confirmations = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroConfirmations.selector));
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_revertsOnZeroEvidenceRetention() public {
        PatchBondTypes.Policy memory p = _policy();
        p.evidenceRetention = 0;
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.ZeroDuration.selector, bytes32("evidenceRetention")));
        assertFalse(registry.campaignExists(p.campaignId));
    }

    function test_create_acceptsMinimalPositiveConfirmationsRetentionAndSourceChain() public {
        PatchBondTypes.Policy memory p = _policy();
        p.confirmations = 1;
        p.evidenceRetention = 1;
        p.sourceChainId = 1;
        bytes32 h = _create(p);
        assertEq(h, PatchBondTypes.policyHash(p));
        assertEq(registry.policyOf(p.campaignId).confirmations, 1);
        assertEq(registry.policyOf(p.campaignId).evidenceRetention, 1);
        assertEq(registry.policyOf(p.campaignId).sourceChainId, 1);
    }

    function testFuzz_create_independentReviewerAlwaysAccepted(address r) public {
        vm.assume(r != address(0) && r != supplier && r != verifier);
        PatchBondTypes.Policy memory p = _policy();
        p.reviewer = r;
        _create(p);
        assertEq(registry.policyOf(p.campaignId).reviewer, r);
    }

    function test_create_validPolicyHashesExactlyWithPatchBondTypes() public {
        PatchBondTypes.Policy memory p = _policy();

        // Independent re-encoding in the frozen PB-03 field order: 22 static words.
        bytes memory encoded = abi.encode(
            p.campaignId,
            p.supplier,
            p.sourceChainId,
            p.destinationChainId,
            p.sourceRegistry,
            p.campaign,
            p.eligibilityRoot,
            p.eligibleCount,
            p.grantAmount,
            p.token
        );
        encoded = bytes.concat(
            encoded,
            abi.encode(
                p.tokenDecimals,
                p.repairPolicyHash,
                p.testPackHash,
                p.verifier,
                p.challenger,
                p.reviewer,
                p.claimDeadline,
                p.challengeWindow,
                p.reviewTimeout,
                p.maxReceiptAge,
                p.confirmations,
                p.evidenceRetention
            )
        );
        assertEq(encoded.length, 22 * 32, "22 static words");
        assertEq(encoded, abi.encode(p), "manual encoding equals abi.encode(policy)");
        bytes32 expected = keccak256(encoded);
        assertEq(expected, PatchBondTypes.policyHash(p), "library hash");

        bytes32 returned = _create(p);
        assertEq(returned, expected, "returned hash");
        assertEq(registry.policyHashOf(p.campaignId), expected, "stored hash");
        assertEq(PatchBondTypes.policyHash(registry.policyOf(p.campaignId)), expected, "stored policy re-hashes");
    }

    function test_create_hashCommitsNewlyValidatedFields() public view {
        bytes32 h = PatchBondTypes.policyHash(_policy());
        PatchBondTypes.Policy memory m = _policy();
        m.campaign = attacker;
        assertTrue(PatchBondTypes.policyHash(m) != h, "campaign");
        m = _policy();
        m.sourceChainId += 1;
        assertTrue(PatchBondTypes.policyHash(m) != h, "sourceChainId");
        m = _policy();
        m.confirmations += 1;
        assertTrue(PatchBondTypes.policyHash(m) != h, "confirmations");
        m = _policy();
        m.evidenceRetention += 1;
        assertTrue(PatchBondTypes.policyHash(m) != h, "evidenceRetention");
        m = _policy();
        m.verifier = attacker;
        assertTrue(PatchBondTypes.policyHash(m) != h, "verifier");
    }

    function test_create_revertsOnDuplicateCampaignId() public {
        _createBase();
        PatchBondTypes.Policy memory p = _policy();
        _expectCreateRevert(p, abi.encodeWithSelector(ICampaignRegistry.CampaignAlreadyExists.selector, p.campaignId));
    }

    function test_create_duplicateIdWithMutatedTermsRevertsAndLeavesPolicyUntouched() public {
        bytes32 originalHash = _createBase();
        bytes memory originalPolicy = abi.encode(registry.policyOf(FIXTURE_CAMPAIGN_ID));

        PatchBondTypes.Policy memory m = _policy();
        m.grantAmount = FIXTURE_GRANT * 5;
        m.eligibilityRoot = keccak256("FIXTURE mutated root");
        _expectCreateRevert(m, abi.encodeWithSelector(ICampaignRegistry.CampaignAlreadyExists.selector, m.campaignId));

        // A different supplier cannot take over the same id either.
        PatchBondTypes.Policy memory other = _policy();
        other.supplier = attacker;
        other.challenger = attacker;
        _expectCreateRevert(other, abi.encodeWithSelector(ICampaignRegistry.CampaignAlreadyExists.selector, other.campaignId));

        assertEq(registry.policyHashOf(FIXTURE_CAMPAIGN_ID), originalHash, "hash unchanged");
        assertEq(abi.encode(registry.policyOf(FIXTURE_CAMPAIGN_ID)), originalPolicy, "policy unchanged");
    }

    function test_create_distinctIdsAreIndependent() public {
        _createBase();
        PatchBondTypes.Policy memory b = _policy();
        b.campaignId = FIXTURE_CAMPAIGN_ID_B;
        b.grantAmount = 5_000_000;
        _create(b);
        assertTrue(registry.policyHashOf(FIXTURE_CAMPAIGN_ID) != registry.policyHashOf(FIXTURE_CAMPAIGN_ID_B));
        assertEq(registry.requiredFundingOf(FIXTURE_CAMPAIGN_ID_B), 15_000_000);
        assertEq(registry.requiredFundingOf(FIXTURE_CAMPAIGN_ID), 60_000_000);
    }

    // ------------------------------------------------------------------ reads on unknown campaigns

    function test_reads_unknownCampaignRevertsOrIsEmpty() public {
        assertFalse(registry.campaignExists(FIXTURE_CAMPAIGN_ID));
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.CampaignNotFound.selector, FIXTURE_CAMPAIGN_ID));
        registry.policyOf(FIXTURE_CAMPAIGN_ID);
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.CampaignNotFound.selector, FIXTURE_CAMPAIGN_ID));
        registry.policyHashOf(FIXTURE_CAMPAIGN_ID);
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.CampaignNotFound.selector, FIXTURE_CAMPAIGN_ID));
        registry.requiredFundingOf(FIXTURE_CAMPAIGN_ID);
        assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0)));
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 0);
    }

    // ------------------------------------------------------------------ eligibility: positive

    function test_eligibility_leafMatchesPb03Helper() public view {
        // The tree in setUp is built from PatchBondTypes.eligibilityLeaf; confirm the double-hash shape explicitly.
        bytes32 inner = keccak256(abi.encode(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0]));
        assertEq(leaves[0], keccak256(bytes.concat(inner)));
    }

    function test_eligibility_isEligibleTrueForEachLeaf() public {
        _createBase();
        for (uint256 i = 0; i < 3; i++) {
            assertTrue(
                registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[i], recipients[i], _proof(i)),
                "eligible"
            );
        }
    }

    function test_eligibility_registerRecordsFixedRecipientAndEmits() public {
        _createBase();
        vm.expectEmit(true, true, true, true, address(registry));
        emit ICampaignRegistry.EligibleDeploymentRegistered(
            FIXTURE_CAMPAIGN_ID, depKeys[0], recipients[0], FIXTURE_SOURCE_CHAIN_ID, relayer1
        );
        _register(relayer1, 0);

        assertTrue(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[0]));
        assertEq(registry.recipientOf(FIXTURE_CAMPAIGN_ID, depKeys[0]), recipients[0]);
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 1);
        assertFalse(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[1]));
    }

    function test_eligibility_submitterDoesNotChangeRecipient() public {
        _createBase();
        _register(relayer1, 0); // relayer, not recipient, submits
        _register(recipients[1], 1); // recipient self-submits
        _register(supplier, 2); // supplier submits
        for (uint256 i = 0; i < 3; i++) {
            assertEq(registry.recipientOf(FIXTURE_CAMPAIGN_ID, depKeys[i]), recipients[i]);
        }
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 3);
    }

    function test_eligibility_independentDeploymentsRegisterInAnyOrder() public {
        _createBase();
        _register(relayer2, 2);
        _register(relayer1, 0);
        assertTrue(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[2]));
        assertTrue(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[0]));
        assertFalse(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[1]));
        _register(relayer1, 1);
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 3);
    }

    function test_eligibility_registrationNeverChangesPolicy() public {
        bytes32 h = _createBase();
        bytes memory before_ = abi.encode(registry.policyOf(FIXTURE_CAMPAIGN_ID));
        _register(relayer1, 0);
        vm.warp(block.timestamp + 365 days);
        _register(relayer2, 1);
        assertEq(registry.policyHashOf(FIXTURE_CAMPAIGN_ID), h);
        assertEq(abi.encode(registry.policyOf(FIXTURE_CAMPAIGN_ID)), before_);
    }

    function test_eligibility_sameDeploymentKeyInTwoCampaignsIsIndependent() public {
        // Campaign B reuses deploymentKey[0] and recipient[0] under its own id and root, so its leaf differs.
        _createBase();
        bytes32 leafB = PatchBondTypes.eligibilityLeaf(FIXTURE_CAMPAIGN_ID_B, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0]);
        PatchBondTypes.Policy memory b = _policy();
        b.campaignId = FIXTURE_CAMPAIGN_ID_B;
        b.eligibilityRoot = leafB; // single-leaf tree: empty proof
        b.eligibleCount = 1;
        _create(b);

        // A's proof does not work in B (leaf binds campaignId) and B's empty proof does not work in A.
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID_B, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0));
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], new bytes32[](0));

        _register(relayer1, 0);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID_B, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], new bytes32[](0));
        assertTrue(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[0]));
        assertTrue(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID_B, depKeys[0]));
    }

    // ------------------------------------------------------------------ eligibility: negative

    function test_eligibility_unknownCampaignReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.CampaignNotFound.selector, FIXTURE_CAMPAIGN_ID));
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0));
    }

    function test_eligibility_duplicateDeploymentSameSubmitterReverts() public {
        _createBase();
        _register(relayer1, 0);
        vm.prank(relayer1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICampaignRegistry.DeploymentAlreadyRegistered.selector, FIXTURE_CAMPAIGN_ID, depKeys[0], recipients[0]
            )
        );
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0));
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 1);
    }

    function test_eligibility_duplicateDeploymentDifferentSubmitterReverts() public {
        _createBase();
        _register(relayer1, 0);
        address[4] memory others = [relayer2, recipients[0], supplier, attacker];
        for (uint256 i = 0; i < others.length; i++) {
            vm.prank(others[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    ICampaignRegistry.DeploymentAlreadyRegistered.selector, FIXTURE_CAMPAIGN_ID, depKeys[0], recipients[0]
                )
            );
            registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(0));
        }
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 1);
    }

    function test_eligibility_substitutedRecipientFailsThenLegitRecipientStillRegisters() public {
        _createBase();
        vm.prank(attacker);
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], attacker, _proof(0));
        assertFalse(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[0]));

        // Another eligible recipient's address with this deployment's key is also rejected.
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[1], _proof(0));

        _register(relayer1, 0);
        assertEq(registry.recipientOf(FIXTURE_CAMPAIGN_ID, depKeys[0]), recipients[0]);
    }

    function test_eligibility_duplicateWithSubstitutedRecipientReverts() public {
        _createBase();
        _register(relayer1, 0);
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICampaignRegistry.DeploymentAlreadyRegistered.selector, FIXTURE_CAMPAIGN_ID, depKeys[0], recipients[0]
            )
        );
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], attacker, _proof(0));
        assertEq(registry.recipientOf(FIXTURE_CAMPAIGN_ID, depKeys[0]), recipients[0]);
    }

    function test_eligibility_zeroRecipientReverts() public {
        _createBase();
        vm.expectRevert(ICampaignRegistry.ZeroRecipient.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], address(0), _proof(0));
        assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], address(0), _proof(0)));
    }

    function test_eligibility_zeroDeploymentKeyReverts() public {
        _createBase();
        vm.expectRevert(ICampaignRegistry.ZeroDeploymentKey.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, bytes32(0), recipients[0], _proof(0));
        assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, bytes32(0), recipients[0], _proof(0)));
    }

    function test_eligibility_wrongSourceChainReverts() public {
        _createBase();
        vm.expectRevert(
            abi.encodeWithSelector(ICampaignRegistry.SourceChainMismatch.selector, 1, FIXTURE_SOURCE_CHAIN_ID)
        );
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, 1, depKeys[0], recipients[0], _proof(0));
        assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, 1, depKeys[0], recipients[0], _proof(0)));
    }

    function test_eligibility_emptyProofReverts() public {
        _createBase();
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], new bytes32[](0));
    }

    function test_eligibility_truncatedProofReverts() public {
        _createBase();
        bytes32[] memory full = _proof(0);
        bytes32[] memory cut = new bytes32[](1);
        cut[0] = full[0];
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], cut);
    }

    function test_eligibility_extendedProofReverts() public {
        _createBase();
        bytes32[] memory full = _proof(0);
        bytes32[] memory longer = new bytes32[](3);
        longer[0] = full[0];
        longer[1] = full[1];
        longer[2] = keccak256("FIXTURE junk node");
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], longer);
    }

    function test_eligibility_wrongDeploymentProofReverts() public {
        _createBase();
        // Proof for deployment 1 used with deployment 0's key and recipient.
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(1));
        // Deployment 1's key paired with deployment 0's recipient.
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[1], recipients[0], _proof(1));
    }

    function test_eligibility_tamperedProofNodeReverts() public {
        _createBase();
        bytes32[] memory p = _proof(0);
        p[0] = bytes32(uint256(p[0]) ^ 1);
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], p);
    }

    function test_eligibility_intermediateNodeAsLeafReverts() public {
        // Second-preimage guard: an internal node must not verify as a leaf (leaves are double-hashed).
        _createBase();
        bytes32 h01 = _pair(leaves[0], leaves[1]);
        bytes32[] memory p = new bytes32[](1);
        p[0] = leaves[2];
        // Presenting h01 as if it were a leaf cannot be expressed via the leaf constructor, so check the verifier
        // directly: no (key, recipient) pair hashes to h01.
        assertTrue(PatchBondTypes.eligibilityLeaf(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0]) != h01);
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, h01, recipients[0], p);
    }

    function test_eligibility_countCapRejectsExtraLeavesInOversizedRoot() public {
        // FIXTURE: supplier commits a 3-leaf root but declares eligibleCount = 1. Registry enforces the declared count.
        PatchBondTypes.Policy memory p = _policy();
        p.eligibleCount = 1;
        _create(p);
        _register(relayer1, 0);
        vm.prank(relayer1);
        vm.expectRevert(abi.encodeWithSelector(ICampaignRegistry.EligibleCountReached.selector, FIXTURE_CAMPAIGN_ID, 1));
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[1], recipients[1], _proof(1));
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 1);
    }

    function test_eligibility_failedRegistrationDoesNotConsumeState() public {
        _createBase();
        vm.prank(attacker);
        vm.expectRevert(ICampaignRegistry.InvalidEligibilityProof.selector);
        registry.registerEligibleDeployment(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], _proof(1));
        assertEq(registry.registeredCountOf(FIXTURE_CAMPAIGN_ID), 0);
        assertFalse(registry.isDeploymentRegistered(FIXTURE_CAMPAIGN_ID, depKeys[0]));
        _register(relayer1, 0);
    }

    function testFuzz_eligibility_randomRecipientNeverVerifies(address recipient) public {
        vm.assume(recipient != recipients[0] && recipient != recipients[1] && recipient != recipients[2]);
        _createBase();
        for (uint256 i = 0; i < 3; i++) {
            assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[i], recipient, _proof(i)));
        }
    }

    function testFuzz_eligibility_randomProofNeverVerifies(bytes32 a, bytes32 b) public {
        _createBase();
        bytes32[] memory p = new bytes32[](2);
        p[0] = a;
        p[1] = b;
        vm.assume(!(a == leaves[1] && b == leaves[2]));
        assertFalse(registry.isEligible(FIXTURE_CAMPAIGN_ID, FIXTURE_SOURCE_CHAIN_ID, depKeys[0], recipients[0], p));
    }
}
