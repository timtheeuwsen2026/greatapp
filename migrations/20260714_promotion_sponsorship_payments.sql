ALTER TABLE promotion_deals
  ADD COLUMN IF NOT EXISTS payment_status varchar(20),
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id varchar,
  ADD COLUMN IF NOT EXISTS paid_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS promotion_deals_checkout_session_idx
  ON promotion_deals (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE scheduled_payouts
  ADD COLUMN IF NOT EXISTS additional_gross_amount_cents integer NOT NULL DEFAULT 0;
