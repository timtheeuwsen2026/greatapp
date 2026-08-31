import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// The claim predicate is pure SQL construction, so it can be rendered and read
// without a database. The mailer is not imported here at all.
const { buildReclaimCondition } = await import("../emailDeliveryLedger");

function render(): string {
  return new PgDialect().sqlToQuery(buildReclaimCondition("event_review_request:E1:B1", new Date(0))!).sql;
}

/**
 * The bug this guards against sent an organiser the same "How was it?" email
 * every hour for two days, and billed the provider for every one.
 *
 * The failed-or-stale test was a raw sql`` fragment, and drizzle splices those
 * into and() without parentheses. `and` binds tighter than `or`, so Postgres
 * read the predicate as (event_key … and status = 'failed') OR last_attempt_at
 * < …, and the second branch carries no key and no status. It matched every
 * stale row in the table, so the claim was always granted and the ledger never
 * deduplicated anything.
 */
describe("buildReclaimCondition", () => {
  it("keeps the failed-or-stale branch parenthesised", () => {
    const sql = render();
    const orAt = sql.indexOf(" or ");
    expect(orAt, "predicate should contain an or branch").toBeGreaterThan(-1);

    // Depth at the or: one paren for the outer and(), one for the or() itself.
    const before = sql.slice(0, orAt);
    const depth = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
    expect(depth, `or is not grouped in: ${sql}`).toBeGreaterThanOrEqual(2);
  });

  it("never lets staleness alone select a row", () => {
    // Every branch of the predicate has to sit behind the event key. If the or
    // escapes its group, last_attempt_at becomes a standalone match.
    const sql = render();
    expect(sql).not.toMatch(/\bor\s+"email_notification_events"\."last_attempt_at"[^)]*$/);
  });

  it("still requires the key, the claimable statuses and the attempt cap", () => {
    const sql = render();
    expect(sql).toContain('"email_notification_events"."event_key"');
    expect(sql).toContain('"email_notification_events"."status" in');
    expect(sql).toContain('"email_notification_events"."attempts" <');
  });
});
