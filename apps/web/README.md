# Orynn public website

This is the public, read-only landing page for Orynn. It explains the supplier/customer repair workflow and current prototype boundary. It does not connect a wallet, read chain state, create a campaign, or claim that the CRE-to-Arc acceptance path is live.

## Run locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @orryn/web dev
```

Check the production build with:

```sh
pnpm --filter @orryn/web build
pnpm --filter @orryn/web start
```

No environment variables, wallet provider, RPC endpoint, database, or API are needed to render `/`.

## Deploy to Vercel

Import the repository and configure the project as follows:

- Framework preset: **Next.js**
- Root directory: **`apps/web`**
- Build command: **`pnpm build`** (the `@orryn/web` package build script)
- Install command: let Vercel detect the pnpm monorepo, or use **`pnpm install --frozen-lockfile`** from the repository root if the setup asks for an explicit command.
- Environment variables: **none for the public landing page**

Vercel hosts the website. It does not deploy the Arc campaign contracts or verifier. Those are separate components and need their own deployment and live evidence before the site can describe them as operational.

## Source design

The original Stitch export is kept in `../../stitch_design/landing.html`. The Next.js page is a server-rendered conversion with accessible HTML, local SVG diagrams, and Tailwind CSS 4.
