import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  diagnosticTypedData,
} from "../../../packages/schema/src/encoding";
import { RunStatusSchema } from "../../../packages/schema/src/types";
import { EvidenceView } from "../app/components/evidence-view";
import {
  diagnosticRerunRequest,
  parseEvidence,
  runSchema,
  shouldPollRun,
  verifyEvidenceIntegrity,
  withEvidenceIntegrity,
} from "../lib/evidence";

const hash = `0x${"11".repeat(32)}`;
const address = `0x${"22".repeat(20)}`;
const snapshot = {
  chainId: "31337",
  blockNumber: "10",
  blockHash: hash,
  blockTimestamp: "1000",
};
const assertion = (id: string) => ({
  id,
  outcome: "pass",
  expected: "approved condition",
  observed: "observed condition",
  evidenceRef: hash,
});
// Structural UI fixture, never runtime evidence or a valid cryptographic signature.
export function evidenceFixture() {
  const assertions = ["configuration", "stale-rejected", "valid-quote"].map(
    assertion,
  );
  const spec = {
    schemaVersion: 1,
    verificationScopeId: hash,
    sourceChainId: "31337",
    inventoryDigest: hash,
    manifestDigest: hash,
    testPackDigest: hash,
    evaluator: address,
    maxSnapshotAge: "300",
    confirmations: 1,
    requiredAssertionIds: assertions.map((a) => a.id),
  };
  const evidence = {
    schemaVersion: 1,
    runId: "run-1",
    purpose: "diagnostic",
    mode: "deployed",
    verificationScopeId: hash,
    snapshot,
    inventoryHash: hash,
    manifestHash: hash,
    testPackHash: hash,
    runnerImageDigest: `sha256:${"33".repeat(32)}`,
    assertions,
    deploymentKey: hash,
    artifactDigests: [hash],
  };
  return {
    body: {
      schemaVersion: 1,
      runId: "run-1",
      purpose: "diagnostic",
      mode: "deployed",
      claimEligible: false,
      spec,
      inventory: {
        schemaVersion: 1,
        deployments: [
          { deploymentKey: hash, chainId: "31337", entrypoint: address },
        ],
      },
      manifest: {
        releaseId: "test-only",
        requiredAssertionIds: spec.requiredAssertionIds,
      },
      snapshot,
      issuedAt: "1010",
      expiresAt: "1300",
      results: [
        {
          deploymentKey: hash,
          completePass: true,
          evidence,
          inspection: {
            status: "supported",
            snapshot,
            deploymentKey: hash,
            reason: null,
            assertions: [
              "authority",
              "configuration",
              "dependency-path",
              "implementation",
            ].map(assertion),
            conditions: [],
          },
          runner: {
            status: "completed",
            reason: null,
            executionKind: "isolated-state-replay",
            assertions: ["valid-quote", "stale-rejected"].map(assertion),
            interventions: [],
          },
        },
      ],
      summary: { completePass: true, passing: 1, total: 1 },
    },
    attestation: {
      schemaVersion: 1,
      verificationScopeId: hash,
      sourceChainId: "31337",
      evidenceDigest: hash,
      issuedAt: "1010",
      expiresAt: "1300",
    },
    signer: address,
    signature: `0x${"44".repeat(65)}`,
  };
}

