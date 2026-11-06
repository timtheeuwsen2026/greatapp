/**
 * The Great vs Stripe check.
 *
 * Reads every booking with a Stripe payment in the look-back window, asks
 * Stripe what really happened to that payment, and applies the decision from
 * paymentReconciliation.ts: collect a hold the event is owed, release one left
 * on a cancelled booking, and bring the booking's status in line with Stripe.
 * Every difference is written to `payment_differences` for the admin list,
 * the ones fixed here already marked resolved.
 *
 * It only runs with the live key. With a test key the live bookings would all
 * look like test payments, and their holds belong to the live account anyway.
 */

import type Stripe from "stripe";
import { and, eq, gte, inArray, isNotNull, isNull, lt, not, sql } from "drizzle-orm";
import { db } from "./db";
import { bookings, experiences, paymentDifferences } from "@shared/schema";
import { stripe as defaultStripe, stripeKeyMode, stripeSecretKey } from "./stripeClient";
import { storage } from "./storage";
import { ensurePayoutScheduled } from "./stripe-webhook";
import {
  decidePaymentReconciliation,
  type ReconAction,
  type ReconDecision,
  type ReconIntent,
  intentForReconciliation,
} from "./paymentReconciliation";

export type PaymentCheckSummary = {
  ran: boolean;
  reason?: string;
  checked: number;
  fixed: number;
  open: number;
  resolved: number;
  failed: number;
};

type CheckBooking = {
  id: string;
  status: string | null;
  cancelledAt: Date | null;
  amount: string | null;
  testPayment: boolean | null;
  stripePaymentIntentId: string;
  experienceId: string;
  commissionStatus: string | null;
  requireMinimumParticipants: boolean | null;
  mvgStatus: string | null;
  currency: string | null;
};

let checkInFlight = false;


function isMissing(error: any): boolean {
  return error?.code === "resource_missing" || error?.statusCode === 404;
}

/** Apply one decision. Returns true when Great (or Stripe) was changed. */
async function applyDecision(
  action: ReconAction,
  booking: CheckBooking,
  stripe: Stripe,
): Promise<boolean> {
  switch (action) {
    case "capture": {
      await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
      const captured = await storage.markDepositAsCaptured(booking.id);
      if (!captured) {
        console.error(
          `[CRITICAL] [Payment Check] Captured ${booking.stripePaymentIntentId} for booking ${booking.id}, which was cancelled meanwhile - check whether it needs refunding`,
        );
      }
      await ensurePayoutScheduled(booking.experienceId);
      return true;
    }
    case "release":
      await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
      return true;
    case "mark_paid": {
      const paidStatus = booking.requireMinimumParticipants ? "confirmed" : "fully_paid";
      const updated = await db
        .update(bookings)
        .set({ status: paidStatus as any })
        .where(and(
          eq(bookings.id, booking.id),
          inArray(bookings.status, ["pending", "deposit_authorized"] as any),
          isNull(bookings.cancelledAt),
        ))
        .returning({ id: bookings.id });
      if (updated.length) await ensurePayoutScheduled(booking.experienceId);
      return updated.length > 0;
    }
    case "mark_refunded": {
      const updated = await db
        .update(bookings)
        .set({
          status: "refunded" as any,
          // A refunded ticket earns nobody a commission. One already paid out
          // stays as it is; the differences list shows it for a person.
          commissionStatus: sql`CASE WHEN ${bookings.commissionStatus} IN ('estimated', 'locked') THEN 'voided'::commission_status ELSE ${bookings.commissionStatus} END`,
        })
        .where(and(eq(bookings.id, booking.id), not(inArray(bookings.status, ["refunded", "cancelled"] as any))))
        .returning({ id: bookings.id });
      if (updated.length) await ensurePayoutScheduled(booking.experienceId);
      return updated.length > 0;
    }
    case "mark_failed": {
      const updated = await db
        .update(bookings)
        .set({ status: "failed" as any })
        .where(and(
          eq(bookings.id, booking.id),
          inArray(bookings.status, ["pending", "deposit_authorized"] as any),
          isNull(bookings.cancelledAt),
        ))
        .returning({ id: bookings.id });
      return updated.length > 0;
    }
    case "mark_test": {
      const updated = await db
        .update(bookings)
        .set({ testPayment: true })
        .where(eq(bookings.id, booking.id))
        .returning({ id: bookings.id });
      if (updated.length) await ensurePayoutScheduled(booking.experienceId);
      return updated.length > 0;
    }
    default:
      return false;
  }
}

