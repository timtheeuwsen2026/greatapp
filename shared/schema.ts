import { sql, relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  pgEnum,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles enum (includes promoter for influencer/affiliate role)
export const userRoleEnum = pgEnum("user_role", [
  "participant",
  "creator",
  "venue_provider",
  "service_provider",
  "admin",
  "promoter",
]);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  role: userRoleEnum("role").default("participant"),
  // Promoter referral system
  promoterCode: varchar("promoter_code").unique(), // Unique code for promoter referral links
  referredByPromoterId: varchar("referred_by_promoter_id").references(
    () => users.id,
  ), // Who referred this user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Types for users
export type User = typeof users.$inferSelect;
export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;

// Participant profiles table - rich profiles for social interaction and networking
export const participantProfiles = pgTable("participant_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  // Core Identity
  avatarUrl: varchar("avatar_url"),
  displayName: varchar("display_name").notNull(),
  bio: text("bio").notNull(),
  location: varchar("location").notNull(),
  // Experience & Interests
  interests: text("interests")
    .array()
    .default(sql`'{}'::text[]`),
  experienceLevel: varchar("experience_level").default("Beginner"),
  travelStyle: text("travel_style")
    .array()
    .default(sql`'{}'::text[]`),
  fitnessLevel: varchar("fitness_level"),
  // Skills & Co-Creation
  occupation: varchar("occupation").notNull(),
  skills: text("skills")
    .array()
    .default(sql`'{}'::text[]`),
  willingToTakeRoles: boolean("willing_to_take_roles").default(false),
  rolePreferences: text("role_preferences")
    .array()
    .default(sql`'{}'::text[]`),
  // Community & Networking
  languages: text("languages")
    .array()
    .default(sql`'{}'::text[]`),
  professionalInterests: text("professional_interests")
    .array()
    .default(sql`'{}'::text[]`),
  profileVisibility: varchar("profile_visibility").default("Public"),
  contactMethod: varchar("contact_method").default("In-App Messaging"),
  // Event-Readiness Fields
  dietaryPreferences: text("dietary_preferences")
    .array()
    .default(sql`'{}'::text[]`),
  emergencyContact: varchar("emergency_contact"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Creator profiles table - professional profiles for experience creators
export const creatorProfiles = pgTable("creator_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),

  // Section A: Public Display Info (Visible on event pages and search cards)
  profilePhoto: varchar("profile_photo"), // Circle avatar format
  displayName: varchar("display_name").notNull(), // "Sarah Lopez" or "Yoga Flow Retreats"
  tagline: varchar("tagline"), // "Yoga teacher & mindfulness coach"
  bio: text("bio").notNull(), // 2-3 sentences describing background & passion
  expertiseTags: text("expertise_tags")
    .array()
    .default(sql`'{}'::text[]`), // Yoga|Fitness|Adventure|Creative|Spirituality|Workation|Social
  gallery: text("gallery")
    .array()
    .default(sql`'{}'::text[]`), // Up to 5 images

  // Section B: Professional & Verification (Visible in dashboard, short version on event pages)
  location: varchar("location").notNull(), // Location/Base City
  experienceLevel: varchar("experience_level").notNull(), // Beginner|Experienced|Professional/Certified
  socialLinks: jsonb("social_links")
    .$type<{
      website?: string;
      instagram?: string;
      linkedin?: string;
      youtube?: string;
    }>()
    .default({}),

  // Section C: Monetization & Compliance (Private/Backend only)
  payoutEmail: varchar("payout_email").notNull(), // Email for payouts
  stripeAccountId: varchar("stripe_account_id"), // Stripe Setup/Verification
  stripeVerificationStatus: varchar("stripe_verification_status").default(
    "pending",
  ), // Required before publishing
  termsAccepted: boolean("terms_accepted").default(false), // T&Cs acceptance checkbox
  termsAcceptedAt: timestamp("terms_accepted_at"),

  // Admin fields
  approved: boolean("approved").default(false),
  completed: boolean("completed").default(false), // Profile completion flag
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Promoter profiles table - public trust details shown when a referral link is used
export const promoterProfiles = pgTable("promoter_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  profilePhoto: varchar("profile_photo"),
  displayName: varchar("display_name").notNull(),
  bio: text("bio").notNull(),
  completed: boolean("completed").default(false),
  stripeAccountId: varchar("stripe_account_id"),
  stripeVerificationStatus: varchar("stripe_verification_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Categories enum
export const categoryEnum = pgEnum("category", [
  "sports_wellness",
  "retreats",
  "community_social",
  "adventure_trips",
  "workations",
  "festivals_events",
]);

// Experience type enum
export const experienceTypeEnum = pgEnum("experience_type", [
  "one-day",
  "multi-day",
  "virtual",
]);

// MVG status enum
export const mvgStatusEnum = pgEnum("mvg_status", ["pending", "met", "failed"]);

// Booking status enum
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
  "cancelled",
  "refunded",
  "failed",
]);

// Deposit status enum for MVG refundability tracking
export const depositStatusEnum = pgEnum("deposit_status", [
  "refundable", // Deposit is refundable if MVG fails
  "captured", // MVG met, deposit captured via Stripe
  "locked", // MVG met, deposit locked as partial payment (legacy)
  "refunded", // Deposit has been refunded
]);

// Reservation status enum
export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "expired",
  "converted",
  "cancelled",
]);

// Experience status enum
export const experienceStatusEnum = pgEnum("experience_status", [
  "draft",
  "pending_approval",
  "pending",
  "approved",
  "published",
  "rejected",
  "cancelled",
]);

// Monetisation mode enum
export const monetisationModeEnum = pgEnum("monetisation_mode", [
  "creator_led",
  "great_managed",
  "promo_only",
  "extra_services",
]);

// Commission status enum - lifecycle for promoter commissions
export const commissionStatusEnum = pgEnum("commission_status", [
  "estimated", // Calculated at booking time, pending MVG outcome
  "locked", // MVG met, commission is confirmed
  "paid", // Stripe Connect transfer completed
  "voided", // MVG failed/refunded, commission is void
]);

// Commission mode enum - how commission is calculated
export const commissionModeEnum = pgEnum("commission_mode", [
  "percent", // Percentage of price
  "fixed", // Fixed amount per spot/booking
]);

// Commission basis enum - what commission is applied to
export const commissionBasisEnum = pgEnum("commission_basis", [
  "per_spot", // Commission calculated per spot/seat booked
  "per_booking", // Commission calculated per booking (flat)
]);

// Platform configuration table for global settings
export const platformConfig = pgTable("platform_config", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Experiences table
// Experience drafts table for auto-save functionality
export const experienceDrafts = pgTable("experience_drafts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id")
    .notNull()
    .references(() => users.id),

  // Step 1: Basic Info
  title: varchar("title").default(""),
  shortDescription: varchar("short_description").default(""),

  // Step 2: Details
  description: text("description").default(""),
  category: varchar("category").default("sports_wellness"),

  // Step 3: Type & Format
  type: varchar("type").default("one-day"),
  greatPillars: jsonb("great_pillars").$type<string[]>().default([]),

  // Step 4: Dates & Availability
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  maxParticipants: integer("max_participants").default(10),

  // Step 5: Location & Venue
  location: varchar("location").default(""),
  venue: varchar("venue").default(""),
  selectedVenueId: varchar("selected_venue_id"),
  // Venue type and manual venue fields
  venueType: varchar("venue_type"), // "catalog", "manual", "virtual"
  manualVenueName: varchar("manual_venue_name"),
  manualVenueAddress: varchar("manual_venue_address"),
  manualVenueContactName: varchar("manual_venue_contact_name"),
  manualVenueEmail: varchar("manual_venue_email"),
  manualVenuePropertyUrl: text("manual_venue_property_url"),
  manualVenueDescription: text("manual_venue_description"),
  manualVenueCapacity: integer("manual_venue_capacity"),
  manualVenuePhotos: jsonb("manual_venue_photos").default([]),
  // Daytime Space capacity fields (for one-day events like coffeeshop collabs)
  standingCapacity: integer("standing_capacity"),
  seatedCapacity: integer("seated_capacity"),
  // Open-to-Venue-Offers fields (reverse bidding)
  venueOpenSpaceType: varchar("venue_open_space_type"), // e.g. "coffee_shop", "fitness_studio"
  venueTargetDeal: varchar("venue_target_deal"),        // target commercial model creator is seeking
  venueTargetDealValue: decimal("venue_target_deal_value", { precision: 10, scale: 2 }), // target amount (€) or % for the deal type
  venueStatus: varchar("venue_status").default("venue_confirmed"), // "venue_confirmed" | "venue_pending"
  // Virtual venue fields
  virtualPlatform: varchar("virtual_platform"),
  virtualMeetingUrl: varchar("virtual_meeting_url"),
  virtualInstructions: text("virtual_instructions"),
  selectedServiceIds: jsonb("selected_service_ids").default([]),
  selectedAmenityIds: jsonb("selected_amenity_ids").default([]),
  serviceDemandNotes: jsonb("service_demand_notes").default({}),
  serviceConnectRequests: jsonb("service_connect_requests").default({}),

  // Step 6: Accommodation
  accommodationType: varchar("accommodation_type"),
  roomCapacity: integer("room_capacity"),
  totalRooms: integer("total_rooms"),
  // Room types for capacity only (no pricing)
  rooms: jsonb("rooms").default([]),
  // Ticket SKUs - the actual sellable inventory (PERSON = SELLABLE UNIT)
  ticketSkus: jsonb("ticket_skus")
    .$type<
      Array<{
        id: string;
        ticketName: string;
        pricingMode?: "fixed" | "free_rsvp" | "pwyw" | "combi";
        pricePerPerson: number;
        minPrice?: number;
        suggestedPrice?: number;
        addonName?: string;
        addonPrice?: number;
        depositPerPerson: number;
        ticketCapacity: number;
        sourceRoomId?: string;
        soldCount: number;
      }>
    >()
    .default([]),
  // Legacy price per person field (deprecated - use ticketSkus)
  pricePerPerson: decimal("price_per_person", {
    precision: 10,
    scale: 2,
  }).default("0"),

  // Step 7: Pricing
  price: decimal("price").default("0"),
  currency: varchar("currency").default("usd"),
  // Deposit Settings
  depositEnabled: boolean("deposit_enabled").default(false),
  depositPercentage: decimal("deposit_percentage", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // e.g., 20.00 for 20%
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // calculated: price * depositPercentage / 100
  balanceAmount: decimal("balance_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // calculated: price - depositAmount
  balanceDueDays: integer("balance_due_days").default(14), // days before event when balance is due
  // Minimum Group Size (MVG) fields
  mvgEnabled: boolean("mvg_enabled").default(true),
  mvgMinimumSize: integer("mvg_minimum_size").default(6),
  mvgDeadlineDays: integer("mvg_deadline_days").default(7),
  mvgStatus: mvgStatusEnum("mvg_status").default("pending"),

  // Step 8: Monetization
  monetizationModel: varchar("monetization_model").default("facilitator"),
  monetisationMode:
    monetisationModeEnum("monetisation_mode").default("creator_led"),
  facilitatorServices: jsonb("facilitator_services").default([]),
  serviceCosts: jsonb("service_costs").default({}),
  expectedPayout: decimal("expected_payout"),
  platformCommission: decimal("platform_commission"),
  stripeFee: decimal("stripe_fee"),

  // Influencer Commission Fields
  influencerPromotionEnabled: boolean("influencer_promotion_enabled").default(
    false,
  ),
  influencerCommissionPct: decimal("influencer_commission_pct", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  promoterCommission: decimal("promoter_commission", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // Commission for promoters/affiliates

  // Participant referral perk fields (B2C loop)
  participantReferralDealType: varchar("participant_referral_deal_type"),
  participantReferralCommissionPct: decimal("participant_referral_commission_pct", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  participantReferralMilestoneAttendeeTarget: integer("participant_referral_milestone_attendee_target"),
  participantReferralMilestoneRewardDescription: text("participant_referral_milestone_reward_description"),

  // Promotion baseline deal fields
  promotionDealType: varchar("promotion_deal_type"),
  promotionMilestoneAttendeeTarget: integer("promotion_milestone_attendee_target"),
  promotionMilestoneRewardTickets: integer("promotion_milestone_reward_tickets"),
  promotionBrandPitch: text("promotion_brand_pitch"),
  promotionSponsorshipAmount: decimal("promotion_sponsorship_amount", {
    precision: 10,
    scale: 2,
  }),
  promotionSelectedPartnerIds: jsonb("promotion_selected_partner_ids")
    .$type<string[]>()
    .default([]),
  promotionExternalInvites: jsonb("promotion_external_invites")
    .$type<
      Array<{
        id: string;
        email: string;
        name: string;
        website: string;
      }>
    >()
    .default([]),
  promoterEnabled: boolean("promoter_enabled").default(true),

  // Per-SKU Discounts
  discounts: jsonb("discounts")
    .$type<
      Array<{
        id: string;
        title: string;
        type: "percentage" | "fixed";
        value: number;
        validUntil?: string;
        capacityCap?: number;
        active: boolean;
        skuId?: string;
      }>
    >()
    .default([]),

  // Room images (separate from individual room galleries)
  roomImages: jsonb("room_images")
    .$type<
      Array<{
        url: string;
        altText?: string;
        roomId?: string;
        order?: number;
      }>
    >()
    .default([]),

  // Secure Payout via Stripe Connect (no plaintext banking data)
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeConnectVerified: boolean("stripe_connect_verified").default(false),

  // Pillar A: Infrastructure fee (hardcoded platform economics)
  creatorPct: decimal("creator_pct", { precision: 5, scale: 2 }).default(
    "85.00",
  ),
  platformPct: decimal("platform_pct", { precision: 5, scale: 2 }).default(
    "15.00",
  ),

  // Pillar B: Commercial venue terms (decoupled from platform fee)
  venueCompensationModel: varchar("venue_compensation_model").default("access_only"),
  venueFixedFee: decimal("venue_fixed_fee", { precision: 10, scale: 2 }).default("0.00"),
  venuePerHeadAmount: decimal("venue_per_head_amount", { precision: 10, scale: 2 }).default("0.00"),
  venueMinimumSpend: decimal("venue_minimum_spend", { precision: 10, scale: 2 }).default("0.00"),
  venueRevenueSharePct: decimal("venue_revenue_share_pct", { precision: 5, scale: 2 }).default("0.00"),
  venueAccessFee: decimal("venue_access_fee", { precision: 10, scale: 2 }).default("0.00"),

  // Legacy Revenue Splits (keep for backward compatibility)
  venueRevenuePercentage: decimal("venue_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // e.g., 15.00 for 15%
  creatorRevenuePercentage: decimal("creator_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("85.00"), // e.g., 70.00 for 70%
  platformRevenuePercentage: decimal("platform_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("15.00"), // e.g., 15.00 for 15%

  // Participant Visibility
  showParticipantList: boolean("show_participant_list").default(true), // Whether to show participant list publicly

  // Step 9: Media
  coverImageUrl: varchar("cover_image_url"),
  gallery: jsonb("gallery").default([]),

  // Itinerary/Plan (array of day activities)
  itinerary: jsonb("itinerary")
    .$type<
      Array<{
        day: number;
        date?: string;
        title: string;
        activities: Array<{
          time: string;
          title: string;
          description?: string;
          duration?: string;
          type?: string;
        }>;
      }>
    >()
    .default([]),

  // Step 10: Terms
  termsAccepted: boolean("terms_accepted").default(false),
  termsDocumentUrl: varchar("terms_document_url"), // URL to uploaded PDF terms document
  customTerms: text("custom_terms"), // Editable custom terms and conditions text

  // Soft-Hold Configuration (for drafts)
  softHoldEnabled: boolean("soft_hold_enabled").default(false),
  softHoldDurationHours: integer("soft_hold_duration_hours").default(48),

  // Meta
  status: experienceStatusEnum("status").default("draft"),
  currentStep: integer("current_step").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Trip data model type (for API responses with calculated fields)
export type TripRecord = {
  // Direct mappings from experiences table
  id: string;
  title: string;
  description: string;
  image_urls: string[]; // mapped from gallery
  cover_image: string | null; // mapped from coverImageUrl
  host_id: string; // mapped from creatorId
  seats_total: number; // mapped from maxParticipants
  seats_taken: number; // mapped from currentParticipants
  mvg_spots: number; // mapped from minimumParticipants
  unlock_price: number; // mapped from depositAmount
  end_date: Date; // mapped from endDate
  status: string; // mapped from status
  chat_group_id: string | null; // mapped from chatGroupId
  created_at: Date; // mapped from createdAt

  // Calculated fields (computed at runtime)
  mvg_target_amount: number; // price * minimumParticipants
  funded_amount: number; // sum of booking amounts
  funded_percent: number; // (funded_amount / mvg_target_amount) * 100
};

export const experiences = pgTable("experiences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 255 }).unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  shortDescription: varchar("short_description", { length: 500 }),
  category: categoryEnum("category").notNull(),
  experienceType: experienceTypeEnum("experience_type").notNull(),
  greatPillars: jsonb("great_pillars").$type<string[]>().default([]),
  coverImageUrl: varchar("cover_image_url"),
  gallery: jsonb("gallery").$type<string[]>().default([]),
  location: varchar("location").notNull(),
  venue: varchar("venue"),
  manualVenueName: varchar("manual_venue_name"),
  manualVenueAddress: varchar("manual_venue_address"),
  manualVenueContactName: varchar("manual_venue_contact_name"),
  manualVenueEmail: varchar("manual_venue_email"),
  manualVenuePropertyUrl: text("manual_venue_property_url"),
  manualVenueDescription: text("manual_venue_description"),
  // Virtual event fields
  virtualMeetingUrl: varchar("virtual_meeting_url"),
  virtualMeetingPassword: varchar("virtual_meeting_password"),
  virtualPlatform: varchar("virtual_platform"), // zoom, google_meet, teams, etc.
  virtualInstructions: text("virtual_instructions"),
  // Time-specific fields
  startTime: varchar("start_time"), // for single day events
  endTime: varchar("end_time"), // for single day events
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default("usd"),
  // Room types for capacity only (no pricing)
  rooms: jsonb("rooms")
    .$type<
      Array<{
        id: string;
        name: string;
        quantity: number;
        capacity: number;
        gallery?: string[];
        notes?: string;
      }>
    >()
    .default([]),
  // Ticket SKUs - the actual sellable inventory (PERSON = SELLABLE UNIT)
  ticketSkus: jsonb("ticket_skus")
    .$type<
      Array<{
        id: string;
        ticketName: string;
        pricingMode?: "fixed" | "free_rsvp" | "pwyw" | "combi";
        pricePerPerson: number;
        minPrice?: number;
        suggestedPrice?: number;
        addonName?: string;
        addonPrice?: number;
        depositPerPerson: number;
        ticketCapacity: number;
        sourceRoomId?: string;
        soldCount: number;
      }>
    >()
    .default([]),
  // Legacy price per person field (deprecated - use ticketSkus)
  pricePerPerson: decimal("price_per_person", {
    precision: 10,
    scale: 2,
  }).default("0"),
  // Deposit Settings
  depositEnabled: boolean("deposit_enabled").default(false),
  depositPercentage: decimal("deposit_percentage", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // e.g., 20.00 for 20%
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // calculated: price * depositPercentage / 100
  balanceAmount: decimal("balance_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // calculated: price - depositAmount
  balanceDueDays: integer("balance_due_days").default(14), // days before event when balance is due
  maxParticipants: integer("max_participants").notNull(),
  currentParticipants: integer("current_participants").default(0),
  status: experienceStatusEnum("status").default("draft"),
  previewToken: varchar("preview_token"), // For sharing pending experiences with preview links (creator/admin only)
  creatorId: varchar("creator_id")
    .references(() => users.id)
    .notNull(),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  // Revenue sharing model fields
  managementType: varchar("management_type").default("creator_managed"), // 'great_managed' or 'creator_managed'
  monetisationMode:
    monetisationModeEnum("monetisation_mode").default("creator_led"),
  venueBookedByGreat: boolean("venue_booked_by_great").default(false),
  servicesBookedByGreat: boolean("services_booked_by_great").default(false),
  linkedVenueId: varchar("linked_venue_id").references(() => venues.id),
  linkedServiceIds: text("linked_service_ids")
    .array()
    .default(sql`'{}'::text[]`),

  // Influencer Commission Fields
  influencerPromotionEnabled: boolean("influencer_promotion_enabled").default(
    false,
  ),
  influencerCommissionPct: decimal("influencer_commission_pct", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  promoterCommission: decimal("promoter_commission", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // Commission for promoters/affiliates

  // Participant referral perk fields (B2C loop)
  participantReferralDealType: varchar("participant_referral_deal_type"),
  participantReferralCommissionPct: decimal("participant_referral_commission_pct", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  participantReferralMilestoneAttendeeTarget: integer("participant_referral_milestone_attendee_target"),
  participantReferralMilestoneRewardDescription: text("participant_referral_milestone_reward_description"),

  // Promotion baseline deal fields
  promotionDealType: varchar("promotion_deal_type"),
  promotionMilestoneAttendeeTarget: integer("promotion_milestone_attendee_target"),
  promotionMilestoneRewardTickets: integer("promotion_milestone_reward_tickets"),
  promotionBrandPitch: text("promotion_brand_pitch"),
  promotionSponsorshipAmount: decimal("promotion_sponsorship_amount", {
    precision: 10,
    scale: 2,
  }),
  promotionSelectedPartnerIds: jsonb("promotion_selected_partner_ids")
    .$type<string[]>()
    .default([]),
  promotionExternalInvites: jsonb("promotion_external_invites")
    .$type<
      Array<{
        id: string;
        email: string;
        name: string;
        website: string;
      }>
    >()
    .default([]),

  // Promoter Pool Fields
  promoterEnabled: boolean("promoter_enabled").default(true), // Allow promoters to promote this experience (defaults to true so approved events appear in pool)

  // Commission Override Fields (per-experience, overrides platform defaults)
  commissionMode: commissionModeEnum("commission_mode"), // null = use platform default
  commissionValue: decimal("commission_value", { precision: 10, scale: 2 }), // null = use platform default
  commissionBasis: commissionBasisEnum("commission_basis"), // null = use platform default

  // Per-SKU Discounts
  discounts: jsonb("discounts")
    .$type<
      Array<{
        id: string;
        title: string;
        type: "percentage" | "fixed";
        value: number;
        validUntil?: string;
        capacityCap?: number;
        active: boolean;
        skuId?: string;
      }>
    >()
    .default([]),

  itinerary: jsonb("itinerary"),
  roles: jsonb("roles")
    .$type<
      Array<{
        name: string;
        required: boolean;
        headcount: number;
        rate?: number;
        notes?: string;
      }>
    >()
    .default([]),
  tasks: jsonb("tasks"),
  termsAndConditions: text("terms_and_conditions"),
  termsDocumentUrl: varchar("terms_document_url"), // URL to uploaded PDF terms document

  // Services & Amenities (structured objects with custom/approval flags)
  services: jsonb("services")
    .$type<
      Array<{
        id: string;
        name: string;
        description?: string;
        custom?: boolean;
        approvedByAdmin?: boolean;
      }>
    >()
    .default([]),
  amenities: jsonb("amenities")
    .$type<
      Array<{
        id: string;
        name: string;
        description?: string;
        custom?: boolean;
        approvedByAdmin?: boolean;
      }>
    >()
    .default([]),
  // MVG (Minimum Group Unlock) fields
  requireMinimumParticipants: boolean("require_minimum_participants").default(
    false,
  ),
  minimumParticipants: integer("minimum_participants").default(6),
  mvgEnabled: boolean("mvg_enabled").default(true), // Enable/disable MVG functionality
  mvgMin: integer("mvg_min").default(6), // Alias for minimumParticipants
  mvgDeadline: timestamp("mvg_deadline", { withTimezone: true }),
  mvgStatus: mvgStatusEnum("mvg_status").default("pending"),
  mvgResolvedAt: timestamp("mvg_resolved_at"), // When MVG was successfully met and deposits captured
  mvgFailedAt: timestamp("mvg_failed_at"), // When MVG failed and deposits were refunded
  mvgLastCheckedAt: timestamp("mvg_last_checked_at"), // Last time scheduler checked this experience
  // Room images (separate from individual room galleries)
  roomImages: jsonb("room_images")
    .$type<
      Array<{
        url: string;
        altText?: string;
        roomId?: string;
        order?: number;
      }>
    >()
    .default([]),
  escrowEnabled: boolean("escrow_enabled").default(true),

  // Soft-Hold Reservation Configuration
  softHoldEnabled: boolean("soft_hold_enabled").default(false),
  softHoldDurationHours: integer("soft_hold_duration_hours").default(48), // Default 48 hours
  currentReservations: integer("current_reservations").default(0), // Active reservation count

  // Payout Details for Creator
  payoutAccountHolderName: varchar("payout_account_holder_name"),
  payoutIbanOrAccount: varchar("payout_iban_or_account"),
  payoutSwiftBic: varchar("payout_swift_bic"),
  payoutBankName: varchar("payout_bank_name"),
  payoutCountry: varchar("payout_country").default("US"),

  // Pillar A: Infrastructure fee (hardcoded platform economics)
  creatorPct: decimal("creator_pct", { precision: 5, scale: 2 }).default(
    "85.00",
  ),
  platformPct: decimal("platform_pct", { precision: 5, scale: 2 }).default(
    "15.00",
  ),

  // Pillar B: Commercial venue terms (decoupled from platform fee)
  venueCompensationModel: varchar("venue_compensation_model").default("access_only"),
  venueFixedFee: decimal("venue_fixed_fee", { precision: 10, scale: 2 }).default("0.00"),
  venuePerHeadAmount: decimal("venue_per_head_amount", { precision: 10, scale: 2 }).default("0.00"),
  venueMinimumSpend: decimal("venue_minimum_spend", { precision: 10, scale: 2 }).default("0.00"),
  venueRevenueSharePct: decimal("venue_revenue_share_pct", { precision: 5, scale: 2 }).default("0.00"),
  venueAccessFee: decimal("venue_access_fee", { precision: 10, scale: 2 }).default("0.00"),

  // Legacy Revenue Splits (keep for backward compatibility)
  venueRevenuePercentage: decimal("venue_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("0.00"), // e.g., 15.00 for 15%
  creatorRevenuePercentage: decimal("creator_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("85.00"), // e.g., 70.00 for 70%
  platformRevenuePercentage: decimal("platform_revenue_percentage", {
    precision: 5,
    scale: 2,
  }).default("15.00"), // e.g., 15.00 for 15%

  // Daytime Space capacity fields (for one-day events like coffeeshop collabs)
  standingCapacity: integer("standing_capacity"),
  seatedCapacity: integer("seated_capacity"),

  // Venue type stored on the published experience
  venueType: varchar("venue_type"),

  // Open-to-Venue-Offers fields (reverse bidding)
  venueOpenSpaceType: varchar("venue_open_space_type"), // e.g. "coffee_shop", "fitness_studio"
  venueTargetDeal: varchar("venue_target_deal"),        // target commercial model creator is seeking
  venueTargetDealValue: decimal("venue_target_deal_value", { precision: 10, scale: 2 }), // target amount (€) or % for the deal type
  venueStatus: varchar("venue_status").default("venue_confirmed"), // "venue_confirmed" | "venue_pending"

  // Participant Visibility
  showParticipantList: boolean("show_participant_list").default(true), // Whether to show participant list publicly

  // Community & Chat
  chatGroupId: varchar("chat_group_id"), // Reference to chat/messaging group for participants

  // Admin review tracking
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionCount: integer("rejection_count").default(0),

  // Cancellation tracking
  cancellationReason: varchar("cancellation_reason"), // Track why trip was cancelled (e.g., "MVG Not Reached")
  cancelledAt: timestamp("cancelled_at"),
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bookings table
export const bookings = pgTable("bookings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  // Deposit tracking fields
  isDepositOnly: boolean("is_deposit_only").default(false), // true if this booking is just the deposit
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(), // full experience price
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // amount paid as deposit
  balanceAmount: decimal("balance_amount", { precision: 10, scale: 2 }).default(
    "0.00",
  ), // remaining balance due
  balanceDueDate: timestamp("balance_due_date"), // when balance payment is due
  balancePaid: boolean("balance_paid").default(false), // whether balance has been paid
  balancePaymentIntentId: varchar("balance_payment_intent_id"), // Stripe payment intent for balance
  status: bookingStatusEnum("status").default("pending"),
  depositStatus: depositStatusEnum("deposit_status"), // Tracks MVG refundability for deposits
  depositCapturedAt: timestamp("deposit_captured_at"), // When deposit was captured via Stripe
  cancelledAt: timestamp("cancelled_at"), // When booking was cancelled (for MVG failure tracking)
  // Promoter attribution fields
  promoterId: varchar("promoter_id").references(() => users.id), // Promoter who referred this booking
  referralCode: varchar("referral_code"), // The referral code used for this booking
  promoterExperienceId: varchar("promoter_experience_id"), // Which promoter-trip share link drove this booking

  // Commission tracking fields
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }), // Calculated commission for promoter
  commissionCurrency: varchar("commission_currency", { length: 3 }), // Must match experience.currency
  commissionStatus: commissionStatusEnum("commission_status"), // estimated | locked | paid | voided
  commissionTransferId: varchar("commission_transfer_id"),
  commissionPaidAt: timestamp("commission_paid_at"),

  ticketSkuId: varchar("ticket_sku_id"),
  ticketName: varchar("ticket_name"),
  ticketQuantity: integer("ticket_quantity").notNull().default(1),
  bookingDate: timestamp("booking_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reservations table for soft-hold system
export const reservations = pgTable("reservations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  status: reservationStatusEnum("status").default("active"),
  // Timing
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  convertedAt: timestamp("converted_at"),
  // Conversion tracking
  convertedBookingId: varchar("converted_booking_id").references(
    () => bookings.id,
  ),
  // Metadata
  reservationNotes: text("reservation_notes"), // Optional notes from user
  notificationsSent: integer("notifications_sent").default(0), // Track reminder emails sent
});

// Promoter-Experience junction table (tracks which promoters are promoting which experiences)
export const promoterExperiences = pgTable(
  "promoter_experiences",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    promoterId: varchar("promoter_id")
      .references(() => users.id)
      .notNull(),
    experienceId: varchar("experience_id")
      .references(() => experiences.id)
      .notNull(),
    shareToken: varchar("share_token").unique(),
    referralAudience: varchar("referral_audience", { length: 20 }).notNull().default("participant"),
    promotionDealId: varchar("promotion_deal_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniquePromoterExperienceAudience: unique().on(table.promoterId, table.experienceId, table.referralAudience),
  }),
);

// Digital Handshake for promotion deals (Part 3): direct offers to specific
// partners (Options A/B) and marketplace bids/counters from the public pool
// (Option C). Mirrors the venueContracts/venueOffers accept-decline pattern.
export const promotionDeals = pgTable("promotion_deals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  creatorId: varchar("creator_id")
    .references(() => users.id)
    .notNull(),
  // Null until an external invite (no platform account yet) is matched to a user by email.
  partnerId: varchar("partner_id").references(() => users.id),
  partnerEmail: varchar("partner_email"),
  partnerName: varchar("partner_name"),
  source: varchar("source", { length: 20 }).notNull(), // 'platform_direct' | 'external_direct' | 'marketplace'
  dealType: varchar("deal_type", { length: 30 }).notNull(), // commission_per_ticket | milestone_barter | brand_barter | financial_sponsorship
  baselineTerms: jsonb("baseline_terms")
    .$type<{
      commissionPct?: number;
      milestoneAttendeeTarget?: number;
      milestoneRewardTickets?: number;
      brandPitch?: string;
      sponsorshipAmount?: number;
      currency?: string;
    }>()
    .default({}),
  terms: jsonb("terms")
    .$type<{
      commissionPct?: number;
      milestoneAttendeeTarget?: number;
      milestoneRewardTickets?: number;
      brandPitch?: string;
      sponsorshipAmount?: number;
      currency?: string;
    }>()
    .default({}),
  status: varchar("status", { length: 20 }).default("pending"), // pending | countered | pending_payment | accepted | declined
  // Whose turn it is to respond to the terms currently in `terms`.
  pendingActionBy: varchar("pending_action_by", { length: 10 }).default("partner"), // 'creator' | 'partner'
  paymentStatus: varchar("payment_status", { length: 20 }), // unpaid | paid | failed (financial sponsorship only)
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  counterMessage: text("counter_message"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const perkFulfillments = pgTable(
  "perk_fulfillments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    promoterExperienceId: varchar("promoter_experience_id")
      .references(() => promoterExperiences.id)
      .notNull(),
    experienceId: varchar("experience_id").references(() => experiences.id).notNull(),
    beneficiaryId: varchar("beneficiary_id").references(() => users.id).notNull(),
    promotionDealId: varchar("promotion_deal_id").references(() => promotionDeals.id),
    referralAudience: varchar("referral_audience", { length: 20 }).notNull(),
    dealType: varchar("deal_type", { length: 30 }).notNull().default("milestone_barter"),
    milestoneTarget: integer("milestone_target").notNull(),
    qualifyingBookings: integer("qualifying_bookings").notNull().default(0),
    rewardDescription: text("reward_description").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("unlocked"),
    notes: text("notes"),
    unlockedAt: timestamp("unlocked_at").defaultNow(),
    fulfilledAt: timestamp("fulfilled_at"),
    fulfilledBy: varchar("fulfilled_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniquePromoterExperienceFulfillment: unique().on(table.promoterExperienceId),
  }),
);

// Experience gallery
export const experienceGallery = pgTable("experience_gallery", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  imageUrl: varchar("image_url").notNull(),
  caption: varchar("caption"),
  order: integer("order").default(0),
});

// Experience reviews
export const reviews = pgTable("reviews", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  userId: varchar("user_id")
    .references(() => users.id)
    .notNull(),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Service type enum
export const serviceTypeEnum = pgEnum("service_type", [
  "chef",
  "guide",
  "trainer",
  "photographer",
  "musician",
  "transport",
  "equipment",
  "other",
]);

// Venues table
export const venues = pgTable("venues", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  // Basic fields
  name: varchar("name", { length: 255 }).notNull(),
  tagline: varchar("tagline", { length: 255 }), // Short tagline e.g., "Beachfront Yoga & Surf Lodge"
  city: varchar("city", { length: 255 }).notNull(),
  description: text("description").notNull(),
  // venueType: "multi_day" (default) or "daytime" — controls onboarding steps and visible fields
  venueType: varchar("venue_type", { length: 50 }).default("multi_day"),
  capacity: integer("capacity").notNull(),
  standingCapacity: integer("standing_capacity"), // For daytime spaces (coffeeshop collabs, etc.)
  seatedCapacity: integer("seated_capacity"),     // For daytime spaces
  location: varchar("location").notNull(), // Full address
  friendlyAddress: varchar("friendly_address"), // Optional short display address
  logoUrl: varchar("logo_url"), // Upload logo
  website: varchar("website"),
  instagram: varchar("instagram"),
  amenities: text("amenities")
    .array()
    .default(sql`'{}'::text[]`),
  servicesOffered: text("services_offered")
    .array()
    .default(sql`'{}'::text[]`), // Predefined services like Airport Pickup, Housekeeping, etc.

  // Geographic fields
  latitude: decimal("latitude", { precision: 10, scale: 7 }), // e.g., 40.7127837
  longitude: decimal("longitude", { precision: 10, scale: 7 }), // e.g., -74.0059413
  region: text("region"), // e.g., "North America", "Europe", "Asia"

  // Categorization & Discovery
  categories: text("categories")
    .array()
    .default(sql`'{}'::text[]`), // e.g., ["retreat_center", "yoga_studio", "workshop_space"]
  vibes: text("vibes")
    .array()
    .default(sql`'{}'::text[]`), // e.g., ["peaceful", "adventurous", "luxury", "rustic"]
  customAmenities: text("custom_amenities")
    .array()
    .default(sql`'{}'::text[]`), // Custom amenities beyond standard list
  customServicesOffered: text("custom_services_offered")
    .array()
    .default(sql`'{}'::text[]`), // Custom services specific to this venue (pending review)

  // Photo fields (legacy - keep for backward compatibility)
  coverImageUrl: varchar("cover_image_url"),
  galleryImages: text("gallery_images")
    .array()
    .default(sql`'{}'::text[]`),

  // Photo fields (new JSONB structure)
  coverImages: jsonb("cover_images")
    .$type<
      Array<{
        url: string;
        altText?: string;
        isCover?: boolean;
      }>
    >()
    .default([]),
  galleryImagesJsonb: jsonb("gallery_images_jsonb")
    .$type<
      Array<{
        url: string;
        altText?: string;
        order?: number;
      }>
    >()
    .default([]),

  // Video field
  videoUrl: varchar("video_url"), // Optional video URL (YouTube, Vimeo, etc.)

  // System fields
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  status: varchar("status").default("draft"), // draft, pending, approved, rejected
  approved: boolean("approved").default(false),

  // Services offered by venue
  services: jsonb("services")
    .$type<
      Array<{
        title: string;
        description?: string;
        price?: number;
        frequency?: string; // "per_night", "per_person", "per_event", "one_time"
        quantity?: number;
      }>
    >()
    .default([]),

  // Pricing & Availability
  pricingModel: text("pricing_model"), // "whole_venue" / "per_room"
  currency: varchar("currency").default("usd"), // USD / EUR / IDR etc.
  basePrice: decimal("base_price", { precision: 10, scale: 2 }), // Base price (legacy)
  minStay: integer("min_stay"), // Minimum stay in days
  depositPercent: decimal("deposit_percent", { precision: 5, scale: 2 }), // Deposit percentage
  cancellationPolicy: varchar("cancellation_policy"), // Flexible / Moderate / Strict

  // NEW: Whole Venue Pricing fields
  basePricePerDay: decimal("base_price_per_day", { precision: 10, scale: 2 }),
  basePricePerEvent: decimal("base_price_per_event", {
    precision: 10,
    scale: 2,
  }),
  cleaningFee: decimal("cleaning_fee", { precision: 10, scale: 2 }),

  // NEW: Per Room Pricing fields
  useRoomPricesFromRoomsPage: boolean(
    "use_room_prices_from_rooms_page",
  ).default(true),
  defaultPricePerRoomPerNight: decimal("default_price_per_room_per_night", {
    precision: 10,
    scale: 2,
  }),
  minimumNights: integer("minimum_nights"),

  // NEW: Payment Timing Model fields
  paymentTimingModel: varchar("payment_timing_model"), // "soft_hold_deposit_balance", "deposit_upfront_balance", "deposit_balance_arrival"
  softHoldDurationDays: integer("soft_hold_duration_days"),
  balanceDueDaysBeforeArrival: integer("balance_due_days_before_arrival"),

  // Business fields (survey-based enhancements)
  softHoldDays: integer("soft_hold_days"), // Number of days for soft hold reservation (legacy)
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }), // Platform commission %
  paymentModel: varchar("payment_model"), // staggered, flat, custom (legacy)

  // NEW: Pricing Notes
  pricingNotes: text("pricing_notes"),

  // NEW: Terms & Conditions fields
  termsAndConditionsUrl: varchar("terms_and_conditions_url"),
  houseRules: text("house_rules"),
  damagePolicy: text("damage_policy"),
  termsConfirmed: boolean("terms_confirmed").default(false),

  // Availability fields
  googleCalendarConnected: boolean("google_calendar_connected").default(false),
  googleCalendarId: varchar("google_calendar_id"), // Google Calendar ID for syncing

  // Contact & Social
  contactPerson: varchar("contact_person"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  facebook: varchar("facebook"),
  youtube: varchar("youtube"),
  whatsapp: varchar("whatsapp"),
  skype: varchar("skype"),
  timezone: varchar("timezone"),

  // Commercial & Booking Settings
  approvalMode: varchar("approval_mode"), // Direct / Approval / Fully Managed
  commercialModel: varchar("commercial_model"), // Fixed Rental / Revenue Share / Flexible
  softHoldPolicyEnabled: boolean("soft_hold_policy_enabled").default(false),
  softHoldRefundableDeposit: decimal("soft_hold_refundable_deposit", {
    precision: 5,
    scale: 2,
  }),

  // Survey-based enhancements (stub fields for future booking logic)
  featuredWeeksToFill: jsonb("featured_weeks_to_fill").default([]), // Array of date ranges { startDate, endDate }

  // Display preferences (admin-configurable)
  displayPrefs: jsonb("display_prefs")
    .$type<{
      servicesPlacement?: "sidebar" | "inline"; // Where to show services on public page
    }>()
    .default({}),

  // Default itinerary template (optional prefill for events)
  defaultItinerary: jsonb("default_itinerary")
    .$type<
      Array<{
        day: number;
        title: string;
        description?: string;
        timeSlots?: Array<{
          id: string;
          startTime: string;
          endTime: string;
          title: string;
          description?: string;
        }>;
      }>
    >()
    .default([]),

  // Venue roles with detailed configuration
  venueRoles: jsonb("venue_roles")
    .$type<
      Array<{
        name: string;
        required: boolean;
        headcount: number;
        rate?: number;
        notes?: string;
      }>
    >()
    .default([]),

  // Venue room types with pricing
  venueRoomTypes: jsonb("venue_room_types")
    .$type<
      Array<{
        name: string;
        type: string;
        capacity: number;
        bedConfiguration?: string;
        quantity: number;
        pricePerNight: number;
        description?: string;
      }>
    >()
    .default([]),

  // Admin review tracking
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionCount: integer("rejection_count").default(0),

  // Stripe — for charging venue owners on Venue-Sponsored deals
  stripeCustomerId: varchar("stripe_customer_id"), // Stripe Customer ID for the venue owner
  stripePaymentMethodId: varchar("stripe_payment_method_id"), // Default saved card

  // Meta fields
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Venue Availability table - for manual date range management
export const venueAvailability = pgTable("venue_availability", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  venueId: varchar("venue_id")
    .notNull()
    .references(() => venues.id, { onDelete: "cascade" }),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: varchar("status").notNull().default("available"), // available, blocked
  source: varchar("source").notNull().default("manual"), // manual, google_sync
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service category enum
export const serviceCategoryEnum = pgEnum("service_category", [
  "accommodation",
  "food_beverage",
  "transportation",
  "equipment_rental",
  "wellness_spa",
  "adventure_sports",
  "guided_tours",
  "entertainment",
  "photography",
  "event_planning",
  "fitness_training",
  "creative_workshops",
  "technical_support",
  "language_translation",
  "childcare",
  "medical_support",
]);

// Services table - individual services offered by providers
export const services = pgTable("services", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id")
    .notNull()
    .references(() => serviceProviders.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: serviceCategoryEnum("category").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  priceModel: varchar("price_model").default("per_hour"), // per_hour, per_day, per_person, flat_rate
  duration: varchar("duration"), // e.g., "2 hours", "full day"
  maxParticipants: integer("max_participants"),
  availabilityType: varchar("availability_type").default("always"), // always, by_date_range
  requirements: text("requirements")
    .array()
    .default(sql`'{}'::text[]`),
  tags: text("tags")
    .array()
    .default(sql`'{}'::text[]`),
  imageUrl: varchar("image_url"),
  available: boolean("available").default(true),
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Participant roles table - roles participants can take within experiences
export const participantRoles = pgTable("participant_roles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .notNull()
    .references(() => experiences.id),
  name: varchar("name", { length: 255 }).notNull(), // Chef, Photographer, Social Host, etc.
  description: text("description"),
  responsibilities: text("responsibilities")
    .array()
    .default(sql`'{}'::text[]`),
  requirements: text("requirements")
    .array()
    .default(sql`'{}'::text[]`), // skills, experience level
  maxCount: integer("max_count").default(1), // how many people can take this role
  currentCount: integer("current_count").default(0),
  isRequired: boolean("is_required").default(false), // must be filled for experience to run
  benefits: text("benefits")
    .array()
    .default(sql`'{}'::text[]`), // discounts, special access, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Participant role assignments - tracks who has what role
export const participantRoleAssignments = pgTable(
  "participant_role_assignments",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roleId: varchar("role_id")
      .notNull()
      .references(() => participantRoles.id),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id),
    experienceId: varchar("experience_id")
      .notNull()
      .references(() => experiences.id),
    status: varchar("status").default("pending"), // pending, confirmed, declined
    appliedAt: timestamp("applied_at").defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
);

// Community/Tribe applications - simple applications to join specific experience communities
export const communityApplications = pgTable("community_applications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .notNull()
    .references(() => experiences.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  motivationText: text("motivation_text").notNull(), // Why they want to join
  contributionText: text("contribution_text"), // What they bring to the group
  experienceLevel: varchar("experience_level"), // beginner, intermediate, advanced
  specialInterests: text("special_interests")
    .array()
    .default(sql`'{}'::text[]`),
  status: varchar("status").default("pending"), // pending, approved, rejected
  reviewNotes: text("review_notes"), // Admin review comments
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Community Groups - for organizing community members into interest groups
export const communityGroups = pgTable("community_groups", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category").notNull(), // fitness, tech, art, etc.
  imageUrl: varchar("image_url"),
  isPrivate: boolean("is_private").default(false),
  memberCount: integer("member_count").default(0),
  messageCount: integer("message_count").default(0),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Community Group Members - tracks membership in groups
export const communityGroupMembers = pgTable("community_group_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupId: varchar("group_id")
    .notNull()
    .references(() => communityGroups.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  role: varchar("role").default("member"), // member, moderator, admin
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Community Group Messages - messages within groups
export const communityGroupMessages = pgTable("community_group_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupId: varchar("group_id")
    .notNull()
    .references(() => communityGroups.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("text"), // text, image, announcement
  createdAt: timestamp("created_at").defaultNow(),
});

// Community Events - events organized by the community
export const communityEvents = pgTable("community_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  date: date("date").notNull(),
  time: varchar("time").notNull(),
  location: varchar("location").notNull(),
  type: varchar("type").notNull(), // virtual, in-person, hybrid
  organizer: varchar("organizer")
    .notNull()
    .references(() => users.id),
  maxAttendees: integer("max_attendees"),
  attendeeCount: integer("attendee_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service providers table (renamed from services)
export const serviceProviders = pgTable("service_providers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  profileImageUrl: varchar("profile_image_url"),
  description: text("description").notNull(),
  location: varchar("location").notNull(),
  serviceCategory: varchar("service_category").notNull(), // main category
  serviceType: text("service_types")
    .array()
    .default(sql`'{}'::text[]`), // specific specialties
  tags: jsonb("tags").$type<string[]>().default([]),
  priceModel: varchar("price_model").default("per_day"), // per_day, per_session, per_event
  price: decimal("price", { precision: 10, scale: 2 }),
  availabilityType: varchar("availability_type").default("always"), // always, by_date_range
  contactEmail: varchar("contact_email"),
  phoneNumber: varchar("phone_number"),
  socialLinks: jsonb("social_links").default({}),
  galleryImages: jsonb("gallery_images").$type<string[]>().default([]),
  approved: boolean("approved").default(false),
  createdBy: varchar("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Experience venues junction table
export const experienceVenues = pgTable("experience_venues", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  venueId: varchar("venue_id")
    .references(() => venues.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Digital Handshake contract between a creator experience and marketplace venue.
export const venueContracts = pgTable("venue_contracts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  venueId: varchar("venue_id")
    .references(() => venues.id)
    .notNull(),
  creatorId: varchar("creator_id")
    .references(() => users.id)
    .notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  terms: jsonb("terms")
    .$type<{
      fixedFee?: number;
      perHeadAmount?: number;
      minimumSpend?: number;
      revenueSharePct?: number;
      accessFee?: number;
      currency?: string;
      platformPct?: number;
      creatorPct?: number;
    }>()
    .default({}),
  risk: jsonb("risk")
    .$type<{
      requireMinimumParticipants?: boolean;
      minimumParticipants?: number;
      mvgDeadline?: string | null;
      depositEnabled?: boolean;
      depositAmount?: number;
      depositPercentage?: number;
      balanceDueDays?: number;
      softHoldEnabled?: boolean;
      softHoldDurationHours?: number;
    }>()
    .default({}),
  status: varchar("status", { length: 20 }).default("pending"),
  declineReason: text("decline_reason"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  // Venue-Sponsored deal: track the charge against the venue
  stripeSponsorshipPaymentIntentId: varchar("stripe_sponsorship_payment_intent_id"),
  sponsorshipPaymentStatus: varchar("sponsorship_payment_status", { length: 20 }).default("not_applicable"),
  // not_applicable | unpaid | paid | failed
  sponsorshipPaidAt: timestamp("sponsorship_paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Venue Invites — "Invite External Venue" from the event builder.
//
// The creator types a venue that is not on the platform yet and proposes a deal.
// The invite gives that venue a private, tokenised link where they can see the
// offer, claim their space and accept or decline. Before this table the email
// only linked to the public event page, which left the venue with no way in.
export const venueInvites = pgTable("venue_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // Unguessable value used in the emailed link — the invite's only credential
  // until the recipient signs in.
  token: varchar("token", { length: 64 }).notNull().unique(),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  creatorId: varchar("creator_id")
    .references(() => users.id)
    .notNull(),

  // Venue details as the creator typed them; used to prefill the claimed venue.
  email: varchar("email").notNull(),
  contactName: varchar("contact_name"),
  venueName: varchar("venue_name"),
  venueAddress: varchar("venue_address"),
  venueCity: varchar("venue_city"),
  venueDescription: text("venue_description"),
  venueCapacity: integer("venue_capacity"),
  propertyUrl: text("property_url"),

  // Proposed deal, mirroring experiences.venueTargetDeal / venueTargetDealValue.
  proposedModel: varchar("proposed_model", { length: 50 }),
  proposedValue: decimal("proposed_value", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("eur"),

  // pending → claimed → accepted | declined, or expired
  status: varchar("status", { length: 20 }).default("pending"),
  claimedByUserId: varchar("claimed_by_user_id").references(() => users.id),
  claimedVenueId: varchar("claimed_venue_id").references(() => venues.id),
  declineReason: text("decline_reason"),
  claimedAt: timestamp("claimed_at"),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Venue Offers table — Reverse Handshake bids.
// When a creator publishes an open event (venueStatus="venue_pending"), venue owners
// can submit an "Offer to Host" here instead of waiting for the creator to approach them.
// The creator reviews all offers and accepts one, which triggers linking in the experiences table.
export const venueOffers = pgTable("venue_offers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  venueId: varchar("venue_id")
    .references(() => venues.id)
    .notNull(),
  // venueOwnerId is the user who submitted the offer — stored for auth checks on accept/decline
  venueOwnerId: varchar("venue_owner_id")
    .references(() => users.id)
    .notNull(),
  status: varchar("status", { length: 20 }).default("admin_review"), // "admin_review" | "pending" | "accepted" | "declined"
  model: varchar("model", { length: 50 }).notNull(), // same values as venueContracts.model
  terms: jsonb("terms")
    .$type<{
      fixedFee?: number;
      perHeadAmount?: number;
      minimumSpend?: number;
      revenueSharePct?: number;
      accessFee?: number;
      currency?: string;
    }>()
    .default({}),
  message: text("message"), // optional note from venue owner to creator
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Amenities table - facilities and features (Wi-Fi, sauna, pool, etc.)
export const amenities = pgTable("amenities", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category").notNull(), // "technology", "wellness", "entertainment", "comfort", "safety"
  icon: varchar("icon"), // Icon name for display
  popular: boolean("popular").default(false), // For highlighting common amenities
  createdAt: timestamp("created_at").defaultNow(),
});

// Experience services junction table - for people/providers
export const experienceServices = pgTable("experience_services", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  serviceId: varchar("service_id")
    .references(() => services.id)
    .notNull(),
  demandNotes: text("demand_notes"), // Notes about specific needs or requirements
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  status: varchar("status").default("requested"), // requested, confirmed, declined
  contactRequested: boolean("contact_requested").default(false), // "Connect me" functionality
  createdAt: timestamp("created_at").defaultNow(),
});

// Experience amenities junction table - for facilities
export const experienceAmenities = pgTable("experience_amenities", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id)
    .notNull(),
  amenityId: varchar("amenity_id")
    .references(() => amenities.id)
    .notNull(),
  notes: text("notes"), // Additional notes about the amenity
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  createdExperiences: many(experiences),
  bookings: many(bookings),
  reviews: many(reviews),
}));

export const experiencesRelations = relations(experiences, ({ one, many }) => ({
  creator: one(users, {
    fields: [experiences.creatorId],
    references: [users.id],
  }),
  bookings: many(bookings),
  gallery: many(experienceGallery),
  reviews: many(reviews),
  experienceVenues: many(experienceVenues),
  venueContracts: many(venueContracts),
  experienceServices: many(experienceServices),
  experienceAmenities: many(experienceAmenities),
  participantRoles: many(participantRoles),
  roleAssignments: many(participantRoleAssignments),
  messages: many(experienceMessages),
  announcements: many(experienceAnnouncements),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  experience: one(experiences, {
    fields: [bookings.experienceId],
    references: [experiences.id],
  }),
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
}));

export const experienceGalleryRelations = relations(
  experienceGallery,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceGallery.experienceId],
      references: [experiences.id],
    }),
  }),
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  experience: one(experiences, {
    fields: [reviews.experienceId],
    references: [experiences.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));

// Venue relations
export const venuesRelations = relations(venues, ({ one, many }) => ({
  creator: one(users, {
    fields: [venues.createdBy],
    references: [users.id],
  }),
  experienceVenues: many(experienceVenues),
  venueContracts: many(venueContracts),
}));

// Service provider relations
export const serviceProvidersRelations = relations(
  serviceProviders,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [serviceProviders.createdBy],
      references: [users.id],
    }),
    services: many(services),
    experienceServices: many(experienceServices),
  }),
);

// Services relations
export const servicesRelations = relations(services, ({ one }) => ({
  provider: one(serviceProviders, {
    fields: [services.providerId],
    references: [serviceProviders.id],
  }),
}));

// Participant roles relations
export const participantRolesRelations = relations(
  participantRoles,
  ({ one, many }) => ({
    experience: one(experiences, {
      fields: [participantRoles.experienceId],
      references: [experiences.id],
    }),
    assignments: many(participantRoleAssignments),
  }),
);

// Participant role assignments relations
export const participantRoleAssignmentsRelations = relations(
  participantRoleAssignments,
  ({ one }) => ({
    role: one(participantRoles, {
      fields: [participantRoleAssignments.roleId],
      references: [participantRoles.id],
    }),
    user: one(users, {
      fields: [participantRoleAssignments.userId],
      references: [users.id],
    }),
    experience: one(experiences, {
      fields: [participantRoleAssignments.experienceId],
      references: [experiences.id],
    }),
  }),
);

// Experience venues relations
export const experienceVenuesRelations = relations(
  experienceVenues,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceVenues.experienceId],
      references: [experiences.id],
    }),
    venue: one(venues, {
      fields: [experienceVenues.venueId],
      references: [venues.id],
    }),
  }),
);

export const venueContractsRelations = relations(venueContracts, ({ one }) => ({
  experience: one(experiences, {
    fields: [venueContracts.experienceId],
    references: [experiences.id],
  }),
  venue: one(venues, {
    fields: [venueContracts.venueId],
    references: [venues.id],
  }),
  creator: one(users, {
    fields: [venueContracts.creatorId],
    references: [users.id],
  }),
}));

export const promotionDealsRelations = relations(promotionDeals, ({ one }) => ({
  experience: one(experiences, {
    fields: [promotionDeals.experienceId],
    references: [experiences.id],
  }),
  creator: one(users, {
    fields: [promotionDeals.creatorId],
    references: [users.id],
  }),
  partner: one(users, {
    fields: [promotionDeals.partnerId],
    references: [users.id],
  }),
}));

// Amenities relations
export const amenitiesRelations = relations(amenities, ({ many }) => ({
  experienceAmenities: many(experienceAmenities),
}));

// Experience services relations
export const experienceServicesRelations = relations(
  experienceServices,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceServices.experienceId],
      references: [experiences.id],
    }),
    service: one(services, {
      fields: [experienceServices.serviceId],
      references: [services.id],
    }),
  }),
);

// Experience amenities relations
export const experienceAmenitiesRelations = relations(
  experienceAmenities,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceAmenities.experienceId],
      references: [experiences.id],
    }),
    amenity: one(amenities, {
      fields: [experienceAmenities.amenityId],
      references: [amenities.id],
    }),
  }),
);

// Participant interaction tables
export const participantConnections = pgTable("participant_connections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  connectedUserId: varchar("connected_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  experienceId: varchar("experience_id")
    .references(() => experiences.id, { onDelete: "cascade" })
    .notNull(),
  status: varchar("status", {
    enum: ["pending", "accepted", "declined"],
  }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const experienceMessages = pgTable("experience_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id, { onDelete: "cascade" })
    .notNull(),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  message: text("message").notNull(),
  messageType: varchar("message_type", {
    enum: ["text", "image", "announcement"],
  }).default("text"),
  isPrivate: boolean("is_private").default(false),
  recipientId: varchar("recipient_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at").defaultNow(),
});

// One row per user/event conversation. This is the source of truth for inbox
// unread counts; opening an event chat advances lastReadAt.
export const experienceChatReads = pgTable(
  "experience_chat_reads",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    experienceId: varchar("experience_id")
      .references(() => experiences.id, { onDelete: "cascade" })
      .notNull(),
    userId: varchar("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("experience_chat_reads_experience_user_unique").on(
      table.experienceId,
      table.userId,
    ),
    index("experience_chat_reads_user_idx").on(table.userId),
  ],
);

// ─── Referral Click Tracking ─────────────────────────────────────────────────
// One row per click on a promoter referral link, before any purchase happens.
// Used to calculate click-through rates and conversion funnels.
export const referralClicks = pgTable("referral_clicks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  promoterCode: varchar("promoter_code").notNull(),          // The ?ref=CODE from the URL
  promoterId: varchar("promoter_id").references(() => users.id, { onDelete: "set null" }),
  experienceId: varchar("experience_id").references(() => experiences.id, { onDelete: "set null" }),
  promoterExperienceId: varchar("promoter_experience_id").references(
    () => promoterExperiences.id,
    { onDelete: "set null" },
  ),
  visitorUserId: varchar("visitor_user_id").references(() => users.id, { onDelete: "set null" }), // null = anonymous
  converted: boolean("converted").default(false),            // true once a booking is confirmed
  bookingId: varchar("booking_id"),                          // filled in when converted
  ipHash: varchar("ip_hash"),                                // hashed IP for dedup (no PII stored)
  userAgent: text("user_agent"),
  clickedAt: timestamp("clicked_at").defaultNow(),
  convertedAt: timestamp("converted_at"),
});

export const experienceAnnouncements = pgTable("experience_announcements", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .references(() => experiences.id, { onDelete: "cascade" })
    .notNull(),
  creatorId: varchar("creator_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  priority: varchar("priority", {
    enum: ["low", "medium", "high", "urgent"],
  }).default("medium"),
  isImportant: boolean("is_important").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const participantReactions = pgTable("participant_reactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  messageId: varchar("message_id")
    .references(() => experienceMessages.id, { onDelete: "cascade" })
    .notNull(),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  reactionType: varchar("reaction_type", {
    enum: ["like", "love", "laugh", "wow", "sad", "angry"],
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for participant interaction features
export const participantConnectionsRelations = relations(
  participantConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [participantConnections.userId],
      references: [users.id],
    }),
    connectedUser: one(users, {
      fields: [participantConnections.connectedUserId],
      references: [users.id],
    }),
    experience: one(experiences, {
      fields: [participantConnections.experienceId],
      references: [experiences.id],
    }),
  }),
);

export const experienceMessagesRelations = relations(
  experienceMessages,
  ({ one, many }) => ({
    experience: one(experiences, {
      fields: [experienceMessages.experienceId],
      references: [experiences.id],
    }),
    user: one(users, {
      fields: [experienceMessages.userId],
      references: [users.id],
    }),
    recipient: one(users, {
      fields: [experienceMessages.recipientId],
      references: [users.id],
    }),
    reactions: many(participantReactions),
  }),
);

export const participantProfilesRelations = relations(
  participantProfiles,
  ({ one }) => ({
    user: one(users, {
      fields: [participantProfiles.userId],
      references: [users.id],
    }),
  }),
);

export const experienceAnnouncementsRelations = relations(
  experienceAnnouncements,
  ({ one }) => ({
    experience: one(experiences, {
      fields: [experienceAnnouncements.experienceId],
      references: [experiences.id],
    }),
    creator: one(users, {
      fields: [experienceAnnouncements.creatorId],
      references: [users.id],
    }),
  }),
);

export const participantReactionsRelations = relations(
  participantReactions,
  ({ one }) => ({
    message: one(experienceMessages, {
      fields: [participantReactions.messageId],
      references: [experienceMessages.id],
    }),
    user: one(users, {
      fields: [participantReactions.userId],
      references: [users.id],
    }),
  }),
);

// Insert schemas
export const insertExperienceSchema = createInsertSchema(experiences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentParticipants: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  bookingDate: true,
});

// Revenue calculation schemas for real-time breakdown
export const revenueBreakdownSchema = z.object({
  grossAmount: z.number(),
  platformFeeAmount: z.number(),
  platformFeePercentage: z.number(),
  stripeFeeAmount: z.number(),
  netAmount: z.number(),
  currency: z.string().default("usd"),
});

export type RevenueBreakdown = z.infer<typeof revenueBreakdownSchema>;

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export const insertVenueSchema = createInsertSchema(venues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================================================
// VENUE VALIDATION SCHEMAS
// ============================================================================

// Service validation schema for venue services JSONB
export const venueServiceSchema = z.object({
  title: z
    .string()
    .min(3, "Service title must be at least 3 characters")
    .max(100, "Service title must not exceed 100 characters"),
  description: z
    .string()
    .min(10, "Service description must be at least 10 characters")
    .max(1000, "Service description must not exceed 1000 characters")
    .optional(),
  price: z
    .number()
    .min(0, "Price must be positive")
    .max(999999.99, "Price is too high")
    .optional(),
  frequency: z
    .enum(["one-time", "per_day", "per_person", "per_hour"])
    .optional(),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity must be positive")
    .optional(),
});

// Role validation schema for venueRoles JSONB
export const venueRoleSchema = z.object({
  name: z
    .string()
    .min(1, "Role name is required")
    .max(100, "Role name must not exceed 100 characters"),
  required: z.boolean().default(false),
  headcount: z
    .number()
    .int("Headcount must be a whole number")
    .min(1, "Headcount must be at least 1")
    .max(100, "Headcount must not exceed 100")
    .default(1),
  rate: z
    .number()
    .min(0, "Rate must be positive")
    .max(100000, "Rate is too high")
    .optional(),
  notes: z.string().max(500, "Notes must not exceed 500 characters").optional(),
});

// Room type validation schema for venueRoomTypes JSONB
export const venueRoomTypeSchema = z.object({
  name: z
    .string()
    .min(1, "Room name is required")
    .max(100, "Room name must not exceed 100 characters"),
  type: z
    .string()
    .min(1, "Room type is required")
    .max(50, "Room type must not exceed 50 characters"),
  capacity: z
    .number()
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1")
    .max(100, "Capacity must not exceed 100"),
  bedConfiguration: z
    .string()
    .max(200, "Bed configuration must not exceed 200 characters")
    .optional(),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity must not exceed 1000"),
  pricePerNight: z
    .number()
    .min(0, "Price per night must be positive")
    .max(100000, "Price per night is too high"),
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .optional(),
});

// Time slot validation for itinerary
export const venueItineraryTimeSlotSchema = z.object({
  id: z.string(),
  startTime: z.string().max(20, "Start time must not exceed 20 characters"),
  endTime: z.string().max(20, "End time must not exceed 20 characters"),
  title: z
    .string()
    .min(1, "Time slot title is required")
    .max(200, "Title must not exceed 200 characters"),
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .optional(),
});

// Itinerary day validation schema for defaultItinerary JSONB
export const venueItineraryDaySchema = z.object({
  day: z
    .number()
    .int()
    .min(1, "Day must be at least 1")
    .max(365, "Day must not exceed 365"),
  title: z
    .string()
    .min(1, "Day title is required")
    .max(200, "Title must not exceed 200 characters"),
  description: z
    .string()
    .max(2000, "Description must not exceed 2000 characters")
    .optional(),
  timeSlots: z
    .array(venueItineraryTimeSlotSchema)
    .max(20, "Maximum 20 time slots per day")
    .default([]),
});

// Cover image validation schema
export const venueCoverImageSchema = z.object({
  url: z.string().url("Cover image must be a valid URL"),
  altText: z
    .string()
    .max(200, "Alt text must not exceed 200 characters")
    .optional(),
  isCover: z.boolean().optional(),
});

// Gallery image validation schema
export const venueGalleryImageSchema = z.object({
  url: z.string().url("Gallery image must be a valid URL"),
  altText: z
    .string()
    .max(200, "Alt text must not exceed 200 characters")
    .optional(),
  order: z.number().int().min(0).optional(),
});

// Display preferences validation schema
export const venueDisplayPrefsSchema = z.object({
  servicesPlacement: z.enum(["sidebar", "inline"]).optional(),
});

// Featured weeks validation schema
export const venueFeaturedWeekSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

// Shared decimal string helper - converts numbers to strings for PostgreSQL decimal columns
// This ensures TypeScript correctly infers string type while accepting number inputs at runtime
const createDecimalString = (min: number, max: number, message: string) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "number" || typeof val === "bigint")
        return val.toString();
      return val;
    },
    z.union([
      z.string().refine((val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= min && num <= max;
      }, message),
      z.null(),
    ]),
  );

// Comprehensive venue creation/update validation schema
export const extendedInsertVenueSchema = insertVenueSchema.extend({
  // Required fields with validation
  name: z
    .string()
    .min(1, "Venue name is required")
    .max(255, "Venue name must not exceed 255 characters")
    .trim(),

  city: z
    .string()
    .min(1, "City is required")
    .max(255, "City name must not exceed 255 characters")
    .trim(),

  description: z
    .string()
    .min(50, "Description must be at least 50 characters")
    .max(10000, "Description must not exceed 10,000 characters")
    .trim(),

  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1")
    .max(10000, "Capacity must not exceed 10,000"),

  location: z
    .string()
    .min(5, "Please provide a complete address")
    .max(500, "Address must not exceed 500 characters")
    .trim(),

  // Optional basic fields
  tagline: z
    .string()
    .max(255, "Tagline must not exceed 255 characters")
    .optional()
    .nullable(),
  friendlyAddress: z
    .string()
    .max(500, "Friendly address must not exceed 500 characters")
    .optional()
    .nullable(),
  logoUrl: z
    .string()
    .url("Logo must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
  website: z
    .string()
    .url("Website must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
  instagram: z
    .string()
    .max(50, "Instagram handle must not exceed 50 characters")
    .optional()
    .nullable(),
  videoUrl: z
    .string()
    .url("Video must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),

  // Geographic fields (stored as decimal/string in database)
  latitude: createDecimalString(
    -90,
    90,
    "Latitude must be between -90 and 90",
  ).optional(),
  longitude: createDecimalString(
    -180,
    180,
    "Longitude must be between -180 and 180",
  ).optional(),
  region: z
    .string()
    .max(100, "Region must not exceed 100 characters")
    .optional()
    .nullable(),
  timezone: z
    .string()
    .max(50, "Timezone must not exceed 50 characters")
    .optional()
    .nullable(),

  // Categorization arrays
  categories: z
    .array(z.string().max(50))
    .max(10, "Maximum 10 categories allowed")
    .default([]),
  vibes: z
    .array(z.string().max(50))
    .max(10, "Maximum 10 vibes allowed")
    .default([]),
  amenities: z
    .array(z.string().max(100))
    .max(50, "Maximum 50 amenities allowed")
    .default([]),
  customAmenities: z
    .array(z.string().max(100))
    .max(20, "Maximum 20 custom amenities allowed")
    .default([]),
  servicesOffered: z
    .array(z.string().max(100))
    .max(30, "Maximum 30 services offered allowed")
    .default([]),
  customServicesOffered: z
    .array(z.string().max(100))
    .max(20, "Maximum 20 custom services allowed")
    .default([]),

  // Media fields (legacy)
  coverImageUrl: z
    .string()
    .url("Cover image must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
  galleryImages: z
    .array(z.string())
    .max(50, "Maximum 50 gallery images allowed")
    .default([]),

  // Media fields (new JSONB structure)
  coverImages: z
    .array(venueCoverImageSchema)
    .max(5, "Maximum 5 cover images allowed")
    .default([]),
  galleryImagesJsonb: z
    .array(venueGalleryImageSchema)
    .max(50, "Maximum 50 gallery images allowed")
    .default([]),

  // Services JSONB
  services: z
    .array(venueServiceSchema)
    .max(20, "Maximum 20 services allowed")
    .default([]),

  // Pricing fields (decimal fields stored as strings in database)
  pricingModel: z
    .string()
    .max(50, "Pricing model must not exceed 50 characters")
    .optional()
    .nullable(),
  currency: z
    .string()
    .max(10, "Currency code must not exceed 10 characters")
    .default("usd"),
  basePrice: createDecimalString(
    0,
    1000000,
    "Base price must be between 0 and 1,000,000",
  ).optional(),
  minStay: z.coerce
    .number()
    .int()
    .min(1, "Minimum stay must be at least 1 day")
    .max(365, "Minimum stay must not exceed 365 days")
    .optional()
    .nullable(),
  depositPercent: createDecimalString(
    0,
    100,
    "Deposit percent must be between 0 and 100",
  ).optional(),
  cancellationPolicy: z
    .string()
    .max(50, "Cancellation policy must not exceed 50 characters")
    .optional()
    .nullable(),

  // Business fields
  softHoldDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  commissionPercent: createDecimalString(
    0,
    100,
    "Commission percent must be between 0 and 100",
  ).optional(),
  paymentModel: z.string().max(50).optional().nullable(),
  approvalMode: z.string().max(50).optional().nullable(),
  commercialModel: z.string().max(50).optional().nullable(),
  softHoldPolicyEnabled: z.boolean().default(false),
  softHoldRefundableDeposit: createDecimalString(
    0,
    100,
    "Soft hold refundable deposit must be between 0 and 100",
  ).optional(),

  // Availability integration
  googleCalendarConnected: z.boolean().default(false),
  googleCalendarId: z.string().max(255).optional().nullable(),
  featuredWeeksToFill: z
    .array(venueFeaturedWeekSchema)
    .max(52, "Maximum 52 featured weeks allowed")
    .default([]),

  // Contact & Social
  contactPerson: z
    .string()
    .max(255, "Contact person must not exceed 255 characters")
    .optional()
    .nullable(),
  contactEmail: z
    .string()
    .email("Must be a valid email")
    .optional()
    .nullable()
    .or(z.literal("")),
  contactPhone: z
    .string()
    .max(50, "Phone must not exceed 50 characters")
    .optional()
    .nullable(),
  facebook: z
    .string()
    .max(255, "Facebook URL must not exceed 255 characters")
    .optional()
    .nullable(),
  youtube: z
    .string()
    .max(255, "YouTube URL must not exceed 255 characters")
    .optional()
    .nullable(),
  whatsapp: z
    .string()
    .max(50, "WhatsApp number must not exceed 50 characters")
    .optional()
    .nullable(),
  skype: z
    .string()
    .max(50, "Skype ID must not exceed 50 characters")
    .optional()
    .nullable(),

  // Templates & Defaults (JSONB)
  venueRoles: z
    .array(venueRoleSchema)
    .max(30, "Maximum 30 roles allowed")
    .default([]),
  venueRoomTypes: z
    .array(venueRoomTypeSchema)
    .max(50, "Maximum 50 room types allowed")
    .default([]),
  defaultItinerary: z
    .array(venueItineraryDaySchema)
    .max(30, "Maximum 30 days in itinerary")
    .default([]),
  displayPrefs: venueDisplayPrefsSchema.default({}),
});

// Type exports for venue validation
export type VenueService = z.infer<typeof venueServiceSchema>;
export type VenueRole = z.infer<typeof venueRoleSchema>;
export type VenueRoomType = z.infer<typeof venueRoomTypeSchema>;
export type VenueItineraryDay = z.infer<typeof venueItineraryDaySchema>;
export type ExtendedInsertVenue = z.infer<typeof extendedInsertVenueSchema>;

export const insertVenueAvailabilitySchema = createInsertSchema(
  venueAvailability,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceProviderSchema = createInsertSchema(
  serviceProviders,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExperienceVenueSchema = createInsertSchema(
  experienceVenues,
).omit({
  id: true,
  createdAt: true,
});

export const insertVenueContractSchema = createInsertSchema(venueContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  declinedAt: true,
});

export const insertPromotionDealSchema = createInsertSchema(promotionDeals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
});

export const insertExperienceServiceSchema = createInsertSchema(
  experienceServices,
).omit({
  id: true,
  createdAt: true,
});

export const insertParticipantConnectionSchema = createInsertSchema(
  participantConnections,
).omit({
  id: true,
  createdAt: true,
});

export const insertExperienceMessageSchema = createInsertSchema(
  experienceMessages,
).omit({
  id: true,
  createdAt: true,
});

export const insertParticipantProfileSchema = createInsertSchema(
  participantProfiles,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExperienceAnnouncementSchema = createInsertSchema(
  experienceAnnouncements,
).omit({
  id: true,
  createdAt: true,
});

export const insertParticipantReactionSchema = createInsertSchema(
  participantReactions,
).omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAmenitySchema = createInsertSchema(amenities).omit({
  id: true,
  createdAt: true,
});

export const insertExperienceAmenitySchema = createInsertSchema(
  experienceAmenities,
).omit({
  id: true,
  createdAt: true,
});

export const insertParticipantRoleSchema = createInsertSchema(
  participantRoles,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertParticipantRoleAssignmentSchema = createInsertSchema(
  participantRoleAssignments,
).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type Amenity = typeof amenities.$inferSelect;
export type InsertAmenity = z.infer<typeof insertAmenitySchema>;

export type ExperienceAmenity = typeof experienceAmenities.$inferSelect;
export type InsertExperienceAmenity = z.infer<
  typeof insertExperienceAmenitySchema
>;

export type ParticipantRole = typeof participantRoles.$inferSelect;
export type InsertParticipantRole = z.infer<typeof insertParticipantRoleSchema>;

export type ParticipantRoleAssignment =
  typeof participantRoleAssignments.$inferSelect;
export type InsertParticipantRoleAssignment = z.infer<
  typeof insertParticipantRoleAssignmentSchema
>;

// Duplicate creatorProfiles removed - keeping only the first definition above

// Creator profile schema for forms
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles)
  .omit({
    id: true,
    userId: true,
    approved: true,
    termsAcceptedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Make required fields explicit
    displayName: z.string().min(1, "Display name is required"),
    bio: z.string().min(10, "Bio must be at least 10 characters"),
    location: z.string().min(1, "Location is required"),
    experienceLevel: z.string().min(1, "Experience level is required"),
    payoutEmail: z.string().email("Valid email required for payouts"),
    termsAccepted: z
      .boolean()
      .refine(
        (val) => val === true,
        "You must accept the terms and conditions",
      ),
    // Optional fields
    tagline: z.string().optional(),
    profilePhoto: z.string().optional(),
    expertiseTags: z.array(z.string()).default([]),
    gallery: z.array(z.string()).max(5, "Maximum 5 gallery images").default([]),
    socialLinks: z
      .object({
        website: z.string().optional(),
        instagram: z.string().optional(),
        linkedin: z.string().optional(),
        youtube: z.string().optional(),
      })
      .default({}),
  });

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type InsertCreatorProfile = z.infer<typeof insertCreatorProfileSchema>;

export const insertPromoterProfileSchema = createInsertSchema(promoterProfiles)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    displayName: z.string().min(1, "Name is required"),
    bio: z.string().min(10, "Bio must be at least 10 characters"),
    profilePhoto: z.string().optional(),
    completed: z.boolean().optional(),
  });

export type PromoterProfile = typeof promoterProfiles.$inferSelect;
export type InsertPromoterProfile = z.infer<typeof insertPromoterProfileSchema>;

// Platform revenue settings
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default("platform_settings"),
  platformFeePercentage: decimal("platform_fee_percentage", {
    precision: 5,
    scale: 2,
  }).default("15.00"), // Default 15%
  stripeFeePercentage: decimal("stripe_fee_percentage", {
    precision: 5,
    scale: 2,
  }).default("2.90"), // Stripe's 2.9%
  stripeFeeFixed: integer("stripe_fee_fixed").default(30), // Stripe's 30 cents in cents
  minimumPayoutAmount: integer("minimum_payout_amount").default(2000), // $20 minimum payout in cents
  payoutSchedule: varchar("payout_schedule").default("weekly"), // weekly, monthly
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enhanced creator earnings with detailed breakdown
export const creatorEarnings = pgTable("creator_earnings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id")
    .notNull()
    .references(() => users.id),
  experienceId: varchar("experience_id")
    .notNull()
    .references(() => experiences.id),
  bookingId: varchar("booking_id")
    .notNull()
    .references(() => bookings.id),

  // Detailed financial breakdown
  grossAmount: integer("gross_amount").notNull(), // Total booking amount in cents
  platformFeeAmount: integer("platform_fee_amount").notNull(), // Platform fee in cents
  platformFeePercentage: decimal("platform_fee_percentage", {
    precision: 5,
    scale: 2,
  }).notNull(), // % at time of booking
  stripeFeeAmount: integer("stripe_fee_amount").notNull(), // Stripe processing fee in cents
  netAmount: integer("net_amount").notNull(), // Creator's net earnings in cents

  // Payout tracking
  payoutStatus: varchar("payout_status", {
    enum: ["pending", "ready", "processing", "completed", "failed", "disputed"],
  }).default("pending"),
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe Connect transfer ID
  payoutDate: timestamp("payout_date"),
  payoutFailureReason: text("payout_failure_reason"),

  // Metadata
  currency: varchar("currency").default("usd"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }).default(
    "1.0000",
  ),
  taxWithheld: integer("tax_witheld").default(0), // For international creators

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payout batches for grouping multiple earnings into single transfer
export const payoutBatches = pgTable("payout_batches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id")
    .notNull()
    .references(() => users.id),
  totalAmount: integer("total_amount").notNull(), // Total payout amount in cents
  earningsCount: integer("earnings_count").notNull(), // Number of earnings included
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe Connect batch transfer ID
  status: varchar("status", {
    enum: ["pending", "processing", "completed", "failed"],
  }).default("pending"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Link earnings to payout batches
export const payoutBatchEarnings = pgTable("payout_batch_earnings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id")
    .notNull()
    .references(() => payoutBatches.id),
  earningId: varchar("earning_id")
    .notNull()
    .references(() => creatorEarnings.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CreatorEarning = typeof creatorEarnings.$inferSelect;
export type InsertCreatorEarning = typeof creatorEarnings.$inferInsert;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type PayoutBatch = typeof payoutBatches.$inferSelect;
export type InsertPayoutBatch = typeof payoutBatches.$inferInsert;
export type PayoutBatchEarning = typeof payoutBatchEarnings.$inferSelect;

// Creator analytics
export const creatorAnalytics = pgTable("creator_analytics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id")
    .notNull()
    .references(() => users.id),
  experienceId: varchar("experience_id").references(() => experiences.id),
  date: date("date").notNull(),
  views: integer("views").default(0),
  bookings: integer("bookings").default(0),
  revenue: integer("revenue").default(0), // in cents
  cancellations: integer("cancellations").default(0),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CreatorAnalytic = typeof creatorAnalytics.$inferSelect;
export type InsertCreatorAnalytic = typeof creatorAnalytics.$inferInsert;
export type Experience = typeof experiences.$inferSelect;
export type InsertExperience = z.infer<typeof insertExperienceSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type ExperienceGallery = typeof experienceGallery.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Venue = typeof venues.$inferSelect;
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type VenueAvailability = typeof venueAvailability.$inferSelect;
export type InsertVenueAvailability = z.infer<
  typeof insertVenueAvailabilitySchema
>;
export type ServiceProvider = typeof serviceProviders.$inferSelect;
export type InsertServiceProvider = z.infer<typeof insertServiceProviderSchema>;
export type ExperienceVenue = typeof experienceVenues.$inferSelect;
export type InsertExperienceVenue = z.infer<typeof insertExperienceVenueSchema>;
export type VenueContract = typeof venueContracts.$inferSelect;
export type InsertVenueContract = z.infer<typeof insertVenueContractSchema>;
export type VenueInvite = typeof venueInvites.$inferSelect;
export type InsertVenueInvite = typeof venueInvites.$inferInsert;
export type PromotionDeal = typeof promotionDeals.$inferSelect;
export type InsertPromotionDeal = z.infer<typeof insertPromotionDealSchema>;
export type PerkFulfillment = typeof perkFulfillments.$inferSelect;
export type ExperienceService = typeof experienceServices.$inferSelect;
export type InsertExperienceService = z.infer<
  typeof insertExperienceServiceSchema
>;
export type ParticipantConnection = typeof participantConnections.$inferSelect;
export type InsertParticipantConnection = z.infer<
  typeof insertParticipantConnectionSchema
>;
export type ExperienceMessage = typeof experienceMessages.$inferSelect;
export type InsertExperienceMessage = z.infer<
  typeof insertExperienceMessageSchema
>;
export type ParticipantProfile = typeof participantProfiles.$inferSelect;
export type InsertParticipantProfile = z.infer<
  typeof insertParticipantProfileSchema
>;
export type ExperienceAnnouncement =
  typeof experienceAnnouncements.$inferSelect;
export type InsertExperienceAnnouncement = z.infer<
  typeof insertExperienceAnnouncementSchema
>;
export type ParticipantReaction = typeof participantReactions.$inferSelect;
export type InsertParticipantReaction = z.infer<
  typeof insertParticipantReactionSchema
>;

// Type exports
export type InsertCommunityApplication =
  typeof communityApplications.$inferInsert;
export type CommunityApplication = typeof communityApplications.$inferSelect;

export const insertCommunityApplicationSchema = createInsertSchema(
  communityApplications,
).omit({
  id: true,
  createdAt: true,
  status: true,
  reviewNotes: true,
  reviewedBy: true,
  reviewedAt: true,
});

export type InsertCommunityApplicationType = z.infer<
  typeof insertCommunityApplicationSchema
>;

// Community Group types
export type CommunityGroup = typeof communityGroups.$inferSelect;
export type InsertCommunityGroup = typeof communityGroups.$inferInsert;

export type CommunityGroupMember = typeof communityGroupMembers.$inferSelect;
export type InsertCommunityGroupMember =
  typeof communityGroupMembers.$inferInsert;

export type CommunityGroupMessage = typeof communityGroupMessages.$inferSelect;
export type InsertCommunityGroupMessage =
  typeof communityGroupMessages.$inferInsert;

export type CommunityEvent = typeof communityEvents.$inferSelect;
export type InsertCommunityEvent = typeof communityEvents.$inferInsert;

// Zod schemas for community groups
export const insertCommunityGroupSchema = createInsertSchema(
  communityGroups,
).omit({
  id: true,
  memberCount: true,
  messageCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommunityGroupType = z.infer<
  typeof insertCommunityGroupSchema
>;

// Experience drafts types
export type ExperienceDraft = typeof experienceDrafts.$inferSelect;
export type InsertExperienceDraft = typeof experienceDrafts.$inferInsert;

// Experience drafts insert schema with comprehensive validation for Milestone 1
// Note: creatorId is omitted because it's added by the backend after validation
export const insertExperienceDraftSchema = createInsertSchema(experienceDrafts)
  .omit({
    id: true,
    creatorId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Basic Info - Title and Description
    title: z
      .string()
      .min(1, "Title is required")
      .max(255, "Title must be less than 255 characters")
      .optional(),
    shortDescription: z
      .string()
      .max(500, "Short description must be less than 500 characters")
      .optional(),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters")
      .max(10000, "Description too long")
      .optional(),

    // Category and Type
    category: z
      .enum([
        "sports_wellness",
        "retreats",
        "community_social",
        "adventure_trips",
        "workations",
        "festivals_events",
      ])
      .optional(),
    type: z.enum(["one-day", "multi-day", "virtual"]).optional(),

    // Dates - Validate structure and future dates
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    // Participants - Threshold/MVG validation
    maxParticipants: z.coerce
      .number()
      .int()
      .min(1, "Must have at least 1 participant")
      .max(10000, "Too many participants")
      .optional(),
    minimumParticipants: z.coerce
      .number()
      .int()
      .min(1, "Minimum participants must be at least 1")
      .max(10000)
      .optional(),
    requireMinimumParticipants: z.boolean().optional(),

    // MVG Deadline
    mvgDeadline: z.coerce.date().optional(),
    mvgEnabled: z.boolean().optional(),
    mvgMinimumSize: z.coerce.number().int().min(1).max(10000).optional(),
    mvgDeadlineDays: z.coerce.number().int().min(0).max(365).optional(),

    // Pricing - Base price validation
    price: z.coerce
      .number()
      .min(0, "Price cannot be negative")
      .max(1000000, "Price too high")
      .optional(),
    currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]).optional(),

    // Deposit - Percentage-based validation (primary method)
    depositEnabled: z.boolean().optional(),
    depositPercentage: z.coerce
      .number()
      .min(0, "Deposit percentage cannot be negative")
      .max(100, "Deposit percentage cannot exceed 100%")
      .optional(),
    balanceDueDays: z.coerce
      .number()
      .int()
      .min(0, "Balance due days cannot be negative")
      .max(365, "Balance due days too long")
      .optional(),

    // Revenue splits - Validate percentages
    venueRevenuePercentage: z.coerce.number().min(0).max(100).optional(),
    creatorRevenuePercentage: z.coerce.number().min(0).max(100).optional(),
    platformRevenuePercentage: z.coerce.number().min(0).max(100).optional(),
    creatorPct: z.coerce.number().min(0).max(100).optional(),
    platformPct: z.coerce.number().min(0).max(100).optional(),

    // Pricing decimal fields — DB stores as decimal strings; accept number or string from client
    pricePerPerson: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    venueFixedFee: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    venuePerHeadAmount: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    venueMinimumSpend: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    venueRevenueSharePct: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    venueAccessFee: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),

    // Influencer/promoter commission — DB stores as decimal string; accept number or string
    influencerCommissionPct: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    promoterCommission: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    participantReferralDealType: z.enum([
      "commission_per_ticket",
      "milestone_barter",
    ]).nullable().optional(),
    participantReferralCommissionPct: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    participantReferralMilestoneAttendeeTarget: z.coerce.number().int().min(1).optional(),
    participantReferralMilestoneRewardDescription: z.string().max(500).optional(),
    promotionDealType: z.enum([
      "commission_per_ticket",
      "milestone_barter",
      "brand_barter",
      "financial_sponsorship",
    ]).nullable().optional(),
    promotionMilestoneAttendeeTarget: z.coerce.number().int().min(1).optional(),
    promotionMilestoneRewardTickets: z.coerce.number().int().min(1).optional(),
    promotionBrandPitch: z.string().max(2000).optional(),
    promotionSponsorshipAmount: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
    promotionSelectedPartnerIds: z.array(z.string()).default([]).optional(),
    promotionExternalInvites: z.array(
      z.object({
        id: z.string(),
        email: z.string().email("Enter a valid invite email"),
        name: z.string().min(1, "Invite name is required"),
        website: z.string().url("Enter a valid social or website link"),
      })
    ).default([]).optional(),
    promoterEnabled: z.boolean().optional(),

    // Venue - Foreign key validation
    selectedVenueId: z.string().optional(),
    location: z.string().max(500, "Location too long").optional(),

    // Soft-hold configuration
    softHoldEnabled: z.boolean().optional(),
    softHoldDurationHours: z.coerce
      .number()
      .int()
      .min(1, "Soft hold must be at least 1 hour")
      .max(168, "Soft hold cannot exceed 7 days")
      .optional(),

    // Media - Image URLs
    coverImageUrl: z
      .string()
      .url("Cover image must be a valid URL")
      .or(z.literal(""))
      .optional(),
    gallery: z
      .array(z.string().url("Gallery images must be valid URLs"))
      .optional(),
  });

export type InsertExperienceDraftType = z.infer<
  typeof insertExperienceDraftSchema
>;

// Room structure validation schema for Milestone 1
// Rooms are CAPACITY CONTAINERS only - no pricing here
export const roomSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Room name is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  gallery: z
    .array(z.string().url())
    .max(3, "Maximum 3 images per room")
    .optional(),
  notes: z.string().optional(),
});

// Ticket SKU schema - SELLABLE UNIT = PERSON (SPOT)
// Each Ticket SKU represents a purchasable spot/ticket type
export const ticketSkuSchema = z.object({
  id: z.string(),
  ticketName: z.string().min(1, "Ticket name is required"),
  // pricingMode: 'fixed' = standard price, 'pwyw' = Pay-What-You-Want
  pricingMode: z.enum(["fixed", "pwyw"]).default("fixed"),
  pricePerPerson: z.number().min(0, "Price cannot be negative"),
  // PWYW fields (ignored when pricingMode === 'fixed')
  suggestedPrice: z.number().min(0).optional(), // pre-filled default shown to buyer
  minPrice: z.number().min(0).default(0),       // floor — buyer cannot go below this
  depositPerPerson: z.number().min(0, "Deposit cannot be negative"),
  ticketCapacity: z.number().int().min(1, "Capacity must be at least 1"),
  // Optional: link to source room for multi-day events
  sourceRoomId: z.string().optional(),
  // Track sold/remaining
  soldCount: z.number().int().min(0).default(0),
});

export type TicketSku = z.infer<typeof ticketSkuSchema>;

// Itinerary structure validation schema
export const itinerarySchema = z.object({
  day: z.number().int().min(1),
  date: z.coerce.date(),
  title: z.string().default(""),
  timeSlots: z
    .array(
      z.object({
        id: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        activity: z.string(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().default(""),
});

// Role structure validation schema
export const roleSchema = z.object({
  name: z.string().min(1, "Role name is required"),
  required: z.boolean().default(false),
  headcount: z.number().int().min(1, "Headcount must be at least 1").default(1),
  rate: z.number().min(0, "Rate cannot be negative").optional(),
  notes: z.string().optional(),
});

// Complete Experience Draft validation with cross-field checks
export const validateExperienceDraftForPublish = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters"),
    startDate: z.coerce.date().refine((date) => date > new Date(), {
      message: "Start date must be in the future",
    }),
    endDate: z.coerce.date().optional(),
    location: z.string().min(1, "Location is required"),
    price: z.coerce.number().min(0, "Price must be at least 0"),
    maxParticipants: z.coerce
      .number()
      .int()
      .min(1, "Must have at least 1 participant"),
    minimumParticipants: z.coerce.number().int().min(1).optional(),
    coverImageUrl: z.string().url("Cover image must be a valid URL").optional(),
    rooms: z.array(roomSchema).optional(),
    itinerary: z.array(itinerarySchema).optional(),
    roles: z.array(roleSchema).optional(),
  })
  .refine(
    (data) => {
      // Cross-field validation: minimumParticipants <= maxParticipants
      if (data.minimumParticipants && data.maxParticipants) {
        return data.minimumParticipants <= data.maxParticipants;
      }
      return true;
    },
    {
      message: "Minimum participants cannot exceed maximum participants",
      path: ["minimumParticipants"],
    },
  )
  .refine(
    (data) => {
      // Cross-field validation: endDate >= startDate
      if (data.endDate && data.startDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  );

// Reservation schema
export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  convertedAt: true,
  notificationsSent: true,
});

export type InsertReservationType = z.infer<typeof insertReservationSchema>;

// MVG Progress Data interface for frontend components
export interface MVGProgressData {
  currentBookings: number;
  mvgMin: number;
  percentage: number;
  mvgDeadline?: string;
  mvgStatus?: "pending" | "met" | "failed";
}

// Enhanced Experience interface with computed fields for frontend
export interface ExperienceWithStats extends Experience {
  stats?: {
    averageRating: number;
    totalReviews: number;
  };
  reviews?: Review[];
  bookings?: Booking[];
  currentBookings?: number; // For MVG calculations
  activeReservations?: number; // For soft-hold display
  // Lifecycle status - single source of truth for FORMING/CONFIRMED/CANCELLED
  // Computed server-side from status + mvgStatus + requireMinimumParticipants
  lifecycleStatus?: "forming" | "confirmed" | "cancelled";
}

// API Response types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ConvertReservationResponse {
  success: boolean;
  clientSecret: string;
  bookingId: string;
  message?: string;
}

// Participant with enriched data for display
export interface ParticipantWithProfile {
  id: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  rolePreferences?: string[];
}

// Availability data for experiences
export interface ExperienceAvailability {
  spotsAvailable: number;
  totalSpots: number;
  activeReservations: number;
  mvgProgress?: MVGProgressData;
}

// Email event type enum for tracking sent emails
export const emailEventTypeEnum = pgEnum("email_event_type", [
  "booking_created",
  "mvg_confirmed",
  "mvg_failed",
]);

// Email events table for tracking sent emails (prevents duplicates)
export const bookingEmailEvents = pgTable("booking_email_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id")
    .references(() => bookings.id)
    .notNull(),
  emailType: emailEventTypeEnum("email_type").notNull(),
  recipientEmail: varchar("recipient_email").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
});

export type BookingEmailEvent = typeof bookingEmailEvents.$inferSelect;
export const insertBookingEmailEventSchema = createInsertSchema(
  bookingEmailEvents,
).omit({
  id: true,
  sentAt: true,
});
export type InsertBookingEmailEvent = z.infer<
  typeof insertBookingEmailEventSchema
>;

// Recipient-level controls for optional email. Transactional account, booking,
// deal, and payout messages are always delivered.
export const emailPreferences = pgTable(
  "email_preferences",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: varchar("email").notNull(),
    communityEmailsEnabled: boolean("community_emails_enabled").notNull().default(true),
    reminderEmailsEnabled: boolean("reminder_emails_enabled").notNull().default(true),
    marketingEmailsEnabled: boolean("marketing_emails_enabled").notNull().default(true),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("email_preferences_email_unique").on(table.email)],
);

export type EmailPreference = typeof emailPreferences.$inferSelect;
export type InsertEmailPreference = typeof emailPreferences.$inferInsert;

// Durable delivery ledger and delayed-job queue. Unique event keys make
// retries, scheduler restarts, and multiple application instances safe.
export const emailNotificationEvents = pgTable(
  "email_notification_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    eventKey: varchar("event_key").notNull(),
    emailType: varchar("email_type").notNull(),
    category: varchar("category").notNull().default("transactional"),
    recipientEmail: varchar("recipient_email"),
    status: varchar("status").notNull().default("scheduled"),
    scheduledFor: timestamp("scheduled_for").notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
    sentAt: timestamp("sent_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("email_notification_events_event_key_unique").on(table.eventKey),
    index("email_notification_events_due_idx").on(table.status, table.scheduledFor),
    index("email_notification_events_recipient_idx").on(table.recipientEmail),
  ],
);

export type EmailNotificationEvent = typeof emailNotificationEvents.$inferSelect;
export type InsertEmailNotificationEvent = typeof emailNotificationEvents.$inferInsert;

// ============================================================================
// PAYMENT ENGINE — MULTI-PARTY SPLITS & SCHEDULED PAYOUTS
// ============================================================================

export const splitRecipientTypeEnum = pgEnum("split_recipient_type", [
  "creator",
  "venue",
  "promoter",
  "service_provider",
  "platform",
]);

export const splitModeEnum = pgEnum("split_mode", [
  "percentage",
  "flat_fee",
]);

// Per-experience payout routing. One row per payee. Supports unlimited recipients,
// so adding a Promoter or Service Provider never requires a schema change.
export const splitRecipients = pgTable("split_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .notNull()
    .references(() => experiences.id, { onDelete: "cascade" }),
  recipientType: splitRecipientTypeEnum("recipient_type").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeAccountId: varchar("stripe_account_id"), // Stripe Connect account for transfer
  splitMode: splitModeEnum("split_mode").notNull().default("percentage"),
  // percentage: 0–100 (e.g. 85.00 for creator). flat_fee: EUR/USD amount.
  splitValue: decimal("split_value", { precision: 10, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("eur"),
  priority: integer("priority").default(0), // lower = paid first (platform=0, creator=1, venue=2, promoter=3)
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SplitRecipient = typeof splitRecipients.$inferSelect;
export type InsertSplitRecipient = typeof splitRecipients.$inferInsert;

export const scheduledPayoutStatusEnum = pgEnum("scheduled_payout_status", [
  "pending",     // waiting for the 7-day window to open
  "processing",  // transfers in flight
  "completed",   // all transfers succeeded
  "failed",      // one or more transfers failed
  "cancelled",   // experience cancelled/refunded before payout
]);

// One row per experience. Tracks the single 7-day post-event payout job.
export const scheduledPayouts = pgTable("scheduled_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id")
    .notNull()
    .references(() => experiences.id),
  // Fire at: experience.endDate + 7 calendar days
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: scheduledPayoutStatusEnum("status").default("pending"),
  // Gross revenue collected from all confirmed bookings (in cents)
  totalGrossAmountCents: integer("total_gross_amount_cents").default(0),
  // Non-booking revenue, such as paid brand sponsorships, added to booking gross at payout time.
  additionalGrossAmountCents: integer("additional_gross_amount_cents").default(0),
  platformFeeAmountCents: integer("platform_fee_amount_cents").default(0),
  // Map of recipientType → stripeTransferId
  stripeTransferIds: jsonb("stripe_transfer_ids")
    .$type<Record<string, string>>()
    .default({}),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ScheduledPayout = typeof scheduledPayouts.$inferSelect;
export type InsertScheduledPayout = typeof scheduledPayouts.$inferInsert;
