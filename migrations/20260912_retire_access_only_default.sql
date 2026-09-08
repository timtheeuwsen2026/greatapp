-- QA C-06: "Access-Only / Pay-at-Counter" keeps surfacing on the venue side.
--
-- The model was retired from every dropdown, but venue_compensation_model still
-- DEFAULTS to it, so every experience is born carrying a retired model and any
-- surface that prints the raw value shows it. On production every open event
-- has venue_compensation_model = 'access_only' purely because nothing ever
-- overwrote the default.
--
-- The default becomes revenue_share, which is the first option every builder
-- offers. Existing rows are deliberately NOT rewritten: one open event has
-- access_only as a genuine target deal, and silently converting somebody's
-- agreed terms is not a formatting fix. The UI already refuses to offer a
-- retired model; this stops new rows acquiring one.
--
-- Safe to re-run.
ALTER TABLE experiences ALTER COLUMN venue_compensation_model SET DEFAULT 'revenue_share';
ALTER TABLE experience_drafts ALTER COLUMN venue_compensation_model SET DEFAULT 'revenue_share';
