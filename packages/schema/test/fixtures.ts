// Deterministic test-only wallets/amounts. Never used by live configuration.

import { zeroAddress, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deploymentKey, hashPolicy, hashSnapshot } from "../src/encoding.ts";
export const testSigner = privateKeyToAccount(`0x${"01".repeat(32)}`);
export const fixturePolicy = {
  schemaVersion: 1 as const,
  campaignId: `0x${"11".repeat(32)}`,
  supplier: "0x1111111111111111111111111111111111111111",
  sourceChainId: "11155111",
  destinationChainId: "5042002",
  sourceRegistry: zeroAddress,
  campaign: "0x2222222222222222222222222222222222222222",
  eligibilityRoot: `0x${"22".repeat(32)}`,
  eligibleCount: "3",
  grantAmount: "20000000",
  token: "0x3600000000000000000000000000000000000000",
  tokenDecimals: 6,
  repairPolicyHash: `0x${"33".repeat(32)}`,
  testPackHash: `0x${"44".repeat(32)}`,
  verifier: testSigner.address,
  challenger: "0x1111111111111111111111111111111111111111",
  reviewer: "0x3333333333333333333333333333333333333333",
  claimDeadline: "2000",
  challengeWindow: "60",
  reviewTimeout: "120",
  maxReceiptAge: "300",
  confirmations: 2,
  evidenceRetention: "86400",
};
export const fixtureSnapshot = {
  chainId: "11155111",
  blockNumber: "10",
  blockHash: `0x${"55".repeat(32)}`,
  blockTimestamp: "1000",
};
export const fixtureReceipt = {
  schemaVersion: 1 as const,
  campaignId: fixturePolicy.campaignId,
  campaignPolicyHash: hashPolicy(fixturePolicy),
  sourceChainId: fixturePolicy.sourceChainId,
  deploymentKey: deploymentKey("11155111", fixturePolicy.supplier, zeroHash),
  recipient: "0x4444444444444444444444444444444444444444",
  snapshotHash: hashSnapshot(fixtureSnapshot),
  observedBlockNumber: "10",
  observedBlockHash: fixtureSnapshot.blockHash,
  observedBlockTimestamp: "1000",
  testPackHash: fixturePolicy.testPackHash,
  evidenceDigest: `0x${"66".repeat(32)}`,
  purpose: 1,
  mode: 1,
  result: 1,
  issuedAt: "1010",
  expiresAt: "1300",
  receiptId: `0x${"77".repeat(32)}`,
};
