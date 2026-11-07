import {
  blockNumber,
  bytesToHex,
  CronCapability,
  consensusIdenticalAggregation,
  EVMClient,
  encodeCallMsg,
  getHeader,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  LAST_FINALIZED_BLOCK_NUMBER,
  protoBigIntToBigint,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
} from "viem";
import {
  Address,
  Hash32,
  PolicySchema,
} from "../../../packages/schema/src/types.ts";
import { evaluateEvidence } from "./evaluator.ts";

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const evidenceDigestHeader = "x-evidence-digest";
const registryAbi = parseAbi([
  "function campaignExists(bytes32 campaignId) view returns (bool)",
  "function policyHashOf(bytes32 campaignId) view returns (bytes32)",
  "function isEligible(bytes32 campaignId,uint256 sourceChainId,bytes32 deploymentKey,address recipient,bytes32[] proof) view returns (bool)",
  "function isDeploymentRegistered(bytes32 campaignId,bytes32 deploymentKey) view returns (bool)",
  "function recipientOf(bytes32 campaignId,bytes32 deploymentKey) view returns (address)",
]);
const campaignAbi = parseAbi([
  "function registry() view returns (address)",
  "function policyHash() view returns (bytes32)",
  "function active() view returns (bool)",
]);

export type WorkflowConfig = {
  evidenceUrl: string;
  sourceNetwork: string;
  destinationNetwork: string;
  deploymentKey: string;
  recipient: string;
  eligibilityProof: string[];
  policy: unknown;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fetchEvidence(requester: HTTPSendRequester, url: string): string {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error("UNSAFE_EVIDENCE_URL");
  const response = requester
    .sendRequest({
      url,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "PatchBond-CRE" },
      timeout: "10s",
    })
    .result();
  if (response.statusCode !== 200)
    throw new Error(`EVIDENCE_HTTP_STATUS_${response.statusCode}`);
  if (response.body.length === 0 || response.body.length > MAX_EVIDENCE_BYTES)
    throw new Error("EVIDENCE_SIZE_LIMIT");
  const digest = getHeader(response, evidenceDigestHeader);
  if (
    typeof digest !== "string" ||
    Hash32.parse(digest) !== awaitlessKeccak(response.body)
  )
    throw new Error("EVIDENCE_ARTIFACT_DIGEST_MISMATCH");
  return new TextDecoder().decode(response.body);
}

// CRE WASM's viem keccak helper accepts bytes; keeping digest verification on the received bytes
// matches the API's immutable artifact digest, not a reserialized JSON object.
function awaitlessKeccak(bytes: Uint8Array): Hex {
  return keccak256(bytesToHex(bytes));
}

function readAt(
  client: EVMClient,
  runtime: Runtime<WorkflowConfig>,
  address: string,
  data: Hex,
  height: bigint,
): Hex {
  const call = encodeCallMsg({
    from: "0x0000000000000000000000000000000000000000",
    to: Address.parse(address),
    data,
  });
  const response = client
    .callContract(runtime, { call, blockNumber: blockNumber(height) })
    .result();
  return bytesToHex(response.data);
}

function headerValue(
  header:
    | { blockNumber?: unknown; hash: Uint8Array; timestamp?: unknown }
    | undefined,
) {
  if (header === undefined) throw new Error("MISSING_CHAIN_HEADER");
  if (!header.blockNumber || !header.timestamp || header.hash.length !== 32)
    throw new Error("MISSING_CHAIN_HEADER");
  return {
    number: protoBigIntToBigint(header.blockNumber as never).toString(),
    hash: bytesToHex(header.hash),
    timestamp: BigInt(String(header.timestamp)).toString(),
  };
}

