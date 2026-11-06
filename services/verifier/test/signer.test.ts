import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { testSigner } from "../../../packages/schema/test/fixtures.ts";
import { loadEvidenceSigner } from "../src/evidence/signer.ts";

test("requires a private verifier key file matching the frozen evaluator", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pb-key-test-")),
    path = join(dir, "key");
  try {
    await writeFile(path, `0x${"01".repeat(32)}`, { mode: 0o600 });
    expect((await loadEvidenceSigner(path, testSigner.address)).address).toBe(
      testSigner.address,
    );
    await expect(
      loadEvidenceSigner(path, "0x1111111111111111111111111111111111111111"),
    ).rejects.toThrow(/EVALUATOR/);
    await chmod(path, 0o644);
    await expect(loadEvidenceSigner(path, testSigner.address)).rejects.toThrow(
      /PRIVATE/,
    );
    await chmod(path, 0o600);
    await symlink(path, join(dir, "link"));
    await expect(
      loadEvidenceSigner(join(dir, "link"), testSigner.address),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
