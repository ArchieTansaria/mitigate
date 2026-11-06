# PatchBond implementation plan

> For agentic workers: the user has authorized implementation. Follow the current module ownership below; use the available task-by-task execution workflow (superpowers:executing-plans or superpowers:subagent-driven-development when available). A teammate without those skills follows the same task tests/review/commit cycle. No skill installation is required to understand this plan.

**Goal:** Help a supplier run a funded USDC remediation campaign for customer-owned deployments, paying a capped grant only after each deployment independently passes the agreed repair checks.
**Architecture:** Offchain verifier inspects a bounded, eligible deployment inventory and issues fresh, scoped evidence; the customer executes repairs under its own authority. A supplier-funded Arc campaign reserves one fixed grant per eligible deployment and releases it after a valid receipt and bounded challenge path. CRE coordinates external evidence and supported chain reads; CCIP delivers authenticated acceptance facts where the live route is feasible. ENS remains conditional.
**Tech stack:** Proposed stack in DECISIONS.md; exact version pins are PB-00 output.
**Spec:** DECISIONS.md, INTERFACES.md, and relevant HANDBOOK.md sections.

## Current execution checkpoint (2026-11-06)
PB-01 Studio CLI build/test/pull is verified; CRE needs account login and real CCIP delivery is pending PB-20. PB-02 has implemented/tested historical RPC and isolated container probes, with successful Arc/Sepolia reads. PB-03 campaign/receipt types, validation, vectors and Solidity/TS parity are implemented by A at the user’s explicit request. B can start PB-14 using docs/handoffs/PB-03-contracts.md. Do not redo the shared interfaces. This does not mark the full financial campaign or live CRE/CCIP path complete.

## Global constraints
Backend first. Implementation is authorized. One supported proxy/application family, configurable inventory, one source chain per initial run. No arbitrary uploaded execution, global security claim, owner keys in worker, fake runtime outputs or silent mock fallback.
A owns API/verifier/schema/config, verifier fixtures, CRE, conditional ENS and eventual UI. B owns campaign/acceptance/messaging contracts PB-14–20 and their prerequisites. B authors Solidity encoding vectors; A implements matching TypeScript. Joint review of schema and financial invariants.
Arc Studio provenance starts before Arc-targeted development. Live and simulated execution are distinct.
Each deployment is evaluated and paid independently; one customer’s incomplete repair never blocks another customer. Campaign terms, eligibility snapshot, repair-policy hash, test-pack hash, recipient, grant cap and deadlines are fixed before funding. No customer repair fee, maintainer bond, or financial penalty is part of this MVP. A valid receipt is an authorized attestation to evidence, not cryptographic proof that a test was honestly run. Direct Arc claim/challenge/withdrawal paths and bounded timeout exits must work without the verifier/API.
Protocol constants/test fixtures are named; addresses, endpoints and policy values are inputs/configuration. No runtime branches keyed to demo addresses.

## Review focus
1. Authority differs across chains or inside a proxy pattern, or a verifier attestation is mistaken for an objective security proof: PB-03/08/14/16/20.
2. A passing preview, stale snapshot, omitted deployment or paused app masquerades as completion: PB-07/09/10/21/23.
3. Timely accepted claims race campaign refunds, or pending claims lose their reserved grant: PB-18/20.
4. Partial funding, duplicate claims/receipts, replayed evidence or accounting drift strand/create funds: PB-17/19/20.
5. Backend disappearance, endpoint abuse or cross-tenant requests undermines evidence/exits: PB-06/23/24.

## How to use each task card
Historical task checklists remain detailed acceptance criteria; current completion and remaining integration gates are recorded in TASKS.md and per-task handoffs. File paths are relative to the future repo. Braced paths are shorthand for individual files, not literal filenames.
For behavior tasks: write the stated failing checks, implement the bounded change, run the command and inspect output, then review and commit explicit owned paths. Probe/documentation tasks record reproducible observations instead of unnecessary unit tests.
Commands are target interfaces established at PB-00, not scripts available in this planning directory. Use actual generated CLI syntax/version from the probe when no stable command is pinned. Success is the stated behavioral observation, not merely exit code zero.
Commit examples include task IDs; split a large task into multiple passing focused commits if useful. Never mark the task done until relevant evidence, review and merge exist.
Shared files mentioned by a later non-owner require an owner-authored prerequisite PR or explicit reassignment; they are not permission for concurrent writes.

