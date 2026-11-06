# CRE PB01/PB03 runtime compatibility probe

**Verified 2026-11-06: the EOA EIP-712 runtime compatibility gate is closed for the recorded versions and fixture.** CRE CLI compiled the real TypeScript probe to WASM and executed it successfully. Valid PB03 signature verification, four tampered rejections, external HTTP, and supported Sepolia EVM reads all ran inside the CLI simulation. Two additional simulations intentionally failed on invalid signatures. This is capability evidence, not product acceptance, full PB01 completion, PB21 completion, or DON deployment.

Base commit: `730ebe6e25ae117ed6c74dd07ad3ef3f60efde6e`. No commit, staging, branch switch, shared-schema change, or Arc Studio operation was performed. Owned changes are `workflows/cre-probe/`, this handoff, and `docs/evidence/cre-probe.json`. The parent owner separately excluded the package from pnpm workspaces; the parent retains ownership of root configuration and lockfiles.

## Actual validation

| Check | Actual result |
| --- | --- |
| `bun run typecheck` | Exit 0; workflow and host tsconfigs checked separately |
| `bun test` | 6 passed, 0 failed: golden digest plus five verification cases |
| `bun run check:simulation` | Exit 0; validates the three CLI runs below |
| `bun run simulate all` | Exit 0; WASM verification, HTTP, EVM reads completed |
| `bun run simulate reject-recipient` | Expected exit 1, `SIGNATURE_REJECTED:tampered-recipient`; no success result |
| `bun run simulate reject-signature` | Expected exit 1, `SIGNATURE_REJECTED:tampered-signature`; no success result |

The recorded runs were captured between **18:24:34 and 18:25:21 UTC**. Raw CLI log timestamps appeared to use the local Asia/Kolkata clock with a `Z` suffix; use the host UTC capture fields in the evidence JSON for timing. Logs preserve emitted timestamps without inventing replacements.

The successful WASM run produced the existing digest `0x4a1c204bfcf9793fd58a119bf3b96cec98e654dd05ba860791989c17f2bb0b99`. It returned `verified=true` for the original public fixture and `false` after changing recipient, evidence digest, destination-domain chain ID, or signature bytes. `signature.ts` imports the actual shared `receiptTypedData` implementation and the existing vector JSON; no field schema was copied, no vector regenerated, and no signing key read or used.

The CRE HTTP capability fetched the official SDK repository's public package manifest, returned HTTP 200, validated `name=@chainlink/cre-sdk`, and used `consensusIdenticalAggregation`. This is public outbound HTTP feasibility, not an authenticated verifier/evidence-service integration. An earlier run against GitHub's REST API failed with HTTP 403 after signature checks succeeded. The endpoint was explicitly changed and the combined workflow rerun; there is no fallback in the probe.

The CRE EVM capability fetched a finalized Sepolia header and called `isChainSupported(3034092155422581607)` on router `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59` at that exact height:

- Sepolia chain ID `11155111`; source selector `16015286601757825753`.
- Block `12078240`, hash `0xd258c0cf2c0a32f2f6a1e1a18758c4931bcf72e2cf881ad466375742c7192430`, timestamp `1793988564`.
- Raw ABI result `0x0000000000000000000000000000000000000000000000000000000000000001`, decoded `true`.
- Methods used: `EVMClient.headerByNumber` and `EVMClient.callContract`. No raw storage or trace method, Arc RPC call, or CCIP send.

## Reproduction and requirements

Use the already-installed root dependencies, maintained by the parent. In `workflows/cre-probe/`:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
bun run check:simulation
```

Measured versions: CRE CLI **v1.39.0**, Bun **1.3.11**, CRE SDK **1.23.0**, SDK Javy plugin **1.7.0**, Javy **8.1.0**, TypeScript **5.9.3**, viem **2.57.16**. Shared schema imports additionally resolve parent Zod **4.6.7** and canonicalize **2.1.0**. The isolated Bun lockfile pins probe dependencies. No parent install/update is performed by these commands. Keep the parent's probe exclusion in place.

The launcher uses normal CLI login, preserves only HOME/PATH/TMPDIR/LANG, explicitly supplies empty CLI environment files, selects trigger 0 and target `simulation`, and enforces default production limits. It does not pass `--broadcast`, disable typechecks, retrieve secrets, or issue deployment commands. No account identifier or `whoami` output is retained.

The official [setup guide](https://docs.chain.link/cre/getting-started/part-1-project-setup-ts) describes a private-key prerequisite. The measured **v1.39.0** CLI instead proceeded with its built-in default simulation key when none was supplied. No API key or user wallet key was required for this probe, and no key value was inspected. The CLI accepted the user's existing normal browser login without a credential-file write request. Deploy access remains disabled per user context; no access request or deployment was attempted.

The official compiler needed scoped write access to its Javy tool cache. Its initial GitHub asset download failed because one DNS-returned CDN IP timed out. Fetching the same official HTTPS asset with `curl --resolve release-assets.githubusercontent.com:443:185.199.108.133`, TLS verification enabled, succeeded. The archive matched the published SHA-256 `ef2fcfa63d6cfca267fd44c4de47ffbc586070911c77e482c283b21ef3ae681e` before installing it in the normal cache. There was no compiler patch, custom plugin, or alternate runtime. CDN addresses are transient; the workaround is an observation, not a permanent network setting.

SDK compilation emitted an `Object.values()` ordering warning in shared `encoding.ts:158`, in the canonical-JSON validator. That function is not called by this signature probe. The shared file remains untouched; the warning does not constitute a deployment determinism review. Separate host/workflow tsconfigs avoid applying SDK-restricted Node declarations to the host launcher, while retaining both typechecks.

## Evidence and limits

Machine-readable [evidence](../evidence/cre-probe.json) records results, UTC capture times, CLI binary/config hashes, source SHA-256 fingerprints, versions, endpoints, failed attempts, and limits. Reviewed raw stdout/stderr, CLI help/version output, and host test output are in [probe evidence](../../workflows/cre-probe/evidence/). Streams are recorded separately with an explicit separator; their ordering is not fabricated. Logs contain no account identifiers, authentication headers, API keys, or user private credentials.

The PB03 fixture contains artificial addresses and old timestamps. Cryptographic validity is not freshness, coverage, eligibility, honest test execution, or an accepted repair. EIP-1271 was not tested. The public RPC read is one provider observation; local simulated consensus is not deployed DON consensus. The Arc selector is only a Sepolia router argument and does not prove CRE execution on Arc or delivered CCIP messages.

There was no report generation/submission, receiver callback, accepted onchain record, campaign grant, payout, user-funded broadcast, DON deployment, or Arc Studio edit. PB21 still needs real scoped evidence ingestion, policy/freshness/coverage checks, trusted signer handling, report/receiver integration, and its own acceptance tests. The parent can update the stale PB01/PB03 runtime-gate notes from this handoff; the wider sponsor/product gates remain separate.

Official references: [WASM runtime](https://docs.chain.link/cre/concepts/typescript-wasm-runtime), [HTTP capability API](https://docs.chain.link/cre/reference/sdk/http-client-ts), [EVM capability API](https://docs.chain.link/cre/reference/sdk/evm-client-ts), [simulation/deployment access distinction](https://docs.chain.link/cre/overview), and [official configuration template](https://github.com/smartcontractkit/cre-templates/tree/main/building-blocks/read-data-feeds/read-data-feeds-ts). Installed CLI `workflow simulate --help` is retained alongside the evidence.
