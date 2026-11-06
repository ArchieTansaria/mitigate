# Feature 06 — immutable campaign registry (PB-15)

PB-15 adds a supplier-created immutable policy registry with recipient-bound sorted-pair Merkle eligibility proofs. It hashes the exact frozen PB-03 `Policy`, rejects invalid domains/roles/USDC decimals/terms, caps registered leaves to the declared eligible count, and prevents duplicate `(campaignId, deploymentKey)` registration regardless of relayer. Reads expose the policy/hash, required funding amount and eligibility/recipient state for the next contracts.

The code and 67 Foundry tests were built and run in the account-visible Arc Studio app `6d269b6a-ad75-41d7-b8f3-8d1d1d8a1b44`, then pulled into Git commit `7963dd1`. Studio validated the registry's hashes against PB-03 helpers; it did not cross-check the missing PB-03 JSON vector during PB-15. No live deployment or funding occurred. Local test reproduction is constrained by missing Foundry submodule contents and the default Node 22 shell.