## Dependency order and current two-agent split
This split supersedes earlier numeric-range and audit-first assignments. See docs/handoffs/TEAMMATE-START.md.
- A: PB-00/PB-02 and TypeScript half of PB-03, PB-04–12 (including PB-07 fixtures), PB-21 CRE, conditional PB-13 ENS, PB-22–28 backend integration/UI.
- B: establish access to the existing Studio app as setup within PB-01; implement Solidity structs/signing vectors as the contract half of PB-03, then PB-14 -> PB-15 -> PB-16 contract validation -> PB-17 -> PB-18 -> PB-19 -> PB-20 contracts. B owns these missing prerequisites; PB-17/18 are not standalone start-ready tasks.
- B owns campaign policy/trust docs; A owns corresponding TypeScript schema validation. B publishes contract types/vectors in docs/handoffs/PB-03-contracts.md; A consumes them. Exact encoding parity is required before integration, not completion of the entire backend before contract unit tests.
- PB-01 is split by capability: B owns Studio setup and contract/runtime facts; A owns CRE feasibility; B tests the CCIP contract route with A. Unrelated CRE/CCIP probes do not block writing campaign contracts.
- PB-10 real evidence is required for PB-16 end-to-end acceptance, not for implementing and unit-testing its signature validator. Label fixtures and incomplete integration explicitly; no fixture bypass in live paths.
- PB-17 still requires PB-14 terms, PB-15 registry interfaces and verified token/runtime configuration for live execution. PB-18 still requires PB-16 contract validator and PB-17 funding. These dependencies are built by B in order.
- A and B implement in separate clones and owned files. B is the active writer for the hosted Studio contract workspace; coordinate later Studio UI changes to prevent concurrent overwrites.
- Integration requires matching TS/Solidity vectors, real backend evidence, real sponsor transactions and actual contract state. Unit-test completion does not establish end-to-end completion.

## Scope priority
Core: complete diagnostics, actual per-deployment repair recheck, truthful evidence, and safe supplier-funded grant lifecycle.
Arc is a remediation-funding and distribution layer, not a repair executor or security oracle. The supplier funds grants; deployment owners perform repairs and authorize transactions. The contract enforces budget and claim rules, while the verifier/reviewer remain explicit trust assumptions.
Target integrations: Arc Studio, CRE and CCIP with accurate live/simulated evidence.
Conditional: ENS. Optional UI polish and additional patterns wait.
If time becomes tight, cut optional features or category claims explicitly. Do not cut authorization, coverage, accounting, provenance or timeout safeguards to preserve a sponsor count.

## PB-00 — Repository and reproducible toolchain
**Owner:** A
**Prerequisites:** Authorization to begin coding
**Create/modify:** package.json; pnpm-workspace.yaml; .gitignore; .env.example; .github/workflows/check.yml; AGENTS.md; docs/toolchain.md
**Interface/deliverable:** Shared workspace scripts, pinned toolchain and secret-free CI

- [ ] Create one repo and carry this bundle into docs/planning; preserve incremental history.
- [ ] Pin Node/pnpm/Foundry/compiler/library versions after compatibility checks; establish lint/typecheck/test scripts and minimal CI.
- [ ] Check no secrets/artifacts are tracked; a fresh clone installs with the frozen lockfile and runs declared checks.
- [ ] Validate: `pnpm lint && pnpm typecheck && pnpm test`. Record exact output, environment and any skipped stage in docs/handoffs/PB-00.md.
- [ ] Review owned-file diff and interface/security impact; commit as `chore(repo): establish reproducible workspace and checks [PB-00]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-01 — Arc Studio CLI workflow and sponsor feasibility
**Owner:** B for Studio/contract runtime and CCIP; A for CRE
**Prerequisites:** PB-00 docs/config are sufficient
**Create/modify:** docs/evidence/sponsor-probes.md; docs/decisions/sponsor-runtime.md; Studio project created/driven through Arc Studio CLI
**Interface/deliverable:** A verified Arc Studio project and CLI-to-repo artifact workflow; measured CRE/CCIP feasibility; no claimed end-to-end integration until state is proven

- [ ] From the authenticated owner terminal, verify `pnpm exec arc-studio whoami`, `apps --json` and `sessions --json`; match the listed app to the browser-confirmed project and capture its session. Never share credentials.
- [ ] Open the existing Studio project `https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52` (app ID `9dee5ecd-ab62-459b-a54f-5ae7b2f06a52`) and confirm access before issuing build commands. Inspect the generated receiver when messaging integration begins; it is not a prerequisite to campaign implementation. Use `arc-studio run --app <appId> --output json` for focused follow-up; do not create a duplicate app.
- [ ] Prove artifact round-trip on the existing receiver/report with `arc-studio pull --app <appId> --dry-run` then pull only reviewed paths into a scratch directory; exclude `.env`, credentials, caches and generated build output. Record non-destructive conflict behavior. Do not assume Studio edits the local checkout directly.
- [ ] Preserve this existing Studio project as the starting point for Arc-targeted app/contracts. Audit the generated contract and tests; independently rerun them after pull. Test whether the hosted app can call the separately hosted verifier; record API boundary, auth/CORS and runtime constraints.
- [ ] Independently probe CRE CLI/runtime and Sepolia-to-Arc CCIP route. For any live message, verify Arc receiver storage/event and transaction/message IDs; a simulation or log alone is not live proof.
- [ ] Ask Arc mentors whether Codex-driven CLI sessions and locally reviewed/pulled artifacts meet “built in Arc Studio” and the advanced-stablecoin “without leaving Studio” criterion. Record answer as mentor guidance, not a published rule.
- [ ] Validate: reproducible commands and evidence in docs/evidence/sponsor-probes.md and docs/handoffs/PB-01.md.
- [ ] Review and commit as `docs(integrations): verify Studio CLI and Arc sponsor workflow [PB-01]` (or document a blocker/deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-02 — Worker and historical RPC feasibility
**Owner:** A
**Prerequisites:** PB-00
**Create/modify:** services/verifier/src/probe.ts; services/verifier/test/probe.test.ts; docs/evidence/worker-probe.md
**Interface/deliverable:** Bounded historical-state worker execution with recorded tool versions

- [ ] Create a bounded test harness at an explicit block and require number/hash agreement.
- [ ] Run inside the chosen worker container with no owner/funding keys; measure time/resources and historical RPC support.
- [ ] Force unavailable block/provider and timeout cases; return explicit errors without pass results; select tested snapshot/finality policy.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/probe.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-02.md.
- [ ] Review owned-file diff and interface/security impact; commit as `test(verifier): prove bounded snapshot execution [PB-02]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-03 — Freeze shared schemas encoding and fixture interfaces
**Owner:** B implements Solidity structures/vectors; A implements matching TypeScript
**Prerequisites:** INTERFACES.md for initial types and unit tests; PB-01/PB-02 runtime facts before integration
**Create/modify:** packages/schema/src/{manifest,inventory,policy,evidence,encoding,attestation}.ts; packages/schema/test/vectors.test.ts; contracts/test/EncodingVectors.t.sol; docs/interfaces.md
**Interface/deliverable:** Objects and interfaces in INTERFACES.md; exact Solidity tuples, signatures and fixture ABI agreement

