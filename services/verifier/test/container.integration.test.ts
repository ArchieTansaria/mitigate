import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import {
  containerArguments,
  probeContainer,
  runBoundedProcess,
} from "../src/runtime.ts";

const image =
  "ghcr.io/foundry-rs/foundry@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd";
const docker =
  process.env.DOCKER_BIN ??
  (existsSync("/Applications/Docker.app/Contents/Resources/bin/docker")
    ? "/Applications/Docker.app/Contents/Resources/bin/docker"
    : "docker");
it("runs actual Foundry in the pinned restricted container", async () => {
  const r = await probeContainer(docker, image);
  expect(r.status).toBe("completed");
  expect(r.stdout).toContain("forge Version: 1.7.1");
});
it("enforces nonroot identity, read-only filesystem and network isolation", async () => {
  const name = `patchbond-isolation-${randomUUID()}`;
  const args = containerArguments(image, name);
  const entry = args.indexOf("--entrypoint=forge");
  args[entry] = "--entrypoint=/bin/sh";
  args.pop();
  args.push(
    "-c",
    "test $(id -u) -eq 65534 && ! touch /write-should-fail 2>/dev/null && ! grep -q 00000000 /proc/net/route && echo isolated",
  );
  try {
    const r = await runBoundedProcess(docker, args, {
      timeoutMs: 10000,
      maxOutputBytes: 2048,
    });
    expect(r.status).toBe("completed");
    expect(r.stdout.trim()).toBe("isolated");
  } finally {
    await runBoundedProcess(docker, ["rm", "--force", name], {
      timeoutMs: 5000,
      maxOutputBytes: 1024,
    });
  }
});
