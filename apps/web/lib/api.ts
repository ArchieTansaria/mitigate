export type ApiHealth = {
  status: "ok";
  schemaVersion: 1;
  mode: "local" | "testnet";
  sourceChainId: string;
  destinationChainId: string;
  contractsConfigured: boolean;
};

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly status = 0,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiOptions = RequestInit & { timeoutMs?: number };

/** Paths are backend paths such as /health or /v1/runs. Bodies are JSON strings. */
export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const pathname = path.split("?")[0];
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\#\s]/.test(path) ||
    /%|(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname)
  ) {
    throw new ApiError("INVALID_PATH", "Use a relative backend API path.");
  }
  const { timeoutMs = 15000, signal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.max(1, Math.min(timeoutMs, 60000)),
  );
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.delete("Authorization");
  if (init.body != null && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(`/api/backend${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError(
        "INVALID_RESPONSE",
        "The API returned an invalid response.",
        response.status,
      );
    }
    if (!response.ok) {
      const value = body as {
        code?: unknown;
        message?: unknown;
        requestId?: unknown;
      } | null;
      const code =
        typeof value?.code === "string" &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(value.code)
          ? value.code
          : "API_ERROR";
      const requestId =
        typeof value?.requestId === "string" ? value.requestId : undefined;
      throw new ApiError(
        code,
        code.replaceAll("_", " "),
        response.status,
        requestId,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      timedOut
        ? "API_TIMEOUT"
        : controller.signal.aborted
          ? "REQUEST_ABORTED"
          : "NETWORK_ERROR",
      timedOut
        ? "The API request timed out."
        : controller.signal.aborted
          ? "The request was cancelled."
          : "Unable to reach the API.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
