# Backend handoff evidence

**Result: NOT PASSED — PB-24 remains blocked.** This note records the backend boundary available for frontend planning and the integration steps that remain unavailable.

## Available local flow

The authenticated API supports wallet challenge/verification, tenant-scoped inventories and manifests, verification-scope creation, diagnostic run queue/status/evidence, cancellation/publication of diagnostic evidence, and unsigned repair-action proposals. The independent worker executes the supported diagnostic fixture flow and produces signed diagnostic evidence. API job status now reports `RunStatusV1` (`schemaVersion`, job state, `evidenceReferenceStored`, `repairOutcome: not-evaluated`); assertion outcomes are in the evidence artifact.

Commands verified in the isolated worktree on Node 24.1.0 / pnpm 11.22.0:

```text
pnpm lint                                  PASS — 74 files
pnpm typecheck                             PASS
pnpm typecheck:cre                         PASS
pnpm test                                  PASS — 15 files / 73 tests
pnpm test:integration                      PASS — 12 files / 41 tests
pnpm vectors:check                         PASS — PB-03 vectors match
```

`pnpm test:integration` builds only `contracts/pb03/EncodingHarness.sol` first, so a fresh checkout does not rely on a stale `contracts/out` artifact.

## Campaign path unavailable

The API has no campaign creation/claims/indexer endpoints, does not accept campaign-claim runs, and the CRE evaluator cannot sign or deliver an acceptance receipt. PB-22 has no reviewed generated ABI exports or deployment manifest. PB-20 is contract/simulation source only in this checkout; its Studio verification, testnet deployment and destination-state evidence are absent. No real campaign terms, funded contract, eligible customer set or signed receipt were available for PB-24.

`pnpm check` is not a complete pass here: its contract stage fails in pinned solc-js 0.8.28 with `RuntimeError: memory access out of bounds` compiling 81 files under Node 24.1.0. The existing PB-20 Studio report of 340 passing Foundry tests is historical evidence from another environment, not a result of this run. A two-machine replay was not performed.

No fixture campaign, canned pass, fake CCIP callback or simulated balance change was substituted for the missing real flow. Keep PB-25 gated until the requirements in `docs/handoffs/PB-24.md` are met.
