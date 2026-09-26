ALTER TABLE experiences ADD COLUMN IF NOT EXISTS ticket_platform_fee_pct numeric(5,2);
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS addon_platform_fee_pct numeric(5,2) DEFAULT 0;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS platform_fees_updated_at timestamp;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS platform_fees_updated_by varchar;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_platform_fee_pct numeric(5,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_platform_fee_pct numeric(5,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_items jsonb DEFAULT '[]'::jsonb;

-- Freeze existing bookings at the fee in force before separate add-on rates.
-- New checkout always saves both rates, so repeating this migration is safe.
UPDATE bookings b SET
  ticket_platform_fee_pct = COALESCE(b.ticket_platform_fee_pct, e.platform_pct, 15),
  addon_platform_fee_pct = COALESCE(b.addon_platform_fee_pct, e.platform_pct, 15)
FROM experiences e
WHERE b.experience_id = e.id
  AND (b.ticket_platform_fee_pct IS NULL OR b.addon_platform_fee_pct IS NULL);
