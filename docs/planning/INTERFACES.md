# Shared interface contract
Status: planning specification. PB-03 must produce executable schemas, Solidity structs and golden vectors before dependent code. This document is not a generated OpenAPI schema or compiled ABI.

## Common vocabulary
Address: normalized EVM address; validate before accepting. Hash32: 32-byte hex value. Amount: base-unit unsigned integer encoded as a decimal string in HTTP/JSON; bigint internally; uint256 onchain. Never JavaScript floating point for balances.
Chain ID is not a CCIP chain selector. Store both explicitly.
Timestamps: integer UTC Unix seconds. Chain timestamps govern financial cutoffs, not browser/server clocks.
All messages and artifacts carry schemaVersion. Unsupported versions fail with an explicit error.
Purpose = diagnostic | funded. Mode = preview | deployed. These are independent.
Assertion outcome = pass | fail | unknown | unsupported. Job state = queued | running | succeeded | failed | cancelled. A succeeded job can produce failing assertions. Only complete mandatory pass outcomes in funded/deployed mode can qualify.
Readiness, historical acceptance and settlement are separate state fields.

## Shared data objects
RepairManifestV1: releaseId, issueDescription, supportedPatternId, sourceChainId, approvedImplementationAddress, approvedRuntimeCodeHash, configurationPredicates, testPackDigest, requiredAssertionIds, prerequisites, artifactRefs. ENS publication metadata is optional and is not evidence of patch correctness.
DeploymentV1: deploymentKey, chainId, entrypoint, marketSelector, inspectionModuleId, declaredDependencyPath, expectedAuthorityModel.
deploymentKey must include chain + entrypoint + marketSelector (explicit empty selector allowed); no bare address-only identity.
InventoryV1: schemaVersion and canonical deployment array. Reject duplicates before hashing. Sort by stable key; sort assertion IDs; duplicates never disappear silently during sorting.
VerificationSpecV1: source domain, inventory digest, manifest digest, test-pack digest, required assertions/predicates, evaluator, snapshot/freshness requirements. Diagnostic runs reference this and have no financial policy.
PolicyV1 extends the semantic verification specification with source registry, destination chain/vault, nonce, source customer/maintainer approvers, Arc customer/maintainer depositors and challengers, fee and bond beneficiaries, arbiter, token, amounts, bond/dispute caps and reason definitions, F/D/R/C/A, authorized workflow identity and evidence retention rule. Consent is recorded by source-chain calls from both participants.
No same-address assumption across chains. For the demo depositor=challenger is explicitly encoded, not inferred.

RunRequestV1: verificationScopeId, purpose, mode, inventory/spec references; agreementId and policyHash required only for funded runs; approved preview actions only for preview. Server obtains authoritative policy rather than trusting client overrides.
SnapshotV1: chainId, blockNumber, blockHash, blockTimestamp, finalityRuleId.
DeploymentResultV1: deploymentKey, observed dependency path/config/code identity/authority, assertion entries (id, outcome, expected, observed, evidenceRef), suggested action owner.
EvidenceBundleV1: schemaVersion, runId, purpose, mode, verificationScopeId, optional agreementId/policyHash, snapshot, inventory/manifest/testPack hashes, runner image/tool identity, complete ordered deployment results, scenario interventions, artifact digests, evaluator signature.
Only a single source-chain block number/hash per initial complete run. Missing or duplicate deployments/assertions and mixed snapshots cannot qualify. If batching internally, the resulting bundle must preserve the same snapshot and exact scope.

## Encoding and signature freeze: PB-03 deliverable
Use Solidity ABI encoding for onchain commitments, not pretty-printed JSON. Define one exact ordered PolicyV1 tuple in Solidity and TypeScript; nested variable structures are represented by canonical hashes. Agree on domain separator including schema version, chain/registry and destination chain/vault; nonce makes agreements distinct.
Use RFC 8785 canonical JSON bytes for offchain manifests/evidence payloads, excluding their own digest/signature fields; use keccak256 for content fingerprints consistently. Numeric blockchain values are decimal strings, not unsafe JSON numbers. URI and digest are separate; content fingerprint proves identity, not availability.
Initial evaluator: explicit EOA signing EIP-712 typed EvidenceAttestation fields agreementId, policyHash, scopeHash, snapshotHash, testPackHash, evidenceDigest, purpose, mode, issuedAt. Diagnostic attestation uses a separate typed structure with verificationScopeId, not zero-filled agreement aliases. Freeze exact type strings, domains, field order and enums in executable golden vectors.
Contract-wallet customer/supplier consent uses onchain calls; evaluator signature support is limited to the declared EOA scheme initially. Do not claim arbitrary EIP-1271 evaluator support. Offchain login may support EIP-1271 separately as described below.
CRE must parse/verify the chosen signing scheme in its actual supported runtime. If unsupported, block/change the interface through joint review, not skip verification.

Produce vectors for: valid policy, changed recipient, changed chain, nonce, reordering-normalized inventory, duplicate inventory rejected, purpose/mode change, evidence mutation and one valid signature plus invalid signature. Both TS and Solidity hashes must match where Solidity consumes the encoding. One owner A edits encodings; B reviews and implements consumer structs.

