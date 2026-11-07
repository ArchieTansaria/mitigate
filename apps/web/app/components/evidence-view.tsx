import type { ReactNode } from "react";
import type {
  EvidenceAssertion,
  EvidenceStatus,
  ParsedEvidence,
} from "../../lib/evidence";
import { withEvidenceIntegrity } from "../../lib/evidence";

export function EvidenceBadge({
  status,
}: {
  status: EvidenceStatus | EvidenceAssertion["outcome"];
}) {
  const tone =
    status === "pass" || status === "reported-pass"
      ? "text-success border-success/25 bg-success/5"
      : status === "fail"
        ? "text-orynn border-orynn/25 bg-orynn/5"
        : "text-warning border-warning/25 bg-warning/5";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      {status === "reported-pass"
        ? "Reported pass"
        : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function EvidenceField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs text-muted">{label}</dt>
      <dd className="break-all font-mono text-xs leading-6 text-copy">
        {children}
      </dd>
    </div>
  );
}

function Assertions({
  assertions,
  caption,
}: {
  assertions: EvidenceAssertion[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-y border-line bg-panel-raised text-xs text-muted">
          <tr>
            <th className="px-5 py-3 font-medium">Assertion</th>
            <th className="px-5 py-3 font-medium">Outcome</th>
            <th className="px-5 py-3 font-medium">Expected</th>
            <th className="px-5 py-3 font-medium">Observed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {assertions.map((a) => (
            <tr key={a.id}>
              <th
                scope="row"
                className="max-w-52 break-words px-5 py-4 align-top font-medium"
              >
                {a.id}
                <details className="mt-2 font-normal text-xs text-muted">
                  <summary className="cursor-pointer">
                    Evidence reference
                  </summary>
                  <code className="mt-2 block break-all">{a.evidenceRef}</code>
                </details>
              </th>
              <td className="px-5 py-4 align-top">
                <EvidenceBadge status={a.outcome} />
              </td>
              <td className="max-w-80 whitespace-pre-wrap break-words px-5 py-4 align-top text-muted">
                {a.expected}
              </td>
              <td className="max-w-80 whitespace-pre-wrap break-words px-5 py-4 align-top">
                {a.observed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EvidenceView({
  evidence: input,
  repair,
}: {
  evidence: ParsedEvidence;
  repair?: (deploymentKey: string) => ReactNode;
}) {
  const evidence = input.authenticity
    ? input
    : withEvidenceIntegrity(input, null);
  const bundle = evidence.bundle;
  return (
    <div className="space-y-6">
      <section
        className="surface rounded-2xl border border-line bg-panel p-5 sm:p-6"
        aria-label="Diagnostic conclusion"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-xs uppercase tracking-widest text-muted">
              Diagnostic conclusion
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              What the evidence says
            </h2>
          </div>
          <EvidenceBadge status={evidence.status} />
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
          {evidence.reason}
        </p>
        <div
          className="mt-4 rounded-lg border border-line p-4 text-sm"
          role="status"
        >
          <p className="font-medium">
            Authenticity: {evidence.authenticity?.status ?? "pending"}
          </p>
          <p className="mt-2 text-xs leading-6 text-muted">
            {evidence.authenticity?.reason}
          </p>
        </div>
        <p className="mt-3 text-sm text-warning">
          Diagnostic evidence is not eligible for a campaign grant.
        </p>
      </section>
      {bundle && (
        <>
          <section
            className="surface rounded-2xl border border-line bg-panel p-5 sm:p-6"
            aria-label="Evidence provenance"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Snapshot & provenance</h2>
              <span className="text-xs text-muted">
                {bundle.body.mode} · {bundle.body.results.length} /{" "}
                {bundle.body.inventory.deployments.length} deployments returned
              </span>
            </div>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <EvidenceField label="Source chain ID">
                {bundle.body.snapshot.chainId}
              </EvidenceField>
              <EvidenceField label="Snapshot block">
                {bundle.body.snapshot.blockNumber}
              </EvidenceField>
              <EvidenceField label="Required confirmations">
                {bundle.body.spec.confirmations}
              </EvidenceField>
              <EvidenceField label="Snapshot block hash">
                {bundle.body.snapshot.blockHash}
              </EvidenceField>
              <EvidenceField label="Issued at (Unix seconds)">
                {bundle.body.issuedAt}
              </EvidenceField>
              <EvidenceField label="Expires at (Unix seconds)">
                {bundle.body.expiresAt}
              </EvidenceField>
              <EvidenceField label="Verification scope">
                {bundle.body.spec.verificationScopeId}
              </EvidenceField>
              <EvidenceField label="Reported evaluator signer">
                {bundle.signer}
              </EvidenceField>
              <EvidenceField label="Reported evidence digest">
                {bundle.attestation.evidenceDigest}
              </EvidenceField>
            </dl>
            <details className="mt-5 border-t border-line pt-4 text-sm">
              <summary className="cursor-pointer text-muted">
                Signature & scope fingerprints
              </summary>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <EvidenceField label="Signature">
                  {bundle.signature}
                </EvidenceField>
                <EvidenceField label="Inventory digest">
                  {bundle.body.spec.inventoryDigest}
                </EvidenceField>
                <EvidenceField label="Manifest digest">
                  {bundle.body.spec.manifestDigest}
                </EvidenceField>
                <EvidenceField label="Test pack digest">
                  {bundle.body.spec.testPackDigest}
                </EvidenceField>
              </dl>
            </details>
            <p className="mt-5 border-t border-line pt-4 text-xs leading-6 text-muted">
              A verified signature matches the evaluator claimed by this bundle;
              evaluator identity still requires independent trust. Tests were
              not replayed in this browser. A signature does not prove honest
              test execution. Results describe the recorded snapshot, not
              current chain state. Repairs require a fresh server check and
              wallet simulation.
            </p>
          </section>
          {bundle.body.results.map((r, i) => {
            const deployment = bundle.body.inventory.deployments.find(
              (d) => d.deploymentKey === r.deploymentKey,
            );
            return (
              <section
                key={r.deploymentKey}
                className="surface overflow-hidden rounded-2xl border border-line bg-panel"
                aria-label={`Deployment ${i + 1}`}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">
                      Deployment {String(i + 1).padStart(2, "0")}
                    </h2>
                    <span className="text-xs text-muted">
                      Inspection: {r.inspection.status} · Replay:{" "}
                      {r.runner.status}
                    </span>
                  </div>
                  <p className="mt-2 break-all font-mono text-sm">
                    {deployment?.entrypoint ?? "Entrypoint unavailable"}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">
                    Key {r.deploymentKey}
                  </p>
                  {(r.inspection.reason || r.runner.reason) && (
                    <p className="mt-3 break-words text-sm text-warning">
                      {r.inspection.reason ?? r.runner.reason}
                    </p>
                  )}
                </div>
                <Assertions
                  assertions={r.evidence.assertions}
                  caption={`Required assertions for deployment ${i + 1}`}
                />
                <details className="border-t border-line p-5">
                  <summary className="cursor-pointer text-sm text-muted">
                    Inspection prerequisites, conditions & replay setup
                  </summary>
                  <div className="mt-4 space-y-5">
                    <Assertions
                      assertions={r.inspection.assertions}
                      caption="Inspection prerequisites"
                    />
                    {r.inspection.conditions.length > 0 && (
                      <div className="space-y-3">
                        {r.inspection.conditions.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-lg border border-line p-4 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <strong>{c.id}</strong>
                              <EvidenceBadge status={c.outcome} />
                            </div>
                            <p className="mt-2 break-words text-muted">
                              Expected: {c.expected}
                            </p>
                            <p className="mt-1 break-words">
                              Observed: {c.observed}
                            </p>
                            <p className="mt-2 break-all font-mono text-xs text-muted">
                              Responsible: {c.responsible ?? "Unresolved"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-sm">
                      <h3 className="font-medium">Isolated state replay</h3>
                      <p className="mt-2 text-muted">
                        Behavior tests replay observed state in an isolated
                        environment. Scenario overrides below are test setup,
                        not owner transactions.
                      </p>
                      {r.runner.interventions.map((intervention) => (
                        <div
                          key={intervention.id}
                          className="mt-3 rounded-lg border border-line p-4"
                        >
                          <p className="font-medium">{intervention.id}</p>
                          <p className="mt-1 text-muted">
                            {intervention.explanation}
                          </p>
                          <p className="mt-2 break-all font-mono text-xs">
                            Target: {intervention.target}
                          </p>
                          <pre className="mt-2 overflow-auto text-xs text-muted">
                            {JSON.stringify(intervention.storage, null, 2)}
                          </pre>
                        </div>
                      ))}
                      <p className="mt-4 break-all font-mono text-xs text-muted">
                        Runner: {r.evidence.runnerImageDigest}
                      </p>
                    </div>
                  </div>
                </details>
                {evidence.coverageValid && repair && (
                  <div className="border-t border-line p-5 sm:p-6">
                    {repair(r.deploymentKey)}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
