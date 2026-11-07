import { FlowIllustration } from "./components/flow-illustration";
import { SiteHeader } from "./components/site-header";

const problems = [
  {
    number: "01",
    title: "A release note is not deployment coverage",
    body: "Publishing a repaired component does not update the customer-owned contracts that depend on it.",
  },
  {
    number: "02",
    title: "A version string is not the whole story",
    body: "A deployment can use the expected code and still have a wrong route, unsafe setting, or unmet behavior check.",
  },
  {
    number: "03",
    title: "The customer controls the repair",
    body: "Suppliers can explain and prepare a change, but only the customer’s owner, multisig, or governance can authorize it.",
  },
  {
    number: "04",
    title: "Evidence and funding are disconnected",
    body: "When a supplier funds remediation, it needs a clear way to tie each eligible deployment’s result to its grant rules.",
  },
];

const steps = [
  {
    number: "01",
    title: "Publish the repair policy",
    body: "The supplier defines the affected deployment scope and the conditions an acceptable repair must meet.",
    tag: "Supplier",
  },
  {
    number: "02",
    title: "Inspect the customer’s deployment",
    body: "Orynn reads the supported onchain dependency path and records the chain state it observed.",
    tag: "Read only",
  },
  {
    number: "03",
    title: "Explain what does not match",
    body: "Each required check reports pass, fail, unknown, or unsupported, with its expected and observed evidence.",
    tag: "Evidence",
  },
  {
    number: "04",
    title: "Customer authorizes its own repair",
    body: "Orynn can prepare and simulate a proposed transaction. The customer’s authorized wallet decides whether to execute it.",
    tag: "Customer controlled",
  },
  {
    number: "05",
    title: "Recheck, then apply campaign rules",
    body: "A fresh result can be tied to a funded Arc campaign. The contract—not a page badge—controls grant settlement.",
    tag: "Arc · planned end-to-end",
  },
];

