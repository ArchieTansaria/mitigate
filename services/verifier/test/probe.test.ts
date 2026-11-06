import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { probeSnapshot } from "../src/probe.ts";

const hash = `0x${"11".repeat(32)}`;
const target = "0x1111111111111111111111111111111111111111";
const slot = `0x${"00".repeat(32)}`;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
  servers.length = 0;
});
async function endpoint(
  handler: (method: string, params: unknown[]) => unknown,
  options: { delay?: number; oversized?: boolean } = {},
) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const message = JSON.parse(body);
    const result = handler(message.method, message.params);
    if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
    res.setHeader("Content-Type", "application/json");
    res.end(
      options.oversized
        ? "x".repeat(10000)
        : JSON.stringify({ jsonrpc: "2.0", id: message.id, result }),
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("no port");
  return `http://127.0.0.1:${addr.port}`;
}
function rpc(method: string) {
  if (method === "eth_chainId") return "0xaa36a7";
  if (method === "eth_blockNumber") return "0x14";
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash")
    return { number: "0xa", hash, timestamp: "0x3e8" };
  if (method === "eth_getCode") return "0x60006000";
  if (method === "eth_getStorageAt") return slot;
  throw Error(method);
}
const config = {
  chainId: "11155111",
  blockNumber: "10",
  expectedBlockHash: hash,
  address: target,
  storageSlot: slot,
  confirmations: 2,
  timeoutMs: 1000,
  maxResponseBytes: 4096,
};
describe("historical snapshot probe", () => {
  it("reads code/storage at one exact canonical hash and returns measured provenance", async () => {
    const reads: unknown[] = [];
    const rpcUrl = await endpoint((m, p) => {
      if (["eth_getCode", "eth_getStorageAt"].includes(m)) reads.push(p.at(-1));
      return rpc(m);
    });
    const result = await probeSnapshot({ ...config, rpcUrl });
    expect(result.status).toBe("ready");
    expect(reads).toEqual([
      { blockHash: hash, requireCanonical: true },
      { blockHash: hash, requireCanonical: true },
    ]);
    if (result.status === "ready") {
      expect(result.snapshot.blockNumber).toBe("10");
      expect(result.snapshot.blockHash).toBe(hash);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
  it.each([
    "wrong-chain",
    "missing-block",
    "reorg",
    "insufficient-confirmations",
    "empty-code",
  ])("returns unknown for %s; never repair pass", async (failure) => {
    let blockReads = 0;
    const rpcUrl = await endpoint((m) => {
      if (failure === "wrong-chain" && m === "eth_chainId") return "0x1";
      if (failure === "missing-block" && m === "eth_getBlockByNumber")
        return null;
      if (
        failure === "reorg" &&
        m === "eth_getBlockByNumber" &&
        ++blockReads > 1
      )
        return {
          number: "0xa",
          hash: `0x${"22".repeat(32)}`,
          timestamp: "0x3e8",
        };
      if (failure === "insufficient-confirmations" && m === "eth_blockNumber")
        return "0xb";
      if (failure === "empty-code" && m === "eth_getCode") return "0x";
      return rpc(m);
    });
    expect((await probeSnapshot({ ...config, rpcUrl })).status).toBe("unknown");
  });
  it("bounds slow and oversized providers, without exposing the endpoint", async () => {
    for (const options of [{ delay: 150 }, { oversized: true }]) {
      const rpcUrl = await endpoint(rpc, options);
      const result = await probeSnapshot({ ...config, rpcUrl, timeoutMs: 30 });
      expect(result.status).toBe("unknown");
      expect(JSON.stringify(result)).not.toContain(rpcUrl);
    }
  });
});
