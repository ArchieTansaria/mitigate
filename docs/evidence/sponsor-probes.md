# Sponsor feasibility probe log

This is an evidence log. A tool being installed or listed in Studio does not count as a working product integration or a prize qualification.

## PB-01 preflight — 2026-11-06

Environment: macOS, Node 24.1.0, pnpm 11.22.0, repo CLI dependency `@circle-fin/arc-studio-cli` 1.2.2.

| Probe | Result | What this proves | What it does not prove |
|---|---|---|---|
| `pnpm exec arc-studio --version` | `1.2.2` | CLI is installed and executable. | No account or Studio project is configured. |
| `pnpm exec arc-studio agent-guide` | Passed; guide printed. | The CLI exposes its current agent workflow without login. | No remote agent run or generated output. |
| `pnpm exec arc-studio skills --json` | Returned skill IDs including `chainlink` and `ens`. | Studio advertises these integration skill prompts. | It does not prove CRE, CCIP, ENSv2 or prize qualification. |
| `pnpm exec arc-studio whoami` | `Not authenticated`. | The current machine has no usable Studio login. | No Studio app can be created/run from this session yet. |
| `command -v cre` / `command -v forge` | Neither executable found. | CRE CLI and Foundry are not currently on PATH. | No CRE simulation/deploy or Solidity test was run. |
| Arc testnet receiver state change | Not run. | Nothing. | No transaction, destination storage change or CCIP delivery is evidenced. |
| Studio app → external verifier API | Not run. | Nothing. | Network access, auth, CORS and service deployment remain unverified. |

### Next evidence to collect

After the owner authenticates Arc Studio, create one minimal Arc app in Studio and record its share URL. Test whether the app can call a small independently hosted health endpoint. Separately determine the supported CRE CLI and deployment path, then deploy a minimal receiver and verify a destination state change on Arc testnet. Record the exact commands, source revision, chain ID, contract address, transaction/message IDs, and observed state. Keep dry-run/simulation results explicitly distinct from live transactions.

Do not mark PB-01 complete until the tests in `docs/planning/IMPLEMENTATION_PLAN.md` have actual reproducible evidence. Never store credentials or private chat with mentors here.
