-- QA D-02: a single-day event's start and end time never survived a draft save.
--
-- `experiences` has had start_time / end_time from the beginning, but
-- `experience_drafts` never did. The builder posted the times, the ORM had no
-- column to put them in, and they were dropped without an error — so the date
-- came back after a reload and the times did not. Worse, the Dates step then
-- showed a green completion tick while the publication checklist on the Terms
-- step insisted both times were still required.
--
-- Times entered and submitted in one sitting always reached `experiences`
-- correctly, which is why this only ever bit creators who came back to a draft.
--
-- Safe to re-run: both statements are guarded.

ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS start_time VARCHAR;
ALTER TABLE experience_drafts ADD COLUMN IF NOT EXISTS end_time VARCHAR;
