# Sponsor runtime decision

Status: **open; no topology selected yet.**

Current fact: Arc Studio CLI 1.2.2 is installed, but this machine is not authenticated and no Studio app exists. Its agent guide describes Studio as a hosted sandbox that can generate/deploy an app and exchange artifacts through the CLI. It cannot directly edit this checkout. The guide lists Chainlink and ENS skills, but those are prompts/tooling paths, not proof of sponsor-track compliance.

We will not assume Studio hosts the PatchBond verification API or a persistent worker. PB-01 must test a Studio app calling a minimal external API and independently prove the CRE/CCIP path. If the app cannot reach the verifier safely, retain a separately hosted API and make that boundary visible in the demo. No Arc contract architecture is frozen until a real receiver state change has been verified.

Evidence: `docs/evidence/sponsor-probes.md`. Revisit after owner login and live testnet probes.
