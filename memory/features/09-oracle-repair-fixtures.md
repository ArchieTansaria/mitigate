# 09 — Artificial oracle repair fixtures (PB-07)

fixtures/ and testpacks/oracle-adapter/ provide pinned OZ transparent proxies, deliberately stale-accepting V1 and corrected V2, independent supplier/customer controls, fresh-input and configuration checks. Includes wrong decimals and paused-market counterexamples. The market quotes collateral; it is not a full lending protocol or Bonzo/Supra recreation.

The local deploy command creates fresh Anvil instances and exports mined receipts, code/ABI hashes and repair manifests. Generated runs are ignored and never seed a verdict. See docs/handoffs/PB-07.md. PB-08/09 still must inspect real paths and run snapshot-bound scenarios; no live sponsor deployment is claimed.

2026-11-07 update: a separate Sepolia-only Foundry deployment script and runbook are prepared for the three demo scenarios; the local-only script remains unchanged. The script has a chain-ID guard and a passing guard test. Local build, fixture tests, Anvil provenance integration and root checks pass. The files are present in the authenticated Studio clone, but Studio execution returned no output. No Sepolia query, signature, transaction, or broadcast occurred. Actual public supplier/customer addresses are still required to simulate the exact wallet transaction bundle; approval must be given before any broadcast.
