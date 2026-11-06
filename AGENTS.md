# PatchBond contributor rules
Before editing read docs/planning/DECISIONS.md, INTERFACES.md, COLLABORATION.md, the assigned implementation task and relevant handbook sections. Check memory/features/INDEX.md for completed work.

## Task boundaries
Work on one assigned PB task at a time in its owned files. A owns TypeScript schemas/config, API/database/worker/evidence, verifier fixtures, CRE, conditional ENS and later UI. B owns campaign/acceptance/messaging contracts PB-14–20, campaign policy/trust docs and Solidity PB-03 types/vectors. See docs/handoffs/TEAMMATE-START.md for the current assignment; earlier audit-first/numeric-range splits are superseded. B implements the prerequisites for PB-17/18 in order. Contract unit tests can use labelled signed fixtures while A builds real evidence; live integration requires matching TS/Solidity vectors and real evidence. B writes contracts/; A writes fixture contracts under fixtures/. Coordinate interface changes and hosted Studio edits; no concurrent writes.

## Truth and security
No hardcoded outcomes, fixture-address branches, fabricated chain evidence, silent mock fallbacks, or UI-controlled acceptance/payout. Missing, stale, unsupported or unavailable evidence never means Pass. Preview and diagnostic evidence cannot qualify for a supplier-funded campaign grant. Do not execute arbitrary uploaded code. Do not put participant keys in the worker/API. Owners authorize state changes through their own wallets.

Use integer base units, never floating point for token amounts. Distinguish chain IDs from CCIP selectors. Bind evidence to policy, scope and chain domain. Campaign eligibility and terms are immutable after activation. Preserve fixed deadlines, grant accounting, claim uniqueness and pending-message recovery. Do not silently change funded campaign terms. No maintainer bond, customer repair fee, penalty or slashing exists in the MVP unless a later recorded product decision changes scope. Do not place secrets in logs, artifacts, Git or browser code.

## Work and commits
Use feature branches and one writer per task. Write behavior/security checks before implementation, run assigned checks, inspect the staged diff and commit explicit paths. Never git add everything in a shared/dirty tree. Do not amend teammate commits, reset shared changes or force-push. Commit format: type(scope): concrete behavior [PB-NN]. For meaningful work, explain Why, actual Validation and Limits.
Complete docs/handoffs/PB-NN.md. Update TASKS.md, STATUS.md and memory/features only at meaningful feature completion. Record product decisions in docs/planning/DECISIONS.md.

Testnet deploys, credentials, permission changes and public sharing must be explicit task steps. Keep simulated and live behavior visibly distinct. Studio-generated code needs independent review.