async function run(runtime: Runtime<WorkflowConfig>): Promise<string> {
  const config = runtime.config;
  const policy = PolicySchema.parse(config.policy);
  const sourceNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.sourceNetwork,
    isTestnet: true,
  });
  const destinationNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.destinationNetwork,
    isTestnet: true,
  });
  if (!sourceNetwork || !destinationNetwork)
    throw new Error("UNSUPPORTED_CONFIGURED_NETWORK");
  if (
    BigInt(sourceNetwork.chainId) !== BigInt(policy.sourceChainId) ||
    BigInt(destinationNetwork.chainId) !== BigInt(policy.destinationChainId)
  )
    throw new Error("CONFIGURED_NETWORK_CHAIN_MISMATCH");

  const raw = new HTTPClient()
    .sendRequest(
      runtime,
      (requester) => fetchEvidence(requester, config.evidenceUrl),
      consensusIdenticalAggregation<string>(),
    )()
    .result();
  const signed = JSON.parse(raw) as Record<string, unknown>;
  if (!record(signed.body) || !record(signed.body.snapshot))
    throw new Error("POISONED_EVIDENCE_RESPONSE");
  const snapshot = signed.body.snapshot;
  const source = new EVMClient(sourceNetwork.chainSelector.selector);
  const sourceFinalized = headerValue(
    source
      .headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
      .result().header,
  );
  const observedSource = headerValue(
    source
      .headerByNumber(runtime, {
        blockNumber: blockNumber(BigInt(String(snapshot.blockNumber))),
      })
      .result().header,
  );

  const destination = new EVMClient(destinationNetwork.chainSelector.selector);
  const destinationFinalized = headerValue(
    destination
      .headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER })
      .result().header,
  );
  const campaignAddress = Address.parse(policy.campaign);
  const destinationHeight = BigInt(destinationFinalized.number);
  const registryResult = readAt(
    destination,
    runtime,
    campaignAddress,
    encodeFunctionData({ abi: campaignAbi, functionName: "registry" }),
    destinationHeight,
  );
  const campaignRegistry = Address.parse(
    decodeFunctionResult({
      abi: campaignAbi,
      functionName: "registry",
      data: registryResult,
    }),
  );
  const exists = decodeFunctionResult({
    abi: registryAbi,
    functionName: "campaignExists",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "campaignExists",
        args: [policy.campaignId],
      }),
      destinationHeight,
    ),
  });
  const registryHash = decodeFunctionResult({
    abi: registryAbi,
    functionName: "policyHashOf",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "policyHashOf",
        args: [policy.campaignId],
      }),
      destinationHeight,
    ),
  });
  const campaignHash = decodeFunctionResult({
    abi: campaignAbi,
    functionName: "policyHash",
    data: readAt(
      destination,
      runtime,
      campaignAddress,
      encodeFunctionData({ abi: campaignAbi, functionName: "policyHash" }),
      destinationHeight,
    ),
  });
  const active = decodeFunctionResult({
    abi: campaignAbi,
    functionName: "active",
    data: readAt(
      destination,
      runtime,
      campaignAddress,
      encodeFunctionData({ abi: campaignAbi, functionName: "active" }),
      destinationHeight,
    ),
  });
  const eligible = decodeFunctionResult({
    abi: registryAbi,
    functionName: "isEligible",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "isEligible",
        args: [
          policy.campaignId,
          BigInt(policy.sourceChainId),
          Hash32.parse(config.deploymentKey),
          Address.parse(config.recipient),
          config.eligibilityProof.map((proof) => Hash32.parse(proof)),
        ],
      }),
      destinationHeight,
    ),
  });
  const registered = decodeFunctionResult({
    abi: registryAbi,
    functionName: "isDeploymentRegistered",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "isDeploymentRegistered",
        args: [policy.campaignId, Hash32.parse(config.deploymentKey)],
      }),
      destinationHeight,
    ),
  });
  const registeredRecipient = decodeFunctionResult({
    abi: registryAbi,
    functionName: "recipientOf",
    data: readAt(
      destination,
      runtime,
      campaignRegistry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "recipientOf",
        args: [policy.campaignId, Hash32.parse(config.deploymentKey)],
      }),
      destinationHeight,
    ),
  });
  const report = await evaluateEvidence({
    policyInput: policy,
    evidenceInput: signed,
    requestedDeploymentKey: config.deploymentKey,
    requestedRecipient: config.recipient,
    now: BigInt(destinationFinalized.timestamp),
    facts: {
      campaignExists: exists as boolean,
      registryPolicyHash: registryHash as string,
      campaignPolicyHash: campaignHash as string,
      campaignActive: active as boolean,
      eligible: eligible as boolean,
      deploymentRegistered: registered as boolean,
      registeredRecipient: registeredRecipient as string,
      sourceFinalizedBlock: sourceFinalized,
      observedSourceBlock: observedSource,
    },
  });
  runtime.log(`PATCHBOND_CRE_REPORT ${JSON.stringify(report)}`);
  return JSON.stringify(report);
}

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(() => [
    handler(new CronCapability().trigger({ schedule: "0 */10 * * * *" }), run),
  ]);
}
main();
