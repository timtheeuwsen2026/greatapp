import { useState, useEffect, useMemo, useRef, useCallback, Component, ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  CheckCircle, 
  Clock,
  Info,
  Image,
  Calendar,
  Building,
  Users,
  UserCog,
  Bed,
  DollarSign,
  FileText,
  Upload,
  Plus,
  Minus,
  AlertCircle,
  AlertTriangle,
  Send,
  Trash2,
  Check,
  ChevronsUpDown,
  Handshake,
  Pencil,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { SharedPhotoUpload, PhotoPreview } from "@/components/SharedPhotoUpload";
import { getAccessToken } from "@/lib/authToken";
import { experienceToBuilderFields, fetchJsonOrNull } from "@/lib/experienceEditing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { RolesEditor } from "@/components/RolesEditor";
import { VenueDateConflictNotice } from "@/components/VenueDateConflictNotice";
import { useVenueDateConflicts } from "@/hooks/useVenueDateConflicts";
import { toCalendarDateISO, toDateOnly } from "@shared/calendarDates";
import { GroupedMultiSelect } from "@/components/GroupedMultiSelect";
import DiscountLinkManager from "@/components/DiscountLinkManager";
import AddPartnerModal from "@/components/AddPartnerModal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import MinimalSection from "@/components/EventBuilder/MinimalSection";
import VenueDealEditor from "@/components/EventBuilder/VenueDealEditor";
import {
  brandBarterPerkSource,
  DEAL_TIERS,
  dealTierGlyph,
  dealTierLabel,
  deriveLegacyPromotionFields,
  partnerBringsLine,
  partnerDealLabel,
  partnerDealTier,
  partnerTermSummary,
  partnerTypeGlyph,
  partnerTypeLabel,
  revenueShareEligible,
  revenueSharePartners,
  sanitisePartnerEntries,
  totalPartnerSharePct,
  PARTNER_TYPES,
  type DealTier,
  type EventPartnerEntry,
  type PartnerTerms,
  type PartnerTypeId,
} from "@shared/eventPartners";
import LegalConsentLabel from "@/components/LegalConsentLabel";
import Navigation from "@/components/navigation";
import { 
  applyDiscounts, 
  formatPriceByCurrency, 
  computeRevenueSplit, 
  computeMVGProgress, 
  getPriceSource, 
  buildSkusFromRooms,
  CURRENCY_CONFIG,
  safeMultiply,
  safeAdd
} from '@shared/pricingService';
import { calculateTicketDeductionForCount } from "@shared/ticketDeduction";
import {
  checkExperienceDealTerms,
  isFixedCostVenueDeal,
  validateExperienceDealTerms,
} from "@shared/dealTermGuards";
import { getTicketAddon, isAddonEnabled, normalizeAddonMarginMode } from "@shared/ticketAddons";
import {
  calculateEventEconomics,
  economicsAsFreeRsvp,
  findBreakEvenAttendance,
} from "@shared/eventEconomics";
import { usePlatformFee } from "@/hooks/usePlatformFee";
import { findDealConflicts, getDealConflictReason } from "@shared/dealExclusions";
import { getPerkApprovalMessage, getPerkApprovalState } from "@shared/perkApproval";
import {
  getSkuCapacity,
  getSkuEntryPrice,
  hasPaidTicketConfigured,
  summariseTicketRevenue,
} from "@shared/ticketRevenue";
import {
  getVenueDealLabel,
  checkVenuePayoutCap,
  getVenueDealOptions,
  explainVenueDealMechanics,
  VENUE_DEAL_MODELS,
  validateExperienceVenueDeal,
  summariseVenueDeal,
  venueDealTierOf,
} from "@shared/venueDealModels";

const GREAT_PILLAR_VALUES = ["health", "sports", "wellness", "food"] as const;
const FIXED_PLATFORM_FEE_PCT = 15;
// Derived, never re-typed: a local copy had already drifted from the shared
// vocabulary (it was missing Per Room / Per Night and the manual deal), so a
// creator choosing one of those failed form validation for no visible reason.
const VENUE_COMPENSATION_MODELS = VENUE_DEAL_MODELS;
// The legacy single-deal field's vocabulary. Still written, derived from the
// partner list, because the payout engine and the promotion-deal handshake read
// it — see PromotionStep. `content_license` is deliberately absent: it is a
// partner deal type, and nothing in the legacy engine settles one.
const PROMOTION_DEAL_TYPES = [
  "commission_per_ticket",
  "milestone_barter",
  "brand_barter",
  "financial_sponsorship",
] as const;
const PARTICIPANT_REFERRAL_DEAL_TYPES = [
  "commission_per_ticket",
  "milestone_barter",
] as const;

function normalizeGreatPillars(value: unknown): Array<typeof GREAT_PILLAR_VALUES[number]> {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return rawValues
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is typeof GREAT_PILLAR_VALUES[number] =>
      (GREAT_PILLAR_VALUES as readonly string[]).includes(item)
    );
}

// Nights the group actually sleeps at the venue — what a per-room, per-night
// deal is billed against. A missing or same-day end date is zero nights.
function countNightsBetween(start: unknown, end: unknown): number {
  if (!start) return 0;
  const startDate = new Date(start as string);
  const endDate = end ? new Date(end as string) : startDate;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

// 11-step Event Builder schema aligned with database fields
const eventBuilderSchema = z.object({
  // Step 1: Basic Info
  title: z.string().min(1, "Title is required").max(255, "Title too long").optional().or(z.literal('')),
  shortDescription: z.string().max(500, "Short description too long").optional(),
  description: z.string().min(10, "Description must be at least 10 characters").optional().or(z.literal('')),
  category: z.enum(["sports_wellness", "retreats", "community_social", "adventure_trips", "workations", "festivals_events"]).optional(),
  type: z.enum(["one-day", "multi-day", "virtual"]).optional(),
  greatPillars: z.preprocess(
    normalizeGreatPillars,
    z.array(z.enum(GREAT_PILLAR_VALUES)).default([])
  ),

  // Step 2: Media - Allow empty during editing, validate on publish
  coverImageUrl: z.string().optional().or(z.literal('')),
  gallery: z.array(z.string()).default([]), // Allow any string, URL validation done in validateForPublish

  // Step 3: Dates
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  startTime: z.string().max(20, "Start time too long").optional().or(z.literal('')),
  endTime: z.string().max(20, "End time too long").optional().or(z.literal('')),
  maxParticipants: z.number().min(1, "Must allow at least 1 participant").max(200).optional(),

  // Step 4: Venue
  location: z.string().min(1, "Location is required").optional().or(z.literal('')),
  venueType: z.enum(["catalog", "outdoor", "manual", "virtual", "open"]).default("catalog"),

  // Open-to-Venue-Offers fields (reverse bidding)
  venueOpenSpaceType: z.string().optional(),
  venueTargetDeal: z.string().optional(),
  // Numeric target for the chosen deal type: a % for revenue_share, a € amount for everything else.
  // Only shown/required when the selected target deal carries a percentage or amount.
  venueTargetDealValue: z.number().optional(),

  // Catalog venue fields
  selectedVenueId: z.string().optional(),
  venue: z.string().optional(), // Keep for backward compatibility

  // Manual venue fields
  manualVenueName: z.string().optional(),
  manualVenueAddress: z.string().optional(),
  manualVenueContactName: z.string().optional(),
  manualVenueEmail: z.string().email("Enter a valid venue email address").optional().or(z.literal('')),
  manualVenuePropertyUrl: z.string().url("Enter a valid property link").optional().or(z.literal('')),
  manualVenueDescription: z.string().optional(),
  manualVenueCapacity: z.coerce.number().min(1).optional().nullable(),
  manualVenuePhotos: z.array(z.string()).default([]), // Allow any string
  // Daytime Space capacity (for one-day events)
  standingCapacity: z.coerce.number().int().min(0).optional().nullable(),
  seatedCapacity: z.coerce.number().int().min(0).optional().nullable(),

  // Virtual event fields
  virtualPlatform: z.string().optional(),
  virtualMeetingUrl: z.string().optional(), // Allow any string, URL validation done separately
  virtualInstructions: z.string().optional(),

  // Step 5: Services & Amenities
  selectedServiceIds: z.array(z.string()).default([]),
  selectedAmenityIds: z.array(z.string()).default([]),
  serviceDemandNotes: z.record(z.string()).default({}),
  serviceConnectRequests: z.record(z.boolean()).default({}),

  // Step 6: Roles
  roles: z.array(z.object({
    name: z.string(),
    required: z.boolean().default(false),
    headcount: z.number().min(1).default(1),
    rate: z.number().optional(),
    notes: z.string().optional(),
  })).default([]),

  // Step 7: Rooms
  accommodationType: z.enum(["shared", "private", "mixed", "none"]).optional().nullable(),
  roomCapacity: z.coerce.number().min(1).optional().nullable(),
  totalRooms: z.coerce.number().min(1).optional().nullable(),
  rooms: z.preprocess(
    (val) => (val === null || val === undefined) ? [] : val,
    z.array(z.object({
      id: z.string(),
      name: z.string().min(1, "Room name is required"),
      capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
      quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
      gallery: z.array(z.string()).default([]),
      notes: z.string().optional()
    }))
  ),

  // Step 8: Promotion
  participantReferralDealType: z.enum(PARTICIPANT_REFERRAL_DEAL_TYPES).optional().nullable(),
  // The reward is the venue's to give, so it goes to them for sign-off before
  // anyone is promised it.
  participantReferralVenueBacked: z.boolean().optional().default(false),
  participantReferralCommissionPct: z.coerce.number().min(0).max(50).optional().nullable().default(0),
  participantReferralMilestoneAttendeeTarget: z.coerce.number().int().min(1).optional().nullable(),
  participantReferralMilestoneRewardDescription: z.string().max(500, "Participant reward is too long").optional(),
  promotionDealType: z.enum(PROMOTION_DEAL_TYPES).optional().nullable(),
  promotionMilestoneAttendeeTarget: z.coerce.number().int().min(1).optional().nullable(),
  promotionMilestoneRewardTickets: z.coerce.number().int().min(1).optional().nullable(),
  promotionBrandPitch: z.string().max(2000, "Promotion brief is too long").optional(),
  promotionSponsorshipAmount: z.coerce.number().min(0).optional().nullable(),
  promotionSelectedPartnerIds: z.array(z.string()).default([]),
  promotionExternalInvites: z.array(z.object({
    id: z.string(),
    email: z.string().email("Enter a valid invite email address"),
    name: z.string().min(1, "Partner name is required"),
    website: z.string().url("Enter a valid social or website link"),
  })).default([]),
  promoterEnabled: z.boolean().default(true),
  // The repeatable partner list. Kept loose here on purpose: the authoritative
  // check is `sanitisePartnerEntries`, which the step and the server both run,
  // and which drops an unrecognised deal type rather than coercing it. A strict
  // shape would fail form validation over one bad row and take the whole step
  // down with it.
  eventPartners: z.array(z.any()).default([]),

  // Step 9: Itinerary
  itinerary: z.array(z.object({
    day: z.number(),
    date: z.date(),
    title: z.string().default(""),
    timeSlots: z.array(z.object({
      id: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      activity: z.string(),
      notes: z.string().optional()
    })).default([]),
    notes: z.string().default("")
  })).default([]),

  // Step 10: Pricing
  price: z.coerce.number().min(0, "Price cannot be negative").optional(),
  pricePerPerson: z.coerce.number().min(0, "Price per person cannot be negative").default(0),
  currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]).optional(),
  
  // Ticket SKUs - per-ticket pricing for different accommodation types
  ticketSkus: z.array(z.object({
    id: z.string(),
    ticketName: z.string().min(1, "Ticket name is required"),
    pricingMode: z.enum(["fixed", "free_rsvp", "pwyw", "combi"]).default("fixed"),
    pricePerPerson: z.number().min(0, "Price cannot be negative"),
    minPrice: z.number().min(0).default(0),
    suggestedPrice: z.number().min(0).optional(),
    // The add-on's own fields. Absent from this list they are stripped on the
    // way through the resolver, which is how a priced add-on can save as a
    // ticket with no add-on at all.
    addonEnabled: z.boolean().optional(),
    addonName: z.string().optional(),
    addonPrice: z.number().min(0).optional(),
    addonVenuePrice: z.number().min(0).optional(),
    /** Which entry in the venue's published catalog this add-on came from. */
    addonCatalogItemId: z.string().optional(),
    /** Path B: heads the organiser expects to want this, when no price exists yet. */
    addonExpectedDemand: z.number().min(0).optional(),
    // Superseded by addonGroupRate + addonChargeAmount, kept so a ticket saved
    // under the old vocabulary still loads and still prices correctly.
    addonMargin: z.number().min(0).optional(),
    addonMarginMode: z.enum(["additive", "deduction"]).optional(),
    /** What the venue charges the organiser — agreed per invite, never published. */
    addonGroupRate: z.number().min(0).optional(),
    /** What the participant is charged. The one number the organiser decides. */
    addonChargeAmount: z.number().min(0).optional(),
    addonInventory: z.number().min(0).optional(),
    depositPerPerson: z.number().min(0, "Deposit cannot be negative"),
    ticketCapacity: z.number().int().min(1, "Capacity must be at least 1"),
    sourceRoomId: z.string().optional(),
    soldCount: z.number().default(0)
  })).default([]),
  
  // Deposit Settings
  depositEnabled: z.boolean().default(false),
  depositPercentage: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '' || val === 0) return 20;
      return val;
    },
    z.coerce.number()
  ),
  
  // Legacy monetization model (keep for backward compatibility)
  monetizationModel: z.enum(["facilitator", "influencer"]).optional().nullable(),
  facilitatorServices: z.array(z.string()).default([]),
  serviceCosts: z.record(z.number()).default({}),
  expectedPayout: z.coerce.number().optional().nullable(),
  platformCommission: z.coerce.number().optional().nullable(),
  stripeFee: z.coerce.number().optional().nullable(),
  
  // Creator-led monetisation default
  monetisationMode: z.enum(["creator_led", "great_managed", "promo_only", "extra_services"]).optional(),
  
  // Influencer Commission Pool
  influencerPromotionEnabled: z.boolean().default(false),
  influencerCommissionPct: z.coerce.number().min(0).max(50).optional().nullable().default(0),
  
  // Per-SKU Discounts
  discounts: z.array(z.object({
    id: z.string(),
    title: z.string().min(1, "Discount title is required"),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().min(0, "Discount value must be positive"),
    validUntil: z.date().optional(),
    capacityCap: z.number().min(1).optional(),
    active: z.boolean().default(true),
    skuId: z.string().optional()
  })).default([]),
  
  // Secure Payout via Stripe Connect
  stripeConnectRequired: z.boolean().default(true),
  balanceDueDays: z.number().min(1, "Balance due days must be at least 1").max(90, "Maximum 90 days").default(14),
  
  // Pillar A: Infrastructure fee (fixed) and creator net economics
  creatorPct: z.coerce.number().min(0).max(100).optional().nullable().default(85),
  platformPct: z.coerce.number().min(0).max(100).optional().nullable().default(FIXED_PLATFORM_FEE_PCT),

  // Pillar B: Commercial venue terms
  venueCompensationModel: z.enum(VENUE_COMPENSATION_MODELS).default("revenue_share"),
  venueFixedFee: z.coerce.number().min(0).optional().nullable().default(0),
  venuePerHeadAmount: z.coerce.number().min(0).optional().nullable().default(0),
  venuePerRoomPerNight: z.coerce.number().min(0).optional().nullable().default(0),
  venueMinimumSpend: z.coerce.number().min(0).optional().nullable().default(0),
  venueRevenueSharePct: z.coerce.number().min(0).max(100).optional().nullable().default(0),
  venueAccessFee: z.coerce.number().min(0).optional().nullable().default(0),
  // Commitment Fee + Revenue Split carries a second figure travelling the other
  // way: the venue pays this once, upfront. No minimum or maximum — it is a
  // gesture the two sides agree between themselves.
  venueCommitmentFee: z.coerce.number().min(0).optional().nullable().default(0),
  // Barter Deal: no amount, only what each side supplies.
  venueBarterTerms: z.string().optional().nullable(),
  
  // Legacy Revenue Splits (keep for backward compatibility)
  venueRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(0),
  creatorRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(85),
  platformRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(15),
  
  // MVG (Minimum Viable Group) Settings
  requireMinimumParticipants: z.boolean().default(true),
  /**
   * How many the organiser expects to turn up.
   *
   * Pitch context under every deal type, and the entire basis of the offer
   * under two: Venue Sponsorship and Upfront Rental commit the venue to a flat
   * amount with nothing to self-correct against. Every other deal scales with
   * actual sales, so an optimistic guess costs the venue nothing there.
   */
  expectedAudienceSize: z.coerce.number().int().min(0).optional().nullable(),
  minimumParticipants: z.number().min(2, "Minimum participants must be at least 2").max(50, "Maximum 50 participants").default(6),
  mvgDeadlineDays: z.number().int().min(0).max(30).default(7),
  mvgDeadline: z.date().optional(),

  // Soft-Hold Reservation Settings
  softHoldEnabled: z.boolean().default(false),
  softHoldDurationHours: z.number().min(1, "Minimum hold duration is 1 hour").max(168, "Maximum hold duration is 7 days").default(48),

  // Step 11: Terms - validation handled in validateForPublish to avoid immediate errors on step load
  termsAccepted: z.boolean().default(false),
  termsDocumentUrl: z.string().optional(), // URL to uploaded PDF terms document
  customTerms: z.string().optional() // Editable custom terms and conditions text
});

type EventBuilderData = z.infer<typeof eventBuilderSchema>;

// All available steps with their absolute IDs
// Named because the venue/date clash gate has to know which two screens can
// create it, and a bare 3 or 4 in that check would be a puzzle later.
const DATES_STEP_ID = 3;
const VENUE_STEP_ID = 4;
const PARTNERS_STEP_ID = 8;

/**
 * Paid, pay-what-you-want, free. Three, and they fit on one row — which is why
 * the dropdown went: an organiser had to open it to discover that free RSVP
 * was even an option.
 */
/** The three groups the Grand Total Calculator prints its rows under. */
const CALCULATOR_TIERS = [
  { id: 'per_unit', label: '↕ Per-unit' },
  { id: 'flat', label: '€ Flat' },
  { id: 'addon', label: 'Add-on' },
] as const;

const TICKET_FORMATS = [
  { value: 'fixed', label: 'Paid' },
  { value: 'pwyw', label: 'PWYW' },
  { value: 'free_rsvp', label: 'Free' },
] as const;

const ALL_STEPS = [
  { id: 1, title: "Basic Info", icon: Info, description: "Title, description, and category" },
  { id: 2, title: "Media", icon: Image, description: "Photos and visual content" },
  { id: 3, title: "Dates", icon: Calendar, description: "Schedule and capacity" },
  { id: 4, title: "Venue", icon: Building, description: "Location and space details" },
  { id: 5, title: "Services & Amenities", icon: Users, description: "Services and facility features" },
  { id: 6, title: "Roles", icon: UserCog, description: "Participant roles and contributions" },
  { id: 7, title: "Rooms", icon: Bed, description: "Accommodation and capacity" },
  { id: 8, title: "Partners", icon: Handshake, description: "Communities, sponsors, service providers and affiliates" },
  { id: 9, title: "Plan", icon: Calendar, description: "Daily schedule and activities" },
  { id: 10, title: "Pricing", icon: DollarSign, description: "Pricing and monetization" },
  { id: 11, title: "Terms", icon: FileText, description: "Terms and final review" }
];

// Helper to get filtered steps based on event type.
// Event (one-day) / Virtual: skip Services & Amenities and Rooms to keep the pilot flow lean.
// Trip (multi-day): all steps, including Services, Amenities, Rooms, and MVG threshold.
/**
 * Which step a publish error belongs to.
 *
 * A validation error reads "Venue commercial deal: Enter a percentage greater
 * than zero" while the creator is standing on step 1 with the title selected.
 * They have no way to know the field exists, let alone where it lives, so the
 * save looks like it failed for no reason — which is how "it doesn't save my
 * event" gets reported.
 *
 * Matched on the server's own error text. Crude, but the alternative is a
 * field-path contract between the validator and the form that neither side
 * currently has, and a wrong guess here only costs a missing signpost.
 */
const ERROR_STEP_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /venue commercial deal|target deal|venue deal|per ticket|percentage greater than zero|commitment fee|deduction|add-on margin/i, label: 'Pricing' },
  { pattern: /venue|space|address|property link/i, label: 'Venue' },
  { pattern: /ticket|price|currency|deposit|discount|minimum viable|minimum participants/i, label: 'Pricing' },
  { pattern: /date|time slot|itinerary/i, label: 'Dates' },
  { pattern: /room|sleeping/i, label: 'Rooms' },
  { pattern: /terms|cancellation/i, label: 'Terms' },
  { pattern: /title|description|category|cover image|gallery|photo/i, label: 'Basics' },
];

function findStepForError(message: unknown): { label: string } | null {
  const text = String(message ?? "");
  if (!text.trim()) return null;
  for (const hint of ERROR_STEP_HINTS) {
    if (hint.pattern.test(text)) return { label: hint.label };
  }
  return null;
}

function getStepsForEventType(eventType: string | undefined): typeof ALL_STEPS {
  if (eventType === 'one-day' || eventType === 'virtual') {
    return ALL_STEPS.filter(step => step.id !== 5 && step.id !== 7);
  }
  return ALL_STEPS;
}

// True when the selected type is a local one-day Event (not a multi-day Trip)
const isEventType = (t: string | undefined) => t === 'one-day';

// Legacy STEPS constant for backward compatibility (will be replaced by dynamic steps)
const STEPS = ALL_STEPS;

/** A YYYY-MM-DD from a Flash Deal link, as the form's Date. */
function parsePrefillDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

interface EventBuilderProps {
  draftId?: string;
  initialExperienceType?: "one-day" | "multi-day";
  onComplete?: (experienceId: string) => void;
  /**
   * Values a Flash Deal hands over when a creator claims it. They fill the
   * dates and venue so the builder opens on the deal the creator clicked —
   * nothing is reserved, and every field stays editable.
   */
  initialPrefill?: {
    venueId?: string;
    startDate?: string;
    endDate?: string;
    flashDealId?: string;
  };
  /**
   * A Collab Idea that found its match, handed over rather than retyped.
   *
   * What happened when an idea got a match had no defined mechanic: the idea
   * sat on the board, the conversation moved off-platform, and the event was
   * eventually typed in from scratch with none of the idea's own answers. This
   * carries them across — title, description, area, group size, period, photo,
   * and the matched party dropped into the right step with its status intact.
   *
   * The deal type is a *suggestion*. The idea stated a preference, not terms,
   * and the terms are still agreed in the dealroom.
   */
  collabPrefill?: {
    collabIdeaId?: string;
    title?: string;
    description?: string;
    eventType?: string;
    location?: string;
    maxParticipants?: number | null;
    minimumParticipants?: number | null;
    startDate?: string;
    endDate?: string;
    coverImageUrl?: string;
    matchedVenue?: { userId?: string | null; name?: string | null } | null;
    matchedPartner?: {
      partnerType?: string;
      name?: string | null;
      partnerUserId?: string | null;
      dealType?: string | null;
      status?: string;
    } | null;
    suggestedDealType?: string | null;
  };
}

// Client-side normalization to prevent bad payloads
function normalizeDraftForSave(draft: any) {
  const copy = normalizeEventTripFields(draft);
  // A trip runs "12 to 16 August" wherever it is read from, so these are
  // anchored to the day rather than to the creator's local midnight.
  if (copy.startDate) copy.startDate = toCalendarDateISO(copy.startDate);
  if (copy.endDate) copy.endDate = toCalendarDateISO(copy.endDate);
  if (copy.mvgDeadline) copy.mvgDeadline = new Date(copy.mvgDeadline).toISOString();
  return copy;
}

function normalizeEventTripFields(draft: any) {
  const copy = { ...draft };
  const type = copy.type || 'one-day';
  copy.greatPillars = normalizeGreatPillars(copy.greatPillars);
  copy.monetisationMode = 'creator_led';
  copy.ticketSkus = Array.isArray(copy.ticketSkus)
    ? copy.ticketSkus.map((sku: any) => sku?.pricingMode === 'free_rsvp'
      ? { ...sku, pricePerPerson: 0, minPrice: 0, suggestedPrice: undefined }
      : sku)
    : [];

  if (type === 'one-day') {
    copy.endDate = copy.startDate || copy.endDate;
    copy.rooms = [];
    copy.accommodationType = null;
    copy.roomCapacity = null;
    copy.totalRooms = null;
    // Use explicitly set maxParticipants; do not pull from venue capacity (that's a physical limit, not the creator's spot count)
    copy.maxParticipants = copy.maxParticipants ? Number(copy.maxParticipants) : undefined;
    copy.selectedServices = [];
    copy.selectedAmenities = [];
    copy.selectedServiceIds = [];
    copy.selectedAmenityIds = [];
    copy.serviceDemandNotes = {};
    copy.serviceConnectRequests = {};
    copy.ticketSkus = copy.ticketSkus.map((sku: any) => ({
      ...sku,
      depositPerPerson: 0,
    }));
    copy.depositEnabled = false;
    copy.depositAmount = 0;
    copy.balanceAmount = 0;
  }

  if (type === 'multi-day') {
    copy.startTime = '';
    copy.endTime = '';
    copy.standingCapacity = null;
    copy.seatedCapacity = null;
    const rooms = Array.isArray(copy.rooms) ? copy.rooms : [];
    const sleepingCapacity = rooms.reduce((total: number, room: any) => {
      const capacity = Number(room?.capacity || 0);
      const quantity = Number(room?.quantity || 0);
      return total + capacity * quantity;
    }, 0);
    if (sleepingCapacity > 0) {
      copy.maxParticipants = sleepingCapacity;
    }
  }

  return copy;
}

