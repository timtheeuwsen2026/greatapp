import { payoutDueAt } from "@shared/eventTime";
import { eventFeeRates, bookingPlatformFeeCents } from "@shared/platformFees";
/**
 * Post-Event Payout Scheduler (24 hours after the event)
 *
 * Timeline:
 *   Event ends → +24 hours → payout fires
 *
 * When MVG is met (or for standard events), the scheduler:
 *   1. Reads the event's split_recipients rows (ordered by priority)
 *   2. Sums collectible gross from confirmed/fully_paid bookings
 *   3. Deducts the platform fee first
 *   4. Issues Stripe Connect transfers to Creator, Venue, and any other
 *      registered recipients in priority order
 *   5. Marks the scheduled_payouts row as completed / failed
 *
 * Runs every hour via node-cron. Safe to restart: completed payouts are
 * skipped; failed ones can be retried by an admin resetting status to 'pending'.
 */

import cron from "node-cron";
import { stripe } from "./stripeClient";
import { db } from "./db";
import { experiences, bookings, platformSettings, scheduledPayouts } from "@shared/schema";
import { eq, and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { storage } from "./storage";
import { notificationService } from "./notifications";
import {
  isExperiencePayoutEligible,
  resolvePayoutGrossCents,
  sumBookingPayoutGrossCents,
  sumVenuePricedAddonCents,
  createChargeAllocator,
  type ChargeSource,
} from "./payoutRules";
import {
  calculateTicketDeductionCents,
  sumBookingTicketQuantity,
} from "@shared/ticketDeduction";
import { resolveVenuePayoutAccount } from "./venuePayouts";
import { resolvePartnerPayoutAccount } from "./partnerPayoutAccount";
import { createHash } from "node:crypto";

/**
 * Bookings that went through: the money an event pays out is theirs, and so are
 * the partner commissions on it. Cancelled, refunded, failed and still-pending
 * bookings are none of these.
 */
const PAYABLE_BOOKING_STATUSES = ["confirmed", "fully_paid", "deposit_paid"] as const;

/** Hours after the event ends that its payout runs. */
export const PAYOUT_DELAY_HOURS = 24;

function formatPayoutAmount(cents: number, currency: string): string {
  // "€1.00", not "EUR 1.00" (point 66.26).
  const symbols: Record<string, string> = { eur: "€", gbp: "£", usd: "$" };
  const symbol = symbols[currency.toLowerCase()];
  return symbol ? `${symbol}${(cents / 100).toFixed(2)}` : `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
}

// ─── Scheduler bootstrap ─────────────────────────────────────────────────────

export function startPayoutScheduler(): void {
  // Run once per hour
  cron.schedule("0 * * * *", async () => {
    console.log("[Payout Scheduler] Hourly check — looking for ready payouts…");
    await scheduleMissingPayouts();
    await processReadyPayouts();
    await payHeldPartnerCommissions();
    await payHeldRecipientShares();
  });

  // Immediate startup check (covers restarts mid-window)
  setImmediate(async () => {
    console.log("[Payout Scheduler] Startup check…");
    await scheduleMissingPayouts();
    await processReadyPayouts();
    await payHeldPartnerCommissions();
  });

  console.log("[Payout Scheduler] Started — runs every hour");
}

// ─── Safety net: paid events that never got a payout ─────────────────────────

/** Events that actually went ahead. A cancelled event is refunded, never paid out. */
const PAYABLE_EVENT_STATUSES = ["approved", "published"] as const;

/**
 * Schedule the payout for any paid event that ended without one.
 *
 * A payout row is written when money lands — from the Stripe webhook, from the
 * MVG scheduler, from a venue's acceptance. Every one of those is a single
 * moment, and if it is missed nothing ever comes back for it: an event whose
 * payment confirmation arrived before its booking existed had the booking
 * rebuilt and the payout silently skipped, so the hourly run below had nothing
 * to find and the creator was simply never paid.
 *
 * (The event that surfaced this, Sep 19, turned out to have sold only free
 * tickets — so nothing was owed there. The gap was real all the same, which is
 * also why money actually collected is part of the test below: a free event
 * must not get a "€0.00 scheduled" row on its organiser's Earnings tab.)
 *
 * So the hourly run looks for the gap itself rather than trusting that every
 * trigger fired. Deliberately narrow: only events that went ahead (not
 * cancelled, not drafts), have ended, have money collected, pass the same MVG
 * eligibility rule as every other path, and have no payout row of any status —
 * a failed payout is an admin's to retry, not something to schedule twice.
 * Scheduling is idempotent, and the amount is recomputed from the bookings at
 * payout time either way.
 */
export async function scheduleMissingPayouts(now: Date = new Date()): Promise<number> {
  try {
    const candidates = await db
      .select({
        id: experiences.id,
        endDate: experiences.endDate,
        requireMinimumParticipants: experiences.requireMinimumParticipants,
        mvgEnabled: experiences.mvgEnabled,
        mvgStatus: experiences.mvgStatus,
      })
      .from(experiences)
      .where(
        and(
          inArray(experiences.status, [...PAYABLE_EVENT_STATUSES] as any),
          lt(experiences.endDate, now),
          // Money actually collected, not merely a paid-looking status: a free
          // RSVP is stored as `fully_paid` at €0, and a free event has nothing
          // to pay out.
          sql`EXISTS (SELECT 1 FROM ${bookings}
                       WHERE ${bookings.experienceId} = ${experiences.id}
                         AND ${bookings.status} IN ('confirmed', 'fully_paid', 'deposit_paid')
                         AND (${bookings.amount} > 0 OR ${bookings.totalPrice} > 0))`,
          sql`NOT EXISTS (SELECT 1 FROM ${scheduledPayouts}
                           WHERE ${scheduledPayouts.experienceId} = ${experiences.id})`,
        ),
      );

    let scheduled = 0;
    for (const experience of candidates) {
      if (!experience.endDate || !isExperiencePayoutEligible(experience as any)) continue;

      const paidBookings = await storage.getPaidBookings(experience.id);
      const grossCents = sumBookingPayoutGrossCents(paidBookings as any);
      // Belt and braces with the query above. A payout row for a free event is
      // not harmless: it shows the organiser "€0.00 scheduled" on their
      // Earnings tab, which reads exactly like being told they will not be paid.
      if (grossCents <= 0) continue;

      await scheduleExperiencePayout(
        experience.id,
        new Date(experience.endDate),
        grossCents,
      );
      scheduled++;
      console.warn(
        `[Payout Scheduler] Scheduled a payout that was never created for experience ${experience.id}`,
      );
    }
    return scheduled;
  } catch (err: any) {
    console.error("[Payout Scheduler] Could not check for missing payouts:", err?.message || err);
    return 0;
  }
}

// ─── Main processing loop ────────────────────────────────────────────────────

export async function processReadyPayouts(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const results = { processed: 0, succeeded: 0, failed: 0 };

  try {
    const ready = await storage.getExperiencesReadyForPayout();
    console.log(`[Payout Scheduler] ${ready.length} payout(s) due`);

    for (const { experienceId, scheduledPayoutId, presetGrossCents, additionalGrossCents } of ready) {
      results.processed++;
      try {
        await executeExperiencePayout(experienceId, scheduledPayoutId, presetGrossCents, additionalGrossCents);
        results.succeeded++;
      } catch (err: any) {
        console.error(`[Payout Scheduler] Failed for experience ${experienceId}:`, err.message);
        await storage.updateScheduledPayout(scheduledPayoutId, {
          status: "failed",
          errorMessage: err.message,
          processedAt: new Date(),
        });
        results.failed++;
      }
    }

    if (results.processed > 0) {
      console.log(
        `[Payout Scheduler] Done: ${results.succeeded} succeeded, ${results.failed} failed`
      );
    }
  } catch (err: any) {
    console.error("[Payout Scheduler] Fatal error:", err.message);
  }

  return results;
}

// ─── Admin "Pay now" ─────────────────────────────────────────────────────────

/**
 * Run one event's payout now instead of waiting for its date. Same run, same
 * rules and the same no-double-pay guards as the hourly one; a failure is
 * recorded on the payout with Stripe's own reason.
 */
export async function payScheduledPayoutNow(scheduledPayoutId: string): Promise<{ ok: boolean; message: string }> {
  const payout = await storage.getScheduledPayoutById(scheduledPayoutId);
  if (!payout) return { ok: false, message: "Payout not found" };
  const holdsShares = Object.keys((payout.stripeTransferIds as Record<string, string>) || {}).some((key) => key.startsWith("held:"));
  if (payout.status !== "pending" && payout.status !== "failed" && !(payout.status === "completed" && holdsShares)) {
    return { ok: false, message: `Only a waiting, failed or partly paid payout can be paid now — this one is ${payout.status}.` };
  }
  try {
    await executeExperiencePayout(
      payout.experienceId, payout.id, payout.totalGrossAmountCents ?? 0, payout.additionalGrossAmountCents ?? 0,
    );
    const after = await storage.getScheduledPayoutById(scheduledPayoutId);
    return after?.status === "completed"
      ? { ok: true, message: "Paid. Everyone with a connected Stripe account has been sent their share." }
      : { ok: false, message: after?.errorMessage || `The payout is ${after?.status}.` };
  } catch (err: any) {
    await storage.updateScheduledPayout(scheduledPayoutId, {
      status: "failed",
      errorMessage: err.message,
      processedAt: new Date(),
    });
    return { ok: false, message: err.message };
  }
}

// ─── Per-experience payout execution ─────────────────────────────────────────

/** One person's share of an event payout, as the plan (and Tim's per-event list) shows it. */
export type PayoutPlanLine = {
  key: string;
  recipientType: string;
  userId: string | null;
  stripeAccountId: string | null;
  amountCents: number;
  accountReady: boolean;
};

export type PayoutPlan = {
  experienceId: string;
  title: string;
  currency: string;
  eligible: boolean;
  reason: string | null;
  grossCents: number;
  platformFeeCents: number;
  lines: PayoutPlanLine[];
};

/**
 * Pay an event out, or with `dryRun` only work out who would get what.
 *
 * The dry run moves no money and writes nothing; it is the same arithmetic as
 * the real run, so the admin per-event list can never disagree with what is
 * actually paid. The real run links every transfer to the event's own Stripe
 * charges (`source_transaction`), so it never needs money "available" on the
 * platform balance, skips anyone already paid (by an earlier run or marked
 * paid manually), and records each transfer as it goes.
 */
export async function executeExperiencePayout(
  experienceId: string,
  scheduledPayoutId: string,
  presetGrossCents = 0,
  additionalGrossCents = 0,
  options: { dryRun?: boolean } = {},
): Promise<PayoutPlan | void> {
  const dryRun = !!options.dryRun;
  const planLines: PayoutPlanLine[] = [];
  // The last line of defence against paying an event twice: two payout rows
  // for one event can both be due in the same run (a retry of one while the
  // other was queued, or a scheduling race). Whichever runs second stops here.
  const sibling = dryRun ? null : await storage.getOtherActivePayoutForExperience(experienceId, scheduledPayoutId);
  if (sibling && (sibling.status === "completed" || sibling.status === "processing")) {
    await storage.updateScheduledPayout(scheduledPayoutId, {
      status: "failed",
      errorMessage: `Duplicate: this event was already paid by payout ${sibling.id}. Nothing was transferred.`,
      processedAt: new Date(),
    });
    console.warn(
      `[Payout Scheduler] Skipped duplicate payout ${scheduledPayoutId} — ${sibling.id} is ${sibling.status}`,
    );
    return;
  }

  // Mark as processing to prevent double-execution
  if (!dryRun) await storage.updateScheduledPayout(scheduledPayoutId, { status: "processing" });

  const experience = await storage.getExperience(experienceId);
  if (!experience) throw new Error(`Experience ${experienceId} not found`);
  const planOf = (eligible: boolean, reason: string | null, grossCents: number, platformFeeCents: number): PayoutPlan => ({
    experienceId,
    title: experience.title,
    currency: (experience.currency || "eur").toLowerCase(),
    eligible,
    reason,
    grossCents,
    platformFeeCents,
    lines: planLines,
  });

  // Only pay out experiences where MVG was met (or non-MVG events that are published)
  if (!isExperiencePayoutEligible(experience)) {
    if (dryRun) return planOf(false, "The minimum group was not reached", 0, 0);
    console.log(
      `[Payout Scheduler] Skipping ${experienceId}: mvgStatus=${experience.mvgStatus}`
    );
    await storage.updateScheduledPayout(scheduledPayoutId, {
      status: "cancelled",
      errorMessage: "MVG not met — no payout",
      processedAt: new Date(),
    });
    return;
  }

  // Sum gross revenue from all confirmed / fully_paid bookings
  const confirmedBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.experienceId, experienceId),
        inArray(bookings.status, [...PAYABLE_BOOKING_STATUSES]),
        // Paid with the test key: no money came in, so none goes out.
        or(isNull(bookings.testPayment), eq(bookings.testPayment, false)),
        // Disputed with the bank: not the event's money unless the dispute is won.
        isNull(bookings.disputedAt),
      )
    );

  const bookingGrossCents = sumBookingPayoutGrossCents(confirmedBookings);
  const ticketQuantity = sumBookingTicketQuantity(confirmedBookings);

  // For B2B upfront deals (venue_sponsored, upfront_rental) there are no attendee
  // bookings — use the preset amount stored when the deal payment was confirmed.
  const grossAmountCents = resolvePayoutGrossCents(
    bookingGrossCents,
    presetGrossCents,
    additionalGrossCents,
  );

  if (grossAmountCents === 0) {
    if (dryRun) return planOf(true, null, 0, 0);
    console.log(`[Payout Scheduler] ${experienceId}: gross = 0, skipping`);
    await storage.updateScheduledPayout(scheduledPayoutId, {
      status: "completed",
      totalGrossAmountCents: 0,
      processedAt: new Date(),
    });
    return;
  }

  // Read platform fee from platformSettings
  const [settings] = await db.select().from(platformSettings).limit(1);
  const platformFeePct = parseFloat(settings?.platformFeePercentage?.toString() ?? "15");

  // Load split recipients for this experience
  const recipients = await storage.getSplitRecipientsByExperience(experienceId);

  // If no recipients configured, fall back to the experience's pct fields
  const effectiveRecipients = recipients.length > 0
    ? recipients
    : await buildDefaultRecipients(experience, platformFeePct);

  // A single organizer receives what remains after the agreed partner shares.
  // Keep the organizer last so a lower admin fee flows to them, including events
  // with persisted split rows created when the platform fee was 15%.
  const residualCreator = effectiveRecipients.filter(r => r.isActive && r.recipientType === "creator" && r.splitMode !== "flat_fee");
  if (residualCreator.length === 1) effectiveRecipients.sort((a, b) => Number(a === residualCreator[0]) - Number(b === residualCreator[0]));
  const currency = (experience.currency || "eur").toLowerCase();
  const transferIds: Record<string, string> = {};

  // A partner's commission is earned when the event pays out, on the bookings
  // that went through. Only the minimum-group path ever locked commissions, so
  // on an event without a minimum group they stayed "estimated" forever and the
  // partner was never paid. Locked here for every event that reaches its payout.
  if (!dryRun) {
    await db
      .update(bookings)
      .set({ commissionStatus: 'locked' })
      .where(and(
        eq(bookings.experienceId, experienceId),
        eq(bookings.commissionStatus, 'estimated'),
        inArray(bookings.status, [...PAYABLE_BOOKING_STATUSES]),
      ));
  }

  const lockedCommissionBookings = await db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.experienceId, experienceId),
      // A dry run locks nothing, so it reads the commissions the real run would lock.
      dryRun
        ? inArray(bookings.commissionStatus, ['estimated', 'locked'] as any)
        : eq(bookings.commissionStatus, 'locked'),
      // A booking cancelled or refunded after its commission was locked earns nothing.
      inArray(bookings.status, [...PAYABLE_BOOKING_STATUSES]),
    ));
  const commissionsByPromoter = new Map<string, typeof lockedCommissionBookings>();
  for (const booking of lockedCommissionBookings) {
    if (!booking.promoterId) continue;
    const rows = commissionsByPromoter.get(booking.promoterId) || [];
    rows.push(booking);
    commissionsByPromoter.set(booking.promoterId, rows);
  }
  const promoterProfiles = new Map(
    await Promise.all(Array.from(commissionsByPromoter.keys()).map(async (promoterId) => [
      promoterId,
      // Read live from Stripe (66.27b): the cached status could stay "not
      // connected" after the partner had finished, holding their commission.
      await resolvePartnerPayoutAccount(promoterId, await storage.getPromoterProfile(promoterId)),
    ] as const)),
  );
  // A partner without a verified payout account used to defer the WHOLE event
  // payout, a day at a time, for as long as they never connected one — the
  // organiser, the venue and every other partner waited on them. Now only their
  // own commission waits: it stays reserved below (so nobody else is paid it),
  // their bookings stay "locked", and payHeldPartnerCommissions pays it the first
  // hourly run after they connect.
  const unreadyPromoters = Array.from(promoterProfiles.entries())
    .filter(([, profile]) => !profile?.stripeAccountId || profile.stripeVerificationStatus !== 'verified')
    .map(([promoterId]) => promoterId);
  if (unreadyPromoters.length > 0) {
    console.warn(
      `[Payout Scheduler] ${experienceId}: holding commission for ${unreadyPromoters.length} partner(s) `
      + `without a verified payout account; paying everyone else`,
    );
  }
  const promoterReserveCents = lockedCommissionBookings.reduce(
    (sum, booking) => sum + Math.round(parseFloat(booking.commissionAmount || '0') * 100),
    0,
  );

  const currentRates = eventFeeRates(experience, platformFeePct);
  const platformFeeAmountCents = confirmedBookings.reduce(
    (total, booking) => total + bookingPlatformFeeCents(booking, platformFeePct, true), 0,
  ) + Math.round(Math.max(0, grossAmountCents - bookingGrossCents) * currentRates.ticketPlatformFeePct / 100);

  const flatFeeAmounts = new Map<MinimalRecipient, number>();
  let flatFeeReserveCents = 0;
  for (const recipient of effectiveRecipients) {
    if (
      !recipient.isActive
      || recipient.recipientType === "platform"
      || recipient.splitMode !== "flat_fee"
    ) {
      continue;
    }

    const appliesPerTicket = recipient.recipientType === "venue"
      && experience.venueCompensationModel === "fixed_fee";
    const amount = calculateTicketDeductionCents(
      recipient.splitValue,
      appliesPerTicket ? ticketQuantity : 1,
    );
    flatFeeAmounts.set(recipient, amount);
    flatFeeReserveCents += amount;
  }

  // ── Add-ons priced from the venue's own discount ──────────────────────────
  // The venue is paid its discounted price for every unit sold, whole. It is
  // reserved here the way a per-ticket deduction is — ahead of every
  // percentage — so neither a revenue share nor the platform fee can come out
  // of it. The fee on these sales was charged on the organiser's markup alone.
  // A booking made before a venue could set a discount carries no such lines,
  // reserves nothing, and is shared out exactly as it always was.
  const VENUE_ADDONS_RECIPIENT = "venue-addons";
  // The venue is paid its own price for every add-on it hands out (point 56).
  // Without a linked venue there is nobody to pay, and the add-on is the organiser's.
  const venuePricedAddons = experience.linkedVenueId
    ? sumVenuePricedAddonCents(confirmedBookings)
    : { grossCents: 0, venueCents: 0 };
  if (venuePricedAddons.venueCents > 0) {
    const venueAccount = await resolveVenuePayoutAccount(experience.linkedVenueId);
    const addonRecipient: MinimalRecipient = {
      id: VENUE_ADDONS_RECIPIENT,
      recipientType: "venue",
      stripeAccountId: venueAccount.stripeAccountId,
      userId: venueAccount.userId,
      splitMode: "flat_fee",
      splitValue: (venuePricedAddons.venueCents / 100).toFixed(2),
      isActive: true,
    };
    // First in line, so a venue with no payout account halts the run before
    // anyone else has been paid rather than part-way through.
    (effectiveRecipients as MinimalRecipient[]).unshift(addonRecipient);
    flatFeeAmounts.set(addonRecipient, venuePricedAddons.venueCents);
    flatFeeReserveCents += venuePricedAddons.venueCents;
  }
  // What the venue's revenue share is a share of. The sales above have already
  // paid the venue its price for them; sharing them as well would pay it twice.
  const venueShareBaseCents = Math.max(0, grossAmountCents - venuePricedAddons.grossCents);

  if (
    platformFeeAmountCents
    + promoterReserveCents
    + flatFeeReserveCents
    > grossAmountCents
  ) {
    throw new Error(
      "Platform fee, ticket deductions, and promoter commissions exceed available event funds",
    );
  }

  let remainingCents = grossAmountCents
    - platformFeeAmountCents
    - promoterReserveCents
    - flatFeeReserveCents;
  let flatFeeReserveRemainingCents = flatFeeReserveCents;
  let promoterReserveRemainingCents = promoterReserveCents;
  console.log(
    `[Payout Scheduler] Platform fee: ${platformFeeAmountCents / 100} ${currency.toUpperCase()}`
  );
  if (flatFeeReserveCents - venuePricedAddons.venueCents > 0) {
    console.log(
      `[Payout Scheduler] Ticket deductions: ${(flatFeeReserveCents - venuePricedAddons.venueCents) / 100} `
      + `${currency.toUpperCase()} across ${ticketQuantity} ticket(s)`,
    );
  }
  if (venuePricedAddons.venueCents > 0) {
    console.log(
      `[Payout Scheduler] Venue's discounted add-on price: ${venuePricedAddons.venueCents / 100} `
      + `${currency.toUpperCase()} on ${venuePricedAddons.grossCents / 100} of add-on sales`,
    );
  }

  // Transfers from an earlier attempt, and anyone marked paid manually, are
  // kept and skipped; the charges are claimed in the same order every run.
  const existingPayout = dryRun ? undefined : await storage.getScheduledPayoutById(scheduledPayoutId);
  Object.assign(transferIds, Object.fromEntries(
    Object.entries((existingPayout?.stripeTransferIds as Record<string, string> | null) || {})
      .filter(([key]) => !key.startsWith("held:")),
  ));
  const chargeSources = dryRun ? [] : await chargeSourcesFor(confirmedBookings);
  const takeFromCharges = createChargeAllocator(chargeSources);
  const heldShares: string[] = [];
  const lineKeyOf = (recipient: MinimalRecipient) => recipient.id === VENUE_ADDONS_RECIPIENT
    ? "venue_addons"
    : recipient.id ? `${recipient.recipientType}:${recipient.id}` : recipient.recipientType;

  // Safety check (Tim, 56.5), before any money moves: everything this run would
  // pay out, held shares and partner commissions included, may not be more than
  // what Stripe really collected for the event minus the platform fee. If it is,
  // the run stops and the event shows under "Payouts needing attention".
  if (!dryRun) {
    let plannedCents = promoterReserveCents;
    let left = remainingCents;
    let flatLeft = flatFeeReserveRemainingCents;
    for (const recipient of effectiveRecipients) {
      if (!recipient.isActive || recipient.recipientType === "platform") continue;
      const flat = flatFeeAmounts.has(recipient);
      let amount = flat
        ? flatFeeAmounts.get(recipient) ?? 0
        : residualCreator.length === 1 && recipient === residualCreator[0]
          ? left
          : calculateSplitAmount(recipient, recipient.recipientType === "venue" ? venueShareBaseCents : grossAmountCents, left);
      amount = Math.min(amount, Math.max(0, flat ? flatLeft : left));
      if (amount <= 0) continue;
      plannedCents += amount;
      if (flat) flatLeft -= amount;
      else left -= amount;
    }
    const collectedCents = chargeSources.length > 0
      ? chargeSources.reduce((sum, source) => sum + source.availableCents, 0)
      : grossAmountCents;
    if (plannedCents > collectedCents - platformFeeAmountCents) {
      throw new Error(
        `Safety check: planned payouts ${formatPayoutAmount(plannedCents, currency)} are more than collected `
        + `${formatPayoutAmount(collectedCents, currency)} minus fees ${formatPayoutAmount(platformFeeAmountCents, currency)}. `
        + `Nothing was paid. Check the bookings and refunds of this event.`,
      );
    }
  }

  for (const recipient of effectiveRecipients) {
    if (!recipient.isActive) continue;

    // Platform fee is retained — not transferred
    if (recipient.recipientType === "platform") {
      continue;
    }

    const isReservedFlatFee = flatFeeAmounts.has(recipient);
    let transferAmountCents = isReservedFlatFee
      ? flatFeeAmounts.get(recipient) ?? 0
      : residualCreator.length === 1 && recipient === residualCreator[0]
        ? remainingCents
        : calculateSplitAmount(
          recipient,
          recipient.recipientType === "venue" ? venueShareBaseCents : grossAmountCents,
          remainingCents,
        );

    transferAmountCents = Math.min(
      transferAmountCents,
      Math.max(
        0,
        isReservedFlatFee ? flatFeeReserveRemainingCents : remainingCents,
      ),
    );

    // Owed nothing — a listed recipient on a 0% share needs no account and must
    // not block the run, so this is checked before the account requirement below.
    if (transferAmountCents <= 0) continue;

    const lineKey = lineKeyOf(recipient);
    if (dryRun) {
      planLines.push({
        key: lineKey,
        recipientType: recipient.id === VENUE_ADDONS_RECIPIENT ? "venue" : recipient.recipientType,
        userId: recipient.userId,
        stripeAccountId: recipient.stripeAccountId,
        amountCents: transferAmountCents,
        accountReady: !!recipient.stripeAccountId,
      });
      if (isReservedFlatFee) flatFeeReserveRemainingCents -= transferAmountCents;
      else remainingCents -= transferAmountCents;
      continue;
    }

    // Already paid by an earlier attempt, or paid outside Stripe by an admin.
    if (transferIds[lineKey]) {
      takeFromCharges(transferAmountCents);
      if (isReservedFlatFee) flatFeeReserveRemainingCents -= transferAmountCents;
      else remainingCents -= transferAmountCents;
      console.log(`[Payout Scheduler] ${lineKey} already settled (${transferIds[lineKey]}) — skipped`);
      continue;
    }

    // No Stripe account: hold only this share and pay everyone else (Tim,
    // 66.12). The share is kept out of everyone else's money, recorded as held
    // (so it stays in "Still to pay" and the payout reads "Partly paid"), the
    // person is asked to connect, and payHeldRecipientShares sends it the first
    // hourly run after they have.
    if (!recipient.stripeAccountId) {
      takeFromCharges(transferAmountCents);
      if (isReservedFlatFee) flatFeeReserveRemainingCents -= transferAmountCents;
      else remainingCents -= transferAmountCents;
      transferIds[`held:${lineKey}`] = 'awaiting-payout-account';
      heldShares.push(`${recipient.recipientType} ${formatPayoutAmount(transferAmountCents, currency)}`);
      if (recipient.userId) {
        const owedUser = await storage.getUser(recipient.userId);
        if (owedUser?.email) {
          notificationService.sendPayoutSetupReminderEmail?.({
            to: owedUser.email,
            firstName: owedUser.firstName,
            eventName: experience.title,
            role: recipient.recipientType === "venue" ? "venue" : recipient.recipientType === "creator" ? "organiser" : "partner",
            setupPath: recipient.recipientType === "venue" ? "/venue-dashboard?tab=payouts" : "/creator-profile-setup",
            eventKey: `payout_held:${scheduledPayoutId}:${lineKey}`,
          })?.catch((error: any) => console.error('[Payout Scheduler] Held-share email failed:', error?.message || error));
        }
      }
      console.warn(`[Payout Scheduler] ${experienceId}: ${lineKey} has no Stripe account — its share is held, everyone else is paid`);
      continue;
    }

    try {
      // A transfer an earlier attempt made before failing is not made again,
      // even after Stripe's 24-hour idempotency window has closed.
      const sentBefore = await transferredForPayout(
        recipient.stripeAccountId, scheduledPayoutId, recipient.recipientType, recipient.id === VENUE_ADDONS_RECIPIENT,
      );
      const parts = takeFromCharges(transferAmountCents);
      const description = recipient.id === VENUE_ADDONS_RECIPIENT
        ? `${experience.title} — venue add-on sales`
        : `${experience.title} — ${recipient.recipientType} payout`;
      const baseKey = `event-payout:${scheduledPayoutId}:recipient:${recipient.id || recipient.stripeAccountId}`;
      const madeIds: string[] = [];
      if (sentBefore >= transferAmountCents) {
        madeIds.push("sent-earlier");
      } else {
        for (const part of parts) {
          const made = await stripe.transfers.create({
            amount: part.amountCents,
            currency,
            destination: recipient.stripeAccountId,
            description,
            ...(part.chargeId ? { source_transaction: part.chargeId } : {}),
            metadata: {
              experienceId,
              recipientType: recipient.recipientType,
              userId: recipient.userId ?? "",
              scheduledPayoutId,
              lineKey,
            },
          }, {
            idempotencyKey: parts.length === 1 && !part.chargeId ? baseKey : `${baseKey}:${part.chargeId || "balance"}`,
          });
          madeIds.push(made.id);
        }
      }
      const transfer = { id: madeIds.join(",") };

      // Its own key, so it does not replace the venue's revenue-share transfer.
      transferIds[lineKey] = transfer.id;
      // Recorded straight away: a later failure must not make a retry pay this again.
      await storage.updateScheduledPayout(scheduledPayoutId, { stripeTransferIds: transferIds } as any);
      if (isReservedFlatFee) {
        flatFeeReserveRemainingCents -= transferAmountCents;
      } else {
        remainingCents -= transferAmountCents;
      }
      // Everyone who is paid gets the mail, the venue too (66.28c): a venue's
      // split row may carry no user, so its owner is looked up from the venue.
      const payee = await payoutEmailTarget(recipient.userId, recipient.recipientType, experience.linkedVenueId);
      if (payee?.email) {
        const isOrganiser = recipient.recipientType === "creator";
        notificationService.sendPayoutInitiatedEmail({
          to: payee.email,
          eventName: experience.title,
          payoutAmount: formatPayoutAmount(transferAmountCents, currency),
          // The organiser sees how their share was reached (66.26).
          breakdown: isOrganiser
            ? [
              `Sales ${formatPayoutAmount(grossAmountCents, currency)}`,
              `Platform fee −${formatPayoutAmount(platformFeeAmountCents, currency)}`,
              // The organiser is paid last, so whatever is left between the fee,
              // the partners and their share went to the venue.
              ...(grossAmountCents - platformFeeAmountCents - promoterReserveCents - transferAmountCents > 0
                ? [`Venue −${formatPayoutAmount(grossAmountCents - platformFeeAmountCents - promoterReserveCents - transferAmountCents, currency)}`]
                : []),
              ...(promoterReserveCents > 0 ? [`Partner commission −${formatPayoutAmount(promoterReserveCents, currency)}`] : []),
              `Your share ${formatPayoutAmount(transferAmountCents, currency)}`,
            ]
            : undefined,
          eventKey: `payout_initiated:${scheduledPayoutId}:${recipient.id || recipient.stripeAccountId}`,
        }).catch((error) => console.error('[Payout Scheduler] Payout email failed:', error?.message || error));
      }

      console.log(
        `[Payout Scheduler] Transferred ${transferAmountCents / 100} ${currency.toUpperCase()} ` +
        `to ${recipient.recipientType} (${recipient.stripeAccountId}) — transfer ${transfer.id}`
      );
    } catch (err: any) {
      console.error(
        `[Payout Scheduler] Transfer failed for ${recipient.recipientType}: ${err.message}`
      );
      // Fail fast — mark the payout as failed so admin can investigate
      throw new Error(
        `Transfer to ${recipient.recipientType} (${recipient.stripeAccountId}) failed: ${err.message}`
      );
    }
  }

  for (const [promoterId, promoterBookings] of Array.from(commissionsByPromoter.entries())) {
    const profile = promoterProfiles.get(promoterId);
    if (dryRun) {
      const owed = promoterBookings.reduce(
        (sum, booking) => sum + Math.round(parseFloat(booking.commissionAmount || '0') * 100),
        0,
      );
      if (owed > 0) {
        planLines.push({
          key: `promoter:${promoterId}`,
          recipientType: "promoter",
          userId: promoterId,
          stripeAccountId: profile?.stripeAccountId ?? null,
          amountCents: owed,
          accountReady: !!profile?.stripeAccountId && profile.stripeVerificationStatus === 'verified',
        });
      }
      continue;
    }
    if (transferIds[`promoter:${promoterId}`]) continue;
    if (!profile?.stripeAccountId || profile.stripeVerificationStatus !== 'verified') {
      // Held, not lost: still reserved above, still "locked", paid later.
      transferIds[`held:promoter:${promoterId}`] = 'awaiting-verified-payout-account';
      continue;
    }
    const amount = promoterBookings.reduce(
      (sum, booking) => sum + Math.round(parseFloat(booking.commissionAmount || '0') * 100),
      0,
    );
    if (amount <= 0) continue;
    if (amount > promoterReserveRemainingCents) {
      throw new Error(`Insufficient reserved payout balance for promoter ${promoterId}`);
    }

    const promoterParts = takeFromCharges(amount);
    const promoterSentBefore = await transferredForPayout(profile.stripeAccountId, scheduledPayoutId, 'promoter', false);
    const promoterIds: string[] = [];
    if (promoterSentBefore >= amount) {
      promoterIds.push('sent-earlier');
    } else {
      for (const part of promoterParts) {
        const made = await stripe.transfers.create({
          amount: part.amountCents,
          currency,
          destination: profile.stripeAccountId,
          description: `${experience.title} - promoter commission`,
          ...(part.chargeId ? { source_transaction: part.chargeId } : {}),
          metadata: { experienceId, recipientType: 'promoter', userId: promoterId, scheduledPayoutId, lineKey: `promoter:${promoterId}` },
        }, {
          idempotencyKey: promoterParts.length === 1 && !part.chargeId
            ? `event-payout:${scheduledPayoutId}:promoter:${promoterId}`
            : `event-payout:${scheduledPayoutId}:promoter:${promoterId}:${part.chargeId || 'balance'}`,
        });
        promoterIds.push(made.id);
      }
    }
    const transfer = { id: promoterIds.join(',') };
    await db
      .update(bookings)
      .set({
        commissionStatus: 'paid',
        commissionTransferId: transfer.id,
        commissionPaidAt: new Date(),
      })
      .where(inArray(bookings.id, promoterBookings.map(booking => booking.id)));
    const promoter = await storage.getUser(promoterId);
    if (promoter?.email) {
      notificationService.sendPayoutInitiatedEmail({
        to: promoter.email,
        eventName: experience.title,
        payoutAmount: formatPayoutAmount(amount, currency),
        eventKey: `payout_initiated:${scheduledPayoutId}:promoter:${promoterId}`,
      }).catch((error) => console.error('[Payout Scheduler] Promoter payout email failed:', error?.message || error));
    }
    promoterReserveRemainingCents -= amount;
    transferIds[`promoter:${promoterId}`] = transfer.id;
    await storage.updateScheduledPayout(scheduledPayoutId, { stripeTransferIds: transferIds } as any);
  }

  if (dryRun) return planOf(true, null, grossAmountCents, platformFeeAmountCents);

  const heldPartners = Object.keys(transferIds).filter((key) => key.startsWith("held:promoter:")).length;
  const heldNote = [
    ...heldShares,
    ...(heldPartners ? [`${heldPartners} partner commission${heldPartners === 1 ? "" : "s"}`] : []),
  ];
  await storage.updateScheduledPayout(scheduledPayoutId, {
    status: "completed",
    totalGrossAmountCents: grossAmountCents,
    platformFeeAmountCents,
    stripeTransferIds: transferIds,
    processedAt: new Date(),
    // Read by the admin and the ledger as "Partly paid".
    errorMessage: heldNote.length
      ? `Partly paid: held until they connect Stripe: ${heldNote.join(", ")}`
      : null,
  } as any);

  console.log(
    `[Payout Scheduler] ✓ Experience ${experienceId} payout complete. ` +
    `Gross: ${grossAmountCents / 100} ${currency.toUpperCase()}, ` +
    `Platform: ${platformFeeAmountCents / 100}, ` +
    `Transfers: ${Object.keys(transferIds).join(", ")}`
  );
}

