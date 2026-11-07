"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import {
  type Job,
  type RunReference,
  RunStatusSchema,
  readRunReferences,
  short,
} from "@/lib/workspace";
import { Icon } from "./ui-icon";
export function RecentRuns({ compact = false }: { compact?: boolean }) {
  const { address, status } = useWallet();
  const [references, setReferences] = useState<RunReference[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job | string>>({});
  useEffect(() => {
    const read = () => setReferences(address ? readRunReferences(address) : []);
    read();
    window.addEventListener("orryn:runs", read);
    return () => window.removeEventListener("orryn:runs", read);
  }, [address]);
  useEffect(() => {
    setJobs({});
    if (status !== "authenticated") return;
    const controller = new AbortController();
    void Promise.all(
      references.slice(0, compact ? 5 : 50).map(async (ref) => {
        try {
          const job = RunStatusSchema.parse(
            await api<unknown>(`/v1/runs/${ref.id}`, {
              signal: controller.signal,
            }),
          );
          if (job.id !== ref.id) throw new Error("Run identity mismatch");
          if (!controller.signal.aborted)
            setJobs((current) => ({ ...current, [ref.id]: job }));
        } catch {
          if (!controller.signal.aborted)
            setJobs((current) => ({ ...current, [ref.id]: "Unavailable" }));
        }
      }),
    );
    return () => controller.abort();
  }, [references, status, compact]);
  if (!references.length)
    return (
      <div className="empty-state">
        <span className="mb-1 grid size-12 place-items-center rounded-xl border border-line-strong bg-panel-raised text-muted">
          <Icon name="runs" className="size-5" />
        </span>
        <h3 className="text-sm font-medium text-white">
          Your first verification starts here
        </h3>
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          Register your deployment addresses and a repair policy. Every result
          will point to the state that was actually checked.
        </p>
        <Link className="btn-secondary mt-3" href="/dashboard/runs/new">
          Create verification <Icon name="arrow" />
        </Link>
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-line text-dim">
          <tr>
            {["Verification", "Created", "Execution", "Evidence"].map(
              (label) => (
                <th key={label} className="px-5 py-4 font-normal">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {references.slice(0, compact ? 5 : 50).map((ref) => {
            const job = jobs[ref.id];
            return (
              <tr
                key={ref.id}
                className="border-b border-line/70 last:border-0 hover:bg-white/[0.02]"
              >
                <td className="px-5 py-4">
                  <Link
                    href={`/dashboard/runs/${ref.id}`}
                    className="font-medium text-white hover:text-orynn"
                  >
                    {ref.name}
                  </Link>
                  <div className="mt-1.5 font-mono text-[10px] text-dim">
                    {short(ref.id)}
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-muted">
                  {new Date(ref.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-4">
                  <span className="status-pill">
                    {typeof job === "object"
                      ? job.state
                      : (job ??
                        (status === "authenticated"
                          ? "Loading…"
                          : "Sign in to load"))}
                  </span>
                </td>
                <td className="px-5 py-4 text-muted">
                  {typeof job === "object" &&
                  job.state === "succeeded" &&
                  job.evidenceReferenceStored ? (
                    <Link
                      className="text-orynn"
                      href={`/dashboard/runs/${ref.id}`}
                    >
                      Check evidence ↗
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-[10px] text-dim">
        Recent run references saved in this browser. Status is fetched from the
        API; execution completed does not mean repair passed. A stored evidence
        reference does not guarantee the artifact is retrievable.
      </p>
    </div>
  );
}