const principles = [
  {
    title: "Observe before you conclude",
    body: "Results are bound to a named deployment and observed chain snapshot. A missing or stale observation is not a pass.",
  },
  {
    title: "Code and configuration both matter",
    body: "The supported check looks at the dependency route, implementation, required configuration, and agreed behavior tests.",
  },
  {
    title: "The owner stays in control",
    body: "Orynn does not hold customer upgrade keys or silently change a customer’s contract.",
  },
  {
    title: "Evidence has a boundary",
    body: "A verifier’s signed report identifies who attested to the result; it is not a cryptographic proof that arbitrary code is secure.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pixel-label text-[9px] uppercase tracking-[0.12em] text-orynn sm:text-[10px]">
      {children}
    </p>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="text-base text-orynn">
      ↗
    </span>
  );
}

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="min-h-screen bg-ink pt-16">
        <section
          aria-labelledby="hero-title"
          className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 overflow-hidden px-4 pb-16 pt-14 md:px-8 md:pb-24 md:pt-24 lg:grid-cols-12 lg:gap-8"
          id="overview"
        >
          <div
            aria-hidden="true"
            className="grid-backdrop pointer-events-none absolute inset-0 opacity-50"
          />
          <div
            aria-hidden="true"
            className="glow-orb pointer-events-none absolute -right-20 -top-24 size-[420px]"
          />

          <div className="relative z-10 flex flex-col items-start gap-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted sm:text-[10px]">
                Dependency repair · testnet prototype
              </span>
            </div>
            <h1
              className="max-w-3xl text-[clamp(2.35rem,5.4vw,4.35rem)] font-normal leading-[1.04] tracking-[-0.055em] text-white"
              id="hero-title"
            >
              A published fix is only the start.
              <span className="mt-2 block text-orynn">
                Prove each deployment is repaired.
              </span>
            </h1>
            <p className="max-w-2xl text-base font-light leading-7 text-muted md:text-lg md:leading-8">
              Orynn helps infrastructure suppliers and protocol teams coordinate
              known dependency repairs across customer-owned smart-contract
              deployments—with clear checks, owner-controlled changes, and
              evidence tied to the state that was observed.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                className="inline-flex items-center gap-2 rounded bg-orynn px-5 py-3 font-mono text-xs font-semibold text-black shadow-[0_0_24px_rgba(255,87,26,0.24)] transition-colors hover:bg-white"
                href="#workflow"
              >
                Explore the workflow <Arrow />
              </a>
              <a
                className="inline-flex items-center gap-2 rounded border border-line-strong bg-panel px-5 py-3 font-mono text-xs text-copy transition-colors hover:border-orynn/60 hover:text-white"
                href="#architecture"
              >
                View the architecture
              </a>
            </div>

            <div className="w-full max-w-xl pt-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded border border-line bg-panel px-4 py-3 font-mono text-[10px] text-muted sm:text-[11px]">
                <span className="flex items-center gap-2 text-copy">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-sm bg-orynn"
                  />
                  release policy → deployment evidence
                </span>
                <span className="text-dim">no customer key custody</span>
              </div>
              <p className="mt-2 font-mono text-[10px] leading-5 text-dim">
                Current prototype supports one documented oracle-adapter and
                proxy pattern; unsupported paths are reported as unsupported,
                not silently accepted.
              </p>
            </div>
          </div>

          <div className="relative z-10 lg:col-span-5">
            <FlowIllustration />
          </div>

          <div className="relative z-10 mt-4 flex w-full flex-col items-center gap-5 border-t border-line pt-7 text-center sm:mt-8 md:mt-12 md:flex-row md:justify-between md:text-left lg:col-span-12">
            <p className="pixel-label text-[8px] uppercase tracking-[0.12em] text-dim sm:text-[9px]">
              Made for the handoff between
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted md:justify-end">
              <span>Supplier security teams</span>
              <span aria-hidden="true" className="text-orynn">
                ×
              </span>
              <span>Customer protocol teams</span>
              <span aria-hidden="true" className="text-orynn">
                ×
              </span>
              <span>Authorized owners</span>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="problem-title"
          className="border-y border-line bg-panel py-16 md:py-24"
        >
          <div className="mx-auto max-w-[1280px] px-4 md:px-8">
            <div className="mb-10 max-w-3xl md:mb-12">
              <SectionLabel>The gap</SectionLabel>
              <h2
                className="mt-3 text-3xl font-normal leading-tight tracking-[-0.04em] text-white md:text-4xl"
                id="problem-title"
              >
                One supplier release. Many customer-owned deployments. Who
                checked that they all changed?
              </h2>
              <p className="mt-4 max-w-2xl text-sm font-light leading-7 text-muted md:text-base">
                A release announcement says a repair exists. It does not
                establish which customer deployments use it, whether their
                configuration is safe, or whether the agreed behavior still
                works.
              </p>
            </div>

            <div className="grid grid-cols-1 border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
              {problems.map((problem) => (
                <article
                  className="flex min-h-52 flex-col justify-between border-b border-r border-line bg-panel p-6 transition-colors hover:bg-panel-raised md:min-h-56 md:p-7"
                  key={problem.number}
                >
                  <span className="font-mono text-xs text-dim">
                    {problem.number}
                  </span>
                  <div className="mt-8">
                    <h3 className="text-lg font-normal tracking-tight text-white">
                      {problem.title}
                    </h3>
                    <p className="mt-3 text-sm font-light leading-6 text-muted">
                      {problem.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="workflow-title"
          className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 md:py-24"
          id="workflow"
        >
          <div className="mb-10 flex flex-col justify-between gap-5 md:mb-12 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <SectionLabel>Repair workflow</SectionLabel>
              <h2
                className="mt-3 text-3xl font-normal leading-tight tracking-[-0.04em] text-white md:text-4xl"
                id="workflow-title"
              >
                A repair process with evidence at each handoff.
              </h2>
            </div>
            <p className="max-w-md text-sm font-light leading-6 text-muted">
              Orynn coordinates and explains the work. The customer remains in
              control of its deployment and its keys.
            </p>
          </div>

          <div className="grid grid-cols-1 border-l border-t border-line md:grid-cols-5">
            {steps.map((step) => (
              <article
                className="border-b border-r border-line bg-ink p-5 md:min-h-64 md:p-5"
                key={step.number}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-dim">
                    {step.number}
                  </span>
                  <span className="rounded border border-line bg-panel px-2 py-1 font-mono text-[8px] uppercase tracking-wide text-muted">
                    {step.tag}
                  </span>
                </div>
                <h3 className="mt-10 text-base font-medium leading-snug text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm font-light leading-6 text-muted">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="architecture-title"
          className="border-y border-line bg-panel py-16 md:py-24"
          id="architecture"
        >
          <div className="mx-auto max-w-[1280px] px-4 md:px-8">
            <div className="mb-10 max-w-3xl">
              <SectionLabel>Architecture</SectionLabel>
              <h2
                className="mt-3 text-3xl font-normal leading-tight tracking-[-0.04em] text-white md:text-4xl"
                id="architecture-title"
              >
                Observe on the customer’s chain. Settle the campaign on Arc.
              </h2>
              <p className="mt-4 text-sm font-light leading-7 text-muted md:text-base">
                The website and verifier run as regular web services. The
                deployment being inspected stays on its source chain; Arc is the
                destination for campaign USDC rules. Chainlink CRE is intended
                to coordinate evidence and chain facts, and is still an
                integration in progress.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
              <div className="rounded-lg border border-line bg-ink p-5 md:p-6">
                <span className="font-mono text-[9px] uppercase tracking-wider text-dim">
                  Source chain
                </span>
                <h3 className="mt-3 text-lg text-white">Customer deployment</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Proxy, dependency route, configuration, and current block
                  state.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="hidden items-center px-2 text-orynn lg:flex"
              >
                →
              </div>
              <div className="rounded-lg border border-orynn/30 bg-orynn/[0.04] p-5 md:p-6">
                <span className="font-mono text-[9px] uppercase tracking-wider text-orynn">
                  Orynn verifier
                </span>
                <h3 className="mt-3 text-lg text-white">Checks and evidence</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Runs the named supported checks and records a scoped outcome.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="hidden items-center px-2 text-orynn lg:flex"
              >
                →
              </div>
              <div className="rounded-lg border border-line bg-ink p-5 md:p-6">
                <span className="font-mono text-[9px] uppercase tracking-wider text-dim">
                  Arc settlement
                </span>
                <h3 className="mt-3 text-lg text-white">Campaign contract</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Applies funded USDC eligibility and claim rules onchain.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-line bg-ink px-5 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                <strong className="font-medium text-white">
                  Chainlink CRE:
                </strong>{" "}
                planned evidence/fact orchestration.
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-warning">
                End-to-end workflow not live yet
              </span>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="evidence-title"
          className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 md:py-24"
          id="scope"
        >
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <SectionLabel>Evidence, with boundaries</SectionLabel>
            <h2
              className="mt-3 text-3xl font-normal leading-tight tracking-[-0.04em] text-white md:text-4xl"
              id="evidence-title"
            >
              Every result should answer: what was checked, and against what?
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {principles.map((principle, index) => (
              <article
                className="rounded-lg border border-line bg-panel p-6 md:p-7"
                key={principle.title}
              >
                <span className="font-mono text-[10px] text-orynn">
                  0{index + 1}
                </span>
                <h3 className="mt-6 text-lg font-medium tracking-tight text-white">
                  {principle.title}
                </h3>
                <p className="mt-3 max-w-xl text-sm font-light leading-6 text-muted">
                  {principle.body}
                </p>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-6 text-dim">
            Orynn is not a universal scanner or an automatic upgrader. The
            current prototype covers one documented oracle-adapter/proxy
            pattern; other patterns need explicit support or manual review.
          </p>
        </section>

        <section className="relative overflow-hidden border-t border-line bg-ink py-20 md:py-28">
          <div
            aria-hidden="true"
            className="grid-backdrop pointer-events-none absolute inset-0 opacity-40"
          />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
            <SectionLabel>Repair with accountability</SectionLabel>
            <h2 className="mt-4 text-3xl font-normal leading-tight tracking-[-0.04em] text-white md:text-5xl">
              Know which deployments are repaired—and what still needs
              attention.
            </h2>
            <p className="mt-5 max-w-2xl text-sm font-light leading-7 text-muted md:text-base">
              Start with the repair policy, the customer-owned deployment, and
              the evidence needed to call the work done.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                className="rounded bg-orynn px-6 py-3 font-mono text-xs font-semibold text-black transition-colors hover:bg-white"
                href="#workflow"
              >
                Review the workflow <Arrow />
              </a>
              <a
                className="rounded px-5 py-3 font-mono text-xs text-muted transition-colors hover:text-white"
                href="https://github.com/ArchieTansaria/mitigate"
                rel="noreferrer"
                target="_blank"
              >
                View source on GitHub ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-7 text-xs text-dim sm:flex-row sm:items-center sm:justify-between md:px-8">
          <a
            aria-label="Orynn home"
            className="text-sm font-medium text-white"
            href="#overview"
          >
            Orynn
          </a>
          <p>
            Repair coordination for customer-owned smart-contract deployments.
          </p>
          <a
            className="transition-colors hover:text-white"
            href="https://github.com/ArchieTansaria/mitigate"
            rel="noreferrer"
            target="_blank"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </footer>
    </>
  );
}