- [ ] Define exact fields, enum encodings, canonical JSON rules, ABI tuple order and EIP-712 domains; distinguish chain selectors from IDs and diagnostic from funded.
- [ ] Write shared vectors for valid/changed policy, inventory ordering, duplicate rejection, mode/purpose changes and valid/invalid evaluator signatures; prove TS/Solidity agreement.
- [ ] Freeze fixture getter/operation/admin interfaces with B; confirm chosen signature verification works in CRE runtime. No independent parallel reinterpretations.
- [ ] Validate: `pnpm exec vitest run packages/schema/test/vectors.test.ts; forge test --root contracts --match-contract EncodingVectorsTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-03.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(schema): freeze policy evidence and encoding boundaries [PB-03]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-04 — Validated configuration and deployment manifests
**Owner:** A
**Prerequisites:** PB-03
**Create/modify:** packages/config/src/index.ts; packages/config/test/config.test.ts; config/networks/README.md
**Interface/deliverable:** loadConfig and validated public/private configuration contract

- [ ] Write missing/wrong-chain/address/selector/decimal/mode tests; unknown required values must fail startup.
- [ ] Load secrets only from environment and public network data from validated manifests; no invented fallback addresses.
- [ ] Prove local/mock settings cannot silently load in testnet mode; document how B's generated deployment outputs are consumed.
- [ ] Validate: `pnpm exec vitest run packages/config/test/config.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-04.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(config): validate runtime networks and execution modes [PB-04]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-05 — Persistence job leases and artifact storage
**Owner:** A
**Prerequisites:** PB-04
**Create/modify:** services/api/src/db/schema.ts; services/api/migrations/; services/api/src/jobs/; services/api/src/artifacts/; services/api/test/storage.integration.test.ts
**Interface/deliverable:** Durable inventories/scopes/runs, bounded leases and content-verified artifact adapter

- [ ] Write concurrent claim, crashed-worker lease recovery and same-key/different-payload idempotency cases against PostgreSQL.
- [ ] Implement migrations, transactional job claiming, retry limits and versioned artifact interface; local and hosted adapters share semantics.
- [ ] Test digest mismatch, missing artifact and partial publication; mark run complete only after retrievable evidence exists.
- [ ] Validate: `pnpm exec vitest run services/api/test/storage.integration.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-05.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(api): persist verification jobs and immutable evidence [PB-05]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-06 — Authenticated API and tenant boundaries
**Owner:** A
**Prerequisites:** PB-05
**Create/modify:** services/api/src/auth/; services/api/src/routes/{inventories,manifests,scopes,runs}.ts; services/api/test/auth-runs.integration.test.ts
**Interface/deliverable:** HTTP /v1 create/read operations from INTERFACES.md with OpenAPI

- [ ] Test nonce replay/expiry/domain mismatch, cross-tenant reads, contract-wallet validation on supported chain and caller-supplied address impersonation.
- [ ] Implement session authentication, input validation, quota limits, idempotent job enqueue and generated OpenAPI.
- [ ] Exercise public demo evidence versus private scope reads; reject arbitrary manifest URL SSRF, oversized files and executable uploads.
- [ ] Validate: `pnpm exec vitest run services/api/test/auth-runs.integration.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-06.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(api): authorize and validate verification requests [PB-06]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-07 — Known-bug application fixtures and approved test pack
**Owner:** A
**Prerequisites:** PB-03; PB-01 for any Arc-specific generated code
**Create/modify:** fixtures/src/{TestPriceSource,OracleAdapterV1,OracleAdapterV2,RiverMarket}.sol; fixtures/script/Deploy.s.sol; testpacks/oracle-adapter/; fixtures/test/FixtureBehavior.t.sol
**Interface/deliverable:** Pinned transparent-proxy family, shared ABI and configurable fixture deployment manifest

