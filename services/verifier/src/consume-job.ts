import type { ArtifactStore } from "../../api/src/artifacts/store.ts";
import type { Job, Repository } from "../../api/src/db/repository.ts";
export type ConsumerOptions = {
  repo: Repository;
  store: ArtifactStore;
  leaseSeconds: number;
  maxRunMs: number;
  execute: (job: Job, signal: AbortSignal) => Promise<Uint8Array>;
  signal?: AbortSignal;
  onEvent?: (event: { event: string; runId: string }) => void;
};
export async function consumeNext(options: ConsumerOptions) {
  const { repo, store, leaseSeconds, maxRunMs } = options;
  if (!Number.isInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 600000)
    throw new Error("INVALID_RUN_DEADLINE");
  if (options.signal?.aborted) return { status: "stopped" as const };
  const job = await repo.claim(leaseSeconds);
  if (!job?.leaseToken) return { status: "idle" as const };
  const token = job.leaseToken,
    abort = new AbortController();
  let renewing = false,
    leaseLost = false;
  const stop = () => abort.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  const deadlineAt = new Date(Date.now() + maxRunMs);
  const deadline = setTimeout(() => abort.abort(), maxRunMs);
  const renew = setInterval(
    () => {
      if (renewing || abort.signal.aborted) return;
      renewing = true;
      void repo
        .renew(job.id, token, leaseSeconds)
        .then((ok) => {
          if (!ok) {
            leaseLost = true;
            abort.abort();
          }
        })
        .catch(() => {
          leaseLost = true;
          abort.abort();
        })
        .finally(() => {
          renewing = false;
        });
    },
    Math.max(50, Math.floor((leaseSeconds * 1000) / 3)),
  );
  let onAbort: () => void = () => {};
  try {
    options.onEvent?.({ event: "job-started", runId: job.id });
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error("EXECUTION_STOPPED"));
      abort.signal.addEventListener("abort", onAbort, { once: true });
      if (abort.signal.aborted) onAbort();
    });
    const bytes = await Promise.race([
      options.execute(job, abort.signal),
      stopped,
    ]);
    abort.signal.throwIfAborted();
    if (!(await repo.renew(job.id, token, leaseSeconds))) {
      leaseLost = true;
      throw new Error("LEASE_LOST");
    }
    const ref = await store.put(bytes);
    abort.signal.throwIfAborted();
    await repo.finish(job.id, token, ref, store, {
      signal: abort.signal,
      deadline: deadlineAt,
    });
    options.onEvent?.({ event: "job-succeeded", runId: job.id });
    return { status: "succeeded" as const, runId: job.id };
  } catch {
    try {
      await repo.fail(job.id, token);
    } catch {
      leaseLost = true;
    }
    options.onEvent?.({
      event: leaseLost ? "job-lease-lost" : "job-failed",
      runId: job.id,
    });
    return {
      status: leaseLost ? ("lease-lost" as const) : ("failed" as const),
      runId: job.id,
    };
  } finally {
    clearTimeout(deadline);
    clearInterval(renew);
    options.signal?.removeEventListener("abort", stop);
    abort.signal.removeEventListener("abort", onAbort);
  }
}
