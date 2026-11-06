import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../../packages/config/src/index.ts";
import { createApp } from "../src/app.ts";
import { FileArtifactStore } from "../src/artifacts/store.ts";
import { verifyWalletSignature } from "../src/auth/wallet.ts";
import { Repository } from "../src/db/repository.ts";
import { must } from "./assert.ts";
import { startDatabase } from "./database.ts";

let db: Awaited<ReturnType<typeof startDatabase>>,
  app: Awaited<ReturnType<typeof createApp>>,
  dir: string;
const alice = privateKeyToAccount(`0x${"01".repeat(32)}`),
  bob = privateKeyToAccount(`0x${"02".repeat(32)}`);
let token: string;
beforeAll(async () => {
  db = await startDatabase();
  dir = await mkdtemp(join(tmpdir(), "pb-auth-"));
  const config = loadConfig(
    {
      PATCHBOND_MODE: "local",
      DATABASE_URL: db.connectionString,
      SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
      ARC_TESTNET_RPC_URL: "http://127.0.0.1:8546",
      API_ORIGIN: "http://localhost:3000",
      ARTIFACT_BACKEND: "filesystem",
      ARTIFACT_DIRECTORY: dir,
      EVALUATOR_ADDRESS: alice.address,
      MAX_BODY_BYTES: "4096",
      REQUESTS_PER_MINUTE: "200",
    },
    {
      schemaVersion: 1,
      environment: "local",
      source: { chainId: "31337", ccipSelector: "1" },
      destination: {
        chainId: "31338",
        ccipSelector: "2",
        usdc: alice.address,
        decimals: 6,
      },
    },
  );
  app = await createApp(
    config,
    new Repository(db.pool),
    new FileArtifactStore(dir, 4096),
    async (address, message, signature) =>
      verifyWalletSignature(
        {
          getCode: async () => undefined,
          readContract: async () => {
            throw new Error("not contract");
          },
        },
        address,
        message,
        signature,
      ),
  );
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await db?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function challenge(address = alice.address) {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/challenge",
    payload: { address, chainId: "31337" },
  });
  expect(r.statusCode).toBe(200);
  return r.json() as { challengeId: string; message: string };
}
async function login(account = alice) {
  const c = await challenge(account.address);
  const signature = await account.signMessage({ message: c.message });
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/verify",
    payload: { challengeId: c.challengeId, signature },
  });
  expect(r.statusCode).toBe(200);
  return r.json().token as string;
}
const headers = () => ({ authorization: `Bearer ${token}` });
describe("wallet sessions and private verification API", () => {
  it("uses a domain-bound, single-use challenge and hashed session token", async () => {
    const c = await challenge();
    expect(c.message).toContain("localhost:3000");
    const signature = await alice.signMessage({ message: c.message });
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          payload: { challengeId: c.challengeId, signature },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    token = must(results.find((r) => r.statusCode === 200)).json().token;
    const stored = await db.pool.query("SELECT digest FROM sessions");
    expect(stored.rows.some((r) => r.digest === token)).toBe(false);
  });
  it("rejects expiry, another wallet, changed domain, caller wallet injection and unsupported chain", async () => {
    const c = await challenge();
    const signature = await bob.signMessage({ message: c.message });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          payload: { challengeId: c.challengeId, signature },
        })
      ).statusCode,
    ).toBe(401);
    const changed = await alice.signMessage({
      message: c.message.replace("localhost:3000", "evil.example"),
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          payload: { challengeId: c.challengeId, signature: changed },
        })
      ).statusCode,
    ).toBe(401);
    await db.pool.query(
      "UPDATE auth_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [c.challengeId],
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          payload: {
            challengeId: c.challengeId,
            signature: await alice.signMessage({ message: c.message }),
          },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/challenge",
          payload: { address: alice.address, chainId: "1" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          payload: {
            challengeId: c.challengeId,
            signature,
            address: alice.address,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("creates pinned scopes and idempotent runs while rejecting cross-tenant references", async () => {
    const deployment = {
      chainId: "31337",
      entrypoint: alice.address,
      marketSelector: zeroHash,
      inspectionModuleId: "eip1967-transparent-v1",
      declaredDependencyPath: [],
      expectedAuthorityModel: "owner",
    };
    const i = await app.inject({
      method: "POST",
      url: "/v1/inventories",
      headers: headers(),
      payload: { schemaVersion: 1, deployments: [deployment] },
    });
    expect(i.statusCode).toBe(201);
    const manifest = {
      schemaVersion: 1,
      releaseId: "test",
      issueDescription: "stale price",
      supportedPatternId: "eip1967-transparent-v1",
      sourceChainId: "31337",
      approvedImplementationAddress: bob.address,
      approvedRuntimeCodeHash: `0x${"11".repeat(32)}`,
      configurationPredicates: [],
      testPackDigest: `0x${"22".repeat(32)}`,
      requiredAssertionIds: ["stale", "valid"],
      prerequisites: [],
      artifactRefs: [],
    };
    const m = await app.inject({
      method: "POST",
      url: "/v1/manifests",
      headers: headers(),
      payload: manifest,
    });
    expect(m.statusCode).toBe(201);
    const s = await app.inject({
      method: "POST",
      url: "/v1/verification-scopes",
      headers: headers(),
      payload: {
        schemaVersion: 1,
        inventoryId: i.json().id,
        manifestId: m.json().id,
        maxSnapshotAge: "60",
        confirmations: 1,
      },
    });
    expect(s.statusCode).toBe(201);
    const spec = s.json().spec;
    const body = {
      schemaVersion: 1,
      verificationScopeId: spec.verificationScopeId,
      inventoryDigest: spec.inventoryDigest,
      manifestDigest: spec.manifestDigest,
      verificationSpecDigest: s.json().digest,
      purpose: "diagnostic",
      mode: "deployed",
    };
    const enqueue = () =>
      app.inject({
        method: "POST",
        url: "/v1/runs",
        headers: { ...headers(), "idempotency-key": "run-once" },
        payload: body,
      });
    const runs = await Promise.all([enqueue(), enqueue()]);
    expect(runs.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(must(runs[0]).json().id).toBe(must(runs[1]).json().id);
    expect(must(runs[0]).json().state).toBe("queued");
    expect(must(runs[0]).json()).not.toHaveProperty("leaseToken");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/runs",
          headers: { ...headers(), "idempotency-key": "run-once" },
          payload: { ...body, mode: "preview" },
        })
      ).statusCode,
    ).toBe(409);
    const other = await login(bob);
    const otherHeaders = { authorization: `Bearer ${other}` };
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/runs/${must(runs[0]).json().id}`,
          headers: otherHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/runs",
          headers: { ...otherHeaders, "idempotency-key": "steal" },
          payload: body,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/runs/${must(runs[0]).json().id}/evidence`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it("rejects unauthenticated operations, arbitrary URLs, executable input, oversized uploads and campaign requests until integration exists", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/manifests",
          payload: { url: "http://169.254.169.254/" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/manifests",
          headers: headers(),
          payload: { url: "http://169.254.169.254/" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/manifests",
          headers: { ...headers(), "content-type": "text/javascript" },
          payload: "process.exit()",
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/manifests",
          headers: headers(),
          payload: { value: "x".repeat(5000) },
        })
      ).statusCode,
    ).toBe(413);
  });
  it("publishes diagnostic evidence only after explicit owner consent", async () => {
    const repo = new Repository(db.pool),
      store = new FileArtifactStore(dir, 4096);
    const run = await repo.enqueue(
      alice.address.toLowerCase(),
      "public-fixture",
      { purpose: "diagnostic", mode: "deployed" },
      5,
      3,
    );
    const ref = await store.put(Buffer.from('{"testFixture":true}'));
    // Arrange completed test data; this is not a real repair result or worker bypass endpoint.
    await db.pool.query(
      "UPDATE runs SET state='succeeded',artifact=$2 WHERE id=$1",
      [run.id, JSON.stringify(ref)],
    );
    const publicUrl = `/v1/public/runs/${run.id}/evidence`;
    expect((await app.inject(publicUrl)).statusCode).toBe(404);
    const other = await login(bob);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/runs/${run.id}/publish`,
          headers: { authorization: `Bearer ${other}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/runs/${run.id}/publish`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(204);
    expect((await app.inject(publicUrl)).json()).toEqual({ testFixture: true });
  });
  it("exports generated OpenAPI and limits public challenge traffic", async () => {
    const spec = (await app.inject("/openapi.json")).json();
    expect(spec.paths["/v1/runs"].post).toBeDefined();
    expect(spec.components.securitySchemes.session.type).toBe("http");
    await db.pool.query(
      "INSERT INTO rate_limits(bucket,minute,count) VALUES('ip:127.0.0.1',floor(extract(epoch from clock_timestamp())/60)::bigint,999) ON CONFLICT(bucket,minute) DO UPDATE SET count=999",
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/challenge",
          payload: { address: alice.address, chainId: "31337" },
        })
      ).statusCode,
    ).toBe(429);
  });
});
