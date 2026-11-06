# CRE PB01/PB03 capability probe — simulation only

This isolated Bun package tests the existing PB03 EIP-712 public fixture inside the actual CRE CLI's Javy/QuickJS WASM runtime. It imports `receiptTypedData` directly from the shared schema, and consumes `docs/interfaces/pb03-vectors.json` without regenerating or signing it. It performs no acceptance, report submission, deployment, or transaction broadcast. It is not PB21.

Prerequisites: authenticated normal CRE CLI login, CRE CLI v1.39.0, Bun 1.3.11, the parent checkout's installed schema dependencies, and public HTTPS/RPC connectivity. No API key or wallet key is required for this measured CLI version. The CLI reports its built-in default simulation key; this package neither supplies nor inspects that key.

From this directory:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
bun run check:simulation
```

`check:simulation` compiles and executes three CLI simulations sequentially: one combined successful probe and two expected failures (changed recipient and corrupted signature). It requires the exact signature-rejection markers, a nonzero exit, and absence of a successful probe result for the negative controls. Outputs and UTC capture times go to ignored `.build/`. An unexpected compile, authentication, HTTP, or RPC error fails the check. There are no mock or alternate endpoint fallbacks.

Individual runs: `bun run simulate all`, `signatures`, `http`, `evm`, `reject-recipient`, or `reject-signature`. The two `reject-*` runs intentionally exit nonzero. `CRE_PROBE_CLI` can select an installed CLI binary; its default is `~/.cre/bin/cre`.

The launcher passes a minimal environment, normal HOME login location, `/dev/null` for both CLI env-file flags, `--non-interactive`, trigger index 0, target `simulation`, and `--limits default`. It never passes `--broadcast`. It contains no deployment command. `project.yaml` uses a public Sepolia RPC with no credential.

The signature matrix requires the existing receipt digest, a valid verification, and rejection after changing the recipient, evidence digest, destination domain chain ID, or signature bytes. Host Bun tests are preflight only. The fixture's timestamps and addresses are artificial; no signature result means current product eligibility.

HTTP uses CRE `HTTPClient` with `consensusIdenticalAggregation` to fetch the official SDK repository's public package manifest. EVM uses CRE `EVMClient.headerByNumber` at finalized, then `callContract` at that height to query the existing Sepolia router's `isChainSupported(Arc selector)`. The block hash, timestamp, selector, raw return bytes, and decoded boolean are emitted. This reads Sepolia only; it neither tests CRE on Arc nor sends CCIP messages.

The isolated `bun.lock` pins probe dependencies. The parent owner excludes this directory in `pnpm-workspace.yaml`; do not use root pnpm to manage this package. Shared schema imports resolve the parent's pinned viem, Zod, and canonicalize packages, so this is a probe within the checkout, not a standalone vendored schema. SDK compilation checks stay enabled. Host tools have a separate tsconfig because the SDK intentionally restricts Node APIs in workflow typechecking.

The SDK downloads Javy to its normal `~/.cache/javy` tool cache. In the recorded run, one official GitHub CDN address timed out. Downloading the same official HTTPS asset through another DNS-returned address, with TLS enabled, and checking its published SHA-256 resolved this. No compiler patch or runtime substitution was used. Details, verified versions, limitations, and evidence are in `docs/handoffs/CRE-PROBE.md` and `docs/evidence/cre-probe.json` at the repository root.
