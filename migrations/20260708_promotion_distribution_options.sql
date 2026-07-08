ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS promotion_selected_partner_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promotion_external_invites jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promoter_enabled boolean DEFAULT false;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS promotion_selected_partner_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promotion_external_invites jsonb DEFAULT '[]'::jsonb;

UPDATE experience_drafts
SET promotion_selected_partner_ids = '[]'::jsonb
WHERE promotion_selected_partner_ids IS NULL;

UPDATE experience_drafts
SET promotion_external_invites = '[]'::jsonb
WHERE promotion_external_invites IS NULL;

UPDATE experience_drafts
SET promoter_enabled = false
WHERE promoter_enabled IS NULL;

UPDATE experiences
SET promotion_selected_partner_ids = '[]'::jsonb
WHERE promotion_selected_partner_ids IS NULL;

UPDATE experiences
SET promotion_external_invites = '[]'::jsonb
WHERE promotion_external_invites IS NULL;
