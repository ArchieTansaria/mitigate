# PatchBond implementation plan

> For agentic workers: this is a planning artifact, not authorization to start coding. Once authorized, use the available task-by-task execution workflow (superpowers:executing-plans or superpowers:subagent-driven-development when available). A teammate without those skills follows the same task tests/review/commit cycle. No skill installation is required to understand this plan.

**Goal:** Deliver a reusable repair-verification backend and bounded funded acceptance flow, then build its frontend.
**Architecture:** Offchain inspection/evidence worker plus authenticated API; Sepolia acceptance registry; CCIP delivery to Arc escrow; CRE orchestrates evidence and supported chain reads. ENS is conditional.
**Tech stack:** Proposed stack in DECISIONS.md; exact version pins are PB-00 output.
**Spec:** DECISIONS.md, INTERFACES.md, and relevant HANDBOOK.md sections.

## Global constraints
No product implementation in the planning turn. Backend first. One supported proxy/application family, configurable inventory, one source chain per initial run. No arbitrary uploaded execution, global security claim, owner keys in worker, fake runtime outputs or silent mock fallback.
A owns API/verifier/schema/config and eventual UI. B owns contracts/fixtures/integrations. Joint review of schema and financial invariants.
Arc Studio provenance starts before Arc-targeted development. Live and simulated execution are distinct.
Every funded report uses the exact approved policy and whole required scope. Fixed cutoffs F<D<R<C<A; operations strictly before cutoff, timeout at/after.
Nonzero bond requires meaningful preagreed clauses. Direct onchain timeout exits work without the backend.
Protocol constants/test fixtures are named; addresses, endpoints and policy values are inputs/configuration. No runtime branches keyed to demo addresses.

## Review focus
1. Authority differs across chains or inside a proxy pattern: PB-03/08/14/16/20.
2. A passing preview, stale snapshot, omitted deployment or paused app masquerades as completion: PB-07/09/10/21/23.
3. Timely completion is stored but refund races before processing: PB-18/20.
4. Partial funding/award, zero bond or duplicate message strands/creates funds: PB-17/19/20.
5. Backend disappearance, endpoint abuse or cross-tenant requests undermines evidence/exits: PB-06/23/24.

## How to use each task card
All tasks below start unchecked; no tests have run. File paths are relative to the future repo. Braced paths are shorthand for individual files, not literal filenames.
For behavior tasks: write the stated failing checks, implement the bounded change, run the command and inspect output, then review and commit explicit owned paths. Probe/documentation tasks record reproducible observations instead of unnecessary unit tests.
Commands are target interfaces established at PB-00, not scripts available in this planning directory. Use actual generated CLI syntax/version from the probe when no stable command is pinned. Success is the stated behavioral observation, not merely exit code zero.
Commit examples include task IDs; split a large task into multiple passing focused commits if useful. Never mark the task done until relevant evidence, review and merge exist.
Shared files mentioned by a later non-owner require an owner-authored prerequisite PR or explicit reassignment; they are not permission for concurrent writes.

## Dependency order
- Initial A: PB-00 -> PB-02. Initial B: PB-01. Then joint PB-03.
- A core: PB-04 -> PB-05 -> PB-06; after B's PB-07, PB-08 -> PB-09 -> PB-10 -> PB-11 -> PB-12.
- B core: PB-07; PB-14 with A -> PB-15 -> PB-16/PB-17 -> PB-18 -> PB-19 -> PB-20.
- B CRE: PB-21 after A's signed evidence; B ENS PB-13 only if justified.
- A consumes merged ABIs for PB-22; both reach PB-23/PB-24.
- UI PB-25/PB-26 only after PB-24; operational deployment PB-27 and submission PB-28 follow.
These dependencies permit two backend streams. Do not assign one person only UI while both are waiting for backend integration.

## Scope priority
Core: complete diagnostics, actual repair recheck, truthful evidence, safe funded lifecycle.
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

## PB-01 — Sponsor feasibility and Studio starting point
**Owner:** B
**Prerequisites:** PB-00 (documentation/config only is sufficient)
**Create/modify:** docs/evidence/sponsor-probes.md; docs/decisions/sponsor-runtime.md; Studio-generated minimal project
**Interface/deliverable:** Measured Arc Studio/CRE/CCIP access decision; no claimed end-to-end integration

