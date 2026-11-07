# Current execution update — 2026-11-06
A completed the initial PB-03 Solidity/TypeScript foundation through Arc Studio and local verification at the user’s explicit request. B now starts PB-14 using docs/handoffs/PB-03-contracts.md. Earlier future-tense assignment/bootstrap text below is historical; STATUS.md and TASKS.md give current execution state. PB-04–11 now implement the local diagnostic API/inspection/execution/signing/worker/replay pipeline. CRE WASM capability simulation passes; product sponsor/financial integration and physical second-machine proof remain pending.

# Current decisions and build gates
Status: design baseline plus recorded implementation decisions. Current implemented behavior and remaining gates are in root STATUS.md, TASKS.md and memory/context/01-project-snapshot.md.

## Product decision — 2026-11-07: remove ENS integration from active scope
The owner has removed ENS from the active PatchBond plan. Do not build, configure, deploy, or claim ENS integration or sponsor eligibility. Existing PB-13 code, tests, and notes remain historical repository material only. The active integration targets are Arc Studio/Arc campaign settlement and Chainlink CRE plus CCIP, with simulation and live evidence kept distinct.

## Product scope
PatchBond helps a supplier run a funded remediation campaign for customer-owned smart-contract deployments. The supplier publishes a fixed eligible-deployment set and repair policy, deposits a capped USDC grant per eligible deployment, and customers perform their own authorized repairs. PatchBond independently checks each deployed result; a valid, scoped receipt can reserve and release only that deployment's grant. One customer's incomplete repair does not block another customer's payout.

