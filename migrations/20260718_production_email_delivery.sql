CREATE TABLE IF NOT EXISTS email_preferences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar NOT NULL,
  community_emails_enabled boolean NOT NULL DEFAULT true,
  reminder_emails_enabled boolean NOT NULL DEFAULT true,
  marketing_emails_enabled boolean NOT NULL DEFAULT true,
  unsubscribed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_preferences_email_unique
  ON email_preferences (email);

CREATE TABLE IF NOT EXISTS email_notification_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar NOT NULL,
  email_type varchar NOT NULL,
  category varchar NOT NULL DEFAULT 'transactional',
  recipient_email varchar,
  status varchar NOT NULL DEFAULT 'scheduled',
  scheduled_for timestamp NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp,
  sent_at timestamp,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_notification_events_event_key_unique
  ON email_notification_events (event_key);

CREATE INDEX IF NOT EXISTS email_notification_events_due_idx
  ON email_notification_events (status, scheduled_for);

CREATE INDEX IF NOT EXISTS email_notification_events_recipient_idx
  ON email_notification_events (recipient_email);
