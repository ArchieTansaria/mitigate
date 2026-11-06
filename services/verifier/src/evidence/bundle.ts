import { type Hex, type LocalAccount, recoverTypedDataAddress } from "viem";
import { z } from "zod";
import {
  canonicalHash,
  diagnosticTypedData,
} from "../../../../packages/schema/src/encoding.ts";
import {
  AssertionSchema,
  DeploymentSchema,
  DiagnosticAttestationSchema,
  EvidenceSchema,
  Hash32,
  ManifestSchema,
  type Snapshot,
  SnapshotSchema,
  VerificationSpecSchema,
} from "../../../../packages/schema/src/types.ts";
import {
  normalizeInventory,
  validateEvidenceCoverage,
} from "../../../../packages/schema/src/validation.ts";
import type { Inspection } from "../inspect/transparent-oracle.ts";
import { RUNNER_IMAGE, type RunnerResult } from "../runner/oracle.ts";
export type Evaluation = { inspection: Inspection; runner: RunnerResult };
export type EvidenceInput = {
  runId: string;
  purpose: "diagnostic" | "campaign-claim";
  mode: "preview" | "deployed";
  spec: unknown;
  inventory: unknown;
  manifest: unknown;
  snapshot: Snapshot;
  evaluations: Evaluation[];
};
const Inventory = z.strictObject({
  schemaVersion: z.literal(1),
  deployments: z
    .array(DeploymentSchema.extend({ deploymentKey: Hash32 }))
    .min(1)
    .max(20),
});
const required = ["configuration", "stale-rejected", "valid-quote"];
const inspected = [
  "authority",
  "configuration",
  "dependency-path",
  "implementation",
];
const same = (a: unknown, b: unknown) => canonicalHash(a) === canonicalHash(b);
function exactAssertions(values: unknown, ids: string[]) {
  const list = z.array(AssertionSchema).parse(values);
  if (!same(list.map((a) => a.id).sort(), [...ids].sort()))
    throw new Error("ASSERTION_COVERAGE_MISMATCH");
  return list;
}
export function buildEvidence(input: EvidenceInput, now: bigint) {
  if (input.purpose !== "diagnostic") throw new Error("DIAGNOSTIC_ONLY");
  if (input.mode !== "deployed" && input.mode !== "preview")
    throw new Error("UNSUPPORTED_MODE");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.runId))
    throw new Error("INVALID_RUN_ID");
  const spec = VerificationSpecSchema.parse(input.spec),
    manifest = ManifestSchema.parse(input.manifest),
    inventory = Inventory.parse(input.inventory),
    snapshot = SnapshotSchema.parse(input.snapshot);
  const normalized = normalizeInventory(
    inventory.deployments.map(({ deploymentKey: _, ...d }) => d),
  );
  const { verificationScopeId, ...scopeBase } = spec;
  if (
    !same(inventory.deployments, normalized.deployments) ||
    spec.inventoryDigest !== canonicalHash(inventory) ||
    spec.manifestDigest !== canonicalHash(manifest) ||
    spec.verificationScopeId !== canonicalHash(scopeBase) ||
    snapshot.chainId !== spec.sourceChainId ||
    manifest.sourceChainId !== spec.sourceChainId ||
    inventory.deployments.some((d) => d.chainId !== spec.sourceChainId) ||
    spec.testPackDigest !== manifest.testPackDigest ||
    !same([...spec.requiredAssertionIds].sort(), required) ||
    !same([...manifest.requiredAssertionIds].sort(), required)
  )
    throw new Error("SCOPE_MISMATCH");
  const observed = BigInt(snapshot.blockTimestamp),
    age = BigInt(spec.maxSnapshotAge);
  if (now < observed || now >= observed + age)
    throw new Error("STALE_OR_FUTURE_EVIDENCE");
  if (input.evaluations.length !== inventory.deployments.length)
    throw new Error("DEPLOYMENT_COVERAGE_MISMATCH");
  const sorted = [...input.evaluations].sort((a, b) =>
    a.inspection.deploymentKey.localeCompare(b.inspection.deploymentKey),
  );
  const results = sorted.map((evaluation, index) => {
    const { inspection, runner } = evaluation,
      entry = inventory.deployments[index];
    if (!entry || inspection.deploymentKey !== entry.deploymentKey)
      throw new Error("DEPLOYMENT_COVERAGE_MISMATCH");
    if (!same(inspection.snapshot, snapshot))
      throw new Error("SNAPSHOT_MISMATCH");
    const prerequisites = exactAssertions(inspection.assertions, inspected),
      behavior = exactAssertions(runner.assertions, [
        "valid-quote",
        "stale-rejected",
      ]);
    if (
      runner.container.image !== RUNNER_IMAGE ||
      runner.container.network !== "none" ||
      runner.trace.stateDigest !==
        canonicalHash({ snapshot, state: inspection.observed?.state ?? {} })
    )
      throw new Error("RUNNER_IDENTITY_MISMATCH");
    const configuration = {
      id: "configuration",
      outcome: prerequisites.every((a) => a.outcome === "pass")
        ? ("pass" as const)
        : prerequisites.some((a) => a.outcome === "fail")
          ? ("fail" as const)
          : prerequisites.some((a) => a.outcome === "unsupported")
            ? ("unsupported" as const)
            : ("unknown" as const),
      expected:
        "all implementation, path, authority and configuration prerequisites",
      observed: JSON.stringify(
        prerequisites.map((a) => ({ id: a.id, outcome: a.outcome })),
      ),
      evidenceRef: canonicalHash(inspection),
    };
    const evidence = EvidenceSchema.parse({
      schemaVersion: 1,
      runId: input.runId,
      purpose: "diagnostic",
      mode: input.mode,
      verificationScopeId,
      snapshot,
      inventoryHash: spec.inventoryDigest,
      manifestHash: spec.manifestDigest,
      testPackHash: spec.testPackDigest,
      runnerImageDigest: RUNNER_IMAGE.split("@")[1],
      assertions: [configuration, ...behavior].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      deploymentKey: entry.deploymentKey,
      artifactDigests: [canonicalHash(inspection), canonicalHash(runner)],
    });
    const coverage = validateEvidenceCoverage(spec, evidence, now);
    const completePass =
      inspection.status === "supported" &&
      runner.status === "completed" &&
      coverage.completePass;
    return {
      deploymentKey: entry.deploymentKey,
      completePass,
      evidence,
      inspection,
      runner,
    };
  });
  return {
    schemaVersion: 1 as const,
    runId: input.runId,
    purpose: "diagnostic" as const,
    mode: input.mode,
    claimEligible: false as const,
    spec,
    inventory,
    manifest,
    snapshot,
    issuedAt: now.toString(),
    expiresAt: (observed + age).toString(),
    results,
    summary: {
      completePass: results.every((r) => r.completePass),
      passing: results.filter((r) => r.completePass).length,
      total: results.length,
    },
  };
}
export type EvidenceBody = ReturnType<typeof buildEvidence>;
export type EvidenceSigner = Pick<LocalAccount, "address" | "signTypedData">;
export async function signEvidence(body: EvidenceBody, signer: EvidenceSigner) {
  if (signer.address.toLowerCase() !== body.spec.evaluator.toLowerCase())
    throw new Error("EVALUATOR_MISMATCH");
  // Rebuild coverage at the signing boundary; never sign a caller-supplied summary blindly.
  const rebuilt = buildEvidence(
    {
      ...body,
      evaluations: body.results.map((r) => ({
        inspection: r.inspection,
        runner: r.runner,
      })),
    },
    BigInt(body.issuedAt),
  );
  if (!same(rebuilt, body)) throw new Error("INVALID_EVIDENCE_BODY");
  const attestation = DiagnosticAttestationSchema.parse({
    schemaVersion: 1,
    verificationScopeId: body.spec.verificationScopeId,
    sourceChainId: body.spec.sourceChainId,
    evidenceDigest: canonicalHash(body),
    issuedAt: body.issuedAt,
    expiresAt: body.expiresAt,
  });
  const signature = await signer.signTypedData(
    diagnosticTypedData(attestation),
  );
  return { body, attestation, signer: signer.address, signature };
}
export type SignedEvidence = Awaited<ReturnType<typeof signEvidence>>;
export async function verifySignedEvidence(
  input: unknown,
  expectedSpec: unknown,
  now: bigint,
): Promise<
  { valid: true; completePass: boolean } | { valid: false; reason: string }
