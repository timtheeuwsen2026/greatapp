-- Great vs Stripe check (Nov 2026). A booking whose payment is not in live
-- Stripe (made with the test key) is marked and left out of the money, and
-- every difference the check finds is kept for the admin list.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS test_payment boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS payment_differences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  difference_key varchar(160) NOT NULL UNIQUE,
  kind varchar(40) NOT NULL,
  booking_id varchar,
  experience_id varchar,
  stripe_payment_intent_id varchar,
  great_status varchar(30),
  stripe_status varchar(40),
  amount_cents integer NOT NULL DEFAULT 0,
  currency varchar(3),
  note text,
  auto_fixed boolean NOT NULL DEFAULT false,
  payment_created_at timestamp,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);

CREATE INDEX IF NOT EXISTS payment_differences_open_idx ON payment_differences (resolved_at, last_seen_at);
