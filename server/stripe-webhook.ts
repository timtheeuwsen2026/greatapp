/**
 * Comprehensive Stripe webhook handler.
 *
 * Covers all four checkout modes:
 *  A – Standard paid ticket     → payment_intent.succeeded (immediate capture)
 *  B – Deposit / MVG model      → payment_intent.amount_capturable_updated + setup_intent.succeeded
 *  C – Free RSVP                → no Stripe event (booking created at $0, no card)
 *  D – Mixed / Combi checkout   → payment_intent.succeeded for the add-on amount
 *  E – Venue-Sponsored deal     → checkout.session.completed (type=venue_sponsorship)
 *
 * Payout events (Stripe Connect transfers fired by payout-scheduler.ts):
 *  transfer.created / transfer.reversed
 *
 * Connect account lifecycle:
 *  account.updated  → sync KYC verification status into creator profile
 */

import Stripe from "stripe";
import { storage } from "./storage";
import { db } from "./db";
import {
  bookings,
  creatorProfiles,
  promoterProfiles,
  platformSettings,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { scheduleExperiencePayout } from "./payout-scheduler";
import { notificationService, formatPromotionDealSummary } from "./notifications";
import { sendBookingNotificationsAfterPayment } from "./bookingEmailOrchestrator";
import { finalizeBookingFromPaymentIntent } from "./bookingFinalizer";

// ─── Type helpers ────────────────────────────────────────────────────────────

type BookingStatus =
  | "pending"
  | "deposit_authorized"
  | "deposit_paid"
  | "confirmed"
  | "fully_paid"
  | "cancelled"
  | "refunded"
  | "failed";

async function notifyCreatorEventPublished(experience: any): Promise<void> {
  try {
    if (!experience?.creatorId) return;
    const creator = await storage.getUser(experience.creatorId);
    if (!creator?.email) return;

    await notificationService.sendEventPublishedEmail({
      to: creator.email,
      creatorName: creator.firstName,
      eventName: experience.title || "your experience",
      eventSlugOrId: experience.slug || experience.id,
      eventKey: `event_published:${experience.id}`,
    });
  } catch (error) {
    console.error("Failed to send event published email:", error);
  }
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function handleStripeWebhook(event: Stripe.Event, stripe: Stripe): Promise<void> {
  switch (event.type) {

    // ── B2B Upfront Deals: venue_sponsored and upfront_rental ────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`[Webhook] checkout.session.completed ${session.id} type=${session.metadata?.type}`);
      if (session.metadata?.type === 'venue_sponsorship') {
        await finalizeVenueSponsorshipSession(session);
      } else if (session.metadata?.type === 'promotion_sponsorship') {
        await finalizePromotionSponsorshipSession(session);
      } else if (session.metadata?.type === 'upfront_rental') {
        await handleUpfrontRental(session);
      }
      break;
    }

    // ── Mode A / Mode D: immediate full capture ──────────────────────────
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log(`[Webhook] payment_intent.succeeded ${pi.id}`);
      // Venue sponsorship: also handled by checkout.session.completed (belt-and-suspenders)
      if (pi.metadata?.type === 'venue_sponsorship') {
        // Already processed by checkout.session.completed — skip to avoid double-processing
        break;
      }
      await handlePaymentIntentSucceeded(pi);
      break;
    }

    // ── Mode B: deposit authorized (capture_method=manual), card on file ─
    case "payment_intent.amount_capturable_updated": {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log(`[Webhook] payment_intent.amount_capturable_updated ${pi.id}`);
      await handleDepositAuthorized(pi);
      break;
    }

    // ── Mode B: card saved via SetupIntent for off-session balance charge ─
    case "setup_intent.succeeded": {
      const si = event.data.object as Stripe.SetupIntent;
      console.log(`[Webhook] setup_intent.succeeded ${si.id}`);
      await handleSetupIntentSucceeded(si);
      break;
    }

    // ── All modes: payment failure ────────────────────────────────────────
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log(`[Webhook] payment_intent.payment_failed ${pi.id} — ${pi.last_payment_error?.message}`);
      await handlePaymentFailed(pi);
      break;
    }

    // ── All modes: refund (MVG failure or manual) ─────────────────────────
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      console.log(`[Webhook] charge.refunded ${charge.id}`);
      await handleChargeRefunded(charge);
      break;
    }

    // ── Dispute opened — log, flag booking ───────────────────────────────
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      console.log(`[Webhook] charge.dispute.created ${dispute.id} for charge ${dispute.charge}`);
      await handleDisputeCreated(dispute);
      break;
    }

    // ── Stripe Connect: KYC / verification status change ─────────────────
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      console.log(`[Webhook] account.updated ${account.id}`);
      await handleAccountUpdated(account);
      break;
    }

    // ── Payout transfer created (Stripe Connect) ─────────────────────────
    // Note: transfer failures are synchronous SDK errors — no async event exists.
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      console.log(`[Webhook] transfer.created ${transfer.id} → ${transfer.destination}`);
      await handleTransferCreated(transfer);
      break;
    }

    // ── Transfer reversed (e.g. dispute resolution) ───────────────────────
    case "transfer.reversed": {
      const transfer = event.data.object as Stripe.Transfer;
      console.warn(`[Webhook] transfer.reversed ${transfer.id}`);
      await handleTransferReversed(transfer);
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * A PaymentIntent reached a payable state but no booking is attached to it.
 * That means the buyer's browser left the checkout before it could create the
 * booking — the usual cause is a redirect-based payment method (iDEAL,
 * Bancontact, full-page 3DS) plus a closed tab. Everything needed is stamped on
 * the PaymentIntent metadata, so rebuild the booking server-side rather than
 * leaving a captured payment with nothing behind it.
 */
async function rebuildMissingBooking(pi: Stripe.PaymentIntent, source: string): Promise<void> {
  if (!pi.metadata?.experienceId || !pi.metadata?.userId) {
    console.warn(
      `[Webhook] ${source}: no booking for PI ${pi.id} and not enough metadata to rebuild one`,
    );
    return;
  }

  try {
    const result = await finalizeBookingFromPaymentIntent(pi.id);
    if (result.created) {
      console.log(`[Webhook] Rebuilt missing booking ${result.bookingId} from PI ${pi.id} (${source})`);
    } else {
      console.error(`[Webhook] Could not rebuild booking for PI ${pi.id}: ${result.message}`);
    }
  } catch (error: any) {
    console.error(`[Webhook] Rebuilding booking for PI ${pi.id} threw:`, error?.message);
  }
}

/**
 * Mode A / D: PaymentIntent captured immediately (capture_method=automatic).
 * Mark booking as fully_paid. If it was a balance payment, mark balance paid.
 */
async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const booking = await storage.getBookingByPaymentIntent(pi.id);

  if (!booking) {
    // Could be a balance payment intent stored on balancePaymentIntentId
    const byBalance = await getBookingByBalancePaymentIntent(pi.id);
    if (byBalance) {
      await storage.updateBookingBalancePaid(byBalance.id, true);
      console.log(`[Webhook] Balance paid for booking ${byBalance.id}`);
      return;
    }

    // Money captured with no booking behind it — the buyer paid with a
    // redirect-based method and never returned to the confirmation page.
    // Rebuilding also sets the final status and sends the confirmation emails,
    // so there is nothing left to do here.
    await rebuildMissingBooking(pi, "payment_intent.succeeded");
    return;
  }

  const isBalancePayment = pi.metadata?.isBalancePayment === "true";

  if (isBalancePayment) {
    await storage.updateBookingBalancePaid(booking.id, true);
    console.log(`[Webhook] Balance payment confirmed for booking ${booking.id}`);
  } else {
    // Full payment captured — confirm booking
    await storage.updateBookingStatus(booking.id, "fully_paid");
    console.log(`[Webhook] Full payment confirmed for booking ${booking.id}`);
    await sendBookingNotificationsAfterPayment(booking.id);
  }
}

