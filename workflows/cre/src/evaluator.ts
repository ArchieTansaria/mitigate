import { type Hex, recoverTypedDataAddress } from "viem";
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
