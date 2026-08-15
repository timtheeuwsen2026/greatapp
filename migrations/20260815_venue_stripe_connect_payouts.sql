-- Venue payouts via Stripe Connect.
--
-- venues already carried stripe_customer_id / stripe_payment_method_id, but those
-- are the charging side of venue-sponsored deals. There was nowhere to record the
-- account a venue is PAID INTO, so the payout scheduler resolved a venue's share
-- through the owner's creator profile — a row a venue-only account never has.
-- Every venue therefore fell out of the split silently.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS stripe_account_id varchar,
  ADD COLUMN IF NOT EXISTS stripe_verification_status varchar DEFAULT 'unverified';

-- account.updated arrives keyed only by the Stripe account id, so the webhook has
-- to find the venue by that value on every Connect event.
CREATE INDEX IF NOT EXISTS venues_stripe_account_id_idx
  ON venues(stripe_account_id);

-- Backfill: a venue owner who connected through the creator dashboard before this
-- existed already has a usable account on their creator profile. Adopt it so they
-- do not have to onboard a second time.
UPDATE venues v
SET stripe_account_id = cp.stripe_account_id,
    stripe_verification_status = COALESCE(cp.stripe_verification_status, 'unverified')
FROM creator_profiles cp
WHERE cp.user_id = v.created_by
  AND cp.stripe_account_id IS NOT NULL
  AND v.stripe_account_id IS NULL;
