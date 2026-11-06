import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { loadApprovedPack } from "../src/runner/oracle.ts";

test("rejects a changed test source or helper when the compiled artifact is stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pb-pack-"));
  try {
    for (const path of [
      "testpacks/oracle-adapter/OracleAdapterAssertions.sol",
      "testpacks/oracle-adapter/pack.json",
      "testpacks/oracle-adapter/README.md",
      "fixtures/src/VerificationHarness.sol",
      "fixtures/out/VerificationHarness.sol/VerificationHarness.json",
    ]) {
      const destination = join(dir, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, await readFile(path));
    }
    const root = pathToFileURL(`${dir}/`);
    const before = await loadApprovedPack(root);
    expect(before.harnessHash).toBeDefined();
    const path = join(
        dir,
        "testpacks/oracle-adapter/OracleAdapterAssertions.sol",
      ),
      original = await readFile(path, "utf8");
    await writeFile(path, original.replace("amount == 0", "amount < 1000000"));
    await expect(loadApprovedPack(root)).rejects.toThrow(
      "STALE_COMPILED_TEST_PACK",
    );
    await writeFile(path, original);
    await writeFile(
      join(dir, "fixtures/src/VerificationHarness.sol"),
      "// changed harness",
    );
    await expect(loadApprovedPack(root)).rejects.toThrow(
      "STALE_COMPILED_TEST_PACK",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
