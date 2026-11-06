import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileArtifactStore } from "../src/artifacts/store.ts";
import { Repository } from "../src/db/repository.ts";
import { must } from "./assert.ts";
import { startDatabase } from "./database.ts";

let db: Awaited<ReturnType<typeof startDatabase>>,
  repo: Repository,
  dir: string,
  artifacts: FileArtifactStore;
beforeAll(async () => {
  db = await startDatabase();
  repo = new Repository(db.pool);
  dir = await mkdtemp(join(tmpdir(), "pb-artifacts-"));
  artifacts = new FileArtifactStore(dir, 1024);
});
afterAll(async () => {
  await db?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
const request = { schemaVersion: 1, purpose: "diagnostic", mode: "deployed" };
describe("PostgreSQL durable queue and evidence", () => {
  it("stores tenant-scoped immutable documents", async () => {
    const d = await repo.putDocument("alice", "manifest", { value: 1 });
    expect(await repo.getDocument("bob", d.id, "manifest")).toBeNull();
    expect((await repo.getDocument("alice", d.id, "manifest"))?.digest).toBe(
      d.digest,
    );
    expect(await repo.putDocument("alice", "manifest", { value: 1 })).toEqual(
      d,
    );
  });
  it("serializes duplicate enqueue and rejects same key with changed payload", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.enqueue("alice", "retry-key", request, 2, 3),
      ),
    );
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    await expect(
      repo.enqueue("alice", "retry-key", { ...request, mode: "preview" }, 2, 3),
    ).rejects.toThrow("CONFLICT");
  });
  it("one worker owns a job; stale worker cannot finish after lease recovery", async () => {
    const jobs = await Promise.all([repo.claim(10), repo.claim(10)]);
    const first = must(jobs.find(Boolean));
    expect(jobs.filter(Boolean)).toHaveLength(1);
    await db.pool.query(
      "UPDATE runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [first.id],
    );
    const second = must(await repo.claim(10));
    expect(second.id).toBe(first.id);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    const ref = await artifacts.put(
      Buffer.from(JSON.stringify({ runId: first.id })),
    );
    await expect(
      repo.finish(first.id, must(first.leaseToken), ref, artifacts),
    ).rejects.toThrow("LEASE_LOST");
    await repo.finish(second.id, must(second.leaseToken), ref, artifacts);
    expect((await repo.getRun("alice", first.id))?.state).toBe("succeeded");
    expect(await repo.getRun("bob", first.id)).toBeNull();
  });
  it("does not mark completion when publication is missing or tampered", async () => {
    const job = await repo.enqueue("carol", "artifact", request, 2, 3);
    const lease = must(await repo.claim(10));
    const ref = await artifacts.put(Buffer.from("{}"));
    await writeFile(join(dir, ref.digest.slice(2)), "tampered");
    await expect(
      repo.finish(job.id, must(lease.leaseToken), ref, artifacts),
    ).rejects.toThrow("ARTIFACT");
    expect((await repo.getRun("carol", job.id))?.state).toBe("running");
    await repo.cancel("carol", job.id);
  });
  it("bounds retries, fences renewal and releases quota on terminal jobs", async () => {
    const job = await repo.enqueue("dave", "retry", request, 1, 1);
    await expect(repo.enqueue("dave", "other", request, 1, 1)).rejects.toThrow(
      "RATE_LIMITED",
    );
    const lease = must(await repo.claim(1));
    await db.pool.query(
      "UPDATE runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [lease.id],
    );
    expect(await repo.renew(lease.id, must(lease.leaseToken), 10)).toBe(false);
    expect(await repo.claim(10)).toBeNull();
    expect((await repo.getRun("dave", job.id))?.state).toBe("failed");
    expect((await repo.enqueue("dave", "other", request, 1, 1)).state).toBe(
      "queued",
    );
  });
  it("rejects oversized evidence and unknown artifact digests", async () => {
    await expect(artifacts.put(Buffer.alloc(1025))).rejects.toThrow("ARTIFACT");
    await expect(artifacts.get(`0x${"00".repeat(32)}`)).rejects.toThrow(
      "ARTIFACT",
    );
  });
  it("clears the current error after a successful retry", async () => {
    await db.pool.query(
      "UPDATE runs SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE state IN ('queued','running')",
    );
    const r = await repo.enqueue("retry-owner", "fixed", request, 2, 3),
      first = must(await repo.claim(10));
    await repo.fail(first.id, must(first.leaseToken));
    const second = must(await repo.claim(10));
    await repo.finish(
      second.id,
      must(second.leaseToken),
      await artifacts.put(Buffer.from('{"retry":"fixed"}')),
      artifacts,
    );
    expect(await repo.getRun("retry-owner", r.id)).toMatchObject({
      state: "succeeded",
      errorCode: null,
    });
  });
  it("prunes expired transient rows in bounded batches while retaining live sessions", async () => {
    await db.pool.query(
      "INSERT INTO sessions VALUES('expired1','alice',clock_timestamp()-interval '1 second'),('expired2','alice',clock_timestamp()-interval '1 second'),('live','alice',clock_timestamp()+interval '1 hour')",
    );
    await db.pool.query("INSERT INTO rate_limits VALUES('old',0,1)");
    await repo.pruneExpired(1);
    expect(
      (
        await db.pool.query(
          "SELECT * FROM sessions WHERE digest LIKE 'expired%'",
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await db.pool.query("SELECT * FROM sessions WHERE digest='live'"))
        .rowCount,
    ).toBe(1);
    expect(
      (await db.pool.query("SELECT * FROM rate_limits WHERE bucket='old'"))
        .rowCount,
    ).toBe(0);
  });
});
