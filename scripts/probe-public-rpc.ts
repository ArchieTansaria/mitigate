import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http, parseAbi, zeroHash } from "viem";
import { probeSnapshot } from "../services/verifier/src/probe.ts";

const targets = [
  {
    name: "arc",
    url: "https://rpc.testnet.arc.io",
    chainId: "5042002",
    address: "0x3600000000000000000000000000000000000000",
  },
  {
    name: "sepolia",
    url:
      process.env.SEPOLIA_RPC_URL ??
      "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: "11155111",
    address: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
  },
] as const;
const results = await Promise.all(
  targets.map(async (target) => {
    try {
      const client = createPublicClient({
        transport: http(target.url, { timeout: 10000, retryCount: 0 }),
      });
      const block = await client.getBlockNumber();
      const blockNumber = (block - 20n).toString();
      const result = await probeSnapshot({
        rpcUrl: target.url,
        chainId: target.chainId,
        blockNumber,
        address: target.address,
        storageSlot: zeroHash,
        confirmations: 2,
        timeoutMs: 20000,
        maxResponseBytes: 1048576,
      });
      const decimals =
        target.name === "arc"
          ? await client.readContract({
              address: target.address,
              abi: parseAbi(["function decimals() view returns (uint8)"]),
              functionName: "decimals",
            })
          : undefined;
      return {
        network: target.name,
        checkedAt: new Date().toISOString(),
        address: target.address,
        ...result,
        ...(decimals === undefined ? {} : { erc20Decimals: decimals }),
      };
    } catch {
      return {
        network: target.name,
        checkedAt: new Date().toISOString(),
        status: "unknown",
        reason: "RPC_UNAVAILABLE",
      };
    }
  }),
);
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/pb02-public-rpc.json",
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status !== "ready")) process.exitCode = 1;
