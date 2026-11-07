import { describe, expect, it } from "vitest";
import {
  emptySample,
  latestSampleResult,
  sampleAccounting,
  sampleInventory,
  samplePolicy,
  updateSample,
} from "../lib/sample-workspace";

function registered() {
  return updateSample(
    updateSample(emptySample(), { type: "policy", input: samplePolicy }),
    { type: "inventory", input: sampleInventory },
  );
}
describe("isolated sample workspace", () => {
  it("derives results from entered configuration rather than deployment identity", () => {
    let s = registered();
    s = updateSample(s, { type: "run", at: "2026-11-07" });
    expect(s.runs[0].results.map((x) => x.pass)).toEqual([true, false, false]);
    s = updateSample(s, { type: "repair", id: "bazaar" });
    expect(latestSampleResult(s, "bazaar")).toBeNull();
    s = updateSample(s, { type: "run", at: "2026-11-07" });
    expect(latestSampleResult(s, "bazaar")?.pass).toBe(true);
  });
  it("gates stale claims, fixes eligibility and conserves budget", () => {
    let s = updateSample(registered(), { type: "fund" });
    expect(() =>
      updateSample(s, { type: "inventory", input: sampleInventory }),
    ).toThrow(/frozen/);
    expect(() => updateSample(s, { type: "claim", id: "bazaar" })).toThrow(
      /fresh/,
    );
    s = updateSample(s, { type: "repair", id: "bazaar" });
    s = updateSample(s, { type: "run", at: "2026-11-07" });
    s = updateSample(s, { type: "claim", id: "bazaar" });
    expect(sampleAccounting(s).reserved).toBe(20);
    expect(() => updateSample(s, { type: "withdraw", id: "bazaar" })).toThrow();
    expect(() => updateSample(s, { type: "close" })).toThrow();
    s = updateSample(s, { type: "finalize", id: "bazaar" });
    s = updateSample(s, { type: "withdraw", id: "bazaar" });
    expect(() => updateSample(s, { type: "claim", id: "bazaar" })).toThrow(
      /Duplicate/,
    );
    s = updateSample(s, { type: "close" });
    expect(sampleAccounting(s)).toEqual({
      funded: 60,
      reserved: 0,
      awarded: 0,
      paid: 20,
      unallocated: 0,
      recovered: 40,
    });
  });
  it("does not pass a disabled application or accept duplicate IDs", () => {
    const input = structuredClone(sampleInventory);
    input.deployments[0].acceptsFreshPrices = false;
    let s = updateSample(registered(), { type: "inventory", input });
    s = updateSample(s, { type: "run", at: "2026-11-07" });
    expect(latestSampleResult(s, "harbor")?.pass).toBe(false);
    input.deployments.push(input.deployments[0]);
    expect(() => updateSample(s, { type: "inventory", input })).toThrow(
      /Duplicate/,
    );
  });
});
