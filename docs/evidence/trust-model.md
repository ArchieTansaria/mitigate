# Campaign evidence and trust model

## Who can do what

| Actor | Authority |
|---|---|
| Supplier | Selects and funds immutable terms; challenges a pending claim before its original challenge cutoff; withdraws only unallocated funds after the cutoff. |
| Deployment owner / recipient | Performs and authorizes its own repair, proves eligibility, submits a receipt, and withdraws only its own awarded grant. |
| Verifier | Signs a fresh, scoped report for a specific deployed snapshot, policy, test pack, deployment and recipient. It cannot change campaign terms or move funds. |
| Reviewer | Resolves a timely challenge within the fixed review bound. It cannot change campaign terms or award more than the fixed grant. |
| Arc campaign contract | Enforces eligibility, signatures, uniqueness, deadlines, reservations, terminal outcomes and token accounting. It does not execute repairs or independently establish security. |

## What a receipt establishes

A valid EIP-712 signature establishes that the configured verifier signed the exact PB-03 receipt fields under the destination-chain/campaign domain. The fields bind a campaign and policy, source chain and deployment, recipient, test-pack hash, observed snapshot, evidence digest, purpose, mode, result, issue/expiry times and unique receipt ID. It does not prove that tests were honestly executed, that the report is complete outside the committed scope, or that the contract is secure. The evaluator and its execution environment remain explicit trust assumptions. Challenges and independent review make that trust inspectable; they do not make it trustless.

Only a fresh deployed-mode campaign-claim receipt with a passing result and every required assertion can reserve a grant. Diagnostic and preview evidence cannot settle a funded campaign. Missing, stale, unsupported, unavailable, failed, unknown or incomplete evidence never means pass. Source-chain observations and destination settlement state are separate facts.

## Challenge and timeout risk

The supplier may challenge only during the original `W` window. The independent reviewer must decide within `A`. Award credits exactly one grant; rejection or timeout releases exactly that reservation. Silence never awards funds. Reviewer timeout can disadvantage an honest customer by rejecting valid work; this is a known limitation of the bounded fallback. The UI and campaign documentation must make the challenge and review deadlines visible.

## Financial boundary

All grant values use integer USDC base units at the configured token decimals. The campaign activates only after the full `N × G` balance is received. Accounting must preserve `deposited = unallocated + reserved + awarded-unwithdrawn + paid + refunded`. No administrator sweep may take reserved or awarded funds. Supplier recovery is restricted to unallocated funds after claims close; pending or disputed claims retain their reservation. Token transfers use checks-effects-interactions and reentrancy protection.

There is no maintainer bond, repair fee, penalty or slashing in this MVP. A grant is a fixed allowance, not exact gas reimbursement. Campaign terms and eligibility cannot change after activation. Wallet owners authorize state changes from their own wallets; participant signing keys do not belong in the API or worker.

## Fixture boundary and live evidence

PB-03 vectors use disposable, clearly labeled addresses, a test-only signer and illustrative amounts. They validate encoding and signature behavior only. They are not live chain evidence, approved roles, token configuration, or consent to fund. Unit tests may use signed fixtures; live integration requires the real receipt producer, identical TypeScript/Solidity vectors, configured networks and actual transaction/state evidence. No test fixture bypass may exist in a live code path.
