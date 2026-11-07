import { decodeFunctionData, encodeAbiParameters, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import {
  accountingIsValid,
  actionAvailability,
  buildAction,
  type CampaignSnapshot,
  parseClaimBundle,
  parseFundingAmount,
  readCampaignConfig,
} from "../lib/campaign";
import { campaignAbi } from "../lib/campaign-abi";

const address = (n: string) => `0x${n.repeat(40)}` as `0x${string}`;
const hash = (n: string) => `0x${n.repeat(64)}` as `0x${string}`;
export const snapshot = {
  address: address("1"),
  chainId: 5042002,
  blockNumber: BigInt(7),
  blockHash: hash("a"),
  timestamp: BigInt(100),
  active: true,
  policyHash: hash("b"),
  verifier: address("8"),
  registry: address("9"),
  requiredFunding: BigInt(20000000),
  policy: {
    campaignId: hash("c"),
    campaign: address("1"),
    supplier: address("2"),
    challenger: address("3"),
    reviewer: address("4"),
    token: address("5"),
    tokenDecimals: 6,
    sourceChainId: BigInt(11155111),
    destinationChainId: BigInt(5042002),
    grantAmount: BigInt(10000000),
    eligibleCount: BigInt(2),
    claimDeadline: BigInt(200),
    maxReceiptAge: BigInt(60),
    testPackHash: hash("d"),
  },
  accounting: {
    deposited: BigInt(20000000),
    unallocated: BigInt(10000000),
    reserved: BigInt(10000000),
    awardedUnwithdrawn: BigInt(0),
    paid: BigInt(0),
    refunded: BigInt(0),
  },
  allowance: BigInt(0),
  walletBalance: BigInt(0),
} as CampaignSnapshot;
function bundle() {
  const receipt = {
    campaignId: hash("c"),
    campaignPolicyHash: hash("b"),
    sourceChainId: "11155111",
    deploymentKey: hash("e"),
    recipient: address("6"),
    snapshotHash: "",
    observedBlockNumber: "1",
    observedBlockHash: hash("f"),
    observedBlockTimestamp: "80",
    testPackHash: hash("d"),
    evidenceDigest: hash("a"),
    purpose: 1,
    mode: 1,
    result: 1,
    issuedAt: "90",
    expiresAt: "150",
    receiptId: hash("1"),
  };
  receipt.snapshotHash = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint64" },
      ],
      [BigInt(11155111), BigInt(1), hash("f"), BigInt(80)],
    ),
  );
  return {
    schemaVersion: 1,
    receipt,
    signature: `0x${"1".repeat(128)}1b`,
    eligibilityProof: [],
  };
}
describe("campaign amounts and configuration", () => {
  it("never loses integer base units above Number.MAX_SAFE_INTEGER", () => {
    expect(parseFundingAmount("9007199254.740993", 6)).toBe(
      BigInt("9007199254740993"),
    );
    for (const v of ["1e6", "-1", "0", "1.0000001", "1,000", " 1 "])
      expect(() => parseFundingAmount(v, 6)).toThrow();
  });
  it("checks every accounting bucket exactly", () => {
    expect(accountingIsValid(snapshot.accounting)).toBe(true);
    expect(accountingIsValid({ ...snapshot.accounting, paid: BigInt(1) })).toBe(
      false,
    );
  });
  it("requires explicit public RPC and chain ID", () => {
    expect(() => readCampaignConfig(undefined, undefined)).toThrow(
      /NEXT_PUBLIC/,
    );
    expect(() =>
      readCampaignConfig("https://user:secret@example.com", "5042002"),
    ).toThrow();
    expect(() => readCampaignConfig("https://example.com", "1.5")).toThrow();
    expect(readCampaignConfig("https://example.com", "5042002").chainId).toBe(
      5042002,
    );
  });
});
describe("campaign roles and exact deadlines", () => {
  const pending = {
    key: hash("e"),
    status: 1,
    recipient: address("6"),
    receiptId: hash("1"),
    challengeCutoff: BigInt(100),
    reviewDeadline: BigInt(120),
    withdrawable: BigInt(0),
    challenger: address("0"),
    reasonHash: hash("0"),
  };
  it("allows public finalization at the cutoff, never challenge", () => {
    const gates = actionAvailability(snapshot, address("2"), pending);
    expect(gates.finalizeClaim).toBe(true);
    expect(gates.challengeClaim).toBe(false);
    expect(
      actionAvailability(
        { ...snapshot, timestamp: BigInt(99) },
        address("3"),
        pending,
      ).challengeClaim,
    ).toBe(true);
    expect(
      actionAvailability(
        { ...snapshot, timestamp: BigInt(99) },
        address("7"),
        pending,
      ).challengeClaim,
    ).toBe(false);
  });
  it("gates review, timeout, withdrawal and recovery by chain state", () => {
    const disputed = { ...pending, status: 2 };
    expect(
      actionAvailability(snapshot, address("4"), disputed).resolveChallenge,
    ).toBe(true);
    expect(
      actionAvailability(snapshot, address("2"), disputed).resolveChallenge,
    ).toBe(false);
    expect(
      actionAvailability(
        { ...snapshot, timestamp: BigInt(120) },
        address("4"),
        disputed,
      ).resolveChallenge,
    ).toBe(false);
    expect(
      actionAvailability(
        { ...snapshot, timestamp: BigInt(120) },
        address("7"),
        disputed,
      ).expireChallenge,
    ).toBe(true);
    expect(
      actionAvailability(snapshot, address("7"), { ...pending, status: 4 })
        .withdrawGrant,
    ).toBe(false);
    expect(
      actionAvailability(snapshot, address("6"), { ...pending, status: 4 })
        .withdrawGrant,
    ).toBe(true);
    expect(
      actionAvailability({ ...snapshot, timestamp: BigInt(200) }, address("2"))
        .recoverUnallocated,
    ).toBe(true);
    expect(
      actionAvailability({ ...snapshot, timestamp: BigInt(200) }, address("7"))
        .recoverUnallocated,
    ).toBe(false);
    expect(
      Object.values(actionAvailability(snapshot, null, pending)).every(
        (v) => !v,
      ),
    ).toBe(true);
  });
  it("encodes real ABI arguments and rejects unauthorized proposals", () => {
    const request = buildAction(snapshot, address("7"), {
      kind: "finalizeClaim",
      claim: pending,
    });
    expect(
      decodeFunctionData({ abi: campaignAbi, data: request.data }),
    ).toEqual({ functionName: "finalizeClaim", args: [pending.key] });
    expect(() =>
      buildAction(snapshot, address("7"), {
        kind: "withdrawGrant",
        claim: { ...pending, status: 4 },
      }),
    ).toThrow();
    expect(() =>
      buildAction({ ...snapshot, timestamp: BigInt(99) }, address("2"), {
        kind: "challengeClaim",
        claim: pending,
        reasonHash: hash("0"),
      }),
    ).toThrow();
  });
});
describe("strict scoped receipt input", () => {
  it("preserves uint fields as bigint and proof order", () => {
    const parsed = parseClaimBundle(JSON.stringify(bundle()), snapshot);
    expect(parsed.receipt.observedBlockNumber).toBe(BigInt(1));
    expect(parsed.eligibilityProof).toEqual([]);
  });
  it.each(["purpose", "mode", "result"])(
    "rejects non-qualifying %s",
    (field) => {
      const value = bundle();
      (value.receipt as Record<string, unknown>)[field] = 0;
      expect(() => parseClaimBundle(JSON.stringify(value), snapshot)).toThrow();
    },
  );
  it("rejects unsafe numbers, unknown fields, wrong scope, bad snapshots and stale receipts", () => {
    for (const patch of [
      { sourceChainId: 11155111 },
      { issuedAt: "-1" },
      { expiresAt: "18446744073709551616" },
      { campaignPolicyHash: hash("9") },
      { snapshotHash: hash("0") },
      { issuedAt: "1" },
      { diagnostic: true },
    ]) {
      const value = bundle();
      Object.assign(value.receipt, patch);
      expect(() => parseClaimBundle(JSON.stringify(value), snapshot)).toThrow();
    }
    expect(() =>
      parseClaimBundle(
        JSON.stringify({ ...bundle(), schemaVersion: 2 }),
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      parseClaimBundle(
        JSON.stringify({ ...bundle(), signature: "0x1234" }),
        snapshot,
      ),
    ).toThrow();
  });
});
