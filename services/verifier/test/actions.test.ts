import { createServer } from "node:http";
import { createWalletClient, http, zeroAddress } from "viem";
import { afterAll, beforeAll, expect, test } from "vitest";
import { must } from "../../api/test/assert.ts";
import * as actions from "../src/actions/repair.ts";
import { fixture } from "./fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture();
}, 60000);
afterAll(async () => {
  await f?.stop();
});
async function input(index: number) {
  const row = must(f.rows[index]);
  return {
    rpcUrl: f.rpcUrl,
    deployment: row.deployment,
    manifest: row.manifest,
    snapshot: await f.snapshot(),
    confirmations: 1,
    maxAge: 300,
    now: BigInt(Math.floor(Date.now() / 1000)),
  };
}
test("prepares a supplier-owned upgrade; simulation does not mutate the application", async () => {
  expect(actions.prepareRepair).toBeTypeOf("function");
  const result = await actions.prepareRepair(await input(0));
  expect(result.status).toBe("ready");
  const p = must(result.proposal);
  expect(p.operation).toBe("upgrade");
  expect(p.authority).toBe(f.supplier);
  expect(p.target).toBe(must(f.rows[0]).proxyAdmin);
  expect(p.simulation.success).toBe(true);
  expect(p.compatibility.kind).toBe("exact-reviewed-family-layout");
  expect(p.claimEligible).toBe(false);
  expect(
    (await actions.prepareRepair(await input(0))).proposal?.operation,
  ).toBe("upgrade");
});
test("prepares customer-owned configuration and refuses changed calldata", async () => {
  const i = await input(2),
    result = await actions.prepareRepair(i),
    p = must(result.proposal);
  expect(p.operation).toBe("configure");
  expect(p.authority).toBe(f.customer);
  expect(p.target).toBe(must(f.rows[2]).proxy);
  await expect(
    actions.validateRepair(i, { ...p, target: f.supplier }),
  ).rejects.toThrow("PROPOSAL_MISMATCH");
  await expect(
    actions.validateRepair(i, { ...p, calldata: "0x" }),
  ).rejects.toThrow("PROPOSAL_MISMATCH");
  await expect(
    actions.validateRepair({ ...i, now: BigInt(p.expiresAt) }, p),
  ).rejects.toThrow("STALE_PROPOSAL");
  await actions.validateRepair(i, p);
});
test("owner execution changes actual state and old proposals become invalid", async () => {
  const i = await input(2),
    p = must((await actions.prepareRepair(i)).proposal);
  const wrong = createWalletClient({
    account: f.supplier,
    transport: http(f.rpcUrl),
  });
  const rejected = await wrong.sendTransaction({
    chain: null,
    account: f.supplier,
    to: p.target,
    data: p.calldata,
    value: 0n,
  });
  expect(
    (await f.client.waitForTransactionReceipt({ hash: rejected })).status,
  ).toBe("reverted");
  const wallet = createWalletClient({
    account: f.customer,
    transport: http(f.rpcUrl),
  });
  const hash = await wallet.sendTransaction({
    account: f.customer,
    chain: null,
    to: p.target,
    data: p.calldata,
    value: 0n,
  });
  expect((await f.client.waitForTransactionReceipt({ hash })).status).toBe(
    "success",
  );
  await expect(actions.validateRepair(i, p)).rejects.toThrow("STATE_CHANGED");
  expect((await actions.prepareRepair(await input(2))).status).toBe(
    "no-supported-action",
  );
});
test("rejects expiry reached while RPC inspection and simulation are running", async () => {
  const i = await input(0);
  let reads = 0;
  await expect(
    actions.prepareRepair({
      ...i,
      clock: () =>
        ++reads === 1 ? i.now : BigInt(i.snapshot.blockTimestamp) + 120n,
    }),
  ).rejects.toThrow("STALE_PROPOSAL");
});
test("malformed current simulation never becomes ready after historical success", async () => {
  const i = await input(0),
    p = must((await actions.prepareRepair(i)).proposal);
  let intercepted = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (
      body.method === "eth_call" &&
      body.params[0].data === p.calldata &&
      body.params[1].blockHash !== i.snapshot.blockHash
    ) {
      intercepted = true;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: null }));
      return;
    }
    const upstream = await fetch(f.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    res.setHeader("Content-Type", "application/json");
    res.end(await upstream.text());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    const result = await actions.prepareRepair({
      ...i,
      rpcUrl: `http://127.0.0.1:${address.port}`,
    });
    expect(intercepted).toBe(true);
    expect(result).toMatchObject({
      status: "blocked",
      reason: "SIMULATION_UNAVAILABLE_OR_REVERTED",
      proposal: null,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r, e) =>
      server.close((err) => (err ? e(err) : r())),
    );
  }
});
test("does not guess authority or override a path/policy mismatch", async () => {
  const i = await input(0);
  const unsupported = await actions.prepareRepair({
    ...i,
    deployment: { ...i.deployment, expectedAuthorityModel: "multisig" },
  });
  expect(unsupported.proposal).toBeNull();
  const mismatch = await actions.prepareRepair({
    ...i,
    deployment: {
      ...i.deployment,
      declaredDependencyPath: [must(f.rows[1]).proxy, must(f.rows[1]).source],
    },
  });
  expect(mismatch.proposal).toBeNull();
  const wrongImpl = await actions.prepareRepair({
    ...i,
    manifest: { ...i.manifest, approvedImplementationAddress: f.customer },
  });
  expect(wrongImpl.proposal).toBeNull();
  await f.write(
    must(f.rows[0]).proxyAdmin,
    "function renounceOwnership()",
    "renounceOwnership",
    [],
    f.supplier,
  );
  const ownerless = await actions.prepareRepair(await input(0));
  expect(ownerless.proposal).toBeNull();
  expect(ownerless.proposal?.authority).not.toBe(zeroAddress);
});
