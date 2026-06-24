CREATE TYPE "public"."commission_basis" AS ENUM('per_spot', 'per_booking');--> statement-breakpoint
CREATE TYPE "public"."commission_mode" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('estimated', 'locked', 'voided');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('refundable', 'captured', 'locked', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('booking_created', 'mvg_confirmed', 'mvg_failed');--> statement-breakpoint
CREATE TYPE "public"."scheduled_payout_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('percentage', 'flat_fee');--> statement-breakpoint
CREATE TYPE "public"."split_recipient_type" AS ENUM('creator', 'venue', 'promoter', 'service_provider', 'platform');--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'deposit_authorized' BEFORE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'deposit_paid' BEFORE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'fully_paid' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'promoter';--> statement-breakpoint
CREATE TABLE "booking_email_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"email_type" "email_event_type" NOT NULL,
	"recipient_email" varchar NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"success" boolean DEFAULT true,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar,
	CONSTRAINT "platform_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "promoter_experiences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promoter_id" varchar NOT NULL,
	"experience_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "promoter_experiences_promoter_id_experience_id_unique" UNIQUE("promoter_id","experience_id")
);
--> statement-breakpoint
CREATE TABLE "promoter_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profile_photo" varchar,
	"display_name" varchar NOT NULL,
	"bio" text NOT NULL,
	"completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "promoter_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_clicks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promoter_code" varchar NOT NULL,
	"promoter_id" varchar,
	"experience_id" varchar,
	"visitor_user_id" varchar,
	"converted" boolean DEFAULT false,
	"booking_id" varchar,
	"ip_hash" varchar,
	"user_agent" text,
	"clicked_at" timestamp DEFAULT now(),
	"converted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scheduled_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "scheduled_payout_status" DEFAULT 'pending',
	"total_gross_amount_cents" integer DEFAULT 0,
	"platform_fee_amount_cents" integer DEFAULT 0,
	"stripe_transfer_ids" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "split_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"recipient_type" "split_recipient_type" NOT NULL,
	"user_id" varchar,
	"stripe_account_id" varchar,
	"split_mode" "split_mode" DEFAULT 'percentage' NOT NULL,
	"split_value" numeric(10, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'eur',
	"priority" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "venue_contracts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"venue_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"model" varchar(50) NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb,
	"risk" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"decline_reason" text,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "venue_offers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"venue_id" varchar NOT NULL,
	"venue_owner_id" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'admin_review',
	"model" varchar(50) NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb,
	"message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "experiences" ALTER COLUMN "roles" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ALTER COLUMN "mvg_deadline" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_providers" ALTER COLUMN "tags" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "service_providers" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "service_providers" ALTER COLUMN "gallery_images" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "service_providers" ALTER COLUMN "gallery_images" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "venues" ALTER COLUMN "cancellation_policy" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_status" "deposit_status";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_captured_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "promoter_id" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "referral_code" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "commission_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "commission_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "commission_status" "commission_status";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "ticket_sku_id" varchar;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "ticket_name" varchar;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "great_pillars" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "standing_capacity" integer;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "seated_capacity" integer;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_open_space_type" varchar;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_target_deal" varchar;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_target_deal_value" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_status" varchar DEFAULT 'venue_confirmed';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "ticket_skus" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "price_per_person" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "promoter_commission" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "room_images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_compensation_model" varchar DEFAULT 'access_only';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_fixed_fee" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_per_head_amount" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_minimum_spend" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_revenue_share_pct" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "venue_access_fee" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "itinerary" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "terms_document_url" varchar;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD COLUMN "custom_terms" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "great_pillars" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "gallery" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "ticket_skus" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "price_per_person" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "promoter_commission" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "promoter_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "commission_mode" "commission_mode";--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "commission_value" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "commission_basis" "commission_basis";--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "terms_document_url" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "services" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "amenities" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "mvg_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "mvg_resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "mvg_failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "mvg_last_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "room_images" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_compensation_model" varchar DEFAULT 'access_only';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_fixed_fee" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_per_head_amount" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_minimum_spend" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_revenue_share_pct" numeric(5, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_access_fee" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "standing_capacity" integer;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "seated_capacity" integer;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_type" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_open_space_type" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_target_deal" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_target_deal_value" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "venue_status" varchar DEFAULT 'venue_confirmed';--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "chat_group_id" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "reviewed_by" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "rejection_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "cancellation_reason" varchar;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_roles" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "promoter_code" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by_promoter_id" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "tagline" varchar(255);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "venue_type" varchar(50) DEFAULT 'multi_day';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "standing_capacity" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "seated_capacity" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "friendly_address" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "logo_url" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "services_offered" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "custom_services_offered" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "video_url" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "currency" varchar DEFAULT 'usd';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "base_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "min_stay" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "base_price_per_day" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "base_price_per_event" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "cleaning_fee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "use_room_prices_from_rooms_page" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "default_price_per_room_per_night" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "minimum_nights" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "payment_timing_model" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "soft_hold_duration_days" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "balance_due_days_before_arrival" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "pricing_notes" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "terms_and_conditions_url" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "house_rules" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "damage_policy" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "terms_confirmed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "contact_person" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "contact_email" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "contact_phone" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "facebook" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "youtube" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "whatsapp" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "skype" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "timezone" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "approval_mode" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "commercial_model" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "soft_hold_policy_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "soft_hold_refundable_deposit" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "display_prefs" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "default_itinerary" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "venue_roles" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "venue_room_types" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "reviewed_by" varchar;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "rejection_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "booking_email_events" ADD CONSTRAINT "booking_email_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoter_experiences" ADD CONSTRAINT "promoter_experiences_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoter_experiences" ADD CONSTRAINT "promoter_experiences_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoter_profiles" ADD CONSTRAINT "promoter_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_visitor_user_id_users_id_fk" FOREIGN KEY ("visitor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payouts" ADD CONSTRAINT "scheduled_payouts_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contracts" ADD CONSTRAINT "venue_contracts_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contracts" ADD CONSTRAINT "venue_contracts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contracts" ADD CONSTRAINT "venue_contracts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_offers" ADD CONSTRAINT "venue_offers_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_offers" ADD CONSTRAINT "venue_offers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_offers" ADD CONSTRAINT "venue_offers_venue_owner_id_users_id_fk" FOREIGN KEY ("venue_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promoter_id_users_id_fk" FOREIGN KEY ("promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_promoter_id_users_id_fk" FOREIGN KEY ("referred_by_promoter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_promoter_code_unique" UNIQUE("promoter_code");