/**
 * Mode B: Deposit authorized (capture_method=manual → requires_capture).
 * Card is on file (setup_future_usage was set). Mark booking as deposit_authorized.
 * The MVG scheduler will capture when threshold is met.
 */
async function handleDepositAuthorized(pi: Stripe.PaymentIntent): Promise<void> {
  const booking = await storage.getBookingByPaymentIntent(pi.id);
  if (!booking) {
    // Same redirect/closed-tab case as above — rebuild instead of stranding the
    // authorization. Booking creation sets the status and sends the emails.
    await rebuildMissingBooking(pi, "payment_intent.amount_capturable_updated");
    return;
  }

  if (booking.status === "pending") {
    await storage.updateBookingStatus(booking.id, "deposit_authorized");
    console.log(`[Webhook] Deposit authorized for booking ${booking.id} (PI ${pi.id})`);
  }
  await sendBookingNotificationsAfterPayment(booking.id);
}

/**
 * Mode B: SetupIntent succeeded — card is now saved against the Stripe customer.
 * Store the payment method on the booking for future off-session balance charge.
 */
async function handleSetupIntentSucceeded(si: Stripe.SetupIntent): Promise<void> {
  const bookingId = si.metadata?.bookingId;
  if (!bookingId) {
    console.warn(`[Webhook] setup_intent.succeeded: no bookingId in metadata for SI ${si.id}`);
    return;
  }

  const booking = await storage.getBooking(bookingId);
  if (!booking) return;

  // Record that the card is saved for off-session use
  await db
    .update(bookings)
    .set({
      // Reuse balancePaymentIntentId column to store the setup intent for reference
      balancePaymentIntentId: si.id,
    })
    .where(eq(bookings.id, bookingId));

  console.log(`[Webhook] Card saved (SetupIntent ${si.id}) for booking ${bookingId}`);
}

