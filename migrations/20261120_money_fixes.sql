-- Money fixes (Tim, point 3 of week 1: 66.18, 66.28, 66.29, 66.30). Runs on
-- every boot: every statement is idempotent.

-- 1. Venue deals of events that will not take place (66.10a/b, 66.28d): an
-- open offer is withdrawn, an agreed deal is cancelled. TEST 4 stayed a
-- "Pending" offer and TEST 1 and 2 stayed "Accepted" after cancellation.
UPDATE venue_contracts vc
SET status = CASE WHEN vc.status = 'accepted' THEN 'cancelled' ELSE 'withdrawn' END,
    updated_at = now()
FROM experiences e
WHERE e.id = vc.experience_id
  AND (e.status = 'cancelled' OR e.cancelled_at IS NOT NULL)
  AND vc.status IN ('pending', 'countered', 'accepted');

UPDATE venue_offers vo
SET status = 'declined', updated_at = now()
FROM experiences e
WHERE e.id = vo.experience_id
  AND (e.status = 'cancelled' OR e.cancelled_at IS NOT NULL)
  AND vo.status IN ('pending', 'admin_review');

-- 2. A cancelled event is never paid out (66.18b).
UPDATE scheduled_payouts sp
SET status = 'cancelled', error_message = 'Event cancelled — no payout', processed_at = COALESCE(sp.processed_at, now())
FROM experiences e
WHERE e.id = sp.experience_id
  AND (e.status = 'cancelled' OR e.cancelled_at IS NOT NULL)
  AND sp.status IN ('pending', 'failed');

-- 3. A free event has no payout (66.29d): a "€0.00 scheduled" or "paid €0.00"
-- row where nothing was collected and nothing was ever transferred.
UPDATE scheduled_payouts sp
SET status = 'cancelled', error_message = 'Free event, no payout: nothing was collected.', processed_at = COALESCE(sp.processed_at, now())
WHERE sp.status IN ('pending', 'completed')
  AND COALESCE(sp.total_gross_amount_cents, 0) + COALESCE(sp.additional_gross_amount_cents, 0) = 0
  AND (sp.stripe_transfer_ids IS NULL OR sp.stripe_transfer_ids::text IN ('{}', 'null'))
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.experience_id = sp.experience_id
      AND b.status IN ('confirmed', 'fully_paid', 'deposit_paid')
      AND COALESCE(b.amount, 0) > 0
      AND COALESCE(b.test_payment, false) = false
  );
