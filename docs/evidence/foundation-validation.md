# Foundation validation — 2026-11-06

Validated locally in /Users/aryapathak/Documents/patchbond:
- `pnpm check`: lint and TypeScript compilation passed; 29 TypeScript tests passed; 25 Solidity tests passed (including 256-run fuzz test).
- `pnpm vectors:check`: frozen vectors match generated values.
- `pnpm test:integration`: 4 tests passed using real disposable Anvil contracts/state and restricted Docker containers. No testnet wallet transactions.
- Independent source review findings resolved: process drain timeout, case-normalized consumed receipt identifiers, complete frozen-vector checking in CI and integration inputs.
- Studio built and tested the PB-03 Solidity source through Codex-driven CLI. Exact source provenance: pb01-studio-provenance.json. Its pre-existing receiver suite is not part of the local reproduction.
- Actual public RPC historical reads and route-configuration read are in pb02-public-rpc.json and pb01-ccip-route.json; container probe in pb02-container.json.

Not yet established: remote CI success, CRE workflow simulation/authentication, authenticated hosted verifier callback, deployed campaigns, a delivered CCIP message, full repair execution or production security. PB-14 can proceed against the shared interface without those later integration steps.

The host process supervisor is for trusted tools; it is not an untrusted-code sandbox. The Docker proof verifies runtime restrictions, not a complete repair worker. Solidity hash helpers do not enforce campaign semantics.

## GitHub Actions
Run https://github.com/ArchieTansaria/mitigate/actions/runs/42266212890 did not start: GitHub annotation says the account is locked due to a billing issue. No remote test result exists. The repository owner must resolve GitHub billing to enable CI; no billing changes were made.

## Fresh-checkout reproduction
At code commit 4e3b020, cloned into /private/tmp/patchbond-foundation-check-20261106, initialized recursive pinned Git submodules and installed with pnpm install --frozen-lockfile. Ran pnpm check, pnpm vectors:check and pnpm test:integration successfully: 29 TS, 25 Solidity and 4 real integration tests; lint/typecheck and vectors passed. This is a second checkout on the same Mac, not a second machine or Linux CI run. Dependency download retries succeeded.
