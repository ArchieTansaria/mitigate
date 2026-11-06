# 08 — Wallet-authenticated diagnostic API (PB-06)

services/api/src/app.ts and auth/ implement SIWE sessions, tenant-owned inputs/scopes, idempotent diagnostic runs, private evidence and explicit publication. main.ts checks networks and starts a real HTTP process. Swagger describes actual routes. No private keys needed for API wallet login.

Tests include real EIP-1271 Anvil execution, actual PostgreSQL nonce/tenant/privacy/queue tests, proxy spoof rejection and bounded shutdown. docs/runbooks/backend-start.md explains setup. The worker is not connected yet: queued does not mean verified; job succeeded does not mean repair passed. Campaign runs stay rejected until integration.
