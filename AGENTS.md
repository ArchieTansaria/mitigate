# PatchBond contributor rules
Before editing read docs/planning/DECISIONS.md, INTERFACES.md, COLLABORATION.md, the assigned implementation task and relevant handbook sections. Check memory/features/INDEX.md for completed work.

## Task boundaries
Work on one assigned PB task at a time, only its declared files. A owns shared schemas/config, API, database, worker, evidence and later UI. B owns fixtures, contracts, CRE/CCIP and conditional ENS. Freeze the shared schema and ABI before parallel consumers proceed. Get agreement before editing another owner's files or changing shared interfaces.

## Truth and security
No hardcoded outcomes, fixture-address branches, fabricated chain evidence, silent mock fallbacks, or UI-controlled acceptance/payout. Missing, stale, unsupported or unavailable evidence never means Pass. Preview and diagnostic evidence cannot settle a funded agreement. Do not execute arbitrary uploaded code. Do not put participant keys in the worker/API. Owners authorize state changes through their own wallets.

Use integer base units, never floating point for token amounts. Distinguish chain IDs from CCIP selectors. Bind evidence to policy, scope and chain domain. Preserve fixed deadlines, terminal accounting and pending-message recovery. Do not silently change funded terms. Do not place secrets in logs, artifacts, Git or browser code.

## Work and commits
Use feature branches and one writer per task. Write behavior/security checks before implementation, run assigned checks, inspect the staged diff and commit explicit paths. Never git add everything in a shared/dirty tree. Do not amend teammate commits, reset shared changes or force-push. Commit format: type(scope): concrete behavior [PB-NN]. For meaningful work, explain Why, actual Validation and Limits.
Complete docs/handoffs/PB-NN.md. Update TASKS.md, STATUS.md and memory/features only at meaningful feature completion. Record product decisions in docs/planning/DECISIONS.md.

Testnet deploys, credentials, permission changes and public sharing must be explicit task steps. Keep simulated and live behavior visibly distinct. Studio-generated code needs independent review.
