import { readFile } from "node:fs/promises";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  zeroHash,
} from "viem";
// The local-only fixture launcher is JavaScript; this adapter keeps its untyped exports out of production.
// @ts-expect-error PB-07 launcher has no declaration file
import { deployLocal } from "../../../fixtures/deploy-local.mjs";
import {
  ManifestSchema,
  SnapshotSchema,
} from "../../../packages/schema/src/types.ts";
export async function fixture() {
  const local = await deployLocal({ count: 3, keepAlive: true });
  const exported = JSON.parse(await readFile(local.manifestPath, "utf8"));
  const client = createPublicClient({ transport: http(local.rpcUrl) });
  const supplier = exported.roles.supplier as Address;
  const customer = exported.roles.customer as Address;
  const write = async (
    address: Address,
    signature: string,
    functionName: string,
    args: readonly unknown[],
    account = customer,
  ) => {
    const wallet = createWalletClient({
      account,
      transport: http(local.rpcUrl),
    });
    const hash = await wallet.writeContract({
      address,
      abi: parseAbi([signature]),
      functionName,
      args,
      chain: null,
    });
    await client.waitForTransactionReceipt({ hash });
  };
  const snapshot = async () => {
    const block = await client.getBlock();
    await client.request({ method: "evm_mine" as never, params: [] as never });
    return SnapshotSchema.parse({
      chainId: "31337",
      blockNumber: String(block.number),
      blockHash: block.hash,
      blockTimestamp: String(block.timestamp),
    });
  };
  const rows = await Promise.all(
    exported.deployments.map(
      async (d: {
        market: Address;
        proxy: Address;
        source: Address;
        proxyAdmin: Address;
        repairManifest: string;
      }) => ({
        ...d,
        deployment: {
          chainId: "31337",
          entrypoint: d.market,
          marketSelector: zeroHash,
          inspectionModuleId: "eip1967-transparent-v1" as const,
          declaredDependencyPath: [d.proxy, d.source],
          expectedAuthorityModel: "owner" as const,
        },
        manifest: ManifestSchema.parse(
          JSON.parse(
            await readFile(
              new URL(d.repairManifest, local.directoryUrl),
              "utf8",
            ),
          ),
        ),
      }),
    ),
  );
  return {
    ...local,
    rows: rows as Array<{
      market: Address;
      proxy: Address;
      source: Address;
      proxyAdmin: Address;
      deployment: {
        chainId: string;
        entrypoint: Address;
        marketSelector: typeof zeroHash;
        inspectionModuleId: "eip1967-transparent-v1";
        declaredDependencyPath: Address[];
        expectedAuthorityModel: "owner";
      };
      manifest: ReturnType<typeof ManifestSchema.parse>;
    }>,
    client,
    supplier,
    customer,
    write,
    snapshot,
  };
}
