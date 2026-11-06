import {
  type Address,
  encodeFunctionData,
  getAddress,
  type PublicClient,
  parseAbi,
  toHex,
  type WalletClient,
} from "viem";
import { normalize, packetToBytes } from "viem/ens";
import { z } from "zod";
import { canonicalHash } from "../../../packages/schema/src/encoding.ts";
import {
  Address as AddressSchema,
  Hash32,
  ManifestSchema,
} from "../../../packages/schema/src/types.ts";

export const CANDIDATE_MANIFEST_KEY = "patchbond.candidate-manifest.v1";
export const APPROVED_MANIFEST_KEY = "patchbond.approved-manifest.v1";
export const ENS_SEPOLIA_CHAIN_ID = 11_155_111;
export const ENS_MAINNET_CHAIN_ID = 1;

const pointerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1).max(128),
  manifestUri: z.string().url(),
  manifestDigest: Hash32,
  candidatePublisher: AddressSchema,
});

export type ManifestPointer = {
  schemaVersion: 1;
  releaseId: string;
  manifestUri: string;
  manifestDigest: `0x${string}`;
  candidatePublisher: Address;
};

export type EnsPublicationConfig = {
  name: string;
  resolverAddress: Address;
  chainId: number;
};

const resolverAbi = parseAbi([
  "function setText(bytes name, string key, string value)",
]);

function validateManifestUri(uri: string): string {
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "Manifest URI must be an HTTPS URL without credentials or fragment",
    );
  }
  return parsed.toString();
}

export function createManifestPointer(
  manifestInput: unknown,
  manifestUri: string,
  candidatePublisher: Address,
): ManifestPointer {
  const manifest = ManifestSchema.parse(manifestInput);
  return pointerSchema.parse({
    schemaVersion: 1,
    releaseId: manifest.releaseId,
    manifestUri: validateManifestUri(manifestUri),
    manifestDigest: canonicalHash(manifest),
    candidatePublisher,
  });
}

export function assertIndependentApprover(
  candidatePublisher: Address,
  approver: Address,
): Address {
  const normalizedPublisher = getAddress(candidatePublisher);
  const normalizedApprover = getAddress(approver);
  if (normalizedPublisher === normalizedApprover) {
    throw new Error("A different wallet must approve the candidate release");
  }
  return normalizedApprover;
}

export function assertSupportedEnsChain(chainId: number): number {
  if (chainId !== ENS_MAINNET_CHAIN_ID && chainId !== ENS_SEPOLIA_CHAIN_ID) {
    throw new Error(
      "ENS release publication supports Ethereum mainnet or Sepolia",
    );
  }
  return chainId;
}

export function parseManifestPointer(value: string): ManifestPointer {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error("ENS manifest pointer is not valid JSON");
  }
  const pointer = pointerSchema.parse(decoded);
  validateManifestUri(pointer.manifestUri);
  return pointer;
}

export function resolveManifestPayload(
  pointerInput: ManifestPointer,
  payload: string,
) {
  const pointer = pointerSchema.parse(pointerInput);
  validateManifestUri(pointer.manifestUri);
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    throw new Error("Published manifest is not valid JSON");
  }
  const manifest = ManifestSchema.parse(decoded);
  if (manifest.releaseId !== pointer.releaseId) {
    throw new Error("Manifest release ID does not match the ENS pointer");
  }
  if (canonicalHash(manifest) !== pointer.manifestDigest) {
    throw new Error("Manifest content digest mismatch");
  }
  return manifest;
}

async function assertPublicationTarget(
  client: PublicClient,
  config: EnsPublicationConfig,
) {
  assertSupportedEnsChain(config.chainId);
  if ((await client.getChainId()) !== config.chainId) {
    throw new Error(
      `ENS client is on the wrong chain; expected ${config.chainId}`,
    );
  }
  const name = normalize(config.name);
  const actualResolver = await client.getEnsResolver({ name });
  if (
    !actualResolver ||
    getAddress(actualResolver) !== getAddress(config.resolverAddress)
  ) {
    throw new Error(
      "ENS name does not resolve to the configured dedicated resolver",
    );
  }
  return name;
}

