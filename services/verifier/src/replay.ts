import { canonicalHash } from "../../../packages/schema/src/encoding.ts";
import {
  type SignedEvidence,
  verifySignedEvidence,
} from "./evidence/bundle.ts";
import { loadApprovedPack, runTestPack } from "./runner/oracle.ts";
// Offline replay never signs, issues a receipt, changes a source contract or acquires financial eligibility.
export async function replayEvidence(
  input: unknown,
  trustedSpec: unknown,
  now: bigint,
) {
  const verification = await verifySignedEvidence(input, trustedSpec, now);
  if (!verification.valid) throw new Error("INVALID_EVIDENCE_OR_TRUSTED_SCOPE");
  const signed = input as SignedEvidence,
    pack = await loadApprovedPack();
  if (pack.digest !== signed.body.spec.testPackDigest)
    throw new Error("APPROVED_PACK_UNAVAILABLE");
  const results = [];
  for (const result of signed.body.results) {
    if (result.runner.trace.harnessHash !== pack.harnessHash)
      throw new Error("RUNNER_VERSION_MISMATCH");
    const replay = await runTestPack({
      inspection: result.inspection,
      manifest: signed.body.manifest,
      pack,
    });
    const matched = canonicalHash(replay) === canonicalHash(result.runner);
    results.push({
      deploymentKey: result.deploymentKey,
      matched,
      status: replay.status,
    });
  }
  return {
    schemaVersion: 1,
    runId: signed.body.runId,
    matched: results.every((r) => r.matched && r.status === "completed"),
    claimEligible: false,
    executionKind: "offline-evidence-replay",
    results,
  };
}
