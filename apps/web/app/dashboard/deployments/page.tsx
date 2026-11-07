import Link from "next/link";
import { Icon } from "../../components/workspace/ui-icon";
export default function Deployments() {
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow mb-3">Know the actual path</p>
        <h1 className="page-title">Your deployments. In scope.</h1>
        <p className="page-subtitle">
          A contract address is only the beginning. Register its chain,
          dependency path and authority so verification knows exactly what to
          inspect.
        </p>
      </div>
      <div className="surface overflow-hidden">
        <div className="grid-backdrop flex flex-wrap items-center justify-center gap-5 border-b border-line px-6 py-12">
          {["Application entrypoint", "Dependency proxy", "Implementation"].map(
            (label, i) => (
              <div className="flex items-center gap-5" key={label}>
                <div className="rounded-lg border border-line-strong bg-panel px-5 py-5">
                  <span className="eyebrow text-orynn">0{i + 1}</span>
                  <p className="mt-2 text-sm text-white">{label}</p>
                </div>
                {i < 2 && <Icon name="arrow" className="size-5 text-dim" />}
              </div>
            ),
          )}
        </div>
        <div className="empty-state">
          <h2 className="text-lg font-medium text-white">
            Start with a registered inventory
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted">
            Add your deployments to a verification run. The resulting report
            shows the observed path, approved implementation, configuration and
            behavior for each deployment.
          </p>
          <Link href="/dashboard/runs/new" className="btn-primary mt-2">
            <Icon name="plus" />
            Register deployments
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "Explicit scope",
            "Only registered deployments are inspected. A report does not cover an entire organization automatically.",
          ],
          [
            "Known contract family",
            "The current verifier supports the pinned transparent-proxy oracle adapter. Unsupported contracts cannot receive a passing result.",
          ],
          [
            "Your authorized owner",
            "Orryn prepares supported repairs. The deployment’s owner, multisig or governance retains control.",
          ],
        ].map(([title, body]) => (
          <div key={title} className="surface p-5">
            <h3 className="text-sm text-white">{title}</h3>
            <p className="mt-3 text-xs leading-6 text-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-dim">
        Deployment results are grouped by verification run. A server-wide
        inventory index is not available yet.
      </p>
    </div>
  );
}
