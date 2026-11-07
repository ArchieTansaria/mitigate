# Orryn — 3 minute 45 second recording

Open http://localhost:3000/demo. If the server is stopped, run `pnpm web:dev` from the repository. This route needs no environment variables, wallet, API, Docker, tokens or transaction signatures.

Use a desktop browser, ideally 1440px or wider; at smaller widths reduce browser zoom slightly if needed. Keep the simulated-demo banner visible. Click Reset demo before recording. Avoid browser refresh mid-recording because it resets the scenario. All supplier/customer names are fictional.

## 0:00–0:25 — The problem (initial screen)

“A supplier releases a security patch. Is the incident over? Not if its customers still run vulnerable deployments—or install the right code with the wrong configuration.

Orryn helps suppliers coordinate repairs across customer-owned smart contracts, and fund an allowance once the agreed repair checks pass. This walkthrough uses simulated data and transactions to demonstrate that workflow.”

## 0:25–0:55 — The missed deployment

**Click Verify all deployments. Pause on the three results.**

“Here, Signal Labs has published a repair policy for three deployments. It has committed a sixty-USDC campaign budget: twenty per eligible deployment.

Harbor passes. Atlas still uses the old implementation. But Bazaar is the interesting one: it already has the approved code, and it still fails. That is why checking a version number or implementation hash is not enough.”

## 0:55–1:25 — The important insight

**Keep Bazaar selected. Point to Maximum price age and Stale-price rejection. Scroll slightly if needed.**

“The policy requires prices no older than ninety seconds. Bazaar accepts prices up to twenty-four hours old. Its configuration defeats the repair.

Orryn’s verification approach checks the deployed dependency, configuration and agreed behavior. It checks that stale input is rejected, but also that legitimate input still works. Simply disabling the application must not count as a successful repair.”

## 1:25–1:55 — Who repairs it?

**Click Review owner repair. Show the dialog. Click Simulate owner execution, then Re-run repair checks.**

“Orryn explains the missing condition and identifies the responsible owner. The supplier cannot silently change a customer’s contract.

We prepare the action for that authorized owner. Here, the simulated repair changes the maximum price age to ninety seconds. Then we run fresh checks. A submitted transaction alone is not proof of a repair.

Now Bazaar passes. Atlas still fails, and remains visible.”

## 1:55–2:25 — Evidence and acceptance

**Click Inspect campaign acceptance.**

“The grant decision must be bound to this campaign, deployment, recipient, repair policy and test pack. A generic diagnostic pass cannot unlock money.

Our intended Chainlink path uses CRE to evaluate scoped evidence, and CCIP to deliver authenticated acceptance between chains. The local evaluator and messaging contracts exist; receipt production and live delivery are still integration work. This screen simulates acceptance rather than claiming a live Chainlink execution.”

## 2:25–2:55 — Programmable funding

**Click Submit demo claim. Show Reserved = 20. Click Advance demo challenge window. Show Awarded = 20. Click Simulate customer withdrawal.**

“On the funding side, the Arc campaign contract manages the supplier’s committed USDC budget. A pending claim reserves its allowance. A challenge window separates a claim from an award.

In this simulation, we advance that window, finalize the unchallenged claim, and show the customer withdrawing twenty USDC. Each deployment has an independent allowance: Atlas cannot hold up Bazaar’s repair grant.”

## 2:55–3:20 — Failure cases and accounting

**Click Try the same claim again. Show rejection. Click Close demo campaign & recover 40 USDC. Scroll to ledger.**

“Try the same claim again: it is rejected. Eligibility is tied to the campaign and deployment, not just a wallet address.

After the campaign deadline, unallocated money returns to the supplier. Harbor never claimed, and Atlas was never repaired. Twenty paid plus forty recovered accounts for the full sixty. This is a fixed repair allowance, not insurance or a guarantee that the entire protocol is secure.”

## 3:20–3:45 — The product and honest implementation boundary

**Click How it works. End with the architecture and Orryn branding.**

“The buyer is a contract platform or component supplier supporting many deployments it does not own. Its customers remain in control of repairs.

We have implemented the local verification pipeline, evidence and repair interface, and the campaign contracts. This recording demonstrates the intended lifecycle; live end-to-end settlement remains to be proven.

Orryn connects the missing steps: publish the requirement, verify the deployed repair, coordinate its owner, and account for the promised grant.”

## Click-only cue card

1. Reset demo.
2. Verify all deployments.
3. Explain Bazaar's approved code + unsafe configuration.
4. Review owner repair → Simulate owner execution.
5. Re-run repair checks.
6. Inspect campaign acceptance.
7. Submit demo claim → 20 reserved.
8. Advance demo challenge window → 20 awarded.
9. Simulate customer withdrawal → 20 paid.
10. Try the same claim again → rejection.
11. Close demo campaign & recover 40 USDC.
12. How it works → closing pitch.

## Recording notes

- Keep the cursor still while speaking; pause briefly after each state change.
- The local animation takes under a second. No need to wait for networks or wallets.
- One customer's allowance is paid in this story; the other two allowances return after expiry. Do not narrate two paid grants.
- Do not call this real-time verification, a delivered CCIP message, a signed receipt, a live Arc payout, or a Studio-hosted frontend. It is intentionally a presentation simulation. Use actual separately captured transaction evidence if those integrations later become live.
- If the video must be three minutes, shorten the introduction and architecture explanation. Preserve the configuration failure, owner action, recheck, grant reservation and duplicate rejection.