- [ ] Start Arc-targeted project in Studio; record shareable URL, export/Git-sync workflow and external API/worker connectivity before dependent Arc app implementation.
- [ ] Test CRE CLI and determine live-deploy access; send a minimal CCIP message that changes a real Arc testnet receiver state using supported tooling.
- [ ] Capture exact versions, transaction/state evidence and failures; clarify Studio development requirements and category stacking with mentors. Store no private conversations without permission.
- [ ] Validate: `Reproduce commands recorded in docs/evidence/sponsor-probes.md; verify destination storage, not only logs`. Record exact output, environment and any skipped stage in docs/handoffs/PB-01.md.
- [ ] Review owned-file diff and interface/security impact; commit as `docs(integrations): record Studio CRE and CCIP feasibility [PB-01]` (or the relevant explicit deferral).
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
**Owner:** A implements; B reviews
**Prerequisites:** PB-01 and PB-02
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
**Owner:** B
**Prerequisites:** PB-03; PB-01 for any Arc-specific generated code
**Create/modify:** fixtures/src/{TestPriceSource,OracleAdapterV1,OracleAdapterV2,RiverMarket}.sol; fixtures/script/Deploy.s.sol; testpacks/oracle-adapter/; contracts/test/FixtureBehavior.t.sol
**Interface/deliverable:** Pinned transparent-proxy family, shared ABI and configurable fixture deployment manifest

- [ ] Implement old adapter with the deliberate stale-price issue and corrected version; distinct supplier upgrade/customer configuration authorities.
- [ ] Tests demonstrate bad-input rejection after repair and legitimate borrowing/calculations; include wrong scaling configuration and paused application.
- [ ] Deploy fresh configurable instances without app-side address exceptions; export addresses, ABIs, code hashes and txs generated from execution. Document artificial fixture and interventions.
- [ ] Validate: `forge test --root contracts --match-contract FixtureBehaviorTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-07.md.
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
**Owner:** B
**Prerequisites:** PB-01, PB-03; mentor/product fit decision
**Create/modify:** docs/decisions/ens-fit.md; integrations/ens/src/publication.ts; integrations/ens/test/publication.test.ts
**Interface/deliverable:** ENS-approved manifest resolver OR documented deferral

- [ ] Record user value beyond pinned agreement and mentor feedback; if absent defer this task and explicitly remove ENS eligibility claim.
- [ ] If accepted, configure real ENSv2 Sepolia name and dedicated resolver; separate candidate-key and approved-key permissions with root/admin trust documented.
- [ ] Test live unauthorized approval rejection, revocation and resolution of actual manifests; content mismatch fails; existing agreement remains pinned when records change.
- [ ] Validate: `pnpm exec vitest run integrations/ens/test/publication.test.ts; documented live permission txs if enabled`. Record exact output, environment and any skipped stage in docs/handoffs/PB-13.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(ens): publish permissioned repair manifests OR docs(scope): defer unsupported ENS integration [PB-13]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-14 — Freeze funded policy commercial and authority terms
**Owner:** A coordinates; B reviews
**Prerequisites:** PB-03; owners supply actual addresses/terms
**Create/modify:** docs/policies/demo-policy.md; packages/schema/test/policy.test.ts
**Interface/deliverable:** Validated explicit policy for initial demo; no deposits until complete

- [ ] Select fee, zero/nonzero bond, covered breach reasons/caps, arbiter and role addresses without inventing consent; record exactly who controls each repair.
- [ ] Set explicit F<D<R<C<A and finality/evidence retention; define no-decision principal-return default and its fairness limitation.
- [ ] Test invalid ordering, wrong domain, unsupported token configuration and missing nonzero-bond clauses; distinguish actual contributions from nominal amounts.
- [ ] Validate: `pnpm exec vitest run packages/schema/test/policy.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-14.md.
- [ ] Review owned-file diff and interface/security impact; commit as `docs(policy): define funded repair obligations and recovery rules [PB-14]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-15 — Source registry and bilateral consent
**Owner:** B
**Prerequisites:** PB-03, PB-14
**Create/modify:** contracts/src/AcceptanceRegistry.sol; contracts/test/AcceptanceRegistry.t.sol
**Interface/deliverable:** registerPolicy, approvePolicy and immutable policy/approval state

- [ ] Test unauthorized participant, one approval only, duplicate approval, changed terms and cross-domain replay.
- [ ] Implement onchain consent from actual accounts including contract-wallet callers; freeze terms and domain; no admin override.
- [ ] Emit/index authoritative approvals and keep policy available for exact retransmission; incomplete approval cannot initialize financial use.
- [ ] Validate: `forge test --root contracts --match-contract AcceptanceRegistryTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-15.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(registry): record immutable bilateral maintenance policies [PB-15]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-16 — Authenticated completion receiver
**Owner:** B
**Prerequisites:** PB-15
**Create/modify:** contracts/src/ReportReceiver.sol; contracts/src/AcceptanceRegistry.sol; contracts/test/ReportReceiver.t.sol
**Interface/deliverable:** Authenticated onReport -> CompletionAccepted under exact policy

