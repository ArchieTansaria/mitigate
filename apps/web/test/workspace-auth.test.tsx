import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No DOM test runtime is installed. Exercise the real page event handlers with
// deterministic hook state and commit-time effect cleanup, leaving API I/O fake.
const h = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[],
  pending: [] as (() => void)[],
  api: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(),
  push: vi.fn(),
  remember: vi.fn(),
  wallet: {
    address: "0x1111111111111111111111111111111111111111" as string | null,
    chainId: "31337" as string | null,
    status: "authenticated",
    connect: vi.fn(),
    authenticate: vi.fn(),
    disconnect: vi.fn(),
    error: null,
  },
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const effect = (setup: () => undefined | (() => void), deps?: unknown[]) => {
    const index = h.cursor++;
    const prior = h.effects[index];
    if (
      !prior ||
      !deps ||
      deps.some((dep, i) => !Object.is(dep, prior.deps?.[i]))
    ) {
      h.pending.push(() => {
        prior?.cleanup?.();
        h.effects[index] = { deps, cleanup: setup() || undefined };
      });
    }
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = h.cursor++;
      if (!(index in h.slots))
        h.slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        h.slots[index],
        (value: unknown) => {
          h.slots[index] =
            typeof value === "function" ? value(h.slots[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = h.cursor++;
      if (!(index in h.slots)) h.slots[index] = { current: initial };
      return h.slots[index];
    },
    useLayoutEffect: effect,
  };
});
vi.mock("@/lib/api", () => ({ api: h.api }));
vi.mock("@/lib/wallet", () => ({
  useWallet: () => h.wallet,
  WalletProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/workspace", async () => ({
  ...(await import("../lib/workspace")),
  rememberRun: h.remember,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => "/dashboard",
}));

