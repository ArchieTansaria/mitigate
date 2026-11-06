# Arc Studio and Codex
Status: Codex-driven CLI authentication and hosted PB-03 build/test/pull verified on 2026-11-06. See docs/handoffs/PB-01.md for current evidence and remaining CRE/CCIP gates. Older authentication troubleshooting below describes the sandbox failure path, not the approved normal-credential execution path.

## What Arc requires
Every Arc prize at ETHGlobal Mumbai requires using Arc Studio as the starting point. The event asks for a shareable Studio project URL, working frontend and backend, architecture diagram, demo/docs and source repository. See https://ethglobal.com/events/mumbai/prizes/arc . A locally developed vault merely deployed to Arc is weak evidence.

Arc Studio is a separate Circle cloud service at https://studio.arc.io/, not a built-in Codex panel. Its official page offers From GitHub and Use with your agent. Codex can drive it using Circle's CLI. See https://studio.arc.io/ and https://studio.arc.io/terms-of-use

Important: Studio runs in its own server-side sandbox; it cannot directly edit this local checkout. Its CLI can send explicitly selected files with --file and return generated artifacts through arc-studio pull. A server-side GitHub clone is not a live two-way sync. Keep this local Git repository canonical, pull only reviewed outputs, inspect the diff and commit it locally.

## Recommended project connection
1. Install the exact Arc Studio CLI package pinned in package.json as a development dependency. Use pnpm exec arc-studio from this repo. Circle's official page offers this CLI for use with coding agents.
2. For a sandboxed runner, Circle's current agent guide recommends `pnpm exec arc-studio login --paste`; after successful authorization it stores the token in `~/.arc-studio/credentials.json` with mode 0600 so the sandbox can read it. Enter a token only into the local terminal prompt; never paste it into chat, a prompt, source code or logs. Each teammate authenticates their own account. In this project, the owner tried this and Arc's authorization page returned `Rate limit exceeded` before showing a token. Do not keep retrying; use the already-authenticated normal terminal for read-only CLI work until Circle allows another authorization attempt or the sandbox credential route is resolved.
3. Run `pnpm exec arc-studio whoami` to confirm authentication, then `pnpm exec arc-studio agent-guide` for the current workflow. Do not run the Claude-only skill registration command inside Codex.
4. Start an Arc-focused run with only the needed contract source and task docs using --file. Do not send the whole repository or secrets.
5. Run pnpm exec arc-studio pull --dry-run --diff, inspect conflict/manifest behavior, then pull only the intended outputs. Review git diff and checks before committing.
6. Build and test the Arc supplier-funded remediation campaign workflow in Studio; keep the verification worker/API as explicitly connected services. Do not assume Studio hosts arbitrary long-running workers.
7. Keep the Studio project URL in deployment evidence and show Studio plus actual contract state/transactions in the demo.

## Codex route
The Arc CLI is the subagent/sandbox surface, not a persistent Codex MCP connection. A successful `whoami` in the owner's terminal does not guarantee the separate Codex command sandbox can use that credential. Its current `skills --json` list includes Chainlink and ENS skill IDs, but that alone does not qualify the project for those prizes or prove a CRE/CCIP workflow.

After the owner logs in, use Studio for a bounded Arc feasibility task within PB-01: create a minimal receiver, test a real state transition on Arc testnet, and record its project URL, transaction hash, decoded event and observed state. Then test whether the Studio app can call the external verification service. Do not ask Studio to generate the entire platform in one go.

## Credential boundary
Studio-generated output can be inaccurate and vulnerable; review code and test independently. Use testnet only. Never paste private keys, API keys/entity secrets, RPC credentials, email contents or customer secrets into prompts. Do not create credentials, accept new legal terms, broaden account permissions, transfer funds or broadcast transactions without the relevant human authorization. Studio built-in reviews are not security audits.
