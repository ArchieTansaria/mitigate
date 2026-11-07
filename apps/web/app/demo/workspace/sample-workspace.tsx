"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  emptySample,
  latestSampleResult,
  type SampleAction,
  type SampleWorkspace,
  SavedSampleSchema,
  sampleAccounting,
  sampleInventory,
  samplePolicy,
  updateSample,
} from "@/lib/sample-workspace";
import { friendlyError } from "@/lib/workspace";
import { Icon, Mark } from "../../components/workspace/ui-icon";

const navigation = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "policies", label: "Repair policies", icon: "releases" },
  { id: "deployments", label: "Deployments", icon: "deployments" },
  { id: "runs", label: "Verification runs", icon: "runs" },
  { id: "campaigns", label: "Campaigns", icon: "campaigns" },
];
const storageKey = "orryn:sample-workspace:v1";
function Badge({
  children,
  pass,
}: {
  children: React.ReactNode;
  pass?: boolean;
}) {
  return (
    <span
      className={`status-pill ${pass === true ? "border-success/30 text-success" : pass === false ? "border-warning/30 text-warning" : ""}`}
    >
      {children}
    </span>
  );
}
export function SampleWorkspaceApp() {
  const [state, setState] = useState<SampleWorkspace>(emptySample);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("bazaar"),
    [repair, setRepair] = useState<string | null>(null),
    [menu, setMenu] = useState(false);
  const [policyText, setPolicyText] = useState(""),
    [inventoryText, setInventoryText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = SavedSampleSchema.parse(JSON.parse(raw));
        setState(parsed);
        stateRef.current = parsed;
      }
    } catch {
      setNotice(
        "Saved sample could not be loaded. Starting an empty sample workspace.",
      );
    }
    const hash = window.location.hash.slice(1);
    if (navigation.some((n) => n.id === hash)) setTab(hash);
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        setNotice(
          "Browser storage unavailable. Keep this tab open during recording.",
        );
      }
  }, [state, ready]);
  useEffect(() => {
    if (repair) dialog.current?.showModal();
    else dialog.current?.close();
  }, [repair]);
  const money = sampleAccounting(state),
    lastRun = state.runs[0];
  const selectedDeployment =
    state.deployments.find((d) => d.id === selected) ?? state.deployments[0];
  const selectedResult = selectedDeployment
    ? latestSampleResult(state, selectedDeployment.id)
    : null;
  const passed = state.deployments.filter(
    (d) => latestSampleResult(state, d.id)?.pass,
  ).length;
  function go(id: string) {
    setTab(id);
    setMenu(false);
    setError("");
    window.history.replaceState(null, "", `#${id}`);
  }
  function act(action: SampleAction) {
    try {
      const next = updateSample(stateRef.current, action);
      stateRef.current = next;
      setState(next);
      setError("");
      setNotice(next.events.at(-1) ?? "");
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    }
  }
  function register(kind: "policy" | "inventory") {
    try {
      const raw = kind === "policy" ? policyText : inventoryText;
      if (raw.length > 100000) throw new Error("JSON is too large.");
      if (act({ type: kind, input: JSON.parse(raw) }))
        go(kind === "policy" ? "deployments" : "runs");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    timer.current = setTimeout(() => {
      const success = act({ type: "run", at: new Date().toISOString() });
      setBusy(false);
      timer.current = null;
      if (success) go("runs");
    }, 700);
  }
  function loadExamples() {
    setPolicyText(JSON.stringify(samplePolicy, null, 2));
    setInventoryText(JSON.stringify(sampleInventory, null, 2));
    go("policies");
    setNotice(
      "Example JSON loaded into the forms. Register the policy, then the inventory.",
    );
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    const next = emptySample();
    stateRef.current = next;
    setState(next);
    setBusy(false);
    setRepair(null);
    setSelected("bazaar");
    setPolicyText("");
    setInventoryText("");
    setNotice("Sample reset. Your real workspace is unaffected.");
    go("overview");
  }
  function exportEvidence() {
    if (!lastRun) return;
    const data = {
      kind: "orryn-browser-sample",
      simulation: true,
      signed: false,
      onchain: false,
      policy: state.policy,
      run: lastRun,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lastRun.id}-sample.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const heading =
    tab === "overview"
      ? "Close the gap. Prove the repair."
      : tab === "policies"
        ? "Define what repaired means."
        : tab === "deployments"
          ? "Register your deployments."
          : tab === "runs"
            ? "Evidence, condition by condition."
            : "Fund outcomes. Account for every grant.";
  return (
    <div className="min-h-screen bg-[#080809] text-copy">
      <aside className={`workspace-sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/" className="flex items-center gap-3 px-5 py-7">
          <Mark />
          <span className="text-xl font-semibold text-white">
            Orryn<span className="text-orynn">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-7 rounded-lg border border-line p-3">
          <p className="text-xs font-medium">Signal Labs</p>
          <p className="mt-1 text-[10px] text-muted">
            Supplier repair workspace
          </p>
        </div>
        <p className="eyebrow px-6 pb-3">Workspace</p>
        <nav
          className="space-y-1 px-3"
          aria-label="Sample workspace navigation"
        >
          {navigation.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => go(n.id)}
              aria-current={tab === n.id ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs ${tab === n.id ? "bg-orynn/10 text-orynn" : "text-muted hover:bg-white/5 hover:text-white"}`}
            >
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-4 border-t border-line p-5">
          <Badge>Sample workspace</Badge>
          <p className="text-[10px] leading-5 text-dim">
            Browser-only scenario. No chain transactions.
          </p>
          <Link
            href="/dashboard"
            className="block text-xs text-muted hover:text-white"
          >
            Open connected workspace ↗
          </Link>
        </div>
      </aside>
      <div className="lg:pl-[244px]">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line px-5 md:px-9">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary lg:hidden"
              onClick={() => setMenu(!menu)}
            >
              Menu
            </button>
            <span className="text-xs text-muted">
              Workspace <span className="px-2 text-dim">/</span>
              {navigation.find((n) => n.id === tab)?.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-muted hover:text-white"
              onClick={reset}
            >
              Reset sample
            </button>
            <span className="rounded-full border border-line px-3 py-2 text-[10px] text-copy">
              Sample operator
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 px-5 py-8 md:px-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-3 text-orynn">
                {tab === "runs"
                  ? "Registered scope → verifiable conditions"
                  : "Repair operations"}
              </p>
              <h1 className="page-title">{heading}</h1>
              <p className="page-subtitle">
                {tab === "overview"
                  ? "One place to coordinate customer-owned deployments and funded remediation."
                  : tab === "policies"
                    ? "Register the implementation, configuration and behavior required by this sample campaign."
                    : tab === "deployments"
                      ? "Import a customer inventory. Each deployment keeps its own repair and grant status."
                      : tab === "runs"
                        ? "These results are calculated from your sample JSON, not read from a blockchain."
                        : "Fixed allowances, separate claims and a transparent sample ledger."}
              </p>
            </div>
            {tab === "overview" ? (
              <button
                type="button"
                className="btn-primary"
                onClick={loadExamples}
              >
                Load example JSON ↗
              </button>
            ) : tab === "runs" ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !state.policy || !state.deployments.length}
                onClick={verify}
              >
                {busy ? "Checking sample state…" : "Run verification"}
              </button>
            ) : null}
          </div>
          {!ready && <div className="notice">Loading saved sample…</div>}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs text-warning"
            >
              {error}
            </div>
          )}
          {notice && !error && (
            <p role="status" className="text-xs text-muted">
              {notice}
            </p>
          )}
          {tab === "overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Registered deployments", state.deployments.length],
                  ["Passing current checks", passed],
                  ["Sample fund / USDC", money.funded],
                ].map(([label, value]) => (
                  <div key={label} className="surface p-6">
                    <p className="eyebrow">{label}</p>
                    <p className="mt-4 font-mono text-4xl text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <section className="surface grid md:grid-cols-3">
                {[
                  {
                    n: "01",
                    title: "Define the repair",
                    body: "Import an approved version and price-freshness policy.",
                    to: "policies",
                    action: "Register policy",
                  },
                  {
                    n: "02",
                    title: "Inspect deployments",
                    body: "Find the old implementation—and the right code with the wrong configuration.",
                    to: "deployments",
                    action: "Register deployments",
                  },
                  {
                    n: "03",
                    title: "Complete the loop",
                    body: "Recheck repairs, reserve allowances and walk through settlement.",
                    to: "campaigns",
                    action: "Open campaign",
                  },
                ].map((x) => (
                  <div
                    key={x.n}
                    className="border-b border-line p-6 last:border-0 md:border-b-0 md:border-r"
                  >
                    <p className="eyebrow text-orynn">/{x.n}</p>
                    <h2 className="mt-7 text-base text-white">{x.title}</h2>
                    <p className="mb-5 mt-3 text-xs leading-6 text-muted">
                      {x.body}
                    </p>
                    <button
                      type="button"
                      className="text-xs text-orynn"
                      onClick={() => go(x.to)}
                    >
                      {x.action} ↗
                    </button>
                  </div>
                ))}
              </section>
              <section className="surface p-6">
                <h2 className="text-sm text-white">Recent activity</h2>
                {!state.events.length ? (
                  <p className="mt-5 text-xs text-muted">
                    Start by loading the example JSON. No fabricated run history
                    is preloaded.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {[...new Set(state.events.slice(-6))].reverse().map((e) => (
                      <li key={e} className="text-xs text-muted">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
          {(tab === "policies" || tab === "deployments") && (
            <>
              <div className="grid items-start gap-5 xl:grid-cols-[1fr_280px]">
                <section className="surface p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <label className="text-sm text-white" htmlFor="sample-json">
                      {tab === "policies"
                        ? "Repair policy JSON"
                        : "Deployment inventory JSON"}
                    </label>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        tab === "policies"
                          ? setPolicyText(JSON.stringify(samplePolicy, null, 2))
                          : setInventoryText(
                              JSON.stringify(sampleInventory, null, 2),
                            )
                      }
                    >
                      Use example
                    </button>
                  </div>
                  <textarea
                    id="sample-json"
                    spellCheck={false}
                    className="field min-h-80 font-mono text-xs leading-6"
                    value={tab === "policies" ? policyText : inventoryText}
                    onChange={(e) =>
                      tab === "policies"
                        ? setPolicyText(e.target.value)
                        : setInventoryText(e.target.value)
                    }
                    placeholder="Paste JSON here…"
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <a
                      className="text-xs text-muted underline"
                      href={
                        tab === "policies"
                          ? "/examples/sample-policy.json"
                          : "/examples/sample-deployments.json"
                      }
                      download
                    >
                      Download example JSON
                    </a>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!ready || state.campaign.funded}
                      onClick={() =>
                        register(tab === "policies" ? "policy" : "inventory")
                      }
                    >
                      {tab === "policies"
                        ? "Register policy"
                        : "Register deployments"}
                    </button>
                  </div>
                </section>
                <aside className="space-y-4">
                  <div className="surface p-5">
                    <p className="eyebrow">What this scenario models</p>
                    <h2 className="mt-3 text-base text-white">
                      Approved code is only one condition.
                    </h2>
                    <p className="mt-4 text-xs leading-6 text-muted">
                      Version 2 must reject prices older than the policy
                      permits. Fresh input must continue to work. Change the
                      JSON and the computed sample results change too.
                    </p>
                  </div>
                  <div className="notice">
                    Example identifiers and observations are local data.
                    Registering here does not register or inspect an onchain
                    deployment.
                  </div>
                  {state.policy && (
                    <div className="surface p-5">
                      <p className="eyebrow">Registered policy</p>
                      <p className="mt-3 text-sm text-white">
                        {state.policy.releaseId}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Version {state.policy.approvedVersion} · max age{" "}
                        {state.policy.maxPriceAgeSeconds}s
                      </p>
                    </div>
                  )}
                </aside>
              </div>
              {tab === "deployments" && state.deployments.length > 0 && (
                <DeploymentTable
                  state={state}
                  onInspect={(id) => {
                    setSelected(id);
                    go("runs");
                  }}
                />
              )}
            </>
          )}
          {tab === "runs" &&
            (!state.policy || !state.deployments.length ? (
              <div className="surface empty-state">
                <Icon name="runs" className="size-8 text-dim" />
                <h2 className="text-lg text-white">Register a scope first</h2>
                <p className="text-xs text-muted">
                  Add a policy and deployment inventory before starting a run.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={loadExamples}
                >
                  Load example JSON
                </button>
              </div>
            ) : (
              <>
                <DeploymentTable state={state} onInspect={setSelected} />
                {selectedDeployment && (
                  <section className="surface overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5">
                      <div>
                        <p className="eyebrow">
                          {lastRun?.id ?? "No run yet"} · sample observations
                        </p>
                        <h2 className="mt-2 text-lg text-white">
                          {selectedDeployment.name}
                        </h2>
                        <p className="mt-1 text-xs text-muted">
                          Responsible owner: {selectedDeployment.owner}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        {lastRun && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={exportEvidence}
                          >
                            Export sample report
                          </button>
                        )}
                        {selectedResult && !selectedResult.pass && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setRepair(selectedDeployment.id)}
                          >
                            Review repair
                          </button>
                        )}
                      </div>
                    </div>
                    {!selectedResult ? (
                      <div className="p-8 text-sm text-muted">
                        {lastRun
                          ? "Configuration changed. Run verification again to inspect fresh sample results."
                          : "Run verification to evaluate this deployment’s sample state."}
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line text-dim">
                              <tr>
                                <th className="p-4 font-normal">Condition</th>
                                <th className="p-4 font-normal">Expected</th>
                                <th className="p-4 font-normal">Observed</th>
                                <th className="p-4 font-normal">Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedResult.checks.map((c) => (
                                <tr
                                  key={c.name}
                                  className="border-b border-line"
                                >
                                  <td className="p-4 text-copy">{c.name}</td>
                                  <td className="p-4 text-muted">
                                    {c.expected}
                                  </td>
                                  <td className="p-4 text-muted">
                                    {c.observed}
                                  </td>
                                  <td className="p-4">
                                    <Badge pass={c.pass}>
                                      {c.pass ? "Pass" : "Fail"}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="p-5">
                          <p className="text-xs leading-6 text-muted">
                            {selectedResult.pass
                              ? "All required sample conditions pass. Campaign acceptance is a separate step; this unsigned report cannot pay a real grant."
                              : "An approved version alone is insufficient. Review the failing conditions, coordinate the authorized owner, then run fresh checks."}
                          </p>
                          {selectedResult.pass && (
                            <button
                              type="button"
                              className="mt-4 text-xs text-orynn"
                              onClick={() => go("campaigns")}
                            >
                              Open campaign ↗
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </section>
                )}
                {state.runs.length > 0 && (
                  <section className="surface p-5">
                    <h2 className="mb-4 text-sm text-white">
                      Verification history
                    </h2>
                    {state.runs.map((r) => (
                      <div
                        key={r.id}
                        className="flex justify-between gap-3 border-t border-line py-3 text-xs"
                      >
                        <span className="font-mono text-muted">{r.id}</span>
                        <span>
                          {r.results.filter((x) => x.pass).length}/
                          {r.results.length} passed at run time
                        </span>
                        <span className="text-dim">
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </section>
                )}
              </>
            ))}
          {tab === "campaigns" && (
            <>
              <section className="surface p-6">
                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div>
                    <p className="eyebrow">Supplier-funded remediation</p>
                    <h2 className="mt-3 text-xl text-white">
                      {state.policy?.releaseId ??
                        "No campaign terms registered"}
                    </h2>
                    <p className="mt-3 text-xs text-muted">
                      {state.deployments.length} eligible deployments ·{" "}
                      {state.policy?.grantUSDC ?? 0} test USDC per accepted
                      repair
                    </p>
                  </div>
                  <Badge pass={state.campaign.funded}>
                    {state.campaign.closed
                      ? "Closed"
                      : state.campaign.funded
                        ? "Sample fund active"
                        : "Not funded"}
                  </Badge>
                </div>
                <div className="mt-5 border-t border-line pt-5">
                  {!state.campaign.funded ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!state.policy || !state.deployments.length}
                      onClick={() => act({ type: "fund" })}
                    >
                      Fund sample campaign ·{" "}
                      {(state.policy?.grantUSDC ?? 0) *
                        state.deployments.length}{" "}
                      USDC
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={
                        state.campaign.closed ||
                        money.reserved > 0 ||
                        money.awarded > 0
                      }
                      onClick={() => act({ type: "close" })}
                    >
                      Advance deadline & recover unused funds
                    </button>
                  )}
                </div>
              </section>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["Unallocated", money.unallocated],
                  ["Reserved", money.reserved],
                  ["Awarded", money.awarded],
                  ["Paid", money.paid],
                  ["Recovered", money.recovered],
                ].map(([label, value]) => (
                  <div className="surface p-5" key={label}>
                    <p className="eyebrow">{label}</p>
                    <p className="mt-3 font-mono text-2xl text-white">
                      {value}
                      <span className="ml-2 text-[10px] text-dim">USDC</span>
                    </p>
                  </div>
                ))}
              </div>
              <section className="surface overflow-hidden">
                <div className="border-b border-line p-5">
                  <h2 className="text-sm text-white">
                    Independent deployment claims
                  </h2>
                  <p className="mt-2 text-xs text-muted">
                    This sample simulates campaign acceptance; no CRE report,
                    CCIP message or onchain transfer is produced.
                  </p>
                </div>
                {!state.deployments.length ? (
                  <div className="p-8 text-sm text-muted">
                    Register deployments first.
                  </div>
                ) : (
                  state.deployments.map((d) => {
                    const claim = state.campaign.claims[d.id],
                      result = latestSampleResult(state, d.id);
                    return (
                      <div
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5"
                      >
                        <div>
                          <p className="text-sm text-white">{d.name}</p>
                          <p className="mt-1 text-xs text-muted">
                            {claim
                              ? `Claim: ${claim}`
                              : result?.pass
                                ? "Fresh sample checks pass"
                                : result
                                  ? "Repair checks failed"
                                  : "Fresh check required"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge pass={claim === "paid" || claim === "awarded"}>
                            {claim ?? "No claim"}
                          </Badge>
                          {!claim ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={
                                !state.campaign.funded || state.campaign.closed
                              }
                              onClick={() => act({ type: "claim", id: d.id })}
                            >
                              Simulate acceptance & claim
                            </button>
                          ) : claim === "pending" ? (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() =>
                                act({ type: "finalize", id: d.id })
                              }
                            >
                              Advance challenge window
                            </button>
                          ) : claim === "awarded" ? (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() =>
                                act({ type: "withdraw", id: d.id })
                              }
                            >
                              Simulate withdrawal
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => act({ type: "claim", id: d.id })}
                            >
                              Try duplicate claim
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
              <p className="font-mono text-[10px] text-dim">
                SAMPLE LEDGER · {money.funded} funded = {money.unallocated}{" "}
                unallocated + {money.reserved} reserved + {money.awarded}{" "}
                awarded + {money.paid} paid + {money.recovered} recovered
              </p>
            </>
          )}
          <footer className="border-t border-line pt-5 text-[10px] text-dim">
            Sample data stays in this browser. No backend or wallet is
            connected.{" "}
            <Link href="/demo" className="ml-3 text-muted">
              Guided walkthrough ↗
            </Link>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          setRepair(null);
        }}
        aria-labelledby="sample-repair-title"
        className="m-auto w-[min(540px,92vw)] rounded-xl border border-line-strong bg-panel p-7 text-copy backdrop:bg-black/80"
      >
        <p className="eyebrow text-orynn">Sample owner action</p>
        <h2 id="sample-repair-title" className="mt-3 text-2xl text-white">
          Review the proposed repair.
        </h2>
        <p className="mt-4 text-sm leading-7 text-muted">
          The responsible owner is{" "}
          {state.deployments.find((d) => d.id === repair)?.owner}. Apply
          approved version {state.policy?.approvedVersion} and a maximum price
          age of {state.policy?.maxPriceAgeSeconds} seconds to this local
          scenario.
        </p>
        <p className="notice mt-5">
          This changes browser sample data only. The real product prepares a
          transaction for the authorized owner; no private key or signing is
          simulated here.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRepair(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (repair) act({ type: "repair", id: repair });
              setRepair(null);
            }}
          >
            Apply sample repair
          </button>
        </div>
      </dialog>
    </div>
  );
}
function DeploymentTable({
  state,
  onInspect,
}: {
  state: SampleWorkspace;
  onInspect: (id: string) => void;
}) {
  return (
    <section className="surface overflow-hidden">
      <div className="flex justify-between border-b border-line p-5">
        <h2 className="text-sm text-white">Registered deployments</h2>
        <span className="text-xs text-muted">
          {state.deployments.length} in scope
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-dim">
            <tr>
              <th className="p-4 font-normal">Deployment</th>
              <th className="p-4 font-normal">Implementation</th>
              <th className="p-4 font-normal">Max price age</th>
              <th className="p-4 font-normal">Latest result</th>
              <th className="p-4 font-normal">Inspect</th>
            </tr>
          </thead>
          <tbody>
            {state.deployments.map((d) => {
              const result = latestSampleResult(state, d.id);
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="p-4">
                    <strong className="font-medium text-white">{d.name}</strong>
                    <p className="mt-1 text-[10px] text-dim">
                      {d.id} · {d.owner}
                    </p>
                  </td>
                  <td className="p-4 font-mono text-muted">
                    Version {d.implementationVersion}
                  </td>
                  <td className="p-4 text-muted">{d.maxPriceAgeSeconds}s</td>
                  <td className="p-4">
                    <Badge pass={result?.pass}>
                      {result
                        ? result.pass
                          ? "Pass"
                          : "Needs repair"
                        : "Not checked"}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <button
                      type="button"
                      className="text-orynn"
                      onClick={() => onInspect(d.id)}
                    >
                      Inspect ↗
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
