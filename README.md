# PatchBond
PatchBond checks whether an agreed repair reached the customer's registered smart-contract deployments and whether the agreed application-level tests pass. It explains remaining work and can connect accepted completion to a funded maintenance milestone.

**Current state:** repository and team memory bootstrapped; no product contracts, API, worker, CRE, CCIP integration or Arc Studio project exists yet. See STATUS.md and memory/.

## Start here
1. Read AGENTS.md.
2. Read docs/planning/DECISIONS.md. Explicit current decisions override contradictory historical details in the handbook.
3. Read docs/planning/INTERFACES.md before implementing cross-component work.
4. Read TASKS.md and the full task acceptance detail in IMPLEMENTATION_PLAN.md.
5. Read docs/integrations/ARC_STUDIO.md before Arc work.
6. Read memory/README.md and completed feature notes before starting a task.
7. Update feature memory only after a meaningful feature has been implemented, checked, reviewed and committed.

## Proposed stack
Node.js 24 LTS, pnpm workspace, TypeScript strict mode, Fastify API, PostgreSQL, viem, Solidity/Foundry, Chainlink CRE and CCIP. Arc-targeted work must start in Arc Studio. Exact compatible versions and setup are tracked as PB-00/PB-01.

## Boundaries
One documented adapter/proxy family; configurable deployment inventory; one source chain per verification run. Missing, stale or unsupported evidence never becomes a pass. The worker has no upgrade keys. Humans authorize state changes from their own wallets. ENS is conditional on demonstrated user value.
No secrets, private keys, access tokens, authenticated URLs or private customer artifacts belong in Git, logs, screenshots or agent prompts.
