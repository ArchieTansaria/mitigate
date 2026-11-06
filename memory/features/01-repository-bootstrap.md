# Feature 01 — repository bootstrap and team context
State: implemented; owner reports bootstrap commit pushed. A follow-up cleanup commit is local and still needs pushing.
PB task: PB-00.
Product behavior: none.

Provides the project root, copied handbook/plan, contributor rules, task board, Arc Studio guide and shared memory convention for two separate agent workspaces.

No API, verifier, test, contract, ENS, CRE, CCIP or Studio project has been implemented. PB-01 must verify Studio's current UI/CLI/external-worker limits.

Commit: `c94eca7` (`chore(repo): bootstrap PatchBond workspace and team context [PB-00]`).

Validation: `pnpm install` passes with the Arc CLI lifecycle script explicitly approved; `pnpm exec arc-studio --version` reports 1.2.2; `pnpm exec arc-studio --help` runs; `git diff --cached --check` passes before commit. Product behavior remains none.

Follow-up commit `a5b0346` removes accidental trailing escape suffixes from the bootstrap files. `package.json` parses as JSON, `pnpm install` passes, and the Arc CLI remains runnable after the correction.

Scope note: Feature 01 means the repository/context setup only. The broader PB-00 implementation-plan task remains partial because CI, lint/typecheck/test scripts, Foundry pinning and fresh-clone verification are not complete.
