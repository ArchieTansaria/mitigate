# Shared interface contract
Status: executable campaign/receipt boundary implemented in PB-03. Exact fields/order/domains: docs/interfaces/pb03-studio-spec.md, contracts/pb03/PatchBondTypes.sol and docs/interfaces/pb03-vectors.json. These supersede the earlier illustrative field lists below. PB-04–06 implement diagnostic API/job interfaces; inspect generated /openapi.json and docs/handoffs/PB-06.md for the executable boundary. Financial endpoints remain future work. Current campaign model adopted 2026-11-06. PB-03 contract structures/vectors are owned by B; matching TypeScript schemas/vectors are owned by A. Each module can be unit-tested against this boundary; matching vectors are mandatory before integration. This document is not a generated OpenAPI schema or compiled ABI. Older handbook agreement/bond structures are superseded for this MVP; read docs/planning/DECISIONS.md.

## Common vocabulary
Address: normalized EVM address; validate before accepting. Hash32: 32-byte hex value. Amount: base-unit unsigned integer encoded as a decimal string in HTTP/JSON; bigint internally; uint256 onchain. Never JavaScript floating point for balances.
Chain ID is not a CCIP chain selector. Store both explicitly.
Timestamps: integer UTC Unix seconds. Chain timestamps govern financial cutoffs, not browser/server clocks.
All messages and artifacts carry schemaVersion. Unsupported versions fail with an explicit error.
Purpose = diagnostic | campaign-claim. Mode = preview | deployed. These are independent.
Assertion outcome = pass | fail | unknown | unsupported. Job state = queued | running | succeeded | failed | cancelled. A succeeded job can produce failing assertions. Only a complete, fresh, deployed-mode pass for the exact eligible deployment can qualify for a campaign claim.
Readiness, historical acceptance and settlement are separate state fields.

## Shared data objects
RepairManifestV1: releaseId, issueDescription, supportedPatternId, sourceChainId, approvedImplementationAddress, approvedRuntimeCodeHash, configurationPredicates, testPackDigest, requiredAssertionIds, prerequisites, artifactRefs. ENS publication metadata is optional and is not evidence of patch correctness.
DeploymentV1: deploymentKey, chainId, entrypoint, marketSelector, inspectionModuleId, declaredDependencyPath, expectedAuthorityModel.
deploymentKey must include chain + entrypoint + marketSelector (explicit empty selector allowed); no bare address-only identity.
InventoryV1: schemaVersion and canonical deployment array. Reject duplicates before hashing. Sort by stable key; sort assertion IDs; duplicates never disappear silently during sorting.
VerificationSpecV1: source domain, inventory digest, manifest digest, test-pack digest, required assertions/predicates, evaluator, snapshot/freshness requirements. Diagnostic runs reference this and have no financial policy.
CampaignPolicyV1: campaignId, supplier, sourceChainId, destinationChainId, source registry, Arc campaign address, eligibilityRoot, eligibleCount N, uniform grant G in token base units, token address/decimals, repairPolicyHash, testPackHash, verifier signer, challenger, independent reviewer, claimDeadline D, challengeWindow W, reviewTimeout A, snapshot/finality rule, receipt freshness and evidence retention. Terms are fixed before full funding; there is no customer repair fee, maintainer bond or penalty. Roles and addresses across chains are explicit; never infer same-address ownership.

RunRequestV1: verificationScopeId, purpose, mode, inventory/spec references; campaignId and campaignPolicyHash are required only for campaign-claim runs. Server loads authoritative campaign terms and eligibility rather than trusting client overrides. Preview actions are never claim-eligible.
SnapshotV1: chainId, blockNumber, blockHash, blockTimestamp, finalityRuleId.
DeploymentResultV1: deploymentKey, observed dependency path/config/code identity/authority, assertion entries (id, outcome, expected, observed, evidenceRef), suggested action owner.
EvidenceBundleV1: schemaVersion, runId, purpose, mode, verificationScopeId, optional campaignId/campaignPolicyHash/deploymentKey/recipient, snapshot, inventory/manifest/testPack hashes, runner image/tool identity, per-deployment assertions, scenario interventions, artifact digests and scoped verifier signature. A claim receipt identifies one deployment; a batch diagnostic bundle cannot silently qualify all deployments.
Only a single source-chain block number/hash per initial complete run. Missing or duplicate deployments/assertions and mixed snapshots cannot qualify. If batching internally, the resulting bundle must preserve the same snapshot and exact scope.

