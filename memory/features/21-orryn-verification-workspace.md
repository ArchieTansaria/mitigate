# Feature 21 — Orryn verification workspace (PB-25 / repair part PB-26)

2026-11-07. Public brand is **Orryn**, repository remains patchbond/mitigate.

Implemented local Next.js workspace, wallet/SIWE session bridge, manifest import, inventory/scope registration, diagnostic submission/history/detail, browser evidence commitment/signature checks, explicit public reports, owner repair proposal/revalidation/transaction and fresh diagnostic. Account-bound run references are local convenience metadata; evidence is API-authoritative. No fake success fallback.

Read `docs/handoffs/PB-25.md`, `PB-26.md` and `apps/web/README.md` before further UI work. Do not rebuild these features. Full live gate remains open: today's backend repair integration failed while Docker execution stalled, including simple shell probes. Do not equate component test providers with live wallet/worker integration.

Verification results are updated at commit time. Desktop overview/wizard/settings were visually inspected. Mobile, live signatures, deployment and Arc Studio frontend integration were not demonstrated.

## Final validation
- `vitest run`: 27 files / 204 tests passed, including frontend and existing unit suites.
- Next.js production build: passed; all dashboard, report and API bridge routes generated.
- Root TypeScript, CRE TypeScript and repository Biome checks: passed (130 files).
- Production HTTP smoke: six page routes returned 200; absent API configuration returned explicit 503.
- Component/provider doubles are test fixtures only. Live wallet, worker-to-browser and Arc settlement remain unverified; the separate repair integration attempt failed at the local Docker runtime.
