/**
 * 7-Day Post-Event Payout Scheduler
 *
 * Timeline:
 *   Event ends → +7 calendar days → payout fires
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
import Stripe from "stripe";
import { db } from "./db";
import { experiences, bookings, platformSettings } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "./storage";
import { notificationService } from "./notifications";
import {
  isExperiencePayoutEligible,
  resolvePayoutGrossCents,
  sumBookingPayoutGrossCents,
} from "./payoutRules";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing required Stripe secret: STRIPE_SECRET_KEY");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-07-30.basil",
});

function formatPayoutAmount(cents: number, currency: string): string {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
}

// ─── Scheduler bootstrap ─────────────────────────────────────────────────────

export function startPayoutScheduler(): void {
  // Run once per hour
  cron.schedule("0 * * * *", async () => {
    console.log("[Payout Scheduler] Hourly check — looking for ready payouts…");
    await processReadyPayouts();
  });

  // Immediate startup check (covers restarts mid-window)
  setImmediate(async () => {
    console.log("[Payout Scheduler] Startup check…");
    await processReadyPayouts();
  });

  console.log("[Payout Scheduler] Started — runs every hour");
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

// ─── Per-experience payout execution ─────────────────────────────────────────

async function executeExperiencePayout(
  experienceId: string,
  scheduledPayoutId: string,
  presetGrossCents = 0,
  additionalGrossCents = 0,
): Promise<void> {
  // Mark as processing to prevent double-execution
  await storage.updateScheduledPayout(scheduledPayoutId, { status: "processing" });

  const experience = await storage.getExperience(experienceId);
  if (!experience) throw new Error(`Experience ${experienceId} not found`);

  // Only pay out experiences where MVG was met (or non-MVG events that are published)
  if (!isExperiencePayoutEligible(experience)) {
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
        inArray(bookings.status, ["confirmed", "fully_paid", "deposit_paid"])
      )
    );

  const bookingGrossCents = sumBookingPayoutGrossCents(confirmedBookings);

  // For B2B upfront deals (venue_sponsored, upfront_rental) there are no attendee
  // bookings — use the preset amount stored when the deal payment was confirmed.
  const grossAmountCents = resolvePayoutGrossCents(
    bookingGrossCents,
    presetGrossCents,
    additionalGrossCents,
  );

  if (grossAmountCents === 0) {
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
    : buildDefaultRecipients(experience, platformFeePct);

  const currency = (experience.currency || "eur").toLowerCase();
  const transferIds: Record<string, string> = {};

  const lockedCommissionBookings = await db
    .select()
    .from(bookings)
    .where(and(
      eq(bookings.experienceId, experienceId),
      eq(bookings.commissionStatus, 'locked'),
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
      await storage.getPromoterProfile(promoterId),
    ] as const)),
  );
  const unreadyPromoters = Array.from(promoterProfiles.entries())
    .filter(([, profile]) => !profile?.stripeAccountId || profile.stripeVerificationStatus !== 'verified')
    .map(([promoterId]) => promoterId);
  if (unreadyPromoters.length > 0) {
    await storage.updateScheduledPayout(scheduledPayoutId, {
      status: 'pending',
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
      errorMessage: `Waiting for verified Stripe accounts: ${unreadyPromoters.join(', ')}`,
    });
    console.warn(`[Payout Scheduler] Deferred ${experienceId}: promoter payout account not ready`);
    return;
  }
  const promoterReserveCents = lockedCommissionBookings.reduce(
    (sum, booking) => sum + Math.round(parseFloat(booking.commissionAmount || '0') * 100),
    0,
  );

  const platformRecipient = effectiveRecipients.find(
    (recipient) => recipient.isActive && recipient.recipientType === "platform",
  );
  const platformFeeAmountCents = platformRecipient
    ? calculateSplitAmount(platformRecipient, grossAmountCents, grossAmountCents)
    : Math.round(grossAmountCents * (platformFeePct / 100));

  if (platformFeeAmountCents + promoterReserveCents > grossAmountCents) {
    throw new Error("Platform fee and promoter commissions exceed available event funds");
  }

  let remainingCents = grossAmountCents - platformFeeAmountCents - promoterReserveCents;
  let promoterReserveRemainingCents = promoterReserveCents;
  console.log(
    `[Payout Scheduler] Platform fee: ${platformFeeAmountCents / 100} ${currency.toUpperCase()}`
  );

  for (const recipient of effectiveRecipients) {
    if (!recipient.isActive) continue;

    // Platform fee is retained — not transferred
    if (recipient.recipientType === "platform") {
      continue;
    }

    if (!recipient.stripeAccountId) {
      console.warn(
        `[Payout Scheduler] Recipient ${recipient.recipientType} has no Stripe account — skipping`
      );
      continue;
    }

    let transferAmountCents = calculateSplitAmount(
      recipient,
      grossAmountCents,
      remainingCents
    );

    transferAmountCents = Math.min(transferAmountCents, Math.max(0, remainingCents));

    if (transferAmountCents <= 0) continue;

    try {
      const transfer = await stripe.transfers.create({
        amount: transferAmountCents,
        currency,
        destination: recipient.stripeAccountId,
        description: `${experience.title} — ${recipient.recipientType} payout`,
        metadata: {
          experienceId,
          recipientType: recipient.recipientType,
          userId: recipient.userId ?? "",
          scheduledPayoutId,
        },
      }, {
        idempotencyKey: `event-payout:${scheduledPayoutId}:recipient:${recipient.id || recipient.stripeAccountId}`,
      });

      transferIds[recipient.recipientType] = transfer.id;
      remainingCents -= transferAmountCents;
      if (recipient.userId) {
        const user = await storage.getUser(recipient.userId);
        if (user?.email) {
          notificationService.sendPayoutInitiatedEmail({
            to: user.email,
            eventName: experience.title,
            payoutAmount: formatPayoutAmount(transferAmountCents, currency),
            eventKey: `payout_initiated:${scheduledPayoutId}:${recipient.id || recipient.stripeAccountId}`,
          }).catch((error) => console.error('[Payout Scheduler] Payout email failed:', error?.message || error));
        }
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
    if (!profile?.stripeAccountId || profile.stripeVerificationStatus !== 'verified') {
      console.warn(`[Payout Scheduler] Promoter ${promoterId} has locked commission but no verified Stripe account`);
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

    const transfer = await stripe.transfers.create({
      amount,
      currency,
      destination: profile.stripeAccountId,
      description: `${experience.title} - promoter commission`,
      metadata: { experienceId, recipientType: 'promoter', userId: promoterId, scheduledPayoutId },
    }, {
      idempotencyKey: `event-payout:${scheduledPayoutId}:promoter:${promoterId}`,
    });
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
  }

  await storage.updateScheduledPayout(scheduledPayoutId, {
    status: "completed",
    totalGrossAmountCents: grossAmountCents,
    platformFeeAmountCents,
    stripeTransferIds: transferIds,
    processedAt: new Date(),
  });

  console.log(
    `[Payout Scheduler] ✓ Experience ${experienceId} payout complete. ` +
    `Gross: ${grossAmountCents / 100} ${currency.toUpperCase()}, ` +
    `Platform: ${platformFeeAmountCents / 100}, ` +
    `Transfers: ${Object.keys(transferIds).join(", ")}`
  );
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
function buildDefaultRecipients(
  experience: any,
  platformFeePct: number
): MinimalRecipient[] {
  const creatorPct = parseFloat(experience.creatorPct?.toString() ?? String(100 - platformFeePct));
  const venuePct = parseFloat(experience.venueRevenueSharePct?.toString() ?? "0");

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

  if (experience.stripeConnectAccountId) {
    recipients.push({
      recipientType: "creator",
      stripeAccountId: experience.stripeConnectAccountId,
      userId: experience.creatorId,
      splitMode: "percentage",
      splitValue: String(adjustedCreatorPct),
      isActive: true,
    });
  }

  return recipients;
}

// ─── Public utility: schedule payout for an experience ───────────────────────

/**
 * Called by the MVG scheduler (or instantly on non-MVG events going live)
 * to register the 7-day payout job.
 */
export async function scheduleExperiencePayout(
  experienceId: string,
  eventEndDate: Date,
  totalGrossCents: number
): Promise<void> {
  const scheduledFor = new Date(eventEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  await storage.upsertScheduledPayout(experienceId, scheduledFor, totalGrossCents);
  console.log(
    `[Payout Scheduler] Scheduled payout for experience ${experienceId} on ${scheduledFor.toISOString()}`
  );
}
