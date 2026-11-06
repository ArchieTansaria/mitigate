# PatchBond contributor instructions
This is a TEMPLATE. Copy to repository-root AGENTS.md during authorized bootstrap.

## Read before editing
Read docs/planning/DECISIONS.md, INTERFACES.md, COLLABORATION.md and the assigned IMPLEMENTATION_PLAN.md task. Read relevant HANDBOOK.md sections. The current decisions override explicitly superseded handbook items, notably conditional ENS.
Do not begin implementation when the user has limited the session to planning.
Task assignment is a bounded work item, not permission to deploy, send messages, move funds or change unrelated files.

## Ownership
A owns packages/schema, packages/config, services/api, services/verifier, database migrations, root dependency/config files and later apps/web.
B owns fixtures, testpacks, contracts, workflows/cre, conditional integrations/ens and chain deployment outputs.
Public ABI exports belong to B; encoding/signature boundaries require review by both. Integration tests have one assigned owner per task.
Edit only the task's declared write paths. For another owner's path, propose a small dependency change first and wait for its merged commit.

## Runtime truth
No hardcoded pass results, fixture address branches, hidden mock fallback, forged transaction evidence or settlement flags from the database.
Use explicit local, simulation and testnet modes; show incomplete stages honestly.
Missing data, unsupported patterns, RPC failure and stale evidence never become pass.
Preview and diagnostic results cannot settle a funded agreement.
Do not run arbitrary uploaded code; do not give the worker upgrade/funding keys.

## Work cycle
Start from agreed base commit; record task ID and branch. Read existing work first.
Write meaningful failing tests for behavior/security changes, implement, run task checks, inspect diff, and commit only owned paths.
No broad git add . in a shared/unreviewed checkout. Do not amend another person's commits, reset their work or force-push shared branches.
Do not edit generated ABI files manually; regenerate from the pinned build.
Commit message: type(scope): concrete behavior [PB-NN]. Include Why and Validation in the body for nontrivial changes.
A completed task includes exact checks and outcome, commit ID, public interface changes, migration/config needs and remaining limitations.
Do not claim completion if the critical acceptance test did not run.
Keep a short per-task handoff in docs/handoffs/PB-NN.md rather than requiring a reader to find old chats.

## Security boundaries
Wallet owners sign their own transactions. Server login does not grant blockchain authority.
Authenticate report receiver origin and domain; bind policy, scope, source and destination.
Check full inventory/test coverage and one agreed snapshot per initial run.
Preserve first authenticated message receipt and safe pending-message handling.
Keep fixed deadlines; fully allocate accounted balances; never silently rewrite funded terms.
Unknown trust or sponsor capability is a blocker to that dependent claim, not license to fake integration.

## Collaboration
Use one task branch and one checkout per active writer. Shared interface changes land first.
Use repository docs as shared memory; one agent cannot see another agent's chat unless supplied.
Use measured provider/tool facts; do not invent exact versions/addresses.
Ask the coordinator about material scope/trust changes; settle routine implementation choices within the task.

\n