- [ ] Test wrong forwarder/workflow owner/identity, wrong policy/domain, diagnostic/preview result, incomplete commitments and deadline D boundary.
- [ ] Implement ReportReceiver as an abstract authenticated base inherited by AcceptanceRegistry, with an internal acceptance hook and no public acceptance bypass. Configure CRE's consumer address as the deployed registry. Runtime evidence rules are enforced by the agreed workflow/evaluator, not arbitrary UI booleans.
- [ ] Verify callback -> registry storage -> dispatchable completion, and rejection of unauthorized direct acceptance calls. A receiver event alone is insufficient. Keep any local mock adapter in test-only paths and separate configuration.
- [ ] Validate: `forge test --root contracts --match-contract ReportReceiverTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-16.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(registry): authenticate qualifying repair reports [PB-16]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-17 — Vault funding and incomplete-funding recovery
**Owner:** B
**Prerequisites:** PB-01, PB-14, PB-15
**Create/modify:** contracts/src/MaintenanceVault.sol; contracts/test/VaultFunding.t.sol
**Interface/deliverable:** Fund fee/bond, strict accounting, zero-bond activation, cancellation and pull withdrawals

- [ ] Test sender roles, ERC20 allowance/amounts, decimals, direct-transfer nonassignment, partial funding, overfunding rejection and multiple agreement isolation.
- [ ] Implement fixed destination participants and non-upgradeable vault; cancellation at F allocates actual contributions only.
- [ ] Prove zero bond activates once fee requirement is met; complete/partial obligations cannot pay early; repeated withdrawals cannot drain others.
- [ ] Validate: `forge test --root contracts --match-contract VaultFundingTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-17.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(vault): account for funding and recover incomplete agreements [PB-17]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-18 — Successful allocation and no-completion recovery
**Owner:** B
**Prerequisites:** PB-16, PB-17
**Create/modify:** contracts/src/MaintenanceVault.sol; contracts/test/VaultSettlement.t.sol
**Interface/deliverable:** Eligible completion finalization at C; no completion returns principals

- [ ] Test source time before D, receipt before R, complete funding, challenge cutoff and exact boundary seconds.
- [ ] Allocate fee/bond only to fixed recipients using pull payments; missing completion returns principals after safe pending processing.
- [ ] Reject over-allocation and terminal revival; no time-based behavior assumes a transaction happens automatically.
- [ ] Validate: `forge test --root contracts --match-contract VaultSettlementTest`. Record exact output, environment and any skipped stage in docs/handoffs/PB-18.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(vault): finalize bounded repair settlement and refunds [PB-18]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-19 — Challenges arbitration and accounting invariants
**Owner:** B
**Prerequisites:** PB-18
**Create/modify:** contracts/src/MaintenanceVault.sol; contracts/test/{VaultDisputes,VaultInvariant}.t.sol
**Interface/deliverable:** Direct authorized challenge, bounded arbiter allocation, permissionless timeout

