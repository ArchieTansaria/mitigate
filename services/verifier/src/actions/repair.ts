import { readFile } from "node:fs/promises";
import {
  type Address,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import { canonicalHash } from "../../../../packages/schema/src/encoding.ts";
import {
  DeploymentSchema,
  ManifestSchema,
  type Snapshot,
  SnapshotSchema,
} from "../../../../packages/schema/src/types.ts";
import { BoundedRpc, SnapshotRpc } from "../inspect/rpc.ts";
import {
  inspectDeployment,
  loadSupportedPattern,
  type Observed,
} from "../inspect/transparent-oracle.ts";

export type RepairInput = {
  rpcUrl: string;
  deployment: unknown;
  manifest: unknown;
  snapshot: Snapshot;
  confirmations: number;
  maxAge: number;
  now: bigint;
  clock?: () => bigint;
};
export type RepairProposal = {
  schemaVersion: 1;
  operation: "upgrade" | "configure";
  chainId: string;
  deploymentKey: Hex;
  manifestDigest: Hex;
  snapshot: Snapshot;
  expiresAt: string;
  stateDigest: Hex;
  target: Address;
  authority: Address;
  calldata: Hex;
  valueBaseUnits: "0";
  compatibility: { kind: "exact-reviewed-family-layout"; digest: Hex };
  simulation: { success: true; blockHash: Hex; result: Hex };
  claimEligible: false;
  explanation: string;
};
export type RepairResult = {
  status: "ready" | "no-supported-action" | "blocked";
  reason: string;
  proposal: RepairProposal | null;
};
const blocked = (reason: string): RepairResult => ({
  status: "blocked",
  reason,
  proposal: null,
});
const defaultRoot = new URL("../../../../", import.meta.url);

// Deliberately limited to the reviewed V1 -> inherited V2 family, not a generic upgrade validator.
export async function loadRepairCompatibility(root = defaultRoot) {
  const artifacts = await Promise.all(
    ["OracleAdapterV1", "OracleAdapterV2"].map(async (name) => {
      const artifact = JSON.parse(
        await readFile(
          new URL(`fixtures/out/${name}.sol/${name}.json`, root),
          "utf8",
        ),
      );
      const sources = artifact.metadata?.sources;
      if (
        !sources ||
        !artifact.storageLayout?.storage ||
        !artifact.storageLayout?.types
      )
        throw new Error("UPGRADE_METADATA_UNAVAILABLE");
      for (const [path, metadata] of Object.entries(sources) as [
        string,
        { keccak256: string },
      ][]) {
        if (
          !/^(src|lib\/openzeppelin-contracts\/contracts)\/[A-Za-z0-9_/.]+\.sol$/.test(
            path,
          ) ||
          path.split("/").includes("..")
        )
          throw new Error("UPGRADE_METADATA_UNAVAILABLE");
        const bytes = await readFile(new URL(`fixtures/${path}`, root));
        if (keccak256(bytes) !== metadata.keccak256)
          throw new Error("STALE_UPGRADE_METADATA");
      }
      const layout = artifact.storageLayout;
      const entries = layout.storage.map(
        (s: { label: string; offset: number; slot: string; type: string }) => ({
          label: s.label,
          offset: s.offset,
          slot: s.slot,
          type: layout.types[s.type],
        }),
      );
      return { artifact, entries };
    }),
  );
  const [v1, v2] = artifacts;
  if (
    !v1 ||
    !v2 ||
    v1.entries.length !== 4 ||
    canonicalHash(v1.entries) !== canonicalHash(v2.entries)
  )
    throw new Error("INCOMPATIBLE_STORAGE_LAYOUT");
  // Initializable uses a namespaced slot: the exact same audited source must be inherited in both builds.
  const initializable =
    "lib/openzeppelin-contracts/contracts/proxy/utils/Initializable.sol";
  if (
    !v1.artifact.metadata.sources[initializable] ||
    canonicalHash(v1.artifact.metadata.sources[initializable]) !==
      canonicalHash(v2.artifact.metadata.sources[initializable])
  )
    throw new Error("INCOMPATIBLE_INITIALIZER_LAYOUT");
  return {
    kind: "exact-reviewed-family-layout" as const,
    digest: canonicalHash({
      layouts: v1.entries,
      sources: artifacts.map((a) => a.artifact.metadata.sources),
    }),
    v2Code: v2.artifact.deployedBytecode.object as Hex,
  };
}
// Exclude only mutable price/timestamp samples. All routing, code, owners and configuration remain bound.
function repairState(o: Observed) {
  return Object.fromEntries(
    Object.entries(o.state).map(([address, state]) => [
      address,
      {
        code: state.code,
        storage: Object.fromEntries(
          Object.entries(state.storage).filter(
            ([slot]) => address !== o.source || BigInt(slot) === 0n,
          ),
        ),
      },
    ]),
  );
}
async function latestSnapshot(url: string, chainId: string) {
  const rpc = new BoundedRpc(url);
  const chain = await rpc.rpc("eth_chainId", []);
  if (typeof chain !== "string" || BigInt(chain) !== BigInt(chainId))
    throw new Error("CHAIN_MISMATCH");
  const block = (await rpc.rpc("eth_getBlockByNumber", ["latest", false])) as {
    number: string;
    hash: string;
    timestamp: string;
  };
  return SnapshotSchema.parse({
    chainId,
    blockNumber: BigInt(block.number).toString(),
    blockHash: block.hash,
    blockTimestamp: BigInt(block.timestamp).toString(),
  });
}
async function checkCurrent(
  input: RepairInput,
  observed: Observed,
  expectedCode: Hex,
  implementation: Address,
) {
  const snapshot = await latestSnapshot(input.rpcUrl, input.snapshot.chainId),
    rpc = new SnapshotRpc(input.rpcUrl, snapshot);
  const state = repairState(observed);
  for (const [address, entry] of Object.entries(state)) {
    if ((await rpc.code(address as Address)) !== entry.code.toLowerCase())
      throw new Error("STATE_CHANGED");
    for (const [slot, value] of Object.entries(entry.storage)) {
      if (
        (await rpc.storage(address as Address, slot as Hex)) !==
        value.toLowerCase()
      )
        throw new Error("STATE_CHANGED");
    }
  }
  if ((await rpc.code(implementation)) !== expectedCode.toLowerCase())
    throw new Error("STATE_CHANGED");
  await rpc.checkCanonical();
  return rpc;
}
export async function prepareRepair(input: RepairInput): Promise<RepairResult> {
  const d = DeploymentSchema.parse(input.deployment),
    m = ManifestSchema.parse(input.manifest),
    snapshot = SnapshotSchema.parse(input.snapshot);
  if (
    !Number.isInteger(input.maxAge) ||
    input.maxAge < 1 ||
    input.maxAge > 86400
  )
    throw new Error("INVALID_INPUT");
  const expiresAt =
    BigInt(snapshot.blockTimestamp) + BigInt(Math.min(input.maxAge, 120));
  const assertFresh = (now: bigint) => {
    if (now < BigInt(snapshot.blockTimestamp) || now >= expiresAt)
      throw new Error("STALE_PROPOSAL");
  };
  assertFresh(input.clock?.() ?? input.now);
  const pattern = await loadSupportedPattern();
  const inspection = await inspectDeployment({ ...input, pattern });
  const o = inspection.observed;
  if (inspection.status !== "supported" || !o)
    return blocked(inspection.reason ?? "UNSUPPORTED_OBSERVATION");
  if (
    inspection.conditions.some(
      (c) =>
        ["dependency-path", "authority", "market-owner", "unpaused"].includes(
          c.id,
        ) && c.outcome !== "pass",
    )
  )
    return blocked("PATH_AUTHORITY_OR_PAUSE_REQUIRES_MANUAL_REVIEW");
  const configOwner = m.configurationPredicates.find(
    (p) => p.readMethod === "configurationOwner()",
  );
  const source = m.configurationPredicates.find(
    (p) => p.readMethod === "priceSource()",
  );
  if (
    configOwner?.expected.toLowerCase() !==
      o.configurationOwner.toLowerCase() ||
    source?.expected.toLowerCase() !== o.source.toLowerCase()
  )
    return blocked("SOURCE_OR_OWNER_CHANGE_REQUIRES_MANUAL_REVIEW");
  let compatibility: Awaited<ReturnType<typeof loadRepairCompatibility>>;
  try {
    compatibility = await loadRepairCompatibility();
  } catch {
    return blocked("UPGRADE_SOURCE_OR_LAYOUT_METADATA_INVALID");
  }
  const pinned = new SnapshotRpc(input.rpcUrl, snapshot);
  if (
    keccak256(compatibility.v2Code) !== m.approvedRuntimeCodeHash ||
    (await pinned.code(m.approvedImplementationAddress)) !==
      compatibility.v2Code.toLowerCase()
  )
    return blocked("APPROVED_IMPLEMENTATION_NOT_RECOGNIZED");
  const upgrade = inspection.conditions.some(
    (c) => c.id === "implementation" && c.outcome === "fail",
  );
  const configure = inspection.assertions.some(
    (c) => c.id === "configuration" && c.outcome === "fail",
  );
  if (!upgrade && !configure)
    return {
      status: "no-supported-action",
      reason:
        "NO_SUPPORTED_CODE_OR_CONFIGURATION_CHANGE_NEEDED_RUN_BEHAVIOR_CHECKS",
      proposal: null,
    };
  const authority = upgrade ? o.upgradeOwner : o.configurationOwner;
  if (authority === zeroAddress || (await pinned.code(authority)) !== "0x")
    return blocked("UNSUPPORTED_AUTHORITY_WALLET");
  const maxAge = m.configurationPredicates.find(
    (p) => p.readMethod === "maxAge()",
  )?.expected;
  if (!maxAge) return blocked("UNSUPPORTED_CONFIGURATION_POLICY");
  const calldata = upgrade
    ? encodeFunctionData({
        abi: parseAbi([
          "function upgradeAndCall(address proxy,address implementation,bytes data) payable",
        ]),
        functionName: "upgradeAndCall",
        args: [o.proxy, m.approvedImplementationAddress, "0x"],
      })
    : encodeFunctionData({
        abi: parseAbi([
          "function configure(address source,uint256 age,uint8 decimals_)",
        ]),
        functionName: "configure",
        args: [o.source, BigInt(maxAge), 8],
      });
  const target = upgrade ? o.proxyAdmin : o.proxy;
  // Recheck latest canonical state as well as the confirmed report snapshot; a pending governance change can invalidate an old report.
  const current = await checkCurrent(
    input,
    o,
    compatibility.v2Code,
    m.approvedImplementationAddress,
  );
  if ((await current.code(authority)) !== "0x")
    return blocked("UNSUPPORTED_AUTHORITY_WALLET");
  const transaction = {
    from: authority,
    to: target,
    data: calldata,
    value: "0x0",
    gas: toHex(1000000n),
  };
  let result: unknown;
  let currentResult: unknown;
  try {
    result = await pinned.rpc("eth_call", [transaction, pinned.pin]);
    currentResult = await current.rpc("eth_call", [transaction, current.pin]);
  } catch {
    return blocked("SIMULATION_UNAVAILABLE_OR_REVERTED");
  }
  if (result !== "0x" || currentResult !== "0x")
    return blocked("SIMULATION_UNAVAILABLE_OR_REVERTED");
  await pinned.verify(input.confirmations);
  await current.checkCanonical();
  assertFresh(input.clock?.() ?? BigInt(Math.floor(Date.now() / 1000)));
  return {
    status: "ready",
    reason: "OWNER_MUST_REVALIDATE_AND_SIGN_THEN_RUN_FRESH_DIAGNOSTIC",
    proposal: {
      schemaVersion: 1,
      operation: upgrade ? "upgrade" : "configure",
      chainId: d.chainId,
      deploymentKey: inspection.deploymentKey,
      manifestDigest: canonicalHash(m),
      snapshot,
      expiresAt: expiresAt.toString(),
      stateDigest: canonicalHash(repairState(o)),
      target,
      authority,
      calldata,
      valueBaseUnits: "0",
      compatibility: { kind: compatibility.kind, digest: compatibility.digest },
      simulation: {
        success: true,
        blockHash: snapshot.blockHash,
        result: result as Hex,
      },
      claimEligible: false,
      explanation: upgrade
        ? "Supplier's observed ProxyAdmin owner upgrades only the approved implementation; empty initializer data preserves configuration. Re-run verification afterward."
        : "Customer's observed configuration owner restores the agreed age and decimal units. Re-run verification afterward.",
    },
  };
}
export async function validateRepair(input: RepairInput, proposal: unknown) {
  const result = await prepareRepair(input);
  if (
    !result.proposal ||
    canonicalHash(result.proposal) !== canonicalHash(proposal)
  )
    throw new Error("PROPOSAL_MISMATCH");
  return {
    valid: true as const,
    claimEligible: false as const,
    authority: result.proposal.authority,
    expiresAt: result.proposal.expiresAt,
    requiresWalletSimulation: true as const,
  };
}
