CREATE TABLE IF NOT EXISTS promotion_deals (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id varchar NOT NULL REFERENCES experiences(id),
  creator_id varchar NOT NULL REFERENCES users(id),
  partner_id varchar REFERENCES users(id),
  partner_email varchar,
  partner_name varchar,
  source varchar(20) NOT NULL,
  deal_type varchar(30) NOT NULL,
  baseline_terms jsonb DEFAULT '{}'::jsonb,
  terms jsonb DEFAULT '{}'::jsonb,
  status varchar(20) DEFAULT 'pending',
  pending_action_by varchar(10) DEFAULT 'partner',
  counter_message text,
  responded_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotion_deals_experience_id_idx ON promotion_deals (experience_id);
CREATE INDEX IF NOT EXISTS promotion_deals_partner_id_idx ON promotion_deals (partner_id);
CREATE INDEX IF NOT EXISTS promotion_deals_creator_id_idx ON promotion_deals (creator_id);
