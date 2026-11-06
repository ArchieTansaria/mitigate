import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { loadConfig } from "../../../packages/config/src/index.ts";
import { S3ArtifactStore } from "../../api/src/artifacts/s3.ts";
import { FileArtifactStore } from "../../api/src/artifacts/store.ts";
import { migrate } from "../../api/src/db/migrate.ts";
import { Repository } from "../../api/src/db/repository.ts";
import { consumeNext } from "./consume-job.ts";
import { loadEvidenceSigner } from "./evidence/signer.ts";
import { loadSupportedPattern } from "./inspect/transparent-oracle.ts";
import { processJob } from "./process-job.ts";
import { loadApprovedPack } from "./runner/oracle.ts";

let stage = "configuration";
async function main() {
  if (!process.env.NETWORK_MANIFEST || !process.env.VERIFIER_KEY_FILE)
    throw new Error("MISSING_WORKER_CONFIG");
  const config = loadConfig(
    process.env,
    JSON.parse(await readFile(process.env.NETWORK_MANIFEST, "utf8")),
  );
  const maxRunMs = Number(process.env.WORKER_RUN_TIMEOUT_MS ?? "180000");
  if (!Number.isInteger(maxRunMs) || maxRunMs < 1000 || maxRunMs > 600000)
    throw new Error("INVALID_WORKER_DEADLINE");
  stage = "signer-and-pack";
  const signer = await loadEvidenceSigner(
      process.env.VERIFIER_KEY_FILE,
      config.evaluator,
    ),
    pattern = await loadSupportedPattern(),
    pack = await loadApprovedPack();
  stage = "database";
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  let s3: S3Client | undefined;
  const abort = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const shutdown = () => {
    if (abort.signal.aborted) return;
    abort.abort();
    deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await migrate(pool);
    const repo = new Repository(pool);
    if (config.artifacts.kind === "s3")
      s3 = new S3Client({
        region: config.artifacts.region,
        ...(config.artifacts.endpoint
          ? { endpoint: config.artifacts.endpoint, forcePathStyle: true }
          : {}),
        maxAttempts: 2,
      });
    const store =
      config.artifacts.kind === "filesystem"
        ? new FileArtifactStore(
            config.artifacts.directory,
            config.limits.artifactBytes,
          )
        : new S3ArtifactStore(
            s3 as S3Client,
            config.artifacts.bucket,
            config.limits.artifactBytes,
          );
    const services = {
      repo,
      rpcUrl: config.rpc.source,
      chainId: config.network.source.chainId,
      signer,
      pattern,
      pack,
      maxInventory: config.limits.inventory,
    };
    const event = (value: { event: string; runId?: string }) =>
      console.log(JSON.stringify(value));
    event({ event: "worker-ready" });
    stage = "consume";
    while (!abort.signal.aborted) {
      const result = await consumeNext({
        repo,
        store,
        leaseSeconds: config.limits.leaseSeconds,
        maxRunMs,
        signal: abort.signal,
        onEvent: event,
        execute: (job, signal) => processJob(job, signal, services),
      });
      if (result.status === "idle")
        await delay(250, undefined, { signal: abort.signal }).catch(() => {});
    }
  } finally {
    await pool.end();
    s3?.destroy();
    if (deadline) clearTimeout(deadline);
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: "worker-failed",
      stage,
      message:
        "Worker stopped; inspect configuration/service availability. Provider details suppressed.",
    }),
  );
  process.exitCode = 1;
});
