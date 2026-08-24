-- A right of reply on a review.
--
-- Reviews now roll up to a venue's public page and an organiser's public
-- profile, so the party being scored needs to be able to answer. One reply per
-- review, held on the row itself: a right of reply is not a conversation, and
-- an open thread is an argument in public.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamp,
  ADD COLUMN IF NOT EXISTS replied_by varchar REFERENCES users(id);

-- Both public pages read every review belonging to a venue's or an organiser's
-- events, which starts from the experience.
CREATE INDEX IF NOT EXISTS reviews_experience_id_idx
  ON reviews(experience_id);
