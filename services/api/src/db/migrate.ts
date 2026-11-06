import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
export async function migrate(pool: Pool) {
  const sql = await readFile(
    new URL("../../migrations/001_core.sql", import.meta.url),
    "utf8",
  );
  const hash = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(78423615)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS patchbond_migrations (version integer PRIMARY KEY,digest text NOT NULL)",
    );
    const prior = await client.query(
      "SELECT digest FROM patchbond_migrations WHERE version=1",
    );
    if (prior.rows[0] && prior.rows[0].digest !== hash)
      throw new Error("MIGRATION_CHECKSUM_MISMATCH");
    if (!prior.rowCount) {
      await client.query(sql);
      await client.query("INSERT INTO patchbond_migrations VALUES(1,$1)", [
        hash,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
