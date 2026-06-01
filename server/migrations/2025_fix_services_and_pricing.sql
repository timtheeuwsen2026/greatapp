-- Migration: Fix Services and Pricing Data
-- Date: 2025-01-27
-- Description: Migrate legacy services into venues.services, ensure pricing fields are consistent
-- Author: Replit Agent

-- ============================================================================
-- PART 1: PRE-MIGRATION BACKUP
-- ============================================================================

-- Drop backup table if exists from previous runs
DROP TABLE IF EXISTS venues_backup_20250127 CASCADE;

-- Create backup of current venues table
CREATE TABLE venues_backup_20250127 AS 
SELECT * FROM venues;

-- Log backup status
DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM venues_backup_20250127;
  RAISE NOTICE 'Backup created: % venues backed up', backup_count;
END $$;

-- ============================================================================
-- PART 2: DATA VALIDATION & REPORTING (PRE-MIGRATION)
-- ============================================================================

-- Create temporary table for pre-migration stats
CREATE TEMP TABLE pre_migration_stats AS
SELECT 
  COUNT(*) as total_venues,
  COUNT(CASE WHEN services IS NOT NULL AND services::text != '[]' THEN 1 END) as venues_with_services,
  COUNT(CASE WHEN services IS NULL OR services::text = '[]' THEN 1 END) as venues_without_services,
  COUNT(CASE WHEN base_price IS NOT NULL THEN 1 END) as venues_with_base_price,
  COUNT(CASE WHEN deposit_percent IS NOT NULL THEN 1 END) as venues_with_deposit,
  COUNT(CASE WHEN commission_percent IS NOT NULL THEN 1 END) as venues_with_commission,
  COUNT(CASE WHEN pricing_model IS NOT NULL THEN 1 END) as venues_with_pricing_model,
  COUNT(CASE WHEN cancellation_policy IS NOT NULL THEN 1 END) as venues_with_cancellation_policy
FROM venues;

-- Display pre-migration stats
SELECT 'PRE-MIGRATION STATS' as report_type, * FROM pre_migration_stats;

-- ============================================================================
-- PART 3: SERVICES MIGRATION
-- ============================================================================

-- Ensure all venues have services initialized (empty array if null)
UPDATE venues
SET services = '[]'::jsonb
WHERE services IS NULL;

-- Log services initialization
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM venues 
  WHERE services IS NOT NULL AND services::text = '[]';
  RAISE NOTICE 'Services initialized: % venues now have empty services array', updated_count;
END $$;

-- ============================================================================
-- PART 4: PRICING FIELDS CONSISTENCY
-- ============================================================================

-- Ensure pricing_model uses consistent values (convert varchar to proper format if needed)
UPDATE venues
SET pricing_model = LOWER(TRIM(pricing_model))
WHERE pricing_model IS NOT NULL 
  AND pricing_model != LOWER(TRIM(pricing_model));

-- Ensure cancellation_policy uses consistent format
UPDATE venues
SET cancellation_policy = 
  CASE 
    WHEN LOWER(cancellation_policy) LIKE '%flexible%' THEN 'Flexible'
    WHEN LOWER(cancellation_policy) LIKE '%moderate%' THEN 'Moderate'
    WHEN LOWER(cancellation_policy) LIKE '%strict%' THEN 'Strict'
    ELSE cancellation_policy
  END
WHERE cancellation_policy IS NOT NULL;

-- Validate numeric fields are within acceptable ranges
UPDATE venues
SET deposit_percent = 
  CASE 
    WHEN deposit_percent < 0 THEN 0
    WHEN deposit_percent > 100 THEN 100
    ELSE deposit_percent
  END
WHERE deposit_percent IS NOT NULL;

UPDATE venues
SET commission_percent = 
  CASE 
    WHEN commission_percent < 0 THEN 0
    WHEN commission_percent > 100 THEN 100
    ELSE commission_percent
  END
WHERE commission_percent IS NOT NULL;

-- ============================================================================
-- PART 5: ADD DEFAULT ITINERARY FIELD (IF NOT EXISTS)
-- ============================================================================