- [ ] Implement old adapter with the deliberate stale-price issue and corrected version; distinct supplier upgrade/customer configuration authorities.
- [ ] Tests demonstrate bad-input rejection after repair and legitimate borrowing/calculations; include wrong scaling configuration and paused application.
- [ ] Deploy fresh configurable instances without app-side address exceptions; export addresses, ABIs, code hashes and txs generated from execution. Document artificial fixture and interventions.
- [ ] Validate: `forge test --root fixtures --match-contract FixtureBehaviorTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-07.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(fixtures): model stale-price repair and deployment drift [PB-07]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-08 — Dependency path and authority inspection
**Owner:** A
**Prerequisites:** PB-04, PB-07
**Create/modify:** services/verifier/src/inspect/transparent-oracle.ts; services/verifier/test/inspection.test.ts
**Interface/deliverable:** inspectDeployment -> observed path/code/config/authority plus explicit unsupported status

- [ ] Test real fixture paths, changed addresses, wrong implementation, wrong setting, unexpected proxy/admin version and unresolved links.
- [ ] Implement the single supported module using ABI/getters/recognized storage arrangement at the pinned snapshot; inspect actual path from entrypoint.
- [ ] Explain expected versus observed with responsible account; unknown proxy versions cannot inherit an unsafe guessed upgrade authority.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/inspection.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-08.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(verifier): inspect application dependency and authority paths [PB-08]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-09 — Isolated repair-test execution
**Owner:** A
**Prerequisites:** PB-02, PB-07, PB-08
**Create/modify:** services/verifier/src/runner/; services/verifier/test/runner.integration.test.ts; services/verifier/Dockerfile
**Interface/deliverable:** runTestPack -> structured assertions and trace references

- [ ] Run approved test pack on original deployed snapshot; record each scenario intervention; preview actions use a distinct mode.
- [ ] Apply execution time/memory/output/network limits and deny arbitrary uploaded repositories, FFI and secret inheritance.
- [ ] Test pass/fail/crash/timeout and missing archive state; paused legitimate operation fails acceptance; no silent code replacement in deployed mode.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/runner.integration.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-09.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(verifier): execute bounded repair regression packs [PB-09]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-10 — Complete evidence and qualifying result evaluation
**Owner:** A
**Prerequisites:** PB-03, PB-05, PB-09
**Create/modify:** services/verifier/src/evidence/; services/verifier/test/evidence.test.ts
**Interface/deliverable:** evaluateCoverage, buildEvidence and signEvidence

- [ ] Test omitted/duplicated deployment or assertion, mixed block hashes, wrong manifest/test digest, tampered signature and all required-pass case.
- [ ] Generate complete ordered report, immutable artifact references and agreed evaluator attestation; isolate signing from test subprocess.
- [ ] Test diagnostic/preview cannot qualify, unknown results fail closed, signing-key rotation cannot silently alter an existing policy and stale report rejection follows policy.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/evidence.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-10.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(evidence): bind complete verification to approved scope [PB-10]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-11 — Replay and diagnostic backend flow
**Owner:** A
**Prerequisites:** PB-06, PB-10
**Create/modify:** services/verifier/src/{main,consume-job,replay}.ts; services/verifier/test/consumer.integration.test.ts; services/api/test/diagnostic-flow.integration.test.ts; docs/runbooks/{backend-start,replay}.md
**Interface/deliverable:** Diagnostic inventory -> scope -> run -> evidence -> reproducible replay

- [ ] Implement the executable worker consumer: claim queued jobs, renew bounded leases, inspect/run/sign/publish, and commit result only if its current lease token still owns the job. Wire independent API and worker startup commands and configuration.
- [ ] Start separate API and worker processes; submit inventory/scope/run through HTTP using fresh fixture addresses. Kill a worker mid-job, recover after lease expiry, and reject the old worker's late result. No supplier approval/escrow is required for diagnostic public reads.
- [ ] Export snapshot/tool/test/artifact identities and replay commands; disclose archive RPC requirements. Replay on a second clean environment and reject changed artifacts. Include consumer.integration.test.ts in the diagnostic flow validation command.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/consumer.integration.test.ts services/api/test/diagnostic-flow.integration.test.ts` and the documented replay command. Record exact output, environment and any skipped stage in docs/handoffs/PB-11.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(api): complete replayable diagnostic workflow [PB-11]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-12 — Unsigned repair proposals and post-execution recheck
**Owner:** A
**Prerequisites:** PB-08, PB-11; B validates proxy upgrade route
**Create/modify:** services/verifier/src/actions/; services/api/src/routes/actions.ts; services/verifier/test/actions.test.ts
**Interface/deliverable:** prepareRepair -> chain/target/calldata/value/authority/snapshot-bound proposal

