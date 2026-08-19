/**
 * Stranded-payment sweeper.
 *
 * A payment is "stranded" when Stripe holds or has captured the buyer's money
 * but no booking row exists for the PaymentIntent. Two layers already guard
 * against this — the confirmation page rebuilds the booking when the buyer
 * returns, and the Stripe webhook rebuilds it server-side — but the webhook is
 * dead whenever STRIPE_WEBHOOK_SECRET is not configured, and the buyer may
 * simply never come back. This sweeper is the last layer: it lists recent
 * PaymentIntents straight from Stripe and rebuilds any booking that is missing.
 *
 * Safe to run repeatedly: the finalizer is idempotent (an existing booking for
 * the PaymentIntent is returned, not duplicated), and only intents stamped with
 * our own checkout metadata (experienceId + userId) are touched.
 */

import cron from "node-cron";
import { storage } from "./storage";
import { stripe } from "./stripeClient";
import { finalizeBookingFromPaymentIntent } from "./bookingFinalizer";

// How far back to look. Long enough to cover a weekend of nobody restarting
// anything; short enough that the sweep stays a handful of list pages.
const LOOKBACK_HOURS = 72;

// Intents in these states carry (or hold) money that must map to a booking.
const PAYABLE_STATUSES = new Set(["succeeded", "requires_capture", "processing"]);

let sweepInFlight = false;

export async function sweepStrandedPayments(): Promise<{ scanned: number; rebuilt: number; failed: number }> {
  const summary = { scanned: 0, rebuilt: 0, failed: 0 };
  if (sweepInFlight) return summary;
  sweepInFlight = true;

  try {
    const createdAfter = Math.floor(Date.now() / 1000) - LOOKBACK_HOURS * 3600;

    for await (const pi of stripe.paymentIntents.list({
      created: { gte: createdAfter },
      limit: 100,
    })) {
      summary.scanned += 1;

      if (!PAYABLE_STATUSES.has(pi.status)) continue;
      // Only intents our ticket checkout created. Venue sponsorships, rentals
      // and balance payments have their own reconciliation paths.
      if (!pi.metadata?.experienceId || !pi.metadata?.userId) continue;
      if (pi.metadata?.isBalancePayment === "true") continue;

      const existing = await storage.getBookingByPaymentIntent(pi.id);
      if (existing) continue;

      try {
        const result = await finalizeBookingFromPaymentIntent(pi.id);
        if (result.created) {
          summary.rebuilt += 1;
          console.log(`[Payment Reconciler] Rebuilt booking ${result.bookingId} for stranded PI ${pi.id}`);
        } else {
          summary.failed += 1;
          console.error(`[Payment Reconciler] Could not rebuild PI ${pi.id}: ${result.message}`);
        }
      } catch (error: any) {
        summary.failed += 1;
        console.error(`[Payment Reconciler] PI ${pi.id} threw:`, error?.message);
      }
    }

    if (summary.rebuilt > 0 || summary.failed > 0) {
      console.log(
        `[Payment Reconciler] Sweep done — scanned ${summary.scanned}, rebuilt ${summary.rebuilt}, failed ${summary.failed}`,
      );
    }
    return summary;
  } finally {
    sweepInFlight = false;
  }
}

export function startPaymentReconciler(): void {
  // Every 10 minutes, plus once shortly after boot so a restart immediately
  // heals anything stranded while the old process was running.
  cron.schedule("*/10 * * * *", () => {
    sweepStrandedPayments().catch((error) =>
      console.error("[Payment Reconciler] Sweep failed:", error?.message),
    );
  });

  setTimeout(() => {
    sweepStrandedPayments().catch((error) =>
      console.error("[Payment Reconciler] Startup sweep failed:", error?.message),
    );
  }, 15_000);

  console.log("[Payment Reconciler] Started — sweeping for stranded payments every 10 minutes");
}
