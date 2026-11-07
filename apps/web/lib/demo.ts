/** Isolated presentation fixtures. Never imported by API, verifier or campaign adapters. */
export type DemoStage =
  | "ready"
  | "scanned"
  | "repaired"
  | "rechecked"
  | "receipt"
  | "pending"
  | "awarded"
  | "paid"
  | "closed";
export type DemoAction =
  | "scan"
  | "repair"
  | "recheck"
  | "receipt"
  | "claim"
  | "finalize"
  | "withdraw"
  | "replay"
  | "close";
export type DemoState = {
  stage: DemoStage;
  duplicateBlocked: boolean;
  log: string[];
};
export function initialDemo(): DemoState {
  return {
    stage: "ready",
    duplicateBlocked: false,
    log: ["Demo campaign: 60 test USDC allocated to 3 eligible deployments."],
  };
}
const transitions: Partial<
  Record<DemoAction, { from: DemoStage; to: DemoStage; message: string }>
> = {
  scan: {
    from: "ready",
    to: "scanned",
    message: "Simulated checks complete: 1 passes, 2 require attention.",
  },
  repair: {
    from: "scanned",
    to: "repaired",
    message:
      "Simulated owner action: Bazaar's maximum price age changed from 86,400s to 90s.",
  },
  recheck: {
    from: "repaired",
    to: "rechecked",
    message:
      "Fresh simulated recheck: Bazaar rejects stale prices and still accepts fresh prices.",
  },
  receipt: {
    from: "rechecked",
    to: "receipt",
    message:
      "Demo-only campaign acceptance prepared. No signature or CRE/CCIP delivery was generated.",
  },
  claim: {
    from: "receipt",
    to: "pending",
    message: "Simulated Bazaar claim reserves 20 test USDC; no payment yet.",
  },
  finalize: {
    from: "pending",
    to: "awarded",
    message:
      "Demo clock advanced beyond the challenge window. Unchallenged claim awarded.",
  },
  withdraw: {
    from: "awarded",
    to: "paid",
    message:
      "Simulated customer withdrawal: 20 test USDC. No tokens moved onchain.",
  },
  close: {
    from: "paid",
    to: "closed",
    message:
      "Demo clock advanced beyond campaign deadline. Supplier recovers 40 unallocated test USDC.",
  },
};
export function advanceDemo(state: DemoState, action: DemoAction): DemoState {
  if (action === "replay" && state.stage === "paid" && !state.duplicateBlocked)
    return {
      ...state,
      duplicateBlocked: true,
      log: [
        ...state.log,
        "Duplicate demo claim blocked: this deployment has already received its grant.",
      ],
    };
  const transition = transitions[action];
  if (!transition || transition.from !== state.stage) return state;
  return {
    ...state,
    stage: transition.to,
    log: [...state.log, transition.message],
  };
}
export function demoBudget(state: DemoState) {
  const reserved = state.stage === "pending" ? 20 : 0;
  const awarded = state.stage === "awarded" ? 20 : 0;
  const paid = state.stage === "paid" || state.stage === "closed" ? 20 : 0;
  const refunded = state.stage === "closed" ? 40 : 0;
  return {
    unallocated: 60 - reserved - awarded - paid - refunded,
    reserved,
    awarded,
    paid,
    refunded,
  };
}
export const demoOrder: DemoStage[] = [
  "ready",
  "scanned",
  "repaired",
  "rechecked",
  "receipt",
  "pending",
  "awarded",
  "paid",
  "closed",
];
