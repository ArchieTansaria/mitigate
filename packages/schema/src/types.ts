import { getAddress, isAddress, zeroAddress, zeroHash } from "viem";
import { z } from "zod";

export const UInt = (bits = 256) =>
  z
    .string()
    .max(78)
    .regex(/^(0|[1-9][0-9]*)$/)
    .pipe(
      z
        .string()
        .refine(
          (value) => BigInt(value) < 2n ** BigInt(bits),
          `uint${bits} overflow`,
        ),
    );
export const Hash32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v.toLowerCase() as `0x${string}`);
export const NonzeroHash = Hash32.refine((v) => v !== zeroHash, "zero hash");
export const Address = z
  .string()
  .refine((v) => isAddress(v, { strict: true }), "invalid address")
  .transform((v) => getAddress(v));
export const NonzeroAddress = Address.refine(
  (v) => v !== zeroAddress,
  "zero address",
);
const PositiveUInt = (bits = 256) =>
  UInt(bits).pipe(z.string().refine((v) => BigInt(v) > 0n, "must be positive"));
export const PolicySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    campaignId: NonzeroHash,
    supplier: NonzeroAddress,
    sourceChainId: PositiveUInt(),
    destinationChainId: PositiveUInt(),
    sourceRegistry: Address,
    campaign: NonzeroAddress,
    eligibilityRoot: NonzeroHash,
    eligibleCount: PositiveUInt(),
    grantAmount: PositiveUInt(),
    token: NonzeroAddress,
    tokenDecimals: z.literal(6),
    repairPolicyHash: NonzeroHash,
    testPackHash: NonzeroHash,
    verifier: NonzeroAddress,
    challenger: NonzeroAddress,
    reviewer: NonzeroAddress,
    claimDeadline: PositiveUInt(64),
    challengeWindow: PositiveUInt(64),
    reviewTimeout: PositiveUInt(64),
    maxReceiptAge: PositiveUInt(64),
    confirmations: z.number().int().min(1).max(4294967295),
    evidenceRetention: PositiveUInt(64),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      [
        p.eligibleCount,
        p.grantAmount,
        p.claimDeadline,
        p.challengeWindow,
        p.reviewTimeout,
        p.evidenceRetention,
      ].some((v) => !/^(0|[1-9][0-9]*)$/.test(v))
    )
      return;
    if ([p.supplier, p.challenger, p.verifier].includes(p.reviewer))
      issue(
        "reviewer must be independent of supplier, challenger and verifier",
      );
    if (BigInt(p.eligibleCount) * BigInt(p.grantAmount) >= 2n ** 256n)
      issue("total funding overflow");
    if (
      BigInt(p.claimDeadline) +
        BigInt(p.challengeWindow) +
        BigInt(p.reviewTimeout) >=
      2n ** 64n
    )
      issue("deadline overflow");
    if (
      BigInt(p.evidenceRetention) <
      BigInt(p.challengeWindow) + BigInt(p.reviewTimeout)
    )
      issue("evidence retention shorter than review window");
  });
