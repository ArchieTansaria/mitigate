#!/usr/bin/env node
// Only spawns and talks to its own loopback Anvil. No caller-supplied RPC, keys, fork URL or live-send mode.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import canonicalize from "canonicalize";
import { createPublicClient, http, getAddress, keccak256, toHex } from "viem";
import { foundryBinary } from "../scripts/foundry-binary.ts";
import { ManifestSchema } from "../packages/schema/src/types.ts";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const compiler = fileURLToPath(new URL("../scripts/solc.mjs", import.meta.url));
const adminSlot =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const cleanEnv = () =>
  Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
const jsonSafe = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
const digest = (bytes) => keccak256(toHex(bytes));
const addressFromSlot = (value) => getAddress(`0x${value.slice(-40)}`);

async function writeCanonical(path, value) {
  const bytes = canonicalize(jsonSafe(value));
  await writeFile(path, bytes);
  return digest(bytes);
}

async function vacantPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function runForge(args, env) {
  const child = spawn(foundryBinary("forge"), args, {
    cwd: fixtureRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      output += data;
    });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 90_000);
  try {
    const [status, signal] = await once(child, "exit");
    if (status !== 0)
      throw new Error(`Forge failed (${status ?? signal}):\n${output}`);
    return output;
  } finally {
    clearTimeout(timeout);
  }
}

