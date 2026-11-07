import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/backend/[...path]/route";

const origin = "https://orryn.test";
const id = "12345678-1234-4123-8123-123456789abc";
const token = "ab".repeat(32);
const upstream = vi.fn<typeof fetch>();
function call(path: string, method = "GET", options: RequestInit = {}) {
  const request = new Request(`${origin}/api/backend${path}`, {
    ...options,
    method,
    headers: { ...(method === "POST" ? { origin } : {}), ...options.headers },
  });
  return (method === "GET" ? GET : POST)(request, {
    params: Promise.resolve({ path: path.split("?")[0].slice(1).split("/") }),
  });
}
const json = (body: unknown, status = 200, headers = {}) =>
  Response.json(body, { status, headers });

beforeEach(() => {
  vi.stubEnv("ORRYN_API_URL", "http://127.0.0.1:3001");
  vi.stubGlobal("fetch", upstream);
  upstream.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("same-origin API bridge", () => {
  it("allows non-Secure cookies only for explicit plain-HTTP loopback testing, including production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    upstream.mockResolvedValue(json({ token, expiresIn: 3600 }));
    const request = new Request(
      "http://localhost:3000/api/backend/v1/auth/verify",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "auth", "verify"] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
  it("preserves exact evidence bytes and digest while suppressing upstream cookies", async () => {
    const text = '{ "schemaVersion": 1, "body": { "runId": "example" } }\n';
    const digest = `0x${"12".repeat(32)}`;
    upstream.mockResolvedValue(
      new Response(text, {
        headers: {
          "content-type": "application/json",
          "x-evidence-digest": digest,
          "set-cookie": "bad=value",
        },
      }),
    );
    const response = await call(`/v1/public/runs/${id}/evidence`);
    expect(await response.text()).toBe(text);
    expect(response.headers.get("x-evidence-digest")).toBe(digest);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects oversized upstream bodies", async () => {
    upstream.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(16777217));
            controller.close();
          },
        }),
      ),
    );
    const response = await call("/health");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "INVALID_BACKEND_RESPONSE",
    });
  });
  it("applies its timeout to a stalled upstream body as well as connection setup", async () => {
    vi.useFakeTimers();
    upstream.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
        }),
      ),
    );
    const pending = call("/health");
    await vi.advanceTimersByTimeAsync(10001);
    expect((await pending).status).toBe(504);
  });
  it("ignores upstream redirects and never follows them with a session", async () => {
    upstream.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.test" },
      }),
    );
    const response = await call(`/v1/runs/${id}`, "GET", {
      headers: { cookie: `orryn_session=${token}` },
    });
    expect(response.status).toBe(502);
    expect(upstream.mock.calls).toHaveLength(1);
    expect(upstream.mock.calls[0][1]?.redirect).toBe("error");
  });
  it("fails closed without a server URL, ignoring public env defaults", async () => {
    vi.stubEnv("ORRYN_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ORRYN_API_URL", "https://unexpected.test");
    const response = await call("/health");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "API_NOT_CONFIGURED" });
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    "https://user:secret@upstream.test",
    "https://upstream.test/base",
    "ftp://upstream.test",
    "http://remote.test",
    "https://upstream.test?key=secret",
  ])("rejects invalid config %s without leaking it", async (url) => {
    vi.stubEnv("ORRYN_API_URL", url);
    const response = await call("/health");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(url);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    "/openapi.json",
    "/v1/campaigns",
    "/v1/runs",
    `/v1/runs/${id}/anything`,
    "/v1/runs/not-a-uuid",
    "/v1/auth/verify",
    "/health?url=https://evil.test",
    "/v1/%61uth/challenge",
  ])(
    "rejects routes/methods/queries outside the exact contract: %s",
    async (path) => {
      expect((await call(path)).status).toBeGreaterThanOrEqual(400);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "https://evil.test", "null"])(
    "rejects mutations from origin %s",
    async (badOrigin) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (badOrigin !== undefined) headers.set("origin", badOrigin);
      const request = new Request(`${origin}/api/backend/v1/auth/challenge`, {
        method: "POST",
        headers,
        body: "{}",
      });
      const response = await POST(request, {
        params: Promise.resolve({ path: ["v1", "auth", "challenge"] }),
      });
      expect(response.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it("rejects contradictory cross-site fetch metadata", async () => {
    const response = await call("/v1/auth/challenge", "POST", {
      headers: { "sec-fetch-site": "cross-site" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("projects exact health fields and never forwards credentials or cache validators", async () => {
    upstream.mockResolvedValue(
      json({
        status: "ok",
        schemaVersion: 1,
        mode: "local",
        sourceChainId: "31337",
        destinationChainId: "31338",
        contractsConfigured: false,
        rpcUrl: "secret",
        token,
      }),
    );
    const response = await call("/health", "GET", {
      headers: {
        cookie: `orryn_session=${token}`,
        authorization: "Bearer evil",
        "if-none-match": "cached",
      },
    });
    expect(await response.json()).toEqual({
      status: "ok",
      schemaVersion: 1,
      mode: "local",
      sourceChainId: "31337",
      destinationChainId: "31338",
      contractsConfigured: false,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:3001/health");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    const sent = new Headers(init?.headers);
    expect(sent.has("cookie")).toBe(false);
    expect(sent.has("authorization")).toBe(false);
    expect(sent.has("if-none-match")).toBe(false);
  });
  it("exchanges a verify token for an HttpOnly cookie and exposes only authentication metadata", async () => {
    upstream.mockResolvedValue(
      json({ token, expiresIn: 3600, secret: "private" }, 200, {
        "set-cookie": "untrusted=value",
      }),
    );
    const response = await call("/v1/auth/verify", "POST", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: id, signature: "0x1234" }),
    });
    expect(await response.json()).toEqual({
      authenticated: true,
      expiresIn: 3600,
    });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain(`orryn_session=${token}`);
    for (const flag of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/api/backend",
      "Max-Age=3600",
    ])
      expect(cookie).toContain(flag);
    expect(cookie).not.toContain("untrusted");
  });
  it("rejects malformed auth successes without setting a cookie", async () => {
    upstream.mockResolvedValue(json({ token: "bad", expiresIn: 864000 }));
    const response = await call("/v1/auth/verify", "POST", {
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("uses only the cookie for protected requests and preserves idempotency", async () => {
    upstream.mockResolvedValue(json({ id, state: "queued" }, 202));
    const response = await call("/v1/runs", "POST", {
      headers: {
        cookie: `orryn_session=${token}`,
        authorization: "Bearer attacker",
        "content-type": "application/json",
        "idempotency-key": "run_1",
        "x-forwarded-for": "spoofed",
      },
      body: "{}",
    });
    expect(response.status).toBe(202);
    const sent = new Headers(upstream.mock.calls[0][1]?.headers);
    expect(sent.get("authorization")).toBe(`Bearer ${token}`);
    expect(sent.get("idempotency-key")).toBe("run_1");
    expect(sent.has("x-forwarded-for")).toBe(false);
  });
  it("does not accept a browser bearer token in place of a cookie", async () => {
    expect(
      (
        await call(`/v1/runs/${id}`, "GET", {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("revokes logout upstream and clears the cookie", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await call("/v1/auth/logout", "POST", {
      headers: { cookie: `orryn_session=${token}` },
    });
    expect(response.status).toBe(204);
    expect(
      new Headers(upstream.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe(`Bearer ${token}`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("clears logout locally but reports a failed remote revocation", async () => {
    upstream.mockRejectedValue(new Error("private infrastructure"));
    const response = await call("/v1/auth/logout", "POST", {
      headers: { cookie: `orryn_session=${token}` },
    });
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.text()).not.toContain("private infrastructure");
  });
  it("bounds streamed request bytes even without a content-length header", async () => {
    const response = await call("/v1/auth/challenge", "POST", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(262144) }),
    });
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ["text/plain", "{}", 415],
    ["application/json", "{bad", 400],
  ])("validates JSON requests", async (type, body, expected) => {
    const response = await call("/v1/auth/challenge", "POST", {
      headers: { "content-type": String(type) },
      body: String(body),
    });
    expect(response.status).toBe(expected);
  });
  it("preserves known safe error codes without reflecting backend messages", async () => {
    upstream.mockResolvedValue(
      json(
        { code: "CONFLICT", message: `secret ${token}`, requestId: "req-1" },
        409,
      ),
    );
    const response = await call("/v1/auth/challenge", "POST", {
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(await response.json()).toEqual({
      code: "CONFLICT",
      message: "CONFLICT",
      requestId: "req-1",
    });
  });
  it("allows only the deploymentKey query on actions", async () => {
    upstream.mockResolvedValue(json({ status: "unsupported" }));
    const path = `/v1/runs/${id}/actions?deploymentKey=0x${"12".repeat(32)}`;
    expect(
      (
        await call(path, "GET", {
          headers: { cookie: `orryn_session=${token}` },
        })
      ).status,
    ).toBe(200);
    expect((await call(`${path}&url=evil`, "GET")).status).toBe(400);
  });
  it("terminates stalled upstream requests with a safe timeout", async () => {
    vi.useFakeTimers();
    upstream.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const responsePromise = call("/health");
    await vi.advanceTimersByTimeAsync(10001);
    expect((await responsePromise).status).toBe(504);
  });
});
