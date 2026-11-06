# Current execution update — 2026-11-06
A completed the initial PB-03 Solidity/TypeScript foundation through Arc Studio and local verification at the user’s explicit request. B now starts PB-14 using docs/handoffs/PB-03-contracts.md. Earlier future-tense assignment/bootstrap text below is historical; STATUS.md and TASKS.md give current execution state. PB-04–07 are now implemented and CRE WASM capability simulation passes; the repair worker and product sponsor integration remain pending.

# Current decisions and build gates
Status: implementation baseline proposed from the agreed handbook; no coding performed.

## Product scope
PatchBond helps a supplier run a funded remediation campaign for customer-owned smart-contract deployments. The supplier publishes a fixed eligible-deployment set and repair policy, deposits a capped USDC grant per eligible deployment, and customers perform their own authorized repairs. PatchBond independently checks each deployed result; a valid, scoped receipt can reserve and release only that deployment's grant. One customer's incomplete repair does not block another customer's payout.

The MVP removes the mandatory maintainer bond, customer repair fee, slashing and penalties. Arc is the campaign budget/claim state machine, not the repair executor or a security oracle. The verifier signature attests to a result and evidence digest; it does not cryptographically prove honest test execution. Supplier challenge, independent review and a reviewer-timeout fallback remain explicit trust assumptions. Thirdweb’s December 2023 response says its tool mitigated over 9,800 contracts across 37 chains and offered retroactive gas grants subject to eligibility. This is evidence of a real vendor-funded remediation precedent, not proof of PatchBond demand; a retroactive grant also does not help a customer who cannot fund the initial repair transaction: [incident report](https://blog.thirdweb.com/vulnerability-report/), [mitigation tutorial](https://blog.thirdweb.com/security/contract-mitigation/).

First supported family: a documented oracle adapter and one pinned OpenZeppelin transparent-proxy version. Sepolia is the inspected source chain; Arc testnet is grant settlement. Three fixtures demonstrate an old implementation, repaired implementation and correct code with unsafe configuration. Runtime inventory is configurable within a measured limit.

Controlled regression: stale-price rejection plus valid-operation and unit/configuration checks. This is not a recreation or claim of prevention of the Bonzo incident. No arbitrary vulnerability discovery, universal proxy analysis, automatic upgrades, continuous warranty, AI-written security verdicts or multi-source-chain fleet in this version. Grants are fixed allowances, not exact gas reimbursement; retroactive grants do not solve a customer's inability to fund the initial repair transaction.

## Revisions to the handbook
- ENS is CONDITIONAL. It supports supplier release publication, not repair truth. Use it only after validating a real workflow and mentor fit; otherwise defer and remove the ENS eligibility claim.
- Per-deployment diagnostics and fresh verification are the core. The supplier-funded Arc campaign is the intended Arc demonstration and must be genuinely funded and functional on testnet; do not make the financial path mandatory for ordinary verifier use.
- No maintainer bond, customer repair fee, penalty or slashing in this MVP. No maintainer-liability adjudication system.
- Campaign eligibility is fixed before funding, e.g. a commitment/Merkle root over historical affected deployments and recipients. Fully fund N × G before activation. Each accepted claim reserves one fixed G; the contract never pays twice for the same campaign/deployment.
- Campaign terms, policy/test-pack hashes, role addresses and deadlines are immutable after activation. Claim, challenge and review deadlines are bounded; pending/disputed claims keep funds reserved. Reviewer silence rejects/releases the reservation and can harm an honest claimant; disclose this explicitly.
- Arc Studio CLI is the supported driver for the hosted Studio workspace. Codex may invoke it, provide reviewed files, and pull artifacts. Studio's hosted app/workspace is separate from the local repo. For Arc eligibility, contracts/app must actually be built/tested/deployed in Studio's workflow; local-only Arc deployment is insufficient. Exact treatment of CLI-driven sessions under “without leaving Studio” remains mentor-confirmable; preserve the project URL and CLI evidence.
- No assertion of winning all categories, prize stacking, production readiness or less competition.

## Chosen team structure
A = user and this agent: integration coordinator, schema/config owner, API/database/jobs, inspection and verification/evidence, eventual UI.
B = teammate and her agent: complete campaign contract stream PB-14–20 including prerequisites, Solidity half of PB-03 and Arc Studio build/test/deploy evidence. A additionally owns verifier fixtures, CRE and conditional ENS. B defines exact Solidity receipt/domain vectors; A implements matching TypeScript and the real receipt producer. Contract unit tests may precede backend integration; full integration remains gated on real evidence and matching vectors.
During frontend work B reviews chain-state interpretation and tests financial failure paths. A integrates shared interfaces and reviews B's backend APIs; B reviews A's evidence meaning and coverage.
Both people inspect financial and trust decisions. A human must remain able to explain the demo.

## Approaches considered
Chosen recommendation: one repo, separate clones, short-lived feature branches and shared schemas. Best fit for two agents whose components exchange signatures and financial messages.
Rejected as default: separate API/contracts repositories, because ABI/schema drift and cross-repo release coordination add work.
Rejected: both agents editing one working tree, because staging, checkout, lockfile and generated-file conflicts are avoidable.
The user delegated the work split; no teammate-specific language expertise is assumed.

## Proposed stack and why
| Component | Baseline | Boundary |
|---|---|---|
| Repository | pnpm workspace, TypeScript strict mode | Single dependency lockfile, written by A; B requests dependency changes |
| API/worker host | Node.js 24 LTS | Pin exact available patch at PB-00; not CRE's runtime |
| HTTP API | Fastify 5 with runtime schema validation | Small HTTP boundary and OpenAPI generation; validate compatibility at bootstrap |
| Shared schemas | Zod plus explicit canonical encoding module | Reject unknown versions, ambiguous numeric units and invalid domain IDs |
| Database | PostgreSQL + Drizzle migrations | One DB-backed job queue; no Redis/Kafka initially |
| Chain client | viem | Typed reads/transactions, shared ABI artifacts |
| Contracts/test runner | Solidity + Foundry + compatible pinned OpenZeppelin | Pin compiler/library/runner versions together; never float latest |
| Verification | Isolated container worker with Foundry subprocess | Resource/network limits; no arbitrary uploaded code execution |
| Artifacts | Versioned S3-compatible store; filesystem implementation for local development | Same artifact interface; content hashes verified |
| CRE | Supported TypeScript SDK and CLI template | Restricted WASM runtime; no Node-only worker imports |
| Messaging | Current supported CCIP 2.0 lane Sepolia to Arc testnet | Validate route, fees, receiver authentication and actual destination state |
| Frontend later | Arc Studio-compatible React/TypeScript app | Keep Studio's supported generated setup; Next.js is not a prerequisite |
| Validation | Vitest, Foundry, PostgreSQL integration tests, later Playwright | Real invariants and failure cases, not implementation-mirroring test counts |
| CI | GitHub Actions on PRs, secrets-free local tests by default | Live deployments/funding are separate explicitly initiated actions |

Versions above are proposed major lines, not installed versions. PB-00 records exact patches in lockfiles and tool-version configuration after compatibility tests. Node 24 is still listed LTS; we choose compatibility over automatically using the newest runtime. [Node release table](https://nodejs.org/en/about/previous-releases)
CRE has a separate WASM environment. [CRE runtime](https://docs.chain.link/cre/concepts/typescript-wasm-runtime)

## Backend-first interpretation
No feature frontend until PB-24 backend handoff. Arc Studio is used through its CLI as the hosted starting point for the Arc campaign/contracts; this is not merely a local Arc deployment. The verifier API/worker may remain a separately hosted backend if Studio can call it safely; prove this before fixing hosting. Use `arc-studio run --output json`, reviewed `--file` inputs, and `arc-studio pull` to maintain traceable source provenance. Keep share URL and Studio build/test/deploy evidence.
All Arc prizes require Studio as the starting point plus a working frontend/backend; the advanced stablecoin category specifically expects contracts to be written/tested/deployed and connected to the app in Studio. A local-only vault deployment is insufficient. Mentor-confirm whether CLI-mediated Codex work satisfies “without leaving Studio.” [Arc requirements](https://ethglobal.com/events/mumbai/prizes/arc)

## No fake runtime behavior
Allowed: named protocol constants, enums, pinned versions, deterministic test fixtures, explicit supported pattern lists, demo policy values chosen by participants.
Configuration: RPC URLs, chain IDs/selectors, deployed addresses, forwarders, permitted workflow identity, token addresses, test-pack hashes, artifact endpoints, resource limits and confirmation policies. Validate; fail closed if required configuration is missing. Test-only private keys never travel into testnet configuration.
Per campaign: supplier, eligibility snapshot/root, source chain, eligible recipients, fixed grant G, count N, fully funded N × G budget, verifier/reviewer, policy/test-pack hashes, deadlines and evidence freshness. Freeze before activation; no bond or customer repair fee.
Forbidden: if address equals fixture then pass; green badges from seed data; API booleans bypassing signatures; hidden mock fallback when sponsor calls fail; auto-changing deadlines; float token arithmetic; admin mark-pass/withdraw-all shortcuts.
No private keys, authenticated RPC URLs or tokens in Git, artifacts, screenshots, logs or browser bundles.

## Gates and unresolved decisions
G0: Studio workflow and external-worker arrangement verified; CRE access mode known; CCIP route tested; historical RPC and worker runtime tested.
G1: shared schema, signatures, canonical encoding, fixture ABI and snapshot policy frozen with cross-language test vectors.
G2: actual inspector produces fail/pass/unknown results with reproducible complete evidence.
G3: campaign and grant accounting invariants pass locally; if CCIP is retained, source/destination route changes real state.
G4: backend handoff passes; frontend work opens.
G5: two-machine fresh run and sponsor-evidence audit pass.

Freeze before deposits: receipt signer scheme, supplier/challenger/reviewer/recipient identities, eligible deployment snapshot, USDC address/decimals, N × G cap, claim/challenge/review deadlines, finality and evidence freshness, dispute reasons and retention. Input from wallet owners/mentors may be required; never invent consent. Use a fixed allowance rather than claiming exact gas reimbursement.
ENS gate: mentor feedback and a useful release-publication scenario. If omitted, use a validated manifest selected and approved by the parties; do not claim ENS eligibility.
Live CRE blocked: retain correctly labelled CLI simulation and receiver integration tests. Do not use a hidden manual report adapter to claim a live end-to-end Chainlink settlement.
All gates describe future checks, not checks already passed.
