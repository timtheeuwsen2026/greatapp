import { readFile } from "node:fs/promises";
import pg from "pg";
import { createPostgresConnectionConfig } from "./postgres-connection-config.mjs";

const { Client } = pg;
const migrationUrls = [
  new URL("../migrations/20260717_fulfillment_archive_deal_ledger.sql", import.meta.url),
  new URL("../migrations/20260718_production_email_delivery.sql", import.meta.url),
  new URL("../migrations/20260726_booking_ticket_quantity.sql", import.meta.url),
  new URL("../migrations/20260815_venue_stripe_connect_payouts.sql", import.meta.url),
  new URL("../migrations/20260821_creator_brand_kit.sql", import.meta.url),
  new URL("../migrations/20260823_review_replies.sql", import.meta.url),
];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured before running production support migrations");
}

const client = new Client(createPostgresConnectionConfig(process.env.DATABASE_URL));

let transactionStarted = false;
let lockAcquired = false;

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock($1, $2)", [20260718, 1]);
  lockAcquired = true;

  await client.query("BEGIN");
  transactionStarted = true;
  for (const migrationUrl of migrationUrls) {
    const migrationSql = await readFile(migrationUrl, "utf8");
    await client.query(migrationSql);
  }
  await client.query("COMMIT");
  transactionStarted = false;

  console.log(`[Database Migration] ${migrationUrls.length} production support migration(s) applied — schemas are ready`);
} catch (error) {
  if (transactionStarted) {
    await client.query("ROLLBACK").catch(() => undefined);
  }
  console.error("[Database Migration] Production support migrations failed", error);
  process.exitCode = 1;
} finally {
  if (lockAcquired) {
    await client
      .query("SELECT pg_advisory_unlock($1, $2)", [20260718, 1])
      .catch(() => undefined);
  }
  await client.end().catch(() => undefined);
}
