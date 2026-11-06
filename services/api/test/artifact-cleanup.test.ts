import { mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { FileArtifactStore } from "../src/artifacts/store.ts";

it("removes the real temporary file when the filesystem reports a failed sync", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pb-cleanup-")),
    file = await open(join(dir, "probe"), "w");
  const prototype = Object.getPrototypeOf(file);
  await file.close();
  await rm(join(dir, "probe"));
  const spy = vi
    .spyOn(prototype, "sync")
    .mockRejectedValue(
      Object.assign(new Error("disk full"), { code: "ENOSPC" }),
    );
  try {
    await expect(
      new FileArtifactStore(dir, 128).put(Buffer.from("{}")),
    ).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  } finally {
    spy.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});
