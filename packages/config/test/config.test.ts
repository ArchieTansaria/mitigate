import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.ts";

const network = {
  schemaVersion: 1,
  environment: "testnet",
  source: { chainId: "11155111", ccipSelector: "16015286601757825753" },
  destination: {
    chainId: "5042002",
    ccipSelector: "3034092155422581607",
    usdc: "0x3600000000000000000000000000000000000000",
    decimals: 6,
  },
};
const env = {
  PATCHBOND_MODE: "testnet",
  SEPOLIA_RPC_URL: "https://rpc.example/secret",
  ARC_TESTNET_RPC_URL: "https://arc.example",
  DATABASE_URL: "postgresql://dbuser:secret@localhost/patchbond",
  API_ORIGIN: "https://patchbond.example",
  ARTIFACT_BACKEND: "s3",
  ARTIFACT_BUCKET: "patchbond",
  ARTIFACT_REGION: "us-east-1",
  EVALUATOR_ADDRESS: "0x1111111111111111111111111111111111111111",
};
describe("validated runtime configuration", () => {
  it("accepts explicit testnet config without inventing undeployed contract addresses", () => {
    const c = loadConfig(env, network);
    expect(c.network.source.chainId).toBe("11155111");
    expect(c.artifacts.kind).toBe("s3");
    expect(c.network.deployments).toBeUndefined();
  });
  it("fails safely on missing secret configuration", () => {
    expect(() =>
      loadConfig({ ...env, DATABASE_URL: undefined }, network),
    ).toThrow("DATABASE_URL");
  });
  it("rejects wrong chains, selectors, decimals and invalid addresses", () => {
    for (const patch of [
      { chainId: "1" },
      { ccipSelector: "1" },
      { decimals: 18 },
      { usdc: "0x0" },
    ])
      expect(() =>
        loadConfig(env, {
          ...network,
          destination: { ...network.destination, ...patch },
        }),
      ).toThrow();
  });
  it("never accepts local artifacts or loopback RPC as testnet configuration", () => {
    expect(() =>
      loadConfig(
        {
          ...env,
          ARTIFACT_BACKEND: "filesystem",
          ARTIFACT_DIRECTORY: "/tmp/evidence",
        },
        network,
      ),
    ).toThrow();
    expect(() =>
      loadConfig({ ...env, SEPOLIA_RPC_URL: "http://127.0.0.1:8545" }, network),
    ).toThrow();
    expect(() =>
      loadConfig({ ...env, PATCHBOND_MODE: "local" }, network),
    ).toThrow();
  });
  it("allows explicit local mode with loopback networks and file artifacts", () => {
    const c = loadConfig(
      {
        ...env,
        PATCHBOND_MODE: "local",
        API_ORIGIN: "http://localhost:3000",
        SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
        ARC_TESTNET_RPC_URL: "http://127.0.0.1:8546",
        ARTIFACT_BACKEND: "filesystem",
        ARTIFACT_DIRECTORY: "/tmp/patchbond-artifacts",
      },
      {
        ...network,
        environment: "local",
        source: { ...network.source, chainId: "31337" },
        destination: { ...network.destination, chainId: "31338" },
      },
    );
    expect(c.mode).toBe("local");
  });
  it("redacts values in configuration failures and public status", () => {
    try {
      loadConfig(
        { ...env, DATABASE_URL: "https://user:secret@private" },
        network,
      );
    } catch (e) {
      expect(String(e)).not.toContain("secret");
    }
    expect(JSON.stringify(loadConfig(env, network).publicStatus)).not.toContain(
      "secret",
    );
  });
  it("bounds work limits and rejects invalid deployment metadata", () => {
    expect(() =>
      loadConfig({ ...env, MAX_ACTIVE_RUNS: "0" }, network),
    ).toThrow();
    expect(() =>
      loadConfig(env, { ...network, deployments: { campaign: "0x123" } }),
    ).toThrow();
  });
});
