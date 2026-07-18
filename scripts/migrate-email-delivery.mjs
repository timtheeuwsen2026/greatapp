import { readFile } from "node:fs/promises";
import pg from "pg";
import { createPostgresConnectionConfig } from "./postgres-connection-config.mjs";

const { Client } = pg;
const migrationUrl = new URL(
  "../migrations/20260718_production_email_delivery.sql",
  import.meta.url,
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured before running email migrations");
}

const client = new Client(createPostgresConnectionConfig(process.env.DATABASE_URL));

let transactionStarted = false;
let lockAcquired = false;

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1, $2)", [20260718, 1]);
  lockAcquired = true;

  const migrationSql = await readFile(migrationUrl, "utf8");
  await client.query("BEGIN");
  transactionStarted = true;
  await client.query(migrationSql);
  await client.query("COMMIT");
  transactionStarted = false;

  console.log("[Database Migration] Email delivery schema is ready");
} catch (error) {
  if (transactionStarted) {
    await client.query("ROLLBACK").catch(() => undefined);
  }
  console.error("[Database Migration] Email delivery migration failed", error);
  process.exitCode = 1;
} finally {
  if (lockAcquired) {
    await client
      .query("SELECT pg_advisory_unlock($1, $2)", [20260718, 1])
      .catch(() => undefined);
  }
  await client.end().catch(() => undefined);
}