> {
  try {
    const spec = VerificationSpecSchema.parse(expectedSpec),
      signed = input as SignedEvidence;
    const a = DiagnosticAttestationSchema.parse(signed.attestation);
    if (
      !same(signed.body.spec, spec) ||
      a.evidenceDigest !== canonicalHash(signed.body) ||
      a.verificationScopeId !== spec.verificationScopeId ||
      a.sourceChainId !== spec.sourceChainId ||
      a.issuedAt !== signed.body.issuedAt ||
      a.expiresAt !== signed.body.expiresAt ||
      BigInt(a.issuedAt) > now ||
      BigInt(a.expiresAt) <= now
    )
      throw new Error("SCOPE_OR_FRESHNESS_MISMATCH");
    const rebuilt = buildEvidence(
      {
        ...signed.body,
        evaluations: signed.body.results.map((r) => ({
          inspection: r.inspection,
          runner: r.runner,
        })),
      },
      BigInt(a.issuedAt),
    );
    if (!same(rebuilt, signed.body)) throw new Error("INVALID_EVIDENCE_BODY");
    if (!/^0x[0-9a-fA-F]{130}$/.test(signed.signature))
      throw new Error("INVALID_SIGNATURE");
    const signer = await recoverTypedDataAddress({
      ...diagnosticTypedData(a),
      signature: signed.signature as Hex,
    });
    if (
      signer.toLowerCase() !== spec.evaluator.toLowerCase() ||
      signed.signer.toLowerCase() !== signer.toLowerCase()
    )
      throw new Error("WRONG_EVALUATOR");
    return { valid: true, completePass: signed.body.summary.completePass };
  } catch {
    return {
      valid: false,
      reason: "INVALID_SCOPE_EVIDENCE_SIGNATURE_OR_FRESHNESS",
    };
  }
}
