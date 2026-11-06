import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../src/db/migrate.ts";
export const postgresImage =
  "postgres@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac";
export async function startDatabase() {
  const name = `patchbond-db-${randomUUID()}`,
    password = randomBytes(24).toString("hex");
  const docker = (args: string[]) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-p",
    "127.0.0.1::5432",
    postgresImage,
  ]);
  let pool: Pool | undefined;
  try {
    const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
    const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 1000,
    });
    for (let attempt = 0; ; attempt++) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch {
        if (attempt >= 60) throw new Error("Postgres startup failed");
        await delay(200);
      }
    }
    await migrate(pool);
    const active = pool;
    return {
      pool: active,
      connectionString,
      stop: async () => {
        await active.end();
        docker(["rm", "-f", name]);
      },
    };
  } catch (error) {
    await pool?.end();
    docker(["rm", "-f", name]);
    throw error;
  }
}
