-- Creator approval, switchable (and off).
--
-- Every new creator waited on a manual admin approval before they could reach
-- the event builder. With onboardings picking up, that queue had one person
-- behind it, and a creator locked out on the day they meant to publish is how
-- a client ends up back on their old platform.
--
-- Off by default. The column is only created once, so an admin who switches
-- approval back on is not overridden when this replays on the next boot.
-- Existing approvals are not touched: nobody's access changes on deploy.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS creator_approval_required boolean DEFAULT false;
