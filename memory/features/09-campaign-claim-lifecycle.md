# PB-18 — per-deployment grant claims

PB-18 extends the PB-17 supplier-funded escrow with an independent claim lifecycle keyed by deployment. A fresh, passing, deployed-mode acceptance receipt is consumed by PB-16 in the same transaction that reserves exactly one grant. The receipt's committed recipient is fixed; a relayer cannot redirect the payout. Submission reserves funds without transferring tokens. Anyone can finalize after the original challenge cutoff, while only the recipient can withdraw. Exact sender and recipient balance deltas are checked and all accounting rolls back on transfer failure.

Focused local Foundry verification passed 38 tests (including 256 fuzz runs) with `pnpm test:contracts --match-path 'test/pb18/*'`. The linked Arc Studio project was the source of the implementation. Challenge/review, refunds, CCIP delivery, live evidence and live settlement are out of scope for this feature.