## Encoding and signature freeze: PB-03 deliverable
Use Solidity ABI encoding for onchain commitments, not pretty-printed JSON. Define one exact ordered CampaignPolicyV1 tuple in Solidity and TypeScript; nested variable structures are represented by canonical hashes. The EIP-712/CCIP domain binds schema version, campaign ID, source chain/registry and destination chain/campaign contract.
Use RFC 8785 canonical JSON bytes for offchain manifests/evidence payloads, excluding their own digest/signature fields; use keccak256 for content fingerprints consistently. Numeric blockchain values are decimal strings, not unsafe JSON numbers. URI and digest are separate; content fingerprint proves identity, not availability.
Initial verifier: explicit EOA signing EIP-712 typed AcceptanceReceipt fields campaignId, campaignPolicyHash, sourceChainId, deploymentKey, recipient, snapshotHash, testPackHash, evidenceDigest, result, issuedAt, expiresAt and unique receiptId. Diagnostic evidence uses a separate typed structure with verificationScopeId, not zero-filled campaign aliases. Freeze exact type strings, domains, field order and enums in executable golden vectors.
Campaign creation/funding is authorized by the supplier wallet on Arc. Claimant wallet authorization binds the fixed recipient; verifier signature support is limited to the declared EOA scheme initially. Do not claim arbitrary EIP-1271 verifier support. Offchain login may support EIP-1271 separately as described below.
CRE must parse/verify the chosen signing scheme in its actual supported runtime. If unsupported, block/change the interface through joint review, not skip verification.

Produce vectors for: valid campaign, changed recipient, changed chain, altered eligibility root, duplicate deployment rejected, wrong campaign/test-pack, preview mode rejected, stale evidence, replayed receipt and one valid signature plus invalid signature. Both TS and Solidity hashes must match where Solidity consumes the encoding. B owns Solidity structs/type hashes and contract vectors; A owns matching TypeScript encodings. B exports the initial contract boundary in docs/handoffs/PB-03-contracts.md. Any later semantic change must be coordinated before integration.

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
| GET /runs/:runId | none | `RunStatusV1` with job state, `evidenceReferenceStored`, and `repairOutcome: not-evaluated`; assertion outcomes live in the evidence artifact; authorize tenant |
| GET /runs/:runId/evidence | none | immutable report refs; diagnostic privacy rules; explicit public demo evidence |
| GET /runs/:runId/actions | none | owner-specific unsigned proposals; no automatic execution |
| POST /campaigns | campaign policy + eligibility commitment | validated campaign draft/hash; supplier authorization required to create/fund on Arc |
| GET /campaigns/:campaignId | none | chain-derived funding, eligibility, claims, disputes, grants and refunds with sync block |
| POST /campaigns/:campaignId/claims | deployment key + receipt + eligibility proof | claim/CCIP proposal; exact recipient is receipt-bound |
| GET /campaigns/:campaignId/claims/:deploymentKey | none | verifier result, receipt, challenge, award and withdrawal state |
| GET /campaigns/:campaignId/transactions/:action | action inputs as appropriate | unsigned fund/challenge/finalize/withdraw/recover-unallocated proposal |

