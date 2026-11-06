# PatchBond coding framework
Date: 2026-11-06. Status: documentation only; implementation has not started.

This bundle is a portable team agreement for two humans and their coding agents. It contains no application scaffold, dependencies, deployed contracts, initialized Git repository or executed implementation checks.

## Read in this order
1. [Current decisions](DECISIONS.md): current scope, stack, gates and revisions to the handbook.
2. [Handbook snapshot](HANDBOOK.md): explanations and underlying financial/security design.
3. [Shared interfaces](INTERFACES.md): the boundaries both agents must honor.
4. [Implementation plan](IMPLEMENTATION_PLAN.md): sequenced tasks, owners, acceptance checks and commits.
5. [Collaboration guide](COLLABORATION.md): cloning, branches, handoffs, review and commit discipline.
6. [Agent rules template](AGENTS.template.md): copy to the future repository root as AGENTS.md when setup starts.
7. [Feature handoff template](FEATURE.template.md): use for each active task.

The new decisions take precedence over the historical handbook where they explicitly differ, particularly ENS being conditional. No document gives an agent permission to silently change product scope or bypass human wallet approvals.

## Recommended physical setup
Use one shared repository called patchbond. Each teammate uses a separate clone. A monorepo means the API, worker, contracts and eventual frontend share one Git history; it does not mean they share a running server.

This current workspace is empty except outputs/work and is not a Git repository. Recommended future project directory: /Users/aryapathak/Documents/Codex/patchbond. Alternatively choose this workspace itself as the project root when implementation is authorized. Do not initialize both roots or create a nested repository by accident.

This bundle is currently in outputs/patchbond-planning. When the project is initialized, place the bundle under docs/planning, copy AGENTS.template.md to root AGENTS.md, and retain the original handbook as historical context. Keep repository paths relative in shared documentation so the teammate's machine works.

## Immediate next work after authorization
- A and B read DECISIONS.md and agree on PB-00 through PB-03 deliverables.
- B proves sponsor access and Arc Studio workflow before dependent contracts are implemented outside that required process.
- A verifies worker/RPC feasibility and owns the shared schema/encoding contract.
- Both freeze the first schema and ABI golden vectors before parallel implementation.
- Implement backend flows and pass the backend handoff gate before feature UI work.

Do not ask either agent to “build the entire handbook.” Assign one task ID, its dependencies, owned files and acceptance evidence. Both agents receive this complete bundle at the same commit; task handoffs carry the newer commit ID.

## Current source of truth
Confirmed user constraints: two teammates; assistant chooses split; backend first; no application code this turn; no fabricated runtime results; small correct commits.
Proposed technical defaults are recorded in DECISIONS.md. Versions, chain addresses and sponsor access require measured setup results, not guessed values.
