-- Grandfather the creators who were already here when the tooling gate shipped.
--
-- `creator_profiles.approved` defaults to false and, until now, nothing ever
-- read it — every completed profile reached the builder regardless. Gating the
-- builder, the revenue calculator and the Partners tab on that column turns a
-- field nobody had ever set into a lock, and every existing creator would find
-- themselves suspended on the next deploy. The gate is there to stop a brand
-- new unverified account walking into the deal tooling, not to retroactively
-- shut out people already running events.
--
-- Guarded by a marker rather than a date, because the boot runner replays every
-- migration on every start: a date cutoff would keep silently auto-approving
-- anyone who signed up before it, which is exactly the hole the gate closes.

CREATE TABLE IF NOT EXISTS migration_markers (
  marker      varchar PRIMARY KEY,
  applied_at  timestamp NOT NULL DEFAULT now(),
  note        text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migration_markers WHERE marker = 'grandfather_creator_approvals'
  ) THEN
    UPDATE creator_profiles
       SET approved = true,
           updated_at = now()
     WHERE completed = true
       AND approved IS DISTINCT FROM true;

    INSERT INTO migration_markers (marker, note)
    VALUES (
      'grandfather_creator_approvals',
      'Approved every completed creator profile that predated the partner tooling gate. Runs once; new creators go through admin review.'
    );
  END IF;
END $$;