- [ ] Test unauthorized challenger, repeated challenge, cap violations, partial award remainder, timeout A and direct exits with backend offline.
- [ ] Every terminal result allocates entire accounted balance; expired arbiter cannot change allocation; fixed deadlines cannot reset.
- [ ] Fuzz action sequences and amounts across agreements; withdrawn plus remaining cannot exceed deposits; no unrestricted admin fund exit.
- [ ] Validate: `forge test --root contracts --match-contract 'Vault(Disputes|Invariant)Test'`. Record exact output, environment and any skipped stage in docs/handoffs/PB-19.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(vault): bound disputes and preserve accounting invariants [PB-19]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-20 — Authenticated CCIP policy and completion delivery
**Owner:** B
**Prerequisites:** PB-16, PB-19; PB-01 route proof
**Create/modify:** contracts/src/messaging/; contracts/test/MessageOrdering.t.sol; contracts/script/Deploy.s.sol; config/deployments/; docs/runbooks/deploy-backend.md; docs/evidence/ccip.md
**Interface/deliverable:** POLICY_APPROVED and COMPLETION_RECORDED envelopes; safe receipt/inbox processing

- [ ] Test wrong router/source selector/sender, duplicates, different transport IDs for same business fact, completion before setup/funding and retry.
- [ ] Preserve first authenticated receipt, bounded pending work and exact stored source payload; no-completion refund evaluates timely pending completion first.
- [ ] Before the live send, implement minimal reproducible product deployment and router/registry/vault wiring; generate public addresses, ABIs, code hashes and transaction provenance in config/deployments. Document exact commands in deploy-backend.md. Then execute testnet sends, read Arc policy/completion state and record message IDs. Prove terminal states cannot revive from late delivery; label report source if CRE is simulated.
- [ ] Validate: `forge test --root contracts --match-contract MessageOrderingTest; recorded testnet scripts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-20.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(ccip): deliver replay-safe policies and repair completion [PB-20]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-21 — CRE workflow using actual evidence and policy reads
**Owner:** B
**Prerequisites:** PB-10, PB-16; PB-03 signature/runtime proof
**Create/modify:** workflows/cre/src/main.ts; workflows/cre/test/workflow.test.ts; docs/evidence/cre.md
**Interface/deliverable:** Report retrieval + policy/fact checks + authenticated report generation/delivery

- [ ] Fetch bounded immutable report; verify evaluator signature, exact scope/purpose/mode/hashes, freshness and mandatory outcomes; read registry and supported chain facts.
- [ ] Test mismatched policy, omitted deployment, poisoned/stale API response and snapshot incompatibility; do not claim API consensus proves test execution.
- [ ] Run successful CLI simulation; if live access exists verify forwarder and receiver execution/state. Label mock-forwarder limitation and never silently swap manual delivery.
- [ ] Validate: `pnpm exec vitest run workflows/cre/test/workflow.test.ts; exact CLI simulation/deploy commands recorded in evidence`. Record exact output, environment and any skipped stage in docs/handoffs/PB-21.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(cre): evaluate repair evidence against onchain agreement [PB-21]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-22 — Chain indexer and agreement API views
**Owner:** A
**Prerequisites:** PB-06, PB-15, PB-20; B exports ABI
**Create/modify:** services/api/src/indexer/; services/api/src/routes/agreements.ts; services/api/test/indexer.integration.test.ts; docs/runbooks/backend-start.md; service launch configuration
**Interface/deliverable:** Agreement/readiness/receipt/payment views with explicit sync provenance

- [ ] Index from recorded deployment block with event deduplication, restart checkpoint and reorg rollback; financial actions still checked onchain.
- [ ] Test duplicate logs, lag, removed block, event order and API unavailable cases; no database write can mint approval/payment.
- [ ] Expose unsigned policy/funding/challenge/finalize/withdraw requests from immutable authoritative terms; include correct chain switching requirements. Extend the backend-start runbook and service configuration to consume PB-20's generated manifests and launch API/worker/indexer before PB-24; do not wait for PB-27.
- [ ] Validate: `pnpm exec vitest run services/api/test/indexer.integration.test.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-22.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(api): expose chain-derived agreement state [PB-22]` (or the relevant explicit deferral).
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
- [ ] Review owned-file diff and interface/security impact; commit as `test(integration): cover evidence failures and independent fund exits [PB-23]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-24 — Backend handoff gate before feature UI
**Owner:** A coordinates; B reproduces
**Prerequisites:** PB-12, PB-20, PB-21, PB-22, PB-23; PB-13 only if retained
**Create/modify:** tests/integration/backend-flow.test.ts; docs/evidence/backend-handoff.md; generated openapi.json and ABI exports
**Interface/deliverable:** Real backend workflow runnable without frontend; frozen consumer contract

