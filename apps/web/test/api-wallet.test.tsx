import { createSiweMessage } from "viem/siwe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWalletController, type EIP1193Provider } from "../lib/wallet";

const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const challengeId = "12345678-1234-4123-8123-123456789abc";
const fetcher = vi.fn<typeof fetch>();
function wallet() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const request = vi.fn(
    async ({
      method,
    }: {
      method: string;
      params?: unknown[];
    }): Promise<unknown> => {
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [address];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "personal_sign") return "0x1234";
      if (method === "eth_sendTransaction") return "0xtransaction";
      throw new Error("Unexpected wallet method");
    },
  );
  const provider: EIP1193Provider = {
    request,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(handler);
    },
    removeListener(event, handler) {
      listeners.get(event)?.delete(handler);
    },
  };
  return {
    provider,
    request,
    emit(event: string, value: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(value);
    },
  };
}
function challenge(domain = "orryn.test") {
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  return {
    challengeId,
    expiresAt,
    message: createSiweMessage({
      address,
      chainId: 31337,
      domain,
      uri: `https://${domain}`,
      version: "1",
      nonce: "1234567890abcdef",
      issuedAt: new Date(),
      expirationTime: new Date(expiresAt),
      statement:
        "Sign in to PatchBond. This grants no authority to upgrade contracts or transfer funds.",
    }),
  };
}
beforeEach(() => {
  vi.stubGlobal("window", {
    location: { origin: "https://orryn.test", host: "orryn.test" },
  });
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockImplementation(async (url) => {
    const path = String(url);
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    if (path.endsWith("/health"))
      return Response.json({
        status: "ok",
        schemaVersion: 1,
        mode: "local",
        sourceChainId: "31337",
        destinationChainId: "31338",
        contractsConfigured: false,
      });
    if (path.endsWith("/challenge")) return Response.json(challenge());
    if (path.endsWith("/verify"))
      return Response.json({ authenticated: true, expiresIn: 3600 });
    throw new Error("Unexpected API route");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("wallet authentication controller used by WalletProvider", () => {
  it("rejects wallets without account/chain event support", async () => {
    const w = wallet();
    const c = createWalletController(
      () => ({ request: w.request }) as unknown as EIP1193Provider,
    );
    await expect(c.connect()).rejects.toThrow();
    expect(c.getSnapshot().status).toBe("disconnected");
  });
  it("can reconnect after a locked wallet reveals an account again", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    w.emit("accountsChanged", []);
    w.emit("accountsChanged", [address]);
    await c.connect();
    expect(c.getSnapshot()).toMatchObject({
      address,
      chainId: "31337",
      status: "connected",
    });
    await c.disconnect();
  });
  it("invalidates expired sessions and revokes them", async () => {
    vi.useFakeTimers();
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    await c.authenticate();
    await vi.advanceTimersByTimeAsync(3600001);
    expect(c.getSnapshot()).toMatchObject({
      status: "connected",
      error: expect.stringContaining("expired"),
    });
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain("/logout");
    await c.disconnect();
  });
  it("never verifies after the wallet changes while a signature prompt is pending", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    let release: ((signature: string) => void) | undefined;
    const regular = w.request.getMockImplementation();
    if (!regular) throw new Error("Missing wallet fixture");
    w.request.mockImplementation((args) =>
      args.method === "personal_sign"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : regular(args),
    );
    const pending = c.authenticate().catch(() => {});
    await vi.waitFor(() => expect(release).toBeDefined());
    w.emit("chainChanged", "0xaa36a7");
    release?.("0x1234");
    await pending;
    expect(c.getSnapshot()).toMatchObject({
      status: "connected",
      chainId: "11155111",
    });
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/verify")),
    ).toBe(false);
    await c.disconnect();
  });
  it("connects without signing or sending a transaction; request is explicit", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    expect(c.getSnapshot()).toMatchObject({
      address,
      chainId: "31337",
      status: "connected",
      error: null,
    });
    expect(w.request.mock.calls.map(([args]) => args.method)).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
    ]);
    const tx = {
      method: "eth_sendTransaction",
      params: [{ from: address, to: other, value: "0x0" }],
    };
    expect(await c.request(tx)).toBe("0xtransaction");
    expect(w.request).toHaveBeenLastCalledWith(tx);
    await c.disconnect();
  });
  it("signs the server challenge as UTF-8 hex and submits only challengeId/signature", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    await c.authenticate();
    expect(c.getSnapshot().status).toBe("authenticated");
    const sign = w.request.mock.calls.find(
      ([args]) => args.method === "personal_sign",
    )?.[0];
    expect(sign?.params?.[1]).toBe(address);
    expect(
      Buffer.from(String(sign?.params?.[0]).slice(2), "hex").toString(),
    ).toContain("orryn.test wants you to sign in");
    const verify = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/verify"),
    );
    expect(JSON.parse(String(verify?.[1]?.body))).toEqual({
      challengeId,
      signature: "0x1234",
    });
    await c.disconnect();
    expect(c.getSnapshot()).toMatchObject({
      address: null,
      chainId: null,
      status: "disconnected",
    });
  });
  it.each(["accountsChanged", "chainChanged"])(
    "invalidates authentication and revokes session on %s",
    async (event) => {
      const w = wallet();
      const c = createWalletController(() => w.provider);
      await c.connect();
      await c.authenticate();
      const callsBefore = fetcher.mock.calls.length;
      w.emit(event, event === "accountsChanged" ? [other] : "0xaa36a7");
      expect(c.getSnapshot().status).toBe("connected");
      expect(
        c.getSnapshot()[event === "accountsChanged" ? "address" : "chainId"],
      ).toBe(event === "accountsChanged" ? other : "11155111");
      await vi.waitFor(() =>
        expect(
          fetcher.mock.calls
            .slice(callsBefore)
            .some(([url]) => String(url).endsWith("/logout")),
        ).toBe(true),
      );
      await c.disconnect();
    },
  );
  it("never signs on an unsupported source chain or wrong challenge domain", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ sourceChainId: "11155111" }));
    await expect(c.authenticate()).rejects.toThrow();
    expect(
      w.request.mock.calls.some(([args]) => args.method === "personal_sign"),
    ).toBe(false);
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ sourceChainId: "31337" }))
      .mockResolvedValueOnce(Response.json(challenge("evil.test")));
    await expect(c.authenticate()).rejects.toThrow();
    expect(
      w.request.mock.calls.some(([args]) => args.method === "personal_sign"),
    ).toBe(false);
    await c.disconnect();
  });
  it("does not authenticate a stale account when it changes during verification", async () => {
    const w = wallet();
    const c = createWalletController(() => w.provider);
    await c.connect();
    let release: ((response: Response) => void) | undefined;
    const regular = fetcher.getMockImplementation();
    if (!regular) throw new Error("Missing API fixture");
    fetcher.mockImplementation((url, init) =>
      String(url).endsWith("/verify")
        ? new Promise((resolve) => {
            release = resolve;
          })
        : regular(url, init),
    );
    const authentication = c.authenticate().catch(() => {});
    await vi.waitFor(() => expect(release).toBeDefined());
    w.emit("accountsChanged", [other]);
    release?.(Response.json({ authenticated: true, expiresIn: 3600 }));
    await authentication;
    await vi.waitFor(() =>
      expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain("/logout"),
    );
    expect(c.getSnapshot()).toMatchObject({
      address: other,
      status: "connected",
    });
    await c.disconnect();
  });
  it("handles wallet absence and user rejection without claiming a connection", async () => {
    const absent = createWalletController(() => undefined);
    await expect(absent.connect()).rejects.toThrow();
    expect(absent.getSnapshot()).toMatchObject({
      status: "disconnected",
      error: expect.any(String),
    });
    const w = wallet();
    w.request.mockRejectedValueOnce({ code: 4001 });
    const c = createWalletController(() => w.provider);
    await expect(c.connect()).rejects.toThrow();
    expect(c.getSnapshot()).toMatchObject({
      status: "disconnected",
      address: null,
      error: expect.any(String),
    });
  });
});
