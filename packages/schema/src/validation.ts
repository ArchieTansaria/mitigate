import { type Hex, recoverTypedDataAddress } from "viem";
import { z } from "zod";
import {
  canonicalHash,
  deploymentKey,
  hashPolicy,
  hashSnapshot,
  receiptTypedData,
} from "./encoding.ts";
import {
  DeploymentSchema,
  EvidenceSchema,
  Hash32,
  PolicySchema,
  ReceiptSchema,
  VerificationSpecSchema,
} from "./types.ts";

export function normalizeInventory(input: unknown) {
  const rows = z
    .array(DeploymentSchema)
    .min(1)
    .max(1000)
    .parse(input)
    .map((d) => ({
      ...d,
      deploymentKey: deploymentKey(d.chainId, d.entrypoint, d.marketSelector),
    }))
    .sort((a, b) => a.deploymentKey.localeCompare(b.deploymentKey));
  if (new Set(rows.map((d) => d.deploymentKey)).size !== rows.length)
    throw new Error("Duplicate deployment identity");
  return {
    schemaVersion: 1 as const,
    deployments: rows,
    digest: canonicalHash(rows),
  };
}
export async function validateAcceptance(
  policyInput: unknown,
  receiptInput: unknown,
  signature: Hex,
  context: { now: bigint; consumedReceiptIds?: ReadonlySet<string> },
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const fail = (reason: string) => ({ valid: false as const, reason });
  try {
    const p = PolicySchema.parse(policyInput);
    const r = ReceiptSchema.parse(receiptInput);
    if (r.purpose !== 1 || r.mode !== 1 || r.result !== 1)
      return fail("NOT_DEPLOYED_CAMPAIGN_PASS");
    if (
      r.campaignId !== p.campaignId ||
      r.campaignPolicyHash !== hashPolicy(p) ||
      r.sourceChainId !== p.sourceChainId ||
      r.testPackHash !== p.testPackHash
    )
      return fail("SCOPE_MISMATCH");
    if (
      r.snapshotHash !==
      hashSnapshot({
        chainId: r.sourceChainId,
        blockNumber: r.observedBlockNumber,
        blockHash: r.observedBlockHash,
        blockTimestamp: r.observedBlockTimestamp,
      })
    )
      return fail("SNAPSHOT_MISMATCH");
    const issued = BigInt(r.issuedAt),
      expires = BigInt(r.expiresAt),
      observed = BigInt(r.observedBlockTimestamp),
      age = BigInt(p.maxReceiptAge);
    if (
      observed > issued ||
      issued > context.now ||
      expires <= context.now ||
      expires <= issued ||
      expires - issued > age ||
      context.now - observed > age ||
      context.now >= BigInt(p.claimDeadline)
    )
      return fail("STALE_OR_FUTURE_EVIDENCE");
    if (
      context.consumedReceiptIds &&
      [...context.consumedReceiptIds].some(
        (id) => Hash32.parse(id) === r.receiptId,
      )
    )
      return fail("REPLAYED_RECEIPT");
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature))
      return fail("INVALID_SIGNATURE");
    const signer = await recoverTypedDataAddress({
      ...receiptTypedData(p, r),
      signature,
    });
    if (signer.toLowerCase() !== p.verifier.toLowerCase())
      return fail("WRONG_SIGNER");
    return { valid: true };
  } catch {
    return fail("INVALID_INPUT_OR_SIGNATURE");
  }
}

// Structural completeness only: the trusted evaluator must still execute the approved test pack.
// Callers load spec from their authoritative store, never from an untrusted report override.
export function validateEvidenceCoverage(
  specInput: unknown,
  evidenceInput: unknown,
  now: bigint,
): { completePass: boolean; reason?: string } {
  try {
    const s = VerificationSpecSchema.parse(specInput),
      e = EvidenceSchema.parse(evidenceInput);
    if (
      e.verificationScopeId !== s.verificationScopeId ||
      e.snapshot.chainId !== s.sourceChainId ||
      e.inventoryHash !== s.inventoryDigest ||
      e.manifestHash !== s.manifestDigest ||
      e.testPackHash !== s.testPackDigest
    )
      return { completePass: false, reason: "SCOPE_MISMATCH" };
    const time = BigInt(e.snapshot.blockTimestamp);
    if (time > now || now - time > BigInt(s.maxSnapshotAge))
      return { completePass: false, reason: "STALE_OR_FUTURE_SNAPSHOT" };
    if (e.mode !== "deployed")
      return { completePass: false, reason: "PREVIEW_ONLY" };
    const expected = new Set(s.requiredAssertionIds);
    if (
      e.assertions.length !== expected.size ||
      e.assertions.some((a) => !expected.has(a.id) || a.outcome !== "pass")
    )
      return {
        completePass: false,
        reason: "INCOMPLETE_OR_NONPASSING_ASSERTIONS",
      };
    return { completePass: true };
  } catch {
    return { completePass: false, reason: "INVALID_EVIDENCE" };
  }
}
