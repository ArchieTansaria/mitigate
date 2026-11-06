import { hashTypedData } from "viem";
import { expect, it } from "vitest";
import { diagnosticTypedData, receiptDigest } from "../src/encoding.ts";
import {
  EvidenceSchema,
  ManifestSchema,
  RunRequestSchema,
  VerificationSpecSchema,
} from "../src/types.ts";
import { validateEvidenceCoverage } from "../src/validation.ts";
import {
  fixtureSnapshot,
  fixturePolicy as p,
  fixtureReceipt as r,
} from "./fixtures.ts";

const spec = {
  schemaVersion: 1,
  verificationScopeId: p.repairPolicyHash,
  sourceChainId: p.sourceChainId,
  inventoryDigest: p.eligibilityRoot,
  manifestDigest: p.repairPolicyHash,
  testPackDigest: p.testPackHash,
  requiredAssertionIds: ["known-bad-rejected", "legitimate-operation"],
  evaluator: p.verifier,
  maxSnapshotAge: "300",
  confirmations: 2,
};
const evidence = {
  schemaVersion: 1,
  runId: "test-run",
  purpose: "campaign-claim",
  mode: "deployed",
  verificationScopeId: spec.verificationScopeId,
  snapshot: fixtureSnapshot,
  inventoryHash: spec.inventoryDigest,
  manifestHash: spec.manifestDigest,
  testPackHash: spec.testPackDigest,
  runnerImageDigest: `sha256:${"1".repeat(64)}`,
  assertions: spec.requiredAssertionIds.map((id) => ({
    id,
    outcome: "pass",
    expected: "valid",
    observed: "valid",
    evidenceRef: r.evidenceDigest,
  })),
  deploymentKey: r.deploymentKey,
  campaignId: p.campaignId,
  campaignPolicyHash: r.campaignPolicyHash,
  recipient: r.recipient,
  artifactDigests: [r.evidenceDigest],
};
it("rejects incomplete, duplicated, extra and nonpassing assertion coverage", () => {
  expect(validateEvidenceCoverage(spec, evidence, 1030n).completePass).toBe(
    true,
  );
  for (const assertions of [
    [],
    evidence.assertions.slice(1),
    [...evidence.assertions, evidence.assertions[0]],
    [...evidence.assertions, { ...evidence.assertions[0], id: "unexpected" }],
    evidence.assertions.map((a) => ({ ...a, outcome: "unknown" })),
  ])
    expect(
      validateEvidenceCoverage(spec, { ...evidence, assertions }, 1030n)
        .completePass,
    ).toBe(false);
});
it("rejects scope, snapshot, mode and test-pack substitutions", () => {
  for (const patch of [
    { testPackHash: r.evidenceDigest },
    { verificationScopeId: r.evidenceDigest },
    { mode: "preview" },
    { snapshot: { ...fixtureSnapshot, chainId: "1" } },
  ])
    expect(
      validateEvidenceCoverage(spec, { ...evidence, ...patch }, 1030n)
        .completePass,
    ).toBe(false);
  expect(validateEvidenceCoverage(spec, evidence, 2000n).completePass).toBe(
    false,
  );
  expect(validateEvidenceCoverage(spec, evidence, 999n).completePass).toBe(
    false,
  );
});
it("rejects diagnostic evidence carrying payment scope and duplicate required assertions", () => {
  expect(
    EvidenceSchema.safeParse({ ...evidence, purpose: "diagnostic" }).success,
  ).toBe(false);
  expect(
    VerificationSpecSchema.safeParse({
      ...spec,
      requiredAssertionIds: ["x", "x"],
    }).success,
  ).toBe(false);
  expect(
    RunRequestSchema.safeParse({
      schemaVersion: 1,
      verificationScopeId: spec.verificationScopeId,
      inventoryDigest: spec.inventoryDigest,
      manifestDigest: spec.manifestDigest,
      verificationSpecDigest: r.evidenceDigest,
      purpose: "campaign-claim",
      mode: "deployed",
    }).success,
  ).toBe(false);
});
it("uses a separate signing type/domain for diagnostics", () => {
  const diagnostic = diagnosticTypedData({
    schemaVersion: 1,
    verificationScopeId: spec.verificationScopeId,
    sourceChainId: p.sourceChainId,
    evidenceDigest: r.evidenceDigest,
    issuedAt: r.issuedAt,
    expiresAt: r.expiresAt,
  });
  expect(hashTypedData(diagnostic)).not.toBe(receiptDigest(p, r));
  expect(diagnostic.primaryType).toBe("DiagnosticEvidence");
});
it("rejects unknown pattern and duplicate configuration assertions in manifests", () => {
  const manifest = {
    schemaVersion: 1,
    releaseId: "fixture-v2",
    issueDescription: "Reject stale oracle results",
    supportedPatternId: "eip1967-transparent-v1",
    sourceChainId: p.sourceChainId,
    approvedImplementationAddress: p.supplier,
    approvedRuntimeCodeHash: r.evidenceDigest,
    configurationPredicates: [
      { id: "maxAge", readMethod: "maxAge()", operator: "eq", expected: "300" },
    ],
    testPackDigest: p.testPackHash,
    requiredAssertionIds: spec.requiredAssertionIds,
    prerequisites: [],
    artifactRefs: [],
  };
  expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  expect(
    ManifestSchema.safeParse({ ...manifest, supportedPatternId: "anything" })
      .success,
  ).toBe(false);
  expect(
    ManifestSchema.safeParse({
      ...manifest,
      configurationPredicates: [
        ...manifest.configurationPredicates,
        ...manifest.configurationPredicates,
      ],
    }).success,
  ).toBe(false);
});
