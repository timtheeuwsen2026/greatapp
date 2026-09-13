-- Partner onboarding, venue availability and preference capture, venue add-on
-- pricing, expected turnout, and the tutorial video slots.
--
-- Every statement is IF NOT EXISTS: this file runs on every boot alongside the
-- rest, so it has to be safe to re-apply.

-- ── Creator onboarding ──────────────────────────────────────────────────────
-- The popup asked for name, handle, photo and bio, which is enough to render a
-- profile and not nearly enough to match one. These are the standing
-- preferences the Suggested-for-You feed reads.
--
-- No subtype column, deliberately: a Creator is an organiser and nothing else.
-- That classification belongs to Promoter, where it exists below.
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS city VARCHAR;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS category VARCHAR;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS category_other VARCHAR;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS looking_for TEXT[] DEFAULT '{}'::text[];
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS looking_for_other VARCHAR;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS open_to_perks BOOLEAN DEFAULT FALSE;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS open_to_promoters BOOLEAN DEFAULT FALSE;

-- ── Promoter onboarding ─────────────────────────────────────────────────────
-- There was no promoter onboarding at all. Type is the field a Creator does
-- not get: Influencer, Brand, or something they name themselves.
ALTER TABLE promoter_profiles ADD COLUMN IF NOT EXISTS promoter_type VARCHAR;
ALTER TABLE promoter_profiles ADD COLUMN IF NOT EXISTS promoter_type_other VARCHAR;
ALTER TABLE promoter_profiles ADD COLUMN IF NOT EXISTS city VARCHAR;
ALTER TABLE promoter_profiles ADD COLUMN IF NOT EXISTS category VARCHAR;
ALTER TABLE promoter_profiles ADD COLUMN IF NOT EXISTS category_other VARCHAR;

-- ── Venue: self-reported open time ──────────────────────────────────────────
-- Independent of Calendar Sync on purpose. A sync says when the space is
-- *booked*; this says when the venue actually wants filling, which is a
-- commercial statement the calendar cannot make.
--
-- Two shapes because the two listing types answer differently: a day space
-- thinks in Mon–Sun × morning/afternoon/evening, a trip location thinks in
-- date ranges.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS quiet_slots TEXT[] DEFAULT '{}'::text[];
ALTER TABLE venues ADD COLUMN IF NOT EXISTS open_periods JSONB DEFAULT '[]'::jsonb;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS blackout_periods JSONB DEFAULT '[]'::jsonb;

-- ── Venue: standing preferences ─────────────────────────────────────────────
ALTER TABLE venues ADD COLUMN IF NOT EXISTS preferred_group_min INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS preferred_group_max INTEGER;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS preferred_creator_categories TEXT[] DEFAULT '{}'::text[];
ALTER TABLE venues ADD COLUMN IF NOT EXISTS preferred_vibes TEXT[] DEFAULT '{}'::text[];
ALTER TABLE venues ADD COLUMN IF NOT EXISTS preferred_trip_lengths TEXT[] DEFAULT '{}'::text[];
ALTER TABLE venues ADD COLUMN IF NOT EXISTS open_to_perks BOOLEAN DEFAULT FALSE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS open_to_promoters BOOLEAN DEFAULT FALSE;

-- ── Venue: the add-on catalog ───────────────────────────────────────────────
-- Add-on prices were invented by the creator, who does not know what a coffee
-- costs at that counter. A venue with a catalog states its own prices once and
-- every creator picks from them.
--
-- Each entry: { id, name, description, venuePrice, unit, groupDiscountNote,
-- active }. venuePrice is the venue's own counter price, never what the
-- participant is shown — the organiser's margin is applied on top of it (or
-- out of it) per event.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS addon_catalog JSONB DEFAULT '[]'::jsonb;

-- ── Event: expected turnout ─────────────────────────────────────────────────
-- Pitch context under every deal type, and load-bearing under two: Venue
-- Sponsorship and Upfront Rental have no self-correction against actual sales,
-- so the venue is committing a flat amount against this promise alone.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS expected_audience_size INTEGER;

-- Path B of venue add-on pricing: the creator states expected *demand* rather
-- than a price, and the venue fills in its real prices on the invite page.
-- Each entry: { id, name, expectedDemand, note, venuePrice, groupDiscountNote,
-- filledByVenueAt }.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS addon_requests JSONB DEFAULT '[]'::jsonb;

-- The draft carries both as well, or a half-built event loses them on the next
-- autosave: a column missing from experience_drafts is dropped without an error.
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS expected_audience_size INTEGER;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS addon_requests JSONB DEFAULT '[]'::jsonb;

-- ── Discounts as shareable links ────────────────────────────────────────────
-- Resolved in favour of a link rather than a typed code: the first real user
-- who needed one needed something to send to friends, not a string to dictate.
-- The token is what makes the link, and it is unguessable.
CREATE TABLE IF NOT EXISTS discount_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id VARCHAR NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  discount_id VARCHAR NOT NULL,
  token VARCHAR NOT NULL UNIQUE,
  label VARCHAR,
  -- Null means no cap. Counted on redemption, not on click.
  max_redemptions INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discount_links_experience_idx ON discount_links(experience_id);
-- One link per discount per event: regenerating replaces rather than
-- accumulating, so an organiser cannot end up with four live links they cannot
-- tell apart.
CREATE UNIQUE INDEX IF NOT EXISTS discount_links_discount_unique
  ON discount_links(experience_id, discount_id);

-- Which link a booking came through, so an organiser can see whether the one
-- they sent their running club actually got used.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_link_id VARCHAR;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT '0.00';

-- ── Tutorial video slots ────────────────────────────────────────────────────
-- Tim is recording the content. Held in settings rather than in the markup so
-- populating them is a paste in the admin dashboard, not a deploy.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS partner_public_video_url VARCHAR;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS partner_tutorial_video_url VARCHAR;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS participant_tutorial_video_url VARCHAR;
