import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import Stripe from "stripe";
// Shared, pre-validated client. Importing it also runs the secret-key check,
// so a key pasted with a trailing newline fails at boot with a message naming
// the problem, rather than as an opaque StripeConnectionError at checkout.
import { stripe } from "./stripeClient";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { storage } from "./storage";
import { db } from "./db";
import { bookings, platformSettings, experiences, experienceMessages, experienceChatReads, users, participantProfiles, participantRoles, communityApplications, venues, serviceProviders, venueOffers, venueFlashDeals, reviews } from "@shared/schema";
import { eq, and, or, desc, asc, inArray, gt, gte, sql, ilike, ne } from "drizzle-orm";
import { z } from "zod";
import { paymentService } from "./payments";
import { initializeWebSocket, broadcastMVGUpdate, broadcastChatMessage } from "./websocket";
import { getSupabaseAdminClient, isAuthenticated, optionalAuth } from "./supabaseAuth";
import { notificationService, formatPromotionDealSummary } from "./notifications";
import { getLastEmailAttemptAt } from "./emailDeliveryLedger";
import { registerOGRoutes } from "./og";
import { 
  insertCommunityApplicationSchema, 
  insertParticipantProfileSchema, 
  insertCreatorProfileSchema, 
  insertPromoterProfileSchema,
  insertVenueAvailabilitySchema,
  insertExperienceDraftSchema,
  validateExperienceDraftForPublish,
  roomSchema,
  itinerarySchema,
  roleSchema,
  extendedInsertVenueSchema,
  venueFlashDealInputSchema
} from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { uploadImageToSupabase, uploadDocumentToSupabase } from "./supabaseStorage";
import { generateItinerary } from "./openai";
import { calculateBookingCommission, lockCommissionsForExperience, voidCommissionsForExperience } from "./commissionService";
import { handleStripeWebhook, finalizePromotionSponsorshipSession, finalizeVenueSponsorshipSession } from "./stripe-webhook";
import { scheduleExperiencePayout } from "./payout-scheduler";
import { sumBookingPayoutGrossCents } from "./payoutRules";
import {
  calculateTicketDeduction,
  normalizeTicketQuantity,
  sumBookingTicketQuantity,
} from "@shared/ticketDeduction";
import { normalizePromotionCounterTerms } from "./promotionDealRules";
import { normalizeCurrency, resolveBookingGrossValue, summarizeImpactEarnings } from "./impactLedger";
import { isVenueDealModel, isVenueDealSelectable, normalizeVenueDealTerms } from "./venueDealRules";
import {
  normalizeVenueDealModel,
  getVenueDealTermsKey,
  validateExperienceVenueDeal,
  calculateVenueEarnings,
  formatVenueDealSummary,
} from "@shared/venueDealModels";
import { resolveEventCapacity, summariseTicketTypes } from "@shared/inviteContext";
import { summariseReviewScore } from "@shared/reviewScore";
import { getRoleApplicationBlockReason } from "./participantRoleRules";
import { buildIcalFeed, startOfUtcDay } from "./ical";
import { toCalendarDate } from "@shared/calendarDates";
import { isPublicExperienceListable } from "@shared/publicExperienceVisibility";
import {
  ensureIcalExportToken,
  syncVenueIcalFeeds,
  findVenueDateConflicts,
  getConfirmedVenueEvents,
  blockVenueDatesForExperience,
  releaseVenueDatesForExperience,
} from "./icalSync";
import {
  calculateMvgDeadline,
  normalizeMvgDeadlineDays,
} from "./mvgDeadlineRules";
import { normalizeBuilderParticipantRoles } from "./participantRoleSync";
import { getDepositSchedule, isSingleDayExperience } from "@shared/depositRules";
import { scheduleCommunityHubUnreadJob, scheduleCreatorHubNudgeJob } from "./emailJobScheduler";
import { sendBookingNotificationsAfterPayment } from "./bookingEmailOrchestrator";
import { registerBookingFinalizer } from "./bookingFinalizer";
import { summarizeCreatorEarnings } from "./creatorEarnings";
import { persistInlineImageFields } from "./inlineImages";
import { isActivePostCheckoutBooking } from "./referralBookingRules";
import {
  getEmailPreferenceSettings,
  unsubscribeFromOptionalEmail,
  updateEmailPreferenceSettings,
} from "./emailPreferences";
import { verifyEmailPreferenceToken } from "./emailPreferenceTokens";
import {
  buildAppAuthActionUrl,
  getConfiguredPublicAppBaseUrl,
  getPublicAppBaseUrl,
} from "./publicUrl";

// ─── Base URL Helper ─────────────────────────────────────────────────────────
// Returns the canonical public URL for the app.
// Priority:
//   1. VITE_APP_BASE_URL env var  (same var used by the Vite client — one source of truth)
//   2. APP_BASE_URL env var       (legacy alias kept for backward compat)
//   3. Derived from the incoming request (works out of the box in dev)
function getAppBaseUrl(req: any): string {
  return getPublicAppBaseUrl(req);
}

const FIXED_PLATFORM_FEE_PCT = 15;
const ACTIVE_PARTICIPANT_BOOKING_STATUSES = new Set([
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
]);

function isActiveParticipantBooking(status: string | null | undefined): boolean {
  return ACTIVE_PARTICIPANT_BOOKING_STATUSES.has(status || "");
}

function parseRequestedTicketQuantity(value: unknown): number | null {
  const quantity = Number(value ?? 1);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

async function getAvailableTicketQuantity(
  experienceId: string,
  ticketSkuId: string,
  ticketCapacity: unknown,
  recordedSoldCount: unknown,
): Promise<number | null> {
  const capacity = Number(ticketCapacity);
  if (!Number.isFinite(capacity) || capacity < 0) return null;

  const existingBookings = await storage.getBookingsByExperience(experienceId);
  const bookedQuantity = sumBookingTicketQuantity(
    existingBookings.filter((booking) =>
      isActiveParticipantBooking(booking.status)
      && booking.ticketSkuId === ticketSkuId
    ),
  );
  const persistedSoldCount = Number(recordedSoldCount);
  const soldQuantity = Number.isFinite(persistedSoldCount)
    ? Math.max(bookedQuantity, persistedSoldCount)
    : bookedQuantity;

  return Math.max(0, capacity - soldQuantity);
}

function applyMarketplaceEconomics(input: any = {}) {
  const model = input.venueCompensationModel || "access_only";
  const revenueSharePct = model === "revenue_share"
    ? parseFloat(String(input.venueRevenueSharePct ?? input.venueRevenuePercentage ?? 0))
    : 0;
  const participantReferralDealType = input.participantReferralDealType ?? null;
  const participantReferralCommissionPct = numberOrZero(
    input.participantReferralCommissionPct
  );
  const derivedPromotionDealType = input.promotionDealType
    ?? null;
  const isCommissionPromotion = derivedPromotionDealType === "commission_per_ticket";

  return {
    ...input,
    platformPct: FIXED_PLATFORM_FEE_PCT,
    platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
    creatorPct: 100 - FIXED_PLATFORM_FEE_PCT,
    creatorRevenuePercentage: 100 - FIXED_PLATFORM_FEE_PCT,
    venueCompensationModel: model,
    venueFixedFee: input.venueFixedFee ?? "0.00",
    venuePerHeadAmount: input.venuePerHeadAmount ?? "0.00",
    venuePerRoomPerNight: input.venuePerRoomPerNight ?? "0.00",
    venueMinimumSpend: input.venueMinimumSpend ?? "0.00",
    venueRevenueSharePct: revenueSharePct,
    venueAccessFee: input.venueAccessFee ?? "0.00",
    venueRevenuePercentage: revenueSharePct,
    participantReferralDealType,
    participantReferralCommissionPct,
    promotionDealType: derivedPromotionDealType,
    influencerPromotionEnabled: isCommissionPromotion,
    promoterCommission: participantReferralCommissionPct,
  };
}

function numberOrZero(value: any): number {
  const parsed = parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTicketSkus(ticketSkus: any): any[] {
  if (!Array.isArray(ticketSkus)) return [];
  return ticketSkus.map((sku: any) => sku?.pricingMode === "free_rsvp"
    ? { ...sku, pricePerPerson: 0, minPrice: 0, suggestedPrice: null }
    : sku);
}

// Numeric columns on experience_drafts. The client sends "" for these while a
// step is still blank (e.g. price on step 1), which PostgreSQL rejects with
// "invalid input syntax for type numeric". Convert "" (and other non-numeric
// blanks) to null so the column falls back to its default / stays empty.
const DRAFT_NUMERIC_FIELDS = [
  // decimals
  "pricePerPerson", "price", "depositPercentage", "depositAmount", "balanceAmount",
  "expectedPayout", "platformCommission", "stripeFee", "influencerCommissionPct",
  "participantReferralCommissionPct",
  "promoterCommission", "creatorPct", "platformPct", "venueFixedFee", "venuePerHeadAmount",
  "venuePerRoomPerNight",
  "venueMinimumSpend", "venueRevenueSharePct", "venueAccessFee", "venueRevenuePercentage",
  "creatorRevenuePercentage", "platformRevenuePercentage", "promotionSponsorshipAmount",
  "venueTargetDealValue",
  // integers
  "maxParticipants", "manualVenueCapacity", "standingCapacity", "seatedCapacity",
  "roomCapacity", "totalRooms", "mvgMinimumSize", "mvgDeadlineDays", "balanceDueDays",
  "softHoldDurationHours", "currentStep", "promotionMilestoneAttendeeTarget",
  "promotionMilestoneRewardTickets", "participantReferralMilestoneAttendeeTarget",
];

function sanitizeDraftNumerics<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = { ...data };
  for (const field of DRAFT_NUMERIC_FIELDS) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === "" || value === null || value === undefined) {
      out[field] = null;
    } else if (typeof value === "string" && value.trim() === "") {
      out[field] = null;
    } else if (typeof value === "number" && Number.isNaN(value)) {
      out[field] = null;
    }
  }
  return out as T;
}

/**
 * Venues publish no prices. The columns still hold values written before that
 * changed, so strip them on the way out rather than leaving stale rates on the
 * wire for anything that reads the API. Room types keep their capacity and
 * lose their nightly rate the same way.
 *
 * Nothing is deleted from the database — this only controls what is served.
 */
const VENUE_PRICING_KEYS = [
  "pricingModel", "currency", "basePrice", "minStay", "depositPercent",
  "basePricePerDay", "basePricePerEvent", "cleaningFee", "useRoomPricesFromRoomsPage",
  "defaultPricePerRoomPerNight", "minimumNights", "paymentTimingModel",
  "softHoldDurationDays", "balanceDueDaysBeforeArrival", "pricingNotes",
  "softHoldDays", "commissionPercent", "paymentModel",
  "softHoldPolicyEnabled", "softHoldRefundableDeposit",
] as const;

function stripVenuePricing<T>(venue: T): T {
  if (!venue || typeof venue !== "object") return venue;
  const out: Record<string, any> = { ...(venue as any) };
  for (const key of VENUE_PRICING_KEYS) delete out[key];

  if (Array.isArray(out.venueRoomTypes)) {
    out.venueRoomTypes = out.venueRoomTypes.map((room: any) => {
      if (!room || typeof room !== "object") return room;
      const { pricePerNight, ...rest } = room;
      return rest;
    });
  }
  if (Array.isArray(out.services)) {
    out.services = out.services.map((service: any) => {
      if (!service || typeof service !== "object") return service;
      const { price, ...rest } = service;
      return rest;
    });
  }
  if (Array.isArray(out.venueRoles)) {
    out.venueRoles = out.venueRoles.map((role: any) => {
      if (!role || typeof role !== "object") return role;
      const { rate, ...rest } = role;
      return rest;
    });
  }
  return out as T;
}

function stripVenuePricingAll<T>(venues: T[]): T[] {
  return Array.isArray(venues) ? venues.map(stripVenuePricing) : venues;
}

/**
 * Rooms the creator is asking the venue to hold, summed from the Rooms step.
 * A Per Room / Per Night deal is billed against this, so it travels on the
 * contract rather than being re-derived by each side.
 */
function countRequestedRooms(input: any): number {
  const rooms = Array.isArray(input?.rooms) ? input.rooms : [];
  return rooms.reduce(
    (total: number, room: any) => total + (parseInt(room?.quantity, 10) || 0),
    0,
  );
}

function buildVenueContractObject(input: any, experienceId: string, venueId: string, creatorId: string) {
  const model = input.venueCompensationModel || "access_only";
  const singleDayEvent = isSingleDayExperience({
    experienceType: input.experienceType ?? input.type,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return {
    experienceId,
    venueId,
    creatorId,
    model,
    status: "pending",
    terms: {
      fixedFee: numberOrZero(input.venueFixedFee),
      perHeadAmount: numberOrZero(input.venuePerHeadAmount),
      perRoomPerNight: numberOrZero(input.venuePerRoomPerNight),
      roomCount: countRequestedRooms(input),
      minimumSpend: numberOrZero(input.venueMinimumSpend),
      revenueSharePct: model === "revenue_share"
        ? numberOrZero(input.venueRevenueSharePct ?? input.venueRevenuePercentage)
        : 0,
      accessFee: numberOrZero(input.venueAccessFee),
      currency: input.currency || "eur",
      platformPct: FIXED_PLATFORM_FEE_PCT,
      creatorPct: numberOrZero(input.creatorPct ?? input.creatorRevenuePercentage ?? (100 - FIXED_PLATFORM_FEE_PCT)),
    },
    risk: {
      requireMinimumParticipants: !!(input.requireMinimumParticipants ?? input.mvgEnabled),
      minimumParticipants: Number(input.minimumParticipants ?? input.mvgMinimumSize ?? input.mvgMin ?? 0) || 0,
      mvgDeadline: input.mvgDeadline ? new Date(input.mvgDeadline).toISOString() : null,
      depositEnabled: !singleDayEvent && !!input.depositEnabled,
      depositAmount: singleDayEvent ? 0 : numberOrZero(input.depositAmount),
      depositPercentage: singleDayEvent ? 0 : numberOrZero(input.depositPercentage),
      balanceDueDays: Number(input.balanceDueDays ?? 0) || 0,
      softHoldEnabled: !!input.softHoldEnabled,
      softHoldDurationHours: Number(input.softHoldDurationHours ?? 0) || 0,
    },
  };
}

/** How long a venue has to answer before the claim link stops working. */
const VENUE_INVITE_TTL_DAYS = 60;

/** Minimum gap between two invitation emails to the same venue. */
const VENUE_INVITE_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Creates (or refreshes) the tokenised invite behind an "Invite External Venue"
 * email. Returns undefined when the creator left the venue email blank.
 */
async function createVenueInviteForExperience(experience: any) {
  const email = String(experience?.manualVenueEmail || '').trim();
  if (!email) return undefined;

  return storage.upsertVenueInvite({
    token: randomBytes(24).toString('base64url'),
    experienceId: experience.id,
    creatorId: experience.creatorId,
    email,
    contactName: experience.manualVenueContactName || null,
    venueName: experience.manualVenueName || null,
    venueAddress: experience.manualVenueAddress || null,
    venueCity: experience.location || null,
    venueDescription: experience.manualVenueDescription || null,
    venueCapacity: experience.manualVenueCapacity ?? null,
    propertyUrl: experience.manualVenuePropertyUrl || null,
    proposedModel: experience.venueTargetDeal || null,
    proposedValue: experience.venueTargetDealValue ?? null,
    currency: (experience.currency || 'eur').toLowerCase(),
    status: 'pending',
    expiresAt: new Date(Date.now() + VENUE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  } as any);
}

function buildRequestedVenueContractObject(input: any) {
  const model = normalizeVenueDealModel(input.venueTargetDeal) || "access_only";
  const targetValue = numberOrZero(input.venueTargetDealValue);
  const terms: Record<string, number | string> = {
    currency: input.currency || "eur",
    platformPct: FIXED_PLATFORM_FEE_PCT,
    roomCount: countRequestedRooms(input),
  };

  // Each model stores its number under its own key — the vocabulary owns that
  // mapping so a new deal type cannot be half-wired.
  const termsKey = getVenueDealTermsKey(model);
  if (termsKey) {
    terms[termsKey] = targetValue;
  }

  return {
    model,
    status: "creator_request",
    terms,
    risk: {
      requireMinimumParticipants: !!(input.requireMinimumParticipants ?? input.mvgEnabled),
      minimumParticipants: Number(input.minimumParticipants ?? input.mvgMinimumSize ?? input.mvgMin ?? 0) || 0,
    },
  };
}

function getExperienceUpdatesFromAcceptedContract(contract: any) {
  const terms = contract?.terms || {};
  return applyMarketplaceEconomics({
    venueCompensationModel: normalizeVenueDealModel(contract.model) || "access_only",
    venueFixedFee: terms.fixedFee ?? 0,
    venuePerHeadAmount: terms.perHeadAmount ?? 0,
    venuePerRoomPerNight: terms.perRoomPerNight ?? 0,
    venueMinimumSpend: terms.minimumSpend ?? 0,
    venueRevenueSharePct: terms.revenueSharePct ?? 0,
    venueAccessFee: terms.accessFee ?? 0,
    venueRevenuePercentage: terms.revenueSharePct ?? 0,
  });
}

// ─── Lifecycle Status Helper ────────────────────────────────────────────────
// Single source of truth: FORMING → CONFIRMED → CANCELLED
// Uses DB fields only so it works without extra queries.
function computeLifecycleStatus(exp: {
  status: string;
  mvgStatus?: string | null;
  requireMinimumParticipants?: boolean | null;
  mvgMet?: boolean; // optional live-count override
}): 'forming' | 'confirmed' | 'cancelled' {
  const mvgStatus = exp.mvgMet ? 'met' : (exp.mvgStatus || 'pending');
  // Cancelled wins over everything
  if (exp.status === 'cancelled' || mvgStatus === 'failed') return 'cancelled';
  // Confirmed if MVG met or no minimum group required
  if (mvgStatus === 'met' || !exp.requireMinimumParticipants) return 'confirmed';
  // Still forming (MVG enabled, threshold not yet reached)
  return 'forming';
}

async function resolveMvgActivationBlock(experienceId: string) {
  const { processMVGExperienceDeadline } = await import('./mvg-scheduler');
  await processMVGExperienceDeadline(experienceId);

  const current = await storage.getExperience(experienceId);
  if (!current) throw new Error('Experience not found');
  if (current.status === 'cancelled' || current.mvgStatus === 'failed') {
    return {
      experience: current,
      message: current.cancellationReason || 'The MVG deadline expired before publication.',
    };
  }
  return null;
}

async function approveExperienceForPublication(
  experienceId: string,
  reviewedBy: string,
  reviewNotes?: string,
) {
  const activationBlock = await resolveMvgActivationBlock(experienceId);
  if (activationBlock) {
    return {
      ...activationBlock.experience,
      publicationBlocked: true,
      message: activationBlock.message,
    };
  }

  const approved = await storage.approveExperience(experienceId, reviewedBy, reviewNotes);
  notifyCreatorEventPublished(approved).catch((error) => {
    console.error("Failed to send event published email:", error);
  });
  return {
    ...approved,
    publicationBlocked: false,
    message: 'Experience approved and published.',
  };
}

function publicExperienceSlugOrId(experience: any): string {
  return String(experience?.slug || experience?.id || "");
}

async function notifyCreatorEventSubmittedForReview(experience: any): Promise<void> {
  if (!experience?.creatorId || experience.status === "draft") return;
  const creator = await storage.getUser(experience.creatorId);
  if (!creator?.email) return;

  await notificationService.sendEventSubmittedForReviewEmail({
    to: creator.email,
    creatorName: creator.firstName,
    eventName: experience.title || "your experience",
    eventKey: `event_submitted:${experience.id}`,
  });
}

async function notifyCreatorEventPublished(experience: any): Promise<void> {
  if (!experience || experience.publicationBlocked || !experience.creatorId) return;
  const creator = await storage.getUser(experience.creatorId);
  if (creator?.email) {
    await notificationService.sendEventPublishedEmail({
      to: creator.email,
      creatorName: creator.firstName,
      eventName: experience.title || "your experience",
      eventSlugOrId: publicExperienceSlugOrId(experience),
      eventKey: `event_published:${experience.id}`,
    });
  }

  notifyCommunityOpenRoleAlerts(experience).catch((error) => {
    console.error("Failed to send open role referral alerts:", error);
  });
}

function publicAppBaseUrl(): string {
  return getConfiguredPublicAppBaseUrl();
}

function cityFromLocation(location?: string | null): string {
  const raw = String(location || '').trim();
  if (!raw) return 'your area';
  return raw.split(',')[0]?.trim() || raw;
}

function normalizedTerms(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').toLowerCase().trim()).filter(Boolean)
    : [];
}

function roleMatchesProfile(role: any, profile: any, city: string): boolean {
  const haystack = [
    profile.location,
    ...(profile.skills || []),
    ...(profile.interests || []),
    ...(profile.rolePreferences || []),
    ...(profile.professionalInterests || []),
  ].join(' ').toLowerCase();
  const cityMatch = city === 'your area' || haystack.includes(city.toLowerCase());
  const roleTerms = [
    role.name,
    ...normalizedTerms(role.requirements),
    ...normalizedTerms(role.responsibilities),
  ].map((value) => String(value || '').toLowerCase());
  const skillMatch = roleTerms.some((term) => term && haystack.includes(term));
  return cityMatch && (skillMatch || Boolean(profile.willingToTakeRoles));
}

async function notifyCommunityOpenRoleAlerts(experience: any): Promise<void> {
  if (!experience || (experience.status !== 'approved' && experience.status !== 'published')) return;
  const roles = await syncBuilderParticipantRoles(experience);
  const openRoles = roles.filter((role: any) => (role.currentCount || 0) < (role.maxCount || 1));
  if (!openRoles.length) return;

  const city = cityFromLocation(experience.location);
  const baseUrl = publicAppBaseUrl();
  const profileRows = await db
    .select({ user: users, profile: participantProfiles })
    .from(participantProfiles)
    .innerJoin(users, eq(participantProfiles.userId, users.id))
    .where(and(eq(participantProfiles.willingToTakeRoles, true), ne(users.id, experience.creatorId)))
    .limit(Number(process.env.ROLE_ALERT_MAX_PROFILES || 200));

  for (const role of openRoles) {
    let sentForRole = 0;
    for (const row of profileRows) {
      if (!row.user.email || !roleMatchesProfile(role, row.profile, city)) continue;
      const key = `${experience.id}:${role.id}:${row.user.id}`;

      const referralCode = row.user.promoterCode || await storage.ensureUserReferralCode(row.user.id);
      const params = new URLSearchParams({ ref: referralCode, role: role.id });
      if ((experience as any).shareToken) params.set('share', (experience as any).shareToken);
      const referralUrl = `${baseUrl}/experience/${publicExperienceSlugOrId(experience)}?${params.toString()}`;

      const delivery = await notificationService.sendOpenRoleReferralAlertEmail({
        to: row.user.email,
        userFirstName: row.user.firstName,
        roleName: role.name,
        city,
        eventName: experience.title || 'a new experience',
        eventSlugOrId: publicExperienceSlugOrId(experience),
        referralUrl,
        eventKey: `open_role_referral:${key}`,
      });

      if (!delivery.duplicate) sentForRole += 1;
      if (sentForRole >= Number(process.env.ROLE_ALERT_MAX_RECIPIENTS_PER_ROLE || 25)) break;
    }
  }
}

async function syncBuilderParticipantRoles(experience: any) {
  const normalizedRoles = normalizeBuilderParticipantRoles(
    experience.id,
    experience.roles,
  );
  const existingRoles = await storage.getParticipantRolesByExperience(experience.id);
  const existingNames = new Set(
    existingRoles.map((role) => role.name.trim().toLowerCase()),
  );
  let createdRole = false;

  for (const role of normalizedRoles) {
    if (!existingNames.has(role.name.toLowerCase())) {
      await storage.createParticipantRole(role);
      existingNames.add(role.name.toLowerCase());
      createdRole = true;
    }
  }

  return createdRole
    ? storage.getParticipantRolesByExperience(experience.id)
    : existingRoles;
}

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image MIME types
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
  }
});

// Stripe refuses any charge below a per-currency floor (€0.50, £0.30, …).
// Pay-what-you-want tickets let a buyer land between zero and that floor, which
// otherwise surfaces as an opaque 500 from paymentIntents.create.
const STRIPE_MINIMUM_CHARGE_MINOR_UNITS: Record<string, number> = {
  eur: 50, usd: 50, gbp: 30, chf: 50, cad: 50, aud: 50, nzd: 50,
  dkk: 250, nok: 300, sek: 300, pln: 200, ron: 200, czk: 1500, huf: 17500,
};

function getStripeMinimumChargeMinorUnits(currency: string): number {
  return STRIPE_MINIMUM_CHARGE_MINOR_UNITS[currency.toLowerCase()] ?? 50;
}

// Safe helper function to convert values to ISO strings
function safeToISOString(value: any): string | null {
  if (!value && value !== 0) return null;
  // If already a Date
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  // If ISO string or other string/number, try to convert:
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null; // fallback - not a valid date
}

// Generate URL-friendly slug from venue name and city
function generateVenueSlug(name: string, city: string): string {
  // Combine name and city
  const combined = `${name} ${city}`;
  
  // Convert to lowercase and replace spaces/special chars with hyphens
  const slug = combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
    .replace(/-+/g, '-');          // Replace multiple hyphens with single
  
  return slug;
}

// Revenue calculation utility
function calculateRoleBasedRevenueBreakdown(
  grossAmount: number, 
  creatorRole: string, 
  options: {
    supportLevel?: string;
    facilitatorServices?: string[];
    influencerRevShare?: number;
    facilitatorBaseCommission?: number;
  } = {}
) {
  const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30); // 2.9% + 30¢
  
  let platformFeePercentage: number;
  let roleDescription: string;
  let supportDescription: string;
  
  if (creatorRole === 'facilitator') {
    // Creator runs the entire experience - pays platform fee + additive services
    // Use additive model to match client-side calculation
    const { facilitatorServices = [], facilitatorBaseCommission = 20 } = options;
    
    let commission = facilitatorBaseCommission;
    const serviceDescriptions: string[] = ['Basic platform (booking, community, payments)'];
    
    // Additive commission calculation (matches client logic)
    if (facilitatorServices.includes('enhanced_support')) {
      commission += 6;
      serviceDescriptions.push('Enhanced support (+6%)');
    }
    if (facilitatorServices.includes('full_service')) {
      commission += 8;
      serviceDescriptions.push('Full service (+8%)');
    }
    if (facilitatorServices.includes('marketing')) {
      commission += 5;
      serviceDescriptions.push('Marketing (+5%)');
    }
    if (facilitatorServices.includes('logistics')) {
      commission += 3;
      serviceDescriptions.push('Logistics (+3%)');
    }
    
    // Cap at 34% to match client
    platformFeePercentage = Math.min(commission, 34);
    roleDescription = 'Experience Facilitator - you run the experience';
    supportDescription = serviceDescriptions.join(', ');
  } else {
    // Creator is network influencer - configurable revenue share
    const { influencerRevShare = 25 } = options;
    platformFeePercentage = 100 - influencerRevShare; // Platform takes remainder
    roleDescription = 'Network Influencer - Great provides facilitator';
    supportDescription = `Great manages all operations, you get ${influencerRevShare}% revenue share`;
  }
  
  // Deduct Stripe fees first (consistent across both models)
  const netAmountAfterStripe = grossAmount - stripeFeeAmount;
  const platformFeeAmount = Math.round(netAmountAfterStripe * (platformFeePercentage / 100));
  const netAmount = netAmountAfterStripe - platformFeeAmount;
  
  return {
    grossAmount,
    platformFeeAmount,
    platformFeePercentage,
    stripeFeeAmount,
    netAmount: Math.max(0, netAmount),
    currency: 'usd',
    creatorRole,
    supportLevel: options.supportLevel || 'custom',
    facilitatorServices: options.facilitatorServices || [],
    influencerRevShare: options.influencerRevShare || 25,
    roleDescription,
    supportDescription,
    feeDescription: `${creatorRole === 'facilitator' ? 'Platform Fee' : 'Revenue Share'} (${platformFeePercentage}%)`
  };
}

// Venue-aware revenue calculation utility for venue partnership scenarios
function calculateVenueSplitRevenueBreakdown(grossAmount: number, venuePercentage: number, creatorPercentage: number, platformPercentage: number) {
  // Validate percentages add up to 100%
  if (Math.abs((venuePercentage + creatorPercentage + platformPercentage) - 100) > 0.01) {
    throw new Error('Venue, creator, and platform percentages must add up to 100%');
  }
  
  // Validate individual percentages
  if (venuePercentage < 0 || venuePercentage > 100 || 
      creatorPercentage < 0 || creatorPercentage > 100 || 
      platformPercentage < 0 || platformPercentage > 100) {
    throw new Error('All percentages must be between 0 and 100');
  }

  // Calculate Stripe fee (2.9% + 30¢) - deducted from gross before splits
  const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30);
  const netAmountAfterStripe = grossAmount - stripeFeeAmount;
  
  // Calculate venue split amounts from the net amount after Stripe fees
  const venueShareAmount = Math.round(netAmountAfterStripe * (venuePercentage / 100));
  const creatorShareAmount = Math.round(netAmountAfterStripe * (creatorPercentage / 100));
  const platformShareAmount = netAmountAfterStripe - venueShareAmount - creatorShareAmount; // Remainder to platform
  
  return {
    grossAmount,
    stripeFeeAmount,
    netAmountAfterStripe,
    venueShareAmount,
    venuePercentage,
    creatorShareAmount,
    creatorPercentage,
    platformShareAmount,
    platformPercentage,
    currency: 'usd',
    breakdown: {
      venue: {
        amount: venueShareAmount,
        percentage: venuePercentage,
        description: `Venue revenue share (${venuePercentage}%)`
      },
      creator: {
        amount: creatorShareAmount,
        percentage: creatorPercentage,
        description: `Creator revenue share (${creatorPercentage}%)`
      },
      platform: {
        amount: platformShareAmount,
        percentage: platformPercentage,
        description: `Platform revenue share (${platformPercentage}%)`
      },
      stripe: {
        amount: stripeFeeAmount,
        description: 'Stripe payment processing fee (2.9% + $0.30)'
      }
    },
    summary: {
      grossRevenue: grossAmount,
      stripeFees: stripeFeeAmount,
      netRevenueAfterStripe: netAmountAfterStripe,
      venueShare: venueShareAmount,
      creatorShare: creatorShareAmount,
      platformShare: platformShareAmount
    }
  };
}

// ─── Admin Auth Helper ────────────────────────────────────────────────────────
// Returns true if the request comes from a user with admin role in the DB.
// Falls back to the bootstrap email so the initial admin never gets locked out.
const BOOTSTRAP_ADMIN_EMAIL = "timtheeuwsen@gmail.com";

async function checkIsAdmin(req: any): Promise<boolean> {
  const email: string | undefined = req.user?.claims?.email;
  const userId: string | undefined = req.user?.claims?.sub;
  if (!userId && !email) return false;
  if (email === BOOTSTRAP_ADMIN_EMAIL) return true;
  if (userId) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
    const dbUser = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);
    if (!dbUser) return false;
    return dbUser.role === 'admin';
  }
  return false;
}

/**
 * The deal's number as stored on the experience row.
 *
 * A contract written before its terms blob was populated still has the value
 * in the experience's own columns, so the ledger falls back to them rather
 * than reporting zero.
 */
function readExperienceVenueDealValueFor(experience: any, model: unknown): unknown {
  switch (normalizeVenueDealModel(model)) {
    case "revenue_share": return experience?.venueRevenueSharePct ?? experience?.venueRevenuePercentage;
    case "fixed_fee":
    case "upfront_rental":
    case "venue_sponsored": return experience?.venueFixedFee;
    case "per_head": return experience?.venuePerHeadAmount;
    case "per_room_night": return experience?.venuePerRoomPerNight;
    case "minimum_spend": return experience?.venueMinimumSpend;
    default: return undefined;
  }
}

function normalizeGreatPillarsPayload(value: unknown): string[] {
  const allowed = new Set(["health", "sports", "wellness", "food"]);
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return rawValues
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => allowed.has(item));
}

/**
 * An Event Builder payload → an `experiences` row.
 *
 * Publishing a draft and editing an event that is already live both translate
 * the same builder payload, so they share this one mapping. Splitting them
 * would let an edit quietly write a field differently from the way publishing
 * wrote it.
 */
function buildExperienceFromBuilderPayload(draft: any, userId: string) {
    // Convert date strings to Date objects
    const experienceType = (draft.type as "one-day" | "multi-day" | "virtual") || "one-day";
    const isSingleDayEvent = experienceType === "one-day";
    const isMultiDayTrip = experienceType === "multi-day";
    const startDate = draft.startDate ? new Date(draft.startDate) : new Date();
    const endDate = isSingleDayEvent
      ? startDate
      : (draft.endDate ? new Date(draft.endDate) : startDate);
    const normalizedRooms = isMultiDayTrip ? (draft.rooms || []) : [];
    const sleepingCapacity = normalizedRooms.reduce((total: number, room: any) => {
      const capacity = Number(room?.capacity || 0);
      const quantity = Number(room?.quantity || 0);
      return total + capacity * quantity;
    }, 0);
    const normalizedMaxParticipants = isSingleDayEvent
      ? Number((draft as any).standingCapacity || (draft as any).seatedCapacity || draft.maxParticipants || 1)
      : (sleepingCapacity || draft.maxParticipants || 10);
    const resolvedMvgEnabled = draft.mvgEnabled !== undefined
      ? draft.mvgEnabled
      : ((draft as any).requireMinimumParticipants !== undefined ? (draft as any).requireMinimumParticipants : true);
      
    // A zero-day setting stays open through the end of the event's start date.
    const mvgDeadlineDays = normalizeMvgDeadlineDays(draft.mvgDeadlineDays);
    const mvgDeadline = resolvedMvgEnabled
      ? calculateMvgDeadline(startDate, mvgDeadlineDays)
      : null;
    
    // Check if this is a demo event for placeholder image fallback
    const isDemoEvent = draft.title?.toLowerCase().includes('mystic') && 
                       draft.title?.toLowerCase().includes('marrakesh');
    
    // Default placeholder cover image for Marrakesh demo
    const defaultMarrakeshImage = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400";
    
    // Use placeholder image for demo if cover image is missing/empty
    const coverImageUrl = (isDemoEvent && (!draft.coverImageUrl || draft.coverImageUrl.trim() === '')) 
      ? defaultMarrakeshImage 
      : draft.coverImageUrl;
    
    // Service and Amenity mappings for converting IDs to structured objects
    const serviceMap: Record<string, { name: string; description: string }> = {
      yoga_instructor: { name: 'Yoga Instructor', description: 'Certified yoga instructor for sessions' },
      meditation_guide: { name: 'Meditation Guide', description: 'Guided meditation and mindfulness' },
      personal_trainer: { name: 'Personal Trainer', description: 'One-on-one fitness coaching' },
      massage_therapist: { name: 'Massage Therapist', description: 'Professional massage services' },
      nutrition_coach: { name: 'Nutrition Coach', description: 'Dietary guidance and meal planning' },
      hiking_guide: { name: 'Hiking Guide', description: 'Experienced trail guide and safety' },
      climbing_instructor: { name: 'Climbing Instructor', description: 'Rock climbing and safety instruction' },
      surf_instructor: { name: 'Surf Instructor', description: 'Surfing lessons and water safety' },
      dive_instructor: { name: 'Dive Instructor', description: 'Scuba diving instruction and certification' },
      kayak_guide: { name: 'Kayak Guide', description: 'Kayaking instruction and tours' },
      language_tutor: { name: 'Language Tutor', description: 'Local language instruction' },
      cultural_guide: { name: 'Cultural Guide', description: 'Local culture and history expert' },
      cooking_instructor: { name: 'Cooking Instructor', description: 'Local cuisine cooking classes' },
      art_instructor: { name: 'Art Instructor', description: 'Creative arts and crafts guidance' },
      music_instructor: { name: 'Music Instructor', description: 'Musical instrument or vocal instruction' },
      photographer: { name: 'Photographer', description: 'Professional photography services' },
      videographer: { name: 'Videographer', description: 'Video production and editing' },
      chef: { name: 'Chef/Cook', description: 'Professional culinary services' },
      driver: { name: 'Driver/Guide', description: 'Transportation and local guiding' },
      childcare_provider: { name: 'Childcare Provider', description: 'Professional childcare services' },
    };

    const amenityMap: Record<string, { name: string; description: string }> = {
      wifi: { name: 'Wi-Fi', description: 'High-speed internet access' },
      projector: { name: 'Projector/Screen', description: 'Presentation equipment' },
      sound_system: { name: 'Sound System', description: 'Audio equipment and speakers' },
      charging_stations: { name: 'Charging Stations', description: 'Device charging areas' },
      pool: { name: 'Swimming Pool', description: 'Swimming and water activities' },
      spa: { name: 'Spa/Hot Tub', description: 'Relaxation and wellness facilities' },
      sauna: { name: 'Sauna', description: 'Steam and heat therapy' },
      gym: { name: 'Gym/Fitness Center', description: 'Exercise equipment and facilities' },
      yoga_studio: { name: 'Yoga/Movement Studio', description: 'Dedicated space for movement practices' },
      fire_pit: { name: 'Fire Pit/Bonfire Area', description: 'Outdoor gathering and warmth' },
      bbq_grill: { name: 'BBQ/Grill', description: 'Outdoor cooking facilities' },
      garden: { name: 'Garden/Terrace', description: 'Outdoor space and nature' },
      sports_court: { name: 'Sports Court', description: 'Basketball, tennis, or multi-sport' },
      hiking_trails: { name: 'Hiking Trails', description: 'Walking and nature paths' },
      full_kitchen: { name: 'Full Kitchen', description: 'Complete cooking facilities' },
      dining_area: { name: 'Dining Area', description: 'Shared meal space' },
      coffee_station: { name: 'Coffee Station', description: 'Coffee and tea facilities' },
      outdoor_dining: { name: 'Outdoor Dining', description: 'Al fresco eating area' },
      air_conditioning: { name: 'Air Conditioning', description: 'Climate control' },
      heating: { name: 'Heating', description: 'Warmth and comfort' },
      parking: { name: 'Parking', description: 'Vehicle parking space' },
      laundry: { name: 'Laundry Facilities', description: 'Washing and drying' },
      library: { name: 'Library/Reading Area', description: 'Quiet space with books' },
    };

    // Convert selectedServiceIds to structured service objects
    const services = isMultiDayTrip && Array.isArray((draft as any).selectedServiceIds)
      ? (draft as any).selectedServiceIds.map((id: string) => ({
          id,
          name: serviceMap[id]?.name || id,
          description: serviceMap[id]?.description,
          custom: !serviceMap[id], // Mark as custom if not in standard list
          approvedByAdmin: false
        }))
      : [];

    // Convert selectedAmenityIds to structured amenity objects
    const amenities = isMultiDayTrip && Array.isArray((draft as any).selectedAmenityIds)
      ? (draft as any).selectedAmenityIds.map((id: string) => ({
          id,
          name: amenityMap[id]?.name || id,
          description: amenityMap[id]?.description,
          custom: !amenityMap[id], // Mark as custom if not in standard list
          approvedByAdmin: false
        }))
      : [];

    // Get roles from draft
    const roles = Array.isArray((draft as any).roles) ? (draft as any).roles : [];
    const resolvedPrice = Number((draft as any).pricePerPerson || draft.price || 0);
    const resolvedParticipantReferralDealType = (draft as any).participantReferralDealType ?? null;
    const resolvedParticipantReferralCommissionPct =
      (draft as any).participantReferralCommissionPct ?? "0.00";
    
    // Prepare experience data from draft with explicit type mapping
    const experienceData = applyMarketplaceEconomics({
      title: draft.title || '',
      description: draft.description || '',
      shortDescription: draft.shortDescription,
      category: (draft.category as "sports_wellness" | "retreats" | "community_social" | "adventure_trips" | "workations" | "festivals_events") || "community_social" as const,
      experienceType,
      greatPillars: normalizeGreatPillarsPayload((draft as any).greatPillars),
      coverImageUrl,
      gallery: draft.gallery || [],
      location: draft.location || '',
      venue: draft.venue,
      startDate,
      endDate,
      startTime: isSingleDayEvent ? (draft as any).startTime || null : null,
      endTime: isSingleDayEvent ? (draft as any).endTime || null : null,
      maxParticipants: normalizedMaxParticipants,
      currentParticipants: 0,
      price: resolvedPrice.toString(),
      pricePerPerson: resolvedPrice.toString(),
      currency: draft.currency || 'usd',
      depositEnabled: !!draft.depositEnabled || (Array.isArray((draft as any).ticketSkus)
        && (draft as any).ticketSkus.some((sku: any) => numberOrZero(sku?.depositPerPerson) > 0)),
      depositPercentage: draft.depositPercentage,
      depositAmount: (draft as any).depositAmount || null,
      balanceDueDays: draft.balanceDueDays || 14,
      creatorId: userId,
      status: "pending_approval" as const,
      submittedAt: new Date(),

      // ── Open-to-Venue-Offers fields ──────────────────────────────────────
      // Stored so the venue discovery feed can match venues by city + space type.
      venueType: (draft as any).venueType || null,
      manualVenueName: (draft as any).manualVenueName || null,
      manualVenueAddress: (draft as any).manualVenueAddress || null,
      manualVenueContactName: (draft as any).manualVenueContactName || null,
      manualVenueEmail: (draft as any).manualVenueEmail || null,
      manualVenuePropertyUrl: (draft as any).manualVenuePropertyUrl || null,
      manualVenueDescription: (draft as any).manualVenueDescription || null,
      venueOpenSpaceType: (draft as any).venueOpenSpaceType || null,
      // venueTargetDeal is a preference, not a binding contract — it tells bidding venues
      // what commercial model the creator is hoping for.
      venueTargetDeal: (draft as any).venueTargetDeal || null,
      venueTargetDealValue: (draft as any).venueTargetDealValue || null,
      // venue_pending means no venue is confirmed yet; venue_confirmed for all other modes.
      venueStatus: (draft as any).venueType === "open" ? "venue_pending" : "venue_confirmed",

      // Venue mapping: map selectedVenueId to linkedVenueId.
      // For open bids, linkedVenueId stays null until a venue accepts —
      // it gets populated when the Digital Handshake is completed.
      linkedVenueId: (draft as any).venueType === "open" ? null : ((draft as any).selectedVenueId || null),
      venueCompensationModel: ((draft as any).selectedVenueId && (draft as any).venueType !== "open")
        ? ((draft as any).venueCompensationModel || "access_only")
        : "access_only",
      venueFixedFee: (draft as any).venueFixedFee || "0.00",
      venuePerHeadAmount: (draft as any).venuePerHeadAmount || "0.00",
      venueMinimumSpend: (draft as any).venueMinimumSpend || "0.00",
      venueRevenueSharePct: (draft as any).venueRevenueSharePct || (draft as any).venueRevenuePercentage || "0.00",
      venueAccessFee: (draft as any).venueAccessFee || "0.00",

      // ── Self-Hosted / Manual Address logic ──────────────────────────────
      // If no platform Space is linked the creator is bringing their own venue.
      // Rules:
      //   1. Space revenue share is forced to 0% — no external venue gets a cut.
      //   2. The creator absorbs that % (their share = 100% - platform fee).
      //   3. No Space Handshake needed — experience publishes immediately.
      venueRevenuePercentage: ((draft as any).selectedVenueId)
        ? String(draft.venueRevenuePercentage ?? '0.00')   // platform Space: keep draft value
        : '0.00',                                           // self-hosted: always 0%

      // MVG field mapping: Map frontend MVG fields to backend schema fields
      // Use type assertion for fields that may exist from frontend but not in strict type
      requireMinimumParticipants: resolvedMvgEnabled,
      mvgEnabled: resolvedMvgEnabled,
      // mvgMinimumSize (draft) → minimumParticipants, mvgMinimumSize, mvgMin (experience)
      // Note: Frontend sends as minimumParticipants but draft schema stores as mvgMinimumSize
      minimumParticipants: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
      mvgMinimumSize: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
      mvgMin: draft.mvgMinimumSize || (draft as any).minimumParticipants || 6,
      // Persist the absolute deadline used by the scheduler and public countdowns.
      mvgDeadline,
      mvgStatus: resolvedMvgEnabled ? "pending" as const : undefined,
      escrowEnabled: resolvedMvgEnabled || false,
      monetisationMode: "creator_led" as const,
      participantReferralDealType: resolvedParticipantReferralDealType,
      participantReferralCommissionPct: resolvedParticipantReferralCommissionPct,
      participantReferralMilestoneAttendeeTarget:
        (draft as any).participantReferralMilestoneAttendeeTarget ?? null,
      participantReferralMilestoneRewardDescription: (draft as any).participantReferralMilestoneRewardDescription || null,
      promotionDealType: (draft as any).promotionDealType
        ?? null,
      promotionMilestoneAttendeeTarget: (draft as any).promotionMilestoneAttendeeTarget || null,
      promotionMilestoneRewardTickets: (draft as any).promotionMilestoneRewardTickets || null,
      promotionBrandPitch: (draft as any).promotionBrandPitch || null,
      promotionSponsorshipAmount: (draft as any).promotionSponsorshipAmount || null,
      promotionSelectedPartnerIds: Array.isArray((draft as any).promotionSelectedPartnerIds)
        ? (draft as any).promotionSelectedPartnerIds
        : [],
      promotionExternalInvites: Array.isArray((draft as any).promotionExternalInvites)
        ? (draft as any).promotionExternalInvites
        : [],
      promoterEnabled: (draft as any).promoterEnabled ?? true,
      influencerCommissionPct: (draft as any).influencerCommissionPct || "0.00",
      promoterCommission: resolvedParticipantReferralCommissionPct,
      commissionMode: resolvedParticipantReferralDealType === "commission_per_ticket" ? "percent" : null,
      commissionValue: resolvedParticipantReferralDealType === "commission_per_ticket"
        ? resolvedParticipantReferralCommissionPct
        : null,
      commissionBasis: resolvedParticipantReferralDealType === "commission_per_ticket" ? "per_spot" : null,
      
      // Revenue split fields
      // Self-hosted: creator gets back whatever % was earmarked for the Space.
      // Platform Space: use the split exactly as the creator configured it.
      ...((() => {
        const isLinked = !!((draft as any).selectedVenueId);
        const platformPct = parseFloat(String(draft.platformPct ?? draft.platformRevenuePercentage ?? 15));
        const venuePct    = isLinked ? parseFloat(String((draft as any).venueRevenuePercentage ?? 0)) : 0;
        const creatorPct  = Math.max(0, 100 - platformPct - venuePct);
        return {
          creatorPct,
          platformPct,
          creatorRevenuePercentage: creatorPct,
          platformRevenuePercentage: platformPct,
        };
      })()),
      
      // Soft-hold fields
      softHoldEnabled: draft.softHoldEnabled || false,
      softHoldDurationHours: draft.softHoldDurationHours || 48,
      
      // Services, Amenities, and Roles
      services,
      amenities,
      roles,
      
      // Itinerary/Plan
      itinerary: (draft as any).itinerary || [],
      
      // Rooms and accommodation
      rooms: normalizedRooms,
      ticketSkus: (((draft as any).ticketSkus && (draft as any).ticketSkus.length > 0)
        ? normalizeTicketSkus((draft as any).ticketSkus)
        : normalizedRooms.map((room: any, index: number) => ({
            id: `sku-${Date.now()}-${index}`,
            sourceRoomId: room.id || `room-${index}`,
            ticketName: room.name || `Ticket ${index + 1}`,
            pricePerPerson: room.pricePerPerson || 0,
            ticketCapacity: room.quantity || 0,
            soldCount: 0,
            depositEnabled: room.depositEnabled || false,
            depositType: room.depositType || 'fixed',
            depositPerPerson: room.depositAmount || 0,
            notes: room.notes || '',
            gallery: room.gallery || [],
          }))),
      accommodationType: isMultiDayTrip ? draft.accommodationType : null,
      
      // Virtual meeting fields
      virtualMeetingUrl: draft.virtualMeetingUrl,
      virtualPlatform: draft.virtualPlatform,
      virtualInstructions: draft.virtualInstructions,
      
      // Terms and conditions mapping
      termsAndConditions: (draft as any).customTerms || null,
      termsDocumentUrl: draft.termsDocumentUrl || null,
      
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  return experienceData;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const emailFromPreferenceToken = (req: any): string => {
    const token = String(req.query?.token || req.body?.token || "");
    if (!token) throw new Error("A valid email preference link is required");
    return verifyEmailPreferenceToken(token).email;
  };

  const maskedEmail = (email: string): string => {
    const [local, domain] = email.split("@");
    if (!domain) return "your email address";
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
  };

  app.get("/api/email-preferences", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const email = emailFromPreferenceToken(req);
      const preferences = await getEmailPreferenceSettings(email);
      res.json({ email: maskedEmail(email), preferences });
    } catch {
      res.status(400).json({ message: "This email preference link is invalid or has expired." });
    }
  });

  app.put("/api/email-preferences", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const email = emailFromPreferenceToken(req);
      const source = req.body?.preferences || req.body || {};
      const keys = ["communityEmailsEnabled", "reminderEmailsEnabled", "marketingEmailsEnabled"] as const;
      if (keys.some((key) => typeof source[key] !== "boolean")) {
        return res.status(400).json({ message: "All email preference values are required." });
      }
      const preferences = await updateEmailPreferenceSettings(email, {
        communityEmailsEnabled: source.communityEmailsEnabled,
        reminderEmailsEnabled: source.reminderEmailsEnabled,
        marketingEmailsEnabled: source.marketingEmailsEnabled,
      });
      res.json({ email: maskedEmail(email), preferences });
    } catch {
      res.status(400).json({ message: "This email preference link is invalid or has expired." });
    }
  });

  app.post("/api/email-preferences/unsubscribe", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const email = emailFromPreferenceToken(req);
      const preferences = await unsubscribeFromOptionalEmail(email);
      res.json({ email: maskedEmail(email), preferences, unsubscribed: true });
    } catch {
      res.status(400).json({ message: "This unsubscribe link is invalid or has expired." });
    }
  });

  // Populate req.user from the Bearer token on every API request (non-blocking).
  // Without this, routes that read req.user.claims.sub but lack the isAuthenticated
  // middleware crash in production with "Cannot read properties of undefined
  // (reading 'claims')". Routes that must enforce auth still use isAuthenticated.
  app.use("/api", optionalAuth);

  const resolveCurrentUserId = (req: any): string | undefined => {
    return req.user?.claims?.sub || req.user?.id || (process.env.NODE_ENV === 'development' ? "45788955" : undefined);
  };

  const normalizePromotionDealType = (experience: any): string | null => {
    return experience?.promotionDealType
      ?? ((experience?.influencerPromotionEnabled || numberOrZero(experience?.influencerCommissionPct) > 0)
        ? "commission_per_ticket"
        : null);
  };

  const isPromoterCompatiblePromotion = (experience: any): boolean => {
    const dealType = normalizePromotionDealType(experience);
    return dealType === "commission_per_ticket" || dealType === "milestone_barter";
  };

  const buildPromoterReferralLink = (
    baseUrl: string,
    slugOrId: string,
    promoterCode: string,
    shareToken?: string | null,
  ): string => {
    const params = new URLSearchParams({ ref: promoterCode });
    if (shareToken) {
      params.set("share", shareToken);
    }
    return `${baseUrl}/experience/${slugOrId}?${params.toString()}`;
  };

  const requireParticipantProfileForCommunity = async (req: any, res: any): Promise<string | null> => {
    const userId = resolveCurrentUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      res.status(403).json({
        code: "PARTICIPANT_PROFILE_REQUIRED",
        message: "Complete your profile to unlock the Community Hub and join the Tribe Chat.",
      });
      return null;
    }

    return userId;
  };

  const activeChatBookingStatuses = [
    "pending", "deposit_authorized", "deposit_paid", "confirmed", "fully_paid",
  ] as const;
  const HUB_UNREAD_EMAIL_DELAY_MS = Number(process.env.HUB_UNREAD_EMAIL_DELAY_MS || 5 * 60 * 1000);
  const HUB_UNREAD_EMAIL_COOLDOWN_MS = Number(process.env.HUB_UNREAD_EMAIL_COOLDOWN_MS || 60 * 60 * 1000);
  const CREATOR_HUB_NUDGE_DELAY_MS = Number(process.env.CREATOR_HUB_NUDGE_DELAY_MS || 15 * 60 * 1000);
  const CREATOR_HUB_NUDGE_COOLDOWN_MS = Number(process.env.CREATOR_HUB_NUDGE_COOLDOWN_MS || 6 * 60 * 60 * 1000);
  const paginationFrom = (query: any) => {
    const page = Math.max(1, Number.parseInt(String(query.page || "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(5, Number.parseInt(String(query.pageSize || "10"), 10) || 10));
    return { page, pageSize, offset: (page - 1) * pageSize };
  };

  const canAccessExperienceChat = async (userId: string, experienceId: string) => {
    const [user, experience, booking] = await Promise.all([
      storage.getUser(userId),
      storage.getExperience(experienceId),
      storage.getBookingByUserAndExperience(userId, experienceId),
    ]);
    if (!experience) return false;
    if (user?.role === "admin" || experience.creatorId === userId) return true;
    return !!booking && activeChatBookingStatuses.includes(booking.status as any);
  };

  const scheduleHubUnreadEmailNotifications = async (experienceId: string, senderId: string): Promise<void> => {
    const [experience, eventBookings] = await Promise.all([
      storage.getExperience(experienceId),
      storage.getExperienceBookings(experienceId),
    ]);
    if (!experience) return;

    const recipientIds = Array.from(new Set(
      eventBookings
        .filter((booking) => activeChatBookingStatuses.includes(booking.status as any))
        .map((booking) => booking.userId)
        .filter((userId): userId is string => !!userId && userId !== senderId),
    ));

    for (const userId of recipientIds) {
      await scheduleCommunityHubUnreadJob({
        experienceId,
        userId,
        delayMs: HUB_UNREAD_EMAIL_DELAY_MS,
        cooldownMs: HUB_UNREAD_EMAIL_COOLDOWN_MS,
      });
    }
  };

  const scheduleCreatorHubNudge = async (experienceId: string, senderId: string, isPrivateMessage: boolean): Promise<void> => {
    if (isPrivateMessage) return;
    const experience = await storage.getExperience(experienceId);
    if (!experience?.creatorId || experience.creatorId === senderId) return;

    await scheduleCreatorHubNudgeJob({
      experienceId,
      creatorId: experience.creatorId,
      delayMs: CREATOR_HUB_NUDGE_DELAY_MS,
      cooldownMs: CREATOR_HUB_NUDGE_COOLDOWN_MS,
    });
  };
  // Auth — Supabase JWT-based (stateless, no sessions)
  app.get("/api/login", (_req, res) => {
    res.redirect("/login");
  });
  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, role, firstName } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      if (!VALID_ROLES.includes(role) || role === 'admin') {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const admin = getSupabaseAdminClient();
      if (!admin) {
        return res.status(503).json({ message: 'Supabase service role is required to send branded verification emails' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingDbUser = await storage.getUserByEmail(normalizedEmail);
      if (existingDbUser) {
        return res.status(409).json({ message: 'This email already has an account. Please log in instead.' });
      }

      const appBaseUrl = getAppBaseUrl(req);
      const cleanFirstName = typeof firstName === 'string' ? firstName.trim() : '';
      const { data, error } = await (admin.auth as any).admin.generateLink({
        type: 'signup',
        email: normalizedEmail,
        password,
        options: {
          redirectTo: `${appBaseUrl}/login?verified=1`,
          data: {
            selected_role: role,
            first_name: cleanFirstName || null,
          },
        },
      });

      if (error) {
        const message = String(error.message || 'Unable to create account');
        if (message.toLowerCase().includes('already')) {
          return res.status(409).json({ message: 'This email already has an account. Please log in instead.' });
        }
        return res.status(400).json({ message });
      }

      const generatedVerifyUrl = data?.properties?.action_link;
      if (!generatedVerifyUrl) {
        return res.status(500).json({ message: 'Unable to generate verification link' });
      }
      const verifyUrl = buildAppAuthActionUrl(
        generatedVerifyUrl,
        `${appBaseUrl}/login?verified=1`,
        'signup',
      );

      await notificationService.sendWelcomeVerifyEmail({
        to: normalizedEmail,
        userFirstName: cleanFirstName || null,
        verifyUrl,
      });

      res.json({ message: 'Verification email sent' });
    } catch (error: any) {
      console.error('Error sending branded signup email:', error);
      res.status(500).json({ message: error?.message || 'Failed to send verification email' });
    }
  });

  app.post('/api/auth/password-reset', async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
      }

      const admin = getSupabaseAdminClient();
      if (!admin) {
        return res.status(503).json({ message: 'Supabase service role is required to send branded password reset emails' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const appBaseUrl = getAppBaseUrl(req);
      const { data, error } = await (admin.auth as any).admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        options: {
          redirectTo: `${appBaseUrl}/reset-password`,
        },
      });

      if (error) {
        console.warn('Password reset link generation skipped:', error.message);
        return res.json({ message: 'If that email exists, a reset link will be sent.' });
      }

      const generatedResetUrl = data?.properties?.action_link;
      if (generatedResetUrl) {
        const resetUrl = buildAppAuthActionUrl(
          generatedResetUrl,
          `${appBaseUrl}/reset-password`,
          'recovery',
        );
        await notificationService.sendPasswordResetEmail({
          to: normalizedEmail,
          resetUrl,
        });
      }

      res.json({ message: 'If that email exists, a reset link will be sent.' });
    } catch (error: any) {
      console.error('Error sending branded password reset email:', error);
      res.status(500).json({ message: error?.message || 'Failed to send password reset email' });
    }
  });

  // Register OG image + social bot prerender routes (must come before Vite catch-all)
  registerOGRoutes(app);

  app.get('/email-assets/email_logo.png', (_req, res) => {
    const sourceLogoPath = path.resolve(process.cwd(), 'client', 'public', 'assets', 'email_logo.png');
    const builtLogoPath = path.resolve(process.cwd(), 'dist', 'public', 'assets', 'email_logo.png');
    const logoPath = fs.existsSync(sourceLogoPath) ? sourceLogoPath : builtLogoPath;
    try {
      if (!fs.existsSync(logoPath)) return res.status(404).send('Logo not found');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type('png');
      return res.sendFile(logoPath);
    } catch {
      res.status(404).send('Logo not found');
    }
  });

  // Serve hero video with explicit range-request support so browsers can stream it
  app.get('/assets/hero-video.mp4', (req, res) => {
    const videoPath = path.resolve(process.cwd(), 'client/public/assets/hero-video.mp4');
    try {
      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch {
      res.status(404).send('Video not found');
    }
  });

  // Stripe webhook endpoint - must use raw body for signature verification
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      console.error('No Stripe signature in webhook');
      return res.status(400).send('No signature');
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    // A Connect platform normally ends up with more than one endpoint on this URL
    // — one for events on the platform account, one for events on connected
    // accounts — and Stripe issues a separate signing secret per endpoint. With a
    // single secret every delivery from the other endpoint failed verification and
    // was dropped with a 400, which is how account.updated never arrived and left
    // creator verification status permanently stale. Accept a comma-separated list
    // and try each; one secret keeps working exactly as before.
    const webhookSecrets = webhookSecret
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean);

    let event: Stripe.Event | undefined;
    let lastError: any;

    for (const secret of webhookSecrets) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!event) {
      console.error('Webhook signature verification failed:', lastError?.message);
      return res.status(400).send(`Webhook Error: ${lastError?.message}`);
    }

    // Dispatch to the comprehensive webhook handler
    try {
      await handleStripeWebhook(event, stripe);
      res.json({ received: true });
    } catch (error: any) {
      console.error(`[Webhook] Error handling ${event.type}:`, error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });

  // Check whether a Supabase-authenticated user already has a DB row.
  // Returns { exists: true, user } or { exists: false } — never auto-creates.
  // Used by the signup flow to decide between "new user" and "existing user" paths.
  app.get('/api/auth/user/exists', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      const user = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);
      res.json({ exists: !!user, user: user ?? null });
    } catch (error) {
      console.error("Error checking user existence:", error);
      res.status(500).json({ message: "Failed to check user" });
    }
  });

  // Auth routes - get (or auto-create) user from database
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      res.set('Cache-Control', 'private, no-store, max-age=0');
      const userId = req.user.claims.sub;
      const email = req.user.email;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      const metadataRole = typeof req.user.signupRole === 'string' ? req.user.signupRole : undefined;
      const metadataFirstName = typeof req.user.userMetadata?.first_name === 'string'
        ? req.user.userMetadata.first_name.trim()
        : '';
      const initialRole = metadataRole && metadataRole !== 'admin' && VALID_ROLES.includes(metadataRole)
        ? metadataRole
        : 'participant';

      let user = await storage.getUser(userId);

      if (!user) {
        const existingByEmail = normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined;
        if (existingByEmail) {
          return res.json(existingByEmail);
        }

        // First Supabase login — auto-create DB row with defaults
        user = await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: metadataFirstName || null,
          lastName: null,
          profileImageUrl: null,
          role: initialRole as any,
        });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ─── Guest Checkout ────────────────────────────────────────────────────────
  // Creates (or finds) a lightweight participant account so unauthenticated
  // visitors can complete a purchase without hitting a hard login wall.
  // The returned { guestUserId, isNew } is used by the checkout flow to
  // associate the booking with the account that was just created/found.
  app.post('/api/auth/guest-checkout', async (req, res) => {
    try {
      const { email, firstName, lastName } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
      }
      const normalizedEmail = email.trim().toLowerCase();

      // Look for an existing user with that email
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        // Return the existing account — they can upgrade to a full login later
        return res.json({ guestUserId: existing.id, isNew: false });
      }

      // Programmatically create a guest participant account (no password / Supabase session)
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newUser = await storage.upsertUser({
        id: guestId,
        email: normalizedEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        profileImageUrl: null,
        role: 'participant',
      });

      return res.json({ guestUserId: newUser.id, isNew: true });
    } catch (error) {
      console.error('Error creating guest account:', error);
      res.status(500).json({ message: 'Failed to create guest account' });
    }
  });

  // Valid roles list including promoter
  const VALID_ROLES = ['participant', 'creator', 'venue_provider', 'service_provider', 'admin', 'promoter'];

  // Role assignment endpoint — users can switch their own role.
  // The 'admin' role can only be assigned by an existing admin.
  app.post('/api/auth/assign-role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const { role } = req.body;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;

      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Only admins may assign the admin role
      if (role === 'admin' && !await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Only admins can assign the admin role" });
      }

      // Ensure the DB row exists — on first signup the row hasn't been created yet,
      // so updateUserRole would hit zero rows and silently return undefined.
      const existingByEmail = normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined;
      const existing = await storage.getUser(userId) || existingByEmail;
      if (!existing) {
        await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role: role as any,
        });
      }

      // The role column is the single source of truth for authorization.
      const accountId = existing?.id || userId;
      const updatedUser = await storage.updateUserRole(accountId, role);

      // Participants automatically get the promoter role so they can
      // share referral links and earn commission from day one.
      if (role === 'participant') {
        await storage.ensureUserReferralCode(accountId);
      }

      res.json({ message: "Role updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // Backward-compatible endpoint: "adding" a role now switches the account's
  // single role, matching /api/auth/assign-role.
  app.post('/api/auth/add-role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const { role } = req.body;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;

      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      if (role === 'admin' && !await checkIsAdmin(req)) {
        return res.status(403).json({ message: 'Only admins can assign the admin role' });
      }

      const user = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);

      if (!user) {
        const newUser = await storage.upsertUser({
          id: userId,
          email: normalizedEmail,
          firstName: null,
          lastName: null,
          profileImageUrl: null,
          role,
        });
        return res.json({ message: 'Role updated successfully', user: newUser });
      }

      if (user.role === role) {
        return res.json({ message: 'Role already active', user });
      }

      const updatedUser = await storage.updateUserRole(user.id, role);

      // Auto-generate a referral code when promoter role is added
      if (role === 'promoter' || role === 'participant') {
        await storage.ensureUserReferralCode(user.id);
      }

      res.json({ message: 'Role updated successfully', user: updatedUser });
    } catch (error) {
      console.error('Error adding role:', error);
      res.status(500).json({ message: 'Failed to add role' });
    }
  });

  // Admin-only: promote another user to admin (or any role)
  app.post('/api/admin/users/:userId/assign-role', isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId } = req.params;
      const { role } = req.body;
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updatedUser = await storage.updateUserRole(userId, role);
      res.json({ message: "Role assigned successfully", user: updatedUser });
    } catch (error) {
      console.error("Error assigning role:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  // Get user's available roles (for role switcher)
  app.get('/api/auth/user-roles', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const email = req.user.email || req.user.claims.email;
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      const user = await storage.getUser(userId) || (normalizedEmail ? await storage.getUserByEmail(normalizedEmail) : undefined);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        activeRole: user.role,
        availableRoles: user.role ? [user.role] : []
      });
    } catch (error) {
      console.error("Error fetching user roles:", error);
      res.status(500).json({ message: "Failed to fetch user roles" });
    }
  });

  // ========== PROMOTER ATTRIBUTION ENDPOINTS ==========
  
  // Look up promoter by referral code (public - rate limit recommended in production)
  app.get('/api/promoters/by-code/:code', async (req, res) => {
    try {
      const { code } = req.params;
      if (!code || code.length < 3) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
      
      const promoter = await storage.getUserByPromoterCode(code);
      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }
      
      // Return only minimal info - no PII
      res.json({
        promoterId: promoter.id,
        valid: true
      });
    } catch (error) {
      console.error("Error looking up promoter:", error);
      res.status(500).json({ message: "Failed to look up promoter" });
    }
  });

  // Store promoter attribution in cookie (called when user visits with ?ref=)
  app.post('/api/promoter-attribution', async (req: any, res) => {
    try {
      const { referralCode, experienceId, shareToken } = req.body;
      if ((!referralCode || referralCode.length < 3) && !shareToken) {
        return res.status(400).json({ message: "Invalid referral code" });
      }

      const trackedPromotion = shareToken
        ? await storage.getPromoterExperienceByShareToken(String(shareToken))
        : undefined;

      let promoter = trackedPromotion
        ? await storage.getUser(trackedPromotion.promoterId)
        : null;

      if (!promoter && referralCode) {
        promoter = await storage.getUserByPromoterCode(referralCode);
      }

      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }

      if (referralCode && promoter.promoterCode && promoter.promoterCode !== referralCode) {
        return res.status(400).json({ message: "Referral link is invalid for this promoter" });
      }

      const effectiveReferralCode = promoter.promoterCode || referralCode;
      if (!effectiveReferralCode) {
        return res.status(400).json({ message: "Referral code is missing for this promoter" });
      }

      const trackedExperienceId = trackedPromotion?.experienceId || experienceId || null;

      // ── Record the referral click ─────────────────────────────────────────
      const visitorUserId = req.user?.claims?.sub ?? null;
      // Hash the IP so we can deduplicate without storing PII
      const rawIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || '';
      const crypto = await import('crypto');
      const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);

      await storage.recordReferralClick({
        promoterCode: effectiveReferralCode,
        promoterId: promoter.id,
        experienceId: trackedExperienceId,
        promoterExperienceId: trackedPromotion?.id ?? null,
        visitorUserId,
        ipHash,
        userAgent: req.headers['user-agent'] ?? null,
      });

      // Set HttpOnly cookie with promoter info (survives auth redirect)
      const cookieValue = JSON.stringify({
        promoterId: promoter.id,
        referralCode: effectiveReferralCode,
        shareToken: trackedPromotion?.shareToken || shareToken || null,
        promoterExperienceId: trackedPromotion?.id || null,
        experienceId: trackedExperienceId,
        timestamp: Date.now(),
      });

      res.cookie('promoter_ref', cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        signed: false
      });

      res.json({
        success: true,
        promoterId: promoter.id,
        referralCode: effectiveReferralCode,
        shareToken: trackedPromotion?.shareToken || shareToken || null,
        promoterExperienceId: trackedPromotion?.id || null,
        experienceId: trackedExperienceId,
      });
    } catch (error) {
      console.error("Error storing promoter attribution:", error);
      res.status(500).json({ message: "Failed to store attribution" });
    }
  });

  // Persist promoter referrer to user record (called after login)
  app.post('/api/auth/set-referrer', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { promoterId, referralCode } = req.body;
      
      // Check if user already has a referrer (don't override)
      const user = await storage.getUser(userId);
      if (user?.referredByPromoterId) {
        return res.json({ 
          message: "Referrer already set",
          referredByPromoterId: user.referredByPromoterId
        });
      }
      
      // Validate promoter exists
      let validPromoterId = promoterId;
      if (!validPromoterId && referralCode) {
        const promoter = await storage.getUserByPromoterCode(referralCode);
        validPromoterId = promoter?.id;
      }
      
      if (!validPromoterId) {
        return res.status(400).json({ message: "Invalid promoter" });
      }
      
      // Persist referrer to user record
      const updatedUser = await storage.setUserReferrer(userId, validPromoterId);
      
      // Clear the cookie now that we've persisted
      res.clearCookie('promoter_ref');
      
      res.json({
        success: true,
        referredByPromoterId: updatedUser.referredByPromoterId
      });
    } catch (error) {
      console.error("Error setting referrer:", error);
      res.status(500).json({ message: "Failed to set referrer" });
    }
  });

  // Ensure the logged-in user has a referral code (auto-generates one if needed).
  // Also auto-registers the experience in promoterExperiences so "My Trips" is populated
  // for participants who share from the experience page (not just the experience pool).
  app.post('/api/me/ensure-referral-code', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { experienceId, bookingId, requireBooking } = req.body ?? {};

      // The post-checkout celebration page must never manufacture a referral
      // link for somebody who merely opened its URL. Generic share-kit calls
      // intentionally omit requireBooking and keep their existing behaviour.
      if (requireBooking === true) {
        if (!experienceId) {
          return res.status(400).json({
            code: "EXPERIENCE_REQUIRED",
            message: "An experience is required to verify this booking",
          });
        }

        const booking = bookingId
          ? await storage.getBooking(bookingId)
          : await storage.getBookingByUserAndExperience(userId, experienceId);
        if (!isActivePostCheckoutBooking(booking, userId, experienceId)) {
          return res.status(403).json({
            code: "BOOKING_REQUIRED",
            message: "A valid booking is required before creating this referral link",
          });
        }
      }

      const referralCode = await storage.ensureUserReferralCode(userId);

      // Use the actual request host so the link works in dev AND production
      const baseUrl = getAppBaseUrl(req);
      let referralLink: string;
      if (experienceId) {
        const promotedExperience = await storage.promoteExperience(userId, experienceId);
        const experience = await storage.getExperience(experienceId);
        const slugOrId = experience?.slug || experienceId;
        referralLink = buildPromoterReferralLink(
          baseUrl,
          slugOrId,
          referralCode,
          promotedExperience.shareToken,
        );

        // Auto-register this experience in the user's promoter list so their
        // "My Trips" section shows it even if they found it via the experience page
        // (not the experience pool). Idempotent — onConflictDoNothing inside.
      } else {
        referralLink = `${baseUrl}/?ref=${referralCode}`;
      }

      res.json({ referralCode, referralLink });
    } catch (error) {
      console.error("Error ensuring referral code:", error);
      res.status(500).json({ message: "Failed to generate referral code" });
    }
  });

  const resolveImpactAudience = async (userId: string): Promise<"participant" | "official_partner"> => {
    const [profile, promotedExperiences] = await Promise.all([
      storage.getPromoterProfile(userId),
      storage.getPromoterExperiences(userId),
    ]);
    return profile?.completed || promotedExperiences.some((item) => item.referralAudience === "official_partner")
      ? "official_partner"
      : "participant";
  };

  // Get impact stats for any authenticated user (no promoter role required)
  // Powers the My Impact page recruitment stats + gamification
  app.get('/api/me/impact-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Ensure user has a referral code (auto-generates if missing)
      const referralCode = await storage.ensureUserReferralCode(userId);

      const audience = await resolveImpactAudience(userId);
      const promoterBookings = await storage.getPromoterBookings(userId, audience);

      const friendsJoined = promoterBookings.length;
      const experienceEntries = await Promise.all(
        Array.from(new Set(promoterBookings.map((booking) => booking.experienceId))).map(async (experienceId) => [
          experienceId,
          await storage.getExperience(experienceId),
        ] as const),
      );
      const experienceById = new Map(experienceEntries);

      // Sum active commissions by currency (estimated + locked + paid, not voided).
      let tripCreditsEarned = 0;
      let tripCreditsCurrency: string | null = null;
      const tripCreditsByCurrency = summarizeImpactEarnings(
        promoterBookings.map((booking) => ({
          booking,
          experienceCurrency: experienceById.get(booking.experienceId)?.currency,
        })),
      );
      const creditCurrencies = Object.keys(tripCreditsByCurrency);
      if (creditCurrencies.length === 1) {
        tripCreditsCurrency = creditCurrencies[0];
        tripCreditsEarned = tripCreditsByCurrency[tripCreditsCurrency];
      }

      // Most recent experience for share CTA (from latest booking or promoted experiences)
      let shareExperience: any = null;
      if (promoterBookings.length > 0) {
        const sorted = [...promoterBookings].sort((a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        const recentExpId = sorted[0].experienceId;
        const exp = experienceById.get(recentExpId) || await storage.getExperience(recentExpId);
        if (exp) {
          shareExperience = {
            id: exp.id,
            title: exp.title,
            location: exp.location,
            coverImageUrl: exp.coverImageUrl,
            lifecycleStatus: computeLifecycleStatus({
              status: exp.status || '',
              mvgStatus: exp.mvgStatus,
              requireMinimumParticipants: exp.requireMinimumParticipants,
            }),
            currency: exp.currency,
          };
        }
      }

      // Use real click data from referralClicks table
      const clickStats = await storage.getReferralClickStats(userId, { referralAudience: audience });

      res.json({
        referralCode,
        friendsJoined,
        peopleInvited: clickStats.totalClicks,   // real: every click on their referral link
        uniqueVisitors: clickStats.uniqueClicks,
        conversionRate: clickStats.conversionRate,
        tripCreditsEarned,
        tripCreditsCurrency,
        tripCreditsByCurrency,
        shareExperience,
      });
    } catch (error) {
      console.error("Error fetching impact stats:", error);
      res.status(500).json({ message: "Failed to fetch impact stats" });
    }
  });

  // ===== PROMOTER DASHBOARD ROUTES (Read-Only) =====
  // Helper: resolve userId with dev bypass.
  // Open to every authenticated user — all queries are scoped to the caller's own
  // userId, and tracking links are earned by participants (post-checkout sharing)
  // and brands (accepted promotion deals) whose accounts can hold any role.
  const resolvePromoterUserId = async (req: any, res: any): Promise<string | null> => {
    const userId = resolveCurrentUserId(req);
    if (!userId) { res.status(401).json({ message: 'Not authenticated' }); return null; }
    return userId;
  };

  // Get promoter earnings summary
  app.get('/api/promoter/earnings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;
      const audience = await resolveImpactAudience(userId);
      const summary = await storage.getPromoterEarningsSummary(userId, audience);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching promoter earnings:", error);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Get experiences promoted by this promoter
  app.get('/api/promoter/experiences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;

      const dbUser = await storage.getUser(userId);
      const promoterCode = dbUser?.promoterCode || await storage.ensureUserReferralCode(userId);
      const baseUrl = getAppBaseUrl(req);
      const audience = await resolveImpactAudience(userId);
      const experiences = (await storage.getPromoterExperiences(userId))
        .filter((item) => item.referralAudience === audience);
      // Add lifecycleStatus to each promoted experience
      const enriched = await Promise.all((experiences || []).map(async (item: any) => {
        if (item.experience) {
          const slugOrId = item.experience.slug || item.experience.id;
          const acceptedDeal = item.promotionDealId
            ? await storage.getPromotionDeal(item.promotionDealId)
            : undefined;
          const acceptedTerms = acceptedDeal?.terms || {};
          const officialOffer = item.referralAudience === 'official_partner'
            ? {
                ...item.experience,
                promotionDealType: acceptedDeal?.dealType || item.experience.promotionDealType,
                influencerCommissionPct: acceptedTerms.commissionPct ?? item.experience.influencerCommissionPct,
                promotionMilestoneAttendeeTarget: acceptedTerms.milestoneAttendeeTarget ?? item.experience.promotionMilestoneAttendeeTarget,
                promotionMilestoneRewardTickets: acceptedTerms.milestoneRewardTickets ?? item.experience.promotionMilestoneRewardTickets,
                promotionBrandPitch: acceptedTerms.brandPitch ?? item.experience.promotionBrandPitch,
                promotionSponsorshipAmount: acceptedTerms.sponsorshipAmount ?? item.experience.promotionSponsorshipAmount,
                currency: acceptedTerms.currency ?? item.experience.currency,
              }
            : null;
          const mvgProgress = item.experience.requireMinimumParticipants
            ? await storage.getMVGProgress(item.experience.id)
            : null;
          const mvgMet = mvgProgress?.mvg_met ?? item.experience.mvgStatus === 'met';
          const resolvedMvgStatus = mvgMet ? 'met' : (item.experience.mvgStatus || 'pending');
          return {
            ...item,
            referralLink: buildPromoterReferralLink(
              baseUrl,
              slugOrId,
              promoterCode,
              item.shareToken,
            ),
            referralAudience: item.referralAudience || 'participant',
            promotionDeal: acceptedDeal || null,
            dealOffer: officialOffer,
            experience: {
              ...item.experience,
              currentParticipants: mvgProgress?.current_participants ?? item.experience.currentParticipants,
              mvgMin: mvgProgress?.minimum_participants ?? item.experience.mvgMin,
              minimumParticipants: mvgProgress?.minimum_participants ?? item.experience.minimumParticipants,
              mvgMet,
              mvgStatus: resolvedMvgStatus,
              lifecycleStatus: computeLifecycleStatus({
                status: item.experience.status || '',
                mvgStatus: resolvedMvgStatus,
                requireMinimumParticipants: item.experience.requireMinimumParticipants,
                mvgMet,
              }),
            },
          };
        }
        return {
          ...item,
          lifecycleStatus: computeLifecycleStatus({
            status: item.status || '',
            mvgStatus: item.mvgStatus,
            requireMinimumParticipants: item.requireMinimumParticipants,
          }),
        };
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching promoted experiences:", error);
      res.status(500).json({ message: "Failed to fetch promoted experiences" });
    }
  });

  // Get detailed bookings for promoter
  app.get('/api/promoter/bookings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await resolvePromoterUserId(req, res);
      if (!userId) return;
      
      const audience = await resolveImpactAudience(userId);
      const bookings = await storage.getPromoterBookings(userId, audience);
      
      // Enrich with experience info
      const enrichedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const experience = await storage.getExperience(booking.experienceId);
          const bookingValue = resolveBookingGrossValue(booking as any).toFixed(2);
          const currency = normalizeCurrency(experience?.currency, booking.commissionCurrency);
          return {
            ...booking,
            experienceName: experience?.title || 'Unknown Experience',
            experienceSlug: experience?.slug,
            bookingValue,
            totalAmount: bookingValue,
            currency,
            commissionCurrency: normalizeCurrency(booking.commissionCurrency, experience?.currency),
          };
        })
      );
      
      res.json(enrichedBookings);
    } catch (error) {
      console.error("Error fetching promoter bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Get promoter's referral code and info
  app.get('/api/promoter/info', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      // Auto-ensure referral code exists
      const referralCode = user?.promoterCode || await storage.ensureUserReferralCode(userId);
      res.json({
        promoterCode: referralCode,
        firstName: user?.firstName,
        lastName: user?.lastName,
      });
    } catch (error) {
      console.error("Error fetching promoter info:", error);
      res.status(500).json({ message: "Failed to fetch promoter info" });
    }
  });

  app.get('/api/promoter-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const profile = await storage.getPromoterProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Promoter profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching promoter profile:", error);
      res.status(500).json({ message: "Failed to fetch promoter profile" });
    }
  });

  app.post('/api/promoter-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const validation = insertPromoterProfileSchema.safeParse({
        ...req.body,
        completed: true,
      });
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid promoter profile data",
          errors: validation.error.issues,
        });
      }

      const profile = await storage.createOrUpdatePromoterProfile(userId, validation.data);
      res.json(profile);
    } catch (error) {
      console.error("Error saving promoter profile:", error);
      res.status(500).json({ message: "Failed to save promoter profile" });
    }
  });

  app.post('/api/promoter/stripe-connect', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const [user, existingProfile] = await Promise.all([
        storage.getUser(userId),
        storage.getPromoterProfile(userId),
      ]);
      const profile = existingProfile || await storage.createOrUpdatePromoterProfile(userId, {
        displayName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Participant',
        bio: '',
        completed: false,
      });

      let account: Stripe.Account;
      if (profile.stripeAccountId) {
        account = await stripe.accounts.retrieve(profile.stripeAccountId);
      } else {
        account = await stripe.accounts.create({
          type: 'express',
          email: user?.email || undefined,
          metadata: { userId, accountPurpose: 'promoter_payouts' },
        });
        await storage.updatePromoterProfileStripe(userId, account.id);
      }

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${getAppBaseUrl(req)}/promoter/profile-setup?stripe_refresh=true`,
        return_url: `${getAppBaseUrl(req)}/promoter?stripe_success=true`,
        type: 'account_onboarding',
      });
      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Error creating promoter Stripe Connect URL:", error);
      res.status(500).json({ message: "Failed to start Stripe Connect onboarding" });
    }
  });

  app.get('/api/promoter-profile/by-code/:code', async (req, res) => {
    try {
      const { code } = req.params;
      if (!code || code.length < 3) {
        return res.status(400).json({ message: "Invalid referral code" });
      }

      const promoter = await storage.getUserByPromoterCode(code);
      if (!promoter) {
        return res.status(404).json({ message: "Referral code not found" });
      }

      const profile = await storage.getPromoterProfileByUserId(promoter.id);
      const fallbackName = `${promoter.firstName || ""} ${promoter.lastName || ""}`.trim();

      res.json({
        promoterId: promoter.id,
        referralCode: promoter.promoterCode,
        displayName: profile?.displayName || fallbackName || "Great promoter",
        profilePhoto: profile?.profilePhoto || promoter.profileImageUrl || null,
        bio: profile?.bio || null,
        completed: !!profile?.completed,
      });
    } catch (error) {
      console.error("Error fetching public promoter profile:", error);
      res.status(500).json({ message: "Failed to fetch promoter profile" });
    }
  });

  app.get('/api/promotion/platform-partners', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const promoters = await storage.getAllPromoters();
      const partners = await Promise.all(promoters.map(async (promoter) => {
        const profile = await storage.getPromoterProfileByUserId(promoter.id);
        const fallbackName = `${promoter.firstName || ""} ${promoter.lastName || ""}`.trim();

        return {
          id: promoter.id,
          role: "promoter",
          displayName: profile?.displayName || fallbackName || promoter.email || "Platform partner",
          bio: profile?.bio || null,
          profilePhoto: profile?.profilePhoto || promoter.profileImageUrl || null,
          email: promoter.email,
          promoterCode: promoter.promoterCode || null,
          completed: !!profile?.completed,
        };
      }));

      res.json(partners.filter((partner) => partner.completed));
    } catch (error) {
      console.error("Error fetching promotion platform partners:", error);
      res.status(500).json({ message: "Failed to fetch platform partners" });
    }
  });

  // Promoter click-through stats (clicks, unique visitors, conversions, rate)
  app.get('/api/promoter/click-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const stats = await storage.getReferralClickStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching click stats:", error);
      res.status(500).json({ message: "Failed to fetch click stats" });
    }
  });

  // Get experience pool - promotable experiences (open to all authenticated users)
  app.get('/api/promoter/experience-pool', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const dbUser = await storage.getUser(userId);
      const partnerProfile = await storage.getPromoterProfile(userId);
      if (!partnerProfile?.completed) {
        return res.json([]);
      }

      const promoterCode = dbUser?.promoterCode || await storage.ensureUserReferralCode(userId);
      const baseUrl = getAppBaseUrl(req);

      // Get all promotable experiences
      const experiences = await storage.getPromotableExperiences();

      // Get which ones this promoter is already promoting
      const promotedRows = await storage.getPromoterPromotedExperiences(userId);
      const promotedByExperienceId = new Map(
        promotedRows
          .filter((row) => row.referralAudience === "official_partner")
          .map((row) => [row.experienceId, row]),
      );

      // Get this partner's marketplace bids (Option C: Accept / Counter Offer) so the
      // pool card can show the current negotiation state instead of the raw actions again.
      const marketplaceDeals = await storage.getMarketplacePromotionDealsForPartner(userId);
      const marketplaceDealByExperienceId = new Map(
        marketplaceDeals.map((deal) => [deal.experienceId, deal]),
      );

      // Enrich with promotion status and lifecycle state (single source of truth)
      const enrichedExperiences = experiences.map(exp => ({
        ...exp,
        isPromoting: promotedByExperienceId.has(exp.id),
        shareToken: promotedByExperienceId.get(exp.id)?.shareToken || null,
        referralLink: buildPromoterReferralLink(
          baseUrl,
          exp.slug || exp.id,
          promoterCode,
          promotedByExperienceId.get(exp.id)?.shareToken || null,
        ),
        lifecycleStatus: computeLifecycleStatus({
          status: exp.status || '',
          mvgStatus: exp.mvgStatus,
          requireMinimumParticipants: exp.requireMinimumParticipants,
        }),
        marketplaceDeal: marketplaceDealByExperienceId.get(exp.id) || null,
      }));

      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching experience pool:", error);
      res.status(500).json({ message: "Failed to fetch experience pool" });
    }
  });

  // Promote an experience - generate referral link
  app.post('/api/promoter/promote/:experienceId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { experienceId } = req.params;
      
      // Verify the experience exists and is promotable (approved/published status only)
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (experience.status !== 'approved' && experience.status !== 'published') {
        return res.status(400).json({ message: "Only approved or published experiences can be promoted" });
      }

      if (!isPromoterCompatiblePromotion(experience)) {
        return res.status(400).json({ message: "This creator offer is not set up for promoters" });
      }
      if (experience.promotionDealType) {
        return res.status(400).json({ message: "Accept or counter the official partner deal before promoting" });
      }
      
      // Load promoter's DB record to get (or generate) their referral code
      let dbUser = await storage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const partnerProfile = await storage.getPromoterProfile(userId);
      if (!partnerProfile?.completed) {
        return res.status(403).json({ message: "Complete your official partner profile before joining public partner deals" });
      }

      // Ensure the user has a referral code — generate one if missing
      if (!dbUser.promoterCode) {
        await storage.ensureUserReferralCode(userId);
        dbUser = await storage.getUser(userId);
      }

      // Register promotion (idempotent — onConflictDoNothing inside)
      const promotedExperience = await storage.promoteExperience(userId, experienceId, {
        referralAudience: 'official_partner',
      });

      // Build a fully-qualified, trackable referral link
      const baseUrl = getAppBaseUrl(req);
      const slug = experience.slug || experience.id;
      const promoterCode = dbUser?.promoterCode ?? '';
      const referralLink = buildPromoterReferralLink(
        baseUrl,
        slug,
        promoterCode,
        promotedExperience.shareToken,
      );

      res.json({
        success: true,
        experienceId,
        experienceSlug: slug,
        promoterCode,
        shareToken: promotedExperience.shareToken,
        promoterExperienceId: promotedExperience.id,
        referralLink,
        message: "Experience added to your promotions!",
      });
    } catch (error) {
      console.error("Error promoting experience:", error);
      res.status(500).json({ message: "Failed to promote experience" });
    }
  });

  // ── Digital Handshake: Promotion Deals (Part 3) ──

  // Fire-and-forget email helpers — a failed email must never fail the API call.
  const partnerDisplayName = async (partnerId: string | null | undefined, fallback?: string | null) => {
    if (!partnerId) return fallback || 'A partner';
    const partner = await storage.getUser(partnerId);
    const name = `${partner?.firstName || ''} ${partner?.lastName || ''}`.trim();
    return name || partner?.email || fallback || 'A partner';
  };

  // Partner responded to a direct offer (accept/decline) → notify the creator.
  const notifyCreatorOfPromotionResponse = (deal: any, partnerId: string, action: 'accepted' | 'declined') => {
    (async () => {
      const [creator, experience, partnerName] = await Promise.all([
        storage.getUser(deal.creatorId),
        storage.getExperience(deal.experienceId),
        partnerDisplayName(partnerId, deal.partnerName),
      ]);
      if (!creator?.email || !experience) return;
      await notificationService.sendPromotionOfferResponseEmail({
        to: creator.email,
        recipientName: creator.firstName,
        partnerName,
        experienceTitle: experience.title,
        experienceSlugOrId: (experience as any).slug || experience.id,
        action,
        dealType: deal.dealType,
        terms: deal.terms,
        currency: (experience as any).currency,
      });
    })().catch((err) => console.error('Promotion response email failed:', err?.message || err));
  };

  // Creator resolved a marketplace counter offer → notify the partner who countered.
  const notifyPartnerOfCounterResolution = (deal: any, action: 'accepted' | 'declined') => {
    (async () => {
      const [partner, experience] = await Promise.all([
        deal.partnerId ? storage.getUser(deal.partnerId) : Promise.resolve(undefined),
        storage.getExperience(deal.experienceId),
      ]);
      const to = partner?.email || deal.partnerEmail;
      if (!to || !experience) return;
      await notificationService.sendPromotionCounterResolvedEmail({
        to,
        recipientName: partner?.firstName || deal.partnerName,
        experienceTitle: experience.title,
        experienceSlugOrId: (experience as any).slug || experience.id,
        action,
        dealType: deal.dealType,
        terms: deal.terms,
        currency: (experience as any).currency,
      });
    })().catch((err) => console.error('Counter resolution email failed:', err?.message || err));
  };

  const notifyPartnerOfPartnershipConfirmation = (deal: any) => {
    (async () => {
      const [partner, experience] = await Promise.all([
        deal.partnerId ? storage.getUser(deal.partnerId) : Promise.resolve(undefined),
        storage.getExperience(deal.experienceId),
      ]);
      const to = partner?.email || deal.partnerEmail;
      if (!to || !experience) return;
      const tracking = deal.partnerId
        ? await storage.promoteExperience(deal.partnerId, deal.experienceId, {
            referralAudience: 'official_partner',
            promotionDealId: deal.id,
          })
        : null;
      const partnerCode = partner?.promoterCode || (deal.partnerId ? await storage.ensureUserReferralCode(deal.partnerId) : null);
      const trackingParams = partnerCode ? new URLSearchParams({ ref: partnerCode }) : null;
      if (trackingParams && tracking?.shareToken) trackingParams.set('share', tracking.shareToken);
      await notificationService.sendPartnershipConfirmedEmail({
        to,
        partnerName: partner?.firstName || deal.partnerName,
        eventName: experience.title,
        dealSummary: formatPromotionDealSummary(deal.dealType, deal.terms, (experience as any).currency),
        trackingLink: trackingParams
          ? `${publicAppBaseUrl()}/experience/${(experience as any).slug || experience.id}?${trackingParams.toString()}`
          : undefined,
        eventKey: `partnership_confirmed:${deal.id}`,
      });
    })().catch((err) => console.error('Partnership confirmation email failed:', err?.message || err));
  };

  const createPromotionSponsorshipCheckout = async (req: any, deal: any) => {
    if (deal.dealType !== "financial_sponsorship" || deal.status !== "pending_payment") {
      throw new Error("This deal is not awaiting a sponsorship payment");
    }

    const amount = Number(deal.terms?.sponsorshipAmount || 0);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amountCents <= 0) {
      throw new Error("A valid sponsorship amount is required");
    }
    const currency = String(deal.terms?.currency || "EUR").toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw new Error("A valid sponsorship currency is required");
    const experience = await storage.getExperience(deal.experienceId);
    if (!experience) throw new Error("Experience not found");
    if (experience.endDate && new Date(experience.endDate).getTime() < Date.now()) {
      throw new Error("Sponsorship payment is unavailable after the experience has ended");
    }

    if (deal.stripeCheckoutSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(deal.stripeCheckoutSessionId);
      if (existingSession.status === "open" && existingSession.url) return existingSession;
    }

    const baseUrl = getAppBaseUrl(req);
    const sponsorshipMeta = {
      type: "promotion_sponsorship",
      promotionDealId: deal.id,
      experienceId: deal.experienceId,
      creatorId: deal.creatorId,
      partnerId: deal.partnerId || "",
      sponsorshipAmountCents: String(amountCents),
    };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Financial Sponsorship — ${experience.title}`,
            description: "Flat-fee event sponsorship for brand exposure",
          },
        },
      }],
      metadata: sponsorshipMeta,
      payment_intent_data: { metadata: sponsorshipMeta },
      success_url: `${baseUrl}/promoter/experience-pool?sponsorship=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/promoter/experience-pool?sponsorship=cancelled&deal=${deal.id}`,
    }, {
      idempotencyKey: `promotion-sponsorship:${deal.id}:${deal.updatedAt?.getTime?.() || "initial"}`,
    });
    await storage.setPromotionSponsorshipCheckoutSession(deal.id, session.id);
    return session;
  };

  // GET /api/promoter/offers — Direct offers (Options A & B) sent to this partner.
  // Accept/Decline only — matches the spec's "Brand can only click Accept or Decline".
  app.get('/api/promoter/offers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const dbUser = await storage.getUser(userId);
      const rows = await storage.getDirectPromotionDealsForPartner(userId, dbUser?.email);

      res.json(rows.map(({ deal, experience }) => ({
        ...deal,
        experienceTitle: experience.title,
        experienceSlug: experience.slug,
        experienceStartDate: experience.startDate,
        experienceLocation: experience.location,
      })));
    } catch (error) {
      console.error("Error fetching promoter offers:", error);
      res.status(500).json({ message: "Failed to fetch offers" });
    }
  });

  app.post('/api/promoter/offers/:dealId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const updated = await storage.respondToDirectPromotionDeal(req.params.dealId, userId, 'accept');
      if (!updated) return res.status(404).json({ message: "Offer not found or already resolved" });
      if (updated.dealType === "financial_sponsorship") {
        const session = await createPromotionSponsorshipCheckout(req, updated);
        return res.json({ ...updated, requiresPayment: true, checkoutUrl: session.url });
      }
      notifyCreatorOfPromotionResponse(updated, userId, 'accepted');
      notifyPartnerOfPartnershipConfirmation(updated);
      res.json({ ...updated, requiresPayment: false });
    } catch (error) {
      console.error("Error accepting offer:", error);
      res.status(500).json({ message: "Failed to accept offer" });
    }
  });

  app.post('/api/promoter/offers/:dealId/decline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const updated = await storage.respondToDirectPromotionDeal(req.params.dealId, userId, 'decline');
      if (!updated) return res.status(404).json({ message: "Offer not found or already resolved" });
      notifyCreatorOfPromotionResponse(updated, userId, 'declined');
      res.json(updated);
    } catch (error) {
      console.error("Error declining offer:", error);
      res.status(500).json({ message: "Failed to decline offer" });
    }
  });

  // Marketplace bid (Option C): accept the creator's baseline terms as-is.
  app.post('/api/promoter/experience-pool/:experienceId/accept-deal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const partnerProfile = await storage.getPromoterProfile(userId);
      if (!partnerProfile?.completed) return res.status(403).json({ message: "Verified partner profile required" });

      const experience = await storage.getExperience(req.params.experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });
      if (experience.status !== 'approved' && experience.status !== 'published') {
        return res.status(400).json({ message: "This experience is not open for deals" });
      }

      const deal = await storage.createOrUpdateMarketplacePromotionDeal(req.params.experienceId, userId, 'accept');
      if (deal.dealType === "financial_sponsorship") {
        const session = await createPromotionSponsorshipCheckout(req, deal);
        return res.json({ ...deal, requiresPayment: true, checkoutUrl: session.url });
      }
      notifyCreatorOfPromotionResponse(deal, userId, 'accepted');
      notifyPartnerOfPartnershipConfirmation(deal);
      res.json({ ...deal, requiresPayment: false });
    } catch (error: any) {
      console.error("Error accepting marketplace deal:", error);
      res.status(500).json({ message: error?.message || "Failed to accept deal" });
    }
  });

  // Marketplace bid (Option C): counter the creator's baseline terms — sends the
  // proposal back to the Creator's dashboard to Accept/Decline.
  app.post('/api/promoter/experience-pool/:experienceId/counter-deal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const partnerProfile = await storage.getPromoterProfile(userId);
      if (!partnerProfile?.completed) return res.status(403).json({ message: "Verified partner profile required" });

      const experience = await storage.getExperience(req.params.experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });
      if (experience.status !== 'approved' && experience.status !== 'published') {
        return res.status(400).json({ message: "This experience is not open for deals" });
      }

      const { terms, message } = req.body || {};
      const normalizedTerms = normalizePromotionCounterTerms(
        experience.promotionDealType || "",
        terms,
        experience.currency || "EUR",
      );
      const deal = await storage.createOrUpdateMarketplacePromotionDeal(
        req.params.experienceId,
        userId,
        'counter',
        normalizedTerms,
        message,
      );

      // Counter offer goes back to the creator's dashboard — notify them by email.
      (async () => {
        const [creator, partnerName] = await Promise.all([
          storage.getUser(deal.creatorId),
          partnerDisplayName(userId),
        ]);
        if (!creator?.email) return;
        await notificationService.sendPromotionCounterReceivedEmail({
          to: creator.email,
          recipientName: creator.firstName,
          partnerName,
          experienceTitle: experience.title,
          experienceSlugOrId: (experience as any).slug || experience.id,
          dealType: deal.dealType,
          terms: deal.terms,
          currency: (experience as any).currency,
          message,
        });
      })().catch((err) => console.error('Counter offer email failed:', err?.message || err));

      res.json(deal);
    } catch (error: any) {
      console.error("Error countering marketplace deal:", error);
      res.status(500).json({ message: error?.message || "Failed to submit counter offer" });
    }
  });

  // GET /api/creator/promotion-deals — everything the creator has sent or received:
  // pending direct offers, incoming counters awaiting a decision, and resolved deals.
  app.get('/api/creator/promotion-deals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const rows = await storage.getPromotionDealsForCreator(userId);

      res.json(rows.map(({ deal, experience, partner }) => ({
        ...deal,
        experienceTitle: experience.title,
        experienceSlug: experience.slug,
        partnerName: partner ? `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || partner.email : deal.partnerName,
        partnerEmail: partner?.email || deal.partnerEmail,
      })));
    } catch (error) {
      console.error("Error fetching creator promotion deals:", error);
      res.status(500).json({ message: "Failed to fetch promotion deals" });
    }
  });

  app.get('/api/creator/perk-fulfillments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      res.json(await storage.getCreatorPerkFulfillments(userId));
    } catch (error) {
      console.error("Error fetching perk fulfillments:", error);
      res.status(500).json({ message: "Failed to fetch perk fulfillments" });
    }
  });

  app.patch('/api/creator/perk-fulfillments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { status, notes } = req.body || {};
      if (status !== "unlocked" && status !== "fulfilled") {
        return res.status(400).json({ message: "Status must be unlocked or fulfilled" });
      }
      const updated = await storage.updatePerkFulfillmentStatus(req.params.id, userId, status, notes);
      if (!updated) return res.status(404).json({ message: "Perk fulfillment not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating perk fulfillment:", error);
      res.status(500).json({ message: "Failed to update perk fulfillment" });
    }
  });

  app.post('/api/creator/promotion-deals/:dealId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updated = await storage.respondToCreatorPromotionDeal(req.params.dealId, userId, 'accept');
      if (!updated) return res.status(404).json({ message: "Deal not found or not awaiting your response" });
      notifyPartnerOfCounterResolution(updated, 'accepted');
      res.json(updated);
    } catch (error) {
      console.error("Error accepting counter offer:", error);
      res.status(500).json({ message: "Failed to accept counter offer" });
    }
  });

  app.post('/api/creator/promotion-deals/:dealId/decline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updated = await storage.respondToCreatorPromotionDeal(req.params.dealId, userId, 'decline');
      if (!updated) return res.status(404).json({ message: "Deal not found or not awaiting your response" });
      notifyPartnerOfCounterResolution(updated, 'declined');
      res.json(updated);
    } catch (error) {
      console.error("Error declining counter offer:", error);
      res.status(500).json({ message: "Failed to decline counter offer" });
    }
  });

  app.post('/api/promoter/promotion-deals/:dealId/sponsorship-checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const deal = await storage.getPromotionDeal(req.params.dealId);
      if (!deal || deal.partnerId !== userId) return res.status(404).json({ message: "Sponsorship deal not found" });
      if (deal.paymentStatus === "paid") return res.json({ requiresPayment: false, status: "accepted" });

      const session = await createPromotionSponsorshipCheckout(req, deal);
      res.json({ requiresPayment: true, checkoutUrl: session.url, status: deal.status });
    } catch (error: any) {
      console.error("Error creating promotion sponsorship checkout:", error);
      res.status(500).json({ message: error?.message || "Failed to start sponsorship payment" });
    }
  });

  app.post('/api/promoter/promotion-sponsorship/confirm', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const sessionId = String(req.body?.sessionId || "");
      if (!sessionId.startsWith("cs_")) return res.status(400).json({ message: "A valid Checkout session is required" });

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.type !== "promotion_sponsorship" || session.metadata?.partnerId !== userId) {
        return res.status(403).json({ message: "This sponsorship payment does not belong to you" });
      }
      if (session.payment_status !== "paid") {
        return res.status(409).json({ message: "Sponsorship payment is not complete" });
      }

      await finalizePromotionSponsorshipSession(session);
      const deal = session.metadata?.promotionDealId
        ? await storage.getPromotionDeal(session.metadata.promotionDealId)
        : undefined;
      res.json({ success: true, deal, message: "Sponsorship paid and deal confirmed" });
    } catch (error: any) {
      console.error("Error confirming promotion sponsorship:", error);
      res.status(500).json({ message: error?.message || "Failed to confirm sponsorship payment" });
    }
  });

  // Experience draft routes
  app.get('/api/experience-drafts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching experience drafts:", error);
      res.status(500).json({ message: "Failed to fetch drafts" });
    }
  });

  app.post('/api/experience-drafts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Normalize date fields before saving (defense in depth).
      const parsedBody = { ...req.body };
      parsedBody.greatPillars = normalizeGreatPillarsPayload(parsedBody.greatPillars);
      parsedBody.monetisationMode = "creator_led";
      parsedBody.ticketSkus = normalizeTicketSkus(parsedBody.ticketSkus);

      // A trip's start and end are calendar days, not moments, so they are
      // anchored to the day whatever timezone the browser sent them from.
      // Without this a creator east of UTC stored the day before, and the
      // venue's calendar held the wrong date.
      if (parsedBody.startDate) parsedBody.startDate = toCalendarDate(parsedBody.startDate);
      if (parsedBody.endDate) parsedBody.endDate = toCalendarDate(parsedBody.endDate);
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      const draftData = sanitizeDraftNumerics(applyMarketplaceEconomics({ ...parsedBody, creatorId: userId }));
      const draft = await storage.createExperienceDraft(draftData);
      res.json(draft);
    } catch (error: any) {
      console.error("Error creating experience draft:", error);
      res.status(500).json({ message: "Failed to create draft", detail: error?.message });
    }
  });

  app.put('/api/experience-drafts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      console.log("Updating draft:", id, "for user:", userId);
      
      // Remove fields that should not be updated by client.
      const {
        id: _id, creatorId: _creatorId, createdAt: _createdAt, updatedAt: _updatedAt,
        ...cleanBody
      } = req.body;

      // Normalize date fields before saving (defense in depth)
      const updateData = { ...cleanBody };
      updateData.greatPillars = normalizeGreatPillarsPayload(updateData.greatPillars);
      updateData.monetisationMode = "creator_led";
      if (updateData.ticketSkus !== undefined) {
        updateData.ticketSkus = normalizeTicketSkus(updateData.ticketSkus);
      }
      
      // Convert date strings to valid Date objects or null if invalid
      if (updateData.startDate !== undefined) {
        if (updateData.startDate === null || updateData.startDate === '') {
          updateData.startDate = null;
        } else {
          const date = new Date(updateData.startDate);
          updateData.startDate = !isNaN(date.getTime()) ? date : null;
        }
      }
      if (updateData.endDate !== undefined) {
        if (updateData.endDate === null || updateData.endDate === '') {
          updateData.endDate = null;
        } else {
          const date = new Date(updateData.endDate);
          updateData.endDate = !isNaN(date.getTime()) ? date : null;
        }
      }
      if (updateData.mvgDeadline !== undefined) {
        if (updateData.mvgDeadline === null || updateData.mvgDeadline === '') {
          updateData.mvgDeadline = null;
        } else {
          const date = new Date(updateData.mvgDeadline);
          updateData.mvgDeadline = !isNaN(date.getTime()) ? date : null;
        }
      }
      
      const draft = await storage.updateExperienceDraft(id, userId, sanitizeDraftNumerics(updateData));
      res.json(draft);
    } catch (error: any) {
      console.error("Error updating experience draft:", error);
      res.status(500).json({ message: "Failed to update draft", detail: error?.message });
    }
  });

  app.delete('/api/experience-drafts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      await storage.deleteExperienceDraft(id, userId);
      res.json({ message: "Draft deleted" });
    } catch (error) {
      console.error("Error deleting experience draft:", error);
      res.status(500).json({ message: "Failed to delete draft" });
    }
  });

  // Get latest draft for user
  app.get('/api/experience-drafts/latest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      const latest = drafts.sort((a, b) => {
        const bDate = b.updatedAt || b.createdAt;
        const aDate = a.updatedAt || a.createdAt;
        if (!bDate || !aDate) return 0;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })[0];
      res.json(latest || null);
    } catch (error) {
      console.error("Error fetching latest draft:", error);
      res.status(500).json({ message: "Failed to get latest draft" });
    }
  });

  // Get specific draft by ID
  app.get('/api/experience-drafts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const draft = await storage.getExperienceDraftById(id);
      
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      
      // Verify ownership
      if (draft.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(draft);
    } catch (error) {
      console.error("Error fetching draft:", error);
      res.status(500).json({ message: "Failed to fetch draft" });
    }
  });

  // Delete all user drafts
  app.delete('/api/experience-drafts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const drafts = await storage.getExperienceDraftsByCreator(userId);
      for (const draft of drafts) {
        await storage.deleteExperienceDraft(draft.id, userId);
      }
      res.json({ message: "All drafts deleted" });
    } catch (error) {
      console.error("Error deleting drafts:", error);
      res.status(500).json({ message: "Failed to delete drafts" });
    }
  });

  // Field name mapping: frontend → backend database columns
  const mapFrontendFieldsToDB = (data: any) => {
    const mapped = { ...data };
    // Map frontend field names to database column names
    if ('type' in mapped) {
      mapped.type = data.type; // Keep as 'type' for drafts, will be mapped to 'experienceType' on publish
    }
    if ('selectedVenueId' in mapped) {
      mapped.selectedVenueId = data.selectedVenueId; // Keep as 'selectedVenueId' for drafts, will be mapped to 'linkedVenueId' on publish
    }
    return mapped;
  };

  // Save Draft API endpoint - Creates new draft with incomplete data
  app.post('/api/events/saveDraft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log("Creating new draft for user:", userId);
      console.log("Draft data received:", req.body);
      
      // Normalize date fields before validation
      const parsedBody = { ...req.body };
      
      // A trip's start and end are calendar days, not moments, so they are
      // anchored to the day whatever timezone the browser sent them from.
      // Without this a creator east of UTC stored the day before, and the
      // venue's calendar held the wrong date.
      if (parsedBody.startDate) parsedBody.startDate = toCalendarDate(parsedBody.startDate);
      if (parsedBody.endDate) parsedBody.endDate = toCalendarDate(parsedBody.endDate);
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // Map frontend field names to backend
      const mappedBody = mapFrontendFieldsToDB(parsedBody);

      // Validate draft data using Zod schema
      const validationResult = insertExperienceDraftSchema.safeParse(mappedBody);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        console.error("Draft validation failed:", errors);
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }

      const draftData: any = applyMarketplaceEconomics({
        ...validationResult.data,
        // Convert types to match database schema
        price: validationResult.data.price?.toString(),
        creatorId: userId,
        status: 'draft' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Always create new draft - don't update existing ones here
      const result = await storage.createExperienceDraft(draftData);
      
      res.json({ 
        success: true, 
        message: "Draft saved successfully",
        draft: result 
      });
    } catch (error: any) {
      console.error("Error saving draft:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to save draft", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Update Draft API endpoint - Updates existing draft until published
  app.put('/api/events/updateDraft/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const draftId = req.params.id;
      console.log("Updating draft:", draftId, "for user:", userId);
      console.log("Update data received:", req.body);
      
      // Only allow updates if status is still 'draft'
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Draft not found" 
        });
      }
      
      if (existingDraft.status !== 'draft') {
        return res.status(400).json({ 
          success: false,
          message: "Cannot update draft - already published or pending review" 
        });
      }
      
      // Normalize date fields before validation
      const parsedBody = { ...req.body };
      
      // A trip's start and end are calendar days, not moments, so they are
      // anchored to the day whatever timezone the browser sent them from.
      // Without this a creator east of UTC stored the day before, and the
      // venue's calendar held the wrong date.
      if (parsedBody.startDate) parsedBody.startDate = toCalendarDate(parsedBody.startDate);
      if (parsedBody.endDate) parsedBody.endDate = toCalendarDate(parsedBody.endDate);
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // Map frontend field names to backend
      const mappedBody = mapFrontendFieldsToDB(parsedBody);

      // Validate update data using Zod schema (partial validation for updates)
      const validationResult = insertExperienceDraftSchema.partial().safeParse(mappedBody);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        console.error("Draft update validation failed:", errors);
        return res.status(400).json({ 
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }

      const updateData: any = { 
        ...validationResult.data,
        // Convert types to match database schema
        price: validationResult.data.price?.toString(),
        creatorId: userId,
        status: 'draft' as const,
        updatedAt: new Date()
      };
      
      const result = await storage.updateExperienceDraft(draftId, userId, updateData);
      
      res.json({ 
        success: true, 
        message: "Draft updated successfully",
        draft: result 
      });
    } catch (error: any) {
      console.error("Error updating draft:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to update draft", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Publish Event API endpoint - Finalizes draft and sets to pending
  app.post('/api/events/publishEvent/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const draftId = req.params.id;
      console.log("Publishing event:", draftId, "for user:", userId);
      console.log("Event data received:", req.body);
      
      // Verify draft exists and belongs to user
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Draft not found" 
        });
      }
      
      // Validate required fields for publishing
      const errors: string[] = [];
      
      // Check if this is a demo event (bypass validation for demos)
      const isDemoEvent = req.body.title?.toLowerCase().includes('mystic') && 
                         req.body.title?.toLowerCase().includes('marrakesh');
      
      // Required: Cover photo
      if (!isDemoEvent) {
        if (!req.body.coverImageUrl || req.body.coverImageUrl.trim() === '') {
          errors.push("Cover photo is required and must be uploaded");
        } else {
          // Validate URL format
          try {
            const url = new URL(req.body.coverImageUrl);
            const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
            if (!allowedProtocols.includes(url.protocol)) {
              errors.push("Cover photo must use a valid URL");
            }
          } catch {
            errors.push("Cover photo must be a valid URL");
          }
        }
      }
      
      // Required: Title
      if (!req.body.title || req.body.title.trim() === '') {
        errors.push("Title is required");
      }
      
      // Required: Description
      if (!req.body.description || req.body.description.trim() === '') {
        errors.push("Description is required");
      }
      
      // Required: Start date
      if (!req.body.startDate) {
        errors.push("Start date is required");
      } else {
        // Validate date format
        try {
          const startDate = new Date(req.body.startDate);
          if (isNaN(startDate.getTime())) {
            errors.push("Invalid start date format");
          } else if (startDate < new Date()) {
            errors.push("Start date must be in the future");
          }
        } catch {
          errors.push("Invalid start date");
        }
      }
      
      // Required: Location
      if (!req.body.location || req.body.location.trim() === '') {
        errors.push("Location is required");
      }
      
      // Venue validation
      const venueType = req.body.venueType || 'catalog';
      if (venueType === 'catalog') {
        if (!req.body.selectedVenueId || req.body.selectedVenueId.trim() === '') {
          errors.push("Please select a venue from the catalog");
        }
      } else if (venueType === 'manual') {
        if (!req.body.manualVenueName || req.body.manualVenueName.trim() === '') {
          errors.push("Manual venue name is required");
        }
        if (!req.body.manualVenueAddress || req.body.manualVenueAddress.trim() === '') {
          errors.push("Manual venue address is required");
        }
        if (!req.body.manualVenueEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.manualVenueEmail)) {
          errors.push("A valid venue email address is required");
        }
        try {
          const propertyUrl = new URL(req.body.manualVenuePropertyUrl);
          if (!['http:', 'https:'].includes(propertyUrl.protocol)) throw new Error('Invalid protocol');
        } catch {
          errors.push("A valid property link is required");
        }
      } else if (venueType === 'virtual') {
        if (!req.body.virtualPlatform || req.body.virtualPlatform.trim() === '') {
          errors.push("Virtual platform is required");
        }
      } else if (venueType === 'open') {
        if (!req.body.venueOpenSpaceType || req.body.venueOpenSpaceType.trim() === '') {
          errors.push("Please select the type of space you are looking for");
        }
      }

      errors.push(...validateExperienceVenueDeal(req.body));

      // Pricing validation - conditional logic based on rooms
      const rooms = req.body.rooms || [];
      const hasRooms = rooms.length > 0;
      
      if (hasRooms) {
        // If rooms exist, validate all rooms have valid pricing
        const invalidRooms = rooms.filter((room: any) => !room.pricePerPerson || parseFloat(room.pricePerPerson) <= 0);
        if (invalidRooms.length > 0) {
          errors.push("All rooms must have a price per person greater than 0");
        }
      } else {
        // Require base price; 0 is allowed for free RSVP events
        const basePrice = parseFloat(req.body.price ?? req.body.pricePerPerson);
        if (req.body.price === undefined && req.body.pricePerPerson === undefined) {
          errors.push("A ticket price is required (use 0 for free RSVP events)");
        } else if (Number.isNaN(basePrice) || basePrice < 0) {
          errors.push("Ticket price must be 0 or greater");
        }
      }

      const publishTicketSkus = normalizeTicketSkus(req.body.ticketSkus);
      const publishTicketCapacity = publishTicketSkus.reduce(
        (total: number, sku: any) => total + numberOrZero(sku?.ticketCapacity),
        0,
      );
      const publishMvgMinimum = numberOrZero(req.body.minimumParticipants ?? req.body.mvgMinimumSize);
      if ((req.body.requireMinimumParticipants ?? req.body.mvgEnabled)
        && publishTicketCapacity > 0
        && publishMvgMinimum > publishTicketCapacity) {
        errors.push(`Minimum participants cannot exceed total ticket capacity (${publishTicketCapacity})`);
      }
      
      // Required: Terms acceptance
      if (!req.body.termsAccepted) {
        errors.push("Terms and conditions must be accepted");
      }
      
      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: "Validation failed", 
          errors: errors
        });
      }
      
      // Normalize date fields before saving (defense in depth)
      const parsedBody = { ...req.body };
      parsedBody.ticketSkus = normalizeTicketSkus(parsedBody.ticketSkus);
      
      // A trip's start and end are calendar days, not moments, so they are
      // anchored to the day whatever timezone the browser sent them from.
      // Without this a creator east of UTC stored the day before, and the
      // venue's calendar held the wrong date.
      if (parsedBody.startDate) parsedBody.startDate = toCalendarDate(parsedBody.startDate);
      if (parsedBody.endDate) parsedBody.endDate = toCalendarDate(parsedBody.endDate);
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }

      // ── Self-Hosted / Manual Address logic ──────────────────────────────────
      // When no platform Space is linked (venueType = 'manual' or selectedVenueId is blank),
      // the creator is bringing their own venue.
      // Force venueRevenuePercentage → 0 and give that % back to the creator.
      const isLinkedVenue = !!(parsedBody.selectedVenueId && parsedBody.selectedVenueId.trim() !== '');
      // Prepare final event data - lock required fields
      const eventData = applyMarketplaceEconomics({
        ...parsedBody,
        creatorId: userId,
        status: 'pending_approval',
        publishedAt: new Date(),
        updatedAt: new Date(),
        locked: true, // Indicate this is locked for changes
        venueCompensationModel: isLinkedVenue ? parsedBody.venueCompensationModel : 'access_only',
      });
      
      // Update draft to pending status (finalizes it)
      const result = await storage.updateExperienceDraft(draftId, userId, eventData);
      if (existingDraft.status !== 'pending_approval') {
        notifyCreatorEventSubmittedForReview(result).catch((error) => {
          console.error("Failed to send event submitted email:", error);
        });
      }

      let externalVenueInvitationSent = false;
      let externalVenueInvitationWarning: string | undefined;
      if (venueType === 'manual' && existingDraft.status !== 'pending_approval') {
        try {
          // The invite gets its own row and token so the email can link to a
          // claim screen instead of the public event page.
          const invite = await createVenueInviteForExperience({
            ...eventData,
            id: (result as any).id,
            creatorId: userId,
          });
          await notificationService.sendExternalVenueInvitation({
            ...eventData,
            id: (result as any).id,
            slug: (result as any).slug,
            inviteToken: invite?.token,
          });
          externalVenueInvitationSent = true;
        } catch (error: any) {
          externalVenueInvitationWarning = error?.message || 'The venue invitation could not be sent';
          console.error('External venue invitation failed:', error);
        }
      }

      // Digital Handshake proposal: publishing with a linked platform venue puts the
      // contract in the venue owner's Pending Offers tab — email them about it.
      if (venueType !== 'manual' && isLinkedVenue && existingDraft.status !== 'pending_approval') {
        (async () => {
          const venue = await storage.getVenue(parsedBody.selectedVenueId!);
          const owner = (venue as any)?.createdBy ? await storage.getUser((venue as any).createdBy) : undefined;
          if (!owner?.email) return;
          await notificationService.sendVenueContractProposalEmail({
            to: owner.email,
            recipientName: owner.firstName,
            venueName: (venue as any)?.name,
            experienceTitle: (eventData as any).title || 'A new experience',
            experienceSlugOrId: (result as any)?.slug || (result as any)?.id || draftId,
            model: (eventData as any).venueCompensationModel,
            terms: {
              fixedFee: (eventData as any).venueFixedFee,
              perHeadAmount: (eventData as any).venuePerHeadAmount,
              minimumSpend: (eventData as any).venueMinimumSpend,
              revenueSharePct: (eventData as any).venueRevenueSharePct,
              accessFee: (eventData as any).venueAccessFee,
            },
            currency: (eventData as any).currency,
          });
        })().catch((err) => console.error('Venue contract proposal email failed:', err?.message || err));
      }

      let externalPromotionInvitationsSent = 0;
      let externalPromotionInvitationWarning: string | undefined;
      if (Array.isArray((eventData as any).promotionExternalInvites)
        && (eventData as any).promotionExternalInvites.length > 0
          && existingDraft.status !== 'pending_approval') {
        try {
          externalPromotionInvitationsSent = await notificationService.sendPromotionExternalInvitations({ ...(eventData as any), id: (result as any).id, slug: (result as any).slug });
        } catch (error: any) {
          externalPromotionInvitationWarning = error?.message || 'The promotion invitations could not be sent';
          console.error('External promotion invitations failed:', error);
        }
      }
      
      res.json({ 
        success: true, 
        message: "Event published successfully - pending review",
        event: result,
        externalVenueInvitationSent,
        externalPromotionInvitationsSent,
        ...(externalVenueInvitationWarning ? { warning: externalVenueInvitationWarning } : {}),
        ...(externalPromotionInvitationWarning ? { promotionWarning: externalPromotionInvitationWarning } : {}),
      });
    } catch (error: any) {
      console.error("Error publishing event:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to publish event", 
        error: error?.message || "Unknown error" 
      });
    }
  });

  // Removed mock signed URL endpoint - use /api/objects/upload instead
  // Mock venues and services endpoints removed - now using real database endpoints below

  // Profile routes
  app.get('/api/participant-profile/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profile = await storage.getParticipantProfileByUserId(userId);
      res.json({
        hasProfile: !!profile,
        profile: profile || null,
      });
    } catch (error) {
      console.error("Error checking participant profile status:", error);
      res.status(500).json({ message: "Failed to check profile status" });
    }
  });

  app.get('/api/participant-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getParticipantProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching participant profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get('/api/creator-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getCreatorProfileByUserId(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching creator profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post('/api/creator-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      console.log("Creating creator profile for user:", userId);
      console.log("Profile data received:", req.body);
      
      // Handle both location and baseLocation field names
      const location = req.body.location || req.body.baseLocation;
      
      // Validate required fields
      if (!req.body.displayName || !req.body.bio || !location || !req.body.experienceLevel || !req.body.payoutEmail) {
        return res.status(400).json({ 
          message: "Missing required fields", 
          required: ["displayName", "bio", "location/baseLocation", "experienceLevel", "payoutEmail"] 
        });
      }

      // Transform the data to match database schema
      const profileData = {
        displayName: req.body.displayName,
        bio: req.body.bio,
        location: location,
        experienceLevel: req.body.experienceLevel,
        payoutEmail: req.body.payoutEmail,
        termsAccepted: req.body.termsAccepted || false,
        tagline: req.body.tagline || null,
        profilePhoto: req.body.profilePhoto || null,
        expertiseTags: req.body.expertiseTags || req.body.expertise || [],
        gallery: req.body.gallery || req.body.portfolioImages || [],
        socialLinks: req.body.socialLinks || req.body.socialMediaLinks || {},
        stripeVerificationStatus: "pending",
        approved: false,
        completed: true // Mark profile as completed when successfully created
      };
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, profileData);
      
      console.log("Creator profile created successfully:", profile.id);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating creator profile:", error);
      res.status(500).json({ 
        message: "Failed to create creator profile", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.put('/api/creator-profile', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log("Updating creator profile for user:", userId);
      console.log("Profile updates received:", req.body);
      
      // Transform the data to match database schema
      const profileData = {
        displayName: req.body.displayName,
        bio: req.body.bio,
        location: req.body.location,
        experienceLevel: req.body.experienceLevel,
        payoutEmail: req.body.payoutEmail,
        termsAccepted: req.body.termsAccepted,
        tagline: req.body.tagline || null,
        profilePhoto: req.body.profilePhoto || null,
        expertiseTags: req.body.expertiseTags || [],
        gallery: req.body.gallery || [],
        socialLinks: req.body.socialLinks || {},
        completed: true // Mark profile as completed when successfully updated
      };
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, profileData);
      
      console.log("Creator profile updated successfully:", profile.id);
      res.json(profile);
    } catch (error) {
      console.error("Error updating creator profile:", error);
      res.status(500).json({ 
        message: "Failed to update creator profile", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Experience routes - List public experiences (approved and published by default)
  app.get("/api/experiences", async (req, res) => {
    try {
      const { category, status, limit, includeParticipants } = req.query;
      
      // If no status specified, fetch both approved and published experiences
      // Otherwise use the specified status filter
      const statusFilter = status as string || undefined;
      
      // Helper: enrich a list of experiences with live MVG progress (single source of truth)
      // Real participant count is fetched from bookings for every experience, not just
      // MVG-gated ones — the listing/card UI shows "X / Y participants" for all of them.
      const enrichWithLiveLifecycle = async (exps: any[]) => {
        return Promise.all(exps.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const curr = mvgProgress.current_participants;
          if (exp.requireMinimumParticipants) {
            const mvgMet = mvgProgress.mvg_met;
            const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
            const min = mvgProgress.minimum_participants || exp.minimumParticipants || 0;
            const fundingPercentage = min > 0 ? Math.round((curr / min) * 100) : 0;
            const participantsNeeded = Math.max(0, min - curr);
            return {
              ...exp,
              currentParticipants: curr,
              participantCount: curr,
              minimumParticipants: min,
              fundingPercentage,
              participantsNeeded,
              mvgMet,
              lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
            };
          }
          return {
            ...exp,
            currentParticipants: curr,
            participantCount: curr,
            lifecycleStatus: computeLifecycleStatus(exp),
          };
        }));
      };

      // Use enriched method when participant previews are requested
      if (includeParticipants === "true") {
        let experiences = await storage.getExperiencesWithParticipantPreview({
          category: category as string,
          status: statusFilter,
          limit: limit ? parseInt(limit as string) : undefined,
        });
        
        // With no explicit status filter, expose every public experience.
        // Price 0 is intentional for Free RSVP events and must remain discoverable.
        if (!statusFilter) {
          experiences = experiences.filter(isPublicExperienceListable);
        }
        
        res.json(await enrichWithLiveLifecycle(experiences));
      } else {
        let experiences = await storage.getExperiences({
          category: category as string,
          status: statusFilter,
          limit: limit ? parseInt(limit as string) : undefined,
        });
        
        // With no explicit status filter, expose every public experience.
        // Price 0 is intentional for Free RSVP events and must remain discoverable.
        if (!statusFilter) {
          experiences = experiences.filter(isPublicExperienceListable);
        }
        
        res.json(await enrichWithLiveLifecycle(experiences));
      }
    } catch (error) {
      console.error("Error fetching experiences:", error);
      res.status(500).json({ message: "Failed to fetch experiences" });
    }
  });

  app.get("/api/experiences/:id", async (req: any, res) => {
    try {
      // Support both ID and slug lookup
      let experience = await storage.getExperience(req.params.id);
      if (!experience) {
        // Try slug lookup if ID lookup fails
        experience = await storage.getExperienceBySlug(req.params.id);
      }
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      // ACCESS CONTROL IMPLEMENTATION
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      const isCreator = userId && experience.creatorId === userId;
      
      console.log(`[Experience ${req.params.id}] Status: ${experience.status}, User: ${req.user?.claims?.email ?? 'anonymous'}, IsAdmin: ${isAdmin}, IsCreator: ${isCreator}`);
      
      // Check for valid preview token (ONLY for pending status)
      const previewToken = req.query.preview as string;
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      const hasValidPreviewToken = 
        isPendingStatus && 
        previewToken && 
        experience.previewToken && 
        previewToken === experience.previewToken;
      
      // ACCESS CONTROL RULES:
      // 1. APPROVED/PUBLISHED: Visible to everyone (public)
      // 2. CANCELLED: Visible to everyone (participants need to see their cancellation)
      // 3. PENDING: Visible ONLY with valid preview token OR to creator/admin
      // 4. DRAFT: Visible ONLY to creator/admin (preview tokens do NOT work for drafts)
      const isApproved = experience.status === "approved" || experience.status === "published";
      const isCancelled = experience.status === "cancelled";
      const isDraft = experience.status === "draft";
      
      // Check access
      if (!isApproved && !isCancelled) {
        // Not approved or cancelled - check if user has permission
        if (isDraft) {
          // Draft: ONLY creator/admin (no preview tokens)
          if (!isCreator && !isAdmin) {
            console.log(`[Experience ${req.params.id}] Access denied - Draft only visible to creator/admin`);
            return res.status(404).json({ message: "Experience not found" });
          }
        } else if (isPendingStatus) {
          // Pending: requires valid preview token OR creator/admin
          if (!hasValidPreviewToken && !isCreator && !isAdmin) {
            console.log(`[Experience ${req.params.id}] Access denied - Pending requires preview token or creator/admin`);
            return res.status(404).json({ message: "Experience not found" });
          }
        } else {
          // Any other status: not accessible
          console.log(`[Experience ${req.params.id}] Access denied - Invalid status: ${experience.status}`);
          return res.status(404).json({ message: "Experience not found" });
        }
      }
      
      // Get stats and bookings
      const stats = await storage.getExperienceStats(req.params.id);
      const bookings = await storage.getBookingsByExperience(req.params.id);
      const reviews = await storage.getReviewsByExperience(req.params.id);
      // Enrich with live MVG count for accurate lifecycle status
      const mvgProgress = await storage.getMVGProgress(req.params.id);
      const mvgMet = mvgProgress.mvg_met;
      const resolvedMvgStatus = mvgMet ? 'met' : (experience.mvgStatus || 'pending');

      res.json({
        ...experience,
        // Override stale DB column with live booking count — single source of truth
        currentParticipants: mvgProgress.current_participants,
        stats,
        bookings: bookings.filter(b => b.status === "confirmed"),
        reviews,
        // Lifecycle status - single source of truth for FORMING/CONFIRMED/CANCELLED
        mvgStatus: resolvedMvgStatus,
        lifecycleStatus: computeLifecycleStatus({ ...experience, mvgStatus: resolvedMvgStatus, mvgMet }),
        // Include full MVG data for client-side accuracy
        mvgProgressData: {
          currentBookings: mvgProgress.current_participants,
          mvgMin: mvgProgress.minimum_participants,
          mvgMet: mvgProgress.mvg_met,
        },
      });
    } catch (error) {
      console.error("Error fetching experience:", error);
      res.status(500).json({ message: "Failed to fetch experience" });
    }
  });

  // Generate shareable link for experience
  app.get("/api/experiences/:id/share-link", async (req, res) => {
    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      const baseUrl = getAppBaseUrl(req);
      const shareUrl = `${baseUrl}/experience/${id}`;
      const referralCode = `ref_${id.slice(0, 8)}_${Date.now().toString(36)}`;

      res.json({
        shareUrl,
        referralCode,
        experience: {
          id: experience.id,
          title: experience.title,
          description: experience.shortDescription || experience.description.slice(0, 120) + '...',
          coverImageUrl: experience.coverImageUrl,
          price: experience.price,
          location: experience.location
        }
      });
    } catch (error) {
      console.error("Error generating share link:", error);
      res.status(500).json({ message: "Failed to generate share link" });
    }
  });

  // Generate preview token for pending experiences (creator/admin only)
  app.post("/api/experiences/:id/generate-preview-token", async (req: any, res) => {
    try {
      const { id } = req.params;
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const experience = await storage.getExperience(id);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Only creator or admin can generate preview tokens
      const isCreator = experience.creatorId === userId;
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ message: "Only the creator or admin can generate preview links" });
      }

      // Preview tokens are only for pending/pending_approval experiences (not drafts)
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      if (!isPendingStatus) {
        return res.status(400).json({ 
          message: "Preview tokens can only be generated for pending experiences. Please submit your experience for review first." 
        });
      }

      // Generate a secure random preview token
      const crypto = await import('crypto');
      const previewToken = crypto.randomBytes(32).toString('hex');
      
      // Update experience with preview token
      await storage.updateExperience(id, { previewToken });

      const baseUrl = getAppBaseUrl(req);
      const previewUrl = `${baseUrl}/experience/${id}?preview=${previewToken}`;

      res.json({
        previewToken,
        previewUrl,
        message: "Preview link generated successfully. Share this link to allow others to view your pending experience."
      });
    } catch (error) {
      console.error("Error generating preview token:", error);
      res.status(500).json({ message: "Failed to generate preview token" });
    }
  });

  // Fetch experience by slug or ID with status-based visibility
  app.get("/api/e/:slugOrId", async (req: any, res) => {
    try {
      const { slugOrId } = req.params;
      
      // Try to fetch by slug first, then by ID if not found
      let experience = await storage.getExperienceBySlug(slugOrId);
      if (!experience) {
        experience = await storage.getExperience(slugOrId);
      }
      
      if (!experience) {
        return res.status(404).json({ message: "Not Found" });
      }
      
      // ACCESS CONTROL IMPLEMENTATION
      // In development, use hardcoded user ID for testing; in production, use authenticated session
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      const isCreator = userId && experience.creatorId === userId;
      
      // Check for valid preview token (for pending experiences)
      const previewToken = req.query.preview as string;
      const isPendingStatus = experience.status === "pending" || experience.status === "pending_approval";
      const hasValidPreviewToken = 
        isPendingStatus && 
        previewToken && 
        experience.previewToken && 
        previewToken === experience.previewToken;
      
      // ACCESS CONTROL RULES:
      // 1. APPROVED: Visible to everyone (public)
      // 2. PENDING: Visible ONLY with valid preview token OR to creator/admin
      // 3. DRAFT: Visible ONLY to creator/admin (preview tokens do NOT work for drafts)
      const isApproved = experience.status === "approved" || experience.status === "published";
      const isDraft = experience.status === "draft";
      
      // Check access
      if (!isApproved) {
        // Not approved - check if user has permission
        if (isDraft) {
          // Draft: ONLY creator/admin (no preview tokens)
          if (!isCreator && !isAdmin) {
            return res.status(404).json({ message: "Not Found" });
          }
        } else if (isPendingStatus) {
          // Pending: requires valid preview token OR creator/admin
          if (!hasValidPreviewToken && !isCreator && !isAdmin) {
            return res.status(404).json({ message: "Not Found" });
          }
        } else {
          // Any other status: not accessible
          return res.status(404).json({ message: "Not Found" });
        }
      }
      
      // Get related data: venue, creator, creator profile, stats, bookings, reviews, gallery, mvgProgress (parallel fetch)
      const [venue, creator, creatorProfile, stats, bookings, reviews, galleryImages, mvgProgress] = await Promise.all([
        experience.linkedVenueId ? storage.getVenue(experience.linkedVenueId) : Promise.resolve(null),
        storage.getUser(experience.creatorId),
        storage.getCreatorProfileByUserId(experience.creatorId),
        storage.getExperienceStats(experience.id),
        storage.getBookingsByExperience(experience.id),
        storage.getReviewsByExperience(experience.id),
        storage.getExperienceGallery(experience.id),
        storage.getMVGProgress(experience.id),
      ]);
      
      // Fetch amenities and services with fallback (tables may not exist yet)
      let experienceAmenities: any[] = [];
      let experienceServices: any[] = [];
      try {
        experienceAmenities = await storage.getExperienceAmenities(experience.id);
      } catch (error) {
        // Table doesn't exist yet, continue without amenities
      }
      try {
        experienceServices = await storage.getExperienceServices(experience.id);
      } catch (error) {
        // Table doesn't exist yet, continue without services
      }

      // Calculate duration in days (with validation)
      let durationDays = null;
      if (experience.startDate && experience.endDate) {
        const startDate = new Date(experience.startDate);
        const endDate = new Date(experience.endDate);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
      }

      res.json({
        // Include all original experience fields
        ...experience,
        
        // Add enhanced display fields
        short_description: experience.shortDescription,
        full_description: experience.description,
        start_date: experience.startDate,
        end_date: experience.endDate,
        duration: durationDays,
        
        // Media fields
        cover_image: experience.coverImageUrl,
        gallery: galleryImages.map(img => ({
          id: img.id,
          imageUrl: img.imageUrl,
          caption: img.caption,
          order: img.order,
        })),
        
        // Itinerary data (days, activities, time blocks)
        itinerary: experience.itinerary || [],
        
        // Amenities - structured objects with id, name, description, custom, approvedByAdmin
        amenities: Array.isArray((experience as any).amenities) 
          ? (experience as any).amenities
          : [],
        
        // Services - structured objects with id, name, description, custom, approvedByAdmin
        services: Array.isArray((experience as any).services) 
          ? (experience as any).services
          : [],
        
        // Roles - structured objects with name, required, headcount, rate, notes
        roles: Array.isArray((experience as any).roles) 
          ? (experience as any).roles
          : [],
        
        // Lifecycle status - single source of truth for FORMING/CONFIRMED/CANCELLED
        lifecycleStatus: computeLifecycleStatus({
          status: experience.status || '',
          mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
          requireMinimumParticipants: experience.requireMinimumParticipants,
          mvgMet: mvgProgress.mvg_met,
        }),
        
        // MVG (Minimum Viable Group) data - using single source of truth
        mvg: {
          enabled: experience.requireMinimumParticipants || false,
          minimum_required: mvgProgress.minimum_participants,
          current_signups: mvgProgress.current_participants,
          soft_hold_deadline: experience.mvgDeadline,
          status: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
          escrow_enabled: experience.escrowEnabled || false,
          mvg_met: mvgProgress.mvg_met,
        },
        
        // Pricing data (rooms/SKUs with price, discount, available spots)
        pricing: {
          currency: (experience as any).currency || 'usd',
          basePrice: (experience as any).pricePerPerson
            ? parseFloat((experience as any).pricePerPerson.toString())
            : (experience.price ? parseFloat(experience.price.toString()) : 0),
          pricePerPerson: (experience as any).pricePerPerson
            ? parseFloat((experience as any).pricePerPerson.toString())
            : (experience.price ? parseFloat(experience.price.toString()) : 0),
          depositEnabled: experience.depositEnabled || false,
          depositAmount: (experience as any).depositAmount
            ? parseFloat((experience as any).depositAmount.toString())
            : 0,
          depositPercentage: experience.depositPercentage ? parseFloat(experience.depositPercentage) : 0,
          rooms: ((experience as any).rooms as any[] || []).map((room: any) => {
            // Find discount for this room/SKU
            const roomDiscount = (experience.discounts as any[] || []).find(
              (d: any) => d.active && d.skuId === room.id && 
              (!d.validUntil || new Date(d.validUntil) > new Date())
            );
            
            // Calculate available spots
            const bookedCount = sumBookingTicketQuantity(
              bookings.filter((b: any) =>
                b.status === 'confirmed' && b.roomId === room.id
              ),
            );
            const availableSpots = (room.quantity || 0) - bookedCount;
            
            return {
              id: room.id,
              name: room.name,
              price: room.pricePerPerson || 0,
              quantity: room.quantity || 0,
              availableSpots: Math.max(0, availableSpots),
              discount: roomDiscount ? {
                title: roomDiscount.title,
                type: roomDiscount.type,
                value: roomDiscount.value,
                validUntil: roomDiscount.validUntil,
              } : null,
              gallery: room.gallery || [],
              notes: room.notes,
            };
          }),
          discounts: (experience.discounts as any[] || []).filter((d: any) => 
            d.active && (!d.validUntil || new Date(d.validUntil) > new Date())
          ),
        },
        
        // Linked records
        venue: venue ? {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          city: venue.city,
          location: venue.location,
          capacity: venue.capacity,
          description: venue.description,
          coverImageUrl: venue.coverImageUrl,
          amenities: venue.amenities,
          website: venue.website,
          instagram: venue.instagram,
          // Photos array: cover image + gallery images
          photos: [
            ...(venue.coverImageUrl ? [venue.coverImageUrl] : []),
            ...(venue.galleryImages || []),
          ],
        } : null,
        
        creator: creator ? {
          id: creator.id,
          displayName: creatorProfile?.displayName || null,
          bio: creatorProfile?.bio || null,
          avatarUrl: creatorProfile?.profilePhoto || creator.profileImageUrl || null,
          baseLocation: creatorProfile?.location || null,
          expertise: creatorProfile?.expertiseTags || [],
          experienceLevel: creatorProfile?.experienceLevel || null,
          isVerified: false,
          averageRating: stats?.averageRating || null,
          totalExperiences: null,
          socialLink: creatorProfile?.socialLinks?.website ||
            creatorProfile?.socialLinks?.instagram ||
            creatorProfile?.socialLinks?.linkedin ||
            creatorProfile?.socialLinks?.youtube ||
            null,
          // Legacy fields for backward compatibility
          photo: creatorProfile?.profilePhoto || creator.profileImageUrl || null,
          name: creatorProfile?.displayName || `${creator.firstName} ${creator.lastName}`.trim(),
          tagline: creatorProfile?.tagline || null,
        } : null,
        
        // Additional data
        stats,
        bookings: bookings.filter(b => b.status === "confirmed"),
        reviews,
      });
    } catch (error) {
      console.error("Error fetching experience:", error);
      res.status(500).json({ message: "Not Found" });
    }
  });

  // Validation function for required fields - strict HTTPS validation
  const validateDraftForPublication = (
    data: any,
    options: { allowPastStart?: boolean } = {},
  ) => {
    const errors: string[] = [];
    
    // Check if this is a demo event (bypass validation for demos)
    const isDemoEvent = data.title?.toLowerCase().includes('mystic') && 
                       data.title?.toLowerCase().includes('marrakesh');
    
    const isSupportedMediaUrl = (value: string) => {
      try {
        const url = new URL(value);
        return ['https:', 'http:', 'blob:', 'data:'].includes(url.protocol);
      } catch {
        return false;
      }
    };

    // Required: cover photo - Skip for demo events
    if (!isDemoEvent) {
      if (!data.coverImageUrl || data.coverImageUrl.trim() === '') {
        errors.push("Please add a cover photo to showcase your experience");
      } else if (!isSupportedMediaUrl(data.coverImageUrl)) {
        errors.push("Cover photo must use a supported uploaded image URL");
      }
    }
    
    // Validate gallery images use supported URL protocols - Skip for demo events
    if (!isDemoEvent && data.gallery && data.gallery.length > 0) {
      const invalidGalleryUrls = data.gallery.filter((url: string) => !url || !isSupportedMediaUrl(url));
      if (invalidGalleryUrls.length > 0) {
        errors.push("Some gallery images have invalid formats. Please use supported uploaded image URLs");
      }
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Please add a compelling title for your experience");
    } else if (data.title.length < 10) {
      errors.push("Experience title should be at least 10 characters to help participants understand what to expect");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Please add a detailed description to help participants understand your experience");
    } else if (data.description.length < 50) {
      errors.push("Description should be at least 50 characters to provide enough detail for participants");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Please select when your experience will take place");
    } else {
      const startDate = new Date(data.startDate);
      const now = new Date();
      // An event that has already started can still be corrected — a typo in
      // the description should not be gated on a date nobody is changing.
      if (startDate < now && !options.allowPastStart) {
        errors.push("Experience start date must be in the future");
      }
    }

    const experienceType = data.type || "one-day";
    if (experienceType === "one-day") {
      if (!data.startTime || data.startTime.trim() === "") {
        errors.push("Please add a start time for your single-day event");
      }
      if (!data.endTime || data.endTime.trim() === "") {
        errors.push("Please add an end time for your single-day event");
      }
      if (!data.standingCapacity && !data.seatedCapacity && !data.maxParticipants) {
        errors.push("Please add capacity for your single-day event");
      }
    }
    if (experienceType === "multi-day") {
      if (!data.endDate) {
        errors.push("Please select an end date for your multi-day trip");
      }
      if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
        errors.push("Please add at least one room or sleeping option for your multi-day trip");
      }
    }
    
    // Required: venue or online location
    if (!data.location || data.location.trim() === '') {
      errors.push("Please specify where your experience will take place (venue address or online platform)");
    }
    
    // Required: pricing - zero is valid for free RSVP day events.
    const hasRoomPricing = Array.isArray(data.rooms) && data.rooms.length > 0 &&
      data.rooms.some((room: any) => room.pricePerPerson !== undefined && room.pricePerPerson !== null && room.pricePerPerson !== '' && parseFloat(room.pricePerPerson) >= 0);
    const hasTicketPricing = Array.isArray(data.ticketSkus) && data.ticketSkus.length > 0 &&
      data.ticketSkus.some((sku: any) => sku.pricePerPerson !== undefined && sku.pricePerPerson !== null && sku.pricePerPerson !== '' && parseFloat(sku.pricePerPerson) >= 0);
    const hasBasePricing = data.price !== undefined && data.price !== null && data.price !== '' && parseFloat(data.price) >= 0;
    
    if (!(hasRoomPricing || hasTicketPricing || hasBasePricing)) {
      errors.push("Please set a ticket price for your experience, including 0 for free RSVP events");
    } else {
      const allPrices = [
        ...(Array.isArray(data.ticketSkus) ? data.ticketSkus.map((sku: any) => Number(sku.pricePerPerson)) : []),
        ...(Array.isArray(data.rooms) ? data.rooms.map((room: any) => Number(room.pricePerPerson)) : []),
        Number(data.price),
      ].filter((price) => !Number.isNaN(price));
      if (allPrices.some((price) => price > 10000)) {
        errors.push("Experience price seems unusually high. Please contact support if this is intentional");
      }
    }

    errors.push(...validateExperienceVenueDeal(data));
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  // Publish draft endpoint - validates and converts draft to live experience
  app.post("/api/experience-drafts/:id/publish", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { id: draftId } = req.params;
      
      // Get the draft
      let draft = await storage.getExperienceDraftById(draftId);
      if (!draft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      
      // Verify ownership
      if (draft.creatorId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Publish using the latest submitted form values, while preserving ownership.
      draft = { ...draft, ...req.body, creatorId: draft.creatorId };
      
      // Validate draft against publication requirements
      const validation = validateDraftForPublication(draft);
      if (!validation.isValid) {
        return res.status(400).json({
          message: "Draft validation failed",
          errors: validation.errors,
          missingFields: validation.missingFields
        });
      }
      
      const experienceData = buildExperienceFromBuilderPayload(draft, userId);
      
      // Create the published experience
      const experience = await storage.createExperience(experienceData);
      await syncBuilderParticipantRoles(experience);
      notifyCreatorEventSubmittedForReview(experience).catch((error) => {
        console.error("Failed to send event submitted email:", error);
      });

      // Manual venues are external by definition. This is the route the Event
      // Builder publishes through, so the tokenised invite has to be created
      // here too — without it the email falls back to the public event page and
      // the venue has no way to claim their space or answer the deal.
      if (experience.venueType === "manual" && experience.manualVenueEmail) {
        (async () => {
          const invite = await createVenueInviteForExperience({
            ...experience,
            creatorId: userId,
          });
          await notificationService.sendExternalVenueInvitation({
            ...experience,
            inviteToken: invite?.token,
          });
        })().catch((error) => {
          console.error("Failed to send external venue invitation:", error);
        });
      }

      if ((draft as any).selectedVenueId) {
        await storage.upsertVenueContract(buildVenueContractObject(
          experienceData,
          experience.id,
          (draft as any).selectedVenueId,
          userId
        ));
      }
      
      // Delete the draft since it's now published
      await storage.deleteExperienceDraft(draftId, userId);
      
      // Generate shareable link
      const shareableLink = `${getAppBaseUrl(req)}/experiences/${experience.id}`;
      
      res.status(201).json({
        message: "Experience submitted for approval",
        experience,
        shareableLink,
        id: experience.id
      });
      
    } catch (error) {
      console.error("Error publishing experience:", error);
      res.status(500).json({ message: "Failed to publish experience" });
    }
  });

  // Create a new experience
  app.post("/api/experiences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Convert date strings to Date objects
      const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      const endDate = req.body.endDate 
        ? new Date(req.body.endDate) 
        : (req.body.type === "one-day" && startDate ? startDate : startDate);
        
      // New submissions always go through admin review unless explicitly saved as draft.
      const requestedStatus = req.body.status;
      const status = requestedStatus === "draft" ? "draft" : "pending_approval";
        
      const experienceData = applyMarketplaceEconomics({
        ...req.body,
        experienceType: req.body.type, // Map 'type' to 'experienceType' for database
        creatorId: userId,
        status: status as any,
        linkedVenueId: req.body.selectedVenueId || req.body.linkedVenueId || null,
        startDate,
        endDate,
      });

      const experience = await storage.createExperience(experienceData);
      await syncBuilderParticipantRoles(experience);
      if (status !== "draft") {
        notifyCreatorEventSubmittedForReview(experience).catch((error) => {
          console.error("Failed to send event submitted email:", error);
        });
      }
      const selectedVenueId = req.body.selectedVenueId || req.body.linkedVenueId;
      if (status !== "draft" && selectedVenueId) {
        await storage.upsertVenueContract(buildVenueContractObject(
          experienceData,
          experience.id,
          selectedVenueId,
          userId
        ));
      }
      res.json(experience);
    } catch (error) {
      console.error("Error creating experience:", error);
      res.status(500).json({ message: "Failed to create experience", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/experiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const experience = await storage.getExperience(req.params.id);

      // Admins moderate live listings, so they edit as well as read.
      if (!experience || (experience.creatorId !== userId && !(await checkIsAdmin(req)))) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const updated = await storage.updateExperience(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating experience:", error);
      res.status(500).json({ message: "Failed to update experience" });
    }
  });

  /**
   * Shifts a past date forward in whole weeks until it is in the future.
   *
   * A weekly organiser duplicating last Sunday's run wants next Sunday, not
   * a date they then have to fix by hand — and the same weekday, which a plain
   * "+7 days from today" would not give them.
   */
  const nextWeeklyOccurrence = (from: Date, reference = new Date()): Date => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const next = new Date(from.getTime() + WEEK_MS);
    if (next > reference) return next;
    const weeksBehind = Math.ceil((reference.getTime() - next.getTime()) / WEEK_MS);
    return new Date(next.getTime() + weeksBehind * WEEK_MS);
  };

  // POST /api/experiences/:id/duplicate — run it again next week.
  //
  // Built on the draft table rather than a separate "templates" one: a
  // duplicate is a draft the creator has not finished yet, which is exactly
  // what a draft is. It also means the copy opens in the builder they already
  // know, with every field editable, instead of a second half-parallel editor.
  app.post("/api/experiences/:id/duplicate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const source = await storage.getExperience(req.params.id);
      if (!source) return res.status(404).json({ message: "Experience not found" });

      const isAdmin = await checkIsAdmin(req);
      if (source.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const sourceStart = source.startDate ? new Date(source.startDate) : null;
      const sourceEnd = source.endDate ? new Date(source.endDate) : null;
      const startDate = sourceStart ? nextWeeklyOccurrence(sourceStart) : null;
      // Keep the run length, whatever it was.
      const endDate = sourceStart && sourceEnd && startDate
        ? new Date(startDate.getTime() + (sourceEnd.getTime() - sourceStart.getTime()))
        : startDate;

      const skus: any[] = Array.isArray((source as any).ticketSkus) ? (source as any).ticketSkus : [];

      const draft = await storage.createExperienceDraft({
        creatorId: source.creatorId,
        title: req.body?.title || `${source.title} (copy)`,
        shortDescription: source.shortDescription || "",
        description: source.description || "",
        category: source.category as any,
        type: (source as any).experienceType || "one-day",
        greatPillars: normalizeGreatPillarsPayload((source as any).greatPillars),
        coverImageUrl: source.coverImageUrl || "",
        gallery: (source.gallery as any) || [],
        startDate,
        endDate,
        startTime: (source as any).startTime || null,
        endTime: (source as any).endTime || null,
        maxParticipants: source.maxParticipants ?? 10,
        location: source.location || "",
        venue: source.venue || "",
        selectedVenueId: (source as any).linkedVenueId || null,
        venueType: (source as any).venueType || null,
        manualVenueName: (source as any).manualVenueName || null,
        manualVenueAddress: (source as any).manualVenueAddress || null,
        manualVenueContactName: (source as any).manualVenueContactName || null,
        manualVenueEmail: (source as any).manualVenueEmail || null,
        manualVenuePropertyUrl: (source as any).manualVenuePropertyUrl || null,
        manualVenueDescription: (source as any).manualVenueDescription || null,
        standingCapacity: (source as any).standingCapacity ?? null,
        seatedCapacity: (source as any).seatedCapacity ?? null,
        venueOpenSpaceType: (source as any).venueOpenSpaceType || null,
        venueTargetDeal: (source as any).venueTargetDeal || null,
        venueTargetDealValue: (source as any).venueTargetDealValue ?? null,
        virtualPlatform: (source as any).virtualPlatform || null,
        virtualMeetingUrl: (source as any).virtualMeetingUrl || null,
        virtualInstructions: (source as any).virtualInstructions || null,
        // services/amenities are stored as objects on the experience and as id
        // lists in the builder
        selectedServiceIds: Array.isArray((source as any).services)
          ? (source as any).services.map((service: any) => service?.id).filter(Boolean)
          : [],
        selectedAmenityIds: Array.isArray((source as any).amenities)
          ? (source as any).amenities.map((amenity: any) => amenity?.id).filter(Boolean)
          : [],
        accommodationType: (source as any).accommodationType || null,
        rooms: (source as any).rooms || [],
        // The inventory carries over; what was sold against it does not.
        ticketSkus: skus.map((sku: any, index: number) => ({
          ...sku,
          id: `sku-copy-${index}-${randomBytes(4).toString("hex")}`,
          soldCount: 0,
        })),
        price: source.price ?? "0",
        pricePerPerson: (source as any).pricePerPerson ?? source.price ?? "0",
        currency: source.currency || "eur",
        depositEnabled: source.depositEnabled ?? false,
        depositPercentage: source.depositPercentage ?? "0.00",
        balanceDueDays: source.balanceDueDays ?? 14,
        roles: (source as any).roles || [],
        itinerary: (source as any).itinerary || [],
        mvgEnabled: source.mvgEnabled ?? true,
        mvgMinimumSize: source.minimumParticipants ?? source.mvgMin ?? 6,
        softHoldEnabled: source.softHoldEnabled ?? false,
        softHoldDurationHours: source.softHoldDurationHours ?? 48,
        customTerms: (source as any).termsAndConditions || null,
        termsDocumentUrl: source.termsDocumentUrl || null,
        // Deliberately not carried over: bookings, review state, the slug, the
        // preview token, and every promotion deal already agreed on the
        // original. A copy starts its own negotiations.
        status: "draft",
        currentStep: 1,
      } as any);

      res.status(201).json({ id: draft.id, draft });
    } catch (error) {
      console.error("Error duplicating experience:", error);
      res.status(500).json({ message: "Failed to duplicate experience" });
    }
  });

  // Edit an experience that is already live, from the Event Builder.
  //
  // A published event is not finished: a venue signs on after the listing goes
  // out, a partner joins, a paragraph gets rewritten. This writes the builder's
  // payload onto the existing row through the same mapping publishing uses, and
  // leaves everything the builder does not own — review state, head count,
  // slug, preview token — untouched.
  app.put("/api/experiences/:id/builder", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await storage.getExperience(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Experience not found" });
      }

      const isAdmin = await checkIsAdmin(req);
      if (existing.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      // The date gate only applies to a date the creator is actually moving.
      const submittedStart = req.body?.startDate ? new Date(req.body.startDate) : null;
      const startDateUnchanged = !!submittedStart
        && !!existing.startDate
        && submittedStart.getTime() === new Date(existing.startDate).getTime();
      const validation = validateDraftForPublication(req.body, {
        allowPastStart: startDateUnchanged,
      });
      if (!validation.isValid) {
        return res.status(400).json({
          message: "Draft validation failed",
          errors: validation.errors,
          missingFields: validation.missingFields,
        });
      }

      const mapped = buildExperienceFromBuilderPayload(req.body, existing.creatorId);

      // Columns the builder does not own. Rewriting them would reset an event
      // that is already selling.
      const {
        status: _status,
        submittedAt: _submittedAt,
        currentParticipants: _currentParticipants,
        createdAt: _createdAt,
        mvgStatus: _mvgStatus,
        creatorId: _creatorId,
        ...updates
      } = mapped as any;

      // The builder shows whichever venue is selected, so that selection is the
      // link. Reading it off the payload rather than the publish-time mapping
      // keeps an open call whose venue already accepted from being unlinked:
      // that mapping nulls the venue for anything still typed "open".
      const previousVenueId = (existing as any).linkedVenueId || null;
      const selectedVenueId = req.body?.selectedVenueId || null;
      updates.linkedVenueId = selectedVenueId;
      if (selectedVenueId) {
        updates.venueStatus = "venue_confirmed";
      }

      const updated = await storage.updateExperience(existing.id, updates);
      await syncBuilderParticipantRoles(updated);

      // A venue added after the event went live still needs its contract row —
      // the Deal Ledger and the venue's own dashboard both read from it.
      if (selectedVenueId && selectedVenueId !== previousVenueId) {
        await storage.upsertVenueContract(buildVenueContractObject(
          mapped,
          updated.id,
          selectedVenueId,
          existing.creatorId,
        ));
      }

      // Same for a venue invited by email: publishing is no longer the only
      // moment a claim link can be owed.
      const manualEmail = String(updates.manualVenueEmail || "").trim();
      const previousManualEmail = String((existing as any).manualVenueEmail || "").trim();
      if (updates.venueType === "manual" && manualEmail && manualEmail.toLowerCase() !== previousManualEmail.toLowerCase()) {
        (async () => {
          const invite = await createVenueInviteForExperience({
            ...updated,
            creatorId: existing.creatorId,
          });
          await notificationService.sendExternalVenueInvitation({
            ...updated,
            inviteToken: invite?.token,
          });
        })().catch((error) => {
          console.error("Failed to send external venue invitation:", error);
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating experience from builder:", error);
      res.status(500).json({ message: "Failed to update experience" });
    }
  });

  // Resubmit a rejected experience for admin review
  app.post("/api/experiences/:id/resubmit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const experience = await storage.getExperience(req.params.id);
      if (!experience || experience.creatorId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      if (experience.status !== "rejected") {
        return res.status(400).json({ message: "Only rejected experiences can be resubmitted" });
      }
      const rejectionCount = (experience.rejectionCount ?? 0) as number;
      if (rejectionCount >= 3) {
        return res.status(400).json({ message: "This experience has been rejected 3 times. Please create a new one." });
      }
      const updated = await storage.resubmitExperience(req.params.id);
      notifyCreatorEventSubmittedForReview(updated).catch((error) => {
        console.error("Failed to send event submitted email:", error);
      });
      res.json(updated);
    } catch (error) {
      console.error("Error resubmitting experience:", error);
      res.status(500).json({ message: "Failed to resubmit experience" });
    }
  });

  // Booking routes
  /**
   * Shared booking-creation core. Callers:
   *  - POST /api/bookings                  — in-page checkout (no redirect)
   *  - POST /api/bookings/finalize-payment — buyer returned from a redirect-based
   *    payment method (iDEAL, Bancontact, full-page 3DS) where the SPA was unloaded
   *    before it could create the booking
   *  - the Stripe webhook backstop         — buyer paid but never came back
   *
   * Returns an HTTP-shaped result instead of writing to the response so every
   * caller shares identical pricing, ticket, MVG and commission handling.
   */
  type BookingCreationInput = {
    experienceId?: string;
    amount?: unknown;
    isEscrow?: boolean;
    stripePaymentIntentId?: string | null;
    promoterId?: string | null;
    referralCode?: string | null;
    shareToken?: string | null;
    paymentType?: string;
    ticketSkuId?: string | null;
    ticketQuantity?: unknown;
    quantity?: unknown;
    /** Set only when rebuilding a booking for a payment Stripe has already taken. */
    paymentAlreadyCaptured?: boolean;
    /** The buyer's email from their auth session — used to self-heal a missing users row. */
    buyerEmail?: string | null;
  };

  /**
   * Returns a user id that is guaranteed to have a users row.
   *
   * A brand-new account exists in Supabase Auth the moment it signs up, but its
   * local users row is only written when /api/auth/user happens to run. A buyer
   * who goes straight into checkout can reach booking creation before that —
   * and the bookings.user_id foreign key then rejects the insert AFTER Stripe
   * has already taken the money. Booking creation must never depend on another
   * endpoint having run first.
   */
  async function ensureBookingAccount(userId: string, email?: string | null): Promise<string> {
    const existing = await storage.getUser(userId);
    if (existing) return existing.id;

    const normalizedEmail = email?.trim().toLowerCase() || undefined;
    if (normalizedEmail) {
      // The same person may already have a row under an older auth id.
      const byEmail = await storage.getUserByEmail(normalizedEmail);
      if (byEmail) return byEmail.id;
    }

    const created = await storage.upsertUser({
      id: userId,
      email: normalizedEmail,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
      role: 'participant' as any,
    });
    console.log(`[Booking] Created missing users row for buyer ${userId}`);
    return created.id;
  }

  async function createBookingForUser(
    userId: string,
    input: BookingCreationInput,
  ): Promise<{ status: number; body: any }> {
      // The buyer has paid (or is about to). Make sure the account row the
      // booking references actually exists before anything else can fail.
      userId = await ensureBookingAccount(userId, input.buyerEmail);
      const {
        amount,
        isEscrow,
        stripePaymentIntentId,
        promoterId: providedPromoterId,
        referralCode: providedReferralCode,
        shareToken: providedShareToken,
        paymentType,
        ticketSkuId: bookingTicketSkuId,
      } = input;
      const experienceId = typeof input.experienceId === 'string' ? input.experienceId : '';
      const ticketQuantity = parseRequestedTicketQuantity(
        input.ticketQuantity ?? input.quantity,
      );
      if (ticketQuantity === null) {
        return {
          status: 400,
          body: { message: "Ticket quantity must be a positive whole number" },
        };
      }

      // IDEMPOTENCY: If a booking already exists for this payment intent, return it — prevents
      // duplicate bookings (and duplicate commissions) from retries or double-submits
      if (stripePaymentIntentId) {
        const existingBookingForPI = await storage.getBookingByPaymentIntent(stripePaymentIntentId);
        if (existingBookingForPI) {
          console.log(`[Booking] Idempotency hit: booking ${existingBookingForPI.id} already exists for PI ${stripePaymentIntentId}`);
          return {
            status: 200,
            body: {
              booking: existingBookingForPI,
              message: "Booking already exists for this payment",
              mvgResult: null,
            },
          };
        }
      }

      // Get experience details to check if MVG/escrow is enabled
      const experience = experienceId ? await storage.getExperience(experienceId) : undefined;
      if (!experienceId || !experience) {
        return { status: 404, body: { message: "Experience not found" } };
      }

      // PROMOTER ATTRIBUTION - Priority order:
      // 1. Provided values from session/local storage (client sends with booking)
      // 2. User's referred_by_promoter_id (persisted at signup)
      // 3. null (no attribution)
      let promoterId: string | null = null;
      let referralCode: string | null = null;
      let promoterExperienceId: string | null = null;
      let referralAudience: 'participant' | 'official_partner' = 'participant';
      let trackedPromotion: any = null;

      if (providedShareToken) {
        trackedPromotion = await storage.getPromoterExperienceByShareToken(providedShareToken);
        if (trackedPromotion && trackedPromotion.experienceId !== experienceId) {
          // The browser kept a referral token from a DIFFERENT event (attribution
          // lives in localStorage and survives across events). By the time this
          // runs the buyer has usually already been charged — rejecting the
          // booking over marketing attribution stranded the payment. Ignore the
          // stale token instead; the purchase simply is not attributed to it.
          console.warn(
            `[Booking] Ignoring stale share token for experience ${trackedPromotion.experienceId} on a booking for ${experienceId}`,
          );
          trackedPromotion = null;
        }
        if (trackedPromotion) {
          promoterExperienceId = trackedPromotion.id;
          referralAudience = trackedPromotion.referralAudience === 'official_partner'
            ? 'official_partner'
            : 'participant';
          promoterId = trackedPromotion.promoterId;
          const promoter = await storage.getUser(trackedPromotion.promoterId);
          referralCode = promoter?.promoterCode || providedReferralCode || null;
        }
      }

      if (!promoterId && providedPromoterId) {
        // Validate provided promoter exists
        const promoter = await storage.getUser(providedPromoterId);
        if (promoter) {
          promoterId = providedPromoterId;
          referralCode = providedReferralCode || promoter.promoterCode || null;
        }
      } else if (!promoterId && providedReferralCode) {
        // Resolve promoter from referral code
        const promoter = await storage.getUserByPromoterCode(providedReferralCode);
        if (promoter) {
          promoterId = promoter.id;
          referralCode = providedReferralCode;
        }
      }
      
      // Fallback to user's referred_by_promoter_id if no direct attribution
      if (!promoterId) {
        const user = await storage.getUser(userId);
        if (user?.referredByPromoterId) {
          promoterId = user.referredByPromoterId;
          const referrer = await storage.getUser(user.referredByPromoterId);
          referralCode = referrer?.promoterCode || null;
        }
      }

      if (promoterId && !promoterExperienceId) {
        try {
          trackedPromotion = await storage.promoteExperience(promoterId, experienceId, {
            referralAudience: 'participant',
          });
          promoterExperienceId = trackedPromotion.id;
        } catch (_) {
          promoterExperienceId = null;
        }
      }

      let fullPrice = parseFloat((amount || 0).toString());
      let unitPrice = ticketQuantity > 0 ? fullPrice / ticketQuantity : fullPrice;
      let isDepositOnly = false;
      let depositAmount = 0;
      let balanceAmount = 0;
      let balanceDueDate = null;

      const ticketSkus = experience.ticketSkus as any[] || [];

      let selectedTicket: any = null;
      if (bookingTicketSkuId && ticketSkus.length > 0) {
        selectedTicket = ticketSkus.find((t: any, i: number) =>
          (t.id || t.sourceRoomId || `ticket-${i}`) === bookingTicketSkuId
        );
        if (!selectedTicket) {
          return { status: 400, body: { message: "Selected ticket was not found" } };
        }
      } else if (ticketSkus.length === 1) {
        selectedTicket = ticketSkus[0];
      } else if (ticketSkus.length > 1) {
        return { status: 400, body: { message: "Select a ticket before booking" } };
      }
      const resolvedTicketSkuId = selectedTicket
        ? String(
            selectedTicket.id
            || selectedTicket.sourceRoomId
            || `ticket-${ticketSkus.indexOf(selectedTicket)}`,
          )
        : null;
      if (selectedTicket) {
        const availableTickets = await getAvailableTicketQuantity(
          experienceId,
          resolvedTicketSkuId!,
          selectedTicket.ticketCapacity,
          selectedTicket.soldCount,
        );
        if (
          availableTickets !== null
          && ticketQuantity > availableTickets
        ) {
          if (input.paymentAlreadyCaptured) {
            // The buyer was charged before we got here (they came back from a
            // redirect-based payment, or the webhook is rebuilding the booking).
            // Refusing now would strand a captured payment with no booking, so
            // record the overbooking instead and let the organiser resolve it.
            console.warn(
              `[Booking] Over-capacity booking accepted for an already-captured payment — experience ${experienceId}, ticket ${resolvedTicketSkuId}, requested ${ticketQuantity}, available ${availableTickets}`,
            );
          } else {
            return {
              status: 409,
              body: {
                message: `Only ${availableTickets} ticket(s) remain`,
                availableTickets,
              },
            };
          }
        }
      }

      // PWYW: the client sends amount = buyer-chosen price; validate against minPrice
      if (selectedTicket?.pricingMode === 'pwyw') {
        const minPrice = parseFloat(selectedTicket.minPrice ?? 0);
        const chosenTotal = parseFloat((amount || 0).toString());
        const chosenPricePerTicket = chosenTotal / ticketQuantity;
        if (!Number.isFinite(chosenPricePerTicket) || chosenPricePerTicket < minPrice) {
          return {
            status: 400,
            body: { message: `Minimum price for this ticket is ${minPrice}`, minPrice },
          };
        }
        unitPrice = chosenPricePerTicket;
        fullPrice = Math.round(unitPrice * ticketQuantity * 100) / 100;
      } else {
        const resolvedUnitPrice = selectedTicket && selectedTicket.pricePerPerson !== undefined && selectedTicket.pricePerPerson !== null
          ? parseFloat(selectedTicket.pricePerPerson.toString())
          : ((experience as any).pricePerPerson !== undefined && (experience as any).pricePerPerson !== null
            ? parseFloat((experience as any).pricePerPerson.toString())
            : (experience.price ? parseFloat(experience.price.toString()) : fullPrice));

        unitPrice = Number.isFinite(resolvedUnitPrice) ? resolvedUnitPrice : 0;
        fullPrice = Math.round(unitPrice * ticketQuantity * 100) / 100;
      }

      if (fullPrice < 0) {
        return { status: 400, body: { message: "Unable to determine booking price for this experience" } };
      }
      
      const fixedDepositPerTicket = selectedTicket?.depositPerPerson
        ? parseFloat(selectedTicket.depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
      const depositSchedule = getDepositSchedule({
        experienceType: experience.experienceType,
        startDate: experience.startDate,
        endDate: experience.endDate,
        balanceDueDays: experience.balanceDueDays,
        depositAmount: fixedDepositPerTicket,
      });

      if (fixedDepositPerTicket > unitPrice) {
        return { status: 400, body: { message: "Ticket deposit cannot exceed the full ticket price" } };
      }

      if (paymentType === 'full') {
        isDepositOnly = false;
        depositAmount = 0;
        balanceAmount = 0;
      } else if (depositSchedule.available) {
        isDepositOnly = true;
        depositAmount = Math.round(fixedDepositPerTicket * ticketQuantity * 100) / 100;
        balanceAmount = fullPrice - depositAmount;
        balanceDueDate = depositSchedule.balanceDueDate;
      } else if (paymentType === 'deposit' && fixedDepositPerTicket > 0) {
        return {
          status: 400,
          body: {
            message: "Deposit payment is not available for this event. Please pay the full ticket price.",
            reason: depositSchedule.reason,
          },
        };
      } else {
        depositAmount = 0;
        balanceAmount = 0;
      }

      let paymentIntentId = stripePaymentIntentId;
      let paymentReadyForNotifications = fullPrice === 0;

      // If no payment intent ID provided, create a new one
      if (!paymentIntentId && (isDepositOnly ? depositAmount : fullPrice) > 0) {
        const chargeAmount = isDepositOnly ? depositAmount : fullPrice;
        const paymentIntentData: any = {
          amount: Math.round(chargeAmount * 100), // Convert to cents
          currency: (experience.currency || "eur").toLowerCase(),
          capture_method: "manual", // Hold payment until manually captured
          confirmation_method: "automatic",
          metadata: { 
            experienceId, 
            userId,
            isEscrow: (isEscrow || experience.escrowEnabled)?.toString() || "false",
            isDepositPayment: isDepositOnly.toString(),
            fullPrice: fullPrice.toString(),
            ticketSkuId: resolvedTicketSkuId || "",
            ticketQuantity: ticketQuantity.toString(),
            depositAmount: depositAmount.toString(),
            balanceAmount: balanceAmount.toString()
          },
        };

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
        paymentIntentId = paymentIntent.id;
      } else if (paymentIntentId) {
        if (paymentIntentId.startsWith('pi_sandbox_')) {
          if (process.env.NODE_ENV === 'production') {
            return { status: 400, body: { message: "Sandbox payments are not accepted in production" } };
          }
          paymentReadyForNotifications = true;
        } else {
          let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          const expectedAmount = Math.round((isDepositOnly ? depositAmount : fullPrice) * 100);
          // Must match the fallback used when the PaymentIntent was created in
          // /api/create-payment-intent, otherwise a currency-less experience
          // fails this check after the buyer has already been charged.
          const expectedCurrency = String(experience.currency || 'eur').toLowerCase();

          if (paymentIntent.metadata?.experienceId && paymentIntent.metadata.experienceId !== experienceId) {
            return { status: 400, body: { message: "Payment does not belong to this experience" } };
          }
          if (paymentIntent.metadata?.userId && paymentIntent.metadata.userId !== userId) {
            return { status: 403, body: { message: "Payment does not belong to this account" } };
          }
          if (
            paymentIntent.metadata?.ticketSkuId
            && paymentIntent.metadata.ticketSkuId !== (resolvedTicketSkuId || "")
          ) {
            return { status: 400, body: { message: "Payment does not belong to the selected ticket" } };
          }
          if (
            paymentIntent.metadata?.ticketQuantity
            && paymentIntent.metadata.ticketQuantity !== ticketQuantity.toString()
          ) {
            return { status: 400, body: { message: "Payment quantity does not match this booking" } };
          }
          if (paymentIntent.amount !== expectedAmount || paymentIntent.currency !== expectedCurrency) {
            return { status: 400, body: { message: "Payment amount or currency does not match this booking" } };
          }
          if (!['processing', 'requires_capture', 'succeeded'].includes(paymentIntent.status)) {
            return {
              status: 409,
              body: { message: `Payment is not ready to create a booking (status: ${paymentIntent.status})` },
            };
          }

          // Settle non-MVG authorizations immediately. MVG payments remain
          // authorized until the minimum group transition succeeds.
          if (
            paymentIntent.status === 'requires_capture'
            && !experience.requireMinimumParticipants
            && !isEscrow
          ) {
            paymentIntent = await stripe.paymentIntents.capture(paymentIntent.id);
          }
          paymentReadyForNotifications = ['requires_capture', 'succeeded'].includes(paymentIntent.status);
        }
      }

      // Calculate commission if promoter is attached
      let commissionAmount: number | null = null;
      let commissionCurrency: string | null = null;
      let commissionStatus: 'estimated' | 'locked' | 'paid' | 'voided' | null = null;
      
      if (promoterId && fullPrice > 0) {
        // Commission is calculated on FULL PRICE, not deposit
        // DATA CONTRACT: Price comes from ticketSkus.pricePerPerson, currency from experience.currency
        const pricePerPerson = unitPrice;
        const spotsBooked = ticketQuantity;
        const currency = experience.currency || 'EUR';
        
        let referralCommissionPct = 0;
        if (referralAudience === 'official_partner') {
          const acceptedDeal = trackedPromotion?.promotionDealId
            ? await storage.getPromotionDeal(trackedPromotion.promotionDealId)
            : undefined;
          const officialDealType = acceptedDeal?.dealType || experience.promotionDealType;
          if (officialDealType === 'commission_per_ticket') {
            referralCommissionPct = Number(
              acceptedDeal?.terms?.commissionPct
                ?? experience.influencerCommissionPct
                ?? 0,
            );
          }
        } else if (experience.participantReferralDealType === 'commission_per_ticket') {
          referralCommissionPct = Number(experience.participantReferralCommissionPct || 0);
        }

        const commission = await calculateBookingCommission(
          experienceId,
          pricePerPerson,
          spotsBooked,
          parseFloat(fullPrice.toString()),
          currency,
          referralCommissionPct > 0
            ? { mode: 'percent', value: referralCommissionPct, basis: 'per_spot' }
            : null,
        );
        
        commissionAmount = commission.commissionAmount;
        commissionCurrency = commission.commissionCurrency;
        commissionStatus = commission.commissionStatus;
        
        console.log(`[Booking] Commission calculated for promoter ${promoterId}: ${commissionAmount} ${commissionCurrency}`);
      }

      // Create booking with deposit tracking information and promoter attribution
      let booking;
      try {
        booking = await storage.createBooking({
          experienceId,
          userId,
          amount: (isDepositOnly ? depositAmount : fullPrice).toString(), // Amount actually charged
          totalPrice: fullPrice.toString(), // Full experience price
          isDepositOnly,
          depositAmount: depositAmount.toString(),
          balanceAmount: balanceAmount.toString(),
          balanceDueDate,
          balancePaid: !isDepositOnly, // True if full payment, false if deposit only
          status: !paymentReadyForNotifications
            ? "pending"
            : (isEscrow || experience.requireMinimumParticipants
              ? "pending"
              : (isDepositOnly ? "deposit_paid" : "fully_paid")),
          stripePaymentIntentId: paymentIntentId,
          // Promoter attribution (null if no referral)
          promoterId,
          referralCode,
          promoterExperienceId,
          // Commission fields (null if no promoter)
          commissionAmount: commissionAmount?.toString() || null,
          commissionCurrency,
          commissionStatus,
          ticketSkuId: resolvedTicketSkuId,
          ticketName: selectedTicket?.ticketName || selectedTicket?.name || null,
          ticketQuantity,
        });
      } catch (insertError: any) {
        // The idempotency check above is read-then-insert, so two concurrent
        // creators (in-page checkout, the confirmation page's recovery, the
        // reconciler) can both pass it. The partial unique index on
        // stripe_payment_intent_id makes the loser land here — return the
        // winner's booking instead of a 500 for a payment that IS booked.
        const uniqueViolation = insertError?.code === "23505"
          || /bookings_stripe_payment_intent_unique/.test(String(insertError?.message));
        if (uniqueViolation && paymentIntentId) {
          const winner = await storage.getBookingByPaymentIntent(paymentIntentId);
          if (winner) {
            console.log(`[Booking] Concurrent create for PI ${paymentIntentId} — returning existing booking ${winner.id}`);
            return {
              status: 200,
              body: { booking: winner, message: "Booking already exists for this payment", mvgResult: null },
            };
          }
        }
        throw insertError;
      }

      // Check if this booking might trigger MVG completion
      let mvgCheckResult = null;
      const updatedBookings = await storage.getBookingsByExperience(experienceId);
      const activeBookingCount = sumBookingTicketQuantity(
        updatedBookings.filter((item) =>
          !['cancelled', 'refunded', 'failed'].includes(String(item.status))
        ),
      );
      let notificationExperience = {
        ...experience,
        currentParticipants: activeBookingCount,
      };
      if (paymentReadyForNotifications && experience.requireMinimumParticipants && experience.mvgStatus === "pending") {
        const currentBookings = sumBookingTicketQuantity(
          updatedBookings.filter(b => b.status === "confirmed" || b.status === "pending"),
        );
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
        
        if (currentBookings >= mvgMin) {
          // MVG threshold reached! Auto-confirm
          await completeMVGSuccess(experienceId, updatedBookings);
          mvgCheckResult = { action: "mvg_confirmed", currentBookings, mvgMin };
          notificationExperience = {
            ...notificationExperience,
            mvgStatus: "met",
          };
          // Broadcast lifecycle flip to all connected browsers immediately
          const mvgParticipants = await storage.getExperienceParticipantAvatars(experienceId);
          broadcastMVGUpdate({
            trip_id: experienceId,
            seats_taken: currentBookings,
            funded_amount: 0,
            funded_percent: 100,
            participants: mvgParticipants,
            mvg_met: true,
            lifecycle_status: 'confirmed',
          });
        }
      }

      if (paymentReadyForNotifications) {
        await sendBookingNotificationsAfterPayment(booking.id, {
          sendParticipant: mvgCheckResult?.action !== "mvg_confirmed",
        });
      }

      // ── Mark referral click as converted ──────────────────────────────────
      if (booking?.id && (referralCode || promoterExperienceId)) {
        storage.markReferralClickConverted({
          bookingId: booking.id,
          promoterCode: referralCode,
          promoterId,
          experienceId,
          promoterExperienceId,
        }).catch(() => {});
      }

      // ── Auto-add buyer to experience chat ─────────────────────────────────
      if (booking?.id) {
        const buyerUserId = booking.userId;
        const buyerUser = buyerUserId ? await storage.getUser(buyerUserId) : null;
        const buyerName = buyerUser?.firstName
          ? `${buyerUser.firstName}${buyerUser.lastName ? ' ' + buyerUser.lastName : ''}`
          : 'A new participant';
        storage.createExperienceMessage({
          experienceId,
          userId: buyerUserId ?? 'system',
          message: `👋 ${buyerName} just joined the experience!`,
          messageType: 'announcement',
        }).catch(() => {});
      }

      // Prepare response message
      let message;
      if (!paymentReadyForNotifications) {
        message = "Your payment is processing. We will email you as soon as it is confirmed.";
      } else if (mvgCheckResult?.action === "mvg_confirmed") {
        message = `🎉 Great news! Your booking just helped reach the minimum group size. Your payment has been confirmed and your spot is secured!`;
      } else if (experience.requireMinimumParticipants) {
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
        const currentCount = await storage.getBookingsByExperience(experienceId).then(bookings =>
          sumBookingTicketQuantity(
            bookings.filter(b => b.status === "confirmed" || b.status === "pending"),
          )
        );
        message = `Payment secured! We're at ${currentCount}/${mvgMin} participants. Your payment is held safely until we reach the minimum group size.`;
      } else {
        message = "Booking confirmed successfully!";
      }

      return {
        status: 200,
        body: {
          booking,
          message,
          mvgResult: mvgCheckResult,
        },
      };
  }

  app.post("/api/bookings", isAuthenticated, async (req: any, res) => {
    try {
      // paymentAlreadyCaptured is server-only — never let a client set it and
      // skip the ticket-capacity check.
      const { paymentAlreadyCaptured, ...bookingInput } = req.body || {};
      const result = await createBookingForUser(req.user.claims.sub, {
        ...bookingInput,
        buyerEmail: req.user.email || req.user.claims?.email,
      });
      res.status(result.status).json(result.body);
    } catch (error: any) {
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Failed to create booking", detail: error?.message });
    }
  });

  /**
   * Rebuild a booking from a PaymentIntent alone.
   *
   * Redirect-based payment methods (iDEAL, Bancontact, full-page 3DS) unload the
   * checkout SPA before it can POST /api/bookings, so the money is captured with
   * no booking behind it. Everything needed to rebuild the booking is stamped on
   * the PaymentIntent metadata at creation time, so this reconstructs it.
   *
   * Idempotent: createBookingForUser returns the existing booking when one is
   * already attached to the PaymentIntent.
   */
  async function finalizeBookingFromPaymentIntentId(
    paymentIntentId: string,
    options: {
      requestUserId?: string;
      requestUserEmail?: string | null;
      clientSecret?: string;
      attribution?: { promoterId?: string | null; referralCode?: string | null; shareToken?: string | null };
    } = {},
  ): Promise<{ status: number; body: any }> {
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return { status: 400, body: { message: "A payment reference is required" } };
    }

    const existing = await storage.getBookingByPaymentIntent(paymentIntentId);
    if (existing) {
      if (options.requestUserId && existing.userId !== options.requestUserId) {
        return { status: 403, body: { message: "Payment does not belong to this account" } };
      }
      return {
        status: 200,
        body: { booking: existing, message: "Booking already exists for this payment", mvgResult: null },
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata || {};
    const ownerId = metadata.userId || options.requestUserId;

    if (!ownerId) {
      return { status: 422, body: { message: "This payment is not linked to an account" } };
    }

    // Ownership proof: either the PaymentIntent is stamped with this user, or the
    // caller can present the client secret Stripe handed back on the redirect.
    if (options.requestUserId && metadata.userId && metadata.userId !== options.requestUserId) {
      return { status: 403, body: { message: "Payment does not belong to this account" } };
    }
    if (options.requestUserId && !metadata.userId && options.clientSecret !== paymentIntent.client_secret) {
      return { status: 403, body: { message: "Payment could not be verified for this account" } };
    }

    if (!['processing', 'requires_capture', 'succeeded'].includes(paymentIntent.status)) {
      return {
        status: 409,
        body: { message: `Payment is not ready to create a booking (status: ${paymentIntent.status})` },
      };
    }

    if (!metadata.experienceId) {
      return { status: 422, body: { message: "This payment is not linked to an experience" } };
    }

    const isDepositPayment = metadata.isDepositPayment === 'true';
    return createBookingForUser(ownerId, {
      paymentAlreadyCaptured: paymentIntent.status !== 'processing',
      buyerEmail: ownerId === options.requestUserId ? options.requestUserEmail : undefined,
      experienceId: metadata.experienceId,
      amount: metadata.fullPrice ? parseFloat(metadata.fullPrice) : undefined,
      isEscrow: metadata.isMVGExperience === 'true',
      stripePaymentIntentId: paymentIntent.id,
      ticketSkuId: metadata.ticketSkuId || undefined,
      ticketQuantity: metadata.ticketQuantity || 1,
      paymentType: isDepositPayment ? 'deposit' : 'full',
      promoterId: metadata.promoterId || options.attribution?.promoterId || null,
      referralCode: metadata.referralCode || options.attribution?.referralCode || null,
      shareToken: metadata.shareToken || options.attribution?.shareToken || null,
    });
  }

  app.post("/api/bookings/finalize-payment", isAuthenticated, async (req: any, res) => {
    try {
      const { paymentIntentId, clientSecret, promoterId, referralCode, shareToken } = req.body || {};
      const result = await finalizeBookingFromPaymentIntentId(paymentIntentId, {
        requestUserId: req.user.claims.sub,
        requestUserEmail: req.user.email || req.user.claims?.email,
        clientSecret,
        attribution: { promoterId, referralCode, shareToken },
      });
      res.status(result.status).json(result.body);
    } catch (error: any) {
      console.error("[finalize-payment] failed:", error?.message);
      res.status(500).json({ message: "Failed to finalize booking", detail: error?.message });
    }
  });

  // Webhook backstop: buyer paid but never returned to the site (closed the tab
  // mid-redirect). Lets stripe-webhook.ts rebuild the booking server-side.
  registerBookingFinalizer(async (paymentIntentId: string) => {
    const result = await finalizeBookingFromPaymentIntentId(paymentIntentId);
    return {
      created: result.status === 200,
      bookingId: result.body?.booking?.id,
      message: result.body?.message,
    };
  });

  app.get("/api/bookings/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookings = await storage.getBookingsByUser(userId);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  /**
   * The one place a participant's bookings get their event details attached.
   * Every participant-facing bookings list reads through this, so the pages
   * can't drift apart on currency, dates or group progress.
   */
  async function getEnrichedBookingsForUser(userId: string) {
    const userBookings = await storage.getBookingsByUser(userId);

    const enrichedBookings = await Promise.all(
      userBookings.map(async (booking) => {
        const experience = await storage.getExperience(booking.experienceId);
        const mvgProgress = await storage.getMVGProgress(booking.experienceId);
        return {
          ...booking,
          experience: experience ? {
            id: experience.id,
            title: experience.title,
            shortDescription: experience.shortDescription,
            coverImageUrl: experience.coverImageUrl,
            startDate: experience.startDate,
            endDate: experience.endDate,
            location: experience.location,
            venue: experience.venue,
            price: experience.price,
            // The dashboard renders booking amounts — it needs the event's
            // currency, not a hardcoded symbol.
            currency: experience.currency,
            requireMinimumParticipants: experience.requireMinimumParticipants,
            minimumParticipants: mvgProgress.minimum_participants,
            currentParticipants: mvgProgress.current_participants,
            mvgMet: mvgProgress.mvg_met,
            lifecycleStatus: computeLifecycleStatus({
              status: experience.status || '',
              mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
              requireMinimumParticipants: experience.requireMinimumParticipants,
              mvgMet: mvgProgress.mvg_met,
            }),
          } : null
        };
      })
    );

    // Most recent booking first
    return enrichedBookings.sort((a, b) => {
      const dateA = new Date(a.bookingDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.bookingDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }

  // Milestone 2 Step 2: Traveler Booking Visibility (Read-Only)
  // Get user's own bookings with experience details enriched
  app.get('/api/bookings/my-bookings', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await getEnrichedBookingsForUser(req.user.claims.sub));
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.get("/api/bookings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      let enrichedBooking: any = { ...booking };

      if (!booking.ticketName && booking.experienceId) {
        const experience = await storage.getExperience(booking.experienceId);
        if (experience) {
          const ticketSkus = (experience.ticketSkus as any[]) || [];
          if (booking.ticketSkuId && ticketSkus.length > 0) {
            const matchedTicket = ticketSkus.find((t: any, i: number) => 
              (t.id || t.sourceRoomId || `ticket-${i}`) === booking.ticketSkuId
            );
            if (matchedTicket) {
              enrichedBooking.ticketName = matchedTicket.ticketName || matchedTicket.name || null;
            }
          }
        }
      }

      res.json(enrichedBooking);
    } catch (error: any) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  app.post("/api/bookings/:id/pay-balance/create-intent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (booking.balancePaid) {
        return res.status(400).json({ message: "Balance has already been paid" });
      }
      
      const balanceAmount = parseFloat(booking.balanceAmount?.toString() || "0");
      if (balanceAmount <= 0) {
        return res.status(400).json({ message: "No remaining balance to pay" });
      }
      
      if (!booking.isDepositOnly) {
        return res.status(400).json({ message: "This booking does not have a deposit-only payment" });
      }

      const experience = await storage.getExperience(booking.experienceId);
      const currency = (experience?.currency || "eur").toLowerCase();
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(balanceAmount * 100),
        currency,
        metadata: {
          bookingId,
          experienceId: booking.experienceId,
          userId,
          paymentType: "balance_payment",
          originalDepositAmount: booking.depositAmount?.toString() || "0",
          balanceAmount: balanceAmount.toString(),
        },
      });
      
      await storage.updateBooking(bookingId, {
        balancePaymentIntentId: paymentIntent.id,
      } as any);
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: balanceAmount,
        currency: currency.toUpperCase(),
      });
    } catch (error: any) {
      console.error("Error creating balance payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent for balance" });
    }
  });

  app.post("/api/bookings/:id/pay-balance/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bookingId = req.params.id;
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ message: "Payment intent ID is required" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (booking.balancePaid) {
        return res.status(400).json({ message: "Balance has already been paid" });
      }
      
      if (!booking.isDepositOnly) {
        return res.status(400).json({ message: "This booking does not have an outstanding balance" });
      }
      
      const balanceAmount = parseFloat(booking.balanceAmount?.toString() || "0");
      if (balanceAmount <= 0) {
        return res.status(400).json({ message: "No remaining balance to pay" });
      }

      const experience = await storage.getExperience(booking.experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      const expectedCurrency = (experience.currency || "eur").toLowerCase();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "requires_capture") {
        return res.status(400).json({ message: "Payment has not been completed" });
      }
      
      if (paymentIntent.metadata?.bookingId !== bookingId) {
        return res.status(400).json({ message: "Payment intent does not match this booking" });
      }
      
      const expectedAmountCents = Math.round(balanceAmount * 100);
      if (paymentIntent.amount !== expectedAmountCents) {
        return res.status(400).json({ message: "Payment amount does not match the remaining balance" });
      }
      
      if (paymentIntent.currency !== expectedCurrency) {
        return res.status(400).json({ message: "Payment currency does not match" });
      }
      
      const isMVGOrEscrow = experience.requireMinimumParticipants || experience.escrowEnabled;
      const newStatus = isMVGOrEscrow ? booking.status : "fully_paid";
      
      const totalPrice = parseFloat(booking.totalPrice?.toString() || "0");
      
      const updatedBooking = await storage.updateBooking(bookingId, {
        balancePaid: true,
        balanceAmount: "0.00",
        isDepositOnly: false,
        balancePaymentIntentId: paymentIntentId,
        amount: totalPrice.toString(),
        status: newStatus,
      } as any);
      
      console.log(`[Balance Payment] Booking ${bookingId} balance paid. Total: ${totalPrice}, Balance: ${balanceAmount}, Status: ${newStatus}`);
      
      res.json({ 
        success: true, 
        booking: updatedBooking,
        message: "Balance payment completed successfully"
      });
    } catch (error: any) {
      console.error("Error confirming balance payment:", error);
      res.status(500).json({ message: "Failed to confirm balance payment" });
    }
  });

  // Milestone 2 Step 1: Booking Creation + Deposit Authorization
  // Creates a booking and authorizes (but does NOT capture) a deposit via Stripe
  app.post("/api/bookings/authorize-deposit", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { experienceId, depositAmount, currency = "usd" } = req.body;

    console.log(`[BOOKING] authorize-deposit request:`, { userId, experienceId, depositAmount, currency });

    // Validation 1: Deposit amount must be > 0
    if (!depositAmount || typeof depositAmount !== 'number' || depositAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Deposit amount must be greater than 0" 
      });
    }

    // Validation 2: Experience must exist
    const experience = await storage.getExperience(experienceId);
    if (!experience) {
      return res.status(404).json({ 
        success: false, 
        message: "Experience not found" 
      });
    }

    // Validation 3: Experience must be published
    if (experience.status !== "published" && experience.status !== "approved") {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot book experience with status: ${experience.status}. Experience must be published.` 
      });
    }

    // Validation 4: Experience must not be expired (start date in future)
    if (experience.startDate) {
      const startDate = new Date(experience.startDate);
      if (startDate < new Date()) {
        return res.status(400).json({ 
          success: false, 
          message: "Cannot book an experience that has already started" 
        });
      }
    }

    const depositSchedule = getDepositSchedule({
      experienceType: experience.experienceType,
      startDate: experience.startDate,
      endDate: experience.endDate,
      balanceDueDays: experience.balanceDueDays,
      depositAmount,
    });
    if (!depositSchedule.available) {
      return res.status(400).json({
        success: false,
        message: "Deposits are not available for this event. Please use full payment.",
        reason: depositSchedule.reason,
      });
    }

    // Validation 5: Spots must be available
    const currentBookings = await storage.getBookingsByExperience(experienceId);
    const activeBookings = currentBookings.filter(b => 
      !['cancelled', 'refunded', 'failed'].includes(b.status)
    );
    const spotsAvailable = experience.maxParticipants - activeBookings.length;
    
    if (spotsAvailable <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No spots available for this experience" 
      });
    }

    // Validation 6: Check for duplicate booking (same user + experience)
    const existingBooking = await storage.getBookingByUserAndExperience(userId, experienceId);
    if (existingBooking) {
      return res.status(409).json({ 
        success: false, 
        message: "You already have an active booking for this experience",
        existingBookingId: existingBooking.id
      });
    }

    // Calculate full price and balance
    const fullPrice = parseFloat(experience.price || "0");
    const balanceAmount = Math.max(0, fullPrice - depositAmount);

    let booking: any = null;
    let paymentIntentId: string | null = null;

    try {
      // Step 1: Create booking record FIRST (before Stripe call)
      booking = await storage.createBooking({
        experienceId,
        userId,
        amount: depositAmount.toString(),
        totalPrice: fullPrice.toString(),
        isDepositOnly: true,
        depositAmount: depositAmount.toString(),
        balanceAmount: balanceAmount.toString(),
        balanceDueDate: null,
        balancePaid: false,
        status: "pending",
        depositStatus: "refundable",
        stripePaymentIntentId: null,
      });

      console.log(`[BOOKING] Created booking ${booking.id} for user ${userId}`);

      // Step 2: Create Stripe PaymentIntent with manual capture
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(depositAmount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        capture_method: "manual", // IMPORTANT: Authorize only, do not capture
        metadata: {
          booking_id: booking.id,
          experience_id: experienceId,
          user_id: userId,
          type: "deposit_authorization"
        },
        description: `Deposit for ${experience.title}`,
      });

      paymentIntentId = paymentIntent.id;
      console.log(`[BOOKING] Created PaymentIntent ${paymentIntentId} with capture_method=manual`);

      // Step 3: Update booking with Stripe PaymentIntent ID and set status to deposit_authorized
      await storage.updateBookingStatus(booking.id, "deposit_authorized");
      const [updatedBooking] = await db
        .update(bookings)
        .set({ stripePaymentIntentId: paymentIntentId })
        .where(eq(bookings.id, booking.id))
        .returning();

      console.log(`[BOOKING] Updated booking ${booking.id} with status=deposit_authorized`);

      return res.status(201).json({
        success: true,
        message: "Deposit authorized successfully. No funds have been captured.",
        booking: {
          id: updatedBooking.id,
          experienceId: updatedBooking.experienceId,
          userId: updatedBooking.userId,
          status: updatedBooking.status,
          depositAmount: updatedBooking.depositAmount,
          totalPrice: updatedBooking.totalPrice,
          balanceAmount: updatedBooking.balanceAmount,
          depositStatus: updatedBooking.depositStatus,
          stripePaymentIntentId: updatedBooking.stripePaymentIntentId,
          createdAt: updatedBooking.createdAt
        },
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          capture_method: paymentIntent.capture_method
        }
      });

    } catch (error: any) {
      console.error(`[BOOKING] Error in authorize-deposit:`, error);

      // Rollback: If booking was created but Stripe failed, delete the booking
      if (booking?.id && !paymentIntentId) {
        try {
          await storage.deleteBooking(booking.id);
          console.log(`[BOOKING] Rolled back booking ${booking.id} due to Stripe failure`);
        } catch (rollbackError) {
          console.error(`[BOOKING] Failed to rollback booking ${booking.id}:`, rollbackError);
        }
      }

      // Determine error type for appropriate response
      if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({
          success: false,
          message: `Payment authorization failed: ${error.message}`,
          error_type: error.type
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to authorize deposit. Please try again.",
        error: error.message
      });
    }
  });

  // Admin routes
  
  // Get ALL experiences for admin (with status filtering in frontend)
  app.get("/api/admin/experiences", isAuthenticated, async (req: any, res) => {
    try {
      // Admin role check
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const pageSize = Math.min(50, Math.max(5, Number.parseInt(String(req.query.pageSize || "10"), 10) || 10));
      const status = String(req.query.status || "all");
      const search = String(req.query.search || "").trim();
      const filters: any[] = [];
      if (status === "pending") {
        filters.push(or(eq(experiences.status, "pending"), eq(experiences.status, "pending_approval")));
      } else if (status !== "all") {
        filters.push(eq(experiences.status, status as any));
      }
      if (search) {
        filters.push(or(
          ilike(experiences.title, `%${search}%`),
          ilike(experiences.description, `%${search}%`),
          ilike(experiences.location, `%${search}%`),
        ));
      }
      const where = filters.length ? and(...filters) : undefined;
      const [allExperiences, totalRows, statusRows] = await Promise.all([
        db.select().from(experiences).where(where).orderBy(desc(experiences.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
        db.select({ count: sql<number>`count(*)::int` }).from(experiences).where(where),
        db.select({ status: experiences.status, count: sql<number>`count(*)::int` }).from(experiences).groupBy(experiences.status),
      ]);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        allExperiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status || "unknown", Number(row.count)]));
      const total = Number(totalRows[0]?.count || 0);
      res.json({
        items: enrichedExperiences,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        stats: {
          total: Object.values(statusCounts).reduce((sum, value) => sum + Number(value), 0),
          published: statusCounts.published || 0,
          approved: statusCounts.approved || 0,
          pending: (statusCounts.pending || 0) + (statusCounts.pending_approval || 0),
        },
      });
    } catch (error) {
      console.error("Error fetching all experiences:", error);
      res.status(500).json({ message: "Failed to fetch experiences" });
    }
  });

  app.get("/api/admin/deal-ledger", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      res.json(await storage.getAdminDealLedger());
    } catch (error) {
      console.error("Error fetching admin deal ledger:", error);
      res.status(500).json({ message: "Failed to fetch deal ledger" });
    }
  });

  app.patch("/api/admin/experiences/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const userId = req.user.claims.sub;
      const experience = await storage.archiveExperience(
        req.params.id,
        userId,
        req.body?.reason || "Archived by admin",
      );
      res.json(experience);
    } catch (error: any) {
      console.error("Error archiving experience as admin:", error);
      res.status(error?.message === "Experience not found" ? 404 : 500).json({
        message: error?.message || "Failed to archive experience",
      });
    }
  });
  
  app.get("/api/admin/experiences/pending", isAuthenticated, async (req: any, res) => {
    try {
      // TODO: Add admin role check
      const pendingExperiences = await storage.getPendingExperiences();
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        pendingExperiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching pending experiences:", error);
      res.status(500).json({ message: "Failed to fetch pending experiences" });
    }
  });

  app.post("/api/admin/experiences/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await approveExperienceForPublication(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error approving experience:", error);
      res.status(500).json({ message: "Failed to approve experience" });
    }
  });

  app.post("/api/admin/experiences/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await storage.rejectExperience(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error rejecting experience:", error);
      res.status(500).json({ message: "Failed to reject experience" });
    }
  });

  // ========================================================================
  // TRIPS ENDPOINTS (Aliases for experiences - cleaner API naming)
  // ========================================================================

  // POST /api/trips - Create a new trip draft
  app.post("/api/trips", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      
      // Normalize date fields before saving
      const parsedBody = { ...req.body };
      
      // A trip's start and end are calendar days, not moments, so they are
      // anchored to the day whatever timezone the browser sent them from.
      // Without this a creator east of UTC stored the day before, and the
      // venue's calendar held the wrong date.
      if (parsedBody.startDate) parsedBody.startDate = toCalendarDate(parsedBody.startDate);
      if (parsedBody.endDate) parsedBody.endDate = toCalendarDate(parsedBody.endDate);
      if (parsedBody.mvgDeadline) {
        const date = new Date(parsedBody.mvgDeadline);
        parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }
      
      const draftData = applyMarketplaceEconomics({ ...parsedBody, creatorId: userId });
      const draft = await storage.createExperienceDraft(draftData);
      res.json(draft);
    } catch (error) {
      console.error("Error creating trip draft:", error);
      res.status(500).json({ message: "Failed to create trip draft" });
    }
  });

  // PUT /api/trips/:id - Update a trip draft
  app.put("/api/trips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id } = req.params;
      
      // Normalize date fields before saving
      const updateData = { ...req.body };
      
      // Convert date strings to valid Date objects or null if invalid
        if (updateData.startDate) updateData.startDate = toCalendarDate(updateData.startDate);
      if (updateData.endDate) {
        const date = new Date(updateData.endDate);
        updateData.endDate = !isNaN(date.getTime()) ? date : null;
      }
      if (updateData.mvgDeadline) {
        const date = new Date(updateData.mvgDeadline);
        updateData.mvgDeadline = !isNaN(date.getTime()) ? date : null;
      }
      
      const draft = await storage.updateExperienceDraft(id, updateData, userId);
      res.json(draft);
    } catch (error) {
      console.error("Error updating trip draft:", error);
      res.status(500).json({ message: "Failed to update trip draft" });
    }
  });

  // POST /api/trips/:id/submit - Submit trip for admin review
  app.post("/api/trips/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const draftId = req.params.id;
      
      // Verify draft exists and belongs to user
      const existingDraft = await storage.getExperienceDraft(draftId, userId);
      if (!existingDraft) {
        return res.status(404).json({ 
          success: false,
          message: "Trip draft not found" 
        });
      }
      
      // Basic validation for submission
      const errors: string[] = [];
      
      if (!existingDraft.title || existingDraft.title.trim() === '') {
        errors.push("Title is required");
      }
      if (!existingDraft.description || existingDraft.description.trim() === '') {
        errors.push("Description is required");
      }
      if (!existingDraft.startDate) {
        errors.push("Start date is required");
      }
      if (!existingDraft.location || existingDraft.location.trim() === '') {
        errors.push("Location is required");
      }
      if (!existingDraft.price || parseFloat(existingDraft.price) <= 0) {
        errors.push("Valid price is required");
      }
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors
        });
      }
      
      // Convert draft to experience with pending_approval status
      const experienceData = applyMarketplaceEconomics({
        ...existingDraft,
        creatorId: userId,
        status: "pending_approval" as any,
        submittedAt: new Date()
      });
      
      // Create the experience from the draft
      const experience = await storage.createExperience(experienceData as any);
      await syncBuilderParticipantRoles(experience);
      notifyCreatorEventSubmittedForReview(experience).catch((error) => {
        console.error("Failed to send event submitted email:", error);
      });

      if ((existingDraft as any).selectedVenueId) {
        await storage.upsertVenueContract(buildVenueContractObject(
          experienceData,
          experience.id,
          (existingDraft as any).selectedVenueId,
          userId
        ));
      }
      
      // Delete the draft
      await storage.deleteExperienceDraft(draftId, userId);
      
      res.json({
        success: true,
        message: "Trip submitted for review",
        experience
      });
    } catch (error) {
      console.error("Error submitting trip:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to submit trip", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // POST /api/trips/:id/deposit - Create a deposit/reservation for a trip with auto-MVG confirmation
  app.post("/api/trips/:id/deposit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { id: experienceId } = req.params;
      const { amount, payment_method_nonce } = req.body;

      // Validate request body
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid deposit amount is required"
        });
      }

      const depositExperience = await storage.getExperience(experienceId);
      if (!depositExperience) {
        return res.status(404).json({
          success: false,
          message: "Experience not found",
        });
      }
      const depositSchedule = getDepositSchedule({
        experienceType: depositExperience.experienceType,
        startDate: depositExperience.startDate,
        endDate: depositExperience.endDate,
        balanceDueDays: depositExperience.balanceDueDays,
        depositAmount: amount,
      });
      if (!depositSchedule.available) {
        return res.status(400).json({
          success: false,
          message: "Deposits are not available for this event. Please use full payment.",
          reason: depositSchedule.reason,
        });
      }

      let paymentIntentId: string | undefined;
      let sandboxMode = false;

      // Handle sandbox testing or real Stripe payment
      if (payment_method_nonce === 'sandbox_test') {
        // Sandbox mode for testing
        const sandboxResult = await paymentService.createSandboxCharge({
          userId,
          experienceId,
          amount,
          paymentMethodNonce: payment_method_nonce
        });
        paymentIntentId = sandboxResult.paymentIntentId;
        sandboxMode = true;
      } else {
        // Real Stripe payment - create payment intent
        const paymentResult = await paymentService.createDepositIntent({
          userId,
          experienceId,
          amount
        });
        paymentIntentId = paymentResult.paymentIntentId;
      }
      
      // Create the deposit booking
      const booking = await storage.createDeposit(
        experienceId,
        userId,
        amount,
        paymentIntentId
      );

      // Get the updated experience to calculate funded amounts
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({
          success: false,
          message: "Experience not found"
        });
      }

      // Calculate funded metrics (include both confirmed and pending)
      const allBookings = await storage.getBookingsByExperience(experienceId);
      
      const confirmedAmount = allBookings
        .filter(b => b.status === "confirmed")
        .reduce((sum, b) => sum + Number(b.amount), 0);
      
      const pendingAmount = allBookings
        .filter(b => b.status === "pending")
        .reduce((sum, b) => sum + Number(b.amount), 0);
      
      const totalFundedAmount = confirmedAmount + pendingAmount;
      
      const confirmedSeats = allBookings.filter(b => b.status === "confirmed").length;
      const pendingSeats = allBookings.filter(b => b.status === "pending").length;
      const totalSeats = confirmedSeats + pendingSeats;
      
      const minimumParticipants = experience.minimumParticipants || 0;
      const price = Number(experience.price);
      const mvgTargetAmount = price * minimumParticipants;
      const fundedPercent = mvgTargetAmount > 0 ? (totalFundedAmount / mvgTargetAmount) * 100 : 0;
      const remainingToMvg = Math.max(0, mvgTargetAmount - totalFundedAmount);

      // Check if MVG is now met and auto-confirm
      let mvgConfirmed = false;
      let mvgMessage = "Deposit created successfully";
      let notificationExperience = {
        ...experience,
        currentParticipants: totalSeats,
      };
      
      if (
        sandboxMode
        && experience.requireMinimumParticipants
        && experience.mvgStatus !== "met"
        && totalSeats >= minimumParticipants
      ) {
        try {
          console.log(`[MVG Auto-Confirm] Minimum participants reached for ${experienceId}. Auto-confirming...`);
          const mvgResult = await storage.processMVGSuccess(experienceId);
          await lockCommissionsForExperience(experienceId);
          mvgConfirmed = true;
          mvgMessage = "Community Confirmed! The minimum group size has been reached!";
          notificationExperience = {
            ...mvgResult.experience,
            currentParticipants: totalSeats,
            mvgStatus: "met",
          };
          
          // Send MVG confirmed notifications to all participants
          const mvgBookings = allBookings.filter(b => b.status === "confirmed" || b.status === "pending");
          await notificationService.sendMVGConfirmedNotification(notificationExperience, mvgBookings);
          console.log(`[MVG Auto-Confirm] Trip ${experienceId} confirmed - notifications sent to ${mvgBookings.length} participants`);
        } catch (mvgError) {
          console.error(`[MVG Auto-Confirm] Error processing MVG success for ${experienceId}:`, mvgError);
        }
      }

      // Real Stripe deposits are only announced after the authorization webhook.
      if (sandboxMode) {
        await sendBookingNotificationsAfterPayment(booking.id, {
          sendParticipant: !mvgConfirmed,
        });
      }

      const mvgStatus = {
        funded_amount: totalFundedAmount,
        funded_amount_confirmed: confirmedAmount,
        funded_amount_pending: pendingAmount,
        funded_percent: Math.round(fundedPercent * 100) / 100,
        remaining_to_mvg: remainingToMvg,
        seats_taken: totalSeats,
        seats_confirmed: confirmedSeats,
        seats_pending: pendingSeats,
        seats_total: experience.maxParticipants,
        mvg_confirmed: mvgConfirmed
      };

      // Broadcast real-time MVG update via WebSocket (includes lifecycle flip when MVG is met)
      const participants = await storage.getExperienceParticipantAvatars(experienceId);
      broadcastMVGUpdate({
        trip_id: experienceId,
        seats_taken: totalSeats,
        funded_amount: totalFundedAmount,
        funded_percent: Math.round(fundedPercent * 100) / 100,
        participants,
        mvg_met: mvgConfirmed,
        lifecycle_status: mvgConfirmed ? 'confirmed' : 'forming',
      });

      res.json({
        success: true,
        message: mvgMessage,
        booking,
        mvg_status: mvgStatus,
        payment_intent_id: paymentIntentId,
        sandbox_mode: sandboxMode
      });
    } catch (error) {
      console.error("Error creating deposit:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to create deposit"
      });
    }
  });

  // POST /api/trips/:id/mvg/check-success - Check and process MVG success
  // QA-ONLY: Force MVG success for testing. Broadcasts WebSocket update so all browsers flip to CONFIRMED.
  app.post("/api/trips/:id/mvg/check-success", isAuthenticated, async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;
      
      const result = await storage.processMVGSuccess(experienceId);
      await lockCommissionsForExperience(experienceId);

      // Broadcast lifecycle flip via WebSocket so all open browsers update immediately
      const mvgParticipants = await storage.getExperienceParticipantAvatars(experienceId);
      const mvgProgressData = await storage.getMVGProgress(experienceId);
      broadcastMVGUpdate({
        trip_id: experienceId,
        seats_taken: mvgProgressData.current_participants,
        funded_amount: 0,
        funded_percent: 100,
        participants: mvgParticipants,
        mvg_met: true,
        lifecycle_status: 'confirmed',
      });
      
      res.json({
        success: true,
        message: `MVG met! ${result.confirmedBookings} deposits confirmed`,
        experience: result.experience,
        confirmed_bookings: result.confirmedBookings
      });
    } catch (error) {
      console.error("Error processing MVG success:", error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process MVG success"
      });
    }
  });

  // POST /api/trips/:id/mvg/check-failure - Check and process MVG failure
  app.post("/api/trips/:id/mvg/check-failure", isAuthenticated, async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;
      
      const result = await storage.processMVGFailure(experienceId);
      await voidCommissionsForExperience(experienceId);
      
      res.json({
        success: true,
        message: `MVG failed. ${result.refundedBookings} deposits refunded`,
        experience: result.experience,
        refunded_bookings: result.refundedBookings
      });
    } catch (error) {
      console.error("Error processing MVG failure:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to process MVG failure"
      });
    }
  });

  // ========================================================================
  // PAYMENT ENDPOINTS (Stripe integration for deposits, capture, refunds)
  // ========================================================================

  // POST /api/payments/create-intent - Create payment intent for deposit
  app.post("/api/payments/create-intent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { experienceId, amount, paymentMethodNonce } = req.body;

      if (!experienceId || typeof experienceId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid experienceId is required"
        });
      }

      if (!amount || typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
        return res.status(400).json({
          success: false,
          message: "Valid positive amount is required"
        });
      }

      if (paymentMethodNonce === 'sandbox_test') {
        const result = await paymentService.createSandboxCharge({
          userId,
          experienceId,
          amount,
          paymentMethodNonce
        });

        return res.json({
          success: true,
          paymentIntentId: result.paymentIntentId,
          clientSecret: null,
          sandboxMode: true
        });
      }

      const result = await paymentService.createDepositIntent({
        userId,
        experienceId,
        amount
      });

      res.json({
        success: true,
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create payment intent"
      });
    }
  });

  // POST /api/payments/capture - Capture payment when MVG met (admin only)
  app.post("/api/payments/capture", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required"
        });
      }

      const { paymentIntentId, bookingId, experienceId } = req.body;

      if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid paymentIntentId is required"
        });
      }

      if (paymentIntentId.startsWith('pi_sandbox_')) {
        return res.json({
          success: true,
          paymentIntentId,
          amount: 0,
          status: 'succeeded',
          captured: true,
          sandboxMode: true,
          message: "Sandbox payment auto-captured"
        });
      }

      const result = await paymentService.capturePayment({
        paymentIntentId,
        bookingId,
        experienceId
      });

      res.json({
        success: true,
        ...result,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error capturing payment:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to capture payment"
      });
    }
  });

  // POST /api/payments/refund - Refund payment when MVG failed (admin only)
  app.post("/api/payments/refund", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required"
        });
      }

      const { paymentIntentId, bookingId, experienceId, amount, reason } = req.body;

      if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid paymentIntentId is required"
        });
      }

      if (paymentIntentId.startsWith('pi_sandbox_')) {
        return res.json({
          success: true,
          refundId: `re_sandbox_${Date.now()}`,
          paymentIntentId,
          amount: amount || 0,
          status: 'succeeded',
          reason: reason || 'mvg_failed',
          sandboxMode: true,
          message: "Sandbox payment auto-refunded"
        });
      }

      const result = await paymentService.refundPayment({
        paymentIntentId,
        bookingId,
        experienceId,
        amount,
        reason
      });

      res.json({
        success: true,
        ...result,
        sandboxMode: false
      });
    } catch (error: any) {
      console.error("Error refunding payment:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to refund payment"
      });
    }
  });

  // GET /api/payments/logs - Get payment logs for debugging (dev/admin only)
  app.get("/api/payments/logs", isAuthenticated, async (req: any, res) => {
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const isAdmin = await checkIsAdmin(req);
      
      if (!isDev && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Development or admin access required"
        });
      }

      const logs = paymentService.getPaymentLogs();
      
      res.json({
        success: true,
        logs,
        count: logs.length
      });
    } catch (error: any) {
      console.error("Error fetching payment logs:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch payment logs"
      });
    }
  });

  // GET /api/admin/trips - List pending trips for admin review
  app.get("/api/admin/trips", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const pendingExperiences = await storage.getPendingExperiences();
      res.json(pendingExperiences);
    } catch (error) {
      console.error("Error fetching pending trips:", error);
      res.status(500).json({ message: "Failed to fetch pending trips" });
    }
  });

  // POST /api/admin/trips/:id/approve - Approve a trip
  app.post("/api/admin/trips/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reviewNotes } = req.body;
      const experience = await approveExperienceForPublication(req.params.id, userId, reviewNotes);
      res.json(experience);
    } catch (error) {
      console.error("Error approving trip:", error);
      res.status(500).json({ message: "Failed to approve trip" });
    }
  });

  // Legacy signed-URL endpoint — redirects callers to the direct upload endpoint.
  // All uploads now go through POST /api/uploads/images which uses Supabase Storage.
  app.post("/api/objects/upload", isAuthenticated, async (_req, res) => {
    try {
      res.status(410).json({
        error: "This endpoint is deprecated. Use POST /api/uploads/images with multipart/form-data instead.",
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/objects", isAuthenticated, async (req: any, res) => {
    if (!req.body.imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageUrl,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting image policy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Direct image upload endpoint
  app.post("/api/uploads/images", isAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = req.user.claims.sub;

      const file = req.file;

      // Magic-byte validation — only allow real images
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

      if (!detectedType || !allowedMimes.includes(detectedType.mime)) {
        return res.status(400).json({
          error: "Invalid file type. Only JPEG, PNG, or WebP images are allowed.",
        });
      }

      if (file.mimetype !== detectedType.mime) {
        return res.status(400).json({
          error: "File type mismatch. Declared MIME type does not match file content.",
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "File too large. Maximum size is 10MB." });
      }

      // Upload to Supabase Storage
      const publicUrl = await uploadImageToSupabase(file.buffer, detectedType.mime, userId);

      res.status(200).json({
        url: publicUrl,
        contentType: detectedType.mime,
        size: file.size,
        message: "Image uploaded successfully",
      });

    } catch (error) {
      console.error("Error uploading image:", error);
      
      // Enhanced multer error handling with proper status codes
      if (error instanceof multer.MulterError) {
        switch (error.code) {
          case 'LIMIT_FILE_SIZE':
            return res.status(413).json({ error: "File too large. Maximum size is 10MB." });
          case 'LIMIT_UNEXPECTED_FILE':
            return res.status(400).json({ error: "Unexpected file field. Expected 'image' field." });
          case 'LIMIT_FILE_COUNT':
            return res.status(400).json({ error: "Too many files. Only one file allowed." });
          default:
            return res.status(400).json({ error: error.message || "File upload error" });
        }
      }
      
      // Handle other specific errors with appropriate status codes
      if (error instanceof Error) {
        if (error.message.includes('Upload failed with status')) {
          return res.status(502).json({ 
            error: "Failed to upload to storage service", 
            details: error.message 
          });
        }
        if (error.message.includes('not authenticated')) {
          return res.status(401).json({ error: error.message });
        }
      }
      
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Document upload endpoint (PDFs) — Supabase Storage
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only PDF or Word documents are allowed'));
    },
  });

  app.post("/api/uploads/documents", isAuthenticated, documentUpload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const userId = req.user.claims.sub;
      const publicUrl = await uploadDocumentToSupabase(req.file.buffer, req.file.mimetype, userId);

      res.status(200).json({ url: publicUrl, message: "Document uploaded successfully" });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", async (req: any, res) => {
    try {
      // userPrice: buyer-entered amount for PWYW tickets (optional)
      const { amount, experienceId, ticketSkuId, paymentMode, userPrice } = req.body;
      // Stamped onto the PaymentIntent so the booking can be rebuilt from the
      // payment alone if the browser never makes it back from a redirect-based
      // payment method (iDEAL, Bancontact, full-page 3DS).
      const buyerUserId: string | undefined = req.user?.claims?.sub;
      const { promoterId: attributionPromoterId, referralCode: attributionReferralCode, shareToken: attributionShareToken } = req.body || {};
      const ticketQuantity = parseRequestedTicketQuantity(
        req.body.ticketQuantity ?? req.body.quantity,
      );
      if (ticketQuantity === null) {
        return res.status(400).json({
          message: "Ticket quantity must be a positive whole number",
        });
      }

      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      const isMVGExperience = experience.requireMinimumParticipants;
      const ticketSkus = experience.ticketSkus as any[] || [];

      let selectedTicket: any = null;
      if (ticketSkuId && ticketSkus.length > 0) {
        selectedTicket = ticketSkus.find((t: any, i: number) =>
          (t.id || t.sourceRoomId || `ticket-${i}`) === ticketSkuId
        );
        if (!selectedTicket) {
          return res.status(400).json({ message: "Selected ticket was not found" });
        }
      } else if (ticketSkus.length === 1) {
        selectedTicket = ticketSkus[0];
      } else if (ticketSkus.length > 1) {
        return res.status(400).json({ message: "Select a ticket before checkout" });
      }
      const resolvedTicketSkuId = selectedTicket
        ? String(
            selectedTicket.id
            || selectedTicket.sourceRoomId
            || `ticket-${ticketSkus.indexOf(selectedTicket)}`,
          )
        : null;
      if (selectedTicket) {
        const availableTickets = await getAvailableTicketQuantity(
          experienceId,
          resolvedTicketSkuId!,
          selectedTicket.ticketCapacity,
          selectedTicket.soldCount,
        );
        if (
          availableTickets !== null
          && ticketQuantity > availableTickets
        ) {
          return res.status(409).json({
            message: `Only ${availableTickets} ticket(s) remain`,
            availableTickets,
          });
        }
      }

      // ── PWYW handling ────────────────────────────────────────────────────
      const isPWYW = selectedTicket?.pricingMode === 'pwyw';
      let unitPrice: number;

      if (isPWYW) {
        const minPrice = parseFloat(selectedTicket.minPrice ?? 0);
        const parsed = parseFloat(String(userPrice ?? selectedTicket.suggestedPrice ?? selectedTicket.pricePerPerson ?? 0));
        if (!Number.isFinite(parsed) || parsed < minPrice) {
          return res.status(400).json({
            message: `Minimum price for this ticket is ${minPrice}`,
            minPrice,
          });
        }
        unitPrice = parsed;
      } else {
        unitPrice = selectedTicket
          ? parseFloat(selectedTicket.pricePerPerson || 0)
          : ((experience as any).pricePerPerson !== undefined && (experience as any).pricePerPerson !== null
            ? parseFloat((experience as any).pricePerPerson.toString())
            : (experience.price ? parseFloat(experience.price.toString()) : parseFloat((amount || 0).toString())));
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: "Unable to determine payment amount for this experience" });
      }
      const fullPrice = Math.round(unitPrice * ticketQuantity * 100) / 100;

      const fixedDepositPerTicket = selectedTicket?.depositPerPerson
        ? parseFloat(selectedTicket.depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
      if (fixedDepositPerTicket > unitPrice) {
        return res.status(400).json({ message: "Ticket deposit cannot exceed the full ticket price" });
      }
      // A per-ticket fixed deposit is the source of truth. Older builder payloads
      // did not always set the legacy experience-level depositEnabled flag.
      const depositSchedule = getDepositSchedule({
        experienceType: experience.experienceType,
        startDate: experience.startDate,
        endDate: experience.endDate,
        balanceDueDays: experience.balanceDueDays,
        depositAmount: fixedDepositPerTicket,
      });
      const hasDeposit = depositSchedule.available;

      const ticketName = selectedTicket?.ticketName || selectedTicket?.name || null;
      const acceptedVenueContract = await storage.getAcceptedVenueContractForExperience(experienceId);

      // Mode C: free RSVP (including PWYW where user chose €0 and minPrice is 0)
      if (fullPrice === 0) {
        return res.json({
          freeRsvp: true,
          clientSecret: null,
          isMVGExperience,
          isDepositPayment: false,
          depositAmount: 0,
          balanceAmount: 0,
          fullPrice: 0,
          unitPrice: 0,
          ticketQuantity,
          ticketName,
          ticketSkuId: resolvedTicketSkuId,
          pricingMode: selectedTicket?.pricingMode || 'fixed',
          suggestedPrice: selectedTicket?.suggestedPrice ?? null,
          minPrice: selectedTicket?.minPrice ?? 0,
          mvgMin: experience.mvgMin || experience.minimumParticipants,
          mvgDeadline: experience.mvgDeadline,
          venueContractId: acceptedVenueContract?.id || null,
          venueContractModel: acceptedVenueContract?.model || null,
          paymentMode: 'free',
          hasDeposit: false
        });
      }
      
      let chargeAmount = fullPrice;
      let depositAmount = 0;
      let balanceAmount = 0;
      let isDepositPayment = false;

      if (hasDeposit) {
        depositAmount = Math.round(fixedDepositPerTicket * ticketQuantity * 100) / 100;
        balanceAmount = fullPrice - depositAmount;
        if (paymentMode === 'full') {
          chargeAmount = fullPrice;
          isDepositPayment = false;
        } else {
          chargeAmount = depositAmount;
          isDepositPayment = true;
        }
      }
      
      // Between zero and Stripe's floor there is no chargeable amount: €0 is
      // already handled above as a free RSVP, so anything short of the minimum
      // has to be raised. Caught here so it reads as guidance to the buyer
      // instead of a 500 carrying a raw Stripe message.
      const currencyCode = (experience.currency || "eur").toLowerCase();
      const chargeMinorUnits = Math.round(chargeAmount * 100);
      const minimumMinorUnits = getStripeMinimumChargeMinorUnits(currencyCode);
      if (chargeMinorUnits > 0 && chargeMinorUnits < minimumMinorUnits) {
        return res.status(400).json({
          message: `The smallest payment we can take is ${(minimumMinorUnits / 100).toFixed(2)} ${currencyCode.toUpperCase()}. Enter 0 to RSVP for free, or raise your amount.`,
          minimumChargeAmount: minimumMinorUnits / 100,
          currency: currencyCode,
        });
      }

      const paymentIntentData: any = {
        amount: chargeMinorUnits,
        currency: currencyCode,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          experienceId,
          userId: buyerUserId || "",
          ticketSkuId: resolvedTicketSkuId || "",
          ticketName: ticketName || "",
          pricingMode: isPWYW ? "pwyw" : "fixed",
          ticketQuantity: ticketQuantity.toString(),
          unitPrice: unitPrice.toString(),
          isMVGExperience: isMVGExperience?.toString() || "false",
          isDepositPayment: isDepositPayment.toString(),
          fullPrice: fullPrice.toString(),
          depositAmount: depositAmount.toString(),
          balanceAmount: balanceAmount.toString(),
          promoterId: attributionPromoterId || "",
          referralCode: attributionReferralCode || "",
          shareToken: attributionShareToken || "",
          venueContractId: acceptedVenueContract?.id || "",
          venueContractModel: acceptedVenueContract?.model || "",
          mvgMin: (experience.mvgMin || experience.minimumParticipants || 0).toString(),
          mvgDeadline: experience.mvgDeadline || ""
        },
      };

      if (isMVGExperience && !hasDeposit) {
        // manual capture holds the payment until MVG deadline; automatic_payment_methods
        // (already set in base object) covers confirmation — confirmation_method must not
        // be set alongside automatic_payment_methods or Stripe rejects the call.
        paymentIntentData.capture_method = "manual";
      } else if (isMVGExperience && hasDeposit) {
        paymentIntentData.setup_future_usage = "off_session";
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      res.json({
        clientSecret: paymentIntent.client_secret,
        isMVGExperience,
        isDepositPayment,
        depositAmount,
        balanceAmount,
        fullPrice,
        unitPrice,
        ticketQuantity,
        ticketName,
        ticketSkuId: resolvedTicketSkuId,
        pricingMode: isPWYW ? "pwyw" : "fixed",
        suggestedPrice: selectedTicket?.suggestedPrice ?? null,
        minPrice: selectedTicket?.minPrice ?? 0,
        mvgMin: experience.mvgMin || experience.minimumParticipants,
        mvgDeadline: experience.mvgDeadline,
        paymentMode: isDepositPayment ? 'deposit' : 'full',
        hasDeposit,
        depositUnavailableReason: hasDeposit ? null : depositSchedule.reason,
        balanceDueDate: depositSchedule.balanceDueDate,
      });
    } catch (error: any) {
      // Surface the real Stripe reason in the server logs so a failing checkout is
      // diagnosable (invalid key, amount below minimum, unsupported currency, …)
      // instead of showing up only as a generic toast on the client.
      console.error('[create-payment-intent] failed:', {
        type: error?.type,
        code: error?.code,
        message: error?.message,
        experienceId: req.body?.experienceId,
        ticketSkuId: req.body?.ticketSkuId,
        ticketQuantity: req.body?.ticketQuantity ?? req.body?.quantity,
      });
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Get booking stats for MVG experiences
  app.get("/api/experiences/:id/booking-stats", async (req, res) => {
    try {
      const experienceId = req.params.id;
      const bookings = await storage.getBookingsByExperience(experienceId);
      
      const currentBookings = sumBookingTicketQuantity(
        bookings.filter(b => isActiveParticipantBooking(b.status)),
      );
      const confirmedBookings = sumBookingTicketQuantity(
        bookings.filter(b => b.status === "confirmed"),
      );
      
      res.json({ currentBookings, confirmedBookings });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching booking stats: " + error.message });
    }
  });

  // Get MVG progress for experience - using single source of truth
  app.get("/api/experiences/:id/mvg-progress", async (req, res) => {
    try {
      const experienceId = req.params.id;
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Use getMVGProgress as single source of truth
      const mvgProgress = await storage.getMVGProgress(experienceId);
      const percentage = mvgProgress.minimum_participants > 0 
        ? Math.min(100, Math.round((mvgProgress.current_participants / mvgProgress.minimum_participants) * 100))
        : 0;
      
      res.json({ 
        currentBookings: mvgProgress.current_participants,
        mvgMin: mvgProgress.minimum_participants,
        percentage,
        mvgDeadline: experience.mvgDeadline,
        mvgStatus: mvgProgress.mvg_met ? 'met' : (experience.mvgStatus || 'pending'),
        current_participants: mvgProgress.current_participants,
        minimum_participants: mvgProgress.minimum_participants,
        mvg_met: mvgProgress.mvg_met
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching MVG progress: " + error.message });
    }
  });

  // Public social proof endpoint — returns real committed participants + total count
  // No auth required: only shows avatars/names, not personal details
  app.get("/api/experiences/:id/social-proof", async (req, res) => {
    try {
      const { id } = req.params;
      const experience = await storage.getExperience(id);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      const data = await storage.getExperienceSocialProof(id);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching social proof: " + error.message });
    }
  });

  // Capture deposits when MVG is met (idempotent, fail-safe)
  app.post("/api/experiences/:id/capture-deposits", isAuthenticated, async (req: any, res) => {
    const experienceId = req.params.id;
    const captureLog: Array<{ bookingId: string; status: string; error?: string }> = [];
    
    try {
      // Step 1: Verify experience exists and requires MVG
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ 
          message: "Experience does not require minimum participants",
          captured: 0,
          captureLog 
        });
      }
      
      // Step 2: Re-check MVG status (single source of truth)
      const mvgProgress = await storage.getMVGProgress(experienceId);
      
      if (!mvgProgress.mvg_met) {
        return res.status(400).json({ 
          message: "MVG not met - cannot capture deposits",
          current_participants: mvgProgress.current_participants,
          minimum_participants: mvgProgress.minimum_participants,
          captured: 0,
          captureLog
        });
      }
      
      // Step 3: Get eligible bookings (deposit_authorized, not yet captured)
      const eligibleBookings = await storage.getEligibleDepositsForCapture(experienceId);
      
      if (eligibleBookings.length === 0) {
        return res.json({ 
          message: "No deposits to capture (already processed or none eligible)",
          captured: 0,
          captureLog
        });
      }
      
      // Step 4: Capture each deposit with Stripe (handle partial failures)
      let capturedCount = 0;
      
      for (const booking of eligibleBookings) {
        try {
          // Skip if no payment intent ID
          if (!booking.stripePaymentIntentId) {
            captureLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No Stripe payment intent ID" 
            });
            continue;
          }
          
          // Capture only the deposit amount from Stripe
          const depositAmountCents = Math.round(parseFloat(booking.depositAmount || "0") * 100);
          
          if (depositAmountCents <= 0) {
            captureLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No deposit amount" 
            });
            continue;
          }
          
          // Call Stripe to capture the payment
          await stripe.paymentIntents.capture(booking.stripePaymentIntentId, {
            amount_to_capture: depositAmountCents,
          });
          
          // Update booking in database
          await storage.markDepositAsCaptured(booking.id);
          
          capturedCount++;
          captureLog.push({ bookingId: booking.id, status: "captured" });
          
          console.log(`[MVG Capture] Captured deposit for booking ${booking.id}: $${booking.depositAmount}`);
          
        } catch (stripeError: any) {
          // Log error but continue with other bookings
          console.error(`[MVG Capture] Failed to capture booking ${booking.id}:`, stripeError.message);
          captureLog.push({ 
            bookingId: booking.id, 
            status: "failed", 
            error: stripeError.message 
          });
        }
      }
      
      // Step 5: Update experience MVG status if any deposits were captured
      if (capturedCount > 0) {
        await storage.updateExperienceMVGStatus(experienceId, "met");
        await lockCommissionsForExperience(experienceId);
      }
      
      res.json({
        message: capturedCount > 0 
          ? `Successfully captured ${capturedCount} deposit(s)` 
          : "No deposits were captured",
        captured: capturedCount,
        total: eligibleBookings.length,
        captureLog
      });
      
    } catch (error: any) {
      console.error("[MVG Capture] Error:", error);
      res.status(500).json({ 
        message: "Error capturing deposits: " + error.message,
        captured: 0,
        captureLog 
      });
    }
  });

  // Refund/cancel deposits when MVG fails (idempotent, fail-safe)
  app.post("/api/experiences/:id/refund-deposits", isAuthenticated, async (req: any, res) => {
    const experienceId = req.params.id;
    const refundLog: Array<{ bookingId: string; status: string; error?: string }> = [];
    
    try {
      // Step 1: Verify experience exists and requires MVG
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ 
          message: "Experience does not require minimum participants",
          refunded: 0,
          refundLog 
        });
      }
      
      // Step 2: Check MVG status - only refund if NOT met
      const mvgProgress = await storage.getMVGProgress(experienceId);
      
      if (mvgProgress.mvg_met) {
        return res.status(400).json({ 
          message: "MVG is met - cannot refund deposits (use capture instead)",
          current_participants: mvgProgress.current_participants,
          minimum_participants: mvgProgress.minimum_participants,
          refunded: 0,
          refundLog
        });
      }
      
      // Step 3: Get eligible bookings (deposit_authorized, not captured, not cancelled)
      const eligibleBookings = await storage.getEligibleBookingsForRefund(experienceId);
      
      if (eligibleBookings.length === 0) {
        return res.json({ 
          message: "No deposits to refund (already processed or none eligible)",
          refunded: 0,
          refundLog
        });
      }
      
      // Step 4: Cancel each PaymentIntent with Stripe (handle partial failures)
      let refundedCount = 0;
      
      for (const booking of eligibleBookings) {
        try {
          // Skip if no payment intent ID
          if (!booking.stripePaymentIntentId) {
            refundLog.push({ 
              bookingId: booking.id, 
              status: "skipped", 
              error: "No Stripe payment intent ID" 
            });
            // Still mark as cancelled since there's nothing to refund
            await storage.markBookingAsRefunded(booking.id);
            refundedCount++;
            continue;
          }
          
          // Cancel the Stripe PaymentIntent (releases authorized funds)
          await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
          
          // Update booking in database
          await storage.markBookingAsRefunded(booking.id);
          
          refundedCount++;
          refundLog.push({ bookingId: booking.id, status: "refunded" });
          
          console.log(`[MVG Refund] Cancelled authorization for booking ${booking.id}`);
          
        } catch (stripeError: any) {
          // Log error but continue with other bookings
          console.error(`[MVG Refund] Failed to cancel booking ${booking.id}:`, stripeError.message);
          refundLog.push({ 
            bookingId: booking.id, 
            status: "failed", 
            error: stripeError.message 
          });
        }
      }
      
      // Step 5: Update experience MVG status if any refunds were processed
      if (refundedCount > 0) {
        await storage.updateExperienceMVGStatus(experienceId, "failed");
        await voidCommissionsForExperience(experienceId);
      }
      
      res.json({
        message: refundedCount > 0 
          ? `Successfully cancelled ${refundedCount} authorization(s)` 
          : "No authorizations were cancelled",
        refunded: refundedCount,
        total: eligibleBookings.length,
        refundLog
      });
      
    } catch (error: any) {
      console.error("[MVG Refund] Error:", error);
      res.status(500).json({ 
        message: "Error refunding deposits: " + error.message,
        refunded: 0,
        refundLog 
      });
    }
  });

  // Manual trigger for MVG scheduler (for testing - requires authentication)
  app.post("/api/admin/mvg-scheduler/run", isAuthenticated, async (req: any, res) => {
    try {
      const { processMVGDeadlines } = await import('./mvg-scheduler');
      const results = await processMVGDeadlines();
      res.json({
        message: "MVG scheduler run complete",
        ...results
      });
    } catch (error: any) {
      console.error("[MVG Scheduler Manual] Error:", error);
      res.status(500).json({ message: "Error running MVG scheduler: " + error.message });
    }
  });

  // Generate shareable invite link for experience
  app.get("/api/experiences/:id/invite-link", isAuthenticated, async (req: any, res) => {
    try {
      const experienceId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Verify experience exists
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      // Generate unique invite link with user reference
      const baseUrl = getAppBaseUrl(req);
      const inviteLink = `${baseUrl}/event/${experienceId}?ref=${userId}`;
      
      res.json({ 
        inviteLink,
        experienceId,
        referrerId: userId,
        experienceTitle: experience.title
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error generating invite link: " + error.message });
    }
  });

  // Get user details by ID (for referrer information)
  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const creatorProfile = await storage.getCreatorProfileByUserId(userId);
      const socialLinks = creatorProfile?.socialLinks || {};
      const socialLink = socialLinks.website || socialLinks.instagram || socialLinks.linkedin || socialLinks.youtube || null;

      // Return limited user info for privacy
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        displayName: creatorProfile?.displayName || null,
        profilePhoto: creatorProfile?.profilePhoto || null,
        tagline: creatorProfile?.tagline || null,
        bio: creatorProfile?.bio || null,
        location: creatorProfile?.location || null,
        expertiseTags: creatorProfile?.expertiseTags || [],
        socialLink,
        // The organiser's own artwork, so a participant sharing the event has
        // something branded to post rather than a bare link.
        brandKitSquareUrl: creatorProfile?.brandKitSquareUrl || null,
        brandKitVerticalUrl: creatorProfile?.brandKitVerticalUrl || null,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Manual MVG check for specific experience
  app.post("/api/mvg/check-experience/:id", isAuthenticated, async (req: any, res) => {
    try {
      const experienceId = req.params.id;
      const experience = await storage.getExperience(experienceId);
      
      if (!experience) {
        return res.status(404).json({ message: "Experience not found" });
      }

      if (!experience.requireMinimumParticipants) {
        return res.status(400).json({ message: "Experience does not have MVG enabled" });
      }

      const bookings = await storage.getBookingsByExperience(experienceId);
      const currentBookings = sumBookingTicketQuantity(
        bookings.filter(b => isActiveParticipantBooking(b.status)),
      );
      const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
      const now = new Date();
      const deadlinePassed = experience.mvgDeadline ? new Date(experience.mvgDeadline) <= now : false;

      let result = {
        experienceId,
        currentBookings,
        required: mvgMin,
        mvgDeadline: experience.mvgDeadline,
        deadlinePassed,
        status: experience.mvgStatus,
        action: "none"
      };

      // Check if we should process this experience
      if (experience.mvgStatus === "pending") {
        if (currentBookings >= mvgMin) {
          // Minimum reached - capture payments
          await completeMVGSuccess(experienceId, bookings);
          result.action = "confirmed";
          result.status = "met";
        } else if (deadlinePassed) {
          // Deadline passed without meeting minimum - refund
          await refundMVGParticipants(experienceId, bookings);
          await storage.updateExperienceMVGStatus(experienceId, "failed");
          // Void commissions for all promoter-attributed bookings
          await voidCommissionsForExperience(experienceId);
          result.action = "refunded";
          result.status = "failed";
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error checking MVG experience:", error);
      res.status(500).json({ message: "Error checking MVG experience: " + error.message });
    }
  });

  // Check and process MVG deadlines (cron job endpoint)
  app.post("/api/mvg/check-deadlines", async (req, res) => {
    try {
      const experiences = await storage.getAllMVGExperiences();
      const now = new Date();
      const processedExperiences = [];

      for (const experience of experiences) {
        // Skip if already processed or no deadline set
        if (!experience.mvgDeadline || experience.mvgStatus !== "pending") {
          continue;
        }

        const deadlinePassed = new Date(experience.mvgDeadline) <= now;
        const bookings = await storage.getBookingsByExperience(experience.id);
        const currentBookings = sumBookingTicketQuantity(
          bookings.filter(b => isActiveParticipantBooking(b.status)),
        );
        const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;

        if (deadlinePassed) {
          if (currentBookings >= mvgMin) {
            // Threshold met - confirm event and capture payments
            await completeMVGSuccess(experience.id, bookings);
            processedExperiences.push({ 
              id: experience.id, 
              action: "confirmed", 
              bookings: currentBookings,
              required: mvgMin,
              status: "met" 
            });
          } else {
            // Threshold not met - refund all participants
            await refundMVGParticipants(experience.id, bookings);
            await storage.updateExperienceMVGStatus(experience.id, "failed");
            // Void commissions for all promoter-attributed bookings
            await voidCommissionsForExperience(experience.id);
            processedExperiences.push({ 
              id: experience.id, 
              action: "refunded", 
              bookings: currentBookings,
              required: mvgMin,
              status: "failed" 
            });
          }
        } else if (currentBookings >= mvgMin) {
          // Early success - minimum reached before deadline
          await completeMVGSuccess(experience.id, bookings);
          processedExperiences.push({ 
            id: experience.id, 
            action: "early_confirmed", 
            bookings: currentBookings,
            required: mvgMin,
            status: "met" 
          });
        }
      }

      res.json({ processedExperiences });
    } catch (error: any) {
      res.status(500).json({ message: "Error processing MVG deadlines: " + error.message });
    }
  });

  // Get aggregated funding summary for homepage
  app.get("/api/mvg/funding-summary", async (req, res) => {
    try {
      // Get all approved MVG experiences with pending status
      const allExperiences = await storage.getAllMVGExperiences();
      const approvedExperiences = allExperiences.filter(exp => 
        exp.status === "approved" && 
        exp.mvgStatus === "pending" &&
        exp.mvgDeadline
      );

      // Enrich each experience with funding stats
      const fundingSummary = await Promise.all(
        approvedExperiences.map(async (experience) => {
          const bookings = await storage.getBookingsByExperience(experience.id);
          const currentBookings = sumBookingTicketQuantity(
            bookings.filter(b => isActiveParticipantBooking(b.status)),
          );
          const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
          const fundingPercentage = mvgMin > 0
            ? Math.min(100, Math.round((currentBookings / mvgMin) * 100))
            : 0;
          
          // Calculate time remaining (clamped to non-negative)
          const now = new Date();
          const deadline = new Date(experience.mvgDeadline!);
          const timeRemaining = Math.max(0, deadline.getTime() - now.getTime());
          const daysRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60 * 24)));
          const hoursRemaining = Math.max(0, Math.ceil(timeRemaining / (1000 * 60 * 60)));
          const deadlinePassed = deadline.getTime() <= now.getTime();
          
          // DATA CONTRACT: Use ticketSkus.depositPerPerson or experience.depositAmount (fixed amounts only)
          const ticketSkus = experience.ticketSkus as any[] || [];
          const fixedDeposit = ticketSkus.length > 0 && ticketSkus[0]?.depositPerPerson
            ? parseFloat(ticketSkus[0].depositPerPerson)
            : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
          const depositAmount = experience.depositEnabled && fixedDeposit > 0 ? fixedDeposit : Number(experience.price);

          // Compute additional funding metrics
          const participantsNeeded = Math.max(0, mvgMin - currentBookings);
          const spotsRemaining = Math.max(0, (experience.maxParticipants || mvgMin) - currentBookings);
          const amountFunded = currentBookings * depositAmount;
          const fundingGoal = mvgMin * depositAmount;

          return {
            id: experience.id,
            title: experience.title,
            shortDescription: experience.shortDescription,
            location: experience.location,
            coverImageUrl: experience.coverImageUrl,
            startDate: experience.startDate,
            endDate: experience.endDate,
            currentParticipants: currentBookings,
            minimumParticipants: mvgMin,
            maxParticipants: experience.maxParticipants,
            participantsNeeded,
            spotsRemaining,
            fundingPercentage,
            price: Number(experience.price),
            depositAmount,
            amountFunded,
            fundingGoal,
            depositEnabled: experience.depositEnabled,
            depositPercentage: experience.depositPercentage,
            mvgDeadline: experience.mvgDeadline,
            daysRemaining,
            hoursRemaining,
            deadlinePassed,
            venue: experience.venue,
            category: experience.category,
            creatorId: experience.creatorId
          };
        })
      );

      // Sort by funding percentage (descending) to show near-funded experiences first
      fundingSummary.sort((a, b) => b.fundingPercentage - a.fundingPercentage);

      res.json({ 
        activeFunding: fundingSummary,
        totalActive: fundingSummary.length 
      });
    } catch (error: any) {
      console.error("Error fetching funding summary:", error);
      res.status(500).json({ message: "Error fetching funding summary: " + error.message });
    }
  });

  // Get recently funded (successful) MVG experiences
  app.get("/api/mvg/recently-funded", async (req, res) => {
    try {
      const TEST_TITLE_FILTER = ['test', 'qa', 'acceptance', '8rivyi'];
      const allExperiences = await storage.getAllMVGExperiences();
      const fundedExperiences = allExperiences.filter(exp => 
        exp.status === "approved" && 
        exp.mvgStatus === "met" &&
        !TEST_TITLE_FILTER.some(keyword => exp.title?.toLowerCase().includes(keyword))
      );

      // Sort by most recently funded (using updatedAt as proxy)
      const recentlyFunded = fundedExperiences
        .sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 6) // Get top 6 recently funded
        .map(exp => ({
          id: exp.id,
          title: exp.title,
          location: exp.location,
          coverImageUrl: exp.coverImageUrl,
          startDate: exp.startDate,
          minimumParticipants: exp.mvgMin || exp.minimumParticipants,
          price: Number(exp.price),
          category: exp.category
        }));

      res.json({ recentlyFunded });
    } catch (error: any) {
      console.error("Error fetching recently funded experiences:", error);
      res.status(500).json({ message: "Error fetching recently funded experiences: " + error.message });
    }
  });

  async function completeMVGSuccess(experienceId: string, bookings: any[]) {
    await confirmMVGEvent(experienceId, bookings);

    const experience = await storage.getExperience(experienceId);
    if (!experience?.endDate) {
      throw new Error(`Cannot complete MVG success for ${experienceId}: event end date is missing`);
    }

    const confirmedBookings = await storage.getConfirmedBookings(experienceId);
    const grossCents = sumBookingPayoutGrossCents(confirmedBookings);

    // Persist the payout while MVG is still pending so scheduling failures can be retried.
    await scheduleExperiencePayout(experienceId, new Date(experience.endDate), grossCents);
    await lockCommissionsForExperience(experienceId);
    await storage.updateExperienceMVGStatus(experienceId, "met");

    // The booking endpoint reaches this helper directly, bypassing the MVG
    // scheduler. Notification service records successful sends per booking,
    // so this remains safe when a later scheduler pass sees the same event.
    try {
      await notificationService.sendMVGConfirmedNotification(experience, confirmedBookings);
    } catch (error) {
      console.error(`Failed to send MVG confirmation emails for ${experienceId}:`, error);
    }
  }

  // Helper function to confirm MVG event and capture payments
  async function confirmMVGEvent(experienceId: string, bookings: any[]) {
    console.log(`Confirming MVG event ${experienceId} - processing ${bookings.length} bookings`);
    
    // Get experience details for balance calculation
    const experience = await storage.getExperience(experienceId);
    if (!experience) {
      console.error(`Experience ${experienceId} not found for MVG confirmation`);
      return;
    }
    
    for (const booking of bookings) {
      if (booking.status === "pending" && booking.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          
          // Check if this is a deposit payment or full payment
          const isDepositPayment = paymentIntent.metadata?.isDepositPayment === "true";
          const balanceAmount = paymentIntent.metadata?.balanceAmount ? parseFloat(paymentIntent.metadata.balanceAmount) : 0;
          
          if (isDepositPayment && balanceAmount > 0) {
            // Verify deposit payment actually succeeded before creating balance charge
            if (paymentIntent.status !== "succeeded") {
              console.error(`[CRITICAL] MVG met but deposit payment not succeeded for booking ${booking.id}, status: ${paymentIntent.status} - REQUIRES MANUAL INTERVENTION`);
              // Do NOT confirm booking - this is a critical error that needs investigation
              continue;
            }
            
            // Get customer and payment method from deposit payment intent
            const customer = paymentIntent.customer as string || undefined;
            const paymentMethod = paymentIntent.payment_method as string || undefined;
            
            if (!customer || !paymentMethod) {
              console.error(`[CRITICAL] MVG met but missing customer/payment method for booking ${booking.id} - CANNOT CHARGE BALANCE - REQUIRES MANUAL INTERVENTION`);
              // Do NOT confirm booking - this is a critical error that needs investigation
              continue;
            }
            
            // Check if balance payment intent already exists (idempotency)
            const existingBooking = await storage.getBooking(booking.id);
            if (existingBooking?.balancePaymentIntentId) {
              console.log(`Balance payment intent already exists for booking ${booking.id}: ${existingBooking.balancePaymentIntentId}`);
              await storage.updateBookingStatus(booking.id, "confirmed");
              continue;
            }
            
            const balanceCurrency = normalizeCurrency(paymentIntent.currency, experience.currency)?.toLowerCase();
            if (!balanceCurrency) {
              console.error(`[CRITICAL] MVG met but booking ${booking.id} has no valid payment currency - CANNOT AUTHORIZE BALANCE`);
              continue;
            }

            const balancePaymentIntent = await stripe.paymentIntents.create({
              amount: Math.round(balanceAmount * 100), // Convert to cents
              currency: balanceCurrency,
              customer, // Reuse customer from deposit payment
              payment_method: paymentMethod, // Reuse saved payment method
              capture_method: "manual", // Will be captured later when balance is due
              confirmation_method: "automatic",
              confirm: true, // Confirm immediately to move to requires_capture state
              off_session: true, // Allow charging without customer present
              metadata: {
                experienceId,
                bookingId: booking.id,
                isBalancePayment: "true",
                depositPaid: "true"
              }
            });
            
            // Calculate balance due date
            let balanceDueDate = null;
            if (experience.startDate && experience.balanceDueDays) {
              const startDate = new Date(experience.startDate);
              balanceDueDate = new Date(startDate.getTime() - (experience.balanceDueDays * 24 * 60 * 60 * 1000));
            }
            
            // Update booking with balance payment info
            await storage.updateBookingBalancePayment(booking.id, balancePaymentIntent.id, balanceDueDate);
              
            console.log(`MVG met: Deposit confirmed for booking ${booking.id}, balance payment intent created: ${balancePaymentIntent.id}`);
          } else if (isDepositPayment && balanceAmount === 0) {
            // Deposit only, no balance
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Deposit-only booking ${booking.id} confirmed`);
          } else if (paymentIntent.status === "requires_capture") {
            // Full payment authorized - capture it now
            await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Captured full payment for booking ${booking.id}`);
          } else if (paymentIntent.status === "succeeded") {
            // Already captured (shouldn't happen but handle it)
            await storage.updateBookingStatus(booking.id, "confirmed");
            console.log(`MVG met: Payment already captured for booking ${booking.id}`);
          }
        } catch (error) {
          console.error(`Failed to process payment for booking ${booking.id}:`, error);
        }
      }
    }
  }

  // Helper function to refund MVG participants
  async function refundMVGParticipants(experienceId: string, bookings: any[]) {
    console.log(`MVG failed for ${experienceId} - refunding ${bookings.length} bookings`);
    const refundedBookings: any[] = [];
    const cancelledBookings: any[] = [];
    const failedRefundBookings: any[] = [];
    
    for (const booking of bookings) {
      if ((booking.status === "pending" || booking.status === "confirmed") && booking.stripePaymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          const isDepositPayment = paymentIntent.metadata?.isDepositPayment === "true";
          
          if (paymentIntent.status === "requires_capture") {
            // Cancel uncaptured authorization (full payment, no deposit)
            await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
            console.log(`MVG failed: Cancelled uncaptured authorization for booking ${booking.id}`);
            cancelledBookings.push(booking);
          } else if (paymentIntent.status === "succeeded") {
            // Refund charged payment (deposit or full payment)
            await stripe.refunds.create({
              payment_intent: booking.stripePaymentIntentId,
              reason: "requested_by_customer"
            });
            if (isDepositPayment) {
              console.log(`MVG failed: Refunded deposit for booking ${booking.id}`);
            } else {
              console.log(`MVG failed: Refunded full payment for booking ${booking.id}`);
            }
            refundedBookings.push(booking);
          } else {
            // No captured payment exists for this booking, so no refund is
            // required. It still receives the cancellation update below.
            cancelledBookings.push(booking);
          }
          
          // Update booking status to refunded
          await storage.updateBookingStatus(booking.id, "refunded");
        } catch (error) {
          console.error(`Failed to refund payment for booking ${booking.id}:`, error);
          failedRefundBookings.push(booking);
        }
      }
    }

    const experience = await storage.getExperience(experienceId);
    if (experience && (refundedBookings.length || cancelledBookings.length || failedRefundBookings.length)) {
      try {
        await notificationService.sendMVGFailedNotification(
          experience,
          refundedBookings,
          cancelledBookings,
          failedRefundBookings,
        );
      } catch (error) {
        console.error(`Failed to send MVG failure emails for ${experienceId}:`, error);
      }
    }
  }

  // Stripe Connect routes for creators
  // Starts (or resumes) Express onboarding and returns a hosted onboarding URL.
  // Accepts an optional internal `returnPath` so the creator lands back where they
  // started (e.g. the dashboard) after finishing on Stripe.
  app.post("/api/stripe/connect-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;

      // Only allow internal same-origin paths to avoid open-redirects.
      const rawReturn = typeof req.body?.returnPath === 'string' ? req.body.returnPath : '';
      const returnPath = rawReturn.startsWith('/') && !rawReturn.startsWith('//')
        ? rawReturn
        : '/creator-profile-setup';

      // First, create or get existing Stripe Connect account
      let account: Stripe.Account | null = null;
      const existingProfile = await storage.getCreatorProfile(userId);

      if (existingProfile?.stripeAccountId) {
        try {
          account = await stripe.accounts.retrieve(existingProfile.stripeAccountId);
        } catch (err: any) {
          // A stored id from the other Stripe mode (test vs live) no longer
          // resolves after a key switch; create a fresh account instead of failing.
          if (err?.code === 'resource_missing' || err?.code === 'account_invalid') {
            console.warn(`Stripe account ${existingProfile.stripeAccountId} for user ${userId} not found in current mode; creating a new one.`);
          } else {
            throw err;
          }
        }
      }

      if (!account) {
        account = await stripe.accounts.create({
          type: 'express',
          email: userEmail,
          metadata: { userId: userId }
        });

        // Update creator profile with Stripe account ID
        await storage.updateCreatorProfileStripe(userId, account.id);
      }

      // Create account link for onboarding. accountLinks work for both brand-new
      // accounts and ones resuming an incomplete/pending onboarding.
      const base = getAppBaseUrl(req);
      const sep = returnPath.includes('?') ? '&' : '?';
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${base}${returnPath}${sep}stripe_refresh=true`,
        return_url: `${base}${returnPath}${sep}stripe_success=true`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe Connect URL:", error);
      // Platform-level Connect setup problems need a dashboard action, not a retry.
      const msg: string = error?.message || 'Unknown error';
      if (msg.includes('signed up for Connect') || msg.includes('platform-profile') || msg.includes('responsibilities of managing losses')) {
        return res.status(500).json({
          message: "Stripe Connect isn't fully activated on the platform's live account yet. An admin needs to finish Connect setup at dashboard.stripe.com (Connect → Get started / Platform profile).",
        });
      }
      res.status(500).json({ message: "Error creating Stripe Connect URL: " + msg });
    }
  });

  // Live Stripe Connect status for the current creator. Reads straight from Stripe
  // (not just the cached DB flag) so the dashboard reflects reality even before the
  // account.updated webhook lands.
  app.get("/api/stripe/connect-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getCreatorProfile(userId);

      if (!profile?.stripeAccountId) {
        return res.json({ connected: false, status: 'not_connected' });
      }

      const account = await stripe.accounts.retrieve(profile.stripeAccountId);
      const chargesEnabled = !!account.charges_enabled;
      const payoutsEnabled = !!account.payouts_enabled;
      const detailsSubmitted = !!account.details_submitted;
      const requirementsDue = Array.from(new Set([
        ...(account.requirements?.currently_due || []),
        ...(account.requirements?.past_due || []),
      ]));

      // verified  → can accept charges AND receive payouts
      // pending   → details submitted, Stripe still verifying / capabilities not live
      // incomplete→ account exists but onboarding never finished
      let status: 'verified' | 'pending' | 'incomplete';
      if (chargesEnabled && payoutsEnabled) status = 'verified';
      else if (detailsSubmitted) status = 'pending';
      else status = 'incomplete';

      // Write the live answer back to the cached column. Until now it only ever
      // moved when the account.updated Connect webhook arrived, so a webhook that
      // was never configured (or simply missed) left a fully verified creator
      // showing "Connect Payments" forever in the onboarding checklist, and left
      // them permanently undeliverable as a promoter — the payout scheduler defers
      // anyone whose cached status isn't 'verified'. Refreshing here means any
      // dashboard visit repairs the cache, webhook or no webhook.
      const cachedStatus = status === 'incomplete' ? 'unverified' : status;
      if (profile.stripeVerificationStatus !== cachedStatus) {
        await storage.setCreatorStripeVerificationStatus(userId, cachedStatus)
          .catch((err: any) => console.error('Failed to persist Stripe verification status:', err?.message || err));
      }

      res.json({
        connected: true,
        accountId: account.id,
        status,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        requirementsDue,
      });
    } catch (error: any) {
      console.error("Error fetching Stripe Connect status:", error);
      res.status(500).json({ message: "Failed to fetch Stripe status: " + error.message });
    }
  });

  // One-time login link into the creator's Stripe Express dashboard (to see payouts,
  // update bank details, etc.). Only valid once onboarding is complete.
  app.post("/api/stripe/dashboard-link", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getCreatorProfile(userId);

      if (!profile?.stripeAccountId) {
        return res.status(400).json({ message: "No Stripe account connected yet. Connect your account first." });
      }

      const loginLink = await stripe.accounts.createLoginLink(profile.stripeAccountId);
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe dashboard link:", error);
      res.status(500).json({ message: "Couldn't open the Stripe dashboard. Finish onboarding first, then try again." });
    }
  });

  // ─── Venue payouts: Stripe Connect ────────────────────────────────────────
  // Mirrors the creator routes above, but the account belongs to the venue rather
  // than the account holder — one owner can run several spaces, and each is paid
  // as its own business. Ownership is re-checked on every call: the venue id
  // arrives from the client and must never be trusted on its own.

  /** Loads a venue the caller is allowed to manage, or null. */
  async function getOwnedVenue(req: any, venueId: unknown) {
    if (typeof venueId !== "string" || !venueId) return null;
    const userId = req.user.claims.sub;
    const venue = await storage.getVenue(venueId);
    if (!venue) return null;
    if (venue.createdBy === userId) return venue;
    return (await checkIsAdmin(req)) ? venue : null;
  }

  app.post("/api/venue/stripe/connect-url", isAuthenticated, async (req: any, res) => {
    try {
      const venue = await getOwnedVenue(req, req.body?.venueId);
      if (!venue) {
        return res.status(404).json({ message: "That venue is not available on your account" });
      }

      const userEmail = req.user.claims.email;

      // Only allow internal same-origin paths to avoid open-redirects.
      const rawReturn = typeof req.body?.returnPath === "string" ? req.body.returnPath : "";
      const returnPath = rawReturn.startsWith("/") && !rawReturn.startsWith("//")
        ? rawReturn
        : "/venue-dashboard?tab=payouts";

      let account: Stripe.Account | null = null;

      if (venue.stripeAccountId) {
        try {
          account = await stripe.accounts.retrieve(venue.stripeAccountId);
        } catch (err: any) {
          // A stored id from the other Stripe mode (test vs live) stops resolving
          // after a key switch; create a fresh account instead of failing.
          if (err?.code === "resource_missing" || err?.code === "account_invalid") {
            console.warn(`Stripe account ${venue.stripeAccountId} for venue ${venue.id} not found in current mode; creating a new one.`);
          } else {
            throw err;
          }
        }
      }

      if (!account) {
        account = await stripe.accounts.create({
          type: "express",
          email: venue.contactEmail || userEmail,
          metadata: { venueId: venue.id, userId: req.user.claims.sub, accountPurpose: "venue_payouts" },
        });
        await storage.updateVenueStripeAccount(venue.id, account.id);
      }

      const base = getAppBaseUrl(req);
      const sep = returnPath.includes("?") ? "&" : "?";
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${base}${returnPath}${sep}stripe_refresh=true`,
        return_url: `${base}${returnPath}${sep}stripe_success=true`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Error creating venue Stripe Connect URL:", error);
      const msg: string = error?.message || "Unknown error";
      if (msg.includes("signed up for Connect") || msg.includes("platform-profile") || msg.includes("responsibilities of managing losses")) {
        return res.status(500).json({
          message: "Stripe Connect isn't fully activated on the platform's account yet. An admin needs to finish Connect setup at dashboard.stripe.com (Connect → Get started / Platform profile).",
        });
      }
      res.status(500).json({ message: "Error creating Stripe Connect URL: " + msg });
    }
  });

  /**
   * Live payout status for every venue the caller runs. One call rather than one
   * per venue, because the dashboard renders a card for each. Stripe is only asked
   * about venues that actually have an account, and the freshly read status is
   * written back so the cached column cannot drift when a Connect webhook is
   * missed — the same self-healing the creator route does.
   */
  app.get("/api/venue/stripe/connect-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const venues = await storage.getVenuesByCreator(userId);

      const statuses = await Promise.all(venues.map(async (venue) => {
        const base = { venueId: venue.id, venueName: venue.name };

        if (!venue.stripeAccountId) {
          return { ...base, connected: false, status: "not_connected" as const };
        }

        try {
          const account = await stripe.accounts.retrieve(venue.stripeAccountId);
          const chargesEnabled = !!account.charges_enabled;
          const payoutsEnabled = !!account.payouts_enabled;
          const detailsSubmitted = !!account.details_submitted;
          const requirementsDue = Array.from(new Set([
            ...(account.requirements?.currently_due || []),
            ...(account.requirements?.past_due || []),
          ]));

          let status: "verified" | "pending" | "incomplete";
          if (chargesEnabled && payoutsEnabled) status = "verified";
          else if (detailsSubmitted) status = "pending";
          else status = "incomplete";

          const cachedStatus = status === "incomplete" ? "unverified" : status;
          if (venue.stripeVerificationStatus !== cachedStatus) {
            await storage.setVenueStripeVerificationStatus(venue.id, cachedStatus)
              .catch((err: any) => console.error("Failed to persist venue Stripe status:", err?.message || err));
          }

          return {
            ...base,
            connected: true,
            accountId: account.id,
            status,
            chargesEnabled,
            payoutsEnabled,
            detailsSubmitted,
            requirementsDue,
          };
        } catch (err: any) {
          // A dead id (mode switch, deleted account) must not blank the whole
          // dashboard — report this one venue as unconnected and keep going.
          console.error(`Failed to read Stripe account for venue ${venue.id}:`, err?.message || err);
          return { ...base, connected: false, status: "not_connected" as const };
        }
      }));

      res.json(statuses);
    } catch (error: any) {
      console.error("Error fetching venue Stripe status:", error);
      res.status(500).json({ message: "Failed to fetch Stripe status: " + error.message });
    }
  });

  app.post("/api/venue/stripe/dashboard-link", isAuthenticated, async (req: any, res) => {
    try {
      const venue = await getOwnedVenue(req, req.body?.venueId);
      if (!venue) {
        return res.status(404).json({ message: "That venue is not available on your account" });
      }
      if (!venue.stripeAccountId) {
        return res.status(400).json({ message: "No Stripe account connected yet. Connect this venue first." });
      }

      const loginLink = await stripe.accounts.createLoginLink(venue.stripeAccountId);
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error("Error creating venue Stripe dashboard link:", error);
      res.status(500).json({ message: "Couldn't open the Stripe dashboard. Finish onboarding first, then try again." });
    }
  });

  // Review routes
  /**
   * Every review belonging to a set of experiences, newest first, with the
   * reviewer's name and the event it came from.
   *
   * One review, two destinations: the same "how was it?" a participant leaves
   * on an event rolls up to the venue's public page and to the organiser's
   * public profile. There is no second review flow to fill in.
   */
  const collectReviewsForExperiences = async (experienceIds: string[]) => {
    if (!experienceIds.length) return [];

    const rows = await db
      .select({ review: reviews, experience: experiences, author: users })
      .from(reviews)
      .leftJoin(experiences, eq(reviews.experienceId, experiences.id))
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(inArray(reviews.experienceId, experienceIds))
      .orderBy(desc(reviews.createdAt));

    return rows.map((row) => ({
      id: row.review.id,
      rating: row.review.rating,
      comment: row.review.comment,
      createdAt: row.review.createdAt,
      reply: row.review.reply,
      repliedAt: row.review.repliedAt,
      experienceId: row.review.experienceId,
      experienceTitle: row.experience?.title ?? null,
      // A first name is enough to make a review feel like a person; a full
      // name and an email address are not the reviewer's to give away here.
      authorId: row.author?.id ?? null,
      authorName: row.author?.firstName || "Participant",
      authorAvatarUrl: row.author?.profileImageUrl ?? null,
    }));
  };

  /** Public review score and reviews for one venue. */
  app.get("/api/venues/:id/reviews", async (req, res) => {
    try {
      const venue = await storage.getVenue(req.params.id);
      if (!venue) return res.status(404).json({ message: "Venue not found" });

      const hosted = await storage.getExperiencesByVenueIds([venue.id]);
      const collected = await collectReviewsForExperiences(hosted.map((row: any) => row.id));
      res.json({ score: summariseReviewScore(collected), reviews: collected });
    } catch (error) {
      console.error("Error fetching venue reviews:", error);
      res.status(500).json({ message: "Failed to fetch venue reviews" });
    }
  });

  /** Public review score and reviews for one organiser. */
  app.get("/api/users/:id/reviews", async (req, res) => {
    try {
      const hosted = await storage.getExperiencesByCreator(req.params.id);
      const collected = await collectReviewsForExperiences(hosted.map((row: any) => row.id));
      res.json({ score: summariseReviewScore(collected), reviews: collected });
    } catch (error) {
      console.error("Error fetching organiser reviews:", error);
      res.status(500).json({ message: "Failed to fetch organiser reviews" });
    }
  });

  /**
   * The organiser's or the venue's single reply to a review.
   *
   * Only the two parties being scored can answer, and only once. Editing a
   * standing reply is allowed; a second reply is not, because that is a thread.
   */
  app.post("/api/reviews/:id/reply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const text = typeof req.body?.reply === "string" ? req.body.reply.trim() : "";
      if (!text) return res.status(400).json({ message: "Write a reply first" });
      if (text.length > 1000) {
        return res.status(400).json({ message: "Keep the reply under 1000 characters" });
      }

      const [existing] = await db.select().from(reviews).where(eq(reviews.id, req.params.id));
      if (!existing) return res.status(404).json({ message: "Review not found" });

      const experience = await storage.getExperience(existing.experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });

      const isOrganiser = experience.creatorId === userId;
      const venue = (experience as any).linkedVenueId
        ? await storage.getVenue((experience as any).linkedVenueId)
        : undefined;
      const isVenueOwner = !!venue && venue.createdBy === userId;

      if (!isOrganiser && !isVenueOwner && !(await checkIsAdmin(req))) {
        return res.status(403).json({ message: "Only the organiser or the venue can reply to this review" });
      }

      const [updated] = await db
        .update(reviews)
        .set({ reply: text, repliedAt: new Date(), repliedBy: userId })
        .where(eq(reviews.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error replying to review:", error);
      res.status(500).json({ message: "Failed to reply to review" });
    }
  });

  /** An event is open for review once it has finished. */
  const experienceHasFinished = (experience: any): boolean => {
    const ends = experience?.endDate || experience?.startDate;
    if (!ends) return false;
    const end = new Date(ends);
    if (Number.isNaN(end.getTime())) return false;
    // The stored date is the day, not the finishing time, so an event is
    // reviewable from the end of the day it ran on.
    end.setHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  };

  /**
   * Events this person went to and has not reviewed yet.
   *
   * The rating on an event page had no way of ever being written to: the table
   * and the endpoint existed, but nothing asked anyone. This is the nudge.
   */
  app.get("/api/me/reviewable", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const bookings = await storage.getUserBookings(userId);
      const attended = bookings.filter((booking: any) => isActiveParticipantBooking(booking.status));
      if (!attended.length) return res.json({ pending: [] });

      const seen = new Set<string>();
      const pending: any[] = [];

      for (const booking of attended) {
        if (!booking.experienceId || seen.has(booking.experienceId)) continue;
        seen.add(booking.experienceId);

        // getUserBookings returns bare booking rows, with no experience joined.
        const experience = await storage.getExperience(booking.experienceId);
        if (!experience || !experienceHasFinished(experience)) continue;
        if (experience.status === "cancelled") continue;

        const existing = await storage.getReviewsByExperience(experience.id);
        if (existing.some((review: any) => review.userId === userId)) continue;

        pending.push({
          experienceId: experience.id,
          title: experience.title,
          coverImageUrl: experience.coverImageUrl,
          location: experience.location,
          startDate: experience.startDate,
          endDate: experience.endDate,
        });
      }

      res.json({ pending });
    } catch (error) {
      console.error("Error fetching reviewable experiences:", error);
      res.status(500).json({ message: "Failed to fetch reviewable experiences" });
    }
  });

  /**
   * Leave a review.
   *
   * This previously took whatever it was handed and wrote it: any rating, on
   * any event, by anyone signed in, as many times as they liked. A review now
   * has to come from someone who actually went, after the event has happened,
   * and only once.
   */
  app.post("/api/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const experienceId = String(req.body?.experienceId || "").trim();
      if (!experienceId) {
        return res.status(400).json({ message: "Which experience is this review for?" });
      }

      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Give the experience a rating from 1 to 5 stars" });
      }

      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
      if (comment.length > 2000) {
        return res.status(400).json({ message: "That review is too long — keep it under 2000 characters" });
      }

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });

      if (!experienceHasFinished(experience)) {
        return res.status(400).json({ message: "You can review this once the event has finished" });
      }

      const bookings = await storage.getBookingsByExperience(experienceId);
      const attended = bookings.some((booking: any) =>
        booking.userId === userId && isActiveParticipantBooking(booking.status));
      if (!attended) {
        return res.status(403).json({ message: "Only people who joined this experience can review it" });
      }

      const existing = await storage.getReviewsByExperience(experienceId);
      if (existing.some((review: any) => review.userId === userId)) {
        return res.status(409).json({ message: "You have already reviewed this experience" });
      }

      const review = await storage.createReview({
        experienceId,
        userId,
        rating,
        comment: comment || null,
      } as any);
      res.status(201).json(review);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // ============================================================================
  // PAYMENT ENGINE — SPLIT RECIPIENTS & PAYOUT MANAGEMENT
  // ============================================================================

  // GET /api/experiences/:id/split-recipients — read payout routing for an experience
  app.get("/api/experiences/:id/split-recipients", isAuthenticated, async (req: any, res) => {
    try {
      const recipients = await storage.getSplitRecipientsByExperience(req.params.id);
      res.json(recipients);
    } catch (error) {
      console.error("Error fetching split recipients:", error);
      res.status(500).json({ message: "Failed to fetch split recipients" });
    }
  });

  // PUT /api/experiences/:id/split-recipients — set/replace all payout routing rows
  // Body: Array<{ recipientType, userId?, stripeAccountId?, splitMode, splitValue, currency?, priority? }>
  app.put("/api/experiences/:id/split-recipients", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      const experienceId = req.params.id;

      // Allow creator or admin
      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });

      const userId = req.user.claims.sub;
      if (!isAdmin && experience.creatorId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const recipientsInput: any[] = Array.isArray(req.body) ? req.body : [];
      await storage.deleteSplitRecipientsByExperience(experienceId);

      if (recipientsInput.length > 0) {
        await storage.createSplitRecipients(
          recipientsInput.map((r) => ({ ...r, experienceId }))
        );
      }

      const saved = await storage.getSplitRecipientsByExperience(experienceId);
      res.json(saved);
    } catch (error) {
      console.error("Error saving split recipients:", error);
      res.status(500).json({ message: "Failed to save split recipients" });
    }
  });

  // GET /api/experiences/:id/scheduled-payout — read the 7-day payout record
  app.get("/api/experiences/:id/scheduled-payout", isAuthenticated, async (req: any, res) => {
    try {
      const payout = await storage.getScheduledPayoutByExperience(req.params.id);
      res.json(payout ?? null);
    } catch (error) {
      console.error("Error fetching scheduled payout:", error);
      res.status(500).json({ message: "Failed to fetch scheduled payout" });
    }
  });

  // POST /api/experiences/:id/scheduled-payout/retry — admin can reset a failed payout
  app.post("/api/experiences/:id/scheduled-payout/retry", isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      if (!isAdmin) return res.status(403).json({ message: "Admin only" });

      const payout = await storage.getScheduledPayoutByExperience(req.params.id);
      if (!payout) return res.status(404).json({ message: "No scheduled payout found" });

      const updated = await storage.updateScheduledPayout(payout.id, {
        status: "pending",
        errorMessage: null,
        processedAt: null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error resetting payout:", error);
      res.status(500).json({ message: "Failed to reset payout" });
    }
  });

  // ============================================================================
  // VENUE ROUTES
  // ============================================================================

  // List all venues (public - returns only approved venues by default)
  app.get("/api/venues", async (req, res) => {
    try {
      const { location } = req.query;
      // Public endpoint — always return only admin-approved venues.
      // Pending/rejected venues are never visible to the public.
      const venues = await storage.getVenues({
        approved: true,
        location: location as string,
      });
      res.json(stripVenuePricingAll(venues));
    } catch (error) {
      console.error("Error fetching venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Get user's own venues (protected - returns all statuses for owner)
  app.get("/api/user/venues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venues = await storage.getVenuesByCreator(userId);
      res.json(stripVenuePricingAll(venues));
    } catch (error) {
      console.error("Error fetching user venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  app.get("/api/user/service-providers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const services = await storage.getServiceProviders();
      res.json(services.filter((service) => service.createdBy === userId));
    } catch (error) {
      console.error("Error fetching user service providers:", error);
      res.status(500).json({ message: "Failed to fetch service provider profiles" });
    }
  });

  // Get authenticated user's venues (alias for creator dashboard)
  app.get("/api/venues/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venues = await storage.getVenuesByCreator(userId);
      res.json(stripVenuePricingAll(venues));
    } catch (error) {
      console.error("Error fetching my venues:", error);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });

  // Get venue for editing (protected - allows owner/admin to access draft venues)
  app.get("/api/venues/:id/edit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venue = await storage.getVenue(req.params.id);
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "You don't have permission to edit this venue" });
      }

      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error fetching venue for editing:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Get venue by slug or ID (public - returns only approved venues)
  app.get("/api/venues/:slug", async (req, res) => {
    try {
      // Try to fetch by slug first, fallback to ID for backward compatibility
      let venue = await storage.getVenueBySlug(req.params.slug);
      
      // If not found by slug, try by ID (for backward compatibility)
      if (!venue) {
        venue = await storage.getVenue(req.params.slug);
      }
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      // Only return approved venues (public access)
      if (venue.status !== "approved" || !venue.approved) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error fetching venue:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Public venue page endpoint - fetch by slug or ID
  // Allows owners to view their own draft venues
  app.get("/api/v/:slugOrId", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || (process.env.NODE_ENV === 'development' ? "45788955" : null);
      
      // Try to find venue by slug first, then by ID
      let venue = await storage.getVenueBySlug(req.params.slugOrId);
      if (!venue) {
        venue = await storage.getVenue(req.params.slugOrId);
      }
      
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }
      
      // For approved venues, anyone can view
      if (venue.status === "approved" && venue.approved) {
        return res.json(stripVenuePricing(venue));
      }
      
      // For non-approved venues, only the owner can view
      if (userId && venue.createdBy === userId) {
        return res.json(stripVenuePricing(venue));
      }
      
      // Otherwise, venue is not accessible
      return res.status(404).json({ message: "Venue not found" });
    } catch (error) {
      console.error("Error fetching venue by slug/id:", error);
      res.status(500).json({ message: "Failed to fetch venue" });
    }
  });

  // Get experiences hosted at a specific venue (public endpoint)
  app.get("/api/venues/:venueId/experiences", async (req, res) => {
    try {
      const experiences = await storage.getExperiencesByVenue(req.params.venueId);
      res.json(experiences);
    } catch (error) {
      console.error("Error fetching venue experiences:", error);
      res.status(500).json({ message: "Failed to fetch venue experiences" });
    }
  });

  // Create venue (protected - creates draft venue by default)
  app.post("/api/venues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Generate unique slug from venue name and city
      let baseSlug = generateVenueSlug(req.body.name, req.body.city);
      let slug = baseSlug;
      let counter = 1;
      
      // Check for slug uniqueness and append number if needed
      let existingVenue = await storage.getVenueBySlug(slug);
      while (existingVenue) {
        slug = `${baseSlug}-${counter}`;
        existingVenue = await storage.getVenueBySlug(slug);
        counter++;
      }
      
      // Prepare venue data with ALL fields from request body.
      // This endpoint always creates a DRAFT (incomplete by nature), so the NOT NULL
      // columns get safe fallbacks and full validation is deferred to Submit for Review.
      const venuePayload = {
        // Required (NOT NULL) columns — fall back so a partial draft can still save
        name: (typeof req.body.name === 'string' && req.body.name.trim()) || 'Untitled venue',
        city: req.body.city || '',
        description: req.body.description || '',
        venueType: req.body.venueType || 'multi_day',
        capacity: req.body.capacity != null && req.body.capacity !== '' ? Number(req.body.capacity) : 0,
        standingCapacity: req.body.standingCapacity ?? null,
        seatedCapacity: req.body.seatedCapacity ?? null,
        location: req.body.location || '',
        
        // Basic optional fields
        tagline: req.body.tagline || null,
        friendlyAddress: req.body.friendlyAddress || null,
        logoUrl: req.body.logoUrl || null,
        website: req.body.website || null,
        instagram: req.body.instagram || null,
        videoUrl: req.body.videoUrl || null,
        
        // Geographic fields
        latitude: req.body.latitude ?? null,
        longitude: req.body.longitude ?? null,
        region: req.body.region || null,
        timezone: req.body.timezone || null,
        
        // Categorization arrays (ensure proper array format)
        categories: Array.isArray(req.body.categories) ? req.body.categories : [],
        vibes: Array.isArray(req.body.vibes) ? req.body.vibes : [],
        amenities: Array.isArray(req.body.amenities) ? req.body.amenities : [],
        customAmenities: Array.isArray(req.body.customAmenities) ? req.body.customAmenities : [],
        servicesOffered: Array.isArray(req.body.servicesOffered) ? req.body.servicesOffered : [],
        customServicesOffered: Array.isArray(req.body.customServicesOffered) ? req.body.customServicesOffered : [],
        
        // Media fields (legacy)
        coverImageUrl: req.body.coverImageUrl || null,
        galleryImages: Array.isArray(req.body.galleryImages) ? req.body.galleryImages : [],
        
        // Media fields (new JSONB structure)
        coverImages: Array.isArray(req.body.coverImages) ? req.body.coverImages : [],
        galleryImagesJsonb: Array.isArray(req.body.galleryImagesJsonb) ? req.body.galleryImagesJsonb : [],
        
        // Services JSONB
        services: Array.isArray(req.body.services) ? req.body.services : [],
        
        cancellationPolicy: req.body.cancellationPolicy || null,
        
        
        // New Page 10 Terms fields
        termsAndConditionsUrl: req.body.termsAndConditionsUrl || null,
        houseRules: req.body.houseRules || null,
        damagePolicy: req.body.damagePolicy || null,
        termsConfirmed: req.body.termsConfirmed ?? false,
        
        // Business fields
        approvalMode: req.body.approvalMode || null,
        commercialModel: req.body.commercialModel || null,
        
        // Availability integration
        googleCalendarConnected: req.body.googleCalendarConnected ?? false,
        googleCalendarId: req.body.googleCalendarId || null,
        featuredWeeksToFill: Array.isArray(req.body.featuredWeeksToFill) ? req.body.featuredWeeksToFill : [],
        
        // Contact & Social
        contactPerson: req.body.contactPerson || null,
        contactEmail: req.body.contactEmail || null,
        contactPhone: req.body.contactPhone || null,
        facebook: req.body.facebook || null,
        youtube: req.body.youtube || null,
        whatsapp: req.body.whatsapp || null,
        skype: req.body.skype || null,
        
        // Templates & Defaults (JSONB)
        venueRoles: Array.isArray(req.body.venueRoles) ? req.body.venueRoles : [],
        venueRoomTypes: Array.isArray(req.body.venueRoomTypes) ? req.body.venueRoomTypes : [],
        defaultItinerary: Array.isArray(req.body.defaultItinerary) ? req.body.defaultItinerary : [],
        displayPrefs: req.body.displayPrefs || {},
        
        // System fields
        slug,
        createdBy: userId,
        status: 'draft' as const,
        approved: false,
      };
      
      // Drafts are saved leniently — never block on incomplete fields. The full
      // extendedInsertVenueSchema is enforced client-side before Submit for Review.
      // Coerce/strip known fields where the partial schema can, but always save.
      const parsed = extendedInsertVenueSchema.partial().safeParse(venuePayload);
      const venueData = (parsed.success ? { ...venuePayload, ...parsed.data } : venuePayload) as any;

      console.log(`Creating venue draft: ${venueData.name} (${venueData.venueType})`);

      const venue = await storage.createVenue(venueData);
      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error creating venue:", error);
      res.status(500).json({ message: "Failed to create venue" });
    }
  });

  // Update venue (protected - owner or admin only)
  app.put("/api/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const existingVenue = await storage.getVenue(req.params.id);
      if (!existingVenue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (existingVenue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can edit this venue" });
      }

      // Explicitly map ALL fields from request body (prevent silent drops)
      const updatePayload = {
        // Required fields (merge with existing if not provided)
        name: req.body.name ?? existingVenue.name,
        city: req.body.city ?? existingVenue.city,
        description: req.body.description ?? existingVenue.description,
        venueType: req.body.venueType ?? existingVenue.venueType,
        capacity: req.body.capacity ?? existingVenue.capacity,
        standingCapacity: req.body.standingCapacity !== undefined ? req.body.standingCapacity : existingVenue.standingCapacity,
        seatedCapacity: req.body.seatedCapacity !== undefined ? req.body.seatedCapacity : existingVenue.seatedCapacity,
        location: req.body.location ?? existingVenue.location,
        
        // Basic optional fields
        tagline: req.body.tagline !== undefined ? (req.body.tagline || null) : existingVenue.tagline,
        friendlyAddress: req.body.friendlyAddress !== undefined ? (req.body.friendlyAddress || null) : existingVenue.friendlyAddress,
        logoUrl: req.body.logoUrl !== undefined ? (req.body.logoUrl || null) : existingVenue.logoUrl,
        website: req.body.website !== undefined ? (req.body.website || null) : existingVenue.website,
        instagram: req.body.instagram !== undefined ? (req.body.instagram || null) : existingVenue.instagram,
        videoUrl: req.body.videoUrl !== undefined ? (req.body.videoUrl || null) : existingVenue.videoUrl,
        
        // Geographic fields
        latitude: req.body.latitude !== undefined ? req.body.latitude : existingVenue.latitude,
        longitude: req.body.longitude !== undefined ? req.body.longitude : existingVenue.longitude,
        region: req.body.region !== undefined ? (req.body.region || null) : existingVenue.region,
        timezone: req.body.timezone !== undefined ? (req.body.timezone || null) : existingVenue.timezone,
        
        // Categorization arrays (ensure proper array format)
        categories: req.body.categories !== undefined ? (Array.isArray(req.body.categories) ? req.body.categories : []) : existingVenue.categories,
        vibes: req.body.vibes !== undefined ? (Array.isArray(req.body.vibes) ? req.body.vibes : []) : existingVenue.vibes,
        amenities: req.body.amenities !== undefined ? (Array.isArray(req.body.amenities) ? req.body.amenities : []) : existingVenue.amenities,
        customAmenities: req.body.customAmenities !== undefined ? (Array.isArray(req.body.customAmenities) ? req.body.customAmenities : []) : existingVenue.customAmenities,
        servicesOffered: req.body.servicesOffered !== undefined ? (Array.isArray(req.body.servicesOffered) ? req.body.servicesOffered : []) : existingVenue.servicesOffered,
        customServicesOffered: req.body.customServicesOffered !== undefined ? (Array.isArray(req.body.customServicesOffered) ? req.body.customServicesOffered : []) : existingVenue.customServicesOffered,
        
        // Media fields (legacy)
        coverImageUrl: req.body.coverImageUrl !== undefined ? (req.body.coverImageUrl || null) : existingVenue.coverImageUrl,
        galleryImages: req.body.galleryImages !== undefined ? (Array.isArray(req.body.galleryImages) ? req.body.galleryImages : []) : existingVenue.galleryImages,
        
        // Media fields (new JSONB structure)
        coverImages: req.body.coverImages !== undefined ? (Array.isArray(req.body.coverImages) ? req.body.coverImages : []) : existingVenue.coverImages,
        galleryImagesJsonb: req.body.galleryImagesJsonb !== undefined ? (Array.isArray(req.body.galleryImagesJsonb) ? req.body.galleryImagesJsonb : []) : existingVenue.galleryImagesJsonb,
        
        // Services JSONB
        services: req.body.services !== undefined ? (Array.isArray(req.body.services) ? req.body.services : []) : existingVenue.services,
        
        cancellationPolicy: req.body.cancellationPolicy !== undefined ? (req.body.cancellationPolicy || null) : existingVenue.cancellationPolicy,
        
        
        // New Page 10 Terms fields
        termsAndConditionsUrl: req.body.termsAndConditionsUrl !== undefined ? (req.body.termsAndConditionsUrl || null) : existingVenue.termsAndConditionsUrl,
        houseRules: req.body.houseRules !== undefined ? (req.body.houseRules || null) : existingVenue.houseRules,
        damagePolicy: req.body.damagePolicy !== undefined ? (req.body.damagePolicy || null) : existingVenue.damagePolicy,
        termsConfirmed: req.body.termsConfirmed !== undefined ? req.body.termsConfirmed : existingVenue.termsConfirmed,
        
        // Business fields
        approvalMode: req.body.approvalMode !== undefined ? (req.body.approvalMode || null) : existingVenue.approvalMode,
        commercialModel: req.body.commercialModel !== undefined ? (req.body.commercialModel || null) : existingVenue.commercialModel,
        
        // Availability integration
        googleCalendarConnected: req.body.googleCalendarConnected !== undefined ? req.body.googleCalendarConnected : existingVenue.googleCalendarConnected,
        googleCalendarId: req.body.googleCalendarId !== undefined ? (req.body.googleCalendarId || null) : existingVenue.googleCalendarId,
        featuredWeeksToFill: req.body.featuredWeeksToFill !== undefined ? (Array.isArray(req.body.featuredWeeksToFill) ? req.body.featuredWeeksToFill : []) : existingVenue.featuredWeeksToFill,
        
        // Contact & Social
        contactPerson: req.body.contactPerson !== undefined ? (req.body.contactPerson || null) : existingVenue.contactPerson,
        contactEmail: req.body.contactEmail !== undefined ? (req.body.contactEmail || null) : existingVenue.contactEmail,
        contactPhone: req.body.contactPhone !== undefined ? (req.body.contactPhone || null) : existingVenue.contactPhone,
        facebook: req.body.facebook !== undefined ? (req.body.facebook || null) : existingVenue.facebook,
        youtube: req.body.youtube !== undefined ? (req.body.youtube || null) : existingVenue.youtube,
        whatsapp: req.body.whatsapp !== undefined ? (req.body.whatsapp || null) : existingVenue.whatsapp,
        skype: req.body.skype !== undefined ? (req.body.skype || null) : existingVenue.skype,
        
        // Templates & Defaults (JSONB)
        venueRoles: req.body.venueRoles !== undefined ? (Array.isArray(req.body.venueRoles) ? req.body.venueRoles : []) : existingVenue.venueRoles,
        venueRoomTypes: req.body.venueRoomTypes !== undefined ? (Array.isArray(req.body.venueRoomTypes) ? req.body.venueRoomTypes : []) : existingVenue.venueRoomTypes,
        defaultItinerary: req.body.defaultItinerary !== undefined ? (Array.isArray(req.body.defaultItinerary) ? req.body.defaultItinerary : []) : existingVenue.defaultItinerary,
        displayPrefs: req.body.displayPrefs !== undefined ? (req.body.displayPrefs || {}) : existingVenue.displayPrefs,
        
        // Preserve system fields (never allow user modification)
        slug: existingVenue.slug, // Keep original slug
        createdBy: existingVenue.createdBy, // Keep original creator
      };
      
      // Validate using partial Zod schema (allows partial updates)
      const validationResult = extendedInsertVenueSchema.partial().safeParse(updatePayload);
      
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(issue => {
          const path = issue.path.join('.');
          return `${path}: ${issue.message}`;
        });
        
        console.log('Venue update validation failed:', errors);
        
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
          details: validationResult.error.issues
        });
      }
      
      // Use validated data for update
      const updateData = validationResult.data;

      console.log('Updating venue with validated data, fields updated:', Object.keys(updateData).length);
      
      const updatedVenue = await storage.updateVenue(req.params.id, updateData);
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error updating venue:", error);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });

  // ============================================================================
  // VENUE WORKFLOW ROUTES (Submit, Approve, Reject)
  // ============================================================================

  // Submit venue for review (protected - owner only)
  app.patch("/api/venues/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(req.params.id);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner
      if (venue.createdBy !== userId) {
        return res.status(403).json({ message: "Only the venue owner can submit for review" });
      }

      // Update status to pending and keep the venue unpublished until admin approval.
      const updatedVenue = await storage.updateVenue(req.params.id, {
        status: 'pending',
        approved: false,
        submittedAt: new Date(),
      } as any);
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error submitting venue for review:", error);
      res.status(500).json({ message: "Failed to submit venue for review" });
    }
  });

  // ============================================================================
  // ADMIN VENUE ROUTES
  // ============================================================================

  // Get all pending venues for admin review (admin only)
  app.get("/api/admin/venues/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const pendingVenues = await storage.getPendingVenues();
      res.json(pendingVenues);
    } catch (error) {
      console.error("Error fetching pending venues:", error);
      res.status(500).json({ message: "Failed to fetch pending venues" });
    }
  });

  // Approve venue (admin only)
  app.patch("/api/venues/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can approve venues" });
      }

      const { reviewNotes } = req.body;
      const venue = await storage.approveVenue(req.params.id, userId, reviewNotes);
      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error approving venue:", error);
      res.status(500).json({ message: "Failed to approve venue" });
    }
  });

  // Reject venue (admin only)
  app.patch("/api/venues/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!isAdmin) {
        return res.status(403).json({ message: "Only admins can reject venues" });
      }

      const { reviewNotes } = req.body;
      const venue = await storage.rejectVenue(req.params.id, userId, reviewNotes);
      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error rejecting venue:", error);
      res.status(500).json({ message: "Failed to reject venue" });
    }
  });

  // Resubmit a rejected venue for admin review
  app.patch("/api/venues/:id/resubmit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const venue = await storage.getVenue(req.params.id);
      if (!venue) return res.status(404).json({ message: "Venue not found" });
      if (venue.createdBy !== userId) return res.status(403).json({ message: "Unauthorized" });
      if (venue.status !== "rejected") {
        return res.status(400).json({ message: "Only rejected venues can be resubmitted" });
      }
      const rejectionCount = (venue.rejectionCount ?? 0) as number;
      if (rejectionCount >= 3) {
        return res.status(400).json({ message: "This venue has been rejected 3 times. Please create a new listing." });
      }
      const updated = await storage.resubmitVenue(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Error resubmitting venue:", error);
      res.status(500).json({ message: "Failed to resubmit venue" });
    }
  });

  app.delete("/api/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(req.params.id);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      // Check if user is owner or admin
      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can delete this venue" });
      }

      await storage.rejectVenue(req.params.id);
      res.json({ message: "Venue deleted" });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================================
  // VENUE AVAILABILITY ROUTES
  // ============================================================================

  // Get venue availability (protected - owner or admin only)
  app.get("/api/venues/:venueId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can view availability" });
      }

      const availability = await storage.getVenueAvailability(req.params.venueId);
      res.json(availability);
    } catch (error) {
      console.error("Error fetching venue availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // Create venue availability block (protected - owner or admin only)
  app.post("/api/venues/:venueId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can manage availability" });
      }

      // The generated schema wants real Date objects, which JSON cannot carry —
      // every client necessarily sends ISO strings, so this rejected all of
      // them with "Expected date, received string". Coerce instead.
      const validationSchema = insertVenueAvailabilitySchema
        // These identify a block as belonging to an imported feed. The sync
        // owns them; a caller forging one could overwrite a real booking.
        .omit({ externalFeedUrl: true, externalUid: true, source: true })
        .extend({
          // A block covers whole days. Anchoring to UTC midnight keeps a
          // hand-made block comparable with an imported one, whatever
          // timezone the browser sent it from.
          startDate: z.coerce.date().transform(startOfUtcDay),
          endDate: z.coerce.date().transform(startOfUtcDay),
        })
        // Inclusive: a block from the 15th to the 15th is one day, which is a
        // perfectly ordinary thing for a venue to close off. Requiring a
        // strictly later end date made single-day blocks impossible, and it
        // disagreed with imported calendars, where a one-night booking lands
        // with the same start and end.
        .refine((data) => data.startDate <= data.endDate, {
          message: "End date cannot be before start date",
        });

      // venueId comes from the path, never the body — spreading first would
      // let a caller file a block against somebody else's venue.
      const validatedData = validationSchema.parse({
        ...req.body,
        venueId: req.params.venueId,
      });

      // The route decides the source, not the caller. A block labelled
      // ical_import would be deleted as an orphan by the next sync.
      const availability = await storage.createVenueAvailability({
        ...validatedData,
        source: "manual",
      });
      res.json(availability);
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid data", errors: error });
      }
      console.error("Error creating venue availability:", error);
      res.status(500).json({ message: "Failed to create availability" });
    }
  });

  // Update venue availability block (protected - owner or admin only)
  app.put("/api/venues/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the availability block to verify venue ownership
      const availabilityBlock = await storage.getVenueAvailabilityById(req.params.id);
      if (!availabilityBlock) {
        return res.status(404).json({ message: "Availability block not found" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(availabilityBlock.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can update availability" });
      }

      // Only these are the owner's to change. The raw body used to go
      // straight to the database, which let a caller rewrite venueId or forge
      // the externalUid that identifies an imported booking — and handed
      // Drizzle ISO strings where its timestamp columns want Dates.
      const updateSchema = z
        .object({
          startDate: z.coerce.date().transform(startOfUtcDay).optional(),
          endDate: z.coerce.date().transform(startOfUtcDay).optional(),
          status: z.enum(["available", "blocked"]).optional(),
          notes: z.string().max(2000).nullable().optional(),
        })
        .refine((data) => {
          const start = data.startDate ?? availabilityBlock.startDate;
          const end = data.endDate ?? availabilityBlock.endDate;
          return new Date(start) <= new Date(end);
        }, { message: "End date cannot be before start date" });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message || "Invalid data",
        });
      }

      const updatedAvailability = await storage.updateVenueAvailability(req.params.id, parsed.data);
      res.json(updatedAvailability);
    } catch (error) {
      console.error("Error updating availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // Delete venue availability block (protected - owner or admin only)
  app.delete("/api/venues/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the availability block to verify venue ownership
      const availabilityBlock = await storage.getVenueAvailabilityById(req.params.id);
      if (!availabilityBlock) {
        return res.status(404).json({ message: "Availability block not found" });
      }

      // Get venue to check ownership
      const venue = await storage.getVenue(availabilityBlock.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can delete this availability block" });
      }

      await storage.deleteVenueAvailability(req.params.id);
      res.json({ message: "Availability deleted" });
    } catch (error) {
      console.error("Error deleting availability:", error);
      res.status(500).json({ message: "Failed to delete availability" });
    }
  });

  // ── Two-way iCal sync ─────────────────────────────────────────────────────
  //
  // Import: the venue's existing calendars (Airbnb, Booking.com, Google) are
  // read on a schedule and their busy dates written in as blocks, so a creator
  // can never request a date the venue has already sold.
  //
  // Export: one feed per venue carrying the events confirmed here, so a deal
  // agreed on the platform blocks the date in the venue's own calendars too.

  /** Only the owner (or an admin) may see or change a venue's calendar links. */
  async function requireVenueOwner(req: any, res: any, venueId: string) {
    const userId = resolveCurrentUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const venue = await storage.getVenue(venueId);
    if (!venue) {
      res.status(404).json({ message: "Venue not found" });
      return null;
    }
    if (venue.createdBy !== userId && !(await checkIsAdmin(req))) {
      res.status(403).json({ message: "Only the venue owner can manage this calendar" });
      return null;
    }
    return venue;
  }

  app.get("/api/venues/:venueId/ical", isAuthenticated, async (req: any, res) => {
    try {
      const venue = await requireVenueOwner(req, res, req.params.venueId);
      if (!venue) return;

      // Reading the settings is what mints the token, so the export link is
      // ready the first time the venue opens the step.
      const token = await ensureIcalExportToken(venue.id);

      res.json({
        importUrls: Array.isArray((venue as any).icalImportUrls) ? (venue as any).icalImportUrls : [],
        exportUrl: `${getAppBaseUrl(req)}/api/venues/${venue.id}/ical/${token}.ics`,
        lastSyncedAt: (venue as any).icalLastSyncedAt ?? null,
        lastSyncError: (venue as any).icalLastSyncError ?? null,
      });
    } catch (error) {
      console.error("Error reading venue iCal settings:", error);
      res.status(500).json({ message: "Failed to load calendar settings" });
    }
  });

  app.put("/api/venues/:venueId/ical", isAuthenticated, async (req: any, res) => {
    try {
      const venue = await requireVenueOwner(req, res, req.params.venueId);
      if (!venue) return;

      const submitted = Array.isArray(req.body?.importUrls) ? req.body.importUrls : [];
      const urls: string[] = [];
      for (const raw of submitted) {
        const url = String(raw || "").trim();
        if (!url) continue;
        if (!/^(https?|webcal):\/\//i.test(url)) {
          return res.status(400).json({ message: `"${url}" is not a calendar link. It should start with https:// or webcal://` });
        }
        if (url.length > 2000) {
          return res.status(400).json({ message: "That calendar link is too long." });
        }
        if (!urls.includes(url)) urls.push(url);
      }
      if (urls.length > 10) {
        return res.status(400).json({ message: "You can import up to 10 calendars." });
      }

      await storage.updateVenue(venue.id, { icalImportUrls: urls } as any);

      // Sync straight away: a venue that has just pasted a link expects to see
      // its dates, not to wait for the next scheduled run.
      const result = await syncVenueIcalFeeds(venue.id);
      res.json({ importUrls: urls, sync: result });
    } catch (error) {
      console.error("Error saving venue iCal links:", error);
      res.status(500).json({ message: "Failed to save calendar links" });
    }
  });

  app.post("/api/venues/:venueId/ical/sync", isAuthenticated, async (req: any, res) => {
    try {
      const venue = await requireVenueOwner(req, res, req.params.venueId);
      if (!venue) return;
      res.json(await syncVenueIcalFeeds(venue.id));
    } catch (error) {
      console.error("Error syncing venue calendars:", error);
      res.status(500).json({ message: "Failed to sync calendars" });
    }
  });

  /**
   * The venue's outbound feed. Public by necessity — Airbnb and Google fetch
   * it unauthenticated — so the unguessable token in the path is the only
   * thing standing in for a login. A wrong token is a 404, never a hint.
   */
  app.get("/api/venues/:venueId/ical/:token.ics", async (req: any, res) => {
    try {
      const token = String(req.params.token || "");
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue || !(venue as any).icalExportToken || (venue as any).icalExportToken !== token) {
        return res.status(404).type("text/plain").send("Not found");
      }

      const events = await getConfirmedVenueEvents(venue.id);
      const feed = buildIcalFeed(
        `${venue.name} — booked on Great.`,
        events.map((event) => {
          const start = new Date(event.startDate as any);
          const end = event.endDate ? new Date(event.endDate as any) : start;
          return {
            uid: `experience-${event.id}@greatexperiences.ai`,
            start,
            // DTEND is exclusive: a stay through the 16th ends on the 17th.
            end: new Date(end.getTime() + 86400000),
            summary: event.title || "Booked",
            description: `Confirmed on Great.${event.maxParticipants ? ` Up to ${event.maxParticipants} guests.` : ""}`,
            location: event.location || venue.location || null,
            // The booking's own last change, so a subscriber only sees a
            // difference when something actually changed.
            stamp: (event as any).updatedAt ? new Date((event as any).updatedAt) : null,
          };
        }),
        new Date(),
      );

      res.type("text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${venue.slug || venue.id}.ics"`);
      res.setHeader("Cache-Control", "public, max-age=900");
      res.send(feed);
    } catch (error) {
      console.error("Error building venue iCal feed:", error);
      res.status(500).type("text/plain").send("Failed to build calendar");
    }
  });

  /**
   * Whether a venue is free between two dates. The Event Builder asks before
   * letting a creator commit to dates; the handshake routes ask again before
   * accepting one, because a feed can change between the two.
   */
  app.get("/api/venues/:venueId/date-conflicts", async (req: any, res) => {
    try {
      const { startDate, endDate, excludeExperienceId } = req.query;
      if (!startDate) {
        return res.status(400).json({ message: "startDate is required" });
      }
      const conflicts = await findVenueDateConflicts(
        req.params.venueId,
        String(startDate),
        endDate ? String(endDate) : null,
        excludeExperienceId ? String(excludeExperienceId) : null,
      );
      res.json({ available: conflicts.length === 0, conflicts });
    } catch (error) {
      console.error("Error checking venue date conflicts:", error);
      res.status(500).json({ message: "Failed to check availability" });
    }
  });

  // ── Venue Flash Deals ─────────────────────────────────────────────────────
  //
  // A venue broadcasting dates it wants filled, in its own words. There is no
  // discount engine here on purpose: the card carries a headline, a
  // description and a date range, and a creator who likes it opens a builder
  // and proposes their own Target Deal. Claiming reserves nothing.

  /** The venue's own deals, newest first. */
  app.get("/api/venue-flash-deals/mine", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const owned = await storage.getVenuesByCreator(userId);
      if (owned.length === 0) return res.json([]);

      const deals = await db
        .select()
        .from(venueFlashDeals)
        .where(inArray(venueFlashDeals.venueId, owned.map((venue: any) => venue.id)))
        .orderBy(desc(venueFlashDeals.createdAt));

      const venueById = new Map(owned.map((venue: any) => [venue.id, venue]));
      res.json(deals.map((deal) => ({
        ...deal,
        venueName: venueById.get(deal.venueId)?.name || null,
      })));
    } catch (error) {
      console.error("Error fetching venue flash deals:", error);
      res.status(500).json({ message: "Failed to load flash deals" });
    }
  });

  /**
   * The creator-facing feed. Only live deals on dates that have not passed,
   * and only from approved venues — an unapproved venue is not yet bookable,
   * so advertising its dates would send creators nowhere.
   */
  app.get("/api/venue-flash-deals", async (req: any, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const rows = await db
        .select({ deal: venueFlashDeals, venue: venues })
        .from(venueFlashDeals)
        .innerJoin(venues, eq(venueFlashDeals.venueId, venues.id))
        .where(and(
          eq(venueFlashDeals.status, "active"),
          gte(venueFlashDeals.endDate, today),
          eq(venues.approved, true),
        ))
        .orderBy(asc(venueFlashDeals.startDate));

      res.json(rows.map(({ deal, venue }) => ({
        ...deal,
        venue: {
          id: venue.id,
          name: venue.name,
          slug: venue.slug,
          city: venue.city,
          location: venue.location,
          capacity: venue.capacity,
          coverImageUrl: venue.coverImageUrl,
        },
      })));
    } catch (error) {
      console.error("Error fetching flash deal feed:", error);
      res.status(500).json({ message: "Failed to load flash deals" });
    }
  });

  app.post("/api/venue-flash-deals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const parsed = venueFlashDealInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid flash deal" });
      }
      const input = parsed.data;

      const venue = await storage.getVenue(input.venueId);
      if (!venue) return res.status(404).json({ message: "Venue not found" });
      if (venue.createdBy !== userId && !(await checkIsAdmin(req))) {
        return res.status(403).json({ message: "Only the venue owner can post a deal for this venue" });
      }

      // A deal for dates the venue is already committed on would send creators
      // straight into a conflict. Say so now rather than after they build.
      const conflicts = await findVenueDateConflicts(venue.id, input.startDate, input.endDate);
      if (conflicts.length > 0) {
        return res.status(409).json({
          message: "Those dates are blocked on your calendar. Free them up first, or pick dates you can actually host.",
          conflicts,
        });
      }

      const [deal] = await db
        .insert(venueFlashDeals)
        .values({
          venueId: venue.id,
          createdBy: userId,
          startDate: input.startDate,
          endDate: input.endDate,
          headline: input.headline,
          description: input.description,
        })
        .returning();

      res.status(201).json({ ...deal, venueName: venue.name });
    } catch (error) {
      console.error("Error creating flash deal:", error);
      res.status(500).json({ message: "Failed to post flash deal" });
    }
  });

  app.delete("/api/venue-flash-deals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [deal] = await db.select().from(venueFlashDeals).where(eq(venueFlashDeals.id, req.params.id));
      if (!deal) return res.status(404).json({ message: "Flash deal not found" });

      const venue = await storage.getVenue(deal.venueId);
      if (venue?.createdBy !== userId && !(await checkIsAdmin(req))) {
        return res.status(403).json({ message: "Only the venue owner can withdraw this deal" });
      }

      // Withdrawn rather than deleted: a creator may already have a builder
      // open against it, and the card should read as pulled, not vanish.
      const [updated] = await db
        .update(venueFlashDeals)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(eq(venueFlashDeals.id, deal.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error withdrawing flash deal:", error);
      res.status(500).json({ message: "Failed to withdraw flash deal" });
    }
  });

  /**
   * A creator opening a builder from a deal card.
   *
   * This reserves nothing and blocks no dates — it records interest for the
   * venue and hands back the values the builder should open with. The real
   * commitment is still the Digital Handshake.
   */
  app.post("/api/venue-flash-deals/:id/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [deal] = await db.select().from(venueFlashDeals).where(eq(venueFlashDeals.id, req.params.id));
      if (!deal || deal.status !== "active") {
        return res.status(404).json({ message: "That deal is no longer available" });
      }

      const venue = await storage.getVenue(deal.venueId);
      if (!venue || !venue.approved) {
        return res.status(404).json({ message: "That deal is no longer available" });
      }

      await db
        .update(venueFlashDeals)
        .set({ claimCount: sql`${venueFlashDeals.claimCount} + 1`, updatedAt: new Date() })
        .where(eq(venueFlashDeals.id, deal.id));

      res.json({
        flashDealId: deal.id,
        venueId: venue.id,
        venueName: venue.name,
        startDate: new Date(deal.startDate).toISOString(),
        endDate: new Date(deal.endDate).toISOString(),
      });
    } catch (error) {
      console.error("Error claiming flash deal:", error);
      res.status(500).json({ message: "Failed to open a builder for that deal" });
    }
  });

  app.patch("/api/venues/:venueId/google-calendar", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const isAdmin = await checkIsAdmin(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify venue ownership
      const venue = await storage.getVenue(req.params.venueId);
      if (!venue) {
        return res.status(404).json({ message: "Venue not found" });
      }

      if (venue.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the venue owner or admin can manage Google Calendar integration" });
      }

      const updatedVenue = await storage.updateVenueGoogleCalendar(
        req.params.venueId,
        req.body.connected,
        req.body.calendarId
      );
      res.json(updatedVenue);
    } catch (error) {
      console.error("Error updating Google Calendar connection:", error);
      res.status(500).json({ message: "Failed to update Google Calendar connection" });
    }
  });

  // Service provider routes
  app.get("/api/service-providers", async (req, res) => {
    try {
      const { location, type, approved } = req.query;
      
      // Validate query parameters
      const queryOptions: { location?: string; type?: string; approved?: boolean } = {};
      
      if (location && typeof location === 'string') {
        queryOptions.location = location;
      }
      
      if (type && typeof type === 'string') {
        queryOptions.type = type;
      }
      
      if (approved !== undefined) {
        queryOptions.approved = approved === 'true';
      }

      const services = await storage.getServiceProviders(queryOptions);
      
      // Ensure we return an array with proper error handling
      if (!Array.isArray(services)) {
        console.error("Service providers query returned non-array:", services);
        return res.status(500).json({ 
          message: "Invalid data format from database",
          services: []
        });
      }

      // Validate each service has required fields
      const validatedServices = services.map(service => ({
        id: service.id || '',
        name: service.name || 'Unnamed Service',
        profileImageUrl: service.profileImageUrl || null,
        description: service.description || '',
        location: service.location || '',
        serviceCategory: service.serviceCategory || 'general',
        serviceType: service.serviceType || [],
        tags: service.tags || [],
        priceModel: service.priceModel || 'per_day',
        price: service.price || '0.00',
        availabilityType: service.availabilityType || 'available',
        contactEmail: service.contactEmail || null,
        phoneNumber: service.phoneNumber || null,
        socialLinks: service.socialLinks || {},
        galleryImages: service.galleryImages || [],
        approved: service.approved || false,
        createdBy: service.createdBy || '',
        createdAt: service.createdAt || new Date(),
        updatedAt: service.updatedAt || new Date()
      }));

      res.json(validatedServices);
    } catch (error) {
      console.error("Error fetching service providers:", error);
      res.status(500).json({ 
        message: "Failed to fetch service providers",
        error: error instanceof Error ? error.message : 'Unknown error',
        services: []
      });
    }
  });

  app.get("/api/service-providers/:id", async (req, res) => {
    try {
      const service = await storage.getServiceProvider(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service provider not found" });
      }
      res.json(service);
    } catch (error) {
      console.error("Error fetching service provider:", error);
      res.status(500).json({ message: "Failed to fetch service provider" });
    }
  });

  app.post("/api/service-providers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const serviceData = {
        ...req.body,
        createdBy: userId,
        approved: false,
      };
      
      const service = await storage.createServiceProvider(serviceData);
      res.status(201).json(service);
    } catch (error) {
      console.error("Error creating service provider:", error);
      res.status(500).json({ message: "Failed to create service provider" });
    }
  });

  app.put("/api/service-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await storage.getServiceProvider(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Service provider not found" });
      }

      const isAdmin = await checkIsAdmin(req);
      if (service.createdBy !== userId && !isAdmin) {
        return res.status(403).json({ message: "You don't have permission to edit this service provider profile" });
      }

      const editableFields = { ...(req.body || {}) };
      const requestedApproved = editableFields.approved;
      delete editableFields.id;
      delete editableFields.createdBy;
      delete editableFields.createdAt;
      delete editableFields.updatedAt;
      delete editableFields.approved;

      const updatedService = await storage.updateServiceProvider(req.params.id, {
        ...editableFields,
        createdBy: service.createdBy,
        approved: isAdmin && typeof requestedApproved === "boolean" ? requestedApproved : service.approved,
      });

      res.json(updatedService);
    } catch (error) {
      console.error("Error updating service provider:", error);
      res.status(500).json({ message: "Failed to update service provider" });
    }
  });

  app.patch("/api/service-providers/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      // Add admin check here if needed
      const service = await storage.approveServiceProvider(req.params.id);
      res.json(service);
    } catch (error) {
      console.error("Error approving service provider:", error);
      res.status(500).json({ message: "Failed to approve service provider" });
    }
  });

  app.delete("/api/service-providers/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Add admin check here if needed
      await storage.rejectServiceProvider(req.params.id);
      res.json({ message: "Service provider rejected and deleted" });
    } catch (error) {
      console.error("Error rejecting service provider:", error);
      res.status(500).json({ message: "Failed to reject service provider" });
    }
  });

  // Venue availability routes
  app.get("/api/venues/available", async (req, res) => {
    try {
      const { startDate, endDate, capacity, venueType } = req.query;
      const availableVenues = await storage.getAvailableVenues({
        startDate: startDate as string,
        endDate: endDate as string,
        capacity: capacity ? parseInt(capacity as string) : undefined,
        venueType: venueType as string
      });
      res.json(availableVenues);
    } catch (error) {
      console.error('Error fetching available venues:', error);
      res.status(500).json({ message: 'Failed to fetch available venues' });
    }
  });

  // Service availability routes
  app.get("/api/services/available", async (req, res) => {
    try {
      const { startDate, endDate, category, location } = req.query;
      const availableServices = await storage.getAvailableServices({
        startDate: startDate as string,
        endDate: endDate as string,
        category: category as string,
        location: location as string
      });
      res.json(availableServices);
    } catch (error) {
      console.error('Error fetching available services:', error);
      res.status(500).json({ message: 'Failed to fetch available services' });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      const services = await storage.getAllServicesWithProviders();
      res.json(services);
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({ message: 'Failed to fetch services' });
    }
  });

  // Experience venue/service assignment routes
  app.post("/api/experiences/:id/venues", isAuthenticated, async (req: any, res) => {
    try {
      const assignment = await storage.assignVenueToExperience({
        experienceId: req.params.id,
        venueId: req.body.venueId,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning venue:", error);
      res.status(500).json({ message: "Failed to assign venue" });
    }
  });

  app.post("/api/experiences/:id/services", isAuthenticated, async (req: any, res) => {
    try {
      const assignment = await storage.assignServiceToExperience({
        experienceId: req.params.id,
        serviceId: req.body.serviceId,
        roleDescription: req.body.roleDescription,
      });
      res.json(assignment);
    } catch (error) {
      console.error("Error assigning service:", error);
      res.status(500).json({ message: "Failed to assign service" });
    }
  });

  // Participant interaction routes
  app.post("/api/participant-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connection = await storage.createParticipantConnection({
        ...req.body,
        userId,
      });
      res.json(connection);
    } catch (error) {
      console.error("Error creating connection:", error);
      res.status(500).json({ message: "Failed to create connection" });
    }
  });

  app.get("/api/participant-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.query;
      const connections = await storage.getUserConnections(userId);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ message: "Failed to fetch connections" });
    }
  });

  app.patch("/api/participant-connections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { status } = req.body;
      const connection = await storage.updateConnectionStatus(req.params.id, status);
      res.json(connection);
    } catch (error) {
      console.error("Error updating connection:", error);
      res.status(500).json({ message: "Failed to update connection" });
    }
  });

  // Messaging routes
  app.post("/api/experiences/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (!(await canAccessExperienceChat(userId, req.params.id))) {
        return res.status(403).json({ message: "A valid booking is required to access this event chat" });
      }
      const body = String(req.body.message ?? req.body.content ?? "").trim();
      if (!body || body.length > 2000) {
        return res.status(400).json({ message: "Message must be between 1 and 2000 characters" });
      }
      const recipientId = req.body.recipientId ? String(req.body.recipientId) : null;
      if (recipientId && !(await canAccessExperienceChat(recipientId, req.params.id))) {
        return res.status(400).json({ message: "Recipient is not a member of this event chat" });
      }
      const message = await storage.createMessage({
        experienceId: req.params.id,
        userId,
        message: body,
        messageType: req.body.messageType || "text",
        isPrivate: !!recipientId,
        recipientId,
      });
      broadcastChatMessage(req.params.id, message);
      scheduleHubUnreadEmailNotifications(req.params.id, userId).catch((error) => {
        console.error("Error scheduling unread hub emails:", error);
      });
      scheduleCreatorHubNudge(req.params.id, userId, !!recipientId).catch((error) => {
        console.error("Error scheduling creator hub nudge:", error);
      });
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.get("/api/experiences/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId || !(await canAccessExperienceChat(userId, req.params.id))) {
        return res.status(403).json({ message: "A valid booking is required to access this event chat" });
      }
      const messages = await storage.getMessages(req.params.id);
      res.json(messages.filter((message: any) =>
        !message.isPrivate || message.userId === userId || message.recipientId === userId
      ).reverse());
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/experiences/:id/messages/preview", async (req, res) => {
    try {
      const preview = await db
        .select({
          id: experienceMessages.id,
          message: experienceMessages.message,
          createdAt: experienceMessages.createdAt,
          firstName: users.firstName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(experienceMessages)
        .leftJoin(users, eq(experienceMessages.userId, users.id))
        .where(and(eq(experienceMessages.experienceId, req.params.id), eq(experienceMessages.isPrivate, false)))
        .orderBy(desc(experienceMessages.createdAt))
        .limit(3);
      res.json(preview.reverse());
    } catch (error) {
      console.error("Error fetching chat preview:", error);
      res.status(500).json({ message: "Failed to fetch chat preview" });
    }
  });

  app.get("/api/experiences/:id/social-proof-live", async (req, res) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rows = await db.select({
        firstName: users.firstName,
        location: participantProfiles.location,
        profileVisibility: participantProfiles.profileVisibility,
        bookedAt: bookings.bookingDate,
      }).from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .leftJoin(participantProfiles, eq(bookings.userId, participantProfiles.userId))
        .where(and(
          eq(bookings.experienceId, req.params.id),
          inArray(bookings.status, ["pending", "deposit_authorized", "deposit_paid", "confirmed", "fully_paid"]),
          gt(bookings.bookingDate, since),
        ))
        .orderBy(desc(bookings.bookingDate))
        .limit(5);
      res.json({
        recentReservations: rows.map(row => ({
          firstName: row.firstName || "Someone",
          location: row.profileVisibility === "Public" ? row.location : null,
          bookedAt: row.bookedAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching live social proof:", error);
      res.status(500).json({ message: "Failed to fetch live social proof" });
    }
  });

  app.post("/api/experiences/:id/messages/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId || !(await canAccessExperienceChat(userId, req.params.id))) {
        return res.status(403).json({ message: "Chat access denied" });
      }
      const now = new Date();
      await db.insert(experienceChatReads).values({ experienceId: req.params.id, userId, lastReadAt: now })
        .onConflictDoUpdate({
          target: [experienceChatReads.experienceId, experienceChatReads.userId],
          set: { lastReadAt: now, updatedAt: now },
        });
      res.json({ success: true, lastReadAt: now });
    } catch (error) {
      console.error("Error marking chat read:", error);
      res.status(500).json({ message: "Failed to mark chat read" });
    }
  });

  app.get("/api/messages/inbox", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(userId);
      const userBookings = await storage.getUserBookings(userId);
      const eventIds = new Set(
        userBookings.filter((b) => activeChatBookingStatuses.includes(b.status as any)).map((b) => b.experienceId)
      );
      if (user?.role === "creator") {
        const owned = await storage.getExperiencesByCreator(userId);
        owned.forEach((experience) => eventIds.add(experience.id));
      }
      const ids = Array.from(eventIds);
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const pageSize = Math.min(50, Math.max(5, Number.parseInt(String(req.query.pageSize || "10"), 10) || 10));
      if (!ids.length) return res.json({ conversations: [], unreadCount: 0, pagination: { page, pageSize, total: 0, totalPages: 1 } });

      const [eventRows, messages, reads] = await Promise.all([
        db.select().from(experiences).where(inArray(experiences.id, ids)),
        db.select().from(experienceMessages).where(inArray(experienceMessages.experienceId, ids)).orderBy(desc(experienceMessages.createdAt)),
        db.select().from(experienceChatReads).where(and(eq(experienceChatReads.userId, userId), inArray(experienceChatReads.experienceId, ids))),
      ]);
      const readMap = new Map(reads.map((read) => [read.experienceId, read.lastReadAt]));
      const conversations = eventRows.map((experience: any) => {
        const visible = messages.filter((message) => message.experienceId === experience.id &&
          (!message.isPrivate || message.userId === userId || message.recipientId === userId));
        const lastReadAt = readMap.get(experience.id);
        const unreadCount = visible.filter((message) => message.userId !== userId &&
          (!lastReadAt || (message.createdAt && message.createdAt > lastReadAt))).length;
        return {
          experienceId: experience.id,
          title: experience.title,
          coverImageUrl: experience.coverImageUrl,
          location: experience.location,
          lastMessage: visible[0]?.message ?? null,
          lastMessageAt: visible[0]?.createdAt ?? null,
          unreadCount,
        };
      }).sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      const total = conversations.length;
      res.json({
        conversations: conversations.slice((page - 1) * pageSize, page * pageSize),
        unreadCount: conversations.reduce((sum, item) => sum + item.unreadCount, 0),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      });
    } catch (error) {
      console.error("Error fetching inbox:", error);
      res.status(500).json({ message: "Failed to fetch inbox" });
    }
  });

  // Participant profiles
  app.get("/api/participant-profile/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profile = await storage.getProfile(userId);
      res.json({
        hasProfile: !!profile,
        profile: profile || null,
      });
    } catch (error) {
      console.error("Error checking participant profile status:", error);
      res.status(500).json({ message: "Failed to check profile status" });
    }
  });

  app.post("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      // Repair inline base64 avatars from older clients before they reach the DB.
      const body = await persistInlineImageFields(req.body || {}, ["avatarUrl"], userId);
      const validatedData = insertParticipantProfileSchema.parse({
        ...body,
        userId,
      });
      const profile = await storage.createOrUpdateProfile(validatedData);
      res.json(profile);
    } catch (error: any) {
      console.error("Error creating/updating profile:", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({
          message: "Invalid profile data",
          errors: error.errors,
        });
      }
      res.status(500).json({ message: "Failed to create/update profile" });
    }
  });

  app.get("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.get("/api/experiences/:id/participants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const experienceId = req.params.id;
      
      const profiles = await storage.getProfilesByExperience(experienceId, userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching participant profiles:", error);
      
      // Handle specific authorization error for private participant lists
      if (error instanceof Error && error.message === "UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST") {
        return res.status(403).json({ 
          message: "Participant list is private",
          error: "UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST"
        });
      }
      
      if (error instanceof Error && error.message === "Experience not found") {
        return res.status(404).json({ message: "Experience not found" });
      }
      
      res.status(500).json({ message: "Failed to fetch participant profiles" });
    }
  });

  // Creator profile routes
  app.get("/api/creator-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      const profile = await storage.getCreatorProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Creator profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching creator profile:", error);
      res.status(500).json({ message: "Failed to fetch creator profile" });
    }
  });

  app.post("/api/creator-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }
      
      // Validate request body with schema (userId already excluded from schema)
      const validation = insertCreatorProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid profile data", 
          errors: validation.error.issues 
        });
      }
      
      const profile = await storage.createOrUpdateCreatorProfile(userId, validation.data);
      res.json(profile);
    } catch (error) {
      console.error("Error saving creator profile:", error);
      res.status(500).json({ message: "Failed to save creator profile" });
    }
  });

  app.get("/api/creator/experiences", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const experiences = await storage.getExperiencesByCreator(creatorId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        experiences.map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator experiences:", error);
      res.status(500).json({ message: "Failed to fetch creator experiences" });
    }
  });

  app.patch("/api/creator/experiences/:id/archive", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const experience = await storage.getExperience(req.params.id);
      if (!experience || experience.creatorId !== creatorId) {
        return res.status(404).json({ message: "Experience not found" });
      }
      const archived = await storage.archiveExperience(
        experience.id,
        creatorId,
        req.body?.reason || "Archived by creator",
      );
      res.json(archived);
    } catch (error) {
      console.error("Error archiving creator experience:", error);
      res.status(500).json({ message: "Failed to archive experience" });
    }
  });

  // Backward-compatible endpoint for older creator dashboard builds. This is a
  // soft archive so bookings, payouts, and contract history remain auditable.
  app.delete("/api/experiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const experience = await storage.getExperience(req.params.id);
      if (!experience || experience.creatorId !== creatorId) {
        return res.status(404).json({ message: "Experience not found" });
      }
      res.json(await storage.archiveExperience(experience.id, creatorId, "Archived by creator"));
    } catch (error) {
      console.error("Error archiving creator experience:", error);
      res.status(500).json({ message: "Failed to archive experience" });
    }
  });

  // GET /api/creator/community — everyone who has ever booked or RSVP'd to one
  // of this creator's events, collapsed to one row per person.
  //
  // Most creators on the platform have no CRM of their own, so this is where
  // their audience lives. It is deliberately built from bookings rather than
  // from a separate membership table: the list is then always true, and nobody
  // has to remember to add anyone to it.
  app.get("/api/creator/community", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = resolveCurrentUserId(req);
      if (!creatorId) return res.status(401).json({ message: "Unauthorized" });

      const bookings = await storage.getBookingsByCreator(creatorId);
      if (!bookings.length) {
        return res.json({ members: [], totals: { members: 0, bookings: 0, repeat: 0 } });
      }

      const userIds = Array.from(new Set(bookings.map((booking: any) => booking.userId).filter(Boolean)));
      const people = userIds.length
        ? await db.select().from(users).where(inArray(users.id, userIds))
        : [];
      const personById = new Map(people.map((person: any) => [person.id, person]));

      // A cancelled booking still means the person came into the creator's
      // orbit, so they stay in the community — but their spend does not count.
      const countsAsAttending = (status: string | null) =>
        status === "confirmed" || status === "deposit_paid" || status === "fully_paid";

      const byUser = new Map<string, any>();
      for (const booking of bookings) {
        if (!booking.userId) continue;
        const person = personById.get(booking.userId);
        const existing = byUser.get(booking.userId) ?? {
          userId: booking.userId,
          name: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || null,
          email: person?.email ?? null,
          avatarUrl: person?.profileImageUrl ?? null,
          joinedAt: person?.createdAt ?? null,
          eventCount: 0,
          bookingCount: 0,
          totalSpend: 0,
          currency: booking.experience?.currency || "eur",
          lastEventTitle: null as string | null,
          lastEventDate: null as Date | null,
          events: [] as string[],
          referredCount: 0,
        };

        existing.bookingCount += 1;
        if (countsAsAttending(booking.status)) {
          existing.totalSpend += numberOrZero(booking.amount);
        }
        if (booking.experienceId && !existing.events.includes(booking.experienceId)) {
          existing.events.push(booking.experienceId);
          existing.eventCount = existing.events.length;
        }

        const startDate = booking.experience?.startDate ? new Date(booking.experience.startDate) : null;
        if (startDate && (!existing.lastEventDate || startDate > existing.lastEventDate)) {
          existing.lastEventDate = startDate;
          existing.lastEventTitle = booking.experience?.title ?? null;
        }

        byUser.set(booking.userId, existing);
      }

      // Someone who brought other people is the creator's most valuable
      // contact, so the tab has to be able to show that.
      for (const booking of bookings) {
        if (!booking.promoterId) continue;
        const promoter = byUser.get(booking.promoterId);
        if (promoter) promoter.referredCount += 1;
      }

      const members = Array.from(byUser.values())
        .map((member) => ({
          ...member,
          lastEventDate: member.lastEventDate ? member.lastEventDate.toISOString() : null,
        }))
        .sort((a, b) => (b.eventCount - a.eventCount) || (b.totalSpend - a.totalSpend));

      res.json({
        members,
        totals: {
          members: members.length,
          bookings: bookings.length,
          repeat: members.filter((member) => member.eventCount > 1).length,
        },
      });
    } catch (error) {
      console.error("Error fetching creator community:", error);
      res.status(500).json({ message: "Failed to fetch community" });
    }
  });

  // GET /api/creator/headcount — how many people are actually coming, and what
  // they paid, per event and in total.
  //
  // The only place a true head count existed was the public event page, which
  // recomputes it from live bookings. The dashboard read stale columns, so a
  // creator could not answer "how many are coming and how much have I taken?"
  // without opening their own listing. Same source as the public page here, so
  // the two cannot disagree.
  app.get("/api/creator/headcount", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = resolveCurrentUserId(req);
      if (!creatorId) return res.status(401).json({ message: "Unauthorized" });

      const owned = await storage.getExperiencesByCreator(creatorId);
      if (!owned.length) {
        return res.json({
          events: [],
          totals: { rsvps: 0, ticketsSold: 0, attendees: 0, donations: 0, grossRevenue: 0, currency: "eur" },
        });
      }

      const events = await Promise.all(owned.map(async (experience: any) => {
        const all = await storage.getBookingsByExperience(experience.id);
        const active = (all || []).filter((booking: any) => isActiveParticipantBooking(booking.status));

        const skus: any[] = Array.isArray(experience.ticketSkus) ? experience.ticketSkus : [];
        const skuById = new Map(skus.map((sku: any) => [sku.id, sku]));

        let rsvps = 0;
        let ticketsSold = 0;
        let donations = 0;
        let grossRevenue = 0;

        for (const booking of active) {
          const quantity = normalizeTicketQuantity(booking.ticketQuantity);
          const sku = booking.ticketSkuId ? skuById.get(booking.ticketSkuId) : undefined;
          const paid = numberOrZero(booking.amount);
          grossRevenue += paid;

          // A free RSVP is a head, not a sale. Counting the two together is
          // what made the dashboard's single "bookings" number meaningless for
          // an organiser running free community runs alongside paid workshops.
          const mode = sku?.pricingMode
            ?? (numberOrZero(sku?.pricePerPerson) === 0 && sku ? "free_rsvp" : "fixed");

          if (mode === "free_rsvp") {
            rsvps += quantity;
            // Someone who chose to pay on a free ticket has donated.
            if (paid > 0) donations += paid;
          } else if (mode === "pwyw") {
            ticketsSold += quantity;
            donations += paid;
          } else {
            ticketsSold += quantity;
          }
        }

        return {
          id: experience.id,
          title: experience.title,
          status: experience.status,
          startDate: experience.startDate,
          currency: (experience.currency || "eur").toLowerCase(),
          capacity: experience.maxParticipants ?? null,
          minimumParticipants: experience.mvgEnabled
            ? (experience.minimumParticipants ?? experience.mvgMin ?? null)
            : null,
          rsvps,
          ticketsSold,
          attendees: rsvps + ticketsSold,
          donations,
          grossRevenue,
        };
      }));

      // Currency is per event, so a total only means something when they agree.
      const currencies = Array.from(new Set(events.map((event) => event.currency)));
      const totals = events.reduce((sum, event) => ({
        rsvps: sum.rsvps + event.rsvps,
        ticketsSold: sum.ticketsSold + event.ticketsSold,
        attendees: sum.attendees + event.attendees,
        donations: sum.donations + event.donations,
        grossRevenue: sum.grossRevenue + event.grossRevenue,
        currency: sum.currency,
      }), { rsvps: 0, ticketsSold: 0, attendees: 0, donations: 0, grossRevenue: 0, currency: currencies[0] || "eur" });

      res.json({
        events: events.sort((a, b) =>
          new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime()),
        totals,
        mixedCurrencies: currencies.length > 1,
      });
    } catch (error) {
      console.error("Error fetching creator headcount:", error);
      res.status(500).json({ message: "Failed to fetch headcount" });
    }
  });

  // Real creator analytics. This previously returned the raw experiences array, so
  // every metric on the dashboard resolved to undefined and rendered as a fake "0".
  // Only metrics we actually track are returned — no fabricated numbers.
  app.get("/api/creator/analytics/:period", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const experiences = await storage.getExperiencesByCreator(creatorId);

      const perExperience = await Promise.all(
        (experiences || []).map(async (experience: any) => {
          const experienceBookings = await storage.getBookingsByExperience(experience.id);
          const active = (experienceBookings || []).filter((booking: any) =>
            isActiveParticipantBooking(booking.status));
          return {
            id: experience.id,
            title: experience.title,
            status: experience.status,
            bookings: sumBookingTicketQuantity(active),
            confirmed: sumBookingTicketQuantity(
              (experienceBookings || []).filter((booking: any) =>
                booking.status === "confirmed" || booking.status === "fully_paid"),
            ),
          };
        }),
      );

      const totalBookings = perExperience.reduce((sum, row) => sum + row.bookings, 0);
      const confirmedBookings = perExperience.reduce((sum, row) => sum + row.confirmed, 0);

      res.json({
        totalExperiences: perExperience.length,
        publishedExperiences: perExperience.filter((row) => row.status === "approved").length,
        totalBookings,
        confirmedBookings,
        topExperiences: perExperience
          .filter((row) => row.bookings > 0)
          .sort((left, right) => right.bookings - left.bookings)
          .slice(0, 5),
      });
    } catch (error) {
      console.error("Error fetching creator analytics:", error);
      res.status(500).json({ message: "Failed to fetch creator analytics" });
    }
  });

  /**
   * Real money for the creator dashboard, computed from booking rows.
   *
   * Both the header ledger strip and the revenue cards read this, so they can no
   * longer disagree the way they did when one came from a zero stub and the
   * other summed every booking (cancellations included) in dollars.
   */
  async function getCreatorEarningsBreakdown(creatorId: string) {
    const creatorBookings = await storage.getBookingsByCreator(creatorId);
    // Platform fee comes from the database, never a constant.
    const [settings] = await db.select().from(platformSettings).limit(1);
    const defaultPlatformFeePct = parseFloat(
      settings?.platformFeePercentage?.toString() ?? String(FIXED_PLATFORM_FEE_PCT),
    );
    return summarizeCreatorEarnings(creatorBookings, { defaultPlatformFeePct });
  }

  app.get("/api/creator/earnings/:period", isAuthenticated, async (req: any, res) => {
    try {
      const { summary, byExperience } = await getCreatorEarningsBreakdown(req.user.claims.sub);
      res.json({
        summary,
        byExperience,
        period: Number.parseInt(req.params.period, 10) || 30,
      });
    } catch (error) {
      console.error("Error fetching creator earnings:", error);
      res.status(500).json({ message: "Failed to fetch creator earnings" });
    }
  });

  // Announcements
  app.post("/api/experiences/:id/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const creatorId = req.user.claims.sub;
      const announcement = await storage.createAnnouncement({
        ...req.body,
        experienceId: req.params.id,
        creatorId,
      });
      res.json(announcement);
    } catch (error) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.get("/api/experiences/:id/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const announcements = await storage.getAnnouncements(req.params.id);
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // Message reactions
  app.post("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reaction = await storage.createReaction({
        messageId: req.params.id,
        userId,
        reactionType: req.body.reactionType,
      });
      res.json(reaction);
    } catch (error) {
      console.error("Error creating reaction:", error);
      res.status(500).json({ message: "Failed to create reaction" });
    }
  });

  app.get("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const reactions = await storage.getReactions(req.params.id);
      res.json(reactions);
    } catch (error) {
      console.error("Error fetching reactions:", error);
      res.status(500).json({ message: "Failed to fetch reactions" });
    }
  });

  app.delete("/api/messages/:id/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      await storage.removeReaction(req.params.id);
      res.json({ message: "Reaction removed" });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ message: "Failed to remove reaction" });
    }
  });

  // Get community profiles
  app.get("/api/community/profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching community profiles:", error);
      res.status(500).json({ error: "Failed to fetch community profiles" });
    }
  });

  app.put("/api/participant-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const body = await persistInlineImageFields(req.body || {}, ["avatarUrl"], userId);
      const validatedData = insertParticipantProfileSchema.partial().parse(body);
      const profile = await storage.updateParticipantProfile(userId, validatedData);
      res.json(profile);
    } catch (error) {
      console.error("Error updating participant profile:", error);
      res.status(500).json({ message: "Failed to update participant profile" });
    }
  });

  app.get("/api/participant-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching participant profiles:", error);
      res.status(500).json({ message: "Failed to fetch participant profiles" });
    }
  });

  // Participant roles routes for creator-defined roles
  app.post("/api/experiences/:experienceId/participant-roles", isAuthenticated, async (req: any, res) => {
    try {
      const { experienceId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify user is the creator of this experience
      const experience = await storage.getExperience(experienceId);
      if (!experience || experience.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can define participant roles" });
      }
      
      const roleData = {
        ...req.body,
        experienceId,
        currentCount: 0
      };
      
      const role = await storage.createParticipantRole(roleData);
      res.status(201).json(role);
    } catch (error: any) {
      console.error("Error creating participant role:", error);
      res.status(500).json({ message: "Failed to create participant role" });
    }
  });

  app.get("/api/experiences/:experienceId/participant-roles", async (req, res) => {
    try {
      const { experienceId } = req.params;
      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });
      const roles = await syncBuilderParticipantRoles(experience);
      res.json(roles);
    } catch (error: any) {
      console.error("Error fetching participant roles:", error);
      res.status(500).json({ message: "Failed to fetch participant roles" });
    }
  });

  app.post("/api/experiences/:experienceId/role-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { experienceId } = req.params;
      const { roleId } = req.body;
      const userId = req.user.claims.sub;

      if (!roleId) return res.status(400).json({ message: "roleId is required" });

      const [experience, role] = await Promise.all([
        storage.getExperience(experienceId),
        storage.getParticipantRole(roleId),
      ]);
      if (!experience) return res.status(404).json({ message: "Experience not found" });
      if (!role || role.experienceId !== experienceId) {
        return res.status(404).json({ message: "Role not found for this experience" });
      }
      const existingAssignment = await storage.getParticipantRoleAssignment(roleId, userId);
      const blockReason = getRoleApplicationBlockReason({
        creatorId: experience.creatorId,
        applicantId: userId,
        experienceStatus: experience.status,
        currentCount: role.currentCount,
        maxCount: role.maxCount,
        existingStatus: existingAssignment?.status,
      });
      if (blockReason) {
        return res.status(409).json({ message: blockReason, assignment: existingAssignment });
      }
      
      const assignmentData = {
        roleId,
        userId,
        experienceId,
        status: "pending" as const,
        appliedAt: new Date()
      };
      
      const assignment = await storage.assignParticipantRole(assignmentData);

      notificationService.sendRoleApplicationReceivedEmail({
        assignmentId: assignment.id,
        creatorId: experience.creatorId,
        applicantId: userId,
        experience,
        roleName: role.name,
      }).catch((error) => console.error("Role application notification failed:", error?.message || error));

      notificationService.sendRoleApplicationConfirmationEmail({
        assignmentId: assignment.id,
        applicantId: userId,
        experience,
        roleName: role.name,
      }).catch((error) => console.error("Role application confirmation failed:", error?.message || error));

      res.status(201).json(assignment);
    } catch (error: any) {
      console.error("Error applying for participant role:", error);
      res.status(500).json({ message: "Failed to apply for role" });
    }
  });

  app.get("/api/experiences/:experienceId/role-assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { experienceId } = req.params;
      const userId = req.user.claims.sub;
      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: "Experience not found" });
      const assignments = await storage.getParticipantRoleAssignments(experienceId);
      res.json(experience.creatorId === userId
        ? assignments
        : assignments.filter((assignment: any) => assignment.userId === userId));
    } catch (error: any) {
      console.error("Error fetching role assignments:", error);
      res.status(500).json({ message: "Failed to fetch role assignments" });
    }
  });

  app.get("/api/community/role-opportunities", isAuthenticated, async (req: any, res) => {
    try {
      const activeExperiences = await db
        .select()
        .from(experiences)
        .where(inArray(experiences.status, ["approved", "published"]));
      await Promise.all(activeExperiences.map(syncBuilderParticipantRoles));
      const opportunities = await storage.getParticipantRoleOpportunities(req.user.claims.sub);
      res.json(opportunities);
    } catch (error: any) {
      console.error("Error fetching role opportunities:", error);
      res.status(500).json({ message: "Failed to fetch role opportunities" });
    }
  });

  app.get("/api/participant/role-applications", isAuthenticated, async (req: any, res) => {
    try {
      const applications = await storage.getParticipantRoleApplicationsForUser(req.user.claims.sub);
      res.json(applications);
    } catch (error: any) {
      console.error("Error fetching participant role applications:", error);
      res.status(500).json({ message: "Failed to fetch your role applications" });
    }
  });

  app.get("/api/creator/role-applications", isAuthenticated, async (req: any, res) => {
    try {
      const applications = await storage.getParticipantRoleApplicationsForCreator(req.user.claims.sub);
      res.json(applications);
    } catch (error: any) {
      console.error("Error fetching creator role applications:", error);
      res.status(500).json({ message: "Failed to fetch role applications" });
    }
  });

  app.get("/api/creator/approved-roles", isAuthenticated, async (req: any, res) => {
    try {
      const approvedRoles = await storage.getApprovedParticipantRolesForCreator(req.user.claims.sub);
      res.json(approvedRoles);
    } catch (error: any) {
      console.error("Error fetching creator approved roles:", error);
      res.status(500).json({ message: "Failed to fetch approved roles" });
    }
  });

  app.post("/api/creator/role-applications/:assignmentId/:action", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId, action } = req.params;
      if (action !== "approve" && action !== "decline") {
        return res.status(400).json({ message: "Action must be approve or decline" });
      }

      const assignment = await storage.getParticipantRoleAssignmentById(assignmentId);
      if (!assignment) return res.status(404).json({ message: "Role application not found" });

      const [experience, role] = await Promise.all([
        storage.getExperience(assignment.experienceId),
        storage.getParticipantRole(assignment.roleId),
      ]);
      if (!experience || experience.creatorId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Only the experience creator can resolve this application" });
      }
      if (!role) return res.status(404).json({ message: "Role not found" });

      let resolved;
      try {
        resolved = await storage.resolveParticipantRoleAssignment(
          assignmentId,
          action === "approve" ? "confirmed" : "declined",
        );
      } catch (error: any) {
        if (error.message === "ROLE_IS_FULL") {
          return res.status(409).json({ message: "This role is already full" });
        }
        if (error.message === "ROLE_APPLICATION_ALREADY_RESOLVED") {
          return res.status(409).json({ message: "This application has already been resolved" });
        }
        throw error;
      }

      notificationService.sendRoleApplicationResolvedEmail({
        assignmentId: assignment.id,
        applicantId: assignment.userId,
        experience,
        roleName: role.name,
        status: action === "approve" ? "confirmed" : "declined",
      }).catch((error) => console.error("Role resolution notification failed:", error?.message || error));

      res.json(resolved);
    } catch (error: any) {
      console.error("Error resolving role application:", error);
      res.status(500).json({ message: "Failed to resolve role application" });
    }
  });

  app.get("/api/experiences/:experienceId/participants-with-skills", async (req, res) => {
    try {
      const { experienceId } = req.params;
      const participants = await storage.getParticipantsWithSkillsAndRoles(experienceId);
      res.json(participants);
    } catch (error: any) {
      console.error("Error fetching participants with skills:", error);
      res.status(500).json({ message: "Failed to fetch participants with skills" });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // AI Itinerary Generation Endpoint
  app.post('/api/generate-itinerary', async (req, res) => {
    try {
      const { title, startDate, endDate, experienceType, category, location, customPrompt } = req.body;
      
      if (!title || !startDate || !endDate || !location) {
        return res.status(400).json({ error: "Missing required fields: title, startDate, endDate, location" });
      }
      
      // Generate AI-powered itinerary using OpenAI
      const itinerary = await generateItinerary(
        title,
        new Date(startDate),
        new Date(endDate),
        experienceType,
        category,
        location,
        customPrompt
      );
      
      res.json({
        itinerary,
        message: "AI itinerary generated successfully"
      });
    } catch (error) {
      console.error("Error generating AI itinerary:", error);
      res.status(500).json({ error: "Failed to generate itinerary. Please try again." });
    }
  });

  // Seed sample participant profiles
  app.post("/api/seed-profiles", async (req, res) => {
    try {
      const sampleProfiles = [
        {
          userId: "sample-user-1",
          displayName: "Maya Rodriguez",
          bio: "Digital nomad and wellness coach passionate about mindful travel and sustainable living. I love connecting with nature and helping others find balance in their lives.",
          location: "Lisbon, Portugal",
          interests: ["Yoga", "Meditation", "Sustainable Travel", "Digital Marketing", "Mindfulness"],
          experienceLevel: "Experienced",
          travelStyle: ["Adventure", "Wellness", "Cultural Immersion"],
          fitnessLevel: "Active",
          occupation: "Wellness Coach & Content Creator",
          skills: ["Yoga Instruction", "Content Creation", "Community Building", "Digital Marketing", "Portuguese"],
          willingToTakeRoles: true,
          rolePreferences: ["Wellness Guide", "Community Facilitator", "Content Coordinator"],
          languages: ["English", "Spanish", "Portuguese"],
          professionalInterests: ["Health & Wellness", "Digital Marketing", "Sustainable Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegetarian", "Organic"],
          emergencyContact: "Carlos Rodriguez (Brother) - +34 123 456 789"
        },
        {
          userId: "sample-user-2", 
          displayName: "Alex Chen",
          bio: "Software engineer turned adventure photographer. I capture stories through my lens while exploring remote destinations. Always up for adrenaline-pumping activities and meeting fellow adventurers.",
          location: "Vancouver, Canada",
          interests: ["Photography", "Rock Climbing", "Hiking", "Technology", "Adventure Sports"],
          experienceLevel: "Expert",
          travelStyle: ["Adventure", "Photography", "Off-the-beaten-path"],
          fitnessLevel: "Very Active",
          occupation: "Adventure Photographer & Software Engineer",
          skills: ["Photography", "Rock Climbing", "Software Development", "Drone Operation", "Video Editing"],
          willingToTakeRoles: true,
          rolePreferences: ["Photographer", "Technical Support", "Safety Coordinator"],
          languages: ["English", "Mandarin", "French"],
          professionalInterests: ["Photography", "Technology", "Adventure Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["No restrictions"],
          emergencyContact: "Linda Chen (Mother) - +1 604 123 4567"
        },
        {
          userId: "sample-user-3",
          displayName: "Sofia Andersson",
          bio: "Sustainability consultant and permaculture enthusiast from Sweden. I organize eco-conscious retreats and love sharing knowledge about regenerative living practices.",
          location: "Stockholm, Sweden", 
          interests: ["Permaculture", "Sustainability", "Organic Farming", "Climate Action", "Community Building"],
          experienceLevel: "Expert",
          travelStyle: ["Eco-conscious", "Educational", "Community-focused"],
          fitnessLevel: "Moderate",
          occupation: "Sustainability Consultant",
          skills: ["Permaculture Design", "Project Management", "Environmental Consulting", "Workshop Facilitation", "Swedish"],
          willingToTakeRoles: true,
          rolePreferences: ["Sustainability Educator", "Workshop Facilitator", "Project Coordinator"],
          languages: ["Swedish", "English", "German", "Danish"],
          professionalInterests: ["Environmental Consulting", "Sustainable Agriculture", "Climate Solutions"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegan", "Organic", "Local sourcing"],
          emergencyContact: "Erik Andersson (Father) - +46 70 123 4567"
        },
        {
          userId: "sample-user-4",
          displayName: "Raj Patel",
          bio: "Executive chef and culinary storyteller exploring global food cultures. I create immersive culinary experiences that connect people through authentic flavors and traditions.",
          location: "Mumbai, India",
          interests: ["Culinary Arts", "Food Culture", "Travel", "Storytelling", "Cultural Exchange"],
          experienceLevel: "Expert", 
          travelStyle: ["Culinary", "Cultural", "Local experiences"],
          fitnessLevel: "Moderate",
          occupation: "Executive Chef & Culinary Consultant",
          skills: ["Culinary Arts", "Menu Development", "Food Safety", "Cultural Research", "Hindi"],
          willingToTakeRoles: true,
          rolePreferences: ["Chef", "Cultural Guide", "Experience Curator"],
          languages: ["Hindi", "English", "Gujarati", "French"],
          professionalInterests: ["Culinary Arts", "Food Tourism", "Cultural Preservation"],
          profileVisibility: "Public", 
          contactMethod: "In-App Messaging",
          dietaryPreferences: ["Vegetarian"],
          emergencyContact: "Priya Patel (Wife) - +91 98765 43210"
        },
        {
          userId: "sample-user-5",
          displayName: "Emma Thompson",
          bio: "Former corporate lawyer who traded boardrooms for beaches. Now I lead mindfulness retreats and help others find work-life balance. Passionate about mental health and personal growth.",
          location: "Byron Bay, Australia",
          interests: ["Mindfulness", "Personal Development", "Surfing", "Writing", "Mental Health"],
          experienceLevel: "Intermediate",
          travelStyle: ["Wellness", "Mindfulness", "Beach destinations"],
          fitnessLevel: "Active",
          occupation: "Mindfulness Coach & Former Lawyer",
          skills: ["Mindfulness Coaching", "Legal Consulting", "Workshop Design", "Public Speaking", "Surfing"],
          willingToTakeRoles: true,
          rolePreferences: ["Mindfulness Guide", "Workshop Facilitator", "Wellness Coordinator"],
          languages: ["English"],
          professionalInterests: ["Mental Health", "Personal Development", "Wellness Tourism"],
          profileVisibility: "Public",
          contactMethod: "In-App Messaging", 
          dietaryPreferences: ["Gluten-free", "Pescatarian"],
          emergencyContact: "James Thompson (Partner) - +61 412 345 678"
        }
      ];

      // Create sample users first if they don't exist
      for (const profile of sampleProfiles) {
        try {
          await storage.upsertUser({
            id: profile.userId,
            email: `${profile.displayName.toLowerCase().replace(' ', '.')}@example.com`,
            firstName: profile.displayName.split(' ')[0],
            lastName: profile.displayName.split(' ')[1],
          });
        } catch (error) {
          console.log(`User ${profile.userId} might already exist`);
        }
      }

      // Create participant profiles
      const createdProfiles = [];
      for (const profileData of sampleProfiles) {
        try {
          const profile = await storage.createParticipantProfile(profileData);
          createdProfiles.push(profile);
        } catch (error) {
          console.log(`Profile for ${profileData.displayName} might already exist`);
        }
      }

      res.json({ 
        message: "Sample profiles seeded successfully",
        profilesCreated: createdProfiles.length 
      });
    } catch (error) {
      console.error("Error seeding profiles:", error);
      res.status(500).json({ message: "Failed to seed profiles" });
    }
  });

  // Query classification utility function
  function classifyUserQuery(message: string) {
    const query = message.toLowerCase().trim();
    
    // Trip planning keywords (route to AI Travel)
    const tripKeywords = ['trip', 'travel', 'plan', 'itinerary', 'vacation', 'holiday', 'fly', 'hotel', 'accommodation', 'book flight', 'visit', 'go to', 'days in'];
    
    // Experience browsing keywords (route to Experiences)
    const browseKeywords = ['find', 'search', 'look for', 'discover', 'explore', 'show me', 'what is', 'available', 'options', 'list', 'browse'];
    
    // Onboarding/Community keywords (route to Profile Setup) - HIGHEST PRIORITY
    const onboardingKeywords = ['get started', 'i want to get started', 'want to get started', 'sign up', 'onboard', 'new user', 'first time', 'begin my journey', 'start here', 'help me start'];
    const communityKeywords = ['join community', 'connect with people', 'network', 'meet people', 'make friends', 'social', 'members'];
    
    // Creation keywords (route to Journey Builder) - More specific
    const createKeywords = ['create experience', 'create an experience', 'host experience', 'organize experience', 'build experience', 'make experience', 'setup experience', 'launch experience', 'become creator', 'become host', 'start hosting'];
    
    // Venue/Service keywords
    const venueKeywords = ['venue', 'location', 'space', 'rent space', 'list venue', 'add venue'];
    const serviceKeywords = ['service provider', 'offer service', 'provide service', 'freelancer', 'professional service'];
    
    // Category-specific keywords
    const categoryKeywords = {
      retreats: ['retreat', 'wellness', 'meditation', 'yoga', 'spiritual', 'mindfulness'],
      workations: ['workation', 'remote work', 'coworking', 'digital nomad', 'work travel'],
      adventure: ['adventure', 'hiking', 'climbing', 'outdoor', 'extreme', 'sports'],
      workshops: ['workshop', 'learn', 'skill', 'class', 'training', 'course']
    };
    
    console.log("🔍 Classifying query:", query);
    
    // Check for trip planning intent (enhanced detection)
    const tripPlanningPatterns = [
      /\b(?:plan|planning|organize|book|schedule)\s+(?:a\s+)?(?:trip|travel|vacation|holiday|journey)/,
      /\b(?:visit|go\s+to|travel\s+to|trip\s+to)\s+\w+/,
      /\b(?:\d+\s+days?|week|month)\s+(?:in|at|to)\s+\w+/,
      /\b(?:fly|flight|hotel|accommodation|itinerary)/,
      /\b(?:workation|retreat|getaway)\s+(?:in|to|at)\s+\w+/
    ];
    
    const hasDestination = /\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/.test(query);
    const hasTripKeywords = tripKeywords.some(keyword => query.includes(keyword));
    const hasTripPatterns = tripPlanningPatterns.some(pattern => pattern.test(query));
    
    if (hasTripKeywords || hasTripPatterns || hasDestination) {
      console.log("📅 Classified as: TRIP_PLANNING");
      console.log("Trip indicators - Keywords:", hasTripKeywords, "Patterns:", hasTripPatterns, "Destination:", hasDestination);
      
      // Extract destination if found
      const destinationMatch = query.match(/\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
      const destination = destinationMatch ? destinationMatch[1] : null;
      
      return { 
        type: 'trip_planning', 
        confidence: 0.8,
        route: '/ai-travel',
        reasoning: 'Contains trip/travel planning keywords or patterns',
        destination,
        originalQuery: message
      };
    }
    
    // Check for onboarding intent FIRST (highest priority) - use exact phrase matching
    const onboardingMatches = onboardingKeywords.filter(keyword => query.includes(keyword));
    if (onboardingMatches.length > 0) {
      console.log("🚀 Classified as: ONBOARDING (matched:", onboardingMatches, ")");
      return { 
        type: 'onboarding', 
        confidence: 0.95,
        route: '/participant-profile-setup',
        reasoning: `Contains onboarding keywords: ${onboardingMatches.join(', ')}`
      };
    }
    
    // Check for venue intent
    if (venueKeywords.some(keyword => query.includes(keyword))) {
      console.log("🏢 Classified as: VENUE_SETUP");
      return { 
        type: 'venue_setup', 
        confidence: 0.8,
        route: '/venue-profile-setup',
        reasoning: 'Contains venue-related keywords'
      };
    }
    
    // Check for service provider intent
    if (serviceKeywords.some(keyword => query.includes(keyword))) {
      console.log("⚙️ Classified as: SERVICE_SETUP");
      return { 
        type: 'service_setup', 
        confidence: 0.8,
        route: '/service-provider-setup',
        reasoning: 'Contains service provider keywords'
      };
    }
    
    // Check for creation intent
    if (createKeywords.some(keyword => query.includes(keyword))) {
      console.log("🛠️ Classified as: CREATE_EXPERIENCE");
      return { 
        type: 'create_experience', 
        confidence: 0.9,
        route: '/creator',
        reasoning: 'Contains creation/hosting keywords'
      };
    }
    
    // Check for community intent
    if (communityKeywords.some(keyword => query.includes(keyword))) {
      console.log("👥 Classified as: JOIN_COMMUNITY");
      return { 
        type: 'join_community', 
        confidence: 0.8,
        route: '/participant-profile-setup',
        reasoning: 'Contains community/joining keywords'
      };
    }
    
    // Check for category-specific browsing
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => query.includes(keyword))) {
        console.log(`🏷️ Classified as: BROWSE_CATEGORY (${category})`);
        return { 
          type: 'browse_category', 
          category,
          confidence: 0.7,
          route: `/experiences?category=${category}`,
          reasoning: `Contains ${category} category keywords`
        };
      }
    }
    
    // Check for general browsing
    if (browseKeywords.some(keyword => query.includes(keyword))) {
      console.log("🔍 Classified as: BROWSE_EXPERIENCES");
      return { 
        type: 'browse_experiences', 
        confidence: 0.6,
        route: '/experiences',
        reasoning: 'Contains general browsing keywords'
      };
    }
    
    // Default to general browsing for generic queries
    console.log("🎯 Classified as: GENERIC_BROWSE (default)");
    return { 
      type: 'generic_browse', 
      confidence: 0.4,
      route: '/experiences',
      reasoning: 'Generic query - defaulting to experiences page'
    };
  }

  // AI Assistant endpoint
  app.post("/api/ai-assistant", async (req, res) => {
    try {
      const { message, context } = req.body;
      
      console.log("🔍 AI Assistant Query Analysis:");
      console.log("User Query:", message);
      console.log("Context Length:", context?.length || 0);
      
      // Enhanced query classification
      const queryClassification = classifyUserQuery(message);
      console.log("Query Classification:", queryClassification);

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Use OpenAI to understand user intent and provide contextual responses
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are the AI assistant for "Great." - a platform for discovering and creating transformative experiences like retreats, workations, workshops, and adventure trips. 

              Your role is to:
              1. Help users discover and join transformative experiences (retreats, workations, adventures)
              2. Guide experience creation through journey builder and creator tools
              3. Assist with workation planning, group trips, and AI travel itineraries
              4. Connect users with venues, service providers, and community features
              5. Provide navigation to profiles, dashboards, payments, and all platform sections
              6. Be conversational, insightful, and action-oriented
              7. Prioritize platform's own experiences, venues, and partners before suggesting external options

              CRITICAL ROUTING RULES:
              
              1. ONBOARDING INTENT: "get started", "sign up", "new user", "join" → /conversational-profile?type=participant
              2. CREATION INTENT: "create experience", "become host", "start hosting" → /creator  
              3. VENUE INTENT: "list venue", "add location", "rent space" → /venue-profile-setup
              4. SERVICE INTENT: "offer services", "become provider" → /service-provider-setup
              5. BROWSING INTENT: "find", "search", "discover", "what's available" → /experiences
              6. TRIP PLANNING: specific destinations, dates, "plan trip" → /ai-travel
              
              DEFAULT FALLBACK: If intent is unclear or generic, ALWAYS route to /experiences for browsing.
              
              SPECIAL ROUTING BEHAVIORS:
              - For single action responses (high confidence), enable auto-navigation after 1.5 seconds
              - For onboarding queries, prioritize guided setup over generic browsing
              - For creative/hosting intent, route to conversational creator setup for AI guidance
              - For venue/service providers, route to specialized registration flows

              Available app routes and features:
              - /experiences (browse all experiences - USE THIS for generic discovery queries)
              - /experiences?category=retreats (wellness, meditation, spiritual experiences)
              - /experiences?category=workations (remote work + travel experiences)
              - /experiences?category=adventure_trips (outdoor, hiking, sports)
              - /experiences?category=community_social (social, networking events)
              - /experiences?category=sports_wellness (fitness, health activities)  
              - /experiences?category=festivals_events (festivals, special events)
              - /experience-details/:id (individual experience pages)
              - /creator (Creator dashboard with experience creation tools)
              - /community (community hub and networking)
              - /conversational-profile?type=participant (guided onboarding to join community)
              - /creator (Creator dashboard and management)
              - /ai-travel (AI trip and workation planning - USE THIS for travel planning queries)
              - /participant-profile-setup (create rich user profile)
              - /creator-profile-setup (become creator/host)
              - /creator-dashboard (creator analytics and management)
              - /venues (browse venue partners)
              - /services (browse service providers)
              - /venue-profile-setup (venue registration)
              - /service-provider-setup (service provider registration)
              - /admin-dashboard (admin features - if authorized)
              - /why-us (platform benefits and features)
              - /checkout (payment processing)
              
              ROUTING PRIORITIES (in order):
              1. Onboarding: "get started", "new user" → /conversational-profile?type=participant
              2. Trip planning: destinations, dates → /ai-travel  
              3. Creation: "create experience", "become host" → /creator
              4. Venues: "list venue", "add space" → /venue-profile-setup
              5. Services: "offer services" → /service-provider-setup
              6. Category-specific: yoga, retreat, etc → /experiences?category=X
              7. Generic/browsing: "find", "what's available" → /experiences
              8. FALLBACK: unclear intent → /experiences

              Always provide 2-4 actionable buttons in your responses. Keep responses conversational, brief (2-3 sentences), and focused on helping the user take their next step.

              Response format: JSON with "message" (string) and "actions" (array of {label, action, route})
              `
            },
            ...(context || []).map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      const aiResponse = JSON.parse(data.choices[0].message.content);

      res.json(aiResponse);
    } catch (error) {
      console.error("AI Assistant error:", error);
      
      // Enhanced fallback response with proper routing
      const fallbackClassification = classifyUserQuery(req.body.message || "");
      console.log("🔄 Using fallback with classification:", fallbackClassification);
      
      res.json({
        message: "I'm here to help you get started! What would you like to do first?",
        actions: [
          { label: "Get Started", action: "navigate", route: "/participant-profile-setup" },
          { label: "Browse Experiences", action: "navigate", route: "/experiences" },
          { label: "Create Experience", action: "navigate", route: "/creator" },
          { label: "Plan a Trip", action: "navigate", route: "/ai-travel" }
        ]
      });
    }
  });

  // Conversational Creator Setup Assistant
  app.post("/api/conversational-creator-setup", async (req, res) => {
    try {
      const { message, context, currentStep, currentData } = req.body;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are Great AI, a friendly and conversational assistant helping creators set up their profiles on Great. - a platform for transformative experiences.

              Your role is to guide creators through profile creation in a conversational, supportive way - like chatting with a helpful friend.

              Current Setup Step: ${currentStep} (0=intro, 1=identity, 2=expertise, 3=background, 4=monetization, 5=complete)
              Current Data: ${JSON.stringify(currentData)}

              Step Guidelines:
              - Step 1 (Identity): Get displayName, tagline, bio
              - Step 2 (Expertise): Get expertiseTags (array), main areas they teach/lead, ALWAYS ask for confirmation before advancing
              - Step 3 (Background): Get baseLocation, experienceLevel, socialMediaLinks (extract social handles from any URL or @mention)
              - Step 4 (Monetization): Get payoutEmail, terms acceptance, mention Stripe Connect setup
              - Step 5 (Complete): Final review and completion, mention dashboard setup for photos/Stripe

              CRITICAL BIO HANDLING:
              - Ask: "Can you write a bit about yourself below?"
              - When they provide bio text, DON'T save it yet - instead repeat it back with improved sentence structure/grammar
              - Say something like "Here's how that sounds: [improved version]. Does that sound perfect to you?"
              - ONLY save the bio when they say "perfect", "yes", "that's great", etc.
              - Then immediately move to nextStep: 2
              - NO ACTION BUTTONS - everything happens through text conversation

              IMPORTANT BEHAVIOR:
              - ALWAYS continue the conversation regardless of user response
              - Accept ANY user response (yes, no, maybe, specific answers, questions, etc.)
              - If they answer your question, acknowledge it and move to the next logical step
              - If they give vague responses, ask for clarification but keep moving forward
              - If they seem confused, reassure them and suggest the next step
              - ALWAYS return empty actions array - NO ACTION BUTTONS
              - Extract any useful information from their message and update form fields
              - Auto-advance to next step when you have enough information

              Your personality:
              - Warm, encouraging, and conversational
              - Use casual language and be supportive
              - Ask follow-up questions to gather information naturally
              - Celebrate their progress and choices
              - Keep responses concise (2-3 sentences max)

              Response format: JSON with:
              - "message" (string): Your conversational response that acknowledges their input and continues the flow
              - "actions" (array): Always empty array []
              - "formUpdates" (object): Any form fields to update based on their input
              - "nextStep" (number): Next step if advancing (optional)

              Extract information from their message and update form fields naturally. For expertise, convert topics they mention into expertiseTags array.
              For bio/background questions, capture ANY descriptive text about themselves as bio field.
              
              EXPERTISE CONFIRMATION FLOW:
              When user provides expertise areas, ALWAYS:
              1. Extract topics into expertiseTags array
              2. Repeat back the expertise areas as a summary
              3. End with "Should I get those down as your expertise areas?" or similar confirmation question
              4. Wait for user confirmation before advancing to nextStep: 3
              
              SOCIAL MEDIA EXTRACTION (Step 3):
              From location/social responses, extract BOTH fields and ALWAYS ask for confirmation:
              - baseLocation: Any city/country mentioned (e.g., "Amsterdam" -> "Amsterdam, Netherlands")  
              - socialMediaLinks: Extract handles/URLs and format as JSON object with instagram/website keys
              
              Example: "Amsterdam and my instagram handle is @tim.theeuwsen and www.instagram.com/tim.theeuwsen"
              -> Extract: baseLocation: "Amsterdam, Netherlands", socialMediaLinks: {"instagram": "@tim.theeuwsen", "website": "www.instagram.com/tim.theeuwsen"}
              -> ALWAYS respond with summary: "Great! I see you're based in Amsterdam, Netherlands and your Instagram is @tim.theeuwsen. Should I save these details?"
              -> WAIT for user confirmation before advancing to nextStep: 4
              
              EXAMPLE BIO FLOW:
              Step 1 - Ask: "Can you write a bit about yourself below?"
              User: "I'm a yoga teacher with 10 years experience helping people find balance"
              Step 2 - Repeat back improved: "Here's how that sounds: I'm a passionate yoga instructor with over 10 years of experience helping people discover balance and inner peace through mindful movement. Does that sound perfect to you?"
              User: "Perfect!"
              Step 3 - Save: {"message": "Wonderful! I've saved your bio. Now let's move on to your expertise areas...", "formUpdates": {"bio": "I'm a passionate yoga instructor with over 10 years of experience helping people discover balance and inner peace through mindful movement."}, "nextStep": 2, "actions": []}
              
              MONETIZATION STEP (Step 4):
              - Ask for payoutEmail for payments
              - Mention: "We'll use Stripe Connect so you can receive payments from your experiences. You can complete the full Stripe setup later in your dashboard!"
              - When they provide email, IMMEDIATELY save it and ask for terms acceptance
              - If any delay/timeout occurs, provide immediate fallback: "Got your email! Do you agree to our creator terms of service?"
              
              COMPLETION STEP (Step 5):
              - Congratulate them on completing the basic profile
              - Mention: "Great news! You can add your profile photo and complete your Stripe Connect setup anytime in your creator dashboard. For now, you're ready to start creating experiences!"
              
              CRITICAL: Never include suggestion buttons or action prompts in your message text. Just natural conversation flow.`
            },
            ...context.map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      
      // Handle potential parsing errors
      let aiResponse;
      try {
        const content = data.choices[0]?.message?.content;
        if (!content || content.trim() === '') {
          throw new Error('Empty response from OpenAI');
        }
        aiResponse = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', parseError, 'Content:', data.choices[0]?.message?.content);
        throw new Error('Invalid response format from OpenAI');
      }

      res.json(aiResponse);
    } catch (error) {
      console.error("Conversational Creator Setup error:", error);
      
      // Fallback response with proper currentStep access
      res.json({
        message: "I'm having a little trouble connecting, but I'm still here to help! Can you tell me what you'd like to work on? Just type your response and we'll continue the conversation.",
        actions: [],
        formUpdates: {},
        nextStep: req.body.currentStep || 0
      });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.put("/api/profile-photos", async (req, res) => {
    try {
      const { profilePhotoURL } = req.body;
      if (!profilePhotoURL) {
        return res.status(400).json({ error: "profilePhotoURL is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(profilePhotoURL);

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting profile photo:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Route for serving objects (for profile photos)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Services endpoints (minimal implementation for now)
  // Community routes - Public profiles for community page
  app.get("/api/community/profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllParticipantProfiles();
      // Filter only public profiles
      const publicProfiles = profiles.filter(profile => 
        profile.profileVisibility === "Public"
      );
      res.json(publicProfiles);
    } catch (error) {
      console.error("Error fetching community profiles:", error);
      res.status(500).json({ message: "Failed to fetch community profiles" });
    }
  });

  // Participant Hub routes
  app.get("/api/experiences/:id/participants", async (req, res) => {
    try {
      const participants = await storage.getExperienceParticipants(req.params.id);
      
      // Transform the data to match the expected format
      const formattedParticipants = participants.map(participant => ({
        id: participant.userId,
        userId: participant.userId,
        firstName: participant.firstName,
        lastName: participant.lastName,
        name: `${participant.firstName || ""} ${participant.lastName || ""}`.trim() || "Anonymous",
        displayName: participant.displayName,
        profileImage: participant.avatarUrl || participant.profileImageUrl,
        profileImageUrl: participant.profileImageUrl,
        avatarUrl: participant.avatarUrl,
        bookingId: participant.bookingId,
        joinedAt: participant.bookingDate,
        bookingDate: participant.bookingDate,
        role: "Participant" // This could be enhanced with actual roles
      }));
      
      res.json(formattedParticipants);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  app.get("/api/experiences/:id/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncements(req.params.id);
      res.json(announcements);
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      // Return empty array for now - will be implemented when storage is fixed
      res.json([]);
    } catch (error: any) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  // Community application routes
  app.post("/api/community/apply", async (req, res) => {
    try {
      const validatedData = insertCommunityApplicationSchema.parse(req.body);
      const application = await storage.submitCommunityApplication(validatedData);
      res.json(application);
    } catch (error) {
      console.error("Error submitting community application:", error);
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ message: "Invalid application data", errors: (error as any).errors });
      } else {
        res.status(500).json({ message: "Failed to submit application" });
      }
    }
  });

  app.get("/api/admin/community-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Only admin users can view applications
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const { page, pageSize, offset } = paginationFrom(req.query);
      const search = String(req.query.search || "").trim();
      const where = search ? or(
        ilike(users.firstName, `%${search}%`),
        ilike(users.lastName, `%${search}%`),
        ilike(users.email, `%${search}%`),
      ) : undefined;
      const [items, totals, pendingRows] = await Promise.all([
        db.select({ application: communityApplications, firstName: users.firstName, lastName: users.lastName, email: users.email, experienceTitle: experiences.title }).from(communityApplications).leftJoin(users, eq(communityApplications.userId, users.id)).leftJoin(experiences, eq(communityApplications.experienceId, experiences.id)).where(where).orderBy(desc(communityApplications.createdAt)).limit(pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(communityApplications).leftJoin(users, eq(communityApplications.userId, users.id)).where(where),
        db.select({ count: sql<number>`count(*)::int` }).from(communityApplications).where(eq(communityApplications.status, "pending")),
      ]);
      const total = Number(totals[0]?.count || 0);
      res.json({ items: items.map(row => ({ ...row.application, firstName: row.firstName || "", lastName: row.lastName || "", email: row.email || "", experienceTitle: row.experienceTitle })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, stats: { pending: Number(pendingRows[0]?.count || 0) } });
    } catch (error) {
      console.error("Error fetching community applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  app.patch("/api/admin/community-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Only admin users can review applications
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { status, reviewNotes } = req.body;
      const application = await storage.reviewCommunityApplication(
        req.params.id, 
        status, 
        reviewNotes, 
        userId
      );
      res.json(application);
    } catch (error) {
      console.error("Error reviewing community application:", error);
      res.status(500).json({ message: "Failed to review application" });
    }
  });

  // Community group routes
  app.get("/api/community/groups", async (req, res) => {
    try {
      const groups = await storage.getCommunityGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching community groups:", error);
      res.status(500).json({ message: "Failed to fetch groups" });
    }
  });

  app.post("/api/community/groups", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      
      const groupData = {
        ...req.body,
        createdBy: userId
      };
      
      const group = await storage.createCommunityGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating community group:", error);
      res.status(500).json({ message: "Failed to create group" });
    }
  });

  app.post("/api/community/groups/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;

      const group = await storage.getCommunityGroup(req.params.id);
      if (!group) return res.status(404).json({ message: "Group not found" });

      const alreadyMember = await storage.isGroupMember(req.params.id, userId);
      if (alreadyMember) {
        return res.json({ alreadyMember: true });
      }

      await storage.joinGroup(req.params.id, userId);
      res.json({ alreadyMember: false });
    } catch (error) {
      console.error("Error joining community group:", error);
      res.status(500).json({ message: "Failed to join group" });
    }
  });

  app.get("/api/community/groups/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getGroupMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching group messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/community/groups/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;
      
      const messageData = {
        groupId: req.params.id,
        userId,
        content: req.body.message,
        messageType: req.body.messageType || "text"
      };
      
      const message = await storage.createGroupMessage(messageData);
      res.json(message);
    } catch (error) {
      console.error("Error creating group message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.get("/api/community/featured-members", async (req, res) => {
    try {
      const members = await storage.getFeaturedMembers();
      res.json(members);
    } catch (error) {
      console.error("Error fetching featured members:", error);
      res.status(500).json({ message: "Failed to fetch featured members" });
    }
  });

  // Public community profile — privacy-safe (first name + last initial only, no email/payment data)
  app.get("/api/community/profile/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Profile not found" });

      // Filter out test/qa/anonymous accounts
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
      if (fullName.includes('test') || fullName.includes(' qa') || fullName.startsWith('qa') || fullName.includes('anonymous')) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const profile = await storage.getParticipantProfileByUserId(userId);

      // Sanitize userId to prevent SQL injection (Replit user IDs are numeric strings)
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');

      // Get trips this user has joined (bookings with experience data)
      const userBookings = await db.execute(`
        SELECT DISTINCT ON (e.id)
          e.id,
          e.title,
          e.location,
          e.start_date,
          e.cover_image_url,
          e.status,
          e.mvg_status,
          e.require_minimum_participants,
          b.status AS booking_status,
          b.created_at AS booking_created_at
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        WHERE b.user_id = '${safeUserId}'
          AND b.status NOT IN ('cancelled','refunded')
          AND e.status IN ('approved','published')
        ORDER BY e.id, b.created_at DESC
        LIMIT 6
      `);

      // Derive interest tags from booking categories if no explicit interests
      const bookingCategories = await db.execute(`
        SELECT DISTINCT e.category
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        WHERE b.user_id = '${safeUserId}'
          AND b.status NOT IN ('cancelled','refunded')
          AND e.category IS NOT NULL
        LIMIT 5
      `);

      const explicitInterests: string[] = Array.isArray(profile?.interests) ? profile.interests : [];
      const derivedTags = (bookingCategories.rows as any[]).map((r: any) => r.category).filter(Boolean);
      const allInterests = Array.from(new Set([...explicitInterests, ...derivedTags])).slice(0, 6);

      // Build privacy-safe display name: first name + last initial only
      const firstName = user.firstName || "";
      const lastInitial = user.lastName ? `${user.lastName[0]}.` : "";
      const displayName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

      // Avatar: prefer profile avatar, then user profileImageUrl
      const avatarUrl = profile?.avatarUrl || user.profileImageUrl || null;

      // Trips
      const trips = (userBookings.rows as any[]).map((row: any) => ({
        id: row.id,
        title: row.title,
        location: row.location,
        startDate: row.start_date,
        coverImageUrl: row.cover_image_url,
        bookingStatus: row.booking_status,
        mvgStatus: row.mvg_status,
      }));

      res.json({
        userId,
        displayName,
        avatarUrl,
        location: profile?.location || null,
        bio: profile?.bio || null,
        interests: allInterests,
        skills: profile?.skills || [],
        occupation: profile?.occupation || null,
        trips,
      });
    } catch (error) {
      console.error("Error fetching community profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Member Interests Grid — real users with interest tags, max 12
  app.get("/api/community/members", async (req, res) => {
    try {
      // Fetch users with participant profiles, enriched with booking-derived tags
      const rows = await db.execute(`
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.profile_image_url,
          COALESCE(pp.location, '') AS location,
          COALESCE(pp.interests, '{}'::text[]) AS interests,
          COALESCE(pp.avatar_url, u.profile_image_url) AS avatar_url,
          -- Derive tags from booked experience categories when no interests set
          ARRAY(
            SELECT DISTINCT e.category
            FROM bookings b2
            JOIN experiences e ON e.id = b2.experience_id
            WHERE b2.user_id = u.id
              AND b2.status NOT IN ('cancelled','refunded')
              AND e.category IS NOT NULL
            LIMIT 3
          ) AS booking_categories
        FROM users u
        INNER JOIN participant_profiles pp ON pp.user_id = u.id
        WHERE u.first_name IS NOT NULL
        ORDER BY pp.updated_at DESC NULLS LAST
        LIMIT 12
      `);

      const isAnonMember = (firstName: string | null, lastName: string | null): boolean => {
        const combined = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
        if (!combined || combined.replace(/\s/g, '') === '') return true;
        if (combined.includes('anonymous')) return true;
        if (combined.includes('???')) return true;
        if (combined.includes('test')) return true;
        if (combined.startsWith('qa') || combined.includes(' qa')) return true;
        return false;
      };

      const members = (rows.rows as any[])
        .filter((row) => !isAnonMember(row.first_name, row.last_name))
        .map((row) => {
          // Merge explicit interests with booking-derived categories
          const explicitInterests: string[] = Array.isArray(row.interests) ? row.interests : [];
          const bookingCategories: string[] = Array.isArray(row.booking_categories) ? row.booking_categories : [];
          const allTags = Array.from(new Set([...explicitInterests, ...bookingCategories])).slice(0, 5);

          const firstName = row.first_name || "";
          const lastName = row.last_name || "";
          const lastInitial = lastName ? `${lastName[0]}.` : "";
          const displayName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

          return {
            id: row.id,
            displayName,
            avatarUrl: row.avatar_url || null,
            location: row.location || null,
            tags: allTags,
          };
        });

      res.json(members);
    } catch (error) {
      console.error("Error fetching community members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.get("/api/community/events", async (req, res) => {
    try {
      const events = await storage.getCommunityEvents();
      res.json(events);
    } catch (error) {
      console.error("Error fetching community events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/community/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;

      const { title, description, date, time, location, type, maxAttendees } = req.body;
      if (!title?.trim() || !description?.trim() || !date || !time?.trim() || !location?.trim() || !type?.trim()) {
        return res.status(400).json({ message: "Missing required event fields" });
      }
      const validTypes = ["virtual", "in-person", "hybrid"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid event type" });
      }

      const event = await storage.createCommunityEvent({
        title: title.trim(),
        description: description.trim(),
        date,
        time: time.trim(),
        location: location.trim(),
        type,
        organizer: userId,
        maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      });
      res.json(event);
    } catch (error) {
      console.error("Error creating community event:", error);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.post("/api/community/events/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await requireParticipantProfileForCommunity(req, res);
      if (!userId) return;

      const event = await storage.joinCommunityEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      res.json(event);
    } catch (error) {
      console.error("Error joining community event:", error);
      res.status(500).json({ message: "Failed to join event" });
    }
  });

  // Community Activity Feed — real events pulled from the database
  app.get("/api/community/activity", async (req, res) => {
    try {
      // Recent bookings with participant first name + experience title
      const recentBookings = await db.execute(`
        SELECT
          b.id,
          b.user_id,
          b.created_at,
          b.experience_id,
          e.title AS experience_title,
          e.location AS experience_location,
          e.max_participants,
          e.current_participants,
          e.mvg_status,
          u.first_name,
          u.last_name,
          pp.display_name,
          pp.avatar_url,
          'booking' AS event_type
        FROM bookings b
        JOIN experiences e ON b.experience_id = e.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN participant_profiles pp ON pp.user_id = u.id
        WHERE b.status IN ('pending', 'confirmed', 'deposit_authorized')
          AND e.status = 'approved'
          AND b.created_at > NOW() - INTERVAL '30 days'
        ORDER BY b.created_at DESC
        LIMIT 20
      `);

      // Recently confirmed experiences
      const confirmedExperiences = await db.execute(`
        SELECT
          e.id,
          e.title,
          e.location,
          e.updated_at AS created_at,
          'confirmed' AS event_type
        FROM experiences e
        WHERE e.mvg_status = 'met'
          AND e.status = 'approved'
          AND e.updated_at > NOW() - INTERVAL '30 days'
        ORDER BY e.updated_at DESC
        LIMIT 5
      `);

      // Platform stats
      const statsResult = await db.execute(`
        SELECT
          (SELECT COUNT(DISTINCT b.user_id)
           FROM bookings b
           WHERE b.status IN ('pending', 'confirmed', 'deposit_authorized')) AS total_travelers,
          (SELECT COUNT(*)
           FROM experiences e
           WHERE e.mvg_status = 'met' AND e.status = 'approved') AS confirmed_trips,
          (SELECT COUNT(DISTINCT pp.location)
           FROM participant_profiles pp
           WHERE pp.location IS NOT NULL AND pp.location != '') AS total_countries
      `);

      // Build feed items from bookings
      const bookingItems = (recentBookings.rows as any[]).map((row: any) => {
        const firstName = row.display_name
          ? row.display_name.split(' ')[0]
          : (row.first_name || 'Someone');
        const spotsLeft = row.max_participants != null && row.current_participants != null
          ? row.max_participants - row.current_participants
          : null;

        let text = `${firstName} joined ${row.experience_title}`;
        let type = 'joined';
        if (spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0) {
          text = `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left in ${row.experience_title}`;
          type = 'low_spots';
        }

        // Filter test/qa/anonymous/blank accounts from activity feed
        const rawName = `${row.first_name || ''} ${row.last_name || ''}`.toLowerCase().trim();
        const isTestUser = !rawName || rawName.replace(/\s/g, '') === '' ||
          rawName.includes('anonymous') || rawName.includes('???') ||
          rawName.includes('test') || rawName.startsWith('qa') || rawName.includes(' qa');

        return {
          id: `booking-${row.id}`,
          type: isTestUser ? 'skip' : type,
          text,
          experienceName: row.experience_title,
          experienceLocation: row.experience_location,
          firstName: isTestUser ? null : firstName,
          avatarUrl: isTestUser ? null : (row.avatar_url || null),
          userId: isTestUser ? null : (row.user_id || null),
          createdAt: row.created_at,
        };
      });

      // Build feed items from confirmed experiences
      const confirmedItems = (confirmedExperiences.rows as any[]).map((row: any) => ({
        id: `confirmed-${row.id}`,
        type: 'confirmed',
        text: `Trip confirmed — ${row.title} is happening!`,
        experienceName: row.title,
        experienceLocation: row.location,
        firstName: null,
        avatarUrl: null,
        createdAt: row.created_at,
      }));

      // Merge and sort by timestamp descending, keep latest 20 — filter test accounts
      const allItems = [...bookingItems, ...confirmedItems]
        .filter(item => item.type !== 'skip')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);

      const statsRow = (statsResult.rows as any[])[0] || {};

      res.json({
        feed: allItems,
        stats: {
          totalTravelers: parseInt(statsRow.total_travelers || '0', 10),
          confirmedTrips: parseInt(statsRow.confirmed_trips || '0', 10),
          totalCountries: parseInt(statsRow.total_countries || '0', 10),
        },
      });
    } catch (error) {
      console.error("Error fetching community activity:", error);
      res.status(500).json({ message: "Failed to fetch community activity" });
    }
  });

  // Additional Admin dashboard routes for managing venues and services
  // Note: /api/admin/experiences is defined earlier with MVG enrichment

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { page, pageSize, offset } = paginationFrom(req.query);
      const userSearch = String(req.query.search || "").trim();
      const userRole = String(req.query.role || "all");
      const userFilters: any[] = [];
      if (userRole !== "all") userFilters.push(eq(users.role, userRole as any));
      if (userSearch) {
        userFilters.push(or(
          ilike(users.firstName, `%${userSearch}%`),
          ilike(users.lastName, `%${userSearch}%`),
          ilike(users.email, `%${userSearch}%`),
        ));
      }
      const userWhere = userFilters.length ? and(...userFilters) : undefined;

      const [items, totals, roles] = await Promise.all([
        db.select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          bookingCount: sql<number>`(
            select count(*)::int from ${bookings}
            where ${bookings.userId} = ${users.id}
          )`,
          activeBookingCount: sql<number>`(
            select count(*)::int from ${bookings}
            where ${bookings.userId} = ${users.id}
              and ${bookings.status} in ('pending', 'deposit_authorized', 'deposit_paid', 'confirmed', 'fully_paid')
          )`,
          lastBookingAt: sql<Date | null>`(
            select max(${bookings.createdAt}) from ${bookings}
            where ${bookings.userId} = ${users.id}
          )`,
          hasParticipantProfile: sql<boolean>`exists(
            select 1 from ${participantProfiles}
            where ${participantProfiles.userId} = ${users.id}
          )`,
          venueListingCount: sql<number>`(
            select count(*)::int from ${venues}
            where ${venues.createdBy} = ${users.id}
          )`,
          venueDraftCount: sql<number>`(
            select count(*)::int from ${venues}
            where ${venues.createdBy} = ${users.id} and ${venues.status} = 'draft'
          )`,
          venuePendingCount: sql<number>`(
            select count(*)::int from ${venues}
            where ${venues.createdBy} = ${users.id} and ${venues.status} = 'pending'
          )`,
          venueApprovedCount: sql<number>`(
            select count(*)::int from ${venues}
            where ${venues.createdBy} = ${users.id} and ${venues.status} = 'approved'
          )`,
          venueRejectedCount: sql<number>`(
            select count(*)::int from ${venues}
            where ${venues.createdBy} = ${users.id} and ${venues.status} = 'rejected'
          )`,
        }).from(users).where(userWhere).orderBy(desc(users.createdAt)).limit(pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(userWhere),
        db.select({ role: users.role, count: sql<number>`count(*)::int` }).from(users).groupBy(users.role),
      ]);

      const total = Number(totals[0]?.count || 0);
      const roleCounts = roles.reduce<Record<string, number>>((counts, row) => {
        const role = row.role || "participant";
        counts[role] = (counts[role] || 0) + Number(row.count);
        return counts;
      }, {});
      res.json({
        items,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        stats: { total: Object.values(roleCounts).reduce((sum, count) => sum + Number(count), 0), ...roleCounts },
      });
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch admin users" });
    }
  });

  app.get("/api/admin/venues", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { page, pageSize, offset } = paginationFrom(req.query);
      const venueStatus = String(req.query.status || "all");
      const venueSearch = String(req.query.search || "").trim();
      const venueFilters: any[] = [];
      if (venueStatus !== "all") venueFilters.push(eq(venues.status, venueStatus as any));
      if (venueSearch) venueFilters.push(or(
        ilike(venues.name, `%${venueSearch}%`),
        ilike(venues.location, `%${venueSearch}%`),
        ilike(venues.city, `%${venueSearch}%`),
        ilike(users.firstName, `%${venueSearch}%`),
        ilike(users.lastName, `%${venueSearch}%`),
        ilike(users.email, `%${venueSearch}%`),
      ));
      const venueWhere = venueFilters.length ? and(...venueFilters) : undefined;
      const [items, totals, statuses] = await Promise.all([
        db.select({ venue: venues, ownerFirstName: users.firstName, ownerLastName: users.lastName, ownerEmail: users.email }).from(venues).leftJoin(users, eq(venues.createdBy, users.id)).where(venueWhere).orderBy(desc(venues.createdAt)).limit(pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(venues).leftJoin(users, eq(venues.createdBy, users.id)).where(venueWhere),
        db.select({ status: venues.status, count: sql<number>`count(*)::int` }).from(venues).groupBy(venues.status),
      ]);
      const total = Number(totals[0]?.count || 0);
      const statusCounts = Object.fromEntries(statuses.map(row => [row.status || "unknown", Number(row.count)]));
      res.json({
        items: items.map(row => ({
          ...stripVenuePricing(row.venue),
          ownerName: [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ") || null,
          ownerEmail: row.ownerEmail,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        stats: {
          total,
          draft: statusCounts.draft || 0,
          approved: statusCounts.approved || 0,
          pending: statusCounts.pending || 0,
          rejected: statusCounts.rejected || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching admin venues:", error);
      res.status(500).json({ message: "Failed to fetch admin venues" });
    }
  });

  app.delete("/api/admin/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      await storage.deleteVenue(req.params.id);
      res.json({ message: "Venue deleted successfully" });
    } catch (error) {
      console.error("Error deleting venue:", error);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  app.get("/api/admin/venue-availability", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get all venues
      const venues = await storage.getVenues({});
      
      // Get availability for all venues
      const availabilityPromises = venues.map(async (venue) => {
        const availability = await storage.getVenueAvailability(venue.id);
        return availability.map(avail => ({ ...avail, venue: stripVenuePricing(venue) }));
      });
      
      const allAvailability = (await Promise.all(availabilityPromises)).flat();
      res.json(allAvailability);
    } catch (error) {
      console.error("Error fetching admin venue availability:", error);
      res.status(500).json({ message: "Failed to fetch admin venue availability" });
    }
  });

  app.get("/api/admin/services", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { page, pageSize, offset } = paginationFrom(req.query);
      const serviceSearch = String(req.query.search || "").trim();
      const serviceWhere = serviceSearch ? or(ilike(serviceProviders.name, `%${serviceSearch}%`), ilike(serviceProviders.description, `%${serviceSearch}%`), ilike(serviceProviders.location, `%${serviceSearch}%`)) : undefined;
      const [items, totals, pending] = await Promise.all([
        db.select({ service: serviceProviders, providerFirstName: users.firstName, providerLastName: users.lastName }).from(serviceProviders).leftJoin(users, eq(serviceProviders.createdBy, users.id)).where(serviceWhere).orderBy(desc(serviceProviders.createdAt)).limit(pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(serviceProviders).where(serviceWhere),
        db.select({ count: sql<number>`count(*)::int` }).from(serviceProviders).where(eq(serviceProviders.approved, false)),
      ]);
      const total = Number(totals[0]?.count || 0);
      res.json({ items: items.map(row => ({ ...row.service, status: row.service.approved ? "approved" : "pending", providerName: [row.providerFirstName, row.providerLastName].filter(Boolean).join(" ") || null })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, stats: { total, pending: Number(pending[0]?.count || 0) } });
    } catch (error) {
      console.error("Error fetching admin services:", error);
      res.status(500).json({ message: "Failed to fetch admin services" });
    }
  });

  // Admin Promoter Management Routes
  app.get("/api/admin/promoters", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const promoters = await storage.getAllPromoters();
      
      // Get earnings summary for each promoter
      const promotersWithStats = await Promise.all(promoters.map(async (promoter) => {
        const [earnings, promotedExperiences, promoterProfile] = await Promise.all([
          storage.getPromoterEarningsSummary(promoter.id),
          storage.getPromoterExperiences(promoter.id),
          storage.getPromoterProfile(promoter.id),
        ]);
        
        // Aggregate stats across currencies
        let totalBookings = 0;
        let estimatedByCurrency: Record<string, number> = {};
        let lockedByCurrency: Record<string, number> = {};
        let paidByCurrency: Record<string, number> = {};
        let voidedByCurrency: Record<string, number> = {};
        
        for (const entry of earnings.byCurrency) {
          totalBookings += entry.totalBookings;
          estimatedByCurrency[entry.currency] = (estimatedByCurrency[entry.currency] || 0) + entry.estimated;
          lockedByCurrency[entry.currency] = (lockedByCurrency[entry.currency] || 0) + entry.locked;
          paidByCurrency[entry.currency] = (paidByCurrency[entry.currency] || 0) + entry.paid;
          voidedByCurrency[entry.currency] = (voidedByCurrency[entry.currency] || 0) + entry.voided;
        }

        const baseUrl = getAppBaseUrl(req);
        const affiliateLinks = promoter.promoterCode
          ? promotedExperiences
              .filter((item) => item.shareToken)
              .map((item) => ({
                experienceId: item.experience.id,
                experienceTitle: item.experience.title,
                referralAudience: item.referralAudience,
                url: buildPromoterReferralLink(
                  baseUrl,
                  item.experience.slug || item.experience.id,
                  promoter.promoterCode!,
                  item.shareToken,
                ),
              }))
          : [];
        
        return {
          id: promoter.id,
          email: promoter.email,
          firstName: promoter.firstName,
          lastName: promoter.lastName,
          role: promoter.role,
          promoterCode: promoter.promoterCode,
          affiliateLink: promoter.promoterCode ? `/?ref=${encodeURIComponent(promoter.promoterCode)}` : null,
          status: "active",
          lastActiveAt: promoter.updatedAt || promoter.createdAt,
          totalBookings,
          estimatedByCurrency,
          lockedByCurrency,
          paidByCurrency,
          voidedByCurrency,
          affiliateLinks,
          payoutStatus: promoterProfile?.stripeVerificationStatus || "not_connected",
          currentBalanceByCurrency: Object.fromEntries(
            Array.from(new Set([...Object.keys(estimatedByCurrency), ...Object.keys(lockedByCurrency)])).map(currency => [
              currency,
              (estimatedByCurrency[currency] || 0) + (lockedByCurrency[currency] || 0),
            ]),
          ),
          availablePayoutByCurrency: lockedByCurrency,
        };
      }));
      
      res.json(promotersWithStats);
    } catch (error) {
      console.error("Error fetching admin promoters:", error);
      res.status(500).json({ message: "Failed to fetch promoters" });
    }
  });

  app.get("/api/admin/promoters/:promoterId", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const promoterId = req.params.promoterId;
      const promoter = await storage.getUser(promoterId);
      
      if (!promoter) {
        return res.status(404).json({ message: "Promoter not found" });
      }
      
      // Get earnings summary
      const earnings = await storage.getPromoterEarningsSummary(promoterId);
      
      // Get all bookings with details
      const bookingsWithDetails = await storage.getPromoterBookingsWithDetails(promoterId);
      
      res.json({
        promoter: {
          id: promoter.id,
          email: promoter.email,
          firstName: promoter.firstName,
          lastName: promoter.lastName,
          promoterCode: promoter.promoterCode,
        },
        earnings,
        bookings: bookingsWithDetails.map(({ booking, experience, participant }) => ({
          id: booking.id,
          experienceId: booking.experienceId,
          experienceName: experience.title,
          ticketSkuId: booking.ticketSkuId,
          spots: (booking as any).spots || 1,
          bookingValue: resolveBookingGrossValue(booking as any).toFixed(2),
          commissionAmount: booking.commissionAmount,
          commissionStatus: booking.commissionStatus || 'estimated',
          commissionTransferId: booking.commissionTransferId,
          commissionPaidAt: booking.commissionPaidAt,
          currency: normalizeCurrency(experience.currency, booking.commissionCurrency),
          participantName: participant ? `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || participant.email : 'Unknown',
          createdAt: booking.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching admin promoter detail:", error);
      res.status(500).json({ message: "Failed to fetch promoter details" });
    }
  });

  app.patch("/api/admin/experiences/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const userId = req.user.claims.sub;
      const { status, reviewNotes } = req.body;
      
      let experience;
      if (status === 'approved') {
        experience = await approveExperienceForPublication(req.params.id, userId, reviewNotes);
        console.log(`[Admin] Experience ${req.params.id} approved by ${userId}`);
      } else if (status === 'rejected') {
        experience = await storage.rejectExperience(req.params.id, userId, reviewNotes);
        console.log(`[Admin] Experience ${req.params.id} rejected by ${userId}`);
      } else {
        return res.status(400).json({ message: "Invalid status. Use 'approved' or 'rejected'" });
      }
      
      res.json(experience);
    } catch (error) {
      console.error("Error updating experience status:", error);
      res.status(500).json({ message: "Failed to update experience status" });
    }
  });

  app.patch("/api/admin/venues/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { status, reviewNotes } = req.body;
      if (status === 'approved') {
        const venue = await storage.approveVenue(req.params.id);
        res.json(stripVenuePricing(venue));
      } else {
        await storage.rejectVenue(req.params.id);
        res.json({ message: "Venue rejected and removed" });
      }
    } catch (error) {
      console.error("Error updating venue status:", error);
      res.status(500).json({ message: "Failed to update venue status" });
    }
  });

  // Update venue display preferences (admin only)
  app.patch("/api/admin/venues/:id/display-prefs", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { displayPrefs } = req.body;
      const venue = await storage.updateVenueDisplayPrefs(req.params.id, displayPrefs);
      res.json(stripVenuePricing(venue));
    } catch (error) {
      console.error("Error updating venue display preferences:", error);
      res.status(500).json({ message: "Failed to update display preferences" });
    }
  });

  app.patch("/api/admin/services/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (!await checkIsAdmin(req)) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { status, reviewNotes } = req.body;
      if (status === 'approved') {
        const service = await storage.approveServiceProvider(req.params.id);
        res.json(service);
      } else {
        await storage.rejectServiceProvider(req.params.id);
        res.json({ message: "Service rejected and removed" });
      }
    } catch (error) {
      console.error("Error updating service status:", error);
      res.status(500).json({ message: "Failed to update service status" });
    }
  });

  // Duplicate endpoint removed - kept main one at line 874

  app.put("/api/creator-images", isAuthenticated, async (req: any, res) => {
    if (!req.body.imageURL) {
      return res.status(400).json({ error: "imageURL is required" });
    }

    const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting creator image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User bookings route
  // Legacy alias for /api/bookings/my-bookings. Same shape (booking rows with a
  // nested `experience`) so callers can move between them without surprises.
  app.get("/api/user/bookings", isAuthenticated, async (req: any, res) => {
    try {
      res.json(await getEnrichedBookingsForUser(req.user.claims.sub));
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // User reservations route (soft-hold system)
  app.get("/api/user/reservations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`Fetching reservations for user: ${userId}`);
      
      // Get reservations
      const reservations = await storage.getUserActiveReservations(userId);
      console.log(`Found ${reservations?.length || 0} active reservations`);
      
      // Enrich with experience metadata
      const enrichedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          const experience = await storage.getExperience(reservation.experienceId);
          return {
            ...reservation,
            experienceTitle: experience?.title || "Unknown Experience",
            experienceStartDate: experience?.startDate,
            experienceEndDate: experience?.endDate,
            experienceLocation: experience?.location,
            experiencePrice: experience?.price,
            experienceShortDescription: experience?.shortDescription,
            expiresAtISO: reservation.expiresAt.toISOString(),
          };
        })
      );
      
      res.json(enrichedReservations);
    } catch (error) {
      console.error("Error fetching user reservations:", error);
      res.status(500).json({ message: "Failed to fetch reservations" });
    }
  });

  // Creator onboarding checklist
  app.get("/api/creator/onboard", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      
      // Get creator profile
      const profile = await storage.getCreatorProfileByUserId(userId);
      
      // Get creator experiences
      const experiences = await storage.getExperiencesByCreator(userId);
      
      // Get user venues (if any)
      const venues = await storage.getVenuesByCreator(userId);
      
      // Build checklist
      const checklist = {
        profile: {
          completed: !!profile && !!profile.displayName && !!profile.bio && !!profile.payoutEmail,
          data: {
            hasProfile: !!profile,
            displayName: profile?.displayName || null,
            bio: profile?.bio || null,
            payoutEmail: profile?.payoutEmail || null,
            profilePhoto: profile?.profilePhoto || null,
            termsAccepted: profile?.termsAccepted || false
          }
        },
        payout: {
          completed: !!profile?.stripeAccountId && profile?.stripeVerificationStatus === 'verified',
          data: {
            stripeConnected: !!profile?.stripeAccountId,
            stripeVerified: profile?.stripeVerificationStatus === 'verified',
            stripeStatus: profile?.stripeVerificationStatus || 'pending'
          }
        },
        // NOTE: the standalone "Venue Setup" step was removed from onboarding —
        // venues are now linked to an event inside the Event Builder.
        firstEvent: {
          completed: experiences && experiences.length > 0,
          data: {
            experiencesCreated: experiences?.length || 0,
            hasPublishedExperience: experiences?.some(exp => exp.status === 'approved') || false,
            experiences: experiences || []
          }
        }
      };

      // Calculate overall progress
      const completedItems = Object.values(checklist).filter(item => item.completed).length;
      const totalItems = Object.keys(checklist).length;
      const overallProgress = Math.round((completedItems / totalItems) * 100);

      res.json({
        checklist,
        progress: {
          completed: completedItems,
          total: totalItems,
          percentage: overallProgress
        }
      });
    } catch (error) {
      console.error("Error fetching creator onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  // Update creator onboarding progress
  app.post("/api/creator/onboard", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      const { step, data } = req.body;

      if (!step) {
        return res.status(400).json({ message: "Step is required" });
      }

      let result;
      
      switch (step) {
        case 'profile':
          // Update or create creator profile
          if (data) {
            result = await storage.createOrUpdateCreatorProfile(userId, data);
          }
          break;
          
        case 'payout':
          // Trigger Stripe Connect setup
          if (data?.initializeStripe) {
            const user = await storage.getUser(userId);
            let account: Stripe.Account | null = null;
            const existingProfile = await storage.getCreatorProfileByUserId(userId);

            if (existingProfile?.stripeAccountId) {
              try {
                account = await stripe.accounts.retrieve(existingProfile.stripeAccountId);
              } catch (err: any) {
                // Stored id from the other Stripe mode (test vs live); recreate below.
                if (err?.code === 'resource_missing' || err?.code === 'account_invalid') {
                  console.warn(`Stripe account ${existingProfile.stripeAccountId} for user ${userId} not found in current mode; creating a new one.`);
                } else {
                  throw err;
                }
              }
            }

            if (!account) {
              account = await stripe.accounts.create({
                type: 'express',
                email: user?.email || undefined,
                metadata: { userId: userId }
              });

              // Update creator profile with Stripe account ID
              await storage.updateCreatorProfileStripe(userId, account.id);
            }
            
            result = { stripeAccountId: account.id };
          }
          break;
          
        case 'venue':
          // This would typically be handled by the venue creation endpoint
          // Just acknowledge the step completion
          result = { message: "Venue step acknowledged" };
          break;
          
        case 'firstEvent':
          // This would typically be handled by the experience creation endpoint
          // Just acknowledge the step completion
          result = { message: "First event step acknowledged" };
          break;
          
        default:
          return res.status(400).json({ message: "Invalid step" });
      }

      res.json({ 
        message: `${step} step updated successfully`,
        result 
      });
    } catch (error) {
      console.error("Error updating creator onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding progress" });
    }
  });

  // Creator experiences route
  app.get("/api/creator/experiences", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching creator experiences for user: ${userId}`);
      const experiences = await storage.getExperiencesByCreator(userId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        (experiences || []).map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      console.log(`Found ${enrichedExperiences.length} experiences for creator`);
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator experiences:", error);
      res.status(500).json({ message: "Failed to fetch creator experiences" });
    }
  });

  // Creator pending experiences route
  app.get("/api/creator/experiences/pending", async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user.claims.sub;
      console.log(`Fetching pending experiences for creator: ${userId}`);
      const pendingExperiences = await storage.getPendingExperiencesByCreator(userId);
      // Enrich with MVG progress from single source of truth
      const enrichedExperiences = await Promise.all(
        (pendingExperiences || []).map(async (exp) => {
          const mvgProgress = await storage.getMVGProgress(exp.id);
          const mvgMet = mvgProgress.mvg_met;
          const resolvedMvgStatus = mvgMet ? 'met' : (exp.mvgStatus || 'pending');
          return {
            ...exp,
            currentParticipants: mvgProgress.current_participants,
            participantCount: mvgProgress.current_participants,
            mvgMet,
            mvgStatus: resolvedMvgStatus,
            lifecycleStatus: computeLifecycleStatus({ ...exp, mvgStatus: resolvedMvgStatus, mvgMet }),
          };
        })
      );
      console.log(`Found ${enrichedExperiences.length} pending experiences for creator`);
      res.json(enrichedExperiences);
    } catch (error) {
      console.error("Error fetching creator pending experiences:", error);
      res.status(500).json({ message: "Failed to fetch pending experiences" });
    }
  });

  // AI Travel API health check endpoint
  app.get("/api/ai-travel/health", async (req, res) => {
    try {
      // Check if external APIs are available
      const healthStatus = {
        status: 'development',
        services: {
          amadeus: { available: false, reason: 'Integration pending' },
          getYourGuide: { available: false, reason: 'Integration pending' },
          openAI: { available: false, reason: 'Travel AI not configured' },
          platform: { available: true, reason: 'Local experiences available' }
        },
        capabilities: {
          flights: false,
          hotels: false,
          externalActivities: false,
          platformExperiences: true,
          basicItinerary: false
        },
        message: 'AI Travel Planner is in development. Platform experiences are available for browsing.'
      };
      
      res.json(healthStatus);
    } catch (error) {
      console.error("Health check error:", error);
      res.status(503).json({ 
        status: 'unavailable',
        message: 'Unable to check service status'
      });
    }
  });

  // AI Travel Planning endpoint - with intelligent fallback
  app.post("/api/ai-travel/generate-plan", async (req, res) => {
    try {
      const { destination, startDate, endDate, travelers, budget, travelStyle, interests } = req.body;
      
      // Check API availability first
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasAmadeus = !!process.env.AMADEUS_API_KEY; // placeholder for future
      const hasGetYourGuide = !!process.env.GETYOURGUIDE_API_KEY; // placeholder for future
      
      // If no external APIs are available, return placeholder response
      if (!hasOpenAI && !hasAmadeus && !hasGetYourGuide) {
        return res.json({
          isPlaceholder: true,
          status: 'development',
          message: 'AI Travel Planner is in development. Explore our platform experiences while we build this feature!',
          platformExperiences: await storage.getExperiences({ status: "approved", limit: 5 }),
          fallbackOptions: {
            browsePlatform: true,
            manualPlanning: true
          }
        });
      }
      
      // If APIs are available, attempt full travel plan generation
      const mockPlan = {
        id: `plan-${Date.now()}`,
        destination,
        dates: `${startDate} to ${endDate}`,
        travelers,
        budget,
        travelStyle,
        itinerary: [
          {
            day: 1,
            activities: [
              "Arrival and hotel check-in",
              "Walking tour of city center",
              "Welcome dinner at local restaurant"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Airport shuttle, walking",
            meals: ["Breakfast (hotel)", "Lunch (cafe)", "Dinner (restaurant)"]
          },
          {
            day: 2,
            activities: [
              "Visit main cultural attractions",
              "Local market exploration", 
              "Cooking class experience"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Public transport, walking",
            meals: ["Breakfast (hotel)", "Street food", "Cooking class dinner"]
          },
          {
            day: 3,
            activities: [
              "Day trip to nearby attractions",
              "Scenic viewpoint visit",
              "Departure preparations"
            ],
            accommodation: "Central Hotel - Premium Room",
            transportation: "Tour bus, walking",
            meals: ["Breakfast (hotel)", "Packed lunch", "Farewell dinner"]
          }
        ],
        flights: [
          {
            airline: "Major Airlines",
            departure: "Your City - 8:00 AM",
            arrival: `${destination} - 2:00 PM`,
            price: budget === 'budget' ? 299 : budget === 'mid-range' ? 599 : 1299
          },
          {
            airline: "Major Airlines", 
            departure: `${destination} - 6:00 PM`,
            arrival: "Your City - 11:00 PM",
            price: budget === 'budget' ? 329 : budget === 'mid-range' ? 629 : 1399
          }
        ],
        hotels: [
          {
            name: "Central Hotel",
            rating: budget === 'budget' ? 3 : budget === 'mid-range' ? 4 : 5,
            price: budget === 'budget' ? 89 : budget === 'mid-range' ? 189 : 389,
            location: `Downtown ${destination}`
          },
          {
            name: "Boutique Inn",
            rating: budget === 'budget' ? 3 : budget === 'mid-range' ? 4 : 5,
            price: budget === 'budget' ? 109 : budget === 'mid-range' ? 229 : 459,
            location: `Historic District ${destination}`
          }
        ]
      };

      // Simulate AI processing time only if we have working APIs
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      res.json(mockPlan);
    } catch (error) {
      console.error("Error generating travel plan:", error);
      // Return graceful fallback instead of error
      res.json({
        isPlaceholder: true,
        status: 'error_fallback',
        message: 'Travel planning temporarily unavailable. Check out these great experiences instead!',
        platformExperiences: await storage.getExperiences({ status: "approved", limit: 5 }).catch(() => []),
        fallbackOptions: {
          browsePlatform: true,
          manualPlanning: true,
          contactSupport: true
        }
      });
    }
  });

  // AI Assistant endpoint for search queries
  app.post("/api/ai-assistant", async (req, res) => {
    try {
      const { message } = req.body;
      
      // Simple query classification for onboarding routes
      const response = classifyUserQueryForAssistant(message);
      res.json(response);
    } catch (error) {
      console.error("AI Assistant error:", error);
      res.status(500).json({ 
        message: "Let me help you explore Great. manually:",
        actions: [
          { label: "Browse Experiences", action: "navigate", route: "/experiences" },
          { label: "Create Profile", action: "navigate", route: "/participant-profile-setup" },
          { label: "Start Creating", action: "navigate", route: "/creator" }
        ]
      });
    }
  });

  // Helper function to classify user queries for AI assistant
  function classifyUserQueryForAssistant(query: string) {
    const lowerQuery = query.toLowerCase();
    
    // Creator onboarding queries
    if (lowerQuery.includes("create") && (lowerQuery.includes("experience") || lowerQuery.includes("own") || lowerQuery.includes("host"))) {
      return {
        message: "Perfect! I'll help you create your own experience. Let's start with setting up your creator profile.",
        actions: [
          { label: "Start Creator Setup", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    if (lowerQuery.includes("start creating") || lowerQuery.includes("become creator") || lowerQuery.includes("host retreat")) {
      return {
        message: "Great! Let's get you set up as a creator so you can start hosting amazing experiences.",
        actions: [
          { label: "Begin Creator Onboarding", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    // Participant/community onboarding queries  
    if (lowerQuery.includes("join community") || lowerQuery.includes("create profile") || lowerQuery.includes("get started")) {
      return {
        message: "Welcome to Great.! Let's set up your profile so you can start connecting with amazing experiences and people.",
        actions: [
          { label: "Create Your Profile", action: "navigate", route: "/participant-profile-setup" }
        ]
      };
    }
    
    // Journey builder queries
    if (lowerQuery.includes("organize") && lowerQuery.includes("workation")) {
      return {
        message: "Awesome! I'll help you organize the perfect workation experience.",
        actions: [
          { label: "Start Journey Builder", action: "navigate", route: "/creator" }
        ]
      };
    }
    
    // Location-based queries with filters
    if (lowerQuery.includes("beach") && (lowerQuery.includes("wifi") || lowerQuery.includes("remote"))) {
      return {
        message: "Looking for beach workations with great wifi? Here are some perfect options:",
        actions: [
          { label: "Beach Workations", action: "navigate", route: "/experiences?search=beach+wifi+workation" }
        ]
      };
    }
    
    if (lowerQuery.includes("city") && (lowerQuery.includes("coworking") || lowerQuery.includes("hub"))) {
      return {
        message: "City workations with coworking spaces coming right up!",
        actions: [
          { label: "City Coworking Spaces", action: "navigate", route: "/experiences?search=city+coworking+workation" }
        ]
      };
    }
    
    // Default fallback
    return {
      message: "I'd love to help! What are you most interested in?",
      actions: [
        { label: "Browse Experiences", action: "navigate", route: "/experiences" },
        { label: "Create My Own", action: "navigate", route: "/creator" },
        { label: "Join Community", action: "navigate", route: "/participant-profile-setup" },
        { label: "Plan Trip", action: "navigate", route: "/ai-travel" }
      ]
    };
  }

  // AI Creation Assistant endpoint
  app.post("/api/ai-creation-assistant", async (req, res) => {
    try {
      const { message, context, experienceData, userType } = req.body;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Determine user type context for personalized questions
      const userTypeContext = getUserTypeContext(userType);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          messages: [
            {
              role: "system",
              content: `You are the AI Creation Assistant for "Great." - helping users create transformative experiences step by step.

              User Type: ${userType} - ${userTypeContext}

              Your role:
              1. Guide experience creation through conversational flow
              2. Ask the right questions based on user type (individual creator vs venue vs service provider)
              3. Collect all necessary information: title, description, category, location, pricing, dates, itinerary
              4. Help with photo upload planning and creator background
              5. Be encouraging and professional

              Current experience data: ${JSON.stringify(experienceData)}

              Response format: JSON with:
              - "message" (string): Your conversational response
              - "actions" (array): Action buttons [{label, action, data}]
              - "experienceData" (object): Updated experience data if any
              - "isComplete" (boolean): True when all required data is collected
              - "nextStep" (string): What to collect next

              Keep responses conversational and focused on the next logical step.
              `
            },
            ...context.map((msg: any) => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: "user",
              content: message
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error('OpenAI API request failed');
      }

      const data = await response.json();
      const aiResponse = JSON.parse(data.choices[0].message.content);

      res.json(aiResponse);
    } catch (error) {
      console.error("AI Creation Assistant error:", error);
      
      // Fallback response
      res.json({
        message: "Let's continue building your experience! What would you like to focus on next?",
        actions: [
          { label: "Add Description", action: "add_description" },
          { label: "Set Location", action: "set_location" },
          { label: "Plan Itinerary", action: "plan_itinerary" },
          { label: "Upload Photos", action: "upload_photos" }
        ]
      });
    }
  });

  // Travel API endpoint with platform-first approach
  app.post('/api/ai-travel/generate-plan', async (req, res) => {
    try {
      const { destination, startDate, endDate, travelers, budget, travelStyle, interests } = req.body;
      
      // First, get platform experiences for the destination
      const platformExperiences = await storage.getExperiences({
        status: "approved",
        limit: 10
      });
      
      // Filter platform experiences by location/destination (improved matching)
      const destinationExperiences = platformExperiences.filter(exp => {
        const searchTerms = destination.toLowerCase().split(/[\s,]+/);
        const experienceText = `${exp.location} ${exp.title} ${exp.description}`.toLowerCase();
        return searchTerms.some((term: string) => experienceText.includes(term));
      });

      // Simulate GetYourGuide API call for additional experiences when platform doesn't have enough
      const externalExperiences = destinationExperiences.length < 3 ? 
        await getExternalExperiences(destination) : [];

      // Generate base travel plan structure
      const travelPlan = {
        destination,
        duration: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        travelers: parseInt(travelers),
        budget,
        travelStyle,
        platformExperiences: destinationExperiences.slice(0, 3), // Platform experiences prioritized
        externalExperiences: externalExperiences, // Third-party experiences as fallback
        itinerary: generateBasicItinerary(destination, startDate, endDate, interests),
        flights: await getMockFlightData(destination), // Ready for Amadeus API integration
        hotels: await getMockHotelData(destination), // Ready for Amadeus API integration
        completeTripValue: calculateTripValue(destinationExperiences, externalExperiences)
      };

      res.json(travelPlan);
    } catch (error) {
      console.error("Error generating travel plan:", error);
      res.status(500).json({ error: "Failed to generate travel plan" });
    }
  });

  // Platform settings - returns fee config for dynamic UI
  app.get('/api/platform-settings', async (_req, res) => {
    try {
      const [settings] = await db.select().from(platformSettings).limit(1);
      if (settings) {
        res.json({
          platformFeePercentage: parseFloat(settings.platformFeePercentage ?? '15.00'),
          stripeFeePercentage: parseFloat(settings.stripeFeePercentage ?? '2.90'),
          stripeFeeFixed: settings.stripeFeeFixed ?? 30,
        });
      } else {
        res.json({ platformFeePercentage: 15, stripeFeePercentage: 2.9, stripeFeeFixed: 30 });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch platform settings' });
    }
  });

  // Revenue calculation endpoint for real-time preview
  app.post('/api/calculate-revenue', async (req, res) => {
    try {
      const { 
        amount, 
        managementType, 
        services, 
        creatorRole, 
        supportLevel,
        facilitatorServices,
        influencerRevShare,
        facilitatorBaseCommission,
        venuePercentage,
        creatorPercentage,
        platformPercentage 
      } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount required' });
      }

      // Support new venue split API
      if (venuePercentage !== undefined && creatorPercentage !== undefined && platformPercentage !== undefined) {
        try {
          const breakdown = calculateVenueSplitRevenueBreakdown(
            Math.round(amount * 100), // Convert to cents
            venuePercentage,
            creatorPercentage,
            platformPercentage
          );
          res.json(breakdown);
        } catch (error: any) {
          return res.status(400).json({ error: error.message });
        }
      } else if (creatorRole) {
        // Support role-based API with new options structure
        const breakdown = calculateRoleBasedRevenueBreakdown(
          Math.round(amount * 100), // Convert to cents
          creatorRole,
          {
            supportLevel: supportLevel || 'custom',
            facilitatorServices: facilitatorServices || [],
            influencerRevShare: influencerRevShare || 25,
            facilitatorBaseCommission: facilitatorBaseCommission || 20,
          }
        );
        res.json(breakdown);
      } else if (services) {
        // Legacy modular pricing support - use old function temporarily
        const breakdown = calculateRevenueBreakdown(
          Math.round(amount * 100),
          'creator_managed'
        );
        res.json(breakdown);
      } else {
        // Legacy two-tier model support
        const breakdown = calculateRevenueBreakdown(
          Math.round(amount * 100),
          managementType || 'creator_managed'
        );
        res.json(breakdown);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Keep old function for backward compatibility
  function calculateRevenueBreakdown(grossAmount: number, managementType: string = 'creator_managed') {
    const stripeFeeAmount = Math.round(grossAmount * 0.029 + 30);
    
    let platformFeeAmount: number;
    let netAmount: number;
    let feeDescription: string;
    let platformFeePercentage: number;
    
    if (managementType === 'great_managed') {
      platformFeePercentage = 80;
      feeDescription = 'Revenue Share (Great manages venue & services - you get 20%)';
      netAmount = Math.round(grossAmount * 0.20);
      platformFeeAmount = grossAmount - netAmount;
    } else {
      platformFeePercentage = 20;
      feeDescription = 'Platform Fee (Creator manages venue & services)';
      platformFeeAmount = Math.round(grossAmount * 0.20);
      netAmount = grossAmount - platformFeeAmount - stripeFeeAmount;
    }
    
    return {
      grossAmount,
      platformFeeAmount,
      platformFeePercentage,
      stripeFeeAmount: managementType === 'great_managed' ? 0 : stripeFeeAmount,
      netAmount: Math.max(0, netAmount),
      currency: 'usd',
      managementType,
      feeDescription
    };
  }

  // Enhanced booking endpoint with revenue tracking
  app.post('/api/experiences/:id/book', async (req: any, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: experienceId } = req.params;
      const userId = process.env.NODE_ENV === 'development' ? '45788955' : req.user.claims.sub;

      // Get experience details
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Check availability
      if ((experience.currentParticipants || 0) >= experience.maxParticipants) {
        return res.status(400).json({ error: 'Experience is fully booked' });
      }

      const grossAmount = Math.round(parseFloat(experience.price) * 100); // Convert to cents
      const breakdown = calculateRevenueBreakdown(grossAmount);

      // Create Stripe Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: grossAmount,
        currency: 'usd',
        metadata: {
          experienceId,
          userId,
          creatorId: experience.creatorId,
          netAmount: breakdown.netAmount.toString(),
          platformFee: breakdown.platformFeeAmount.toString(),
        },
      });

      // Create pending booking
      const booking = await storage.createBooking({
        experienceId,
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: experience.price,
        totalPrice: experience.price,
        status: 'pending'
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        bookingId: booking.id,
        revenueBreakdown: breakdown
      });

    } catch (error: any) {
      console.error('Booking error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ RESERVATION ROUTES (Soft-Hold System) ============

  // Create soft-hold reservation
  app.post('/api/experiences/:id/reserve', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: experienceId } = req.params;
      const { reservationNotes } = req.body;

      // Get experience details
      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Check if soft-hold is enabled
      if (!experience.softHoldEnabled) {
        return res.status(400).json({ error: 'Soft-hold reservations are not enabled for this experience' });
      }

      // Check total capacity (participants + active reservations)
      const totalOccupied = (experience.currentParticipants || 0) + (experience.currentReservations || 0);
      if (totalOccupied >= experience.maxParticipants) {
        return res.status(400).json({ error: 'Experience is fully booked (including reservations)' });
      }

      // Check if user already has an active reservation for this experience
      const userActiveReservations = await storage.getUserActiveReservations(userId);
      const existingReservation = userActiveReservations.find(r => r.experienceId === experienceId);
      if (existingReservation) {
        return res.status(400).json({ error: 'You already have an active reservation for this experience' });
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (experience.softHoldDurationHours || 48));

      // Create reservation
      const reservation = await storage.createReservation({
        experienceId,
        userId,
        expiresAt,
        reservationNotes: reservationNotes || null,
        status: 'active'
      });

      res.status(201).json({
        reservation,
        message: `Spot reserved until ${safeToISOString(expiresAt)}`,
        expiresAt: safeToISOString(expiresAt)
      });

    } catch (error: any) {
      console.error('Reservation creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Convert reservation to paid booking
  app.post('/api/reservations/:id/convert', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: reservationId } = req.params;

      // Get reservation details
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }

      // Verify ownership
      if (reservation.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to convert this reservation' });
      }

      // Check if reservation is still active
      if (reservation.status !== 'active') {
        return res.status(400).json({ error: 'Reservation is no longer active' });
      }

      // Check if reservation has expired
      if (new Date() > new Date(reservation.expiresAt)) {
        // Auto-expire the reservation
        await storage.expireReservation(reservationId);
        return res.status(400).json({ error: 'Reservation has expired' });
      }

      // Get experience details for payment processing
      const experience = await storage.getExperience(reservation.experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      // Calculate amounts
      const grossAmount = Math.round(parseFloat(experience.price) * 100); // Convert to cents
      let chargeAmount = grossAmount;
      let isDepositOnly = false;

      // DATA CONTRACT: Use ticketSkus.depositPerPerson or experience.depositAmount (fixed amounts only)
      const ticketSkus = experience.ticketSkus as any[] || [];
      const fixedDeposit = ticketSkus.length > 0 && ticketSkus[0]?.depositPerPerson
        ? parseFloat(ticketSkus[0].depositPerPerson)
        : (experience.depositAmount ? parseFloat(experience.depositAmount.toString()) : 0);
      if (experience.depositEnabled && fixedDeposit > 0) {
        isDepositOnly = true;
        chargeAmount = Math.round(fixedDeposit * 100); // Convert to cents
      }

      // Create Stripe Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: chargeAmount,
        currency: 'usd',
        capture_method: 'manual',
        confirmation_method: 'automatic',
        metadata: {
          experienceId: reservation.experienceId,
          userId,
          reservationId,
          isDepositPayment: isDepositOnly.toString(),
          fullPrice: (grossAmount / 100).toString()
        },
      });

      // Create booking from reservation
      const booking = await storage.createBooking({
        experienceId: reservation.experienceId,
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amount: experience.price,
        isDepositOnly,
        totalPrice: experience.price,
        depositAmount: isDepositOnly ? (chargeAmount / 100).toString() : "0.00",
        balanceAmount: isDepositOnly ? ((grossAmount - chargeAmount) / 100).toString() : "0.00",
        status: 'pending'
      });

      // Convert reservation to booking
      await storage.convertReservationToBooking(reservationId, booking.id);

      res.json({
        clientSecret: paymentIntent.client_secret,
        bookingId: booking.id,
        message: 'Reservation converted to booking',
        paymentRequired: chargeAmount / 100,
        isDepositOnly
      });

    } catch (error: any) {
      console.error('Reservation conversion error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's active reservations
  app.get('/api/reservations', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const reservations = await storage.getUserActiveReservations(userId);

      // Enrich with experience details
      const enrichedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          const experience = await storage.getExperience(reservation.experienceId);
          return {
            ...reservation,
            experience: experience ? {
              id: experience.id,
              title: experience.title,
              shortDescription: experience.shortDescription,
              coverImageUrl: experience.coverImageUrl,
              startDate: experience.startDate,
              endDate: experience.endDate,
              location: experience.location,
              price: experience.price
            } : null
          };
        })
      );

      res.json(enrichedReservations);

    } catch (error: any) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel reservation
  app.delete('/api/reservations/:id', async (req: any, res) => {
    try {
      const userId = process.env.NODE_ENV === 'development' ? "45788955" : req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: reservationId } = req.params;

      // Get reservation details
      const reservation = await storage.getReservation(reservationId);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }

      // Verify ownership
      if (reservation.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to cancel this reservation' });
      }

      // Cancel reservation
      await storage.cancelReservation(reservationId);

      res.json({ message: 'Reservation cancelled successfully' });

    } catch (error: any) {
      console.error('Error cancelling reservation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get experience availability (including reservations)
  app.get('/api/experiences/:id/availability', async (req: any, res) => {
    try {
      const { id: experienceId } = req.params;

      const experience = await storage.getExperience(experienceId);
      if (!experience) {
        return res.status(404).json({ error: 'Experience not found' });
      }

      const activeReservations = await storage.getExperienceActiveReservations(experienceId);
      const totalOccupied = (experience.currentParticipants || 0) + (experience.currentReservations || 0);
      const spotsAvailable = experience.maxParticipants - totalOccupied;

      res.json({
        maxParticipants: experience.maxParticipants,
        currentParticipants: experience.currentParticipants,
        activeReservations: experience.currentReservations || 0,
        spotsAvailable,
        softHoldEnabled: experience.softHoldEnabled || false,
        softHoldDurationHours: experience.softHoldDurationHours || 48,
        reservations: activeReservations.map(r => ({
          id: r.id,
          expiresAt: r.expiresAt,
          // Don't include user details for privacy
        }))
      });

    } catch (error: any) {
      console.error('Error fetching availability:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Background cleanup endpoint for expired reservations
  app.post('/api/reservations/cleanup-expired', async (req: any, res) => {
    try {
      const expiredReservations = await storage.getExpiredReservations();
      let expiredCount = 0;

      for (const reservation of expiredReservations) {
        await storage.expireReservation(reservation.id);
        expiredCount++;
      }

      res.json({ 
        message: `Cleaned up ${expiredCount} expired reservations`,
        expiredCount 
      });

    } catch (error: any) {
      console.error('Error cleaning up expired reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });


  // Detailed earnings breakdown for dashboard — real bookings, same source as
  // /api/creator/earnings and /api/creator/ledger.
  app.get('/api/creator/revenue-analytics', isAuthenticated, async (req: any, res) => {
    try {
      const { summary, byExperience } = await getCreatorEarningsBreakdown(req.user.claims.sub);
      res.json({
        currency: summary.currency,
        earningsByExperience: byExperience.map((row) => ({
          experienceId: row.experienceId,
          experienceTitle: row.title,
          totalBookings: row.bookingsCount,
          totalGross: row.grossCents,
          totalNet: row.netCents,
          averageBookingValue: row.bookingsCount > 0
            ? Math.round(row.grossCents / row.bookingsCount)
            : 0,
        })),
        feeAnalysis: {
          averagePlatformFeePercentage: summary.effectivePlatformFeePct,
          totalPlatformFees: summary.totalPlatformFees,
          totalSpaceShare: summary.totalSpaceShare,
        },
        currentPlatformFee: summary.effectivePlatformFeePct,
      });
    } catch (error: any) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  
  initializeWebSocket(httpServer);
  
  // ─── Task 4: Venue Offer Inbox (The Handshake) ────────────────────────────
  // Returns all experiences that a creator has proposed to any of this venue's
  // spaces and are awaiting acceptance (status = 'pending_venue_approval').
  app.get('/api/venue/bookings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json([]);

      const venueIds = userVenues.map((venue: any) => venue.id);
      const bookings = await storage.getBookingsByVenueIds(venueIds);
      res.json(bookings);
    } catch (err: any) {
      console.error('Error fetching venue bookings:', err);
      res.status(500).json({ message: 'Failed to fetch venue bookings' });
    }
  });

  app.get('/api/venue/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) {
        return res.json({
          totalRevenue: 0,
          monthlyRevenue: 0,
          lastMonthRevenue: 0,
          totalBookings: 0,
          occupancyRate: 0,
          averageBookingValue: 0,
          repeatBookings: 0,
        });
      }

      const venueIds = userVenues.map((venue: any) => venue.id);
      const bookings = await storage.getBookingsByVenueIds(venueIds);
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
      const lastMonth = lastMonthDate.getMonth();
      const lastMonthYear = lastMonthDate.getFullYear();
      const getAmount = (booking: any) => parseFloat(booking.totalAmount || booking.totalPrice || '0') || 0;

      const totalRevenue = bookings.reduce((sum: number, booking: any) => sum + getAmount(booking), 0);
      const monthlyRevenue = bookings.reduce((sum: number, booking: any) => {
        const date = new Date(booking.createdAt || booking.bookingDate || booking.startDate || 0);
        return date.getMonth() === thisMonth && date.getFullYear() === thisYear ? sum + getAmount(booking) : sum;
      }, 0);
      const lastMonthRevenue = bookings.reduce((sum: number, booking: any) => {
        const date = new Date(booking.createdAt || booking.bookingDate || booking.startDate || 0);
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear ? sum + getAmount(booking) : sum;
      }, 0);

      res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
        lastMonthRevenue: Math.round(lastMonthRevenue * 100) / 100,
        totalBookings: bookings.length,
        occupancyRate: 0,
        averageBookingValue: bookings.length ? Math.round((totalRevenue / bookings.length) * 100) / 100 : 0,
        repeatBookings: 0,
      });
    } catch (err: any) {
      console.error('Error fetching venue analytics:', err);
      res.status(500).json({ message: 'Failed to fetch venue analytics' });
    }
  });

  // Venue owner resolved a creator's direct contract proposal → notify the creator.
  const notifyCreatorOfVenueContractResolution = (
    experienceId: string,
    venueName: string | null | undefined,
    action: 'accepted' | 'rejected',
    reason?: string | null,
  ) => {
    (async () => {
      const experience = await storage.getExperience(experienceId);
      if (!experience) return;
      const creator = await storage.getUser(experience.creatorId);
      if (!creator?.email) return;
      await notificationService.sendVenueContractResolvedEmail({
        to: creator.email,
        recipientName: creator.firstName,
        venueName,
        experienceTitle: experience.title,
        experienceSlugOrId: (experience as any).slug || experience.id,
        action,
        reason,
      });
    })().catch((err) => console.error('Venue contract resolution email failed:', err?.message || err));
  };

  app.get('/api/venue/pending-offers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Get all venues owned by this user
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json([]);

      const venueIds = userVenues.map((v: any) => v.id);
      // Both sides of an unresolved negotiation belong in the venue inbox:
      // pending = venue action required, countered = creator action required.
      let offers = await storage.getVenueContractsByVenueIds(venueIds, ["pending", "countered"]);

      // Backfill pending contracts for older linked submissions that predate the contract table.
      const linkedPendingExperiences = await storage.getExperiencesByVenueIds(venueIds);
      const missingContractExperiences = linkedPendingExperiences.filter((experience: any) =>
        (experience.status === 'pending_approval' || experience.status === 'pending') &&
        !offers.some((offer: any) => offer.id === experience.id)
      );
      for (const experience of missingContractExperiences) {
        if (!experience.linkedVenueId) continue;
        const contract = await storage.upsertVenueContract(buildVenueContractObject(
          experience,
          experience.id,
          experience.linkedVenueId,
          experience.creatorId
        ));
        offers.push({ ...experience, venue: stripVenuePricing(userVenues.find((v: any) => v.id === experience.linkedVenueId)), contract });
      }
      res.json(offers);
    } catch (err: any) {
      console.error('Error fetching venue offers:', err);
      res.status(500).json({ message: 'Failed to fetch pending offers' });
    }
  });

  // Accepted venue agreements remain visible after leaving the negotiation inbox.
  app.get('/api/venue/active-deals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userVenues = await storage.getVenuesByCreator(userId);
      const venueIds = userVenues.map((venue: any) => venue.id);
      res.json(await storage.getAcceptedVenueDealsForVenueOwner(userId, venueIds));
    } catch (err: any) {
      console.error('Error fetching active venue deals:', err);
      res.status(500).json({ message: 'Failed to fetch active venue deals' });
    }
  });

  // Accept an offer → experience goes Live (status = 'approved')
  // For venue_sponsored model, creates a Stripe Checkout Session for the sponsorship fee first.
  // The experience goes live only after the venue pays (webhook: payment_intent.succeeded w/ type=venue_sponsorship).
  app.post('/api/venue/offers/:experienceId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });

      // Verify the experience is linked to one of this user's venues
      const userVenues = await storage.getVenuesByCreator(userId);
      const linkedVenue = userVenues.find((v: any) => v.id === experience.linkedVenueId);
      const linkedToMyVenue = !!linkedVenue;
      if (!linkedToMyVenue) return res.status(403).json({ message: 'Access denied' });

      const activationBlock = await resolveMvgActivationBlock(experienceId);
      if (activationBlock) {
        return res.status(409).json({
          message: activationBlock.message,
          status: 'cancelled',
          mvgStatus: 'failed',
        });
      }

      // The venue's imported calendars are the authority on whether it is
      // free. Checked again here because a feed can change between the
      // creator picking dates and the venue accepting.
      const dateConflicts = await findVenueDateConflicts(
        linkedVenue.id,
        experience.startDate as any,
        (experience as any).endDate,
      );
      if (dateConflicts.length > 0) {
        return res.status(409).json({
          message: 'Those dates are no longer free on the venue calendar.',
          conflicts: dateConflicts,
        });
      }

      let contract = await storage.getVenueContractByExperience(experienceId);
      if (!contract) {
        contract = await storage.upsertVenueContract(buildVenueContractObject(
          experience,
          experienceId,
          experience.linkedVenueId,
          experience.creatorId
        ));
      }

      // ── Venue-Sponsored deal: charge the venue before going live ─────────
      const isVenueSponsored = (experience as any).venueCompensationModel === 'venue_sponsored'
        || contract.model === 'venue_sponsored';

      if (isVenueSponsored) {
        const sponsorshipAmount = parseFloat((experience as any).venueFixedFee || contract.terms?.fixedFee || 0);
        const currency = ((experience as any).currency || 'eur').toLowerCase();

        if (sponsorshipAmount <= 0) {
          return res.status(400).json({ message: 'Venue-sponsored deal requires a non-zero fixedFee as the sponsorship amount' });
        }

        if ((contract as any).sponsorshipPaymentStatus === 'paid' || contract.status === 'accepted') {
          return res.json({
            success: true,
            requiresPayment: false,
            contract,
            message: 'Sponsorship payment is already confirmed',
          });
        }

        // Persist the contract with status 'pending_payment' (venue hasn't paid yet)
        const updatedContract = await storage.updateVenueContractSponsorshipStatus(
          contract.id, 'unpaid'
        );

        // Create Stripe Checkout Session — venue owner pays the sponsorship fee
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const sponsorshipMeta = {
          type: 'venue_sponsorship',
          contractId: contract.id,
          experienceId,
          creatorId: (experience as any).creatorId || '',
          venueId: linkedVenue.id,
          sponsorshipAmountCents: Math.round(sponsorshipAmount * 100).toString(),
        };
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: Math.round(sponsorshipAmount * 100),
                product_data: {
                  name: `Venue Sponsorship — ${(experience as any).title || 'Event'}`,
                  description: `Flat sponsorship fee to creator for hosting the event.`,
                },
              },
            },
          ],
          metadata: sponsorshipMeta,
          // Copy metadata to the underlying PaymentIntent so payment_intent.succeeded can also route it
          payment_intent_data: { metadata: sponsorshipMeta },
          success_url: `${baseUrl}/venue-dashboard?sponsorship=success&experience=${experienceId}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/venue-dashboard?sponsorship=cancelled&experience=${experienceId}`,
        });

        return res.json({
          requiresPayment: true,
          checkoutUrl: session.url,
          contract: updatedContract,
          message: 'Complete sponsorship payment to activate the event',
        });
      }

      // ── Standard deal: accept immediately ────────────────────────────────
      const acceptedContract = await storage.acceptVenueContract(experienceId, linkedVenue.id);
      // Hold the dates. The venue's own calendar shows them taken, the export
      // feed carries them out to Airbnb and Google, and the next creator who
      // asks for the same week is turned away.
      await blockVenueDatesForExperience(
        linkedVenue.id,
        experienceId,
        experience.startDate as any,
        (experience as any).endDate,
        experience.title,
      );
      await storage.updateExperience(experienceId, {
        ...getExperienceUpdatesFromAcceptedContract(acceptedContract),
        venueStatus: 'venue_confirmed',
        linkedVenueId: linkedVenue.id,
      } as any);
      await storage.updateExperienceStatus(experienceId, 'approved');
      notifyCreatorEventPublished({
        ...experience,
        linkedVenueId: linkedVenue.id,
        venueStatus: 'venue_confirmed',
        status: 'approved',
      }).catch((error) => {
        console.error("Failed to send event published email:", error);
      });
      notifyCreatorOfVenueContractResolution(experienceId, linkedVenue.name, 'accepted');
      res.json({ success: true, contract: acceptedContract, message: 'Offer accepted — experience is now Live' });
    } catch (err: any) {
      console.error('Error accepting venue offer:', err);
      res.status(500).json({ message: 'Failed to accept offer' });
    }
  });

  // ─── External venue invites ───────────────────────────────────────────────
  // "Invite External Venue" sends a private tokenised link. These routes back
  // that link: read the offer, claim the space, or turn the deal down. Before
  // this existed the email dropped the venue on the public event page with no
  // way to respond.

  function summariseVenueInvite(invite: any, experience: any, creator: any) {
    return {
      token: invite.token,
      status: invite.status,
      expiresAt: invite.expiresAt,
      contactName: invite.contactName,
      email: invite.email,
      venue: {
        name: invite.venueName,
        address: invite.venueAddress,
        city: invite.venueCity,
        description: invite.venueDescription,
        capacity: invite.venueCapacity,
        propertyUrl: invite.propertyUrl,
      },
      deal: {
        model: invite.proposedModel,
        value: invite.proposedValue ? Number(invite.proposedValue) : null,
        currency: invite.currency || experience?.currency || 'eur',
      },
      experience: experience ? {
        id: experience.id,
        slug: experience.slug,
        title: experience.title,
        shortDescription: experience.shortDescription,
        coverImageUrl: experience.coverImageUrl,
        startDate: experience.startDate,
        endDate: experience.endDate,
        location: experience.location,
        maxParticipants: experience.maxParticipants,
        currency: experience.currency,
        requireMinimumParticipants: experience.requireMinimumParticipants,
        minimumParticipants: experience.mvgMin || experience.minimumParticipants,
        // A share of ticket sales is unreadable without the size of the room
        // and what a ticket costs, so the invite carries both.
        capacity: resolveEventCapacity(experience),
        ticketTypes: summariseTicketTypes((experience as any).ticketSkus, experience.currency),
      } : null,
      creator: creator ? {
        firstName: creator.firstName,
        lastName: creator.lastName,
      } : null,
      claimedVenueId: invite.claimedVenueId,
    };
  }

  // Public: the recipient has not signed in yet when they first open the link.
  app.get('/api/venue-invites/:token', async (req, res) => {
    try {
      const invite = await storage.getVenueInviteByToken(String(req.params.token));
      if (!invite) return res.status(404).json({ message: 'This invitation link is not valid' });

      const expired = invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now();
      const [experience, creator] = await Promise.all([
        storage.getExperience(invite.experienceId),
        storage.getUser(invite.creatorId),
      ]);

      res.json({
        ...summariseVenueInvite(invite, experience, creator),
        status: expired && invite.status === 'pending' ? 'expired' : invite.status,
      });
    } catch (error: any) {
      console.error('Error loading venue invite:', error);
      res.status(500).json({ message: 'Failed to load this invitation' });
    }
  });

  /**
   * Claim the space: creates the venue from the details the creator typed,
   * switches the account to the venue role, links it to the event and writes the
   * proposed contract. Accepting the money terms is the separate, existing
   * /api/venue/offers/:experienceId/accept step, so venue-sponsored deals still
   * go through the same Stripe checkout as every other offer.
   */
  app.post('/api/venue-invites/:token/claim', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const invite = await storage.getVenueInviteByToken(String(req.params.token));
      if (!invite) return res.status(404).json({ message: 'This invitation link is not valid' });

      if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ message: 'This invitation has expired. Ask the organiser to resend it.' });
      }
      if (invite.status === 'declined') {
        return res.status(409).json({ message: 'This invitation was already declined' });
      }
      if (invite.claimedByUserId && invite.claimedByUserId !== userId) {
        return res.status(403).json({ message: 'This invitation has already been claimed by another account' });
      }

      const experience = await storage.getExperience(invite.experienceId);
      if (!experience) return res.status(404).json({ message: 'This event no longer exists' });

      // Re-claiming is idempotent — the venue may reopen the link mid-flow.
      let venueId = invite.claimedVenueId || undefined;

      if (!venueId && req.body?.venueId) {
        // The recipient already runs a space on the platform and picked it.
        const ownedVenues = await storage.getVenuesByCreator(userId);
        const chosen = ownedVenues.find((venue: any) => venue.id === req.body.venueId);
        if (!chosen) return res.status(403).json({ message: 'That venue does not belong to your account' });
        venueId = chosen.id;
      }

      if (!venueId) {
        const venueName = (invite.venueName || '').trim() || 'My venue';
        const city = (invite.venueCity || '').trim();
        let baseSlug = generateVenueSlug(venueName, city);
        let slug = baseSlug;
        let counter = 1;
        while (await storage.getVenueBySlug(slug)) {
          slug = `${baseSlug}-${counter}`;
          counter += 1;
        }

        const created = await storage.createVenue({
          name: venueName,
          city,
          description: invite.venueDescription || '',
          location: invite.venueAddress || '',
          capacity: invite.venueCapacity ?? 0,
          website: invite.propertyUrl || null,
          contactEmail: invite.email,
          contactPerson: invite.contactName || null,
          currency: (invite.currency || experience.currency || 'eur').toLowerCase(),
          venueType: isSingleDayExperience({
            experienceType: experience.experienceType,
            startDate: experience.startDate,
            endDate: experience.endDate,
          }) ? 'daytime' : 'multi_day',
          slug,
          status: 'draft',
          approved: false,
          createdBy: userId,
        } as any);
        venueId = created.id;
      }

      // The account now runs a space — give it the venue dashboard.
      const account = await storage.getUser(userId);
      if (account && account.role !== 'venue_provider' && account.role !== 'admin') {
        await storage.updateUserRole(userId, 'venue_provider' as any);
      }

      // Link the event to this venue and record the deal the creator proposed.
      await storage.updateExperience(invite.experienceId, {
        linkedVenueId: venueId,
        venueStatus: 'venue_pending',
      } as any);

      const requested = buildRequestedVenueContractObject(experience);
      const existingContract = await storage.getVenueContractByExperience(invite.experienceId);
      if (!existingContract) {
        await storage.upsertVenueContract({
          experienceId: invite.experienceId,
          venueId,
          creatorId: invite.creatorId,
          model: requested.model,
          status: 'pending',
          terms: requested.terms,
          risk: requested.risk,
        } as any);
      }

      const claimed = await storage.updateVenueInvite(invite.id, {
        status: 'claimed',
        claimedByUserId: userId,
        claimedVenueId: venueId,
        claimedAt: invite.claimedAt ?? new Date(),
      });

      res.json({
        success: true,
        venueId,
        experienceId: invite.experienceId,
        invite: summariseVenueInvite(claimed, experience, null),
        message: 'Space claimed — review the offer to confirm the deal',
      });
    } catch (error: any) {
      console.error('Error claiming venue invite:', error);
      res.status(500).json({ message: 'Failed to claim this venue', detail: error?.message });
    }
  });

  app.post('/api/venue-invites/:token/decline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const invite = await storage.getVenueInviteByToken(String(req.params.token));
      if (!invite) return res.status(404).json({ message: 'This invitation link is not valid' });
      if (invite.claimedByUserId && invite.claimedByUserId !== userId) {
        return res.status(403).json({ message: 'This invitation belongs to another account' });
      }

      const declined = await storage.updateVenueInvite(invite.id, {
        status: 'declined',
        declineReason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null,
        claimedByUserId: userId,
        respondedAt: new Date(),
      });

      notifyCreatorOfVenueContractResolution(
        invite.experienceId,
        invite.venueName || 'The invited venue',
        'rejected',
        declined.declineReason,
      );

      res.json({ success: true, invite: { status: declined.status }, message: 'The organiser has been told' });
    } catch (error: any) {
      console.error('Error declining venue invite:', error);
      res.status(500).json({ message: 'Failed to decline this invitation' });
    }
  });

  // ─── External partner (promoter) invites ────────────────────────────────
  // The B2B promotion invite email links here. The deal row already exists
  // (promotion_deals, source external_direct, partnerEmail set); these routes
  // let the invited brand read the offer, claim it after signing up, and then
  // answer it through the existing /api/promoter/offers endpoints.

  app.get('/api/partner-invites/:token', async (req, res) => {
    try {
      const deal = await storage.getPromotionDealByInviteToken(String(req.params.token));
      if (!deal) return res.status(404).json({ message: 'This invitation link is not valid' });

      const [experience, creator] = await Promise.all([
        storage.getExperience(deal.experienceId),
        storage.getUser(deal.creatorId),
      ]);

      res.json({
        status: deal.status,
        pendingActionBy: deal.pendingActionBy,
        dealType: deal.dealType,
        terms: deal.terms || {},
        partnerName: deal.partnerName,
        email: deal.partnerEmail,
        claimed: !!deal.partnerId,
        dealSummary: formatPromotionDealSummary(deal.dealType, deal.terms, (experience as any)?.currency),
        experience: experience ? {
          id: experience.id,
          slug: experience.slug,
          title: experience.title,
          shortDescription: experience.shortDescription,
          coverImageUrl: experience.coverImageUrl,
          startDate: experience.startDate,
          endDate: experience.endDate,
          location: experience.location,
          currency: experience.currency,
          // A promoter on commission is being asked to sell these tickets —
          // the prices and the room size are what make the offer judgeable.
          capacity: resolveEventCapacity(experience),
          ticketTypes: summariseTicketTypes((experience as any).ticketSkus, experience.currency),
        } : null,
        creator: creator ? { firstName: creator.firstName, lastName: creator.lastName } : null,
      });
    } catch (error: any) {
      console.error('Error loading partner invite:', error);
      res.status(500).json({ message: 'Failed to load this invitation' });
    }
  });

  app.post('/api/partner-invites/:token/claim', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deal = await storage.getPromotionDealByInviteToken(String(req.params.token));
      if (!deal) return res.status(404).json({ message: 'This invitation link is not valid' });
      if (deal.partnerId && deal.partnerId !== userId) {
        return res.status(403).json({ message: 'This invitation has already been claimed by another account' });
      }

      const claimed = deal.partnerId === userId
        ? deal
        : await storage.claimPromotionDealInvite(String(req.params.token), userId);
      if (!claimed) return res.status(409).json({ message: 'This invitation could not be claimed' });

      // Partners share referral links — make sure the account has a code ready.
      await storage.ensureUserReferralCode(userId).catch(() => {});

      res.json({
        success: true,
        dealId: claimed.id,
        message: 'Offer linked to your account — accept or decline below',
      });
    } catch (error: any) {
      console.error('Error claiming partner invite:', error);
      res.status(500).json({ message: 'Failed to claim this invitation', detail: error?.message });
    }
  });

  // Stripe redirects here after a successful Venue Sponsorship checkout. This
  // closes the UI loop immediately even when webhook delivery is delayed.
  app.post('/api/venue/sponsorship/confirm', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionId = String(req.body?.sessionId || '');
      if (!sessionId.startsWith('cs_')) {
        return res.status(400).json({ message: 'A valid Stripe Checkout session is required' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.type !== 'venue_sponsorship' || session.payment_status !== 'paid') {
        return res.status(409).json({ message: 'Sponsorship payment is not complete' });
      }

      const venueId = session.metadata?.venueId;
      const userVenues = await storage.getVenuesByCreator(userId);
      if (!venueId || !userVenues.some((venue: any) => venue.id === venueId)) {
        return res.status(403).json({ message: 'This sponsorship payment does not belong to your venue' });
      }

      await finalizeVenueSponsorshipSession(session);
      const contract = session.metadata?.contractId
        ? await storage.getVenueContractById(session.metadata.contractId)
        : undefined;
      const paidVenue = userVenues.find((venue: any) => venue.id === venueId);
      if (session.metadata?.experienceId) {
        notifyCreatorOfVenueContractResolution(session.metadata.experienceId, paidVenue?.name, 'accepted');
      }
      res.json({ success: true, contract, message: 'Sponsorship paid and deal confirmed' });
    } catch (err: any) {
      console.error('Error confirming venue sponsorship:', err);
      res.status(500).json({ message: 'Failed to confirm sponsorship payment' });
    }
  });

  // Reject an offer → experience sent back to draft
  app.post('/api/venue/offers/:experienceId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;
      const { reason } = req.body;

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });

      const userVenues = await storage.getVenuesByCreator(userId);
      const linkedVenue = userVenues.find((v: any) => v.id === experience.linkedVenueId);
      const linkedToMyVenue = !!linkedVenue;
      if (!linkedToMyVenue) return res.status(403).json({ message: 'Access denied' });

      let contract = await storage.getVenueContractByExperience(experienceId);
      if (!contract) {
        contract = await storage.upsertVenueContract(buildVenueContractObject(
          experience,
          experienceId,
          experience.linkedVenueId,
          experience.creatorId
        ));
      }

      const declinedContract = await storage.declineVenueContract(experienceId, linkedVenue.id, reason);
      await releaseVenueDatesForExperience(experienceId);
      await storage.updateExperienceStatus(experienceId, 'draft');
      notifyCreatorOfVenueContractResolution(experienceId, linkedVenue.name, 'rejected', reason);
      res.json({ success: true, contract: declinedContract, message: 'Offer rejected — experience returned to creator' });
    } catch (err: any) {
      console.error('Error rejecting venue offer:', err);
      res.status(500).json({ message: 'Failed to reject offer' });
    }
  });

  // Venue Ledger — real sales totals broken down by the accepted split
  // A venue can negotiate a direct creator invitation instead of accepting or rejecting it.
  // Direct counters bypass marketplace admin review because the creator selected this venue.
  app.post('/api/venue/offers/:experienceId/counter', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;
      const { model, terms, message } = req.body || {};

      if (!isVenueDealModel(model)) {
        return res.status(400).json({ message: 'Unsupported venue deal model' });
      }
      if (!isVenueDealSelectable(model)) {
        return res.status(400).json({ message: 'This venue deal model is currently unavailable' });
      }

      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });

      const userVenues = await storage.getVenuesByCreator(userId);
      const linkedVenue = userVenues.find((venue: any) => venue.id === experience.linkedVenueId);
      if (!linkedVenue) return res.status(403).json({ message: 'Access denied' });

      const contract = await storage.getVenueContractByExperience(experienceId);
      if (!contract || contract.venueId !== linkedVenue.id) {
        return res.status(404).json({ message: 'Venue contract not found' });
      }
      if (contract.status !== 'pending') {
        return res.status(409).json({ message: 'This venue invitation is no longer available to counter' });
      }

      let normalizedTerms;
      try {
        normalizedTerms = normalizeVenueDealTerms(model, terms, (experience as any).currency || 'EUR');
      } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Invalid venue deal terms' });
      }

      const offer = await storage.createVenueOffer({
        experienceId,
        venueId: linkedVenue.id,
        venueOwnerId: userId,
        model,
        terms: normalizedTerms,
        message,
        status: 'pending',
      });
      const counteredContract = await storage.updateVenueContractProposal(
        experienceId,
        linkedVenue.id,
        model,
        normalizedTerms,
        'countered',
      );

      (async () => {
        const creator = await storage.getUser((experience as any).creatorId);
        if (!creator?.email) return;
        await notificationService.sendVenueBidReceivedEmail({
          to: creator.email,
          recipientName: creator.firstName,
          venueName: linkedVenue.name,
          experienceTitle: (experience as any).title,
          experienceSlugOrId: (experience as any).slug || experienceId,
          model,
          terms: normalizedTerms,
          currency: (experience as any).currency,
          message,
        });
      })().catch((error) => console.error('Venue counter-offer email failed:', error?.message || error));

      res.status(201).json({ offer, contract: counteredContract, message: 'Counter offer sent to creator' });
    } catch (err: any) {
      console.error('Error countering venue offer:', err);
      res.status(500).json({ message: 'Failed to submit counter offer' });
    }
  });

  /**
   * What a venue has earned on the platform — and nothing else.
   *
   * This used to report the creator's gross ticket revenue as the venue's
   * "Total Sales". A coffee shop being asked to sponsor an event for 50 could
   * therefore see that the run club had taken 8 in ticket sales, which is not
   * the venue's money and not their business. The creator's takings are gone
   * from this response entirely; a venue sees what it is owed, what it owes,
   * and which event each figure came from.
   *
   * The old "my share" was wrong too: it only ever applied
   * venueRevenuePercentage, so a venue on a per-ticket deduction, a per-head
   * package or a rental agreement was told it had earned nothing.
   */
  app.get('/api/venue/ledger', isAuthenticated, async (req: any, res) => {
    const empty = {
      earned: 0,
      owed: 0,
      currency: 'eur',
      eventsCount: 0,
      attendees: 0,
      mixedCurrencies: false,
      events: [] as any[],
    };
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const userVenues = await storage.getVenuesByCreator(userId);
      if (!userVenues.length) return res.json(empty);

      const venueIds = userVenues.map((v: any) => v.id);
      // Only agreed deals count. An offer still being negotiated is not income.
      const contracted = await storage.getVenueContractsByVenueIds(venueIds, 'accepted');
      if (!contracted.length) return res.json(empty);

      const events = await Promise.all(contracted.map(async (row: any) => {
        const contract = row.contract;
        const model = contract?.model || row.venueCompensationModel;
        const terms = contract?.terms || {};

        const bookings = await storage.getBookingsByExperience(row.id);
        const active = (bookings || []).filter((booking: any) =>
          isActiveParticipantBooking(booking.status));
        const attendees = sumBookingTicketQuantity(active);
        const grossRevenue = active.reduce(
          (sum: number, booking: any) => sum + numberOrZero(booking.amount), 0);

        const termsKey = getVenueDealTermsKey(model);
        const value = numberOrZero(
          (termsKey ? terms[termsKey] : undefined)
          ?? readExperienceVenueDealValueFor(row, model),
        );

        const rooms: any[] = Array.isArray(row.rooms) ? row.rooms : [];
        const nights = row.startDate && row.endDate
          ? Math.max(1, Math.round(
              (new Date(row.endDate).getTime() - new Date(row.startDate).getTime()) / 86_400_000))
          : 1;
        const roomNights = rooms.reduce(
          (total: number, room: any) => total + (numberOrZero(room?.quantity) * nights), 0);

        const { earned, owed, offPlatform } = calculateVenueEarnings({
          model,
          value,
          grossRevenue,
          attendees,
          roomNights,
        });

        return {
          experienceId: row.id,
          title: row.title,
          startDate: row.startDate,
          currency: (row.currency || terms.currency || 'eur').toLowerCase(),
          model,
          dealSummary: formatVenueDealSummary(model, terms, row.currency || 'eur'),
          attendees,
          earned: Math.round(earned * 100) / 100,
          owed: Math.round(owed * 100) / 100,
          offPlatform,
          // Sponsorship is only real once it has cleared Stripe.
          settled: model === 'venue_sponsored'
            ? contract?.sponsorshipPaymentStatus === 'paid'
            : true,
        };
      }));

      const currencies = Array.from(new Set(events.map((event) => event.currency)));
      const totals = events.reduce((sum, event) => ({
        earned: sum.earned + event.earned,
        owed: sum.owed + event.owed,
        attendees: sum.attendees + event.attendees,
      }), { earned: 0, owed: 0, attendees: 0 });

      res.json({
        earned: Math.round(totals.earned * 100) / 100,
        owed: Math.round(totals.owed * 100) / 100,
        attendees: totals.attendees,
        eventsCount: events.length,
        currency: currencies[0] || 'eur',
        mixedCurrencies: currencies.length > 1,
        events: events.sort((a, b) =>
          new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime()),
      });
    } catch (err: any) {
      console.error('Error fetching venue ledger:', err);
      res.status(500).json({ message: 'Failed to fetch ledger' });
    }
  });

  // ── Open Events Feed (Venue Bidding) ──────────────────────────────────────
  // Returns all published experiences actively seeking a venue (venueStatus = "venue_pending").
  // Authenticated venue owners use this to discover creators looking for a space.
  // Optional ?city= query param narrows results by location substring match.
  app.get('/api/venue/open-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const city = typeof req.query.city === 'string' ? req.query.city : undefined;
      const seekingEvents = await storage.getOpenVenueEvents(city);
      const userVenues = await storage.getVenuesByCreator(userId);
      const confirmedEvents = userVenues.length
        ? (await storage.getExperiencesByVenueIds(userVenues.map((venue: any) => venue.id)))
          .filter((event: any) => event.status === 'approved' || event.status === 'published')
          .filter((event: any) => !city || String(event.location || '').toLowerCase().includes(city.toLowerCase()))
        : [];
      const events = [
        ...confirmedEvents.map((event: any) => ({ ...event, venueRelationshipStatus: 'confirmed' })),
        ...seekingEvents
          .filter((event: any) => !confirmedEvents.some((confirmed: any) => confirmed.id === event.id))
          .map((event: any) => ({ ...event, venueRelationshipStatus: 'seeking' })),
      ];
      // Return only the fields the venue dashboard needs — avoids leaking pricing internals
      const feed = events.map((e: any) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        maxParticipants: e.maxParticipants,
        venueOpenSpaceType: e.venueOpenSpaceType,
        venueTargetDeal: e.venueTargetDeal,
        venueTargetDealValue: e.venueTargetDealValue,
        requestedContract: buildRequestedVenueContractObject(e),
        price: e.price,
        currency: e.currency,
        platformPct: FIXED_PLATFORM_FEE_PCT,
        venueRelationshipStatus: e.venueRelationshipStatus,
        linkedVenueId: e.linkedVenueId,
        category: e.category,
        shortDescription: e.shortDescription,
        experienceType: e.experienceType,
        createdAt: e.createdAt,
      }));
      res.json(feed);
    } catch (err: any) {
      console.error('Error fetching open venue events:', err);
      res.status(500).json({ message: 'Failed to fetch open events' });
    }
  });

  // ── Reverse Handshake: Venue → Creator offers ─────────────────────────────

  // Creator resolved an Offer to Host bid → notify the venue owner (fire-and-forget).
  const notifyVenueOwnerOfBidResolution = (offer: any, action: 'accepted' | 'declined') => {
    (async () => {
      const [owner, venue, experience] = await Promise.all([
        storage.getUser(offer.venueOwnerId),
        storage.getVenue(offer.venueId),
        storage.getExperience(offer.experienceId),
      ]);
      if (!owner?.email || !experience) return;
      await notificationService.sendVenueBidResolvedEmail({
        to: owner.email,
        recipientName: owner.firstName,
        venueName: venue?.name,
        experienceTitle: experience.title,
        experienceSlugOrId: (experience as any).slug || experience.id,
        action,
        model: offer.model,
        terms: offer.terms,
        currency: (experience as any).currency,
      });
    })().catch((err) => console.error('Venue bid resolution email failed:', err?.message || err));
  };

  // POST /api/venue/open-events/:experienceId/offer
  // Venue owner submits a "Offer to Host" bid with their Commercial Model terms.
  // Stored in venueOffers; creator reviews all bids in their dashboard.
  app.post('/api/venue/open-events/:experienceId/offer', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { experienceId } = req.params;
      const { venueId, model, terms, message } = req.body;

      if (!venueId || !model) {
        return res.status(400).json({ message: 'venueId and model are required' });
      }
      if (!isVenueDealModel(model)) {
        return res.status(400).json({ message: 'Unsupported venue deal model' });
      }
      if (!isVenueDealSelectable(model)) {
        return res.status(400).json({ message: 'This venue deal model is currently unavailable' });
      }

      // Verify the experience is actually open for bids
      const experience = await storage.getExperience(experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });
      if ((experience as any).venueStatus !== 'venue_pending') {
        return res.status(400).json({ message: 'This event is not accepting venue bids' });
      }

      // Verify the venue belongs to this user
      const userVenues = await storage.getVenuesByCreator(userId);
      const ownedVenue = userVenues.find((v: any) => v.id === venueId);
      if (!ownedVenue) return res.status(403).json({ message: 'You do not own that venue' });

      // Venue must be admin-approved before it can submit offers
      if ((ownedVenue as any).status !== 'approved') {
        return res.status(403).json({ message: 'Your venue must be approved by admin before you can submit offers' });
      }

      let normalizedTerms;
      try {
        normalizedTerms = normalizeVenueDealTerms(model, terms, (experience as any).currency || 'EUR');
      } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Invalid venue deal terms' });
      }

      const offer = await storage.createVenueOffer({
        experienceId,
        venueId,
        venueOwnerId: userId,
        model,
        terms: normalizedTerms,
        message,
      });

      // The bid lands in the creator's Venue Offers tab straight away, so the
      // Digital Handshake email goes out now rather than after an admin step.
      (async () => {
        const creator = await storage.getUser((experience as any).creatorId);
        if (!creator?.email) return;
        await notificationService.sendVenueBidReceivedEmail({
          to: creator.email,
          recipientName: creator.firstName,
          venueName: (ownedVenue as any)?.name,
          experienceTitle: (experience as any).title,
          experienceSlugOrId: (experience as any).slug || experienceId,
          model,
          terms: normalizedTerms,
          currency: (experience as any).currency,
          message,
        });
      })().catch((err) => console.error('Venue bid email failed:', err?.message || err));

      res.status(201).json(offer);
    } catch (err: any) {
      console.error('Error creating venue offer:', err);
      res.status(500).json({ message: 'Failed to submit offer' });
    }
  });

  // GET /api/admin/venue-offers — bids still queued from before bids went
  // straight to creators. Empties out as they are released; nothing refills it.
  app.get('/api/admin/venue-offers', isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      if (!isAdmin) return res.status(403).json({ message: 'Admin access required' });
      const { page, pageSize, offset } = paginationFrom(req.query);
      const where = eq((venueOffers as any).status, "admin_review");
      const [items, totals] = await Promise.all([
        db.select({ offer: venueOffers, venue: venues, experience: experiences }).from(venueOffers).leftJoin(venues, eq(venueOffers.venueId, venues.id)).leftJoin(experiences, eq(venueOffers.experienceId, experiences.id)).where(where).orderBy(desc((venueOffers as any).createdAt)).limit(pageSize).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(venueOffers).where(where),
      ]);
      const total = Number(totals[0]?.count || 0);
      res.json({ items: items.map((row: any) => ({ ...row, venue: stripVenuePricing(row.venue) })), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
    } catch (err: any) {
      console.error('Error fetching admin venue offers:', err);
      res.status(500).json({ message: 'Failed to fetch venue offers' });
    }
  });

  /**
   * POST /api/admin/venue-offers/:offerId/approve — release a legacy queued bid.
   *
   * New bids never enter this queue: they go straight to the creator's Venue
   * Offers tab. This only exists to release bids submitted before that change,
   * which would otherwise stay invisible to the creator forever.
   */
  app.post('/api/admin/venue-offers/:offerId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      if (!isAdmin) return res.status(403).json({ message: 'Admin access required' });
      const offer = await storage.getVenueOffer(req.params.offerId);
      if (!offer) return res.status(404).json({ message: 'Offer not found' });
      const updated = await storage.approveVenueOffer(req.params.offerId);

      // Bid is now visible to the creator — send the Digital Handshake proposal email.
      (async () => {
        const [experience, venue] = await Promise.all([
          storage.getExperience(offer.experienceId),
          storage.getVenue(offer.venueId),
        ]);
        if (!experience) return;
        const creator = await storage.getUser(experience.creatorId);
        if (!creator?.email) return;
        await notificationService.sendVenueBidReceivedEmail({
          to: creator.email,
          recipientName: creator.firstName,
          venueName: venue?.name,
          experienceTitle: experience.title,
          experienceSlugOrId: (experience as any).slug || experience.id,
          model: offer.model,
          terms: offer.terms,
          currency: (experience as any).currency,
          message: offer.message,
        });
      })().catch((err) => console.error('Venue bid email failed:', err?.message || err));

      res.json(updated);
    } catch (err: any) {
      console.error('Error approving venue offer:', err);
      res.status(500).json({ message: 'Failed to approve offer' });
    }
  });

  // POST /api/admin/venue-offers/:offerId/reject — admin rejects, declines the offer
  app.post('/api/admin/venue-offers/:offerId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const isAdmin = await checkIsAdmin(req);
      if (!isAdmin) return res.status(403).json({ message: 'Admin access required' });
      const offer = await storage.getVenueOffer(req.params.offerId);
      if (!offer) return res.status(404).json({ message: 'Offer not found' });
      const updated = await storage.rejectVenueOfferByAdmin(req.params.offerId);
      res.json(updated);
    } catch (err: any) {
      console.error('Error rejecting venue offer:', err);
      res.status(500).json({ message: 'Failed to reject offer' });
    }
  });

  // GET /api/creator/venue-offers
  // Creator retrieves all incoming venue bids for their open events.
  app.get('/api/creator/venue-offers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const offers = await storage.getVenueOffersForCreator(userId);
      res.json(offers);
    } catch (err: any) {
      console.error('Error fetching creator venue offers:', err);
      res.status(500).json({ message: 'Failed to fetch venue offers' });
    }
  });

  // Invitations the creator emailed to off-platform venues and is still
  // waiting on. They carry no accept button — only the venue can move them.
  app.get('/api/creator/venue-invites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      res.json(await storage.getPendingVenueInvitesForCreator(userId));
    } catch (err: any) {
      console.error('Error fetching creator venue invites:', err);
      res.status(500).json({ message: 'Failed to fetch venue invites' });
    }
  });

  /**
   * Send an outstanding venue invitation again.
   *
   * Invitations get lost — filtered, mistyped, buried. Before this the only
   * remedy was to rebuild and republish the whole event, so the creator's
   * choice was between a broken deal and redoing an hour of work.
   *
   * The invite keeps its token, so a link the venue may still have in an older
   * mail stays valid; only the expiry is pushed out.
   */
  app.post('/api/creator/venue-invites/:inviteId/resend', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const invite = await storage.getVenueInviteById(String(req.params.inviteId));
      if (!invite) return res.status(404).json({ message: 'That invitation no longer exists' });
      if (invite.creatorId !== userId) {
        return res.status(403).json({ message: 'That invitation belongs to another creator' });
      }
      // Claimed, accepted or declined means the venue did receive it and
      // answered. Sending it again would only muddy a settled deal.
      if (invite.status !== 'pending' && invite.status !== 'expired') {
        return res.status(409).json({
          message: `This venue has already responded to the invitation (${invite.status}).`,
        });
      }

      // The button fires at somebody else's inbox, so a repeated click must not
      // become a repeated email.
      const lastAttemptAt = await getLastEmailAttemptAt('external_partner_invite', invite.email);
      const msSinceLastSend = lastAttemptAt ? Date.now() - new Date(lastAttemptAt).getTime() : Infinity;
      if (msSinceLastSend < VENUE_INVITE_RESEND_COOLDOWN_MS) {
        const minutes = Math.max(1, Math.ceil((VENUE_INVITE_RESEND_COOLDOWN_MS - msSinceLastSend) / 60000));
        return res.status(429).json({
          message: `An invitation already went to ${invite.email} moments ago. You can send it again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        });
      }

      const experience = await storage.getExperience(invite.experienceId);
      if (!experience) return res.status(404).json({ message: 'That event no longer exists' });

      const expiresAt = new Date(Date.now() + VENUE_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      await notificationService.sendExternalVenueInvitation({
        ...(experience as any),
        id: experience.id,
        slug: (experience as any).slug,
        creatorId: invite.creatorId,
        // The invite row, not the event, is the record of who was asked and on
        // what terms — the event may have moved on since.
        manualVenueEmail: invite.email,
        manualVenueContactName: invite.contactName,
        manualVenueName: invite.venueName,
        venueTargetDeal: invite.proposedModel,
        venueTargetDealValue: invite.proposedValue,
        currency: invite.currency || (experience as any).currency,
        inviteToken: invite.token,
        resendKey: String(Date.now()),
      });

      // Only once the email is away, so a failed send leaves the invite as it was.
      const refreshed = await storage.updateVenueInvite(invite.id, {
        status: 'pending',
        expiresAt,
      } as any);

      res.json({
        success: true,
        email: invite.email,
        lastSentAt: refreshed?.updatedAt ?? new Date(),
        expiresAt,
      });
    } catch (err: any) {
      console.error('Error resending venue invite:', err);
      res.status(500).json({ message: err?.message || 'Failed to resend this invitation' });
    }
  });

  // GET /api/creator/venue-offers/accepted
  // Creator retrieves all accepted (confirmed) venue deals — shows deal terms after acceptance.
  app.get('/api/creator/venue-offers/accepted', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deals = await storage.getAcceptedVenueOffersForCreator(userId);
      res.json(deals);
    } catch (err: any) {
      console.error('Error fetching accepted venue deals:', err);
      res.status(500).json({ message: 'Failed to fetch accepted deals' });
    }
  });

  // POST /api/creator/venue-offers/:offerId/accept
  // Creator accepts a venue bid: links the venue to the event and marks it confirmed.
  // For upfront_rental model: creator's card is charged first via Stripe Checkout.
  // All other pending bids for the same experience are automatically declined.
  app.post('/api/creator/venue-offers/:offerId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { offerId } = req.params;

      const offer = await storage.getVenueOffer(offerId);
      if (!offer) return res.status(404).json({ message: 'Offer not found' });
      if (offer.status !== 'pending') {
        return res.status(409).json({ message: 'This venue offer is no longer pending' });
      }

      // Verify creator owns the experience
      const experience = await storage.getExperience(offer.experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });
      if ((experience as any).creatorId !== userId) {
        return res.status(403).json({ message: 'Not your experience' });
      }

      const activationBlock = await resolveMvgActivationBlock(offer.experienceId);
      if (activationBlock) {
        return res.status(409).json({
          message: activationBlock.message,
          status: 'cancelled',
          mvgStatus: 'failed',
        });
      }


      // The venue's imported calendars are the authority on whether it is
      // free. Checked again here because a feed can change between the
      // creator picking dates and the creator accepting.
      const dateConflicts = await findVenueDateConflicts(
        offer.venueId,
        experience.startDate as any,
        (experience as any).endDate,
      );
      if (dateConflicts.length > 0) {
        return res.status(409).json({
          message: 'Those dates are no longer free on the venue calendar.',
          conflicts: dateConflicts,
        });
      }

      const directContract = await storage.getVenueContractByExperience(offer.experienceId);
      const isDirectCounter = directContract?.venueId === offer.venueId && directContract.status === 'countered';

      // Fetch the venue so we can copy its address onto the experience
      const venue = await storage.getVenue(offer.venueId);

      // Copy offer terms onto the experience (needed before any Stripe charge so
      // the webhook can read them when it completes the deal)
      await storage.updateExperience(offer.experienceId, {
        linkedVenueId: offer.venueId,
        venueStatus: offer.model === 'venue_sponsored' ? 'venue_pending' : 'venue_confirmed',
        venueType: 'catalog',
        location: venue?.location ?? (experience as any).location,
        venueCompensationModel: offer.model,
        venueFixedFee: offer.terms?.fixedFee?.toString() ?? '0.00',
        venuePerHeadAmount: offer.terms?.perHeadAmount?.toString() ?? '0.00',
        venueMinimumSpend: offer.terms?.minimumSpend?.toString() ?? '0.00',
        venueRevenueSharePct: offer.terms?.revenueSharePct?.toString() ?? '0.00',
        venueAccessFee: offer.terms?.accessFee?.toString() ?? '0.00',
      } as any);

      // ── Upfront Rental: charge the creator before going live ─────────────
      if (offer.model === 'upfront_rental') {
        const rentalAmount = parseFloat(String(offer.terms?.fixedFee ?? 0));
        const currency = ((experience as any).currency || 'eur').toLowerCase();

        if (rentalAmount <= 0) {
          return res.status(400).json({ message: 'Upfront rental offer requires a non-zero fixedFee as the rental amount' });
        }

        // Upsert the venue contract in pending_payment state so the webhook can find it
        let contract = await storage.getVenueContractByExperience(offer.experienceId);
        if (!contract) {
          contract = await storage.upsertVenueContract(buildVenueContractObject(
            experience,
            offer.experienceId,
            offer.venueId,
            userId,
          ));
        }
        await storage.updateVenueContractSponsorshipStatus(contract.id, 'unpaid');

        // Mark this offer as accepted & decline competing offers now (before payment)
        await storage.updateVenueOfferStatus(offerId, 'accepted');
        const otherOffers = await storage.getVenueOffersForExperience(offer.experienceId);
        for (const row of otherOffers) {
          const o = row.offer ?? row;
          if (o.id !== offerId && o.status === 'pending') {
            await storage.updateVenueOfferStatus(o.id, 'declined');
            notifyVenueOwnerOfBidResolution(o, 'declined');
          }
        }
        notifyVenueOwnerOfBidResolution(offer, 'accepted');

        // Create Stripe Checkout Session — creator pays the venue rental fee
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const rentalMeta = {
          type: 'upfront_rental',
          contractId: contract.id,
          experienceId: offer.experienceId,
          creatorId: userId,
          venueId: offer.venueId,
          rentalAmountCents: Math.round(rentalAmount * 100).toString(),
        };
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(rentalAmount * 100),
              product_data: {
                name: `Venue Rental — ${venue?.name ?? 'Venue'}`,
                description: `Upfront rental fee for ${(experience as any).title || 'your event'}.`,
              },
            },
          }],
          metadata: rentalMeta,
          payment_intent_data: { metadata: rentalMeta },
          success_url: `${baseUrl}/creator-dashboard?rental=success&experience=${offer.experienceId}`,
          cancel_url: `${baseUrl}/creator-dashboard?rental=cancelled&experience=${offer.experienceId}`,
        });

        return res.json({
          requiresPayment: true,
          checkoutUrl: session.url,
          message: `Complete rental payment of ${rentalAmount} ${currency.toUpperCase()} to activate the event`,
        });
      }

      // ── Standard deals: accept immediately → event goes Live ─────────────
      // Sponsorship money runs venue → creator, so accepting is not the end of
      // it. The creator agrees first; the venue then sees the agreed sponsorship
      // in Pending Offers and pays it through the existing Stripe flow. This
      // holds for a bid offered out of the blue as much as for a counter —
      // without it a venue could sponsor an event and never be charged.
      if (offer.model === 'venue_sponsored') {
        const accepted = await storage.updateVenueOfferStatus(offerId, 'accepted');
        // A countered proposal already has a contract row to update. A
        // reverse-marketplace bid has none, so write one in the same pending
        // state the sponsorship checkout expects to find.
        const existingContract = await storage.getVenueContractByExperience(offer.experienceId);
        if (existingContract && existingContract.venueId === offer.venueId) {
          await storage.updateVenueContractProposal(
            offer.experienceId,
            offer.venueId,
            offer.model,
            offer.terms,
            'pending',
          );
        } else {
          const proposed = buildVenueContractObject(experience, offer.experienceId, offer.venueId, userId);
          await storage.upsertVenueContract({
            ...proposed,
            model: offer.model,
            terms: { ...proposed.terms, ...(offer.terms || {}) },
            status: 'pending',
          } as any);
        }
        const otherOffers = await storage.getVenueOffersForExperience(offer.experienceId);
        for (const row of otherOffers) {
          const competingOffer = row.offer ?? row;
          if (competingOffer.id !== offerId && competingOffer.status === 'pending') {
            await storage.updateVenueOfferStatus(competingOffer.id, 'declined');
            notifyVenueOwnerOfBidResolution(competingOffer, 'declined');
          }
        }
        notifyVenueOwnerOfBidResolution(offer, 'accepted');
        return res.json({
          accepted,
          awaitingVenuePayment: true,
          message: 'Sponsorship agreed. The venue must complete the payment before the event goes live.',
        });
      }

      const accepted = await storage.updateVenueOfferStatus(offerId, 'accepted');

      if (isDirectCounter) {
        await storage.acceptVenueContract(offer.experienceId, offer.venueId);
        await storage.updateExperienceStatus(offer.experienceId, 'approved');
      }
      await blockVenueDatesForExperience(
        offer.venueId,
        offer.experienceId,
        experience.startDate as any,
        (experience as any).endDate,
        experience.title,
      );
      if (isDirectCounter) {
        const liveExperience = await storage.getExperience(offer.experienceId);
        notifyCreatorEventPublished(liveExperience).catch((error) => {
          console.error("Failed to send event published email:", error);
        });
      }

      const otherOffers = await storage.getVenueOffersForExperience(offer.experienceId);
      for (const row of otherOffers) {
        const o = row.offer ?? row;
        if (o.id !== offerId && o.status === 'pending') {
          await storage.updateVenueOfferStatus(o.id, 'declined');
          notifyVenueOwnerOfBidResolution(o, 'declined');
        }
      }

      notifyVenueOwnerOfBidResolution(offer, 'accepted');
      res.json({ accepted, message: 'Venue linked successfully' });
    } catch (err: any) {
      console.error('Error accepting venue offer:', err);
      res.status(500).json({ message: 'Failed to accept offer' });
    }
  });

  // POST /api/creator/venue-offers/:offerId/decline
  // Creator declines a specific venue bid.
  app.post('/api/creator/venue-offers/:offerId/decline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { offerId } = req.params;

      const offer = await storage.getVenueOffer(offerId);
      if (!offer) return res.status(404).json({ message: 'Offer not found' });
      if (offer.status !== 'pending') {
        return res.status(409).json({ message: 'This venue offer is no longer pending' });
      }

      const experience = await storage.getExperience(offer.experienceId);
      if (!experience) return res.status(404).json({ message: 'Experience not found' });
      if ((experience as any).creatorId !== userId) {
        return res.status(403).json({ message: 'Not your experience' });
      }

      const declined = await storage.updateVenueOfferStatus(offerId, 'declined');
      const directContract = await storage.getVenueContractByExperience(offer.experienceId);
      if (directContract?.venueId === offer.venueId && directContract.status === 'countered') {
        await storage.declineVenueContract(offer.experienceId, offer.venueId, 'Creator declined venue counter offer');
        await releaseVenueDatesForExperience(offer.experienceId);
        await storage.updateExperienceStatus(offer.experienceId, 'draft');
      }
      notifyVenueOwnerOfBidResolution(offer, 'declined');
      res.json(declined);
    } catch (err: any) {
      console.error('Error declining venue offer:', err);
      res.status(500).json({ message: 'Failed to decline offer' });
    }
  });

  // Creator Ledger — total sales + My Share based on accepted creatorPct
  // Header ledger strip. Same numbers as /api/creator/earnings — one source.
  app.get('/api/creator/ledger', isAuthenticated, async (req: any, res) => {
    try {
      const { summary } = await getCreatorEarningsBreakdown(req.user.claims.sub);
      res.json({
        currency: summary.currency,
        totalSales: summary.totalGross,
        collected: summary.totalCollected,
        outstandingBalance: summary.outstandingBalance,
        myShare: summary.totalEarnings,
        platformFees: summary.totalPlatformFees,
        platformFeePct: summary.effectivePlatformFeePct,
        spaceShare: summary.totalSpaceShare,
        bookingsCount: summary.bookingsCount,
      });
    } catch (err: any) {
      console.error('Error fetching creator ledger:', err);
      res.status(500).json({ message: 'Failed to fetch ledger' });
    }
  });

  return httpServer;
}

// Helper function to generate itinerary suggestions based on category and type
function generateItinerarySuggestions(experienceType: string, category: string, subcategory?: string) {
  const baseActivities = {
    "Sports & Wellness": {
      "Yoga & Meditation": [
        { time: "07:00", name: "Morning Meditation", description: "Start the day with mindful breathing and centering practices" },
        { time: "08:30", name: "Sunrise Yoga Flow", description: "Energizing vinyasa flow to awaken the body" },
        { time: "10:00", name: "Breakfast & Mindful Eating", description: "Nourishing meal with conscious consumption practices" },
        { time: "14:00", name: "Yin Yoga Practice", description: "Restorative poses for deep relaxation" },
        { time: "16:00", name: "Walking Meditation", description: "Mindful movement in nature" },
        { time: "19:00", name: "Evening Reflection", description: "Journaling and gratitude practice" }
      ],
      "Fitness & Training": [
        { time: "06:30", name: "Morning Warm-up", description: "Dynamic stretching and mobility work" },
        { time: "07:00", name: "HIIT Training", description: "High-intensity interval training session" },
        { time: "09:00", name: "Nutrition Workshop", description: "Learn about optimal fuel for performance" },
        { time: "11:00", name: "Strength Training", description: "Functional movement and resistance work" },
        { time: "15:00", name: "Recovery Session", description: "Foam rolling and recovery techniques" },
        { time: "17:00", name: "Goal Setting Workshop", description: "Plan your fitness journey" }
      ]
    },
    "Retreats": {
      "Spiritual Retreats": [
        { time: "06:00", name: "Sacred Morning Ritual", description: "Connect with your spiritual practice" },
        { time: "08:00", name: "Community Breakfast", description: "Shared meal in sacred space" },
        { time: "10:00", name: "Wisdom Teaching", description: "Learning from spiritual traditions" },
        { time: "14:00", name: "Silent Contemplation", description: "Time for inner reflection" },
        { time: "16:00", name: "Nature Connection", description: "Walking meditation in natural setting" },
        { time: "19:00", name: "Evening Circle", description: "Sharing and community building" }
      ],
      "Digital Detox": [
        { time: "08:00", name: "Device Check-in", description: "Safely store all digital devices" },
        { time: "09:00", name: "Nature Immersion", description: "Forest bathing and connection" },
        { time: "11:00", name: "Analog Creative Time", description: "Art, writing, or crafts without screens" },
        { time: "14:00", name: "Mindful Movement", description: "Yoga or tai chi practice" },
        { time: "16:00", name: "Real-world Skills", description: "Gardening, cooking, or building" },
        { time: "19:00", name: "Campfire Stories", description: "Oral storytelling and connection" }
      ]
    },
    "Adventure Trips": {
      "Hiking & Trekking": [
        { time: "06:00", name: "Trail Preparation", description: "Equipment check and route briefing" },
        { time: "07:00", name: "Mountain Ascent", description: "Begin the challenging trek to summit" },
        { time: "12:00", name: "Peak Lunch", description: "Celebrate reaching the summit with mountain views" },
        { time: "14:00", name: "Descent & Photography", description: "Capture memories on the way down" },
        { time: "17:00", name: "Base Camp Return", description: "Rest and recovery at camp" },
        { time: "19:00", name: "Campfire Reflection", description: "Share stories of the day's adventure" }
      ],
      "Water Sports": [
        { time: "08:00", name: "Safety Briefing", description: "Water safety and equipment orientation" },
        { time: "09:00", name: "Skills Training", description: "Learn fundamental techniques" },
        { time: "11:00", name: "Open Water Practice", description: "Apply skills in real conditions" },
        { time: "14:00", name: "Adventure Session", description: "Explore new areas with confidence" },
        { time: "16:00", name: "Free Practice", description: "Independent exploration time" },
        { time: "18:00", name: "Equipment Care", description: "Maintenance and storage" }
      ]
    },
    "Workations": {
      "Digital Nomad": [
        { time: "08:00", name: "Co-working Setup", description: "Establish productive workspace" },
        { time: "09:00", name: "Focused Work Block", description: "Deep work session" },
        { time: "12:00", name: "Networking Lunch", description: "Connect with fellow nomads" },
        { time: "14:00", name: "Local Exploration", description: "Discover the neighborhood" },
        { time: "16:00", name: "Collaborative Work", description: "Group projects and brainstorming" },
        { time: "19:00", name: "Social Hour", description: "Unwind and build community" }
      ],
      "Creative Workspaces": [
        { time: "09:00", name: "Morning Inspiration", description: "Creative exercises and warm-ups" },
        { time: "10:00", name: "Project Development", description: "Work on individual creative projects" },
        { time: "12:00", name: "Peer Feedback", description: "Share work and get constructive input" },
        { time: "14:00", name: "Skill Building", description: "Learn new techniques or tools" },
        { time: "16:00", name: "Collaborative Creation", description: "Team projects and joint ventures" },
        { time: "18:00", name: "Showcase Prep", description: "Prepare work for evening presentation" }
      ]
    },
    "Community & Social": {
      "Networking Events": [
        { time: "18:00", name: "Welcome Reception", description: "Icebreakers and initial connections" },
        { time: "19:00", name: "Speed Networking", description: "Fast-paced professional introductions" },
        { time: "20:00", name: "Industry Insights", description: "Panel discussion with experts" },
        { time: "21:00", name: "Casual Mingling", description: "Organic conversation and connections" },
        { time: "22:00", name: "Contact Exchange", description: "Formal exchange of business information" }
      ],
      "Cultural Exchange": [
        { time: "10:00", name: "Cultural Presentations", description: "Share traditions from different backgrounds" },
        { time: "12:00", name: "International Potluck", description: "Taste dishes from around the world" },
        { time: "14:00", name: "Language Exchange", description: "Practice speaking different languages" },
        { time: "16:00", name: "Traditional Arts", description: "Learn crafts or art forms from various cultures" },
        { time: "18:00", name: "Music & Dance", description: "Experience global rhythms and movements" },
        { time: "20:00", name: "Storytelling Circle", description: "Share folk tales and personal stories" }
      ]
    },
    "Festivals & Events": {
      "Music Festivals": [
        { time: "14:00", name: "Festival Gates Open", description: "Entry and venue exploration" },
        { time: "15:00", name: "Opening Act", description: "Local artists warm up the crowd" },
        { time: "17:00", name: "Main Stage Performance", description: "Featured artist headline set" },
        { time: "19:00", name: "Food & Vendor Exploration", description: "Discover local cuisine and crafts" },
        { time: "21:00", name: "Headliner Performance", description: "Main event with top billing artist" },
        { time: "23:00", name: "After Party", description: "Continue the celebration" }
      ],
      "Art & Culture": [
        { time: "10:00", name: "Gallery Opening", description: "Preview of featured exhibitions" },
        { time: "11:30", name: "Artist Talk", description: "Meet the creators behind the work" },
        { time: "13:00", name: "Interactive Workshop", description: "Hands-on creative experience" },
        { time: "15:00", name: "Performance Art", description: "Live artistic presentations" },
        { time: "17:00", name: "Community Art Project", description: "Collaborative creation opportunity" },
        { time: "19:00", name: "Closing Reception", description: "Celebrate the day's artistic journey" }
      ]
    }
  };

  // Default to one-day experience structure
  const categoryActivities = baseActivities[category as keyof typeof baseActivities];
  const defaultSubcategory = categoryActivities ? Object.keys(categoryActivities)[0] : '';
  let suggestedActivities = (categoryActivities as any)?.[subcategory || defaultSubcategory] || [
    { time: "09:00", name: "Welcome & Introduction", description: "Meet your fellow participants and overview the experience" },
    { time: "10:00", name: "Main Activity", description: "Core experience activity" },
    { time: "12:00", name: "Lunch Break", description: "Shared meal and networking" },
    { time: "14:00", name: "Hands-on Workshop", description: "Interactive learning session" },
    { time: "16:00", name: "Group Reflection", description: "Share insights and experiences" },
    { time: "17:00", name: "Closing Circle", description: "Wrap-up and next steps" }
  ];

  if (experienceType === "multi-day") {
    // Generate variable number of days based on the experience
    const dayTitles = [
      "Welcome & Foundation",
      "Deep Dive & Practice", 
      "Integration & Mastery",
      "Advanced Exploration",
      "Specialized Focus",
      "Community Building",
      "Reflection & Growth"
    ];
    
    const dayDescriptions = [
      "Introduction and establishing the foundation for your experience",
      "Intensive learning and hands-on practice",
      "Bringing it all together and mastering new skills",
      "Exploring advanced concepts and techniques", 
      "Focusing on specialized aspects of the experience",
      "Building community connections and shared experiences",
      "Reflecting on growth and planning future steps"
    ];

    // Create 3-7 days depending on the experience
    const numDays = Math.min(Math.max(3, suggestedActivities.length > 4 ? Math.ceil(suggestedActivities.length / 2) : 3), 7);
    const days = [];
    
    for (let i = 0; i < numDays; i++) {
      const isLastDay = i === numDays - 1;
      const activitiesPerDay = Math.ceil(suggestedActivities.length / numDays);
      const startIndex = i * activitiesPerDay;
      const endIndex = Math.min(startIndex + activitiesPerDay, suggestedActivities.length);
      
      let dayActivities = suggestedActivities.slice(startIndex, endIndex);
      
      // Add special activities for the last day
      if (isLastDay) {
        dayActivities = [
          ...dayActivities,
          { time: "16:00", name: "Integration Session", description: "Reflect on learnings and create action plan" },
          { time: "17:30", name: "Farewell Ceremony", description: "Celebrate completion and say goodbyes" }
        ];
      }
      
      days.push({
        dayTitle: `Day ${i + 1}: ${dayTitles[i] || 'Continued Journey'}`,
        dayDescription: dayDescriptions[i] || 'Continuing your transformative experience',
        activities: dayActivities
      });
    }
    
    return days;
  } else {
    return [
      {
        dayTitle: "Experience Day",
        dayDescription: "Your complete single-day transformative experience",
        activities: suggestedActivities
      }
    ];
  }
}

// Helper function for user type context
function getUserTypeContext(userType: string): string {
  switch (userType) {
    case 'venue':
      return 'Venue owner/operator - focus on location capabilities, capacity, amenities, and partnership opportunities';
    case 'service_provider':
      return 'Service provider (guide, instructor, facilitator) - focus on expertise, credentials, and service offerings';
    case 'individual':
      return 'Individual creator - focus on personal passion, experience, and community building';
    default:
      return 'Unknown user type - ask clarifying questions to determine if they are a venue, service provider, or individual creator';
  }
}

// Helper functions for travel planning
function generateBasicItinerary(destination: string, startDate: string, endDate: string, interests: string[]) {
  const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const itinerary = [];
  
  for (let day = 1; day <= Math.min(days, 7); day++) {
    const dayActivities = [];
    
    if (interests.includes('Photography')) {
      dayActivities.push('Photography walking tour');
    }
    if (interests.includes('Food & Dining')) {
      dayActivities.push('Local cuisine experience');
    }
    if (interests.includes('Historical Sites')) {
      dayActivities.push('Historical landmarks visit');
    }
    
    // Add default activities if none specified
    if (dayActivities.length === 0) {
      dayActivities.push('City exploration', 'Local cultural sites');
    }
    
    itinerary.push({
      day,
      activities: dayActivities,
      accommodation: `Hotel in ${destination}`,
      transportation: day === 1 ? 'Airport transfer' : 'Local transport',
      meals: ['Local breakfast', 'Lunch', 'Dinner']
    });
  }
  
  return itinerary;
}

async function getMockFlightData(destination: string) {
  // This will be replaced with Amadeus API integration
  const destinationCode = destination.toLowerCase().includes('barcelona') ? 'BCN' : 'XXX';
  
  return [
    {
      airline: "Lufthansa",
      departure: "JFK",
      arrival: destinationCode,
      price: 485,
      duration: "7h 15m",
      source: "amadeus_api_pending"
    },
    {
      airline: "Delta", 
      departure: "JFK",
      arrival: destinationCode,
      price: 520,
      duration: "8h 15m",
      source: "amadeus_api_pending"
    }
  ];
}

async function getMockHotelData(destination: string) {
  // This will be replaced with Amadeus API integration
  return [
    {
      name: `Premium Hotel ${destination}`,
      rating: 4.3,
      price: 120,
      location: `Central ${destination}`,
      amenities: ["Pool", "Spa", "Gym"],
      source: "amadeus_api_pending"
    },
    {
      name: `Luxury Resort ${destination}`,
      rating: 4.5,
      price: 280,
      location: `Beachfront ${destination}`,
      amenities: ["Beachfront", "Spa", "Restaurant"],
      source: "amadeus_api_pending"
    }
  ];
}

async function getExternalExperiences(destination: string) {
  // This will be replaced with GetYourGuide API integration
  return [
    {
      id: `external-${destination}-1`,
      title: `Guided City Tour of ${destination}`,
      provider: "GetYourGuide",
      price: "€45",
      duration: "3 hours",
      rating: 4.6,
      description: "Explore the highlights with a local guide",
      source: "getyourguide_api_pending"
    },
    {
      id: `external-${destination}-2`, 
      title: `Food & Culture Experience in ${destination}`,
      provider: "GetYourGuide",
      price: "€89",
      duration: "5 hours",
      rating: 4.8,
      description: "Taste local cuisine and learn about the culture",
      source: "getyourguide_api_pending"
    }
  ];
}

function calculateTripValue(platformExperiences: any[], externalExperiences: any[]) {
  const platformCount = platformExperiences.length;
  const externalCount = externalExperiences.length;
  
  return {
    platformExperiences: platformCount,
    externalExperiences: externalCount,
    totalOptions: platformCount + externalCount,
    platformFirst: platformCount > 0,
    completeCoverage: (platformCount + externalCount) >= 3
  };
}