- [ ] Run inventory -> failing diagnostic -> authorized repair -> fresh funded evidence -> acceptance -> destination receipt -> allocation -> withdrawal at declared integration level.
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

- [ ] Use Studio-compatible existing app scaffold; authenticate wallet and import configurable addresses; no demo-only response data.
- [ ] Display job versus assertion state, expected/observed conditions, coverage, snapshot, unknown/unsupported and retry states.
- [ ] Browser test new inventory -> run -> exact failures and evidence; test another tenant, malformed input and backend outage.
- [ ] Validate: `pnpm test:e2e -- verification.spec.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-25.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(web): explain deployment verification with real evidence [PB-25]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-26 — Frontend repair and agreement actions
**Owner:** A; B reviews signing and money views
**Prerequisites:** PB-25
**Create/modify:** apps/web/src/features/{actions,agreements}/; apps/web/tests/agreement.spec.ts
**Interface/deliverable:** Owner-specific transaction proposals and accurate settlement UI

- [ ] Display chain/target/calldata/value/authority and proposed effects; sign through user wallet only; handle rejection and wrong chain.
- [ ] Render source accepted, CCIP pending, Arc recorded, disputed, allocated and withdrawable separately; no success badge before actual state.
- [ ] Browser test permissions, stale proposal, fee/token decimals, challenge/finalize/withdraw and zero-bond case; rerun verification after repair.
- [ ] Validate: `pnpm test:e2e -- agreement.spec.ts`. Record exact output, environment and any skipped stage in docs/handoffs/PB-26.md.
- [ ] Review owned-file diff and interface/security impact; commit as `feat(web): connect authorized repairs to agreement lifecycle [PB-26]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-27 — Deployment reproducibility and observability
**Owner:** B deploy tooling; A service configuration
**Prerequisites:** PB-24; PB-26 for full UI release
**Create/modify:** contracts/script/Deploy.s.sol; docs/runbooks/deploy.md; docs/evidence/deployments.md; service health/log configuration
**Interface/deliverable:** Final release audit and observability of deployments already implemented in PB-20 and service startup from PB-11/PB-22; this task is not the first deployment prerequisite

- [ ] Generate deployment outputs with chain IDs/addresses/code hashes/txs; never hand-copy magic addresses into product source.
- [ ] Track correlation by agreement/run/report/message ID; redact secrets; expose readiness and indexing lag; record evaluator key operational procedure.
- [ ] Reproduce setup in fresh environment; ensure actual Studio path, evidence storage retention and services usable by teammate/judges.
- [ ] Validate: `Recorded deployment commands; fresh-environment smoke run and redacted-log inspection`. Record exact output, environment and any skipped stage in docs/handoffs/PB-27.md.
- [ ] Review owned-file diff and interface/security impact; commit as `chore(deploy): document reproducible environments and evidence [PB-27]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.

## PB-28 — Final sponsor and demo verification
**Owner:** A and B, one coordinator A
**Prerequisites:** PB-26, PB-27; retained sponsor gates
**Create/modify:** docs/submission/{demo,requirements,evidence,limitations}.md
**Interface/deliverable:** Honest reproducible demo and category-specific qualification evidence

- [ ] Repeat fresh 2-3 minute workflow: missed deployment -> owner action -> complete evidence -> actual declared acceptance/settlement; keep failures inspectable.
- [ ] Check Studio URL, public repo, live app, diagram/video, CRE source/logs/receiver state, CCIP IDs and conditional ENS real permission txs.
- [ ] Record reused libraries and AI assistance; no guarantee of awards/stacking or incident prevention. Any failed gate removes its dependent claim.
- [ ] Validate: `Full declared local checks once at final revision; one fresh testnet demo with new IDs`. Record exact output, environment and any skipped stage in docs/handoffs/PB-28.md.
- [ ] Review owned-file diff and interface/security impact; commit as `docs(submission): map working features to sponsor evidence [PB-28]` (or the relevant explicit deferral).
- [ ] Other owner reviews; merge; coordinator records commit/status and releases dependent task.