describe("evidence display fails closed", () => {
  it.each(["queued", "running", "succeeded", "failed", "cancelled"])(
    "parses the actual shared %s run status without implying repair success",
    (state) => {
      const response = RunStatusSchema.parse({
        schemaVersion: 1,
        id: "85c2ba0a-d549-4f51-9f70-4067826b28a5",
        state,
        attempts: 1,
        errorCode: null,
        evidenceReferenceStored: state === "succeeded",
        repairOutcome: "not-evaluated",
      });
      const parsed = runSchema.parse(response);
      expect(parsed).toEqual(response);
      expect(parsed.repairOutcome).toBe("not-evaluated");
      expect(parsed.evidenceReferenceStored).toBe(state === "succeeded");
    },
  );
  it("rejects legacy run fields and unsupported status schema versions", () => {
    const response = {
      schemaVersion: 1,
      id: "85c2ba0a-d549-4f51-9f70-4067826b28a5",
      state: "succeeded",
      attempts: 1,
      errorCode: null,
      evidenceReferenceStored: true,
      repairOutcome: "not-evaluated",
    };
    expect(runSchema.safeParse({ ...response, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(
      runSchema.safeParse({
        ...response,
        evidenceAvailable: true,
        repairResult: "available-in-evidence",
      }).success,
    ).toBe(false);
    expect(
      runSchema.safeParse({ ...response, repairOutcome: "pass" }).success,
    ).toBe(false);
  });
  async function signedFixture() {
    // Public test-only key; this fixture is not chain evidence.
    const signer = privateKeyToAccount(`0x${"01".repeat(32)}`);
    const data = evidenceFixture();
    Object.assign(data.body.manifest, { testPackDigest: hash });
    data.body.spec.evaluator = signer.address;
    data.signer = signer.address;
    data.body.spec.inventoryDigest = canonicalHash(data.body.inventory);
    data.body.spec.manifestDigest = canonicalHash(data.body.manifest);
    const { verificationScopeId: _, ...base } = data.body.spec;
    const scope = canonicalHash(base);
    data.body.spec.verificationScopeId = scope;
    Object.assign(data.body.results[0].evidence, {
      verificationScopeId: scope,
      inventoryHash: data.body.spec.inventoryDigest,
      manifestHash: data.body.spec.manifestDigest,
    });
    data.attestation.verificationScopeId = scope;
    data.attestation.evidenceDigest = canonicalHash(data.body);
    data.signature = await signer.signTypedData(
      diagnosticTypedData(data.attestation),
    );
    return { data, signer };
  }

  it("verifies the raw body and recovered signer, without declaring the evaluator trusted", async () => {
    const { data } = await signedFixture();
    const integrity = await verifyEvidenceIntegrity(data);
    expect(integrity.valid).toBe(true);
    const parsed = withEvidenceIntegrity(
      parseEvidence(data, "run-1", 1100),
      integrity,
    );
    expect(parsed.status).toBe("reported-pass");
    const html = renderToStaticMarkup(
      createElement(EvidenceView, { evidence: parsed }),
    );
    expect(html).toContain("Authenticity: verified");
    expect(html).toContain("independent trust");
    expect(html).toContain("not replayed");
  });

  it("withholds reported pass and repair controls during pending or invalid authenticity", async () => {
    const { data } = await signedFixture();
    for (const integrity of [null, { valid: false, reason: "Tampered" }]) {
      const parsed = withEvidenceIntegrity(
        parseEvidence(data, "run-1", 1100),
        integrity,
      );
      expect(parsed.status).toBe("unknown");
      const html = renderToStaticMarkup(
        createElement(EvidenceView, {
          evidence: parsed,
          repair: () => "REPAIR_CONTROL",
        }),
      );
      expect(html).not.toContain("Reported pass");
      expect(html).not.toContain("REPAIR_CONTROL");
    }
  });

  it("rejects tampering in raw fields that the display schema strips", async () => {
    const { data } = await signedFixture();
    Object.assign(data.body.results[0].runner, {
      trace: { scriptDigest: hash },
    });
    expect((await verifyEvidenceIntegrity(data)).valid).toBe(false);
  });

  it("rejects corrupted signatures and a valid signature from the wrong account", async () => {
    const { data } = await signedFixture();
    data.signature = `0x${"00".repeat(65)}`;
    expect((await verifyEvidenceIntegrity(data)).valid).toBe(false);
    data.signature = await privateKeyToAccount(
      `0x${"02".repeat(32)}`,
    ).signTypedData(diagnosticTypedData(data.attestation));
    expect((await verifyEvidenceIntegrity(data)).valid).toBe(false);
  });

  it.each(["inventory", "manifest", "spec"])(
    "rejects inconsistent %s digests even when the changed body is re-signed",
    async (field) => {
      const { data, signer } = await signedFixture();
      if (field === "inventory")
        data.body.inventory.deployments[0].entrypoint = signer.address;
      if (field === "manifest") data.body.manifest.releaseId = "altered";
      if (field === "spec") data.body.spec.confirmations = 2;
      data.attestation.evidenceDigest = canonicalHash(data.body);
      data.signature = await signer.signTypedData(
        diagnosticTypedData(data.attestation),
      );
      expect((await verifyEvidenceIntegrity(data)).valid).toBe(false);
    },
  );
  it("reuses the recorded scope for a deployed rerun even when evidence has expired", () => {
    const data = evidenceFixture();
    const { verificationScopeId: _, ...base } = data.body.spec;
    const scope = canonicalHash(base);
    data.body.spec.verificationScopeId = scope;
    data.body.results[0].evidence.verificationScopeId = scope;
    data.attestation.verificationScopeId = scope;
    expect(diagnosticRerunRequest(data, "run-1")).toEqual({
      schemaVersion: 1,
      verificationScopeId: scope,
      verificationSpecDigest: canonicalHash(data.body.spec),
      inventoryDigest: hash,
      manifestDigest: hash,
      purpose: "diagnostic",
      mode: "deployed",
    });
    data.body.spec.confirmations = 2;
    expect(() => diagnosticRerunRequest(data, "run-1")).toThrow(/scope digest/);
  });

  it("does not render green assertion rows or repair controls from inconsistent coverage", () => {
    const data = evidenceFixture();
    data.body.results.push(data.body.results[0]);
    const parsed = parseEvidence(data, "run-1", 1100);
    const html = renderToStaticMarkup(
      createElement(EvidenceView, {
        evidence: parsed,
        repair: () => "REPAIR_CONTROL",
      }),
    );
    expect(html).toContain("Unknown");
    expect(html).not.toContain("REPAIR_CONTROL");
    expect(html).not.toContain("approved condition");
  });
  it("shows a complete fresh result as reported pass, without claiming signature verification", () => {
    const parsed = parseEvidence(evidenceFixture(), "run-1", 1100);
    expect(parsed.status).toBe("reported-pass");
    const html = renderToStaticMarkup(
      createElement(EvidenceView, { evidence: parsed }),
    );
    expect(html).toContain("approved condition");
    expect(html).toContain("observed condition");
    expect(html).toContain("not independently verified");
    expect(html).toContain("not eligible for a campaign grant");
  });

  it.each(["fail", "unknown", "unsupported"])(
    "does not trust a pass summary over a %s assertion",
    (outcome) => {
      const data = evidenceFixture();
      data.body.results[0].evidence.assertions[0].outcome = outcome;
      expect(parseEvidence(data, "run-1", 1100).status).not.toBe(
        "reported-pass",
      );
    },
  );

  it.each(["omitted", "duplicate", "unexpected"])(
    "rejects %s assertion coverage",
    (mutation) => {
      const data = evidenceFixture();
      const list = data.body.results[0].evidence.assertions;
      if (mutation === "omitted") list.pop();
      if (mutation === "duplicate") list.push(list[0]);
      if (mutation === "unexpected") list[0].id = "other";
      expect(parseEvidence(data, "run-1", 1100).status).toBe("unknown");
    },
  );

  it.each(["empty", "duplicate", "missing"])(
    "rejects %s deployment coverage",
    (mutation) => {
      const data = evidenceFixture();
      if (mutation === "empty") data.body.results = [];
      if (mutation === "duplicate")
        data.body.results.push(data.body.results[0]);
      if (mutation === "missing")
        data.body.inventory.deployments.push({
          ...data.body.inventory.deployments[0],
          deploymentKey: `0x${"55".repeat(32)}`,
        });
      expect(parseEvidence(data, "run-1", 1100).status).toBe("unknown");
    },
  );

  it("rejects mismatched run, signer, scope, snapshot and unexpected schema", () => {
    const mutations = [
      (d: ReturnType<typeof evidenceFixture>) => {
        d.body.runId = "another-run";
      },
      (d: ReturnType<typeof evidenceFixture>) => {
        d.signer = `0x${"66".repeat(20)}`;
      },
      (d: ReturnType<typeof evidenceFixture>) => {
        d.attestation.verificationScopeId = `0x${"66".repeat(32)}`;
      },
      (d: ReturnType<typeof evidenceFixture>) => {
        d.body.results[0].evidence.snapshot = {
          ...snapshot,
          blockNumber: "11",
        };
      },
      (d: ReturnType<typeof evidenceFixture>) => {
        d.body.schemaVersion = 2;
      },
      (d: ReturnType<typeof evidenceFixture>) => {
        d.body.results[0].inspection.status = "unknown";
      },
    ];
    for (const mutate of mutations) {
      const data = evidenceFixture();
      mutate(data);
      expect(parseEvidence(data, "run-1", 1100).status).toBe("unknown");
    }
  });

  it("expires at the exact boundary and rejects future evidence", () => {
    expect(parseEvidence(evidenceFixture(), "run-1", 1300).status).toBe(
      "stale",
    );
    expect(parseEvidence(evidenceFixture(), "run-1", 1009).status).toBe(
      "unknown",
    );
  });

  it("never treats preview evidence or malformed success flags as a deployed pass", () => {
    const data = evidenceFixture();
    data.body.mode = "preview";
    data.body.results[0].evidence.mode = "preview";
    expect(parseEvidence(data, "run-1", 1100).status).toBe("preview");
    expect(
      parseEvidence(
        { body: { summary: { completePass: true } } },
        "run-1",
        1100,
      ).status,
    ).toBe("unknown");
    expect(parseEvidence(null, "run-1", 1100).status).toBe("unknown");
  });

  it("polls only pending/running jobs, never a terminal or unknown state", () => {
    for (const state of ["queued", "pending", "running"])
      expect(shouldPollRun(state)).toBe(true);
    for (const state of ["succeeded", "failed", "cancelled", "unknown", ""])
      expect(shouldPollRun(state)).toBe(false);
  });
});
