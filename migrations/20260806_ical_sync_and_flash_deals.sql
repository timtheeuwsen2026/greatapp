-- V15 Feature 1.2 — two-way iCal sync
-- V15 Feature 1.3 — venue flash deals
--
-- Both are additive. No existing column is dropped or rewritten, so the app
-- keeps running against this schema before the code that uses it ships.

BEGIN;

-- ── 1.2 Two-way iCal sync ──────────────────────────────────────────────────

-- The venue's own calendars, read continuously so a creator can never request
-- a date that is already sold somewhere else.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS ical_import_urls   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ical_export_token  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS ical_last_synced_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ical_last_sync_error TEXT;

-- The export token addresses a published calendar URL, so it is the only
-- credential protecting that feed. Unique, and indexed because every fetch of
-- the feed looks a venue up by it.
CREATE UNIQUE INDEX IF NOT EXISTS venues_ical_export_token_key
  ON venues (ical_export_token)
  WHERE ical_export_token IS NOT NULL;

-- Where a synced block came from. Without these a re-sync cannot tell an
-- update from a new booking, and every run would stack duplicate blocks.
ALTER TABLE venue_availability
  ADD COLUMN IF NOT EXISTS external_feed_url TEXT,
  ADD COLUMN IF NOT EXISTS external_uid      VARCHAR(512);

CREATE UNIQUE INDEX IF NOT EXISTS venue_availability_external_event_key
  ON venue_availability (venue_id, external_feed_url, external_uid)
  WHERE external_uid IS NOT NULL;

-- Conflict checks ask "is this venue busy between these dates", every time a
-- creator picks dates or sends a handshake.
CREATE INDEX IF NOT EXISTS venue_availability_venue_dates_idx
  ON venue_availability (venue_id, start_date, end_date);

-- ── 1.3 Venue flash deals ──────────────────────────────────────────────────

-- Words and a date range. No amount, percentage or discount column exists
-- here by design: a flash deal is a lead-generation broadcast, and the money
-- is still settled through the creator's Target Deal and the handshake.
CREATE TABLE IF NOT EXISTS venue_flash_deals (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    VARCHAR NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_by  VARCHAR NOT NULL REFERENCES users(id),
  start_date  TIMESTAMP NOT NULL,
  end_date    TIMESTAMP NOT NULL,
  headline    VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  claim_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT venue_flash_deals_dates_ordered CHECK (end_date >= start_date)
);

-- The creator feed reads active deals that have not run out, newest first.
CREATE INDEX IF NOT EXISTS venue_flash_deals_feed_idx
  ON venue_flash_deals (status, end_date, created_at DESC);

-- A venue's dashboard reads its own deals.
CREATE INDEX IF NOT EXISTS venue_flash_deals_venue_idx
  ON venue_flash_deals (venue_id, created_at DESC);

COMMIT;
