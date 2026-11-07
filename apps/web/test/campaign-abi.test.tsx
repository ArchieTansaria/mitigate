import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { encodeAbiParameters, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { hashPolicy } from "../../../packages/schema/src/encoding";
import {
  campaignAbi,
  campaignRegistryAbi,
  campaignVerifierAbi,
} from "../lib/campaign-abi";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("campaign ABI and canonical encoding parity", () => {
  it("matches freshly compiled current contract output, including PB-18/19 actions", () => {
    const solc = require("solc") as {
      compile: (
        input: string,
        callbacks: { import: (path: string) => { contents: string } },
      ) => string;
    };
    const paths = [
      "pb17/RemediationCampaign.sol",
      "pb15/CampaignRegistry.sol",
      "pb16/AcceptanceVerifier.sol",
    ];
    const input = {
      language: "Solidity",
      sources: Object.fromEntries(
        paths.map((path) => [path, { content: read(`contracts/${path}`) }]),
      ),
      settings: { outputSelection: { "*": { "*": ["abi"] } } },
    };
    const compiled = JSON.parse(
      solc.compile(JSON.stringify(input), {
        import(path) {
          return {
            contents: read(
              `contracts/${path.replace("@openzeppelin/contracts/", "lib/openzeppelin-contracts/contracts/")}`,
            ),
          };
        },
      }),
    );
    expect(
      compiled.errors?.filter(
        (e: { severity: string }) => e.severity === "error",
      ) ?? [],
    ).toEqual([]);
    for (const [path, name, abi] of [
      [paths[0], "RemediationCampaign", campaignAbi],
      [paths[1], "CampaignRegistry", campaignRegistryAbi],
      [paths[2], "AcceptanceVerifier", campaignVerifierAbi],
    ] as const) {
      expect(abi).toEqual(
        compiled.contracts[path][name].abi.filter(
          (entry: { type: string }) =>
            entry.type === "function" || entry.type === "error",
        ),
      );
    }
  });
  it("encodes the same policy bytes/hash as shared encoding.ts and the frozen PB-03 vector", () => {
    const vectors = JSON.parse(read("docs/interfaces/pb03-vectors.json"));
    const entry = campaignAbi.find(
      (e) => e.type === "function" && e.name === "policy",
    );
    if (!entry) throw new Error("Policy ABI missing");
    const policy = Object.fromEntries(
      entry.outputs[0].components.map((field) => [
        field.name,
        field.type.startsWith("uint")
          ? BigInt(vectors.policy[field.name])
          : vectors.policy[field.name],
      ]),
    );
    const actual = keccak256(
      encodeAbiParameters(entry.outputs, [policy as never]),
    );
    expect(actual).toBe(hashPolicy(vectors.policy));
  });
});
