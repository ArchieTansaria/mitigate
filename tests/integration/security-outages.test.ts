import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../packages/config/src/index.ts";
import { createApp } from "../../services/api/src/app.ts";
import type { ArtifactStore } from "../../services/api/src/artifacts/store.ts";
import { FileArtifactStore } from "../../services/api/src/artifacts/store.ts";
import { Repository } from "../../services/api/src/db/repository.ts";
import { startChain } from "../../services/api/test/chain.ts";
import { startDatabase } from "../../services/api/test/database.ts";

const account = privateKeyToAccount(`0x${"03".repeat(32)}`);
const deployment = {
  chainId: "31337",
  entrypoint: account.address,
  marketSelector: zeroHash,
  inspectionModuleId: "eip1967-transparent-v1" as const,
  declaredDependencyPath: [],
  expectedAuthorityModel: "owner" as const,
};

describe("security behavior during dependency outages", () => {
  let db: Awaited<ReturnType<typeof startDatabase>>;
  let chain: Awaited<ReturnType<typeof startChain>>;
  let dir: string;
  let repository: Repository;
  let store: FileArtifactStore;
  let app: Awaited<ReturnType<typeof createApp>>;
  let token: string;
  let config: ReturnType<typeof loadConfig>;

  beforeAll(async () => {
    db = await startDatabase();
    chain = await startChain(31337);
    dir = await mkdtemp(join(tmpdir(), "pb-security-outages-"));
    repository = new Repository(db.pool);
    store = new FileArtifactStore(dir, 4096);
    config = loadConfig(
      {
        PATCHBOND_MODE: "local",
        DATABASE_URL: db.connectionString,
        SEPOLIA_RPC_URL: chain.url,
        ARC_TESTNET_RPC_URL: "http://127.0.0.1:8546",
        API_ORIGIN: "http://localhost:3000",
        ARTIFACT_BACKEND: "filesystem",
        ARTIFACT_DIRECTORY: dir,
        EVALUATOR_ADDRESS: account.address,
      },
      {
        schemaVersion: 1,
        environment: "local",
        source: { chainId: "31337", ccipSelector: "1" },
        destination: {
          chainId: "31338",
          ccipSelector: "2",
          usdc: account.address,
          decimals: 6,
        },
      },
    );
    app = await createApp(config, repository, store);
    await app.ready();
    const challenge = await app.inject({
      method: "POST",
      url: "/v1/auth/challenge",
      payload: { address: account.address, chainId: "31337" },
    });
    const signed = await account.signMessage({
      message: challenge.json().message,
    });
    const verified = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: { challengeId: challenge.json().challengeId, signature: signed },
    });
    expect(verified.statusCode).toBe(200);
    token = verified.json().token;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await chain?.stop();
    await db?.stop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("keeps an unprocessed run queued across API restart when no worker is available", async () => {
    const headers = { authorization: `Bearer ${token}` };
    const openapi = (await app.inject("/openapi.json")).json();
    expect(
      openapi.paths["/v1/runs/{id}"].get.responses["200"].content[
        "application/json"
      ].schema.properties,
    ).toMatchObject({
      schemaVersion: { enum: [1] },
      evidenceReferenceStored: { type: "boolean" },
      repairOutcome: { enum: ["not-evaluated"] },
    });
    const inventory = await app.inject({
      method: "POST",
      url: "/v1/inventories",
      headers,
      payload: { schemaVersion: 1, deployments: [deployment] },
    });
    const manifest = await app.inject({
      method: "POST",
      url: "/v1/manifests",
      headers,
      payload: {
        schemaVersion: 1,
        releaseId: "outage-case",
        issueDescription: "Test-only outage case",
        supportedPatternId: "eip1967-transparent-v1",
        sourceChainId: "31337",
        approvedImplementationAddress: account.address,
        approvedRuntimeCodeHash: `0x${"11".repeat(32)}`,
        configurationPredicates: [],
        testPackDigest: `0x${"22".repeat(32)}`,
        requiredAssertionIds: ["configuration"],
        prerequisites: [],
        artifactRefs: [],
      },
    });
    const scope = await app.inject({
      method: "POST",
      url: "/v1/verification-scopes",
      headers,
      payload: {
        schemaVersion: 1,
        inventoryId: inventory.json().id,
        manifestId: manifest.json().id,
        maxSnapshotAge: "60",
        confirmations: 1,
      },
    });
    const queued = await app.inject({
      method: "POST",
      url: "/v1/runs",
      headers: { ...headers, "idempotency-key": "worker-outage" },
      payload: {
        schemaVersion: 1,
        verificationScopeId: scope.json().spec.verificationScopeId,
        inventoryDigest: inventory.json().digest,
        manifestDigest: manifest.json().digest,
        verificationSpecDigest: scope.json().digest,
        purpose: "diagnostic",
        mode: "deployed",
      },
    });
    expect(queued.statusCode).toBe(202);
    expect(queued.json().state).toBe("queued");

    await app.close();
    expect(
      (await repository.getRun(account.address.toLowerCase(), queued.json().id))
        ?.state,
    ).toBe("queued");
    app = await createApp(config, repository, store);
    await app.ready();
    const recovered = await app.inject({
      method: "GET",
      url: `/v1/runs/${queued.json().id}`,
      headers,
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toMatchObject({
      state: "queued",
      evidenceReferenceStored: false,
      repairOutcome: "not-evaluated",
    });
    expect(recovered.json()).not.toHaveProperty("claimEligible");
    expect(
      await repository.cancel(account.address.toLowerCase(), queued.json().id),
    ).toBe(true);
  });

  it("reports an evidence-store outage without describing the run as a repair outcome", async () => {
    const job = await repository.enqueue(
      account.address.toLowerCase(),
      "storage-outage",
      { purpose: "diagnostic", mode: "deployed" },
      5,
      3,
    );
    const ref = await store.put(Buffer.from('{"testOnly":true}'));
    // Arrange a completed job row for the API read contract; this is not a worker success or acceptance.
    await db.pool.query(
      "UPDATE runs SET state='succeeded',artifact=$2 WHERE id=$1",
      [job.id, JSON.stringify(ref)],
    );
    await unlink(join(dir, ref.digest.slice(2)));

    const unavailableStore: ArtifactStore = {
      put: async () => {
        throw new Error("ARTIFACT_PUBLICATION_FAILED");
      },
      get: async () => {
        throw new Error("ARTIFACT_UNAVAILABLE_OR_CORRUPT");
      },
    };
    await app.close();
    app = await createApp(config, repository, unavailableStore);
    await app.ready();

    const status = await app.inject({
      method: "GET",
      url: `/v1/runs/${job.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      state: "succeeded",
      evidenceReferenceStored: true,
      repairOutcome: "not-evaluated",
    });
    expect(status.json()).not.toHaveProperty("evidenceAvailable");
    expect(status.json()).not.toHaveProperty("claimEligible");

    const evidence = await app.inject({
      method: "GET",
      url: `/v1/runs/${job.id}/evidence`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(evidence.statusCode).toBe(503);
    expect(evidence.json().code).toBe("ARTIFACT_UNAVAILABLE_OR_CORRUPT");
  });

  it("returns RPC_UNAVAILABLE without creating a session when source reads fail", async () => {
    const appWithUnavailableSource = await createApp(
      { ...config, rpc: { ...config.rpc, source: "http://127.0.0.1:1" } },
      repository,
      store,
    );
    await appWithUnavailableSource.ready();
    try {
      const challenge = await appWithUnavailableSource.inject({
        method: "POST",
        url: "/v1/auth/challenge",
        payload: { address: account.address, chainId: "31337" },
      });
      expect(challenge.statusCode).toBe(200);
      const signature = await account.signMessage({
        message: challenge.json().message,
      });
      const before = await db.pool.query(
        "SELECT count(*) FROM sessions WHERE owner=$1",
        [account.address.toLowerCase()],
      );
      const verify = await appWithUnavailableSource.inject({
        method: "POST",
        url: "/v1/auth/verify",
        payload: {
          challengeId: challenge.json().challengeId,
          signature,
        },
      });
      expect(verify.statusCode).toBe(503);
      expect(verify.json().code).toBe("RPC_UNAVAILABLE");
      const after = await db.pool.query(
        "SELECT count(*) FROM sessions WHERE owner=$1",
        [account.address.toLowerCase()],
      );
      expect(after.rows[0].count).toBe(before.rows[0].count);
    } finally {
      await appWithUnavailableSource.close();
    }
  });
});
