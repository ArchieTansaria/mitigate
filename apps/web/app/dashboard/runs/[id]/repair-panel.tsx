"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/lib/wallet";
import {
  type EvidenceBundle,
  errorMessage,
  type RepairResult,
  repairResultSchema,
} from "../../../../lib/evidence";
import { EvidenceField } from "../../../components/evidence-view";
import { repairReceipt, submitValidatedRepair } from "./repair-execution";

export function RepairPanel({
  runId,
  deploymentKey,
  bundle,
  onRerun,
  rerunning,
  stale,
}: {
  runId: string;
  deploymentKey: string;
  bundle: EvidenceBundle;
  onRerun: () => void;
  rerunning: boolean;
  stale: boolean;
}) {
  const wallet = useWallet();
  const [result, setResult] = useState<RepairResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [receipt, setReceipt] = useState<
    "pending" | "confirmed" | "reverted" | null
  >(null);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const assertActive = () => {
    if (!active.current)
      throw new Error(
        "Wallet session changed. Reconnect and authenticate before repairing.",
      );
  };
  const proposal = result?.proposal;
  const endpoint = `/v1/runs/${encodeURIComponent(runId)}/actions`;
  const ownerMatches = Boolean(
    proposal &&
      wallet.address?.toLowerCase() === proposal.authority.toLowerCase(),
  );

  async function load() {
    if (locked.current || stale) return;
    locked.current = true;
    setBusy("Preparing proposal");
    setError("");
    setResult(null);
    setReviewed(false);
    setValidation("");
    try {
      const next = repairResultSchema.parse(
        await api<unknown>(
          `${endpoint}?deploymentKey=${encodeURIComponent(deploymentKey)}`,
        ),
      );
      if (next.status === "ready") {
        const p = next.proposal,
          s = bundle.body.snapshot;
        if (
          !p ||
          p.deploymentKey !== deploymentKey ||
          p.manifestDigest !== bundle.body.spec.manifestDigest ||
          p.chainId !== s.chainId ||
          p.snapshot.chainId !== s.chainId ||
          p.snapshot.blockHash !== s.blockHash ||
          p.snapshot.blockNumber !== s.blockNumber ||
          p.snapshot.blockTimestamp !== s.blockTimestamp
        )
          throw new Error(
            "Proposal does not match this deployment, manifest, or evidence snapshot.",
          );
      } else if (next.proposal !== null)
        throw new Error("API returned an inconsistent repair response.");
      setResult(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      locked.current = false;
    }
  }

  const validate = () => {
    assertActive();
    return api<unknown>(`${endpoint}/validate`, {
      method: "POST",
      body: JSON.stringify({ deploymentKey, proposal }),
    });
  };

  async function check() {
    if (locked.current || !proposal) return;
    locked.current = true;
    setBusy("Validating against current state");
    setError("");
    setValidation("");
    try {
      const data = await validate();
      if (
        !data ||
        typeof data !== "object" ||
        !("valid" in data) ||
        data.valid !== true
      )
        throw new Error("Server validation did not establish readiness.");
      setValidation(
        "Server validation passed at this moment. Execution will validate again and simulate in your wallet.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      locked.current = false;
    }
  }

  async function execute() {
    if (locked.current || !proposal || !reviewed || submitted || !ownerMatches)
      return;
    locked.current = true;
    setError("");
    setValidation("");
    try {
      const hash = await submitValidatedRepair({
        proposal,
        request: async (args) => {
          assertActive();
          return wallet.request(args);
        },
        validate,
        onStage: (stage) => {
          setBusy(
            {
              checking: "Checking wallet authority",
              simulating: "Simulating in your wallet",
              validating: "Fresh server validation",
              signing: "Review the transaction in your wallet",
            }[stage],
          );
          if (stage === "signing") setSubmitted(true);
        },
      });
      setTxHash(hash);
      setReceipt("pending");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      locked.current = false;
    }
  }

  async function checkReceipt() {
    if (locked.current || !proposal || !txHash) return;
    locked.current = true;
    setBusy("Checking transaction receipt");
    setError("");
    try {
      setReceipt(await repairReceipt(wallet.request, txHash, proposal.chainId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
      locked.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Owner repair</h3>
          <p className="mt-1 text-sm text-muted">
            Prepare an unsigned proposal for this deployment.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={Boolean(busy) || submitted || stale}
          onClick={load}
        >
          {result ? "Refresh proposal" : "Prepare repair"}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">
        Supports the reviewed oracle adapter family and EOA authority only.
        Source or owner changes, pause changes, multisigs, and governance
        require manual review. A repair may need multiple transactions and
        diagnostics.
      </p>
      {stale && (
        <p className="text-sm text-warning">
          Evidence expired. Run a fresh diagnostic before preparing or
          submitting another repair. Submitted transactions can still be checked
          below.
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted">
          {busy}…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="notice break-words border border-orynn/30 p-4 text-sm text-orynn"
        >
          {error}
          <p className="mt-2 text-muted">
            No repair pass is inferred. If evidence or state changed, run a
            fresh diagnostic. If the endpoint is unavailable, proposals cannot
            be prepared or validated.
          </p>
        </div>
      )}
      {result && (
        <div className="rounded-xl border border-line-strong bg-panel-raised p-4 sm:p-5">
          <p className="text-sm font-medium">
            {result.status === "ready"
              ? "Unsigned proposal · review required"
              : result.status === "blocked"
                ? "Repair blocked · manual review required"
                : "No supported action"}
          </p>
          <p className="mt-2 break-words font-mono text-xs leading-6 text-muted">
            {result.reason}
          </p>
          {result.status === "no-supported-action" && (
            <p className="mt-2 text-sm text-warning">
              No supported change does not mean a repair pass. Run the behavior
              checks again.
            </p>
          )}
          {proposal && (
            <>
              <p className="mt-4 text-sm leading-6">{proposal.explanation}</p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <EvidenceField label="Operation">
                  {proposal.operation}
                </EvidenceField>
                <EvidenceField label="Source chain ID">
                  {proposal.chainId}
                </EvidenceField>
                <EvidenceField label="Transaction target">
                  {proposal.target}
                </EvidenceField>
                <EvidenceField label="Required signing authority">
                  {proposal.authority}
                </EvidenceField>
                <EvidenceField label="Native token value (base units)">
                  {proposal.valueBaseUnits}
                </EvidenceField>
                <EvidenceField label="Expires at (Unix seconds)">
                  {proposal.expiresAt}
                </EvidenceField>
                <EvidenceField label="Reviewed compatibility">
                  {proposal.compatibility.kind}
                </EvidenceField>
                <EvidenceField label="Bound state digest">
                  {proposal.stateDigest}
                </EvidenceField>
              </dl>
              <details
                className="mt-4 rounded-lg border border-line p-3 text-sm"
                open
              >
                <summary className="cursor-pointer text-muted">
                  Exact calldata
                </summary>
                <code className="mt-3 block max-h-48 overflow-auto break-all text-xs leading-6">
                  {proposal.calldata}
                </code>
              </details>
              <p className="mt-4 text-xs leading-6 text-muted">
                Simulation is historical and cannot make execution atomic with
                validation. Chain state can change while a wallet approval is
                open. You pay network gas. A successful transaction must be
                followed by a fresh deployed diagnostic.
              </p>
              {validation && (
                <p role="status" className="mt-4 text-sm text-copy">
                  {validation}
                </p>
              )}
              {!submitted && (
                <>
                  <label className="mt-5 flex items-start gap-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                      className="mt-1 accent-orynn"
                      disabled={Boolean(busy) || stale}
                    />
                    <span>
                      I reviewed the source chain, target, authority, calldata,
                      and proposed effect. Request this transaction in my
                      wallet.
                    </span>
                  </label>
                  {!ownerMatches && (
                    <p className="mt-3 break-all text-sm text-warning">
                      Connect the required authority {proposal.authority} to
                      execute. You can inspect and validate the unsigned
                      proposal with your authenticated session.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={check}
                      disabled={Boolean(busy)}
                    >
                      Validate current state
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={execute}
                      disabled={
                        Boolean(busy) ||
                        stale ||
                        !reviewed ||
                        !ownerMatches ||
                        wallet.status !== "authenticated"
                      }
                    >
                      Validate & request in wallet
                    </button>
                  </div>
                </>
              )}
              {submitted && !txHash && (
                <p className="mt-4 text-sm text-warning">
                  A wallet submission was requested. Check your wallet activity
                  before retrying; Orryn will not automatically resubmit.
                  Refresh this page only after resolving that transaction.
                </p>
              )}
              {txHash && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-sm font-medium">
                    {receipt === "confirmed"
                      ? "Transaction confirmed · diagnostic still required"
                      : receipt === "reverted"
                        ? "Transaction reverted · repair not applied"
                        : "Transaction submitted · awaiting receipt"}
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted">
                    {txHash}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Receipt status comes from your wallet provider. Confirmation
                    is not a repair pass or finality guarantee.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={checkReceipt}
                    >
                      Check receipt
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={rerunning || receipt !== "confirmed"}
                      onClick={onRerun}
                    >
                      Run fresh diagnostic
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
