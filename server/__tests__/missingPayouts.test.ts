import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A paid event must never end without a payout.
 *
 * The payout row is only ever written at the moment money lands, and the
 * webhook's rebuild path — confirmation arriving before the booking existed —
 * rebuilt the booking and returned without scheduling anything. With no row,
 * the hourly run had nothing to find, and the creator would simply never have
 * been paid.
 *
 * And the other direction: a free event must not get a payout row at all. A
 * free RSVP is stored as `fully_paid` at €0, and a "€0.00 scheduled" line on
 * the organiser's Earnings tab reads exactly like being told they won't be paid.
 */

let candidateRows: any[] = [];
let queryShouldFail = false;
const upserts: Array<{ experienceId: string; scheduledFor: Date; grossCents: number }> = [];

// A chainable stand-in for drizzle: select().from().where() resolves to rows.
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (queryShouldFail) throw new Error("connection lost");
          return candidateRows;
        },
      }),
    }),
  },
}));

let paidBookingsOverride: any[] | null = null;

vi.mock("../storage", () => ({
  storage: {
    getPaidBookings: async () => paidBookingsOverride ?? [
      { status: "fully_paid", amount: "10.00", totalPrice: "10.00" },
      { status: "fully_paid", amount: "10.00", totalPrice: "10.00" },
    ],
    upsertScheduledPayout: async (experienceId: string, scheduledFor: Date, grossCents: number) => {
      upserts.push({ experienceId, scheduledFor, grossCents });
      return { id: "payout-1" };
    },
  },
}));
vi.mock("node-cron", () => ({ default: { schedule: () => {} } }));
vi.mock("../stripeClient", () => ({ stripe: {} }));
vi.mock("../notifications", () => ({ notificationService: {} }));
vi.mock("../venuePayouts", () => ({ resolveVenuePayoutAccount: async () => null }));

const { scheduleMissingPayouts } = await import("../payout-scheduler");

beforeEach(() => {
  paidBookingsOverride = null;
  candidateRows = [];
  queryShouldFail = false;
  upserts.length = 0;
});

describe("scheduleMissingPayouts", () => {
  it("schedules the payout an ended, paid event never got", async () => {
    const ended = new Date("2026-09-20T07:00:00Z");
    candidateRows = [{
      id: "paid-event",
      endDate: ended,
      requireMinimumParticipants: false,
      mvgEnabled: false,
      mvgStatus: "pending",
    }];

    expect(await scheduleMissingPayouts(new Date("2026-09-21T09:00:00Z"))).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].experienceId).toBe("paid-event");
    // Seven days after the event, like every other path.
    expect(upserts[0].scheduledFor.toISOString()).toBe("2026-09-27T07:00:00.000Z");
    // Two €10 tickets, counted from fully_paid — not the zero that counting
    // only `confirmed` bookings produced.
    expect(upserts[0].grossCents).toBe(2000);
  });

  it("leaves an MVG event alone until its minimum is met", async () => {
    candidateRows = [{
      id: "mvg-event",
      endDate: new Date("2026-09-10T07:00:00Z"),
      requireMinimumParticipants: true,
      mvgEnabled: true,
      mvgStatus: "pending",
    }];
    expect(await scheduleMissingPayouts(new Date("2026-09-21T09:00:00Z"))).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it("never schedules a payout for a free event", async () => {
    paidBookingsOverride = [
      { status: "fully_paid", amount: "0.00", totalPrice: "0.00" },
      { status: "fully_paid", amount: "0.00", totalPrice: "0.00" },
    ];
    candidateRows = [{
      id: "free-run",
      endDate: new Date("2026-09-20T07:00:00Z"),
      requireMinimumParticipants: false,
      mvgEnabled: false,
      mvgStatus: "pending",
    }];
    expect(await scheduleMissingPayouts(new Date("2026-09-21T09:00:00Z"))).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it("never throws out of the hourly run", async () => {
    queryShouldFail = true;
    await expect(scheduleMissingPayouts()).resolves.toBe(0);
  });
});

describe("the query and the wiring, as written", () => {
  const scheduler = readFileSync(join(process.cwd(), "server/payout-scheduler.ts"), "utf8");
  const webhook = readFileSync(join(process.cwd(), "server/stripe-webhook.ts"), "utf8");

  it("only considers events that went ahead, and never re-schedules one that has a payout", () => {
    // A cancelled event is refunded, not paid out; a failed payout is an
    // admin's to retry, not something to schedule a second time.
    expect(scheduler).toContain('PAYABLE_EVENT_STATUSES = ["approved", "published"]');
    expect(scheduler).toMatch(/NOT EXISTS \(SELECT 1 FROM \$\{scheduledPayouts\}/);
    // Money actually collected, not merely a paid-looking status.
    expect(scheduler).toContain("${bookings.amount} > 0 OR ${bookings.totalPrice} > 0");
  });

  it("checks for the gap before processing what is due, hourly and on boot", () => {
    const starts = scheduler.slice(scheduler.indexOf("export function startPayoutScheduler"));
    const block = starts.slice(0, starts.indexOf("console.log(\"[Payout Scheduler] Started"));
    expect(block.match(/await scheduleMissingPayouts\(\);\s*await processReadyPayouts\(\);/g))
      .toHaveLength(2);
  });

  it("schedules the payout when the webhook rebuilds a missing booking", () => {
    expect(webhook).toMatch(
      /await rebuildMissingBooking\(pi, "payment_intent\.succeeded"\);\s*await ensurePayoutScheduled\(pi\.metadata\?\.experienceId\);/,
    );
  });

  it("counts fully-paid tickets in the amount the creator is shown", () => {
    const start = webhook.indexOf("async function ensurePayoutScheduled");
    const body = webhook.slice(start, start + 1_500);
    expect(body).toContain("storage.getPaidBookings(experienceId)");
    expect(body).not.toContain("getConfirmedBookings");
  });
});

describe("an event is never paid twice", () => {
  const scheduler = readFileSync(join(process.cwd(), "server/payout-scheduler.ts"), "utf8");
  const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");

  // Good Soles × Bandido has two failed payout rows for one event, and
  // Stripe's duplicate protection is keyed per row — retrying both would
  // have transferred the money twice.
  it("checks for a sibling payout before moving any money", () => {
    const start = scheduler.indexOf("async function executeExperiencePayout");
    const body = scheduler.slice(start, start + 1_800);
    const guard = body.indexOf("getOtherActivePayoutForExperience");
    const processing = body.indexOf('{ status: "processing" }');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(processing);
  });

  it("refuses to re-queue a payout when the event already has one paid or queued", () => {
    const start = routes.indexOf("app.post('/api/admin/scheduled-payouts/:id/retry'");
    const body = routes.slice(start, start + 1_800);
    expect(body).toContain("getOtherActivePayoutForExperience(payout.experienceId, payout.id)");
    expect(body).toContain("would pay it twice");
  });
});
