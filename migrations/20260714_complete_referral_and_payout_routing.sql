ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'paid';

ALTER TABLE promoter_experiences
  ADD COLUMN IF NOT EXISTS referral_audience varchar(20) NOT NULL DEFAULT 'participant',
  ADD COLUMN IF NOT EXISTS promotion_deal_id varchar;

ALTER TABLE promoter_experiences
  DROP CONSTRAINT IF EXISTS promoter_experiences_promoter_id_experience_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS promoter_experiences_user_experience_audience_idx
  ON promoter_experiences (promoter_id, experience_id, referral_audience);

CREATE INDEX IF NOT EXISTS promoter_experiences_promotion_deal_id_idx
  ON promoter_experiences (promotion_deal_id);

DO $$
BEGIN
  ALTER TABLE promoter_experiences
    ADD CONSTRAINT promoter_experiences_promotion_deal_id_fkey
    FOREIGN KEY (promotion_deal_id) REFERENCES promotion_deals(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_transfer_id varchar,
  ADD COLUMN IF NOT EXISTS commission_paid_at timestamp;

ALTER TABLE promoter_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id varchar,
  ADD COLUMN IF NOT EXISTS stripe_verification_status varchar DEFAULT 'pending';

ALTER TABLE experience_drafts ALTER COLUMN promoter_enabled SET DEFAULT true;
ALTER TABLE experiences ALTER COLUMN promoter_enabled SET DEFAULT true;

UPDATE experience_drafts
SET promoter_enabled = true
WHERE promoter_enabled IS NULL;

UPDATE experiences
SET promoter_enabled = true
WHERE promoter_enabled IS NULL;