// ─── Shares held for a missing Stripe account ────────────────────────────────

/**
 * Pay an organiser's or venue's share that a payout held because they had no
 * Stripe account, once they have connected one. The payout run is simply run
 * again: everyone already paid is skipped, so only the held share goes out.
 */
export async function payHeldRecipientShares(): Promise<{ paid: number; waiting: number }> {
  const result = { paid: 0, waiting: 0 };
  try {
    const rows = await db
      .select()
      .from(scheduledPayouts)
      .where(and(
        eq(scheduledPayouts.status, "completed"),
        sql`EXISTS (SELECT 1 FROM jsonb_object_keys(COALESCE(${scheduledPayouts.stripeTransferIds}, '{}'::jsonb)) AS k
                    WHERE k LIKE 'held:%' AND k NOT LIKE 'held:promoter:%')`,
      ));
    for (const row of rows) {
      const plan = await executeExperiencePayout(
        row.experienceId, row.id, row.totalGrossAmountCents ?? 0, row.additionalGrossAmountCents ?? 0, { dryRun: true },
      ) as PayoutPlan;
      const held = Object.keys((row.stripeTransferIds as Record<string, string>) || {})
        .filter((key) => key.startsWith("held:") && !key.startsWith("held:promoter:"))
        .map((key) => key.slice("held:".length));
      const nowReady = plan.lines.some((line) => held.includes(line.key) && line.accountReady);
      if (!nowReady) { result.waiting++; continue; }
      try {
        await executeExperiencePayout(row.experienceId, row.id, row.totalGrossAmountCents ?? 0, row.additionalGrossAmountCents ?? 0);
        result.paid++;
      } catch (err: any) {
        console.error(`[Payout Scheduler] Held share for ${row.experienceId} failed:`, err?.message || err);
        await storage.updateScheduledPayout(row.id, { status: "completed", errorMessage: `Held share could not be paid: ${err?.message}` } as any);
      }
    }
  } catch (err: any) {
    console.error('[Payout Scheduler] Could not check held shares:', err?.message || err);
  }
  return result;
}

