// This module is a server route. Backend configuration and bearer sessions must
// remain here; browser modules use only the same-origin /api/backend boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "orryn_session";
const BODY_LIMIT = 262144;
const RESPONSE_LIMIT = 16777216;
const TIMEOUT_MS = 10000;
const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const run = new RegExp(
  `^/v1/runs/${UUID}(?:/(evidence|actions|cancel|publish|actions/validate))?$`,
);
const publicEvidence = new RegExp(`^/v1/public/runs/${UUID}/evidence$`);
const publicPaths = new Set([
  "/health",
  "/v1/auth/challenge",
  "/v1/auth/verify",
]);
const postPaths = new Set([
  "/v1/auth/challenge",
  "/v1/auth/verify",
  "/v1/auth/logout",
  "/v1/inventories",
  "/v1/manifests",
  "/v1/verification-scopes",
  "/v1/runs",
]);
const errorCodes = new Set([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PROPOSAL_MISMATCH",
  "STATE_CHANGED",
  "STALE_PROPOSAL",
  "INVALID_OR_STALE_EVIDENCE",
  "RATE_LIMITED",
  "UNSUPPORTED_PURPOSE",
  "ARTIFACT_UNAVAILABLE_OR_CORRUPT",
  "BODY_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL_ERROR",
]);
type Context = { params: Promise<{ path: string[] }> };
class BridgeError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
function fail(code: string, status: number): never {
  throw new BridgeError(code, status);
}
function backendOrigin() {
  const raw = process.env.ORRYN_API_URL;
  if (!raw) return fail("API_NOT_CONFIGURED", 503);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("API_NOT_CONFIGURED", 503);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    return fail("API_NOT_CONFIGURED", 503);
  return url.origin;
}
function session(request: Request) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function setSession(
  response: Response,
  request: Request,
  token = "",
  seconds = 0,
) {
  const url = new URL(request.url);
  // Plain-HTTP loopback is supported for local `next start` testing as well as
  // development. Every non-loopback deployment requires a Secure cookie.
  const secure =
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  response.headers.set(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/api/backend; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? "; Secure" : ""}`,
  );
  return response;
}
function reply(body: unknown, status = 200) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  return status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}
async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
  tooLarge: BridgeError,
) {
  if (!stream) return "";
  signal.throwIfAborted();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw tooLarge;
      chunks.push(value);
    }
    return Buffer.concat(chunks, length).toString("utf8");
  } finally {
    signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => {});
  }
}
function health(value: unknown) {
  if (!value || typeof value !== "object")
    return fail("INVALID_BACKEND_RESPONSE", 502);
  const v = value as Record<string, unknown>;
  const chain = (id: unknown) =>
    typeof id === "string" &&
    /^[1-9][0-9]{0,19}$/.test(id) &&
    BigInt(id) < 2n ** 64n;
  if (
    v.status !== "ok" ||
    v.schemaVersion !== 1 ||
    !["local", "testnet"].includes(String(v.mode)) ||
    !chain(v.sourceChainId) ||
    !chain(v.destinationChainId) ||
    typeof v.contractsConfigured !== "boolean"
  )
    return fail("INVALID_BACKEND_RESPONSE", 502);
  return {
    status: v.status,
    schemaVersion: v.schemaVersion,
    mode: v.mode,
    sourceChainId: v.sourceChainId,
    destinationChainId: v.destinationChainId,
    contractsConfigured: v.contractsConfigured,
  };
}

async function handle(request: Request, context: Context) {
  let logout = false;
  let protectedRoute = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { path: parts } = await context.params;
    const path = `/${parts.join("/")}`;
    const url = new URL(request.url);
    // Do not normalize or decode user paths into a more privileged route.
    if (
      parts.some((part) => !/^[a-zA-Z0-9-]+$/.test(part)) ||
      url.pathname !== `/api/backend${path}`
    )
      fail("NOT_FOUND", 404);
    const match = run.exec(path);
    const method = publicPaths.has(path)
      ? path === "/health"
        ? "GET"
        : "POST"
      : postPaths.has(path)
        ? "POST"
        : publicEvidence.test(path)
          ? "GET"
          : match
            ? ["cancel", "publish", "actions/validate"].includes(match[1])
              ? "POST"
              : "GET"
            : null;
    if (!method) fail("NOT_FOUND", 404);
    if (request.method !== method) fail("METHOD_NOT_ALLOWED", 405);
    if (match?.[1] === "actions") {
      if (
        [...url.searchParams.keys()].length !== 1 ||
        !/^0x[0-9a-fA-F]{64}$/.test(url.searchParams.get("deploymentKey") ?? "")
      )
        fail("INVALID_INPUT", 400);
    } else if (url.search) fail("INVALID_INPUT", 400);
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (
      (method === "POST" && origin !== url.origin) ||
      (origin && origin !== url.origin) ||
      (site && !["same-origin", "none"].includes(site))
    )
      fail("FORBIDDEN", 403);
    logout = path === "/v1/auth/logout";
    protectedRoute = !publicPaths.has(path) && !publicEvidence.test(path);
    const token = session(request);
    if (logout && !token) return setSession(reply(null, 204), request);
    if (protectedRoute && !token) fail("UNAUTHORIZED", 401);
    const target = backendOrigin();
    const headers = new Headers({ Accept: "application/json" });
    if (protectedRoute && token)
      headers.set("Authorization", `Bearer ${token}`);
    let body: string | undefined;
    if (method === "POST") {
      const contentLength = request.headers.get("content-length");
      if (
        contentLength &&
        (!/^\d+$/.test(contentLength) || Number(contentLength) > BODY_LIMIT)
      )
        fail("BODY_TOO_LARGE", 413);
      const text = await readBounded(
        request.body,
        BODY_LIMIT,
        controller.signal,
        new BridgeError("BODY_TOO_LARGE", 413),
      );
      if (text) {
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        )
          fail("UNSUPPORTED_MEDIA_TYPE", 415);
        try {
          JSON.parse(text);
        } catch {
          fail("INVALID_INPUT", 400);
        }
        body = text;
        headers.set("Content-Type", "application/json");
      }
      const key = request.headers.get("idempotency-key");
      if (path === "/v1/runs") {
        if (!key || !/^[a-zA-Z0-9_-]{1,128}$/.test(key))
          fail("INVALID_INPUT", 400);
        headers.set("Idempotency-Key", key);
      }
    }
    const upstream = await fetch(`${target}${path}${url.search}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (upstream.status === 204) {
      if (!logout && !["cancel", "publish"].includes(match?.[1] ?? ""))
        fail("INVALID_BACKEND_RESPONSE", 502);
      const response = reply(null, 204);
      return logout ? setSession(response, request) : response;
    }
    const text = await readBounded(
      upstream.body,
      RESPONSE_LIMIT,
      controller.signal,
      new BridgeError("INVALID_BACKEND_RESPONSE", 502),
    );
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      fail("INVALID_BACKEND_RESPONSE", 502);
    }
    if (!upstream.ok) {
      const error = value as { code?: unknown; requestId?: unknown } | null;
      const code =
        typeof error?.code === "string" && errorCodes.has(error.code)
          ? error.code
          : "BACKEND_ERROR";
      const requestId =
        typeof error?.requestId === "string" &&
        /^[\w-]{1,128}$/.test(error.requestId)
          ? error.requestId
          : undefined;
      const response = reply(
        { code, message: code, ...(requestId ? { requestId } : {}) },
        upstream.status >= 400 && upstream.status <= 599
          ? upstream.status
          : 502,
      );
      return logout || (protectedRoute && upstream.status === 401)
        ? setSession(response, request)
        : response;
    }
    if (path === "/v1/auth/verify") {
      const auth = value as { token?: unknown; expiresIn?: unknown } | null;
      if (
        typeof auth?.token !== "string" ||
        !/^[a-f0-9]{64}$/.test(auth.token) ||
        typeof auth.expiresIn !== "number" ||
        !Number.isInteger(auth.expiresIn) ||
        auth.expiresIn < 1 ||
        auth.expiresIn > 86400
      )
        fail("INVALID_BACKEND_RESPONSE", 502);
      return setSession(
        reply({ authenticated: true, expiresIn: auth.expiresIn }),
        request,
        auth.token,
        auth.expiresIn,
      );
    }
    const response = reply(
      path === "/health" ? health(value) : value,
      upstream.status,
    );
    const digest = upstream.headers.get("x-evidence-digest");
    if (digest && /^0x[0-9a-fA-F]{64}$/.test(digest))
      response.headers.set("X-Evidence-Digest", digest);
    // Evidence digests bind the artifact bytes, including any whitespace.
    if (path.endsWith("/evidence"))
      return new Response(text, {
        status: upstream.status,
        headers: response.headers,
      });
    return logout ? setSession(response, request) : response;
  } catch (error) {
    const code =
      error instanceof BridgeError
        ? error.code
        : controller.signal.aborted
          ? "API_TIMEOUT"
          : "API_UNAVAILABLE";
    const status =
      error instanceof BridgeError
        ? error.status
        : controller.signal.aborted
          ? 504
          : 502;
    const response = reply({ code, message: code }, status);
    return logout || (protectedRoute && status === 401)
      ? setSession(response, request)
      : response;
  } finally {
    clearTimeout(timer);
  }
}

export const GET = handle;
export const POST = handle;
