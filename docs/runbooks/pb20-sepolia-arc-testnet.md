# PB-20 Sepolia → Arc Testnet deployment preparation

**State: preparation only. No wallet transaction is signed or broadcast by this runbook.** This deploys the PB-15 registry, PB-16 verifier, PB-17/18/19 campaign, and PB-20 sender/receiver. It is separate from the artificial PB-07 oracle fixture.

## Checked network constants

| Network | Chain ID | CCIP selector | CCIP router |
| --- | ---: | ---: | --- |
| Ethereum Sepolia | `11155111` | `16015286601757825753` | `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` |
| Arc Testnet | `5042002` | `3034092155422581607` | `0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8` |

The Sepolia → Arc Testnet lane is listed as operational in the [Chainlink CCIP Explorer](https://ccip.chain.link/status?networkType=all&search=Sepolia); the checked Sepolia router probe is recorded in `docs/evidence/pb01-ccip-route.json`. Arc's testnet USDC ERC-20 is `0x3600000000000000000000000000000000000000` with 6 decimals per [Arc's indexing docs](https://docs.arc.io/integrate/infrastructure/indexing-events). Re-read the official directory and token docs immediately before deployment; these values can change.

## Configuration template

Copy `config/deployments/pb20-sepolia-arc-testnet.example.json` to an ignored local file. Fill only with confirmed public addresses, actual campaign terms, and public RPC URLs. Do not store keys, seed phrases, wallet passwords, or credential-bearing RPC URLs in the config or Git.

The policy tuple is frozen in `contracts/pb03/PatchBondTypes.sol`. Numeric terms are decimal strings and token amounts are USDC base units. The policy binds `sourceRegistry` to the predicted source sender and `campaign` to the predicted Arc campaign. Those CREATE addresses depend on each chain's current deployer nonce and exact transaction order; do not reuse local fixture addresses. The configuration must include the complete 22-field policy tuple, not only the compact summary fields in the example.

## Required transaction order

The address dependencies require a coordinated two-chain plan:

1. Choose a supplier EOA that will authorize Arc campaign creation/funding and a distinct verifier, reviewer, challenger, customer recipient, and reporter. Check role constraints from the policy. The verifier signing key remains outside Studio, this repo, and the CRE workflow.
2. Read and record the supplier/deployer nonce on both chains. Predict the Sepolia `CampaignMessageSender`, Arc `RemediationCampaign`, and Arc `CampaignMessageReceiver` CREATE addresses from the exact planned nonces.
3. On Arc, deploy `CampaignRegistry`, deploy `AcceptanceVerifier(registry)`, then call `createCampaign(policy)` as the configured supplier. The policy must contain the predicted Arc campaign address and predicted Sepolia sender as `sourceRegistry`.
4. Still on Arc, deploy `RemediationCampaign(registry, verifier, campaignId, USDC)` at the predicted campaign address. Deploy `CampaignMessageReceiver(ArcRouter, SepoliaSelector, predictedSender, SepoliaChainId, campaign, campaignId, policyHash, registry, queueLimits)` at the predicted receiver address.
5. On Sepolia, deploy `CampaignMessageSender(SepoliaRouter, ArcSelector, receiver, campaignId, policyHash, reporter)` at the predicted sender address. Verify all constructor bindings and the router's current supported-chain read.
6. As the supplier, register the actual eligible deployment and recipient using its actual Merkle proof. Fund exactly `eligibleCount × grantAmount` in 6-decimal USDC base units and activate only after the balance/accounting reads confirm full tracked funding.
7. Only after PB-21 produces real evidence and the configured verifier signs the exact PB-03 `AcceptanceReceipt`, have the authorized reporter call `quote` and then `send` with the router's exact native fee. Record source tx and CCIP transport message ID.
8. Verify destination callback transaction, receiver business-message status, `RemediationCampaign` claim, verifier consumption and final token/accounting reads. These reads, not a source log or a CCIP simulation, establish delivery.

## Why deployment is not ready to broadcast

The example deliberately has null role addresses, campaign ID, eligibility root/count, grant, policy/test-pack hashes, deadlines, public RPC URLs and contract addresses. There is also no eligible deployment/recipient proof, active funded campaign, PB-21 campaign-claim producer, or real signed receipt in the repo. A deployment with guessed values would permanently register incorrect immutable terms and could not verify a real claim.

Once the config is complete, prepare a dry-run transaction bundle, check chain IDs and predicted addresses, and show every constructor/call, calldata, value, fee, and expected role before requesting wallet authorization. Stop after that review. Do not add `--broadcast` or submit any wallet request until the user approves that exact bundle. No mainnet path is permitted.
