# Feature 22 — Orryn campaign console (PB-26 local UI)

2026-11-07. `/dashboard/campaigns` reads an existing configured campaign from Arc RPC, checks the chain and pinned contract state, and prepares role/deadline-aware funding, activation, claims, disputes, finalization, withdrawals and recovery through the user's wallet. Actual receipt confirmation triggers fresh reads. All money uses integer six-decimal USDC units.

ABI parity and policy vectors are tested against the repository contracts; provider tests are explicitly simulated. No live Arc transaction was sent. Missing RPC/chain/address shows configuration UI rather than invented deployment data. Diagnostic evidence is ineligible for claims; campaign receipt production remains unfinished. No deployment/create wizard, ENS UI or delivered CCIP status is claimed.

See `docs/handoffs/PB-26.md` for gates. Do not duplicate this contract console; wire and validate actual deployed contracts next.

## Final validation
- `vitest run`: 27 files / 204 tests passed, including frontend and existing unit suites.
- Next.js production build: passed; all dashboard, report and API bridge routes generated.
- Root TypeScript, CRE TypeScript and repository Biome checks: passed (130 files).
- Production HTTP smoke: six page routes returned 200; absent API configuration returned explicit 503.
- Component/provider doubles are test fixtures only. Live wallet, worker-to-browser and Arc settlement remain unverified; the separate repair integration attempt failed at the local Docker runtime.
