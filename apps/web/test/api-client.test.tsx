import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});
describe("browser API helper", () => {
  it("uses the same-origin prefix, preserves JSON bodies and forces no-store", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "created" }));
    vi.stubGlobal("fetch", fetcher);
    const body = JSON.stringify({ schemaVersion: 1 });
    expect(
      await api("/v1/inventories", {
        method: "POST",
        body,
        cache: "force-cache",
      }),
    ).toEqual({ id: "created" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/backend/v1/inventories");
    expect(init).toMatchObject({
      body,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/../other",
    "/%2e%2e/other",
    "/health#fragment",
    "/\\evil.test",
  ])("rejects unsafe path %s before fetching", async (path) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(api(path)).rejects.toMatchObject({ code: "INVALID_PATH" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("throws a typed stable error and handles no-content success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { code: "CONFLICT", message: "CONFLICT", requestId: "req-1" },
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    try {
      await api("/v1/runs");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: "CONFLICT",
        status: 409,
        requestId: "req-1",
      });
    }
    expect(await api("/v1/auth/logout", { method: "POST" })).toBeUndefined();
  });
  it("reports malformed responses and network errors without leaking raw errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("<html>proxy error</html>", { status: 502 }),
        )
        .mockRejectedValueOnce(new Error("secret infrastructure")),
    );
    await expect(api("/health")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });
    await expect(api("/health")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
