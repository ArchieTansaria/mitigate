import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalHash,
  deploymentKey,
  diagnosticTypedData,
  hashPolicy,
} from "../../../packages/schema/src/encoding.ts";
import { fixturePolicy } from "../../../packages/schema/test/fixtures.ts";
import { type ChainFacts, evaluateEvidence } from "../src/main.ts";

vi.mock("@chainlink/cre-sdk", () => ({
  Runner: { newRunner: async () => ({ run: async () => undefined }) },
  CronCapability: class {
    trigger() {
      return {};
    }
  },
  handler: () => ({}),
}));

// Synthetic signed inputs exercise the validator only; they are never live evidence.
const signer = privateKeyToAccount(`0x${"01".repeat(32)}`);
const now = 1200n;
const assertionIds = ["configuration", "stale-rejected", "valid-quote"];
const manifest = {
  schemaVersion: 1 as const,
  releaseId: "synthetic-test-manifest",
  issueDescription: "Synthetic test input only",
  supportedPatternId: "eip1967-transparent-v1" as const,
  sourceChainId: fixturePolicy.sourceChainId,
  approvedImplementationAddress: fixturePolicy.campaign,
  approvedRuntimeCodeHash: `0x${"77".repeat(32)}`,
  configurationPredicates: [],
  testPackDigest: fixturePolicy.testPackHash,
  requiredAssertionIds: assertionIds,
  prerequisites: [],
  artifactRefs: [],
};
const policy = {
  ...fixturePolicy,
  verifier: signer.address,
  repairPolicyHash: canonicalHash(manifest),
};
const deployKey = deploymentKey(
  policy.sourceChainId,
  policy.supplier,
  `0x${"00".repeat(32)}`,
);
const snapshot = {
  chainId: policy.sourceChainId,
  blockNumber: "10",
  blockHash: `0x${"55".repeat(32)}`,
  blockTimestamp: "1000",
};
const deployment = {
  chainId: policy.sourceChainId,
  entrypoint: policy.supplier,
  marketSelector: `0x${"00".repeat(32)}`,
  inspectionModuleId: "eip1967-transparent-v1" as const,
  declaredDependencyPath: [policy.supplier],
  expectedAuthorityModel: "owner" as const,
};
const inventory = {
  schemaVersion: 1 as const,
  deployments: [{ ...deployment, deploymentKey: deployKey }],
};
const specBase = {
  schemaVersion: 1 as const,
  sourceChainId: policy.sourceChainId,
  inventoryDigest: canonicalHash(inventory),
  manifestDigest: canonicalHash(manifest),
  testPackDigest: policy.testPackHash,
  requiredAssertionIds: assertionIds,
  evaluator: policy.verifier,
  maxSnapshotAge: "300",
  confirmations: 2,
};
const facts = (): ChainFacts => ({
  campaignExists: true,
  registryPolicyHash: hashPolicy(policy),
  campaignPolicyHash: hashPolicy(policy),
  campaignActive: true,
  eligible: true,
  deploymentRegistered: true,
  registeredRecipient: "0x4444444444444444444444444444444444444444",
  sourceFinalizedBlock: {
    number: "20",
    hash: `0x${"99".repeat(32)}`,
    timestamp: "1190",
  },
  observedSourceBlock: {
    number: snapshot.blockNumber,
    hash: snapshot.blockHash,
    timestamp: snapshot.blockTimestamp,
  },
});

