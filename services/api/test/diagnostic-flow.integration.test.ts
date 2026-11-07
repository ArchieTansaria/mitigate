import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createWalletClient, http } from "viem";
import { afterAll, beforeAll, expect, test } from "vitest";
import { testSigner } from "../../../packages/schema/test/fixtures.ts";
import { verifySignedEvidence } from "../../verifier/src/evidence/bundle.ts";
import { replayEvidence } from "../../verifier/src/replay.ts";
import { fixture } from "../../verifier/test/fixture.ts";
import { FileArtifactStore } from "../src/artifacts/store.ts";
import { Repository } from "../src/db/repository.ts";
import { must } from "./assert.ts";
import { startChain } from "./chain.ts";
import { startDatabase } from "./database.ts";

let f: Awaited<ReturnType<typeof fixture>>,
  dest: Awaited<ReturnType<typeof startChain>>,
  db: Awaited<ReturnType<typeof startDatabase>>,
  dir: string,
  origin: string,
  token: string;
let env: NodeJS.ProcessEnv;
const children: ChildProcess[] = [];
async function eventually<T>(
  fn: () => Promise<T>,
  ready: (r: T) => boolean,
  ms = 20000,
) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (ready(v)) return v;
    await delay(250);
  }
  throw new Error("Expected state did not arrive");
}
function service(file: string) {
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let logs = "";
  child.stdout?.on("data", (c) => {
    logs = (logs + c.toString()).slice(-32768);
  });
  child.stderr?.on("data", (c) => {
    logs = (logs + c.toString()).slice(-32768);
  });
  return {
    child,
    wait: async (event: string) =>
      eventually(
        async () => {
          if (child.exitCode !== null)
            throw new Error(`Service exited: ${logs}`);
          return logs;
        },
        (s) => s.includes(`"event":"${event}"`),
      ),
  };
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
    await new Promise<void>((r) => child.once("exit", () => r()));
  }
}
async function request(path: string, payload?: unknown, auth = true) {
  const response = await fetch(origin + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...(path === "/v1/runs"
        ? { "Idempotency-Key": `run-${Date.now()}` }
        : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
beforeAll(async () => {
  f = await fixture();
  dest = await startChain(31338);
  db = await startDatabase();
  dir = await mkdtemp(join(tmpdir(), "pb-full-flow-"));
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error();
  const port = addr.port;
  await new Promise<void>((r) => server.close(() => r()));
  origin = `http://127.0.0.1:${port}`;
  const manifestPath = join(dir, "network.json"),
    key = join(dir, "verifier-key");
  await writeFile(key, `0x${"01".repeat(32)}`, { mode: 0o600 });
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      environment: "local",
      source: { chainId: "31337", ccipSelector: "1" },
      destination: {
        chainId: "31338",
        ccipSelector: "2",
        usdc: testSigner.address,
        decimals: 6,
      },
    }),
  );
  env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    PATCHBOND_MODE: "local",
    NETWORK_MANIFEST: manifestPath,
    VERIFIER_KEY_FILE: key,
    DATABASE_URL: db.connectionString,
    SEPOLIA_RPC_URL: f.rpcUrl,
    ARC_TESTNET_RPC_URL: dest.url,
    API_ORIGIN: origin,
    API_PORT: String(port),
    ARTIFACT_BACKEND: "filesystem",
    ARTIFACT_DIRECTORY: join(dir, "artifacts"),
    EVALUATOR_ADDRESS: testSigner.address,
    LEASE_SECONDS: "1",
    MAX_ATTEMPTS: "3",
    REQUESTS_PER_MINUTE: "300",
  };
  const api = service("services/api/src/main.ts");
  await api.wait("api-ready");
  const challenge = await request(
    "/v1/auth/challenge",
    { address: testSigner.address, chainId: "31337" },
    false,
  );
  token = (
    await request(
      "/v1/auth/verify",
      {
        challengeId: challenge.challengeId,
        signature: await testSigner.signMessage({ message: challenge.message }),
      },
      false,
    )
  ).token;
}, 60000);
afterAll(async () => {
  for (const child of children) await stop(child);
  await db?.stop();
  await dest?.stop();
  await f?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("separate HTTP API/worker recover a killed lease and publish actual signed replayable evidence", async () => {
  const row = must(f.rows[1]);
  await f.snapshot(); // ensure confirmed snapshot includes deployment
  const inventory = await request("/v1/inventories", {
    schemaVersion: 1,
    deployments: [row.deployment],
  });
  const manifest = await request("/v1/manifests", row.manifest);
  const scope = await request("/v1/verification-scopes", {
    schemaVersion: 1,
    inventoryId: inventory.id,
    manifestId: manifest.id,
    maxSnapshotAge: "300",
    confirmations: 1,
  });
  const first = service("services/verifier/src/main.ts");
  await first.wait("worker-ready");
  const run = await request("/v1/runs", {
    schemaVersion: 1,
    verificationScopeId: scope.spec.verificationScopeId,
    inventoryDigest: inventory.digest,
    manifestDigest: manifest.digest,
    verificationSpecDigest: scope.digest,
    purpose: "diagnostic",
    mode: "deployed",
  });
  await first.wait("job-started");
  const repo = new Repository(db.pool),
    old = must(await repo.getRun(testSigner.address.toLowerCase(), run.id));
  await stop(first.child, "SIGKILL");
  await delay(1100);
  const second = service("services/verifier/src/main.ts");
  await second.wait("worker-ready");
  const finished = await eventually(
    () => request(`/v1/runs/${run.id}`),
    (r) => r.state === "succeeded" || r.state === "failed",
    30000,
  );
  expect(finished.state).toBe("succeeded");
  expect(finished.attempts).toBe(2);
  const signed = await request(`/v1/runs/${run.id}/evidence`);
  expect(
    await verifySignedEvidence(
      signed,
      scope.spec,
      BigInt(Math.floor(Date.now() / 1000)),
    ),
  ).toEqual({ valid: true, completePass: true });
  expect(signed.body.claimEligible).toBe(false);
  const job = must(await repo.getRun(testSigner.address.toLowerCase(), run.id));
  await expect(
    repo.finish(
      run.id,
      must(old.leaseToken),
      must(job.artifact),
      new FileArtifactStore(join(dir, "artifacts"), 1048576),
    ),
  ).rejects.toThrow("LEASE_LOST");
  expect(
    (await fetch(`${origin}/v1/public/runs/${run.id}/evidence`)).status,
  ).toBe(404);
  await request(`/v1/runs/${run.id}/publish`, {});
  expect(
    (await fetch(`${origin}/v1/public/runs/${run.id}/evidence`)).status,
  ).toBe(200);
  const replay = await replayEvidence(
    signed,
    scope.spec,
    BigInt(Math.floor(Date.now() / 1000)),
  );
  expect(replay.matched).toBe(true);
  expect(replay.claimEligible).toBe(false);
  const altered = structuredClone(signed);
  altered.body.results[0].runner.assertions[0].outcome = "fail";
  await expect(
    replayEvidence(altered, scope.spec, BigInt(Math.floor(Date.now() / 1000))),
  ).rejects.toThrow(/INVALID/);
  await writeFile(join(dir, "evidence.json"), JSON.stringify(signed));
  await writeFile(join(dir, "scope.json"), JSON.stringify(scope.spec));
  const replayProcess = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "services/verifier/src/replay-cli.ts",
      join(dir, "evidence.json"),
      join(dir, "scope.json"),
    ],
    { env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  replayProcess.stdout.on("data", (b) => {
    output += b.toString();
  });
  replayProcess.stderr.on("data", (b) => {
    output += b.toString();
  });
  const code = await new Promise<number | null>((r) =>
    replayProcess.once("exit", r),
  );
  expect(code, output).toBe(0);
  expect(JSON.parse(output).matched).toBe(true);
  const raw = await readFile(
    join(dir, "artifacts", must(job.artifact).digest.slice(2)),
    "utf8",
  );
  expect(raw).not.toContain(
    "0101010101010101010101010101010101010101010101010101010101010101",
  );
}, 60000);

test("completed jobs retain real failing repair results and explanations", async () => {
  const row = must(f.rows[2]);
  await f.snapshot();
  const inventory = await request("/v1/inventories", {
    schemaVersion: 1,
    deployments: [row.deployment],
  });
  const manifest = await request("/v1/manifests", row.manifest);
  const scope = await request("/v1/verification-scopes", {
    schemaVersion: 1,
    inventoryId: inventory.id,
    manifestId: manifest.id,
    maxSnapshotAge: "300",
    confirmations: 1,
  });
  const run = await request("/v1/runs", {
    schemaVersion: 1,
    verificationScopeId: scope.spec.verificationScopeId,
    inventoryDigest: inventory.digest,
    manifestDigest: manifest.digest,
    verificationSpecDigest: scope.digest,
    purpose: "diagnostic",
    mode: "deployed",
  });
  const finished = await eventually(
    () => request(`/v1/runs/${run.id}`),
    (r) => r.state === "succeeded" || r.state === "failed",
  );
  expect(finished.state).toBe("succeeded");
  expect(finished).toMatchObject({
    evidenceReferenceStored: true,
    repairOutcome: "not-evaluated",
  });
  const signed = await request(`/v1/runs/${run.id}/evidence`);
  expect(
    await verifySignedEvidence(
      signed,
      scope.spec,
      BigInt(Math.floor(Date.now() / 1000)),
    ),
  ).toEqual({ valid: true, completePass: false });
  expect(
    signed.body.results[0].inspection.conditions.find(
      (c: { id: string }) => c.id === "price-decimals",
    ),
  ).toMatchObject({
    outcome: "fail",
    expected: "8",
    observed: "6",
    responsible: f.customer,
  });
});

test("HTTP repair proposal -> actual owner transaction -> newly queued passing evidence", async () => {
  const row = must(f.rows[0]);
  await f.snapshot();
  const inventory = await request("/v1/inventories", {
    schemaVersion: 1,
    deployments: [row.deployment],
  });
  const manifest = await request("/v1/manifests", row.manifest);
  const scope = await request("/v1/verification-scopes", {
    schemaVersion: 1,
    inventoryId: inventory.id,
    manifestId: manifest.id,
    maxSnapshotAge: "300",
    confirmations: 1,
  });
  const body = {
    schemaVersion: 1,
    verificationScopeId: scope.spec.verificationScopeId,
    inventoryDigest: inventory.digest,
    manifestDigest: manifest.digest,
    verificationSpecDigest: scope.digest,
    purpose: "diagnostic",
    mode: "deployed",
  };
  const run = await request("/v1/runs", body);
  const finished = await eventually(
    () => request(`/v1/runs/${run.id}`),
    (r) => r.state === "succeeded" || r.state === "failed",
    30000,
  );
  expect(finished.state).toBe("succeeded");
  const before = await request(`/v1/runs/${run.id}/evidence`);
  expect(before.body.summary.completePass).toBe(false);
  const deploymentKey = before.body.results[0].deploymentKey;
  const path = `/v1/runs/${run.id}/actions`;
  const prepared = await request(`${path}?deploymentKey=${deploymentKey}`);
  expect(prepared.status).toBe("ready");
  const proposal = prepared.proposal;
  expect(proposal.authority).toBe(f.supplier);
  expect(
    (await fetch(`${origin + path}?deploymentKey=${deploymentKey}`)).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${origin + path}?deploymentKey=0x${"ab".repeat(32)}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(404);
  const validate = await request(`${path}/validate`, {
    deploymentKey,
    proposal,
  });
  expect(validate.valid).toBe(true);
  // Owner-side local test wallet only; API and worker have no supplier/customer keys.
  const wallet = createWalletClient({
    account: f.supplier,
    transport: http(f.rpcUrl),
  });
  const hash = await wallet.sendTransaction({
    account: f.supplier,
    chain: null,
    to: proposal.target,
    data: proposal.calldata,
    value: BigInt(proposal.valueBaseUnits),
  });
  expect((await f.client.waitForTransactionReceipt({ hash })).status).toBe(
    "success",
  );
  // A transaction receipt never rewrites the old failed evidence or auto-accepts a repair.
  expect(
    (await request(`/v1/runs/${run.id}/evidence`)).body.summary.completePass,
  ).toBe(false);
  const stale = await fetch(`${origin + path}/validate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deploymentKey, proposal }),
  });
  expect(stale.status).toBe(409);
  await f.snapshot();
  const fresh = await request("/v1/runs", body);
  expect(fresh.id).not.toBe(run.id);
  expect(
    (
      await eventually(
        () => request(`/v1/runs/${fresh.id}`),
        (r) => r.state === "succeeded" || r.state === "failed",
        30000,
      )
    ).state,
  ).toBe("succeeded");
  const after = await request(`/v1/runs/${fresh.id}/evidence`);
  expect(
    await verifySignedEvidence(
      after,
      scope.spec,
      BigInt(Math.floor(Date.now() / 1000)),
    ),
  ).toEqual({ valid: true, completePass: true });
  expect(BigInt(after.body.snapshot.blockNumber)).toBeGreaterThan(
    BigInt(before.body.snapshot.blockNumber),
  );
  expect(after.body.claimEligible).toBe(false);
  if (process.env.PATCHBOND_REPAIR_DEMO_DIR) {
    const output = process.env.PATCHBOND_REPAIR_DEMO_DIR;
    await mkdir(output, { recursive: true });
    for (const [name, value] of Object.entries({
      "before.json": before,
      "proposal.json": proposal,
      "after.json": after,
      "scope.json": scope.spec,
      "execution.json": {
        environment: "disposable-local-anvil",
        transactionHash: hash,
        sourceChainId: "31337",
        oldRun: run.id,
        newRun: fresh.id,
        oldSnapshot: before.body.snapshot,
        newSnapshot: after.body.snapshot,
        grantPaid: false,
      },
    })) {
      await writeFile(
        join(output, name),
        `${JSON.stringify(value, null, 2)}\n`,
      );
    }
  }
}, 60000);