async function setManifestRecord(
  client: PublicClient,
  wallet: WalletClient,
  config: EnsPublicationConfig,
  key: string,
  pointer: ManifestPointer,
) {
  const name = await assertPublicationTarget(client, config);
  if (!wallet.account) throw new Error("Connected wallet account is required");
  if ((await wallet.getChainId()) !== config.chainId) {
    throw new Error(
      `ENS signer is on the wrong chain; expected ${config.chainId}`,
    );
  }
  return wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain,
    address: config.resolverAddress,
    abi: resolverAbi,
    functionName: "setText",
    args: [toHex(packetToBytes(name)), key, JSON.stringify(pointer)],
  });
}

export async function publishCandidateManifest(input: {
  client: PublicClient;
  wallet: WalletClient;
  config: EnsPublicationConfig;
  manifest: unknown;
  manifestUri: string;
  fetchPayload: (uri: string) => Promise<string>;
}) {
  if (!input.wallet.account)
    throw new Error("Connected wallet account is required");
  const pointer = createManifestPointer(
    input.manifest,
    input.manifestUri,
    input.wallet.account.address,
  );
  resolveManifestPayload(
    pointer,
    await input.fetchPayload(pointer.manifestUri),
  );
  const transactionHash = await setManifestRecord(
    input.client,
    input.wallet,
    input.config,
    CANDIDATE_MANIFEST_KEY,
    pointer,
  );
  return { pointer, transactionHash };
}

export async function approveCandidateManifest(input: {
  client: PublicClient;
  wallet: WalletClient;
  config: EnsPublicationConfig;
  expectedManifestDigest: `0x${string}`;
  fetchPayload: (uri: string) => Promise<string>;
}) {
  const name = await assertPublicationTarget(input.client, input.config);
  const raw = await input.client.getEnsText({
    name,
    key: CANDIDATE_MANIFEST_KEY,
  });
  if (!raw) throw new Error("No candidate manifest is currently published");
  const pointer = parseManifestPointer(raw);
  if (pointer.manifestDigest !== Hash32.parse(input.expectedManifestDigest)) {
    throw new Error(
      "Candidate changed; review the current candidate before approval",
    );
  }
  resolveManifestPayload(
    pointer,
    await input.fetchPayload(pointer.manifestUri),
  );
  if (!input.wallet.account)
    throw new Error("Connected wallet account is required");
  assertIndependentApprover(
    pointer.candidatePublisher,
    input.wallet.account.address,
  );
  const transactionHash = await setManifestRecord(
    input.client,
    input.wallet,
    input.config,
    APPROVED_MANIFEST_KEY,
    pointer,
  );
  return { pointer, transactionHash };
}

export async function resolveApprovedManifest(input: {
  client: PublicClient;
  config: EnsPublicationConfig;
  fetchPayload: (uri: string) => Promise<string>;
}) {
  const name = await assertPublicationTarget(input.client, input.config);
  const raw = await input.client.getEnsText({
    name,
    key: APPROVED_MANIFEST_KEY,
  });
  if (!raw)
    throw new Error("No approved manifest is published for this ENS name");
  const pointer = parseManifestPointer(raw);
  const payload = await input.fetchPayload(pointer.manifestUri);
  return { pointer, manifest: resolveManifestPayload(pointer, payload) };
}

export function encodeManifestRecordCall(
  nameInput: string,
  key: string,
  pointer: ManifestPointer,
) {
  const name = normalize(nameInput);
  return encodeFunctionData({
    abi: resolverAbi,
    functionName: "setText",
    args: [toHex(packetToBytes(name)), key, JSON.stringify(pointer)],
  });
}
