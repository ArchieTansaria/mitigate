# PB-14 campaign policy — v1 draft

This document defines the immutable terms and evidence boundary for one supplier-funded remediation campaign. It is a policy specification, not consent to fund or deploy a campaign. The supplier must choose and approve every live value before campaign creation; the contract stores the selected values and does not permit edits after activation.

## Campaign terms

| Term | Required value and rule |
|---|---|
| `campaignId` | Unique `bytes32` identifier selected before creation. |
| Source / destination | Source is one supported application chain (initially Sepolia, chain ID `11155111`); destination is Arc Testnet (chain ID `5042002`). CCIP selectors are separate transport configuration. |
| Eligibility | `eligibilityRoot` commits to exactly `eligibleCount` unique `(sourceChainId, deploymentKey, recipient)` leaves using the PB-03 double-hashed leaf and sorted-pair Merkle proofs. The deployment key binds chain, entrypoint and optional market selector. |
| Grant `G` | One uniform USDC grant in integer base units. Arc USDC uses 6 decimals. `requiredFunding = eligibleCount × grantAmount`; no floating point and no representation as exact gas reimbursement. |
| Deadline `D` | Unix timestamp after which new claims are rejected. Must be in the future at activation. |
| Challenge window `W` | Nonzero fixed duration beginning when a valid claim is reserved. A challenge must arrive before that claim's original window ends. |
| Review bound `A` | Nonzero duration beginning when a challenge is recorded. Reviewer silence by its deadline rejects the claim and releases its reservation. |
| Receipt freshness | `issuedAt <= now <= expiresAt`; `expiresAt > issuedAt`; `now - issuedAt <= maxReceiptAge`; observed snapshot chain and timestamp must match the receipt and configured source domain. Required confirmations are an explicit policy input. |
| Roles | Supplier funds and may challenge; verifier signs scoped deployed-mode passing receipts; reviewer is an independent configured address. Supplier, verifier, reviewer and each recipient must be nonzero and role separation is required between supplier and reviewer. |
| Recipient | Fixed by the committed eligibility leaf. The submitter cannot substitute a recipient. |
| Policy / test pack | `repairPolicyHash` and `testPackHash` are nonzero content commitments pinned into the policy and receipt. |

The only published numeric example is the PB-03 **test fixture**: `eligibleCount = 3`, `grantAmount = 20_000_000` (20 USDC), and total fixture funding `60_000_000` base units. Its addresses, roots, timestamps, signer and signature are disposable test data. It is not an approved live campaign configuration. Production values are explicit supplier inputs; no fixture address or key is a default.

Campaign creation fixes all policy fields. Activation is permitted only when the campaign has received the full `N × G` amount from the configured supplier via the configured token. Partial funding never enables claims. Direct token transfers do not count as campaign funding. No term, eligibility, role, policy hash, recipient, grant or deadline can be edited after activation.

## Claim states and outcomes

An eligible deployment may be unclaimed, pending, disputed, rejected, awarded, or withdrawn. A valid receipt reserves exactly one `G` for that deployment. A failed, unknown, unsupported, stale, preview, diagnostic, incomplete or otherwise invalid receipt reserves nothing. One pending claim per deployment is allowed; after rejection, a fresh receipt may retry before `D`. Different deployments progress independently.

An unchallenged pending claim becomes withdrawable after `W`. A timely supplier challenge moves it to disputed. The reviewer may award exactly `G` or reject; reviewer timeout rejects and releases the reservation. Awarded funds are pull-withdrawable only by the committed recipient. After `D`, no new claim is accepted. Reserved and awarded amounts remain protected; supplier recovery is limited to unallocated funds after the applicable deadlines.

There is no maintainer bond, repair fee, slashing, penalty, or customer charge in this policy. Failed verification does not confiscate customer funds. The campaign is a grant budget and claim state machine, not a repair executor or security oracle.

## Required receipt checks

The consuming contract must enforce the frozen PB-03 EIP-712 schema and domain (`PatchBond`, version `1`, destination `block.chainid`, verifying contract = campaign). It must compare campaign ID and policy hash; source chain; deployment key and fixed recipient; test-pack hash; snapshot hash, chain, block and time; nonzero evidence digest and receipt ID; freshness and deadline; and verifier signature. Only `purpose=1` (campaign claim), `mode=1` (deployed) and `result=1` (pass) are claim eligible. Receipt IDs and deployments are replay protected. TypeScript validation is not an onchain security boundary.
