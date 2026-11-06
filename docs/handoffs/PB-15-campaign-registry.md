# PB-15 handoff: campaign registry

Scope: immutable campaign identity/terms and recipient-bound eligible-deployment Merkle proofs. Nothing else.

Files
- `contracts/pb15/ICampaignRegistry.sol`: read surface, events, errors for later contracts.
- `contracts/pb15/CampaignRegistry.sol`: implementation. Imports `contracts/pb03/PatchBondTypes.sol` unchanged.
- `contracts/test/CampaignRegistry.t.sol`: 67 Foundry tests (fixture data only, every value labeled `FIXTURE`).

Behavior
- `createCampaign(Policy)`: only `policy.supplier` may call. Rejects zero campaignId, supplier, campaign, verifier, challenger, reviewer, token, eligibilityRoot, repairPolicyHash, testPackHash; zero `sourceChainId` (`ZeroSourceChainId`); `destinationChainId != block.chainid`; `tokenDecimals != 6`; zero eligibleCount or grantAmount; `eligibleCount * grantAmount` overflow; `claimDeadline <= block.timestamp`; zero challengeWindow, reviewTimeout, maxReceiptAge, evidenceRetention (`ZeroDuration`); zero `confirmations` (`ZeroConfirmations`); `reviewer == supplier` (`RoleSeparationViolated`); `reviewer == verifier` (`ReviewerIsVerifier`); duplicate campaignId. `sourceRegistry` is the only address allowed to be zero (direct-signed mode).
- Stores the policy and `policyHash = PatchBondTypes.policyHash(policy)`. No setter, owner or edit path exists.
- `registerEligibleDeployment(campaignId, sourceChainId, deploymentKey, recipient, proof)`: permissionless relay. Leaf = `PatchBondTypes.eligibilityLeaf`, verified with a sorted-pair proof against `eligibilityRoot`. Recipient comes from the leaf, never `msg.sender`. Each `(campaignId, deploymentKey)` registers once, whoever submits. Registered count is capped at the policy's `eligibleCount`.
- Reads: `campaignExists`, `policyOf`, `policyHashOf`, `requiredFundingOf`, `isEligible` (pure proof check, never reverts), `isDeploymentRegistered`, `recipientOf`, `registeredCountOf`.

Notes for PB-16 and later
- Registration is not acceptance and holds no claim state. It does not check `claimDeadline`; the claim contract must enforce the deadline, receipt checks and one active claim per deployment.
- The registry does not require `reviewer != challenger`, or `verifier != supplier`. Add those in the campaign contract if wanted.
- The registry cannot confirm `policy.campaign` is the real campaign contract (it is only required to be nonzero). The campaign contract must still enforce `campaign == address(this)`.
- Interface errors added in this revision: `ReviewerIsVerifier(address)`, `ZeroSourceChainId()`, `ZeroConfirmations()`. `ZeroAddress("campaign")` and `ZeroDuration("evidenceRetention")` reuse existing errors.
- The PB-03 vectors file (`docs/interfaces/pb03-vectors.json`) was not in this workspace, so no frozen vector was re-checked here. Tests build leaves through `PatchBondTypes.eligibilityLeaf`.

Commands
- `forge test --match-contract CampaignRegistryTest`
- `forge test`
