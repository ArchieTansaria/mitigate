# Replaying a diagnostic report

Requirements: pinned Node/pnpm dependencies, Git submodules, Docker and approved compiled fixtures. Run `pnpm install --frozen-lockfile`, `pnpm build:fixtures`, and pull the pinned Foundry image from docs/toolchain.md. The source chain does not need to remain online for this exact supported offline replay.

Save the original signed response from `/v1/runs/:id/evidence` as `evidence.json` and obtain the original **independently trusted scope** (including evaluator, manifest and inventory commitments) as `trusted-scope.json`. The authenticated scope-creation response contains `spec`; save that object. Do not accept a scope merely because an untrusted report supplied it.

```
pnpm replay /absolute/path/evidence.json /absolute/path/trusted-scope.json
```

This checks signature, scope, complete coverage, freshness and installed pack/helper identity before recreating the recorded state in a fresh isolated container. It compares complete runner results, recorded interventions and execution fingerprints. A signature mismatch or altered artifact fails. Unknown execution cannot become a successful replay. No signer key, RPC URL, transaction or payment is required.

For an expired historical report, use `--historical` explicitly. This verifies at the report's signed issue time and prints `historical-only`. A matching historical replay does not establish current deployment health, current canonicality or present grant eligibility. To obtain new current evidence, submit a new deployed diagnostic run: that path performs fresh confirmed RPC reads. Archive RPC is required for independently re-reading an old source snapshot; this command reproduces captured evidence, not chain truth.

Only the exact recognized artificial oracle family is supported. Captured code/state are public execution inputs, not a generic full-chain snapshot or state proof. No arbitrary test repositories/code, FFI, external HTTP or RPC credentials enter the container. Review docs/handoffs/PB-09.md before adding a new family.
