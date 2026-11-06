# Arc Studio runtime decision

Status: **Studio CLI build/test/pull now verified; see docs/handoffs/PB-01.md. CRE authentication and live CCIP delivery remain open. The historical troubleshooting below predates the successful approved CLI credential path.**

The pinned `@circle-fin/arc-studio-cli` 1.2.2 includes an `agent-guide` for driving Arc Studio as a hosted agent from a local shell. The guide explicitly says the Studio sandbox is separate from this checkout; use `arc-studio run --output json`, pass only reviewed files via `--file`, and use `arc-studio pull` to retrieve output. A CLI session is not itself proof of qualification: preserve the hosted app/project URL, file changes, build/test/deploy results and demo it.

The Arc prize page says every Arc prize must start in Arc Studio; the advanced stablecoin track expects the contracts to be written, tested and deployed in Studio and connected to an app there. The CLI appears to be the official way to drive that hosted workflow from Codex, rather than a requirement to type manually in the browser. The exact interpretation of CLI-driven Codex sessions and “without leaving Studio” is still a mentor question; do not claim confirmed eligibility until answered or until we have strong end-to-end Studio evidence.

The CLI guide is available without credentials (`pnpm exec arc-studio agent-guide`). The owner reports `whoami` succeeds in their normal terminal. The Codex command sandbox has previously failed auth because its process cannot read the owner's macOS Keychain. Never request or print tokens. A browser-visible Studio project now exists: https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52 (app ID 9dee5ecd-ab62-459b-a54f-5ae7b2f06a52). It contains a generated CCIP receiver and test file. The Studio turn reports 39 passing Foundry tests and `bun run check` passing, but the turn header says “with errors”; independent reproduction and full error review are required. The source has not been pulled into the local checkout. User opening the bare TUI caused no local file changes.

Studio does not automatically host the PatchBond verifier API or persistent worker. PB-01 must test a Studio app calling the external verifier safely and prove the CLI artifact round-trip. If necessary, host the verifier separately and make the boundary clear.

Evidence: `docs/evidence/sponsor-probes.md`; current sponsor wording: https://ethglobal.com/events/mumbai/prizes/arc.