export async function deployLocal(options = {}) {
  for (const key of Object.keys(options)) {
    if (
      !["count", "maxAge", "price", "unsafeDecimals", "keepAlive"].includes(key)
    )
      throw new Error(`Unknown option: ${key}`);
  }
  const {
    count = 3,
    maxAge = "3600",
    price = "200000000000",
    unsafeDecimals = 6,
    keepAlive = false,
  } = options;
  assert.ok(
    Number.isInteger(count) && count >= 3 && count <= 12,
    "count must be 3..12",
  );
  assert.ok(
    typeof maxAge === "string" &&
      /^[1-9][0-9]*$/.test(maxAge) &&
      BigInt(maxAge) <= 86400n,
    "maxAge must be a decimal string in 1..86400",
  );
  assert.ok(
    typeof price === "string" &&
      /^[1-9][0-9]*$/.test(price) &&
      BigInt(price) <= 10n ** 30n,
    "price must be a positive decimal string <= 1e30",
  );
  assert.ok(
    Number.isInteger(unsafeDecimals) &&
      unsafeDecimals >= 0 &&
      unsafeDecimals <= 18 &&
      unsafeDecimals !== 8,
    "unsafeDecimals must be 0..18 and differ from 8",
  );
  assert.equal(typeof keepAlive, "boolean");
  const oz = JSON.parse(
    await readFile(
      new URL(
        "../contracts/lib/openzeppelin-contracts/package.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(oz.version, "5.4.0", "pinned OZ version required");
  const generatedRoot = new URL("generated/", import.meta.url);
  await mkdir(generatedRoot, { recursive: true });
  const directory = await mkdtemp(
    fileURLToPath(new URL("run-", generatedRoot)),
  );
  const directoryUrl = pathToFileURL(`${directory}/`);
  const port = await vacantPort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil = spawn(
    foundryBinary("anvil"),
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "31337",
      "--accounts",
      "3",
      "--silent",
    ],
    { env: cleanEnv(), stdio: "ignore" },
  );
  let startError;
  anvil.on("error", (error) => {
    startError = error;
  });
  let retained = false;
  const stop = async () => {
    if (!anvil.pid) return;
    if (anvil.exitCode === null && anvil.signalCode === null) {
      const exited = once(anvil, "exit");
      anvil.kill("SIGTERM");
      await exited;
    }
  };
  try {
    const client = createPublicClient({
      transport: http(rpcUrl, { retryCount: 0, timeout: 1000 }),
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (startError) throw startError;
      if (anvil.exitCode !== null || anvil.signalCode !== null)
        throw new Error(
          "Child Anvil failed to start; refusing any existing endpoint",
        );
      try {
        ready = (await client.getChainId()) === 31337;
        if (ready) break;
      } catch {
        /* Child may still be starting; bounded startup wait only. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Child Anvil did not become ready");
    const clientVersion = await client.request({
      method: "web3_clientVersion",
    });
    assert.match(clientVersion, /anvil/i);
    assert.equal(
      await client.getBlockNumber({ cacheTime: 0 }),
      0n,
      "must start from a fresh local chain",
    );
    const accounts = await client.request({ method: "eth_accounts" });
    const [supplier, customer] = accounts
      .slice(0, 2)
      .map((address) => getAddress(address));
    assert.notEqual(supplier, customer);
    const addressMapPath = `${directory}/address-map.simulation.json`;
    const env = {
      ...cleanEnv(),
      PB07_SUPPLIER: supplier,
      PB07_CUSTOMER: customer,
      PB07_COUNT: String(count),
      PB07_MAX_AGE: maxAge,
      PB07_PRICE: price,
      PB07_UNSAFE_DECIMALS: String(unsafeDecimals),
      PB07_ADDRESS_MAP: addressMapPath,
    };
    const output = await runForge(
      [
        "script",
        "script/Deploy.s.sol:Deploy",
        "--root",
        fixtureRoot,
        "--use",
        compiler,
        "--rpc-url",
        rpcUrl,
        "--sender",
        supplier,
        "--broadcast",
        "--unlocked",
        "--slow",
        "--non-interactive",
      ],
      env,
    );
    await writeFile(`${directory}/forge.log`, output);
    const addresses = JSON.parse(await readFile(addressMapPath));
    const block = await client.getBlock({ blockTag: "latest" });
    const blockNumber = block.number;
    const snapshot = {
      blockNumber: blockNumber.toString(),
      blockHash: block.hash,
      blockTimestamp: block.timestamp.toString(),
    };
    const transactions = [];
    for (let n = 1n; n <= blockNumber; n++) {
      const b = await client.getBlock({ blockNumber: n });
      for (const hash of b.transactions) {
        const tx = await client.getTransaction({ hash });
        const receipt = await client.getTransactionReceipt({ hash });
        assert.equal(receipt.status, "success", `failed deployment ${hash}`);
        assert.equal(receipt.blockHash, b.hash);
        assert.equal(getAddress(tx.from), supplier);
        assert.equal(tx.to, null, "recipe only creates fixture contracts");
        transactions.push({
          hash,
          transaction: jsonSafe(tx),
          receipt: jsonSafe(receipt),
        });
      }
    }
    assert.equal(
      transactions.length,
      2 + 3 * count,
      "missing or extra mined transactions",
    );
    const contracts = {};
    const createdBy = (address) => {
      const match = transactions.find(
        (t) =>
          t.receipt.contractAddress &&
          getAddress(t.receipt.contractAddress) === getAddress(address),
      );
      assert.ok(match, `no mined creation receipt for ${address}`);
      return match.hash;
    };
    async function recordContract(
      name,
      address,
      deploymentTransactionHash = createdBy(address),
    ) {
      address = getAddress(address);
      const runtimeBytecode = await client.getCode({ address, blockNumber });
      assert.ok(
        runtimeBytecode && runtimeBytecode !== "0x",
        `missing deployed code: ${name}`,
      );
      contracts[name] = {
        address,
        deploymentTransactionHash,
        runtimeBytecode,
        runtimeCodeHash: keccak256(runtimeBytecode),
      };
      return address;
    }
    const implementations = {
      v1: await recordContract("v1", addresses.v1),
      v2: await recordContract("v2", addresses.v2),
    };
    const abis = {};
    const artifacts = {};
    await mkdir(`${directory}/abi`);
    for (const name of [
      "TestPriceSource",
      "OracleAdapterV1",
      "OracleAdapterV2",
      "RiverMarket",
      "TransparentUpgradeableProxy",
      "ITransparentUpgradeableProxy",
      "ProxyAdmin",
    ]) {
      const file =
        name === "ITransparentUpgradeableProxy"
          ? "TransparentUpgradeableProxy"
          : name;
      artifacts[name] = JSON.parse(
        await readFile(`${fixtureRoot}out/${file}.sol/${name}.json`),
      );
      const path = `abi/${name}.json`;
      abis[name] = {
        path,
        digest: await writeCanonical(
          `${directory}/${path}`,
          artifacts[name].abi,
        ),
      };
    }
    // Implementations have no immutables; require that mined runtime matches this compilation, not stale artifacts.
    for (const [key, name] of [
      ["v1", "OracleAdapterV1"],
      ["v2", "OracleAdapterV2"],
    ]) {
      assert.equal(
        contracts[key].runtimeBytecode,
        artifacts[name].deployedBytecode.object,
      );
    }
    const packFiles = ["OracleAdapterAssertions.sol", "pack.json", "README.md"];
    const packInventory = [];
    await mkdir(`${directory}/testpack`);
    for (const name of packFiles) {
      const bytes = await readFile(
        new URL(`../testpacks/oracle-adapter/${name}`, import.meta.url),
      );
      await writeFile(`${directory}/testpack/${name}`, bytes);
      packInventory.push({ path: name, digest: digest(bytes) });
    }
    const testPack = {
      path: "testpack/index.json",
      digest: await writeCanonical(`${directory}/testpack/index.json`, {
        schemaVersion: 1,
        files: packInventory,
      }),
    };
    const read = (address, contract, functionName, args = []) =>
      client.readContract({
        address,
        abi: artifacts[contract].abi,
        functionName,
        args,
        blockNumber,
      });
    const deployments = [];
    for (let i = 0; i < count; i++) {
      const scenario = ["old", "repaired", "unsafe-decimals"][i % 3];
      const source = await recordContract(`source-${i}`, addresses.sources[i]);
      const proxy = await recordContract(`proxy-${i}`, addresses.proxies[i]);
      const market = await recordContract(`market-${i}`, addresses.markets[i]);
      const proxyAdmin = addressFromSlot(
        await client.getStorageAt({
          address: proxy,
          slot: adminSlot,
          blockNumber,
        }),
      );
      const implementation = addressFromSlot(
        await client.getStorageAt({
          address: proxy,
          slot: implementationSlot,
          blockNumber,
        }),
      );
      assert.equal(
        implementation,
        implementations[scenario === "old" ? "v1" : "v2"],
      );
      // The admin is created internally by this exact proxy constructor; match its AdminChanged event in the mined receipt.
      const proxyTx = transactions.find(
        (t) => t.hash === contracts[`proxy-${i}`].deploymentTransactionHash,
      );
      const event = proxyTx.receipt.logs.find(
        (log) =>
          getAddress(log.address) === proxy &&
          log.topics[0] === keccak256(toHex("AdminChanged(address,address)")),
      );
      assert.ok(event, "mined proxy creation lacks AdminChanged");
      assert.equal(addressFromSlot(event.data), proxyAdmin);
      await recordContract(`admin-${i}`, proxyAdmin, proxyTx.hash);
      const [
        observedSource,
        observedAdapter,
        configOwner,
        marketOwner,
        proxyAdminOwner,
        observedAge,
        decimals,
        paused,
        priceData,
        quote,
      ] = await Promise.all([
        read(proxy, "OracleAdapterV1", "priceSource"),
        read(market, "RiverMarket", "adapter"),
        read(proxy, "OracleAdapterV1", "configurationOwner"),
        read(market, "RiverMarket", "owner"),
        read(proxyAdmin, "ProxyAdmin", "owner"),
        read(proxy, "OracleAdapterV1", "maxAge"),
        read(proxy, "OracleAdapterV1", "priceDecimals"),
        read(market, "RiverMarket", "paused"),
        read(source, "TestPriceSource", "latestPrice"),
        read(market, "RiverMarket", "quoteCollateral", [3n * 10n ** 18n]),
      ]);
      assert.equal(getAddress(observedSource), source);
      assert.equal(getAddress(observedAdapter), proxy);
      assert.equal(getAddress(configOwner), customer);
      assert.equal(getAddress(marketOwner), customer);
      assert.equal(getAddress(proxyAdminOwner), supplier);
      assert.equal(observedAge.toString(), maxAge);
      assert.equal(
        decimals,
        scenario === "unsafe-decimals" ? unsafeDecimals : 8,
      );
      assert.equal(paused, false);
      assert.equal(priceData[0].toString(), price);
      const repairManifest = `repair-${i}.json`;
      const repair = ManifestSchema.parse({
        schemaVersion: 1,
        releaseId: "pb07-local-stale-price-v2",
        issueDescription:
          "Artificial V1 accepts stale price; V2 enforces maxAge. Configuration and valid operation remain required.",
        supportedPatternId: "eip1967-transparent-v1",
        sourceChainId: "31337",
        approvedImplementationAddress: implementations.v2,
        approvedRuntimeCodeHash: contracts.v2.runtimeCodeHash,
        configurationPredicates: [
          {
            id: "price-source",
            readMethod: "priceSource()",
            operator: "eq",
            expected: source,
          },
          {
            id: "max-age",
            readMethod: "maxAge()",
            operator: "eq",
            expected: maxAge,
          },
          {
            id: "price-decimals",
            readMethod: "priceDecimals()",
            operator: "eq",
            expected: "8",
          },
          {
            id: "customer-config-owner",
            readMethod: "configurationOwner()",
            operator: "eq",
            expected: customer,
          },
        ],
        testPackDigest: testPack.digest,
        requiredAssertionIds: [
          "configuration",
          "stale-rejected",
          "valid-quote",
        ],
        prerequisites: [
          "Local diagnostic only; not a signed receipt or campaign acceptance",
          "Supplier owns ProxyAdmin; customer owns configuration and market",
          "PB-08/PB-09 must bind all reads and interventions to one source snapshot",
        ],
        artifactRefs: [
          {
            uri: new URL(testPack.path, directoryUrl).href,
            digest: testPack.digest,
          },
        ],
      });
      const repairManifestDigest = await writeCanonical(
        `${directory}/${repairManifest}`,
        repair,
      );
      deployments.push({
        scenario,
        source,
        proxy,
        market,
        proxyAdmin,
        implementation,
        repairManifest,
        repairManifestDigest,
        observed: {
          configurationOwner: getAddress(configOwner),
          marketOwner: getAddress(marketOwner),
          proxyAdminOwner: getAddress(proxyAdminOwner),
          maxAge: observedAge.toString(),
          priceDecimals: decimals,
          paused,
          price: priceData[0].toString(),
          updatedAt: priceData[1].toString(),
          quoteForThreeCollateral: quote.toString(),
        },
      });
    }
    assert.equal(
      (await client.getBlock({ blockNumber })).hash,
      snapshot.blockHash,
      "snapshot changed during export",
    );
    const manifest = {
      schemaVersion: 1,
      executionKind: "local-anvil",
      claimEligible: false,
      chainId: "31337",
      snapshot,
      tools: {
        anvil: clientVersion,
        solc: artifacts.OracleAdapterV2.metadata.compiler.version,
        openZeppelin: oz.version,
      },
      roles: { supplier, customer },
      implementations,
      deployments,
      contracts,
      transactions,
      abis,
      testPack,
      limitations: [
        "Fresh local Anvil only; no Sepolia or Arc deployment",
        "No verification outcome or signed acceptance receipt",
        "Source is an artificial owner-controlled oracle; market only quotes",
        "Snapshot is historical once this disposable chain is stopped",
      ],
    };
    const manifestPath = `${directory}/manifest.json`;
    const manifestDigest = await writeCanonical(manifestPath, manifest);
    await writeCanonical(`${directory}/manifest-digest.json`, {
      algorithm: "keccak256",
      encoding: "RFC8785 canonical JSON UTF-8",
      manifestDigest,
    });
    if (keepAlive) retained = true;
    return {
      manifestPath,
      manifestDigest,
      directoryUrl,
      ...(keepAlive ? { rpcUrl, stop } : {}),
    };
  } finally {
    if (!retained) await stop();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
      const key = {
        "--count": "count",
        "--max-age": "maxAge",
        "--price": "price",
        "--unsafe-decimals": "unsafeDecimals",
        "--keep-alive": "keepAlive",
      }[args[i]];
      if (!key) throw new Error(`Unknown option: ${args[i]}`);
      if (key === "keepAlive") options[key] = true;
      else {
        const value = args[++i];
        if (!value) throw new Error("Missing option value");
        options[key] = ["count", "unsafeDecimals"].includes(key)
          ? Number(value)
          : value;
      }
    }
    const result = await deployLocal(options);
    console.log(
      JSON.stringify(
        {
          manifestPath: result.manifestPath,
          manifestDigest: result.manifestDigest,
          ...(result.rpcUrl ? { rpcUrl: result.rpcUrl } : {}),
        },
        null,
        2,
      ),
    );
    if (result.stop) {
      for (const signal of ["SIGINT", "SIGTERM"])
        process.once(signal, async () => {
          await result.stop();
          process.exit(0);
        });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
