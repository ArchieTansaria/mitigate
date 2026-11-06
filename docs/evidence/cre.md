# PB-21 CRE workflow evidence

Updated 2026-11-07. The local PB-21 evaluator is implemented in `workflows/cre/src/main.ts`. It consumes the shared PB-10 signed-bundle shape and PB-03/PB-14 schemas, checks the verifier signature and exact campaign, scope, test-pack, recipient, assertion and deployment coverage, and compares source snapshots plus PB-15/PB-17 campaign facts at finalized chain heights. Its report always sets `settlementEligible: false`; it does not sign a PB-03 `AcceptanceReceipt` or deliver a message.

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

The installed CRE CLI is v1.39.0. The PB-21 directory has no `workflow.yaml` or `project.yaml`; `cre workflow build . --output /private/tmp/pb21-cre.wasm` exits 1 because `workflow.yaml` is missing. A local simulation attempt exited before compilation because the CLI could not validate its cached login (`login.chain.link` DNS lookup failed). No credential was requested, read, or changed. The existing PB-01/PB-03 capability probe had a successful WASM simulation, but it tested a public fixture, HTTP and Sepolia reads; it is not a PB-21 product workflow run.

The current PB-10 producer explicitly creates `purpose: diagnostic` evidence and refuses to build campaign-claim evidence. PB-21 rejects that diagnostic purpose. PB-16 supplies the frozen receipt validator interface, but this checkout has no A-owned receipt producer that turns campaign-claim evidence into a signed receipt. PB-20 sender/receiver contracts and local simulation tests are present, but do not consume this evaluation report or prove live delivery. Accordingly this workflow cannot issue a receipt or claim delivery to a receiver. CRE deploy access remains disabled; no access request, deployment, forwarder execution, receiver transaction or broadcast was attempted.

The evaluator's positive unit case is synthetic and never represented as live evidence. A successful signature check attests to the configured evaluator's signed bytes; it does not prove honest execution. Simulation, deployed DON consensus, authenticated forwarder delivery and receiver state remain separate gates.
