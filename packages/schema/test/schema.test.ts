import { zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  deploymentKey,
  eligibilityLeaf,
  hashPolicy,
  hashSnapshot,
  receiptDigest,
  receiptTypedData,
} from "../src/encoding.ts";
import { PolicySchema, SnapshotSchema } from "../src/types.ts";
import { normalizeInventory, validateAcceptance } from "../src/validation.ts";
import {
  fixturePolicy,
  fixtureReceipt,
  fixtureSnapshot,
  testSigner,
} from "./fixtures.ts";

describe("campaign boundary", () => {
  it("rejects unsafe integer inputs, unknown fields and uint overflows", () => {
    for (const grantAmount of [20, "01", "-1", "1.5", (2n ** 256n).toString()])
      expect(
        PolicySchema.safeParse({ ...fixturePolicy, grantAmount }).success,
      ).toBe(false);
    expect(
      PolicySchema.safeParse({ ...fixturePolicy, extra: true }).success,
    ).toBe(false);
    expect(
      PolicySchema.safeParse({ ...fixturePolicy, tokenDecimals: 18 }).success,
    ).toBe(false);
    expect(
      PolicySchema.safeParse({ ...fixturePolicy, eligibleCount: "0" }).success,
    ).toBe(false);
    expect(
      PolicySchema.safeParse({
        ...fixturePolicy,
        grantAmount: ((2n ** 256n - 1n) / 2n).toString(),
      }).success,
    ).toBe(false);
  });
  it("binds every campaign field and preserves fixed-width integer values", () => {
    expect(PolicySchema.parse(fixturePolicy).eligibleCount).toBe("3");
    expect(hashPolicy(fixturePolicy)).not.toBe(
      hashPolicy({ ...fixturePolicy, reviewer: fixtureReceipt.recipient }),
    );
    expect(() =>
      PolicySchema.parse({
        ...fixturePolicy,
        reviewer: fixturePolicy.supplier,
      }),
    ).toThrow();
  });
  it("normalizes inventory ordering but refuses duplicate deployment identities", () => {
    const a = {
      chainId: "11155111",
      entrypoint: fixturePolicy.supplier,
      marketSelector: zeroHash,
      inspectionModuleId: "eip1967-transparent-v1",
      declaredDependencyPath: [],
      expectedAuthorityModel: "owner",
    };
    const b = { ...a, entrypoint: fixturePolicy.reviewer };
    expect(normalizeInventory([a, b])).toEqual(normalizeInventory([b, a]));
    expect(() => normalizeInventory([a, a])).toThrow(/duplicate/i);
    expect(deploymentKey(a.chainId, a.entrypoint, a.marketSelector)).not.toBe(
      deploymentKey("1", a.entrypoint, a.marketSelector),
    );
  });
  it("canonicalizes content without losing unsafe numbers or silently dropping undefined", () => {
    expect(canonicalHash({ b: "2", a: "1" })).toBe(
      canonicalHash({ a: "1", b: "2" }),
    );
    expect(() =>
      canonicalHash({ amount: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() => canonicalHash({ value: undefined })).toThrow();
    expect(() => canonicalHash({ value: Number.NaN })).toThrow();
  });
  it("binds grant entitlement to its chain, deployment and recipient", () => {
    const r = fixtureReceipt;
    expect(
      eligibilityLeaf(
        r.campaignId,
        r.sourceChainId,
        r.deploymentKey,
        r.recipient,
      ),
    ).not.toBe(
      eligibilityLeaf(r.campaignId, "1", r.deploymentKey, r.recipient),
    );
    expect(
      eligibilityLeaf(
        r.campaignId,
        r.sourceChainId,
        r.deploymentKey,
        r.recipient,
      ),
    ).not.toBe(
      eligibilityLeaf(
        r.campaignId,
        r.sourceChainId,
        r.deploymentKey,
        fixturePolicy.supplier,
      ),
    );
  });
  it("rejects invalid snapshot shape and commits its timestamp", () => {
    expect(() =>
      SnapshotSchema.parse({ ...fixtureSnapshot, blockHash: "0x123" }),
    ).toThrow();
    expect(hashSnapshot(fixtureSnapshot)).not.toBe(
      hashSnapshot({ ...fixtureSnapshot, blockTimestamp: "1001" }),
    );
  });
});

describe("receipt verification", () => {
  async function signed(receipt: unknown = fixtureReceipt) {
    return testSigner.signTypedData(receiptTypedData(fixturePolicy, receipt));
  }
  it("accepts an authentic fresh scoped receipt without pretending it proves honest execution", async () => {
    expect(
      await validateAcceptance(fixturePolicy, fixtureReceipt, await signed(), {
        now: 1030n,
      }),
    ).toEqual({ valid: true });
  });
  it("rejects swapped destination chain/contract, evidence and recipient", async () => {
    const signature = await signed();
    for (const receipt of [
      { ...fixtureReceipt, recipient: fixturePolicy.supplier },
      { ...fixtureReceipt, evidenceDigest: zeroHash },
    ])
      expect(
        (
          await validateAcceptance(fixturePolicy, receipt, signature, {
            now: 1030n,
          })
        ).valid,
      ).toBe(false);
    expect(
      receiptDigest(
        { ...fixturePolicy, destinationChainId: "1" },
        fixtureReceipt,
      ),
    ).not.toBe(receiptDigest(fixturePolicy, fixtureReceipt));
    expect(
      receiptDigest(
        { ...fixturePolicy, campaign: fixturePolicy.reviewer },
        fixtureReceipt,
      ),
    ).not.toBe(receiptDigest(fixturePolicy, fixtureReceipt));
  });
  it("rejects a properly signed diagnostic, preview, failed or unknown result", async () => {
    for (const override of [
      { purpose: 0 },
      { mode: 0 },
      { result: 2 },
      { result: 3 },
      { result: 4 },
    ]) {
      const receipt = { ...fixtureReceipt, ...override };
      expect(
        (
          await validateAcceptance(
            fixturePolicy,
            receipt,
            await signed(receipt),
            { now: 1030n },
          )
        ).valid,
      ).toBe(false);
    }
  });
  it("rejects expired, future, stale-snapshot and campaign-expired claims", async () => {
    const signature = await signed();
    for (const now of [999n, 1300n, 2000n])
      expect(
        (
          await validateAcceptance(fixturePolicy, fixtureReceipt, signature, {
            now,
          })
        ).valid,
      ).toBe(false);
    const old = {
      ...fixtureReceipt,
      observedBlockTimestamp: "1",
      snapshotHash: hashSnapshot({ ...fixtureSnapshot, blockTimestamp: "1" }),
    };
    expect(
      (
        await validateAcceptance(fixturePolicy, old, await signed(old), {
          now: 1030n,
        })
      ).valid,
    ).toBe(false);
  });
  it("rejects wrong policy, signer, inconsistent snapshot and reused receipt", async () => {
    const signature = await signed();
    const wrongSigner = privateKeyToAccount(`0x${"02".repeat(32)}`);
    expect(
      (
        await validateAcceptance(
          fixturePolicy,
          fixtureReceipt,
          await wrongSigner.signTypedData(
            receiptTypedData(fixturePolicy, fixtureReceipt),
          ),
          { now: 1030n },
        )
      ).valid,
    ).toBe(false);
    for (const receipt of [
      { ...fixtureReceipt, campaignPolicyHash: `0x${"88".repeat(32)}` },
      { ...fixtureReceipt, observedBlockNumber: "9" },
    ])
      expect(
        (
          await validateAcceptance(
            fixturePolicy,
            receipt,
            await signed(receipt),
            { now: 1030n },
          )
        ).valid,
      ).toBe(false);
    expect(
      (
        await validateAcceptance(fixturePolicy, fixtureReceipt, signature, {
          now: 1030n,
          consumedReceiptIds: new Set([fixtureReceipt.receiptId]),
        })
      ).valid,
    ).toBe(false);
  });
});

it("normalizes stored replay IDs before comparing signed bytes32 values", async () => {
  const receipt = { ...fixtureReceipt, receiptId: `0x${"ab".repeat(32)}` };
  const signature = await testSigner.signTypedData(
    receiptTypedData(fixturePolicy, receipt),
  );
  expect(
    await validateAcceptance(fixturePolicy, receipt, signature, {
      now: 1030n,
      consumedReceiptIds: new Set([`0x${"AB".repeat(32)}`]),
    }),
  ).toEqual({ valid: false, reason: "REPLAYED_RECEIPT" });
});
