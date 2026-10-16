-- The idea phase of Create experience: the answers a draft has no column for
-- (a period instead of a date, the audience, the group-size range). Null for a
-- draft started straight in the builder.
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS concept jsonb;
