import { readFileSync } from "node:fs";
import {
  type Address,
  encodeAbiParameters,
  keccak256,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { campaignAbi } from "../lib/campaign-abi";
import {
  assertCampaignWallet,
  loadCampaign,
  prepareCampaignAction,
  sendCampaignAction,
} from "../lib/campaign-chain";

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../docs/interfaces/pb03-vectors.json", import.meta.url),
    "utf8",
  ),
);
const entry = campaignAbi.find(
  (e) => e.type === "function" && e.name === "policy",
);
if (!entry) throw new Error("Policy ABI missing");
const policy = Object.fromEntries(
  entry.outputs[0].components.map((field) => [
    field.name,
    field.type.startsWith("uint")
      ? /uint(8|32)$/.test(field.type)
        ? Number(vectors.policy[field.name])
        : BigInt(vectors.policy[field.name])
      : vectors.policy[field.name],
  ]),
);
const policyHash = keccak256(
  encodeAbiParameters(entry.outputs, [policy as never]),
);
const supplier = vectors.policy.supplier as Address;
const config = { rpcUrl: "https://public.example.com", chainId: 5042002 };
const registry = "0x9999999999999999999999999999999999999999";
const hash = `0x${"a".repeat(64)}`;
function setup() {
  const reads: Record<string, unknown> = {
    policy,
    policyHash,
    policyHashOf: policyHash,
    accounting: {
      deposited: BigInt(60000000),
      unallocated: BigInt(60000000),
      reserved: BigInt(0),
      awardedUnwithdrawn: BigInt(0),
      paid: BigInt(0),
      refunded: BigInt(0),
    },
    active: false,
    requiredFunding: BigInt(60000000),
    registry,
    verifier: "0x8888888888888888888888888888888888888888",
    campaignId: policy.campaignId,
    token: policy.token,
    supplier: policy.supplier,
    decimals: 6,
    allowance: BigInt(0),
    balanceOf: BigInt(0),
  };
  const readContract = vi.fn(async (args: { functionName: string }) => {
    if (!(args.functionName in reads)) throw Error("Unexpected read");
    return reads[args.functionName];
  });
  const getChainId = vi.fn(async () => 5042002);
  const call = vi.fn(async () => ({ data: "0x" }));
  const client = {
    getChainId,
    getBlock: vi.fn(async () => ({
      number: BigInt(20),
      timestamp: BigInt(1000),
      hash,
    })),
    getCode: vi.fn(async () => "0x6000"),
    readContract,
    call,
  } as unknown as PublicClient;
  const request = vi.fn(async ({ method }: { method: string }) =>
    method === "eth_accounts"
      ? [supplier]
      : method === "eth_chainId"
        ? "0x4cef52"
        : hash,
  );
  return {
    client,
    reads,
    readContract,
    getChainId,
    call,
    wallet: { address: supplier, request },
  };
}
describe("campaign RPC and wallet boundary", () => {
  it("pins all reads, checks policy hash, registry and complete accounting", async () => {
    const t = setup();
    const s = await loadCampaign(
      t.client,
      config,
      policy.campaign as string,
      supplier,
    );
    expect(s.policyHash).toBe(policyHash);
    expect(s.blockNumber).toBe(BigInt(20));
    for (const call of t.readContract.mock.calls)
      expect(call[0]).toHaveProperty("blockNumber", BigInt(20));
    t.reads.accounting = { ...s.accounting, paid: BigInt(1) };
    await expect(
      loadCampaign(t.client, config, s.address, supplier),
    ).rejects.toThrow(/accounting/);
  });
  it("refuses RPC chain mismatch and mismatched policies", async () => {
    const t = setup();
    t.getChainId.mockResolvedValueOnce(1);
    await expect(
      loadCampaign(t.client, config, policy.campaign as string),
    ).rejects.toThrow(/RPC chain/);
    expect(t.readContract).not.toHaveBeenCalled();
    t.reads.policyHash = hash;
    await expect(
      loadCampaign(t.client, config, policy.campaign as string),
    ).rejects.toThrow(/bindings/);
  });
  it("requires the selected provider account and configured chain", async () => {
    const t = setup();
    await expect(
      assertCampaignWallet(t.wallet, config, supplier),
    ).resolves.toBeUndefined();
    await expect(
      assertCampaignWallet(t.wallet, { ...config, chainId: 1 }, supplier),
    ).rejects.toThrow(/Switch/);
    await expect(
      assertCampaignWallet(
        { ...t.wallet, address: registry },
        config,
        supplier,
      ),
    ).rejects.toThrow(/changed/);
  });
  it("simulates exact sender/calldata and re-reads before wallet submission", async () => {
    const t = setup();
    const prepared = await prepareCampaignAction(
      t.client,
      config,
      t.wallet,
      policy.campaign as Address,
      { kind: "activate" },
    );
    expect(t.call).toHaveBeenCalledWith({
      account: supplier,
      to: policy.campaign,
      data: prepared.transaction.data,
      value: BigInt(0),
      blockNumber: BigInt(20),
    });
    expect(
      t.wallet.request.mock.calls.some(
        ([args]) => args.method === "eth_sendTransaction",
      ),
    ).toBe(false);
    const count = t.readContract.mock.calls.length;
    expect(await sendCampaignAction(t.client, config, t.wallet, prepared)).toBe(
      hash,
    );
    expect(t.readContract.mock.calls.length).toBeGreaterThan(count);
    expect(t.wallet.request).toHaveBeenCalledWith({
      method: "eth_sendTransaction",
      params: [
        {
          from: supplier,
          to: policy.campaign,
          data: prepared.transaction.data,
          value: "0x0",
          chainId: "0x4cef52",
        },
      ],
    });
  });
  it("blocks state changes between preview and confirmation", async () => {
    const t = setup();
    const prepared = await prepareCampaignAction(
      t.client,
      config,
      t.wallet,
      policy.campaign as Address,
      { kind: "activate" },
    );
    t.reads.active = true;
    await expect(
      sendCampaignAction(t.client, config, t.wallet, prepared),
    ).rejects.toThrow(/unavailable/);
    expect(
      t.wallet.request.mock.calls.some(
        ([args]) => args.method === "eth_sendTransaction",
      ),
    ).toBe(false);
  });
  it("never proposes a reverted simulation to a wallet", async () => {
    const t = setup();
    t.call.mockRejectedValueOnce(new Error("Execution reverted"));
    await expect(
      prepareCampaignAction(
        t.client,
        config,
        t.wallet,
        policy.campaign as Address,
        { kind: "activate" },
      ),
    ).rejects.toThrow(/reverted/);
    expect(
      t.wallet.request.mock.calls.some(
        ([args]) => args.method === "eth_sendTransaction",
      ),
    ).toBe(false);
  });
});
