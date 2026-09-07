-- Commitment Fee + Revenue Split.
--
-- A venue that will not fund a whole event, but will put something in to show
-- it means it: a small one-off fee paid to the organiser upfront, plus a share
-- of paid ticket revenue back to the venue afterwards.
--
-- Its own deal type rather than sponsorship plus a split, because those two are
-- mutually exclusive by design — a partner must not both pay into an event and
-- take a cut of the same money out. This is the one sanctioned exception, which
-- is exactly why it is named rather than assembled from the two.
--
-- The percentage reuses venue_revenue_share_pct: it is the same figure,
-- calculated the same way, and duplicating the column would let the two drift.
-- Only the fee needs somewhere new to live.
--
-- Safe to re-run: every statement is guarded.

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS venue_commitment_fee NUMERIC(10, 2) DEFAULT 0.00;

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS venue_commitment_fee NUMERIC(10, 2) DEFAULT 0.00;

-- The column default only applies to rows written after the ALTER, so existing
-- events are set explicitly. No event can already carry a fee: the deal type
-- did not exist before this migration.
UPDATE experiences SET venue_commitment_fee = 0.00 WHERE venue_commitment_fee IS NULL;
UPDATE experience_drafts SET venue_commitment_fee = 0.00 WHERE venue_commitment_fee IS NULL;
