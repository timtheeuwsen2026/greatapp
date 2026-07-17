ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS archived_at timestamp,
  ADD COLUMN IF NOT EXISTS archived_by varchar REFERENCES users(id);

CREATE TABLE IF NOT EXISTS perk_fulfillments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_experience_id varchar NOT NULL REFERENCES promoter_experiences(id),
  experience_id varchar NOT NULL REFERENCES experiences(id),
  beneficiary_id varchar NOT NULL REFERENCES users(id),
  promotion_deal_id varchar REFERENCES promotion_deals(id),
  referral_audience varchar(20) NOT NULL,
  deal_type varchar(30) NOT NULL DEFAULT 'milestone_barter',
  milestone_target integer NOT NULL,
  qualifying_bookings integer NOT NULL DEFAULT 0,
  reward_description text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'unlocked',
  notes text,
  unlocked_at timestamp DEFAULT now(),
  fulfilled_at timestamp,
  fulfilled_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS perk_fulfillments_promoter_experience_idx
  ON perk_fulfillments(promoter_experience_id);
CREATE INDEX IF NOT EXISTS perk_fulfillments_experience_idx
  ON perk_fulfillments(experience_id);
CREATE INDEX IF NOT EXISTS perk_fulfillments_status_idx
  ON perk_fulfillments(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perk_fulfillments_promoter_experience_id_fkey'
  ) THEN
    ALTER TABLE perk_fulfillments
      ADD CONSTRAINT perk_fulfillments_promoter_experience_id_fkey
      FOREIGN KEY (promoter_experience_id) REFERENCES promoter_experiences(id);
  END IF;
END $$;