async function signedEvidence(
  options: {
    omitDeployment?: boolean;
    reportSnapshot?: typeof snapshot;
    nonPass?: boolean;
    purpose?: "campaign-claim" | "diagnostic";
  } = {},
) {
  const reportInventory = options.omitDeployment
    ? {
        schemaVersion: 1 as const,
        deployments: [
          ...inventory.deployments,
          {
            ...deployment,
            entrypoint: "0x5555555555555555555555555555555555555555",
            deploymentKey: deploymentKey(
              policy.sourceChainId,
              "0x5555555555555555555555555555555555555555",
              `0x${"00".repeat(32)}`,
            ),
          },
        ].sort((a, b) => a.deploymentKey.localeCompare(b.deploymentKey)),
      }
    : inventory;
  const reportSpecBase = {
    ...specBase,
    inventoryDigest: canonicalHash(reportInventory),
  };
  const reportSpec = {
    ...reportSpecBase,
    verificationScopeId: canonicalHash(reportSpecBase),
  };
  const requiredAssertions = reportSpec.requiredAssertionIds.map((id) => ({
    id,
    outcome: options.nonPass ? ("unknown" as const) : ("pass" as const),
    expected: "required",
    observed: "pass",
    evidenceRef: `0x${"66".repeat(32)}`,
  }));
  const makeResult = (key: string) => ({
    deploymentKey: key,
    completePass: true,
    evidence: {
      schemaVersion: 1,
      runId: "synthetic-campaign-report",
      purpose: options.purpose ?? "campaign-claim",
      mode: "deployed",
      verificationScopeId: reportSpec.verificationScopeId,
      snapshot: options.reportSnapshot ?? snapshot,
      inventoryHash: reportSpec.inventoryDigest,
      manifestHash: reportSpec.manifestDigest,
      testPackHash: reportSpec.testPackDigest,
      runnerImageDigest: `sha256:${"1".repeat(64)}`,
      assertions: requiredAssertions,
      deploymentKey: key,
      campaignId: policy.campaignId,
      campaignPolicyHash: hashPolicy(policy),
      recipient: facts().registeredRecipient,
      artifactDigests: [`0x${"66".repeat(32)}`],
    },
  });
  const results = options.omitDeployment
    ? [makeResult(deployKey)]
    : [makeResult(deployKey)];
  const body = {
    schemaVersion: 1,
    runId: "synthetic-campaign-report",
    purpose: options.purpose ?? "campaign-claim",
    mode: "deployed",
    spec: reportSpec,
    manifest,
    inventory: reportInventory,
    snapshot: options.reportSnapshot ?? snapshot,
    issuedAt: "1100",
    expiresAt: "1300",
    results,
    summary: { completePass: true, passing: 1, total: 1 },
  };
  const attestation = {
    schemaVersion: 1,
    verificationScopeId: reportSpec.verificationScopeId,
    sourceChainId: policy.sourceChainId,
    evidenceDigest: canonicalHash(body),
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
  };
  const signature = await signer.signTypedData(
    diagnosticTypedData(attestation),
  );
  return { body, attestation, signer: signer.address, signature };
}

describe("PB-21 CRE evidence evaluation (synthetic test inputs)", () => {
  it("accepts only complete, signed, fresh campaign evidence matching finalized chain facts", async () => {
    const result = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence(),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: facts(),
      simulationOnly: true,
    });
    expect(result).toMatchObject({
      outcome: "verified-evidence",
      settlementEligible: false,
      executionContext: "simulation-test",
    });
  });

  it("rejects an onchain policy hash mismatch", async () => {
    const chain = facts();
    chain.registryPolicyHash = `0x${"ab".repeat(32)}`;
    const result = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence(),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: chain,
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      reason: "POLICY_HASH_MISMATCH",
    });
  });

  it("rejects omitted deployment coverage even when the requested result is present", async () => {
    const result = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence({ omitDeployment: true }),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: facts(),
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      reason: "DEPLOYMENT_COVERAGE_MISMATCH",
    });
  });

  it("rejects poisoned API content and a stale signed response", async () => {
    const poisoned = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: "{not-json",
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: facts(),
    });
    const stale = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence(),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now: 1400n,
      facts: facts(),
    });
    expect(poisoned).toMatchObject({
      outcome: "rejected",
      reason: "POISONED_EVIDENCE_RESPONSE",
    });
    expect(stale).toMatchObject({
      outcome: "rejected",
      reason: "STALE_OR_TAMPERED_EVIDENCE",
    });
  });

  it("rejects a snapshot that does not match the finalized source-chain header", async () => {
    const chain = facts();
    chain.observedSourceBlock = {
      ...chain.observedSourceBlock,
      hash: `0x${"aa".repeat(32)}`,
    };
    const result = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence(),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: chain,
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      reason: "SNAPSHOT_INCOMPATIBLE",
    });
  });

  it("rejects diagnostic purpose and any missing mandatory pass outcome", async () => {
    const diagnostic = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence({ purpose: "diagnostic" }),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: facts(),
    });
    const incomplete = await evaluateEvidence({
      policyInput: policy,
      evidenceInput: await signedEvidence({ nonPass: true }),
      requestedDeploymentKey: deployKey,
      requestedRecipient: facts().registeredRecipient,
      now,
      facts: facts(),
    });
    expect(diagnostic).toMatchObject({
      outcome: "rejected",
      reason: "PURPOSE_OR_MODE_MISMATCH",
    });
    expect(incomplete).toMatchObject({
      outcome: "rejected",
      reason: expect.stringContaining("MANDATORY_OUTCOME_FAILURE"),
    });
  });
});
