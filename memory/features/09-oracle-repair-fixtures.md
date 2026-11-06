# 09 — Artificial oracle repair fixtures (PB-07)

fixtures/ and testpacks/oracle-adapter/ provide pinned OZ transparent proxies, deliberately stale-accepting V1 and corrected V2, independent supplier/customer controls, fresh-input and configuration checks. Includes wrong decimals and paused-market counterexamples. The market quotes collateral; it is not a full lending protocol or Bonzo/Supra recreation.

The local deploy command creates fresh Anvil instances and exports mined receipts, code/ABI hashes and repair manifests. Generated runs are ignored and never seed a verdict. See docs/handoffs/PB-07.md. PB-08/09 still must inspect real paths and run snapshot-bound scenarios; no live sponsor deployment is claimed.
