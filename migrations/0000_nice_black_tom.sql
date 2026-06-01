CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('sports_wellness', 'retreats', 'community_social', 'adventure_trips', 'workations', 'festivals_events');--> statement-breakpoint
CREATE TYPE "public"."experience_status" AS ENUM('draft', 'pending_approval', 'pending', 'approved', 'published', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."experience_type" AS ENUM('one-day', 'multi-day', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."monetisation_mode" AS ENUM('creator_led', 'great_managed', 'promo_only', 'extra_services');--> statement-breakpoint
CREATE TYPE "public"."mvg_status" AS ENUM('pending', 'met', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'expired', 'converted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('accommodation', 'food_beverage', 'transportation', 'equipment_rental', 'wellness_spa', 'adventure_sports', 'guided_tours', 'entertainment', 'photography', 'event_planning', 'fitness_training', 'creative_workshops', 'technical_support', 'language_translation', 'childcare', 'medical_support');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('chef', 'guide', 'trainer', 'photographer', 'musician', 'transport', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('participant', 'creator', 'venue_provider', 'service_provider', 'admin');--> statement-breakpoint
CREATE TABLE "amenities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar NOT NULL,
	"icon" varchar,
	"popular" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"stripe_payment_intent_id" varchar,
	"amount" numeric(10, 2) NOT NULL,
	"is_deposit_only" boolean DEFAULT false,
	"total_price" numeric(10, 2) NOT NULL,
	"deposit_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_due_date" timestamp,
	"balance_paid" boolean DEFAULT false,
	"balance_payment_intent_id" varchar,
	"status" "booking_status" DEFAULT 'pending',
	"booking_date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"motivation_text" text NOT NULL,
	"contribution_text" text,
	"experience_level" varchar,
	"special_interests" text[] DEFAULT '{}'::text[],
	"status" varchar DEFAULT 'pending',
	"review_notes" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"applied_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"time" varchar NOT NULL,
	"location" varchar NOT NULL,
	"type" varchar NOT NULL,
	"organizer" varchar NOT NULL,
	"max_attendees" integer,
	"attendee_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_group_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member',
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_group_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar DEFAULT 'text',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar NOT NULL,
	"image_url" varchar,
	"is_private" boolean DEFAULT false,
	"member_count" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"experience_id" varchar,
	"date" date NOT NULL,
	"views" integer DEFAULT 0,
	"bookings" integer DEFAULT 0,
	"revenue" integer DEFAULT 0,
	"cancellations" integer DEFAULT 0,
	"avg_rating" numeric(3, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"experience_id" varchar NOT NULL,
	"booking_id" varchar NOT NULL,
	"gross_amount" integer NOT NULL,
	"platform_fee_amount" integer NOT NULL,
	"platform_fee_percentage" numeric(5, 2) NOT NULL,
	"stripe_fee_amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"payout_status" varchar DEFAULT 'pending',
	"stripe_transfer_id" varchar,
	"payout_date" timestamp,
	"payout_failure_reason" text,
	"currency" varchar DEFAULT 'usd',
	"exchange_rate" numeric(10, 4) DEFAULT '1.0000',
	"tax_witheld" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"profile_photo" varchar,
	"display_name" varchar NOT NULL,
	"tagline" varchar,
	"bio" text NOT NULL,
	"expertise_tags" text[] DEFAULT '{}'::text[],
	"gallery" text[] DEFAULT '{}'::text[],
	"location" varchar NOT NULL,
	"experience_level" varchar NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb,
	"payout_email" varchar NOT NULL,
	"stripe_account_id" varchar,
	"stripe_verification_status" varchar DEFAULT 'pending',
	"terms_accepted" boolean DEFAULT false,
	"terms_accepted_at" timestamp,
	"approved" boolean DEFAULT false,
	"completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_amenities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"amenity_id" varchar NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_announcements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"priority" varchar DEFAULT 'medium',
	"is_important" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar DEFAULT '',
	"short_description" varchar DEFAULT '',
	"description" text DEFAULT '',
	"category" varchar DEFAULT 'sports_wellness',
	"type" varchar DEFAULT 'one-day',
	"start_date" timestamp,
	"end_date" timestamp,
	"max_participants" integer DEFAULT 10,
	"location" varchar DEFAULT '',
	"venue" varchar DEFAULT '',
	"selected_venue_id" varchar,
	"venue_type" varchar,
	"manual_venue_name" varchar,
	"manual_venue_address" varchar,
	"manual_venue_description" text,
	"manual_venue_capacity" integer,
	"manual_venue_photos" jsonb DEFAULT '[]'::jsonb,
	"virtual_platform" varchar,
	"virtual_meeting_url" varchar,
	"virtual_instructions" text,
	"selected_service_ids" jsonb DEFAULT '[]'::jsonb,
	"selected_amenity_ids" jsonb DEFAULT '[]'::jsonb,
	"service_demand_notes" jsonb DEFAULT '{}'::jsonb,
	"service_connect_requests" jsonb DEFAULT '{}'::jsonb,
	"accommodation_type" varchar,
	"room_capacity" integer,
	"total_rooms" integer,
	"rooms" jsonb DEFAULT '[]'::jsonb,
	"price" numeric DEFAULT '0',
	"currency" varchar DEFAULT 'usd',
	"deposit_enabled" boolean DEFAULT false,
	"deposit_percentage" numeric(5, 2) DEFAULT '0.00',
	"deposit_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_due_days" integer DEFAULT 14,
	"mvg_enabled" boolean DEFAULT true,
	"mvg_minimum_size" integer DEFAULT 6,
	"mvg_deadline_days" integer DEFAULT 7,
	"mvg_status" "mvg_status" DEFAULT 'pending',
	"monetization_model" varchar DEFAULT 'facilitator',
	"monetisation_mode" "monetisation_mode" DEFAULT 'creator_led',
	"facilitator_services" jsonb DEFAULT '[]'::jsonb,
	"service_costs" jsonb DEFAULT '{}'::jsonb,
	"expected_payout" numeric,
	"platform_commission" numeric,
	"stripe_fee" numeric,
	"influencer_promotion_enabled" boolean DEFAULT false,
	"influencer_commission_pct" numeric(5, 2) DEFAULT '0.00',
	"discounts" jsonb DEFAULT '[]'::jsonb,
	"stripe_connect_account_id" varchar,
	"stripe_connect_verified" boolean DEFAULT false,
	"creator_pct" numeric(5, 2) DEFAULT '85.00',
	"platform_pct" numeric(5, 2) DEFAULT '15.00',
	"venue_revenue_percentage" numeric(5, 2) DEFAULT '0.00',
	"creator_revenue_percentage" numeric(5, 2) DEFAULT '85.00',
	"platform_revenue_percentage" numeric(5, 2) DEFAULT '15.00',
	"show_participant_list" boolean DEFAULT true,
	"cover_image_url" varchar,
	"gallery" jsonb DEFAULT '[]'::jsonb,
	"terms_accepted" boolean DEFAULT false,
	"soft_hold_enabled" boolean DEFAULT false,
	"soft_hold_duration_hours" integer DEFAULT 48,
	"status" "experience_status" DEFAULT 'draft',
	"current_step" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_gallery" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"image_url" varchar NOT NULL,
	"caption" varchar,
	"order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "experience_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"message_type" varchar DEFAULT 'text',
	"is_private" boolean DEFAULT false,
	"recipient_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"service_id" varchar NOT NULL,
	"demand_notes" text,
	"estimated_cost" numeric(10, 2),
	"status" varchar DEFAULT 'requested',
	"contact_requested" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experience_venues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"venue_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"short_description" varchar(500),
	"category" "category" NOT NULL,
	"experience_type" "experience_type" NOT NULL,
	"cover_image_url" varchar,
	"location" varchar NOT NULL,
	"venue" varchar,
	"virtual_meeting_url" varchar,
	"virtual_meeting_password" varchar,
	"virtual_platform" varchar,
	"virtual_instructions" text,
	"start_time" varchar,
	"end_time" varchar,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar DEFAULT 'usd',
	"rooms" jsonb DEFAULT '[]'::jsonb,
	"deposit_enabled" boolean DEFAULT false,
	"deposit_percentage" numeric(5, 2) DEFAULT '0.00',
	"deposit_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_amount" numeric(10, 2) DEFAULT '0.00',
	"balance_due_days" integer DEFAULT 14,
	"max_participants" integer NOT NULL,
	"current_participants" integer DEFAULT 0,
	"status" "experience_status" DEFAULT 'draft',
	"preview_token" varchar,
	"creator_id" varchar NOT NULL,
	"stripe_connect_account_id" varchar,
	"management_type" varchar DEFAULT 'creator_managed',
	"monetisation_mode" "monetisation_mode" DEFAULT 'creator_led',
	"venue_booked_by_great" boolean DEFAULT false,
	"services_booked_by_great" boolean DEFAULT false,
	"linked_venue_id" varchar,
	"linked_service_ids" text[] DEFAULT '{}'::text[],
	"influencer_promotion_enabled" boolean DEFAULT false,
	"influencer_commission_pct" numeric(5, 2) DEFAULT '0.00',
	"discounts" jsonb DEFAULT '[]'::jsonb,
	"itinerary" jsonb,
	"roles" jsonb,
	"tasks" jsonb,
	"terms_and_conditions" text,
	"require_minimum_participants" boolean DEFAULT false,
	"minimum_participants" integer DEFAULT 6,
	"mvg_min" integer DEFAULT 6,
	"mvg_deadline" timestamp,
	"mvg_status" "mvg_status" DEFAULT 'pending',
	"escrow_enabled" boolean DEFAULT true,
	"soft_hold_enabled" boolean DEFAULT false,
	"soft_hold_duration_hours" integer DEFAULT 48,
	"current_reservations" integer DEFAULT 0,
	"payout_account_holder_name" varchar,
	"payout_iban_or_account" varchar,
	"payout_swift_bic" varchar,
	"payout_bank_name" varchar,
	"payout_country" varchar DEFAULT 'US',
	"creator_pct" numeric(5, 2) DEFAULT '85.00',
	"platform_pct" numeric(5, 2) DEFAULT '15.00',
	"venue_revenue_percentage" numeric(5, 2) DEFAULT '0.00',
	"creator_revenue_percentage" numeric(5, 2) DEFAULT '85.00',
	"platform_revenue_percentage" numeric(5, 2) DEFAULT '15.00',
	"show_participant_list" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "experiences_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "participant_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"connected_user_id" varchar NOT NULL,
	"experience_id" varchar NOT NULL,
	"status" varchar DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participant_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"avatar_url" varchar,
	"display_name" varchar NOT NULL,
	"bio" text NOT NULL,
	"location" varchar NOT NULL,
	"interests" text[] DEFAULT '{}'::text[],
	"experience_level" varchar DEFAULT 'Beginner',
	"travel_style" text[] DEFAULT '{}'::text[],
	"fitness_level" varchar,
	"occupation" varchar NOT NULL,
	"skills" text[] DEFAULT '{}'::text[],
	"willing_to_take_roles" boolean DEFAULT false,
	"role_preferences" text[] DEFAULT '{}'::text[],
	"languages" text[] DEFAULT '{}'::text[],
	"professional_interests" text[] DEFAULT '{}'::text[],
	"profile_visibility" varchar DEFAULT 'Public',
	"contact_method" varchar DEFAULT 'In-App Messaging',
	"dietary_preferences" text[] DEFAULT '{}'::text[],
	"emergency_contact" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participant_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"reaction_type" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participant_role_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"experience_id" varchar NOT NULL,
	"status" varchar DEFAULT 'pending',
	"applied_at" timestamp DEFAULT now(),
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "participant_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"responsibilities" text[] DEFAULT '{}'::text[],
	"requirements" text[] DEFAULT '{}'::text[],
	"max_count" integer DEFAULT 1,
	"current_count" integer DEFAULT 0,
	"is_required" boolean DEFAULT false,
	"benefits" text[] DEFAULT '{}'::text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payout_batch_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"earning_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"total_amount" integer NOT NULL,
	"earnings_count" integer NOT NULL,
	"stripe_transfer_id" varchar,
	"status" varchar DEFAULT 'pending',
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" varchar PRIMARY KEY DEFAULT 'platform_settings' NOT NULL,
	"platform_fee_percentage" numeric(5, 2) DEFAULT '15.00',
	"stripe_fee_percentage" numeric(5, 2) DEFAULT '2.90',
	"stripe_fee_fixed" integer DEFAULT 30,
	"minimum_payout_amount" integer DEFAULT 2000,
	"payout_schedule" varchar DEFAULT 'weekly',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" "reservation_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"converted_at" timestamp,
	"converted_booking_id" varchar,
	"reservation_notes" text,
	"notifications_sent" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experience_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"profile_image_url" varchar,
	"description" text NOT NULL,
	"location" varchar NOT NULL,
	"service_category" varchar NOT NULL,
	"service_types" text[] DEFAULT '{}'::text[],
	"tags" text[] DEFAULT '{}'::text[],
	"price_model" varchar DEFAULT 'per_day',
	"price" numeric(10, 2),
	"availability_type" varchar DEFAULT 'always',
	"contact_email" varchar,
	"phone_number" varchar,
	"social_links" jsonb DEFAULT '{}'::jsonb,
	"gallery_images" text[] DEFAULT '{}'::text[],
	"approved" boolean DEFAULT false,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" "service_category" NOT NULL,
	"price" numeric(10, 2),
	"price_model" varchar DEFAULT 'per_hour',
	"duration" varchar,
	"max_participants" integer,
	"availability_type" varchar DEFAULT 'always',
	"requirements" text[] DEFAULT '{}'::text[],
	"tags" text[] DEFAULT '{}'::text[],
	"image_url" varchar,
	"available" boolean DEFAULT true,
	"approved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"role" "user_role" DEFAULT 'participant',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venue_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" varchar NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"status" varchar DEFAULT 'available' NOT NULL,
	"source" varchar DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"city" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"capacity" integer NOT NULL,
	"location" varchar NOT NULL,
	"website" varchar,
	"instagram" varchar,
	"amenities" text[] DEFAULT '{}'::text[],
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"region" text,
	"categories" text[] DEFAULT '{}'::text[],
	"vibes" text[] DEFAULT '{}'::text[],
	"custom_amenities" text[] DEFAULT '{}'::text[],
	"cover_image_url" varchar,
	"gallery_images" text[] DEFAULT '{}'::text[],
	"cover_images" jsonb DEFAULT '[]'::jsonb,
	"gallery_images_jsonb" jsonb DEFAULT '[]'::jsonb,
	"slug" varchar(255) NOT NULL,
	"status" varchar DEFAULT 'draft',
	"approved" boolean DEFAULT false,
	"services" jsonb DEFAULT '[]'::jsonb,
	"soft_hold_days" integer,
	"deposit_percent" numeric(5, 2),
	"commission_percent" numeric(5, 2),
	"payment_model" varchar,
	"pricing_model" text,
	"cancellation_policy" text,
	"google_calendar_connected" boolean DEFAULT false,
	"google_calendar_id" varchar,
	"featured_weeks_to_fill" jsonb DEFAULT '[]'::jsonb,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "venues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_applications" ADD CONSTRAINT "community_applications_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_applications" ADD CONSTRAINT "community_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_applications" ADD CONSTRAINT "community_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_organizer_users_id_fk" FOREIGN KEY ("organizer") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_group_messages" ADD CONSTRAINT "community_group_messages_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_group_messages" ADD CONSTRAINT "community_group_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_analytics" ADD CONSTRAINT "creator_analytics_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_analytics" ADD CONSTRAINT "creator_analytics_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_amenities" ADD CONSTRAINT "experience_amenities_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_amenities" ADD CONSTRAINT "experience_amenities_amenity_id_amenities_id_fk" FOREIGN KEY ("amenity_id") REFERENCES "public"."amenities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_announcements" ADD CONSTRAINT "experience_announcements_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_announcements" ADD CONSTRAINT "experience_announcements_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_drafts" ADD CONSTRAINT "experience_drafts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_gallery" ADD CONSTRAINT "experience_gallery_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_messages" ADD CONSTRAINT "experience_messages_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_messages" ADD CONSTRAINT "experience_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_messages" ADD CONSTRAINT "experience_messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_services" ADD CONSTRAINT "experience_services_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_services" ADD CONSTRAINT "experience_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_venues" ADD CONSTRAINT "experience_venues_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_venues" ADD CONSTRAINT "experience_venues_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_linked_venue_id_venues_id_fk" FOREIGN KEY ("linked_venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_connections" ADD CONSTRAINT "participant_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_connections" ADD CONSTRAINT "participant_connections_connected_user_id_users_id_fk" FOREIGN KEY ("connected_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_connections" ADD CONSTRAINT "participant_connections_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_profiles" ADD CONSTRAINT "participant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_reactions" ADD CONSTRAINT "participant_reactions_message_id_experience_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."experience_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_reactions" ADD CONSTRAINT "participant_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_role_assignments" ADD CONSTRAINT "participant_role_assignments_role_id_participant_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."participant_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_role_assignments" ADD CONSTRAINT "participant_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_role_assignments" ADD CONSTRAINT "participant_role_assignments_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_roles" ADD CONSTRAINT "participant_roles_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch_earnings" ADD CONSTRAINT "payout_batch_earnings_batch_id_payout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batch_earnings" ADD CONSTRAINT "payout_batch_earnings_earning_id_creator_earnings_id_fk" FOREIGN KEY ("earning_id") REFERENCES "public"."creator_earnings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_converted_booking_id_bookings_id_fk" FOREIGN KEY ("converted_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_service_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."service_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_availability" ADD CONSTRAINT "venue_availability_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");