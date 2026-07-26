ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ticket_quantity integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_ticket_quantity_positive'
      AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_ticket_quantity_positive
      CHECK (ticket_quantity > 0);
  END IF;
END $$;
