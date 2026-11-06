import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import {
  type Abi,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, expect, it } from "vitest";
import { foundryBinary } from "../../../scripts/foundry-binary.ts";
import { probeSnapshot } from "../../../services/verifier/src/probe.ts";
import {
  deploymentKey,
  eligibilityLeaf,
  hashPolicy,
  hashSnapshot,
  policyComponents,
  receiptDigest,
  receiptFields,
  snapshotComponents,
  wireValues,
} from "../src/encoding.ts";
import { fixturePolicy, fixtureReceipt, fixtureSnapshot } from "./fixtures.ts";

let anvil: ChildProcess;
let url: string;
let address: Hex;
let abi: Abi;
const disposableAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
); // Anvil TEST-ONLY account.
beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const bound = server.address();
  if (!bound || typeof bound === "string") throw Error("no port");
  const port = bound.port;
  await new Promise<void>((r) => server.close(() => r()));
  url = `http://127.0.0.1:${port}`;
  anvil = spawn(
    foundryBinary("anvil"),
    ["--host", "127.0.0.1", "--port", String(port), "--silent"],
    { stdio: "ignore" },
  );
  const client = createPublicClient({
    chain: foundry,
    transport: http(url, { retryCount: 0, timeout: 500 }),
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await client.getChainId();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!ready) throw Error("Anvil failed to start");
  const artifact = JSON.parse(
    await readFile(
      "contracts/out/EncodingHarness.sol/EncodingHarness.json",
      "utf8",
    ),
  );
  abi = artifact.abi;
  const wallet = createWalletClient({
    account: disposableAccount,
    chain: foundry,
    transport: http(url),
  });
  const tx = await wallet.deployContract({
    abi,
    bytecode: artifact.bytecode.object as Hex,
  });
  const deployed = await client.waitForTransactionReceipt({ hash: tx });
  if (!deployed.contractAddress) throw Error("deploy failed");
  address = deployed.contractAddress;
});
afterAll(async () => {
  if (anvil && anvil.exitCode === null) {
    const exited = new Promise<void>((r) => anvil.once("exit", () => r()));
    anvil.kill("SIGTERM");
    await exited;
  }
});
it("matches independent Solidity execution against TypeScript and frozen JSON vectors", async () => {
  const client = createPublicClient({ chain: foundry, transport: http(url) });
  const vector = JSON.parse(
    await readFile("docs/interfaces/pb03-vectors.json", "utf8"),
  );
  const call = (functionName: string, args: unknown[]) =>
    client.readContract({ address, abi, functionName, args });
  const policy = wireValues(policyComponents, vector.policy),
    receipt = wireValues(receiptFields, vector.receipt),
    snapshot = wireValues(snapshotComponents, vector.snapshot);
  expect(await call("policyHash", [policy])).toBe(hashPolicy(fixturePolicy));
  expect(hashPolicy(fixturePolicy)).toBe(vector.expected.policyHash);
  expect(await call("snapshotHash", [snapshot])).toBe(
    hashSnapshot(fixtureSnapshot),
  );
  expect(hashSnapshot(fixtureSnapshot)).toBe(vector.expected.snapshotHash);
  expect(
    await call("deploymentKey", [11155111n, fixturePolicy.supplier, zeroHash]),
  ).toBe(deploymentKey("11155111", fixturePolicy.supplier, zeroHash));
  expect(
    await call("eligibilityLeaf", [
      fixtureReceipt.campaignId,
      11155111n,
      fixtureReceipt.deploymentKey,
      fixtureReceipt.recipient,
    ]),
  ).toBe(
    eligibilityLeaf(
      fixtureReceipt.campaignId,
      "11155111",
      fixtureReceipt.deploymentKey,
      fixtureReceipt.recipient,
    ),
  );
  expect(
    await call("receiptDigest", [5042002n, fixturePolicy.campaign, receipt]),
  ).toBe(receiptDigest(fixturePolicy, fixtureReceipt));
  expect(receiptDigest(fixturePolicy, fixtureReceipt)).toBe(
    vector.expected.receiptDigest,
  );
  expect(
    await call("receiptDigest", [1n, fixturePolicy.campaign, receipt]),
  ).not.toBe(vector.expected.receiptDigest);
});
it("reads actual local EVM historical code/storage at an agreed snapshot", async () => {
  const client = createPublicClient({ chain: foundry, transport: http(url) });
  const blockNumber = await client.getBlockNumber();
  await client.request({
    method: "anvil_mine" as never,
    params: ["0x3"] as never,
  });
  const result = await probeSnapshot({
    rpcUrl: url,
    chainId: "31337",
    blockNumber: blockNumber.toString(),
    address,
    storageSlot: zeroHash,
    confirmations: 2,
    timeoutMs: 5000,
    maxResponseBytes: 1048576,
  });
  expect(result.status).toBe("ready");
});
