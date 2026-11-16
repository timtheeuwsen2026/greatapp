-- Venue mails and in-app notices for offers and deals (Tim, points 57-59,
-- 66.32c, 66.34k). Runs on every boot: every statement is idempotent and the
-- backfills only touch rows from before this release.

-- 1. In-app notices: the bell in the top bar.
CREATE TABLE IF NOT EXISTS user_notices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL,
  notice_key varchar(200) NOT NULL UNIQUE,
  kind varchar(40) NOT NULL,
  title varchar(255) NOT NULL,
  body text,
  link varchar(500),
  experience_id varchar,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notices_user_idx ON user_notices (user_id, created_at);

-- 2. Barter terms on the contract. The organiser's text stayed on the event,
-- so the venue's offer card never showed it. A venue counter on barter stored
-- the number 0 in its place; that is not text anybody typed.
UPDATE venue_contracts vc
SET terms = COALESCE(vc.terms, '{}'::jsonb) || jsonb_build_object('barterTerms', btrim(e.venue_barter_terms))
FROM experiences e
WHERE e.id = vc.experience_id
  AND vc.model = 'venue_barter'
  AND vc.created_at < '2026-11-17'
  AND COALESCE(btrim(e.venue_barter_terms), '') <> ''
  AND COALESCE(NULLIF(btrim(vc.terms->>'barterTerms'), '0'), '') = '';

-- 3. The venue's name and address on events whose venue already accepted
-- (TEST 3 showed only "Barcelona" under Where). The address replaces the
-- stored location only when that location is no more than a city name, so an
-- address the organiser typed is never overwritten. Same rule as
-- `placeAfterVenueAccepted` in server/storage.ts.
UPDATE experiences e
SET venue = CASE WHEN COALESCE(btrim(e.venue), '') = '' THEN v.name ELSE e.venue END,
    location = CASE
      WHEN COALESCE(btrim(v.location), '') <> ''
        AND (COALESCE(btrim(e.location), '') = ''
          OR lower(btrim(e.location)) = lower(btrim(v.city))
          OR lower(btrim(e.location)) = lower(btrim(COALESCE(e.city, ''))))
      THEN v.location
      ELSE e.location
    END
FROM venue_contracts vc
JOIN venues v ON v.id = vc.venue_id
WHERE vc.experience_id = e.id
  AND vc.status = 'accepted'
  AND vc.accepted_at < '2026-11-17';