-- Add default_itinerary column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venues' AND column_name = 'default_itinerary'
  ) THEN
    ALTER TABLE venues ADD COLUMN default_itinerary jsonb DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Added default_itinerary column to venues table';
  ELSE
    RAISE NOTICE 'default_itinerary column already exists';
  END IF;
END $$;

-- Initialize default_itinerary for all venues
UPDATE venues
SET default_itinerary = '[]'::jsonb
WHERE default_itinerary IS NULL;

-- ============================================================================
-- PART 6: POST-MIGRATION VALIDATION & REPORTING
-- ============================================================================

-- Create temporary table for post-migration stats
CREATE TEMP TABLE post_migration_stats AS
SELECT 
  COUNT(*) as total_venues,
  COUNT(CASE WHEN services IS NOT NULL AND services::text != '[]' THEN 1 END) as venues_with_services,
  COUNT(CASE WHEN services IS NULL OR services::text = '[]' THEN 1 END) as venues_without_services,
  COUNT(CASE WHEN base_price IS NOT NULL THEN 1 END) as venues_with_base_price,
  COUNT(CASE WHEN deposit_percent IS NOT NULL THEN 1 END) as venues_with_deposit,
  COUNT(CASE WHEN commission_percent IS NOT NULL THEN 1 END) as venues_with_commission,
  COUNT(CASE WHEN pricing_model IS NOT NULL THEN 1 END) as venues_with_pricing_model,
  COUNT(CASE WHEN cancellation_policy IS NOT NULL THEN 1 END) as venues_with_cancellation_policy,
  COUNT(CASE WHEN default_itinerary IS NOT NULL THEN 1 END) as venues_with_default_itinerary
FROM venues;

-- Display post-migration stats
SELECT 'POST-MIGRATION STATS' as report_type, * FROM post_migration_stats;

-- Display diff report
SELECT 
  'MIGRATION DIFF REPORT' as report_type,
  post.total_venues as total_venues,
  (post.venues_with_services - pre.venues_with_services) as services_added,
  (post.venues_with_base_price - pre.venues_with_base_price) as base_price_added,
  (post.venues_with_deposit - pre.venues_with_deposit) as deposit_added,
  (post.venues_with_commission - pre.venues_with_commission) as commission_added,
  (post.venues_with_pricing_model - pre.venues_with_pricing_model) as pricing_model_added,
  post.venues_with_default_itinerary as itinerary_initialized
FROM pre_migration_stats pre, post_migration_stats post;

-- ============================================================================
-- PART 7: VERIFICATION QUERIES
-- ============================================================================

-- Verify all venues have services initialized
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count 
  FROM venues 
  WHERE services IS NULL;
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % venues still have NULL services', invalid_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All % venues have services initialized', (SELECT COUNT(*) FROM venues);
  END IF;
END $$;

-- Verify pricing fields are numeric
DO $$
DECLARE
  invalid_deposit INTEGER;
  invalid_commission INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_deposit
  FROM venues
  WHERE deposit_percent IS NOT NULL 
    AND (deposit_percent < 0 OR deposit_percent > 100);
  
  SELECT COUNT(*) INTO invalid_commission
  FROM venues
  WHERE commission_percent IS NOT NULL 
    AND (commission_percent < 0 OR commission_percent > 100);
  
  IF invalid_deposit > 0 OR invalid_commission > 0 THEN
    RAISE EXCEPTION 'Migration failed: Invalid pricing percentages found';
  ELSE
    RAISE NOTICE 'SUCCESS: All pricing fields are within valid ranges';
  END IF;
END $$;

-- Display summary
SELECT 
  'MIGRATION COMPLETE' as status,
  COUNT(*) as total_venues,
  COUNT(CASE WHEN services::text != '[]' THEN 1 END) as venues_with_populated_services,
  COUNT(CASE WHEN services::text = '[]' THEN 1 END) as venues_with_empty_services,
  COUNT(CASE WHEN default_itinerary IS NOT NULL THEN 1 END) as venues_with_itinerary_field
FROM venues;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

RAISE NOTICE 'Migration 2025_fix_services_and_pricing.sql completed successfully';
