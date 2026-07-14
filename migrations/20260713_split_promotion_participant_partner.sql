ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS participant_referral_deal_type varchar,
  ADD COLUMN IF NOT EXISTS participant_referral_commission_pct numeric(5, 2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS participant_referral_milestone_attendee_target integer,
  ADD COLUMN IF NOT EXISTS participant_referral_milestone_reward_description text;

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS participant_referral_deal_type varchar,
  ADD COLUMN IF NOT EXISTS participant_referral_commission_pct numeric(5, 2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS participant_referral_milestone_attendee_target integer,
  ADD COLUMN IF NOT EXISTS participant_referral_milestone_reward_description text;

UPDATE experience_drafts
SET participant_referral_deal_type = promotion_deal_type
WHERE participant_referral_deal_type IS NULL
  AND promotion_deal_type IN ('commission_per_ticket', 'milestone_barter');

UPDATE experiences
SET participant_referral_deal_type = promotion_deal_type
WHERE participant_referral_deal_type IS NULL
  AND promotion_deal_type IN ('commission_per_ticket', 'milestone_barter');

UPDATE experience_drafts
SET participant_referral_commission_pct = influencer_commission_pct
WHERE participant_referral_deal_type = 'commission_per_ticket'
  AND (participant_referral_commission_pct IS NULL OR participant_referral_commission_pct = 0)
  AND influencer_commission_pct IS NOT NULL;

UPDATE experiences
SET participant_referral_commission_pct = influencer_commission_pct
WHERE participant_referral_deal_type = 'commission_per_ticket'
  AND (participant_referral_commission_pct IS NULL OR participant_referral_commission_pct = 0)
  AND influencer_commission_pct IS NOT NULL;

UPDATE experience_drafts
SET participant_referral_milestone_attendee_target = promotion_milestone_attendee_target,
    participant_referral_milestone_reward_description = COALESCE(
      participant_referral_milestone_reward_description,
      'Free ticket reward'
    )
WHERE participant_referral_deal_type = 'milestone_barter'
  AND participant_referral_milestone_attendee_target IS NULL;

UPDATE experiences
SET participant_referral_milestone_attendee_target = promotion_milestone_attendee_target,
    participant_referral_milestone_reward_description = COALESCE(
      participant_referral_milestone_reward_description,
      'Free ticket reward'
    )
WHERE participant_referral_deal_type = 'milestone_barter'
  AND participant_referral_milestone_attendee_target IS NULL;

UPDATE experience_drafts
SET promoter_enabled = true
WHERE promoter_enabled IS NULL;

UPDATE experiences
SET promoter_enabled = true
WHERE promoter_enabled IS NULL;
