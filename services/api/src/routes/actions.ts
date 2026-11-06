import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RuntimeConfig } from "../../../../packages/config/src/index.ts";
import { canonicalHash } from "../../../../packages/schema/src/encoding.ts";
import {
  Hash32,
  RunRequestSchema,
  VerificationSpecSchema,
} from "../../../../packages/schema/src/types.ts";
import {
  prepareRepair,
  type RepairInput,
  validateRepair,
} from "../../../verifier/src/actions/repair.ts";
import {
  type SignedEvidence,
  verifySignedEvidence,
} from "../../../verifier/src/evidence/bundle.ts";
import type { ArtifactStore } from "../artifacts/store.ts";
import type { Repository } from "../db/repository.ts";

const params = z.strictObject({ id: z.uuid() });
const query = z.strictObject({ deploymentKey: Hash32 });
const validation = z.strictObject({
  deploymentKey: Hash32,
  proposal: z.record(z.string(), z.unknown()),
});
const json = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", target: "draft-7" });
export function registerActions(
  app: FastifyInstance,
  config: RuntimeConfig,
  repo: Repository,
  artifacts: ArtifactStore,
) {
  async function input(
    owner: string | null,
    id: string,
    key: string,
  ): Promise<RepairInput> {
    if (!owner) throw new Error("UNAUTHORIZED");
    const job = await repo.getRun(owner, id);
    if (!job) throw new Error("NOT_FOUND");
    if (job.state !== "succeeded" || !job.artifact) throw new Error("CONFLICT");
    if (!(await repo.rateLimit(`actions:${owner}`, 12)))
      throw new Error("RATE_LIMITED");
    const request = RunRequestSchema.parse(job.request);
    if (request.mode !== "deployed" || request.purpose !== "diagnostic")
      throw new Error("UNSUPPORTED_PURPOSE");
    const doc = await repo.getDocumentByDigest(
      owner,
      request.verificationSpecDigest,
      "scope",
    );
    if (!doc || canonicalHash(doc.payload) !== request.verificationSpecDigest)
      throw new Error("CONFLICT");
    const spec = VerificationSpecSchema.parse(doc.payload);
    const signed = JSON.parse(
      Buffer.from(await artifacts.get(job.artifact.digest)).toString("utf8"),
    ) as SignedEvidence;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (
      spec.evaluator !== config.evaluator ||
      spec.sourceChainId !== config.network.source.chainId ||
      !(await verifySignedEvidence(signed, spec, now)).valid
    )
      throw new Error("INVALID_OR_STALE_EVIDENCE");
    if (
      signed.body.runId !== id ||
      signed.body.mode !== "deployed" ||
      signed.body.spec.verificationScopeId !== request.verificationScopeId
    )
      throw new Error("CONFLICT");
    const entry = signed.body.inventory.deployments.find(
      (d) => d.deploymentKey === key,
    );
    if (!entry) throw new Error("NOT_FOUND");
    const { deploymentKey: _, ...deployment } = entry;
    return {
      rpcUrl: config.rpc.source,
      deployment,
      manifest: signed.body.manifest,
      snapshot: signed.body.snapshot,
      confirmations: spec.confirmations,
      maxAge: Number(spec.maxSnapshotAge),
      now,
    };
  }
  app.get(
    "/v1/runs/:id/actions",
    {
      schema: {
        params: json(params),
        querystring: json(query),
        security: [{ session: [] }],
      },
    },
    async (req) =>
      prepareRepair(
        await input(
          req.owner,
          params.parse(req.params).id,
          query.parse(req.query).deploymentKey,
        ),
      ),
  );
  app.post(
    "/v1/runs/:id/actions/validate",
    {
      schema: {
        params: json(params),
        body: json(validation),
        security: [{ session: [] }],
      },
    },
    async (req) => {
      const body = validation.parse(req.body);
      return validateRepair(
        await input(req.owner, params.parse(req.params).id, body.deploymentKey),
        body.proposal,
      );
    },
  );
}