// ─── Partner commissions held for a missing payout account ───────────────────

/**
 * Pay the partner commissions an event payout held back because the partner had
 * no verified payout account at the time.
 *
 * Their money never left the platform: the event payout reserved it and paid
 * everyone else. So once the event's payout is completed and the partner has
 * connected, the commission on their bookings that went through is sent in one
 * transfer per event. The idempotency key is built from exactly those bookings,
 * so a retry can never pay the same commission twice, and a booking cancelled in
 * between simply drops out.
 */
export async function payHeldPartnerCommissions(): Promise<{ paid: number; waiting: number; failed: number }> {
  const result = { paid: 0, waiting: 0, failed: 0 };
  try {
    const held = await db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.commissionStatus, 'locked'),
        inArray(bookings.status, [...PAYABLE_BOOKING_STATUSES]),
        sql`${bookings.promoterId} IS NOT NULL`,
        sql`EXISTS (SELECT 1 FROM ${scheduledPayouts}
                    WHERE ${scheduledPayouts.experienceId} = ${bookings.experienceId}
                      AND ${scheduledPayouts.status} = 'completed')`,
      ));

    const groups = new Map<string, typeof held>();
    for (const booking of held) {
      const key = `${booking.experienceId}|${booking.promoterId}`;
      groups.set(key, [...(groups.get(key) || []), booking]);
    }

    for (const [key, groupBookings] of Array.from(groups.entries())) {
      const [experienceId, promoterId] = key.split('|');
      try {
        const amount = groupBookings.reduce(
          (sum, booking) => sum + Math.round(parseFloat(booking.commissionAmount || '0') * 100),
          0,
        );
        if (amount <= 0) continue;

        const profile = await resolvePartnerPayoutAccount(promoterId);
        if (!profile?.stripeAccountId || profile.stripeVerificationStatus !== 'verified') {
          result.waiting++;
          continue;
        }

        const experience = await storage.getExperience(experienceId);
        const currency = (experience?.currency || 'eur').toLowerCase();
        const bookingIds = groupBookings.map(booking => booking.id).sort();
        const fingerprint = createHash('sha256').update(bookingIds.join(',')).digest('hex').slice(0, 32);

        const transfer = await stripe.transfers.create({
          amount,
          currency,
          destination: profile.stripeAccountId,
          description: `${experience?.title || 'Event'} - partner commission`,
          metadata: { experienceId, recipientType: 'promoter', userId: promoterId, heldCommission: 'true' },
        }, {
          idempotencyKey: `held-commission:${experienceId}:${promoterId}:${fingerprint}`,
        });

        await db
          .update(bookings)
          .set({ commissionStatus: 'paid', commissionTransferId: transfer.id, commissionPaidAt: new Date() })
          .where(inArray(bookings.id, bookingIds));

        const promoter = await storage.getUser(promoterId);
        if (promoter?.email) {
          notificationService.sendPayoutInitiatedEmail({
            to: promoter.email,
            eventName: experience?.title || 'your event',
            payoutAmount: formatPayoutAmount(amount, currency),
            eventKey: `payout_initiated:held-commission:${experienceId}:${promoterId}:${fingerprint}`,
          }).catch((error) => console.error('[Payout Scheduler] Held commission email failed:', error?.message || error));
        }
        result.paid++;
        console.log(`[Payout Scheduler] Paid held commission ${amount / 100} ${currency.toUpperCase()} to ${promoterId} for ${experienceId}`);
      } catch (err: any) {
        // One partner's failed transfer must not stop the others; it is retried next hour.
        result.failed++;
        console.error(`[Payout Scheduler] Held commission for ${key} failed:`, err?.message || err);
      }
    }
  } catch (err: any) {
    console.error('[Payout Scheduler] Could not check held partner commissions:', err?.message || err);
  }
  return result;
}