HTTP session authentication must check nonce/domain/expiry and the declared chain. Support ordinary wallet signature verification; for supported contract wallets use their onchain EIP-1271 check at the correct chain. Reject unsupported wallet types explicitly. No browser-supplied wallet field substitutes for authentication.
Errors: INVALID_INPUT, UNAUTHORIZED, FORBIDDEN, UNSUPPORTED_PATTERN, POLICY_MISMATCH, STALE_EVIDENCE, RPC_UNAVAILABLE, ARTIFACT_UNAVAILABLE, CONFLICT, RATE_LIMITED. Return stable code, requestId and safe message. No secrets or raw credential-bearing URLs.
Idempotency key is scoped to authenticated owner and request digest; same key with different payload returns conflict. Bounded body sizes and job quotas protect compute.
Artifact fetching must restrict destinations/schemes, prevent private-network/metadata access, limit size/time/redirects and verify digests. Local-file artifact scheme is local-mode only.

## Chain interfaces and messages
CampaignRegistry (Sepolia): record a supplier campaign mirror/accepted receipt, authenticate CRE/evaluator evidence, and dispatch the immutable acceptance fact through CCIP. Exact ABI is frozen at PB-03/PB-15/PB-16. Acceptance callback must be authenticated and have no public mark-pass bypass.
RemediationCampaign (Arc): create/fund/activate campaign, verify eligibility proof and signed receipt, reserve exactly G per deployment, challenge before W, resolve through the configured reviewer before A, finalize, withdraw to the bound recipient, and recover only unallocated funds after claim cutoffs. No function can sweep reserved or awarded grants.
Message kind: ACCEPTANCE_RECEIPT. Envelope binds schemaVersion, campaignId, campaignPolicyHash, sourceChainId, deploymentKey, receiptId, recipient, evidenceDigest, snapshotHash, issuedAt/expiresAt and businessMessageId. Keep CCIP transport messageId separate; authenticate router, source selector and exact source registry before storing. Reject duplicate/replayed business facts and late messages that could revive terminal state.
Each deployment claim is independent. A failed/unknown result does not reserve funds. A passing receipt reserves G pending its bounded challenge window. Undisputed or reviewer-approved claims become pull-withdrawable; rejection/reviewer timeout releases the reservation. After D, no new claims; pending/disputed reservations remain protected. Supplier refund is restricted to unallocated funds, never reserved/awarded/paid balances.
Events: CampaignCreated, CampaignFunded, CampaignActivated, AcceptanceReceived, GrantReserved, ChallengeOpened, ClaimAwarded, ClaimRejected, GrantWithdrawn, UnallocatedRefunded. Include campaign/deployment/receipt/message IDs as applicable. Events are audit inputs; indexed views are not authority.
Accounting invariant: deposited = unallocated + reserved + awarded-unwithdrawn + paid + refunded. Financial assertions read actual chain state. Direct claim/challenge/finalize/withdraw/recover exits must work without the verifier API; no user should mistake a UI badge or event alone for a settled grant.

## Runtime configuration and provenance
Public network manifests: chain IDs/selectors, contract addresses, token decimals, explorer URLs, supported pattern/version, deployment tx hashes and code hashes.
Private env: RPC credentials, DB URL, artifact credentials, evaluator signing secret, CRE credentials where required. Separate each person's local env; never distribute through handbook or commit.
State-change wallet keys belong to the human wallet. No general owner key in the API/worker.
Source and destination observations store block/hash. Indexer can replay from deployment block with deduplication and reorg handling; lag is visible.
Test commands proposed for bootstrap: pnpm lint; pnpm typecheck; pnpm test; pnpm test:integration; pnpm test:e2e; forge test --root contracts. PB-00 must implement and document actual script names; these are not available yet.

## PB-03 implemented handoff
A completed the Solidity and TypeScript boundary at the user’s request. B starts PB-14 and consumes these types; do not independently regenerate them. Fixture getter/operation ABIs are in packages/schema/src/fixture-abi.ts for the artificial PB-07 test app. CRE WASM runtime validation now passes for the shared EIP-712 scheme; docs/handoffs/CRE-PROBE.md distinguishes this fixture capability proof from product integration.
