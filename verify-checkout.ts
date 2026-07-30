/**
 * Verifies the checkout reports end to end, straight from the database and Stripe.
 * Run:  node --env-file=.env --import tsx verify-checkout.ts
 */
import Stripe from "stripe";
import { db } from "./server/db";
import { bookings, experiences, users, venueInvites, promotionDeals } from "./shared/schema";
import { eq, desc, sql } from "drizzle-orm";

const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(stripeKey);
const KEY_MODE = stripeKey.startsWith("sk_live") ? "LIVE" : "TEST";

console.log(`Stripe key in this .env: ${KEY_MODE} mode`);
console.log(
  KEY_MODE === "TEST"
    ? "NOTE: payments made on the deployed site with LIVE keys are invisible to this key.\n" +
      "      Run this on the server (or with live keys) to check real customer payments.\n"
    : "",
);

console.log("======== 1. BOOKINGS FOR RECENT PAYMENTS ========");
const rows = await db
  .select({
    id: bookings.id, status: bookings.status, amount: bookings.amount,
    pi: bookings.stripePaymentIntentId, created: bookings.createdAt,
    email: users.email, title: experiences.title,
  })
  .from(bookings)
  .leftJoin(users, eq(bookings.userId, users.id))
  .leftJoin(experiences, eq(bookings.experienceId, experiences.id))
  .orderBy(desc(bookings.createdAt))
  .limit(8);

for (const r of rows) {
  let stripeInfo = "no payment intent";
  if (r.pi && r.pi.startsWith("pi_")) {
    try {
      const pi = await stripe.paymentIntents.retrieve(r.pi);
      stripeInfo = `${pi.status} | ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()} | ${pi.livemode ? "LIVE MONEY" : "test mode"}`;
    } catch (e: any) {
      stripeInfo = /No such payment_intent/.test(e.message)
        ? `payment is in ${KEY_MODE === "TEST" ? "LIVE" : "TEST"} mode — not visible to this key`
        : "stripe: " + e.message.slice(0, 40);
    }
  }
  console.log(`  ${(r.email || "(no account)").padEnd(34)} | booking ${r.status?.padEnd(11)} | ${stripeInfo}`);
  console.log(`      event: ${(r.title || "").trim().slice(0, 46)}`);
}

console.log("\n======== 2. DUPLICATE BOOKINGS PER PAYMENT ========");
const dupes: any = await db.execute(sql.raw(`
  SELECT stripe_payment_intent_id AS pi, count(*) AS n FROM bookings
  WHERE stripe_payment_intent_id IS NOT NULL
  GROUP BY stripe_payment_intent_id HAVING count(*) > 1
`));
const dupeRows = dupes.rows ?? dupes;
console.log(dupeRows.length === 0 ? "  OK — every payment has exactly one booking" : `  PROBLEM — ${dupeRows.length} payment(s) still duplicated`);

const idx: any = await db.execute(sql.raw(
  "select indexname from pg_indexes where tablename='bookings' and indexname='bookings_stripe_payment_intent_unique'"
));
console.log((idx.rows ?? idx).length ? "  OK — database now blocks duplicates" : "  PROBLEM — unique index missing");

console.log("\n======== 3. STRANDED PAYMENTS (paid, no booking) ========");
let stranded = 0, checked = 0;
const since = Math.floor(Date.now() / 1000) - 72 * 3600;
for await (const pi of stripe.paymentIntents.list({ created: { gte: since }, limit: 100 })) {
  if (!["succeeded", "requires_capture"].includes(pi.status)) continue;
  if (!pi.metadata?.experienceId) continue;
  checked++;
  const [b] = await db.select().from(bookings).where(eq(bookings.stripePaymentIntentId, pi.id));
  if (!b) { stranded++; console.log(`  STRANDED: ${pi.id} — ${(pi.amount / 100).toFixed(2)} ${pi.currency}`); }
}
console.log(`  checked ${checked} ticket payment(s) from the last 72h — ${stranded} stranded`);

console.log("\n======== 4. INVITE LINKS HAVE A DESTINATION ========");
const vi = await db.select().from(venueInvites);
console.log(`  venue invites: ${vi.length}`);
for (const i of vi) console.log(`    ${i.email} -> /venue-invite/${i.token.slice(0, 10)}… (${i.status})`);
const pd = await db.select().from(promotionDeals).where(eq(promotionDeals.source, "external_direct"));
console.log(`  external partner deals: ${pd.length}`);
for (const d of pd) console.log(`    ${d.partnerEmail} -> ${d.inviteToken ? `/partner-invite/${d.inviteToken.slice(0, 10)}…` : "NO TOKEN"} (${d.status})`);

process.exit(0);
