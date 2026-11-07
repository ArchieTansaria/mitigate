"use client";
import { useId, useState } from "react";
import { friendlyError, ManifestSchema } from "@/lib/workspace";
export function ManifestInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [fileError, setFileError] = useState("");
  let summary: ReturnType<typeof ManifestSchema.parse> | null = null;
  try {
    summary = ManifestSchema.parse(JSON.parse(value));
  } catch {
    /* Show validation on explicit submit. */
  }
  return (
    <div className="space-y-4">
      <label htmlFor={id} className="block text-sm font-medium text-white">
        Approved repair manifest
      </label>
      <p className="text-xs leading-6 text-muted">
        Import the supplier’s JSON document. It defines the approved
        implementation, configuration predicates and required test pack.
        Importing it does not independently establish that the supplier or
        repair is trustworthy.
      </p>
      <input
        aria-label="Import repair manifest JSON"
        type="file"
        accept="application/json,.json"
        className="block w-full text-xs text-muted"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileError("");
          if (file.size > 262144) {
            setFileError("Manifest must be smaller than 256 KiB.");
            return;
          }
          try {
            const text = await file.text();
            ManifestSchema.parse(JSON.parse(text));
            onChange(text);
          } catch (error) {
            setFileError(friendlyError(error));
          }
        }}
      />
      <textarea
        id={id}
        className="field min-h-48 font-mono text-xs leading-6"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your approved repair manifest JSON, or choose a file above."
        spellCheck={false}
      />
      {fileError && (
        <p role="alert" className="text-xs text-warning">
          {fileError}
        </p>
      )}
      {summary && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-4">
          <p className="text-xs text-success">
            Document format validated · {summary.releaseId}
          </p>
          <p className="mt-2 text-xs text-muted">{summary.issueDescription}</p>
          <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-dim">Source chain</dt>
              <dd className="mt-1 font-mono">{summary.sourceChainId}</dd>
            </div>
            <div>
              <dt className="text-dim">Required checks</dt>
              <dd className="mt-1">
                {summary.requiredAssertionIds.join(", ")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-dim">Approved implementation</dt>
              <dd className="mt-1 break-all font-mono">
                {summary.approvedImplementationAddress}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
