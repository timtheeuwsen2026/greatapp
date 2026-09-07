-- The rest of the September register: points 5, 7, 9 and 11.
--
-- Safe to re-run: every statement is guarded.

-- ── Point 9: venue sign-off on a participant perk ───────────────────────────
--
-- "Bring 3 friends, get a coffee at Bandido" spends the venue's product, not
-- the organiser's. Marked venue-backed, the perk travels with the venue
-- proposal and stays hidden from participants until the venue accepts.
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS participant_referral_venue_backed BOOLEAN DEFAULT FALSE;
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS participant_referral_venue_approved_at TIMESTAMP;

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS participant_referral_venue_backed BOOLEAN DEFAULT FALSE;
ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS participant_referral_venue_approved_at TIMESTAMP;

UPDATE experiences
SET participant_referral_venue_backed = FALSE
WHERE participant_referral_venue_backed IS NULL;
UPDATE experience_drafts
SET participant_referral_venue_backed = FALSE
WHERE participant_referral_venue_backed IS NULL;

-- Perks that already exist were set before anyone could mark them venue-backed,
-- so none of them is. Leaving them self-funded keeps every live event's perk
-- visible; retro-flagging them would silently pull promises off event pages
-- that participants have already been shown.

-- ── Point 11: a QR per ticket, and add-on redemption ────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_redeemed_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS addon_redeemed_by VARCHAR;

-- Backfill a token for every booking that predates them, so an existing
-- attendee can still be checked in and redeem what they bought. Postgres has no
-- gen_random_bytes without pgcrypto, so this is built from gen_random_uuid(),
-- which is already used for every primary key in this schema.
UPDATE bookings
SET qr_token = REPLACE(gen_random_uuid()::text, '-', '')
                 || REPLACE(gen_random_uuid()::text, '-', '')
WHERE qr_token IS NULL;

-- Unique rather than a plain index: the token is the only credential a scan
-- presents, so two bookings sharing one would check in the wrong person.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_qr_token_unique ON bookings(qr_token);

-- ── Point 7: verified attendance ────────────────────────────────────────────
--
-- Deliberately separate from the QR above. Casual events will not scan
-- consistently, so a turnout figure built on scan counts would under-report
-- every one of them; the organiser confirms attendance, and a scan is only one
-- of the ways to set it.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT 'unknown';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attendance_source VARCHAR(20);

UPDATE bookings SET attendance_status = 'unknown' WHERE attendance_status IS NULL;

-- Every turnout query filters on this, per event.
CREATE INDEX IF NOT EXISTS bookings_attendance_idx
  ON bookings(experience_id, attendance_status);

-- ── Point 5: a venue may counter an invite ──────────────────────────────────
--
-- Declining used to be the only way to say "not on those terms": the venue had
-- to decline, create an account separately, and wait for the organiser to start
-- a fresh proposal. A counter keeps it to one thread.
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS counter_model VARCHAR(50);
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS counter_value NUMERIC(10, 2);
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS counter_commitment_fee NUMERIC(10, 2);
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS counter_message TEXT;
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS countered_at TIMESTAMP;
