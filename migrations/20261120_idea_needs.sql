-- New builder, idea phase screens 3 to 6 (Create flow point 26). Runs on every
-- boot: every statement is idempotent.

-- "Post to board" and "Invite directly" are separate choices. A posting made
-- only to carry direct invites must not show on the Collab board. Every row
-- that exists today was posted to the board, hence the default.
ALTER TABLE collab_ideas ADD COLUMN IF NOT EXISTS listed boolean NOT NULL DEFAULT true;

-- The event draft the posting belongs to. An open slot is part of the event,
-- not a separate object: the idea flow writes the posting from the draft and
-- updates the same row when the organiser sends again.
ALTER TABLE collab_ideas ADD COLUMN IF NOT EXISTS experience_draft_id varchar;
CREATE INDEX IF NOT EXISTS collab_ideas_experience_draft_id_idx ON collab_ideas (experience_draft_id);
