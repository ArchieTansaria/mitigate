import canonicalizeModule from "canonicalize";
import { DiagnosticAttestationSchema } from "./types.ts";

// canonicalize 2.x exposes CommonJS at runtime; its NodeNext declaration wraps the default.
const canonicalize = canonicalizeModule as unknown as (
  value: unknown,
) => string | undefined;

import {
  type AbiParameter,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  parseAbiParameters,
  stringToHex,
} from "viem";
import {
  Address,
  Hash32,
  PolicySchema,
  ReceiptSchema,
  SnapshotSchema,
  UInt,
} from "./types.ts";

export const policyComponents = parseAbiParameters(
  "bytes32 campaignId,address supplier,uint256 sourceChainId,uint256 destinationChainId,address sourceRegistry,address campaign,bytes32 eligibilityRoot,uint256 eligibleCount,uint256 grantAmount,address token,uint8 tokenDecimals,bytes32 repairPolicyHash,bytes32 testPackHash,address verifier,address challenger,address reviewer,uint64 claimDeadline,uint64 challengeWindow,uint64 reviewTimeout,uint64 maxReceiptAge,uint32 confirmations,uint64 evidenceRetention",
);
export const snapshotComponents = parseAbiParameters(
  "uint256 chainId,uint256 blockNumber,bytes32 blockHash,uint64 blockTimestamp",
);
export const receiptFields = [
  { name: "campaignId", type: "bytes32" },
  { name: "campaignPolicyHash", type: "bytes32" },
  { name: "sourceChainId", type: "uint256" },
  { name: "deploymentKey", type: "bytes32" },
  { name: "recipient", type: "address" },
  { name: "snapshotHash", type: "bytes32" },
  { name: "observedBlockNumber", type: "uint256" },
  { name: "observedBlockHash", type: "bytes32" },
  { name: "observedBlockTimestamp", type: "uint64" },
  { name: "testPackHash", type: "bytes32" },
  { name: "evidenceDigest", type: "bytes32" },
  { name: "purpose", type: "uint8" },
  { name: "mode", type: "uint8" },
  { name: "result", type: "uint8" },
  { name: "issuedAt", type: "uint64" },
  { name: "expiresAt", type: "uint64" },
  { name: "receiptId", type: "bytes32" },
] as const;
export const receiptTypes = { AcceptanceReceipt: receiptFields } as const;
export function wireValues(
  fields: readonly AbiParameter[],
  object: Record<string, unknown>,
): unknown[] {
  return fields.map((f) =>
    f.type.startsWith("uint")
      ? BigInt(String(object[f.name ?? ""]))
      : object[f.name ?? ""],
  );
}
export function hashPolicy(input: unknown) {
  const p = PolicySchema.parse(input);
  return keccak256(
    encodeAbiParameters(
      policyComponents as readonly AbiParameter[],
      wireValues(policyComponents, p),
    ),
  );
}
export function hashSnapshot(input: unknown) {
  const s = SnapshotSchema.parse(input);
  return keccak256(
    encodeAbiParameters(
      snapshotComponents as readonly AbiParameter[],
      wireValues(snapshotComponents, s),
    ),
  );
}
export function deploymentKey(
  chainId: string,
  entrypoint: string,
  selector: string,
) {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("uint256,address,bytes32"), [
      BigInt(UInt().parse(chainId)),
      Address.parse(entrypoint),
      Hash32.parse(selector),
    ]),
  );
}
export function eligibilityLeaf(
  campaignId: string,
  chainId: string,
  key: string,
  recipient: string,
) {
  return keccak256(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters("bytes32,uint256,bytes32,address"),
        [
          Hash32.parse(campaignId),
          BigInt(UInt().parse(chainId)),
          Hash32.parse(key),
          Address.parse(recipient),
        ],
      ),
    ),
  );
}
export function receiptTypedData(policyInput: unknown, receiptInput: unknown) {
  const p = PolicySchema.parse(policyInput);
  const r = ReceiptSchema.parse(receiptInput);
  return {
    domain: {
      name: "PatchBond",
      version: "1",
      chainId: BigInt(p.destinationChainId),
      verifyingContract: p.campaign,
    },
    types: receiptTypes,
    primaryType: "AcceptanceReceipt" as const,
    message: {
      ...r,
      sourceChainId: BigInt(r.sourceChainId),
      observedBlockNumber: BigInt(r.observedBlockNumber),
      observedBlockTimestamp: BigInt(r.observedBlockTimestamp),
      issuedAt: BigInt(r.issuedAt),
      expiresAt: BigInt(r.expiresAt),
    },
  };
}
export function receiptDigest(policy: unknown, receipt: unknown) {
  return hashTypedData(receiptTypedData(policy, receipt));
}
function assertJson(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isSafeInteger(value)) return;
  if (typeof value !== "object" || value === null)
    throw new Error("Canonical data must use safe integers or decimal strings");
  if (seen.has(value)) throw new Error("Circular canonical data");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Only plain JSON objects are supported");
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new Error("Sparse arrays are unsupported");
      assertJson(value[i], seen);
    }
  } else {
    for (const entry of Object.values(value)) assertJson(entry, seen);
  }
  seen.delete(value);
}
export function canonicalHash(value: unknown) {
  assertJson(value, new Set());
  const text = canonicalize(value);
  if (text === undefined) throw new Error("No canonical JSON value");
  return keccak256(stringToHex(text));
}

export function diagnosticTypedData(input: unknown) {
  const d = DiagnosticAttestationSchema.parse(input);
  return {
    domain: {
      name: "PatchBondDiagnostic",
      version: "1",
      chainId: BigInt(d.sourceChainId),
      salt: d.verificationScopeId,
    },
    primaryType: "DiagnosticEvidence" as const,
    types: {
      DiagnosticEvidence: [
        { name: "verificationScopeId", type: "bytes32" },
        { name: "sourceChainId", type: "uint256" },
        { name: "evidenceDigest", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
      ],
    } as const,
    message: {
      verificationScopeId: d.verificationScopeId,
      sourceChainId: BigInt(d.sourceChainId),
      evidenceDigest: d.evidenceDigest,
      issuedAt: BigInt(d.issuedAt),
      expiresAt: BigInt(d.expiresAt),
    },
  };
}
