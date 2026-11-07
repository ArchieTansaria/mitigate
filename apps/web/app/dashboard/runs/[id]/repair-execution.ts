import { repairProposalSchema } from "../../../../lib/evidence";

export type WalletRequest = (request: {
  method: string;
  params?: unknown[];
}) => Promise<unknown>;

/** Never caches validation or retries sending: a lost wallet response may already have submitted. */
export async function submitValidatedRepair({
  proposal: raw,
  request,
  validate,
  now = () => Math.floor(Date.now() / 1000),
  onStage,
}: {
  proposal: unknown;
  request: WalletRequest;
  validate: () => Promise<unknown>;
  now?: () => number;
  onStage?: (
    stage: "checking" | "simulating" | "validating" | "signing",
  ) => void;
}): Promise<string> {
  const proposal = repairProposalSchema.parse(raw);
  const fresh = () => {
    const time = now();
    if (
      !Number.isSafeInteger(time) ||
      time < 0 ||
      BigInt(time) < BigInt(proposal.snapshot.blockTimestamp) ||
      BigInt(time) >= BigInt(proposal.expiresAt)
    )
      throw new Error(
        "Proposal expired or has an invalid timestamp. Run a fresh diagnostic.",
      );
  };
  fresh();
  if (
    BigInt(proposal.chainId) <= 0n ||
    proposal.chainId !== proposal.snapshot.chainId ||
    proposal.simulation.blockHash !== proposal.snapshot.blockHash ||
    /^0x0{40}$/i.test(proposal.authority) ||
    /^0x0{40}$/i.test(proposal.target)
  )
    throw new Error("Proposal chain, snapshot, or authority is invalid.");
  const chainId = `0x${BigInt(proposal.chainId).toString(16)}`;
  async function identity() {
    const accounts = await request({ method: "eth_accounts" });
    if (
      !Array.isArray(accounts) ||
      typeof accounts[0] !== "string" ||
      accounts[0].toLowerCase() !== proposal.authority.toLowerCase()
    )
      throw new Error(
        "The active wallet account must be the proposal authority.",
      );
    const chain = await request({ method: "eth_chainId" });
    if (
      typeof chain !== "string" ||
      !/^0x[0-9a-f]+$/i.test(chain) ||
      BigInt(chain) !== BigInt(proposal.chainId)
    )
      throw new Error(
        "Wallet is on the wrong source chain. Switch networks and retry.",
      );
  }
  onStage?.("checking");
  const chain = await request({ method: "eth_chainId" });
  if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain))
    throw new Error("Wallet did not return a valid chain ID.");
  if (BigInt(chain) !== BigInt(proposal.chainId))
    await request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  await identity();
  if (
    (await request({
      method: "eth_getCode",
      params: [proposal.authority, "latest"],
    })) !== "0x"
  )
    throw new Error(
      "Only an EOA authority without delegated code is supported. Manual review is required.",
    );
  const checkValidation = async () => {
    onStage?.("validating");
    const response = await validate();
    if (!response || typeof response !== "object")
      throw new Error("Server validation is unavailable.");
    const v = response as Record<string, unknown>;
    if (
      v.valid !== true ||
      v.claimEligible !== false ||
      v.requiresWalletSimulation !== true ||
      typeof v.authority !== "string" ||
      v.authority.toLowerCase() !== proposal.authority.toLowerCase() ||
      v.expiresAt !== proposal.expiresAt
    )
      throw new Error(
        "Server did not validate this exact proposal. Refresh the diagnostic and proposal.",
      );
    fresh();
  };
  await checkValidation();
  const transaction = {
    from: proposal.authority,
    to: proposal.target,
    data: proposal.calldata,
    value: "0x0",
    chainId,
  };
  onStage?.("simulating");
  if (
    (await request({ method: "eth_call", params: [transaction, "latest"] })) !==
    "0x"
  )
    throw new Error(
      "Wallet simulation failed or returned an unexpected result. Nothing was submitted.",
    );
  // Revalidate after wallet RPC work; do not reuse the earlier server check as permission to send.
  await checkValidation();
  await identity();
  fresh();
  onStage?.("signing");
  const txHash = await request({
    method: "eth_sendTransaction",
    params: [transaction],
  });
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash))
    throw new Error(
      "Wallet returned no valid transaction hash. Submission status is unknown; inspect your wallet before trying again.",
    );
  return txHash;
}

export async function repairReceipt(
  request: WalletRequest,
  txHash: string,
  chainId: string,
): Promise<"pending" | "confirmed" | "reverted"> {
  const chain = await request({ method: "eth_chainId" });
  if (
    typeof chain !== "string" ||
    !/^0x[0-9a-f]+$/i.test(chain) ||
    BigInt(chain) !== BigInt(chainId)
  )
    throw new Error(
      "Switch your wallet to the repair source chain to check the receipt.",
    );
  const receipt = await request({
    method: "eth_getTransactionReceipt",
    params: [txHash],
  });
  if (receipt === null) return "pending";
  if (!receipt || typeof receipt !== "object")
    throw new Error("Transaction receipt is unavailable.");
  const r = receipt as Record<string, unknown>;
  if (
    typeof r.transactionHash !== "string" ||
    r.transactionHash.toLowerCase() !== txHash.toLowerCase() ||
    typeof r.blockHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(r.blockHash)
  )
    throw new Error("Transaction receipt identity is invalid.");
  if (r.status === "0x1") return "confirmed";
  if (r.status === "0x0") return "reverted";
  throw new Error("Transaction outcome is unknown.");
}
