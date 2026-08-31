/**
 * Settles the email jobs left mid-flight by the ledger claim bug.
 *
 * claimImmediateEmailEvent matched every row in the table last attempted over
 * fifteen minutes ago, so for six weeks it rewrote status, recipient, payload
 * and attempts across the whole ledger on every single send. What that leaves
 * behind is rows sitting in 'sending' — or bounced back to 'scheduled' by
 * recoverStaleEmailJobs — whose payload is some other email entirely. The
 * per-minute job scheduler will deliver those payloads once the claim is fixed
 * unless they are settled first.
 *
 * Rows still under the attempt cap are the ones that would actually send, so
 * they are the point of this. Rows over it are already inert; they are settled
 * too, so the table stops reading as a queue full of work.
 *
 * Deliberately untouched: 'scheduled' rows with last_attempt_at IS NULL. Those
 * were never claimed, so the bug never reached their payload — they are real
 * queued email and must still go out. 'sent' rows are left alone as well; their
 * attempts and recipient are wrong but nothing reads them to decide a send.
 *
 * Run with --apply to write. Without it this only reports.
 */
import pg from "pg";
import { createPostgresConnectionConfig } from "./postgres-connection-config.mjs";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be configured before settling the email ledger");
}

const apply = process.argv.includes("--apply");
const AT_RISK = `
  status = 'sending'
  OR (status = 'scheduled' AND last_attempt_at IS NOT NULL)
`;

const client = new Client(createPostgresConnectionConfig(process.env.DATABASE_URL));
await client.connect();

try {
  const { rows: summary } = await client.query(`
    SELECT email_type,
           status,
           count(*)::int AS rows,
           max(attempts)::int AS worst_attempts,
           count(*) FILTER (WHERE attempts < 5)::int AS would_still_send
      FROM email_notification_events
     WHERE ${AT_RISK}
     GROUP BY email_type, status
     ORDER BY would_still_send DESC, rows DESC
  `);

  if (!summary.length) {
    console.log("Nothing in flight — the ledger is already settled.");
  } else {
    console.table(summary);
    const stillSending = summary.reduce((n, row) => n + row.would_still_send, 0);
    console.log(`${stillSending} row(s) would deliver a clobbered payload on the next tick.`);
  }

  if (!apply) {
    console.log("\nReport only. Re-run with --apply to settle these rows.");
  } else {
    const { rowCount } = await client.query(`
      UPDATE email_notification_events
         SET status = 'failed',
             error_message = 'Settled: in flight during the ledger claim defect',
             updated_at = now()
       WHERE ${AT_RISK}
    `);
    console.log(`\nSettled ${rowCount} row(s).`);
  }
} finally {
  await client.end();
}
