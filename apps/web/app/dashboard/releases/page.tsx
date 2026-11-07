"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import { friendlyError, ManifestSchema } from "@/lib/workspace";
import { ManifestInput } from "../../components/workspace/manifest-input";
export default function Releases() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<{ id: string; digest: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { address, chainId, status } = useWallet();
  const active = useRef<AbortController | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity transitions must clear private results and pending requests.
  useLayoutEffect(() => {
    setResult(null);
    setError("");
    setBusy(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [address, chainId, status]);
  async function register() {
    if (active.current || status !== "authenticated" || !address || !chainId)
      return;
    const controller = new AbortController();
    active.current = controller;
    const current = () =>
      active.current === controller && !controller.signal.aborted;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const manifest = ManifestSchema.parse(JSON.parse(value));
      const registered = await api<{ id: string; digest: string }>(
        "/v1/manifests",
        {
          method: "POST",
          body: JSON.stringify(manifest),
          signal: controller.signal,
        },
      );
      if (current()) setResult(registered);
    } catch (e) {
      if (current()) setError(friendlyError(e));
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow mb-3">Define what repaired means</p>
        <h1 className="page-title">Repair policies</h1>
        <p className="page-subtitle">
          One explicit definition of the approved implementation and the
          behavior it must preserve.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_300px]">
        <section className="surface p-6">
          <ManifestInput
            value={value}
            onChange={(text) => {
              active.current?.abort();
              active.current = null;
              setValue(text);
              setResult(null);
              setBusy(false);
              setError("");
            }}
          />
          {error && (
            <p role="alert" className="mt-4 text-xs text-warning">
              {error}
            </p>
          )}
          <div className="mt-6 border-t border-line pt-5">
            <button
              className="btn-primary"
              type="button"
              disabled={busy || status !== "authenticated" || !value}
              onClick={() => void register()}
            >
              {busy ? "Registering…" : "Register policy"}
            </button>
            {status !== "authenticated" && (
              <p className="mt-3 text-xs text-muted">
                Connect and sign in to save a policy to your private workspace.
              </p>
            )}
          </div>
          {result && (
            <div
              role="status"
              className="mt-5 rounded-lg border border-success/20 bg-success/5 p-4 text-xs"
            >
              <p className="text-success">Policy registered</p>
              <dl className="mt-3 space-y-3 break-all font-mono">
                <div>
                  <dt className="text-dim">Document ID</dt>
                  <dd>{result.id}</dd>
                </div>
                <div>
                  <dt className="text-dim">Content digest</dt>
                  <dd>{result.digest}</dd>
                </div>
              </dl>
              <Link
                href="/dashboard/runs/new"
                className="mt-4 inline-block text-orynn"
              >
                Create a verification with this manifest →
              </Link>
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <div className="surface p-5">
            <h2 className="text-sm text-white">What belongs in a policy?</h2>
            <ul className="mt-4 space-y-4 text-xs leading-6 text-muted">
              <li>
                <strong className="text-copy">Identity.</strong> A release
                identifier and source chain.
              </li>
              <li>
                <strong className="text-copy">Code.</strong> The implementation
                address and expected runtime hash.
              </li>
              <li>
                <strong className="text-copy">Configuration.</strong> Explicit
                expected settings.
              </li>
              <li>
                <strong className="text-copy">Behavior.</strong> Required
                assertion IDs and the pinned test-pack digest.
              </li>
            </ul>
          </div>
          <div className="notice">
            ENS discovery is outside current scope. Import the approved document
            directly. Registering a policy here does not change a funded
            campaign’s immutable terms.
          </div>
        </aside>
      </div>
    </div>
  );
}
