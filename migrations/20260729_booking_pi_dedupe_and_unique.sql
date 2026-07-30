-- One booking per PaymentIntent, enforced by the database.
--
-- The idempotency guard in booking creation is read-then-insert, so concurrent
-- creators (in-page checkout, the confirmation page's recovery, the stranded-
-- payment reconciler) could each insert a booking for the same charge. The
-- unique index from 20260718 was written for this but had not been applied.
-- This migration removes the duplicates it was blocked on, then applies it.

-- Duplicates: keep the earliest booking per PaymentIntent. Email-ledger rows
-- reference bookings, so clear those for the rows being dropped first.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_payment_intent_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM bookings
  WHERE stripe_payment_intent_id IS NOT NULL
),
losers AS (SELECT id FROM ranked WHERE rn > 1)
DELETE FROM booking_email_events WHERE booking_id IN (SELECT id FROM losers);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_payment_intent_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM bookings
  WHERE stripe_payment_intent_id IS NOT NULL
)
DELETE FROM bookings WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_payment_intent_unique
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
