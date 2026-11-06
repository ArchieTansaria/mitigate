# Reproducible toolchain

Implemented 2026-11-06. Run commands from the repository root.

- Node 24 (validated here with 24.1.0), pnpm 11.22.0, TypeScript 5.9.3.
- Foundry/Anvil 1.7.1, installed through official pinned npm packages.
- Solidity 0.8.28 through official pinned `solc` npm package, EVM Cancun, optimizer 200, via IR. Studio used native Solidity 0.8.28; local compilation uses the identical Solidity compiler release via its JS distribution.
- forge-std v1.9.7 and OpenZeppelin contracts v5.4.0 are Git submodules pinned to commits, not floating branches.
- Vitest 5.1.0, Biome 2.6.5, viem 2.57.16, Zod 4.6.7; exact transitive versions/integrity in pnpm-lock.yaml.

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm check
pnpm vectors:check
# Start Docker first; no wallet or API keys are required for these local tests.
docker pull ghcr.io/foundry-rs/foundry@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd
pnpm test:integration
```

`pnpm test:contracts` uses scripts/forge.mjs and scripts/solc.mjs so native compiler-download availability cannot silently change the compiler version. The pinned npm Foundry wrapper does not propagate child failures; our wrapper invokes its actual pinned platform binary and preserves exit status. A regression test proves invalid commands fail CI. Native `forge` remains usable if you separately install the compiler; prefer the pnpm scripts for reproducibility.

Integration tests launch a disposable local Anvil instance, deploy only EncodingHarness there, compare Solidity/TypeScript hashes and inspect actual historical state. Container tests require a running Docker engine and the image above; they do not silently skip when Docker is unavailable. No testnet transactions or user wallet keys are used. Node 24.1 emits a type-stripping experimental notice; it is not a test failure.

`.github/workflows/check.yml` installs the lockfile, initializes submodules, runs lint/typecheck/unit/Foundry tests and the real Anvil/Docker tests. CI success must be observed from GitHub before being claimed.
