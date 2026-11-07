"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  advanceDemo,
  type DemoAction,
  demoBudget,
  demoOrder,
  initialDemo,
} from "@/lib/demo";
import { Mark } from "../components/workspace/ui-icon";
import styles from "./demo.module.css";

const deployments = [
  {
    name: "Harbor Lending",
    market: "USDC market",
    code: "Approved v2",
    config: "90 seconds",
    issue: "All required checks pass",
  },
  {
    name: "Bazaar Credit",
    market: "ETH collateral market",
    code: "Approved v2",
    config: "86,400 seconds",
    issue: "Stale prices still accepted",
  },
  {
    name: "Atlas Vault",
    market: "Treasury vault",
    code: "Previous v1",
    config: "90 seconds",
    issue: "Approved implementation missing",
  },
];
const scenes = [
  "Campaign",
  "Verify deployments",
  "Repair & recheck",
  "Acceptance",
  "Grant lifecycle",
];
const copy = {
  ready: {
    eyebrow: "01 / Supplier-funded remediation",
    title: "A patch published.\nThree deployments to protect.",
    description:
      "Signal Labs has released a fix. Its customers control their own contracts. Which deployments actually meet the repair policy?",
    button: "Verify all deployments",
    action: "scan",
  },
  scanned: {
    eyebrow: "02 / Deployed behavior matters",
    title: "Right code.\nWrong behavior.",
    description:
      "Bazaar has the approved implementation—but accepts prices up to a day old. An implementation hash alone would miss this failure.",
    button: "Review owner repair",
    action: "repair",
  },
  repaired: {
    eyebrow: "03 / Customer-authorized repair",
    title: "Changed is not\nthe same as verified.",
    description:
      "The simulated owner action updated Bazaar’s configuration. The grant remains locked until a fresh check confirms the deployed outcome.",
    button: "Re-run repair checks",
    action: "recheck",
  },
  rechecked: {
    eyebrow: "03 / Fresh acceptance checks",
    title: "Reject the bad input.\nKeep the good input working.",
    description:
      "Bazaar now rejects stale prices and accepts fresh ones. Atlas still needs repair. One unfinished deployment does not block another.",
    button: "Inspect campaign acceptance",
    action: "receipt",
  },
  receipt: {
    eyebrow: "04 / Scoped campaign acceptance",
    title: "Evidence belongs\nto a specific promise.",
    description:
      "A grant needs campaign-scoped acceptance: the deployment, recipient, policy, test pack and observed state must all match. A diagnostic pass alone cannot pay.",
    button: "Submit demo claim · 20 USDC",
    action: "claim",
  },
  pending: {
    eyebrow: "05 / Reserve before release",
    title: "Twenty reserved.\nNothing paid yet.",
    description:
      "The claim enters a challenge window. Its allowance is reserved, while the remaining campaign budget stays available to other eligible deployments.",
    button: "Advance demo challenge window",
    action: "finalize",
  },
  awarded: {
    eyebrow: "05 / Independent withdrawal",
    title: "Accepted.\nReady for the customer.",
    description:
      "The demo challenge window has ended without a challenge. Bazaar can withdraw its allowance without another discretionary supplier approval.",
    button: "Simulate customer withdrawal",
    action: "withdraw",
  },
  paid: {
    eyebrow: "05 / One deployment. One grant.",
    title: "Repair accepted.\nCustomer reimbursed.",
    description:
      "Bazaar’s simulated 20 USDC grant is paid. The same deployment cannot claim again, and the supplier can recover unallocated funds after the deadline.",
    button: "Try the same claim again",
    action: "replay",
  },
  closed: {
    eyebrow: "06 / Close the loop",
    title: "A repair you can inspect.\nA budget you can account for.",
    description:
      "Twenty test USDC paid. Forty recovered. No grant for the unrepaired deployment, no duplicate payout, and no unexplained balance.",
    button: "Restart walkthrough",
    action: "scan",
  },
} as const;

function Status({
  children,
  good = false,
  warn = false,
}: {
  children: React.ReactNode;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={`${styles.status} ${good ? styles.good : warn ? styles.warn : ""}`}
    >
      <span />
      {children}
    </span>
  );
}

