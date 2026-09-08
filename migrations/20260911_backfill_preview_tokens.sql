-- QA B-01: a creator could not open their own pending experience.
--
-- The detail endpoint has always accepted ?preview=<token> for a pending
-- experience, but nothing ever minted one: on production, not a single row in
-- any status had a preview_token. So the only route in was for req.user to
-- resolve on what is otherwise a public endpoint, and when it did not the
-- creator got a bare 404 on their own event -- "Failed to load experience
-- details" -- with a Preview button that pointed straight at it.
--
-- New submissions now mint a token in the application. This backfills the rows
-- that already exist so their Preview links start working immediately.
--
-- Published and approved experiences are public anyway and need no token; the
-- backfill is limited to the states where one is actually the way in.
--
-- Safe to re-run: only ever fills a NULL.
UPDATE experiences
SET preview_token = encode(gen_random_bytes(32), 'hex')
WHERE preview_token IS NULL
  AND status IN ('pending', 'pending_approval', 'draft');
