ALTER TABLE promoter_experiences
  ADD COLUMN IF NOT EXISTS share_token varchar;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promoter_experience_id varchar;

ALTER TABLE referral_clicks
  ADD COLUMN IF NOT EXISTS promoter_experience_id varchar;

UPDATE promoter_experiences
SET share_token = id
WHERE share_token IS NULL;

UPDATE bookings AS b
SET promoter_experience_id = pe.id
FROM promoter_experiences AS pe
WHERE b.promoter_experience_id IS NULL
  AND b.promoter_id = pe.promoter_id
  AND b.experience_id = pe.experience_id;

UPDATE referral_clicks AS rc
SET promoter_experience_id = pe.id
FROM promoter_experiences AS pe
WHERE rc.promoter_experience_id IS NULL
  AND rc.promoter_id = pe.promoter_id
  AND rc.experience_id = pe.experience_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'promoter_experiences_share_token_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX promoter_experiences_share_token_unique_idx
      ON promoter_experiences (share_token);
  END IF;
END $$;
