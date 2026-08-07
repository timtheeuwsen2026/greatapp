/**
 * End-to-end check of Venue Flash Deals against the real database and the
 * running app.
 *
 *   npm run dev                                              # in one terminal
 *   node --env-file=.env --import tsx scripts/verify-flash-deals.ts
 *
 * Posts three deals against the first approved venue — one live, one in the
 * past, one withdrawn — checks that only the live one reaches a creator's
 * feed, that no pricing field rides along, and that claiming needs a signed-in
 * creator. Everything it inserts is deleted before it exits.
 *
 * Every line should read PASS. A FAIL names the behaviour that broke.
 */
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { venues, venueFlashDeals, venueFlashDealInputSchema } from "../shared/schema";

const APP_URL = process.env.VERIFY_APP_URL || "http://localhost:4000";

let passed = 0;
let failed = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  if (pass) passed++; else failed++;
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const day = (offset: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};

async function main() {
  const [venue] = await db.select().from(venues).where(eq(venues.approved, true)).limit(1);
  if (!venue) throw new Error("No approved venue to test against.");
  console.log(`\nVenue under test: ${venue.name}\n`);

  const created: string[] = [];
  const post = async (values: Partial<typeof venueFlashDeals.$inferInsert>) => {
    const [row] = await db.insert(venueFlashDeals).values({
      venueId: venue.id,
      createdBy: venue.createdBy!,
      startDate: day(14),
      endDate: day(19),
      headline: "Verification row — safe to ignore",
      description: "Written by scripts/verify-flash-deals.ts and deleted when it finishes.",
      ...values,
    } as any).returning();
    created.push(row.id);
    return row;
  };

  try {
    console.log("FEED — what a creator sees");
    const before = await fetch(`${APP_URL}/api/venue-flash-deals`).then((res) => res.json());
    ok("feed endpoint responds with a list", Array.isArray(before), `${before.length} existing deal(s)`);

    const live = await post({ headline: "Verification — late cancellation, property free" });
    const past = await post({ startDate: day(-30), endDate: day(-20), headline: "Verification — dates already gone" });
    const withdrawn = await post({ status: "withdrawn", headline: "Verification — pulled by the venue" });

    const feed = await fetch(`${APP_URL}/api/venue-flash-deals`).then((res) => res.json());
    const ids = feed.map((deal: any) => deal.id);
    ok("a live deal reaches the feed", ids.includes(live.id));
    ok("a deal whose dates have passed is filtered out", !ids.includes(past.id));
    ok("a withdrawn deal is filtered out", !ids.includes(withdrawn.id));

    const card = feed.find((deal: any) => deal.id === live.id);
    ok("the card carries its venue", card?.venue?.id === venue.id, card?.venue?.name);
    ok("the card carries the dates the builder will prefill",
      !!card?.startDate && !!card?.endDate,
      `${String(card?.startDate).slice(0, 10)} → ${String(card?.endDate).slice(0, 10)}`);

    console.log("\nNO PRICING — a flash deal is a lead, not an offer");
    const priceKeys = Object.keys(card || {}).filter((key) =>
      /price|discount|percent|rate|amount|fee/i.test(key));
    ok("no discount, percentage or price field on a deal", priceKeys.length === 0, priceKeys.join(", "));

    console.log("\nCLAIM — opens a builder, reserves nothing");
    const anonClaim = await fetch(`${APP_URL}/api/venue-flash-deals/${live.id}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    ok("claiming requires a signed-in creator",
      anonClaim.status === 401 || anonClaim.status === 403, `status ${anonClaim.status}`);
    const [afterAnon] = await db.select().from(venueFlashDeals).where(eq(venueFlashDeals.id, live.id));
    ok("a refused claim does not count", afterAnon.claimCount === 0, `count ${afterAnon.claimCount}`);

    console.log("\nVALIDATION");
    ok("backwards dates are refused", !venueFlashDealInputSchema.safeParse({
      venueId: venue.id,
      startDate: day(20),
      endDate: day(10),
      headline: "Backwards dates should be refused",
      description: "The end date is before the start date, which cannot be hosted.",
    }).success);
    ok("a one-word headline is refused", !venueFlashDealInputSchema.safeParse({
      venueId: venue.id, startDate: day(10), endDate: day(14),
      headline: "Free!", description: "A description long enough to be accepted on its own.",
    }).success);

    console.log("\nWITHDRAW");
    await db.update(venueFlashDeals).set({ status: "withdrawn" }).where(eq(venueFlashDeals.id, live.id));
    const after = await fetch(`${APP_URL}/api/venue-flash-deals`).then((res) => res.json());
    ok("withdrawing pulls it from the feed",
      !after.map((deal: any) => deal.id).includes(live.id));
    const [kept] = await db.select().from(venueFlashDeals).where(eq(venueFlashDeals.id, live.id));
    ok("a withdrawn deal is kept, not deleted", kept?.status === "withdrawn");
  } finally {
    for (const id of created) {
      await db.delete(venueFlashDeals).where(eq(venueFlashDeals.id, id));
    }
    console.log(`\n${passed} passed, ${failed} failed. ${created.length} test deal(s) cleaned up.\n`);
  }
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((error) => {
    console.error("\nVerification could not run:", error?.message || error);
    console.error("Is the dev server running on", APP_URL, "?\n");
    process.exit(1);
  });