- [ ] Test supplier-owned upgrade versus customer-owned configuration, unknown authority and stale proposal rejection.
- [ ] Prepare and simulate exact supported operations without submitting owner transactions; use compatible upgrade validation; surface absent source/layout metadata.
- [ ] Human-authorized fixture repair is followed by a new deployed-mode run; successful tx receipt alone does not become pass.
- [ ] Validate: `pnpm exec vitest run services/verifier/test/actions.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-12.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(actions): prepare bounded repairs and verify deployed results [PB-12]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-13 — Conditional ENS release publication gate
**Owner:** A
**Prerequisites:** PB-01, PB-03; mentor/product fit decision
**Create/modify:** docs/decisions/ens-fit.md; integrations/ens/src/publication.ts; integrations/ens/test/publication.test.ts
**Interface/deliverable:** ENS-approved manifest resolver OR documented deferral

- [ ] Record user value beyond a pinned campaign manifest and mentor feedback; if absent defer this task and explicitly remove ENS eligibility claim.
- [ ] If accepted, configure real ENSv2 Sepolia name and dedicated resolver; separate candidate-key and approved-key permissions with root/admin trust documented.
- [ ] Test live unauthorized approval rejection, revocation and resolution of actual manifests; content mismatch fails; existing campaign policy remains pinned when records change.
- [ ] Validate: `pnpm exec vitest run integrations/ens/test/publication.test.ts; documented live permission txs if enabled`. Record exact output, environment and any skipped stage in docs/handoffs/PB-13.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(ens): publish permissioned repair manifests OR docs(scope): defer unsupported ENS integration [PB-13]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-14 — Freeze supplier campaign policy and trust boundaries
**Owner:** B implements policy/trust docs; A implements matching TypeScript validation
**Prerequisites:** PB-03 contract policy/receipt structure; no live deposit until terms and roles are approved
**Create/modify:** docs/policies/demo-policy.md; packages/schema/test/policy.test.ts; docs/evidence/trust-model.md
**Interface/deliverable:** Versioned campaign policy for one supplier-funded remediation campaign; no maintenance fee or bond

- [ ] Freeze `campaignId`, source chain, eligible deployment commitment/root, uniform grant `G`, eligible count `N`, total required funding `N × G`, claim deadline `D`, challenge window `W`, adjudication bound `A`, receipt freshness/finality rules, verifier signer, independent reviewer, supplier, recipient derivation and campaign policy/test-pack hashes.
- [ ] Set illustrative demo grant amounts as explicit config; do not claim exact gas reimbursement. Terms are immutable after activation; campaign is active only when the full `N × G` budget is deposited.
- [ ] Define states and roles: eligible -> pending -> awarded/disputed/rejected -> withdrawn; incomplete or unknown verification cannot reserve a payable claim. No automatic slashing, repair fee, maintainer bond or customer penalty.
- [ ] Document that the verifier signature attests to a scoped report but does not prove honest execution; supplier challenge, independent review and timeout fallback are explicit trust assumptions. Reviewer timeout rejects/releases the reservation and may disadvantage an honest claimant; disclose this limitation.
- [ ] Test invalid domain, amounts/decimals, duplicate eligibility, deadline order, stale evidence, missing reviewer and unsupported token/configuration. Freeze only after human review; no invented addresses or consent.
- [ ] Validate: `pnpm exec vitest run packages/schema/test/policy.test.ts`; record evidence in docs/handoffs/PB-14.md.
- [ ] Commit `docs(policy): define supplier remediation campaign and trust model [PB-14]`.

## PB-15 — Campaign terms and eligible deployment registry
**Owner:** B (teammate)
**Prerequisites:** PB-03, PB-14
**Create/modify:** contracts/src/CampaignRegistry.sol; contracts/test/CampaignRegistry.t.sol
**Interface/deliverable:** Immutable campaign identity, eligibility commitment and policy hashes; recipient/deployment uniqueness

- [ ] Test unauthorized supplier, duplicate campaign/deployment, wrong chain/domain, changed terms and invalid recipient proof.
- [ ] Record an eligibility commitment (e.g. Merkle root) over historical affected deployment identity and authorized recipient; bind source chain, campaign, repair policy and test-pack hashes.
- [ ] Freeze policy at campaign creation and make activation impossible until PB-17 confirms full funding; no admin mark-accepted or post-funding eligibility edits.
- [ ] Ensure an eligible customer can prove one deployment without one customer’s repair state affecting other claims; prevent duplicate payout for the same campaign/deployment even if wallet or submitter changes.
- [ ] Validate: `forge test --root contracts --match-contract CampaignRegistryTest`; record evidence in docs/handoffs/PB-15.md.
- [ ] Commit `feat(campaign): register immutable eligibility and repair policy [PB-15]`.

## PB-16 — Signed, scoped acceptance receipt
**Owner:** B for Solidity validator; A for TypeScript receipt producer
**Prerequisites:** PB-14/PB-15 and PB-03 contract receipt encoding for contract tests; PB-10 real evidence and cross-language vectors before end-to-end integration
**Create/modify:** packages/schema/src/acceptance-receipt.ts; contracts/src/AcceptanceVerifier.sol; contracts/test/AcceptanceVerifier.t.sol
**Interface/deliverable:** Replay-resistant receipt binding a specific passing deployment check to a campaign claim

- [ ] Bind campaign ID, source chain/deployment, authorized recipient, policy/test-suite hashes, observed block number/hash, per-condition outcomes, evidence content hash, issue/expiry times and unique receipt ID.
- [ ] Reject failed/unknown/incomplete results, unsupported test-pack version, stale snapshot, wrong recipient/deployment/campaign, wrong signer, replay and mismatched domain.
- [ ] Read actual current source-chain facts through the supported verifier/CRE flow; preserve the distinction between source observations and destination settlement state.
- [ ] Test that a correct implementation hash with unsafe configuration or failed behavior is rejected; a valid operation still works after repair. Do not claim arbitrary vulnerability detection or cryptographic proof that tests ran honestly.
- [ ] Validate schema cross-language vectors and `forge test --root contracts --match-contract AcceptanceVerifierTest`; record evidence in docs/handoffs/PB-16.md.
- [ ] Commit `feat(acceptance): verify scoped remediation receipts [PB-16]`.

## PB-17 — Fully funded USDC campaign activation
**Owner:** B (teammate)
**Prerequisites:** PB-01 Arc Studio project and token/runtime facts; PB-14; PB-15
**Create/modify:** contracts/src/RemediationCampaign.sol; contracts/test/CampaignFunding.t.sol
**Interface/deliverable:** Arc Studio-built Arc testnet campaign that becomes active only after full `N × G` USDC funding

- [ ] Confirm the exact Arc testnet USDC ERC-20 address/decimals from current official docs at implementation time; use token units explicitly (never mix native and ERC-20 interfaces).
- [ ] Test supplier-only funding, allowance and transfer failures, underfunded activation rejection, exact/over funding policy, token mismatch, direct transfers not assigned as campaign funds, and campaign isolation.
- [ ] Activate only after full published grant budget is escrowed. Store funded, unallocated, reserved, awarded, paid and refunded amounts with auditable events.
- [ ] Keep deposit/withdrawal authority explicit and contract non-upgradeable for MVP unless a documented security review justifies otherwise. No privileged sweep of reserved/awarded grants.
- [ ] Build/test/deploy this Arc-targeted module via Arc Studio CLI workspace; retain Studio project URL and CLI evidence, then pull reviewed artifacts into repo. A local-only deployment does not satisfy the intended Studio workflow.
- [ ] Validate: `forge test --root contracts --match-contract CampaignFundingTest` plus Studio test/deployment evidence recorded in docs/handoffs/PB-17.md.
- [ ] Commit `feat(campaign): escrow fully funded remediation grants [PB-17]`.

## PB-18 — Per-deployment grant claim and settlement
**Owner:** B (teammate)
**Prerequisites:** PB-16, PB-17
**Create/modify:** contracts/src/RemediationCampaign.sol; contracts/test/CampaignClaims.t.sol
**Interface/deliverable:** One capped grant per eligible repaired deployment; individual claims do not block one another

- [ ] A valid receipt before `D` reserves exactly `G` for the deployment; transfer nothing during claim submission. Failed/unknown/inconclusive checks cannot reserve a grant.
- [ ] After challenge window `W` expires without challenge, anyone may finalize and credit a pull-withdrawal balance for the fixed recipient. No recipient substitution by submitter/front-runner.
- [ ] Reject duplicate claim/receipt and replay; permit a failed claim to retry before `D` with fresh evidence while only one pending claim exists per deployment.
- [ ] A failed transfer must not block other claims; withdrawal is recipient-pulled and retryable. No “all deployments pass” condition for campaign settlement.
- [ ] Validate: `forge test --root contracts --match-contract CampaignClaimsTest`; record evidence in docs/handoffs/PB-18.md.
- [ ] Commit `feat(campaign): reserve and settle independent customer grants [PB-18]`.

## PB-19 — Challenges, bounded review and campaign accounting
**Owner:** B (teammate); A reviews evidence semantics
**Prerequisites:** PB-18
**Create/modify:** contracts/src/RemediationCampaign.sol; contracts/test/{CampaignDisputes,CampaignInvariant}.t.sol
**Interface/deliverable:** Time-bounded challenge/review path, supplier recovery of unused funds and accounting invariants

- [ ] Only the configured supplier/challenger may challenge a pending claim before its original `W` cutoff; challenge cannot reset that cutoff. Reviewer decision is bounded by `A`.
- [ ] Reviewer award credits exactly `G`; rejection or review timeout releases exactly that reservation. Silence never awards funds. Make the timeout’s claimant-unfriendly limitation visible in docs/UI.
- [ ] After claim cutoff `D`, no new claims are accepted. Pending/disputed claims keep their reservation; supplier can recover only truly unallocated balance after the applicable campaign/claim deadlines. No late challenge or terminal revival.
- [ ] Enforce invariant: deposited = unallocated + reserved + awarded-unwithdrawn + paid + refunded. Fuzz sequences, deadlines, duplicates, partial token failures and multiple independent deployment claims.
- [ ] All terminal/timeout paths remain callable without the API; external calls cannot reenter or drain another claim.
- [ ] Validate: `forge test --root contracts --match-contract 'Campaign(Disputes|Invariant)Test'`; record evidence in docs/handoffs/PB-19.md.
- [ ] Commit `feat(campaign): bound disputes and preserve grant accounting [PB-19]`.

## PB-20 — CCIP delivery of verified claim facts to Arc
**Owner:** B (teammate)
**Prerequisites:** PB-01 route proof; PB-15–19; CRE receipt flow defined
**Create/modify:** contracts/src/messaging/; contracts/test/CampaignMessageOrdering.t.sol; contracts/script/Deploy.s.sol; config/deployments/; docs/runbooks/deploy-backend.md; docs/evidence/ccip.md
**Interface/deliverable:** Authenticated, idempotent campaign/acceptance messages causing intended Arc campaign state changes

- [ ] Define minimal message envelope carrying campaign/deployment/receipt identity and accepted outcome; bind source selector/sender and destination campaign; never trust arbitrary caller payloads.
- [ ] Reject wrong router/source/sender/campaign, duplicates/replays, forged outcome, expired report and late delivery that would revive a terminal campaign/claim.
- [ ] Test completion-before-campaign, retries, duplicate transport IDs for the same business fact, out-of-order delivery and bounded pending messages.
- [ ] Live evidence must include source transaction, CCIP message ID, receiver transaction, destination event/storage read and final USDC claim state; simulated CRE/CCIP is labeled simulation.
- [ ] Build and run the Arc contract path from the Studio project; document exact CLI workflow and pulled source provenance. Do not imply a log alone is a callback or state change.
- [ ] Validate: `forge test --root contracts --match-contract CampaignMessageOrderingTest` plus actual testnet route evidence when safely available; record in docs/handoffs/PB-20.md.
- [ ] Commit `feat(ccip): relay authenticated remediation acceptance [PB-20]`.

## PB-21 — CRE workflow using actual evidence and policy reads
**Owner:** A
**Prerequisites:** PB-10, PB-16; PB-03 signature/runtime proof
**Create/modify:** workflows/cre/src/main.ts; workflows/cre/test/workflow.test.ts; docs/evidence/cre.md
**Interface/deliverable:** Report retrieval + policy/fact checks + authenticated report generation/delivery

- [ ] Fetch bounded immutable report; verify evaluator signature, exact scope/purpose/mode/hashes, freshness and mandatory outcomes; read registry and supported chain facts.
- [ ] Test mismatched policy, omitted deployment, poisoned/stale API response and snapshot incompatibility; do not claim API consensus proves test execution.
- [ ] Run successful CLI simulation; if live access exists verify forwarder and receiver execution/state. Label mock-forwarder limitation and never silently swap manual delivery.
- [ ] Validate: `pnpm exec vitest run workflows/cre/test/workflow.test.ts; exact CLI simulation/deploy commands recorded in evidence`. Record exact output, environment and any skipped stage in docs/handoffs/PB-21.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(cre): evaluate repair evidence against campaign policy [PB-21]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-22 — Chain indexer and campaign API views
**Owner:** A
**Prerequisites:** PB-06, PB-15, PB-20; B exports ABI
**Create/modify:** services/api/src/indexer/; services/api/src/routes/campaigns.ts; services/api/test/indexer.integration.test.ts; docs/runbooks/backend-start.md; service launch configuration
**Interface/deliverable:** Campaign eligibility, evidence, claim and payment views with explicit sync provenance

- [ ] Index from recorded deployment block with event deduplication, restart checkpoint and reorg rollback; financial actions still checked onchain.
- [ ] Test duplicate logs, lag, removed block, event order and API unavailable cases; no database write can mint approval/payment.
- [ ] Expose unsigned policy/funding/challenge/finalize/withdraw requests from immutable authoritative terms; include correct chain switching requirements. Extend the backend-start runbook and service configuration to consume PB-20's generated manifests and launch API/worker/indexer before PB-24; do not wait for PB-27.
- [ ] Validate: `pnpm exec vitest run services/api/test/indexer.integration.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-22.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(api): expose chain-derived campaign state [PB-22]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-23 — Backend security and outage integration tests
**Owner:** A leads; B reviews financial failures
**Prerequisites:** PB-11, PB-12, PB-19, PB-21, PB-22
**Create/modify:** tests/integration/security-outages.test.ts; docs/runbooks/recovery.md
**Interface/deliverable:** Evidence freshness, identity and recovery behavior under dependency loss

