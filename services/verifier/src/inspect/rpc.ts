import {
  type Abi,
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  parseAbi,
  toHex,
} from "viem";
import {
  type Snapshot,
  SnapshotSchema,
} from "../../../../packages/schema/src/types.ts";
export class ObservationError extends Error {}
export class SnapshotRpc {
  private sequence = 0;
  private count = 0;
  readonly signal: AbortSignal;
  constructor(
    readonly url: string,
    readonly snapshot: Snapshot,
    timeoutMs = 15000,
  ) {
    if (
      !/^https?:$/.test(new URL(url).protocol) ||
      timeoutMs < 1 ||
      timeoutMs > 60000
    )
      throw new ObservationError("INVALID_RPC_CONFIG");
    SnapshotSchema.parse(snapshot);
    this.signal = AbortSignal.timeout(timeoutMs);
  }
  async rpc(method: string, params: unknown[]): Promise<unknown> {
    if (++this.count > 160) throw new ObservationError("RPC_CALL_LIMIT");
    const id = ++this.sequence;
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: this.signal,
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new ObservationError("RPC_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 131072) throw new ObservationError("RPC_RESPONSE_LIMIT");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      message.jsonrpc !== "2.0" ||
      message.id !== id ||
      message.error ||
      !("result" in message)
    )
      throw new ObservationError("RPC_UNAVAILABLE_OR_UNSUPPORTED");
    return message.result;
  }
  get pin() {
    return { blockHash: this.snapshot.blockHash, requireCanonical: true };
  }
  async verify(confirmations: number) {
    if (
      !Number.isInteger(confirmations) ||
      confirmations < 1 ||
      confirmations > 100000
    )
      throw new ObservationError("INVALID_CONFIRMATIONS");
    const chain = await this.rpc("eth_chainId", []);
    if (
      typeof chain !== "string" ||
      BigInt(chain) !== BigInt(this.snapshot.chainId)
    )
      throw new ObservationError("CHAIN_MISMATCH");
    await this.checkCanonical();
    const head = await this.rpc("eth_blockNumber", []);
    if (
      typeof head !== "string" ||
      BigInt(head) < BigInt(this.snapshot.blockNumber) + BigInt(confirmations)
    )
      throw new ObservationError("INSUFFICIENT_CONFIRMATIONS");
  }
  async checkCanonical() {
    const b = (await this.rpc("eth_getBlockByNumber", [
      toHex(BigInt(this.snapshot.blockNumber)),
      false,
    ])) as { hash?: string; number?: string; timestamp?: string } | null;
    if (
      !b?.number ||
      !b.timestamp ||
      b.hash?.toLowerCase() !== this.snapshot.blockHash ||
      BigInt(b.number) !== BigInt(this.snapshot.blockNumber) ||
      BigInt(b.timestamp) !== BigInt(this.snapshot.blockTimestamp)
    )
      throw new ObservationError("SNAPSHOT_MISMATCH");
  }
  async code(address: Address): Promise<Hex> {
    const result = await this.rpc("eth_getCode", [address, this.pin]);
    if (typeof result !== "string" || !/^0x([0-9a-f]{2})*$/i.test(result))
      throw new ObservationError("INVALID_CODE");
    return result.toLowerCase() as Hex;
  }
  async storage(address: Address, slot: Hex): Promise<Hex> {
    const result = await this.rpc("eth_getStorageAt", [
      address,
      slot,
      this.pin,
    ]);
    if (typeof result !== "string" || !/^0x[0-9a-f]{64}$/i.test(result))
      throw new ObservationError("INVALID_STORAGE");
    return result.toLowerCase() as Hex;
  }
  async read(
    address: Address,
    signature: string,
    functionName: string,
  ): Promise<unknown> {
    const abi: Abi = parseAbi([signature] as readonly string[]);
    const data = encodeFunctionData({ abi, functionName });
    const result = await this.rpc("eth_call", [
      { to: address, data, gas: toHex(500000n) },
      this.pin,
    ]);
    if (typeof result !== "string" || !/^0x([0-9a-f]{2})*$/i.test(result))
      throw new ObservationError("INVALID_CALL_RESULT");
    return decodeFunctionResult({ abi, functionName, data: result as Hex });
  }
}
