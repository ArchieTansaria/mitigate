# Sponsor feasibility probe log

This is an evidence log. A tool being installed or listed in Studio does not count as a working product integration or a prize qualification.

## PB-01 preflight — 2026-11-06

Environment: macOS, Node 24.1.0, pnpm 11.22.0, repo CLI dependency `@circle-fin/arc-studio-cli` 1.2.2.

| Probe | Result | What this proves | What it does not prove |
|---|---|---|---|
| `pnpm exec arc-studio --version` | `1.2.2` | CLI is installed and executable. | No account or Studio project is configured. |
| `pnpm exec arc-studio agent-guide` | Passed; guide printed (rechecked 2026-11-06). | The CLI exposes a hosted Studio agent workflow to shell agents; supports `run --output json`, reviewed `--file` context/round-trip, app/session inspection and `pull`. | No remote agent run, Studio app, generated output, deployment or prize qualification. |
| `pnpm exec arc-studio skills --json` | Returned skill IDs including `chainlink` and `ens`. | Studio advertises these integration skill prompts. | It does not prove CRE, CCIP, ENSv2 or prize qualification. |
| `pnpm exec arc-studio whoami` | `Not authenticated`. | The current machine has no usable Studio login. | No Studio app can be created/run from this session yet. |
| Owner's normal-terminal `whoami` | Owner reports `Authenticated against https://studio.arc.io`. | The owner's interactive terminal can access the Arc Studio account. | The Codex command sandbox still cannot access that credential. |
| `login --paste` browser authorization | Returned `Rate limit exceeded` before a token was displayed. | The sandbox credential transfer could not be completed in that attempt. | No token was obtained or pasted; retry interval is unknown. |
| `command -v cre` / `command -v forge` | Neither executable found. | CRE CLI and Foundry are not currently on PATH. | No CRE simulation/deploy or Solidity test was run. |
| Arc testnet receiver state change | Not run. | Nothing. | No transaction, destination storage change or CCIP delivery is evidenced. |
| Studio app → external verifier API | Not run. | Nothing. | Network access, auth, CORS and service deployment remain unverified. |

### Next evidence to collect

The user opened the bare Arc Studio TUI, but whether it created an app/session is unknown. From the already-authenticated owner terminal, inspect `pnpm exec arc-studio apps --json` and `pnpm exec arc-studio sessions --json`. If needed, create the PatchBond Studio app through `pnpm exec arc-studio run ... --output json`; record its share URL and session/app IDs. Prove reviewed-file artifact round-trip with `pull --dry-run` in scratch. Test the Studio app calling a small independently hosted verifier health endpoint. Separately determine the supported CRE CLI and deployment path, then if route remains in scope verify a minimal receiver state change on Arc testnet. Record commands, source revision, chain ID, contract address, transaction/message IDs, and observed state. Keep dry-run/simulation distinct from live transactions.

Do not repeatedly retry the rate-limited authorization flow. Never copy or share credentials; the owner can run Studio CLI from their authenticated terminal while sandbox credential availability remains unresolved.

Do not mark PB-01 complete until the tests in `IMPLEMENTATION_PLAN.md` have actual reproducible evidence. Never store credentials or private chat with mentors here.
