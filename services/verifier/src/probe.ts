import { type Hex, keccak256 } from "viem";
import { z } from "zod";
import {
  Hash32,
  NonzeroAddress,
  type Snapshot,
  SnapshotSchema,
  UInt,
} from "../../../packages/schema/src/types.ts";

const Config = z.strictObject({
  rpcUrl: z.url(),
  chainId: UInt(),
  blockNumber: UInt(),
  expectedBlockHash: Hash32.optional(),
  address: NonzeroAddress,
  storageSlot: Hash32,
  confirmations: z.number().int().min(1).max(100000),
  timeoutMs: z.number().int().min(1).max(60000),
  maxResponseBytes: z.number().int().min(128).max(1048576),
});
const Block = z.object({
  number: z.string().regex(/^0x[0-9a-f]+$/i),
  hash: Hash32,
  timestamp: z.string().regex(/^0x[0-9a-f]+$/i),
});
export type ProbeResult =
  | {
      status: "ready";
      snapshot: Snapshot;
      codeHash: Hex;
      storageValue: Hex;
      durationMs: number;
    }
  | { status: "unknown"; reason: string; durationMs: number };
class ProbeError extends Error {}
export async function probeSnapshot(input: unknown): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const c = Config.parse(input);
    const endpoint = new URL(c.rpcUrl);
    if (!["https:", "http:"].includes(endpoint.protocol))
      throw new ProbeError("INVALID_RPC_PROTOCOL");
    const signal = AbortSignal.timeout(c.timeoutMs);
    let sequence = 0;
    async function rpc(method: string, params: unknown[]): Promise<unknown> {
      const id = ++sequence;
      const response = await fetch(c.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal,
        redirect: "error",
      });
      if (!response.ok || !response.body)
        throw new ProbeError("RPC_UNAVAILABLE");
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > c.maxResponseBytes)
            throw new ProbeError("RPC_RESPONSE_TOO_LARGE");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const message = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      ) as Record<string, unknown>;
      if (
        message.jsonrpc !== "2.0" ||
        message.id !== id ||
        message.error ||
        !("result" in message)
      )
        throw new ProbeError("RPC_INVALID_OR_UNSUPPORTED_RESPONSE");
      return message.result;
    }
    function quantity(value: unknown) {
      if (
        typeof value !== "string" ||
        !/^0x(0|[1-9a-f][0-9a-f]*)$/i.test(value)
      )
        throw new ProbeError("RPC_INVALID_QUANTITY");
      return BigInt(value);
    }
    if (quantity(await rpc("eth_chainId", [])) !== BigInt(c.chainId))
      throw new ProbeError("CHAIN_MISMATCH");
    const blockTag = `0x${BigInt(c.blockNumber).toString(16)}`;
    const first = Block.safeParse(
      await rpc("eth_getBlockByNumber", [blockTag, false]),
    );
    if (!first.success) throw new ProbeError("BLOCK_UNAVAILABLE");
    const b = first.data;
    if (
      quantity(b.number) !== BigInt(c.blockNumber) ||
      (c.expectedBlockHash && b.hash !== c.expectedBlockHash)
    )
      throw new ProbeError("SNAPSHOT_MISMATCH");
    const head = quantity(await rpc("eth_blockNumber", []));
    if (head < BigInt(c.blockNumber) + BigInt(c.confirmations))
      throw new ProbeError("INSUFFICIENT_CONFIRMATIONS");
    const byHash = Block.safeParse(
      await rpc("eth_getBlockByHash", [b.hash, false]),
    );
    if (
      !byHash.success ||
      byHash.data.hash !== b.hash ||
      byHash.data.number !== b.number ||
      byHash.data.timestamp !== b.timestamp
    )
      throw new ProbeError("SNAPSHOT_MISMATCH");
    const pinned = { blockHash: b.hash, requireCanonical: true };
    const code = await rpc("eth_getCode", [c.address, pinned]);
    if (typeof code !== "string" || !/^0x([0-9a-f]{2})+$/i.test(code))
      throw new ProbeError("CODE_UNAVAILABLE");
    const storageValue = Hash32.safeParse(
      await rpc("eth_getStorageAt", [c.address, c.storageSlot, pinned]),
    );
    if (!storageValue.success) throw new ProbeError("STORAGE_UNAVAILABLE");
    const last = Block.safeParse(
      await rpc("eth_getBlockByNumber", [blockTag, false]),
    );
    if (
      !last.success ||
      last.data.hash !== b.hash ||
      last.data.number !== b.number ||
      last.data.timestamp !== b.timestamp
    )
      throw new ProbeError("REORG_DETECTED");
    const snapshot = SnapshotSchema.parse({
      chainId: c.chainId,
      blockNumber: c.blockNumber,
      blockHash: b.hash,
      blockTimestamp: quantity(b.timestamp).toString(),
    });
    return {
      status: "ready",
      snapshot,
      codeHash: keccak256(code as Hex),
      storageValue: storageValue.data,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      status: "unknown",
      reason:
        error instanceof ProbeError
          ? error.message
          : error instanceof Error &&
              ["TimeoutError", "AbortError"].includes(error.name)
            ? "RPC_TIMEOUT"
            : "INVALID_INPUT_OR_RPC_FAILURE",
      durationMs: Math.round(performance.now() - started),
    };
  }
}
