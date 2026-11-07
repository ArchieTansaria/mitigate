"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import {
  friendlyError,
  type Job,
  ManifestSchema,
  parseInventoryInput,
  rememberRun,
} from "@/lib/workspace";
import { ManifestInput } from "../../../components/workspace/manifest-input";
import { Icon } from "../../../components/workspace/ui-icon";

type Row = {
  key: string;
  entrypoint: string;
  chainId: string;
  marketSelector: string;
  dependencyPath: string;
  authority: "owner" | "multisig" | "governance";
};
const newRow = (): Row => ({
  key: crypto.randomUUID(),
  entrypoint: "",
  chainId: "",
  marketSelector: "",
  dependencyPath: "",
  authority: "owner",
});
type Doc = { id: string; digest: string };
export default function NewRun() {
  const router = useRouter();
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [manifest, setManifest] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [age, setAge] = useState("3600");
  const [confirmations, setConfirmations] = useState("12");
  const [mode, setMode] = useState<"deployed" | "preview">("deployed");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const submission = useRef<{ key: string; body: string } | null>(null);
  const active = useRef<AbortController | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity transitions must invalidate pending submissions.
  useLayoutEffect(() => {
    setBusy(false);
    setProgress("");
    setError("");
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [wallet.address, wallet.chainId, wallet.status]);
  const inventory = () =>
    parseInventoryInput({
      schemaVersion: 1,
      deployments: rows.map((r) => ({
        chainId: r.chainId,
        entrypoint: r.entrypoint,
        marketSelector: r.marketSelector || `0x${"0".repeat(64)}`,
        inspectionModuleId: "eip1967-transparent-v1",
        declaredDependencyPath: r.dependencyPath
          .split(/[\s,]+/)
          .filter(Boolean),
        expectedAuthorityModel: r.authority,
      })),
    });
  function next() {
    setError("");
    try {
      if (step === 0) {
        const m = ManifestSchema.parse(JSON.parse(manifest));
        if (!rows.length) setRows([{ ...newRow(), chainId: m.sourceChainId }]);
      } else {
        const inv = inventory();
        const m = ManifestSchema.parse(JSON.parse(manifest));
        if (inv.deployments.some((d) => d.chainId !== m.sourceChainId))
          throw new Error(
            "Every deployment must use the manifest’s source chain.",
          );
        if (
          new Set(
            inv.deployments.map(
              (d) =>
                `${d.chainId}:${d.entrypoint.toLowerCase()}:${d.marketSelector}`,
            ),
          ).size !== inv.deployments.length
        )
          throw new Error("Duplicate deployment in this inventory.");
      }
      setStep(step + 1);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function submit() {
    if (active.current) return;
    if (
      wallet.status !== "authenticated" ||
      !wallet.address ||
      !wallet.chainId
    ) {
      setError("Connect and sign in with your wallet before submitting.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const current = () =>
      active.current === controller && !controller.signal.aborted;
    const assertCurrent = () => {
      if (!current())
        throw new Error("Wallet changed. Submit again after signing in.");
    };
    setBusy(true);
    setError("");
    try {
      const inv = inventory();
      const m = ManifestSchema.parse(JSON.parse(manifest));
      if (!/^\d+$/.test(age) || Number(age) < 1 || Number(age) > 86400)
        throw new Error("Snapshot age must be 1–86400 seconds.");
      if (
        !/^\d+$/.test(confirmations) ||
        Number(confirmations) < 1 ||
        Number(confirmations) > 10000
      )
        throw new Error("Confirmations must be 1–10000.");
      setProgress("Registering inventory and repair policy…");
      const [i, release] = await Promise.all([
        api<Doc>("/v1/inventories", {
          method: "POST",
          body: JSON.stringify(inv),
          signal: controller.signal,
        }),
        api<Doc>("/v1/manifests", {
          method: "POST",
          body: JSON.stringify(m),
          signal: controller.signal,
        }),
      ]);
      assertCurrent();
      setProgress("Binding the verification scope…");
      const scope = await api<Doc & { spec: { verificationScopeId: string } }>(
        "/v1/verification-scopes",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            schemaVersion: 1,
            inventoryId: i.id,
            manifestId: release.id,
            maxSnapshotAge: String(Number(age)),
            confirmations: Number(confirmations),
          }),
        },
      );
      assertCurrent();
      const body = JSON.stringify({
        schemaVersion: 1,
        verificationScopeId: scope.spec.verificationScopeId,
        verificationSpecDigest: scope.digest,
        inventoryDigest: i.digest,
        manifestDigest: release.digest,
        purpose: "diagnostic",
        mode,
      });
      if (submission.current?.body !== body)
        submission.current = { key: crypto.randomUUID(), body };
      setProgress("Queuing verification…");
      const run = await api<Job>("/v1/runs", {
        method: "POST",
        headers: { "Idempotency-Key": submission.current.key },
        body,
        signal: controller.signal,
      });
      assertCurrent();
      rememberRun(wallet.address, {
        id: run.id,
        name: name.trim() || m.releaseId,
        createdAt: new Date().toISOString(),
      });
      router.push(`/dashboard/runs/${run.id}`);
    } catch (e) {
      if (current()) setError(friendlyError(e));
    } finally {
      if (active.current === controller) {
        controller.abort();
        active.current = null;
        setBusy(false);
        setProgress("");
      }
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Link
        href="/dashboard/runs"
        className="text-xs text-muted hover:text-white"
      >
        ← Verification runs
      </Link>
      <div>
        <p className="eyebrow mb-3 text-orynn">A result you can inspect</p>
        <h1 className="page-title">New verification</h1>
        <p className="page-subtitle">
          Define what should be repaired. We’ll check what’s actually deployed.
        </p>
      </div>
      <ol className="flex rounded-lg border border-line bg-panel p-2">
        {["Repair policy", "Deployment scope", "Review & run"].map(
          (label, i) => (
            <li
              key={label}
              className={`flex flex-1 items-center gap-2 rounded px-3 py-3 text-xs ${step === i ? "bg-orynn/10 text-orynn" : "text-dim"}`}
              aria-current={step === i ? "step" : undefined}
            >
              <span className="font-mono">0{i + 1}</span>
              <span>{label}</span>
            </li>
          ),
        )}
      </ol>
      <div className="surface p-5 md:p-8">
        {step === 0 && (
          <ManifestInput value={manifest} onChange={setManifest} />
        )}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg text-white">
                Which deployments should we inspect?
              </h2>
              <p className="mt-2 text-xs leading-6 text-muted">
                Add the customer application entrypoint and its expected
                dependency path. Leave the market selector blank only when no
                selector applies.
              </p>
            </div>
            {rows.map((row, index) => (
              <fieldset
                key={row.key}
                className="rounded-lg border border-line-strong p-4"
              >
                <legend className="px-2 font-mono text-[10px] uppercase text-orynn">
                  Deployment {index + 1}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["entrypoint", "Application entrypoint", "0x…"],
                      ["chainId", "Source chain ID", "From your manifest"],
                      [
                        "dependencyPath",
                        "Declared dependency path (in order)",
                        "Addresses separated by commas",
                      ],
                      [
                        "marketSelector",
                        "Market selector (optional)",
                        "32-byte hex, or blank",
                      ],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label key={key} className="text-xs text-muted">
                      {label}
                      <input
                        className="field mt-2 font-mono text-xs"
                        value={row[key]}
                        placeholder={placeholder}
                        onChange={(e) =>
                          setRows(
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, [key]: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <label className="text-xs text-muted">
                    Expected authority
                    <select
                      className="field mt-2"
                      value={row.authority}
                      onChange={(e) =>
                        setRows(
                          rows.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  authority: e.target.value as Row["authority"],
                                }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="owner">Owner wallet</option>
                      <option value="multisig">Multisig</option>
                      <option value="governance">Governance</option>
                    </select>
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows(rows.filter((r) => r.key !== row.key))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn-secondary"
              disabled={rows.length >= 20}
              onClick={() =>
                setRows([
                  ...rows,
                  { ...newRow(), chainId: rows[0]?.chainId ?? "" },
                ])
              }
            >
              <Icon name="plus" />
              Add deployment
            </button>
            <p className="text-xs text-dim">
              Up to 20 deployments per run. No arbitrary test code is accepted.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg text-white">Review the scope</h2>
              <p className="mt-2 text-xs text-muted">
                {rows.length} registered deployment
                {rows.length !== 1 ? "s" : ""} ·{" "}
                {ManifestSchema.parse(JSON.parse(manifest)).releaseId}
              </p>
            </div>
            <label className="block text-xs text-muted">
              Run label (saved in this browser)
              <input
                className="field mt-2"
                maxLength={128}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Oracle adapter repair"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Maximum snapshot age (seconds)
                <input
                  className="field mt-2"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                Required confirmations
                <input
                  className="field mt-2"
                  inputMode="numeric"
                  value={confirmations}
                  onChange={(e) => setConfirmations(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Verification mode
              <select
                className="field mt-2"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="deployed">
                  Deployed — inspect the registered state
                </option>
                <option value="preview">
                  Preview — explicitly non-accepting
                </option>
              </select>
            </label>
            <div className="notice">
              <strong className="text-copy">
                Diagnostic verification only.
              </strong>{" "}
              This run cannot authorize a grant. Supported behavior checks run
              in isolation; no repair is broadcast. Results remain private
              unless you explicitly publish them.
            </div>
            {wallet.status !== "authenticated" && (
              <p className="text-xs text-warning">
                Use Connect wallet, then Sign in in the top bar before running
                verification.
              </p>
            )}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs leading-6 text-warning"
          >
            {error}
          </div>
        )}
        {progress && (
          <p role="status" className="mt-4 text-xs text-orynn">
            {progress}
          </p>
        )}
        <div className="mt-8 flex justify-between border-t border-line pt-5">
          <button
            className="btn-secondary"
            type="button"
            disabled={step === 0 || busy}
            onClick={() => {
              setError("");
              setStep(step - 1);
            }}
          >
            Back
          </button>
          {step < 2 ? (
            <button className="btn-primary" type="button" onClick={next}>
              Continue <Icon name="arrow" />
            </button>
          ) : (
            <button
              className="btn-primary"
              type="button"
              disabled={busy || wallet.status !== "authenticated"}
              onClick={() => void submit()}
            >
              {busy ? "Submitting…" : "Run verification"}
              <Icon name="arrow" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
