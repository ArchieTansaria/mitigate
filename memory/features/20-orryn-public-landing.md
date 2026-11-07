# Feature 20 — Orynn public landing page
State: implemented
PB task: PB-29
Commit: `f1dece3` (pushed to `main`)
Why: The team needs a clear public explanation of the supplier-funded repair workflow and a real website to use for product walkthroughs.
User-visible behavior: Visitors can read the product overview, problem, workflow, architecture and evidence boundaries without connecting a wallet.
Interfaces/files: `apps/web/` is a standalone Next.js App Router package with Tailwind CSS 4. Vercel project root is `apps/web`. The original Stitch source remains at `stitch_design/landing.html`.
How to run/verify: `pnpm --filter @orryn/web dev`; deploy from the `apps/web` root in Vercel as described in `apps/web/README.md`.
Checks actually run: `pnpm install --frozen-lockfile`; `pnpm exec vitest run apps/web/test/landing.test.tsx`; `pnpm --filter @orryn/web build`; `pnpm lint`; `pnpm typecheck`; `pnpm typecheck:cre`; `git diff --check`; visual check against the local production server.
Trust/security boundary: The site is read-only and requests no wallet. It does not read chain state or receive keys. A future supplier wallet/multisig authorizes Arc funding; the customer’s own owner/multisig/governance authorizes a deployment repair and any claim transaction.
Known limitations: No Vercel deployment, live campaign console, wallet flow, live data, CRE acceptance workflow, DON deployment, or testnet payout is part of this feature. The supported verifier prototype remains limited to one documented oracle-adapter/proxy family.
Follow-up: Implement the separate wallet-enabled campaign UI only after PB-24 backend integration and evidence gates are complete.
