# PB-21 CRE workflow evidence

Updated 2026-11-07. The local PB-21 evaluator is implemented in `workflows/cre/src/evaluator.ts` and invoked by the CRE workflow entry point in `workflows/cre/src/main.ts`. It consumes the shared PB-10 signed-bundle shape and PB-03/PB-14 schemas, checks the verifier signature and exact campaign, scope, test-pack, recipient, assertion and deployment coverage, and compares source snapshots plus PB-15/PB-17 campaign facts at finalized chain heights. Its report always sets `settlementEligible: false`; it does not sign a PB-03 `AcceptanceReceipt` or deliver a message.

## Local checks

The repository Vitest config now includes `workflows/cre/**/*.test.ts` (excluding the unrelated Bun-based `workflows/cre-probe` tests). The direct task command passed:

```sh
pnpm exec vitest run workflows/cre/test/workflow.test.ts
```

Result: 1 test file passed, 6 tests passed. Cases use a deterministic test-only key and synthetic evidence; they prove validator behavior only. They cover a consistent signed input, policy hash mismatch, omitted deployment, poisoned and stale responses, incompatible finalized snapshot, diagnostic purpose, and a non-pass mandatory outcome.

The repository check passed with Node 24.22.0: `pnpm lint`, root `pnpm typecheck`, the isolated CRE workflow typecheck, fixture build, Vitest (15 files, 73 tests) and Foundry (14 suites, 340 tests). Foundry emitted existing fixture lints for timestamp comparisons and safe test casts. The CRE workflow is checked with its own bundler TypeScript config so its SDK runtime types stay separate from the Node.js application config.

The PB-21 workflow typecheck passed:

```sh
pnpm exec tsc --noEmit -p workflows/cre/tsconfig.json
```

`workflows/cre/package.json` pins `@chainlink/cre-sdk` 1.23.0, matching the existing capability probe. The root `pnpm check` runs this isolated typecheck. Biome includes and checks both `integrations/` and `workflows/cre/`.

## CRE CLI and live boundaries

The installed CRE CLI is v1.39.0. PB-21 now has `workflow.yaml`, `project.yaml`, and a deliberately non-runnable `config.example.json`. The command `PATH=/Users/archietans/.bun/bin:$PATH /Users/archietans/.cre/bin/cre workflow build . --output /private/tmp/pb21-cre.wasm` passed after splitting the evaluator from the WASM entry point. The latest local WASM hash is `1f7bca8de6923a544459cfe4675061f9ef7bca323abdf959c31a02c9317fe4a9`.

Studio workspace `065d8b0d-a1c2-449a-b893-2e8b80041c79` also compiled PB-21 and passed the focused tests/typecheck. Its first build warned about nondeterministic `Object.values()` traversal in shared JSON validation. `packages/schema/src/encoding.ts` now sorts keys for deterministic validation; after syncing that fix, Studio confirmed the warning was gone and produced WASM hash `e7b151109fa844d845336e39ed8e7446268da94b10e18a1a0c4159357f8fd2fa`. Hashes vary by build environment.

No valid PB-21 simulation was run. The example config has no real campaign policy, deployed addresses, immutable campaign-claim evidence, matching eligibility proof, or verifier-produced receipt, so it must not be treated as runnable input. An earlier simulation attempt exited before compilation because the CLI could not validate its cached login (`login.chain.link` DNS lookup failed). No credential was requested, read, or changed. The existing PB-01/PB-03 capability probe had a successful WASM simulation, but it tested a public fixture, HTTP and Sepolia reads; it is not a PB-21 product workflow run.

The current PB-10 producer explicitly creates `purpose: diagnostic` evidence and refuses to build campaign-claim evidence. PB-21 rejects that diagnostic purpose. PB-16 supplies the frozen receipt validator interface, but this checkout has no A-owned receipt producer that turns campaign-claim evidence into a signed receipt. PB-20 sender/receiver contracts and local simulation tests are present, but do not consume this evaluation report or prove live delivery. Accordingly this workflow cannot issue a receipt or claim delivery to a receiver. CRE deploy access remains disabled; no access request, deployment, forwarder execution, receiver transaction or broadcast was attempted.

The evaluator's positive unit case is synthetic and never represented as live evidence. A successful signature check attests to the configured evaluator's signed bytes; it does not prove honest execution. Simulation, deployed DON consensus, authenticated forwarder delivery and receiver state remain separate gates.
