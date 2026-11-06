# 05 — Historical chain and container probes (PB-02)

Added bounded JSON-RPC checks for chain identity, block identity/finality, EIP-1898 code/storage and final canonical-block recheck. Invalid/unavailable evidence produces unknown, never repair pass. Actual Arc/Sepolia reads: docs/evidence/pb02-public-rpc.json.

Added trusted-CLI time/output limits and a digest-pinned Docker probe with restricted network, user, filesystem, capabilities and resources. Host process groups are not security isolation; untrusted execution belongs inside the restricted container. This is feasibility, not a completed repair-test worker.

Validation: local RPC failures, subprocess regressions, real Anvil state reads and Docker restriction tests; docs/evidence/foundation-validation.md.

Next: A builds PB-04–12. No API, database, general repair runner, security verdict or deployed frontend exists yet.
