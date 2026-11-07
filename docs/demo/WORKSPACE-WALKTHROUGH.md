# Orryn: editable sample workspace

Open `/demo/workspace` locally or on the latest frontend deployment. This separate route works without an API, wallet or backend. It models the workflow in browser state; it does not inspect contracts, run CRE/CCIP or transfer tokens. Do not paste these example schemas into the connected `/dashboard` forms.

## Recording flow (about 2 minutes 30 seconds)

1. **Overview → Reset sample → Load example JSON.** This fills both editors; it does not register anything automatically.
2. **Repair policies → Register policy.** Explain: the supplier defines approved version 2, a maximum price age of 90 seconds, and a fixed 20 test-USDC allowance per deployment.
3. **Deployments → Register deployments.** Three fictional customers: Harbor is repaired, Bazaar has approved code but wrong configuration, Atlas has old code. You can edit the names/configuration before registration; results follow the fields, not names.
4. **Verification runs → Run verification.** One passes; two fail. Bazaar is selected. Show version 2 passing but the 86,400-second freshness configuration failing. Say: “Publishing a patch is not the same as fixing every customer deployment.”
5. **Review repair → Apply sample repair → Run verification.** The sample configuration changes to 90 seconds, and the previous result is invalidated. Only the fresh run produces a pass. In the connected implementation, the actual authorized owner must execute the proposed transaction.
6. **Open campaign → Fund sample campaign.** The sample budget is 60 USDC for three independent 20-USDC allowances. Funding freezes the policy and eligible inventory.
7. Under **Atlas**, click **Simulate acceptance & claim** to show failed checks cannot reserve a grant. Under **Bazaar**, click **Simulate acceptance & claim → Advance challenge window → Simulate withdrawal**. These actions illustrate acceptance and settlement; no real receipt or transaction is produced.
8. **Try duplicate claim.** It is rejected. **Advance deadline & recover unused funds.** Ledger shows 20 paid and 40 recovered. This walkthrough closes only after pending and awarded claims settle; it is not the full contract dispute/refund state machine.

Reset before each recording. Refresh preserves registered data, history and campaign state on the same browser/origin. Unsaved editor text is not persisted. Export sample report downloads an explicitly unsigned/simulated JSON report.

## Short narration

“Orryn helps smart-contract suppliers coordinate repairs across deployments owned by their customers. A patch can be published while some customers still run old code—or the right code with unsafe settings.

This is our interactive sample workspace. I register the repair policy and three customer deployments. The policy requires version two, a ninety-second price-freshness limit, and normal operation to remain available.

When I run the sample checks, one deployment passes and two fail. Look at Bazaar: the version is correct, but its configuration accepts prices up to a day old. Checking the version alone would miss this.

Orryn makes the failing condition and responsible owner clear. Here I apply the sample repair. The old result is invalidated; I need a fresh run before the deployment qualifies. In the connected workflow, the authorized owner executes the actual repair transaction.

The supplier can also commit a remediation budget. Each eligible customer has a separate allowance. Failed checks cannot reserve it. A passing result moves through acceptance, a challenge window and withdrawal. Those settlement steps are simulated here; this recording does not execute Chainlink or onchain payments.

A second claim is rejected, and unused allowances return to the supplier after the campaign closes. Every part of the budget is accounted for.

The idea is simple: connect published repair requirements to evidence of the deployed outcome, and connect that outcome to a funded customer remediation workflow.”

## Pasteable example policy

```json
{
  "schemaVersion": 1,
  "releaseId": "oracle-freshness-v2",
  "approvedVersion": 2,
  "maxPriceAgeSeconds": 90,
  "grantUSDC": 20
}
```

## Pasteable example inventory

```json
{
  "scenario": "orryn-sample-v1",
  "deployments": [
    {
      "id": "harbor",
      "name": "Harbor Lending",
      "owner": "Harbor multisig",
      "implementationVersion": 2,
      "maxPriceAgeSeconds": 90,
      "acceptsFreshPrices": true
    },
    {
      "id": "bazaar",
      "name": "Bazaar Credit",
      "owner": "Bazaar multisig",
      "implementationVersion": 2,
      "maxPriceAgeSeconds": 86400,
      "acceptsFreshPrices": true
    },
    {
      "id": "atlas",
      "name": "Atlas Vault",
      "owner": "Atlas governance",
      "implementationVersion": 1,
      "maxPriceAgeSeconds": 90,
      "acceptsFreshPrices": true
    }
  ]
}
```

These files are also served at `/examples/sample-policy.json` and `/examples/sample-deployments.json`. The Use example buttons are faster for recording than manual copy/paste.
