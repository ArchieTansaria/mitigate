# PB-01 runtime feasibility follow-up

Date: 2026-11-06. Scope: CRE CLI availability and simulation, and outbound HTTPS from the Studio server runtime. No deployment, transfer, wallet, sign-in, new credential or faucet request was made.

## 1. CRE CLI

| Item | Result |
| --- | --- |
| Pre-installed in Studio sandbox | No (`cre` not on PATH) |
| Installed | Yes, to a temporary path outside the project: `/tmp/cre-cli/cre` (not in the repository, lost when the sandbox is reset) |
| Version | `CRE CLI version v1.39.0` (latest GitHub release at the time, published 2026-10-21) |
| Install method | Manual install from the official docs ("Installing the CRE CLI on macOS and Linux"), release asset `cre_linux_amd64.tar.gz` (sandbox is Debian 13, glibc 2.41, so the non-`ldd2-35` build) |
| Checksum | SHA-256 `e840ee945d3741fbc76a3cae73749bc9a1730cc58c6babc5e65c2567413c7af0`. Matched both the digest on the GitHub release asset and the `checksums.txt` published in the same release (`sha256sum -c` printed OK) |
| Signature (`.sig`) | Published by Chainlink but not verified here |

Official sources: docs.chain.link CRE "Installing the CRE CLI" and "Workflow Commands", and github.com/smartcontractkit/cre-cli releases.

## 2. CRE simulation: requires authentication (blocked)

- The CRE docs state that `cre workflow simulate` requires being logged in.
- Observed with v1.39.0: `cre workflow simulate ... --non-interactive` stops with `Authentication required: not logged in and no CRE_API_KEY set` (run `cre login` interactively, or set `CRE_API_KEY`). No identity was printed. No `CRE_API_KEY` is set in this sandbox.
- This task excluded sign-in flows and new API credentials, so simulation was not attempted past that gate.

Result: **simulation is not usable in Studio without human authentication.** No workflow was created and `workflows/pb01-probe` does not exist. No simulation output exists and none is claimed. I did not substitute a Node or Bun script and call it CRE.

To unblock, a human must run `cre login` (or provide a CRE API key in the sandbox environment, which is a separate decision), then a minimal HTTP-capability workflow can be added and run with `cre workflow simulate ./workflows/pb01-probe --target local-simulation` (dry run, no `--broadcast`). Whether simulation can run headless for CI also needs confirming with Chainlink.

## 3. Outbound HTTPS from the Studio server runtime

Script: `scripts/pb01-rpc-probe.ts` (Bun runtime; plain `fetch`; one unauthenticated read-only `eth_chainId` call per endpoint). It is not a CRE workflow.

Command: `bun run scripts/pb01-rpc-probe.ts`

Actual output:

```
{"name":"Arc Testnet","url":"https://rpc.testnet.arc.io","http":200,"result":"0x4cef52","chainId":5042002,"matchesExpected":true,"ms":70}
{"name":"Ethereum Sepolia","url":"https://ethereum-sepolia-rpc.publicnode.com","http":200,"result":"0xaa36a7","chainId":11155111,"matchesExpected":true,"ms":130}
```

The same two requests via `curl` returned the same results (HTTP 200).

Conclusion: the Studio sandbox server runtime can reach both endpoints over HTTPS with no credentials, and they return the expected chain IDs (Arc Testnet 5042002, Ethereum Sepolia 11155111).

## Limitations

- This proves outbound connectivity and correct chain IDs at one moment only. It says nothing about rate limits, uptime, log-query ranges or reliability under load; none were measured.
- It is not an authenticated PatchBond verifier integration. That service does not exist yet.
- It does not show that the same access will work from a deployed host or from Chainlink's decentralized network, which makes its own requests.
- CRE feasibility on Arc remains unproven: no workflow was built or simulated. The earlier PB-01 finding that CCIP lists a Sepolia to Arc lane is separate and still untested live.
- The CRE CLI binary is in `/tmp` only.

## Files changed

- Added `scripts/pb01-rpc-probe.ts`
- Added `docs/pb01-runtime-feasibility.md`
