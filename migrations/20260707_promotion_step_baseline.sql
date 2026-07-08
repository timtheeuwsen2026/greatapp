ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS promotion_deal_type varchar,
  ADD COLUMN IF NOT EXISTS promotion_milestone_attendee_target integer,
  ADD COLUMN IF NOT EXISTS promotion_milestone_reward_tickets integer,
  ADD COLUMN IF NOT EXISTS promotion_brand_pitch text,
  ADD COLUMN IF NOT EXISTS promotion_sponsorship_amount numeric(10, 2);

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS promotion_deal_type varchar,
  ADD COLUMN IF NOT EXISTS promotion_milestone_attendee_target integer,
  ADD COLUMN IF NOT EXISTS promotion_milestone_reward_tickets integer,
  ADD COLUMN IF NOT EXISTS promotion_brand_pitch text,
  ADD COLUMN IF NOT EXISTS promotion_sponsorship_amount numeric(10, 2);

UPDATE experience_drafts
SET promotion_deal_type = 'commission_per_ticket'
WHERE promotion_deal_type IS NULL
  AND influencer_promotion_enabled = true;

UPDATE experiences
SET promotion_deal_type = 'commission_per_ticket'
WHERE promotion_deal_type IS NULL
  AND influencer_promotion_enabled = true;

UPDATE experience_drafts
SET current_step = current_step + 1
WHERE current_step >= 8;
