import {
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionReturnType,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  type Hex,
  isAddress,
  keccak256,
  parseUnits,
  zeroAddress,
  zeroHash,
} from "viem";
import { campaignAbi } from "./campaign-abi";

export type CampaignPolicy = ContractFunctionReturnType<
  typeof campaignAbi,
  "view",
  "policy"
>;
export type CampaignAccounting = ContractFunctionReturnType<
  typeof campaignAbi,
  "view",
  "accounting"
>;
export type ClaimBundle = {
  schemaVersion: 1;
  receipt: ContractFunctionArgs<
    typeof campaignAbi,
    "nonpayable",
    "submitClaim"
  >[0];
  signature: Hex;
  eligibilityProof: readonly Hex[];
};
export type CampaignConfig = { rpcUrl: string; chainId: number };
export type CampaignSnapshot = {
  address: Address;
  chainId: number;
  blockNumber: bigint;
  blockHash: Hex;
  timestamp: bigint;
  policy: CampaignPolicy;
  policyHash: Hex;
  registry: Address;
  verifier: Address;
  requiredFunding: bigint;
  active: boolean;
  accounting: CampaignAccounting;
  allowance: bigint | null;
  walletBalance: bigint | null;
};
export type CampaignClaim = {
  key: Hex;
  status: number;
  recipient: Address;
  receiptId: Hex;
  challengeCutoff: bigint;
  withdrawable: bigint;
  challenger: Address;
  reasonHash: Hex;
  reviewDeadline: bigint;
};
export type CampaignAction =
  | { kind: "approve" | "resetAllowance" | "fund"; amount: bigint }
  | { kind: "activate" | "recoverUnallocated" }
  | { kind: "submitClaim"; bundle: ClaimBundle }
  | {
      kind: "finalizeClaim" | "withdrawGrant" | "expireChallenge";
      claim: CampaignClaim;
    }
  | { kind: "challengeClaim"; claim: CampaignClaim; reasonHash: Hex }
  | { kind: "resolveChallenge"; claim: CampaignClaim; award: boolean };
