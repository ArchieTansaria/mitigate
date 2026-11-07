# Orryn web application

Next.js App Router + React + Tailwind. The supplied Stitch landing page is `/`; the wallet-enabled workspace starts at `/dashboard`.

## Start

```sh
pnpm install --frozen-lockfile
pnpm web:dev
```

The landing, navigation and empty/setup screens render without a wallet or API. Start the existing API and verifier worker using `docs/runbooks/backend-start.md` for actual diagnostics.

Create `apps/web/.env.local` using `.env.example` in this directory. Never commit secrets.

- `ORRYN_API_URL`: server-only origin of the actual Fastify API, e.g. `http://127.0.0.1:3001` locally. No path, embedded credentials or silent default. Keep the backend on a different port from Next.js.
- The backend's **`API_ORIGIN` must be the frontend origin**, e.g. `http://localhost:3000`, because wallet sign-in checks the message domain and URI. Its `API_PORT` can be `3001` independently.
- `NEXT_PUBLIC_ARC_RPC_URL`: intentionally public browser RPC URL. Never use a private/credential-bearing provider URL. Used only for campaign reads, simulation and receipt checks.
- `NEXT_PUBLIC_ARC_CHAIN_ID`: configured settlement chain ID, not a CCIP selector. Actual RPC chain is checked. No campaign contract is assumed; enter an existing deployed campaign address.

Restart development after environment changes. Public RPC/chain variables are baked into the production build. The server API URL remains server-side.

## Screens

| Route                    | Behavior                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Public marketing page, no wallet request                                                                                        |
| `/dashboard`             | Workspace overview and local recent-run references                                                                              |
| `/dashboard/runs/new`    | Manifest import → registered inventory → bound scope → real diagnostic job                                                      |
| `/dashboard/runs`        | Account-separated browser run references, authoritative API statuses, open by run UUID                                          |
| `/dashboard/runs/[id]`   | Private evidence, polling, cancellation, explicit publication, owner repair proposal/revalidation/transaction, fresh diagnostic |
| `/dashboard/deployments` | Supported deployment scope and entry into inventory registration; no fabricated global fleet index                              |
| `/dashboard/releases`    | Validate and register supplier manifest JSON through the API                                                                    |
| `/dashboard/campaigns`   | Read an existing campaign and prepare authorized funding, claim, dispute, finalization, withdrawal and recovery calls           |
| `/dashboard/settings`    | Actual API health, wallet/session and integration boundaries                                                                    |
| `/reports/[id]`          | Read explicitly published evidence without a wallet; private reports remain inaccessible                                        |

Connect wallet, then sign in for private diagnostics. Connection never sends a transaction. Sessions stay in an HttpOnly cookie; tokens never enter localStorage. Wallet account/network changes invalidate API authentication. Reconnect/sign in after refresh; the browser does not silently trust an old session. Recent run IDs/labels are saved locally per wallet as a navigation convenience, not an authoritative fleet/history database.

The API supports diagnostic runs only. Neither passing diagnostic evidence nor a browser badge creates a payable campaign receipt. Campaign claim submission needs a real separately issued campaign-scoped signed receipt and eligibility proof. Missing configuration, failed reads, stale reports and unsupported repairs remain explicit failures/unavailable states. Campaign creation/deployment and live CRE/CCIP completion remain unfinished integration work. ENS is retired from active scope.

## Verification

```sh
pnpm exec vitest run apps/web/test
pnpm --filter @orryn/web build
pnpm lint
pnpm typecheck
pnpm typecheck:cre
```

Frontend unit tests intentionally inject test providers/responses to exercise error, signature and authorization boundaries. This does not establish browser-to-live-chain completion. See PB-25/PB-26 handoffs for the actual validation run and remaining gates.

## Hosting

For Vercel, import the pnpm monorepo with root directory `apps/web`, Next.js preset and `pnpm build`. Configure the server-only API origin and public campaign RPC/chain as above. The verifier worker needs its own compatible host; Next.js does not run isolated Docker verification jobs.

This local Next.js implementation has **not** been imported, built or deployed through Arc Studio. Vercel hosting does not establish the Studio prize requirements. Retain the separate shared Studio project and prove its frontend/backend integration before claiming that requirement.

Source design: `stitch_design/landing.html`. Brand spelling is **Orryn**; existing `orynn` CSS color token is an internal historical name only.
