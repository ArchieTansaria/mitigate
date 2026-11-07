"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  downloadEvidence,
  parseEvidence,
  verifyEvidenceIntegrity,
  withEvidenceIntegrity,
} from "@/lib/evidence";
import { friendlyError, validateRunId } from "@/lib/workspace";
import { EvidenceView } from "../../components/evidence-view";
import { Mark } from "../../components/workspace/ui-icon";
export function PublicReport({ id }: { id: string }) {
  const [raw, setRaw] = useState<unknown>(null);
  const [integrity, setIntegrity] = useState<{
    valid: boolean;
    reason: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const controller = new AbortController();
    setRaw(null);
    setIntegrity(null);
    setError("");
    setLoading(true);
    if (!validateRunId(id)) {
      setError("Invalid report ID.");
      setLoading(false);
      return;
    }
    api<unknown>(`/v1/public/runs/${id}/evidence`, {
      signal: controller.signal,
    })
      .then(async (data) => {
        const result = await verifyEvidenceIntegrity(data);
        if (!controller.signal.aborted) {
          setRaw(data);
          setIntegrity(result);
          setNow(Math.floor(Date.now() / 1000));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(friendlyError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const evidence = useMemo(() => {
    if (raw === null) return null;
    return withEvidenceIntegrity(parseEvidence(raw, id, now), integrity);
  }, [raw, id, now, integrity]);
  return (
    <div className="min-h-screen bg-[#080809]">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-semibold text-white"
          >
            <Mark />
            Orryn.
          </Link>
          <span className="eyebrow">Published verification</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
        <div>
          <p className="eyebrow mb-3 text-orynn">Evidence you can inspect</p>
          <h1 className="page-title">A repair. On the record.</h1>
          <p className="page-subtitle">
            This report was explicitly made public by its owner. No wallet is
            needed to read it.
          </p>
        </div>
        {loading ? (
          <div className="surface p-8 text-sm text-muted" role="status">
            Loading published evidence…
          </div>
        ) : error ? (
          <div className="surface p-8" role="alert">
            <h2 className="text-lg text-white">Report unavailable</h2>
            <p className="mt-3 text-sm text-muted">
              The report may be private, not yet published, or the service may
              be unavailable.
            </p>
            <p className="mt-3 text-xs text-warning">{error}</p>
          </div>
        ) : evidence ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-xs leading-6 text-muted">
                {integrity?.reason}
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => downloadEvidence(raw, id)}
              >
                Download JSON
              </button>
            </div>
            <EvidenceView evidence={evidence} />
          </>
        ) : null}
        <div className="notice">
          A valid signature binds this document to its stated signer; it does
          not establish that signer’s independence or that the tests were
          honestly executed. This diagnostic report cannot authorize a campaign
          grant.
        </div>
      </main>
    </div>
  );
}