/**
 * All modes: PaymentIntent failed. Mark booking as failed.
 */
async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const booking = await storage.getBookingByPaymentIntent(pi.id);
  if (!booking) {
    console.warn(`[Webhook] payment_failed: no booking for PI ${pi.id}`);
    return;
  }

  await storage.updateBookingStatus(booking.id, "failed");
  console.log(`[Webhook] Booking ${booking.id} marked failed (PI ${pi.id})`);
}

/**
 * Charge refunded — mark booking as refunded.
 * Fired both by the MVG failure path and by manual admin refunds.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const piId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!piId) return;

  const booking = await storage.getBookingByPaymentIntent(piId);
  if (!booking) return;

  if (booking.status !== "refunded" && booking.status !== "cancelled") {
    await storage.updateBookingStatus(booking.id, "refunded");
    console.log(`[Webhook] Booking ${booking.id} marked refunded (charge ${charge.id})`);
  }
}

/**
 * Dispute opened on a charge. Log it and note on the booking for manual review.
 */
async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;

  console.error(
    `[Webhook] ⚠️  DISPUTE opened — charge: ${chargeId}, reason: ${dispute.reason}, amount: ${dispute.amount / 100}`
  );
  // Future: create a DisputeRecord or notify admin via email/webhook.
}

/**
 * Stripe Connect account updated — sync KYC/verification status into the
 * creator_profiles table so the dashboard shows the correct badge.
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const detailsSubmitted = account.details_submitted;

  let verificationStatus: string;
  if (chargesEnabled && payoutsEnabled) {
    verificationStatus = "verified";
  } else if (detailsSubmitted) {
    verificationStatus = "pending";
  } else {
    verificationStatus = "unverified";
  }

  // Find the creator profile with this Stripe account ID
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.stripeAccountId, account.id));

  if (profile) {
    await db
      .update(creatorProfiles)
      .set({ stripeVerificationStatus: verificationStatus, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profile.id));

    console.log(
      `[Webhook] Creator profile ${profile.id} Stripe status → ${verificationStatus}`
    );
  }

  const [promoterProfile] = await db
    .select()
    .from(promoterProfiles)
    .where(eq(promoterProfiles.stripeAccountId, account.id));
  if (promoterProfile) {
    await db
      .update(promoterProfiles)
      .set({ stripeVerificationStatus: verificationStatus, updatedAt: new Date() })
      .where(eq(promoterProfiles.id, promoterProfile.id));
    console.log(`[Webhook] Promoter profile ${promoterProfile.id} Stripe status -> ${verificationStatus}`);
  } else if (!profile) {
    console.warn(`[Webhook] account.updated: no payout profile for Stripe account ${account.id}`);
  }
}

/**
 * Transfer created successfully — update scheduled_payouts to record the transfer ID.
 */
async function handleTransferCreated(transfer: Stripe.Transfer): Promise<void> {
  const experienceId = transfer.metadata?.experienceId;
  const recipientType = transfer.metadata?.recipientType;
  if (!experienceId || !recipientType) return;

  const payout = await storage.getScheduledPayoutByExperience(experienceId);
  if (!payout) return;

  const updatedTransferIds = {
    ...(payout.stripeTransferIds as Record<string, string> || {}),
    [recipientType]: transfer.id,
  };

  await storage.updateScheduledPayout(payout.id, {
    stripeTransferIds: updatedTransferIds,
  });

  console.log(`[Webhook] Transfer ${transfer.id} recorded for ${recipientType} on experience ${experienceId}`);
}

/**
 * Upfront Rental: creator has paid the flat rental fee to the platform.
 * 1. Mark the contract as paid.
 * 2. Accept the contract and approve the experience (now goes Live).
 * 3. Set up split_recipients routing the fee to the venue.
 * 4. Schedule the 7-day post-event payout to the venue.
 */
