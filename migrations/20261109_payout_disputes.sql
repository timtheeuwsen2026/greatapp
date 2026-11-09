-- Step 2 payouts (Nov 2026): a disputed payment is left out of the event's
-- payout until the dispute is won.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS disputed_at timestamp;
