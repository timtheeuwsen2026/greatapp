-- Prevent concurrent checkout retries from creating two bookings for one charge.
-- Kept separate from email startup migration because existing duplicate payment
-- intents must be resolved before this constraint can be applied safely.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_unique
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
