import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { FileArtifactStore } from "../../api/src/artifacts/store.ts";
import { Repository } from "../../api/src/db/repository.ts";
import { startDatabase } from "../../api/test/database.ts";
import { consumeNext } from "../src/consume-job.ts";

let db: Awaited<ReturnType<typeof startDatabase>>,
  repo: Repository,
  store: FileArtifactStore,
  dir: string;
beforeAll(async () => {
  db = await startDatabase();
  repo = new Repository(db.pool);
  dir = await mkdtemp(join(tmpdir(), "pb-consumer-"));
  store = new FileArtifactStore(dir, 1048576);
});
afterAll(async () => {
  await db?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("claims, renews and publishes only with the current lease", async () => {
  const job = await repo.enqueue(
    "owner",
    "lease-renew",
    { purpose: "diagnostic" },
    10,
    2,
  );
  const result = await consumeNext({
    repo,
    store,
    leaseSeconds: 1,
    maxRunMs: 5000,
    execute: async () => {
      await delay(1500);
      return Buffer.from('{"test":"lease-only"}');
    },
  });
  expect(result.status).toBe("succeeded");
  expect((await repo.getRun("owner", job.id))?.state).toBe("succeeded");
});
test("cancellation fences late worker evidence", async () => {
  const job = await repo.enqueue(
    "owner",
    "cancel",
    { purpose: "diagnostic" },
    10,
    1,
  );
  const result = await consumeNext({
    repo,
    store,
    leaseSeconds: 1,
    maxRunMs: 5000,
    execute: async () => {
      await repo.cancel("owner", job.id);
      return Buffer.from("{}");
    },
  });
  expect(result.status).toBe("lease-lost");
  expect((await repo.getRun("owner", job.id))?.artifact).toBeNull();
});
test("bounded execution stops lease renewal and cannot finish after timeout", async () => {
  const job = await repo.enqueue(
    "owner",
    "deadline",
    { purpose: "diagnostic" },
    10,
    1,
  );
  const result = await consumeNext({
    repo,
    store,
    leaseSeconds: 1,
    maxRunMs: 100,
    execute: async () => {
      await delay(400);
      return Buffer.from("{}");
    },
  });
  expect(result.status).toBe("failed");
  await delay(500);
  expect((await repo.getRun("owner", job.id))?.state).toBe("failed");
});

test("deadline during final artifact readback cannot commit success", async () => {
  const job = await repo.enqueue(
    "owner",
    "readback-deadline",
    { purpose: "diagnostic" },
    10,
    1,
  );
  const slowRead = {
    put: (bytes: Uint8Array) => store.put(bytes),
    get: async (digest: string) => {
      await delay(200);
      return store.get(digest);
    },
  };
  const result = await consumeNext({
    repo,
    store: slowRead,
    leaseSeconds: 1,
    maxRunMs: 100,
    execute: async () => Buffer.from('{"test":"readback-deadline"}'),
  });
  expect(result.status).toBe("failed");
  expect((await repo.getRun("owner", job.id))?.state).toBe("failed");
});

test("database completion fence rejects an expired absolute deadline even without an aborted signal", async () => {
  const job = await repo.enqueue(
      "owner",
      "db-deadline",
      { purpose: "diagnostic" },
      10,
      1,
    ),
    claimed = await repo.claim(5);
  if (!claimed?.leaseToken) throw new Error("missing claim");
  const ref = await store.put(Buffer.from("{}"));
  await expect(
    repo.finish(job.id, claimed.leaseToken, ref, store, {
      deadline: new Date(0),
    }),
  ).rejects.toThrow("LEASE_LOST");
  expect((await repo.getRun("owner", job.id))?.state).toBe("running");
  await repo.fail(job.id, claimed.leaseToken);
});