// ─── Who the payout mail goes to ─────────────────────────────────────────────

export async function payoutEmailTarget(
  userId: string | null,
  recipientType: string,
  linkedVenueId: string | null | undefined,
): Promise<{ email: string } | null> {
  const user = userId ? await storage.getUser(userId) : undefined;
  if (user?.email) return { email: user.email };
  if (recipientType === "venue" && linkedVenueId) {
    const venue: any = await storage.getVenue(linkedVenueId);
    const owner = venue?.createdBy ? await storage.getUser(venue.createdBy) : undefined;
    const email = owner?.email || venue?.contactEmail;
    if (email) return { email };
  }
  return null;
}

// ─── Stripe lookups for a payout ─────────────────────────────────────────────

/**
 * The charges that paid for these bookings, with what is left of each after
 * refunds. A disputed charge is left out: its money may go back to the buyer.
 */
export async function chargeSourcesFor(
  paidBookings: Array<{ stripePaymentIntentId?: string | null; balancePaymentIntentId?: string | null; balancePaid?: boolean | null }>,
): Promise<ChargeSource[]> {
  const found: Array<ChargeSource & { created: number }> = [];
  const seen = new Set<string>();
  for (const booking of paidBookings) {
    const ids = [booking.stripePaymentIntentId, booking.balancePaid ? booking.balancePaymentIntentId : null]
      .filter((id): id is string => !!id && id.startsWith("pi_") && !seen.has(id));
    for (const id of ids) {
      seen.add(id);
      try {
        const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
        const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge as any : null;
        if (!charge || charge.disputed || charge.status !== "succeeded") continue;
        const available = (charge.amount_captured ?? charge.amount ?? 0) - (charge.amount_refunded ?? 0);
        if (available > 0) found.push({ chargeId: charge.id, availableCents: available, created: charge.created ?? 0 });
      } catch (error: any) {
        console.warn(`[Payout Scheduler] Could not read payment ${id}: ${error?.message}`);
      }
    }
  }
  return found.sort((a, b) => a.created - b.created || a.chargeId.localeCompare(b.chargeId))
    .map(({ chargeId, availableCents }) => ({ chargeId, availableCents }));
}

