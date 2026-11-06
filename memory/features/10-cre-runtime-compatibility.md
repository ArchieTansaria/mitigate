# 10 — CRE runtime compatibility proven in simulation

workflows/cre-probe/ uses the actual shared PB-03 receipt encoding in CRE WASM. The public signed test vector verifies, tampered versions reject, HTTP fetch and finalized Sepolia contract reads run. Six host tests and successful/negative CLI simulation evidence are recorded in docs/evidence/cre-probe.json.

Use isolated Bun install; this package is excluded from pnpm workspace discovery. No credentials are copied. No deployed DON workflow, product repair acceptance, onchain report delivery or CCIP send exists here. PB-21 still must ingest real verifier evidence and deliver authenticated reports. Do not duplicate the schema or call this fixture signature a live accepted repair.
