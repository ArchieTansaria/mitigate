import { afterAll, beforeAll, expect, it } from "vitest";
import { loadConfig } from "../../../packages/config/src/index.ts";
import { createApp } from "../src/app.ts";
import { FileArtifactStore } from "../src/artifacts/store.ts";
import { Repository } from "../src/db/repository.ts";
import { startDatabase } from "./database.ts";

let db: Awaited<ReturnType<typeof startDatabase>>,
  app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  db = await startDatabase();
  const config = loadConfig(
    {
      PATCHBOND_MODE: "local",
      SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
      ARC_TESTNET_RPC_URL: "http://127.0.0.1:8546",
      DATABASE_URL: db.connectionString,
      API_ORIGIN: "http://localhost:3000",
      EVALUATOR_ADDRESS: "0x1111111111111111111111111111111111111111",
      ARTIFACT_BACKEND: "filesystem",
      ARTIFACT_DIRECTORY: "/tmp/pb-unused",
      REQUESTS_PER_MINUTE: "2",
      TRUSTED_PROXY_IPS: "127.0.0.1",
    },
    {
      schemaVersion: 1,
      environment: "local",
      source: { chainId: "31337", ccipSelector: "1" },
      destination: {
        chainId: "31338",
        ccipSelector: "2",
        usdc: "0x1111111111111111111111111111111111111111",
        decimals: 6,
      },
    },
  );
  app = await createApp(
    config,
    new Repository(db.pool),
    new FileArtifactStore("/tmp/pb-unused", 128),
  );
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await db?.stop();
});
const payload = {
  address: "0x1111111111111111111111111111111111111111",
  chainId: "31337",
};
it("separates forwarded clients only from explicitly trusted proxy IPs", async () => {
  for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"])
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/challenge",
          remoteAddress: "127.0.0.1",
          headers: { "x-forwarded-for": ip },
          payload,
        })
      ).statusCode,
    ).toBe(200);
});
it("ignores forged forwarding headers from untrusted peers and keeps health probes independent", async () => {
  const statuses = [];
  for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3"])
    statuses.push(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/challenge",
          remoteAddress: "192.0.2.5",
          headers: { "x-forwarded-for": ip },
          payload,
        })
      ).statusCode,
    );
  expect(statuses).toEqual([200, 200, 429]);
  expect(
    (await app.inject({ url: "/health", remoteAddress: "192.0.2.5" }))
      .statusCode,
  ).toBe(200);
});

it("global admission bounds growth before inserting buckets for additional peers", async () => {
  await db.pool.query(
    "INSERT INTO rate_limits(bucket,minute,count) VALUES('global',floor(extract(epoch from clock_timestamp())/60)::bigint,1000) ON CONFLICT(bucket,minute) DO UPDATE SET count=1000",
  );
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/auth/challenge",
        remoteAddress: "192.0.2.199",
        payload,
      })
    ).statusCode,
  ).toBe(429);
  expect(
    (
      await db.pool.query(
        "SELECT * FROM rate_limits WHERE bucket='ip:192.0.2.199'",
      )
    ).rowCount,
  ).toBe(0);
});
