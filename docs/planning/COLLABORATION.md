# Current execution update — 2026-11-06
A completed the initial PB-03 Solidity/TypeScript foundation through Arc Studio and local verification at the user’s explicit request. B now starts PB-14 using docs/handoffs/PB-03-contracts.md. Earlier future-tense assignment/bootstrap text below is historical; STATUS.md and TASKS.md give current execution state. PB-04–11 now implement the local diagnostic API/inspection/execution/signing/worker/replay pipeline. CRE WASM capability simulation passes; product sponsor/financial integration and physical second-machine proof remain pending.

# Two-person and two-agent workflow
## How to start in a new folder
No commands in this guide have been executed.

After choosing the project root, create ONE repository there. Copy the planning bundle into docs/planning and copy AGENTS.template.md to root AGENTS.md. Do not initialize a repo around unrelated projects or create a second nested root. Record tool versions and .gitignore before any application dependencies/secrets are added.

Suggested future local commands (paths are examples and must match the chosen root):
```sh
cd /Users/aryapathak/Documents/patchbond
git init -b main
```
Copy only the reviewed planning documents and instructions, inspect the diff, then create the first commit:
```sh
git add AGENTS.md docs/planning
git commit -m "docs(plan): establish PatchBond scope and two-agent build workflow"
```
Configure a shared remote through the chosen host and invite the teammate. No remote/repository/invitation exists from this planning task. Keep secrets out even if the initial repository is private; make source publicly accessible for the applicable submission requirements.

Teammate:
```sh
git clone <shared-repository-url> patchbond
cd patchbond
git switch -c feat/pb-07-fixtures
```
Angle-bracket text is a placeholder, not an executable real URL. Each person's agent works in that person's clone. Worktrees are optional only when a person runs simultaneous writers on their own machine.

## Assignments
A leads API, worker, TypeScript schemas, config, verifier fixtures, CRE, conditional ENS and integration coordination; B leads campaign/acceptance/messaging contracts PB-14–20, their policy prerequisites and Solidity PB-03 vectors in Arc Studio. UI starts after backend gate: A implements UI; B tests integration/security and deployment evidence.
A owns the root lockfile and dependency updates. B describes needed dependencies; A lands them, B pulls the merged commit.
A owns verifier fixture ABIs under fixtures/. B owns campaign contract ABIs and generated exports under contracts/; A consumes those exports.
Migrations have one author A and are append-only after merge; never let both agents generate competing migration numbers.

## Before the two agents work in parallel
B begins with Solidity PB-03 types/vectors and campaign prerequisites; A works on the toolchain/verifier and matching TypeScript schemas. Contract unit tests do not wait for the complete backend. Before integration, both agents run identical golden vectors and agree on the fixture ABI. Shared encoding parity is an integration prerequisite, not something to reconcile at demo time.
Parallel streams then proceed against those stable contracts. If a dependency is not ready, implement an explicitly labelled local test double matching the shared interface; do not wire it into testnet behavior.
If an agent needs an interface change, first open a small schema/ABI change, state impact, obtain other-owner review and land its tests. Consumers then update from that commit.

## Task branch discipline
- Assign one PB task and owned write paths per active branch; task cards name prerequisites.
- Begin with a clean status and current main. Never overwrite uncommitted teammate work.
- Prefer short branches and small verified commits. Long changes may have multiple passing commits.
- Open PR against main with problem, behavior, checks and limitations.
- Other human/agent reviews the relevant boundary. Coordinator merges only after required checks.
- Keep meaningful implementation commits. Do not collapse the entire hackathon into one final upload.
- No direct concurrent edits to main, shared force pushes, changing another person's commit authorship or fabricated history.
- Before dependent work, fetch and incorporate the merged prerequisite; record the resulting base commit.
- Each person uses their own Git identity; do not impersonate the teammate.

## Commit messages
Pattern: type(scope): imperative concrete change [PB-NN].
Types: feat, fix, test, refactor, docs, chore, ci. Scope examples: schema, verifier, api, registry, vault, ccip, cre, ens, web.
Good:
- feat(verifier): reject incomplete deployment evidence [PB-10]
- fix(vault): process timely pending completion before refunds [PB-20]
- test(vault): cover arbitration timeout allocations [PB-19]
Bad: update, final, fixes, working, done, winning integration.
Nontrivial bodies explain Why, Validation (actual commands/outcomes), and Limits. Never write “all tests pass” if only one suite ran.
Stage explicit paths, review git diff --cached, then commit. Do not commit secrets or local artifacts with credentials. Failing checkpoints may remain local and clearly marked; do not merge them as completed features.

## Definition of a useful handoff
Task ID; base and result commits; touched files; provided interface; exact commands run; output summary; configuration added (names only); screenshots/transaction IDs where relevant; known limitations; next consuming task.
The teammate's agent should reproduce checks from the repository, without the original author's chat.

## Claim and status protocol
A maintains docs/planning/STATUS.md once coding begins. One coordinator updates shared task status to avoid markdown merge conflicts. B reports its branch/commit via PR and per-task handoff.
States: ready, active, blocked, review, done, deferred. “Done” requires code, tests, evidence and merge; a local commit is not a merge.
No task is active for both writers. Independent reviews do not confer write ownership.

## Backend-first handoff to UI
UI receives a generated OpenAPI contract, example successful and error payloads, generated ABIs, validated network/deployment config, real deploy/run commands and working agreement/evidence IDs generated at runtime.
An API test collection/CLI flow completes the complete supported backend scenario before UI feature work. Do not build a fake dashboard and hope to integrate later.
