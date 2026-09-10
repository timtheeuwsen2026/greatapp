-- Deal Rooms: B2B negotiation between two matched partners.
--
-- Separate from experience_messages on purpose. That table is the event's
-- participant chat: many people, one event, general chatter. This is two
-- businesses agreeing money about one specific offer, and it carries
-- structured counter-proposals the app can act on rather than prose someone
-- has to read and interpret.
--
-- Written to be re-runnable: the boot migration runner applies every file on
-- every start.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_room_subject') THEN
    CREATE TYPE deal_room_subject AS ENUM (
      'venue_offer', 'collab_idea', 'open_event', 'flash_deal', 'promotion_deal'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_room_status') THEN
    CREATE TYPE deal_room_status AS ENUM ('open', 'agreed', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_room_message_kind') THEN
    CREATE TYPE deal_room_message_kind AS ENUM ('message', 'proposal', 'system');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_room_proposal_status') THEN
    CREATE TYPE deal_room_proposal_status AS ENUM ('open', 'accepted', 'declined', 'superseded');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deal_rooms (
  id                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type      deal_room_subject NOT NULL,
  subject_id        varchar NOT NULL,
  experience_id     varchar REFERENCES experiences(id) ON DELETE SET NULL,
  venue_id          varchar REFERENCES venues(id) ON DELETE SET NULL,
  initiator_id      varchar NOT NULL REFERENCES users(id),
  counterpart_id    varchar NOT NULL REFERENCES users(id),
  initiator_role    varchar(30),
  counterpart_role  varchar(30),
  title             varchar NOT NULL,
  status            deal_room_status DEFAULT 'open',
  current_terms     jsonb DEFAULT '{}'::jsonb,
  last_message_at   timestamp DEFAULT now(),
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);

-- One room per subject per pair: a second "I'm interested" reopens the
-- conversation instead of stacking a parallel one neither side can see.
CREATE UNIQUE INDEX IF NOT EXISTS deal_rooms_subject_pair_unique
  ON deal_rooms (subject_type, subject_id, initiator_id, counterpart_id);
CREATE INDEX IF NOT EXISTS deal_rooms_initiator_idx ON deal_rooms (initiator_id);
CREATE INDEX IF NOT EXISTS deal_rooms_counterpart_idx ON deal_rooms (counterpart_id);

CREATE TABLE IF NOT EXISTS deal_room_messages (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          varchar NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  sender_id        varchar REFERENCES users(id) ON DELETE CASCADE,
  kind             deal_room_message_kind DEFAULT 'message',
  body             text,
  proposal         jsonb DEFAULT '{}'::jsonb,
  proposal_status  deal_room_proposal_status,
  created_at       timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_room_messages_room_idx
  ON deal_room_messages (room_id, created_at);

CREATE TABLE IF NOT EXISTS deal_room_reads (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       varchar NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,
  user_id       varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at  timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_room_reads_room_user_unique
  ON deal_room_reads (room_id, user_id);
