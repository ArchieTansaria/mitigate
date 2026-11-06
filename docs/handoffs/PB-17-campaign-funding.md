# PB-17 handoff: supplier-funded escrow and full-funding activation

Scope: one campaign contract bound to one PB-15 registered policy, escrowing the supplier's USDC and activating once fully funded. No claims, challenges, refunds, receipt consumption, CCIP, deployment, UI, or credentials. PB-03, PB-15 and PB-16 sources are unchanged (checked: PB-03 sha256 `0fdffd05d6f0cd50c3bf8da00fc338240dd5f3599fc841b5b555f17898300a4e`; the four PB-15/PB-16 source files are byte-identical to the staged references).

## Official token reference (record only, never branched on)
- Source: Arc Docs, "Indexing events": https://docs.arc.io/integrate/infrastructure/indexing-events (also served as `.md`). Read 2026-11-06.
- Value: Arc Testnet USDC ERC-20 at `0x3600000000000000000000000000000000000000`, 6 decimals. The same page says the native USDC view (system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`) uses 18 decimals. Only the 6-decimal ERC-20 view is used here.
- This value is **not** in any PB-17 contract or test as a literal. The token is a constructor input that must equal `policy.token`; the supplier chooses it when registering the policy, and the deployer must re-check it against the current official docs before use. (The only `0x3600…` literal under `contracts/` is the frozen PB-03 vector's `token` field inside the PB-16 vector test, which is copied vector data and out of scope here.)

## Review result against PB-14, PB-15, PB-16
- Constructor binds exactly one registered policy: registry and verifier have code; `verifier.registry() == registry`; campaign exists; `destinationChainId == block.chainid`; `policy.campaign == address(this)`; `token == policy.token`; token has code and reports 6 decimals; PB-03 hash of the returned policy equals the registry's stored hash; `eligibleCount * grantAmount` equals the registry's `requiredFundingOf`.
- PB-14: full `N x G` funding before activation, partial funding never activates, direct transfers do not count, deadline must be in the future at activation (extra rule, see Limits).
- No fixture shortcuts: production files `contracts/pb15`, `pb16`, `pb17` contain no `Fixture`, `FIXTURE`, `vm.` or `forge-std` references and import nothing from `test/`. `RemediationCampaign` has no branch on any address value; its only environment reads are `block.chainid`, `block.timestamp`, `msg.sender` and `address(this)`. All fixtures (mock tokens, a hostile registry stand-in, a reentrant supplier) live in `contracts/test/pb17/`, and the only uses of the Arc USDC value in PB-17 tests build it without a literal to probe that nothing special happens at that address.
- No issue in the PB-17 contract needed fixing. Only tests were added.

## Files
- `contracts/pb17/IRemediationCampaign.sol`: reads, events, errors, `Accounting` struct.
- `contracts/pb17/RemediationCampaign.sol`: non-upgradeable escrow (OpenZeppelin 5.6.1 `SafeERC20`, `ReentrancyGuard`).
- `contracts/test/pb17/CampaignFunding.t.sol` (32 tests), `CampaignBinding.t.sol` (20 tests), `CampaignFundingBase.sol` (shared fixtures), `FixtureTokens.sol` (labeled mock tokens and registry stand-in).

## Behavior
- `fund(amount)`: supplier only; rejects zero, `amount > requiredFunding - funded`, and any call at or after `claimDeadline`. Effects first, then `safeTransferFrom` of exactly `amount`, then a balance-delta check (`FeeOnTransferDetected`). Any failure reverts the tracked funding too. `nonReentrant`.
- `activate()`: supplier only; requires tracked `funded == requiredFunding` (never the token balance), the deadline still ahead, and not already active. `nonReentrant`.
- Stable reads for PB-18/19: `policy`, `policyHash`, `campaignId`, `registry`, `verifier`, `token`, `supplier`, `requiredFunding`, `funded`, `remainingFunding`, `active`, `accounting`, `untrackedTokenBalance`.
- `accounting()` returns six static words in this order: `deposited, unallocated, reserved, awardedUnwithdrawn, paid, refunded`. Only the first two move in PB-17; the last four are the reserved PB-18/19 slots and are always zero. A test pins the selector, length (192 bytes) and order.
- No owner, upgrade path, sweep, rescue, withdrawal or refund. No `receive` or payable function.

## Stranded direct transfers
Tokens sent straight to the contract (by a donor or by the supplier) are not counted, cannot satisfy activation, do not break exact funding (deposits are measured by balance delta and checked against tracked funding), and cannot be withdrawn by anyone, before or after activation or the deadline. `untrackedTokenBalance()` reports them. PB-18/19 should not treat them as unallocated funds unless a deliberate, reviewed recovery path is added. Native value cannot be sent to the contract through its functions or an empty call (reverts). Forced native transfers (such as from a self-destructing contract) cannot be refused by any contract.

## Commands and actual results (Studio sandbox, forge 1.7.1, solc 0.8.28, evm cancun, 2026-11-06)
```
$ forge test --match-path 'contracts/test/pb17/*'
Ran 20 tests for contracts/test/pb17/CampaignBinding.t.sol:CampaignBindingTest
Suite result: ok. 20 passed; 0 failed; 0 skipped
Ran 32 tests for contracts/test/pb17/CampaignFunding.t.sol:CampaignFundingTest
Suite result: ok. 32 passed; 0 failed; 0 skipped
Ran 2 test suites: 52 tests passed, 0 failed, 0 skipped (52 total tests)

$ forge test
Ran 6 test suites: 188 tests passed, 0 failed, 0 skipped (188 total tests)
  PB-15 CampaignRegistryTest 67, PB-16 AcceptanceVerifierScopeTest 41, AcceptanceVerifierSignatureTest 20,
  AcceptanceVerifierVectorTest 8, PB-17 CampaignBindingTest 20, CampaignFundingTest 32

$ bun run check
Found 0 warnings and 0 errors. (oxlint, twice) then tsc --noEmit: no errors
```

## Coverage of the required cases
- Fee-on-transfer: `test_feeOnTransferTokenIsRejectedAndNothingIsCounted` (1% fee token; nothing counted, balances unchanged).
- False return: `test_tokenReturningFalseReverts` (`SafeERC20FailedOperation`).
- Reentrancy: `test_reentrantFundFromTokenHookIsBlocked` (token hook re-enters `fund`; blocked with `ReentrancyGuardReentrantCall`, only the outer deposit counted).
- Direct transfers: `test_directTransferIsNotCounted`, `..ByTheSupplierIsAlsoNotCounted`, `test_donationBeforeAndAfterFundingDoesNotChangeTrackedAmounts`, `test_strandedDirectTransfersStayStrandedThroughActivationAndDeadline`, `test_directTransferToOneCampaignDoesNotAffectAnother`, `test_noWithdrawalPathExists`, `test_nativeValueSendsRevert`.
- Allowance and balance: `test_missingAllowanceReverts`, `test_allowanceOneUnitShortReverts`, `test_allowanceIsConsumedExactly`, `test_insufficientBalanceReverts`.
- Under/over funding and exact activation: `test_underfundedByOneBaseUnitCannotActivate`, `test_singleDepositAboveRequiredReverts`, `test_depositExceedingRemainderByOneReverts`, `test_anyDepositAfterFullFundingReverts`, `testFuzz_fundNeverExceedsRequired`, `test_fundExactAmountInOneDepositThenActivate`, `test_splitDepositsSumExactlyAndTrackProgress`, `test_activateTwiceReverts`, `test_zeroAmountReverts`.
- Campaign isolation: `test_campaignsAreIsolated` (same token, different suppliers), `test_directTransferToOneCampaignDoesNotAffectAnother`.
- Supplier-only, deadline, chain/policy/token/decimals/hash/funding mismatches: see `CampaignFunding.t.sol` and `CampaignBinding.t.sol`.
- No hardcoded token address: `test_behaviorDoesNotDependOnWhatLivesAtTheOfficialUsdcAddress`, `test_officialAddressIsAcceptedOnlyWhenPolicyNamesItAndItReportsSixDecimals`, `test_campaignBindsWhateverTokenThePolicyNamesAtAnyAddress` (behavioral), and `test_rawTokenAddressBytesAreNotEmbeddedInCampaignCode` (tripwire only: the optimizer can compile a constant like this into shift arithmetic, which a raw byte scan cannot see; the behavioral tests are the evidence).

## Mutation spot checks (one change at a time, count of distinct failing tests, file restored afterwards)
Skip-decimals-check-for-official-address branch 1; skip-token-match-for-official-address branch 1; `receive()` added 1; overfund check removed 4; fee-on-transfer check removed 1; `nonReentrant` on `fund` removed 1; activation reading token balance 2; supplier check on `fund` removed 2; supplier check on `activate` removed 1; `campaign == address(this)` check removed 2; `token == policy.token` check removed 2; decimals check removed 2; zero-amount check removed 1. Making `fund` or `activate` payable fails at compile time because the interface declares them non-payable. An unused external function returning the official address literal was not caught by the raw byte tripwire (the optimizer encodes it as shifts), which is why the behavioral tests exist.

## Limits
- Extra rule from the PB-14 policy: activation requires the claim deadline in the future, and `fund` is refused from the deadline on. A campaign partly funded when the deadline passes keeps those tokens with no exit until a later task adds recovery of unallocated funds.
- PB-17 has no refund path; a deposit within the allowed range cannot be reversed until then.
- Blocklist or pause behavior of the real token can block deposits for a blocked supplier. Tests cover plain ERC-20 behavior only.
- Rebasing and other non-standard tokens are rejected or unsupported. The 6-decimal check trusts what the token reports; the registry's `tokenDecimals` field is also required to be 6 but is not what the campaign checks.
- The campaign address must be known before the policy is registered (use CREATE2 or a computed CREATE address). Deploy only `RemediationCampaign`; the `Fixture*` and probe contracts in `contracts/test/pb17/` are test-only.
- Receipt consumption and claim state belong to PB-18; `consumeReceipt` on the verifier only works when this contract is `policy.campaign`.
- Nothing deployed, funded or signed; all roles and tokens in tests are labeled fixtures.
