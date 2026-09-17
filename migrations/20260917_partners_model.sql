-- The Partners model: one event, several two-party deals.
--
-- The Official Partner Deal held exactly one partner per event. In practice one
-- event routinely carries several separate barters at once — a run club on
-- milestone barter for bringing fifteen people, a drinks brand supplying
-- product for exposure, a photographer licensing the photos, an affiliate
-- pushing tickets on commission. None of those could be recorded beside each
-- other.
--
-- Also here:
--   * Collab Ideas go multi-select ("a venue AND a sponsor"), gain per-type
--     detail answers, multi-select deal preferences, their own photo and a
--     bring-your-own-community link.
--   * Direct invites from a Collab Idea, with per-party status tracking.
--   * Event content with its licence attached at upload.
--   * Standing preference profiles for Affiliate and Sponsor/Brand, which had
--     neither, and so could only exist inside somebody else's event.
--
-- Safe to re-run: every statement is guarded.

-- ── The repeatable partner list, on the draft and on the published event ────
ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS event_partners JSONB DEFAULT '[]'::jsonb;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS event_partners JSONB DEFAULT '[]'::jsonb;

-- ── Partner rows, so the partner's own side can read the deal ──────────────
-- A deal recorded only inside the organiser's draft is something a community
-- can be told about but never act on: no invite to accept, no link to share,
-- no count of who they brought. Partner Home reads these rows.
CREATE TABLE IF NOT EXISTS experience_partners (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id VARCHAR NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  organizer_id VARCHAR NOT NULL REFERENCES users(id),
  entry_id VARCHAR(64),

  partner_type VARCHAR(30) NOT NULL,
  partner_name VARCHAR NOT NULL,
  partner_user_id VARCHAR REFERENCES users(id),
  partner_email VARCHAR,
  source VARCHAR(20) DEFAULT 'platform',

  deal_type VARCHAR(30) NOT NULL,
  terms JSONB DEFAULT '{}'::jsonb,

  status VARCHAR(20) DEFAULT 'invited',
  invite_token VARCHAR(64) UNIQUE,
  ref_code VARCHAR(64),

  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner Home reads by partner; the event's own Partners list reads by event.
CREATE INDEX IF NOT EXISTS experience_partners_partner_idx
  ON experience_partners (partner_user_id, status);
CREATE INDEX IF NOT EXISTS experience_partners_experience_idx
  ON experience_partners (experience_id);
-- One entry per builder row per event, so re-publishing updates instead of
-- stacking a second copy of the same deal.
CREATE UNIQUE INDEX IF NOT EXISTS experience_partners_entry_unique
  ON experience_partners (experience_id, entry_id)
  WHERE entry_id IS NOT NULL;
-- The ?ref= code has to resolve to exactly one partner on one event.
CREATE UNIQUE INDEX IF NOT EXISTS experience_partners_ref_unique
  ON experience_partners (experience_id, ref_code)
  WHERE ref_code IS NOT NULL;

-- ── Collab Ideas: multi-select, per-type detail, own photo, own link ───────
-- `seeking_partner_type` is kept and still written (it holds the first selected
-- type), so every existing match query and notification keeps working.
ALTER TABLE collab_ideas
  ADD COLUMN IF NOT EXISTS seeking_partner_types JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS type_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deal_preferences JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR,
  ADD COLUMN IF NOT EXISTS own_community_token VARCHAR(64);

-- Existing ideas carry a single type. Backfill so the new multi-select reads
-- them correctly rather than showing "looking for: nothing".
UPDATE collab_ideas
   SET seeking_partner_types = jsonb_build_array(seeking_partner_type)
 WHERE (seeking_partner_types IS NULL OR seeking_partner_types = '[]'::jsonb)
   AND seeking_partner_type IS NOT NULL;

-- The free-text deal preference is deliberately NOT backfilled. Mapping
-- "Revenue split, open to discuss" onto a single id would throw away what the
-- poster actually wrote, and `describeDealPreferences` already falls back to
-- the original text whenever the multi-select is empty. Leaving it empty keeps
-- the real answer visible.

-- ── Direct invites from a Collab Idea ──────────────────────────────────────
-- Posting to the board waits to be discovered, which is the wrong shape when
-- the poster already knows who they want. Most of the time the only handle they
-- have is an Instagram name, so the link is always generated and the email is
-- optional.
CREATE TABLE IF NOT EXISTS collab_idea_invites (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id VARCHAR NOT NULL REFERENCES collab_ideas(id) ON DELETE CASCADE,
  partner_type VARCHAR(30) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR,
  invited_user_id VARCHAR REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'link_generated',
  opened_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS collab_idea_invites_idea_idx
  ON collab_idea_invites (idea_id);

-- ── Event content, licensed at upload ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS experience_content (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id VARCHAR NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  uploaded_by VARCHAR NOT NULL REFERENCES users(id),
  created_by_role VARCHAR(20) NOT NULL,
  media_url VARCHAR NOT NULL,
  media_type VARCHAR(20) DEFAULT 'image',
  caption VARCHAR,

  scope VARCHAR(30) DEFAULT 'event_only',
  expires_days_after_event INTEGER,
  -- Participant uploads only, and default false by requirement rather than by
  -- preference: commercial reuse needs that participant's explicit yes.
  commercial_opt_in BOOLEAN DEFAULT FALSE,
  attribution VARCHAR,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS experience_content_experience_idx
  ON experience_content (experience_id, created_at DESC);

-- ── Affiliate standing preferences ─────────────────────────────────────────
-- Venue has "Who you want to host" and Creator has "What you host, and what you
-- look for". Affiliate had neither.
ALTER TABLE promoter_profiles
  ADD COLUMN IF NOT EXISTS promotes_categories JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS typical_reach VARCHAR,
  ADD COLUMN IF NOT EXISTS open_to_commission_deals BOOLEAN DEFAULT TRUE;

-- Their existing single category is the best statement of what they promote.
UPDATE promoter_profiles
   SET promotes_categories = jsonb_build_array(category)
 WHERE (promotes_categories IS NULL OR promotes_categories = '[]'::jsonb)
   AND category IS NOT NULL
   AND category <> '';

-- ── Sponsor / Brand standing preferences ───────────────────────────────────
-- The inverse questions to the affiliate's: this is the party seeking an
-- audience, not the party with one. Its own table for exactly that reason.
CREATE TABLE IF NOT EXISTS sponsor_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id),
  display_name VARCHAR,
  logo_url VARCHAR,
  sponsor_categories JSONB DEFAULT '[]'::jsonb,
  target_audience VARCHAR,
  offering VARCHAR(20) DEFAULT 'product',
  offer_description TEXT,
  open_to_contact BOOLEAN DEFAULT TRUE,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
