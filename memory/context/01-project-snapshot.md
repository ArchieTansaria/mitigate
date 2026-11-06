# PatchBond snapshot
Updated 2026-11-06.

PatchBond checks whether an agreed repair reached all registered customer deployments and passes agreed application-level checks. It explains failures and authorized action owners. An optional funded agreement uses source-chain acceptance, CRE reporting, CCIP delivery and Arc settlement.

Planned flow: supplier proposes repair -> parties approve exact scope/repair/tests -> inspect registered routes -> execute tests at pinned snapshot -> explain gaps -> authorized owners act with their wallets -> fresh deployed-state verification -> qualifying completion record -> Arc message and fixed settlement rules.

No product feature, contract, Studio project, sponsor integration or deployment has been built yet. Bonzo is motivation/example only; its report describes an upstream verifier bug, not evidence that Bonzo missed an available patch. No claim that PatchBond would have prevented that incident.
