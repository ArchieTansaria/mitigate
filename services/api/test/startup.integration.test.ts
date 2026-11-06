import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { startChain } from "./chain.ts";
import { startDatabase } from "./database.ts";

it("starts the real API process after migrations and serves health/OpenAPI over HTTP", async () => {
  const db = await startDatabase(),
    source = await startChain(),
    destination = await startChain(31338),
    directory = await mkdtemp(join(tmpdir(), "pb-api-start-"));
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error();
  const port = address.port;
  await new Promise<void>((r) => listener.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "services/api/src/main.ts"],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        PATCHBOND_MODE: "local",
        NETWORK_MANIFEST: "config/networks/runtime.local.example.json",
        SEPOLIA_RPC_URL: source.url,
        ARC_TESTNET_RPC_URL: destination.url,
        DATABASE_URL: db.connectionString,
        API_ORIGIN: `http://localhost:${port}`,
        API_PORT: String(port),
        EVALUATOR_ADDRESS: "0x1111111111111111111111111111111111111111",
        ARTIFACT_BACKEND: "filesystem",
        ARTIFACT_DIRECTORY: directory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (c) => {
    logs += c;
  });
  child.stderr.on("data", (c) => {
    logs += c;
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(`API exited: ${logs}`);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) {
          expect(await r.json()).toMatchObject({
            status: "ok",
            mode: "local",
            contractsConfigured: false,
          });
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    expect(ready).toBe(true);
    const spec = await fetch(`http://127.0.0.1:${port}/openapi.json`).then(
      (r) => r.json(),
    );
    expect(spec.paths["/v1/runs"]).toBeDefined();
    expect(logs).not.toContain(db.connectionString);
    const hanging = createConnection({ host: "127.0.0.1", port });
    await new Promise<void>((resolve) => hanging.once("connect", resolve));
    hanging.on("error", () => {});
    hanging.write(
      "POST /v1/auth/challenge HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{",
    );
    await delay(100);
    const exited = new Promise<boolean>((resolve) =>
      child.once("exit", () => resolve(true)),
    );
    child.kill("SIGTERM");
    const graceful = await Promise.race([
      exited,
      delay(1500).then(() => false),
    ]);
    hanging.destroy();
    expect(graceful).toBe(true);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) => child.once("exit", () => r())),
      delay(3000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await source.stop();
    await destination.stop();
    await db.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
