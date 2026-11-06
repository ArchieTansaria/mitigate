import { afterAll, beforeAll, expect, test } from "vitest";
import { must } from "../../api/test/assert.ts";
import {
  inspectDeployment,
  loadSupportedPattern,
} from "../src/inspect/transparent-oracle.ts";
import { loadApprovedPack, runTestPack } from "../src/runner/oracle.ts";
import { fixture } from "./fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
let pattern: Awaited<ReturnType<typeof loadSupportedPattern>>;
let pack: Awaited<ReturnType<typeof loadApprovedPack>>;
beforeAll(async () => {
  f = await fixture();
  pattern = await loadSupportedPattern();
  pack = await loadApprovedPack();
}, 60000);
afterAll(async () => {
  await f?.stop();
});
async function inspected(index: number) {
  const row = must(f.rows[index]);
  return inspectDeployment({
    rpcUrl: f.rpcUrl,
    deployment: row.deployment,
    manifest: row.manifest,
    snapshot: await f.snapshot(),
    confirmations: 1,
    pattern,
  });
}
test("runs actual deployed bytecode offline: stale V1 fails, V2 passes, unsafe decimals fails", async () => {
  for (const [index, expected] of [
    [0, ["pass", "fail"]],
    [1, ["pass", "pass"]],
    [2, ["fail", "pass"]],
  ] as const) {
    const inspection = await inspected(index);
    const result = await runTestPack({
      inspection,
      manifest: must(f.rows[index]).manifest,
      pack,
    });
    expect(result.status).toBe("completed");
    expect(result.assertions.map((a) => a.outcome)).toEqual(expected);
    expect(result.interventions).toHaveLength(2);
    expect(result.executionKind).toBe("isolated-state-replay");
    expect(result.claimEligible).toBe(false);
    expect(result.container.network).toBe("none");
    expect(result.trace.stateDigest).toBeDefined();
    const raw = await f.client.readContract({
      address: must(f.rows[index]).source,
      abi: [
        {
          type: "function",
          name: "latestPrice",
          inputs: [],
          outputs: [{ type: "uint256" }, { type: "uint256" }],
          stateMutability: "view",
        },
      ],
      functionName: "latestPrice",
    });
    expect(raw[0]).toBe(200000000000n); // Source chain was never mutated by the runner.
  }
}, 60000);
test("paused market cannot pass merely because its quote reverts", async () => {
  const row = must(f.rows[1]);
  await f.write(row.market, "function setPaused(bool paused_)", "setPaused", [
    true,
  ]);
  const result = await runTestPack({
    inspection: await inspected(1),
    manifest: row.manifest,
    pack,
  });
  expect(result.assertions.map((a) => a.outcome)).toEqual(["fail", "fail"]);
  await f.write(row.market, "function setPaused(bool paused_)", "setPaused", [
    false,
  ]);
});
test("unsupported pack and missing observations cannot execute; timeout never means pass", async () => {
  const inspection = await inspected(1),
    manifest = must(f.rows[1]).manifest;
  expect(
    (
      await runTestPack({
        inspection,
        manifest: { ...manifest, testPackDigest: `0x${"22".repeat(32)}` },
        pack,
      })
    ).status,
  ).toBe("unsupported");
  expect(
    (
      await runTestPack({
        inspection: { ...inspection, status: "unknown" },
        manifest,
        pack,
      })
    ).status,
  ).toBe("unknown");
  const timed = await runTestPack({ inspection, manifest, pack, timeoutMs: 1 });
  expect(timed.status).toBe("unknown");
  expect(timed.assertions.every((a) => a.outcome === "unknown")).toBe(true);
});
test("runner failure does not substitute a mock success", async () => {
  const result = await runTestPack({
    inspection: await inspected(1),
    manifest: must(f.rows[1]).manifest,
    pack,
    dockerBinary: "/usr/bin/false",
  });
  expect(result.status).toBe("unknown");
  expect(result.reason).toBe("EXECUTION_FAILED");
});
