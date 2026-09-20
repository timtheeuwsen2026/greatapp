-- Barter Deal for venues (redesign points 40 and 54).
--
-- Every venue model until now assumed a payment in one direction, so an
-- organiser with a genuine barter -- the space in exchange for a night of
-- footfall -- had to record a zero rental and explain it in a note nobody
-- reads. There is no amount to store, only what each side agreed to supply,
-- so this is text rather than a numeric column.

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS venue_barter_terms TEXT;

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS venue_barter_terms TEXT;
