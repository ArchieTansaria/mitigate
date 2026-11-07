"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet, WalletProvider } from "@/lib/wallet";
import { short } from "@/lib/workspace";
import { Icon, Mark } from "./ui-icon";

const items = [
  ["/dashboard", "Overview", "overview"],
  ["/dashboard/deployments", "Deployments", "deployments"],
  ["/dashboard/runs", "Verification runs", "runs"],
  ["/dashboard/releases", "Repair policies", "releases"],
  ["/dashboard/campaigns", "Campaigns", "campaigns"],
  ["/dashboard/settings", "Connections", "settings"],
];
function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const busy =
    wallet.status === "connecting" || wallet.status === "authenticating";
  async function signIn() {
    setActionError("");
    try {
      if (
        wallet.status === "disconnected" ||
        !wallet.address ||
        !wallet.chainId
      )
        await wallet.connect();
      else await wallet.authenticate();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Wallet request failed");
    }
  }
  return (
    <div className="min-h-screen bg-[#080809] text-copy">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:bg-orynn focus:p-3 focus:text-black"
      >
        Skip to workspace
      </a>
      <aside className={`workspace-sidebar ${open ? "is-open" : ""}`}>
        <Link href="/" className="flex items-center gap-3 px-5 py-7">
          <Mark />
          <span className="text-xl font-semibold tracking-tight text-white">
            Orryn<span className="text-orynn">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-7 flex items-center gap-3 rounded-lg border border-line bg-panel-raised/40 p-3">
          <span className="grid size-8 place-items-center rounded bg-orynn/10 text-orynn">
            <Icon name="shield" />
          </span>
          <div>
            <div className="text-xs font-medium text-white">
              Repair workspace
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted">
              Customer-owned deployments
            </div>
          </div>
        </div>
        <p className="eyebrow px-6 pb-3">Workspace</p>
        <nav aria-label="Workspace navigation" className="space-y-1 px-3">
          {items.map(([href, label, icon]) => {
            const active =
              href === "/dashboard"
                ? pathname === href
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-[13px] transition-colors ${active ? "bg-orynn/10 text-orynn" : "text-muted hover:bg-white/5 hover:text-white"}`}
              >
                <Icon name={icon} />
                {label}
                {active && (
                  <span className="ml-auto size-1 rounded-full bg-orynn" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-5">
          <div className="rounded-lg border border-line p-4">
            <p className="mb-2 text-xs text-white">Proof before progress.</p>
            <p className="text-[11px] leading-relaxed text-muted">
              An upgrade transaction is the start. Verify the deployment that
              remains.
            </p>
            <Link
              href="/#workflow"
              className="mt-3 inline-flex items-center gap-2 text-xs text-orynn"
            >
              How it works <Icon name="arrow" />
            </Link>
          </div>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-widest text-dim">
            Orryn / developer preview
          </p>
        </div>
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-20 flex min-h-18 items-center justify-between gap-3 border-b border-line bg-[#080809]/90 px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="btn-secondary lg:hidden"
              aria-expanded={open}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <span className="hidden text-xs text-dim sm:inline">
              Workspace <span className="px-3">/</span>
            </span>
            <span className="text-xs text-copy">
              {items.find(([href]) => href === pathname)?.[1] ??
                (pathname.includes("/new")
                  ? "New verification"
                  : "Verification details")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {wallet.address && (
              <span className="hidden font-mono text-xs text-muted md:inline">
                {short(wallet.address)}
              </span>
            )}
            <button
              type="button"
              className={
                wallet.status === "authenticated"
                  ? "btn-secondary"
                  : "btn-primary"
              }
              disabled={busy}
              onClick={
                wallet.status === "authenticated"
                  ? () => {
                      void wallet
                        .disconnect()
                        .catch(() =>
                          setActionError("Could not sign out. Retry."),
                        );
                    }
                  : () => {
                      void signIn();
                    }
              }
            >
              <Icon name="wallet" />
              {busy
                ? "Waiting for wallet…"
                : wallet.status === "authenticated"
                  ? "Sign out"
                  : wallet.address && wallet.status !== "disconnected"
                    ? "Sign in"
                    : "Connect wallet"}
            </button>
          </div>
        </header>
        {(wallet.error || actionError) && (
          <div
            role="alert"
            className="border-b border-warning/20 bg-warning/5 px-6 py-3 text-xs text-warning"
          >
            {actionError || wallet.error}
          </div>
        )}
        <main
          id="workspace-content"
          className="mx-auto max-w-[1480px] px-5 py-8 md:px-9 md:py-10"
        >
          {children}
        </main>
        <footer className="mx-5 mt-10 flex flex-wrap justify-between gap-2 border-t border-line py-5 text-[10px] text-dim md:mx-9">
          <span>Orryn — deployed repair verification</span>
          <span>Your keys. Your deployments. Your decision.</span>
        </footer>
      </div>
    </div>
  );
}
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </WalletProvider>
  );
}
