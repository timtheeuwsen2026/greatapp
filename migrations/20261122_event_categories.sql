-- One category list (Tim, 66.46): the idea builder's eight interests. Runs on
-- every boot: every statement is idempotent. The six old values stay, so
-- events made before keep their category; the site reads each old value as
-- its nearest new one (shared/eventCategories.ts). Nothing is rewritten.
ALTER TYPE category ADD VALUE IF NOT EXISTS 'sport';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'mind_body';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'food_drink';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'music_nightlife';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'learning';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'travel';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'meet_people';
ALTER TYPE category ADD VALUE IF NOT EXISTS 'other';