async function handleUpfrontRental(session: Stripe.Checkout.Session): Promise<void> {
  const { contractId, experienceId, creatorId, venueId, rentalAmountCents } = session.metadata ?? {};
  const piId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!contractId || !experienceId || !venueId) {
    console.warn(`[Webhook] upfront_rental: missing metadata on session ${session.id}`);
    return;
  }

  const contract = await storage.getVenueContractById(contractId);
  if (!contract) {
    console.warn(`[Webhook] upfront_rental: contract ${contractId} not found`);
    return;
  }

  // Idempotency — already processed
  if ((contract as any).sponsorshipPaymentStatus === 'paid') {
    console.log(`[Webhook] upfront_rental: contract ${contractId} already paid — skipping`);
    return;
  }

  // 1. Mark contract as paid
  await storage.updateVenueContractSponsorshipStatus(contractId, 'paid', piId);

  // 2. Accept contract → go Live
  await storage.acceptVenueContract(experienceId, venueId);
  await storage.updateExperience(experienceId, {
    linkedVenueId: venueId,
    venueStatus: 'venue_confirmed',
  } as any);
  const experience = await storage.getExperience(experienceId);
  if (!experience) return;

  await storage.updateExperienceStatus(experienceId, 'approved');
  await notifyCreatorEventPublished(experience);
  console.log(`[Webhook] Upfront-rental experience ${experienceId} is now Live`);

  // 3. Set up split_recipients so the payout goes to the venue, not the creator.
  //    Venue receives (grossAmount - platformFee). Platform retains its fee.
  const grossCents = parseInt(rentalAmountCents || '0', 10);
  if (grossCents > 0 && experience.endDate) {
    // Read platform fee from DB (never hardcode per project policy)
    const [settings] = await db.select().from(platformSettings).limit(1);
    const platformFeePct = parseFloat(settings?.platformFeePercentage?.toString() ?? '15');
    const venuePct = Math.max(0, 100 - platformFeePct);

    // Look up venue owner's Stripe Connect account for the payout transfer
    const venue = await storage.getVenue(venueId);
    const venueOwnerProfile = venue?.createdBy
      ? await storage.getCreatorProfile(venue.createdBy)
      : undefined;

    if (!venueOwnerProfile?.stripeAccountId) {
      console.warn(`[Webhook] upfront_rental: venue owner (${venue?.createdBy}) has no Stripe Connect account — payout will fail at execution`);
    }

    // Replace any previous split recipients for this experience
    await storage.deleteSplitRecipientsByExperience(experienceId);
    await storage.createSplitRecipients([
      {
        experienceId,
        recipientType: 'platform' as const,
        splitMode: 'percentage' as const,
        splitValue: String(platformFeePct),
        priority: 0,
        isActive: true,
      },
      {
        experienceId,
        recipientType: 'venue' as const,
        userId: venue?.createdBy ?? null,
        stripeAccountId: venueOwnerProfile?.stripeAccountId ?? null,
        splitMode: 'percentage' as const,
        splitValue: String(venuePct),
        priority: 1,
        isActive: true,
      },
    ]);

    // 4. Schedule 7-day post-event payout
    await scheduleExperiencePayout(experienceId, new Date(experience.endDate), grossCents);
  }
}

/**
 * Transfer reversed (e.g. due to dispute resolution).
 * Mark the scheduled payout as failed so the admin is aware.
 */
async function handleTransferReversed(transfer: Stripe.Transfer): Promise<void> {
  const experienceId = transfer.metadata?.experienceId;
  if (!experienceId) return;

  const payout = await storage.getScheduledPayoutByExperience(experienceId);
  if (!payout) return;

  await storage.updateScheduledPayout(payout.id, {
    status: "failed",
    errorMessage: `Transfer ${transfer.id} was reversed`,
  });

  console.error(`[Webhook] Transfer reversed for experience ${experienceId}: ${transfer.id}`);
}

/**
 * Venue-Sponsored deal: venue has paid the flat sponsorship fee.
 * 1. Mark the contract as paid.
 * 2. Accept the contract and approve the experience (now goes Live).
 * 3. Schedule the 7-day post-event payout to the creator.
 */
