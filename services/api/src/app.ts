import swagger from "@fastify/swagger";
import Fastify, { type FastifyRequest } from "fastify";
import { createPublicClient, http } from "viem";
import { z } from "zod";
import type { RuntimeConfig } from "../../../packages/config/src/index.ts";
import { canonicalHash } from "../../../packages/schema/src/encoding.ts";
import {
  DeploymentSchema,
  ManifestSchema,
  NonzeroAddress,
  RunRequestSchema,
  RunStatusSchema,
  UInt,
  VerificationSpecSchema,
} from "../../../packages/schema/src/types.ts";
import { normalizeInventory } from "../../../packages/schema/src/validation.ts";
import type { ArtifactStore } from "./artifacts/store.ts";
import { Sessions } from "./auth/sessions.ts";
import { verifyWalletSignature, type WalletVerifier } from "./auth/wallet.ts";
import type { Job, Repository } from "./db/repository.ts";

import { registerActions } from "./routes/actions.ts";

declare module "fastify" {
  interface FastifyRequest {
    owner: string | null;
  }
}
const owner = (request: FastifyRequest) => {
  if (!request.owner) throw new Error("UNAUTHORIZED");
  return request.owner;
};
const publicJob = (j: Job) => ({
  schemaVersion: 1 as const,
  id: j.id,
  state: j.state,
  attempts: j.attempts,
  errorCode: j.errorCode,
  evidenceReferenceStored: j.artifact !== null,
  repairOutcome: "not-evaluated" as const,
});
const idParam = z.strictObject({ id: z.uuid() });
const challengeBody = z.strictObject({
  address: NonzeroAddress,
  chainId: UInt(64),
});
const verifyBody = z.strictObject({
  challengeId: z.uuid(),
  signature: z
    .string()
    .regex(/^0x([0-9a-fA-F]{2})+$/)
    .max(16386),
});
const scopeBody = z.strictObject({
  schemaVersion: z.literal(1),
  inventoryId: z.uuid(),
  manifestId: z.uuid(),
  maxSnapshotAge: UInt(64).refine((s) => BigInt(s) > 0n && BigInt(s) <= 86400n),
  confirmations: z.number().int().min(1).max(10000),
});
const json = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", target: "draft-7" });
const errors: Record<string, number> = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RPC_UNAVAILABLE: 503,
  PROPOSAL_MISMATCH: 409,
  STATE_CHANGED: 409,
  STALE_PROPOSAL: 409,
  INVALID_OR_STALE_EVIDENCE: 409,
  RATE_LIMITED: 429,
  UNSUPPORTED_PURPOSE: 400,
  ARTIFACT_UNAVAILABLE_OR_CORRUPT: 503,
};
export async function createApp(
  config: RuntimeConfig,
  repo: Repository,
  artifacts: ArtifactStore,
  walletVerifier?: WalletVerifier,
) {
  const app = Fastify({
    logger: false,
    bodyLimit: config.limits.bodyBytes,
    trustProxy: config.trustedProxyIps.length ? config.trustedProxyIps : false,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    forceCloseConnections: true,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const rpc = createPublicClient({
    transport: http(config.rpc.source, { timeout: 5000, retryCount: 0 }),
  });
  const sessions = new Sessions(
    repo,
    config,
    walletVerifier ??
      (async (a, m, s) => {
        let chainId: number;
        try {
          chainId = await rpc.getChainId();
        } catch {
          throw new Error("RPC_UNAVAILABLE");
        }
        if (String(chainId) !== config.network.source.chainId) return false;
        return verifyWalletSignature(rpc, a, m, s);
      }),
  );
  app.decorateRequest("owner", null);
  await app.register(swagger, {
    openapi: {
      info: { title: "PatchBond verification API", version: "1.0.0" },
      components: {
        securitySchemes: { session: { type: "http", scheme: "bearer" } },
      },
    },
  });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as {
      message?: string;
      validation?: unknown;
      statusCode?: number;
    };
    const known = e.message ? errors[e.message] : undefined;
    const status =
      known ??
      (e.validation || error instanceof z.ZodError
        ? 400
        : e.statusCode === 413
          ? 413
          : e.statusCode === 415
            ? 415
            : 500);
    const code = known
      ? e.message
      : status === 400
        ? "INVALID_INPUT"
        : status === 413
          ? "BODY_TOO_LARGE"
          : status === 415
            ? "UNSUPPORTED_MEDIA_TYPE"
            : "INTERNAL_ERROR";
    reply.code(status).send({ code, requestId: _req.id, message: code });
  });
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && origin !== config.origin) throw new Error("FORBIDDEN");
    if (origin)
      reply
        .header("Access-Control-Allow-Origin", config.origin)
        .header("Vary", "Origin");
    reply.header("Cache-Control", "no-store");
    if (
      req.url.split("?")[0] !== "/health" &&
      !(await repo.rateLimit("global", config.limits.globalRequestsPerMinute))
    )
      throw new Error("RATE_LIMITED");
    if (
      req.url.split("?")[0] !== "/health" &&
      !(await repo.rateLimit(`ip:${req.ip}`, config.limits.requestsPerMinute))
    )
      throw new Error("RATE_LIMITED");
    if (req.method === "OPTIONS") {
      reply
        .header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        .header(
          "Access-Control-Allow-Headers",
          "Authorization,Content-Type,Idempotency-Key",
        );
      return reply.code(204).send();
    }
    const path = req.url.split("?")[0];
    if (
      ![
        "/health",
        "/openapi.json",
        "/v1/auth/challenge",
        "/v1/auth/verify",
      ].includes(path ?? "") &&
      !(
        req.method === "GET" &&
        /^\/v1\/public\/runs\/[0-9a-fA-F-]{36}\/evidence$/.test(path ?? "")
      )
    )
      req.owner = await sessions.owner(req.headers.authorization);
  });
  app.get("/health", async () => ({ status: "ok", ...config.publicStatus }));
  app.get("/openapi.json", async () => app.swagger());
  app.post(
    "/v1/auth/challenge",
    { schema: { body: json(challengeBody) } },
    async (req) => {
      const b = challengeBody.parse(req.body);
      return sessions.challenge(b.address, b.chainId);
    },
  );
  app.post(
    "/v1/auth/verify",
    { schema: { body: json(verifyBody) } },
    async (req) => {
      const b = verifyBody.parse(req.body);
      return sessions.authenticate(b.challengeId, b.signature as `0x${string}`);
    },
  );
  app.post(
    "/v1/auth/logout",
    { schema: { security: [{ session: [] }] } },
    async (req, reply) => {
      await sessions.logout(req.headers.authorization ?? "");
      return reply.code(204).send();
    },
  );
  const inventoryBody = z.strictObject({
    schemaVersion: z.literal(1),
    deployments: z.array(DeploymentSchema).min(1).max(config.limits.inventory),
  });
  app.post(
    "/v1/inventories",
    { schema: { body: json(inventoryBody), security: [{ session: [] }] } },
    async (req, reply) => {
      const b = inventoryBody.parse(req.body);
      if (
        b.deployments.some((d) => d.chainId !== config.network.source.chainId)
      )
        throw new Error("INVALID_INPUT");
      let inventory: ReturnType<typeof normalizeInventory>;
      try {
        inventory = normalizeInventory(b.deployments);
      } catch {
        throw new Error("INVALID_INPUT");
      }
      const doc = await repo.putDocument(owner(req), "inventory", {
        schemaVersion: 1,
        deployments: inventory.deployments,
      });
      return reply.code(201).send({ id: doc.id, digest: doc.digest });
    },
  );
  app.post(
    "/v1/manifests",
    { schema: { body: json(ManifestSchema), security: [{ session: [] }] } },
    async (req, reply) => {
      const b = ManifestSchema.parse(req.body);
      if (b.sourceChainId !== config.network.source.chainId)
        throw new Error("INVALID_INPUT");
      const doc = await repo.putDocument(owner(req), "manifest", b);
      return reply.code(201).send({ id: doc.id, digest: doc.digest });
    },
  );
  app.post(
    "/v1/verification-scopes",
    { schema: { body: json(scopeBody), security: [{ session: [] }] } },
    async (req, reply) => {
      const b = scopeBody.parse(req.body);
      const [inventory, manifest] = await Promise.all([
        repo.getDocument(owner(req), b.inventoryId, "inventory"),
        repo.getDocument(owner(req), b.manifestId, "manifest"),
      ]);
      if (!inventory || !manifest) throw new Error("NOT_FOUND");
      const m = ManifestSchema.parse(manifest.payload);
      const base = {
        schemaVersion: 1 as const,
        sourceChainId: m.sourceChainId,
        inventoryDigest: inventory.digest,
        manifestDigest: manifest.digest,
        testPackDigest: m.testPackDigest,
        requiredAssertionIds: [...m.requiredAssertionIds].sort(),
        evaluator: config.evaluator,
        maxSnapshotAge: b.maxSnapshotAge,
        confirmations: b.confirmations,
      };
      const spec = VerificationSpecSchema.parse({
        ...base,
        verificationScopeId: canonicalHash(base),
      });
      const doc = await repo.putDocument(owner(req), "scope", spec);
      return reply.code(201).send({ id: doc.id, digest: doc.digest, spec });
    },
  );
  app.post(
    "/v1/runs",
    {
      schema: {
        body: json(RunRequestSchema),
        response: { 202: json(RunStatusSchema) },
        headers: {
          type: "object",
          required: ["idempotency-key"],
          properties: {
            "idempotency-key": {
              type: "string",
              pattern: "^[a-zA-Z0-9_-]{1,128}$",
            },
          },
        },
        security: [{ session: [] }],
      },
    },
    async (req, reply) => {
      const b = RunRequestSchema.parse(req.body);
      if (b.purpose !== "diagnostic") throw new Error("UNSUPPORTED_PURPOSE");
      const doc = await repo.getDocumentByDigest(
        owner(req),
        b.verificationSpecDigest,
        "scope",
      );
      if (!doc) throw new Error("NOT_FOUND");
      const spec = VerificationSpecSchema.parse(doc.payload);
      if (
        spec.verificationScopeId !== b.verificationScopeId ||
        spec.inventoryDigest !== b.inventoryDigest ||
        spec.manifestDigest !== b.manifestDigest
      )
        throw new Error("INVALID_INPUT");
      return reply
        .code(202)
        .send(
          publicJob(
            await repo.enqueue(
              owner(req),
              String(req.headers["idempotency-key"]),
              b,
              config.limits.activeRuns,
              config.limits.maxAttempts,
            ),
          ),
        );
    },
  );
  app.get(
    "/v1/runs/:id",
    {
      schema: {
        params: json(idParam),
        response: { 200: json(RunStatusSchema) },
        security: [{ session: [] }],
      },
    },
    async (req) => {
      const j = await repo.getRun(owner(req), idParam.parse(req.params).id);
      if (!j) throw new Error("NOT_FOUND");
      return publicJob(j);
    },
  );
  app.get(
    "/v1/runs/:id/evidence",
    { schema: { params: json(idParam), security: [{ session: [] }] } },
    async (req, reply) => {
      const j = await repo.getRun(owner(req), idParam.parse(req.params).id);
      if (!j) throw new Error("NOT_FOUND");
      if (j.state !== "succeeded" || !j.artifact) throw new Error("CONFLICT");
      const bytes = await artifacts.get(j.artifact.digest);
      return reply
        .type("application/json")
        .header("X-Evidence-Digest", j.artifact.digest)
        .send(Buffer.from(bytes));
    },
  );
  app.post(
    "/v1/runs/:id/cancel",
    { schema: { params: json(idParam), security: [{ session: [] }] } },
    async (req, reply) => {
      const id = idParam.parse(req.params).id;
      if (!(await repo.getRun(owner(req), id))) throw new Error("NOT_FOUND");
      if (!(await repo.cancel(owner(req), id))) throw new Error("CONFLICT");
      return reply.code(204).send();
    },
  );
  app.post(
    "/v1/runs/:id/publish",
    { schema: { params: json(idParam), security: [{ session: [] }] } },
    async (req, reply) => {
      const id = idParam.parse(req.params).id,
        j = await repo.getRun(owner(req), id);
      if (!j) throw new Error("NOT_FOUND");
      if (j.state !== "succeeded" || !j.artifact) throw new Error("CONFLICT");
      await artifacts.get(j.artifact.digest);
      if (!(await repo.publishEvidence(owner(req), id)))
        throw new Error("CONFLICT");
      return reply.code(204).send();
    },
  );
  app.get(
    "/v1/public/runs/:id/evidence",
    { schema: { params: json(idParam) } },
    async (req, reply) => {
      const ref = await repo.getPublicEvidence(idParam.parse(req.params).id);
      if (!ref) throw new Error("NOT_FOUND");
      const bytes = await artifacts.get(ref.digest);
      return reply
        .type("application/json")
        .header("X-Evidence-Digest", ref.digest)
        .send(Buffer.from(bytes));
    },
  );
  registerActions(app, config, repo, artifacts);
  return app;
}