export type CampaignTransaction = {
  to: Address;
  data: Hex;
  value: "0x0";
  title: string;
  detail: string;
};
const ZERO = BigInt(0);
export const claimStatusNames = [
  "No claim",
  "Challenge window",
  "In review",
  "Rejected",
  "Awarded",
  "Withdrawn",
] as const;
export function sameAddress(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return Boolean(
    typeof a === "string" &&
      typeof b === "string" &&
      a.toLowerCase() === b.toLowerCase(),
  );
}
export function campaignAddress(value: string): Address {
  if (!isAddress(value, { strict: true }) || sameAddress(value, zeroAddress))
    throw new Error("Enter a valid nonzero contract address.");
  return getAddress(value);
}
export function hash32(value: unknown, label = "Hash", allowZero = false): Hex {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value) ||
    (!allowZero && value.toLowerCase() === zeroHash)
  )
    throw new Error(`${label} must be a nonzero 32-byte hex value.`);
  return value as Hex;
}
export function readCampaignConfig(
  rpcUrl: string | undefined,
  chain: string | undefined,
): CampaignConfig {
  if (!rpcUrl || !chain)
    throw new Error(
      "Campaign connection unavailable. Configure NEXT_PUBLIC_ARC_RPC_URL and NEXT_PUBLIC_ARC_CHAIN_ID.",
    );
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_ARC_RPC_URL must be a public HTTP(S) RPC URL.",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(
      "Use a public HTTP(S) RPC URL without embedded credentials or a fragment.",
    );
  if (!/^[1-9][0-9]*$/.test(chain) || !Number.isSafeInteger(Number(chain)))
    throw new Error(
      "NEXT_PUBLIC_ARC_CHAIN_ID must be a positive safe integer chain ID.",
    );
  return { rpcUrl: url.toString(), chainId: Number(chain) };
}
export function parseFundingAmount(value: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a positive token amount with at most ${decimals} decimal places.`,
    );
  const amount = parseUnits(value, decimals);
  if (amount <= ZERO || amount >= BigInt(2) ** BigInt(256))
    throw new Error("Amount must fit a positive uint256.");
  return amount;
}
export function tokenAmount(amount: bigint, decimals = 6) {
  return formatUnits(amount, decimals);
}
export function accountingIsValid(a: CampaignAccounting): boolean {
  return (
    Object.values(a).every(
      (value) => typeof value === "bigint" && value >= ZERO,
    ) &&
    a.deposited ===
      a.unallocated + a.reserved + a.awardedUnwithdrawn + a.paid + a.refunded
  );
}
export function actionAvailability(
  s: CampaignSnapshot,
  account: string | null,
  c?: CampaignClaim | null,
) {
  const connected = Boolean(
    account && isAddress(account) && !sameAddress(account, zeroAddress),
  );
  const supplier = connected && sameAddress(account, s.policy.supplier);
  const beforeDeadline = s.timestamp < s.policy.claimDeadline;
  const remaining = s.requiredFunding - s.accounting.deposited;
  return {
    approve: supplier && beforeDeadline && !s.active && remaining > ZERO,
    resetAllowance: supplier && s.allowance !== null && s.allowance > ZERO,
    fund: supplier && beforeDeadline && !s.active && remaining > ZERO,
    activate: supplier && beforeDeadline && !s.active && remaining === ZERO,
    recoverUnallocated:
      supplier && !beforeDeadline && s.accounting.unallocated > ZERO,
    submitClaim:
      connected &&
      s.active &&
      beforeDeadline &&
      s.accounting.unallocated >= s.policy.grantAmount,
    finalizeClaim:
      connected && c?.status === 1 && s.timestamp >= c.challengeCutoff,
    withdrawGrant:
      connected && c?.status === 4 && sameAddress(account, c.recipient),
    challengeClaim:
      connected &&
      (supplier || sameAddress(account, s.policy.challenger)) &&
      c?.status === 1 &&
      s.timestamp < c.challengeCutoff,
    resolveChallenge:
      connected &&
      sameAddress(account, s.policy.reviewer) &&
      c?.status === 2 &&
      s.timestamp < c.reviewDeadline,
    expireChallenge:
      connected && c?.status === 2 && s.timestamp >= c.reviewDeadline,
  };
}
function record(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(data, k))
  )
    throw new Error(`${label} has missing or unsupported fields.`);
  return data;
}
function uint(value: unknown, bits: number, label: string): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    value.length > 78
  )
    throw new Error(
      `${label} must be an unsigned decimal string, never a JSON number.`,
    );
  const parsed = BigInt(value);
  if (parsed >= BigInt(2) ** BigInt(bits))
    throw new Error(`${label} exceeds uint${bits}.`);
  return parsed;
}
const receiptKeys = [
  "campaignId",
  "campaignPolicyHash",
  "sourceChainId",
  "deploymentKey",
  "recipient",
  "snapshotHash",
  "observedBlockNumber",
  "observedBlockHash",
  "observedBlockTimestamp",
  "testPackHash",
  "evidenceDigest",
  "purpose",
  "mode",
  "result",
  "issuedAt",
  "expiresAt",
  "receiptId",
] as const;
/** Strict transport format, then policy/time/snapshot checks. Signature, proof and replay are checked by the onchain verifier before every submission. */
export function parseClaimBundle(
  text: string,
  s: CampaignSnapshot,
): ClaimBundle {
  if (text.length > 65536) throw new Error("Receipt bundle exceeds 64 KiB.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Enter valid receipt bundle JSON.");
  }
  const b = record(
    json,
    ["schemaVersion", "receipt", "signature", "eligibilityProof"],
    "Receipt bundle",
  );
  if (b.schemaVersion !== 1)
    throw new Error("Only receipt bundle schemaVersion 1 is supported.");
  const r = record(b.receipt, receiptKeys, "Receipt");
  if (r.purpose !== 1 || r.mode !== 1 || r.result !== 1)
    throw new Error(
      "Only campaign-claim, deployed, passing receipts qualify (purpose, mode and result must each be 1). Diagnostic and preview reports cannot claim grants.",
    );
  const receipt: ClaimBundle["receipt"] = {
    campaignId: hash32(r.campaignId, "campaignId"),
    campaignPolicyHash: hash32(r.campaignPolicyHash, "campaignPolicyHash"),
    sourceChainId: uint(r.sourceChainId, 256, "sourceChainId"),
    deploymentKey: hash32(r.deploymentKey, "deploymentKey"),
    recipient: campaignAddress(String(r.recipient)),
    snapshotHash: hash32(r.snapshotHash, "snapshotHash"),
    observedBlockNumber: uint(
      r.observedBlockNumber,
      256,
      "observedBlockNumber",
    ),
    observedBlockHash: hash32(r.observedBlockHash, "observedBlockHash"),
    observedBlockTimestamp: uint(
      r.observedBlockTimestamp,
      64,
      "observedBlockTimestamp",
    ),
    testPackHash: hash32(r.testPackHash, "testPackHash"),
    evidenceDigest: hash32(r.evidenceDigest, "evidenceDigest"),
    purpose: 1,
    mode: 1,
    result: 1,
    issuedAt: uint(r.issuedAt, 64, "issuedAt"),
    expiresAt: uint(r.expiresAt, 64, "expiresAt"),
    receiptId: hash32(r.receiptId, "receiptId"),
  };
  if (
    receipt.campaignId.toLowerCase() !== s.policy.campaignId.toLowerCase() ||
    receipt.campaignPolicyHash.toLowerCase() !== s.policyHash.toLowerCase() ||
    receipt.sourceChainId !== s.policy.sourceChainId ||
    receipt.testPackHash.toLowerCase() !== s.policy.testPackHash.toLowerCase()
  )
    throw new Error(
      "Receipt does not match this campaign, immutable policy, source chain or test pack.",
    );
  if (
    receipt.observedBlockNumber === ZERO ||
    receipt.observedBlockTimestamp === ZERO ||
    receipt.observedBlockTimestamp > receipt.issuedAt
  )
    throw new Error("Receipt snapshot is invalid or postdates issuance.");
  const snapshotHash = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint64" },
      ],
      [
        receipt.sourceChainId,
        receipt.observedBlockNumber,
        receipt.observedBlockHash,
        receipt.observedBlockTimestamp,
      ],
    ),
  );
  if (snapshotHash.toLowerCase() !== receipt.snapshotHash.toLowerCase())
    throw new Error(
      "Receipt snapshot hash does not match its observed block fields.",
    );
  if (
    receipt.expiresAt <= receipt.issuedAt ||
    receipt.issuedAt > s.timestamp ||
    s.timestamp > receipt.expiresAt ||
    s.timestamp - receipt.issuedAt > s.policy.maxReceiptAge
  )
    throw new Error(
      "Receipt is expired, not yet valid or exceeds the policy freshness window.",
    );
  if (
    typeof b.signature !== "string" ||
    !/^0x[0-9a-fA-F]{128}(1b|1c)$/i.test(b.signature)
  )
    throw new Error(
      "Signature must be a 65-byte ECDSA signature with v = 27 or 28.",
    );
  if (!Array.isArray(b.eligibilityProof) || b.eligibilityProof.length > 256)
    throw new Error(
      "eligibilityProof must be an array of at most 256 bytes32 hashes.",
    );
  return {
    schemaVersion: 1,
    receipt,
    signature: b.signature as Hex,
    eligibilityProof: b.eligibilityProof.map((h, i) =>
      hash32(h, `Proof ${i}`, true),
    ),
  };
}
export function serializeClaimBundle(bundle: ClaimBundle) {
  return JSON.stringify(bundle, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
export function buildAction(
  s: CampaignSnapshot,
  account: Address,
  action: CampaignAction,
): CampaignTransaction {
  if (!accountingIsValid(s.accounting))
    throw new Error(
      "Campaign accounting is inconsistent. Actions are unavailable.",
    );
  const claim = "claim" in action ? action.claim : undefined;
  if (!actionAvailability(s, account, claim)[action.kind])
    throw new Error(
      "This action is unavailable for the current wallet, campaign state or chain deadline.",
    );
  const target = { to: s.address, value: "0x0" as const };
  const amountLabel = (v: bigint) =>
    `${tokenAmount(v, s.policy.tokenDecimals)} tokens`;
  switch (action.kind) {
    case "approve":
    case "resetAllowance":
    case "fund": {
      const amount = action.kind === "resetAllowance" ? ZERO : action.amount;
      if (
        action.kind !== "resetAllowance" &&
        (amount <= ZERO || amount > s.requiredFunding - s.accounting.deposited)
      )
        throw new Error(
          "Amount must be positive and no more than remaining funding.",
        );
      if (
        action.kind === "fund" &&
        (s.allowance === null ||
          s.walletBalance === null ||
          s.allowance < amount ||
          s.walletBalance < amount)
      )
        throw new Error(
          "Insufficient token allowance or wallet token balance. Approve the amount first.",
        );
      if (action.kind !== "fund")
        return {
          ...target,
          to: s.policy.token,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [s.address, amount],
          }),
          title:
            action.kind === "approve"
              ? "Approve funding"
              : "Reset token allowance",
          detail: `Allow campaign ${s.address} to transfer ${amountLabel(amount)} of token ${s.policy.token}. Approval does not fund or activate the campaign.`,
        };
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "fund",
          args: [amount],
        }),
        title: "Fund campaign",
        detail: `Deposit ${amountLabel(amount)} into the campaign. Activation is a separate transaction.`,
      };
    }
    case "activate":
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "activate",
        }),
        title: "Activate campaign",
        detail:
          "Open this fully funded campaign for eligible claims under its immutable terms.",
      };
    case "recoverUnallocated":
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "recoverUnallocated",
        }),
        title: "Recover unallocated funds",
        detail: `Return the currently unallocated ${amountLabel(s.accounting.unallocated)} to supplier ${s.policy.supplier}. Pending and awarded funds remain protected. The contract determines the amount at execution.`,
      };
    case "submitClaim": {
      const b = parseClaimBundle(serializeClaimBundle(action.bundle), s);
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "submitClaim",
          args: [b.receipt, b.signature, b.eligibilityProof],
        }),
        title: "Submit scoped claim",
        detail: `Reserve ${amountLabel(s.policy.grantAmount)} for ${b.receipt.recipient}, deployment ${b.receipt.deploymentKey}. This starts the challenge window; it does not pay the grant.`,
      };
    }
    case "challengeClaim":
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "challengeClaim",
          args: [action.claim.key, hash32(action.reasonHash, "Reason hash")],
        }),
        title: "Challenge claim",
        detail: `Dispute deployment ${action.claim.key} with evidence reason hash ${action.reasonHash}. Reviewer silence will reject the claim at its fixed deadline.`,
      };
    case "resolveChallenge":
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: "resolveChallenge",
          args: [action.claim.key, action.award],
        }),
        title: action.award ? "Award disputed grant" : "Reject disputed grant",
        detail: `${action.award ? "Award the grant to the fixed recipient" : "Reject the claim and release the reserved grant"} for deployment ${action.claim.key}.`,
      };
    case "finalizeClaim":
    case "withdrawGrant":
    case "expireChallenge":
      return {
        ...target,
        data: encodeFunctionData({
          abi: campaignAbi,
          functionName: action.kind,
          args: [action.claim.key],
        }),
        title: {
          finalizeClaim: "Finalize claim",
          withdrawGrant: "Withdraw grant",
          expireChallenge: "Expire review",
        }[action.kind],
        detail:
          action.kind === "withdrawGrant"
            ? `Pay ${amountLabel(s.policy.grantAmount)} to fixed recipient ${action.claim.recipient}.`
            : action.kind === "expireChallenge"
              ? "Reject the timed-out dispute and release its reserved grant to unallocated funds."
              : "Award the unchallenged claim. The recipient withdraws in a separate transaction.",
      };
  }
}
