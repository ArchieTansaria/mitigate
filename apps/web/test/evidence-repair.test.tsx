import { describe, expect, it } from "vitest";
import {
  repairReceipt,
  submitValidatedRepair,
} from "../app/dashboard/runs/[id]/repair-execution";

const hash = `0x${"11".repeat(32)}`;
const authority = `0x${"22".repeat(20)}`;
const target = `0x${"33".repeat(20)}`;
const proposal = {
  schemaVersion: 1,
  operation: "configure",
  chainId: "31337",
  deploymentKey: hash,
  manifestDigest: hash,
  snapshot: {
    chainId: "31337",
    blockNumber: "10",
    blockHash: hash,
    blockTimestamp: "1000",
  },
  expiresAt: "1120",
  stateDigest: hash,
  target,
  authority,
  calldata: "0x12345678",
  valueBaseUnits: "0",
  compatibility: { kind: "exact-reviewed-family-layout", digest: hash },
  simulation: { success: true, blockHash: hash, result: "0x" },
  claimEligible: false,
  explanation: "test-only repair",
};

function harness(
  options: {
    invalid?: boolean;
    simulation?: string;
    chain?: string;
    account?: string;
    now?: () => number;
    reject?: boolean;
  } = {},
) {
  const events: string[] = [],
    transactions: unknown[] = [];
  const request = async ({
    method,
    params,
  }: {
    method: string;
    params?: unknown[];
  }) => {
    events.push(method);
    switch (method) {
      case "eth_accounts":
        return [options.account ?? authority];
      case "eth_chainId":
        return options.chain ?? "0x7a69";
      case "wallet_switchEthereumChain":
        return null;
      case "eth_getCode":
        return "0x";
      case "eth_call":
        return options.simulation ?? "0x";
      case "eth_sendTransaction":
        transactions.push(params?.[0]);
        if (options.reject) throw new Error("User rejected request");
        return hash;
      default:
        throw new Error(`Unexpected request ${method}`);
    }
  };
  const validate = async () => {
    events.push("server-validate");
    return {
      valid: !options.invalid,
      authority,
      expiresAt: "1120",
      claimEligible: false,
      requiresWalletSimulation: true,
    };
  };
  const submit = () =>
    submitValidatedRepair({
      proposal,
      request,
      validate,
      now: options.now ?? (() => 1100),
    });
  return { submit, transactions, events };
}

describe("owner repair wallet boundary", () => {
  it.each([
    [null, "pending"],
    [{ transactionHash: hash, blockHash: hash, status: "0x1" }, "confirmed"],
    [{ transactionHash: hash, blockHash: hash, status: "0x0" }, "reverted"],
  ] as const)(
    "distinguishes receipt state without declaring a repair pass",
    async (receipt, expected) => {
      const request = async ({ method }: { method: string }) =>
        method === "eth_chainId" ? "0x7a69" : receipt;
      expect(await repairReceipt(request, hash, "31337")).toBe(expected);
    },
  );
  it("rejects receipt identity mismatch and missing receipt outcome", async () => {
    for (const receipt of [
      {
        transactionHash: `0x${"77".repeat(32)}`,
        blockHash: hash,
        status: "0x1",
      },
      { transactionHash: hash, blockHash: hash },
    ]) {
      const request = async ({ method }: { method: string }) =>
        method === "eth_chainId" ? "0x7a69" : receipt;
      await expect(repairReceipt(request, hash, "31337")).rejects.toThrow();
    }
  });
  it("simulates, freshly validates, and submits the exact zero-value owner transaction", async () => {
    const h = harness();
    expect(await h.submit()).toBe(hash);
    expect(h.transactions).toEqual([
      {
        from: authority,
        to: target,
        data: "0x12345678",
        value: "0x0",
        chainId: "0x7a69",
      },
    ]);
    expect(h.events.indexOf("eth_call")).toBeLessThan(
      h.events.lastIndexOf("server-validate"),
    );
    expect(h.events.lastIndexOf("server-validate")).toBeLessThan(
      h.events.indexOf("eth_sendTransaction"),
    );
  });
  it.each([
    { invalid: true },
    { simulation: "0x01" },
    { chain: "0x1" },
    { account: target },
    { now: () => 1120 },
  ])(
    "never submits when validation, simulation, chain, owner or freshness fails: %j",
    async (options) => {
      const h = harness(options);
      await expect(h.submit()).rejects.toThrow();
      expect(h.transactions).toEqual([]);
    },
  );
  it("checks expiry again after asynchronous calls", async () => {
    let calls = 0;
    const h = harness({ now: () => (++calls === 1 ? 1100 : 1120) });
    await expect(h.submit()).rejects.toThrow(/expired/i);
    expect(h.transactions).toEqual([]);
  });
  it("surfaces wallet rejection and never retries transaction submission", async () => {
    const h = harness({ reject: true });
    await expect(h.submit()).rejects.toThrow(/rejected/);
    expect(h.transactions).toHaveLength(1);
  });
});
