import { probeSnapshot } from "./probe.ts";

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
try {
  const result = await probeSnapshot({
    rpcUrl: required("PROBE_RPC_URL"),
    chainId: required("PROBE_CHAIN_ID"),
    blockNumber: required("PROBE_BLOCK_NUMBER"),
    address: required("PROBE_ADDRESS"),
    storageSlot: required("PROBE_STORAGE_SLOT"),
    confirmations: Number(required("PROBE_CONFIRMATIONS")),
    timeoutMs: Number(process.env.PROBE_TIMEOUT_MS ?? "10000"),
    maxResponseBytes: 1048576,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "ready" ? 0 : 1;
} catch {
  console.error(
    "Probe configuration is incomplete; see docs/handoffs/PB-02.md. No endpoint or credentials logged.",
  );
  process.exitCode = 1;
}