import { WorkspaceShell } from "../app/components/workspace/shell";
import Releases from "../app/dashboard/releases/page";
import NewRun from "../app/dashboard/runs/new/page";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Record<string, unknown>>(node))
    return text(node.props.children);
  return typeof node === "string" || typeof node === "number"
    ? String(node)
    : "";
}
function render(component: () => unknown) {
  h.cursor = 0;
  const tree = component();
  for (const commit of h.pending.splice(0)) commit();
  return tree;
}
function find(tree: unknown, predicate: (element: Element) => boolean) {
  const element = elements(tree).find(predicate);
  if (!element) throw new Error("Expected UI control missing");
  return element;
}
function click(tree: unknown, label: string) {
  const button = find(
    tree,
    (e) => e.type === "button" && text(e).includes(label),
  );
  expect(button.props.disabled).not.toBe(true);
  (button.props.onClick as () => void)();
}
function manifestChange(tree: unknown, value: string) {
  const input = find(
    tree,
    (e) => typeof e.type === "function" && e.type.name === "ManifestInput",
  );
  (input.props.onChange as (value: string) => void)(value);
}
const manifest = JSON.stringify({
  schemaVersion: 1,
  releaseId: "test-release",
  issueDescription: "Test policy",
  supportedPatternId: "eip1967-transparent-v1",
  sourceChainId: "31337",
  approvedImplementationAddress: "0x2222222222222222222222222222222222222222",
  approvedRuntimeCodeHash: `0x${"11".repeat(32)}`,
  configurationPredicates: [],
  testPackDigest: `0x${"22".repeat(32)}`,
  requiredAssertionIds: ["configuration"],
  prerequisites: [],
  artifactRefs: [],
});
const doc = {
  id: "12345678-1234-4123-8123-123456789abc",
  digest: `0x${"33".repeat(32)}`,
};
function deferred() {
  let resolve = (_value: unknown) => {};
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function readyRun() {
  manifestChange(render(NewRun), manifest);
  click(render(NewRun), "Continue");
  const input = find(
    render(NewRun),
    (e) => e.type === "input" && e.props.placeholder === "0x…",
  );
  (input.props.onChange as (event: unknown) => void)({
    target: { value: "0x3333333333333333333333333333333333333333" },
  });
  click(render(NewRun), "Continue");
  return render(NewRun);
}
beforeEach(() => {
  h.cursor = 0;
  h.slots = [];
  h.effects = [];
  h.pending = [];
  h.api
    .mockReset()
    .mockImplementation(async (path) =>
      path === "/v1/verification-scopes"
        ? { ...doc, spec: { verificationScopeId: `0x${"44".repeat(32)}` } }
        : path === "/v1/runs"
          ? { id: doc.id, state: "queued" }
          : doc,
    );
  h.push.mockReset();
  h.remember.mockReset();
  h.wallet = {
    ...h.wallet,
    address: "0x1111111111111111111111111111111111111111",
    chainId: "31337",
    status: "authenticated",
    connect: vi.fn(),
    authenticate: vi.fn(),
  };
});
afterEach(() => {
  for (const effect of h.effects) effect?.cleanup?.();
});

describe("workspace submission regressions", () => {
  it("normalizes snapshot age to the backend canonical decimal string", async () => {
    const input = find(
      readyRun(),
      (e) => e.type === "input" && e.props.value === "3600",
    );
    (input.props.onChange as (event: unknown) => void)({
      target: { value: "03600" },
    });
    click(render(NewRun), "Run verification");
    await vi.waitFor(() => expect(h.push).toHaveBeenCalled());
    const scope = h.api.mock.calls.find(
      ([path]) => path === "/v1/verification-scopes",
    );
    expect(JSON.parse(String(scope?.[1]?.body)).maxSnapshotAge).toBe("3600");
  });
  it.each(["address", "chainId", "status"])(
    "stops the submission pipeline after %s changes",
    async (field) => {
      const pending = deferred();
      h.api.mockImplementation(() => pending.promise);
      click(readyRun(), "Run verification");
      const signal = h.api.mock.calls[0][1]?.signal;
      h.wallet = {
        ...h.wallet,
        [field]:
          field === "address"
            ? "0x4444444444444444444444444444444444444444"
            : field === "chainId"
              ? "11155111"
              : "connected",
      };
      render(NewRun);
      expect(signal?.aborted).toBe(true);
      pending.resolve(doc);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(h.api.mock.calls.map(([path]) => path)).toEqual([
        "/v1/inventories",
        "/v1/manifests",
      ]);
      expect(h.remember).not.toHaveBeenCalled();
      expect(h.push).not.toHaveBeenCalled();
    },
  );
  it("ignores a late enqueue result after sign-out", async () => {
    const pending = deferred();
    const regular = h.api.getMockImplementation();
    if (!regular) throw new Error("Missing API fixture");
    h.api.mockImplementation((path, init) =>
      path === "/v1/runs" ? pending.promise : regular(path, init),
    );
    click(readyRun(), "Run verification");
    await vi.waitFor(() =>
      expect(h.api.mock.calls.some(([path]) => path === "/v1/runs")).toBe(true),
    );
    h.wallet = {
      ...h.wallet,
      address: null,
      chainId: null,
      status: "disconnected",
    };
    render(NewRun);
    pending.resolve({ id: doc.id });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.remember).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });
  it.each(["manifest", "account"])(
    "discards a late policy response after a change to the %s",
    async (kind) => {
      const pending = deferred();
      h.api.mockImplementation(() => pending.promise);
      manifestChange(render(Releases), manifest);
      click(render(Releases), "Register policy");
      const signal = h.api.mock.calls[0][1]?.signal;
      if (kind === "manifest")
        manifestChange(
          render(Releases),
          manifest.replace("test-release", "new-release"),
        );
      else
        h.wallet = {
          ...h.wallet,
          address: "0x4444444444444444444444444444444444444444",
        };
      render(Releases);
      expect(signal?.aborted).toBe(true);
      pending.resolve(doc);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(text(render(Releases))).not.toContain("Policy registered");
      expect(text(render(Releases))).not.toContain(doc.id);
    },
  );
  it("clears a completed policy result when the account changes", async () => {
    manifestChange(render(Releases), manifest);
    click(render(Releases), "Register policy");
    await vi.waitFor(() =>
      expect(text(render(Releases))).toContain("Policy registered"),
    );
    h.wallet = {
      ...h.wallet,
      address: "0x4444444444444444444444444444444444444444",
    };
    render(Releases);
    expect(text(render(Releases))).not.toContain("Policy registered");
  });
  it("connects a disconnected wallet even when its address remains populated", async () => {
    h.wallet = { ...h.wallet, chainId: null, status: "disconnected" };
    const wrapper = WorkspaceShell({ children: null });
    const frame = wrapper.props.children as ReactElement;
    const component = frame.type as (props: { children: null }) => unknown;
    click(
      render(() => component({ children: null })),
      "Connect wallet",
    );
    expect(h.wallet.connect).toHaveBeenCalledOnce();
    expect(h.wallet.authenticate).not.toHaveBeenCalled();
  });
});
