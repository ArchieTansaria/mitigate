"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { friendlyError, type Health } from "@/lib/workspace";
export default function Settings() {
  const wallet = useWallet();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly triggers a fresh health check.
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setHealth(null);
    api<Health>("/health", { signal: controller.signal })
      .then(setHealth)
      .catch((e) => {
        if (!controller.signal.aborted) setError(friendlyError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="max-w-5xl space-y-7">
      <div>
        <p className="eyebrow mb-3">Know what is connected</p>
        <h1 className="page-title">Connections</h1>
        <p className="page-subtitle">
          Inspect the services and wallet this workspace is actually using.
        </p>
      </div>
      <section className="surface">
        <div className="flex items-center justify-between border-b border-line p-5">
          <h2 className="text-sm text-white">Verification service</h2>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setAttempt(attempt + 1)}
          >
            {busy ? "Checking…" : "Check connection"}
          </button>
        </div>
        <div className="p-5">
          {busy ? (
            <p role="status" className="text-sm text-muted">
              Contacting the configured API…
            </p>
          ) : error ? (
            <div role="alert">
              <p className="text-sm text-warning">
                Verification service unavailable
              </p>
              <p className="mt-2 text-xs text-muted">{error}</p>
              <p className="mt-4 text-xs leading-6 text-muted">
                The operator must configure{" "}
                <code className="text-copy">ORRYN_API_URL</code> on the Next.js
                server, start the API and worker, and set the API’s{" "}
                <code className="text-copy">API_ORIGIN</code> to this site’s
                origin. No credentials belong in this form.
              </p>
            </div>
          ) : health ? (
            <dl className="grid gap-6 text-xs sm:grid-cols-2">
              {[
                ["API status", health.status],
                ["Runtime mode", health.mode],
                ["Inspected chain", health.sourceChainId],
                ["Settlement chain", health.destinationChainId],
                [
                  "Contract configuration",
                  health.contractsConfigured
                    ? "Present — not proof of live settlement"
                    : "Not configured",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-dim">{label}</dt>
                  <dd className="mt-2 font-mono text-copy">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>
      <section className="surface p-5">
        <h2 className="text-sm text-white">Wallet & session</h2>
        <dl className="mt-5 grid gap-6 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-dim">Connected account</dt>
            <dd className="mt-2 break-all font-mono">
              {wallet.address ?? "Not connected"}
            </dd>
          </div>
          <div>
            <dt className="text-dim">Wallet chain ID</dt>
            <dd className="mt-2 font-mono">{wallet.chainId ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-dim">API session</dt>
            <dd className="mt-2">
              {wallet.status === "authenticated"
                ? "Signed in"
                : "Not signed in"}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs leading-6 text-muted">
          Signing in proves control of your address. It does not authorize
          repairs, token approvals or transfers. Those require separate
          transactions.
        </p>
      </section>
      <section className="surface p-5">
        <h2 className="text-sm text-white">Integration boundaries</h2>
        <div className="mt-5 divide-y divide-line text-xs">
          {[
            [
              "Verification worker",
              "A healthy API does not prove a worker is running. A submitted run must progress to an evidence bundle.",
            ],
            [
              "Arc campaigns",
              "Configure the settlement RPC and chain, then inspect an actual campaign contract. No campaign is selected by default.",
            ],
            [
              "Chainlink CRE / CCIP",
              "No live workflow or cross-chain delivery is inferred from a diagnostic pass. Confirm the actual source and destination transaction evidence.",
            ],
            [
              "ENS publication",
              "Outside current product scope. Import approved repair manifests directly.",
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="grid gap-2 py-4 sm:grid-cols-[160px_1fr]"
            >
              <span className="text-copy">{title}</span>
              <p className="leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