## Proposed module boundaries (names to freeze in PB-03)
loadConfig(env) -> ValidatedConfig
inspectDeployment(deployment, snapshot, rpc) -> InspectionResult
runTestPack(runInput, sandbox) -> AssertionResults
evaluateCoverage(spec, results, snapshot) -> CoverageDecision
buildEvidence(run, observations, results) -> UnsignedEvidenceBundle
signEvidence(bundle, signer) -> SignedEvidenceBundle
publishArtifact(bytes, mediaType) -> {uri, digest, byteLength}
prepareRepair(inspection, manifest) -> TransactionProposal | Unsupported
TransactionProposal: chainId, target, valueBaseUnits, calldata, authority, explanation, simulationRef, bound snapshot/observations and expiry rule. No server executes owner transactions.

## HTTP API (proposed /v1 prefix)
| Method and path | Input | Output / authorization |
| --- | --- | --- |
| POST /auth/challenge | wallet address, chain | Single-use domain-bound nonce and expiry |
| POST /auth/verify | signed challenge | Session; verify ownership, expiry and replay; no onchain rights granted |
| POST /inventories | DeploymentV1 list | inventoryId + digest; authenticated owner |
| POST /manifests | manifest bytes or bounded approved-source reference | manifestId + digest; validate; never execute uploaded code |
| POST /verification-scopes | manifest/inventory/spec references | scopeId; owner controls offchain scope |
| POST /runs | RunRequestV1 + Idempotency-Key | 202 runId, or same run for identical retry |
| GET /runs/:runId | none | job state and separate result/coverage state; authorize tenant |
| GET /runs/:runId/evidence | none | immutable report refs; diagnostic privacy rules; explicit public demo evidence |
| GET /runs/:runId/actions | none | owner-specific unsigned proposals; no automatic execution |
| POST /policies/prepare | policy inputs | validated policy, hash and unsigned registration proposal |
| GET /agreements/:agreementId | none | chain-derived approval/funding/receipt/dispute/allocation views with sync block |
| GET /agreements/:agreementId/transactions/:action | action inputs as appropriate | unsigned funding/approval/challenge/finalize/withdraw proposal |

HTTP session authentication must check nonce/domain/expiry and the declared chain. Support ordinary wallet signature verification; for supported contract wallets use their onchain EIP-1271 check at the correct chain. Reject unsupported wallet types explicitly. No browser-supplied wallet field substitutes for authentication.
Errors: INVALID_INPUT, UNAUTHORIZED, FORBIDDEN, UNSUPPORTED_PATTERN, POLICY_MISMATCH, STALE_EVIDENCE, RPC_UNAVAILABLE, ARTIFACT_UNAVAILABLE, CONFLICT, RATE_LIMITED. Return stable code, requestId and safe message. No secrets or raw credential-bearing URLs.
Idempotency key is scoped to authenticated owner and request digest; same key with different payload returns conflict. Bounded body sizes and job quotas protect compute.
Artifact fetching must restrict destinations/schemes, prevent private-network/metadata access, limit size/time/redirects and verify digests. Local-file artifact scheme is local-mode only.

## Chain interfaces and messages
AcceptanceRegistry: registerPolicy(policy), approvePolicy(agreementId), authenticated onReport(metadata,report), dispatchPolicy(agreementId), dispatchCompletion(agreementId,reportId). Exact ABI is PB-03/PB-15 deliverable. AcceptanceRegistry inherits an abstract ReportReceiver base: the callback authenticates origin and invokes an internal acceptance hook implemented by the registry. There is one deployed consumer/registry address, no separately deployed receiver and no public unauthenticated acceptance setter. PB-16 must prove callback -> registry storage -> dispatchable completion. Dispatches derive fixed destinations/payloads from stored records; callers can pay fees but cannot mutate approved terms.
MaintenanceVault: authenticated CCIP receive, processPending(messageKey), fundFee(agreementId,amount), fundBond(agreementId,amount), challenge(agreementId,reason,evidenceDigest), resolve(agreementId,allocation), finalize(agreementId), withdraw(agreementId). Sender roles and fixed recipient allocations enforced onchain.
Message kinds: POLICY_APPROVED, COMPLETION_RECORDED. Envelope: schemaVersion, kind, agreementId, policyHash, businessMessageId, payload. Payload includes immutable terms or source accepted report identity/time.
The business ID identifies the same source fact across retries, separate from CCIP transport message ID. Preserve earliest authenticated receipt timestamp. Authenticate router, source chain selector and sender before receipt storage.
Do not overwrite valid state with delayed messages; safe bounded inbox processing is required. Before no-completion refund, process/evaluate any timely pending completion. Source-record timestamp must be before D and destination receipt before R.
Events: PolicyRegistered, PolicyApproved, CompletionAccepted; destination PolicyInitialized, MessageStored, CompletionProcessed, DepositRecorded, ChallengeOpened, AllocationFinalized, Withdrawn. Include agreement/report/message IDs as applicable. Events are audit inputs; indexed views are not authority.
Payouts/financial assertions read actual chain state, including zero-bond activation and direct contract exits when backend is offline.

## Runtime configuration and provenance
Public network manifests: chain IDs/selectors, contract addresses, token decimals, explorer URLs, supported pattern/version, deployment tx hashes and code hashes.
Private env: RPC credentials, DB URL, artifact credentials, evaluator signing secret, CRE credentials where required. Separate each person's local env; never distribute through handbook or commit.
State-change wallet keys belong to the human wallet. No general owner key in the API/worker.
Source and destination observations store block/hash. Indexer can replay from deployment block with deduplication and reorg handling; lag is visible.
Test commands proposed for bootstrap: pnpm lint; pnpm typecheck; pnpm test; pnpm test:integration; pnpm test:e2e; forge test --root contracts. PB-00 must implement and document actual script names; these are not available yet.

\n