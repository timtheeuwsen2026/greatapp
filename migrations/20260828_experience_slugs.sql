-- Short links for events that already exist.
--
-- The slug column and the /e/:slug route have both been there from the start;
-- nothing ever wrote to the column, so every share link was a raw UUID:
-- greatexperiences.ai/event/70ee63bb-5871-4454-89f9-7625673f5cac
--
-- New events get their slug from the application on publish. This is the
-- backfill for everything published before that existed. It only ever fills a
-- NULL, so it is safe to re-run and can never change a link already shared.

WITH slugged AS (
  SELECT
    id,
    -- Same shape the application produces: lowercase, non-alphanumeric folded
    -- to single hyphens, trimmed, capped at 60 characters.
    NULLIF(
      RTRIM(
        LEFT(
          REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(COALESCE(title, '')), '[^a-z0-9]+', '-', 'g'),
            '^-+|-+$', '', 'g'
          ),
          60
        ),
        '-'
      ),
      ''
    ) AS base
  FROM experiences
  WHERE slug IS NULL
),
numbered AS (
  SELECT
    id,
    COALESCE(base, 'event') AS base,
    -- A weekly run club names every event the same thing, so the second and
    -- later ones need a suffix. Ordered by id so a re-run is stable.
    ROW_NUMBER() OVER (PARTITION BY COALESCE(base, 'event') ORDER BY id) AS position
  FROM slugged
)
UPDATE experiences e
SET slug = CASE
  WHEN n.position = 1 THEN n.base
  ELSE n.base || '-' || n.position
END
FROM numbered n
WHERE e.id = n.id
  AND e.slug IS NULL
  -- Never collide with a slug that already exists: that row keeps its UUID
  -- link and the application will assign it one on the next write.
  AND NOT EXISTS (
    SELECT 1 FROM experiences other
    WHERE other.slug = CASE WHEN n.position = 1 THEN n.base ELSE n.base || '-' || n.position END
  );

-- Every lookup by slug goes through this, on the public share route.
CREATE INDEX IF NOT EXISTS experiences_slug_idx ON experiences(slug);
