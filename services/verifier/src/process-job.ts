import { z } from "zod";
import { canonicalHash } from "../../../packages/schema/src/encoding.ts";
import {
  DeploymentSchema,
  ManifestSchema,
  RunRequestSchema,
  VerificationSpecSchema,
} from "../../../packages/schema/src/types.ts";
import type { Job, Repository } from "../../api/src/db/repository.ts";
import {
  buildEvidence,
  type Evaluation,
  type EvidenceSigner,
  signEvidence,
} from "./evidence/bundle.ts";
import { SnapshotRpc, selectSnapshot } from "./inspect/rpc.ts";
import {
  inspectDeployment,
  type SupportedPattern,
} from "./inspect/transparent-oracle.ts";
import { type ApprovedPack, runTestPack } from "./runner/oracle.ts";
export type ExecutionServices = {
  repo: Repository;
  rpcUrl: string;
  chainId: string;
  signer: EvidenceSigner;
  pattern: SupportedPattern;
  pack: ApprovedPack;
  maxInventory: number;
  dockerBinary?: string;
};
export async function processJob(
  job: Job,
  signal: AbortSignal,
  services: ExecutionServices,
): Promise<Uint8Array> {
  const request = RunRequestSchema.parse(job.request);
  if (request.purpose !== "diagnostic") throw new Error("DIAGNOSTIC_ONLY");
  const document = async (
    kind: "scope" | "inventory" | "manifest",
    digest: string,
  ) => {
    const doc = await services.repo.getDocumentByDigest(
      job.owner,
      digest,
      kind,
    );
    if (!doc || canonicalHash(doc.payload) !== digest)
      throw new Error("DOCUMENT_UNAVAILABLE_OR_CHANGED");
    return doc.payload;
  };
  const spec = VerificationSpecSchema.parse(
    await document("scope", request.verificationSpecDigest),
  );
  if (
    spec.verificationScopeId !== request.verificationScopeId ||
    spec.inventoryDigest !== request.inventoryDigest ||
    spec.manifestDigest !== request.manifestDigest ||
    spec.sourceChainId !== services.chainId ||
    spec.evaluator !== services.signer.address
  )
    throw new Error("SCOPE_MISMATCH");
  const inventory = await document("inventory", spec.inventoryDigest),
    manifest = ManifestSchema.parse(
      await document("manifest", spec.manifestDigest),
    );
  const rows = z
    .strictObject({
      schemaVersion: z.literal(1),
      deployments: z
        .array(DeploymentSchema.extend({ deploymentKey: z.string() }))
        .min(1)
        .max(services.maxInventory),
    })
    .parse(inventory).deployments;
  signal.throwIfAborted();
  const snapshot = await selectSnapshot(
    services.rpcUrl,
    services.chainId,
    spec.confirmations,
  );
  const evaluations: Evaluation[] = [];
  for (const { deploymentKey: _, ...deployment } of rows) {
    signal.throwIfAborted();
    const inspection = await inspectDeployment({
      rpcUrl: services.rpcUrl,
      deployment,
      manifest,
      snapshot,
      confirmations: spec.confirmations,
      pattern: services.pattern,
    });
    signal.throwIfAborted();
    const runner = await runTestPack({
      inspection,
      manifest,
      pack: services.pack,
      signal,
      ...(services.dockerBinary ? { dockerBinary: services.dockerBinary } : {}),
    });
    evaluations.push({ inspection, runner });
  }
  signal.throwIfAborted();
  // Recheck canonicality/finality after the last scenario, immediately before signing.
  await new SnapshotRpc(services.rpcUrl, snapshot).verify(spec.confirmations);
  signal.throwIfAborted();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const body = buildEvidence(
    {
      runId: job.id,
      purpose: "diagnostic",
      mode: request.mode,
      spec,
      inventory,
      manifest,
      snapshot,
      evaluations,
    },
    now,
  );
  const signed = await signEvidence(body, services.signer);
  signal.throwIfAborted();
  return Buffer.from(JSON.stringify(signed));
}
