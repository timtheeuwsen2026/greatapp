-- V14 pricing sync: "Per Room / Per Night" is a first-class multi-day deal.
--
-- The venue's nightly rate per room needs its own column alongside the other
-- commercial terms (venue_fixed_fee, venue_per_head_amount, …) so an accepted
-- contract keeps its number on the experience row.

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS venue_per_room_per_night numeric(10, 2) DEFAULT '0.00';

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS venue_per_room_per_night numeric(10, 2) DEFAULT '0.00';