- [ ] Test API/worker/storage/RPC/CRE/CCIP unavailability independently; unavailable verification is never a supplier-attributed failure.
- [ ] Test artifact URL abuse, nonce replay, cross-tenant reads and relevant onchain configuration change after observation; preserve historical versus current distinction.
- [ ] Demonstrate direct challenges and timeout withdrawals without platform; reorg after C flags evidence but cannot invent a late financial clawback.
- [ ] Validate: `pnpm exec vitest run tests/integration/security-outages.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-23.md.
- [ ] Review owned-file diff and interface/security impact; commit as `test(integration): cover evidence failures and independent grant exits [PB-23]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-24 — Backend handoff gate before feature UI
**Owner:** A coordinates; B reproduces
**Prerequisites:** PB-12, PB-20, PB-21, PB-22, PB-23; PB-13 only if retained
**Create/modify:** tests/integration/backend-flow.test.ts; docs/evidence/backend-handoff.md; generated openapi.json and ABI exports
**Interface/deliverable:** Real backend workflow runnable without frontend; frozen consumer contract

- [ ] Run campaign setup -> eligible inventory -> failing diagnostic -> owner-authorized repair -> fresh passing receipt -> claim/challenge outcome -> grant withdrawal at declared integration level.
- [ ] Run failure/refund/dispute scenario and replay on teammate machine with fresh IDs/addresses. All simulation/live boundaries must be visible.
- [ ] Deliver OpenAPI, ABIs, env-key list, migrations, runbook and runtime-generated example IDs; missing live CRE prevents full-live claim, not fake substitution.
- [ ] Validate: `pnpm test:integration; forge test --root contracts; documented two-machine run`. Record exact output, environment and any skipped stage in docs/handoffs/PB-24.md.
- [ ] Review owned-file diff and interface/security impact; commit as `test(e2e): establish backend handoff evidence [PB-24]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-25 — Frontend campaign and evidence workflow
**Owner:** A
**Prerequisites:** PB-24; Studio app workflow PB-01
**Create/modify:** apps/web/src/features/{campaigns,evidence}/; apps/web/tests/verification.spec.ts
**Interface/deliverable:** Real API-driven inventory/run/evidence screens

- [ ] Extend the existing Arc Studio project scaffold; authenticate wallets and load configurable campaign addresses; no demo-only response data.
- [ ] Display job versus assertion state, expected/observed conditions, coverage, snapshot, unknown/unsupported and retry states.
- [ ] Browser test new inventory -> run -> exact failures and evidence; test another tenant, malformed input and backend outage.
- [ ] Validate: `pnpm test:e2e -- verification.spec.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-25.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(web): explain deployment verification with real evidence [PB-25]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-26 — Frontend repair and campaign claim actions
**Owner:** A; B reviews signing and money views
**Prerequisites:** PB-25
**Create/modify:** apps/web/src/features/{actions,campaigns}/; apps/web/tests/campaign.spec.ts
**Interface/deliverable:** Owner-specific repair proposals and accurate supplier-campaign claim/withdrawal UI

