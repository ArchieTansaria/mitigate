import { describe, expect, it } from "vitest";
import { advanceDemo, demoBudget, initialDemo } from "../lib/demo";

describe("explicit recording simulation", () => {
  it("cannot turn a failed repair or unissued receipt into a payable claim", () => {
    for (const action of ["claim", "withdraw", "finalize", "receipt"] as const)
      expect(advanceDemo(initialDemo(), action)).toEqual(initialDemo());
    const scanned = advanceDemo(initialDemo(), "scan");
    expect(advanceDemo(scanned, "claim")).toEqual(scanned);
  });
  it("requires repair and recheck before issuing a simulated receipt", () => {
    let state = advanceDemo(initialDemo(), "scan");
    state = advanceDemo(state, "repair");
    expect(advanceDemo(state, "receipt")).toEqual(state);
    state = advanceDemo(state, "recheck");
    state = advanceDemo(state, "receipt");
    expect(state.stage).toBe("receipt");
  });
  it("keeps the funded budget conserved across reservation, award, payment and recovery", () => {
    let state = initialDemo();
    for (const action of [
      "scan",
      "repair",
      "recheck",
      "receipt",
      "claim",
      "finalize",
      "withdraw",
      "replay",
      "close",
    ] as const) {
      state = advanceDemo(state, action);
      const b = demoBudget(state);
      expect(b.unallocated + b.reserved + b.awarded + b.paid + b.refunded).toBe(
        60,
      );
    }
    expect(demoBudget(state)).toEqual({
      unallocated: 0,
      reserved: 0,
      awarded: 0,
      paid: 20,
      refunded: 40,
    });
    expect(state.duplicateBlocked).toBe(true);
    expect(advanceDemo(state, "withdraw")).toEqual(state);
    expect(advanceDemo(state, "claim")).toEqual(state);
  });
});