export type Policy = z.infer<typeof PolicySchema>;
export const SnapshotSchema = z.strictObject({
  chainId: PositiveUInt(),
  blockNumber: UInt(),
  blockHash: NonzeroHash,
  blockTimestamp: UInt(64),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const ReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  campaignId: NonzeroHash,
  campaignPolicyHash: NonzeroHash,
  sourceChainId: PositiveUInt(),
  deploymentKey: NonzeroHash,
  recipient: NonzeroAddress,
  snapshotHash: NonzeroHash,
  observedBlockNumber: UInt(),
  observedBlockHash: NonzeroHash,
  observedBlockTimestamp: UInt(64),
  testPackHash: NonzeroHash,
  evidenceDigest: NonzeroHash,
  purpose: z.number().int().min(0).max(1),
  mode: z.number().int().min(0).max(1),
  result: z.number().int().min(0).max(4),
  issuedAt: UInt(64),
  expiresAt: UInt(64),
  receiptId: NonzeroHash,
});
export type Receipt = z.infer<typeof ReceiptSchema>;
export const DeploymentSchema = z.strictObject({
  chainId: PositiveUInt(),
  entrypoint: NonzeroAddress,
  marketSelector: Hash32,
  inspectionModuleId: z.literal("eip1967-transparent-v1"),
  declaredDependencyPath: z.array(NonzeroAddress).max(16),
  expectedAuthorityModel: z.enum(["owner", "multisig", "governance"]),
});
export const AssertionSchema = z.strictObject({
  id: z.string().min(1).max(128),
  outcome: z.enum(["pass", "fail", "unknown", "unsupported"]),
  expected: z.string().max(8192),
  observed: z.string().max(8192),
  evidenceRef: NonzeroHash,
});
const unique = (a: string[]) => new Set(a).size === a.length;
export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1).max(128),
  issueDescription: z.string().min(1).max(8192),
  supportedPatternId: z.literal("eip1967-transparent-v1"),
  sourceChainId: PositiveUInt(),
  approvedImplementationAddress: NonzeroAddress,
  approvedRuntimeCodeHash: NonzeroHash,
  configurationPredicates: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(128),
        readMethod: z.string().min(1).max(256),
        operator: z.enum(["eq", "lte", "gte"]),
        expected: z.string().max(8192),
      }),
    )
    .max(128)
    .refine(
      (a) => unique(a.map((v) => v.id)),
      "duplicate configuration predicates",
    ),
  testPackDigest: NonzeroHash,
  requiredAssertionIds: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(128)
    .refine(unique, "duplicate assertion IDs"),
  prerequisites: z.array(z.string().max(1024)).max(128),
  artifactRefs: z
    .array(z.strictObject({ uri: z.url(), digest: NonzeroHash }))
    .max(128),
});
export const EvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    runId: z.string().min(1).max(128),
    purpose: z.enum(["diagnostic", "campaign-claim"]),
    mode: z.enum(["preview", "deployed"]),
    verificationScopeId: NonzeroHash,
    snapshot: SnapshotSchema,
    inventoryHash: NonzeroHash,
    manifestHash: NonzeroHash,
    testPackHash: NonzeroHash,
    runnerImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    assertions: z
      .array(AssertionSchema)
      .min(1)
      .max(128)
      .refine((a) => unique(a.map((v) => v.id)), "duplicate assertion IDs"),
    deploymentKey: NonzeroHash,
    campaignId: NonzeroHash.optional(),
    campaignPolicyHash: NonzeroHash.optional(),
    recipient: NonzeroAddress.optional(),
    artifactDigests: z.array(NonzeroHash).min(1).max(128),
  })
  .superRefine((e, ctx) => {
    const campaignFields = [e.campaignId, e.campaignPolicyHash, e.recipient];
    if (
      e.purpose === "campaign-claim" &&
      campaignFields.some((v) => v === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "claim evidence requires campaign scope",
      });
    if (
      e.purpose === "diagnostic" &&
      campaignFields.some((v) => v !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "diagnostic evidence must not contain campaign fields",
      });
  });

export const VerificationSpecSchema = z.strictObject({
  schemaVersion: z.literal(1),
  verificationScopeId: NonzeroHash,
  sourceChainId: PositiveUInt(),
  inventoryDigest: NonzeroHash,
  manifestDigest: NonzeroHash,
  testPackDigest: NonzeroHash,
  requiredAssertionIds: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(128)
    .refine(unique, "duplicate required assertions"),
  evaluator: NonzeroAddress,
  maxSnapshotAge: PositiveUInt(64),
  confirmations: z.number().int().min(1).max(4294967295),
});
export const RunRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    verificationScopeId: NonzeroHash,
    inventoryDigest: NonzeroHash,
    manifestDigest: NonzeroHash,
    verificationSpecDigest: NonzeroHash,
    purpose: z.enum(["diagnostic", "campaign-claim"]),
    mode: z.enum(["preview", "deployed"]),
    campaignId: NonzeroHash.optional(),
    campaignPolicyHash: NonzeroHash.optional(),
  })
  .superRefine((r, ctx) => {
    if (
      r.purpose === "campaign-claim" &&
      (!r.campaignId || !r.campaignPolicyHash)
    )
      ctx.addIssue({
        code: "custom",
        message: "claim run requires campaign scope",
      });
    if (r.purpose === "diagnostic" && (r.campaignId || r.campaignPolicyHash))
      ctx.addIssue({
        code: "custom",
        message: "diagnostic run has no financial scope",
      });
  });
export const DiagnosticAttestationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  verificationScopeId: NonzeroHash,
  sourceChainId: PositiveUInt(),
  evidenceDigest: NonzeroHash,
  issuedAt: UInt(64),
  expiresAt: UInt(64),
});
