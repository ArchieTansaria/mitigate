# Current decisions and build gates
Status: implementation baseline proposed from the agreed handbook; no coding performed.

## Product scope
PatchBond verifies one known repair against a configurable inventory of deployments, identifies failed conditions and responsible authorities, prepares optional transactions, rechecks actual deployed state, and optionally connects qualifying evidence to a funded milestone.

First supported family: a documented oracle adapter and one pinned OpenZeppelin transparent-proxy version. Sepolia is the inspected source chain; Arc testnet is settlement only. Two or three fixture instances demonstrate coverage; runtime logic must accept configurable inventory up to a measured configured limit.

Controlled regression: stale-price rejection plus valid-operation and unit/configuration checks. This is not a recreation or claim of prevention of the Bonzo incident. No arbitrary vulnerability discovery, universal proxy analysis, automatic upgrades, continuous warranty, AI-written security verdicts or multi-source-chain fleet in this version.

## Revisions to the handbook
- ENS is CONDITIONAL. It supports supplier release publication, not repair truth. Use it only after validating a real workflow and mentor fit; do not invent a dependency merely to call it central.
- Diagnostic verification is the core. Funded acceptance is optional for users and required for the intended Arc demo.
- Initial funded policy may set bond to zero. A nonzero bond is permitted only after its covered breaches, attribution, cap and arbiter rules are defined. Zero bond must require no artificial second transfer.
- No new sponsor replaces ENS without a recorded scope decision. Targeting three partners is not proof of qualifying for three.
- No assertion of winning all categories, prize stacking, production readiness or less competition.
- We keep the handbook's bounded F < D < R < C < A model; do not replace it with an ambiguous “release after some delay.”

## Chosen team structure
A = user and this agent: integration coordinator, schema/config owner, API/database/jobs, inspection and verification/evidence, eventual UI.
B = teammate and her agent: fixtures, product contracts, CRE/CCIP, sponsor execution evidence; conditional ENS.
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
No feature frontend until PB-24 backend handoff. Arc Studio must nevertheless be the starting point for Arc work. Its minimal generated app or integration smoke view is setup evidence, not permission to spend time designing screens. Resolve export/Git sync and external worker support before fixing the app hosting structure.
All Arc prizes require Studio as the starting point and a working frontend/backend; advanced stablecoin logic has further Studio contract workflow expectations. A locally built vault deployed to Arc is not by itself compliance. [Arc requirements](https://ethglobal.com/events/mumbai/prizes/arc)

## No fake runtime behavior
Allowed: named protocol constants, enums, pinned versions, deterministic test fixtures, explicit supported pattern lists, demo policy values chosen by participants.
Configuration: RPC URLs, chain IDs/selectors, deployed addresses, forwarders, permitted workflow identity, token addresses, test-pack hashes, artifact endpoints, resource limits and confirmation policies. Validate; fail closed if required configuration is missing. Test-only private keys never travel into testnet configuration.
Per agreement: inventory, parties, recipients, evaluator, deadlines, amounts, nonzero-bond clauses and policy identity. Freeze after consent.
Forbidden: if address equals fixture then pass; green badges from seed data; API booleans bypassing signatures; hidden mock fallback when sponsor calls fail; auto-changing deadlines; float token arithmetic; admin mark-pass/withdraw-all shortcuts.
No private keys, authenticated RPC URLs or tokens in Git, artifacts, screenshots, logs or browser bundles.

## Gates and unresolved decisions
G0: Studio workflow and external-worker arrangement verified; CRE access mode known; CCIP route tested; historical RPC and worker runtime tested.
G1: shared schema, signatures, canonical encoding, fixture ABI and snapshot policy frozen with cross-language test vectors.
G2: actual inspector produces fail/pass/unknown results with reproducible complete evidence.
G3: agreement and money invariants pass locally and source/destination route changes real state.
G4: backend handoff passes; frontend work opens.
G5: two-machine fresh run and sponsor-evidence audit pass.

Freeze before deposits: exact evaluator signing scheme, source approver addresses, Arc depositor/challenger/beneficiary identities, arbiter, fee, optional bond and caps, deadlines, finality/snapshot freshness policy, dispute reasons and evidence retention. Input from wallet owners/mentors may be required; never invent their consent.
ENS gate: mentor feedback and a useful release-publication scenario. If omitted, use a validated manifest selected and approved by the parties; do not claim ENS eligibility.
Live CRE blocked: retain correctly labelled CLI simulation and receiver integration tests. Do not use a hidden manual report adapter to claim a live end-to-end Chainlink settlement.
All gates describe future checks, not checks already passed.