export default function EventBuilder({ draftId, initialExperienceType, onComplete, initialPrefill, collabPrefill }: EventBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false); // Track if experience was published (to stop auto-save)
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<number>(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A save the server refused. Distinct from a network blip: retrying changes
  // nothing, so the creator has to be told rather than shown a stale "Saved".
  const [autosaveRejected, setAutosaveRejected] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>('draft');
  // Whether an admin has allowed this one event to use the untracked manual
  // agreement. Read from the saved record only — it is never a form field, so a
  // creator cannot turn it on by editing what they post back.
  const [manualDealUnlocked, setManualDealUnlocked] = useState(false);
  // Set when the id in the URL resolved to a published experience rather than a
  // draft. Everything downstream — autosave, the save button, the submit call —
  // branches on this, because there is no draft row to write to.
  const [editingExperienceId, setEditingExperienceId] = useState<string | undefined>(undefined);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Which steps this event type shows. Derived, not stored.
  //
  // This used to be `useState` written by an effect that depended on
  // `currentStep`, so every step change re-set it — and for a one-day event
  // `getStepsForEventType` returns a fresh `.filter()` array each call, so the
  // reference always differed and the write always re-rendered. Changing step
  // therefore rendered the whole builder twice, on top of the render that
  // `mode: "onChange"` already causes on every keystroke. That churn is what
  // made the stepper feel like it needed two clicks: the first one landed in
  // the middle of a re-render.
  //
  // It is a pure function of the event type, so it is a `useMemo`. The steps
  // now change when the type changes and at no other time.
  

  const form = useForm<EventBuilderData>({
    resolver: zodResolver(eventBuilderSchema),
    mode: "onChange",
    defaultValues: {
      title: collabPrefill?.title || "",
      shortDescription: "",
      description: collabPrefill?.description || "",
      category: undefined,
      type: (collabPrefill?.eventType as any) || initialExperienceType,
      greatPillars: [],
      coverImageUrl: collabPrefill?.coverImageUrl || "",
      gallery: [],
      startDate: parsePrefillDate(initialPrefill?.startDate ?? collabPrefill?.startDate),
      endDate: parsePrefillDate(initialPrefill?.endDate ?? collabPrefill?.endDate),
      startTime: "",
      endTime: "",
      maxParticipants: collabPrefill?.maxParticipants ?? undefined,
      location: collabPrefill?.location || "",
      venueType: "catalog",
      venueOpenSpaceType: "",
      venueTargetDeal: "revenue_share",
      venueTargetDealValue: undefined,
      selectedVenueId: initialPrefill?.venueId || "",
      venue: "",
      manualVenueName: "",
      manualVenueAddress: "",
      manualVenueContactName: "",
      manualVenueEmail: "",
      manualVenuePropertyUrl: "",
      manualVenueDescription: "",
      manualVenueCapacity: undefined,
      manualVenuePhotos: [],
      standingCapacity: undefined,
      seatedCapacity: undefined,
      virtualPlatform: "",
      virtualMeetingUrl: "",
      virtualInstructions: "",
      selectedServiceIds: [],
      selectedAmenityIds: [],
      serviceDemandNotes: {},
      serviceConnectRequests: {},
      roles: [],
      accommodationType: undefined,
      roomCapacity: undefined,
      totalRooms: undefined,
      participantReferralDealType: null,
      participantReferralVenueBacked: false,
      participantReferralCommissionPct: 0,
      participantReferralMilestoneAttendeeTarget: undefined,
      participantReferralMilestoneRewardDescription: '',
      promotionDealType: null,
      promotionMilestoneAttendeeTarget: undefined,
      promotionMilestoneRewardTickets: 1,
      promotionBrandPitch: '',
      promotionSponsorshipAmount: undefined,
      promotionSelectedPartnerIds: [],
      promotionExternalInvites: [],
      promoterEnabled: true,
      // The matched party, dropped into the Partners list with the status the
      // match earned: an accepted direct invite is an agreement to work
      // together, so it arrives Confirmed; a board response is interest, not
      // terms, so it arrives Invited and finishes in the normal deal flow.
      //
      // A matched *venue* is deliberately absent — it belongs in the Venue
      // step, which has its capacity and address fields and its own contract.
      eventPartners: collabPrefill?.matchedPartner
        ? sanitisePartnerEntries([{
            id: `collab-${collabPrefill.collabIdeaId || "match"}`,
            partnerType: collabPrefill.matchedPartner.partnerType,
            name: collabPrefill.matchedPartner.name || "Partner",
            partnerUserId: collabPrefill.matchedPartner.partnerUserId,
            source: "platform",
            dealType: collabPrefill.matchedPartner.dealType
              || collabPrefill.suggestedDealType
              || "brand_barter",
            terms: {},
            status: collabPrefill.matchedPartner.status === "confirmed" ? "confirmed" : "invited",
          }])
        : [],
      itinerary: [],
      price: undefined,
      pricePerPerson: 0,
      currency: undefined,
      ticketSkus: [],
      
      // Deposit Settings
      depositEnabled: false,
      depositPercentage: 20,
      
      // Legacy monetization
      monetizationModel: undefined,
      facilitatorServices: [],
      serviceCosts: {},
      expectedPayout: undefined,
      platformCommission: undefined,
      stripeFee: undefined,
      
      // New Pricing Features (Phase 3) - PHASE 3 FIX: Set explicit defaults
      monetisationMode: 'creator_led',  // Default to creator-led business model
      influencerPromotionEnabled: false,
      influencerCommissionPct: 0,
      discounts: [],
      
      // Secure Payout via Stripe Connect
      stripeConnectRequired: true,
      balanceDueDays: 14,
      
      // Pillar A: Infrastructure fee (fixed)
      creatorPct: 85,
      platformPct: FIXED_PLATFORM_FEE_PCT,

      // Pillar B: Commercial venue terms
      venueCompensationModel: "revenue_share",
      venueFixedFee: 0,
      venuePerHeadAmount: 0,
      venuePerRoomPerNight: 0,
      venueRevenueSharePct: 0,
      venueCommitmentFee: 0,
      venueBarterTerms: '',
      venueAccessFee: 0,
      
      // Legacy Revenue Splits
      venueRevenuePercentage: 0,
      creatorRevenuePercentage: 85,
      platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
      
      // MVG fields
      requireMinimumParticipants: true,
      expectedAudienceSize: null,
      minimumParticipants: 6,
      mvgDeadlineDays: 7,
      mvgDeadline: undefined,
      
      // Soft-Hold fields
      softHoldEnabled: false,
      softHoldDurationHours: 48,
      
      termsAccepted: false,
      termsDocumentUrl: '',
      customTerms: ''
    }
  });

  // Silent auto-save mutation (no toast notifications)
  const autoSaveMutation = useMutation({
    mutationFn: async (data: Partial<EventBuilderData>) => {
      if (!user?.id) throw new Error("User not authenticated");
      const normalizedData = normalizeEventTripFields(data);
      
      // Map form field names to draft schema field names
      // CRITICAL: Explicitly preserve all array fields to prevent data loss during autosave
      const mappedData = {
        ...normalizedData,
        // Handle date fields safely - ensure proper serialization for all date types
        startDate: toCalendarDateISO(normalizedData.startDate),
        endDate: toCalendarDateISO(normalizedData.endDate),
        mvgDeadline: normalizedData.mvgDeadline ? (typeof normalizedData.mvgDeadline === 'string' ? normalizedData.mvgDeadline : 
                     (normalizedData.mvgDeadline instanceof Date ? normalizedData.mvgDeadline.toISOString() : null)) : null,
        // Map MVG form fields to draft schema fields
        mvgEnabled: (normalizedData as any).requireMinimumParticipants ?? (normalizedData as any).mvgEnabled ?? true,
        mvgMinimumSize: (normalizedData as any).minimumParticipants || (normalizedData as any).mvgMinimumSize || 6,
        // Ensure maxParticipants is preserved
        maxParticipants: normalizedData.maxParticipants || 1,
        // STABILITY: Explicitly preserve greatPillars array to prevent silent data loss
        greatPillars: normalizeGreatPillars((normalizedData as any).greatPillars),
        monetisationMode: 'creator_led',
        // Preserve other critical arrays
        gallery: Array.isArray(normalizedData.gallery) ? normalizedData.gallery : [],
        rooms: Array.isArray(normalizedData.rooms) ? normalizedData.rooms : [],
        roles: Array.isArray((normalizedData as any).roles) ? (normalizedData as any).roles : [],
        ticketSkus: Array.isArray(normalizedData.ticketSkus) ? normalizedData.ticketSkus : [],
        depositEnabled: Array.isArray(normalizedData.ticketSkus)
          ? normalizedData.ticketSkus.some((sku: any) => Number(sku?.depositPerPerson || 0) > 0)
          : !!normalizedData.depositEnabled,
      };
      
      const draftData = {
        ...mappedData,
        currentStep, // Save current step
        creatorId: user.id
      };

      if (currentDraftId) {
        return apiRequest("PUT", `/api/experience-drafts/${currentDraftId}`, draftData);
      } else {
        return apiRequest("POST", "/api/experience-drafts", draftData);
      }
    },
    onSuccess: async (response) => {
      setLastSaved(new Date());
      setAutosaveRejected(false);
      setIsSaving(false);
      
      // If this was a POST (new draft), capture the draft ID
      if (!currentDraftId && response.ok) {
        const result = await response.json();
        if (result.id) {
          setDraftLoaded(true);
          setCurrentDraftId(result.id);
        }
      }
      // Invalidate so the creator dashboard shows this draft immediately on next visit
      queryClient.invalidateQueries({ queryKey: ["/api/experience-drafts"] });
    },
    onError: (error: any) => {
      setIsSaving(false);
      
      // Determine if this is a transient network error that should be ignored
      const isTransientError = (
        error?.name === 'TypeError' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('network') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('disconnected') ||
        !navigator.onLine
      );
      
      // A dropped connection is worth ignoring — the next change retries and the
      // creator loses nothing. A refusal from the server is not: the draft will
      // never save until the payload changes, and staying silent about that is
      // what let a whole pricing step disappear behind a "Saved 7:47 PM".
      setAutosaveRejected(!isTransientError);

      if (import.meta.env.DEV) {
        console.log(
          isTransientError
            ? `Autosave: transient network error (ignored): ${error?.message || error}`
            : `Autosave: rejected by server: ${error?.message || error}`,
        );
      }
    },
    // Add retry configuration for network failures
    retry: (failureCount, error: any) => {
      // Only retry network-related errors, and only up to 2 times
      const isNetworkError = (
        error?.name === 'TypeError' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('network') ||
        error?.message?.includes('timeout')
      );
      
      return isNetworkError && failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 10000), // Exponential backoff, max 10s
  });

  // Manual save mutation (with toast notifications)
  const manualSaveMutation = useMutation({
    mutationFn: async (data: Partial<EventBuilderData>) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      // Ensure dates are properly serialized for database storage
      // CRITICAL: Explicitly preserve all array fields to prevent data loss during save
      const mappedData = {
        ...data,
        // Handle date fields safely - ensure proper serialization for all date types
        startDate: toCalendarDateISO(data.startDate),
        endDate: toCalendarDateISO(data.endDate),
        mvgDeadline: data.mvgDeadline ? (typeof data.mvgDeadline === 'string' ? data.mvgDeadline : 
                     (data.mvgDeadline instanceof Date ? data.mvgDeadline.toISOString() : null)) : null,
        // Map MVG form fields to draft schema fields
        mvgEnabled: (data as any).requireMinimumParticipants ?? (data as any).mvgEnabled ?? true,
        mvgMinimumSize: (data as any).minimumParticipants || (data as any).mvgMinimumSize || 6,
        // STABILITY: Explicitly preserve greatPillars array to prevent silent data loss
        greatPillars: normalizeGreatPillars((data as any).greatPillars),
        monetisationMode: 'creator_led',
        // Preserve other critical arrays
        gallery: Array.isArray(data.gallery) ? data.gallery : [],
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        roles: Array.isArray((data as any).roles) ? (data as any).roles : [],
        ticketSkus: Array.isArray(data.ticketSkus) ? data.ticketSkus : [],
        depositEnabled: Array.isArray(data.ticketSkus)
          ? data.ticketSkus.some((sku: any) => Number(sku?.depositPerPerson || 0) > 0)
          : !!data.depositEnabled,
      };
      
      const draftData = {
        ...mappedData,
        currentStep,
        creatorId: user.id
      };

      if (currentDraftId) {
        return apiRequest("PUT", `/api/experience-drafts/${currentDraftId}`, draftData);
      } else {
        return apiRequest("POST", "/api/experience-drafts", draftData);
      }
    },
    onSuccess: async (response) => {
      setLastSaved(new Date());
      setIsSaving(false);
      
      // If this was a POST (new draft), capture the draft ID
      if (!currentDraftId && response.ok) {
        const result = await response.json();
        if (result.id) {
          setDraftLoaded(true);
          setCurrentDraftId(result.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/experience-drafts"] });

      toast({
        title: "Progress saved",
        description: "Your changes have been saved successfully.",
        duration: 2000,
      });
    },
    onError: (error: any) => {
      setIsSaving(false);
      console.error("Manual save error:", error);
      
      // Provide specific error messages based on error type
      let errorMessage = "Unable to save your progress. Please try again.";
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try saving again.";
      } else if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        errorMessage = "Session expired. Please refresh the page and log in again.";
      } else if (error.message?.includes('413')) {
        errorMessage = "Draft too large. Please reduce image sizes or content length.";
      } else if (error.message) {
        errorMessage = `Save failed: ${error.message}`;
      }
      
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Helper function to detect demo events for placeholder bypass
  const isDemoEvent = (formData: any) => {
    return formData.title?.toLowerCase().includes('mystic') && 
           formData.title?.toLowerCase().includes('marrakesh');
  };

  // Refs to track autosave state without causing re-renders
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const pendingChangesRef = useRef(false); // Track if changes occurred while saving
  /**
   * The Collab Idea handoff, finished.
   *
   * The prefill was only peeked at on the way in, so that answering the
   * single-day / multi-day question did not drop it. Now that the form has
   * actually been seeded from it, it is consumed — a reload must not re-seed a
   * form the creator has since deliberately emptied.
   *
   * Marking the idea closed happens here rather than on publish, and that is a
   * judgement rather than an oversight: the moment an organiser starts building
   * the event, the idea has found its match and should stop collecting further
   * interest. Leaving it open until publish means a week of "I'm interested"
   * from people who cannot have it.
   */
  useEffect(() => {
    if (!collabPrefill?.collabIdeaId) return;
    try {
      sessionStorage.removeItem('collabIdeaPrefill');
    } catch {
      // Blocked storage: nothing to clear, nothing to report.
    }
    apiRequest('PATCH', `/api/collab/ideas/${collabPrefill.collabIdeaId}`, { status: 'matched' })
      .catch((error) => {
        // The event is being built either way. An idea left open on the board
        // is untidy, not broken.
        console.error('Could not close the collab idea behind this event:', error);
      });
  }, [collabPrefill?.collabIdeaId]);

  
  // Keep isSavingRef in sync with state and handle pending changes
  useEffect(() => {
    const wasSaving = isSavingRef.current;
    isSavingRef.current = isSaving;
    
    // When save completes and there were pending changes, schedule a follow-up save
    if (wasSaving && !isSaving && pendingChangesRef.current) {
      pendingChangesRef.current = false;
      // Schedule follow-up save after brief delay
      autoSaveTimeoutRef.current = setTimeout(() => {
        if (!isSavingRef.current && !autoSaveMutation.isPending && form.formState.isDirty) {
          const formData = form.getValues();
          if (import.meta.env.DEV) {
            console.log('Triggering follow-up auto-save for pending changes...');
          }
          setIsSaving(true);
          setLastAutoSaveTime(Date.now());
          autoSaveMutation.mutate(formData);
        }
      }, 2000);
    }
  }, [isSaving, form, autoSaveMutation]);
  
  // Check if form has meaningful data
  const hasMeaningfulData = useCallback((formData: any) => {
    const hasTitle = formData.title && formData.title.trim().length > 0;
    const hasDescription = formData.description && formData.description.trim().length > 0;
    const hasCoverImage = formData.coverImageUrl && formData.coverImageUrl.trim().length > 0;
    const hasGallery = formData.gallery && formData.gallery.length > 0;
    const hasServices = formData.selectedServiceIds && formData.selectedServiceIds.length > 0;
    const hasAmenities = formData.selectedAmenityIds && formData.selectedAmenityIds.length > 0;
    const hasItinerary = formData.itinerary && formData.itinerary.length > 0;
    return hasTitle || hasDescription || hasCoverImage || hasGallery || hasServices || hasAmenities || hasItinerary;
  }, []);

  // Auto-save effect using debounced form.watch subscription
  // This avoids render loops while still reacting to form changes
  useEffect(() => {
    // Subscribe to form changes - form.watch with callback doesn't cause re-renders
    const subscription = form.watch(() => {
      // If already saving, mark pending changes for follow-up
      if (isSavingRef.current || autoSaveMutation.isPending) {
        pendingChangesRef.current = true;
        return;
      }
      
      // Skip if offline, hidden, or published. Editing a live experience has
      // no draft row behind it, and silently writing one would fork the event.
      if (!navigator.onLine || document.hidden || isPublished || editingExperienceId) {
        return;
      }
      
      // Clear any existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      // Debounce autosave by 8 seconds
      autoSaveTimeoutRef.current = setTimeout(() => {
        // Re-check conditions using refs for fresh values
        if (isSavingRef.current || autoSaveMutation.isPending || !navigator.onLine || document.hidden || isPublished || editingExperienceId) {
          return;
        }
        
        if (!form.formState.isDirty) {
          return;
        }
        
        const formData = form.getValues();
        if (!hasMeaningfulData(formData)) {
          return;
        }
        
        // Trigger autosave
        if (import.meta.env.DEV) {
          console.log('Triggering debounced auto-save...');
        }
        setIsSaving(true);
        setLastAutoSaveTime(Date.now());
        autoSaveMutation.mutate(formData);
      }, 8000);
    });
    
    // Cleanup subscription and timeout on unmount
    return () => {
      subscription.unsubscribe();
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished, hasMeaningfulData, editingExperienceId]);

  // Reset draftLoaded when navigating to a different draft
  useEffect(() => {
    if (draftId !== currentDraftId) {
      setDraftLoaded(false);
    }
  }, [draftId, currentDraftId]);

  const eventType = form.watch('type');
  const activeSteps = useMemo(
    () => getStepsForEventType(eventType ?? initialExperienceType),
    [eventType, initialExperienceType],
  );

  // One-day and virtual events skip the Rooms step, so switching type can strand
  // the creator on a step that no longer exists, and can leave trip-only data
  // behind on an event that is no longer a trip. Both follow from the type
  // changing — and from nothing else, which is why `currentStep` is no longer a
  // dependency here. It was, and that is what made every step change run this.
  const prevEventTypeForClear = useRef<string>('multi-day'); // Initialize to default
  useEffect(() => {
    // If the current step is hidden for this type, move to the next available step.
    setCurrentStep((step) => {
      if (activeSteps.some((entry) => entry.id === step)) return step;
      const nextVisibleStep = activeSteps.find((entry) => entry.id > step)
        || activeSteps[activeSteps.length - 1];
      return nextVisibleStep ? nextVisibleStep.id : step;
    });
    
    // Clear trip-only fields when switching TO one-day or virtual FROM multi-day
    const wasMultiDay = prevEventTypeForClear.current === 'multi-day';
    const isNowNonRoom = eventType === 'one-day' || eventType === 'virtual';
    if (wasMultiDay && isNowNonRoom) {
      const currentRooms = form.getValues('rooms') || [];
      if (currentRooms.length > 0) {
        form.setValue('rooms', [], { shouldDirty: true });
        form.setValue('ticketSkus', [], { shouldDirty: true });
      }
      (form as any).setValue('selectedServices', [], { shouldDirty: true });
      (form as any).setValue('selectedAmenities', [], { shouldDirty: true });
      form.setValue('selectedServiceIds', [], { shouldDirty: true });
      form.setValue('selectedAmenityIds', [], { shouldDirty: true });
      form.setValue('serviceDemandNotes', {}, { shouldDirty: true });
      form.setValue('serviceConnectRequests', {}, { shouldDirty: true });
    }
    prevEventTypeForClear.current = eventType || 'multi-day';
  }, [eventType, activeSteps, form]);

  // Helper function to normalize loaded data (works for both drafts and experiences)
  const normalizeLoadedData = (data: any) => {
    // Normalize dates from ISO strings to Date objects
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    if (data.mvgDeadline) data.mvgDeadline = new Date(data.mvgDeadline);
    if (data.itinerary) {
      data.itinerary = data.itinerary.map((day: any) => ({
        ...day,
        date: new Date(day.date)
      }));
    }
    
    // Map MVG fields and ensure image fields are properly handled
    const derivedPromotionDealType = data.promotionDealType
      ?? (data.influencerPromotionEnabled ? 'commission_per_ticket' : null);
    return {
      ...data,
      requireMinimumParticipants: data.mvgEnabled !== undefined ? data.mvgEnabled : true,
      minimumParticipants: data.mvgMinimumSize || data.minimumParticipants || 6,
      mvgDeadlineDays: data.mvgDeadlineDays ?? 7,
      mvgDeadline: data.mvgDeadline,
      // Ensure Great Pillars array is properly handled
      greatPillars: normalizeGreatPillars(data.greatPillars),
      // Ensure image fields are properly handled
      coverImageUrl: data.coverImageUrl || '',
      gallery: Array.isArray(data.gallery) ? data.gallery.filter((url: string) => url && url.startsWith('http')) : [],
      // Migrate legacy room photo field to gallery array
      rooms: Array.isArray(data.rooms) ? data.rooms.map((room: any) => ({
        ...room,
        gallery: (room.gallery ?? (room.photo ? [room.photo] : [])).slice(0,3),
        photo: undefined
      })) : [],
      // Ensure services and amenities arrays are properly handled
      selectedServiceIds: Array.isArray(data.selectedServiceIds) ? data.selectedServiceIds : [],
      selectedAmenityIds: Array.isArray(data.selectedAmenityIds) ? data.selectedAmenityIds : [],
      serviceDemandNotes: data.serviceDemandNotes || {},
      serviceConnectRequests: data.serviceConnectRequests || {},
      // Ensure roles array is properly loaded
      roles: Array.isArray(data.roles) ? data.roles : [],
      // Ensure currency is properly set without fallback
      currency: data.currency ?? null,
      // Map experience-specific fields to form fields
      maxParticipants: data.maxParticipants || data.capacity,
      price: data.price || data.basePrice,
      // Ensure marketplace economics defaults are preserved when loading drafts.
      monetisationMode: 'creator_led',
      // Blank or disabled historical targets must not fall through to the
      // server's legacy access-only representation when republished.
      venueTargetDeal: data.venueTargetDeal && data.venueTargetDeal !== "access_only"
        ? data.venueTargetDeal
        : "revenue_share",
      venueCompensationModel: data.venueCompensationModel && data.venueCompensationModel !== "access_only"
        ? data.venueCompensationModel
        : "revenue_share",
      venueFixedFee: data.venueFixedFee != null ? parseFloat(data.venueFixedFee) : 0,
      venuePerHeadAmount: data.venuePerHeadAmount != null ? parseFloat(data.venuePerHeadAmount) : 0,
      venuePerRoomPerNight: data.venuePerRoomPerNight != null ? parseFloat(data.venuePerRoomPerNight) : 0,
      venueMinimumSpend: data.venueMinimumSpend != null ? parseFloat(data.venueMinimumSpend) : 0,
      venueRevenueSharePct: data.venueRevenueSharePct != null
        ? parseFloat(data.venueRevenueSharePct)
        : (data.venueRevenuePercentage ?? 0),
      venueAccessFee: data.venueAccessFee != null ? parseFloat(data.venueAccessFee) : 0,
      venueCommitmentFee: data.venueCommitmentFee != null ? parseFloat(data.venueCommitmentFee) : 0,
      venueBarterTerms: data.venueBarterTerms || '',
      venueRevenuePercentage: data.venueRevenuePercentage ?? data.venueRevenueSharePct ?? 0,
      creatorPct: data.creatorPct ?? 85,
      platformPct: FIXED_PLATFORM_FEE_PCT,
      participantReferralDealType: data.participantReferralDealType ?? null,
      participantReferralVenueBacked: data.participantReferralVenueBacked === true,
      participantReferralCommissionPct: data.participantReferralCommissionPct != null
        ? parseFloat(data.participantReferralCommissionPct)
        : 0,
      participantReferralMilestoneAttendeeTarget: data.participantReferralMilestoneAttendeeTarget ?? null,
      participantReferralMilestoneRewardDescription: data.participantReferralMilestoneRewardDescription || '',
      influencerPromotionEnabled: data.influencerPromotionEnabled ?? false,
      influencerCommissionPct: data.influencerCommissionPct != null ? parseFloat(data.influencerCommissionPct) : 0,
      promotionDealType: derivedPromotionDealType,
      promotionMilestoneAttendeeTarget: data.promotionMilestoneAttendeeTarget ?? null,
      promotionMilestoneRewardTickets: data.promotionMilestoneRewardTickets ?? 1,
      promotionBrandPitch: data.promotionBrandPitch || '',
      promotionSponsorshipAmount: data.promotionSponsorshipAmount != null
        ? parseFloat(data.promotionSponsorshipAmount)
        : null,
      promotionSelectedPartnerIds: Array.isArray(data.promotionSelectedPartnerIds)
        ? data.promotionSelectedPartnerIds
        : [],
      promotionExternalInvites: Array.isArray(data.promotionExternalInvites)
        ? data.promotionExternalInvites
        : [],
      promoterEnabled: data.promoterEnabled ?? true,
      // Sanitised on the way in as well as out: a draft saved before a deal
      // type existed must not resurrect it in the picker.
      eventPartners: sanitisePartnerEntries(data.eventPartners),
      standingCapacity: data.standingCapacity ?? null,
      seatedCapacity: data.seatedCapacity ?? null,
      // Ensure ticketSkus array is properly handled
      ticketSkus: Array.isArray(data.ticketSkus) ? data.ticketSkus : [],
    };
  };

  // Load existing draft or published experience
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      if (!draftId || draftLoaded) return;

      try {
        // The id can be either a saved draft or an already published
        // experience, and only one of the two lookups will hit. Neither may
        // throw on its miss, or the second one never runs.
        const draft = await fetchJsonOrNull(`/api/experience-drafts/${draftId}`);

        if (draft?.id) {
          const mappedData = normalizeLoadedData(draft);

          form.reset(mappedData);
          setCurrentStep(draft.currentStep || 1);
          setCurrentDraftId(draft.id);
          setEditingExperienceId(undefined);
          setDraftStatus(draft.status || 'draft');
          setManualDealUnlocked(draft.manualDealUnlocked === true);
          setDraftLoaded(true);
          return;
        }

        const experience = await fetchJsonOrNull(`/api/experiences/${draftId}`);

        if (experience?.id) {
          const mappedData = normalizeLoadedData(
            experienceToBuilderFields(experience, FIXED_PLATFORM_FEE_PCT),
          );

          form.reset(mappedData);
          setCurrentStep(1); // Start from beginning when editing experience
          setCurrentDraftId(experience.id);
          setEditingExperienceId(experience.id);
          setManualDealUnlocked(experience.manualDealUnlocked === true);
          setDraftStatus(experience.status || 'pending_approval');
          setDraftLoaded(true);
          return;
        }

        // Neither found
        console.log("ID not found as draft or experience:", draftId);
        toast({
          title: "Not found",
          description: "The requested experience could not be found. Starting with a fresh form.",
          variant: "destructive",
        });
        
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "Error loading",
          description: "Failed to load the experience. Starting with a fresh form.",
          variant: "destructive",
        });
      }
    };

    loadData();
  }, [user?.id, draftId, draftLoaded, toast]);

  // Both steps that can create the clash read the same answer as the gate
  // below, so what the creator is told and what they are allowed to do can
  // never drift apart.
  const watchedVenueId = form.watch('selectedVenueId');
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');
  const { hasConflict: venueDatesClash } = useVenueDateConflicts(
    watchedVenueId,
    toDateOnly(watchedStartDate),
    toDateOnly(watchedEndDate),
    editingExperienceId,
  );

  /**
   * Move to a step, persisting the current one on the way.
   *
   * Next did this; clicking a tab in the stepper row did not, and that is
   * exactly how someone reviews a nearly-finished draft — hopping between
   * steps to check their work. Every edit made that way was silently lost.
   */
  const goToStep = async (stepId: number) => {
    if (stepId === currentStep) return;
    setCurrentStep(stepId);

    try {
      const formData = form.getValues();

      if (!currentDraftId) {
        if (!user?.id) return;
        const draftData = normalizeDraftForSave({
          ...formData,
          currentStep: stepId,
          creatorId: user.id,
        });
        const response = await apiRequest("POST", "/api/experience-drafts", draftData);
        const result = await response.json();
        if (result.id) {
          setCurrentDraftId(result.id);
          window.history.replaceState(null, "", `/event-builder/${result.id}`);
        }
      } else {
        autoSaveMutation.mutate({ ...formData, currentStep: stepId } as any);
      }
    } catch (error) {
      console.error("Draft save during stepper navigation failed:", error);
      setSaveError(error instanceof Error ? error.message : "Draft save failed");
    }
  };

  const nextStep = async () => {
    // A venue that is already booked on these dates cannot host this event.
    // Refuse to carry the creator deeper into a plan that cannot happen —
    // the Dates and Venue steps both show why, and either can be changed.
    if (venueDatesClash && (currentStep === DATES_STEP_ID || currentStep === VENUE_STEP_ID)) {
      toast({
        title: "This venue is booked on your selected dates",
        description: "Change your dates on the Dates step, or pick a different venue.",
        variant: "destructive",
      });
      return;
    }

    // Find current position in activeSteps and move to next
    const currentIdx = activeSteps.findIndex(s => s.id === currentStep);
    if (currentIdx < activeSteps.length - 1) {
      const nextStepId = activeSteps[currentIdx + 1].id;
      setCurrentStep(nextStepId);

      try {
        const formData = form.getValues();
        
        // If no draft ID exists, create one first
        if (!currentDraftId) {
          if (!user?.id) {
            toast({
              title: "Authentication required",
              description: "Please log in to continue creating your experience.",
              variant: "destructive",
            });
            return;
          }
          
          // Create initial draft before navigation
          const draftData = normalizeDraftForSave({
            ...formData,
            currentStep: nextStepId, // Set to next step
            creatorId: user.id
          });
          
          const response = await apiRequest("POST", "/api/experience-drafts", draftData);
          
          const result = await response.json();
          if (result.id) {
            setCurrentDraftId(result.id);
            window.history.replaceState(null, "", `/event-builder/${result.id}`);
          }
        } else {
          // Update existing draft - note: currentStep will be updated separately in the mutation function
          autoSaveMutation.mutate({ ...formData, currentStep: nextStepId } as any);
        }
      } catch (error) {
        console.error("Draft save during navigation failed:", error);
        setSaveError(error instanceof Error ? error.message : "Draft save failed");
        toast({
          title: "Draft not saved yet",
          description: "You can keep building. Save or submit will retry syncing your draft.",
          variant: "destructive",
        });
      }
    }
  };

  const prevStep = () => {
    // Find current position in activeSteps and move to previous
    const currentIdx = activeSteps.findIndex(s => s.id === currentStep);
    if (currentIdx > 0) {
      setCurrentStep(activeSteps[currentIdx - 1].id);
    }
  };

  const handleSaveDraft = async () => {
    // Prevent duplicate requests
    if (isSaving) return;
    
    setIsSaving(true);
    setSaveError(null); // Clear previous errors
    
    try {
      // Get all form values
      const formData = form.getValues();
      
      // Collect all required form fields (title, description, location, media, rooms, pricing, terms)
      //
      // `...formData` first, then the explicit mappings on top.
      //
      // This used to be an allowlist and nothing else, which meant any form
      // field somebody forgot to list here was silently discarded by the Save
      // Draft button — while autosave and step navigation, which spread the
      // whole form, kept it. A creator who set up a discount and pressed the
      // button they were told to press lost it; one who wandered to the next
      // step did not. `discounts`, `expectedAudienceSize` and `addonRequests`
      // were all being dropped this way.
      //
      // The explicit entries below still win, because several of them are real
      // mappings (form name → draft column) rather than pass-throughs. What the
      // spread changes is the default for everything nobody thought to add:
      // kept, rather than thrown away without a word.
      const rawDraftPayload = {
        ...formData,

        // Basic info fields
        title: formData.title || '',
        shortDescription: formData.shortDescription || '',
        description: formData.description || '',
        category: formData.category || '',
        type: formData.type || 'one-day',
        greatPillars: normalizeGreatPillars(formData.greatPillars),
        
        // Media fields
        coverImageUrl: formData.coverImageUrl || '',
        gallery: formData.gallery || [],
        
        // Date fields - will be normalized below
        startDate: formData.startDate,
        endDate: formData.endDate,
        // Single-day event start/end times (required for publishing one-day events)
        startTime: formData.startTime || '',
        endTime: formData.endTime || '',
        mvgDeadline: formData.mvgDeadline,
        mvgDeadlineDays: formData.mvgDeadlineDays,

        // Venue/location fields
        location: formData.location || '',
        venueType: formData.venueType || 'catalog',
        venueOpenSpaceType: formData.venueOpenSpaceType || undefined,
        venueTargetDeal: formData.venueTargetDeal || undefined,
        venueTargetDealValue: formData.venueTargetDealValue || undefined,
        selectedVenueId: formData.selectedVenueId || '',
        manualVenueName: formData.manualVenueName || '',
        manualVenueAddress: formData.manualVenueAddress || '',
        manualVenueContactName: formData.manualVenueContactName || '',
        manualVenueEmail: formData.manualVenueEmail || '',
        manualVenuePropertyUrl: formData.manualVenuePropertyUrl || '',
        manualVenueDescription: formData.manualVenueDescription || '',
        manualVenueCapacity: formData.manualVenueCapacity,
        manualVenuePhotos: formData.manualVenuePhotos || [],
        virtualPlatform: formData.virtualPlatform || '',
        virtualMeetingUrl: formData.virtualMeetingUrl || '',
        virtualInstructions: formData.virtualInstructions || '',

        // Room fields
        accommodationType: formData.accommodationType,
        roomCapacity: formData.roomCapacity,
        totalRooms: formData.totalRooms,
        rooms: formData.rooms || [],
        
        // Pricing and deposit fields
        price: formData.price || formData.pricePerPerson || '',
        pricePerPerson: formData.pricePerPerson || formData.price || 0,
        ticketSkus: normalizeEventTripFields(formData).ticketSkus,
        // DATA CONTRACT: Default to EUR for new experiences
        currency: (formData.currency || 'eur').toLowerCase(),
        depositEnabled: formData.type === 'multi-day'
          && normalizeEventTripFields(formData).ticketSkus.some((sku: any) => Number(sku?.depositPerPerson || 0) > 0),
        depositPercentage: formData.depositPercentage || 20,
        
        // Marketplace economics
        venueCompensationModel: formData.venueCompensationModel || "revenue_share",
        venueFixedFee: formData.venueFixedFee || 0,
        venuePerHeadAmount: formData.venuePerHeadAmount || 0,
        venuePerRoomPerNight: formData.venuePerRoomPerNight || 0,
        venueMinimumSpend: formData.venueMinimumSpend || 0,
        venueRevenueSharePct: formData.venueRevenueSharePct || 0,
        venueCommitmentFee: formData.venueCommitmentFee || 0,
        venueBarterTerms: formData.venueBarterTerms || null,
        venueAccessFee: formData.venueAccessFee || 0,
        // Legacy percentage fields remain for compatibility, but platform is fixed.
        venueRevenuePercentage: formData.venueCompensationModel === "revenue_share"
          ? (formData.venueRevenueSharePct || 0)
          : 0,
        creatorRevenuePercentage: 85,
        platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
        creatorPct: 85,
        platformPct: FIXED_PLATFORM_FEE_PCT,
        monetisationMode: 'creator_led',

        // Participant referral perk (B2C loop attached to attendee referral links)
        participantReferralDealType: formData.participantReferralDealType ?? null,
        participantReferralVenueBacked: formData.participantReferralVenueBacked === true,
        participantReferralCommissionPct: formData.participantReferralCommissionPct ?? 0,
        participantReferralMilestoneAttendeeTarget: formData.participantReferralMilestoneAttendeeTarget ?? null,
        participantReferralMilestoneRewardDescription: formData.participantReferralMilestoneRewardDescription || '',

        // Official partner deal (B2B loop for promoters, brands, and invited partners)
        promotionDealType: formData.promotionDealType ?? null,
        promotionMilestoneAttendeeTarget: formData.promotionMilestoneAttendeeTarget ?? null,
        promotionMilestoneRewardTickets: formData.promotionMilestoneRewardTickets ?? 1,
        promotionBrandPitch: formData.promotionBrandPitch || '',
        promotionSponsorshipAmount: formData.promotionSponsorshipAmount ?? null,
        promotionSelectedPartnerIds: formData.promotionSelectedPartnerIds || [],
        promotionExternalInvites: formData.promotionExternalInvites || [],
        promoterEnabled: formData.promoterEnabled ?? true,
        eventPartners: sanitisePartnerEntries(formData.eventPartners),
        influencerPromotionEnabled: formData.influencerPromotionEnabled ?? false,
        influencerCommissionPct: formData.influencerCommissionPct ?? 0,
        promoterCommission: formData.participantReferralCommissionPct ?? 0,

        // Daytime Space capacity
        standingCapacity: formData.standingCapacity ?? null,
        seatedCapacity: formData.seatedCapacity ?? null,

        // Capacity and MVG fields
        maxParticipants: formData.maxParticipants || formData.standingCapacity || formData.seatedCapacity || 1,
        // Map frontend MVG fields to draft schema fields (mvgMinimumSize in db)
        mvgEnabled: formData.requireMinimumParticipants ?? true,
        mvgMinimumSize: formData.minimumParticipants || 6,
        // Also send both names for backward compatibility
        requireMinimumParticipants: formData.requireMinimumParticipants ?? true,
        minimumParticipants: formData.minimumParticipants || 6,

        // Services and amenities
        selectedServiceIds: formData.selectedServiceIds || [],
        selectedAmenityIds: formData.selectedAmenityIds || [],
        serviceDemandNotes: formData.serviceDemandNotes || {},
        serviceConnectRequests: formData.serviceConnectRequests || {},
        
        // Roles and itinerary
        roles: formData.roles || [],
        itinerary: formData.itinerary || [],
        
        // Soft hold and other settings
        softHoldEnabled: formData.softHoldEnabled || false,
        softHoldDurationHours: formData.softHoldDurationHours || 48,
        balanceDueDays: formData.balanceDueDays || 14,
        termsAccepted: formData.termsAccepted === true, // Explicit boolean check to prevent false coercion
        termsDocumentUrl: formData.termsDocumentUrl || '',
        customTerms: formData.customTerms || '',
        
        // Meta fields
        currentStep,
        status: 'draft'
      };

      // Normalize dates to prevent bad payloads
      const draftPayload = normalizeDraftForSave(rawDraftPayload);

      let response;
      let endpoint;
      let method;
      
      if (currentDraftId) {
        endpoint = `/api/experience-drafts/${currentDraftId}`;
        method = "PUT";
      } else {
        endpoint = "/api/experience-drafts";
        method = "POST";
      }
      
      // Call the appropriate API endpoint
      response = await apiRequest(method, endpoint, draftPayload);

      if (response.ok) {
        const result = await response.json();
        setLastSaved(new Date());
        setSaveError(null);

        // /api/experience-drafts returns the draft directly (not wrapped in { success, draft })
        const draftId = result.id ?? result.draft?.id;
        if (!currentDraftId && draftId) {
          setCurrentDraftId(draftId);
          setLocation(`/event-builder/${draftId}`);
        }

        queryClient.invalidateQueries({ queryKey: ["/api/experience-drafts"] });
        toast({
          title: "Draft saved",
          description: "Your experience draft has been saved successfully.",
          duration: 2000,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail
          ? `${errorData.message}: ${errorData.detail}`
          : (errorData.message || 'Failed to save draft');
        setSaveError(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error("Draft save error:", error);
      const errorMessage = error.message || "There was an error saving your draft. Please try again.";
      setSaveError(errorMessage);
      
      toast({
        title: "Failed to save draft",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Validation function for required fields - STRICT validation for publishing
  // Strict validation for publishing - requires HTTPS URLs
  const validateForPublish = (data: any) => {
    const errors: string[] = [];
    
    // Check if this is a demo event (bypass validation for demos)
    const isDemoEvent = data.title?.toLowerCase().includes('mystic') && 
                       data.title?.toLowerCase().includes('marrakesh');
    
    // REQUIRED: Cover photo - allow valid URL formats with protocol allowlist
    // Skip for demo events
    if (!isDemoEvent) {
      if (!data.coverImageUrl || data.coverImageUrl.trim() === '') {
        errors.push("Cover photo is required and must be uploaded");
      } else {
        // Validate URL format and protocol
        try {
          const url = new URL(data.coverImageUrl);
          const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
          if (!allowedProtocols.includes(url.protocol)) {
            errors.push("Cover photo must use a valid protocol (https, http, blob, or data)");
          }
        } catch {
          errors.push("Cover photo must be a valid URL");
        }
      }
    }
    
    // Gallery validation - ensure valid URLs with protocol allowlist
    // Skip for demo events
    if (!isDemoEvent && data.gallery && data.gallery.length > 0) {
      const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
      const invalidGalleryUrls = data.gallery.filter((url: string) => {
        if (!url || url.trim() === '') return true;
        try {
          const urlObj = new URL(url);
          return !allowedProtocols.includes(urlObj.protocol);
        } catch {
          return true;
        }
      });
      if (invalidGalleryUrls.length > 0) {
        errors.push("All gallery images must be valid URLs with supported protocols");
      }
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Title is required");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Description is required");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Start date is required");
    }

    const experienceType = data.type || 'one-day';

    if (experienceType === 'one-day') {
      if (!data.startTime || data.startTime.trim() === '') {
        errors.push("Start time is required for a single-day event");
      }
      if (!data.endTime || data.endTime.trim() === '') {
        errors.push("End time is required for a single-day event");
      }
      if (!data.standingCapacity && !data.seatedCapacity && !data.maxParticipants) {
        errors.push("Standing or seated capacity is required for a single-day event");
      }
    }

    if (experienceType === 'multi-day') {
      if (!data.endDate) {
        errors.push("End date is required for a multi-day trip");
      }
      const rooms = Array.isArray(data.rooms) ? data.rooms : [];
      if (rooms.length === 0) {
        errors.push("At least one room or sleeping option is required for a multi-day trip");
      }
    }
    
    // Required: location
    if (!data.location || data.location.trim() === '') {
      errors.push("Location is required");
    }
    
    // Venue type specific validation - 5 distinct modes, no overlap
    const venueType = data.venueType || 'catalog';

    if (venueType === 'catalog') {
      // For catalog venues: ensure a venue is selected
      if (!data.selectedVenueId || data.selectedVenueId.trim() === '') {
        errors.push("Please select a venue from the catalog");
      }
    } else if (venueType === 'outdoor') {
      // For outdoor/public locations: only location is needed (validated above)
    } else if (venueType === 'manual') {
      // For custom venues: ensure required fields are filled
      if (!data.manualVenueName || data.manualVenueName.trim() === '') {
        errors.push("Custom venue name is required");
      }
      if (!data.manualVenueAddress || data.manualVenueAddress.trim() === '') {
        errors.push("Custom venue address is required");
      }
      if (!data.manualVenueEmail || !z.string().email().safeParse(data.manualVenueEmail).success) {
        errors.push("A valid venue email address is required");
      }
      if (!data.manualVenuePropertyUrl || !z.string().url().safeParse(data.manualVenuePropertyUrl).success) {
        errors.push("A valid property link is required");
      }
    } else if (venueType === 'virtual') {
      // For virtual events: ensure platform is selected
      if (!data.virtualPlatform || data.virtualPlatform.trim() === '') {
        errors.push("Virtual platform is required");
      }
    } else if (venueType === 'open') {
      // For open venue offers: city/location already validated above; space type required
      if (!data.venueOpenSpaceType || data.venueOpenSpaceType.trim() === '') {
        errors.push("Please select the type of space you are looking for");
      }
    }

    errors.push(...validateExperienceVenueDeal({
      ...data,
      // Mirrors the server: the unlock comes from the saved event, not the form.
      manualDealUnlocked,
    }));

    // The Deal Type Matrix's hard exclusions. Same function the server runs at
    // publish, so the checklist cannot promise something the publish refuses.
    errors.push(...validateExperienceDealTerms(data));

    for (const conflict of findDealConflicts([data.promotionDealType, data.participantReferralDealType])) {
      errors.push(conflict.reason);
    }

    // Required: pricing - zero is valid for free RSVP events.
    const ticketSkus = Array.isArray(data.ticketSkus) ? data.ticketSkus : [];
    const hasTicketPricing = ticketSkus.some((sku: any) => {
      const price = Number(sku?.pricePerPerson);
      return !Number.isNaN(price) && price >= 0;
    });
    const basePrice = data.pricePerPerson ?? data.price;
    const hasBasePricing = basePrice !== undefined && basePrice !== null && basePrice !== '' && Number(basePrice) >= 0;
    if (!hasTicketPricing && !hasBasePricing) {
      errors.push("Please set a ticket price, including 0 for free RSVP events");
    }

    const totalTicketCapacity = ticketSkus.reduce(
      (total: number, sku: any) => total + Number(sku?.ticketCapacity || 0),
      0,
    );
    if (data.requireMinimumParticipants && totalTicketCapacity > 0
      && Number(data.minimumParticipants || 0) > totalTicketCapacity) {
      errors.push(`Minimum participants cannot exceed total ticket capacity (${totalTicketCapacity})`);
    }
    const invalidDepositTicket = ticketSkus.find((sku: any) =>
      sku?.pricingMode !== 'free_rsvp'
      && Number(sku?.depositPerPerson || 0) > Number(sku?.pricePerPerson || 0)
    );
    if (invalidDepositTicket) {
      errors.push(`Deposit cannot exceed the full price for ${invalidDepositTicket.ticketName || 'a ticket'}`);
    }
    
    // Required: explicit currency selection
    if (!data.currency || data.currency === '') {
      errors.push("Currency must be explicitly selected");
    }

    if (data.participantReferralDealType === 'commission_per_ticket'
      && Number(data.participantReferralCommissionPct || 0) <= 0) {
      errors.push("Set a cashback percentage for the participant referral perk");
    }
    if (data.participantReferralDealType === 'milestone_barter') {
      if (Number(data.participantReferralMilestoneAttendeeTarget || 0) <= 0) {
        errors.push("Set how many friends a participant must bring for the referral milestone");
      }
      if (!data.participantReferralMilestoneRewardDescription
        || data.participantReferralMilestoneRewardDescription.trim() === '') {
        errors.push("Describe the participant milestone reward");
      }
    }

    if (data.promotionDealType === 'commission_per_ticket'
      && Number(data.influencerCommissionPct || 0) <= 0) {
      errors.push("Set a commission percentage for the official partner deal");
    }
    if (data.promotionDealType === 'milestone_barter') {
      if (Number(data.promotionMilestoneAttendeeTarget || 0) <= 0) {
        errors.push("Set how many attendees an official partner must bring for the milestone barter deal");
      }
      if (Number(data.promotionMilestoneRewardTickets || 0) <= 0) {
        errors.push("Set how many free tickets are earned in the milestone barter deal");
      }
    }
    if (data.promotionDealType === 'brand_barter'
      && (!data.promotionBrandPitch || data.promotionBrandPitch.trim() === '')) {
      errors.push("Describe what the brand barter deal includes");
    }
    if (data.promotionDealType === 'financial_sponsorship'
      && Number(data.promotionSponsorshipAmount || 0) <= 0) {
      errors.push("Set the sponsorship amount for the financial sponsorship deal");
    }
    if (data.promotionDealType) {
      const selectedPartners = Array.isArray(data.promotionSelectedPartnerIds)
        ? data.promotionSelectedPartnerIds
        : [];
      const externalInvites = Array.isArray(data.promotionExternalInvites)
        ? data.promotionExternalInvites
        : [];
      const hasExternalInvites = externalInvites.length > 0;
      const hasOpenToOffers = !!data.promoterEnabled;

      if (!hasOpenToOffers && selectedPartners.length === 0 && !hasExternalInvites) {
        errors.push("Choose at least one promotion distribution option: platform partners, external invites, or open to offers");
      }

      const emailSchema = z.string().email();
      const urlSchema = z.string().url();
      for (const invite of externalInvites) {
        if (!invite?.name || invite.name.trim() === '') {
          errors.push("Each external invite needs a brand or promoter name");
          break;
        }
        if (!invite?.email || !emailSchema.safeParse(invite.email).success) {
          errors.push("Each external invite needs a valid email address");
          break;
        }
        if (!invite?.website || !urlSchema.safeParse(invite.website).success) {
          errors.push("Each external invite needs a valid social or website link");
          break;
        }
      }
    }
    
    // Required: terms acceptance
    if (!data.termsAccepted) {
      errors.push("You must accept the terms and conditions");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  // Relaxed validation for draft saving - allows incomplete data
  const validateDraft = (data: any) => {
    const errors: string[] = [];
    
    // For draft saving, allow HTTP URLs (during upload process)
    if (!data.coverImageUrl || data.coverImageUrl.trim() === '' || !data.coverImageUrl.startsWith('http')) {
      errors.push("Cover photo is required and must be uploaded");
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Title is required");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Description is required");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Start date is required");
    }
    
    // Required: location
    if (!data.location || data.location.trim() === '') {
      errors.push("Location is required");
    }
    
    // Venue type specific validation - 5 distinct modes, no overlap
    const venueType = data.venueType || 'catalog';

    if (venueType === 'catalog') {
      // For catalog venues: ensure a venue is selected
      if (!data.selectedVenueId || data.selectedVenueId.trim() === '') {
        errors.push("Please select a venue from the catalog");
      }
    } else if (venueType === 'outdoor') {
      // For outdoor/public locations: only location is needed (validated above)
    } else if (venueType === 'manual') {
      // For custom venues: ensure required fields are filled
      if (!data.manualVenueName || data.manualVenueName.trim() === '') {
        errors.push("Custom venue name is required");
      }
      if (!data.manualVenueAddress || data.manualVenueAddress.trim() === '') {
        errors.push("Custom venue address is required");
      }
    } else if (venueType === 'virtual') {
      // For virtual events: ensure platform is selected
      if (!data.virtualPlatform || data.virtualPlatform.trim() === '') {
        errors.push("Virtual platform is required");
      }
    } else if (venueType === 'open') {
      // For open venue offers: space type required
      if (!data.venueOpenSpaceType || data.venueOpenSpaceType.trim() === '') {
        errors.push("Please select the type of space you are looking for");
      }
    }

    // Required: pricing - experience-level pricePerPerson (relaxed for draft)
    // Draft validation is more lenient - just check if some pricing info exists
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  const handleSubmit = async (data: EventBuilderData) => {
    // Prevent duplicate submissions
    if (isPublishing) return;

    // The step gate should have caught this, but a creator can reach Terms by
    // clicking the step rail, and the venue's calendar can change underneath
    // a draft that has been open for a while.
    if (venueDatesClash) {
      toast({
        title: "This venue is booked on your selected dates",
        description: "Change your dates on the Dates step, or pick a different venue, then submit again.",
        variant: "destructive",
      });
      setCurrentStep(VENUE_STEP_ID);
      return;
    }

    // Prevent re-submitting a draft that is already in the review queue. An
    // event that exists is a different case: saving it is an edit, not a
    // second submission.
    if (!editingExperienceId && (draftStatus === 'pending' || draftStatus === 'pending_approval')) {
      toast({
        title: "Already submitted",
        description: "This experience has already been submitted for review.",
        variant: "destructive",
      });
      return;
    }
    
    setIsPublishing(true);
    setPublishError(null); // Clear previous errors
    
    try {
      // Get all form values
      const formData = form.getValues();
      
      // Prepare event data for publishing (collect all form fields like saveDraft)
      // Same shape, and the same reason, as the draft payload above: spread the
      // whole form first so nothing is lost merely because it was not listed,
      // then let the deliberate mappings override. Publishing used to drop
      // `discounts` and `expectedAudienceSize` on the floor — the second is
      // what a venue reads on its invite to judge a flat-fee commitment, so it
      // was the one field the offer turned on and the one that never arrived.
      const rawPublishPayload = {
        ...formData,

        // Pass the current draft ID if we have one
        id: currentDraftId || undefined,
        
        // Basic info fields
        title: formData.title || '',
        shortDescription: formData.shortDescription || '',
        description: formData.description || '',
        category: formData.category || '',
        type: formData.type || 'one-day',
        greatPillars: normalizeGreatPillars(formData.greatPillars),
        
        // Media fields
        coverImageUrl: formData.coverImageUrl || '',
        gallery: formData.gallery || [],
        
        // Date fields - will be normalized below
        startDate: formData.startDate,
        endDate: formData.endDate,
        // Single-day event start/end times (required for publishing one-day events)
        startTime: formData.startTime || '',
        endTime: formData.endTime || '',
        mvgDeadline: formData.mvgDeadline,
        mvgDeadlineDays: formData.mvgDeadlineDays,

        // Venue/location fields
        location: formData.location || '',
        venueType: formData.venueType || 'catalog',
        venueOpenSpaceType: formData.venueOpenSpaceType || undefined,
        venueTargetDeal: formData.venueTargetDeal || undefined,
        venueTargetDealValue: formData.venueTargetDealValue || undefined,
        selectedVenueId: formData.selectedVenueId || '',
        manualVenueName: formData.manualVenueName || '',
        manualVenueAddress: formData.manualVenueAddress || '',
        manualVenueContactName: formData.manualVenueContactName || '',
        manualVenueEmail: formData.manualVenueEmail || '',
        manualVenuePropertyUrl: formData.manualVenuePropertyUrl || '',
        manualVenueDescription: formData.manualVenueDescription || '',
        manualVenueCapacity: formData.manualVenueCapacity,
        manualVenuePhotos: formData.manualVenuePhotos || [],
        virtualPlatform: formData.virtualPlatform || '',
        virtualMeetingUrl: formData.virtualMeetingUrl || '',
        virtualInstructions: formData.virtualInstructions || '',

        // Room fields
        accommodationType: formData.accommodationType,
        roomCapacity: formData.roomCapacity,
        totalRooms: formData.totalRooms,
        rooms: formData.rooms || [],
        
        // Pricing and deposit fields
        price: formData.price || formData.pricePerPerson || '',
        pricePerPerson: formData.pricePerPerson || formData.price || 0,
        ticketSkus: normalizeEventTripFields(formData).ticketSkus,
        // DATA CONTRACT: Default to EUR for new experiences
        currency: (formData.currency || 'eur').toLowerCase(),
        depositEnabled: formData.type === 'multi-day'
          && normalizeEventTripFields(formData).ticketSkus.some((sku: any) => Number(sku?.depositPerPerson || 0) > 0),
        depositPercentage: formData.depositPercentage || 20,
        
        // Marketplace economics
        venueCompensationModel: formData.venueCompensationModel || "revenue_share",
        venueFixedFee: formData.venueFixedFee || 0,
        venuePerHeadAmount: formData.venuePerHeadAmount || 0,
        venuePerRoomPerNight: formData.venuePerRoomPerNight || 0,
        venueMinimumSpend: formData.venueMinimumSpend || 0,
        venueRevenueSharePct: formData.venueRevenueSharePct || 0,
        venueCommitmentFee: formData.venueCommitmentFee || 0,
        venueBarterTerms: formData.venueBarterTerms || null,
        venueAccessFee: formData.venueAccessFee || 0,
        // Legacy percentage fields remain for compatibility, but platform is fixed.
        venueRevenuePercentage: formData.venueCompensationModel === "revenue_share"
          ? (formData.venueRevenueSharePct || 0)
          : 0,
        creatorRevenuePercentage: 85,
        platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
        creatorPct: 85,
        platformPct: FIXED_PLATFORM_FEE_PCT,
        monetisationMode: 'creator_led',

        // Participant referral perk (B2C loop attached to attendee referral links)
        participantReferralDealType: formData.participantReferralDealType ?? null,
        participantReferralVenueBacked: formData.participantReferralVenueBacked === true,
        participantReferralCommissionPct: formData.participantReferralCommissionPct ?? 0,
        participantReferralMilestoneAttendeeTarget: formData.participantReferralMilestoneAttendeeTarget ?? null,
        participantReferralMilestoneRewardDescription: formData.participantReferralMilestoneRewardDescription || '',

        // Official partner deal (B2B loop for promoters, brands, and invited partners)
        promotionDealType: formData.promotionDealType ?? null,
        promotionMilestoneAttendeeTarget: formData.promotionMilestoneAttendeeTarget ?? null,
        promotionMilestoneRewardTickets: formData.promotionMilestoneRewardTickets ?? 1,
        promotionBrandPitch: formData.promotionBrandPitch || '',
        promotionSponsorshipAmount: formData.promotionSponsorshipAmount ?? null,
        promotionSelectedPartnerIds: formData.promotionSelectedPartnerIds || [],
        promotionExternalInvites: formData.promotionExternalInvites || [],
        promoterEnabled: formData.promoterEnabled ?? true,
        eventPartners: sanitisePartnerEntries(formData.eventPartners),
        influencerPromotionEnabled: formData.influencerPromotionEnabled ?? false,
        influencerCommissionPct: formData.influencerCommissionPct ?? 0,
        promoterCommission: formData.participantReferralCommissionPct ?? 0,

        // Daytime Space capacity
        standingCapacity: formData.standingCapacity ?? null,
        seatedCapacity: formData.seatedCapacity ?? null,

        // Capacity and MVG fields
        maxParticipants: formData.maxParticipants || formData.standingCapacity || formData.seatedCapacity || 1,
        // Map frontend MVG fields to draft schema fields (mvgMinimumSize in db)
        mvgEnabled: formData.requireMinimumParticipants ?? true,
        mvgMinimumSize: formData.minimumParticipants || 6,
        // Also send both names for backward compatibility
        requireMinimumParticipants: formData.requireMinimumParticipants ?? true,
        minimumParticipants: formData.minimumParticipants || 6,

        // Services and amenities
        selectedServiceIds: formData.selectedServiceIds || [],
        selectedAmenityIds: formData.selectedAmenityIds || [],
        serviceDemandNotes: formData.serviceDemandNotes || {},
        serviceConnectRequests: formData.serviceConnectRequests || {},
        
        // Roles and itinerary
        roles: formData.roles || [],
        itinerary: formData.itinerary || [],
        
        // Soft hold and other settings
        softHoldEnabled: formData.softHoldEnabled || false,
        softHoldDurationHours: formData.softHoldDurationHours || 48,
        balanceDueDays: formData.balanceDueDays || 14,
        termsAccepted: formData.termsAccepted === true, // Explicit boolean check to prevent false coercion
        termsDocumentUrl: formData.termsDocumentUrl || '',
        customTerms: formData.customTerms || '',
        
        // Meta fields
        currentStep,
        status: 'pending'
      };

      // Normalize dates to prevent bad payloads
      const publishPayload = normalizeDraftForSave(rawPublishPayload);

      // The event already exists, so this is an edit: write straight to it and
      // leave its status, bookings and review history alone. There is no draft
      // row to publish, which is why the draft-publish call 404s here.
      if (editingExperienceId) {
        const response = await apiRequest(
          "PUT",
          `/api/experiences/${editingExperienceId}/builder`,
          publishPayload,
        );
        const updated = await response.json();

        setPublishError(null);
        // Re-baseline the form so the unsaved-changes state clears.
        form.reset(form.getValues());
        queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
        queryClient.invalidateQueries({ queryKey: [`/api/experiences/${editingExperienceId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
        setLastSaved(new Date());

        toast({
          title: "Changes saved",
          description: "Your live event has been updated.",
          duration: 3000,
        });

        // An edit does not go back through review, so this does not belong on
        // the dashboard's pending tab that `onComplete` navigates to.
        void updated;
        return;
      }

      let publishDraftId = currentDraftId;
      if (!publishDraftId) {
        const createDraftResponse = await apiRequest("POST", "/api/experience-drafts", {
          ...publishPayload,
          status: "draft",
          currentStep,
        });
        const createdDraft = await createDraftResponse.json();
        publishDraftId = createdDraft.id;
        setCurrentDraftId(publishDraftId);
      }

      // Call the publish API to convert draft to experience
      const response = await apiRequest("POST", `/api/experience-drafts/${publishDraftId}/publish`, publishPayload);

      if (response.ok) {
        const result = await response.json();
        
        // Check for success: either result.success is true OR we have a valid experience/id returned
        if (result.success || result.experience || result.id) {
          setPublishError(null); // Clear any previous errors
          setIsPublished(true); // Stop auto-save from running
          
          toast({
            title: "Experience submitted for review!",
            description: "Your experience has been submitted successfully and is pending approval.",
            duration: 3000,
          });
          
          // Redirect to creator dashboard pending tab after successful submission
          setTimeout(() => {
            setLocation("/creator-dashboard?tab=pending");
          }, 1500);
          
          onComplete?.(result.experience?.id || result.id);
        } else {
          const errorMessage = result.message || 'Failed to publish event';
          setPublishError(errorMessage);
          throw new Error(errorMessage);
        }
      } else {
        // Handle specific API response errors
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = "There was an error submitting your experience for review.";
        
        if (response.status === 400) {
          // Validation errors from server
          if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage = `Please complete the following: ${errorData.errors.join(', ')}`;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = "Your experience has validation errors. Please review all required fields.";
          }
        } else if (response.status === 404) {
          errorMessage = "Draft not found. Please save your changes first.";
        } else if (response.status === 403) {
          errorMessage = "You don't have permission to submit this experience.";
        } else if (response.status >= 500) {
          errorMessage = "Server error occurred. Please try again in a few moments.";
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        
        // Name the step that owns the field. An error about a field on a
        // step the creator cannot see reads as the save failing for no
        // reason — which is how "it doesn't save my event" gets reported.
        const errorStep = findStepForError(errorMessage);
        if (errorStep) errorMessage = `${errorMessage} — it's on the ${errorStep.label} step.`;
        setPublishError(errorMessage);
        
        toast({
        title: "Submission failed",
        description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      // Handle network errors or other unexpected errors
      let errorMessage = "There was an error submitting your experience for review.";
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.name === 'AbortError') {
        errorMessage = "Request timed out. Please try again.";
      } else if (error.message) {
        // Parse API error responses that come in format "400: {json}"
        const errorMatch = error.message.match(/^\d+:\s*(.+)$/);
        if (errorMatch) {
          try {
            const errorData = JSON.parse(errorMatch[1]);
            if (errorData.errors && Array.isArray(errorData.errors)) {
              errorMessage = `Please complete the following: ${errorData.errors.join(', ')}`;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // If JSON parsing fails, use the message as-is but clean it up
            errorMessage = error.message.replace(/^\d+:\s*/, '');
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      // Name the step that owns the field. An error about a field on a
      // step the creator cannot see reads as the save failing for no
      // reason — which is how "it doesn't save my event" gets reported.
      const errorStep = findStepForError(errorMessage);
      if (errorStep) errorMessage = `${errorMessage} — it's on the ${errorStep.label} step.`;
      setPublishError(errorMessage);
      
      toast({
        title: "Submission failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Use activeSteps for dynamic step navigation (skips Rooms for one-day/virtual)
  const currentStepIndex = activeSteps.findIndex(s => s.id === currentStep);
  const currentStepData = activeSteps[currentStepIndex] || ALL_STEPS[currentStep - 1]; // Fallback to ALL_STEPS
  const progress = ((currentStepIndex + 1) / activeSteps.length) * 100;
  const isLastStep = currentStepIndex === activeSteps.length - 1;
  
  // Watch termsAccepted to trigger re-validation when checkbox changes
  const watchedTermsAccepted = form.watch('termsAccepted');
  
  // Get current validation status - use strict validation for submit button
  // Note: We include watchedTermsAccepted in deps to re-validate when terms checkbox changes
  const currentValidation = useMemo(() => {
    try {
      const formData = form.getValues();
      return isLastStep 
        ? validateForPublish(formData) 
        : validateDraft(formData);
    } catch (error) {
      console.error('[EventBuilder] Validation error:', error);
      return { isValid: false, missingFields: 0, errors: [] as string[] };
    }
  }, [isLastStep, form.formState.submitCount, watchedTermsAccepted]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {editingExperienceId ? "Edit Experience" : "Create Experience"}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Step {currentStepIndex + 1} of {activeSteps.length}: {currentStepData.title}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {autosaveRejected ? (
                <div
                  className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400"
                  data-testid="text-unsaved-changes"
                >
                  <AlertCircle className="w-4 h-4" />
                  Unsaved changes — use Save Draft
                </div>
              ) : lastSaved ? (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Saved {lastSaved.toLocaleTimeString()}
                </div>
              ) : null}
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
          
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps Navigation */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {activeSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = idx < currentStepIndex;
              
              return (
                <Button
                  key={step.id}
                  variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}
                  size="sm"
                  className={cn(
                    "flex items-center gap-2",
                    isActive && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => { void goToStep(step.id); }}
                  data-testid={`step-${step.id}-button`}
                >
                  <Icon className="w-4 h-4" />
                  {step.title}
                  {isCompleted && <CheckCircle className="w-3 h-3 ml-1" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <Form {...form}>
          <form onSubmit={(event) => event.preventDefault()} noValidate>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <currentStepData.icon className="w-5 h-5" />
                  {currentStepData.title}
                </CardTitle>
                <p className="text-gray-600 dark:text-gray-400">
                  {currentStepData.description}
                </p>
              </CardHeader>
              <CardContent className="min-h-[400px]">
                <StepContentWrapper>
                  {renderStepContent()}
                </StepContentWrapper>
              </CardContent>
            </Card>

          {/* Validation Checklist - Show on final step */}
          {isLastStep && (
            <div className="mt-8 p-6 border rounded-lg bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold mb-4">Publication Checklist</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ChecklistItem 
                    label="Cover Photo" 
                    completed={(() => {
                      const coverUrl = form.watch('coverImageUrl');
                      return !!(coverUrl && coverUrl.trim() && coverUrl.startsWith('http'));
                    })()} 
                  />
                  <ChecklistItem 
                    label="Title" 
                    completed={!!form.watch('title')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Description" 
                    completed={!!form.watch('description')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Start Date" 
                    completed={!!form.watch('startDate')} 
                  />
                  <ChecklistItem 
                    label="Location" 
                    completed={!!form.watch('location')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Venue Selection" 
                    completed={(() => {
                      const venueType = form.watch('venueType') || 'catalog';
                      if (venueType === 'catalog') {
                        return !!form.watch('selectedVenueId')?.trim();
                      } else if (venueType === 'outdoor') {
                        // Outdoor venues only need location (already validated separately)
                        return !!form.watch('location')?.trim();
                      } else if (venueType === 'manual') {
                        return !!form.watch('manualVenueName')?.trim()
                          && !!form.watch('manualVenueAddress')?.trim()
                          && z.string().email().safeParse(form.watch('manualVenueEmail')).success
                          && z.string().url().safeParse(form.watch('manualVenuePropertyUrl')).success;
                      } else if (venueType === 'virtual') {
                        return !!form.watch('virtualPlatform')?.trim();
                      } else if (venueType === 'open') {
                        return !!form.watch('venueOpenSpaceType')?.trim();
                      }
                      return false;
                    })()}
                  />
                  <ChecklistItem
                    label="Currency Selection"
                    completed={!!form.watch('currency')}
                  />
                  <ChecklistItem
                    label="Price Per Person"
                    completed={(() => {
                      const pricePerPerson = form.watch('pricePerPerson');
                      const parsed = parseFloat(String(pricePerPerson));
                      return pricePerPerson !== undefined && pricePerPerson !== null && !Number.isNaN(parsed) && parsed >= 0;
                    })()}
                  />
                  <ChecklistItem 
                    label="Terms Accepted" 
                    completed={!!form.watch('termsAccepted')} 
                  />
                </div>
                
                {!currentValidation.isValid && (
                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                          {currentValidation.missingFields} required field{currentValidation.missingFields !== 1 ? 's' : ''} missing
                        </h4>
                        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                          {currentValidation.errors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                {currentValidation.isValid && (
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="font-medium text-green-900 dark:text-green-100">
                        Ready to publish! All required fields are complete.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              data-testid="button-previous-step"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <div className="flex flex-col items-end gap-2">
              {/* Inline Error Messages */}
              {(saveError || publishError) && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 max-w-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">
                        {saveError
                          ? "Draft Save Failed"
                          : editingExperienceId ? "Save Failed" : "Publish Failed"}
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {saveError || publishError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                {editingExperienceId ? (
                  // A live event has no draft behind it. The save is available
                  // from every step so a one-field fix does not mean walking
                  // the whole builder to reach the last one.
                  !isLastStep && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSubmit(form.getValues())}
                      disabled={isPublishing}
                      data-testid="button-save-live-changes"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isPublishing ? "Saving..." : "Save changes"}
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={isSaving || isPublishing}
                    data-testid="button-save-draft"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Saving..." : "Save Draft"}
                  </Button>
                )}

                {!isLastStep ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    data-testid="button-next-step"
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : editingExperienceId ? (
                  <Button
                    type="button"
                    onClick={() => handleSubmit(form.getValues())}
                    disabled={!currentValidation.isValid || isPublishing}
                    data-testid="button-save-live-changes"
                    className={(!currentValidation.isValid || isPublishing) ? "opacity-50 cursor-not-allowed" : ""}
                  >
                    {isPublishing ? "Saving..." : "Save changes"}
                    <CheckCircle className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <>
                    {draftStatus === 'pending' || draftStatus === 'pending_approval' ? (
                      <Button
                        disabled={true}
                        variant="outline"
                        data-testid="button-already-submitted"
                        className="opacity-50 cursor-not-allowed"
                      >
                        Already Submitted for Review
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => handleSubmit(form.getValues())}
                        disabled={!currentValidation.isValid || isPublishing}
                        data-testid="button-submit-experience"
                        className={(!currentValidation.isValid || isPublishing) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        {isPublishing ? "Submitting..." : "Submit for Review"}
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          </form>
        </Form>
      </div>
    </div>
  );

  function renderStepContent() {
    switch (currentStep) {
      case 1:
        return <BasicInfoStep form={form} />;
      case 2:
        return <MediaStep form={form} isSaving={isSaving} setIsSaving={setIsSaving} autoSaveMutation={autoSaveMutation} />;
      case 3:
        return <DatesStep form={form} editingExperienceId={editingExperienceId} />;
      case 4:
        return <VenueStepWrapper form={form} editingExperienceId={editingExperienceId} />;
      case 5:
        return <ServicesAndAmenitiesStep form={form} />;
      case 6:
        return <RolesStep form={form} />;
      case 7:
        return <RoomsStep form={form} />;
      case 8:
        return <PromotionStep form={form} goToStep={goToStep} manualDealUnlocked={manualDealUnlocked} />;
      case 9:
        return <ItineraryStep form={form} />;
      case 10:
        return <PricingStep form={form} manualDealUnlocked={manualDealUnlocked} experienceId={editingExperienceId} goToStep={goToStep} />;
      case 11:
        return <TermsStep form={form} />;
      default:
        return <div>Unknown step</div>;
    }
  }
}

// Step Content Wrapper - catches errors in step rendering
class StepContentWrapper extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[StepContentWrapper] Error caught:', error);
    console.error('[StepContentWrapper] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">Error loading this step</h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred while loading this step.'}
          </p>
          <pre className="text-xs bg-red-100 dark:bg-red-900 p-2 rounded overflow-auto max-h-32 mb-4">
            {this.state.error?.stack || 'No stack trace available'}
          </pre>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Validation Components
function ChecklistItem({ label, completed }: { label: string; completed: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {completed ? (
        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
      ) : (
        <AlertCircle className="w-4 h-4 text-gray-400" />
      )}
      <span className={completed ? "text-green-900 dark:text-green-100" : "text-gray-600 dark:text-gray-400"}>
        {label}
      </span>
    </div>
  );
}

// Step Components
function BasicInfoStep({ form }: { form: any }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {/* Title Field */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Experience Title *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Yoga Retreat in Bali"
                  {...field}
                  data-testid="input-experience-title"
                />
              </FormControl>
              <FormDescription>
                Choose a clear, engaging title that captures the essence of your experience.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Short Description Field */}
        <FormField
          control={form.control}
          name="shortDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short Description</FormLabel>
              <FormControl>
                <Input
                  placeholder="Brief one-line summary for search results"
                  {...field}
                  data-testid="input-short-description"
                />
              </FormControl>
              <FormDescription>
                A brief summary that appears in search results and cards (optional, max 500 characters).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Long Description Field */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Description *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your experience in detail. What will participants do? What makes it special? What should they expect?"
                  className="min-h-[120px]"
                  {...field}
                  data-testid="textarea-description"
                />
              </FormControl>
              <FormDescription>
                Provide a detailed description of your experience. Include what participants will do, what makes it unique, and what they should expect.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category Field */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="sports_wellness">Sports & Wellness</SelectItem>
                  <SelectItem value="retreats">Retreats</SelectItem>
                  <SelectItem value="community_social">Community & Social</SelectItem>
                  <SelectItem value="adventure_trips">Adventure Trips</SelectItem>
                  <SelectItem value="workations">Workations</SelectItem>
                  <SelectItem value="festivals_events">Festivals & Events</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose the category that best describes your experience.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Experience Type Field */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <div className="sr-only">
              <FormLabel>Experience Type *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder="Select experience type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="one-day">Event (Local) - single day, no rooms, MVG allowed</SelectItem>
                  <SelectItem value="multi-day">✈️ Trip (Global) — Multi-day with rooms &amp; group thresholds</SelectItem>
                  <SelectItem value="virtual">💻 Virtual — Online event</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                <strong>Event</strong> bypasses room inventory but can still use an MVG threshold.{" "}
                <strong>Trip</strong> requires dates, rooms, and a minimum group size.
              </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Great Pillars Multi-Select - using simple visual checkbox to avoid Radix loop issues */}
        <FormField
          control={form.control}
          name="greatPillars"
          render={({ field }) => {
            const pillars = [
              { value: "health", label: "Health" },
              { value: "sports", label: "Sports" },
              { value: "wellness", label: "Wellness" },
              { value: "food", label: "Food" },
            ] as const;
            const currentValue = normalizeGreatPillars(field.value);
            
            return (
              <FormItem>
                <FormLabel>Which Great Pillars apply?</FormLabel>
                <FormDescription className="mb-3">
                  Select all that apply to your experience.
                </FormDescription>
                <div className="grid grid-cols-2 gap-3" data-testid="great-pillars-container">
                  {pillars.map((pillar) => {
                    const isSelected = currentValue.includes(pillar.value);
                    return (
                      <button
                        key={pillar.value}
                        type="button"
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        }`}
                        onClick={() => {
                          const newValue = isSelected
                            ? currentValue.filter((v: string) => v !== pillar.value)
                            : [...currentValue, pillar.value];
                          form.setValue("greatPillars", newValue, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          });
                        }}
                        data-testid={`pillar-${pillar.value}`}
                      >
                        <div 
                          className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                            isSelected 
                              ? "bg-primary border-primary" 
                              : "border-gray-400"
                          }`}
                          data-testid={`checkbox-pillar-${pillar.value}`}
                        >
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium">{pillar.label}</span>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>

      {/* Character count indicators removed - causing render loops with form.watch() */}
    </div>
  );
}

function MediaStep({ form, isSaving, setIsSaving, autoSaveMutation }: { form: any, isSaving: boolean, setIsSaving: (saving: boolean) => void, autoSaveMutation: any }) {
  const coverImageUrl = form.watch('coverImageUrl');
  const gallery = form.watch('gallery') || [];

  const handleCoverImageUpload = (url: string) => {
    // Accept all valid URLs including blob URLs for immediate preview
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:') || url.startsWith('data:'))) {
      form.setValue('coverImageUrl', url, { shouldDirty: true });
      
      // Only trigger auto-save for permanent URLs (https), not temporary blob URLs
      if (url.startsWith('https://')) {
        setTimeout(() => {
          if (!isSaving) {
            setIsSaving(true);
            autoSaveMutation.mutate(form.getValues());
          }
        }, 750); // Slightly longer debounce for image uploads
      }
    }
  };

  const handleGalleryImageUpload = (url: string) => {
    // Accept all valid URLs including blob URLs for immediate preview
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:') || url.startsWith('data:'))) {
      const currentGallery = form.getValues('gallery') || [];
      const updatedGallery = [...currentGallery, url];
      form.setValue('gallery', updatedGallery, { shouldDirty: true });
      
      // Only trigger auto-save for permanent URLs (https), not temporary blob URLs
      if (url.startsWith('https://')) {
        setTimeout(() => {
          if (!isSaving) {
            setIsSaving(true);
            autoSaveMutation.mutate(form.getValues());
          }
        }, 750); // Slightly longer debounce for image uploads
      }
    }
  };

  const removeCoverImage = () => {
    form.setValue('coverImageUrl', '', { shouldDirty: true });
    // Trigger auto-save after removing cover image
    setTimeout(() => {
      if (!isSaving) {
        setIsSaving(true);
        autoSaveMutation.mutate(form.getValues());
      }
    }, 500);
  };

  const removeGalleryImage = (indexToRemove: number) => {
    const currentGallery = form.getValues('gallery') || [];
    const updatedGallery = currentGallery.filter((_: any, index: number) => index !== indexToRemove);
    form.setValue('gallery', updatedGallery, { shouldDirty: true });
    // Trigger auto-save after removing gallery image
    setTimeout(() => {
      if (!isSaving) {
        setIsSaving(true);
        autoSaveMutation.mutate(form.getValues());
      }
    }, 500);
  };

  return (
    <div className="space-y-8">
      {/* Cover Image Section */}
      <FormField
        control={form.control}
        name="coverImageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cover Image *</FormLabel>
            <FormDescription>
              Upload a high-quality cover image that represents your experience. This will be the main image people see.
            </FormDescription>
            
            {coverImageUrl ? (
              <PhotoPreview
                src={coverImageUrl}
                alt="Cover image preview"
                onRemove={removeCoverImage}
                className="h-64"
                size="lg"
              />
            ) : (
              <SharedPhotoUpload
                uploadType="s3"
                onUploadComplete={handleCoverImageUpload}
                getUploadParameters={async () => {
                  const response = await apiRequest('POST', '/api/objects/upload');
                  if (!response.ok) throw new Error('Failed to get upload URL');
                  const { uploadURL } = await response.json();
                  return { method: 'PUT' as const, url: uploadURL };
                }}
                isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                maxFileSize={10485760} // 10MB
                multiple={false}
                className="min-h-[200px]"
                data-testid="uploader-cover-image"
              >
                <div className="p-8 text-center">
                  <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <Button type="button" className="mb-2">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Cover Image
                  </Button>
                  <p className="text-sm text-gray-500">
                    or drag and drop your image here
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    JPG, PNG, or WEBP up to 10MB
                  </p>
                </div>
              </SharedPhotoUpload>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Gallery Section */}
      <FormField
        control={form.control}
        name="gallery"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Gallery Images (Optional)</FormLabel>
            <FormDescription>
              Add additional photos to showcase different aspects of your experience.
            </FormDescription>
            
            {gallery.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                {gallery.map((imageUrl: string, index: number) => (
                  <PhotoPreview
                    key={index}
                    src={imageUrl}
                    alt={`Gallery image ${index + 1}`}
                    onRemove={() => removeGalleryImage(index)}
                    className="h-32"
                    size="md"
                  />
                ))}
              </div>
            )}
            
            <SharedPhotoUpload
              uploadType="s3"
              onUploadComplete={handleGalleryImageUpload}
              getUploadParameters={async () => {
                const response = await apiRequest('POST', '/api/objects/upload');
                if (!response.ok) throw new Error('Failed to get upload URL');
                const { uploadURL } = await response.json();
                return { method: 'PUT' as const, url: uploadURL };
              }}
              isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
              maxFileSize={10485760} // 10MB
              multiple={false}
              className="min-h-[120px]"
              showGuidelines
              data-testid="uploader-gallery-image"
            >
              <div className="p-6 text-center">
                <Plus className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <Button type="button" className="mb-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Gallery Image
                </Button>
                <p className="text-sm text-gray-500">
                  or drag and drop image here
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPG, PNG, or WEBP up to 10MB
                </p>
              </div>
            </SharedPhotoUpload>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function DatesStep({ form, editingExperienceId }: { form: any; editingExperienceId?: string }) {
  // Controlled so a selection closes the popover. Left open it overlays the
  // time fields directly beneath it and swallows the next click.
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const selectedVenueId = form.watch('selectedVenueId');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');
  const maxParticipants = form.watch('maxParticipants');
  const standingCapacity = form.watch('standingCapacity');
  const seatedCapacity = form.watch('seatedCapacity');
  const eventType = form.watch('type');
  const isSingleDayEvent = eventType === 'one-day';

  // Inline validation for single-day events — surface required-field issues right
  // at the input instead of only at publish time.
  const startTimeMissing = isSingleDayEvent && (!startTime || String(startTime).trim() === '');
  const endTimeMissing = isSingleDayEvent && (!endTime || String(endTime).trim() === '');
  const capacityMissing = isSingleDayEvent && !standingCapacity && !seatedCapacity && !maxParticipants;

  return (
    <div className="space-y-8">
      {/* Single Date Range Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">{isSingleDayEvent ? "Event Date" : "Trip Dates"}</h3>

        {/* The venue's own calendars decide this, not us. A date sold on
            Airbnb this morning is blocked here by the next sync. */}
        <VenueDateConflictNotice
          venueId={selectedVenueId}
          startDate={toDateOnly(startDate)}
          endDate={toDateOnly(endDate)}
          excludeExperienceId={editingExperienceId}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start Date */}
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{isSingleDayEvent ? "Date *" : "Start Date *"}</FormLabel>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        data-testid="button-start-date"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick start date</span>
                        )}
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        if (isSingleDayEvent) {
                          form.setValue('endDate', date, { shouldDirty: true });
                        }
                        setStartDateOpen(false);
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                   {isSingleDayEvent ? "What date is your event?" : "When does your trip start?"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Date */}
          {!isSingleDayEvent && (
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date *</FormLabel>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        data-testid="button-end-date"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick end date</span>
                        )}
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        setEndDateOpen(false);
                      }}
                      disabled={(date) => date < new Date() || (startDate && date < startDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  When does your trip end?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          )}
        </div>
      </div>

      {/* Time Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Experience Times</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isSingleDayEvent
            ? "Set the start and end times for your event (required)"
            : "Set the start and end times for your experience (optional for multi-day events)"}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start Time */}
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isSingleDayEvent ? "Start Time *" : "Start Time"}</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    value={field.value || ''}
                    className={`w-full ${startTimeMissing ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    aria-invalid={startTimeMissing}
                    data-testid="input-start-time"
                  />
                </FormControl>
                {startTimeMissing ? (
                  <p className="text-sm font-medium text-destructive">
                    Please add a start time for your single-day event
                  </p>
                ) : (
                  <FormDescription>
                    What time does your experience begin?
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Time */}
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isSingleDayEvent ? "End Time *" : "End Time"}</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    value={field.value || ''}
                    className={`w-full ${endTimeMissing ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    aria-invalid={endTimeMissing}
                    data-testid="input-end-time"
                  />
                </FormControl>
                {endTimeMissing ? (
                  <p className="text-sm font-medium text-destructive">
                    Please add an end time for your single-day event
                  </p>
                ) : (
                  <FormDescription>
                    What time does your experience end?
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {isSingleDayEvent ? (
        <FormField
          control={form.control}
          name="maxParticipants"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Capacity (Standing) *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  placeholder="Maximum number of attendees"
                  value={field.value || ''}
                  onChange={(event) => {
                    const value = parseInt(event.target.value) || undefined;
                    field.onChange(value);
                    form.setValue('standingCapacity', value ?? null, { shouldDirty: true });
                  }}
                  className={capacityMissing ? 'border-destructive focus-visible:ring-destructive' : ''}
                  aria-invalid={capacityMissing}
                  data-testid="input-event-standing-capacity"
                />
              </FormControl>
              {capacityMissing ? (
                <p className="text-sm font-medium text-destructive">
                  Please add capacity for your single-day event
                </p>
              ) : (
                <FormDescription>
                  Total number of people who can attend this single-day event.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Sleeping capacity is calculated from the rooms and beds you add in the Rooms step.
        </div>
      )}

      {/* Date Range Summary */}
      {startDate && endDate && (
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Experience Summary
          </h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p>Duration: {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}</p>
            <p>Total days: {Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}</p>
            {startTime && <p>Start time: {startTime}</p>}
            {endTime && <p>End time: {endTime}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

class VenueStepErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[VenueStep] Error caught:', error);
    console.error('[VenueStep] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">Error loading venue step</h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry();
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function VenueStepWrapper({ form, editingExperienceId }: { form: any; editingExperienceId?: string }) {
  const [retryKey, setRetryKey] = useState(0);
  return (
    <VenueStepErrorBoundary onRetry={() => setRetryKey(k => k + 1)} key={retryKey}>
      <VenueStep form={form} editingExperienceId={editingExperienceId} />
    </VenueStepErrorBoundary>
  );
}

function VenueStep({ form, editingExperienceId }: { form: any; editingExperienceId?: string }) {
  const [venues, setVenues] = useState<any[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);

  // Safely watch form values with defaults
  const venueType = form.watch('venueType') ?? 'catalog';
  const selectedVenueId = form.watch('selectedVenueId') ?? '';
  const manualVenuePhotos = form.watch('manualVenuePhotos') ?? [];
  const eventType = form.watch('type');
  // The dates were chosen a step earlier. Picking a venue here is the other
  // half of the same decision, so the clash has to surface here too.
  const chosenStartDate = form.watch('startDate');
  const chosenEndDate = form.watch('endDate');

  // Fetch both approved catalog venues AND user's own venues (including drafts)
  useEffect(() => {
    const fetchVenues = async () => {
      if (venueType !== 'catalog') return;
      
      setIsLoadingVenues(true);
      setVenuesError(null);
      try {
        // Fetch approved catalog venues and user's own venues in parallel
        const [catalogResponse, userVenuesResponse] = await Promise.all([
          apiRequest("GET", "/api/venues?approved=true"),
          apiRequest("GET", "/api/user/venues").catch(() => null) // Fallback if not authenticated
        ]);
        
        // Parse catalog venues (required)
        const catalogData = await catalogResponse.json();
        const catalogVenues = Array.isArray(catalogData) ? catalogData : [];
        
        // Parse user venues (optional - may fail if not authenticated)
        let userVenues: any[] = [];
        if (userVenuesResponse && userVenuesResponse.ok) {
          const userData = await userVenuesResponse.json();
          userVenues = Array.isArray(userData) ? userData : [];
        }
        
        // Merge venues: user's venues first, then approved catalog (avoiding duplicates)
        const catalogVenueIds = new Set(catalogVenues.map((v: any) => v.id));
        const userVenuesNotInCatalog = userVenues.filter((v: any) => !catalogVenueIds.has(v.id));
        
        // Mark venues with their source for display
        const markedCatalogVenues = catalogVenues.map((v: any) => ({ ...v, _source: 'catalog' }));
        const markedUserVenues = userVenuesNotInCatalog.map((v: any) => ({ ...v, _source: 'own' }));
        
        // User's own venues first, then catalog
        setVenues([...markedUserVenues, ...markedCatalogVenues]);
      } catch (error) {
        console.error("Error fetching venues:", error);
        setVenuesError("Failed to load venues. Please try again.");
      } finally {
        setIsLoadingVenues(false);
      }
    };

    fetchVenues();
  }, [venueType]);

  const handleManualVenuePhotoUpload = (url: string) => {
    const currentPhotos = form.getValues('manualVenuePhotos') || [];
    form.setValue('manualVenuePhotos', [...currentPhotos, url], { shouldDirty: true });
  };

  const removeManualPhoto = (photoUrl: string) => {
    const currentPhotos = form.getValues('manualVenuePhotos') || [];
    form.setValue('manualVenuePhotos', currentPhotos.filter((url: string) => url !== photoUrl), { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      {/* A venue that is already booked on these dates cannot host this event.
          Said here rather than at submit, when it is far more expensive. */}
      <VenueDateConflictNotice
        venueId={selectedVenueId}
        startDate={toDateOnly(chosenStartDate)}
        endDate={toDateOnly(chosenEndDate)}
        resolution="venue"
        excludeExperienceId={editingExperienceId}
      />

      {/* Location Input.
          Point 52: suggestions rather than free text. "Barceloneta",
          "barceloneta beach" and "the beach by the W" are one place written
          four ways, and the map embed, the collab matcher and the participant
          reading the line all treat them as four. Typing still wins — a pop-up
          on a beach has no street address and has to stay enterable. */}
      <FormField
        control={form.control}
        name="location"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location/City *</FormLabel>
            <FormControl>
              <AddressAutocomplete
                placeholder="e.g., Bali, Indonesia or Online"
                value={field.value ?? ''}
                onChange={field.onChange}
                data-testid="input-location"
              />
            </FormControl>
            <FormDescription>
              The general location where your experience takes place.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Venue Type Selection */}
      <FormField
        control={form.control}
        name="venueType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Venue Type *</FormLabel>
            <FormControl>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "catalog" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("catalog")}
                  data-testid="venue-type-catalog"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "catalog"}
                      readOnly
                      className="text-primary"
                    />
                    <Building className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Select from Venues</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Choose from approved venues
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "outdoor" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("outdoor")}
                  data-testid="venue-type-outdoor"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "outdoor"}
                      readOnly
                      className="text-primary"
                    />
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 22h20L12 2z" />
                      <circle cx="12" cy="8" r="2" />
                    </svg>
                    <div>
                      {/* Point 51. "Outdoor / Public" described one kind of
                          place, and the option is really "I will type the
                          address myself" — which is also what a studio, a
                          private flat or an office in a building with no Great
                          listing needs. Organisers with one of those picked
                          "Invite External Venue" and waited for an acceptance
                          that was never coming. The stored value stays
                          `outdoor` so every saved event still resolves. */}
                      <div className="font-semibold">Manual Address</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Type the address yourself — a park, a beach, a studio, anywhere
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "manual" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("manual")}
                  data-testid="venue-type-manual"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "manual"}
                      readOnly
                      className="text-primary"
                    />
                    <Plus className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Invite External Venue</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Invite an Airbnb, cafe, or other unlisted property
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "virtual" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("virtual")}
                  data-testid="venue-type-virtual"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "virtual"}
                      readOnly
                      className="text-primary"
                    />
                    <Users className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Virtual Event</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Online meeting or livestream
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "open" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("open")}
                  data-testid="venue-type-open"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "open"}
                      readOnly
                      className="text-primary"
                    />
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <div>
                      <div className="font-semibold">Open to Venue Offers</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Let venues bid to host your event
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Catalog Venue Selection */}
      {venueType === "catalog" && (
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="selectedVenueId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Venue *</FormLabel>
                {isLoadingVenues ? (
                  <div className="flex items-center gap-2 p-4 border rounded-lg">
                    <Clock className="w-4 h-4 animate-spin" />
                    Loading venues...
                  </div>
                ) : venuesError ? (
                  <div className="flex items-center gap-2 p-4 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-red-600 dark:text-red-400">{venuesError}</span>
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-venue">
                        <SelectValue placeholder="Choose a venue from our catalog" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {venues.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No venues available. Create a venue first or wait for admin approval.
                        </div>
                      ) : (
                        venues.map((venue) => (
                          <SelectItem key={venue.id} value={venue.id} data-testid={`venue-option-${venue.id}`}>
                            <div className="flex items-center gap-3">
                              {venue.coverImageUrl && (
                                <img
                                  src={venue.coverImageUrl}
                                  alt={venue.name}
                                  className="w-8 h-8 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{venue.name}</span>
                                  {venue._source === 'own' && venue.status !== 'approved' && (
                                    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                      Your Venue
                                    </Badge>
                                  )}
                                  {venue._source === 'own' && venue.status === 'approved' && (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                      Your Venue
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {venue.city || venue.location} • Capacity: {venue.capacity}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                <FormDescription>
                  Select from your own venues or our curated list of approved venues.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Show selected venue details */}
          {selectedVenueId && selectedVenueId.length > 0 && venues.length > 0 && (
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              {(() => {
                const selectedVenue = venues.find(v => v.id === selectedVenueId);
                if (!selectedVenue) return null;
                return (
                  <div className="flex gap-4">
                    {selectedVenue.coverImageUrl && (
                      <img
                        src={selectedVenue.coverImageUrl}
                        alt={selectedVenue.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{selectedVenue.name}</h4>
                        {selectedVenue._source === 'own' && selectedVenue.status !== 'approved' && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                            Draft - Pending Approval
                          </Badge>
                        )}
                        {selectedVenue._source === 'own' && selectedVenue.status === 'approved' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                            Your Approved Venue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {selectedVenue.city || selectedVenue.location}
                      </p>
                      <div className="flex gap-4 text-sm">
                        <span>Capacity: {selectedVenue.capacity}</span>
                      </div>
                      {selectedVenue.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          {selectedVenue.description}
                        </p>
                      )}

                      {/* No venue prices or terms here. A venue listing is
                          space, capacity and photos; the commercial deal is the
                          one you set on the Pricing step. */}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Manual Address - Minimal fields, just needs the location entered above */}
      {venueType === "outdoor" && (
        <div className="space-y-4 border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 22h20L12 2z" />
              <circle cx="12" cy="8" r="2" />
            </svg>
            <div>
              <h4 className="font-semibold text-lg text-green-800 dark:text-green-200">Manual Address</h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                A park, a beach, a trail, a studio, your own space — anywhere you type the
                address for yourself. Nothing needs to be booked through Great.
              </p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Location entered above:</strong> {form.watch('location') || 'Not specified yet'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Tip: Be specific about the meeting point (e.g., "Central Park, Bethesda Fountain entrance")
            </p>
          </div>
        </div>
      )}

      {/* Manual Venue Fields */}
      {venueType === "manual" && (
        <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-lg">Invite External Venue</h4>
          
          <FormField
            control={form.control}
            name="manualVenueName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Sunset Beach Resort, Mountain View Lodge"
                    {...field}
                    data-testid="input-manual-venue-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address *</FormLabel>
                <FormControl>
                  <AddressAutocomplete
                    placeholder="Full address or specific location details"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    data-testid="input-manual-venue-address"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueContactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Point of Contact / Host Name (Optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Alex Morgan"
                    {...field}
                    data-testid="input-manual-venue-contact-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Email Address *</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="host@example.com"
                    {...field}
                    data-testid="input-manual-venue-email"
                  />
                </FormControl>
                <FormDescription>The deal proposal will be sent here when you publish.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenuePropertyUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property Link (Airbnb, Booking, Website) *</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://www.airbnb.com/rooms/..."
                    {...field}
                    data-testid="input-manual-venue-property-url"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe the venue, its features, amenities, and what makes it special..."
                    className="min-h-[100px]"
                    {...field}
                    data-testid="textarea-manual-venue-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueCapacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Maximum number of people the venue can accommodate"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    data-testid="input-manual-venue-capacity"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Manual Venue Photos */}
          <FormField
            control={form.control}
            name="manualVenuePhotos"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Photos</FormLabel>
                <FormDescription>
                  Upload photos of the venue to help participants know what to expect.
                </FormDescription>
                
                {manualVenuePhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    {manualVenuePhotos.map((photoUrl: string, index: number) => (
                      <PhotoPreview
                        key={index}
                        src={photoUrl}
                        alt={`Venue photo ${index + 1}`}
                        onRemove={() => removeManualPhoto(photoUrl)}
                        className="h-32"
                        size="md"
                        data-testid={`img-venue-photo-${index}`}
                      />
                    ))}
                  </div>
                )}

                <SharedPhotoUpload
                  uploadType="s3"
                  onUploadComplete={handleManualVenuePhotoUpload}
                  getUploadParameters={async () => {
                    const response = await apiRequest('POST', '/api/objects/upload');
                    if (!response.ok) throw new Error('Failed to get upload URL');
                    const { uploadURL } = await response.json();
                    return { method: 'PUT' as const, url: uploadURL };
                  }}
                  isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                  maxFileSize={10485760} // 10MB
                  multiple={false}
                  className="min-h-[120px]"
                  showGuidelines
                  data-testid="uploader-venue-photos"
                >
                  <div className="p-6 text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <Button type="button" className="mb-2">
                      <Upload className="w-4 h-4 mr-2" />
                      {manualVenuePhotos.length === 0 ? "Upload venue photos" : "Add more photos"}
                    </Button>
                    <p className="text-sm text-gray-500">
                      or drag and drop images here
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      JPG, PNG, or WEBP up to 10MB each
                    </p>
                  </div>
                </SharedPhotoUpload>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Virtual Event Fields */}
      {venueType === "virtual" && (
        <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-lg">Virtual Event Details</h4>
          
          <FormField
            control={form.control}
            name="virtualPlatform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Platform *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-virtual-platform">
                      <SelectValue placeholder="Select virtual platform" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="google_meet">Google Meet</SelectItem>
                    <SelectItem value="microsoft_teams">Microsoft Teams</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                    <SelectItem value="custom">Custom Platform</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="virtualMeetingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting URL</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://zoom.us/j/..."
                    {...field}
                    data-testid="input-virtual-meeting-url"
                  />
                </FormControl>
                <FormDescription>
                  The link participants will use to join the virtual experience.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="virtualInstructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instructions for Participants</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Provide instructions on how to join, what to prepare, technical requirements, etc."
                    className="min-h-[100px]"
                    {...field}
                    data-testid="textarea-virtual-instructions"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Daytime Space inputs — raw/functional inputs for one-day events (coffeeshop collabs etc.) */}
      {eventType === 'one-day' && (
        <div style={{ border: '1px solid #ccc', padding: '12px', borderRadius: '6px', marginTop: '12px' }}>
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>Daytime Space Details</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="standing-capacity" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>
                Standing Capacity
              </label>
              <input
                id="standing-capacity"
                type="number"
                min="0"
                placeholder="e.g. 100"
                value={form.watch('standingCapacity') ?? ''}
                onChange={(e) => form.setValue('standingCapacity', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                data-testid="input-standing-capacity"
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label htmlFor="seated-capacity" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>
                Seated Capacity
              </label>
              <input
                id="seated-capacity"
                type="number"
                min="0"
                placeholder="e.g. 40"
                value={form.watch('seatedCapacity') ?? ''}
                onChange={(e) => form.setValue('seatedCapacity', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                data-testid="input-seated-capacity"
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Open to Venue Offers Fields */}
      {venueType === "open" && (
        <div className="space-y-4 border-2 border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">Open Venue Request</h4>
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Your event will publish with <strong>Venue Pending</strong> status. Venues matching your criteria can discover and bid to host your event.
          </p>

          <FormField
            control={form.control}
            name="venueOpenSpaceType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Space Type Needed *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-venue-open-space-type">
                      <SelectValue placeholder="Select the type of space you need" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="coffee_shop">Coffee Shop / Café</SelectItem>
                    <SelectItem value="restaurant">Restaurant / Bar</SelectItem>
                    <SelectItem value="fitness_studio">Fitness Studio / Gym</SelectItem>
                    <SelectItem value="yoga_studio">Yoga / Dance Studio</SelectItem>
                    <SelectItem value="coworking">Co-working Space</SelectItem>
                    <SelectItem value="retail_gallery">Retail / Gallery</SelectItem>
                    <SelectItem value="outdoor_park">Outdoor / Park</SelectItem>
                    <SelectItem value="private_villa">Private Villa / Home</SelectItem>
                    <SelectItem value="retreat_center">Retreat Center</SelectItem>
                    <SelectItem value="hotel_conference">Hotel / Conference Room</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Venues of this type in your selected city will be able to see and respond to your event.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Validation Summary */}
      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Venue Requirements</h4>
        <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Location must be specified
          </div>
          {venueType === "catalog" && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              A venue must be selected from the catalog
            </div>
          )}
          {venueType === "manual" && (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Venue name and address are required
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                Description and photos help attract participants
              </div>
            </>
          )}
          {venueType === "virtual" && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Virtual platform must be selected
            </div>
          )}
          {venueType === "open" && (() => {
            const spaceType = form.watch('venueOpenSpaceType');
            return spaceType ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                Space type selected — event publishes as Venue Pending until matched
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Space type must be selected before publishing
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function ServicesAndAmenitiesStep({ form }: { form: any }) {
  // Load services and amenities from JSON
  const [servicesData, setServicesData] = useState<any>(null);
  
  useEffect(() => {
    import('@/data/options/services_and_amenities.json').then((data) => {
      setServicesData(data.default || data);
    });
  }, []);

  // Watch form state for selected services and amenities
  const formState = form.watch();
  const selectedServices = useMemo(() => 
    Array.isArray(formState.selectedServices) ? formState.selectedServices : [], 
    [formState.selectedServices]
  );
  const selectedAmenities = useMemo(() => 
    Array.isArray(formState.selectedAmenities) ? formState.selectedAmenities : [], 
    [formState.selectedAmenities]
  );

  // Legacy support: keep selectedServiceIds and selectedAmenityIds for backward compatibility
  // IMPORTANT: This must be called BEFORE any early returns to maintain consistent hook order
  // Note: Removed `form` from dependency array to prevent infinite re-render loop
  useEffect(() => {
    const serviceIds = selectedServices.map((s: any) => s.id);
    const amenityIds = selectedAmenities.map((a: any) => a.id);
    form.setValue('selectedServiceIds', serviceIds, { shouldDirty: false });
    form.setValue('selectedAmenityIds', amenityIds, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServices, selectedAmenities]);

  // Early return for loading state - after all hooks are called
  if (!servicesData) {
    return <div className="p-4">Loading options...</div>;
  }

  const availableServices = servicesData.services.map((group: any) => ({
    category: group.category,
    items: group.items
  }));

  const availableAmenities = servicesData.amenities.map((group: any) => ({
    category: group.category,
    items: group.items
  }));

  const handleServicesChange = (services: any[]) => {
    form.setValue('selectedServices', services, { shouldDirty: true, shouldTouch: true });
  };

  const handleAmenitiesChange = (amenities: any[]) => {
    form.setValue('selectedAmenities', amenities, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="services" data-testid="tab-services">Services</TabsTrigger>
          <TabsTrigger value="amenities" data-testid="tab-amenities">Amenities</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Service Providers</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Select service providers you need for your experience. You can choose from our list or add custom services.
            </p>
          </div>

          <GroupedMultiSelect
            options={availableServices}
            selected={selectedServices}
            onChange={handleServicesChange}
            placeholder="Select services..."
            emptyText="No services found."
            allowCustom={true}
            customLabel="Add custom service"
            data-testid="services-select"
            ariaLabel="Select service providers for your experience"
          />
        </TabsContent>

        <TabsContent value="amenities" className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Facilities & Amenities</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Select the facilities and amenities available at your experience location. You can add custom amenities if needed.
            </p>
          </div>

          <GroupedMultiSelect
            options={availableAmenities}
            selected={selectedAmenities}
            onChange={handleAmenitiesChange}
            placeholder="Select amenities..."
            emptyText="No amenities found."
            allowCustom={true}
            customLabel="Add custom amenity"
            data-testid="amenities-select"
            ariaLabel="Select amenities for your experience"
          />
        </TabsContent>
      </Tabs>

      {/* Guidelines */}
      <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
        <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
          Guidelines
        </h4>
        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <li>• Services are people who provide expertise (instructors, guides, chefs)</li>
          <li>• Amenities are facilities and features available at the location</li>
          <li>• Select from our standard list or add custom items specific to your experience</li>
          <li>• Custom items will be marked for review by our team</li>
          <li>• Only select amenities that are actually available at your venue</li>
        </ul>
      </div>
    </div>
  );
}

function RolesStep({ form }: { form: any }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Team Roles & Staffing</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Define roles needed for your experience team. Select from standard roles or add custom ones.
          Specify if each role is required, headcount needed, and optional rates.
        </p>
      </div>
      
      <RolesEditor
        roles={form.watch("roles")}
        onChange={(roles) => form.setValue("roles", roles, { shouldDirty: true })}
      />

      {/* Guidelines */}
      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
          Role Guidelines
        </h4>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Select all roles needed to run your experience safely and effectively</li>
          <li>• Mark roles as "required" if they're essential for the experience</li>
          <li>• Set headcount to specify how many people are needed for each role</li>
          <li>• Add rates if you want to track role costs (optional)</li>
          <li>• Use notes to add special requirements or instructions</li>
        </ul>
      </div>
    </div>
  );
}

// Old code removed - now using GroupedMultiSelect component with JSON data

function ItineraryStep({ form }: { form: any }) {
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const itinerary = form.watch('itinerary') || [];

  // Auto-generate days based on start and end dates
  const generateDaysFromDates = () => {
    if (!startDate || !endDate) return [];
    
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const existingDays = itinerary.length;
    
    if (totalDays === existingDays) return itinerary;
    
    const newItinerary = [];
    for (let i = 0; i < totalDays; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + i);
      
      // Keep existing day data if it exists
      const existingDay = itinerary[i];
      newItinerary.push({
        day: i + 1,
        date: dayDate,
        title: existingDay?.title || `Day ${i + 1}`,
        timeSlots: existingDay?.timeSlots || [],
        notes: existingDay?.notes || ""
      });
    }
    
    return newItinerary;
  };

  // Update itinerary when dates change
  useEffect(() => {
    const newItinerary = generateDaysFromDates();
    if (newItinerary.length > 0) {
      form.setValue('itinerary', newItinerary, { shouldDirty: true });
    }
  }, [startDate, endDate]);

  const addTimeSlot = (dayIndex: number) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    if (!updatedItinerary[dayIndex].timeSlots) {
      updatedItinerary[dayIndex].timeSlots = [];
    }
    
    updatedItinerary[dayIndex].timeSlots.push({
      id: `slot-${dayIndex}-${Date.now()}`,
      startTime: "",
      endTime: "",
      activity: "",
      notes: ""
    });
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const removeTimeSlot = (dayIndex: number, slotId: string) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    updatedItinerary[dayIndex].timeSlots = updatedItinerary[dayIndex].timeSlots.filter(
      (slot: any) => slot.id !== slotId
    );
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const updateDay = (dayIndex: number, field: string, value: any) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    updatedItinerary[dayIndex] = { ...updatedItinerary[dayIndex], [field]: value };
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const updateTimeSlot = (dayIndex: number, slotId: string, field: string, value: any) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    updatedItinerary[dayIndex].timeSlots = updatedItinerary[dayIndex].timeSlots.map((slot: any) =>
      slot.id === slotId ? { ...slot, [field]: value } : slot
    );
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const addDay = () => {
    const currentItinerary = form.getValues('itinerary') || [];
    const newDayNumber = currentItinerary.length + 1;
    
    // Calculate date for new day
    const baseDate = startDate || new Date();
    const newDayDate = new Date(baseDate);
    newDayDate.setDate(baseDate.getDate() + currentItinerary.length);
    
    const newDay = {
      day: newDayNumber,
      date: newDayDate,
      title: `Day ${newDayNumber}`,
      timeSlots: [],
      notes: ""
    };
    
    form.setValue('itinerary', [...currentItinerary, newDay], { shouldDirty: true });
  };

  const removeDay = () => {
    const currentItinerary = form.getValues('itinerary') || [];
    if (currentItinerary.length > 0) {
      const updatedItinerary = currentItinerary.slice(0, -1);
      form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-8">
      {/* Daily Schedule Section */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Daily Schedule</h3>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {itinerary.length} day{itinerary.length !== 1 ? 's' : ''} planned
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addDay()}
                data-testid="button-add-day"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Day
              </Button>
              {itinerary.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeDay()}
                  data-testid="button-remove-day"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  Remove Day
                </Button>
              )}
            </div>
          </div>
        </div>

        {itinerary.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Plan Yet
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Set your start and end dates first, then add days to build your schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {itinerary.map((day: any, dayIndex: number) => (
              <div key={day.day} className="border rounded-lg p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <Label htmlFor={`day-title-${dayIndex}`}>Day {day.day} Title</Label>
                    <Input
                      id={`day-title-${dayIndex}`}
                      value={day.title}
                      onChange={(e) => updateDay(dayIndex, 'title', e.target.value)}
                      placeholder={`Day ${day.day}`}
                      className="mt-1"
                      data-testid={`input-day-title-${dayIndex}`}
                    />
                  </div>
                  <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                    {format(new Date(day.date), "MMM d, yyyy")}
                  </div>
                </div>

                {/* Time Slots */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>Time Slots</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addTimeSlot(dayIndex)}
                      data-testid={`button-add-timeslot-${dayIndex}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Time Slot
                    </Button>
                  </div>

                  {day.timeSlots?.length === 0 ? (
                    <div className="text-center py-4 border border-dashed border-gray-200 rounded text-gray-500">
                      No time slots added yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Twelve equal columns could not hold this row. A
                          `type="time"` input has a wide intrinsic minimum — wider
                          once it holds a value — and a grid item's default
                          `min-width: auto` lets it overflow its own track and
                          sit on top of its neighbours, so filling in the start
                          time swallowed everything to the right of it.

                          Two named tracks for the times, the rest flexible, and
                          `min-w-0` on every cell so nothing can push past its
                          share. Stacked below `sm`, where five controls on one
                          line never fitted anyway. */}
                      {day.timeSlots?.map((slot: any, slotIndex: number) => (
                        <div
                          key={slot.id}
                          className="grid grid-cols-2 gap-3 rounded border p-3 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                        >
                          <div className="min-w-0 space-y-1">
                            <Label className="text-xs font-normal text-muted-foreground">Starts</Label>
                            <Input
                              type="time"
                              className="w-full"
                              value={slot.startTime}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'startTime', e.target.value)}
                              data-testid={`input-start-time-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <Label className="text-xs font-normal text-muted-foreground">Ends</Label>
                            <Input
                              type="time"
                              className="w-full"
                              value={slot.endTime}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'endTime', e.target.value)}
                              data-testid={`input-end-time-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                            <Label className="text-xs font-normal text-muted-foreground">Activity</Label>
                            <Input
                              placeholder="Activity name"
                              className="w-full"
                              value={slot.activity}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'activity', e.target.value)}
                              data-testid={`input-activity-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                            <Label className="text-xs font-normal text-muted-foreground">Notes</Label>
                            <Input
                              placeholder="Notes (optional)"
                              className="w-full"
                              value={slot.notes}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'notes', e.target.value)}
                              data-testid={`input-notes-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="col-span-2 flex justify-end sm:col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTimeSlot(dayIndex, slot.id)}
                              aria-label="Remove time slot"
                              data-testid={`button-remove-timeslot-${dayIndex}-${slotIndex}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Day Notes */}
                <div>
                  <Label htmlFor={`day-notes-${dayIndex}`}>Day Notes</Label>
                  <Textarea
                    id={`day-notes-${dayIndex}`}
                    placeholder="Special instructions, requirements, or notes for this day..."
                    value={day.notes}
                    onChange={(e) => updateDay(dayIndex, 'notes', e.target.value)}
                    className="mt-1"
                    data-testid={`textarea-day-notes-${dayIndex}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomsStep({ form }: { form: any }) {
  const rooms = form.watch('rooms') || [];
  const currency = form.watch('currency');

  // Auto-calculate maxParticipants from sum of (room quantity × capacity)
  // Note: Removed `form` from dependency array to prevent infinite re-render loop
  useEffect(() => {
    if (rooms.length > 0) {
      const totalCapacity = rooms.reduce((total: number, room: any) => {
        const quantity = parseInt(room.quantity) || 0;
        const capacity = parseInt(room.capacity) || 1;
        return total + (quantity * capacity);
      }, 0);
      
      // Only update if capacity has changed to avoid unnecessary form updates
      const currentMaxParticipants = form.getValues('maxParticipants');
      if (totalCapacity > 0 && totalCapacity !== currentMaxParticipants) {
        form.setValue('maxParticipants', totalCapacity, { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const addRoom = () => {
    const currentRooms = form.getValues('rooms') || [];
    const newRoom = {
      id: `room-${Date.now()}`,
      name: '',
      quantity: 1,
      capacity: 2,
      gallery: [],
      notes: ''
    };
    form.setValue('rooms', [...currentRooms, newRoom], { shouldDirty: true });
  };

  const removeRoom = (roomId: string) => {
    const currentRooms = form.getValues('rooms') || [];
    const updatedRooms = currentRooms.filter((room: any) => room.id !== roomId);
    form.setValue('rooms', updatedRooms, { shouldDirty: true });
  };

  const updateRoom = (roomId: string, field: string, value: any) => {
    const currentRooms = form.getValues('rooms') || [];
    const updatedRooms = currentRooms.map((room: any) => 
      room.id === roomId ? { ...room, [field]: value } : room
    );
    form.setValue('rooms', updatedRooms, { shouldDirty: true });
  };

  const getTotalUnits = () => {
    return rooms.reduce((total: number, room: any) => {
      const quantity = parseInt(room.quantity) || 0;
      const capacity = parseInt(room.capacity) || 1;
      return total + (quantity * capacity);
    }, 0);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Room Inventory</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Define the room types and their capacity for your experience. Each room type will automatically create a Ticket SKU in the Pricing step where you can set the price per person.
        </p>
      </div>

      {/* Add Room Button */}
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Room SKUs</h4>
        <Button
          type="button"
          variant="outline"
          onClick={addRoom}
          data-testid="button-add-room-sku"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Room SKU
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <Bed className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-400">
            No room inventory defined yet. Add sellable room units to enable bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room: any, roomIndex: number) => (
            <div key={room.id} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <h5 className="font-medium">Room SKU {roomIndex + 1}</h5>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRoom(room.id)}
                  data-testid={`button-remove-room-${roomIndex}`}
                >
                  ×
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                {/* Room Name */}
                <div>
                  <Label htmlFor={`room-name-${room.id}`}>Room Name *</Label>
                  <Input
                    id={`room-name-${room.id}`}
                    placeholder="e.g., Shared Dorm"
                    value={room.name || ''}
                    onChange={(e) => updateRoom(room.id, 'name', e.target.value)}
                    data-testid={`input-room-name-${roomIndex}`}
                  />
                </div>

                {/* Capacity per Room */}
                <div>
                  <Label htmlFor={`room-capacity-${room.id}`}>People/Room *</Label>
                  <Input
                    id={`room-capacity-${room.id}`}
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Beds per room"
                    value={room.capacity || 2}
                    onChange={(e) => updateRoom(room.id, 'capacity', parseInt(e.target.value) || 1)}
                    data-testid={`input-room-capacity-${roomIndex}`}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <Label htmlFor={`room-quantity-${room.id}`}>Rooms *</Label>
                  <Input
                    id={`room-quantity-${room.id}`}
                    type="number"
                    min="1"
                    max="100"
                    placeholder="# of rooms"
                    value={room.quantity || ''}
                    onChange={(e) => updateRoom(room.id, 'quantity', parseInt(e.target.value) || 1)}
                    data-testid={`input-room-quantity-${roomIndex}`}
                  />
                </div>

                {/* Total Spots (calculated) */}
                <div>
                  <Label>Total Spots</Label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border text-sm font-medium">
                    {((parseInt(room.capacity) || 1) * (parseInt(room.quantity) || 0))} people
                  </div>
                </div>
              </div>

              {/* Room Photo and Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Room Photos */}
                <div>
                  <Label>Room Photos (Optional - up to 3)</Label>
                  <div className="space-y-4">
                    {/* Current room photos */}
                    {room.gallery && room.gallery.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {room.gallery.map((imageUrl: string, index: number) => (
                          <PhotoPreview
                            key={index}
                            src={imageUrl}
                            alt={`Room ${index + 1}`}
                            onRemove={() => {
                              const newGallery = room.gallery.filter((_: string, i: number) => i !== index);
                              updateRoom(room.id, 'gallery', newGallery);
                            }}
                            className="h-24"
                            size="sm"
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Success message for room uploads */}
                    {room.gallery && room.gallery.length > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400" data-testid={`text-room-gallery-success-${roomIndex}`}>
                        ✓ {room.gallery.length} photo{room.gallery.length !== 1 ? 's' : ''} uploaded successfully
                      </p>
                    )}
                    
                    {/* Upload button - only show if less than 3 photos */}
                    {(!room.gallery || room.gallery.length < 3) && (
                      <SharedPhotoUpload
                        uploadType="s3"
                        maxFiles={3 - (room.gallery?.length || 0)}
                        multiple={false}
                        onUploadComplete={(url) => {
                          const currentGallery = room.gallery || [];
                          const updatedGallery = [...currentGallery, url];
                          updateRoom(room.id, 'gallery', updatedGallery);
                        }}
                        getUploadParameters={async () => {
                          const response = await apiRequest('POST', '/api/objects/upload');
                          if (!response.ok) throw new Error('Failed to get upload URL');
                          const { uploadURL } = await response.json();
                          return { method: 'PUT' as const, url: uploadURL };
                        }}
                        isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                        variant="compact"
                        className="w-full"
                      />
                    )}
                  </div>
                </div>

                {/* Room Notes */}
                <div>
                  <Label htmlFor={`room-notes-${room.id}`}>Notes (Optional)</Label>
                  <Input
                    id={`room-notes-${room.id}`}
                    placeholder="Special details about this room type..."
                    value={room.notes || ''}
                    onChange={(e) => updateRoom(room.id, 'notes', e.target.value)}
                    data-testid={`input-room-notes-${roomIndex}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inventory Summary */}
      {rooms.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Room Capacity Summary
          </h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p>Total room types: {rooms.length}</p>
            <p>Total rooms: {rooms.reduce((t: number, r: any) => t + (parseInt(r.quantity) || 0), 0)}</p>
            <p className="font-semibold">Total capacity: {getTotalUnits()} people</p>
            <p className="text-xs mt-2 opacity-75">Capacity = (People/Room × Number of Rooms) for each type. Pricing is set at the experience level.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Partners step, formerly "Promotion".
 *
 * The Official Partner Deal held exactly one partner per event. In practice one
 * event routinely carries several separate two-party barters at once — a run
 * club gets free access for bringing fifteen people, a drinks brand supplies
 * product for exposure, a photographer shoots the day for a print licence, an
 * affiliate pushes tickets on commission. None of those could be recorded
 * beside each other, so they were agreed in DMs and never appeared here at all.
 *
 * Two things this step must not become:
 *
 *  1. **Bigger for a simple event.** It opens empty. An organiser with one
 *     venue deal or none sees "+ Add Partner" and nothing else — no greyed-out
 *     placeholder cards for the three types they are not using, and no cards at
 *     all in Pricing either. Chris's breathwork class should feel exactly as
 *     simple as it did before this existed.
 *
 *  2. **A special case for affiliates.** Affiliate is one of four types in one
 *     list, added through the same modal. Its two distinctive fields — assign to
 *     an onboarded affiliate, and show in the Experience Pool — live inline in
 *     its own card, the same way Milestone Barter's attendee target does. What
 *     it must not do is sit in a visually separate box, because that is what
 *     made it read as "the real mechanism, plus some other stuff".
 *
 * Participant Referral Perk has moved to the bottom, below the partner list.
 * The perk is very often *sourced* from one of these deals — a sponsor's
 * product offered as the referral reward — so asking for it first meant asking
 * before the organiser knew what they had to give.
 *
 * The legacy single-deal fields (`promotionDealType`, `influencerCommissionPct`,
 * `promotionSelectedPartnerIds`, `promoterEnabled`) are still written, derived
 * from the list. The payout engine, the Experience Pool and the promotion-deal
 * handshake all read them, and rewriting those was not the job here.
 */
function PromotionStep({ form, goToStep, manualDealUnlocked = false }: {
  form: any;
  /**
   * The Venue tile routes to the Venue step rather than opening Add Partner.
   * Which venue an event is at is not a deal term — it carries an address, a
   * capacity and a set of dates — so the tile takes the organiser where those
   * live, and the deal itself is agreed here once they are back.
   */
  goToStep?: (stepId: number) => void;
  manualDealUnlocked?: boolean;
}) {
  const currency = form.watch('currency');
  const currencySymbol = currency
    ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol || '€'
    : '€';

  const participantReferralDealType = form.watch('participantReferralDealType');
  const participantReferralCommissionPct = form.watch('participantReferralCommissionPct') || 0;
  const participantReferralMilestoneTarget = form.watch('participantReferralMilestoneAttendeeTarget');
  const participantReferralMilestoneReward = form.watch('participantReferralMilestoneRewardDescription') || '';

  const rawPartners = form.watch('eventPartners');
  const partners: EventPartnerEntry[] = useMemo(
    () => sanitisePartnerEntries(rawPartners),
    [rawPartners],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<EventPartnerEntry | null>(null);
  /** Which type the Add Partner modal should open on, when a tile was tapped. */
  const [presetType, setPresetType] = useState<PartnerTypeId | null>(null);
  const [venueDealOpen, setVenueDealOpen] = useState(false);

  const perkSource = brandBarterPerkSource(partners);
  const ticketPartners = revenueSharePartners(partners);
  // Point 42: on an event whose tickets are all Free RSVP, a percentage of
  // ticket revenue is a percentage of nothing. Nothing is hidden before any
  // ticket exists — an organiser working Partners before Pricing has not said
  // the event is free, only that they have not priced it yet.
  const paidTicketsConfigured = hasPaidTicketConfigured(form.watch('ticketSkus'));

  // ── The venue, as a partner row ──────────────────────────────────────────
  // It was the only party edited somewhere else. Its operational fields still
  // live on the Venue step — address, capacity, dates — but the deal is a deal
  // like every other one on this screen, so it is agreed here.
  const eventType = form.watch('type');
  const venueType = form.watch('venueType') || 'catalog';
  const selectedVenueId = form.watch('selectedVenueId') || '';
  // The chosen venue's name, for the row and the tile. A catalog venue is
  // stored by id alone, so it is looked up; a manually-invited one carries its
  // own name on the form. Neither is fatal if it does not resolve — the row
  // still reads "Venue" and the deal is still editable.
  const { data: chosenVenue } = useQuery<any>({
    queryKey: ['/api/venues', selectedVenueId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/venues/${selectedVenueId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: venueType === 'catalog' && !!selectedVenueId,
    staleTime: 5 * 60_000,
  });
  const venueName = form.watch('manualVenueName') || chosenVenue?.name || '';
  const isDaytimeDeal = eventType !== 'multi-day';

  /**
   * Three states, and the row says which one it is in:
   *  - `none`     — outdoor, public or virtual. There is no venue deal to make.
   *  - `target`   — open to offers, or an external venue invited. What is here
   *                 is a proposal until somebody accepts it.
   *  - `settled`  — a venue is chosen, so these are the terms.
   */
  const venueDealMode: 'none' | 'target' | 'settled' =
    venueType === 'outdoor' || venueType === 'virtual'
      ? 'none'
      : venueType === 'open' || venueType === 'manual'
        ? 'target'
        : selectedVenueId
          ? 'settled'
          : 'none';

  const venueDealModel = venueDealMode === 'target'
    ? form.watch('venueTargetDeal')
    : form.watch('venueCompensationModel');
  const venueDealChosen = venueDealMode !== 'none' && !!venueDealModel;
  const venueDealTier = venueDealTierOf(venueDealModel);
  const venueDealSummary = venueDealChosen
    ? summariseVenueDeal({
        model: venueDealModel,
        mode: venueDealMode,
        currencySymbol,
        revenueSharePct: form.watch('venueRevenueSharePct'),
        fixedFee: form.watch('venueFixedFee'),
        perHeadAmount: form.watch('venuePerHeadAmount'),
        perRoomPerNight: form.watch('venuePerRoomPerNight'),
        commitmentFee: form.watch('venueCommitmentFee'),
        barterTerms: form.watch('venueBarterTerms'),
        targetValue: form.watch('venueTargetDealValue'),
      })
    : '';

  /**
   * Keep the legacy single-deal fields in step with the list.
   *
   * The Experience Pool, the promotion-deal handshake and the payout engine all
   * read `promotionDealType` and `influencerCommissionPct`. Deriving them from
   * the list means the list is the only thing an organiser edits, rather than a
   * second source of truth that drifts from it.
   *
   * The derivation itself lives in `deriveLegacyPromotionFields`, not here: it
   * decides what partners are actually paid, and a percentage read off the
   * wrong entry is money going to the wrong party — not something to leave in a
   * render effect with no test around it.
   */
  useEffect(() => {
    const legacy = deriveLegacyPromotionFields(partners);
    for (const [field, value] of Object.entries(legacy)) {
      // `promoterEnabled` comes back null when no affiliate is on the event.
      // That means "leave it as the organiser set it", not "switch it off".
      if (field === 'promoterEnabled' && value === null) continue;
      form.setValue(field as any, value as any, { shouldDirty: false });
    }

    if (participantReferralDealType === 'milestone_barter'
      && !form.getValues('participantReferralMilestoneRewardDescription')) {
      form.setValue('participantReferralMilestoneRewardDescription', 'Friend milestone reward', { shouldDirty: false });
    }
  }, [form, partners, participantReferralDealType]);

  const savePartner = (entry: EventPartnerEntry) => {
    const current = sanitisePartnerEntries(form.getValues('eventPartners'));
    const exists = current.some((partner) => partner.id === entry.id);
    form.setValue(
      'eventPartners',
      exists
        ? current.map((partner) => (partner.id === entry.id ? entry : partner))
        : [...current, entry],
      { shouldDirty: true },
    );
    setEditingPartner(null);
  };

  const removePartner = (entryId: string) => {
    const current = sanitisePartnerEntries(form.getValues('eventPartners'));
    form.setValue(
      'eventPartners',
      current.filter((partner) => partner.id !== entryId),
      { shouldDirty: true },
    );
  };

  const updatePartnerTerms = (entryId: string, patch: Partial<PartnerTerms>) => {
    const current = sanitisePartnerEntries(form.getValues('eventPartners'));
    form.setValue(
      'eventPartners',
      current.map((partner) =>
        partner.id === entryId
          ? { ...partner, terms: { ...partner.terms, ...patch } }
          : partner),
      { shouldDirty: true },
    );
  };

  const clearParticipantReferralPerk = () => {
    form.setValue('participantReferralDealType', null, { shouldDirty: true });
    form.setValue('participantReferralCommissionPct', 0, { shouldDirty: true });
    form.setValue('participantReferralMilestoneAttendeeTarget', undefined, { shouldDirty: true });
    form.setValue('participantReferralMilestoneRewardDescription', '', { shouldDirty: true });
    form.setValue('participantReferralVenueBacked', false, { shouldDirty: true });
  };

  /** Reuse a sponsor's product as the participant reward, rather than inventing one. */
  const usePartnerProductAsPerk = () => {
    if (!perkSource) return;
    form.setValue('participantReferralDealType', 'milestone_barter', { shouldDirty: true });
    form.setValue('participantReferralMilestoneAttendeeTarget',
      form.getValues('participantReferralMilestoneAttendeeTarget') || 3, { shouldDirty: true });
    form.setValue(
      'participantReferralMilestoneRewardDescription',
      `${perkSource.name}: ${perkSource.terms?.productDescription || 'product'}`,
      { shouldDirty: true },
    );
  };

  const participantDealOptions = [
    {
      value: 'commission_per_ticket',
      title: 'Commission per Ticket',
      description: 'Participants see this as cashback when friends book from their link.',
    },
    {
      value: 'milestone_barter',
      title: 'Milestone Barter',
      description: 'Reward participants when enough friends book from their link.',
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Partners</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Everyone on this event and what each of them agreed — the venue
          included.
        </p>
      </div>

      {/* ── Five tiles, Venue among them ───────────────────────────────────
          Venue is on this row because its deal is now agreed on this step
          like everyone else's. It is still not added through the Add Partner
          modal: which venue an event is at carries an address, a capacity and
          a set of dates, so the tile takes the organiser to the Venue step and
          the deal is agreed here when they come back. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => goToStep?.(VENUE_STEP_ID)}
          className={cn(
            "rounded-xl border p-3 text-center transition-colors",
            venueDealMode === 'none'
              ? "border-gray-200 hover:border-indigo-300 dark:border-gray-700"
              : "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40",
          )}
          data-testid="partner-tile-venue"
        >
          <p className={cn(
            "text-sm font-bold",
            venueDealMode === 'none'
              ? "text-gray-900 dark:text-white"
              : "text-indigo-900 dark:text-indigo-100",
          )}>
            Venue
          </p>
          <p className={cn(
            "mt-0.5 text-xs",
            venueDealMode === 'none' ? "text-gray-500" : "text-indigo-800 dark:text-indigo-200",
          )}>
            {venueDealMode === 'none'
              ? 'No venue deal'
              : venueDealMode === 'target'
                ? (venueType === 'open' ? 'Open to offers' : 'Invite sent')
                : `${venueName || 'Chosen'} ✓`}
          </p>
        </button>

        {PARTNER_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => {
              setEditingPartner(null);
              setPresetType(type.id);
              setAddOpen(true);
            }}
            className="rounded-xl border border-gray-200 p-3 text-center transition-colors hover:border-indigo-300 dark:border-gray-700"
            data-testid={`partner-tile-${type.id}`}
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{type.label}</p>
            <p className="mt-0.5 text-xs text-gray-500">{type.hint}</p>
          </button>
        ))}
      </div>

      {/* ── The venue's own deal row ───────────────────────────────────────
          Present the moment a venue is decided, whatever the deal, so the one
          partner an organiser used to forget is the one they cannot miss. */}
      {venueDealMode !== 'none' && (
        <Card data-testid="venue-deal-row">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-base dark:bg-indigo-950/50"
                  aria-hidden="true"
                >
                  🏠
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Venue{venueName ? ` — ${venueName}` : ''}{' '}
                    {venueDealChosen && (
                      <span className="font-normal text-xs text-gray-400">
                        {dealTierGlyph(venueDealTier)} {dealTierLabel(venueDealTier).toLowerCase()}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Brings: {isDaytimeDeal ? 'the space' : 'the location'}
                    {venueDealSummary ? ` · ${venueDealSummary}` : ' · no deal set yet'}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setVenueDealOpen((open) => !open)}
                data-testid="button-edit-venue-deal"
              >
                {venueDealOpen ? 'Done' : venueDealChosen ? 'Edit deal' : 'Set deal'}
              </Button>
            </div>

            {venueDealOpen && (
              <div className="mt-4 border-t pt-4">
                <VenueDealEditor
                  form={form}
                  currencySymbol={currencySymbol}
                  isDaytime={isDaytimeDeal}
                  manualDealUnlocked={manualDealUnlocked}
                  paidTicketsConfigured={paidTicketsConfigured}
                  mode={venueDealMode === 'target' ? 'target' : 'settled'}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Official Partner Deals
                <Badge variant="outline" className="ml-1 text-xs font-normal">Optional</Badge>
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                One event can carry several separate deals at once. Add as many
                as you have actually agreed — and none if you have none.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setEditingPartner(null); setAddOpen(true); }}
              data-testid="button-add-partner"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Partner
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Opens empty, and stays that way for an event with no partners.
              A row per partner actually added — never a placeholder. */}
          {partners.length === 0 ? (
            <button
              type="button"
              onClick={() => { setEditingPartner(null); setAddOpen(true); }}
              className="w-full rounded-xl border border-dashed p-6 text-center text-sm font-medium text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-700 dark:text-gray-300"
              data-testid="button-add-first-partner"
            >
              + Add Partner
              <span className="mt-1 block text-xs font-normal text-gray-500">
                A community bringing its members, a brand supplying product, an
                affiliate selling tickets — or nobody at all.
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              {partners.map((partner) => (
                <div
                  key={partner.id}
                  className="rounded-xl border p-4"
                  data-testid={`partner-row-${partner.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-base dark:bg-indigo-950/50"
                        aria-hidden="true"
                      >
                        {partnerTypeGlyph(partner.partnerType)}
                      </span>
                      {/* Name and tier on one line, what they bring and what
                          they get on the next. The tier glyph is there because
                          "15%", "€100" and "product for exposure" read as three
                          comparable numbers otherwise, and they are not
                          comparable at all. */}
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {partnerTypeLabel(partner.partnerType)} — {partner.name}{' '}
                          <span className="text-xs font-normal text-gray-400">
                            {dealTierGlyph(partnerDealTier(partner))}{' '}
                            {dealTierLabel(partnerDealTier(partner)).toLowerCase()}
                          </span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Brings: {partnerBringsLine(partner)} ·{' '}
                          {partnerTermSummary(partner, currencySymbol)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={partner.status === 'confirmed' ? 'default' : 'secondary'}
                        className={cn(
                          'text-[10px]',
                          partner.status === 'confirmed' && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
                          partner.status === 'invited' && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
                        )}
                        data-testid={`partner-status-${partner.id}`}
                      >
                        {partner.status === 'confirmed' ? 'Confirmed'
                          : partner.status === 'declined' ? 'Declined'
                          : partner.status === 'draft' ? 'Draft'
                          : 'Invited'}
                      </Badge>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Edit ${partner.name}`}
                        onClick={() => { setEditingPartner(partner); setAddOpen(true); }}
                        data-testid={`button-edit-partner-${partner.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-600"
                        aria-label={`Remove ${partner.name}`}
                        onClick={() => removePartner(partner.id)}
                        data-testid={`button-remove-partner-${partner.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Affiliate's two fields, inline in its own card — the same
                      treatment every other type+deal combination gets, so the
                      Experience Pool toggle cannot be lost and cannot read as a
                      separate mechanism. */}
                  {partner.dealType === 'commission_per_ticket' && (
                    <div className="mt-3 flex items-start justify-between gap-3 border-t pt-3">
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          Show in Experience Pool
                        </p>
                        <p className="text-xs text-gray-500">
                          Surfaces this deal on the Collab board so any qualifying
                          affiliate can pick it up — not just the one assigned.
                        </p>
                      </div>
                      <Switch
                        checked={partner.terms?.showInExperiencePool === true}
                        onCheckedChange={(checked) =>
                          updatePartnerTerms(partner.id, { showInExperiencePool: checked })}
                        data-testid={`switch-partner-pool-${partner.id}`}
                      />
                    </div>
                  )}

                  {partner.source === 'invite_link' && (
                    <p className="mt-2 text-xs text-gray-500">
                      Their invite link is issued when you publish
                      {partner.email ? `, and emailed to ${partner.email}` : ''}.
                    </p>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => { setEditingPartner(null); setAddOpen(true); }}
                className="w-full rounded-xl border border-dashed p-3 text-center text-sm font-medium text-gray-600 transition-colors hover:border-indigo-400 hover:text-indigo-700 dark:text-gray-300"
                data-testid="button-add-another-partner"
              >
                + Add Partner
              </button>
            </div>
          )}

          {/* Split Deal Preview: every partner and their terms, not just one. */}
          {partners.length > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-slate-50 to-blue-50 p-4 dark:from-slate-900 dark:to-blue-950/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                Split Deal Preview
              </p>
              <ul className="mt-2 space-y-1.5" data-testid="split-deal-preview">
                {partners.map((partner) => (
                  <li key={partner.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-gray-700 dark:text-gray-200">
                      <strong>{partner.name}</strong>{' '}
                      <span className="text-gray-500">
                        ({partnerTypeLabel(partner.partnerType)})
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-gray-600 dark:text-gray-300">
                      {partnerTermSummary(partner, currencySymbol)}
                      {/* Which side of the waterfall this partner settles on.
                          A barter partner reading a percentage row would expect
                          money that is never coming. */}
                      <span className="block text-[11px] text-gray-500">
                        {revenueShareEligible(partner.dealType)
                          ? 'from ticket revenue'
                          : 'settled outside tickets'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {ticketPartners.length > 0 && (
                <p className="mt-3 border-t pt-2 text-xs text-gray-600 dark:text-gray-300">
                  {ticketPartners.length === 1 ? 'One partner takes' : `${ticketPartners.length} partners take`}{' '}
                  <strong>{totalPartnerSharePct(partners)}%</strong> of ticket revenue
                  between them. Set the rest of the numbers in Pricing.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Participant Referral Perk, now at the bottom ──────────────────
          Moved below the partner list because the perk is so often sourced
          from one of those deals. Asked first, it was asked before the
          organiser knew what they had to offer.

          Minimal until it holds something — point 50. Most events have no
          participant perk at all, and a full card of empty deal choices for
          one made the step look unfinished. */}
      <div className="border-t pt-8">
        <MinimalSection
          title="Participant Referral Perk"
          addLabel="Add a participant referral perk"
          hint="What an ordinary attendee gets for bringing friends. Optional, and nothing by default."
          isEmpty={!participantReferralDealType}
          testId="section-participant-perk"
        >
        <Card className="bg-gray-50/70 dark:bg-gray-900/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-5 h-5" />
                  Participant Referral Perk
                  <Badge variant="outline" className="ml-1 text-xs font-normal">Optional</Badge>
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  What an ordinary attendee gets for bringing friends. Separate
                  from the partner deals above, and nothing by default.
                </p>
              </div>
              {participantReferralDealType && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearParticipantReferralPerk}
                  data-testid="button-clear-participant-perk"
                >
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* The shortcut: reuse a brand's product rather than define a new
                reward from scratch. Only offered when such a deal exists. */}
            {perkSource && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  You have already set up product-for-exposure with{' '}
                  <strong>{perkSource.name}</strong> above — reuse it here, or
                  pick something else.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={usePartnerProductAsPerk}
                  data-testid="button-reuse-partner-product-as-perk"
                >
                  Use {perkSource.name}'s product as the perk
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {participantDealOptions.map((option) => {
                const isActive = participantReferralDealType === option.value;
                // A participant cannot both be paid out of tickets and take a
                // cut back in under a conflicting partner deal. Disabled at the
                // point of choosing, with the reason on the card.
                const conflictReason = isActive
                  ? null
                  : getDealConflictReason(option.value, form.getValues('promotionDealType'));
                const isBlocked = !!conflictReason;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isBlocked}
                    onClick={() => {
                      if (isBlocked) return;
                      form.setValue('participantReferralDealType', option.value, { shouldDirty: true });
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      isBlocked
                        ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900"
                        : isActive
                          ? "border-emerald-600 bg-emerald-50 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40"
                          : "border-gray-200 hover:border-emerald-300 dark:border-gray-700",
                    )}
                    data-testid={`participant-referral-deal-${option.value}`}
                  >
                    <p className="font-semibold text-gray-900 dark:text-white">{option.title}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{option.description}</p>
                    {isBlocked && (
                      <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Not available with your partner deals. {conflictReason}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {participantReferralDealType === 'commission_per_ticket' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <Label htmlFor="participant-referral-pct">Cashback percentage (%)</Label>
                <Input
                  id="participant-referral-pct"
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={participantReferralCommissionPct}
                  onChange={(e) => form.setValue('participantReferralCommissionPct', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                  className="max-w-[140px]"
                  data-testid="input-participant-referral-pct"
                />
              </div>
            )}

            {participantReferralDealType === 'milestone_barter' && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="participant-referral-target">Friend bookings needed</Label>
                    <Input
                      id="participant-referral-target"
                      type="number"
                      min="1"
                      value={participantReferralMilestoneTarget ?? ''}
                      onChange={(e) => form.setValue('participantReferralMilestoneAttendeeTarget', e.target.value ? parseInt(e.target.value, 10) : undefined, { shouldDirty: true })}
                      data-testid="input-participant-referral-target"
                    />
                  </div>
                  <div>
                    <Label htmlFor="participant-referral-reward">What they unlock</Label>
                    <Input
                      id="participant-referral-reward"
                      value={participantReferralMilestoneReward}
                      onChange={(e) => form.setValue('participantReferralMilestoneRewardDescription', e.target.value, { shouldDirty: true })}
                      data-testid="input-participant-referral-reward"
                    />
                  </div>
                </div>
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Preview: bring {participantReferralMilestoneTarget || 'X'} friend bookings
                  → {participantReferralMilestoneReward || 'a reward'}.
                </p>
              </div>
            )}

            {/* A venue-backed perk is the venue's to give, so it goes to them
                for sign-off before anyone is promised it. */}
            {participantReferralDealType === 'milestone_barter' && (
              <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">The venue provides this reward</p>
                  <p className="text-xs text-gray-500">
                    Sends it to the venue for sign-off, and keeps it hidden from
                    participants until they accept.
                  </p>
                </div>
                <Switch
                  checked={!!form.watch('participantReferralVenueBacked')}
                  onCheckedChange={(checked) => form.setValue('participantReferralVenueBacked', checked, { shouldDirty: true })}
                  data-testid="switch-participant-perk-venue-backed"
                />
              </div>
            )}
          </CardContent>
        </Card>
        </MinimalSection>
      </div>

      <AddPartnerModal
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            setEditingPartner(null);
            setPresetType(null);
          }
        }}
        onSave={savePartner}
        editing={editingPartner}
        initialPartnerType={presetType}
        paidTicketsConfigured={paidTicketsConfigured}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}


function PricingStep({ form, manualDealUnlocked = false, experienceId, goToStep }: {
  form: any;
  /**
   * Set by an admin on this event alone, and read from the saved record rather
   * than the form — it decides whether the untracked manual agreement is even
   * offered here.
   */
  manualDealUnlocked?: boolean;
  /**
   * The published event, when this is an edit rather than a first build.
   *
   * A discount link has to point at something that exists, so the link manager
   * says so rather than offering a button that cannot work yet.
   */
  experienceId?: string;
  /**
   * Point 40: the venue's terms are agreed on the Partners step now, so this
   * screen shows the result and hands the organiser back to where it is set.
   */
  goToStep?: (stepId: number) => void;
}) {
  // Watch form values for reactivity
  const currency = form.watch('currency');
  const rooms = form.watch('rooms') || [];
  const eventNightCount = countNightsBetween(form.watch('startDate'), form.watch('endDate'));
  const pricePerPerson = form.watch('pricePerPerson') || 0;
  const maxParticipants = form.watch('maxParticipants') || 0;
  const eventType = form.watch('type'); // Track event type for dynamic UI
  const venueType = form.watch('venueType') || "catalog";
  const selectedVenueId = form.watch('selectedVenueId') || "";
  const configuredPlatformPct = usePlatformFee();
  const creatorPct = form.watch('creatorPct') || 85;
  // Configured, not assumed — an admin who changes the fee must not leave
  // every quote on this screen disagreeing with the payout engine.
  const platformPct = configuredPlatformPct;
  const venueCompensationModel = form.watch('venueCompensationModel') || "revenue_share";
  const venueFixedFee = form.watch('venueFixedFee') || 0;
  const venuePerHeadAmount = form.watch('venuePerHeadAmount') || 0;
  const venuePerRoomPerNight = form.watch('venuePerRoomPerNight') || 0;
  const venueMinimumSpend = form.watch('venueMinimumSpend') || 0;
  const venueRevenueSharePct = form.watch('venueRevenueSharePct') || 0;
  const venueTargetDeal = form.watch('venueTargetDeal') || "";
  const venueTargetDealValue = Number(form.watch('venueTargetDealValue') || 0);

  // ── Add-on pricing, path A ────────────────────────────────────────────────
  // The venue's own prices, where it has published any. An organiser typing a
  // "venue price" for a venue's coffee is guessing on behalf of a business
  // they do not run, and the whole mechanic depends on that number being the
  // real counter price. Where a catalog exists, picking from it is the path;
  // typing a number by hand stays available for a venue that has none.
  const { data: venueAddonCatalog = [] } = useQuery<any[]>({
    queryKey: ['/api/venues', selectedVenueId, 'addon-catalog'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/venues/${selectedVenueId}/addon-catalog`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: venueType === 'catalog' && !!selectedVenueId,
    staleTime: 5 * 60_000,
  });
  const hasVenueAddonCatalog = venueAddonCatalog.length > 0;
  // Path B applies whenever there is no published price to pick from: an open
  // or freshly-invited venue, or a catalog venue that never filled one in.
  const askVenueForAddonPrice = !hasVenueAddonCatalog
    && (venueType === 'open' || venueType === 'manual' || venueType === 'catalog');
  const requireMinimumParticipants = form.watch('requireMinimumParticipants');
  const minimumParticipants = form.watch('minimumParticipants') || 6;
  const softHoldEnabled = form.watch('softHoldEnabled');
  const softHoldDurationHours = form.watch('softHoldDurationHours') || 48;
  const participantReferralDealType = form.watch('participantReferralDealType');
  const participantReferralCommissionPct = form.watch('participantReferralCommissionPct') || 0;
  const influencerPromotionEnabled = participantReferralDealType === 'commission_per_ticket';
  const influencerCommissionPct = participantReferralCommissionPct;
  const discounts = form.watch('discounts') || [];
  const ticketSkus = form.watch('ticketSkus') || [];
  const [selectedMarketplaceVenue, setSelectedMarketplaceVenue] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSelectedVenue = async () => {
      if (venueType !== "catalog" || !selectedVenueId) {
        setSelectedMarketplaceVenue(null);
        return;
      }

      try {
        const [catalogResponse, userVenuesResponse] = await Promise.all([
          apiRequest("GET", "/api/venues?approved=true"),
          apiRequest("GET", "/api/user/venues").catch(() => null),
        ]);
        const catalogVenues = await catalogResponse.json();
        let userVenues: any[] = [];
        if (userVenuesResponse && userVenuesResponse.ok) {
          userVenues = await userVenuesResponse.json();
        }
        const selected = [...(Array.isArray(userVenues) ? userVenues : []), ...(Array.isArray(catalogVenues) ? catalogVenues : [])]
          .find((venue: any) => venue.id === selectedVenueId);
        if (!cancelled) setSelectedMarketplaceVenue(selected || null);
      } catch {
        if (!cancelled) setSelectedMarketplaceVenue(null);
      }
    };

    fetchSelectedVenue();
    return () => {
      cancelled = true;
    };
  }, [venueType, selectedVenueId]);

  // The platform infrastructure fee is fixed and non-negotiable.
  useEffect(() => {
    form.setValue('platformPct', FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('platformRevenuePercentage', FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('creatorPct', 100 - FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('creatorRevenuePercentage', 100 - FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.getValues('monetisationMode') !== 'creator_led') {
      form.setValue('monetisationMode', 'creator_led', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-day and virtual events don't have rooms - use Number of Spots instead
  const isNonRoomEvent = eventType === 'one-day' || eventType === 'virtual';
  const isMultiDayEvent = eventType === 'multi-day';
  // venueDealContext drives which UI branch the Pricing step renders:
  //   "open"              — creator is seeking venue bids; sets a target deal preference only
  //   "invited"           — creator invited a specific external venue (manual); proposes a deal to that venue
  //   "external"          — outdoor/virtual, so there is no venue commercial deal to negotiate
  //   "marketplace_day"   — catalog daytime space or one-day event; limited short-stay deal models
  //   "marketplace_retreat" — catalog multi-day retreat; full revenue-share models
  const venueDealContext =
    venueType === "open"
      ? "open"
      : venueType === "manual"
        ? "invited"
        : venueType !== "catalog"
          ? "external"
          : selectedMarketplaceVenue?.venueType === "daytime" || eventType === "one-day"
            ? "marketplace_day"
            : "marketplace_retreat";

  // Deal options come from the shared vocabulary so the Venue Builder offers the
  // same list and each event length receives only compatible on-platform deals.
  const dealCurrencySymbol =
    CURRENCY_CONFIG[String(form.watch('currency') || 'eur').toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol || '€';
  // Every money field on this step prints the symbol inside itself now, so it
  // is read off one place rather than re-derived beside each input.
  const currencySymbol = currency
    ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol || '€'
    : '€';
  const isDaytimeDeal = !isMultiDayEvent;

  const targetDealOptions = useMemo(
    () => getVenueDealOptions({
      isDaytime: isDaytimeDeal,
      surface: "event",
      currencySymbol: dealCurrencySymbol,
      currentValue: form.watch('venueTargetDeal'),
      allowUntracked: manualDealUnlocked,
    }),
    [isDaytimeDeal, dealCurrencySymbol, manualDealUnlocked, form.watch('venueTargetDeal')],
  );

  const venueDealOptions = useMemo(
    () => getVenueDealOptions({
      isDaytime: isDaytimeDeal,
      surface: "event",
      currencySymbol: dealCurrencySymbol,
      currentValue: form.watch('venueCompensationModel'),
      allowUntracked: manualDealUnlocked,
    }),
    [isDaytimeDeal, dealCurrencySymbol, manualDealUnlocked, form.watch('venueCompensationModel')],
  );

  // Benchmarks moved with the fields they annotate — a range beside a number
  // you can no longer type here would be advice about somebody else's screen.
  // They live in `VenueDealEditor` on the Partners step now.

  // A target deal that no longer applies (e.g. the creator switched a day event
  // to multi-day) is swapped for a valid one so the saved terms stay coherent.
  useEffect(() => {
    const current = form.getValues('venueTargetDeal');
    if (current && !targetDealOptions.some((option) => option.value === current)) {
      form.setValue('venueTargetDeal', targetDealOptions[0]?.value || '', { shouldDirty: true });
      form.setValue('venueTargetDealValue', undefined, { shouldDirty: true });
    }
  }, [targetDealOptions, form]);

  useEffect(() => {
    if (venueDealContext === "external" || venueDealContext === "open" || venueDealContext === "invited") {
      // Zero out venue deal amounts for external, open, and invited modes.
      // External: outdoor/virtual events have no venue commercial terms.
      // Open: no specific venue is chosen yet — amounts are determined when a venue accepts the bid.
      // Invited: amount lives in venueTargetDealValue, determined when the invited venue accepts.
      // This value is ignored in these contexts, but keeping an on-platform
      // model prevents legacy drafts from resurfacing the disabled option.
      form.setValue('venueCompensationModel', 'revenue_share', { shouldDirty: false });
      form.setValue('venueFixedFee', 0, { shouldDirty: false });
      form.setValue('venuePerHeadAmount', 0, { shouldDirty: false });
      form.setValue('venuePerRoomPerNight', 0, { shouldDirty: false });
      form.setValue('venueMinimumSpend', 0, { shouldDirty: false });
      form.setValue('venueRevenueSharePct', 0, { shouldDirty: false });
      form.setValue('venueAccessFee', 0, { shouldDirty: false });
      return;
    }

    // A model that isn't valid for this event length falls back to the first
    // compatible on-platform option.
    if (!venueDealOptions.some((option) => option.value === venueCompensationModel)) {
      form.setValue('venueCompensationModel', venueDealOptions[0]?.value || 'revenue_share', { shouldDirty: true });
    }
  }, [form, venueDealContext, venueDealOptions, venueCompensationModel]);

  // **1. CURRENCY CONSOLIDATION** - Unified currency that propagates to all pricing
  const handleCurrencyChange = (newCurrency: string) => {
    form.setValue('currency', newCurrency, { shouldDirty: true });
  };

  // Calculate total capacity from rooms
  const totalCapacity = rooms.reduce((total: number, room: any) => {
    const quantity = parseInt(room.quantity) || 0;
    const capacity = parseInt(room.capacity) || 1;
    return total + (quantity * capacity);
  }, 0);

  // Use experience-level pricePerPerson for all calculations
  const hasRooms = rooms.length > 0;

  // Build priceSource object for legacy compatibility
  const priceSource = {
    source: hasRooms ? 'rooms' as const : 'base' as const,
    totalPrice: pricePerPerson,
    hasRooms: hasRooms
  };

  // Build SKUs from rooms using the experience-level pricePerPerson (legacy, used for discounts)
  const skus: Array<{ id: string; name: string; capacity: number; pricePerPerson: number; quantity: number; description?: string; photos: string[] }> = rooms.map((room: any) => ({
    id: room.id,
    name: room.name,
    capacity: (parseInt(room.capacity) || 1) * (parseInt(room.quantity) || 1),
    pricePerPerson: pricePerPerson,
    quantity: room.quantity || 1,
    description: room.notes,
    photos: room.gallery || []
  }));

  // Track previous state to detect changes for auto-generation
  const prevRoomsRef = useRef<string>('');
  const prevMaxParticipantsRef = useRef<number>(0);
  const prevEventTypeRef = useRef<string>('');

  // Auto-generate ticketSkus when rooms or maxParticipants change
  useEffect(() => {
    const roomsKey = JSON.stringify(rooms.map((r: any) => ({ id: r.id, name: r.name, quantity: r.quantity, capacity: r.capacity })));
    const maxPartChanged = maxParticipants !== prevMaxParticipantsRef.current;
    const roomsChanged = roomsKey !== prevRoomsRef.current;
    const eventTypeChanged = eventType !== prevEventTypeRef.current;

    // Only regenerate if something changed
    if (!roomsChanged && !maxPartChanged && !eventTypeChanged) return;
    
    prevRoomsRef.current = roomsKey;
    prevMaxParticipantsRef.current = maxParticipants;
    prevEventTypeRef.current = eventType || '';

    // For events with rooms (multi-day or unspecified type), generate SKUs from rooms
    // If rooms exist, generate ticketSkus regardless of whether eventType is explicitly set
    if (hasRooms) {
      const existingSkus = ticketSkus || [];
      const newSkus = rooms.map((room: any) => {
        const roomCapacity = (parseInt(room.quantity) || 1) * (parseInt(room.capacity) || 1);
        // Try to preserve existing pricing for this room
        const existingSku = existingSkus.find((s: any) => s.sourceRoomId === room.id);
        return {
          id: existingSku?.id || `sku-${room.id}-${Date.now()}`,
          ticketName: `${room.name} – Per Person`,
          pricePerPerson: existingSku?.pricePerPerson ?? 0,
          depositPerPerson: existingSku?.depositPerPerson ?? 0,
          ticketCapacity: roomCapacity,
          sourceRoomId: room.id,
          soldCount: existingSku?.soldCount ?? 0
        };
      });
      form.setValue('ticketSkus', newSkus, { shouldDirty: true });
    }
    // For one-day/virtual events without rooms, create the first ticket once and then preserve creator-added tickets.
    else if (isNonRoomEvent && maxParticipants > 0) {
      const existingSkus = ticketSkus || [];
      if (existingSkus.length === 0) {
        form.setValue('ticketSkus', [{
          id: `sku-ga-${Date.now()}`,
          ticketName: 'General Admission',
          pricePerPerson: pricePerPerson || 0,
          depositPerPerson: 0,
          ticketCapacity: maxParticipants,
          sourceRoomId: undefined,
          soldCount: 0
        }], { shouldDirty: true });
      } else if (eventTypeChanged && existingSkus.length === 1 && existingSkus[0].ticketName === 'General Admission') {
        form.setValue('ticketSkus', [{
          ...existingSkus[0],
          ticketCapacity: existingSkus[0].ticketCapacity || maxParticipants,
        }], { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, maxParticipants, eventType, isMultiDayEvent, isNonRoomEvent, hasRooms]);

  // Sync pricePerPerson to legacy price field for backend compatibility
  // Set legacy pricePerPerson to the lowest ticket price
  useEffect(() => {
    if (ticketSkus && ticketSkus.length > 0) {
      const prices = ticketSkus.map((s: any) => Number(s.pricePerPerson || 0)).filter((p: number) => Number.isFinite(p));
      if (prices.length > 0) {
        const lowestPrice = Math.min(...prices);
        form.setValue('pricePerPerson', lowestPrice, { shouldDirty: true });
        form.setValue('price', lowestPrice, { shouldDirty: true });
      }
    } else if (pricePerPerson > 0) {
      form.setValue('price', pricePerPerson, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketSkus]);

  // Update a specific ticket SKU field
  // Booleans joined the SKU shape with the modular add-on toggle.
  const updateTicketSku = (skuId: string, field: string, value: string | number | boolean) => {
    const updated = ticketSkus.map((sku: any) => 
      sku.id === skuId ? { ...sku, [field]: value } : sku
    );
    form.setValue('ticketSkus', updated, { shouldDirty: true });
  };

  const updateTicketFormat = (skuId: string, pricingMode: string) => {
    const updated = ticketSkus.map((sku: any) => {
      if (sku.id !== skuId) return sku;
      return pricingMode === 'free_rsvp'
        ? { ...sku, pricingMode, pricePerPerson: 0, minPrice: 0, suggestedPrice: undefined }
        : { ...sku, pricingMode };
    });
    form.setValue('ticketSkus', updated, { shouldDirty: true, shouldValidate: true });
  };

  const addTicketSku = () => {
    const nextIndex = ticketSkus.length + 1;
    form.setValue('ticketSkus', [
      ...ticketSkus,
      {
        id: `sku-custom-${Date.now()}`,
        ticketName: `Ticket ${nextIndex}`,
        pricingMode: 'fixed' as const,
        pricePerPerson: 0,
        minPrice: 0,
        suggestedPrice: undefined,
        addonName: undefined,
        addonPrice: undefined,
        depositPerPerson: 0,
        ticketCapacity: 1,
        sourceRoomId: undefined,
        soldCount: 0,
      },
    ], { shouldDirty: true });
  };

  const removeTicketSku = (skuId: string) => {
    const updated = ticketSkus.filter((sku: any) => sku.id !== skuId);
    form.setValue('ticketSkus', updated, { shouldDirty: true });
  };

  // ── Ticket maths ────────────────────────────────────────────────────────
  // One definition of a ticket's price and capacity, used by both the per-ticket
  // subtotal and the grand total. They were computed separately before, so a
  // combi or pay-what-you-want ticket could show one number per row and add up
  // to a different one.
  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    // Inputs arrive as strings, sometimes with thousands separators.
    const parsed = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Entry price only. A combi's add-on is deliberately excluded: the venue is
  // paid for the add-on directly, so folding it in here would hand them a share
  // of their own coffee on top.
  const skuEffectivePrice = (sku: any): number => getSkuEntryPrice(sku);

  const skuEffectiveCapacity = (sku: any): number =>
    getSkuCapacity(sku, ticketSkus.length, maxParticipants);

  const skuRevenueOf = (sku: any): number =>
    safeMultiply(skuEffectivePrice(sku), skuEffectiveCapacity(sku));

  const skuAddonRevenueOf = (sku: any): number => {
    const addon = getTicketAddon(sku);
    return addon ? safeMultiply(addon.unitPrice, skuEffectiveCapacity(sku)) : 0;
  };

  const revenueSummary = summariseTicketRevenue(ticketSkus, maxParticipants);
  const ticketTotalCapacity = revenueSummary.totalCapacity;
  // What a venue deal may charge for. 32 free RSVPs beside 32 paid tickets used
  // to be billed as 64, so a €4 deduction quoted €256 on €160 of ticket sales.
  const paidTicketCapacity = revenueSummary.paidCapacity;
  const addOnTotalRevenue = revenueSummary.addOnGross;
  const mvgExceedsTicketCapacity = requireMinimumParticipants
    && ticketTotalCapacity > 0
    && minimumParticipants > ticketTotalCapacity;
  const ticketTotalRevenue = revenueSummary.ticketGross;

  useEffect(() => {
    if (isNonRoomEvent && ticketTotalCapacity > 0 && ticketTotalCapacity !== maxParticipants) {
      form.setValue('maxParticipants', ticketTotalCapacity, { shouldDirty: true });
    }
  }, [form, isNonRoomEvent, ticketTotalCapacity, maxParticipants]);

  useEffect(() => {
    form.setValue(
      'venueRevenuePercentage',
      venueCompensationModel === "revenue_share" ? venueRevenueSharePct : 0,
      { shouldDirty: false }
    );
  }, [form, venueCompensationModel, venueRevenueSharePct]);

  // Compute example payout using ticket SKU totals
  const effectiveCapacity = ticketTotalCapacity > 0 ? ticketTotalCapacity : (hasRooms ? totalCapacity : maxParticipants);
  const totalRevenue = ticketTotalRevenue > 0 ? ticketTotalRevenue : safeMultiply(pricePerPerson, effectiveCapacity);
  // Heads a per-ticket or per-head venue fee is charged for. Falls back to the
  // whole event only when no ticket is priced at all, which is the same shape
  // the old single-capacity number had.
  const chargeableCapacity = paidTicketCapacity > 0
    ? paidTicketCapacity
    : (ticketTotalCapacity > 0 ? 0 : effectiveCapacity);
  const revenueSplit = computeRevenueSplit(totalRevenue, creatorPct, platformPct);
  const activeVenueDeal = venueDealContext === "open" || venueDealContext === "invited"
    ? venueTargetDeal
    : venueDealContext === "external"
      ? null
      : venueCompensationModel;
  const activeRevenueSharePct = (venueDealContext === "open" || venueDealContext === "invited") ? venueTargetDealValue : venueRevenueSharePct;
  const activeFlatVenueAmount = (venueDealContext === "open" || venueDealContext === "invited") ? venueTargetDealValue : venueFixedFee;
  const venueRevenueShareAmount = safeMultiply(totalRevenue, activeRevenueSharePct / 100);
  const venuePerHeadEstimate = safeMultiply(venuePerHeadAmount, chargeableCapacity);
  // Per Room / Per Night is rate × rooms × nights. Rooms come from the Rooms
  // step, nights from the event dates; a single-day event holds no nights, so
  // it bills one.
  const totalRoomCount = rooms.reduce(
    (total: number, room: any) => total + (parseInt(room?.quantity, 10) || 0),
    0,
  );
  const activePerRoomRate = (venueDealContext === "open" || venueDealContext === "invited")
    ? venueTargetDealValue
    : venuePerRoomPerNight;
  const venuePerRoomNightEstimate = safeMultiply(
    safeMultiply(activePerRoomRate, totalRoomCount),
    Math.max(1, eventNightCount),
  );
  // Counted honestly: a Free RSVP event has no paid tickets, so a per-ticket
  // deduction is €0 rather than one ticket's worth of it.
  const venueTicketDeductionEstimate = calculateTicketDeductionForCount(
    activeFlatVenueAmount,
    chargeableCapacity,
  );
  const venueCommercialEstimate = (() => {
    switch (activeVenueDeal) {
      case "fixed_fee": return venueTicketDeductionEstimate;
      case "per_head": return venuePerHeadEstimate;
      case "per_room_night": return venuePerRoomNightEstimate;
      case "minimum_spend": return venueMinimumSpend;
      case "revenue_share": return venueRevenueShareAmount;
      // Same share as Revenue Split; the commitment fee is added back below.
      case "commitment_plus_revenue_share": return venueRevenueShareAmount;
      case "upfront_rental": return venueFixedFee; // cost to creator — show as deduction
      case "venue_sponsored": return 0; // income for creator — handled separately
      default: return 0;
    }
  })();
  // The venue's one-off commitment fee travels the other way: it is income to
  // the creator, sitting alongside a share that is a cost.
  const venueCommitmentFee = activeVenueDeal === 'commitment_plus_revenue_share'
    ? toNumber(form.watch('venueCommitmentFee'))
    : 0;
  // The commitment fee is deliberately NOT folded in here. Netting it against
  // the venue's share produced a row labelled "Venue Payout" reading +50.00 at
  // zero sales — a payout row with a positive sign for money the venue pays.
  // It gets its own line in the calculator instead.
  const venuePayout = activeVenueDeal === 'venue_sponsored'
    ? activeFlatVenueAmount
    : activeVenueDeal === 'upfront_rental'
      ? -activeFlatVenueAmount
      : -venueCommercialEstimate;
  // Can the event pay for this deal at all? Checked on the ongoing venue terms
  // only — a one-off commitment fee is income and cannot overdraw anything.
  const venuePayoutCap = checkVenuePayoutCap({
    model: activeVenueDeal,
    value: (() => {
      switch (activeVenueDeal) {
        case "revenue_share":
        case "commitment_plus_revenue_share": return activeRevenueSharePct;
        case "fixed_fee": return activeFlatVenueAmount;
        case "per_head": return venuePerHeadAmount;
        case "per_room_night": return activePerRoomRate;
        default: return 0;
      }
    })(),
    ticketGross: totalRevenue,
    paidTickets: chargeableCapacity,
    platformPct,
    roomNights: safeMultiply(totalRoomCount, Math.max(1, eventNightCount)),
    currencyDisplay: { symbol: dealCurrencySymbol, before: dealCurrencySymbol !== '€' },
  });

  // The selected deal's mechanics, worked out with this event's own numbers.
  //
  // Three of these — Venue Sponsorship, Price Per Participant Package and Per
  // Room / Per Night — had only ever been inferred from their names. That is
  // where two sides shake hands meaning different things: "per participant"
  // could be per booking, and "per room per night" could be rooms filled. The
  // formula is stated rather than implied, and it is generated from the same
  // branches the calculator and the payout engine run.
  const dealMechanics = explainVenueDealMechanics({
    model: activeVenueDeal,
    value: (() => {
      switch (activeVenueDeal) {
        case 'revenue_share':
        case 'commitment_plus_revenue_share': return activeRevenueSharePct;
        case 'per_head': return venuePerHeadAmount;
        case 'per_room_night': return activePerRoomRate;
        default: return activeFlatVenueAmount;
      }
    })(),
    paidTickets: chargeableCapacity,
    ticketGross: totalRevenue,
    rooms: totalRoomCount,
    nights: Math.max(1, eventNightCount),
    currencySymbol: dealCurrencySymbol,
  });

  // The two deals that commit a venue to a flat amount with nothing to correct
  // against. Everywhere else expected turnout is a pitch detail; here it is the
  // whole basis of the offer.
  const turnoutIsLoadBearing = activeVenueDeal === 'venue_sponsored'
    || activeVenueDeal === 'upfront_rental';

  // The Deal Type Matrix, live. Two of these block a publish (a deduction
  // bigger than the ticket it comes out of, an add-on margin bigger than the
  // venue's price); the third is the Minimum Viable Group recommendation on a
  // deal whose cost does not fall when fewer people come.
  const dealTermIssues = checkExperienceDealTerms({
    venueType,
    venueTargetDeal,
    venueTargetDealValue,
    venueCompensationModel,
    venueFixedFee,
    venuePerHeadAmount,
    venuePerRoomPerNight,
    ticketSkus,
    currency,
    requireMinimumParticipants,
  });

  // ── Partners that pull from ticket revenue ───────────────────────────────
  // Whichever partner's deal is Revenue Split / Commission per Ticket is what
  // Pricing calculates against — no longer hardcoded to the venue. There may be
  // none (a free public space with only barter partners), one, or several.
  const pricingPartners: EventPartnerEntry[] = useMemo(
    () => sanitisePartnerEntries(form.watch('eventPartners')),
    [form.watch('eventPartners')],
  );
  const ticketRevenuePartners = useMemo(
    () => revenueSharePartners(pricingPartners),
    [pricingPartners],
  );
  const partnerShareRows = useMemo(
    () => ticketRevenuePartners.map((partner) => ({
      key: partner.id,
      label: `${partnerTypeLabel(partner.partnerType)} — ${partner.name}`,
      pct: Number(partner.terms?.commissionPct || 0),
    })),
    [ticketRevenuePartners],
  );

  const setPartnerSharePct = (entryId: string, pct: number) => {
    const current = sanitisePartnerEntries(form.getValues('eventPartners'));
    form.setValue(
      'eventPartners',
      current.map((partner) => partner.id === entryId
        ? { ...partner, terms: { ...partner.terms, commissionPct: pct } }
        : partner),
      { shouldDirty: true },
    );
  };

  /**
   * The Commercial Model's cards, grouped by how each deal settles.
   *
   * Assembled here rather than in the markup so the venue and the partners are
   * described by the same three fields — who, what they bring, what the terms
   * are — instead of by two nearly-identical blocks that drifted apart.
   */
  const pricingTierGroups = useMemo(() => {
    type TierEntry = {
      key: string;
      title: string;
      brings: string;
      terms: string;
      pullsFromTickets: boolean;
      partner?: EventPartnerEntry;
    };
    const groups: Record<DealTier, TierEntry[]> = { per_unit: [], flat: [], barter: [] };

    if (venueDealContext !== "external" && activeVenueDeal) {
      const pulls = activeVenueDeal === "revenue_share"
        || activeVenueDeal === "commitment_plus_revenue_share";
      groups[venueDealTierOf(activeVenueDeal)].push({
        key: "venue",
        title: "Venue",
        brings: isMultiDayEvent ? "the location" : "the space",
        terms: summariseVenueDeal({
          model: activeVenueDeal,
          mode: (venueDealContext === "open" || venueDealContext === "invited") ? "target" : "settled",
          currencySymbol: dealCurrencySymbol,
          revenueSharePct: venueRevenueSharePct,
          fixedFee: venueFixedFee,
          perHeadAmount: venuePerHeadAmount,
          perRoomPerNight: venuePerRoomPerNight,
          commitmentFee: form.watch('venueCommitmentFee'),
          barterTerms: form.watch('venueBarterTerms'),
          targetValue: venueTargetDealValue,
        }),
        pullsFromTickets: pulls,
      });
    }

    for (const partner of pricingPartners) {
      groups[partnerDealTier(partner)].push({
        key: partner.id,
        title: `${partnerTypeLabel(partner.partnerType)} — ${partner.name}`,
        brings: partnerBringsLine(partner),
        terms: partnerTermSummary(partner, dealCurrencySymbol),
        pullsFromTickets: revenueShareEligible(partner.dealType),
        partner,
      });
    }

    return groups;
  }, [
    pricingPartners, activeVenueDeal, venueDealContext, isMultiDayEvent, dealCurrencySymbol,
    venueRevenueSharePct, venueFixedFee, venuePerHeadAmount, venuePerRoomPerNight,
    venueTargetDealValue, form.watch('venueCommitmentFee'), form.watch('venueBarterTerms'),
  ]);

  /**
   * Is there anything in the Commercial Model to look at?
   *
   * A venue deal on its own counts. With neither a venue deal nor a partner,
   * the section is the platform fee and nothing else, and it says so rather
   * than rendering an empty grid.
   */
  const hasCommercialModel = pricingPartners.length > 0
    || (venueDealContext !== "external" && !!activeVenueDeal);

  /** Point 42: a share of ticket revenue means nothing on a Free-RSVP event. */
  const hasPaidTicket = hasPaidTicketConfigured(ticketSkus);

  const isCommissionPromotion = participantReferralDealType === 'commission_per_ticket';
  // Add-on money splits two ways: the venue's own price for the item, and the
  // organiser's flat margin. The margin is the organiser's earnings, so it
  // belongs in the net — reporting the whole participant spend as "paid to the
  // venue" understated what the organiser actually makes.
  const addOnVenueRevenue = revenueSummary.addOnVenueGross;
  const addOnCreatorMargin = revenueSummary.addOnCreatorGross;

  // One breakdown, whose total is the sum of the rows it hands back. The rows
  // used to be assembled in the markup and the total in an expression beside
  // them, and the two drifted: four rows adding to $55 over a total of -$30.
  const economicsInput = {
    ticketGross: totalRevenue,
    paidTickets: chargeableCapacity,
    platformPct,
    venueDealModel: activeVenueDeal,
    venueDealValue: (() => {
      switch (activeVenueDeal) {
        case "revenue_share":
        case "commitment_plus_revenue_share": return activeRevenueSharePct;
        case "per_head": return venuePerHeadAmount;
        case "per_room_night": return activePerRoomRate;
        case "minimum_spend": return venueMinimumSpend;
        default: return activeFlatVenueAmount;
      }
    })(),
    roomNights: safeMultiply(totalRoomCount, Math.max(1, eventNightCount)),
    commitmentFee: venueCommitmentFee,
    addOnVenueGross: addOnVenueRevenue,
    addOnCreatorGross: addOnCreatorMargin,
    promoterCommissionPct: isCommissionPromotion ? influencerCommissionPct : 0,
    // Each ticket-revenue partner gets its own row in the calculator and its own
    // subtraction from the total. An affiliate's commission was previously
    // worked out somewhere else entirely, which is how a creator could read a
    // net that ignored it.
    partnerShares: partnerShareRows,
  };
  const economics = calculateEventEconomics(economicsInput);

  // ── The three questions the calculator answers ──────────────────────────
  // Preview, comparison and break-even used to be separate ideas an organiser
  // had to hold in their head at once. They are the same arithmetic asked
  // three ways, so they come from the same input.
  const [calculatorMode, setCalculatorMode] = useState<'paid' | 'free'>('paid');
  const calculatorCapacity = ticketTotalCapacity > 0 ? ticketTotalCapacity : effectiveCapacity;
  const freeRsvpEconomics = useMemo(
    () => economicsAsFreeRsvp(economicsInput, calculatorCapacity, calculatorCapacity),
    [economicsInput, calculatorCapacity],
  );
  const shownEconomics = calculatorMode === 'free' ? freeRsvpEconomics : economics;
  const breakEvenAttendance = useMemo(
    () => findBreakEvenAttendance(
      calculatorMode === 'free' ? { ...economicsInput, ticketGross: 0, paidTickets: 0 } : economicsInput,
      calculatorCapacity,
    ),
    [economicsInput, calculatorCapacity, calculatorMode],
  );

  // The existing rule, extended to every party rather than just the venue:
  // everyone's share plus the platform fee has to leave something behind.
  const totalTicketTakePct = totalPartnerSharePct(pricingPartners)
    + platformPct
    + (activeVenueDeal === 'revenue_share' || activeVenueDeal === 'commitment_plus_revenue_share'
      ? Number(activeRevenueSharePct || 0)
      : 0);
  const ticketTakeExceedsGross = totalTicketTakePct >= 100;
  const venueDealSummaryLabel = venueDealContext === "external"
    ? "No venue commercial deal"
    : activeVenueDeal
      ? getVenueDealLabel(activeVenueDeal, dealCurrencySymbol)
      : "Not selected";

  // **4. MVG PROGRESS** - Using pricing service computation
  const mvgProgress = computeMVGProgress(0, minimumParticipants); // 0 current bookings in draft mode

  // **5. DISCOUNT MANAGEMENT** 
  const addDiscount = () => {
    const newDiscount = {
      id: `discount-${Date.now()}`,
      title: '',
      type: 'percentage' as const,
      value: 0,
      validUntil: undefined,
      capacityCap: undefined,
      active: true,
      skuId: ticketSkus.length > 0 ? ticketSkus[0].id : undefined
    };
    form.setValue('discounts', [...discounts, newDiscount], { shouldDirty: true });
  };

  const removeDiscount = (discountId: string) => {
    const updatedDiscounts = discounts.filter((d: any) => d.id !== discountId);
    form.setValue('discounts', updatedDiscounts, { shouldDirty: true });
  };

  const updateDiscount = (discountId: string, field: string, value: any) => {
    const updatedDiscounts = discounts.map((d: any) => 
      d.id === discountId ? { ...d, [field]: value } : d
    );
    form.setValue('discounts', updatedDiscounts, { shouldDirty: true });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Pricing & Monetisation</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Configure pricing, marketplace economics, and payment triggers.
        </p>
      </div>

      {/* **1. CURRENCY CONSOLIDATION** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Currency Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="currency">Currency *</Label>
              <Select 
                value={currency || ''} 
                onValueChange={handleCurrencyChange}
              >
                <SelectTrigger data-testid="select-currency">
                  <SelectValue placeholder="Select currency for all pricing" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_CONFIG).map(([code, config]) => (
                    <SelectItem key={code} value={code}>
                      {config.symbol} {code.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                This currency will be used for all pricing, rooms, and payouts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* **2. TICKET SKU EDITOR** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Ticket Pricing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* For one-day/virtual events: Show Number of Spots input first */}
            {isNonRoomEvent && (
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg mb-4">
                <h4 className="font-medium mb-3">Number of Spots</h4>
                <div>
                  <Label htmlFor="maxParticipants">Available Spots *</Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="1"
                    max="1000"
                    value={maxParticipants || ''}
                    onChange={(e) => {
                      const newVal = parseInt(e.target.value) || 0;
                      form.setValue('maxParticipants', newVal, { shouldDirty: true });
                      // Sync to the single ticket SKU so the reverse-sync effect doesn't override it
                      const currentSkus = form.getValues('ticketSkus') || [];
                      if (currentSkus.length === 1) {
                        form.setValue('ticketSkus', [{ ...currentSkus[0], ticketCapacity: newVal }], { shouldDirty: true });
                      }
                    }}
                    placeholder="e.g., 20"
                    data-testid="input-number-of-spots"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total number of people who can join this {eventType === 'virtual' ? 'virtual session' : 'one-day event'}.
                  </p>
                </div>
              </div>
            )}

            {/* Ticket SKUs Table/Cards */}
            {ticketSkus.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Ticket Types</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid="badge-ticket-count">
                      {ticketSkus.length} ticket type{ticketSkus.length > 1 ? 's' : ''}
                    </Badge>
                    {isNonRoomEvent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTicketSku}
                        data-testid="button-add-ticket-sku"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Ticket
                      </Button>
                    )}
                  </div>
                </div>
                
                {!currency && (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Please select a currency above before setting prices.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {ticketSkus.map((sku: any, index: number) => {
                    const skuRevenue = skuRevenueOf(sku);
                    return (
                      <div 
                        key={sku.id} 
                        className="bg-white dark:bg-gray-800 border rounded-lg p-4 space-y-3"
                        data-testid={`ticket-sku-card-${index}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 pr-3">
                            <Label htmlFor={`sku-name-${sku.id}`}>Ticket Name *</Label>
                            <Input
                              id={`sku-name-${sku.id}`}
                              value={sku.ticketName || ''}
                              onChange={(e) => updateTicketSku(sku.id, 'ticketName', e.target.value)}
                              placeholder="e.g., Run + Coffee Add-on"
                              data-testid={`input-ticket-name-${index}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" data-testid={`ticket-sku-capacity-${index}`}>
                              {sku.ticketCapacity} spots
                            </Badge>
                            {isNonRoomEvent && ticketSkus.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTicketSku(sku.id)}
                                data-testid={`button-remove-ticket-${index}`}
                                aria-label="Remove ticket"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Ticket Capacity (always visible) */}
                        {(isNonRoomEvent || !sku.sourceRoomId) && (
                          <div>
                            <Label htmlFor={`sku-capacity-${sku.id}`}>Ticket Capacity *</Label>
                            <Input
                              id={`sku-capacity-${sku.id}`}
                              type="number"
                              min="1"
                              value={sku.ticketCapacity || ''}
                              onChange={(e) => updateTicketSku(sku.id, 'ticketCapacity', parseInt(e.target.value) || 1)}
                              data-testid={`input-ticket-capacity-${index}`}
                            />
                          </div>
                        )}

                        {/* Format and price, side by side.
                            Three choices fit on one row, so a dropdown that
                            has to be opened before the other two can even be
                            read was hiding the decision rather than asking it.
                            Point 45. */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {/* Paid Ticket: single price. Currency sits inside the
                              field rather than in a grey box beside it —
                              point 44. */}
                          {(!sku.pricingMode || sku.pricingMode === 'fixed') && (
                            <div>
                              <Label htmlFor={`sku-price-${sku.id}`}>Price *</Label>
                              <MoneyInput
                                id={`sku-price-${sku.id}`}
                                prefix={currencySymbol}
                                value={sku.pricePerPerson || ''}
                                onValueChange={(amount) => updateTicketSku(sku.id, 'pricePerPerson', amount ?? 0)}
                                placeholder="0.00"
                                disabled={!currency}
                                data-testid={`input-ticket-price-${index}`}
                              />
                            </div>
                          )}

                          <div className={cn(sku.pricingMode && sku.pricingMode !== 'fixed' && "sm:col-span-2")}>
                            <Label htmlFor={`sku-format-${sku.id}`}>Format</Label>
                            <div
                              id={`sku-format-${sku.id}`}
                              role="radiogroup"
                              aria-label="Ticket format"
                              className="mt-1 inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900"
                              data-testid={`select-ticket-format-${index}`}
                            >
                              {TICKET_FORMATS.map((format) => {
                                const active = (sku.pricingMode || 'fixed') === format.value;
                                return (
                                  <button
                                    key={format.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => updateTicketFormat(sku.id, format.value)}
                                    className={cn(
                                      "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                                      active
                                        ? "bg-indigo-600 text-white"
                                        : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white",
                                    )}
                                    data-testid={`ticket-format-${format.value}-${index}`}
                                  >
                                    {format.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Free RSVP: price locked at $0 */}
                        {sku.pricingMode === 'free_rsvp' && (
                          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-sm text-gray-500">Price locked at</span>
                            <span className="font-semibold">
                              {currency ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}0.00
                            </span>
                            <span className="text-xs text-gray-400">(free admission)</span>
                          </div>
                        )}

                        {/* PWYW: minimum + suggested price */}
                        {sku.pricingMode === 'pwyw' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`sku-minprice-${sku.id}`}>Minimum Price</Label>
                              <div className="flex gap-2">
                                <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                                  {currency ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}
                                </span>
                                <MoneyInput
                                  id={`sku-minprice-${sku.id}`}
                                  value={sku.minPrice ?? ''}
                                  onValueChange={(amount) => updateTicketSku(sku.id, 'minPrice', amount ?? 0)}
                                  placeholder="0.00"
                                  disabled={!currency}
                                  data-testid={`input-ticket-minprice-${index}`}
                                  className="flex-1"
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-1">Buyer cannot go below this</p>
                            </div>
                            <div>
                              <Label htmlFor={`sku-suggested-${sku.id}`}>Suggested Price</Label>
                              <div className="flex gap-2">
                                <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                                  {currency ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}
                                </span>
                                <MoneyInput
                                  id={`sku-suggested-${sku.id}`}
                                  value={sku.suggestedPrice ?? ''}
                                  onValueChange={(amount) => updateTicketSku(sku.id, 'suggestedPrice', amount ?? 0)}
                                  placeholder="0.00"
                                  disabled={!currency}
                                  data-testid={`input-ticket-suggested-${index}`}
                                  className="flex-1"
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-1">Pre-filled default for buyer</p>
                            </div>
                          </div>
                        )}

                        {/* Combi-Ticket: free entry + paid add-on */}
                        {/* Add-on — a toggle on any ticket, not a format of its
                            own. A separate "Combi-Ticket" format would have needed
                            a twin for every combination as more ticket types are
                            added, and it made entry and add-on look like competing
                            purchases when one sits on top of the other. */}
                        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isAddonEnabled(sku)}
                              onChange={(e) => {
                                updateTicketSku(sku.id, 'addonEnabled', e.target.checked);
                                // A legacy Combi-Ticket switched off must not keep
                                // offering its add-on through pricingMode.
                                if (!e.target.checked && sku.pricingMode === 'combi') {
                                  updateTicketSku(sku.id, 'pricingMode', 'free_rsvp');
                                }
                              }}
                              className="mt-0.5 h-4 w-4 accent-primary"
                              data-testid={`checkbox-ticket-addon-enabled-${index}`}
                            />
                            <span className="flex-1">
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                                Add an optional add-on to this ticket
                              </span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                Something extra the participant can choose during checkout — a coffee,
                                a meal. Works on any ticket, free or paid.
                              </span>
                            </span>
                          </label>

                          {isAddonEnabled(sku) && (
                            <div className="mt-3 space-y-3">
                              {/* Path A: the venue published its own prices, so
                                  pick one rather than inventing a number for
                                  someone else's counter. */}
                              {hasVenueAddonCatalog && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
                                  <Label htmlFor={`sku-addon-catalog-${sku.id}`}>
                                    Pick from the venue's own list
                                  </Label>
                                  <p className="mb-2 text-xs text-emerald-800 dark:text-emerald-200">
                                    These are the venue's real counter prices, set by them. Choosing
                                    one fills in the name, the venue price and an opening charge — the
                                    group rate is what you agree with them in the dealroom.
                                  </p>
                                  <Select
                                    value={sku.addonCatalogItemId || ''}
                                    onValueChange={(value) => {
                                      const item = venueAddonCatalog.find((entry: any) => entry.id === value);
                                      if (!item) return;
                                      updateTicketSku(sku.id, 'addonCatalogItemId', item.id);
                                      updateTicketSku(sku.id, 'addonName', item.name);
                                      const venuePrice = Number(item.venuePrice) || 0;
                                      updateTicketSku(sku.id, 'addonVenuePrice', venuePrice);
                                      // Point 34: picking an item used to fill
                                      // the name and leave every price blank,
                                      // so the organiser saw a margin of minus
                                      // the whole item. The venue's published
                                      // group rate is taken where it has one,
                                      // and the charge opens at the counter
                                      // price — the highest it can sensibly be.
                                      const groupRate = Number(item.groupRate ?? item.group_rate) || 0;
                                      updateTicketSku(sku.id, 'addonGroupRate', groupRate > 0 ? groupRate : 0);
                                      updateTicketSku(sku.id, 'addonChargeAmount', venuePrice);
                                    }}
                                  >
                                    <SelectTrigger
                                      id={`sku-addon-catalog-${sku.id}`}
                                      data-testid={`select-ticket-addon-catalog-${index}`}
                                    >
                                      <SelectValue placeholder="Choose an item…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {venueAddonCatalog
                                        .filter((item: any) => item?.active !== false)
                                        .map((item: any) => (
                                          <SelectItem key={item.id} value={item.id}>
                                            {item.name} — {formatPriceByCurrency(Number(item.venuePrice) || 0, currency)}
                                            {item.unit ? ` ${item.unit}` : ''}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  {(() => {
                                    const chosen = venueAddonCatalog.find(
                                      (entry: any) => entry.id === sku.addonCatalogItemId,
                                    );
                                    return chosen?.groupDiscountNote ? (
                                      <p className="mt-2 text-xs font-medium text-emerald-900 dark:text-emerald-100">
                                        Venue's group rate: {chosen.groupDiscountNote}
                                      </p>
                                    ) : null;
                                  })()}
                                </div>
                              )}

                              <div>
                                <Label htmlFor={`sku-addon-name-${sku.id}`}>Add-on Name</Label>
                                <Input
                                  id={`sku-addon-name-${sku.id}`}
                                  value={sku.addonName || ''}
                                  onChange={(e) => updateTicketSku(sku.id, 'addonName', e.target.value)}
                                  placeholder="e.g., Coffee + Medialuna"
                                  data-testid={`input-ticket-addon-name-${index}`}
                                />
                              </div>

                              {/* Path B: no catalog to pick from, so the venue
                                  has not stated a price yet. Say what you expect
                                  people to want and leave the price to them —
                                  they fill it in on their invite page, and can
                                  counter it the same way they counter the ticket
                                  deal. A number you invent for their counter is
                                  a number they have to argue you out of. */}
                              {askVenueForAddonPrice && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                                  <Label htmlFor={`sku-addon-demand-${sku.id}`}>
                                    Expected demand
                                  </Label>
                                  <p className="mb-2 text-xs text-blue-900 dark:text-blue-100">
                                    Roughly how many people you think will want this. The venue is
                                    asked for their real price — and any group rate — when they open
                                    your invite, so you do not have to guess it for them.
                                  </p>
                                  <Input
                                    id={`sku-addon-demand-${sku.id}`}
                                    type="number"
                                    min={0}
                                    className="max-w-40"
                                    placeholder="e.g. 50"
                                    value={sku.addonExpectedDemand || ''}
                                    onChange={(e) =>
                                      updateTicketSku(
                                        sku.id,
                                        'addonExpectedDemand',
                                        // Zero rather than undefined: `updateTicketSku` writes
                                        // whatever it is handed, and an undefined would persist
                                        // the key as literally undefined rather than clearing it.
                                        e.target.value === '' ? 0 : Number(e.target.value),
                                      )
                                    }
                                    data-testid={`input-ticket-addon-demand-${index}`}
                                  />
                                </div>
                              )}

                              {/* ── What it costs, and what you charge ─────
                                  Three numbers, and only one of them is a
                                  decision. The venue price is what a
                                  participant would pay at the bar; the group
                                  rate is what the venue actually charges for a
                                  booked group; the charge is what the
                                  organiser sets. The margin is the difference,
                                  and it is shown rather than entered — an
                                  organiser used to enter a margin and a
                                  direction for it to travel in and then work
                                  backwards to what the participant would see.
                                  Point 46. */}
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <Label htmlFor={`sku-addon-venue-price-${sku.id}`}>Venue price</Label>
                                  <MoneyInput
                                    id={`sku-addon-venue-price-${sku.id}`}
                                    prefix={currencySymbol}
                                    value={sku.addonVenuePrice ?? (sku.addonPrice ?? '')}
                                    onValueChange={(amount) => updateTicketSku(sku.id, 'addonVenuePrice', amount ?? 0)}
                                    placeholder="0.00"
                                    disabled={!currency}
                                    data-testid={`input-ticket-addon-venue-price-${index}`}
                                  />
                                  <p className="mt-1 text-xs text-gray-500">
                                    What a participant would pay at the counter
                                  </p>
                                </div>
                                <div>
                                  <Label htmlFor={`sku-addon-group-rate-${sku.id}`}>
                                    Group rate <span className="text-gray-400">(cost)</span>
                                  </Label>
                                  <MoneyInput
                                    id={`sku-addon-group-rate-${sku.id}`}
                                    prefix={currencySymbol}
                                    value={sku.addonGroupRate ?? ''}
                                    onValueChange={(amount) => updateTicketSku(sku.id, 'addonGroupRate', amount ?? 0)}
                                    placeholder="Same as venue price"
                                    disabled={!currency}
                                    data-testid={`input-ticket-addon-group-rate-${index}`}
                                  />
                                  {/* Never pre-set on a venue's profile: it
                                      depends on the size and the date, so it is
                                      agreed per invite in the dealroom. */}
                                  <p className="mt-1 text-xs text-gray-500">
                                    What the venue charges you, agreed in the dealroom
                                  </p>
                                </div>
                              </div>

                              <div>
                                <Label htmlFor={`sku-addon-charge-${sku.id}`}>
                                  You charge participants
                                </Label>
                                <MoneyInput
                                  id={`sku-addon-charge-${sku.id}`}
                                  prefix={currencySymbol}
                                  className="max-w-[160px] border-indigo-300 bg-indigo-50 font-medium text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
                                  value={sku.addonChargeAmount ?? ''}
                                  onValueChange={(amount) => updateTicketSku(sku.id, 'addonChargeAmount', amount ?? 0)}
                                  placeholder="0.00"
                                  disabled={!currency}
                                  data-testid={`input-ticket-addon-charge-${index}`}
                                />
                              </div>

                              <div>
                                <Label htmlFor={`sku-addon-inventory-${sku.id}`}>
                                  How many available <span className="text-gray-400">(optional)</span>
                                </Label>
                                <Input
                                  id={`sku-addon-inventory-${sku.id}`}
                                  type="number" min="0" step="1"
                                  value={sku.addonInventory ?? ''}
                                  onChange={(e) => updateTicketSku(sku.id, 'addonInventory', parseInt(e.target.value, 10) || 0)}
                                  placeholder="Leave blank for no limit"
                                  data-testid={`input-ticket-addon-inventory-${index}`}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                  Counted apart from attendance — 32 coffees at an event 80 people may attend.
                                </p>
                              </div>

                              {/* The margin, shown rather than entered. */}
                              {(() => {
                                const addon = getTicketAddon({ ...sku, addonEnabled: true });
                                if (!addon) return null;

                                const belowCost = addon.creatorAmount < -0.005;

                                return (
                                  <div className="space-y-2" data-testid={`ticket-addon-breakdown-${index}`}>
                                    <div className={cn(
                                      "flex items-center justify-between rounded-md p-3",
                                      belowCost
                                        ? "bg-red-50 dark:bg-red-950"
                                        : "bg-gray-50 dark:bg-gray-900/50",
                                    )}>
                                      <span className="text-sm text-gray-600 dark:text-gray-300">Your margin</span>
                                      <span className={cn(
                                        "text-sm font-semibold",
                                        belowCost
                                          ? "text-red-700 dark:text-red-300"
                                          : "text-green-700 dark:text-green-400",
                                      )}>
                                        {formatPriceByCurrency(addon.creatorAmount, currency)} / unit
                                      </span>
                                    </div>

                                    {belowCost && (
                                      <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
                                        You are charging less than the venue charges you, so every one
                                        sold costs you money. Raise the charge, or negotiate a lower
                                        group rate on the Partners step.
                                      </p>
                                    )}

                                    {/* The one thing that makes an in-platform
                                        add-on pointless: charging more than the
                                        bar does for the same coffee. */}
                                    {addon.aboveCounterPrice && !belowCost && (
                                      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                                        This is above the venue's own counter price of{' '}
                                        {formatPriceByCurrency(addon.venuePrice, currency)} — a participant
                                        is better off walking up to the bar, and the add-on had no reason
                                        to exist here.
                                      </p>
                                    )}

                                    <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                                      Bundled into the ticket price instead? The margin uses the group
                                      rate as its cost basis either way — one clean price, no visible
                                      per-item markup.
                                    </p>

                                    {/* A margin on a coffee is a margin on a
                                        coffee. An organiser who needs the event
                                        to make money is looking at the wrong
                                        lever, and this is where they are
                                        standing when they realise it. */}
                                    <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                                      Looking for real income rather than a small margin? Negotiate a
                                      Commitment Fee with the venue on the{' '}
                                      <button
                                        type="button"
                                        className="font-medium underline underline-offset-2"
                                        onClick={() => goToStep?.(PARTNERS_STEP_ID)}
                                        data-testid={`link-addon-commitment-fee-${index}`}
                                      >
                                        Partners step
                                      </button>.
                                    </p>

                                    <p className="text-xs text-gray-500">
                                      Venue is paid {formatPriceByCurrency(addon.venueAmount, currency)} per
                                      unit, directly. Calculated separately from your venue commercial deal.
                                    </p>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Deposit (only when MVG is ON and ticket is not free) */}
                        {requireMinimumParticipants && isMultiDayEvent && sku.pricingMode !== 'free_rsvp' && (
                          <div>
                            <Label htmlFor={`sku-deposit-${sku.id}`}>Deposit Per Person</Label>
                            <div className="flex gap-2">
                              <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                                {currency ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}
                              </span>
                              <MoneyInput
                                id={`sku-deposit-${sku.id}`}
                                value={sku.depositPerPerson || ''}
                                onValueChange={(amount) => updateTicketSku(sku.id, 'depositPerPerson', amount ?? 0)}
                                placeholder="0.00"
                                disabled={!currency}
                                data-testid={`input-ticket-deposit-${index}`}
                                className="flex-1"
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Fixed amount captured upfront (not %)</p>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center pt-2 border-t text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Subtotal Revenue</span>
                          <span className="font-semibold text-green-700 dark:text-green-400" data-testid={`ticket-sku-revenue-${index}`}>
                            {formatPriceByCurrency(skuRevenue, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total Revenue Summary */}
                <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Capacity</span>
                      <span className="font-medium" data-testid="text-total-capacity">{ticketTotalCapacity} people</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-700 dark:text-green-400">
                      <span>Total Revenue Potential</span>
                      {/* totalRevenue, not the raw ticket sum: it falls back to
                          price × capacity when no ticket carries its own. */}
                      <span data-testid="text-total-revenue">{formatPriceByCurrency(totalRevenue, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                {isMultiDayEvent && !hasRooms ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 Define rooms in the Rooms step to automatically generate ticket types, or set max participants in the Dates step.
                  </p>
                ) : isNonRoomEvent && maxParticipants === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 Enter the number of available spots above to generate a General Admission ticket.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 No ticket types available. Please configure your event details first.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* **3. MARKETPLACE ECONOMICS — The Digital Handshake** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Commercial Model
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Platform fee, venue commercial terms, and creator earnings are estimated from your ticket setup.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Expected turnout.
                Useful everywhere as a pitch detail, load-bearing in exactly two
                places. Revenue Split, Ticket Deduction and Commitment Fee + Rev
                Split all settle against tickets actually sold, so an optimistic
                number there costs the venue nothing. Venue Sponsorship and
                Upfront Rental have no such correction — the venue commits a flat
                amount against this promise and nothing else — so the field grows
                a border and a warning when either is selected. */}
            <div
              className={
                turnoutIsLoadBearing
                  ? 'rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950'
                  : 'rounded-lg border p-4'
              }
            >
              <Label htmlFor="expected-audience-size">
                Expected turnout {turnoutIsLoadBearing && <span aria-hidden>*</span>}
              </Label>
              <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
                {turnoutIsLoadBearing
                  ? `${getVenueDealLabel(activeVenueDeal, dealCurrencySymbol)} pays the venue a flat amount whatever happens on the day. This number is the only thing they have to judge that against, so it has to be one you would defend.`
                  : 'How many people you genuinely expect. Shown to a venue as context for your pitch — the deal you have chosen settles against tickets actually sold, so this does not change what anyone is paid.'}
              </p>
              <Input
                id="expected-audience-size"
                type="number"
                min={0}
                className="max-w-40"
                placeholder="e.g. 40"
                value={form.watch('expectedAudienceSize') ?? ''}
                onChange={(event) =>
                  form.setValue(
                    'expectedAudienceSize',
                    event.target.value === '' ? null : Number(event.target.value),
                    { shouldDirty: true },
                  )
                }
                data-testid="input-expected-audience-size"
              />
              {turnoutIsLoadBearing && !form.watch('expectedAudienceSize') && (
                <p
                  className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-100"
                  data-testid="warning-expected-turnout-required"
                >
                  Add a number before you send this. A flat commitment with no expected
                  turnout beside it is a figure the venue cannot say yes or no to.
                </p>
              )}
            </div>
            {/* ── Target deal per partner ──────────────────────────────────
                Only renders a card for a party actually on the event. One with
                none shows nothing here — not five greyed-out placeholders for
                Venue / Community / Sponsor / Service Provider / Affiliate
                implying something is missing, which is what made a one-deal
                event look half-finished. */}
            {hasCommercialModel && (
              <div className="rounded-lg border p-4" data-testid="partner-deal-grid">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Target deal per partner
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {hasPaidTicket
                    ? "Only Revenue Split / Commission per Ticket pulls from the ticket revenue below — barter and flat-fee partners settle separately."
                    /* Point 42: with nothing priced, a percentage of ticket
                       revenue is a percentage of nothing, and saying so is more
                       use than showing the field and letting the organiser
                       wonder why the total never moves. */
                    : "This event has no paid ticket, so nothing here can take a share of ticket revenue — every deal below settles outside ticket sales."}
                </p>

                {/* ── Grouped by how each deal settles ──────────────────
                    This IS a grid, unlike the Partners-step rows, and that
                    is exactly why the grouping matters: "15%", "€100" and
                    "product for exposure" sitting side by side in a
                    two-column layout read as three comparable numbers, and
                    cards of wildly different shapes sit jaggedly beside
                    each other. Grouped by tier they are comparable within
                    a group and never compared across one. Point 47. */}
                {DEAL_TIERS.map((tier) => {
                  const entries = pricingTierGroups[tier.id];
                  if (!entries.length) return null;
                  return (
                    <div key={tier.id} className="mt-3" data-testid={`pricing-tier-${tier.id}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {tier.glyph} {tier.label}
                      </p>
                      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {entries.map((entry) => (
                          <div
                            key={entry.key}
                            className={cn(
                              "rounded-lg border p-3",
                              entry.pullsFromTickets
                                ? "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40"
                                : "opacity-70",
                            )}
                            data-testid={`pricing-partner-card-${entry.key}`}
                          >
                            <p className={cn(
                              "text-xs font-semibold",
                              entry.pullsFromTickets
                                ? "text-indigo-900 dark:text-indigo-100"
                                : "text-gray-900 dark:text-white",
                            )}>
                              {entry.title}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">
                              Brings: {entry.brings}
                            </p>
                            <p className={cn(
                              "text-xs",
                              entry.pullsFromTickets
                                ? "text-indigo-800 dark:text-indigo-200"
                                : "text-gray-500",
                            )}>
                              {entry.terms}
                            </p>

                            {/* One percentage field per ticket-revenue
                                partner, editable here so the organiser sets
                                every number that moves the total in one
                                place. The venue's own number is not among
                                them: it is set on Partners now, with the
                                rest of its deal. */}
                            {entry.partner && entry.pullsFromTickets && hasPaidTicket && (
                              <div className="mt-2 flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  aria-label={`${entry.partner.name} share of ticket revenue`}
                                  value={entry.partner.terms?.commissionPct ?? ''}
                                  onChange={(e) => setPartnerSharePct(
                                    entry.partner!.id,
                                    e.target.value ? parseFloat(e.target.value) : 0,
                                  )}
                                  className="h-8 max-w-[90px]"
                                  data-testid={`input-partner-share-${entry.partner.id}`}
                                />
                                <span className="text-xs text-indigo-900 dark:text-indigo-100">
                                  % of ticket revenue
                                </span>
                              </div>
                            )}

                            {entry.key === 'venue' && (
                              <button
                                type="button"
                                className="mt-2 text-xs font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
                                onClick={() => goToStep?.(PARTNERS_STEP_ID)}
                                data-testid="link-venue-card-edit-on-partners"
                              >
                                Edit on Partners ›
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* The existing under-100% rule, applied to everyone rather
                    than to the venue alone. A deal that cannot be paid is worth
                    saying so here, where the numbers are typed. */}
                {ticketTakeExceedsGross && (
                  <div
                    className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                    data-testid="warning-partner-shares-exceed-gross"
                  >
                    <strong className="block mb-1">These shares add up to more than the tickets earn</strong>
                    Partners, the venue and the {platformPct}% platform fee come to{' '}
                    {Math.round(totalTicketTakePct * 10) / 10}% of ticket revenue between
                    them, which leaves you nothing. Lower a share before you send this.
                  </div>
                )}
              </div>
            )}

            {/* With no ticket-revenue partner and no venue percentage, the
                Commercial Model is just the platform fee — and says so, instead
                of leaving an empty revenue-share row the organiser wonders
                about. */}
            {hasCommercialModel && ticketRevenuePartners.length === 0
              && venueCompensationModel !== "revenue_share"
              && venueCompensationModel !== "commitment_plus_revenue_share" && (
              <p
                className="text-xs text-gray-500"
                data-testid="text-no-revenue-share-partners"
              >
                Nobody on this event takes a cut of ticket revenue, so the only
                deduction below is the {platformPct}% platform fee. Your partners
                are all settled outside ticket sales.
              </p>
            )}


            {/* Split grid: Platform (fixed) | Space | Creator */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="platform-pct-display">Platform Fee (%)</Label>
                <Input
                  id="platform-pct-display"
                  type="number"
                  value={platformPct}
                  readOnly
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  data-testid="input-platform-pct"
                />
                <p className="text-xs text-gray-500 mt-1">Fixed — set by platform</p>
              </div>
              {/* ── The venue's deal, as a result ─────────────────────────
                  Point 40: this used to be the one place the venue's terms
                  were typed, several screens from every other partner's. The
                  inputs moved to the Partners step, where the rest of the
                  event's deals are agreed; what is left here is what the deal
                  comes to, which is the only part that belongs beside a
                  calculator. */}
              {venueDealContext === "external" ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                  No venue commercial deal is required for this outdoor or virtual event.
                </div>
              ) : (
                <div data-testid="venue-deal-summary">
                  <Label>
                    {venueDealContext === "invited"
                      ? "Target deal (proposed to your venue)"
                      : venueDealContext === "open"
                        ? "Target deal (what you are looking for)"
                        : "Venue commercial deal"}
                  </Label>
                  <div className="mt-1 rounded-lg border p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activeVenueDeal
                        ? summariseVenueDeal({
                            model: activeVenueDeal,
                            mode: (venueDealContext === "open" || venueDealContext === "invited")
                              ? "target"
                              : "settled",
                            currencySymbol: dealCurrencySymbol,
                            revenueSharePct: venueRevenueSharePct,
                            fixedFee: venueFixedFee,
                            perHeadAmount: venuePerHeadAmount,
                            perRoomPerNight: venuePerRoomPerNight,
                            commitmentFee: form.watch('venueCommitmentFee'),
                            barterTerms: form.watch('venueBarterTerms'),
                            targetValue: venueTargetDealValue,
                          })
                        : "No deal set yet"}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
                      onClick={() => goToStep?.(PARTNERS_STEP_ID)}
                      data-testid="link-edit-venue-deal-on-partners"
                    >
                      Edit on Partners ›
                    </button>
                  </div>
                  {dealMechanics && (
                    <p
                      className="mt-2 rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      data-testid="text-deal-mechanics-venue"
                    >
                      {dealMechanics}
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="creator-pct">Creator Net Before Venue Terms (%)</Label>
                <Input
                  id="creator-pct"
                  type="number"
                  min="0"
                  max={100 - FIXED_PLATFORM_FEE_PCT}
                  value={creatorPct}
                  readOnly
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  data-testid="input-creator-pct"
                />
                {isCommissionPromotion && influencerCommissionPct > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Participant cashback ({influencerCommissionPct}%) from the Promotion step is deducted from your share.
                  </p>
                )}
              </div>
            </div>


            {venueDealContext === "open" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100">
                <strong>Venue Pending:</strong> Your event will publish to the platform. Venues matching your city and space type will be able to discover and bid to host it. Once a venue accepts, their deal terms are locked into the payment flow.
              </div>
            )}

            {venueDealContext === "invited" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100">
                <strong>Invite Pending:</strong> Your proposed deal will be sent to the venue you invited. Once they accept, their deal terms are locked into the payment flow.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {venueDealContext === "external"
                ? "Only the fixed 15% platform infrastructure fee is applied in Great."
                : (venueDealContext === "open" || venueDealContext === "invited")
                  ? "Actual venue payout will be determined when a venue accepts your offer."
                  : "Venue compensation is negotiated separately from the 15% platform infrastructure fee."}
            </p>

            {/* ── One calculator ────────────────────────────────────────────
                Preview, comparison and break-even were three separate things
                an organiser had to assemble in their head. They are the same
                arithmetic asked three ways, so they are one panel: what this
                event nets, how many people it takes to stop losing money, and
                what the same event would net with free entry instead.
                Point 48.

                Every row comes out of the same breakdown the total does, and
                the total is defined as their sum — a row the calculator shows
                can never fail to move the figure underneath it. */}
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h4 className="font-medium text-green-900 dark:text-green-100">Estimated Grand Total Calculator</h4>
                {/* Only offered where it means something: an event with no
                    paid ticket is already the free case. */}
                {hasPaidTicket && (
                  <div
                    role="radiogroup"
                    aria-label="Ticket policy to preview"
                    className="inline-flex rounded-full bg-white/70 p-1 dark:bg-black/30"
                  >
                    {([
                      { value: 'paid' as const, label: 'Paid' },
                      { value: 'free' as const, label: 'Free RSVP' },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={calculatorMode === option.value}
                        onClick={() => setCalculatorMode(option.value)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          calculatorMode === option.value
                            ? "bg-indigo-600 text-white"
                            : "text-green-900 dark:text-green-100",
                        )}
                        data-testid={`calculator-mode-${option.value}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Every figure here assumes the event sells out and everyone
                  takes the add-on. Read as a committed number it is a promise
                  the event has not made. */}
              <p className="text-xs text-green-800/80 dark:text-green-200/80 mb-2" data-testid="text-revenue-potential-caveat">
                {calculatorMode === 'free'
                  ? 'The same event with free entry, at full capacity and full add-on uptake.'
                  : `Potential at full capacity${addOnCreatorMargin > 0 || addOnVenueRevenue > 0 ? " and full add-on uptake" : ""} — not a guarantee.`}
              </p>
              <div className="text-sm space-y-1">
                {/* Grouped the same three ways the Commercial Model is, so a
                    percentage and a flat fee are never read as one column of
                    comparable numbers. */}
                {CALCULATOR_TIERS.map((tier) => {
                  const rows = shownEconomics.lines.filter((line) => line.tier === tier.id);
                  if (!rows.length) return null;
                  return (
                    <div key={tier.id} data-testid={`economics-tier-${tier.id}`}>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-green-800/60 dark:text-green-200/50">
                        {tier.label}
                      </p>
                      {rows.map((line) => (
                        <div className="flex justify-between" key={line.key} data-testid={`text-economics-${line.key}`}>
                          <span>{line.label}</span>
                          <span
                            className={
                              line.kind === "gross"
                                ? "font-medium"
                                : line.amount > 0
                                  ? "text-green-600 font-medium"
                                  : line.amount < 0
                                    ? (line.kind === "promotion" ? "text-amber-600" : "text-red-600")
                                    : ""
                            }
                          >
                            {line.kind === "gross" ? "" : line.amount > 0 ? "+" : line.amount < 0 ? "-" : ""}
                            {formatPriceByCurrency(Math.abs(line.amount), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {revenueSummary.hasFreeTickets && (
                  <p className="text-xs text-gray-500" data-testid="text-free-tickets-note">
                    Paid tickets only — {paidTicketCapacity} of {ticketTotalCapacity} spots.
                    Free RSVPs are attendance, not revenue, so no venue deal is charged on them.
                  </p>
                )}

                {/* The fee is charged on everything that reaches the organiser
                    through the platform, not on ticket sales alone. Stated
                    because an organiser reading a single fee line against a
                    single gross line will otherwise assume the difference is
                    an error. */}
                {economics.platformFee > 0 && economics.platformFeeBase > totalRevenue && (
                  <p className="text-xs text-gray-500" data-testid="text-platform-fee-base">
                    The {platformPct}% fee applies to everything that reaches you through the
                    platform — ticket revenue, your add-on margin
                    {economics.venueContribution > 0 ? ", and what the venue pays you" : ""} —
                    a base of {formatPriceByCurrency(economics.platformFeeBase, currency)}.
                  </p>
                )}

                <div className="border-t pt-1 flex justify-between font-semibold text-green-700 dark:text-green-300">
                  <span>Net to you</span>
                  <span
                    className={shownEconomics.net < 0 ? 'text-red-600 dark:text-red-400' : undefined}
                    data-testid="text-your-payout"
                  >
                    {shownEconomics.net < 0 ? '-' : ''}{formatPriceByCurrency(Math.abs(shownEconomics.net), currency)}
                  </span>
                </div>

                {/* ── Break-even ─────────────────────────────────────────
                    Walked out of the same function the rows come from, so it
                    can never disagree with them. The figure an organiser is
                    actually deciding on: not what a sell-out pays, but how
                    many people have to turn up before the evening stops
                    costing them money. */}
                {shownEconomics.net < 0 && breakEvenAttendance !== null && breakEvenAttendance > 0 && (
                  <div
                    className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                    data-testid="text-break-even"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Break even at ~{breakEvenAttendance} attendee{breakEvenAttendance === 1 ? '' : 's'}.
                  </div>
                )}
                {shownEconomics.net < 0 && breakEvenAttendance === null && (
                  <div
                    className="mt-2 flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-2 text-xs text-red-900 dark:bg-red-950 dark:text-red-100"
                    data-testid="text-break-even"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    A full house still does not cover these terms. Lower a cost or raise the price.
                  </div>
                )}

                {/* ── The comparison ─────────────────────────────────────
                    A free RSVP with a paid add-on beats a cheap ticket more
                    often than anyone expects, because the venue deal is
                    charged against ticket revenue and there is none. Offered
                    only when it is actually the better of the two — otherwise
                    it is a suggestion to earn less. */}
                {hasPaidTicket && calculatorMode === 'paid' && freeRsvpEconomics.net > economics.net && (
                  <button
                    type="button"
                    onClick={() => setCalculatorMode('free')}
                    className="mt-2 block w-full rounded-md bg-white/70 px-3 py-2 text-left text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300"
                    data-testid="text-free-rsvp-comparison"
                  >
                    ↔ Free RSVP{addOnCreatorMargin > 0 ? ' + add-on' : ''} would net{' '}
                    <strong>{formatPriceByCurrency(freeRsvpEconomics.net, currency)}</strong> at{' '}
                    {calculatorCapacity} — switch to compare
                  </button>
                )}
                {calculatorMode === 'free' && (
                  <button
                    type="button"
                    onClick={() => setCalculatorMode('paid')}
                    className="mt-2 block w-full rounded-md bg-white/70 px-3 py-2 text-left text-xs text-gray-600 dark:bg-black/30 dark:text-gray-300"
                    data-testid="text-paid-comparison"
                  >
                    ↔ Your priced tickets net{' '}
                    <strong>{formatPriceByCurrency(economics.net, currency)}</strong> at the same
                    turnout — switch back
                  </button>
                )}

                {/* The venue's own price for the add-on. Kept out of the split —
                    the venue is paid for it directly, and no platform fee is
                    taken from it, because the whole point of the venue price is
                    that the participant is not charged more here than at the
                    venue's own counter. */}
                {addOnVenueRevenue > 0 && (
                  <div
                    className="mt-2 border-t pt-2 flex justify-between text-xs text-gray-600 dark:text-gray-400"
                    data-testid="text-addon-revenue"
                  >
                    <span>Venue keeps (add-ons, paid directly — not split)</span>
                    <span>{formatPriceByCurrency(addOnVenueRevenue, currency)}</span>
                  </div>
                )}

                {/* Two calculations, not one. Adding an add-on never changes
                    how the ticket-level deal is worked out. */}
                {(addOnVenueRevenue > 0 || addOnCreatorMargin > 0) && activeVenueDeal && (
                  <p className="text-xs text-gray-500" data-testid="text-addon-independent-note">
                    Add-ons are calculated separately from your{' '}
                    {getVenueDealLabel(activeVenueDeal, dealCurrencySymbol)} deal — the deal
                    applies to ticket revenue only, never to add-ons.
                  </p>
                )}
              </div>
            </div>

            {/* A deal the event cannot pay for used to show only as a quietly
                negative net — which reads as a rounding oddity, not as terms
                that can never be honoured. */}
            {venuePayoutCap.exceedsGross && (
              <div
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                data-testid="warning-venue-payout-exceeds-gross"
              >
                <strong className="block mb-1">This deal costs more than the event earns</strong>
                The venue's {formatPriceByCurrency(venuePayoutCap.venueCost, currency)} plus the{' '}
                {platformPct}% platform fee ({formatPriceByCurrency(venuePayoutCap.platformFee, currency)}){' '}
                comes to {venuePayoutCap.totalTakePct}% of {formatPriceByCurrency(totalRevenue, currency)}{' '}
                in ticket sales, leaving you {formatPriceByCurrency(venuePayoutCap.creatorNet, currency)}{' '}
                on ticket sales.
                Lower the venue's terms or raise your ticket price before sending this.
              </div>
            )}

            {/* The matrix's own exclusions, shown where the numbers were typed
                rather than saved up for the publication checklist. */}
            {dealTermIssues.map((issue) => (
              <div
                key={issue.key}
                className={
                  issue.severity === 'block'
                    ? 'rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
                    : 'rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
                }
                data-testid={`deal-term-issue-${issue.key}`}
              >
                <strong className="block mb-1">
                  {issue.severity === 'block' ? 'These terms cannot work' : 'Worth protecting yourself'}
                </strong>
                {issue.message}
                {issue.key === 'fixed_cost_deal_without_mvg' && (
                  <button
                    type="button"
                    className="mt-2 block font-medium underline underline-offset-2"
                    onClick={() => form.setValue('requireMinimumParticipants', true, { shouldDirty: true })}
                    data-testid="button-enable-mvg-from-deal-warning"
                  >
                    Turn on Minimum Viable Group
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* **4. MVG + SOFT-HOLD**
          Off on most events, and a full panel of thresholds and hold windows
          for one that does not use it is the kind of thing that makes a
          two-field event feel like a form. Point 50. */}
      <MinimalSection
        title="Minimum Viable Group & Reservations"
        addLabel="Require a minimum group before this goes ahead"
        hint="Only proceeds if enough people book. Deposits are held, not taken."
        isEmpty={!requireMinimumParticipants && !softHoldEnabled}
        onAdd={() => form.setValue('requireMinimumParticipants', true, { shouldDirty: true })}
        testId="section-mvg"
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Minimum Viable Group & Reservations
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Day events and trips can require a minimum number of bookings before the experience proceeds.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="mvg-enabled">Require Minimum Participants</Label>
                  <p className="text-xs text-gray-500">
                    {isEventType(eventType)
                      ? "Event only proceeds if enough people book for food and space prep"
                      : "Experience only proceeds if minimum bookings are met"}
                  </p>
                </div>
                <Switch
                  id="mvg-enabled"
                  checked={requireMinimumParticipants}
                  onCheckedChange={(checked) => form.setValue('requireMinimumParticipants', checked, { shouldDirty: true })}
                  data-testid="switch-mvg-enabled"
                />
              </div>
              
              {requireMinimumParticipants && (
                <div className="space-y-4 ml-4 border-l-2 border-gray-200 pl-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="minimum-participants">Minimum Participants</Label>
                      <Input
                        id="minimum-participants"
                        type="number"
                        min="2"
                        max={ticketTotalCapacity > 0 ? ticketTotalCapacity : 50}
                        value={minimumParticipants}
                        onChange={(e) => form.setValue('minimumParticipants', parseInt(e.target.value) || 2, { shouldDirty: true, shouldValidate: true })}
                        aria-invalid={mvgExceedsTicketCapacity}
                        data-testid="input-minimum-participants"
                      />
                      {mvgExceedsTicketCapacity && (
                        <p className="text-xs text-red-600 mt-1" data-testid="error-mvg-capacity">
                          MVG cannot exceed the total ticket capacity of {ticketTotalCapacity}.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="mvg-deadline-days">Deadline (Days Before Start)</Label>
                      <Input
                        id="mvg-deadline-days"
                        type="number"
                        min="0"
                        max="30"
                        placeholder="7"
                        value={form.watch('mvgDeadlineDays')}
                        onChange={(e) => {
                          const parsedDays = Number.parseInt(e.target.value, 10);
                          const days = Number.isFinite(parsedDays) ? Math.max(0, parsedDays) : 7;
                          form.setValue('mvgDeadlineDays', days, { shouldDirty: true });
                          const startDate = form.getValues('startDate');
                          if (startDate) {
                            const deadlineDate = new Date(startDate);
                            deadlineDate.setDate(deadlineDate.getDate() - days);
                            deadlineDate.setHours(23, 59, 59, 999);
                            form.setValue('mvgDeadline', deadlineDate, { shouldDirty: true });
                          }
                        }}
                        data-testid="input-mvg-deadline-days"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        0 means the MVG remains open through the end of the start day
                      </p>
                    </div>
                  </div>

                  {/* Payment Timing Model — only shown when MVG is active */}
                  <div>
                    <Label htmlFor="mvg-payment-timing">Payment Timing Model</Label>
                    <select
                      id="mvg-payment-timing"
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      value={softHoldEnabled ? "soft_hold" : "immediate"}
                      onChange={(e) => {
                        const isSoftHold = e.target.value === "soft_hold";
                        form.setValue('softHoldEnabled', isSoftHold, { shouldDirty: true });
                        if (isSoftHold) {
                          form.setValue('softHoldDurationHours', 720, { shouldDirty: true }); // 30 days default when tied to MVG
                        }
                      }}
                      data-testid="select-mvg-payment-timing"
                    >
                      <option value="immediate">Charge immediately on booking (refund if MVG fails)</option>
                      <option value="soft_hold">Soft-hold — charge only when MVG is confirmed</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {softHoldEnabled
                        ? "Participants reserve their spot for free. Payment is collected once the minimum group size is confirmed."
                        : "Participants pay in full at booking. If the minimum group is not reached by the deadline, everyone is automatically refunded."}
                    </p>
                  </div>

                  {/* MVG Progress Bar */}
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Current Progress</span>
                      <span>{mvgProgress.current} / {mvgProgress.minimum}</span>
                    </div>
                    <Progress value={mvgProgress.percentage} className="w-full" data-testid="progress-mvg" />
                    <p className="text-xs text-gray-600 mt-1">
                      {mvgProgress.isMet ? '✅ Minimum reached!' : `${mvgProgress.minimum - mvgProgress.current} more bookings needed`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Soft-Hold Settings — shown only when MVG is OFF (standalone soft-hold without a group threshold) */}
            {!requireMinimumParticipants && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="soft-hold-enabled">Soft-Hold Reservations</Label>
                  <p className="text-xs text-gray-500">Allow temporary reservations before payment</p>
                </div>
                <Switch
                  id="soft-hold-enabled"
                  checked={softHoldEnabled}
                  onCheckedChange={(checked) => form.setValue('softHoldEnabled', checked, { shouldDirty: true })}
                  data-testid="switch-soft-hold-enabled"
                />
              </div>

              {softHoldEnabled && (
                <div className="ml-4 border-l-2 border-gray-200 pl-4">
                  <Label htmlFor="soft-hold-duration">Hold Duration (Hours)</Label>
                  <Input
                    id="soft-hold-duration"
                    type="number"
                    min="1"
                    max="168"
                    value={softHoldDurationHours}
                    onChange={(e) => form.setValue('softHoldDurationHours', parseInt(e.target.value) || 48, { shouldDirty: true })}
                    data-testid="input-soft-hold-duration"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How long reservations are held before expiring (1-168 hours)
                  </p>
                </div>
              )}
            </div>
            )}
          </div>
        </CardContent>
      </Card>
      </MinimalSection>

      {/* **5. INFLUENCER COMMISSION POOL** */}
      {false && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Influencer Promotion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="influencer-enabled">Enable Participant Cashback</Label>
                  <p className="text-xs text-gray-500">Attach a cashback perk to attendee referral links</p>
                </div>
                <Switch
                  id="influencer-enabled"
                  checked={influencerPromotionEnabled}
                  onCheckedChange={(checked) => form.setValue('participantReferralDealType', checked ? 'commission_per_ticket' : null, { shouldDirty: true })}
                  data-testid="switch-influencer-enabled"
                />
              </div>
              
              {influencerPromotionEnabled && (
                <div className="ml-4 border-l-2 border-gray-200 pl-4 space-y-4">
                  <div>
                    <Label htmlFor="influencer-commission">Cashback Percentage (%)</Label>
                    <Input
                      id="influencer-commission"
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={influencerCommissionPct}
                      onChange={(e) => form.setValue('participantReferralCommissionPct', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                      data-testid="input-influencer-commission"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Cashback paid to participants per successful friend booking (0-50%)
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded text-sm">
                    <p className="text-purple-700 dark:text-purple-300">
                      Participant referral links use B2C cashback language in Rewards & Referrals.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* **6. DISCOUNTS SYSTEM**
          Most events run one price. A full panel of discount types, validity
          windows and capacity caps for an event with no discount is exactly
          the kind of thing point 50 is about. */}
      <MinimalSection
        title="Discounts"
        addLabel="Add a discount"
        hint="Early bird, a capacity-capped rate, a code for a partner's list."
        isEmpty={discounts.length === 0}
        onAdd={addDiscount}
        testId="section-discounts"
      >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge className="w-5 h-5" />
            Discount Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Create promotional discounts for your experience</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={addDiscount}
                data-testid="button-add-discount"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Discount
              </Button>
            </div>
            
            {discounts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Badge className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No discounts created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {discounts.map((discount: any, index: number) => (
                  <div key={discount.id} className="border rounded-lg p-4" data-testid={`discount-${index}`}>
                    <div className="flex justify-between items-start mb-4">
                      <h5 className="font-medium">Discount {index + 1}</h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDiscount(discount.id)}
                        data-testid={`button-remove-discount-${index}`}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`discount-title-${discount.id}`}>Title</Label>
                          <Input
                            id={`discount-title-${discount.id}`}
                            placeholder="e.g., Early Bird Special"
                            value={discount.title}
                            onChange={(e) => updateDiscount(discount.id, 'title', e.target.value)}
                            data-testid={`input-discount-title-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-type-${discount.id}`}>Type</Label>
                          <Select 
                            value={discount.type} 
                            onValueChange={(value) => updateDiscount(discount.id, 'type', value)}
                          >
                            <SelectTrigger data-testid={`select-discount-type-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor={`discount-value-${discount.id}`}>
                            Value {discount.type === 'percentage' ? '(%)' : `(${currency ? CURRENCY_CONFIG[String(currency).toLowerCase() as keyof typeof CURRENCY_CONFIG]?.symbol : '$'})`}
                          </Label>
                          <MoneyInput
                            id={`discount-value-${discount.id}`}
                            value={discount.value}
                            onValueChange={(amount) => updateDiscount(discount.id, 'value', amount ?? 0)}
                            data-testid={`input-discount-value-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-valid-until-${discount.id}`}>Valid Until (Optional)</Label>
                          <Input
                            id={`discount-valid-until-${discount.id}`}
                            type="date"
                            value={discount.validUntil || ''}
                            onChange={(e) => updateDiscount(discount.id, 'validUntil', e.target.value)}
                            data-testid={`input-discount-valid-until-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-capacity-cap-${discount.id}`}>Capacity Cap (Optional)</Label>
                          <Input
                            id={`discount-capacity-cap-${discount.id}`}
                            type="number"
                            min="1"
                            placeholder="e.g., 10"
                            value={discount.capacityCap || ''}
                            onChange={(e) => updateDiscount(discount.id, 'capacityCap', e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid={`input-discount-capacity-cap-${index}`}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {priceSource.source === 'rooms' && skus.length > 0 && (
                          <div>
                            <Label htmlFor={`discount-sku-${discount.id}`}>Apply to SKU (Optional)</Label>
                            <Select 
                              value={discount.skuId || 'all'} 
                              onValueChange={(value) => updateDiscount(discount.id, 'skuId', value === 'all' ? undefined : value)}
                            >
                              <SelectTrigger data-testid={`select-discount-sku-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Room Types</SelectItem>
                                {skus.map((sku) => (
                                  <SelectItem key={sku.id} value={sku.id}>
                                    {sku.name} (×{sku.quantity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`discount-active-${discount.id}`}
                            checked={discount.active}
                            onCheckedChange={(checked) => updateDiscount(discount.id, 'active', checked)}
                            data-testid={`switch-discount-active-${index}`}
                          />
                          <Label htmlFor={`discount-active-${discount.id}`}>Active</Label>
                        </div>
                      </div>
                    </div>
                    
                    {/* Discount Preview */}
                    {discount.title && discount.value > 0 && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Preview: {discount.title} - {discount.type === 'percentage' ? `${discount.value}% off` : `${formatPriceByCurrency(discount.value, currency)} off`}
                        </p>
                      </div>
                    )}

                    {/* How anyone actually gets this discount.
                        Setting one up used to produce nothing you could give to
                        a person — no code, no link. A link rather than a code,
                        because the first real user who wanted one wanted
                        something to forward to friends. */}
                    <div className="mt-4">
                      <Label className="mb-2 block text-sm">Shareable link</Label>
                      <DiscountLinkManager
                        experienceId={experienceId}
                        discountId={discount.id}
                        discountTitle={discount.title}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </MinimalSection>

      {/* Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
        <CardContent className="p-6">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">
            Your Deal Summary
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Currency:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">{currency?.toUpperCase() || 'Not set'}</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Platform fee:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">{platformPct}%</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Your share:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">{creatorPct}%</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Venue deal:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">
                {venueDealSummaryLabel}
                {activeVenueDeal === "revenue_share" && activeRevenueSharePct
                  ? ` — ${activeRevenueSharePct}% to venue`
                  : ""}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TermsStep({ form }: { form: any }) {
  const formData = form.watch();
  const { toast } = useToast();

  // Currency symbol helper
  // DATA CONTRACT: Default to EUR for display consistency
  const getCurrencySymbol = (currency: string | null | undefined): string => {
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
    };
    const code = currency?.toUpperCase() || 'EUR';
    return symbols[code] || code + ' ';
  };

  const currencySymbol = getCurrencySymbol(formData.currency);
  // Read from the ticket types, not the deprecated experience-level price: a
  // free ticket alongside a paid one drove that field to zero and the summary
  // then advertised a 100 event as free. Quote the cheapest PAID ticket, and
  // say "From" when the prices differ.
  const summaryTicketSkus = Array.isArray(formData.ticketSkus) ? formData.ticketSkus : [];
  const summaryPaidPrices = summaryTicketSkus
    .map((sku: any) => getSkuEntryPrice(sku))
    .filter((price: number) => price > 0);
  const lowestPaidPrice = summaryPaidPrices.length
    ? Math.min(...summaryPaidPrices)
    : Number(formData.pricePerPerson || formData.price || 0);
  const hasMixedPrices = summaryPaidPrices.length > 0
    && (summaryPaidPrices.length < summaryTicketSkus.length
      || Math.max(...summaryPaidPrices) !== lowestPaidPrice);
  const displayPrice = lowestPaidPrice;

  return (
    <div className="space-y-8">
      {/* Final Review Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Ready to Submit Your Experience
            </h3>
            <p className="text-blue-800 dark:text-blue-200 text-sm mb-4">
              Review your experience details and accept our terms to submit for approval.
            </p>
            
            {/* Quick Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Experience:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">{formData.title || "Untitled"}</span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Category:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200 capitalize">
                  {formData.category?.replace('_', ' & ') || "Not set"}
                </span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Capacity:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">{formData.maxParticipants || 0} participants</span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Base Price:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">
                  {hasMixedPrices ? "From " : ""}{currencySymbol}{displayPrice}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Terms & Conditions */}
      <div className="space-y-6">
        <h4 className="font-semibold text-gray-900 dark:text-white">Platform Terms & Conditions</h4>
        
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h5 className="font-medium text-gray-900 dark:text-white mb-4">
            Great App - Terms and Conditions
          </h5>

          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-4 max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 rounded border">
            <p><strong>1. Experience Creation & Publishing</strong></p>
            <p>Great App is an intermediary and technology provider — we do not organise, host, or execute your experience. By publishing, you confirm that you have the right to offer this experience, that all information provided is accurate, and that the safety, quality, marketing, and fulfilment of the experience are your sole responsibility.</p>

            <p><strong>2. Payment Processing</strong></p>
            <p>Payments are processed securely through Stripe in Euros. You authorise us to collect ticket revenue on your behalf and to deduct platform fees and processing charges before payout.</p>

            <p><strong>3. Refunds</strong></p>
            <p>Platform ticket sales are final. If you offer a custom cancellation/refund policy in your Custom Terms, you are solely responsible for managing and issuing those refunds directly.</p>

            <p><strong>4. Content Guidelines</strong></p>
            <p>All experience content must be accurate, lawful, and free of misleading claims. We may edit, remove, or unpublish content that breaches these terms, and may suspend accounts that do.</p>

            <p><strong>5. Liability & Insurance</strong></p>
            <p>You are responsible for appropriate insurance coverage, permits, and safety measures for your experiences, and you indemnify Great App against claims arising from them.</p>

            <p><strong>6. Revenue & Payouts</strong></p>
            <p>Platform fees are deducted from gross revenue before payouts, and revenue splits agreed with venues, promoters, and service providers are settled automatically. Processing transactions or revenue splits outside the platform to avoid fees is prohibited.</p>
          </div>

          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
            data-testid="link-full-platform-terms"
          >
            Read the full Great App Terms and Conditions
          </a>
        </div>
      </div>

      {/* Custom Experience Terms & Conditions */}
      <div className="space-y-6">
        <h4 className="font-semibold text-gray-900 dark:text-white">Your Experience Terms & Conditions (Optional)</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add your specific terms, cancellation policies, and conditions that participants must agree to when booking this experience.
        </p>
        
        {/* Editable Custom Terms Text Area */}
        <FormField
          control={form.control}
          name="customTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Terms & Conditions</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  placeholder="Enter your custom terms and conditions here...

Example sections:
• Cancellation Policy: ...
• Refund Policy: ...
• What's Included: ...
• What's Not Included: ...
• Participant Requirements: ...
• Safety Guidelines: ...
• Liability Waiver: ..."
                  className="w-full min-h-[200px] p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-y focus:ring-2 focus:ring-primary focus:border-transparent"
                  data-testid="textarea-custom-terms"
                />
              </FormControl>
              <FormDescription>
                These terms will be displayed to participants during checkout. Leave blank to use only platform terms.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* OR Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-gray-500">OR upload a PDF / Word document</span>
          </div>
        </div>

        {/* PDF Upload */}
        <FormField
          control={form.control}
          name="termsDocumentUrl"
          render={({ field }) => {
            const isPdf = !!field.value && /\.pdf(\?|$)/i.test(field.value);
            return (
            <FormItem>
              <FormControl>
                <div className="space-y-3">
                  {field.value ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="font-medium text-green-800 dark:text-green-200">Terms Document Uploaded</p>
                            <a
                              href={field.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-green-600 dark:text-green-400 hover:underline"
                            >
                              Open document in new tab
                            </a>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => field.onChange('')}
                          className="text-red-600 hover:text-red-700"
                          data-testid="button-remove-terms-pdf"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      {/* Inline preview so the creator can see the uploaded document */}
                      {isPdf ? (
                        <object
                          data={field.value}
                          type="application/pdf"
                          className="w-full h-96 rounded-lg border border-gray-200 dark:border-gray-700"
                          aria-label="Terms document preview"
                        >
                          <div className="p-4 text-sm text-gray-600 dark:text-gray-400">
                            Preview unavailable.{" "}
                            <a href={field.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              Open the document
                            </a>{" "}
                            instead.
                          </div>
                        </object>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Word documents can&apos;t be previewed inline — use the link above to open it.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        id="experience-terms-pdf-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          const allowedExts = ['.pdf', '.doc', '.docx'];
                          const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
                          if (!allowedExts.includes(ext)) {
                            toast({
                              title: 'Invalid file type',
                              description: 'Please upload a PDF or Word document (.pdf, .doc, .docx).',
                              variant: 'destructive',
                            });
                            e.target.value = '';
                            return;
                          }

                          if (file.size > 10 * 1024 * 1024) {
                            toast({
                              title: 'File too large',
                              description: 'Document must be smaller than 10MB.',
                              variant: 'destructive',
                            });
                            e.target.value = '';
                            return;
                          }

                          try {
                            const formData = new FormData();
                            formData.append('file', file);
                            const token = getAccessToken();
                            const uploadResponse = await fetch('/api/uploads/documents', {
                              method: 'POST',
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                              body: formData,
                            });

                            if (!uploadResponse.ok) {
                              throw new Error('Upload failed');
                            }

                            const { url: publicUrl } = await uploadResponse.json();
                            field.onChange(publicUrl);

                            toast({
                              title: 'Document uploaded',
                              description: 'Your Terms & Conditions document has been uploaded.',
                              duration: 2000,
                            });
                          } catch (error) {
                            console.error('Terms document upload error:', error);
                            toast({
                              title: 'Upload failed',
                              description: 'Failed to upload document. Please try again.',
                              variant: 'destructive',
                            });
                          }
                          e.target.value = '';
                        }}
                        data-testid="input-experience-terms-pdf-upload"
                      />
                      <label
                        htmlFor="experience-terms-pdf-upload"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Click to upload PDF or Word document
                        </span>
                        <span className="text-xs text-gray-500">
                          PDF or Word document, max 10MB
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
            );
          }}
        />
      </div>

      {/* Terms Acceptance - Use explicit boolean handling to avoid Radix "indeterminate" issues */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <FormField
            control={form.control}
            name="termsAccepted"
            render={({ field }) => {
              const isChecked = field.value === true;
              return (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        // Ensure we only pass boolean true/false, never "indeterminate"
                        field.onChange(checked === true);
                      }}
                      data-testid="checkbox-terms-accepted"
                      className="mt-1"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-normal">
                      <LegalConsentLabel />
                      <span className="text-destructive"> *</span>
                    </FormLabel>
                    <FormDescription>
                      You must accept our terms to submit your experience for review.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      </div>

      {/* Submission Status */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">Review Process</p>
            <p className="text-amber-800 dark:text-amber-200">
              After submission, our team will review your experience within 2-3 business days. You'll receive email updates about the approval status.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
