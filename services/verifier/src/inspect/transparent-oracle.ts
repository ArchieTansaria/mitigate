import { readFile } from "node:fs/promises";
import {
  type Address,
  getAddress,
  type Hex,
  keccak256,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  canonicalHash,
  deploymentKey,
} from "../../../../packages/schema/src/encoding.ts";
import {
  DeploymentSchema,
  ManifestSchema,
  type Snapshot,
  SnapshotSchema,
} from "../../../../packages/schema/src/types.ts";
import { ObservationError, SnapshotRpc } from "./rpc.ts";
export const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const adminSlot =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export type RuntimeTemplate = {
  code: Hex;
  immutableReferences: Array<{ start: number; length: number }>;
};
export type SupportedPattern = Record<
  "market" | "proxy" | "admin" | "source" | "v1" | "v2",
  RuntimeTemplate
>;
export async function loadSupportedPattern(): Promise<SupportedPattern> {
  const result: Partial<SupportedPattern> = {};
  for (const [key, name] of Object.entries({
    market: "RiverMarket",
    proxy: "TransparentUpgradeableProxy",
    admin: "ProxyAdmin",
    source: "TestPriceSource",
    v1: "OracleAdapterV1",
    v2: "OracleAdapterV2",
  })) {
    const artifact = JSON.parse(
      await readFile(
        new URL(
          `../../../../fixtures/out/${name}.sol/${name}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const code = artifact.deployedBytecode.object as Hex;
    if (!/^0x([0-9a-f]{2})+$/i.test(code))
      throw new Error("BUILD_FIXTURES_FIRST");
    const immutableReferences = Object.values(
      artifact.deployedBytecode.immutableReferences ?? {},
    ).flat() as RuntimeTemplate["immutableReferences"];
    if (
      key === "proxy"
        ? immutableReferences.length !== 1 ||
          immutableReferences[0]?.length !== 32
        : immutableReferences.length !== 0
    )
      throw new Error("UNSUPPORTED_BUILD_LAYOUT");
    result[key as keyof SupportedPattern] = { code, immutableReferences };
  }
  return result as SupportedPattern;
}
function matches(code: Hex, template: RuntimeTemplate, immutable?: Address) {
  let expected = template.code;
  for (const { start, length } of template.immutableReferences) {
    if (!immutable || length !== 32 || start * 2 + 2 + 64 > expected.length)
      return false;
    expected = (expected.slice(0, start * 2 + 2) +
      immutable.slice(2).toLowerCase().padStart(64, "0") +
      expected.slice(start * 2 + 2 + 64)) as Hex;
  }
  return code.toLowerCase() === expected.toLowerCase();
}
function addressSlot(value: Hex): Address {
  if (!/^0x0{24}[0-9a-f]{40}$/i.test(value))
    throw new ObservationError("INVALID_ADDRESS_SLOT");
  const address = getAddress(`0x${value.slice(-40)}`);
  if (address === zeroAddress) throw new ObservationError("UNRESOLVED_LINK");
  return address;
}
export type Condition = {
  id: string;
  outcome: "pass" | "fail" | "unknown" | "unsupported";
  expected: string;
  observed: string;
  responsible: Address | null;
};
export type InspectionAssertion = Omit<Condition, "responsible"> & {
  evidenceRef: Hex;
};
export type Observed = {
  entrypoint: Address;
  proxy: Address;
  implementation: Address;
  source: Address;
  proxyAdmin: Address;
  upgradeOwner: Address;
  configurationOwner: Address;
  marketOwner: Address;
  sourceOwner: Address;
  maxAge: string;
  priceDecimals: string;
  paused: boolean;
  codeHashes: Record<string, Hex>;
  state: Record<Address, { code: Hex; storage: Record<Hex, Hex> }>;
};
export type Inspection = {
  schemaVersion: 1;
  deploymentKey: Hex;
  snapshot: Snapshot;
  status: "supported" | "unsupported" | "unknown";
  reason: string | null;
  conditions: Condition[];
  assertions: InspectionAssertion[];
  observed?: Observed;
};
export type InspectionInput = {
  rpcUrl: string;
  deployment: unknown;
  manifest: unknown;
  snapshot: Snapshot;
  confirmations: number;
  pattern: SupportedPattern;
  timeoutMs?: number;
};
export async function inspectDeployment(
  input: InspectionInput,
): Promise<Inspection> {
  const d = DeploymentSchema.parse(input.deployment),
    m = ManifestSchema.parse(input.manifest),
    snapshot = SnapshotSchema.parse(input.snapshot);
  const base = {
    schemaVersion: 1 as const,
    deploymentKey: deploymentKey(d.chainId, d.entrypoint, d.marketSelector),
    snapshot,
  };
  const conditions: Condition[] = [];
  const condition = (
    id: string,
    expected: string,
    observed: string,
    pass: boolean,
    responsible: Address | null,
  ) =>
    conditions.push({
      id,
      expected,
      observed,
      outcome: pass ? "pass" : "fail",
      responsible,
    });
  try {
    if (d.chainId !== snapshot.chainId || m.sourceChainId !== snapshot.chainId)
      throw new ObservationError("CHAIN_MISMATCH");
    if (d.marketSelector !== zeroHash || d.expectedAuthorityModel !== "owner")
      throw new Error("UNSUPPORTED_SELECTOR_OR_AUTHORITY_MODEL");
    const rpc = new SnapshotRpc(input.rpcUrl, snapshot, input.timeoutMs);
    await rpc.verify(input.confirmations);
    const code: Record<string, Hex> = {};
    code.market = await rpc.code(d.entrypoint);
    if (!matches(code.market, input.pattern.market))
      throw new Error("UNSUPPORTED_ENTRYPOINT_CODE");
    const readAddress = async (address: Address, name: string) =>
      getAddress(
        String(
          await rpc.read(
            address,
            `function ${name}() view returns (address)`,
            name,
          ),
        ),
      );
    const proxy = await readAddress(d.entrypoint, "adapter");
    const adminValue = await rpc.storage(proxy, adminSlot),
      implementationValue = await rpc.storage(proxy, implementationSlot);
    const proxyAdmin = addressSlot(adminValue),
      implementation = addressSlot(implementationValue);
    code.proxy = await rpc.code(proxy);
    code.admin = await rpc.code(proxyAdmin);
    if (
      !matches(code.proxy, input.pattern.proxy, proxyAdmin) ||
      !matches(code.admin, input.pattern.admin)
    )
      throw new Error("UNSUPPORTED_PROXY_OR_ADMIN_CODE");
    if (
      (await rpc.read(
        proxyAdmin,
        "function UPGRADE_INTERFACE_VERSION() view returns (string)",
        "UPGRADE_INTERFACE_VERSION",
      )) !== "5.0.0"
    )
      throw new Error("UNSUPPORTED_ADMIN_VERSION");
    code.implementation = await rpc.code(implementation);
    if (
      !matches(code.implementation, input.pattern.v1) &&
      !matches(code.implementation, input.pattern.v2)
    )
      throw new Error("UNSUPPORTED_IMPLEMENTATION_CODE");
    const source = await readAddress(proxy, "priceSource");
    code.source = await rpc.code(source);
    if (!matches(code.source, input.pattern.source))
      throw new Error("UNSUPPORTED_SOURCE_CODE");
    const configurationOwner = await readAddress(proxy, "configurationOwner"),
      marketOwner = await readAddress(d.entrypoint, "owner"),
      upgradeOwner = await readAddress(proxyAdmin, "owner"),
      sourceOwner = await readAddress(source, "owner");
    const maxAge = String(
      await rpc.read(
        proxy,
        "function maxAge() view returns (uint256)",
        "maxAge",
      ),
    );
    const priceDecimals = String(
      await rpc.read(
        proxy,
        "function priceDecimals() view returns (uint8)",
        "priceDecimals",
      ),
    );
    const paused = Boolean(
      await rpc.read(
        d.entrypoint,
        "function paused() view returns (bool)",
        "paused",
      ),
    );
    condition(
      "implementation",
      `${m.approvedImplementationAddress} / ${m.approvedRuntimeCodeHash}`,
      `${implementation} / ${keccak256(code.implementation)}`,
      implementation === m.approvedImplementationAddress &&
        keccak256(code.implementation) === m.approvedRuntimeCodeHash,
      upgradeOwner,
    );
    condition(
      "dependency-path",
      JSON.stringify(d.declaredDependencyPath),
      JSON.stringify([proxy, source]),
      d.declaredDependencyPath.length === 2 &&
        d.declaredDependencyPath[0] === proxy &&
        d.declaredDependencyPath[1] === source,
      marketOwner,
    );
    condition(
      "authority",
      "nonzero observed owners",
      JSON.stringify({
        upgradeOwner,
        configurationOwner,
        marketOwner,
        sourceOwner,
      }),
      [upgradeOwner, configurationOwner, marketOwner, sourceOwner].every(
        (a) => a !== zeroAddress,
      ),
      null,
    );
    const config: Record<string, string> = {
      "priceSource()": source,
      "maxAge()": maxAge,
      "priceDecimals()": priceDecimals,
      "configurationOwner()": configurationOwner,
    };
    // This exact pack requires all four predicates; a client cannot weaken coverage by omitting one.
    const methods = m.configurationPredicates.map((p) => p.readMethod);
    if (
      methods.length !== 4 ||
      new Set(methods).size !== 4 ||
      Object.keys(config).some((k) => !methods.includes(k))
    )
      throw new Error("UNSUPPORTED_CONFIGURATION_POLICY");
    for (const p of m.configurationPredicates) {
      if (
        p.operator !== "eq" ||
        [
          "implementation",
          "dependency-path",
          "authority",
          "configuration",
          "unpaused",
        ].includes(p.id)
      )
        throw new Error("UNSUPPORTED_CONFIGURATION_POLICY");
      const observed = config[p.readMethod];
      if (observed === undefined)
        throw new Error("UNSUPPORTED_CONFIGURATION_POLICY");
      const addressField =
        p.readMethod === "priceSource()" ||
        p.readMethod === "configurationOwner()";
      const expected = addressField ? getAddress(p.expected) : p.expected;
      if (!addressField && !/^(0|[1-9][0-9]*)$/.test(expected))
        throw new Error("UNSUPPORTED_CONFIGURATION_POLICY");
      if (p.readMethod === "priceDecimals()" && expected !== "8")
        throw new Error("UNSUPPORTED_QUOTE_UNITS");
      if (p.readMethod === "maxAge()" && BigInt(expected) < 1n)
        throw new Error("UNSUPPORTED_MAX_AGE");
      condition(
        p.id,
        expected,
        observed,
        expected === observed,
        configurationOwner,
      );
    }
    condition("unpaused", "false", String(paused), !paused, marketOwner);
    const state: Observed["state"] = {};
    for (const [address, bytecode, slots] of [
      [d.entrypoint, code.market, [0, 1, 2]],
      [proxy, code.proxy, [0, 1, 2, 3]],
      [implementation, code.implementation, []],
      [source, code.source, [0, 1, 2]],
      [proxyAdmin, code.admin, [0]],
    ] as const) {
      const storage: Record<Hex, Hex> = {};
      for (const slot of slots) {
        const key = toHex(BigInt(slot), { size: 32 });
        storage[key] = await rpc.storage(address, key);
      }
      if (address === proxy) {
        storage[adminSlot] = adminValue;
        storage[implementationSlot] = implementationValue;
      }
      state[address] = { code: bytecode, storage };
    }
    await rpc.checkCanonical();
    const observed: Observed = {
      entrypoint: d.entrypoint,
      proxy,
      implementation,
      source,
      proxyAdmin,
      upgradeOwner,
      configurationOwner,
      marketOwner,
      sourceOwner,
      maxAge,
      priceDecimals,
      paused,
      codeHashes: Object.fromEntries(
        Object.entries(code).map(([k, v]) => [k, keccak256(v)]),
      ),
      state,
    };
    const evidenceRef = canonicalHash({ snapshot, conditions, observed });
    const assertions: InspectionAssertion[] = conditions
      .slice(0, 3)
      .map(({ responsible: _, ...c }) => ({ ...c, evidenceRef }));
    assertions.push({
      id: "configuration",
      outcome: conditions.slice(3).every((c) => c.outcome === "pass")
        ? "pass"
        : "fail",
      expected: "all agreed configuration predicates and unpaused operation",
      observed: JSON.stringify(conditions.slice(3)),
      evidenceRef,
    });
    return {
      ...base,
      status: "supported",
      reason: null,
      conditions,
      assertions,
      observed,
    };
  } catch (error) {
    const status =
      error instanceof Error && error.message.startsWith("UNSUPPORTED_")
        ? "unsupported"
        : "unknown";
    const reason =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "OBSERVATION_UNAVAILABLE";
    const evidenceRef = canonicalHash({ snapshot, status, reason });
    return {
      ...base,
      status,
      reason,
      conditions: [],
      assertions: [
        "implementation",
        "dependency-path",
        "authority",
        "configuration",
      ].map((id) => ({
        id,
        outcome: status,
        expected: "supported pinned deployment observation",
        observed: reason,
        evidenceRef,
      })),
    };
  }
}