The MVP removes the mandatory maintainer bond, customer repair fee, slashing and penalties. Arc is the campaign budget/claim state machine, not the repair executor or a security oracle. The verifier signature attests to a result and evidence digest; it does not cryptographically prove honest test execution. Supplier challenge, independent review and a reviewer-timeout fallback remain explicit trust assumptions. Thirdweb’s December 2023 response says its tool mitigated over 9,800 contracts across 37 chains and offered retroactive gas grants subject to eligibility. This is evidence of a real vendor-funded remediation precedent, not proof of PatchBond demand; a retroactive grant also does not help a customer who cannot fund the initial repair transaction: [incident report](https://blog.thirdweb.com/vulnerability-report/), [mitigation tutorial](https://blog.thirdweb.com/security/contract-mitigation/).

First supported family: a documented oracle adapter and one pinned OpenZeppelin transparent-proxy version. Sepolia is the inspected source chain; Arc testnet is grant settlement. Three fixtures demonstrate an old implementation, repaired implementation and correct code with unsafe configuration. Runtime inventory is configurable within a measured limit.

Controlled regression: stale-price rejection plus valid-operation and unit/configuration checks. This is not a recreation or claim of prevention of the Bonzo incident. No arbitrary vulnerability discovery, universal proxy analysis, automatic upgrades, continuous warranty, AI-written security verdicts or multi-source-chain fleet in this version. Grants are fixed allowances, not exact gas reimbursement; retroactive grants do not solve a customer's inability to fund the initial repair transaction.

## Revisions to the handbook
- PB-13 is retired; its prior local release-publication client is historical and not part of active product scope.
- Per-deployment diagnostics and fresh verification are the core. The supplier-funded Arc campaign is the intended Arc demonstration and must be genuinely funded and functional on testnet; do not make the financial path mandatory for ordinary verifier use.
- No maintainer bond, customer repair fee, penalty or slashing in this MVP. No maintainer-liability adjudication system.
- Campaign eligibility is fixed before funding, e.g. a commitment/Merkle root over historical affected deployments and recipients. Fully fund N × G before activation. Each accepted claim reserves one fixed G; the contract never pays twice for the same campaign/deployment.
- Campaign terms, policy/test-pack hashes, role addresses and deadlines are immutable after activation. Claim, challenge and review deadlines are bounded; pending/disputed claims keep funds reserved. Reviewer silence rejects/releases the reservation and can harm an honest claimant; disclose this explicitly.
- Arc Studio CLI is the supported driver for the hosted Studio workspace. Codex may invoke it, provide reviewed files, and pull artifacts. Studio's hosted app/workspace is separate from the local repo. For Arc eligibility, contracts/app must actually be built/tested/deployed in Studio's workflow; local-only Arc deployment is insufficient. Exact treatment of CLI-driven sessions under “without leaving Studio” remains mentor-confirmable; preserve the project URL and CLI evidence.
- No assertion of winning all categories, prize stacking, production readiness or less competition.

## Chosen team structure
A = user and this agent: integration coordinator, schema/config owner, API/database/jobs, inspection and verification/evidence, eventual UI.
B = teammate and her agent: complete campaign contract stream PB-14–20 including prerequisites, Solidity half of PB-03 and Arc Studio build/test/deploy evidence. A additionally owns verifier fixtures and CRE. B defines exact Solidity receipt/domain vectors; A implements matching TypeScript and the real receipt producer. Contract unit tests may precede backend integration; full integration remains gated on real evidence and matching vectors.
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
ENS is removed from the active MVP by the 2026-11-07 product decision above. It is not a release gate.
Live CRE blocked: retain correctly labelled CLI simulation and receiver integration tests. Do not use a hidden manual report adapter to claim a live end-to-end Chainlink settlement.
All gates describe future checks, not checks already passed.


## PB-12 implementation decision — 2026-11-07
Unsigned repair support is intentionally exact-family and EOA-only. Use compiler-emitted storage layouts and verified local source hashes for the known inherited V1/V2 pair, with identical Initializable source and no initializer call. This avoids pretending to support generic upgrades without their full metadata/authority analysis. Unsupported paths, source changes, ownership transfers and pause changes require manual review. Cost: many real-world multisig/governance upgrades still require manual tooling.

Current-state simulation and revalidation reduce stale proposals but do not embed an atomic state predicate in the owner transaction. Wallet simulation and a fresh normal diagnostic after execution remain required. Code handles expired-during-RPC and malformed current simulation results by rejecting readiness; no transaction receipt directly marks a repair passed. This scope retains the existing PB-03 financial boundary and does not touch B's hosted Studio workspace.

## Frontend execution update — 2026-11-07
The user explicitly requested the remaining Orryn frontend now, keeping the supplied dark/orange visual design. PB-25/26 local frontend implementation proceeds against existing diagnostic endpoints and actual campaign contract ABIs before PB-24 is complete. This supersedes the earlier blanket wait-to-build-UI rule, not the requirement for real integration evidence. Missing configuration and unavailable financial receipts must remain explicit. Local frontend work does not establish the Studio frontend/backend requirement, testnet deployment or live CRE/CCIP settlement.

Browser sessions use a same-origin Next.js bridge and HttpOnly cookies. Offchain sign-in requires the source chain; campaign actions use the separately configured settlement chain and the wallet's actual onchain authority. There is no browser private key. The primary public brand is Orryn; internal PatchBond protocol/domain names are unchanged to preserve signatures and contracts.

## Recording simulation — 2026-11-07
The user explicitly requested a quick hardcoded/simulated video walkthrough. Add a standalone `/demo` route with persistent simulation disclosure and a matching script. Fictional customer names, checks and money states are presentation fixtures only. They do not flow through production APIs, generate signatures, create explorer links or alter acceptance/claim rules. This is an exception for a visibly labelled demo, not authorization to silently fake real integration evidence.

## Editable sample workspace — 2026-11-07
The user requested JSON input and a complete backend-free recording workflow. Extend the labelled presentation exception with `/demo/workspace`, keeping state in browser storage and separate from production adapters. No fabricated receipts, signatures, transaction hashes or live sponsor assertions. Results depend on sample input fields; settlement and time advancement are explicit simulations.
