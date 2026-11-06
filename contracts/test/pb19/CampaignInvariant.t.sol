// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PatchBondTypes} from "../../pb03/PatchBondTypes.sol";
import {RemediationCampaign} from "../../pb17/RemediationCampaign.sol";
import {IRemediationCampaign} from "../../pb17/IRemediationCampaign.sol";
import {ClaimBase} from "../pb18/ClaimBase.sol";

/// @notice PB-19 sequence fuzzing: every successful or reverted operation must preserve the escrow identity.
contract CampaignInvariantTest is ClaimBase {
    function testFuzz_accountingIdentityAcrossArbitrarySequences(bytes32 seed) public {
        for (uint256 step = 0; step < 32; ++step) {
            uint256 word = uint256(keccak256(abi.encode(seed, step)));
            uint256 index = (word >> 8) % depKeys.length;
            uint256 operation = word % 7;
            vm.warp(block.timestamp + ((word >> 16) % 3 days));

            if (operation == 0) {
                PatchBondTypes.AcceptanceReceipt memory r = _receipt(ID_C, index);
                r.receiptId = keccak256(abi.encode("FIXTURE PB-19 fuzz receipt", seed, step));
                r.issuedAt = uint64(block.timestamp - 1);
                r.expiresAt = uint64(block.timestamp + 200);
                bytes memory sig = _sign(claimCampaign, r);
                bytes32[] memory proof = _proofFor(ID_C, index);
                vm.prank(relayer);
                try claimCampaign.submitClaim(r, sig, proof) {} catch {}
            } else if (operation == 1) {
                vm.prank(supplierA);
                try claimCampaign.challengeClaim(depKeys[index], keccak256(abi.encode(seed, step))) {} catch {}
            } else if (operation == 2) {
                vm.prank(reviewer);
                try claimCampaign.resolveChallenge(depKeys[index], (word & 0x100) != 0) {} catch {}
            } else if (operation == 3) {
                try claimCampaign.expireChallenge(depKeys[index]) {} catch {}
            } else if (operation == 4) {
                try claimCampaign.finalizeClaim(depKeys[index]) {} catch {}
            } else if (operation == 5) {
                vm.prank(recipients[index]);
                try claimCampaign.withdrawGrant(depKeys[index]) {} catch {}
            } else {
                vm.prank(supplierA);
                try claimCampaign.recoverUnallocated() {} catch {}
            }

            _assertIdentity(claimCampaign);
        }
    }

    function test_accountingIdentityAtEveryHappyPathTransition() public {
        PatchBondTypes.AcceptanceReceipt memory r = _claimAs(relayer, 0);
        _assertIdentity(claimCampaign);

        vm.prank(supplierA);
        claimCampaign.challengeClaim(depKeys[0], keccak256("FIXTURE invariant challenge"));
        _assertIdentity(claimCampaign);

        vm.prank(reviewer);
        claimCampaign.resolveChallenge(depKeys[0], true);
        _assertIdentity(claimCampaign);

        vm.prank(recipients[0]);
        claimCampaign.withdrawGrant(depKeys[0]);
        _assertIdentity(claimCampaign);
        assertTrue(verifier.isConsumed(ID_C, r.receiptId));
        assertEq(claimCampaign.accounting().paid, GRANT);

        vm.warp(registry.policyOf(ID_C).claimDeadline);
        vm.prank(supplierA);
        claimCampaign.recoverUnallocated();
        _assertIdentity(claimCampaign);
        assertEq(claimCampaign.accounting().refunded, REQUIRED - GRANT);
    }
}
