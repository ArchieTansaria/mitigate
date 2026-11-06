# PB-12 local repair validation

Recorded 2026-11-07 (Asia/Kolkata). Base `74e904c`; feature result is the Git commit tagged PB-12. Host: existing macOS development machine. No physical second-machine or production claim.

## Actual checks

- RED: four action behavior tests failed against the absent prepare/validate implementation. The HTTP connected-flow test failed with the missing actions route (404); the two pre-existing diagnostic flows passed.
- GREEN: preparation uses real local deployment observations and `eth_call`; the HTTP API/worker test executes the supplier's actual local upgrade and produces a fresh signed passing report. The failed historical report is unchanged; stale revalidation returns 409.
- Independent read-only review found expiry-during-RPC and malformed current-simulation responses. Two regression tests reproduced both (2 failed, 4 passed), then both passed after fixes. The malformed-response test proxies the real local RPC and replaces only the latest repair simulation with null; no production mock path exists.
- `pnpm check`: passed lint/typecheck, 62 TypeScript tests and 25 shared Solidity tests after review fixes.
- `PATCHBOND_REPAIR_DEMO_DIR=.tmp-artifacts/repair-demo pnpm test:integration`: passed all 38 tests across 11 files after review fixes (69.99 seconds).
- `pnpm vectors:check`: shared PB-03 vectors match; financial interface unchanged.
- `pnpm test:fixtures`: 20 Solidity tests passed, including 256-run fuzzing.
- `git diff --check`: clean.

New checks cover supplier/customer authority separation, rejected unauthorized local transactions, no mutation during simulation, changed target/calldata, expiry, state drift after owner repair, unknown authority, path mismatch, nonrecognized approved code, ownerless proxy admin, absent/layout-mutated/source-stale compiler metadata, private API authentication and unknown deployment selection.

Ignored logs: `.tmp-artifacts/pb12-{review-red,review-green,check-final,integration-final,vectors,fixtures}.log`. Inspectable generated local evidence: `.tmp-artifacts/repair-demo/{before,proposal,after,scope,execution}.json`. These artifacts deliberately remain out of Git. The reproducible workflow and source/tests are committed instead. `docs/runbooks/repair.md` explains rerunning/exporting them.

## Interpretation

The known local deployment starts with real failing checks, receives an actual authorized local transaction, then produces fresh independently executed passing diagnostic evidence. Config repair is also prepared, simulated, executed and reinspected in action tests. These tests do not substitute a seed outcome for RPC or regression execution.

The chain is disposable local Anvil. It does not prove Sepolia deployment, hosted Studio callbacks, product CRE evaluation, live CCIP delivery or Arc grant withdrawal. PB-12 never creates a financial receipt. B's contract ownership and shared upgrade-route review remain separate integration gates.

Known benign tool output: Node24 experimental type-stripping warnings; Foundry optional signature-cache write warnings under this sandbox; pre-existing fixture lint advisories. No test failure is dismissed as one of those warnings.

## Deliberate scope

Reviewed exact fixture-family layout/source validation, no initializer, EOA-only repair authority and no automatic unpause or source/ownership changes. The configured RPC and local compiler artifacts remain trusted. State can change between preflight and mining; wallet simulation and fresh post-execution verification are required. RPC quorum, independent build provenance and a shared overall RPC budget remain possible production hardening, not implemented features. No unresolved correctness findings from the independent review are knowingly deferred.
