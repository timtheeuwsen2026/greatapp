-- Migration: Add Daytime Space capacity columns
-- Applies to: experience_drafts and experiences tables
-- Run: psql $DATABASE_URL -f migrations/002_daytime_space_capacity.sql
-- Or use: npm run db:push (recommended — syncs entire schema)

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS standing_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS seated_capacity INTEGER;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS standing_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS seated_capacity INTEGER;
