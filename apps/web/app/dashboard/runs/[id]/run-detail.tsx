"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { rememberRun, validateRunId } from "@/lib/workspace";
import {
  type DiagnosticRun,
  diagnosticRerunRequest,
  downloadEvidence,
  type EvidenceIntegrity,
  errorMessage,
  parseEvidence,
  runSchema,
  shouldPollRun,
  verifyEvidenceIntegrity,
  withEvidenceIntegrity,
} from "../../../../lib/evidence";
import { EvidenceView } from "../../../components/evidence-view";
import { RepairPanel } from "./repair-panel";

export function RunDetail({ id }: { id: string }) {
  const wallet = useWallet();
  // Account changes remount all private data and invalidate pending UI responses.
  return (
    <RunSession key={`${id}:${wallet.address}:${wallet.status}`} id={id} />
  );
}

function RunSession({ id }: { id: string }) {
  const wallet = useWallet(),
    router = useRouter();
  const [run, setRun] = useState<DiagnosticRun | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [integrity, setIntegrity] = useState<{
    raw: unknown;
    result: EvidenceIntegrity;
  } | null>(null);
  const [error, setError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [action, setAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [publishDialog, setPublishDialog] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [published, setPublished] = useState(false);
  const [publicChecked, setPublicChecked] = useState(false);
  const busy = useRef(false),
    alive = useRef(true);
  const rerunKey = useRef<string | null>(null);
  const validId = validateRunId(id),
    authenticated = wallet.status === "authenticated";
  const endpoint = `/v1/runs/${encodeURIComponent(id)}`;
  const evidence = useMemo(
    () =>
      raw === null
        ? null
        : withEvidenceIntegrity(
            parseEvidence(raw, id, now),
            integrity && integrity.raw === raw ? integrity.result : null,
          ),
    [raw, id, now, integrity],
  );

  useEffect(() => {
    if (raw === null) return;
    let cancelled = false;
    void verifyEvidenceIntegrity(raw).then((result) => {
      if (!cancelled) setIntegrity({ raw, result });
    });
    return () => {
      cancelled = true;
    };
  }, [raw]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly restarts the authenticated fetch loop.
  useEffect(() => {
    if (!validId || !authenticated) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const options = { signal: controller.signal };
    async function load() {
      try {
        const next = runSchema.parse(await api<unknown>(endpoint, options));
        if (next.id !== id)
          throw new Error("API returned a different run identity.");
        if (controller.signal.aborted) return;
        setRun(next);
        setError("");
        if (next.state === "succeeded" && next.evidenceReferenceStored) {
          try {
            const data = await api<unknown>(`${endpoint}/evidence`, options);
            if (!controller.signal.aborted) {
              setRaw(data);
              setEvidenceError("");
              setNow(Math.floor(Date.now() / 1000));
            }
          } catch (e) {
            if (!controller.signal.aborted) {
              setRaw(null);
              setEvidenceError(errorMessage(e));
            }
          }
        } else {
          setRaw(null);
          setEvidenceError("");
        }
        if (shouldPollRun(next.state) && !controller.signal.aborted)
          timer = setTimeout(load, 5000);
      } catch (e) {
        if (!controller.signal.aborted) setError(errorMessage(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    setLoading(true);
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, endpoint, validId, authenticated, refresh]);

  // Expiry must update even after job polling has stopped. This timer makes no API requests.
  useEffect(() => {
    if (!raw) return;
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [raw]);

  async function cancel() {
    if (busy.current) return;
    busy.current = true;
    setAction("cancel");
    setActionError("");
    try {
      await api<void>(`${endpoint}/cancel`, { method: "POST" });
      if (alive.current) setRefresh((v) => v + 1);
    } catch (e) {
      if (alive.current) setActionError(errorMessage(e));
    } finally {
      busy.current = false;
      if (alive.current) setAction("");
    }
  }
  async function publish() {
    if (busy.current || !publicConsent) return;
    busy.current = true;
    setAction("publish");
    setActionError("");
    try {
      await api<void>(`${endpoint}/publish`, { method: "POST" });
      if (alive.current) {
        setPublished(true);
        setPublishDialog(false);
        setPublicChecked(true);
      }
    } catch (e) {
      if (alive.current) setActionError(errorMessage(e));
    } finally {
      busy.current = false;
      if (alive.current) setAction("");
    }
  }
  async function checkPublic() {
    if (busy.current) return;
    busy.current = true;
    setAction("sharing");
    setActionError("");
    try {
      await api<unknown>(`/v1/public/runs/${encodeURIComponent(id)}/evidence`);
      if (alive.current) {
        setPublished(true);
        setPublicChecked(true);
      }
    } catch (e) {
      if (alive.current)
        setActionError(
          `Public availability could not be confirmed: ${errorMessage(e)}`,
        );
    } finally {
      busy.current = false;
      if (alive.current) setAction("");
    }
  }
  async function rerun() {
    if (busy.current || !wallet.address || raw === null) return;
    busy.current = true;
    setAction("rerun");
    setActionError("");
    try {
      const request = diagnosticRerunRequest(raw, id);
      // Reuse on retry: a timed-out POST may already have queued a job.
      rerunKey.current ??= crypto.randomUUID();
      const next = runSchema.parse(
        await api<unknown>("/v1/runs", {
          method: "POST",
          headers: { "Idempotency-Key": rerunKey.current },
          body: JSON.stringify(request),
        }),
      );
      if (!validateRunId(next.id))
        throw new Error("API returned an invalid run ID.");
      if (alive.current) {
        rememberRun(wallet.address, {
          id: next.id,
          name: `Recheck ${id.slice(0, 8)}`,
          createdAt: new Date().toISOString(),
        });
        router.push(`/dashboard/runs/${next.id}`);
      }
    } catch (e) {
      if (alive.current) setActionError(errorMessage(e));
    } finally {
      busy.current = false;
      if (alive.current) setAction("");
    }
  }

  if (!validId)
    return (
      <div className="empty-state">
        <h1 className="text-xl font-semibold">Invalid run ID</h1>
        <p className="mt-2 text-muted">
          Open a complete run UUID returned by the API.
        </p>
        <Link className="btn-secondary mt-5" href="/dashboard/runs">
          Back to runs
        </Link>
      </div>
    );
  if (!authenticated)
    return (
      <div className="surface p-6">
        <p className="eyebrow">Private diagnostic</p>
        <h1 className="page-title mt-3">Authenticate to open this run</h1>
        <p className="page-subtitle">
          Use the wallet that created the run. The API enforces access to its
          evidence and repair proposals.
        </p>
      </div>
    );
  const pending = run && shouldPollRun(run.state);
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/runs"
        className="text-sm text-muted hover:text-copy"
      >
        ← Verification runs
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="eyebrow">Diagnostic / run detail</p>
          <h1 className="page-title mt-3">Evidence, before action.</h1>
          <p className="mt-3 break-all font-mono text-xs text-muted">{id}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRefresh((v) => v + 1)}
            disabled={loading || Boolean(action)}
          >
            Refresh
          </button>
          {evidence?.coverageValid && (
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(action)}
              onClick={rerun}
            >
              {action === "rerun"
                ? "Queuing diagnostic…"
                : "Run fresh diagnostic"}
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="notice border border-orynn/30 p-4 text-sm" role="alert">
          <strong>Run API unavailable or access denied</strong>
          <p className="mt-2 break-words text-muted">{error}</p>
          <p className="mt-2 text-muted">
            Automatic polling has stopped. Refresh to retry; no current pass is
            inferred.
          </p>
        </div>
      )}
      {actionError && (
        <p className="notice break-words p-4 text-sm text-warning" role="alert">
          {actionError}
        </p>
      )}
      {loading && !run && (
        <div className="surface p-6 text-muted" role="status">
          Loading diagnostic run…
        </div>
      )}
      {run && (
        <section
          className="surface rounded-2xl border border-line bg-panel p-5 sm:p-6"
          aria-label="Execution state"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Execution state</p>
              <h2 className="mt-2 text-lg font-semibold">
                {run.state === "succeeded"
                  ? "Execution succeeded"
                  : run.state === "running"
                    ? "Verifier is running"
                    : run.state === "queued"
                      ? "Waiting for the verifier"
                      : run.state === "cancelled"
                        ? "Run cancelled"
                        : "Execution failed"}
              </h2>
            </div>
            <span className="status-pill font-mono text-xs">{run.state}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {run.state === "succeeded"
              ? "The job completed. Only the evidence below describes whether required assertions passed."
              : pending
                ? "This page refreshes every five seconds while the job is pending or running. No diagnostic conclusion is available yet."
                : "No passing result is inferred from this execution state."}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-muted">
              Attempts: {run.attempts}
              {run.errorCode ? ` · ${run.errorCode}` : ""}
            </p>
            {pending && (
              <button
                type="button"
                className="btn-secondary"
                disabled={Boolean(action)}
                onClick={cancel}
              >
                {action === "cancel" ? "Cancelling…" : "Cancel run"}
              </button>
            )}
          </div>
        </section>
      )}
      {run?.state === "succeeded" && !run.evidenceReferenceStored && (
        <div className="notice p-5 text-sm text-warning">
          Execution completed, but the API reports no stored evidence reference.
          No pass can be established. Refresh or investigate the artifact
          service.
        </div>
      )}
      {evidenceError && (
        <div role="alert" className="notice p-5 text-sm text-warning">
          Evidence unavailable: {evidenceError}. No pass can be established.
          Refresh to retry.
        </div>
      )}
      {evidence && (
        <>
          <EvidenceView
            evidence={evidence}
            repair={
              evidence.bundle?.body.mode === "deployed" && !error
                ? (deploymentKey) =>
                    evidence.bundle && (
                      <RepairPanel
                        key={`${id}:${deploymentKey}`}
                        runId={id}
                        deploymentKey={deploymentKey}
                        bundle={evidence.bundle}
                        onRerun={rerun}
                        rerunning={action === "rerun"}
                        stale={evidence.status === "stale"}
                      />
                    )
                : undefined
            }
          />
          <section className="surface rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Keep the evidence</h2>
                <p className="mt-2 text-sm text-muted">
                  Download the full API response, including signature,
                  assertions, and replay details.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => downloadEvidence(raw, id)}
              >
                Download JSON
              </button>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium">
                    {published ? "Evidence is public" : "Private by default"}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    {published
                      ? "Anyone with the public evidence address can read this bundle without authentication."
                      : "Orryn never publishes automatically. The run API does not report whether this bundle was previously published; check public availability if needed."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {!publicChecked && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(action)}
                      onClick={checkPublic}
                    >
                      Check public availability
                    </button>
                  )}
                  {!published && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(action)}
                      onClick={() => {
                        setPublicConsent(false);
                        setPublishDialog(true);
                      }}
                    >
                      Publish evidence…
                    </button>
                  )}
                </div>
              </div>
              {published && (
                <a
                  className="mt-4 inline-block break-all text-sm text-orynn underline"
                  href={`/reports/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public evidence report ↗
                </a>
              )}
              {publishDialog && (
                <div
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="publish-heading"
                  className="mt-5 rounded-xl border border-orynn/40 bg-orynn/5 p-5"
                >
                  <h3 id="publish-heading" className="font-semibold">
                    Publish this diagnostic evidence publicly?
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    This exposes deployment addresses, inventory and manifest
                    details, configuration and authority observations,
                    assertions, and the signed bundle. Anyone with the address
                    can download it. The API currently has no unpublish
                    endpoint.
                  </p>
                  <label className="mt-4 flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={publicConsent}
                      onChange={(e) => setPublicConsent(e.target.checked)}
                      className="mt-1 accent-orynn"
                      disabled={action === "publish"}
                    />
                    <span>
                      I understand this evidence will be public and cannot be
                      made private through this UI.
                    </span>
                  </label>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!publicConsent || Boolean(action)}
                      onClick={publish}
                    >
                      {action === "publish"
                        ? "Publishing…"
                        : "Confirm public publication"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(action)}
                      onClick={() => setPublishDialog(false)}
                    >
                      Keep private
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
