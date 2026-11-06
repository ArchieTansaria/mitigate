import { describe, expect, it } from "vitest";
import {
  assertIndependentApprover,
  assertSupportedEnsChain,
  createManifestPointer,
  resolveManifestPayload,
} from "../src/publication.ts";
import { getAddress } from "viem";

const manifest = {
  schemaVersion: 1 as const,
  releaseId: "oracle-adapter-2026-11-07",
  issueDescription: "Reject stale oracle observations.",
  supportedPatternId: "eip1967-transparent-v1" as const,
  sourceChainId: "11155111",
  approvedImplementationAddress: "0x1111111111111111111111111111111111111111",
  approvedRuntimeCodeHash: `0x${"1".repeat(64)}`,
  configurationPredicates: [],
  testPackDigest: `0x${"2".repeat(64)}`,
  requiredAssertionIds: ["stale-price-rejected"],
  prerequisites: [],
  artifactRefs: [],
};

describe("ENS release publication", () => {
  it("binds a content pointer to the canonical, schema-validated manifest", () => {
    const pointer = createManifestPointer(
      manifest,
      "https://releases.example.test/oracle-adapter.json",
      "0x1111111111111111111111111111111111111111",
    );

    expect(pointer.releaseId).toBe(manifest.releaseId);
    expect(pointer.manifestDigest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(
      resolveManifestPayload(pointer, JSON.stringify(manifest)),
    ).toEqual(manifest);
  });

  it("rejects content that does not match the approved ENS pointer", () => {
    const pointer = createManifestPointer(
      manifest,
      "https://releases.example.test/oracle-adapter.json",
      "0x1111111111111111111111111111111111111111",
    );

    expect(() =>
      resolveManifestPayload(
        pointer,
        JSON.stringify({ ...manifest, issueDescription: "changed after approval" }),
      ),
    ).toThrow(/digest mismatch/i);
  });

  it("rejects malformed manifests and non-HTTPS artifact locations", () => {
    expect(() =>
      createManifestPointer(
        { ...manifest, unexpected: true },
        "https://releases.example.test/oracle-adapter.json",
        "0x1111111111111111111111111111111111111111",
      ),
    ).toThrow();
    expect(() =>
      createManifestPointer(
        manifest,
        "file:///etc/passwd",
        "0x1111111111111111111111111111111111111111",
      ),
    ).toThrow(/https/i);
  });

  it("requires a different wallet to approve a candidate release", () => {
    expect(() =>
      assertIndependentApprover(
        "0x1111111111111111111111111111111111111111",
        "0x1111111111111111111111111111111111111111",
      ),
    ).toThrow(/different/i);
    expect(
      assertIndependentApprover(
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ),
    ).toBe(getAddress("0x2222222222222222222222222222222222222222"));
  });

  it("only targets ENS mainnet or Sepolia", () => {
    expect(assertSupportedEnsChain(1)).toBe(1);
    expect(assertSupportedEnsChain(11_155_111)).toBe(11_155_111);
    expect(() => assertSupportedEnsChain(31337)).toThrow(/mainnet or Sepolia/i);
  });
});
