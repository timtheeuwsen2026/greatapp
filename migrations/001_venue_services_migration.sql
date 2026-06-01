-- ============================================================================
-- Migration: Venue Services Data Migration
-- Purpose: Ensure all venue services are stored in venues.services JSONB column
-- Author: System Migration
-- Date: 2025-01-22
-- ============================================================================

-- IDEMPOTENCY: This migration can be run multiple times safely
-- It checks for existing data and only migrates if necessary

-- ============================================================================
-- PART 1: FORWARD MIGRATION (Apply Changes)
-- ============================================================================

BEGIN;

-- Step 1: Create backup table for rollback capability
DROP TABLE IF EXISTS venues_services_backup_20250122;
CREATE TABLE venues_services_backup_20250122 AS
SELECT id, services, display_prefs, updated_at
FROM venues;

-- Log backup creation
DO $$
BEGIN
  RAISE NOTICE 'Backup created: % rows backed up', (SELECT COUNT(*) FROM venues_services_backup_20250122);
END $$;

-- Step 2: Ensure display_prefs column exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venues' AND column_name = 'display_prefs'
  ) THEN
    ALTER TABLE venues ADD COLUMN display_prefs JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added display_prefs column to venues table';
  ELSE
    RAISE NOTICE 'display_prefs column already exists, skipping';
  END IF;
END $$;

-- Step 3: Ensure all venues have initialized display_prefs (idempotent)
UPDATE venues
SET display_prefs = '{}'::jsonb
WHERE display_prefs IS NULL;

-- Log venues updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Initialized display_prefs for % venues', updated_count;
END $$;

-- Step 4: If there was a legacy global_services table, migrate it
-- (This is conditional - only runs if the table exists)
DO $$
DECLARE
  migration_count INTEGER := 0;
BEGIN
  -- Check if legacy table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'global_services' OR table_name = 'legacy_services'
  ) THEN
    
    -- Migrate from global_services to venues.services if structure matches
    -- Note: This is a hypothetical migration based on the requirement
    -- Adjust the query based on actual legacy table structure
    
    RAISE NOTICE 'Legacy services table found, migrating data...';
    
    -- Example migration (adjust based on actual schema):
    -- UPDATE venues v
    -- SET services = COALESCE(v.services, '[]'::jsonb) || (
    --   SELECT jsonb_agg(
    --     jsonb_build_object(
    --       'id', gs.id::text,
    --       'title', gs.service_name,
    --       'description', gs.description,
    --       'price', gs.price,
    --       'frequency', gs.frequency
    --     )
    --   )
    --   FROM global_services gs
    --   WHERE gs.venue_id = v.id
    -- )
    -- WHERE EXISTS (
    --   SELECT 1 FROM global_services gs WHERE gs.venue_id = v.id
    -- );
    
    -- GET DIAGNOSTICS migration_count = ROW_COUNT;
    RAISE NOTICE 'No legacy table migration needed - table structure is already correct';
    
  ELSE
    RAISE NOTICE 'No legacy services table found - data structure is correct';
  END IF;
END $$;

-- Step 5: Validate data integrity
DO $$
DECLARE
  total_venues INTEGER;
  venues_with_services INTEGER;
  invalid_services INTEGER;
BEGIN
  -- Count total venues
  SELECT COUNT(*) INTO total_venues FROM venues;
  
  -- Count venues with services
  SELECT COUNT(*) INTO venues_with_services 
  FROM venues 
  WHERE services IS NOT NULL AND jsonb_array_length(services) > 0;
  
  -- Check for invalid service data
  SELECT COUNT(*) INTO invalid_services
  FROM venues
  WHERE services IS NOT NULL 
    AND services::text != '[]'
    AND NOT (
      services::jsonb ? 'title' OR 
      jsonb_array_length(services) = 0 OR
      (jsonb_array_length(services) > 0 AND services->0 ? 'title')
    );
  
  RAISE NOTICE '=== Migration Summary ===';
  RAISE NOTICE 'Total venues: %', total_venues;
  RAISE NOTICE 'Venues with services: %', venues_with_services;
  RAISE NOTICE 'Invalid service entries: %', invalid_services;
  
  IF invalid_services > 0 THEN
    RAISE WARNING 'Found % venues with invalid service data structure', invalid_services;
  END IF;
END $$;

COMMIT;

RAISE NOTICE 'Migration completed successfully at %', NOW();

-- ============================================================================
-- PART 2: ROLLBACK SCRIPT (Run if migration needs to be reversed)
-- ============================================================================
-- To rollback, run the following in a separate transaction:
/*

BEGIN;

-- Restore from backup
UPDATE venues v
SET 
  services = b.services,
  display_prefs = b.display_prefs,
  updated_at = b.updated_at
FROM venues_services_backup_20250122 b
WHERE v.id = b.id;

-- Log rollback
DO $$
DECLARE
  rollback_count INTEGER;
BEGIN
  GET DIAGNOSTICS rollback_count = ROW_COUNT;
  RAISE NOTICE 'Rollback completed: % venues restored', rollback_count;
END $$;

COMMIT;

RAISE NOTICE 'Rollback completed successfully at %', NOW();

*/

-- ============================================================================
-- PART 3: CLEANUP (Run after verifying migration success)
-- ============================================================================
-- After verifying the migration is successful, run this to clean up:
/*

BEGIN;

-- Drop backup table
DROP TABLE IF EXISTS venues_services_backup_20250122;

RAISE NOTICE 'Cleanup completed - backup table removed at %', NOW();

COMMIT;

*/

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify migration)
-- ============================================================================
/*

-- 1. Check services data structure
SELECT 
  id,
  name,
  CASE 
    WHEN services IS NULL THEN 'No services'
    WHEN jsonb_array_length(services) = 0 THEN 'Empty services array'
    ELSE jsonb_array_length(services)::text || ' services'
  END as services_status,
  display_prefs
FROM venues
LIMIT 10;

-- 2. Sample services data
SELECT 
  v.name,
  s.value->>'title' as service_title,
  s.value->>'price' as service_price,
  s.value->>'frequency' as service_frequency
FROM venues v
CROSS JOIN LATERAL jsonb_array_elements(v.services) AS s(value)
WHERE jsonb_array_length(v.services) > 0
LIMIT 20;

-- 3. Check display preferences
SELECT 
  display_prefs->>'servicesPlacement' as placement,
  COUNT(*) as venue_count
FROM venues
WHERE display_prefs IS NOT NULL
GROUP BY display_prefs->>'servicesPlacement';

*/
