-- Collab Ideas — the stage before an event exists.
--
-- Open Events and direct offers both need a fully-built event before a
-- counterparty sees anything, so a rough idea had nowhere to live: "a four-day
-- wellness retreat, Costa Brava, 12-16 people, some time in October or
-- November". A retreat is agreed months ahead and on a period rather than a
-- date, so insisting on a fixed date first kept those conversations off the
-- platform.
--
-- Posting one is not a booking. It stays open until it converts into a real
-- event, at which point the ordinary experience takes over and the idea is
-- marked matched.
--
-- Safe to re-run: every statement is guarded.

CREATE TABLE IF NOT EXISTS collab_ideas (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id VARCHAR NOT NULL REFERENCES users(id),
  poster_role VARCHAR(30) NOT NULL,

  title VARCHAR NOT NULL,
  description TEXT,
  seeking_partner_type VARCHAR(30) NOT NULL,
  audience VARCHAR,

  -- The fields the match query filters on.
  city VARCHAR,
  region VARCHAR,
  venue_category VARCHAR,
  group_size_min INTEGER,
  group_size_max INTEGER,

  -- A period, not a date.
  estimated_start TIMESTAMP,
  estimated_end TIMESTAMP,

  deal_preference VARCHAR,

  status VARCHAR(20) DEFAULT 'open',
  converted_experience_id VARCHAR REFERENCES experiences(id),
  expires_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collab_idea_responses (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id VARCHAR NOT NULL REFERENCES collab_ideas(id),
  responder_id VARCHAR NOT NULL REFERENCES users(id),
  responder_role VARCHAR(30),
  venue_id VARCHAR REFERENCES venues(id),
  message TEXT,
  status VARCHAR(20) DEFAULT 'interested',
  created_at TIMESTAMP DEFAULT NOW()
);

-- One expression of interest per person per idea: a second click should reopen
-- the conversation, not stack duplicates in the poster's inbox.
CREATE UNIQUE INDEX IF NOT EXISTS collab_idea_responses_unique_responder
  ON collab_idea_responses (idea_id, responder_id);

-- The feed reads open ideas newest-first; the poster's own "My Open Postings"
-- view reads their own.
CREATE INDEX IF NOT EXISTS collab_ideas_status_created_idx
  ON collab_ideas (status, created_at DESC);
CREATE INDEX IF NOT EXISTS collab_ideas_poster_idx
  ON collab_ideas (poster_id, status);
