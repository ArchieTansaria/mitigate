import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { loadRepairCompatibility } from "../src/actions/repair.ts";

test("upgrade compatibility rejects missing layout, changed storage and stale source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pb-repair-metadata-"));
  try {
    // Copy only the two implementation artifacts and compiler-listed dependencies.
    for (const name of ["OracleAdapterV1", "OracleAdapterV2"]) {
      const file = `fixtures/out/${name}.sol/${name}.json`;
      await cp(file, join(dir, file), { recursive: true });
      const artifact = JSON.parse(await readFile(file, "utf8"));
      for (const path of Object.keys(artifact.metadata.sources))
        await cp(`fixtures/${path}`, join(dir, `fixtures/${path}`), {
          recursive: true,
        });
    }
    const root = pathToFileURL(`${dir}/`),
      path = join(dir, "fixtures/out/OracleAdapterV2.sol/OracleAdapterV2.json");
    await expect(loadRepairCompatibility(root)).resolves.toMatchObject({
      kind: "exact-reviewed-family-layout",
    });
    const text = await readFile(path, "utf8"),
      artifact = JSON.parse(text);
    delete artifact.storageLayout;
    await writeFile(path, JSON.stringify(artifact));
    await expect(loadRepairCompatibility(root)).rejects.toThrow(
      "UPGRADE_METADATA_UNAVAILABLE",
    );
    const changed = JSON.parse(text);
    changed.storageLayout.storage[0].slot = "99";
    await writeFile(path, JSON.stringify(changed));
    await expect(loadRepairCompatibility(root)).rejects.toThrow(
      "INCOMPATIBLE_STORAGE_LAYOUT",
    );
    await writeFile(path, text);
    await writeFile(
      join(dir, "fixtures/src/OracleAdapterV2.sol"),
      "// stale source",
    );
    await expect(loadRepairCompatibility(root)).rejects.toThrow(
      "STALE_UPGRADE_METADATA",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
