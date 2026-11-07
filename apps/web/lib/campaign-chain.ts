import {
  type Address,
  createPublicClient,
  encodeAbiParameters,
  erc20Abi,
  type Hex,
  http,
  keccak256,
  type PublicClient,
  toHex,
} from "viem";
import {
  accountingIsValid,
  buildAction,
  type CampaignAction,
  type CampaignClaim,
  type CampaignConfig,
  type CampaignSnapshot,
  type CampaignTransaction,
  campaignAddress,
  hash32,
  sameAddress,
} from "./campaign";
import {
  campaignAbi,
  campaignRegistryAbi,
  campaignVerifierAbi,
} from "./campaign-abi";
export type CampaignWallet = {
  address: string | null;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
export function campaignClient(config: CampaignConfig): PublicClient {
  return createPublicClient({
    transport: http(config.rpcUrl, { timeout: 15000, retryCount: 1 }),
    batch: { multicall: false },
  });
}
/** Every campaign/role/accounting read is pinned to one block. No silent fallback to partial state. */
export async function loadCampaign(
  client: PublicClient,
  config: CampaignConfig,
  input: string,
  account?: string | null,
): Promise<CampaignSnapshot> {
  const address = campaignAddress(input);
  if ((await client.getChainId()) !== config.chainId)
    throw new Error(
      "RPC chain does not match NEXT_PUBLIC_ARC_CHAIN_ID. Campaign actions are unavailable.",
    );
  const block = await client.getBlock();
  const blockNumber = block.number;
  if (blockNumber === null || !block.hash)
    throw new Error("RPC did not return a mined block.");
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === "0x")
    throw new Error(
      "No contract exists at this address on the configured chain.",
    );
  const read = { address, abi: campaignAbi, blockNumber };
  const [
    policy,
    policyHash,
    accounting,
    active,
    requiredFunding,
    registry,
    verifier,
    campaignId,
    token,
    supplier,
  ] = await Promise.all([
    client.readContract({ ...read, functionName: "policy" }),
    client.readContract({ ...read, functionName: "policyHash" }),
    client.readContract({ ...read, functionName: "accounting" }),
    client.readContract({ ...read, functionName: "active" }),
    client.readContract({ ...read, functionName: "requiredFunding" }),
    client.readContract({ ...read, functionName: "registry" }),
    client.readContract({ ...read, functionName: "verifier" }),
    client.readContract({ ...read, functionName: "campaignId" }),
    client.readContract({ ...read, functionName: "token" }),
    client.readContract({ ...read, functionName: "supplier" }),
  ]);
  const policyFunction = campaignAbi.find(
    (f) => f.type === "function" && f.name === "policy",
  );
  if (!policyFunction) throw new Error("Policy ABI unavailable.");
  const computed = keccak256(
    encodeAbiParameters(policyFunction.outputs, [policy]),
  );
  if (
    !sameAddress(policy.campaign, address) ||
    policy.destinationChainId !== BigInt(config.chainId) ||
    computed.toLowerCase() !== policyHash.toLowerCase() ||
    campaignId !== policy.campaignId ||
    !sameAddress(token, policy.token) ||
    !sameAddress(supplier, policy.supplier)
  )
    throw new Error(
      "Contract policy bindings are inconsistent. Actions are unavailable.",
    );
  if (
    !accountingIsValid(accounting) ||
    policy.eligibleCount * policy.grantAmount !== requiredFunding ||
    accounting.deposited > requiredFunding ||
    (active && accounting.deposited !== requiredFunding)
  )
    throw new Error(
      "Contract funding or accounting invariant failed. Actions are unavailable.",
    );
  const [decimals, registryHash, verifierRegistry, allowance, walletBalance] =
    await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        address: registry,
        abi: campaignRegistryAbi,
        functionName: "policyHashOf",
        args: [campaignId],
        blockNumber,
      }),
      client.readContract({
        address: verifier,
        abi: campaignVerifierAbi,
        functionName: "registry",
        blockNumber,
      }),
      account
        ? client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [campaignAddress(account), address],
            blockNumber,
          })
        : Promise.resolve(null),
      account
        ? client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [campaignAddress(account)],
            blockNumber,
          })
        : Promise.resolve(null),
    ]);
  if (
    decimals !== 6 ||
    decimals !== policy.tokenDecimals ||
    registryHash.toLowerCase() !== policyHash.toLowerCase() ||
    !sameAddress(verifierRegistry, registry)
  )
    throw new Error(
      "Token decimals, registry or verifier binding is unsupported or inconsistent.",
    );
  const confirmedBlock = await client.getBlock({ blockNumber });
  if (confirmedBlock.hash !== block.hash)
    throw new Error("Chain reorganized while reading. Refresh before acting.");
  return {
    address,
    chainId: config.chainId,
    blockNumber,
    blockHash: block.hash,
    timestamp: block.timestamp,
    policy,
    policyHash,
    registry,
    verifier,
    requiredFunding,
    accounting,
    active,
    allowance,
    walletBalance,
  };
}
export async function loadCampaignClaim(
  client: PublicClient,
  s: CampaignSnapshot,
  key: string,
): Promise<CampaignClaim> {
  const deploymentKey = hash32(key, "Deployment key");
  const read = {
    address: s.address,
    abi: campaignAbi,
    blockNumber: s.blockNumber,
  };
  const [claim, challenge] = await Promise.all([
    client.readContract({
      ...read,
      functionName: "claimOf",
      args: [deploymentKey],
    }),
    client.readContract({
      ...read,
      functionName: "challengeOf",
      args: [deploymentKey],
    }),
  ]);
  if (claim[0] > 5) throw new Error("Unsupported claim status.");
  return {
    key: deploymentKey,
    status: claim[0],
    recipient: claim[1],
    receiptId: claim[2],
    challengeCutoff: claim[3],
    withdrawable: claim[4],
    challenger: challenge[0],
    reasonHash: challenge[1],
    reviewDeadline: challenge[2],
  };
}
export async function assertCampaignWallet(
  wallet: CampaignWallet,
  config: CampaignConfig,
  expected: Address,
): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    wallet.request({ method: "eth_accounts" }),
    wallet.request({ method: "eth_chainId" }),
  ]);
  if (
    !Array.isArray(accounts) ||
    !sameAddress(accounts[0], expected) ||
    !sameAddress(wallet.address, expected)
  )
    throw new Error(
      "Wallet account changed. Reconnect and review the action again.",
    );
  if (
    typeof chainId !== "string" ||
    !/^0x[0-9a-f]+$/i.test(chainId) ||
    BigInt(chainId) !== BigInt(config.chainId)
  )
    throw new Error(
      `Switch your wallet to chain ${config.chainId} before continuing.`,
    );
}
export type PreparedCampaignAction = {
  action: CampaignAction;
  transaction: CampaignTransaction;
  account: Address;
  snapshot: CampaignSnapshot;
};
export async function prepareCampaignAction(
  client: PublicClient,
  config: CampaignConfig,
  wallet: CampaignWallet,
  address: Address,
  action: CampaignAction,
): Promise<PreparedCampaignAction> {
  const account = campaignAddress(wallet.address ?? "");
  await assertCampaignWallet(wallet, config, account);
  const snapshot = await loadCampaign(client, config, address, account);
  let freshAction = action;
  if ("claim" in action)
    freshAction = {
      ...action,
      claim: await loadCampaignClaim(client, snapshot, action.claim.key),
    };
  const transaction = buildAction(snapshot, account, freshAction);
  if (freshAction.kind === "submitClaim") {
    const b = freshAction.bundle;
    await client.readContract({
      address: snapshot.verifier,
      abi: campaignVerifierAbi,
      functionName: "validateReceipt",
      args: [b.receipt, b.signature, b.eligibilityProof],
      blockNumber: snapshot.blockNumber,
    });
  }
  // Simulate the precise calldata with the actual sender. Reverts remain unavailable, never treated as approval.
  await client.call({
    account,
    to: transaction.to,
    data: transaction.data,
    value: BigInt(0),
    blockNumber: snapshot.blockNumber,
  });
  return { action: freshAction, transaction, account, snapshot };
}
export async function sendCampaignAction(
  client: PublicClient,
  config: CampaignConfig,
  wallet: CampaignWallet,
  prepared: PreparedCampaignAction,
): Promise<Hex> {
  await assertCampaignWallet(wallet, config, prepared.account);
  const fresh = await prepareCampaignAction(
    client,
    config,
    wallet,
    prepared.snapshot.address,
    prepared.action,
  );
  if (
    fresh.transaction.to !== prepared.transaction.to ||
    fresh.transaction.data !== prepared.transaction.data
  )
    throw new Error("Transaction changed. Review it again before signing.");
  await assertCampaignWallet(wallet, config, prepared.account);
  const hash = await wallet.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: prepared.account,
        to: fresh.transaction.to,
        data: fresh.transaction.data,
        value: "0x0",
        chainId: toHex(config.chainId),
      },
    ],
  });
  return hash32(hash, "Transaction hash");
}
/** Avoid leaking credential-bearing RPC URLs or verbose provider payloads into the UI. */
export function campaignError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 4001
  )
    return "Wallet request declined. No transaction was submitted by this request.";
  if (error instanceof Error) {
    if (
      /https?:\/\/|request body|rpc request|fetch|HTTP request|timeout/i.test(
        error.message,
      )
    )
      return "RPC or wallet request unavailable. Check the connection and refresh. If a transaction hash is shown, check its receipt before retrying.";
    return error.message.split("\n")[0].slice(0, 300);
  }
  return "Unable to complete this request. Refresh chain state before retrying.";
}
