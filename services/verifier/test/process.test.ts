import { expect, it } from "vitest";
import { containerArguments, runBoundedProcess } from "../src/runtime.ts";

it("runs a bounded subprocess with no inherited secrets", async () => {
  process.env.PATCHBOND_TEST_SECRET = "must-not-reach-child";
  try {
    const r = await runBoundedProcess(
      process.execPath,
      ["-e", "process.stdout.write(String(process.env.PATCHBOND_TEST_SECRET))"],
      { timeoutMs: 2000, maxOutputBytes: 1000 },
    );
    expect(r.status).toBe("completed");
    expect(r.stdout).toBe("undefined");
  } finally {
    delete process.env.PATCHBOND_TEST_SECRET;
  }
});
it("terminates timed out and flooding subprocesses", async () => {
  expect(
    (
      await runBoundedProcess(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        { timeoutMs: 50, maxOutputBytes: 1000 },
      )
    ).status,
  ).toBe("timeout");
  const r = await runBoundedProcess(
    process.execPath,
    ["-e", "process.stdout.write('x'.repeat(100000))"],
    { timeoutMs: 1000, maxOutputBytes: 1000 },
  );
  expect(r.status).toBe("output-limit");
  expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(1000);
});
it("requires a pinned image and enforces a read-only, unprivileged, networkless container", () => {
  expect(() => containerArguments("foundry:latest", "probe")).toThrow(
    /digest/i,
  );
  const args = containerArguments(
    `ghcr.io/foundry-rs/foundry@sha256:${"a".repeat(64)}`,
    "probe",
  );
  for (const flag of [
    "--read-only",
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=256m",
    "--cpus=1",
    "--pids-limit=64",
    "--user=65534:65534",
  ])
    expect(args).toContain(flag);
  expect(args).not.toContain("--privileged");
  expect(args.some((v) => v.includes("docker.sock"))).toBe(false);
});

it("propagates a failing Foundry command to CI", async () => {
  const r = await runBoundedProcess(
    process.execPath,
    ["scripts/forge.mjs", "__patchbond_invalid_command__"],
    { timeoutMs: 10000, maxOutputBytes: 8192 },
  );
  expect(r.status).toBe("failed");
  expect(r.exitCode).not.toBe(0);
});

it("settles timeout even when a detached descendant retains output pipes", async () => {
  const code = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setTimeout(()=>{},3000)'],{detached:true,stdio:['ignore',process.stdout,process.stderr]}); process.stdout.write(String(c.pid)); setTimeout(()=>{},3000);`;
  const started = performance.now();
  const r = await runBoundedProcess(process.execPath, ["-e", code], {
    timeoutMs: 200,
    maxOutputBytes: 1000,
  });
  const elapsed = performance.now() - started;
  const descendant = Number(r.stdout);
  // A deliberately escaped host process is test cleanup; untrusted execution belongs in Docker.
  if (Number.isInteger(descendant) && descendant > 1) {
    try {
      process.kill(-descendant, "SIGKILL");
    } catch {
      /* already exited */
    }
  }
  expect(r.status).toBe("timeout");
  expect(elapsed).toBeLessThan(1200);
});

it("cancels active execution without waiting for its wall deadline", async () => {
  const abort = new AbortController();
  const started = performance.now();
  const result = runBoundedProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { timeoutMs: 10000, maxOutputBytes: 1000 },
    abort.signal,
  );
  setTimeout(() => abort.abort(), 100);
  expect((await result).status).toBe("cancelled");
  expect(performance.now() - started).toBeLessThan(1500);
});
