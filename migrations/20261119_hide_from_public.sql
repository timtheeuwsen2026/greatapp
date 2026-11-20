-- "Hide from public" for internal test events (Tim, 66.20e). The event leaves
-- the homepage, Explore and every public list; nothing is cancelled or
-- refunded and its page still opens from its link. Runs on every boot.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS hidden_from_public boolean DEFAULT false;

-- The test events Tim listed as visible to the public (66.20e, 63.6, 66.63.6):
-- TEST 1 to TEST 4, "testtesttest...", "QA Test: ..." and "Stripe Test".
-- Only events created before this release, so a later real event is never
-- hidden by its name; admins can switch any of them back.
UPDATE experiences
SET hidden_from_public = true
WHERE created_at < '2026-11-20'
  AND hidden_from_public IS DISTINCT FROM true
  AND (
    title ~* '^test[ _-]*[0-9]+([^0-9]|$)'
    OR title ILIKE 'testtest%'
    OR title ILIKE 'QA Test%'
    OR title ILIKE 'Stripe Test%'
  );