export async function finalizeVenueSponsorshipSession(session: Stripe.Checkout.Session): Promise<void> {
  const { contractId, experienceId, venueId, sponsorshipAmountCents } = session.metadata ?? {};
  const piId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!contractId || !experienceId || !venueId) {
    console.warn(`[Webhook] venue_sponsorship: missing metadata on session ${session.id}`);
    return;
  }

  const contract = await storage.getVenueContractById(contractId);
  if (!contract) {
    console.warn(`[Webhook] venue_sponsorship: contract ${contractId} not found`);
    return;
  }

  // Idempotency — already processed
  if ((contract as any).sponsorshipPaymentStatus === 'paid' && contract.status === 'accepted') {
    await storage.updateExperience(experienceId, {
      linkedVenueId: venueId,
      venueStatus: 'venue_confirmed',
      status: 'approved',
    } as any);
    console.log(`[Webhook] venue_sponsorship: contract ${contractId} already paid — state reconciled`);
    return;
  }

  // 1. Mark contract as paid
  await storage.updateVenueContractSponsorshipStatus(contractId, 'paid', piId);

  // 2. Accept contract → go Live
  // Financial terms (venueFixedFee, venueCompensationModel, etc.) were already copied to the
  // experience row when the creator accepted the venue's offer. We just need to lock the
  // contract and set the experience status to approved.
  await storage.acceptVenueContract(experienceId, venueId);
  await storage.updateExperience(experienceId, {
    linkedVenueId: venueId,
    venueStatus: 'venue_confirmed',
  } as any);
  const experience = await storage.getExperience(experienceId);
  if (!experience) return;

  await storage.updateExperienceStatus(experienceId, 'approved');
  await notifyCreatorEventPublished(experience);
  console.log(`[Webhook] Venue-sponsored experience ${experienceId} is now Live`);

  // 3. Schedule creator payout 7 days after event end
  const grossCents = parseInt(sponsorshipAmountCents || '0', 10);
  if (grossCents > 0 && experience.endDate) {
    scheduleExperiencePayout(experienceId, new Date(experience.endDate), grossCents).catch(err =>
      console.error(`[Webhook] Failed to schedule sponsorship payout for ${experienceId}:`, err.message)
    );
  }
}

export async function finalizePromotionSponsorshipSession(session: Stripe.Checkout.Session): Promise<void> {
  const { promotionDealId, experienceId, partnerId, sponsorshipAmountCents } = session.metadata ?? {};
  if (!promotionDealId || !experienceId || !partnerId || session.payment_status !== "paid") {
    console.warn(`[Webhook] promotion_sponsorship: incomplete session ${session.id}`);
    return;
  }

  const deal = await storage.getPromotionDeal(promotionDealId);
  if (!deal || deal.dealType !== "financial_sponsorship" || deal.partnerId !== partnerId) {
    console.warn(`[Webhook] promotion_sponsorship: invalid deal ${promotionDealId}`);
    return;
  }

  const expectedCents = Math.round(Number(deal.terms?.sponsorshipAmount || 0) * 100);
  const paidCents = session.amount_total || 0;
  if (expectedCents <= 0 || paidCents !== expectedCents || paidCents !== Number(sponsorshipAmountCents)) {
    throw new Error(`Promotion sponsorship amount mismatch for deal ${promotionDealId}`);
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  const finalized = await storage.finalizePromotionSponsorshipPayment(
    promotionDealId,
    session.id,
    paymentIntentId,
  );
  if (!finalized?.newlyPaid) return;

  const experience = await storage.getExperience(experienceId);
  if (experience?.endDate) {
    const scheduledFor = new Date(new Date(experience.endDate).getTime() + 7 * 24 * 60 * 60 * 1000);
    await storage.addScheduledPayoutAdditionalGross(experienceId, scheduledFor, paidCents);
  }

  const [creator, partner] = await Promise.all([
    storage.getUser(deal.creatorId),
    storage.getUser(partnerId),
  ]);
  if (creator?.email && experience) {
    await notificationService.sendPromotionOfferResponseEmail({
      to: creator.email,
      recipientName: creator.firstName,
      partnerName: `${partner?.firstName || ""} ${partner?.lastName || ""}`.trim() || partner?.email,
      experienceTitle: experience.title,
      experienceSlugOrId: experience.slug || experience.id,
      action: "accepted",
      dealType: deal.dealType,
      terms: deal.terms,
      currency: experience.currency,
    });
  }
  if (partner?.email && experience) {
    await notificationService.sendPartnershipConfirmedEmail({
      to: partner.email,
      partnerName: partner.firstName,
      eventName: experience.title,
      dealSummary: formatPromotionDealSummary(deal.dealType, deal.terms, experience.currency),
      eventKey: `partnership_confirmed:${deal.id}`,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getBookingByBalancePaymentIntent(piId: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.balancePaymentIntentId, piId));
  return booking;
}
