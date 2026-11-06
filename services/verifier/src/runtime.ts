import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

type ProcessResult = {
  status: "completed" | "failed" | "timeout" | "output-limit" | "cancelled";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};
// This supervises trusted CLI tools only. Host process groups are not an isolation boundary;
// untrusted test execution must remain inside the resource-limited container.
export function runBoundedProcess(
  command: string,
  args: string[],
  limits: { timeoutMs: number; maxOutputBytes: number },
  signal?: AbortSignal,
): Promise<ProcessResult> {
  if (
    !Number.isInteger(limits.timeoutMs) ||
    limits.timeoutMs < 1 ||
    limits.timeoutMs > 60000 ||
    !Number.isInteger(limits.maxOutputBytes) ||
    limits.maxOutputBytes < 1 ||
    limits.maxOutputBytes > 1048576
  )
    throw new Error("Invalid process limits");
  return new Promise((resolve) => {
    const start = performance.now();
    let forced: "timeout" | "output-limit" | "cancelled" | undefined;
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0);
    let size = 0;
    let finished = false;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command, args, {
      env: { PATH: process.env.PATH ?? "" },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const kill = () => {
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
    };
    const timer = setTimeout(() => {
      forced = "timeout";
      kill();
      drainTimer ??= setTimeout(() => finish(null), 100);
    }, limits.timeoutMs);
    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (drainTimer) clearTimeout(drainTimer);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      resolve({
        status: forced ?? (exitCode === 0 ? "completed" : "failed"),
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        exitCode,
        durationMs: Math.round(performance.now() - start),
      });
    };
    function collect(chunk: Buffer, channel: "stdout" | "stderr") {
      const remaining = Math.max(0, limits.maxOutputBytes - size);
      const accepted = chunk.subarray(0, remaining);
      if (channel === "stdout") stdout = Buffer.concat([stdout, accepted]);
      else stderr = Buffer.concat([stderr, accepted]);
      size += chunk.length;
      if (size > limits.maxOutputBytes && !forced) {
        forced = "output-limit";
        kill();
        drainTimer ??= setTimeout(() => finish(null), 100);
      }
    }
    child.stdout.on("data", (c: Buffer) => collect(c, "stdout"));
    child.stderr.on("data", (c: Buffer) => collect(c, "stderr"));
    child.on("exit", (code) => {
      kill(); // Also terminate remaining descendants in the original process group.
      drainTimer ??= setTimeout(() => finish(code), 100);
    });
    child.on("error", () => finish(null));
    child.on("close", finish);
    const cancel = () => {
      if (finished) return;
      forced = "cancelled";
      kill();
      drainTimer ??= setTimeout(() => finish(null), 100);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
export function containerArguments(image: string, name: string): string[] {
  if (!/^[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("A pinned image digest is required");
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid container name");
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=256m",
    "--memory-swap=256m",
    "--cpus=1",
    "--pids-limit=64",
    "--user=65534:65534",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
    "--entrypoint=forge",
    image,
    "--version",
  ];
}
export async function probeContainer(dockerBinary: string, image: string) {
  const name = `patchbond-probe-${randomUUID()}`;
  const args = containerArguments(image, name);
  const result = await runBoundedProcess(dockerBinary, args, {
    timeoutMs: 30000,
    maxOutputBytes: 8192,
  });
  // Killing the Docker client alone does not remove the daemon-owned container.
  const cleanup = await runBoundedProcess(
    dockerBinary,
    ["rm", "--force", name],
    { timeoutMs: 5000, maxOutputBytes: 1024 },
  );
  return {
    ...result,
    image,
    containerName: name,
    cleanupStatus: cleanup.status,
    isolated: result.status === "completed",
  };
}
