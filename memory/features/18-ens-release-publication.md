# Feature 18 — ENS release publication (PB-13 local slice)

The ENS integration client writes distinct candidate and approved manifest pointers through a configured ENSv2 Permissioned Resolver. It validates shared manifest schema and canonical digest, checks the HTTPS artifact content before candidate publication and again before approval, requires a different proposer and approver wallet, and resolves only the approved record for consumers. The resolver's ENS EAC roles enforce actual key-level writes.

This code is not yet connected to campaign creation or the frontend and has not been exercised with team-controlled ENSv2 Sepolia records. It does not prove ENS sponsor eligibility. The funded campaign must continue to pin its own immutable policy/test-pack hashes; a later ENS record update cannot rewrite the campaign. See `docs/decisions/ens-fit.md` and `docs/handoffs/PB-13.md`.
