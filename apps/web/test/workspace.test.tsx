import { describe, expect, it } from "vitest";
import {
  parseInventoryInput,
  parseRunReferences,
  validateRunId,
} from "../lib/workspace";

describe("workspace input boundaries", () => {
  it("does not turn malformed browser storage into real jobs", () => {
    expect(parseRunReferences("bad")).toEqual([]);
    expect(
      parseRunReferences(
        JSON.stringify([{ id: "invented", createdAt: "today" }]),
      ),
    ).toEqual([]);
    expect(validateRunId("../../auth/verify")).toBe(false);
  });
  it("requires a deployment and validates address and chain fields", () => {
    expect(() =>
      parseInventoryInput({ schemaVersion: 1, deployments: [] }),
    ).toThrow();
    expect(() =>
      parseInventoryInput({
        schemaVersion: 1,
        deployments: [{ chainId: "1", entrypoint: "wrong" }],
      }),
    ).toThrow();
  });
  it("keeps only validated run references and caps recent history", () => {
    const run = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      createdAt: "2026-11-07T00:00:00.000Z",
      name: "Repair",
    };
    expect(parseRunReferences(JSON.stringify([run]))).toEqual([run]);
    expect(parseRunReferences(JSON.stringify([run, run]))).toEqual([run]);
  });
});
