# PB-19 — bounded review and unallocated recovery

The campaign now supports supplier/challenger disputes before the original claim challenge cutoff, reviewer decisions before a fixed review deadline, and permissionless timeout rejection at/after that deadline. Awards preserve the grant for the fixed recipient; rejection and timeout release exactly the reservation. Reviewer silence never awards and may disadvantage an honest claimant.

After claim deadline D, the supplier can recover only unallocated funds. Reserved and awarded grants remain protected. Recovery verifies exact token balance deltas and rolls back on failure. Rejected deployment claims may retry before D with a new valid receipt; PB-16 replay protection remains effective. Focused local Foundry checks passed 13 PB-19 tests, including a 256-run fuzzed arbitrary-operation sequence. No live refund or campaign settlement was performed.