async function recordDifference(
  booking: CheckBooking,
  intent: ReconIntent | null,
  decision: ReconDecision,
  autoFixed: boolean,
  now: Date,
): Promise<void> {
  if (!decision.kind) return;
  const values = {
    differenceKey: `${booking.stripePaymentIntentId}:${decision.kind}`,
    kind: decision.kind,
    bookingId: booking.id,
    experienceId: booking.experienceId,
    stripePaymentIntentId: booking.stripePaymentIntentId,
    greatStatus: booking.status,
    stripeStatus: intent ? intent.status : "not_in_stripe",
    amountCents: intent ? (intent.receivedCents || intent.amountCents) : Math.round(Number(booking.amount || 0) * 100),
    currency: (booking.currency || "eur").toLowerCase().slice(0, 3),
    note: decision.note ?? null,
    autoFixed,
    paymentCreatedAt: intent?.createdAt ?? null,
    lastSeenAt: now,
    resolvedAt: autoFixed ? now : null,
  };
  await db
    .insert(paymentDifferences)
    .values({ ...values, firstSeenAt: now })
    .onConflictDoUpdate({
      target: paymentDifferences.differenceKey,
      set: {
        greatStatus: values.greatStatus,
        stripeStatus: values.stripeStatus,
        amountCents: values.amountCents,
        note: values.note,
        lastSeenAt: now,
        // Once fixed it stays fixed; an open one is re-opened if it is back.
        autoFixed: sql`${paymentDifferences.autoFixed} OR ${autoFixed}`,
        resolvedAt: autoFixed ? now : sql`CASE WHEN ${paymentDifferences.autoFixed} THEN ${paymentDifferences.resolvedAt} ELSE NULL END`,
      },
    });
}

