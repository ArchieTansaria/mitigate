# PB-13 — ENS release publication fit

**Decision (2026-11-07):** Keep ENS as an optional, real release-discovery and delegated-approval path in the MVP. Do not claim ENS prize eligibility yet. Functional code exists, but live ENSv2 Sepolia permission evidence, a team-controlled name/resolver and mentor confirmation are still missing.

## User value

A supplier can publish a candidate repair manifest under a stable, readable ENS release name, let an engineer propose releases, and require a separate security approver to publish the approved pointer. PatchBond consumers resolve the approved pointer, retrieve the actual structured manifest and reject unavailable or changed content. This helps customers discover which release the supplier currently recommends without trusting an editable web page or asking the supplier to resend a document to every customer.

This is discovery and release authority, not repair verification. A published manifest does not prove that its code is safe, that an affected deployment installed it, or that the supplier is a legally identified company. The verifier still inspects each deployment. When a campaign is created, its policy and test-pack hashes must be frozen onchain; later ENS edits must not alter a funded campaign.

## Why ENS instead of a normal database pointer

The useful ENS contribution is a public, portable release namespace plus onchain, delegated control over record keys. A supplier-controlled resolver can grant one account the right to set only `patchbond.candidate-manifest.v1`; a different security approver can hold the right to set only `patchbond.approved-manifest.v1`. A failed write is rejected by ENS's Permissioned Resolver, rather than by PatchBond's UI alone.

The supplier must use a dedicated resolver for this release authority. ENSv2 setter permissions are scoped to a key across every name served by one resolver, not to an individual name. Sharing that resolver with unrelated names would widen the delegated role. Root/admin roles also remain a trust boundary and must be documented.

## Alternatives and limits

- **Chosen:** ENS records point to an HTTPS manifest plus canonical digest. ENS offers discoverability and key-level role delegation; PatchBond validates the manifest bytes and pins hashes into later campaign terms.
- **Rejected for this integration:** making ENS the source of repair truth or allowing mutable records to rewrite a funded campaign. ENS does not inspect deployments or guarantee artifact availability.
- **Still a valid alternative:** a signed vendor feed or ordinary HTTPS endpoint. For a single supplier and a single verifier, that may be cheaper. ENS earns its place only when customers benefit from independent public discovery and distinct release-author/approver permissions.

No ENS mentor feedback is recorded as of this decision. Before claiming track eligibility, demonstrate the complete functional flow on ENSv2 Sepolia with controlled roles and ask ENS mentors whether this release-authority workflow is central enough for the prize. If they reject the fit or the team cannot obtain a controlled name, remove the ENS prize claim and keep the ordinary manifest path.
