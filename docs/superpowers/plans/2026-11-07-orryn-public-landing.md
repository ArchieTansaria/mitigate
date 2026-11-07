# Orynn Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the supplied Stitch landing page into a responsive, Vercel-deployable Next.js App Router site using Tailwind CSS.

**Architecture:** Add a standalone `apps/web` pnpm workspace package for the public, read-only marketing page. Preserve the Stitch visual language while replacing fake live metrics, unsupported endorsements, external placeholder logo art, and nonfunctional actions with accurate Orynn copy and internal section links. Wallet-connected campaign screens remain a later feature.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, pnpm, Vitest.

**Spec:** `stitch_design/landing.html`; product/truth constraints in `AGENTS.md`, `docs/planning/DECISIONS.md`, and `docs/planning/INTERFACES.md`.

## Global Constraints

- Keep the page read-only; no wallet prompt or invented dashboard behavior.
- Never present illustrative status, transactions, addresses, partners, usage counts, or network telemetry as real product evidence.
- Keep off-chain web hosting distinct from Arc contract deployment; Vercel root directory is `apps/web`.
- Use the existing pnpm workspace and current Node 24 toolchain.
- Preserve the source export in `stitch_design/landing.html` for design provenance.

## Review Focus

- Mobile viewport: navigation and diagrams remain readable without horizontal overflow.
- Keyboard/screen-reader use: navigation, headings, and call-to-action links have meaningful names and targets.
- No-wallet browsing: landing page renders without a wallet provider, API, database, or chain RPC.
- Build/deploy path: Vercel can build from `apps/web` in the pnpm monorepo.
- Honest presentation: no generated Stitch demo values remain framed as live facts.

---

### Task 1: Create the Next.js/Tailwind workspace app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Modify: root `package.json`, `biome.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: package `@orryn/web` with `dev`, `build`, and `start` scripts; root commands `pnpm --filter @orryn/web <script>`.

- [x] Add a minimal `apps/web/test/landing.test.tsx` that checks the rendered landing page has a named main region, Orynn branding, internal workflow navigation, and no wallet-connect action.
- [x] Run the test before creating the app page; it failed as expected because the app page did not yet exist.
- [x] Create the App Router shell, Tailwind v4 PostCSS setup, shared brand fonts/colors, package scripts, and workspace lint inclusion.
- [x] Install/pin compatible frontend dependencies and update the lockfile.
- [x] Run the test and production build; both pass.

### Task 2: Convert the Stitch design into the Orynn landing page

**Files:**
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/components/site-header.tsx`
- Create: `apps/web/app/components/flow-illustration.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/landing.test.tsx`

**Interfaces:**
- Consumes: the global layout and Tailwind setup from Task 1.
- Produces: static `/` page with Overview, Workflow, Architecture, and Docs section anchors; CTAs stay within the page until the app console exists.

- [x] Render semantic sections with responsive Tailwind classes and a locally rendered SVG diagram.
- [x] Replace the false live claims and external demo content with accurate Orynn copy.
- [x] Label the static architecture graphic as illustrative; no fabricated values are presented as live results.
- [x] Keep page rendering server-side; no wallet connection or client-only interaction is required.
- [x] Run the page test and production build; both pass.

### Task 3: Document the deployable landing-page boundary

**Files:**
- Create: `apps/web/README.md`
- Create: `docs/handoffs/PB-29.md`
- Modify: `TASKS.md`, `STATUS.md`, `memory/context/01-project-snapshot.md`, `memory/features/INDEX.md`

**Interfaces:**
- Produces: Vercel setup instructions and an explicit boundary between the public landing page and later wallet/campaign UI.

- [x] Document Vercel root directory `apps/web`, build command `pnpm build`, and that no wallet or chain environment variables are needed for `/`.
- [x] Record verification commands and limitations in the PB-29 handoff/status/memory entries.
- [x] Run production build, `pnpm lint`, `pnpm typecheck`, page test, and inspect `git diff --check`; all pass.
- [x] Commit explicit paths as `feat(web): add Orynn public landing page [PB-29]` (`f1dece3`).
- [x] Fetch/reconcile remote `main` and push the commit without force-pushing.
