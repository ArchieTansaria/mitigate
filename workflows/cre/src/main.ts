import {
  blockNumber,
  bytesToHex,
  CronCapability,
  consensusIdenticalAggregation,
  EVMClient,
  encodeCallMsg,
  getHeader,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  LAST_FINALIZED_BLOCK_NUMBER,
  protoBigIntToBigint,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
  recoverTypedDataAddress,
} from "viem";
import {
  canonicalHash,
  diagnosticTypedData,
  hashPolicy,
} from "../../../packages/schema/src/encoding.ts";
import {
  Address,
  DiagnosticAttestationSchema,
  EvidenceSchema,
  Hash32,
  ManifestSchema,
  PolicySchema,
  VerificationSpecSchema,
} from "../../../packages/schema/src/types.ts";
import {
  normalizeInventory,
  validateEvidenceCoverage,
} from "../../../packages/schema/src/validation.ts";

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const evidenceDigestHeader = "x-evidence-digest";
const registryAbi = parseAbi([
  "function campaignExists(bytes32 campaignId) view returns (bool)",
  "function policyHashOf(bytes32 campaignId) view returns (bytes32)",
  "function isEligible(bytes32 campaignId,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32[] proof) view returns (bool)",
  "function isDeploymentRegistered(bytes32 campaignId,bytes32 deploymentKey) view returns (bool)",
  "function recipientOf(bytes32 campaignId,bytes32 deploymentKey) view returns (address)",
]);
const campaignAbi = parseAbi([
  "function registry() view returns (address)",
  "function policyHash() view returns (bytes32)",
  "function active() view returns (bool)",
]);

export type WorkflowConfig = {
  evidenceUrl: string;
  sourceNetwork: string;
  destinationNetwork: string;
  deploymentKey: string;
  recipient: string;
  eligibilityProof: string[];
  policy: unknown;
};

export type ChainFacts = {
  campaignExists: boolean;
  registryPolicyHash: string;
  campaignPolicyHash: string;
  campaignActive: boolean;
  eligible: boolean;
  deploymentRegistered: boolean;
  registeredRecipient: string;
  sourceFinalizedBlock: { number: string; hash: string; timestamp: string };
  observedSourceBlock: { number: string; hash: string; timestamp: string };
};

export type EvaluationReport = {
  schemaVersion: 1;
  kind: "PATCHBOND_CRE_EVIDENCE_EVALUATION";
  outcome: "verified-evidence" | "rejected";
  settlementEligible: false;
  reason?: string;
  campaignId?: string;
  campaignPolicyHash?: string;
  deploymentKey?: string;
  recipient?: string;
  evidenceDigest?: string;
  sourceSnapshot?: { number: string; hash: string; timestamp: string };
  destinationFinalizedBlock?: {
    number: string;
    hash: string;
    timestamp: string;
  };
  executionContext: "simulation-test" | "unverified-runtime-context";
};

type VerifiedEnvelope = {
  body: Record<string, unknown>;
  attestation: unknown;
  signer: string;
  signature: string;
};

