const links = [
  { href: "#overview", label: "Overview" },
  { href: "#workflow", label: "Workflow" },
  { href: "#architecture", label: "Architecture" },
  { href: "#scope", label: "Scope" },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-black/90 backdrop-blur-xl">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-orynn focus:px-4 focus:py-2 focus:text-black"
        href="#main-content"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 md:px-8">
        <a
          aria-label="Orynn home"
          className="flex shrink-0 items-center gap-3"
          href="#overview"
        >
          <span
            aria-hidden="true"
            className="grid size-7 grid-cols-3 gap-0.5 rounded-sm border border-orynn/50 p-1"
          >
            <span className="bg-orynn" />
            <span className="bg-orynn/40" />
            <span className="bg-orynn" />
            <span className="bg-orynn/40" />
            <span className="bg-orynn" />
            <span className="bg-orynn/40" />
            <span className="bg-orynn" />
            <span className="bg-orynn/40" />
            <span className="bg-orynn" />
          </span>
          <span className="text-[17px] font-medium tracking-tight text-white">
            Orynn
          </span>
          <span className="hidden rounded border border-line bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-dim sm:inline-flex">
            Prototype
          </span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 text-[13px] text-muted md:flex"
        >
          {links.map((link) => (
            <a
              className="transition-colors hover:text-white"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded border border-line bg-panel px-3 py-2 font-mono text-xs text-copy">
              Menu
            </summary>
            <nav
              aria-label="Mobile navigation"
              className="absolute right-0 top-12 flex min-w-48 flex-col gap-1 rounded-lg border border-line bg-panel p-2 shadow-2xl"
            >
              {links.map((link) => (
                <a
                  className="rounded px-3 py-2 text-sm text-muted hover:bg-panel-raised hover:text-white"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </details>
          <a
            className="inline-flex items-center gap-2 rounded bg-orynn px-4 py-2 font-mono text-[11px] font-semibold text-black shadow-[0_0_18px_rgba(255,87,26,0.2)] transition-colors hover:bg-white sm:text-xs"
            href="#workflow"
          >
            Explore workflow <span aria-hidden="true">↘</span>
          </a>
        </div>
      </div>
    </header>
  );
}
