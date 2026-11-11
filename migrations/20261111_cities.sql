-- Cities (Tim's point 66.24, Nov 2026).
-- Every event, venue, community, partner offer and collab opportunity has a city.
-- Venues already had one. Events and drafts get their own; a visitor's choice is
-- remembered on the account.
--
-- Existing records: Barcelona, as Tim decided, except what is plainly in
-- Amsterdam (the Oud Zuid run club) and events at a venue elsewhere (a retreat
-- at a venue in Ubud stays in Ubud). Every backfill is limited to records made
-- before this change, so it runs once even though migrations run on every boot.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS city varchar;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS city varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_city varchar;

-- A typo in one venue's city.
UPDATE venues SET city = 'Ubud' WHERE city = 'Ubdu';

UPDATE experiences e SET city = COALESCE(
  CASE WHEN e.title ILIKE '%amsterdam%' OR e.location ILIKE '%amsterdam%'
         OR e.location ILIKE '%beethovenstraat%' OR e.manual_venue_address ILIKE '%amsterdam%'
       THEN 'Amsterdam' END,
  (SELECT NULLIF(v.city, '') FROM venues v WHERE v.id = e.linked_venue_id),
  'Barcelona')
WHERE (e.city IS NULL OR e.city = '') AND e.created_at < '2026-11-12';

UPDATE experience_drafts d SET city = CASE
  WHEN d.title ILIKE '%amsterdam%' OR d.location ILIKE '%amsterdam%' THEN 'Amsterdam'
  ELSE 'Barcelona' END
WHERE (d.city IS NULL OR d.city = '') AND d.created_at < '2026-11-12';

-- Communities (organiser profiles) and partners.
UPDATE creator_profiles SET city = CASE
  WHEN location ILIKE '%amsterdam%' THEN 'Amsterdam' ELSE 'Barcelona' END
WHERE (city IS NULL OR city = '') AND created_at < '2026-11-12';
UPDATE promoter_profiles SET city = 'Barcelona'
WHERE (city IS NULL OR city = '') AND created_at < '2026-11-12';

-- Collab opportunities had neighbourhoods in the city field ("Raval"); the
-- neighbourhood moves to region, which is shown next to the city.
UPDATE collab_ideas SET region = COALESCE(NULLIF(region, ''), NULLIF(city, '')), city = 'Barcelona'
WHERE (city IS NULL OR city !~* '^\s*(barcelona|amsterdam)\s*$') AND created_at < '2026-11-12';
UPDATE collab_ideas SET city = initcap(trim(city))
WHERE city ~* '^\s*(barcelona|amsterdam)\s*$' AND city <> initcap(trim(city));

CREATE INDEX IF NOT EXISTS experiences_city_idx ON experiences (city);
CREATE INDEX IF NOT EXISTS venues_city_idx ON venues (city);
