-- Attendance milestones: "come to 10 of my runs and the t-shirt is yours".
--
-- Held against the organiser rather than an event, because that is what the
-- reward is about — a regular of Good Soles, not somebody who happened to book
-- one particular Sunday. Referral barters ("bring 3 friends") stay on the
-- experience; the two loops are separate on purpose.

CREATE TABLE IF NOT EXISTS creator_attendance_milestones (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id varchar NOT NULL REFERENCES users(id),
  target integer NOT NULL,
  -- instant: granted automatically. manual: the organiser hands it over using
  -- fulfillment_instructions. Physical items and service bookings are both
  -- "manual" because both are really just a conversation.
  reward_type varchar(20) NOT NULL DEFAULT 'manual',
  reward_description text NOT NULL,
  fulfillment_instructions text,
  active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_attendance_milestones_creator_idx
  ON creator_attendance_milestones(creator_id);

-- Who has reached one, and whether it has been handed over.
--
-- The attendance count itself is derived from bookings, not stored: a stored
-- counter drifts the first time a booking is cancelled. Only the handover
-- state needs to persist.
CREATE TABLE IF NOT EXISTS attendance_milestone_unlocks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id varchar NOT NULL REFERENCES creator_attendance_milestones(id),
  user_id varchar NOT NULL REFERENCES users(id),
  attended_count integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'unlocked',
  notes text,
  unlocked_at timestamp DEFAULT now(),
  fulfilled_at timestamp,
  fulfilled_by varchar REFERENCES users(id)
);

-- One unlock per person per milestone. Without this a re-run of the sweep
-- would hand somebody the same t-shirt every hour.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_milestone_unlocks_unique
  ON attendance_milestone_unlocks(milestone_id, user_id);
