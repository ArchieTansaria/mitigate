import { toHex } from "viem";
import { afterAll, beforeAll, expect, test } from "vitest";
import { must } from "../../api/test/assert.ts";
import {
  inspectDeployment,
  loadSupportedPattern,
} from "../src/inspect/transparent-oracle.ts";
import { fixture } from "./fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
let pattern: Awaited<ReturnType<typeof loadSupportedPattern>>;
beforeAll(async () => {
  f = await fixture();
  pattern = await loadSupportedPattern();
}, 60000);
afterAll(async () => {
  await f?.stop();
});
async function inspect(index: number, changes: Record<string, unknown> = {}) {
  const row = must(f.rows[index]);
  return inspectDeployment({
    rpcUrl: f.rpcUrl,
    deployment: row.deployment,
    manifest: row.manifest,
    snapshot: await f.snapshot(),
    confirmations: 1,
    pattern,
    ...changes,
  });
}
test("discovers actual proxy, source, code and separate upgrade/config owners", async () => {
  const r = await inspect(1);
  expect(r.status).toBe("supported");
  expect(r.observed?.proxy).toBe(must(f.rows[1]).proxy);
  expect(r.observed?.source).toBe(must(f.rows[1]).source);
  expect(r.observed?.upgradeOwner).toBe(f.supplier);
  expect(r.observed?.configurationOwner).toBe(f.customer);
  expect(r.assertions.every((a) => a.outcome === "pass")).toBe(true);
});
test("old implementation and correct code with unsafe decimals fail for different reasons", async () => {
  const old = await inspect(0),
    unsafe = await inspect(2);
  expect(old.assertions.find((a) => a.id === "implementation")?.outcome).toBe(
    "fail",
  );
  expect(
    unsafe.assertions.find((a) => a.id === "implementation")?.outcome,
  ).toBe("pass");
  expect(unsafe.assertions.find((a) => a.id === "configuration")?.outcome).toBe(
    "fail",
  );
  expect(
    unsafe.conditions.find((a) => a.id === "price-decimals"),
  ).toMatchObject({ expected: "8", observed: "6", responsible: f.customer });
});
test("reads the real entrypoint route and detects declared-path drift", async () => {
  const row = must(f.rows[1]);
  const r = await inspect(1, {
    deployment: {
      ...row.deployment,
      declaredDependencyPath: [must(f.rows[0]).proxy, must(f.rows[0]).source],
    },
  });
  expect(r.observed?.proxy).toBe(row.proxy);
  expect(r.assertions.find((a) => a.id === "dependency-path")?.outcome).toBe(
    "fail",
  );
});
test("hash mismatch, missing archive state, wrong chain and missing links never pass", async () => {
  const snapshot = await f.snapshot();
  expect(
    (
      await inspect(1, {
        snapshot: { ...snapshot, blockHash: toHex(42n, { size: 32 }) },
      })
    ).status,
  ).toBe("unknown");
  expect(
    (await inspect(1, { snapshot: { ...snapshot, blockNumber: "99999999" } }))
      .status,
  ).toBe("unknown");
  expect(
    (await inspect(1, { snapshot: { ...snapshot, chainId: "1" } })).status,
  ).toBe("unknown");
  expect(
    (
      await inspect(1, {
        deployment: { ...must(f.rows[1]).deployment, entrypoint: f.customer },
      })
    ).status,
  ).toBe("unsupported");
});
test("pins pre-upgrade reads even after the application changes its adapter", async () => {
  const row = must(f.rows[1]);
  const snapshot = await f.snapshot();
  await f.write(
    row.market,
    "function setAdapter(address adapter_)",
    "setAdapter",
    [must(f.rows[0]).proxy],
  );
  const historical = await inspect(1, { snapshot });
  expect(historical.observed?.proxy).toBe(row.proxy);
  const changed = await inspect(1);
  expect(changed.observed?.proxy).toBe(must(f.rows[0]).proxy);
  expect(
    changed.assertions.find((a) => a.id === "dependency-path")?.outcome,
  ).toBe("fail");
  await f.write(
    row.market,
    "function setAdapter(address adapter_)",
    "setAdapter",
    [row.proxy],
  );
});
test("unsupported predicates and authority models cannot silently become green", async () => {
  const row = must(f.rows[1]);
  expect(
    (
      await inspect(1, {
        manifest: { ...row.manifest, configurationPredicates: [] },
      })
    ).status,
  ).toBe("unsupported");
  expect(
    (
      await inspect(1, {
        deployment: { ...row.deployment, expectedAuthorityModel: "multisig" },
      })
    ).status,
  ).toBe("unsupported");
});
test("unrecognized proxy/admin code cannot produce a guessed upgrade owner", async () => {
  const row = must(f.rows[1]);
  await f.client.request({
    method: "anvil_setCode" as never,
    params: [row.proxyAdmin, "0x60006000fd"] as never,
  });
  const r = await inspect(1);
  expect(r.status).toBe("unsupported");
  expect(r.observed).toBeUndefined();
});