export async function runPaymentCheck(options: {
  lookbackDays: number;
  /** Close open differences this run no longer finds. Only for a full run. */
  resolveMissing?: boolean;
  stripe?: Stripe;
  now?: Date;
}): Promise<PaymentCheckSummary> {
  const summary: PaymentCheckSummary = { ran: false, checked: 0, fixed: 0, open: 0, resolved: 0, failed: 0 };
  if (stripeKeyMode(stripeSecretKey) !== "live" && !options.stripe) {
    return { ...summary, reason: "Stripe key is not live" };
  }
  if (checkInFlight) return { ...summary, reason: "A check is already running" };
  checkInFlight = true;

  const stripe = options.stripe ?? defaultStripe;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const rows = (await db
      .select({
        id: bookings.id,
        status: bookings.status,
        cancelledAt: bookings.cancelledAt,
        amount: bookings.amount,
        testPayment: bookings.testPayment,
        stripePaymentIntentId: bookings.stripePaymentIntentId,
        experienceId: bookings.experienceId,
        commissionStatus: bookings.commissionStatus,
        requireMinimumParticipants: experiences.requireMinimumParticipants,
        mvgStatus: experiences.mvgStatus,
        currency: experiences.currency,
      })
      .from(bookings)
      .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
      .where(and(isNotNull(bookings.stripePaymentIntentId), gte(bookings.createdAt, since)))) as CheckBooking[];

    // One list call covers nearly everything; anything older is looked up alone.
    const intents = new Map<string, ReconIntent>();
    const listedAfter = Math.floor(since.getTime() / 1000) - 24 * 3600;
    for await (const pi of stripe.paymentIntents.list({
      created: { gte: listedAfter },
      limit: 100,
      expand: ["data.latest_charge"],
    })) {
      intents.set(pi.id, intentForReconciliation(pi));
    }

    for (const booking of rows) {
      summary.checked += 1;
      try {
        let intent = intents.get(booking.stripePaymentIntentId) ?? null;
        if (!intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId, { expand: ["latest_charge"] });
            intent = intentForReconciliation(pi);
          } catch (error: any) {
            if (!isMissing(error)) throw error;
            intent = null;
          }
        }

        const decision = decidePaymentReconciliation(
          booking,
          intent,
          { requireMinimumParticipants: booking.requireMinimumParticipants, mvgStatus: booking.mvgStatus },
          now,
        );
        if (!decision.kind && decision.action === "none") continue;

        let autoFixed = false;
        if (decision.action !== "none") {
          try {
            autoFixed = await applyDecision(decision.action, booking, stripe);
          } catch (error: any) {
            summary.failed += 1;
            console.error(`[Payment Check] Could not ${decision.action} booking ${booking.id}:`, error?.message);
            decision.note = `${decision.note ?? ""} Automatic fix failed: ${error?.message ?? "unknown error"}`.trim();
          }
        }
        if (autoFixed) summary.fixed += 1;
        else summary.open += 1;
        await recordDifference(booking, intent, decision, autoFixed, now);
      } catch (error: any) {
        summary.failed += 1;
        console.error(`[Payment Check] Booking ${booking.id} could not be checked:`, error?.message);
      }
    }

    if (options.resolveMissing) {
      const closed = await db
        .update(paymentDifferences)
        .set({ resolvedAt: now })
        .where(and(
          isNull(paymentDifferences.resolvedAt),
          lt(paymentDifferences.lastSeenAt, now),
          // Only what this run looked at: an older payment is outside the window, not fixed.
          gte(paymentDifferences.paymentCreatedAt, since),
        ))
        .returning({ id: paymentDifferences.id });
      summary.resolved = closed.length;
    }

    summary.ran = true;
    console.log(
      `[Payment Check] ${options.lookbackDays}d: checked ${summary.checked}, fixed ${summary.fixed}, open ${summary.open}, resolved ${summary.resolved}, failed ${summary.failed}`,
    );
    return summary;
  } finally {
    checkInFlight = false;
  }
}

export type PaymentDifferenceRow = {
  id: string;
  kind: string;
  bookingId: string | null;
  experienceId: string | null;
  experienceTitle: string | null;
  buyerEmail: string | null;
  stripePaymentIntentId: string | null;
  greatStatus: string | null;
  stripeStatus: string | null;
  amountCents: number;
  currency: string | null;
  note: string | null;
  autoFixed: boolean;
  paymentCreatedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

/** Open differences first, then what was fixed or cleared, newest payment first. */
export async function listPaymentDifferences(sinceDays = 30): Promise<PaymentDifferenceRow[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    select d.id, d.kind, d.booking_id as "bookingId", d.experience_id as "experienceId",
      e.title as "experienceTitle", u.email as "buyerEmail",
      d.stripe_payment_intent_id as "stripePaymentIntentId", d.great_status as "greatStatus",
      d.stripe_status as "stripeStatus", d.amount_cents as "amountCents", d.currency, d.note,
      d.auto_fixed as "autoFixed", d.payment_created_at as "paymentCreatedAt",
      d.first_seen_at as "firstSeenAt", d.last_seen_at as "lastSeenAt", d.resolved_at as "resolvedAt"
    from payment_differences d
    left join experiences e on e.id = d.experience_id
    left join bookings b on b.id = d.booking_id
    left join users u on u.id = b.user_id
    where d.resolved_at is null or coalesce(d.payment_created_at, d.first_seen_at) >= ${since}
    order by (d.resolved_at is null) desc, coalesce(d.payment_created_at, d.first_seen_at) desc
    limit 500
  `);
  return ((result as any).rows ?? result) as PaymentDifferenceRow[];
}
