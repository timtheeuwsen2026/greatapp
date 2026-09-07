-- Two changes that both came out of the HOF Performance x Mapa onboarding.
--
-- 1. Combi-Ticket add-ons had no participant side at all. The builder let a
--    creator name and price an add-on, but the booking flow never offered it,
--    so nothing was ever sold and no add-on money reached the Commercial
--    Model. These columns are where a chosen add-on now lands.
--
-- 2. The untracked "Manual agreement" venue deal sat in the ordinary deal
--    dropdown and became the path of least resistance. It is now admin-only,
--    per event.
--
-- Safe to re-run: every statement is guarded.

-- ── 1. Combi-Ticket add-ons on a booking ────────────────────────────────────
--
-- One RSVP may carry zero or one add-on per attendee. addon_total is already
-- included in bookings.amount, so every existing gross-revenue rollup picks it
-- up without change; the column exists so the add-on can also be reported on
-- its own line, apart from ticket revenue.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_name VARCHAR;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_unit_price NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_total NUMERIC(10, 2) DEFAULT 0.00;

-- Every booking written before this migration predates add-ons being sellable,
-- so none of them carries one. Stated explicitly rather than left to the
-- column default, which only applies to rows inserted after the ALTER.
UPDATE bookings
SET addon_quantity = 0,
    addon_unit_price = 0.00,
    addon_total = 0.00
WHERE addon_quantity IS NULL
   OR addon_unit_price IS NULL
   OR addon_total IS NULL;

-- ── 2. Admin-only unlock for the untracked manual deal ──────────────────────
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS manual_deal_unlocked BOOLEAN DEFAULT FALSE;

UPDATE experiences SET manual_deal_unlocked = FALSE WHERE manual_deal_unlocked IS NULL;

-- Events that already agreed a manual deal keep it. Locking them out would
-- strand a live arrangement — an accepted contract would stop rendering its
-- own terms, and re-saving the event would fail validation on a deal the
-- organiser never chose to change.
--
-- This runs on boot through the prestart migration runner, in the same
-- transaction as every other migration, so a table that does not exist yet on
-- a fresh database must not roll the whole startup back. Each source of an
-- existing manual deal is therefore checked only where its table is present.
UPDATE experiences
SET manual_deal_unlocked = TRUE
WHERE manual_deal_unlocked IS DISTINCT FROM TRUE
  AND (
    venue_target_deal = 'manual_counter_revenue'
    OR venue_compensation_model = 'manual_counter_revenue'
  );

DO $$
BEGIN
  IF to_regclass('public.venue_contracts') IS NOT NULL THEN
    UPDATE experiences e
    SET manual_deal_unlocked = TRUE
    WHERE e.manual_deal_unlocked IS DISTINCT FROM TRUE
      AND EXISTS (
        SELECT 1 FROM venue_contracts vc
        WHERE vc.experience_id = e.id AND vc.model = 'manual_counter_revenue'
      );
  END IF;

  IF to_regclass('public.venue_offers') IS NOT NULL THEN
    UPDATE experiences e
    SET manual_deal_unlocked = TRUE
    WHERE e.manual_deal_unlocked IS DISTINCT FROM TRUE
      AND EXISTS (
        SELECT 1 FROM venue_offers vo
        WHERE vo.experience_id = e.id AND vo.model = 'manual_counter_revenue'
      );
  END IF;

  IF to_regclass('public.venue_invites') IS NOT NULL THEN
    UPDATE experiences e
    SET manual_deal_unlocked = TRUE
    WHERE e.manual_deal_unlocked IS DISTINCT FROM TRUE
      AND EXISTS (
        SELECT 1 FROM venue_invites vi
        WHERE vi.experience_id = e.id AND vi.proposed_model = 'manual_counter_revenue'
      );
  END IF;
END $$;

-- Drafts carry the same deal fields and are validated on publish.
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS manual_deal_unlocked BOOLEAN DEFAULT FALSE;
UPDATE experience_drafts SET manual_deal_unlocked = FALSE WHERE manual_deal_unlocked IS NULL;

-- A draft that already chose the manual deal keeps it for the same reason a
-- published event does: otherwise publishing it fails validation on a deal the
-- organiser never chose to change.
UPDATE experience_drafts
SET manual_deal_unlocked = TRUE
WHERE manual_deal_unlocked IS DISTINCT FROM TRUE
  AND (
    venue_target_deal = 'manual_counter_revenue'
    OR venue_compensation_model = 'manual_counter_revenue'
  );
