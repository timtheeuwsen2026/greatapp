-- Venue Invites: tokenised claim links for "Invite External Venue".
--
-- The invitation email used to link to the public event page, so an off-platform
-- venue had no way to claim their space or answer the proposed deal. Each invite
-- now gets its own row and unguessable token backing /venue-invite/:token.

CREATE TABLE IF NOT EXISTS venue_invites (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  token varchar(64) NOT NULL UNIQUE,
  experience_id varchar NOT NULL REFERENCES experiences(id),
  creator_id varchar NOT NULL REFERENCES users(id),

  email varchar NOT NULL,
  contact_name varchar,
  venue_name varchar,
  venue_address varchar,
  venue_city varchar,
  venue_description text,
  venue_capacity integer,
  property_url text,

  proposed_model varchar(50),
  proposed_value numeric(10, 2),
  currency varchar(10) DEFAULT 'eur',

  status varchar(20) DEFAULT 'pending',
  claimed_by_user_id varchar REFERENCES users(id),
  claimed_venue_id varchar REFERENCES venues(id),
  decline_reason text,
  claimed_at timestamp,
  responded_at timestamp,
  expires_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- The landing page looks an invite up by token on every visit.
CREATE INDEX IF NOT EXISTS venue_invites_token_idx ON venue_invites (token);

-- The creator's dashboard lists outstanding invites per event.
CREATE INDEX IF NOT EXISTS venue_invites_experience_idx ON venue_invites (experience_id);

-- Re-inviting the same venue for the same event reuses the pending invite
-- instead of stacking up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS venue_invites_experience_email_idx
  ON venue_invites (experience_id, lower(email));
