import { type Hex, recoverTypedDataAddress } from "viem";
import { z } from "zod";
import {
  canonicalHash,
  diagnosticTypedData,
} from "../../../packages/schema/src/encoding";
import {
  DiagnosticAttestationSchema,
  RunStatusSchema,
  VerificationSpecSchema,
} from "../../../packages/schema/src/types";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78);
const hex = z.string().regex(/^0x([0-9a-fA-F]{2})*$/);
const snapshot = z.object({
  chainId: uint,
  blockNumber: uint,
  blockHash: hash,
  blockTimestamp: uint,
});
const outcome = z.enum(["pass", "fail", "unknown", "unsupported"]);
const assertion = z.object({
  id: z.string().min(1),
  outcome,
  expected: z.string(),
  observed: z.string(),
  evidenceRef: hash,
});
export type EvidenceAssertion = z.infer<typeof assertion>;
const condition = assertion
  .omit({ evidenceRef: true })
  .extend({ responsible: address.nullable() });
const result = z.object({
  deploymentKey: hash,
  completePass: z.boolean(),
  evidence: z.object({
    schemaVersion: z.literal(1),
    runId: z.string(),
    purpose: z.literal("diagnostic"),
    mode: z.enum(["preview", "deployed"]),
    verificationScopeId: hash,
    snapshot,
    inventoryHash: hash,
    manifestHash: hash,
    testPackHash: hash,
    runnerImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    assertions: z.array(assertion).min(1).max(128),
    deploymentKey: hash,
    artifactDigests: z.array(hash).min(1),
  }),
  inspection: z.object({
    status: z.enum(["supported", "unsupported", "unknown"]),
    reason: z.string().nullable(),
    snapshot,
    deploymentKey: hash,
    assertions: z.array(assertion),
    conditions: z
      .array(condition)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
      ),
    observed: z.record(z.string(), z.unknown()).optional(),
  }),
  runner: z.object({
    status: z.enum(["completed", "unsupported", "unknown"]),
    reason: z.string().nullable(),
    executionKind: z.literal("isolated-state-replay"),
    assertions: z.array(assertion),
    interventions: z
      .array(
        z.object({
          id: z.string(),
          target: z.string(),
          explanation: z.string(),
          storage: z.record(z.string(), z.string()),
        }),
      )
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
      ),
  }),
});
const signedEvidence = z.object({
  body: z.object({
    schemaVersion: z.literal(1),
    runId: z.string(),
    purpose: z.literal("diagnostic"),
    mode: z.enum(["preview", "deployed"]),
    claimEligible: z.literal(false),
    spec: z.object({
      verificationScopeId: hash,
      sourceChainId: uint,
      inventoryDigest: hash,
      manifestDigest: hash,
      testPackDigest: hash,
      evaluator: address,
      maxSnapshotAge: uint,
      confirmations: z.number().int().positive(),
      requiredAssertionIds: z.array(z.string()).min(1),
    }),
    inventory: z.object({
      schemaVersion: z.literal(1),
      deployments: z
        .array(
          z.object({ deploymentKey: hash, chainId: uint, entrypoint: address }),
        )
        .min(1)
        .max(20),
    }),
    manifest: z.object({
      releaseId: z.string(),
      requiredAssertionIds: z.array(z.string()).min(1),
    }),
    snapshot,
    issuedAt: uint,
    expiresAt: uint,
    results: z.array(result).min(1).max(20),
    summary: z.object({
      completePass: z.boolean(),
      passing: z.number().int().nonnegative(),
      total: z.number().int().positive(),
    }),
  }),
  attestation: z.object({
    schemaVersion: z.literal(1),
    verificationScopeId: hash,
    sourceChainId: uint,
    evidenceDigest: hash,
    issuedAt: uint,
    expiresAt: uint,
  }),
  signer: address,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
export type EvidenceBundle = z.infer<typeof signedEvidence>;
export type EvidenceResult = EvidenceBundle["body"]["results"][number];
export type EvidenceStatus =
  | "reported-pass"
  | "fail"
  | "unknown"
  | "unsupported"
  | "stale"
  | "preview";
export type ParsedEvidence = {
  status: EvidenceStatus;
  reason: string;
  bundle: EvidenceBundle | null;
  raw: unknown;
  coverageValid: boolean;
  authenticity?: { status: "pending" | "verified" | "invalid"; reason: string };
};

export type EvidenceIntegrity = { valid: boolean; reason: string };

/** Authenticates self-contained commitments, not the evaluator's independent trustworthiness or execution. */
export async function verifyEvidenceIntegrity(
  raw: unknown,
): Promise<EvidenceIntegrity> {
  try {
    const signed = signedEvidence.parse(raw);
    // The display schema intentionally strips fields. Hash only the ORIGINAL JSON objects.
    const source = raw as {
      body: {
        spec: Record<string, unknown>;
        inventory: unknown;
        manifest: Record<string, unknown>;
      };
      attestation: unknown;
    };
    const spec = VerificationSpecSchema.parse(source.body.spec);
    const attestation = DiagnosticAttestationSchema.parse(source.attestation);
    const { verificationScopeId: _, ...scopeBase } = source.body.spec;
    if (
      canonicalHash(source.body) !== attestation.evidenceDigest ||
      canonicalHash(source.body.inventory) !== spec.inventoryDigest ||
      canonicalHash(source.body.manifest) !== spec.manifestDigest ||
      canonicalHash(scopeBase) !== spec.verificationScopeId ||
      source.body.manifest.testPackDigest !== spec.testPackDigest ||
      attestation.verificationScopeId !== spec.verificationScopeId ||
      attestation.sourceChainId !== spec.sourceChainId ||
      attestation.issuedAt !== signed.body.issuedAt ||
      attestation.expiresAt !== signed.body.expiresAt
    )
      return {
        valid: false,
        reason:
          "Evidence content or scope commitments do not match the signed attestation.",
      };
    const recovered = await recoverTypedDataAddress({
      ...diagnosticTypedData(attestation),
      signature: signed.signature as Hex,
    });
    if (
      recovered.toLowerCase() !== spec.evaluator.toLowerCase() ||
      recovered.toLowerCase() !== signed.signer.toLowerCase()
    ) {
      return {
        valid: false,
        reason:
          "The signature does not match the bundle's claimed evaluator and signer.",
      };
    }
    return {
      valid: true,
      reason:
        "Signature and content commitments verified against the bundle's claimed evaluator. Evaluator identity still requires independent trust; tests were not replayed.",
    };
  } catch {
    return {
      valid: false,
      reason:
        "Evidence signature or content is malformed and could not be verified.",
    };
  }
}

/** A null result represents an in-flight check. Never carry a pass across raw bundle changes. */
export function withEvidenceIntegrity(
  evidence: ParsedEvidence,
  integrity: EvidenceIntegrity | null,
): ParsedEvidence {
  const authenticity =
    integrity === null
      ? {
          status: "pending" as const,
          reason:
            "Signature and content are not independently verified yet. Browser verification is pending.",
        }
      : {
          status: integrity.valid
            ? ("verified" as const)
            : ("invalid" as const),
          reason: integrity.reason,
        };
  if (!integrity?.valid)
    return {
      ...evidence,
      authenticity,
      status:
        integrity?.valid === false || evidence.status === "reported-pass"
          ? "unknown"
          : evidence.status,
      reason:
        integrity?.valid === false || evidence.status === "reported-pass"
          ? authenticity.reason
          : evidence.reason,
      coverageValid: false,
    };
  return {
    ...evidence,
    authenticity,
    reason:
      evidence.status === "reported-pass"
        ? "The evaluator reports complete passing assertions at this snapshot. Signature and content commitments match the claimed evaluator; its identity still requires independent trust and tests were not replayed."
        : evidence.reason,
  };
}
const exact = (actual: string[], expected: string[]) =>
  new Set(actual).size === actual.length &&
  new Set(expected).size === expected.length &&
  actual.length === expected.length &&
  actual.every((id) => expected.includes(id));
const sameSnapshot = (
  a: z.infer<typeof snapshot>,
  b: z.infer<typeof snapshot>,
) =>
  a.chainId === b.chainId &&
  a.blockNumber === b.blockNumber &&
  a.blockHash === b.blockHash &&
  a.blockTimestamp === b.blockTimestamp;

/** Display validation only. This does not authenticate a signature, replay execution, or authorize a grant. */
export function parseEvidence(
  raw: unknown,
  runId: string,
  now = Math.floor(Date.now() / 1000),
): ParsedEvidence {
  const parsed = signedEvidence.safeParse(raw);
  const unknown = (reason: string): ParsedEvidence => ({
    status: "unknown",
    reason,
    bundle: null,
    raw,
    coverageValid: false,
  });
  if (!parsed.success)
    return unknown(
      "Evidence is missing, malformed, or uses an unsupported schema. No pass can be established.",
    );
  const bundle = parsed.data,
    { body, attestation } = bundle,
    { spec } = body;
  const required = ["configuration", "stale-rejected", "valid-quote"];
  if (
    body.runId !== runId ||
    bundle.signer.toLowerCase() !== spec.evaluator.toLowerCase() ||
    attestation.verificationScopeId !== spec.verificationScopeId ||
    attestation.sourceChainId !== spec.sourceChainId ||
    attestation.issuedAt !== body.issuedAt ||
    attestation.expiresAt !== body.expiresAt ||
    body.snapshot.chainId !== spec.sourceChainId ||
    !exact(spec.requiredAssertionIds, required) ||
    !exact(body.manifest.requiredAssertionIds, required) ||
    !exact(
      body.results.map((r) => r.deploymentKey),
      body.inventory.deployments.map((d) => d.deploymentKey),
    ) ||
    body.inventory.deployments.some((d) => d.chainId !== spec.sourceChainId) ||
    body.summary.total !== body.results.length ||
    body.summary.passing !==
      body.results.filter((r) => r.completePass).length ||
    body.summary.completePass !== body.results.every((r) => r.completePass)
  ) {
    return unknown(
      "Evidence identity, scope, signer, summary, or deployment coverage is inconsistent.",
    );
  }
  for (const r of body.results) {
    const e = r.evidence;
    if (
      e.runId !== runId ||
      e.mode !== body.mode ||
      e.deploymentKey !== r.deploymentKey ||
      r.inspection.deploymentKey !== r.deploymentKey ||
      e.verificationScopeId !== spec.verificationScopeId ||
      e.inventoryHash !== spec.inventoryDigest ||
      e.manifestHash !== spec.manifestDigest ||
      e.testPackHash !== spec.testPackDigest ||
      !sameSnapshot(e.snapshot, body.snapshot) ||
      !sameSnapshot(r.inspection.snapshot, body.snapshot) ||
      !exact(
        e.assertions.map((a) => a.id),
        required,
      ) ||
      !exact(
        r.inspection.assertions.map((a) => a.id),
        ["authority", "configuration", "dependency-path", "implementation"],
      ) ||
      !exact(
        r.runner.assertions.map((a) => a.id),
        ["stale-rejected", "valid-quote"],
      )
    ) {
      return unknown(
        "Required assertions, deployment identity, or snapshot coverage is inconsistent.",
      );
    }
  }
  const timestamp = BigInt(body.snapshot.blockTimestamp),
    issued = BigInt(body.issuedAt),
    expiry = BigInt(body.expiresAt);
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    issued > BigInt(now) ||
    timestamp > issued ||
    expiry !== timestamp + BigInt(spec.maxSnapshotAge) ||
    issued >= expiry
  ) {
    return unknown("Evidence timestamps are invalid or in the future.");
  }
  const finish = (status: EvidenceStatus, reason: string): ParsedEvidence => ({
    status,
    reason,
    bundle,
    raw,
    coverageValid: true,
  });
  if (BigInt(now) >= expiry)
    return finish(
      "stale",
      "This snapshot has expired. Run a fresh diagnostic before relying on these observations.",
    );
  if (body.mode === "preview")
    return finish(
      "preview",
      "Preview evidence describes a simulation; it is not a deployed repair pass.",
    );
  const all = body.results.flatMap((r) => [
    ...r.evidence.assertions,
    ...r.inspection.assertions,
    ...r.runner.assertions,
    ...r.inspection.conditions,
  ]);
  if (all.some((a) => a.outcome === "fail"))
    return finish(
      "fail",
      "One or more required conditions failed at this snapshot.",
    );
  if (
    all.some((a) => a.outcome === "unknown") ||
    body.results.some(
      (r) => r.inspection.status === "unknown" || r.runner.status === "unknown",
    )
  )
    return finish("unknown", "Required observations could not be established.");
  if (
    all.some((a) => a.outcome === "unsupported") ||
    body.results.some(
      (r) =>
        r.inspection.status === "unsupported" ||
        r.runner.status === "unsupported",
    )
  )
    return finish(
      "unsupported",
      "The verifier cannot evaluate part of this deployment with the supported inspection family.",
    );
  if (!body.summary.completePass || body.results.some((r) => !r.completePass))
    return finish(
      "unknown",
      "The evaluator did not report a complete deployed pass.",
    );
  return finish(
    "reported-pass",
    "The evaluator reports complete passing assertions at this snapshot. This browser has not independently verified the signature or replayed the tests.",
  );
}

export function shouldPollRun(state: string) {
  return state === "queued" || state === "pending" || state === "running";
}
export const runSchema = RunStatusSchema;
export type DiagnosticRun = z.infer<typeof runSchema>;

export const repairProposalSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.enum(["upgrade", "configure"]),
  chainId: uint,
  deploymentKey: hash,
  manifestDigest: hash,
  snapshot,
  expiresAt: uint,
  stateDigest: hash,
  target: address,
  authority: address,
  calldata: hex.refine((v) => v.length >= 10),
  valueBaseUnits: z.literal("0"),
  compatibility: z.object({
    kind: z.literal("exact-reviewed-family-layout"),
    digest: hash,
  }),
  simulation: z.object({
    success: z.literal(true),
    blockHash: hash,
    result: z.literal("0x"),
  }),
  claimEligible: z.literal(false),
  explanation: z.string(),
});
export const repairResultSchema = z.object({
  status: z.enum(["ready", "no-supported-action", "blocked"]),
  reason: z.string(),
  proposal: repairProposalSchema.nullable(),
});
export type RepairProposal = z.infer<typeof repairProposalSchema>;
export type RepairResult = z.infer<typeof repairResultSchema>;

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request failed. The API or wallet may be unavailable.";
}

export function downloadEvidence(raw: unknown, runId: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `orryn-evidence-${runId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function diagnosticRerunRequest(raw: unknown, runId: string) {
  const parsed = parseEvidence(raw, runId);
  if (!parsed.coverageValid || !parsed.bundle)
    throw new Error(
      "A complete, consistent diagnostic scope is required to rerun. Create a new verification instead.",
    );
  const original = raw as { body: { spec: unknown } };
  const spec = VerificationSpecSchema.parse(original.body.spec);
  const { verificationScopeId, ...scopeBase } = spec;
  if (canonicalHash(scopeBase) !== verificationScopeId)
    throw new Error("The recorded verification scope digest is inconsistent.");
  return {
    schemaVersion: 1 as const,
    verificationScopeId,
    verificationSpecDigest: canonicalHash(spec),
    inventoryDigest: spec.inventoryDigest,
    manifestDigest: spec.manifestDigest,
    purpose: "diagnostic" as const,
    mode: "deployed" as const,
  };
}
