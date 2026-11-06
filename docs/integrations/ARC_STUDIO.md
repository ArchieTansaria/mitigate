# Arc Studio and Codex
Status: Arc Studio CLI 1.2.2 is pinned and installed. `agent-guide` and `skills --json` work; `whoami` reports this machine is not authenticated. No Studio project exists yet.

## What Arc requires
Every Arc prize at ETHGlobal Mumbai requires using Arc Studio as the starting point. The event asks for a shareable Studio project URL, working frontend and backend, architecture diagram, demo/docs and source repository. See https://ethglobal.com/events/mumbai/prizes/arc . A locally developed vault merely deployed to Arc is weak evidence.

Arc Studio is a separate Circle cloud service at https://studio.arc.io/, not a built-in Codex panel. Its official page offers From GitHub and Use with your agent. Codex can drive it using Circle's CLI. See https://studio.arc.io/ and https://studio.arc.io/terms-of-use

Important: Studio runs in its own server-side sandbox; it cannot directly edit this local checkout. Its CLI can send explicitly selected files with --file and return generated artifacts through arc-studio pull. A server-side GitHub clone is not a live two-way sync. Keep this local Git repository canonical, pull only reviewed outputs, inspect the diff and commit it locally.

## Recommended project connection
1. Install the exact Arc Studio CLI package pinned in package.json as a development dependency. Use pnpm exec arc-studio from this repo. Circle's official page offers this CLI for use with coding agents.
2. In a normal terminal, run `pnpm exec arc-studio login --paste`. Circle's current agent guide says this opens the browser authorization page and stores the token in `~/.arc-studio/credentials.json` with mode 0600 so a sandboxed runner can read it. Enter the token only into the local terminal prompt; never paste it into chat, a prompt, source code or logs. Each teammate authenticates their own account.
3. Run `pnpm exec arc-studio whoami` to confirm authentication, then `pnpm exec arc-studio agent-guide` for the current workflow. Do not run the Claude-only skill registration command inside Codex.
4. Start an Arc-focused run with only the needed contract source and task docs using --file. Do not send the whole repository or secrets.
5. Run pnpm exec arc-studio pull --dry-run --diff, inspect conflict/manifest behavior, then pull only the intended outputs. Review git diff and checks before committing.
6. Build and test the Arc maintenance vault workflow in Studio; keep the verification worker/API as explicitly connected services. Do not assume Studio hosts arbitrary long-running workers.
7. Keep the Studio project URL in deployment evidence and show Studio plus actual contract state/transactions in the demo.

## Codex route
The Arc CLI is the subagent/sandbox surface, not a persistent Codex MCP connection. We can invoke it from this repo after your local login; Studio does not become a permanently connected MCP tool. Its current `skills --json` list includes Chainlink and ENS skill IDs, but that alone does not qualify the project for those prizes or prove a CRE/CCIP workflow.

After the owner logs in, use Studio for a bounded Arc feasibility task within PB-01: create a minimal receiver, test a real state transition on Arc testnet, and record its project URL, transaction hash, decoded event and observed state. Then test whether the Studio app can call the external verification service. Do not ask Studio to generate the entire platform in one go.

## Credential boundary
Studio-generated output can be inaccurate and vulnerable; review code and test independently. Use testnet only. Never paste private keys, API keys/entity secrets, RPC credentials, email contents or customer secrets into prompts. Do not create credentials, accept new legal terms, broaden account permissions, transfer funds or broadcast transactions without the relevant human authorization. Studio built-in reviews are not security audits.
