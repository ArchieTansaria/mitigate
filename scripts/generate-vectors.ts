import { readFile, writeFile } from "node:fs/promises";
import { zeroHash } from "viem";
import {
  canonicalHash,
  deploymentKey,
  eligibilityLeaf,
  hashPolicy,
  hashSnapshot,
  receiptDigest,
  receiptTypedData,
} from "../packages/schema/src/encoding.ts";
import {
  fixturePolicy,
  fixtureReceipt,
  fixtureSnapshot,
  testSigner,
} from "../packages/schema/test/fixtures.ts";

const vector = {
  schemaVersion: 1,
  warning:
    "TEST FIXTURES ONLY. Addresses are not live deployments; signatures use a disposable test key.",
  policy: fixturePolicy,
  snapshot: fixtureSnapshot,
  receipt: fixtureReceipt,
  signer: testSigner.address,
  signature: await testSigner.signTypedData(
    receiptTypedData(fixturePolicy, fixtureReceipt),
  ),
  expected: {
    policyHash: hashPolicy(fixturePolicy),
    snapshotHash: hashSnapshot(fixtureSnapshot),
    deploymentKey: deploymentKey(
      fixturePolicy.sourceChainId,
      fixturePolicy.supplier,
      zeroHash,
    ),
    eligibilityLeaf: eligibilityLeaf(
      fixtureReceipt.campaignId,
      fixtureReceipt.sourceChainId,
      fixtureReceipt.deploymentKey,
      fixtureReceipt.recipient,
    ),
    receiptDigest: receiptDigest(fixturePolicy, fixtureReceipt),
    canonicalDigest: canonicalHash({ amount: "20000000", schemaVersion: 1 }),
  },
};
const path = "docs/interfaces/pb03-vectors.json";
const output = `${JSON.stringify(vector, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output)
    throw new Error(
      "PB-03 vectors drifted; coordinate the interface change before regenerating",
    );
  console.log("PB-03 vectors match");
} else {
  await writeFile(path, output);
  console.log(`Wrote ${path}`);
}
