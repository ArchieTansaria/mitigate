import { type Hex, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, test } from "vitest";
import { canonicalHash } from "../../../packages/schema/src/encoding.ts";
import { SnapshotSchema } from "../../../packages/schema/src/types.ts";
import { normalizeInventory } from "../../../packages/schema/src/validation.ts";
import { testSigner } from "../../../packages/schema/test/fixtures.ts";
import { must } from "../../api/test/assert.ts";
import {
  buildEvidence,
  type EvidenceInput,
  signEvidence,
  verifySignedEvidence,
} from "../src/evidence/bundle.ts";
import { RUNNER_IMAGE } from "../src/runner/oracle.ts";

const hash = `0x${"11".repeat(32)}` as Hex;
function input(): EvidenceInput {
  const normalized = normalizeInventory([
    {
      chainId: "31337",
      entrypoint: testSigner.address,
      marketSelector: zeroHash,
      inspectionModuleId: "eip1967-transparent-v1",
      declaredDependencyPath: [],
      expectedAuthorityModel: "owner",
    },
  ]);
  const inventory = { schemaVersion: 1, deployments: normalized.deployments };
  const manifest = {
    schemaVersion: 1,
    releaseId: "unit-test-only",
    issueDescription: "synthetic structural coverage fixture",
    supportedPatternId: "eip1967-transparent-v1",
    sourceChainId: "31337",
    approvedImplementationAddress: testSigner.address,
    approvedRuntimeCodeHash: hash,
    configurationPredicates: [],
    testPackDigest: hash,
    requiredAssertionIds: ["configuration", "stale-rejected", "valid-quote"],
    prerequisites: [],
    artifactRefs: [],
  };
  const base = {
    schemaVersion: 1,
    sourceChainId: "31337",
    inventoryDigest: canonicalHash(inventory),
    manifestDigest: canonicalHash(manifest),
    testPackDigest: hash,
    requiredAssertionIds: manifest.requiredAssertionIds,
    evaluator: testSigner.address,
    maxSnapshotAge: "300",
    confirmations: 1,
  };
  const spec = { ...base, verificationScopeId: canonicalHash(base) };
  const snapshot = SnapshotSchema.parse({
    chainId: "31337",
    blockNumber: "10",
    blockHash: hash,
    blockTimestamp: "1000",
  });
  const assertion = (id: string) => ({
    id,
    outcome: "pass" as const,
    expected: "unit-fixture",
    observed: "unit-fixture",
    evidenceRef: hash,
  });
  return {
    runId: "unit-test",
    mode: "deployed",
    purpose: "diagnostic",
    spec,
    inventory,
    manifest,
    snapshot,
    evaluations: [
      {
        inspection: {
          schemaVersion: 1,
          deploymentKey: must(normalized.deployments[0]).deploymentKey,
          snapshot,
          status: "supported",
          reason: null,
          conditions: [],
          assertions: [
            "implementation",
            "dependency-path",
            "authority",
            "configuration",
          ].map(assertion),
        },
        runner: {
          schemaVersion: 1,
          status: "completed",
          reason: null,
          executionKind: "isolated-state-replay",
          claimEligible: false,
          assertions: ["valid-quote", "stale-rejected"].map(assertion),
          interventions: [],
          container: { image: RUNNER_IMAGE, network: "none", memoryMiB: 256 },
          trace: {
            stateDigest: canonicalHash({ snapshot, state: {} }),
            harnessHash: hash,
          },
        },
      },
    ],
  };
}
test("binds complete diagnostic evidence and signs in its separate domain", async () => {
  const data = input(),
    body = buildEvidence(data, 1010n),
    signed = await signEvidence(body, testSigner);
  expect(body.summary.completePass).toBe(true);
  expect(body.claimEligible).toBe(false);
  expect(await verifySignedEvidence(signed, body.spec, 1011n)).toEqual({
    valid: true,
    completePass: true,
  });
  signed.body.summary.completePass = false;
  expect((await verifySignedEvidence(signed, body.spec, 1011n)).valid).toBe(
    false,
  );
});
test("rejects omitted, duplicated or mixed-snapshot deployment coverage", () => {
  const d = input();
  expect(() => buildEvidence({ ...d, evaluations: [] }, 1010n)).toThrow();
  expect(() =>
    buildEvidence(
      { ...d, evaluations: [...d.evaluations, ...d.evaluations] },
      1010n,
    ),
  ).toThrow();
  must(d.evaluations[0]).inspection.snapshot = {
    ...d.snapshot,
    blockHash: `0x${"22".repeat(32)}`,
  };
  expect(() => buildEvidence(d, 1010n)).toThrow(/SNAPSHOT/);
});
test("missing or duplicate assertions cannot produce a complete signed bundle", () => {
  for (const mutation of ["missing", "duplicate"]) {
    const d = input(),
      a = must(d.evaluations[0]).runner.assertions;
    if (mutation === "missing") a.pop();
    else a.push(must(a[0]));
    expect(() => buildEvidence(d, 1010n)).toThrow(/COVERAGE/);
  }
});
test("wrong scope/test pack, stale report and evaluator rotation are rejected", async () => {
  const d = input();
  expect(() =>
    buildEvidence(
      {
        ...d,
        manifest: { ...(d.manifest as object), testPackDigest: zeroHash },
      },
      1010n,
    ),
  ).toThrow();
  expect(() => buildEvidence(d, 1300n)).toThrow(/STALE/);
  const body = buildEvidence(d, 1010n);
  await expect(
    signEvidence(body, privateKeyToAccount(`0x${"02".repeat(32)}`)),
  ).rejects.toThrow(/EVALUATOR/);
  const signed = await signEvidence(body, testSigner);
  expect((await verifySignedEvidence(signed, body.spec, 1300n)).valid).toBe(
    false,
  );
});
test("unknown prerequisites and preview never become deployed passes or campaign receipts", () => {
  const d = input();
  must(must(d.evaluations[0]).inspection.assertions[0]).outcome = "unknown";
  expect(buildEvidence(d, 1010n).summary.completePass).toBe(false);
  expect(
    buildEvidence({ ...input(), mode: "preview" }, 1010n).summary.completePass,
  ).toBe(false);
  expect(() =>
    buildEvidence({ ...input(), purpose: "campaign-claim" }, 1010n),
  ).toThrow(/DIAGNOSTIC/);
});
