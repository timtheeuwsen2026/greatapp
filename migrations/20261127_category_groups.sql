-- One category list (Tim, 27 Nov, design board A1): 7 groups and about 60
-- activities. Runs on every boot: every statement is idempotent. Old values
-- stay in the enum, so events made before keep theirs; the site reads each old
-- value as its nearest group (shared/eventCategories.ts). Nothing is rewritten.
ALTER TYPE category ADD VALUE IF NOT EXISTS 'move';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'recover';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'social';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'outdoors';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'culture';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'learn_make';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'business';

-- The activity inside the group ("running"): the label on cards and in search.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS activity varchar;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS activity varchar;

-- The pin of the place, from the place finder (OpenStreetMap; Tim, 27 Nov,
-- point 1). The city still comes from the place; these only put it on a map.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS longitude double precision;
