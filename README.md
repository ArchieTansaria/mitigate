# PatchBond
PatchBond helps a supplier fund remediation across customer-owned smart-contract deployments. It checks each deployment against agreed repair tests, explains what remains wrong, and can release a capped USDC grant only after fresh evidence confirms that deployment passes.

**Current state:** repository/team docs are bootstrapped. Arc Studio contains a CCIP receiver prototype; it has not been pulled into the repo, independently reviewed, or live-deployed. Product verifier/API/worker and live CRE/CCIP integration remain unimplemented. [Open the Studio project](https://studio.arc.io/app/9dee5ecd-ab62-459b-a54f-5ae7b2f06a52). See STATUS.md and memory/.

## Start here
1. Read AGENTS.md.
2. Read docs/planning/DECISIONS.md. Explicit current decisions override contradictory historical details in the handbook.
3. Read docs/planning/INTERFACES.md before implementing cross-component work.
4. Read TASKS.md and the full task acceptance detail in IMPLEMENTATION_PLAN.md.
5. Read docs/integrations/ARC_STUDIO.md before Arc work.
6. Read memory/README.md and completed feature notes before starting a task.
7. Update feature memory for meaningful product decisions and completed features; label design decisions, Studio-only work and local implementation separately.

## Proposed stack
Node.js 24 LTS, pnpm workspace, TypeScript strict mode, Fastify API, PostgreSQL, viem, Solidity/Foundry, Chainlink CRE and CCIP. Arc-targeted work must use the Arc Studio hosted workflow, driven through its CLI where appropriate; local-only deployment is not our Arc prize path. Exact compatible versions and setup are tracked as PB-00/PB-01.

## Boundaries
One documented adapter/proxy family; configurable deployment inventory; one source chain per verification run. Missing, stale or unsupported evidence never becomes a pass. The worker has no upgrade keys. Humans authorize state changes from their own wallets. ENS is conditional on demonstrated user value.
No maintainer bond, customer repair fee, penalty or slashing is in the MVP. No secrets, private keys, access tokens, authenticated URLs or private customer artifacts belong in Git, logs, screenshots or agent prompts.
