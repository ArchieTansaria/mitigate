# Orryn functional workspace — PB-25 / PB-26

The user explicitly requested the remaining frontend now, preserving the supplied dark/orange Stitch/HydraDB style. This authorizes building on existing diagnostic endpoints before the full PB-24 campaign backend gate; it does not establish that gate or sponsor deployment evidence.

## Implementation
- Shared responsive sidebar, wallet/session controls, overview, connection diagnostics and accessible feedback.
- Server-only API bridge with an allowlist, bounded requests, same-origin mutations, httpOnly sessions and no public upstream credentials.
- Supplier manifest import/registration and customer inventory → scope → diagnostic submission, real jobs and evidence.
- Evidence detail, private/public distinction, snapshot and assertion coverage, owner repair proposal/revalidation and explicit wallet transaction.
- Campaign contract view/actions using configured chain/contract state, never invented balances or diagnostic-to-grant conversion.
- Honest unavailable states for missing services, retired ENS scope and unproven CRE/CCIP delivery.
- Local recent-run references are convenience navigation only, segregated by account; the API remains authoritative.

## Validation and handoff
- Tests for request/auth boundaries, malformed/stale evidence and input/financial action construction.
- Production Next.js build, TypeScript and lint; desktop overview/wizard/settings inspected. Mobile and live wallet flows remain unverified.
- Real backend/worker and live wallet/testnet stages recorded separately if not executable in this session.
- Update PB-25/PB-26 handoffs, root task/status and context/feature notes; commit explicit files and push main.

## Ownership
Coordinator: shell, onboarding, policy/connection pages, documentation and integration.
API agent: API bridge and wallet provider only.
Evidence agent: run detail, repair/evidence helpers only.
Campaign agent: campaign pages/read/write helpers only.
No hosted Arc Studio or contract mutations in this task. Local Next.js UI is not claimed as Studio-built or deployed.

## Delivered / still open
All listed local screens, adapters and transaction controls are implemented. Review caught account-switch stale completion paths and an upstream run-status schema change; these are corrected before final validation. End-to-end wallet/worker/Arc settlement, mobile browser verification, campaign receipt production and Arc Studio frontend deployment remain open. Do not treat this frontend delivery as completion of those gates.
