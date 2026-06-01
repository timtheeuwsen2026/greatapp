-- ROLLBACK Script: Fix Services and Pricing Data
-- Date: 2025-01-27
-- Description: Rollback the services and pricing migration
-- WARNING: This will restore data from the backup table

-- ============================================================================
-- ROLLBACK PROCEDURE
-- ============================================================================

-- Verify backup table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'venues_backup_20250127'
  ) THEN
    RAISE EXCEPTION 'Backup table venues_backup_20250127 does not exist. Cannot rollback.';
  END IF;
END $$;

-- Display current state before rollback
SELECT 
  'CURRENT STATE (BEFORE ROLLBACK)' as status,
  COUNT(*) as total_venues,
  COUNT(CASE WHEN services IS NOT NULL THEN 1 END) as venues_with_services,
  COUNT(CASE WHEN default_itinerary IS NOT NULL THEN 1 END) as venues_with_itinerary
FROM venues;

-- Restore from backup
BEGIN;

-- Create a backup of current state (in case rollback needs to be rolled back)
DROP TABLE IF EXISTS venues_before_rollback CASCADE;
CREATE TABLE venues_before_rollback AS SELECT * FROM venues;

-- Delete all current venue data
DELETE FROM venues;

-- Restore from backup (only restore fields that existed in backup)
INSERT INTO venues (
  id, name, tagline, city, description, capacity, location, 
  friendly_address, logo_url, website, instagram, amenities,
  latitude, longitude, region, categories, vibes, custom_amenities,
  cover_image_url, gallery_images, cover_images, gallery_images_jsonb,
  slug, status, approved, services, pricing_model, currency, base_price,
  min_stay, deposit_percent, cancellation_policy, soft_hold_days,
  commission_percent, payment_model, google_calendar_connected,
  google_calendar_id, contact_person, contact_email, contact_phone,
  facebook, youtube, whatsapp, skype, timezone, approval_mode,
  commercial_model, soft_hold_policy_enabled, soft_hold_refundable_deposit,
  featured_weeks_to_fill, display_prefs, reviewed_by, reviewed_at,
  review_notes, created_by, created_at, updated_at
)
SELECT 
  id, name, tagline, city, description, capacity, location,
  friendly_address, logo_url, website, instagram, amenities,
  latitude, longitude, region, categories, vibes, custom_amenities,
  cover_image_url, gallery_images, cover_images, gallery_images_jsonb,
  slug, status, approved, services, pricing_model, currency, base_price,
  min_stay, deposit_percent, cancellation_policy, soft_hold_days,
  commission_percent, payment_model, google_calendar_connected,
  google_calendar_id, contact_person, contact_email, contact_phone,
  facebook, youtube, whatsapp, skype, timezone, approval_mode,
  commercial_model, soft_hold_policy_enabled, soft_hold_refundable_deposit,
  featured_weeks_to_fill, display_prefs, reviewed_by, reviewed_at,
  review_notes, created_by, created_at, updated_at
FROM venues_backup_20250127;

-- Remove default_itinerary column if it was added by migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venues' AND column_name = 'default_itinerary'
  ) THEN
    ALTER TABLE venues DROP COLUMN IF EXISTS default_itinerary;
    RAISE NOTICE 'Removed default_itinerary column from venues table';
  END IF;
END $$;

COMMIT;

-- Display state after rollback
SELECT 
  'STATE AFTER ROLLBACK' as status,
  COUNT(*) as total_venues,
  COUNT(CASE WHEN services IS NOT NULL THEN 1 END) as venues_with_services
FROM venues;

-- Success message
DO $$
DECLARE
  rollback_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rollback_count FROM venues;
  RAISE NOTICE 'ROLLBACK COMPLETE: Restored % venues from backup', rollback_count;
  RAISE NOTICE 'Backup of pre-rollback state saved as venues_before_rollback';
END $$;