/** What this payout already sent to an account, read from Stripe itself. */
export async function transferredForPayout(
  destination: string,
  scheduledPayoutId: string,
  recipientType: string,
  addonSales: boolean,
): Promise<number> {
  let total = 0;
  try {
    for await (const transfer of stripe.transfers.list({ destination, limit: 100 })) {
      if (transfer.metadata?.scheduledPayoutId !== scheduledPayoutId) continue;
      if (transfer.metadata?.recipientType !== recipientType) continue;
      const isAddon = /add-on sales/.test(transfer.description || "");
      if (isAddon !== addonSales) continue;
      total += transfer.amount - (transfer.amount_reversed || 0);
    }
  } catch (error: any) {
    // Unreadable: fall back on the idempotency key, as before.
    console.warn(`[Payout Scheduler] Could not list transfers to ${destination}: ${error?.message}`);
  }
  return total;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type MinimalRecipient = {
  id?: string;
  recipientType: string;
  stripeAccountId: string | null;
  userId: string | null;
  splitMode: string;
  splitValue: string;
  isActive: boolean | null;
};

function calculateSplitAmount(
  recipient: MinimalRecipient,
  grossCents: number,
  remainingCents: number
): number {
  if (recipient.splitMode === "flat_fee") {
    return Math.round(parseFloat(recipient.splitValue) * 100);
  }
  // percentage of gross
  return Math.round((parseFloat(recipient.splitValue) / 100) * grossCents);
}

/**
 * If no split_recipients rows exist for this experience, derive them from
 * the experience's own pct columns (creator_pct, venue_revenue_share_pct, etc).
 * This ensures backward compatibility with events created before the payment engine.
 */
export async function buildDefaultRecipients(
  experience: any,
  platformFeePct: number
): Promise<MinimalRecipient[]> {
  const creatorPct = parseFloat(experience.creatorPct?.toString() ?? String(100 - platformFeePct));
  const percentageVenueDeal = experience.venueCompensationModel === "revenue_share"
    || experience.venueCompensationModel === "commitment_plus_revenue_share";
  const venuePct = percentageVenueDeal
    ? parseFloat(experience.venueRevenueSharePct?.toString() ?? "0")
    : 0;

  // Adjust creator pct to account for venue share (venue share comes from creator's portion)
  const adjustedCreatorPct = Math.max(0, creatorPct - venuePct);

  const recipients: MinimalRecipient[] = [
    {
      recipientType: "platform",
      stripeAccountId: null,
      userId: null,
      splitMode: "percentage",
      splitValue: String(platformFeePct),
      isActive: true,
    },
  ];

  const venueFixedFee = parseFloat(experience.venueFixedFee?.toString() ?? "0");
  if (venuePct > 0) {
    // Keep an owed venue in the split even if its account is missing. The
    // executor must halt for a missing account, never retain the share silently.
    const venueAccount = await resolveVenuePayoutAccount(experience.linkedVenueId);
    recipients.push({
      recipientType: "venue",
      stripeAccountId: venueAccount.stripeAccountId,
      userId: venueAccount.userId,
      splitMode: "percentage",
      splitValue: String(venuePct),
      isActive: true,
    });
  }
  if (
    experience.venueCompensationModel === "fixed_fee"
    && venueFixedFee > 0
    && experience.linkedVenueId
  ) {
    const venueAccount = await resolveVenuePayoutAccount(experience.linkedVenueId);

    recipients.push({
      recipientType: "venue",
      stripeAccountId: venueAccount.stripeAccountId,
      userId: venueAccount.userId,
      splitMode: "flat_fee",
      splitValue: String(venueFixedFee),
      isActive: true,
    });
  }

  // experiences.stripe_connect_account_id is read here but no write path in the
  // app has ever populated it, so relying on it alone dropped the creator out of
  // every default split — the payout ran, retained the platform fee and paid the
  // creator nothing. Their account actually lives on the creator profile, which
  // is what Stripe Connect onboarding writes.
  const creatorProfile = experience.creatorId
    ? await storage.getCreatorProfile(experience.creatorId)
    : undefined;
  const creatorStripeAccountId =
    experience.stripeConnectAccountId || creatorProfile?.stripeAccountId || null;

  recipients.push({
    recipientType: "creator",
    stripeAccountId: creatorStripeAccountId,
    userId: experience.creatorId,
    splitMode: "percentage",
    splitValue: String(adjustedCreatorPct),
    isActive: true,
  });

  return recipients;
}

// ─── Public utility: schedule payout for an experience ───────────────────────

/**
 * Called by the MVG scheduler (or instantly on non-MVG events going live)
 * to register the payout job: 24 hours after the event ends.
 */
export async function scheduleExperiencePayout(
  experienceId: string,
  eventEndDate: Date,
  totalGrossCents: number
): Promise<void> {
  // Paid 24 hours after the event (Tim, Nov 2026; it was 7 days). Each transfer
  // is linked to the event's own charges, so it does not wait for the money to
  // become "available" on the platform balance.
  // Counted from the event's real end time in its own city (66.21, 66.26). It
  // used to count from the stored date (07:00 UTC), so TEST 3, which ended at
  // 01:00 Barcelona time, was paid at 13:00 instead of 01:00 the next night.
  let experience: any;
  try {
    experience = await storage.getExperience(experienceId);
  } catch {
    experience = undefined;
  }
  const scheduledFor = (experience && payoutDueAt(experience as any))
    || new Date(eventEndDate.getTime() + PAYOUT_DELAY_HOURS * 60 * 60 * 1000);
  await storage.upsertScheduledPayout(experienceId, scheduledFor, totalGrossCents);
  console.log(
    `[Payout Scheduler] Scheduled payout for experience ${experienceId} on ${scheduledFor.toISOString()}`
  );
}
