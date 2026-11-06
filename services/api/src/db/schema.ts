import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
// SQL migration owns CHECK/uniqueness/locking semantics; these definitions expose typed reads.
export const documents = pgTable("documents", {
  id: uuid().primaryKey(),
  owner: text().notNull(),
  kind: text().notNull(),
  digest: text().notNull(),
  payload: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
export const runs = pgTable("runs", {
  id: uuid().primaryKey(),
  owner: text().notNull(),
  request: jsonb().notNull(),
  state: text().notNull(),
  attempts: integer().notNull(),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  artifact: jsonb(),
  errorCode: text("error_code"),
});