- [ ] Display chain/target/calldata/value/authority and proposed effects; sign through user wallet only; handle rejection and wrong chain.
- [ ] Render verification pass/fail/unknown, pending CCIP, campaign funding, reserved/disputed/awarded/withdrawable, paid and supplier-recoverable balances as distinct states; no success badge before actual destination state.
- [ ] Browser test permissions, stale receipt, eligibility proof, USDC decimals, challenge/finalize/withdraw, replay and reviewer timeout; rerun verification after repair.
- [ ] Validate: `pnpm test:e2e -- campaign.spec.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-26.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(web): connect verified repairs to campaign claims [PB-26]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-27 — Deployment reproducibility and observability
**Owner:** B deploy tooling; A service configuration
**Prerequisites:** PB-24; PB-26 for full UI release
**Create/modify:** contracts/script/Deploy.s.sol; docs/runbooks/deploy.md; docs/evidence/deployments.md; service health/log configuration
**Interface/deliverable:** Final release audit and observability of deployments already implemented in PB-20 and service startup from PB-11/PB-22; this task is not the first deployment prerequisite

- [ ] Generate deployment outputs with chain IDs/addresses/code hashes/txs; never hand-copy magic addresses into product source.
- [ ] Track correlation by campaign/deployment/run/receipt/message ID; redact secrets; expose readiness and indexing lag; record evaluator key operational procedure.
- [ ] Reproduce setup in fresh environment; ensure actual Studio path, evidence storage retention and services usable by teammate/judges.
- [ ] Validate: `Recorded deployment commands; fresh-environment smoke run and redacted-log inspection`. Record exact output, environment and any skipped stage in docs/handoffs/PB-27.md.
- [ ] Review owned-file diff and interface/security impact; commit as `chore(deploy): document reproducible environments and evidence [PB-27]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-28 — Final sponsor and demo verification
**Owner:** A and B, one coordinator A
**Prerequisites:** PB-26, PB-27; retained sponsor gates
**Create/modify:** docs/submission/{demo,requirements,evidence,limitations}.md
**Interface/deliverable:** Honest reproducible demo and category-specific qualification evidence

- [ ] Repeat fresh 2-3 minute workflow: supplier fully funds a campaign -> show three eligible deployments -> one fails due to unsafe configuration and one remains old -> customer repairs under its own authority -> fresh receipt reserves and awards only that deployment’s grant -> replay is rejected -> unused funds remain supplier-recoverable after deadlines.
- [ ] Check shareable Studio URL, CLI session/app evidence, public repo, working app/backend, architecture diagram/video, CRE source/logs/receiver state, CCIP message and destination-state evidence, campaign accounting invariants, and conditional ENS permission transactions.
- [ ] Record reused libraries and AI assistance; no guarantee of awards/stacking or incident prevention. Any failed gate removes its dependent claim.
- [ ] Validate: `Full declared local checks once at final revision; one fresh testnet demo with new IDs`. Record exact output, environment and any skipped stage in docs/handoffs/PB-28.md.
- [ ] Review owned-file diff and interface/security impact; commit as `docs(submission): map working features to sponsor evidence [PB-28]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.
