# Feature 23 — Orryn recording demo (PB-30)

2026-11-07. `/demo` is a separately labelled, deterministic presentation simulation requested by the user. It is not a live integration fallback. No wallet, API, RPC or signing is used. The real dashboard and acceptance rules are unchanged.

Three fictional deployments demonstrate a version mismatch and, critically, approved code with unsafe configuration. Guided controls show owner authority, recheck, unsigned acceptance illustration, reserved/awarded/paid accounting, duplicate rejection and campaign recovery. 60 budget = 20 paid + 40 recovered. Reset restarts the scenario; no data is persisted.

Recording script and click cues: `docs/demo/RECORDING-SCRIPT.md` (~501 spoken words / 3–4 minutes). Handoff: `docs/handoffs/PB-30.md`.

Validation: 134 frontend tests pass, including 3 demo transition/accounting tests. Scoped Biome and web TypeScript pass. Full browser walkthrough reached final accounting and duplicate rejection. No live execution evidence is claimed.

Production validation: `next build --webpack` passed, including `/demo`. Default Turbopack build failed locally when its CSS subprocess could not bind a port (OS permission error); no source workaround or default build-script change was made. The running development page and complete browser walkthrough succeeded.
