# 11 — Deployment path and authority inspection (PB-08)
Code: services/verifier/src/inspect/{rpc,transparent-oracle}.ts.
Follows actual application routing at one confirmed canonical snapshot, recognizes exact compiled supported runtimes (including proxy immutable admin), checks policy/code/configuration, and names observed upgrade/configuration/market/source owners. Unknown systems fail closed. Test fixture helpers are local-only. No repair tests or signing yet; PB-09 consumes observed state.
Validation and limitations: docs/handoffs/PB-08.md. Commit: Git log [PB-08].
