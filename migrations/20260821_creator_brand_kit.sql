-- Creator brand kit: a square and a vertical image the creator owns.
--
-- profilePhoto is a cropped circular avatar and cannot stand in for a
-- shareable graphic, so the participant share kit had nothing of the
-- organiser's to put on a post. These hold the two shapes the social
-- platforms actually accept — 1:1 for a feed post, 9:16 for a story.

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS brand_kit_square_url varchar,
  ADD COLUMN IF NOT EXISTS brand_kit_vertical_url varchar;
