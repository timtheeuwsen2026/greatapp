-- Start time and time zone (Tim's point 66.21, Nov 2026).
-- One start and end moment per event, in its city's time; the minimum-group
-- deadline counts back from the start; the payout runs 24 hours after the end.

-- The builder now sets the deadline in hours before the start.
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS mvg_deadline_hours integer;

-- Upcoming minimum-group events still carry a deadline at 23:59 UTC (00:59 in
-- Barcelona). The organisers chose that day, so it stays: the deadline becomes
-- the end of the same day in the city's own time, and never later than the
-- start, when sales close. New events count hours back from the start time.
-- Once per event (the flag), and never into the past or the next hour, so no
-- group is refunded early by this change.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS mvg_deadline_local boolean DEFAULT false;

WITH timing AS (
  SELECT e.id,
    LEAST(
      ((date(e.mvg_deadline AT TIME ZONE 'UTC') + time '23:59:59')
        AT TIME ZONE CASE WHEN lower(coalesce(e.city, '')) = 'amsterdam' THEN 'Europe/Amsterdam' ELSE 'Europe/Madrid' END),
      ((date(e.start_date)
        + CASE WHEN e.start_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
               THEN substring(e.start_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
               ELSE time '00:00' END)
        AT TIME ZONE CASE WHEN lower(coalesce(e.city, '')) = 'amsterdam' THEN 'Europe/Amsterdam' ELSE 'Europe/Madrid' END)
    ) AS new_deadline
  FROM experiences e
  WHERE e.mvg_deadline_local IS NOT TRUE
    AND e.require_minimum_participants = true
    AND e.mvg_status = 'pending'
    AND e.mvg_resolved_at IS NULL
    AND e.mvg_failed_at IS NULL
    AND e.mvg_deadline IS NOT NULL
    AND e.start_date IS NOT NULL
)
UPDATE experiences e
SET mvg_deadline = t.new_deadline
FROM timing t
WHERE e.id = t.id
  AND t.new_deadline > now() + interval '1 hour';

UPDATE experiences SET mvg_deadline_local = true WHERE mvg_deadline_local IS NOT TRUE;
ALTER TABLE experiences ALTER COLUMN mvg_deadline_local SET DEFAULT true;

-- Waiting payouts: 24 hours after the event's real end time in its city
-- (TEST 3 ran at 13:00 instead of 01:00). Only payouts still in the future,
-- and only to a moment still in the future.
WITH ends AS (
  SELECT p.id,
    ((date(coalesce(e.end_date, e.start_date))
      + CASE WHEN e.end_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
             THEN substring(e.end_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
             ELSE time '23:59:59' END)
      AT TIME ZONE CASE WHEN lower(coalesce(e.city, '')) = 'amsterdam' THEN 'Europe/Amsterdam' ELSE 'Europe/Madrid' END
    ) AT TIME ZONE 'UTC' AS ends_at,
    e.start_time, e.end_time
  FROM scheduled_payouts p
  JOIN experiences e ON e.id = p.experience_id
  WHERE p.status = 'pending'
    AND p.scheduled_for > (now() AT TIME ZONE 'UTC')
)
UPDATE scheduled_payouts p
SET scheduled_for = x.ends_at
  -- An evening that runs past midnight ends the next day.
  + CASE WHEN x.start_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
          AND x.end_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
          AND substring(x.end_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
              <= substring(x.start_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
         THEN interval '1 day' ELSE interval '0' END
  + interval '24 hours'
FROM ends x
WHERE p.id = x.id
  AND x.ends_at + interval '24 hours' > (now() AT TIME ZONE 'UTC')
  AND p.scheduled_for IS DISTINCT FROM x.ends_at + interval '24 hours'
    + CASE WHEN x.start_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
            AND x.end_time ~ '^\s*([01]?[0-9]|2[0-3]):[0-5][0-9]'
            AND substring(x.end_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
                <= substring(x.start_time from '^\s*([0-9]{1,2}:[0-9]{2})')::time
           THEN interval '1 day' ELSE interval '0' END;
