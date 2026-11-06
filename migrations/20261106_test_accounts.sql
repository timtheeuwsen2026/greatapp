-- Test accounts (Nov 2026): the owner's own bookings must not create partner
-- payouts. Tim's account is the first; his earlier bookings are marked too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_account boolean DEFAULT false;
UPDATE users SET test_account = true WHERE id = 'c6b3e68b-41cb-4259-8cb4-72d2e64bd9eb' AND test_account IS DISTINCT FROM true;
UPDATE bookings SET test_payment = true,
  commission_status = CASE WHEN commission_status IN ('estimated', 'locked') THEN 'voided'::commission_status ELSE commission_status END
WHERE user_id = 'c6b3e68b-41cb-4259-8cb4-72d2e64bd9eb' AND test_payment IS DISTINCT FROM true;