const reject = (reason: string, simulationOnly: boolean): EvaluationReport => ({
  schemaVersion: 1,
  kind: "PATCHBOND_CRE_EVIDENCE_EVALUATION",
  outcome: "rejected",
  settlementEligible: false,
  reason,
  executionContext: simulationOnly
    ? "simulation-test"
    : "unverified-runtime-context",
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(input: unknown): VerifiedEnvelope {
  if (
    !record(input) ||
    !record(input.body) ||
    typeof input.signer !== "string" ||
    typeof input.signature !== "string"
  )
    throw new Error("POISONED_EVIDENCE_RESPONSE");
  return input as VerifiedEnvelope;
}

/** Validates the existing PB-10 signed bundle shape against the frozen PB-03/PB-14 scope. */
export async function evaluateEvidence(input: {
  policyInput: unknown;
  evidenceInput: unknown;
  requestedDeploymentKey: string;
  requestedRecipient: string;
  now: bigint;
  facts: ChainFacts;
  simulationOnly?: boolean;
}): Promise<EvaluationReport> {
  const simulationOnly = input.simulationOnly ?? false;
  try {
    const policy = PolicySchema.parse(input.policyInput);
    const requestedKey = Hash32.parse(input.requestedDeploymentKey);
    const recipient = Address.parse(input.requestedRecipient);
    const signed = parseEnvelope(input.evidenceInput);
    const body = signed.body;
    const spec = VerificationSpecSchema.parse(body.spec);
    const manifest = ManifestSchema.parse(body.manifest);
    const issued = DiagnosticAttestationSchema.parse(signed.attestation);
    const evidenceDigest = canonicalHash(body);
    const policyDigest = hashPolicy(policy);

    if (!input.facts.campaignExists) throw new Error("CAMPAIGN_NOT_FOUND");
    if (
      Hash32.parse(input.facts.registryPolicyHash) !== policyDigest ||
      Hash32.parse(input.facts.campaignPolicyHash) !== policyDigest
    )
      throw new Error("POLICY_HASH_MISMATCH");
    if (!input.facts.campaignActive) throw new Error("CAMPAIGN_NOT_ACTIVE");
    if (
      policy.sourceChainId !== spec.sourceChainId ||
      policy.verifier.toLowerCase() !== spec.evaluator.toLowerCase() ||
      policy.repairPolicyHash !== spec.manifestDigest ||
      policy.testPackHash !== spec.testPackDigest ||
      canonicalHash(manifest) !== policy.repairPolicyHash ||
      manifest.testPackDigest !== policy.testPackHash ||
      [...manifest.requiredAssertionIds].sort().join("\0") !==
        [...spec.requiredAssertionIds].sort().join("\0") ||
      spec.confirmations !== policy.confirmations ||
      BigInt(spec.maxSnapshotAge) > BigInt(policy.maxReceiptAge)
    )
      throw new Error("POLICY_SCOPE_MISMATCH");
    const { verificationScopeId, ...scopeBase } = spec;
    if (canonicalHash(scopeBase) !== verificationScopeId)
      throw new Error("VERIFICATION_SCOPE_HASH_MISMATCH");
    if (input.now >= BigInt(policy.claimDeadline))
      throw new Error("CLAIM_DEADLINE_PASSED");

    if (body.purpose !== "campaign-claim" || body.mode !== "deployed")
      throw new Error("PURPOSE_OR_MODE_MISMATCH");
    if (
      body.runId === undefined ||
      body.summary === undefined ||
      body.manifest === undefined ||
      body.inventory === undefined ||
      !Array.isArray(body.results)
    )
      throw new Error("POISONED_EVIDENCE_RESPONSE");
    const inventory = body.inventory;
    if (!record(inventory) || !Array.isArray(inventory.deployments))
      throw new Error("POISONED_EVIDENCE_RESPONSE");
    const inventoryDeployments = inventory.deployments;
    const normalized = normalizeInventory(
      inventoryDeployments.map((row) => {
        if (!record(row)) throw new Error("POISONED_EVIDENCE_RESPONSE");
        const { deploymentKey: _suppliedKey, ...deployment } = row;
        return deployment;
      }),
    );
    if (
      canonicalHash(inventory) !== spec.inventoryDigest ||
      normalized.deployments.length !== inventoryDeployments.length ||
      normalized.deployments.some(
        (deployment, index) =>
          deployment.deploymentKey !==
          (inventoryDeployments[index] as Record<string, unknown> | undefined)
            ?.deploymentKey,
      )
    )
      throw new Error("INVENTORY_SCOPE_MISMATCH");

    const results = body.results;
    const resultKeys = results.map((result) => {
      if (!record(result) || typeof result.deploymentKey !== "string")
        throw new Error("POISONED_EVIDENCE_RESPONSE");
      return Hash32.parse(result.deploymentKey);
    });
    const expectedKeys = normalized.deployments.map(
      (deployment) => deployment.deploymentKey,
    );
    if (
      new Set(resultKeys).size !== resultKeys.length ||
      resultKeys.length !== expectedKeys.length ||
      [...resultKeys]
        .sort()
        .some((key, index) => key !== [...expectedKeys].sort()[index])
    )
      throw new Error("DEPLOYMENT_COVERAGE_MISMATCH");
    if (!expectedKeys.includes(requestedKey))
      throw new Error("DEPLOYMENT_NOT_IN_REPORT");

    const observedSnapshot = body.snapshot;
    if (!record(observedSnapshot))
      throw new Error("POISONED_EVIDENCE_RESPONSE");
    if (
      BigInt(observedSnapshot.chainId as string) !==
      BigInt(policy.sourceChainId)
    )
      throw new Error("SNAPSHOT_CHAIN_MISMATCH");
    const sourceBlock = input.facts.observedSourceBlock;
    if (
      String(observedSnapshot.blockNumber) !== sourceBlock.number ||
      Hash32.parse(observedSnapshot.blockHash as string) !==
        Hash32.parse(sourceBlock.hash) ||
      String(observedSnapshot.blockTimestamp) !== sourceBlock.timestamp
    )
      throw new Error("SNAPSHOT_INCOMPATIBLE");
    const finalized = input.facts.sourceFinalizedBlock;
    if (
      BigInt(finalized.number) < BigInt(sourceBlock.number) ||
      BigInt(finalized.number) - BigInt(sourceBlock.number) + 1n <
        BigInt(policy.confirmations)
    )
      throw new Error("SNAPSHOT_NOT_FINALIZED");
    if (
      Hash32.parse(finalized.hash).length !== 66 ||
      BigInt(finalized.timestamp) < BigInt(sourceBlock.timestamp)
    )
      throw new Error("INVALID_FINALIZED_HEADER");

    if (
      issued.schemaVersion !== 1 ||
      issued.sourceChainId !== policy.sourceChainId ||
      issued.evidenceDigest !== evidenceDigest ||
      issued.issuedAt !== body.issuedAt ||
      issued.expiresAt !== body.expiresAt ||
      issued.verificationScopeId !== spec.verificationScopeId ||
      BigInt(issued.issuedAt) > input.now ||
      BigInt(issued.expiresAt) <= input.now ||
      BigInt(observedSnapshot.blockTimestamp as string) >
        BigInt(issued.issuedAt) ||
      input.now < BigInt(observedSnapshot.blockTimestamp as string) ||
      BigInt(issued.expiresAt) - BigInt(issued.issuedAt) >
        BigInt(policy.maxReceiptAge) ||
      input.now - BigInt(observedSnapshot.blockTimestamp as string) >
        BigInt(policy.maxReceiptAge)
    )
      throw new Error("STALE_OR_TAMPERED_EVIDENCE");
    if (
      signed.signer.toLowerCase() !== policy.verifier.toLowerCase() ||
      !/^0x[0-9a-fA-F]{130}$/.test(signed.signature)
    )
      throw new Error("INVALID_EVIDENCE_SIGNATURE");
    const recovered = await recoverTypedDataAddress({
      ...diagnosticTypedData(issued),
      signature: signed.signature as Hex,
    });
    if (
      recovered.toLowerCase() !== policy.verifier.toLowerCase() ||
      recovered.toLowerCase() !== signed.signer.toLowerCase()
    )
      throw new Error("INVALID_EVIDENCE_SIGNATURE");

    if (
      !input.facts.eligible ||
      !input.facts.deploymentRegistered ||
      Address.parse(input.facts.registeredRecipient).toLowerCase() !==
        recipient.toLowerCase()
    )
      throw new Error("DEPLOYMENT_NOT_ELIGIBLE_OR_REGISTERED");
    let target: Record<string, unknown> | undefined;
    let targetPass = false;
    const reportSnapshotDigest = canonicalHash(observedSnapshot);
    for (const result of results) {
      if (!record(result) || !record(result.evidence))
        throw new Error("POISONED_EVIDENCE_RESPONSE");
      const evidence = EvidenceSchema.parse(result.evidence);
      if (
        evidence.purpose !== "campaign-claim" ||
        evidence.mode !== "deployed" ||
        !evidence.recipient ||
        evidence.campaignId !== policy.campaignId ||
        evidence.campaignPolicyHash !== policyDigest ||
        evidence.deploymentKey !== result.deploymentKey ||
        canonicalHash(evidence.snapshot) !== reportSnapshotDigest ||
        evidence.testPackHash !== policy.testPackHash
      )
        throw new Error("EVIDENCE_SCOPE_MISMATCH");
      if (
        result.deploymentKey === requestedKey &&
        evidence.recipient.toLowerCase() !== recipient.toLowerCase()
      )
        throw new Error("RECIPIENT_SCOPE_MISMATCH");
      const coverage = validateEvidenceCoverage(spec, evidence, input.now);
      if (!coverage.completePass)
        throw new Error(
          `MANDATORY_OUTCOME_FAILURE:${coverage.reason ?? "UNKNOWN"}`,
        );
      if (result.deploymentKey === requestedKey) {
        target = result;
        targetPass =
          coverage.completePass &&
          evidence.assertions.every(
            (assertion) => assertion.outcome === "pass",
          );
      }
    }
    if (!target) throw new Error("DEPLOYMENT_NOT_IN_REPORT");
    if (!targetPass) throw new Error("REQUESTED_DEPLOYMENT_NOT_PASSING");

    return {
      schemaVersion: 1,
      kind: "PATCHBOND_CRE_EVIDENCE_EVALUATION",
      outcome: "verified-evidence",
      settlementEligible: false,
      campaignId: policy.campaignId,
      campaignPolicyHash: policyDigest,
      deploymentKey: requestedKey,
      recipient,
      evidenceDigest,
      sourceSnapshot: {
        number: sourceBlock.number,
        hash: Hash32.parse(sourceBlock.hash),
        timestamp: sourceBlock.timestamp,
      },
      destinationFinalizedBlock: {
        number: finalized.number,
        hash: Hash32.parse(finalized.hash),
        timestamp: finalized.timestamp,
      },
      executionContext: simulationOnly
        ? "simulation-test"
        : "unverified-runtime-context",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "INVALID_EVIDENCE";
    return reject(reason, simulationOnly);
  }
}

function fetchEvidence(requester: HTTPSendRequester, url: string): string {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error("UNSAFE_EVIDENCE_URL");
  const response = requester
    .sendRequest({
      url,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "PatchBond-CRE" },
      timeout: "10s",
    })
    .result();
  if (response.statusCode !== 200)
    throw new Error(`EVIDENCE_HTTP_STATUS_${response.statusCode}`);
  if (response.body.length === 0 || response.body.length > MAX_EVIDENCE_BYTES)
    throw new Error("EVIDENCE_SIZE_LIMIT");
  const digest = getHeader(response, evidenceDigestHeader);
  if (
    typeof digest !== "string" ||
    Hash32.parse(digest) !== awaitlessKeccak(response.body)
  )
    throw new Error("EVIDENCE_ARTIFACT_DIGEST_MISMATCH");
  return new TextDecoder().decode(response.body);
}

// CRE WASM's viem keccak helper accepts bytes; keeping digest verification on the received bytes
// matches the API's immutable artifact digest, not a reserialized JSON object.
function awaitlessKeccak(bytes: Uint8Array): Hex {
  return keccak256(bytesToHex(bytes));
}

function readAt(
  client: EVMClient,
  runtime: Runtime<WorkflowConfig>,
  address: string,
  data: Hex,
  height: bigint,
): Hex {
  const call = encodeCallMsg({
    from: "0x0000000000000000000000000000000000000000",
    to: Address.parse(address),
    data,
  });
  const response = client
    .callContract(runtime, { call, blockNumber: blockNumber(height) })
    .result();
  return bytesToHex(response.data);
}

function headerValue(
  header:
    | { blockNumber?: unknown; hash: Uint8Array; timestamp?: unknown }
    | undefined,
) {
  if (header === undefined) throw new Error("MISSING_CHAIN_HEADER");
  if (!header.blockNumber || !header.timestamp || header.hash.length !== 32)
    throw new Error("MISSING_CHAIN_HEADER");
  return {
    number: protoBigIntToBigint(header.blockNumber as never).toString(),
    hash: bytesToHex(header.hash),
    timestamp: BigInt(String(header.timestamp)).toString(),
  };
}

async function run(runtime: Runtime<WorkflowConfig>): Promise<string> {
  const config = runtime.config;
  const policy = PolicySchema.parse(config.policy);
  const sourceNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.sourceNetwork,
    isTestnet: true,
  });
  const destinationNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.destinationNetwork,
    isTestnet: true,
  });
  if (!sourceNetwork || !destinationNetwork)
    throw new Error("UNSUPPORTED_CONFIGURED_NETWORK");
  if (
    BigInt(sourceNetwork.chainId) !== BigInt(policy.sourceChainId) ||
    BigInt(destinationNetwork.chainId) !== BigInt(policy.destinationChainId)
  )
    throw new Error("CONFIGURED_NETWORK_CHAIN_MISMATCH");

  const raw = new HTTPClient()
    .sendRequest(
      runtime,
      (requester) => fetchEvidence(requester, config.evidenceUrl),
      consensusIdenticalAggregation<string>(),
    )()
    .result();
  const signed = JSON.parse(raw) as Record<string, unknown>;
  if (!record(signed.body) || !record(signed.body.snapshot))
    throw new Error("POISONED_EVIDENCE_RESPONSE");
  const snapshot = signed.body.snapshot;
  const source = new EVMClient(sourceNetwork.chainSelector.selector);
  const sourceFinalized = headerValue(
    source
      .headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
      .result().header,
  );
  const observedSource = headerValue(
    source
      .headerByNumber(runtime, {
        blockNumber: blockNumber(BigInt(String(snapshot.blockNumber))),
      })
      .result().header,
  );

  const destination = new EVMClient(destinationNetwork.chainSelector.selector);
  const destinationFinalized = headerValue(
    destination
      .headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
      .result().header,
  );
  const campaignAddress = Address.parse(policy.campaign);
  const destinationHeight = BigInt(destinationFinalized.number);
  const registryResult = readAt(
    destination,
    runtime,
    campaignAddress,
    encodeFunctionData({ abi: campaignAbi, functionName: "registry" }),
    destinationHeight,
  );
  const campaignRegistry = Address.parse(
    decodeFunctionResult({
      abi: campaignAbi,
      functionName: "registry",
      data: registryResult,
    }),
  );
  const exists = decodeFunctionResult({
    abi: registryAbi,
    functionName: "campaignExists",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "campaignExists",
        args: [policy.campaignId],
      }),
      destinationHeight,
    ),
  });
  const registryHash = decodeFunctionResult({
    abi: registryAbi,
    functionName: "policyHashOf",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "policyHashOf",
        args: [policy.campaignId],
      }),
      destinationHeight,
    ),
  });
  const campaignHash = decodeFunctionResult({
    abi: campaignAbi,
    functionName: "policyHash",
    data: readAt(
      destination,
      runtime,
      campaignAddress,
      encodeFunctionData({ abi: campaignAbi, functionName: "policyHash" }),
      destinationHeight,
    ),
  });
  const active = decodeFunctionResult({
    abi: campaignAbi,
    functionName: "active",
    data: readAt(
      destination,
      runtime,
      campaignAddress,
      encodeFunctionData({ abi: campaignAbi, functionName: "active" }),
      destinationHeight,
    ),
  });
  const eligible = decodeFunctionResult({
    abi: registryAbi,
    functionName: "isEligible",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "isEligible",
        args: [
          policy.campaignId,
          BigInt(policy.sourceChainId),
          Hash32.parse(config.deploymentKey),
          Address.parse(config.recipient),
          config.eligibilityProof.map((proof) => Hash32.parse(proof)),
        ],
      }),
      destinationHeight,
    ),
  });
  const registered = decodeFunctionResult({
    abi: registryAbi,
    functionName: "isDeploymentRegistered",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "isDeploymentRegistered",
        args: [policy.campaignId, Hash32.parse(config.deploymentKey)],
      }),
      destinationHeight,
    ),
  });
  const registeredRecipient = decodeFunctionResult({
    abi: registryAbi,
    functionName: "recipientOf",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "recipientOf",
        args: [policy.campaignId, Hash32.parse(config.deploymentKey)],
      }),
      destinationHeight,
    ),
  });
  const report = await evaluateEvidence({
    policyInput: policy,
    evidenceInput: signed,
    requestedDeploymentKey: config.deploymentKey,
    requestedRecipient: config.recipient,
    now: BigInt(destinationFinalized.timestamp),
    facts: {
      campaignExists: exists as boolean,
      registryPolicyHash: registryHash as string,
      campaignPolicyHash: campaignHash as string,
      campaignActive: active as boolean,
      eligible: eligible as boolean,
      deploymentRegistered: registered as boolean,
      registeredRecipient: registeredRecipient as string,
      sourceFinalizedBlock: sourceFinalized,
      observedSourceBlock: observedSource,
    },
  });
  runtime.log(`PATCHBOND_CRE_REPORT ${JSON.stringify(report)}`);
  return JSON.stringify(report);
}

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(() => [
    handler(new CronCapability().trigger({ schedule: "0 */10 * * * *" }), run),
  ]);
}
main();
