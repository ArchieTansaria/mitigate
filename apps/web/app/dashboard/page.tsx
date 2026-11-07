import Link from "next/link";
import { RecentRuns } from "../components/workspace/recent-runs";
import { Icon } from "../components/workspace/ui-icon";

const steps = [
  {
    n: "01",
    title: "Define the repair",
    body: "Publish the code, configuration and behavior your deployments must satisfy.",
    icon: "releases",
    href: "/dashboard/releases",
    action: "Review a policy",
  },
  {
    n: "02",
    title: "Verify what’s deployed",
    body: "Inspect the actual dependency path. See what passed, what failed and what’s missing.",
    icon: "runs",
    href: "/dashboard/runs/new",
    action: "Start verification",
  },
  {
    n: "03",
    title: "Coordinate the next move",
    body: "Review an owner-authorized repair, or inspect a funded campaign and its grants.",
    icon: "campaigns",
    href: "/dashboard/campaigns",
    action: "Open campaigns",
  },
];
export default function Overview() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-3 text-orynn">The repair control room</p>
          <h1 className="page-title">
            Close the gap.
            <br className="sm:hidden" /> Prove the repair.
          </h1>
          <p className="page-subtitle">
            From a published patch to a verified deployment.
            <br className="hidden md:block" /> Bring your contracts, your policy
            and your own authority.
          </p>
        </div>
        <Link href="/dashboard/runs/new" className="btn-primary">
          <Icon name="plus" /> New verification
        </Link>
      </div>
      <section
        aria-label="Repair workflow"
        className="relative overflow-hidden rounded-xl border border-line bg-panel"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-64 w-96 bg-[radial-gradient(ellipse_at_top_right,rgba(255,87,26,0.10),transparent_70%)]"
        />
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span className="eyebrow">One connected workflow</span>
          <span className="font-mono text-[10px] text-muted">
            Observe → Repair → Verify
          </span>
        </div>
        <div className="grid md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative border-b border-line p-6 last:border-0 md:border-b-0 md:border-r"
            >
              <div className="mb-7 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg border border-line-strong bg-panel-raised text-orynn">
                  <Icon name={s.icon} className="size-5" />
                </span>
                <span className="font-mono text-[11px] text-dim">/{s.n}</span>
              </div>
              <h2 className="text-base font-medium text-white">{s.title}</h2>
              <p className="mb-6 mt-3 min-h-14 text-xs leading-6 text-muted">
                {s.body}
              </p>
              <Link
                href={s.href}
                className="inline-flex items-center gap-2 text-xs text-copy hover:text-orynn"
              >
                {s.action}
                <Icon name="arrow" />
              </Link>
            </div>
          ))}
        </div>
      </section>
      <section className="surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-5">
          <div>
            <h2 className="text-sm font-medium text-white">
              Recent verifications
            </h2>
            <p className="mt-1 text-xs text-dim">Evidence, not assumptions.</p>
          </div>
          <Link
            href="/dashboard/runs"
            className="text-xs text-muted hover:text-white"
          >
            View all ↗
          </Link>
        </div>
        <RecentRuns compact />
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface flex gap-4 p-5">
          <Icon name="shield" className="mt-1 size-5 shrink-0 text-orynn" />
          <div>
            <h3 className="text-xs font-medium text-white">
              You remain in control
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted">
              Connecting a wallet does not grant upgrade rights. Every repair or
              payment transaction requires a separate wallet approval.
            </p>
          </div>
        </div>
        <div className="surface flex gap-4 p-5">
          <Icon name="runs" className="mt-1 size-5 shrink-0 text-muted" />
          <div>
            <h3 className="text-xs font-medium text-white">
              A precise result, with honest limits
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted">
              Verification covers the registered deployments and agreed checks
              at an observed block. It is not a blanket security guarantee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
