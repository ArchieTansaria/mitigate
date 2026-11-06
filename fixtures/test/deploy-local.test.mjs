import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  keccak256,
  toHex,
  toFunctionSelector,
  createPublicClient,
  http,
} from "viem";
import {
  adapterAbi,
  marketAbi,
  priceSourceAbi,
} from "../../packages/schema/src/fixture-abi.ts";
import { deployLocal } from "../deploy-local.mjs";

// Real process, mined transactions and RPC reads: no mocked chain or prewritten artifact.
test("fresh Anvil deployment exports mined provenance and compatible ABIs", {
  timeout: 120_000,
}, async () => {
  const result = await deployLocal({
    count: 3,
    maxAge: "1800",
    price: "150000000000",
    keepAlive: true,
  });
  try {
    const rpc = createPublicClient({ transport: http(result.rpcUrl) });
    const manifestBytes = await readFile(result.manifestPath);
    const manifest = JSON.parse(manifestBytes);
    assert.equal(keccak256(toHex(manifestBytes)), result.manifestDigest);
    assert.equal(manifest.executionKind, "local-anvil");
    assert.equal(manifest.claimEligible, false);
    assert.equal(manifest.chainId, "31337");
    assert.equal(await rpc.getChainId(), 31337);
    assert.equal(
      (
        await rpc.getBlock({
          blockNumber: BigInt(manifest.snapshot.blockNumber),
        })
      ).hash,
      manifest.snapshot.blockHash,
    );
    assert.notEqual(manifest.roles.supplier, manifest.roles.customer);
    assert.equal(manifest.deployments.length, 3);
    assert.equal(manifest.transactions.length, 11);
    assert.equal(new Set(manifest.transactions.map((t) => t.hash)).size, 11);
    for (const tx of manifest.transactions) {
      const receipt = await rpc.getTransactionReceipt({ hash: tx.hash });
      assert.equal(receipt.status, "success");
      assert.equal(receipt.blockHash, tx.receipt.blockHash);
      assert.equal(
        receipt.contractAddress?.toLowerCase(),
        tx.receipt.contractAddress?.toLowerCase(),
      );
      assert.equal(tx.receipt.status, "success");
      assert.equal(tx.receipt.transactionHash, tx.hash);
      assert.ok(
        BigInt(tx.receipt.blockNumber) <= BigInt(manifest.snapshot.blockNumber),
      );
    }
    for (const contract of Object.values(manifest.contracts)) {
      assert.equal(
        await rpc.getCode({
          address: contract.address,
          blockNumber: BigInt(manifest.snapshot.blockNumber),
        }),
        contract.runtimeBytecode,
      );
      assert.notEqual(contract.runtimeBytecode, "0x");
      assert.equal(
        keccak256(contract.runtimeBytecode),
        contract.runtimeCodeHash,
      );
      assert.ok(
        manifest.transactions.some(
          (t) => t.hash === contract.deploymentTransactionHash,
        ),
      );
    }
    const indexBytes = await readFile(
      new URL(manifest.testPack.path, result.directoryUrl),
    );
    assert.equal(keccak256(toHex(indexBytes)), manifest.testPack.digest);
    for (const file of JSON.parse(indexBytes).files) {
      const bytes = await readFile(
        new URL(`testpack/${file.path}`, result.directoryUrl),
      );
      assert.equal(keccak256(toHex(bytes)), file.digest);
    }
    for (const deployment of manifest.deployments) {
      assert.equal(deployment.observed.maxAge, "1800");
      assert.equal(
        deployment.observed.configurationOwner,
        manifest.roles.customer,
      );
      assert.equal(
        deployment.observed.proxyAdminOwner,
        manifest.roles.supplier,
      );
      assert.notEqual(deployment.proxyAdmin, manifest.roles.supplier);
      assert.equal(deployment.observed.price, "150000000000");
      assert.equal(
        deployment.observed.quoteForThreeCollateral,
        deployment.scenario === "unsafe-decimals"
          ? "450000000000000000000000"
          : "4500000000000000000000",
      );
      assert.equal(
        deployment.observed.priceDecimals,
        deployment.scenario === "unsafe-decimals" ? 6 : 8,
      );
      assert.equal(
        deployment.implementation,
        manifest.implementations[deployment.scenario === "old" ? "v1" : "v2"],
      );
      const repair = JSON.parse(
        await readFile(new URL(deployment.repairManifest, result.directoryUrl)),
      );
      assert.equal(
        repair.approvedImplementationAddress,
        manifest.implementations.v2,
      );
      assert.equal(
        repair.approvedRuntimeCodeHash,
        manifest.contracts.v2.runtimeCodeHash,
      );
      assert.equal(repair.testPackDigest, manifest.testPack.digest);
    }
    for (const [name, boundary] of [
      ["OracleAdapterV1", adapterAbi],
      ["OracleAdapterV2", adapterAbi],
      ["RiverMarket", marketAbi],
      ["TestPriceSource", priceSourceAbi],
    ]) {
      const bytes = await readFile(
        new URL(manifest.abis[name].path, result.directoryUrl),
      );
      assert.equal(keccak256(toHex(bytes)), manifest.abis[name].digest);
      const abi = JSON.parse(bytes);
      for (const item of boundary) {
        const actual = abi.find(
          (f) =>
            f.type === "function" &&
            toFunctionSelector(f) === toFunctionSelector(item),
        );
        assert.ok(actual, `${name}.${item.name} selector`);
        assert.deepEqual(
          actual.outputs.map((o) => o.type),
          item.outputs.map((o) => o.type),
        );
        assert.equal(actual.stateMutability, item.stateMutability);
      }
    }
    console.log(`Validated genuine local manifest: ${result.manifestPath}`);
  } finally {
    await result.stop();
  }
});

test("local launcher rejects remote endpoints and unsafe configuration before starting", async () => {
  await assert.rejects(
    deployLocal({ rpcUrl: "https://example.invalid" }),
    /Unknown option/,
  );
  await assert.rejects(deployLocal({ count: 0 }), /count/);
  await assert.rejects(deployLocal({ maxAge: "0" }), /maxAge/);
  await assert.rejects(deployLocal({ unsafeDecimals: 8 }), /unsafeDecimals/);
});
