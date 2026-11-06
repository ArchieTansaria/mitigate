import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { createPublicClient, http, parseAbi } from "viem";
import { loadConfig } from "../../../packages/config/src/index.ts";
import { createApp } from "./app.ts";
import { S3ArtifactStore } from "./artifacts/s3.ts";
import { type ArtifactStore, FileArtifactStore } from "./artifacts/store.ts";
import { migrate } from "./db/migrate.ts";
import { Repository } from "./db/repository.ts";

let stage = "configuration";
async function main() {
  if (!process.env.NETWORK_MANIFEST)
    throw new Error("NETWORK_MANIFEST_REQUIRED");
  const manifest = JSON.parse(
    await readFile(resolve(process.env.NETWORK_MANIFEST), "utf8"),
  );
  const config = loadConfig(process.env, manifest);
  stage = "network-validation";
  const source = createPublicClient({
    transport: http(config.rpc.source, { timeout: 5000, retryCount: 0 }),
  });
  const destination = createPublicClient({
    transport: http(config.rpc.destination, { timeout: 5000, retryCount: 0 }),
  });
  if (
    String(await source.getChainId()) !== config.network.source.chainId ||
    String(await destination.getChainId()) !==
      config.network.destination.chainId
  )
    throw new Error("RPC_CHAIN_MISMATCH");
  if (config.mode === "testnet") {
    const decimals = await destination.readContract({
      address: config.network.destination.usdc,
      abi: parseAbi(["function decimals() view returns (uint8)"]),
      functionName: "decimals",
    });
    if (decimals !== 6) throw new Error("TOKEN_DECIMALS_MISMATCH");
  }
  stage = "database-migration";
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  let s3: S3Client | undefined;
  try {
    await migrate(pool);
    let artifacts: ArtifactStore;
    if (config.artifacts.kind === "filesystem")
      artifacts = new FileArtifactStore(
        config.artifacts.directory,
        config.limits.artifactBytes,
      );
    else {
      s3 = new S3Client({
        region: config.artifacts.region,
        ...(config.artifacts.endpoint
          ? { endpoint: config.artifacts.endpoint, forcePathStyle: true }
          : {}),
        maxAttempts: 2,
      });
      artifacts = new S3ArtifactStore(
        s3,
        config.artifacts.bucket,
        config.limits.artifactBytes,
      );
    }
    const repo = new Repository(pool);
    await repo.pruneExpired();
    let pruning = false;
    const cleanup = setInterval(() => {
      if (pruning) return;
      pruning = true;
      void repo
        .pruneExpired()
        .catch(() => console.error("Expired-record cleanup failed"))
        .finally(() => {
          pruning = false;
        });
    }, 30000);
    cleanup.unref();
    const app = await createApp(config, repo, artifacts);
    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      clearInterval(cleanup);
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      try {
        await app.close();
        await pool.end();
        s3?.destroy();
      } finally {
        clearTimeout(deadline);
      }
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    stage = "http-listen";
    await app.listen({
      host: config.mode === "local" ? "127.0.0.1" : "0.0.0.0",
      port: config.port,
    });
    console.log(
      JSON.stringify({
        event: "api-ready",
        port: config.port,
        ...config.publicStatus,
      }),
    );
  } catch (error) {
    await pool.end();
    s3?.destroy();
    throw error;
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: "startup-failed",
      stage,
      message:
        "Check configuration and service availability; provider details suppressed.",
    }),
  );
  process.exitCode = 1;
});
