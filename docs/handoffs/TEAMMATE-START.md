# Teammate handoff — build the Arc campaign module

## Assignment
You and your agent own the complete campaign contract stream: PB-14 -> PB-15 -> PB-16 -> PB-17 -> PB-18 -> PB-19, then PB-20 contracts. Start with the prerequisites in this stream, not PB-17 alone. This is implementation work; no separate audit-only assignment.

A (project owner + Codex) owns toolchain, verifier fixtures, API/worker, offchain evidence and receipt production, TypeScript schemas, CRE, conditional ENS and later frontend integration. A does not concurrently edit your campaign contracts.

## Read first, then implement
Read AGENTS.md, docs/planning/DECISIONS.md, docs/planning/INTERFACES.md, STATUS.md, memory/features/INDEX.md and the PB-03/PB-14–20 task cards in IMPLEMENTATION_PLAN.md. Read handbook sections as needed; older bond/fee wording is superseded. Do not spend a separate phase auditing the whole repository.

## Use Arc Studio for the actual build
Existing project: https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52
App ID: 9dee5ecd-ab62-459b-a54f-5ae7b2f06a52

Use your own authorized Studio account/access. Never copy the owner's CLI credentials. Start with `pnpm exec arc-studio agent-guide`, check authentication and access to this app, then drive this existing hosted project using the documented CLI commands. The CLI sends work to Studio; it is not a local-only Solidity compiler. If project access is missing, report that specific blocker rather than making a duplicate project or claiming Studio execution.

Build and test the Arc campaign contracts in this hosted Studio project, deploy the intended testnet contracts through its workflow when configured, preserve build/test/deploy evidence and pull reviewed source into your Git branch. Exclude credentials and .env files from pulls/commits. The existing generated CCIP receiver is context, not a completed campaign or proof of live delivery. Inspect it when integrating messaging; it does not block writing the campaign.

Studio project existence is confirmed; campaign implementation/deployment is not. Exact bounty interpretation remains subject to sponsor rules/mentor guidance. CLI use alone is not proof that the application was built in Studio.

## Start sequence and handoff boundary
1. As the contract portion of PB-03, turn the campaign/receipt specification in INTERFACES.md into exact Solidity structs, type hashes, domain rules and machine-readable signing/hash vectors. Save them under contracts/ and docs/handoffs/PB-03-contracts.md. Send that commit to A; A implements matching TypeScript encoding. Do not silently change the agreed semantics.
2. PB-14: specify campaign terms, eligibility, grant amount, deadlines and supplier/verifier/reviewer roles. You own docs/policies/demo-policy.md and docs/evidence/trust-model.md; A owns matching packages/schema tests. Test wallets and amounts must be explicitly labelled fixtures; live roles remain configured inputs.
3. PB-15: implement immutable campaign identity/eligibility and recipient binding. Implement the registry/term interfaces required by the campaign; source-chain messaging integration can follow.
4. PB-16: implement onchain verification of scoped signed receipts, expiry and replay defenses. Use real signatures produced with test-only keys in contract tests. PB-10 is required for end-to-end real evidence, not for writing/testing signature validation.
5. PB-17: implement supplier-funded USDC escrow and full-funding activation; confirm token/runtime facts before live testnet execution. Do not wait for CRE/CCIP feasibility to finish unit-tested campaign logic.
6. PB-18/19: implement individual claim reservations, settlement, recipient withdrawals, challenges, bounded review, unused-fund refunds and accounting invariants.
7. PB-20: integrate authenticated source/destination messaging after route feasibility. A owns CRE workflow; coordinate its output with your receiver interface.

A backend is not required to unit-test these contracts. Tests may use labelled token/signature fixtures, never a runtime bypass or fabricated live evidence. Live acceptance integration requires A's real reports, identical TS/Solidity vectors, configured networks and actual transaction evidence. Keep local contract completion and live integration completion separate in task status.

## Owned files and collaboration
Own contracts/ (campaign, acceptance and messaging), docs/policies/demo-policy.md, docs/evidence/trust-model.md and your per-task handoffs. A owns packages/, services/, workflows/, integrations/ens/, fixture contracts under fixtures/, root lockfile/config and shared status files. Use a separate clone and feature branch. Do not share a local checkout or run two writers against the same hosted Studio files. A coordinates any later Studio app changes with you.

Export ABI, exact receipt schema/domain/hash vectors and deployment metadata for A. Request root dependency changes from A. Read updated interfaces before each dependent feature. Commit each meaningful tested feature with its PB ID; one task may have several commits. Record validation honestly in docs/handoffs/PB-NN.md and a feature memory note; A reconciles TASKS.md/STATUS.md. Do not mark integration done merely because tests use fixtures.

## Product rules
Supplier-funded fixed grants for historically eligible customer-owned deployments. Customer authorizes its own repair. A fresh passing receipt can reserve only that deployment's grant; one customer cannot block another. No maintainer bond, customer repair fee, penalty or slashing. Preserve immutable terms, full funding, unique recipient-bound payouts and reserved/awarded balances. A signature identifies an attestor; it does not prove that security tests were honestly run.
