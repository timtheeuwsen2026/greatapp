ALTER TABLE "experience_drafts"
  ADD COLUMN IF NOT EXISTS "manual_venue_contact_name" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_email" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_property_url" text;

ALTER TABLE "experiences"
  ADD COLUMN IF NOT EXISTS "manual_venue_name" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_address" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_contact_name" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_email" varchar,
  ADD COLUMN IF NOT EXISTS "manual_venue_property_url" text,
  ADD COLUMN IF NOT EXISTS "manual_venue_description" text;
