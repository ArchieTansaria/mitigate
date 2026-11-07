export function FlowIllustration() {
  return (
    <div
      aria-label="Illustrative view of a supplier release being checked against a customer-owned deployment"
      className="relative flex min-h-[360px] flex-col justify-between overflow-hidden rounded-xl border border-line bg-panel p-4 shadow-2xl md:min-h-[430px] md:p-5"
      role="img"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-warning"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:text-[11px]">
            Repair path · illustrative
          </span>
        </div>
        <span className="rounded border border-line bg-panel-raised px-2 py-1 font-mono text-[9px] text-dim sm:text-[10px]">
          NOT LIVE DATA
        </span>
      </div>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 items-center justify-center py-6">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          fill="none"
          preserveAspectRatio="xMidYMid meet"
          viewBox="0 0 440 300"
        >
          <path
            d="M70 150H175M265 150H365"
            stroke="#2c2c33"
            strokeDasharray="4 5"
          />
          <path d="M175 150H265" stroke="#ff571a" strokeDasharray="4 5" />
          <path d="M220 162V230" stroke="#00e297" strokeDasharray="4 5" />
          <circle cx="70" cy="150" r="5" fill="#94949e" />
          <circle
            cx="220"
            cy="150"
            r="34"
            fill="#121216"
            stroke="#ff571a"
            strokeWidth="1.5"
          />
          <circle cx="365" cy="150" r="6" fill="#ffb800" />
          <circle cx="220" cy="230" r="5" fill="#00e297" />
        </svg>

        <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded border border-line bg-panel-raised px-2.5 py-2 text-center sm:px-3">
          <span className="block font-mono text-[8px] uppercase tracking-wider text-dim sm:text-[9px]">
            Supplier
          </span>
          <span className="mt-1 block text-[10px] text-copy sm:text-xs">
            Repair release
          </span>
        </div>

        <div className="z-10 flex size-[68px] flex-col items-center justify-center rounded-full border border-orynn/50 bg-panel-raised shadow-[0_0_36px_rgba(255,87,26,0.15)] sm:size-20">
          <span className="pixel-label text-[9px] text-orynn sm:text-[10px]">
            ORYNN
          </span>
          <span className="mt-1 font-mono text-[8px] text-muted sm:text-[9px]">
            checks
          </span>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded border border-line bg-panel-raised px-2.5 py-2 text-center sm:px-3">
          <span className="block font-mono text-[8px] uppercase tracking-wider text-dim sm:text-[9px]">
            Customer
          </span>
          <span className="mt-1 block text-[10px] text-copy sm:text-xs">
            Own deployment
          </span>
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded border border-success/30 bg-panel-raised px-3 py-2 text-center">
          <span className="block font-mono text-[8px] uppercase tracking-wider text-dim sm:text-[9px]">
            Evidence result
          </span>
          <span className="mt-1 block text-[10px] text-success sm:text-xs">
            Pass · Fail · Unknown
          </span>
        </div>

        <span className="absolute left-[23%] top-[calc(50%-30px)] hidden -translate-y-full font-mono text-[8px] text-dim sm:block">
          publishes policy
        </span>
        <span className="absolute right-[20%] top-[calc(50%-30px)] hidden -translate-y-full font-mono text-[8px] text-dim sm:block">
          observed onchain
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[9px] text-dim sm:text-[10px]">
        <span>Known repair conditions</span>
        <span aria-hidden="true" className="text-orynn">
          →
        </span>
        <span>Evidence-bound outcome</span>
      </div>
    </div>
  );
}
