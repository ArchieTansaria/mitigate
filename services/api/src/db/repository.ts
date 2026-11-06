import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { canonicalHash } from "../../../../packages/schema/src/encoding.ts";
import {
  type ArtifactRef,
  ArtifactRefSchema,
  type ArtifactStore,
} from "../artifacts/store.ts";
import { documents } from "./schema.ts";
export type DocumentKind = "inventory" | "manifest" | "scope";
export type Document = { id: string; digest: string; payload: unknown };
export type Job = {
  id: string;
  owner: string;
  request: Record<string, unknown>;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  leaseToken: string | null;
  artifact: ArtifactRef | null;
  errorCode: string | null;
};
function job(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    owner: String(row.owner),
    request: row.request as Job["request"],
    state: row.state as Job["state"],
    attempts: Number(row.attempts),
    leaseToken: row.lease_token as string | null,
    artifact: row.artifact as ArtifactRef | null,
    errorCode: row.error_code as string | null,
  };
}
export class Repository {
  constructor(readonly pool: Pool) {}
  async transaction<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async putDocument(
    owner: string,
    kind: DocumentKind,
    payload: unknown,
  ): Promise<Document> {
    const digest = canonicalHash(payload);
    const r = await this.pool.query(
      "INSERT INTO documents(id,owner,kind,digest,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,kind,digest) DO UPDATE SET digest=EXCLUDED.digest RETURNING id,digest,payload",
      [randomUUID(), owner, kind, digest, JSON.stringify(payload)],
    );
    return r.rows[0];
  }
  async getDocument(
    owner: string,
    id: string,
    kind: DocumentKind,
  ): Promise<Document | null> {
    const rows = await drizzle(this.pool)
      .select({
        id: documents.id,
        digest: documents.digest,
        payload: documents.payload,
      })
      .from(documents)
      .where(
        and(
          eq(documents.owner, owner),
          eq(documents.id, id),
          eq(documents.kind, kind),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
  async getDocumentByDigest(
    owner: string,
    digest: string,
    kind: DocumentKind,
  ): Promise<Document | null> {
    const r = await this.pool.query(
      "SELECT id,digest,payload FROM documents WHERE owner=$1 AND digest=$2 AND kind=$3",
      [owner, digest, kind],
    );
    return r.rows[0] ?? null;
  }
  async enqueue(
    owner: string,
    key: string,
    request: Record<string, unknown>,
    quota: number,
    maxAttempts: number,
  ): Promise<Job> {
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(key) ||
      !Number.isInteger(quota) ||
      quota < 1 ||
      quota > 100 ||
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > 10
    )
      throw new Error("INVALID_INPUT");
    const digest = canonicalHash(request);
    return this.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      const prior = await c.query(
        "SELECT * FROM runs WHERE owner=$1 AND idempotency_key=$2",
        [owner, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_digest !== digest)
          throw new Error("CONFLICT");
        return job(prior.rows[0]);
      }
      const active = await c.query(
        "SELECT count(*) FROM runs WHERE owner=$1 AND state IN ('queued','running')",
        [owner],
      );
      if (Number(active.rows[0].count) >= quota)
        throw new Error("RATE_LIMITED");
      const r = await c.query(
        "INSERT INTO runs(id,owner,idempotency_key,request_digest,request,max_attempts) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          owner,
          key,
          digest,
          JSON.stringify(request),
          maxAttempts,
        ],
      );
      return job(r.rows[0]);
    });
  }
  async claim(seconds: number): Promise<Job | null> {
    this.leaseLimit(seconds);
    return this.transaction(async (c) => {
      await c.query(
        "UPDATE runs SET state='failed',error_code='RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE state='running' AND lease_until<=clock_timestamp() AND attempts>=max_attempts",
      );
      const r = await c.query(
        `WITH candidate AS (SELECT id FROM runs WHERE (state='queued' OR (state='running' AND lease_until<=clock_timestamp())) AND attempts<max_attempts ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE runs r SET state='running',attempts=attempts+1,lease_token=$1,lease_until=clock_timestamp()+$2*interval '1 second',updated_at=clock_timestamp() FROM candidate WHERE r.id=candidate.id RETURNING r.*`,
        [randomUUID(), seconds],
      );
      return r.rows[0] ? job(r.rows[0]) : null;
    });
  }
  private leaseLimit(seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600)
      throw new Error("INVALID_LEASE");
  }
  async renew(id: string, token: string, seconds: number) {
    this.leaseLimit(seconds);
    const r = await this.pool.query(
      "UPDATE runs SET lease_until=clock_timestamp()+$3*interval '1 second',updated_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp()",
      [id, token, seconds],
    );
    return r.rowCount === 1;
  }
  async finish(
    id: string,
    token: string,
    ref: ArtifactRef,
    store: ArtifactStore,
  ) {
    const parsed = ArtifactRefSchema.parse(ref);
    const bytes = await store.get(parsed.digest);
    if (bytes.length !== parsed.byteLength)
      throw new Error("ARTIFACT_SIZE_MISMATCH");
    const r = await this.pool.query(
      "UPDATE runs SET state='succeeded',error_code=NULL,artifact=$3,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp()",
      [id, token, JSON.stringify(parsed)],
    );
    if (r.rowCount !== 1) throw new Error("LEASE_LOST");
  }
  async fail(id: string, token: string) {
    const r = await this.pool.query(
      "UPDATE runs SET state=CASE WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END,error_code='WORKER_FAILURE',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp()",
      [id, token],
    );
    if (r.rowCount !== 1) throw new Error("LEASE_LOST");
  }
  async cancel(owner: string, id: string) {
    const r = await this.pool.query(
      "UPDATE runs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND owner=$2 AND state IN ('queued','running')",
      [id, owner],
    );
    return r.rowCount === 1;
  }
  async getRun(owner: string, id: string): Promise<Job | null> {
    const r = await this.pool.query(
      "SELECT * FROM runs WHERE id=$1 AND owner=$2",
      [id, owner],
    );
    return r.rows[0] ? job(r.rows[0]) : null;
  }
  async publishEvidence(owner: string, id: string) {
    const r = await this.pool.query(
      "UPDATE runs SET public_evidence=true WHERE owner=$1 AND id=$2 AND state='succeeded' AND request->>'purpose'='diagnostic'",
      [owner, id],
    );
    return r.rowCount === 1;
  }
  async getPublicEvidence(id: string): Promise<ArtifactRef | null> {
    const r = await this.pool.query(
      "SELECT artifact FROM runs WHERE id=$1 AND public_evidence=true AND state='succeeded' AND request->>'purpose'='diagnostic'",
      [id],
    );
    return r.rows[0]?.artifact ?? null;
  }
  async pruneExpired(limit = 1000) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("INVALID_PRUNE_LIMIT");
    await this.transaction(async (c) => {
      await c.query(
        "WITH old AS (SELECT id FROM auth_challenges WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM auth_challenges t USING old WHERE t.id=old.id",
        [limit],
      );
      await c.query(
        "WITH old AS (SELECT digest FROM sessions WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM sessions t USING old WHERE t.digest=old.digest",
        [limit],
      );
      await c.query(
        "WITH old AS (SELECT bucket,minute FROM rate_limits WHERE minute<floor(extract(epoch from clock_timestamp())/60)::bigint-1 ORDER BY minute LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM rate_limits t USING old WHERE t.bucket=old.bucket AND t.minute=old.minute",
        [limit],
      );
    });
  }
  async rateLimit(bucket: string, limit: number) {
    const r = await this.pool.query(
      "INSERT INTO rate_limits(bucket,minute,count) VALUES($1,floor(extract(epoch from clock_timestamp())/60)::bigint,1) ON CONFLICT(bucket,minute) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
      [bucket],
    );
    return Number(r.rows[0].count) <= limit;
  }
}
