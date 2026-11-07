"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { validateRunId } from "@/lib/workspace";
import { RecentRuns } from "../../components/workspace/recent-runs";
import { Icon } from "../../components/workspace/ui-icon";
export default function Runs() {
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Observe / explain / verify</p>
          <h1 className="page-title">Verification runs</h1>
          <p className="page-subtitle">
            Follow each job from the queue to its recorded evidence.
          </p>
        </div>
        <Link href="/dashboard/runs/new" className="btn-primary">
          <Icon name="plus" />
          New verification
        </Link>
      </div>
      <form
        className="surface flex flex-wrap items-end gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validateRunId(id.trim())) {
            setError("Enter the complete run UUID returned by the API.");
            return;
          }
          router.push(`/dashboard/runs/${id.trim()}`);
        }}
      >
        <label className="min-w-0 flex-1 text-xs text-muted">
          Open an existing run
          <input
            className="field mt-2 font-mono"
            placeholder="Run ID"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setError("");
            }}
            required
          />
        </label>
        <button className="btn-secondary" type="submit">
          Open run <Icon name="arrow" />
        </button>
        {error && (
          <p className="w-full text-xs text-warning" role="alert">
            {error}
          </p>
        )}
      </form>
      <section className="surface">
        <RecentRuns />
      </section>
    </div>
  );
}