export function RecordingDemo() {
  const [state, setState] = useState(initialDemo);
  const [selected, setSelected] = useState(1);
  const [busy, setBusy] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);
  const [architecture, setArchitecture] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stageIndex = demoOrder.indexOf(state.stage);
  const verified = stageIndex >= 3;
  const checked = stageIndex >= 1;
  const budget = demoBudget(state);
  const current = copy[state.stage];
  const scene =
    stageIndex === 0
      ? 0
      : stageIndex === 1
        ? 1
        : stageIndex < 4
          ? 2
          : stageIndex === 4
            ? 3
            : 4;
  const chosen = deployments[selected];
  const awaitingRecheck = selected === 1 && state.stage === "repaired";
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (repairOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [repairOpen]);
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setBusy("");
    setState(initialDemo());
    setSelected(1);
    setRepairOpen(false);
    setArchitecture(false);
  }
  function run(action: DemoAction) {
    if (busy) return;
    const label =
      action === "scan" || action === "recheck"
        ? "Running simulated checks…"
        : action === "repair"
          ? "Applying simulated owner change…"
          : "Updating demo state…";
    setBusy(label);
    timer.current = setTimeout(
      () => {
        setState((previous) => advanceDemo(previous, action));
        setBusy("");
        timer.current = null;
      },
      action === "scan" || action === "recheck" ? 850 : 300,
    );
  }
  function primary() {
    setArchitecture(false);
    if (state.stage === "closed") return reset();
    if (state.stage === "scanned") {
      setSelected(1);
      setRepairOpen(true);
      return;
    }
    if (state.stage === "paid" && state.duplicateBlocked) return run("close");
    run(current.action);
  }
  const checks = [
    {
      label: "Approved implementation",
      expected: "v2 runtime matches policy",
      observed:
        selected === 2
          ? "Previous implementation v1"
          : "Approved implementation v2",
      pass: selected !== 2,
    },
    {
      label: "Maximum price age",
      expected: "90 seconds or less",
      observed:
        selected === 1 && stageIndex < 2
          ? "86,400 seconds (24 hours)"
          : "90 seconds",
      pass: selected !== 1 || verified,
    },
    {
      label: "Stale-price rejection",
      expected: "Reject a 5-minute-old price",
      observed:
        selected === 2 || (selected === 1 && !verified)
          ? "Stale input accepted"
          : "Stale input rejected",
      pass: selected !== 2 && (selected !== 1 || verified),
    },
    {
      label: "Normal operation",
      expected: "Accept a fresh, valid price",
      observed: "Fresh input accepted",
      pass: true,
    },
  ];
  const paid = budget.paid > 0;
  return (
    <div className={styles.root}>
      <div className={styles.ribbon}>
        <span className={styles.demoDot} /> SIMULATED DEMO{" "}
        <span className={styles.ribbonDetail}>
          Illustrative data · no wallet signatures or onchain transactions
        </span>
      </div>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <Mark /> Orryn<span>.</span>
        </Link>
        <nav className={styles.headerNav} aria-label="Demo navigation">
          <button
            type="button"
            onClick={() => setArchitecture(!architecture)}
            aria-pressed={architecture}
          >
            How it works
          </button>
          <Link href="/dashboard">Open workspace ↗</Link>
          <button type="button" onClick={reset} className={styles.reset}>
            ↻ Reset demo
          </button>
        </nav>
      </header>
      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.workspace}>
            <span className={styles.avatar}>S</span>
            <div>
              <strong>Signal Labs</strong>
              <small>Illustrative supplier</small>
            </div>
          </div>
          <p className="eyebrow">Repair campaign</p>
          <h2>
            Oracle freshness
            <br />
            remediation
          </h2>
          <p className={styles.sidebarDescription}>
            Fund repairs across contracts your customers control.
          </p>
          <ol className={styles.steps}>
            {scenes.map((name, i) => (
              <li
                key={name}
                className={
                  i === scene
                    ? styles.activeStep
                    : i < scene
                      ? styles.doneStep
                      : ""
                }
              >
                <span>{i < scene ? "✓" : `0${i + 1}`}</span>
                {name}
              </li>
            ))}
          </ol>
          <div className={styles.policy}>
            <p className="eyebrow">Fixed campaign terms</p>
            <dl>
              <div>
                <dt>Eligible deployments</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>Allowance / deployment</dt>
                <dd>20 USDC</dd>
              </div>
              <div>
                <dt>Funded budget</dt>
                <dd>60 USDC</dd>
              </div>
              <div>
                <dt>Source → settlement</dt>
                <dd>Sepolia → Arc</dd>
              </div>
            </dl>
            <small>Test scenario. These are not deployed campaign terms.</small>
          </div>
          <div className={styles.sidebarBottom}>
            VERIFY THE REPAIR.
            <br />
            <span>CLOSE THE LOOP.</span>
          </div>
        </aside>
        <div className={styles.content}>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>{current.eyebrow}</p>
            <div className={styles.heroGrid}>
              <div>
                <h1>{current.title}</h1>
                <p className={styles.description}>{current.description}</p>
              </div>
              <div className={styles.heroAction}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={primary}
                  disabled={!!busy}
                >
                  {busy ||
                    (state.stage === "paid" && state.duplicateBlocked
                      ? "Close demo campaign & recover 40 USDC"
                      : current.button)}
                  <span aria-hidden="true">↗</span>
                </button>
                <small>
                  {busy
                    ? "Local scenario playback"
                    : state.stage === "pending"
                      ? "Explicit simulated time jump · no real waiting"
                      : "Guided scenario · no wallet required"}
                </small>
              </div>
            </div>
          </section>
          {architecture ? (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <p className="eyebrow">Product architecture</p>
                  <h2>From published policy to funded repair.</h2>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setArchitecture(false)}
                >
                  Back to demo
                </button>
              </div>
              <div className={styles.architecture}>
                {[
                  ["Supplier", "Publishes requirements and funds allowances"],
                  ["Customer", "Owns deployment and authorizes the repair"],
                  [
                    "Orryn verifier",
                    "Checks code, configuration and agreed behavior",
                  ],
                  [
                    "Chainlink CRE / CCIP",
                    "Designed to evaluate and deliver scoped acceptance",
                  ],
                  ["Arc campaign", "Reserves, reviews and settles the grant"],
                ].map(([name, description], i) => (
                  <div key={name}>
                    <span>0{i + 1}</span>
                    <strong>{name}</strong>
                    <p>{description}</p>
                  </div>
                ))}
              </div>
              <p className={styles.honesty}>
                Implemented: local verification pipeline, evidence/repair UI and
                campaign contracts. Still pending: campaign receipt production,
                live cross-chain delivery and end-to-end settlement. This
                recording route simulates those transitions.
              </p>
            </section>
          ) : stageIndex < 4 ? (
            <>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <p className="eyebrow">Customer-owned deployments</p>
                    <h2>
                      {checked
                        ? `${verified ? "2" : "1"} of 3 meet the repair policy`
                        : "One policy. Three independent owners."}
                    </h2>
                  </div>
                  <Status good={verified} warn={checked && !verified}>
                    {checked
                      ? verified
                        ? "Recheck complete"
                        : "2 need attention"
                      : "Ready to inspect"}
                  </Status>
                </div>
                <div className={styles.deploymentList}>
                  {deployments.map((d, i) => (
                    <button
                      type="button"
                      className={`${styles.deployment} ${selected === i ? styles.selected : ""}`}
                      key={d.name}
                      onClick={() => setSelected(i)}
                      aria-pressed={selected === i}
                    >
                      <span className={styles.deploymentIcon}>
                        {["H", "B", "A"][i]}
                      </span>
                      <span className={styles.deploymentName}>
                        <strong>{d.name}</strong>
                        <small>{d.market}</small>
                      </span>
                      <span className={styles.code}>{d.code}</span>
                      <Status
                        good={checked && (i === 0 || (i === 1 && verified))}
                        warn={checked && (i === 2 || (i === 1 && !verified))}
                      >
                        {!checked
                          ? "Not checked"
                          : i === 0 || (i === 1 && verified)
                            ? "Pass"
                            : i === 1 && state.stage === "repaired"
                              ? "Recheck required"
                              : "Needs repair"}
                      </Status>
                      <span className={styles.chevron}>↗</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <p className="eyebrow">
                      {checked
                        ? "Simulated evidence / selected deployment"
                        : "Policy requirements"}
                    </p>
                    <h2>
                      {chosen.name}
                      <span className={styles.subheading}>
                        {" "}
                        / acceptance checks
                      </span>
                    </h2>
                  </div>
                  <span className={styles.smallTag}>
                    {verified ? "DEMO RECHECK 02" : "DEMO CHECK 01"}
                  </span>
                </div>
                <div className={styles.checkHeader}>
                  <span>Condition</span>
                  <span>Expected</span>
                  <span>Observed</span>
                </div>
                {checks.map((check) => (
                  <div className={styles.check} key={check.label}>
                    <strong>
                      <span
                        className={
                          !checked || awaitingRecheck
                            ? styles.dim
                            : check.pass
                              ? styles.passIcon
                              : styles.failIcon
                        }
                      >
                        {!checked || awaitingRecheck
                          ? "○"
                          : check.pass
                            ? "✓"
                            : "!"}
                      </span>
                      {check.label}
                    </strong>
                    <span>{check.expected}</span>
                    <span
                      className={
                        checked && !awaitingRecheck && !check.pass
                          ? styles.failure
                          : ""
                      }
                    >
                      {checked
                        ? selected === 1 && state.stage === "repaired"
                          ? "Awaiting fresh recheck"
                          : check.observed
                        : "—"}
                    </span>
                  </div>
                ))}
                {selected === 1 && state.stage === "scanned" && (
                  <div className={styles.insight}>
                    <span>!</span>
                    <p>
                      <strong>
                        The implementation is approved. The deployed behavior is
                        not.
                      </strong>{" "}
                      A permissive configuration defeats the repair. The
                      customer’s authorized owner must change it; Orryn cannot
                      upgrade somebody else’s contracts.
                    </p>
                  </div>
                )}
                {verified && selected === 1 && (
                  <div className={styles.successNote}>
                    ✓ Both negative and positive checks pass. Disabling the
                    application would not satisfy this policy.
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <p className="eyebrow">Bazaar Credit / fixed recipient</p>
                    <h2>
                      {state.stage === "receipt"
                        ? "A claim scoped to one repaired deployment"
                        : "Remediation grant"}
                    </h2>
                  </div>
                  <Status
                    good={paid || state.stage === "awarded"}
                    warn={state.stage === "pending"}
                  >
                    {state.stage === "receipt"
                      ? "Demo acceptance"
                      : state.stage === "pending"
                        ? "Challenge window"
                        : state.stage === "awarded"
                          ? "Withdrawable"
                          : "Paid in simulation"}
                  </Status>
                </div>
                <div className={styles.receiptGrid}>
                  <div className={styles.grantAmount}>
                    <p className="eyebrow">Customer repair allowance</p>
                    <strong>
                      20<span>USDC</span>
                    </strong>
                    <p>
                      {paid
                        ? "Simulated withdrawal complete"
                        : "Fixed allowance for this eligible deployment"}
                    </p>
                  </div>
                  <dl className={styles.receiptFields}>
                    <div>
                      <dt>Deployment</dt>
                      <dd>Bazaar Credit · ETH market</dd>
                    </div>
                    <div>
                      <dt>Repair policy</dt>
                      <dd>Approved v2 + price age ≤ 90s</dd>
                    </div>
                    <div>
                      <dt>Acceptance scope</dt>
                      <dd>Campaign + recipient + deployment</dd>
                    </div>
                    <div>
                      <dt>Required behavior</dt>
                      <dd>Reject stale · accept fresh</dd>
                    </div>
                    <div>
                      <dt>Evidence identity</dt>
                      <dd>Illustrative · unsigned · not claimable</dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.pipeline}>
                  {[
                    "Repair checked",
                    "Acceptance",
                    "Reserved",
                    "Awarded",
                    "Withdrawn",
                  ].map((label, i) => (
                    <div
                      key={label}
                      className={stageIndex >= i + 3 ? styles.pipelineDone : ""}
                    >
                      <span>{stageIndex >= i + 3 ? "✓" : "○"}</span>
                      {label}
                    </div>
                  ))}
                </div>
                <p className={styles.honesty}>
                  This demo does not create a signed acceptance receipt or a
                  CCIP message. Production settlement requires independently
                  issued, campaign-bound acceptance; a diagnostic pass is
                  insufficient.
                </p>
              </section>
              {state.duplicateBlocked && (
                <div className={styles.replayBlocked} role="status">
                  <strong>Duplicate claim rejected</strong>
                  <span>
                    Campaign + deployment already paid. Changing the wallet
                    cannot create a second entitlement.
                  </span>
                  <span className={styles.smallTag}>SIMULATED GUARD</span>
                </div>
              )}
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <p className="eyebrow">Every allowance is independent</p>
                    <h2>Other deployments keep their own status.</h2>
                  </div>
                </div>
                <div className={styles.otherDeployments}>
                  <div>
                    <strong>Harbor Lending</strong>
                    <Status good>Passed · not claimed</Status>
                    <p>
                      {state.stage === "closed"
                        ? "Unclaimed allowance recovered at deadline."
                        : "Can claim its own 20 USDC before the deadline."}
                    </p>
                  </div>
                  <div>
                    <strong>Atlas Vault</strong>
                    <Status warn>Unrepaired · no grant</Status>
                    <p>
                      Previous implementation remains. Bazaar’s claim does not
                      conceal this failure.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          <section
            className={styles.metrics}
            aria-label="Simulated campaign accounting"
          >
            {[
              ["Unallocated", budget.unallocated],
              ["Reserved", budget.reserved],
              ["Awarded", budget.awarded],
              ["Paid", budget.paid],
              ["Recovered", budget.refunded],
            ].map(([label, amount]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {amount}
                  <small>USDC</small>
                </strong>
              </div>
            ))}
          </section>
          <div className={styles.accounting}>
            <span>SIMULATED LEDGER</span>60 funded = {budget.unallocated}{" "}
            unallocated + {budget.reserved} reserved + {budget.awarded} awarded
            + {budget.paid} paid + {budget.refunded} recovered
          </div>
          <section className={styles.activity}>
            <div>
              <span className={styles.activityDot} />
              <p className="eyebrow">Latest scenario event</p>
            </div>
            <p aria-live="polite">{busy || state.log.at(-1)}</p>
            <details>
              <summary>View scenario history ({state.log.length})</summary>
              <ol>
                {state.log.map((line, i) => (
                  <li key={line}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </li>
                ))}
              </ol>
            </details>
          </section>
          <footer className={styles.footer}>
            <span>
              Orryn · Verify repairs. Coordinate owners. Account for every
              grant.
            </span>
            <Link href="/dashboard">Explore implemented workspace ↗</Link>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={(e) => {
          e.preventDefault();
          setRepairOpen(false);
        }}
      >
        <p className={styles.eyebrow}>Customer authority / simulated action</p>
        <h2>Repair the configuration.</h2>
        <p>
          Signal Labs published the fix. Bazaar’s contract owner must apply this
          change. Orryn prepares and explains it.
        </p>
        <dl>
          <div>
            <dt>Actor</dt>
            <dd>Bazaar Credit · authorized owner</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>Bazaar oracle adapter (illustrative)</dd>
          </div>
          <div>
            <dt>Action</dt>
            <dd>
              <code>setMaxAge(90)</code>
            </dd>
          </div>
          <div>
            <dt>Before → after</dt>
            <dd>86,400 seconds → 90 seconds</dd>
          </div>
          <div>
            <dt>Next step</dt>
            <dd>Run fresh checks; do not assume success</dd>
          </div>
        </dl>
        <div className={styles.honesty}>
          No wallet opens and no transaction is broadcast. This is a
          presentation-only owner action.
        </div>
        <div className={styles.dialogButtons}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRepairOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setRepairOpen(false);
              run("repair");
            }}
          >
            Simulate owner execution ↗
          </button>
        </div>
      </dialog>
    </div>
  );
}
