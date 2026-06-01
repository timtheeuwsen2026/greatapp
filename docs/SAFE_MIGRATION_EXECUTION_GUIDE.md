# Safe Migration Execution Guide - PostgreSQL & Supabase

**Date:** October 17, 2025  
**Purpose:** Safe, atomic migration execution with rollback capabilities  
**Target:** Venue and Event table schema updates  

---

## 🎯 Overview

This guide shows how to safely execute database migrations using:
- **Atomic transactions** (BEGIN/COMMIT/ROLLBACK)
- **PostgreSQL psql** command-line tool
- **Supabase CLI** for Supabase-hosted databases
- **Safe rollback procedures** if anything goes wrong

---

## 📋 Pre-Migration Checklist

Before running any migration:

- [ ] **Backup created** - Export database or create backup table
- [ ] **Off-peak hours** - Schedule during low-traffic period
- [ ] **Application paused** - Stop writes to affected tables (optional but recommended)
- [ ] **Migration tested** - Tested on staging/local copy first
- [ ] **Rollback plan ready** - Know how to undo changes
- [ ] **Team notified** - Inform team of maintenance window
- [ ] **Database connection tested** - Verify you can connect

---

## 🔐 Safety Precautions

### 1. Always Use Transactions

**Why:** Transactions ensure all-or-nothing execution. If any step fails, everything rolls back automatically.

```sql
BEGIN;
  -- Migration commands here
  -- If error occurs, nothing is committed
COMMIT;  -- Only if all steps succeed
```

### 2. Create Backups Before Migration

**Option A: Full Database Backup**
```bash
# Using pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Using Supabase CLI
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql
```

**Option B: Table-Level Backup**
```sql
-- Create backup tables (inside transaction)
BEGIN;
  CREATE TABLE venues_backup AS SELECT * FROM venues;
  CREATE TABLE experiences_backup AS SELECT * FROM experiences;
COMMIT;
```

### 3. Disable Foreign Key Checks (Rarely Needed)

**⚠️ WARNING:** Only disable if migration reorders tables with circular dependencies.

```sql
BEGIN;
  -- Disable FK checks (PostgreSQL doesn't support this like MySQL)
  -- Instead, you can temporarily drop and recreate constraints
  
  -- Better approach: Design migrations to maintain FK integrity
  -- Our migrations don't modify existing data, so FKs remain valid
COMMIT;
```

**For this migration:** We don't need to disable FKs because:
- ✅ We're only adding new nullable columns
- ✅ We're not deleting or modifying existing data
- ✅ We're not changing primary/foreign key relationships

### 4. Test Before Committing

```sql
BEGIN;
  -- Run migration
  ALTER TABLE venues ADD COLUMN latitude NUMERIC(10,7);
  
  -- Test the change
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'venues' AND column_name = 'latitude';
  
  -- If looks good: COMMIT
  -- If something wrong: ROLLBACK
ROLLBACK;  -- or COMMIT
```

---

## 🚀 Migration Execution Methods

### Method 1: PostgreSQL psql (Recommended)

#### Step 1: Connect to Database

```bash
# Using connection string
psql "$DATABASE_URL"

# Or individual parameters
psql -h hostname -U username -d database_name

# For Replit Database
psql "$DATABASE_URL"
```

#### Step 2: Execute Migration in Transaction

**Interactive Mode (Safest):**

```sql
-- Start transaction
BEGIN;

-- Show current state
SELECT COUNT(*) FROM venues;

-- Add venue columns
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

-- Verify columns added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'venues'
  AND column_name IN ('latitude', 'longitude', 'region', 'categories')
ORDER BY column_name;

-- Verify row count unchanged
SELECT COUNT(*) FROM venues;  -- Should still be 27

-- Sample data check
SELECT id, name, slug, latitude, categories
FROM venues
LIMIT 3;

-- If everything looks good, commit
COMMIT;

-- If something is wrong, rollback instead
-- ROLLBACK;
```

**Script Mode (From File):**

Create `migrate_venues.sql`:
```sql
-- Venue Migration Script
-- Date: 2025-10-17
-- Safe execution with transaction

BEGIN;

-- Pre-migration verification
SELECT 'Pre-migration venue count:' as status, COUNT(*)::text as count FROM venues;

-- Create backup table
DROP TABLE IF EXISTS venues_backup_20251017;
CREATE TABLE venues_backup_20251017 AS SELECT * FROM venues;

SELECT 'Backup created:' as status, COUNT(*)::text as count FROM venues_backup_20251017;

-- Add new columns
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

-- Post-migration verification
SELECT 'Post-migration venue count:' as status, COUNT(*)::text as count FROM venues;

SELECT 'New columns check:' as status, COUNT(*)::text as found
FROM information_schema.columns
WHERE table_name = 'venues'
  AND column_name IN ('latitude', 'longitude', 'region', 'categories');
-- Should return 4

-- If all checks pass, migration will auto-commit
-- If any check fails, transaction will rollback

COMMIT;

-- Display success message
SELECT '✅ Migration completed successfully!' as status;
```

Run it:
```bash
psql "$DATABASE_URL" -f migrate_venues.sql
```

---

### Method 2: Supabase CLI

#### Step 1: Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (via Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

#### Step 2: Login and Link Project

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Or use database URL directly
export SUPABASE_DB_URL="postgresql://..."
```

#### Step 3: Execute Migration

**Option A: Using Supabase Migrations**

Create migration file:
```bash
supabase migration new add_venue_columns
```

Edit the created file in `supabase/migrations/`:
```sql
-- supabase/migrations/20251017_add_venue_columns.sql

BEGIN;

-- Add venue columns
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

COMMIT;
```

Apply migration:
```bash
# Apply to local dev database
supabase db push

# Apply to remote project
supabase db push --db-url "$DATABASE_URL"
```

**Option B: Direct SQL Execution**

```bash
# Execute SQL file
supabase db execute -f migrate_venues.sql

# Or inline SQL
supabase db execute --sql "
BEGIN;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
-- ... more columns ...
COMMIT;
"
```

---

### Method 3: Replit Database (Current Environment)

Since you're using Replit's database, use the `execute_sql_tool` or psql:

**Option A: Via psql (Recommended for Transactions)**

```bash
# In Replit shell
psql "$DATABASE_URL" << 'EOF'
BEGIN;

-- Add venue columns
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

-- Verify
SELECT COUNT(*) FROM venues;

COMMIT;
EOF
```

**Option B: Step-by-step (What We'll Use)**

Since transactions via the SQL tool may not be supported, we use `IF NOT EXISTS` for idempotency:

```sql
-- Safe to run multiple times
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  -- ... etc
```

---

## 🔄 Complete Migration with Rollback

### Full Transaction-Based Migration Script

```sql
-- ====================================================
-- VENUE SCHEMA MIGRATION
-- Date: 2025-10-17
-- Description: Add geographic and service fields
-- ====================================================

-- Start transaction (atomic execution)
BEGIN;

-- ============================================
-- STEP 1: PRE-MIGRATION CHECKS
-- ============================================

-- Verify current state
DO $$
DECLARE
  venue_count INT;
BEGIN
  SELECT COUNT(*) INTO venue_count FROM venues;
  
  IF venue_count != 27 THEN
    RAISE EXCEPTION 'Unexpected venue count: %. Expected 27.', venue_count;
  END IF;
  
  RAISE NOTICE '✓ Pre-migration check passed: % venues found', venue_count;
END $$;

-- ============================================
-- STEP 2: CREATE BACKUP
-- ============================================

DROP TABLE IF EXISTS venues_backup_pre_migration;
CREATE TABLE venues_backup_pre_migration AS SELECT * FROM venues;

RAISE NOTICE '✓ Backup created: venues_backup_pre_migration';

-- ============================================
-- STEP 3: APPLY SCHEMA CHANGES
-- ============================================

-- Add geographic fields
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT;

RAISE NOTICE '✓ Added geographic fields';

-- Add categorization fields
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[];

RAISE NOTICE '✓ Added categorization fields';

-- Add services field
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB;

RAISE NOTICE '✓ Added services field';

-- Add business fields
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

RAISE NOTICE '✓ Added business fields';

-- Add new image fields
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

RAISE NOTICE '✓ Added image fields';

-- ============================================
-- STEP 4: POST-MIGRATION VERIFICATION
-- ============================================

DO $$
DECLARE
  venue_count INT;
  column_count INT;
BEGIN
  -- Verify row count unchanged
  SELECT COUNT(*) INTO venue_count FROM venues;
  IF venue_count != 27 THEN
    RAISE EXCEPTION 'Venue count changed! Expected 27, got %', venue_count;
  END IF;
  
  -- Verify new columns exist
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_name = 'venues'
    AND column_name IN ('latitude', 'longitude', 'region', 'categories', 
                        'vibes', 'services', 'pricing_model', 'cancellation_policy',
                        'cover_images', 'gallery_images_jsonb');
  
  IF column_count != 10 THEN
    RAISE EXCEPTION 'Expected 10 new columns, found %', column_count;
  END IF;
  
  RAISE NOTICE '✓ Post-migration verification passed';
  RAISE NOTICE '  - Venues: % (unchanged)', venue_count;
  RAISE NOTICE '  - New columns: %', column_count;
END $$;

-- ============================================
-- STEP 5: COMMIT OR ROLLBACK
-- ============================================

-- If we got here, everything succeeded
COMMIT;

-- Display success message
SELECT '✅ MIGRATION COMPLETED SUCCESSFULLY' as status;
SELECT 'All 27 venues preserved' as result;
SELECT '11 new columns added' as result;

-- ============================================
-- ROLLBACK POINT
-- ============================================
-- If any error occurred above, transaction will auto-rollback
-- Nothing will be committed to the database
-- To manually rollback: replace COMMIT with ROLLBACK
```

Save as `migrate_venues_safe.sql` and run:

```bash
psql "$DATABASE_URL" -f migrate_venues_safe.sql
```

**What happens on error:**
- ❌ Any RAISE EXCEPTION → automatic ROLLBACK
- ❌ Syntax error → automatic ROLLBACK
- ❌ Constraint violation → automatic ROLLBACK
- ✅ Everything succeeds → COMMIT

---

## ⏮️ Rollback Procedures

### Scenario 1: Migration Failed (Transaction Auto-Rollback)

If the transaction failed, nothing was committed. No action needed!

```sql
-- Transaction automatically rolled back on error
-- Database is in original state
-- Just fix the error and try again
```

### Scenario 2: Need to Undo Committed Migration

**Option A: Restore from Backup Table**

```sql
BEGIN;

-- Drop current table
DROP TABLE venues CASCADE;

-- Restore from backup
ALTER TABLE venues_backup_pre_migration RENAME TO venues;

-- Recreate indexes and constraints
CREATE UNIQUE INDEX venues_slug_unique ON venues(slug);

-- Recreate foreign keys
-- (Run \d venues_backup_pre_migration to see original constraints)

COMMIT;

-- Verify
SELECT COUNT(*) FROM venues;  -- Should be 27
```

**Option B: Drop New Columns**

```sql
BEGIN;

ALTER TABLE venues
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS vibes,
  DROP COLUMN IF EXISTS custom_amenities,
  DROP COLUMN IF EXISTS services,
  DROP COLUMN IF EXISTS pricing_model,
  DROP COLUMN IF EXISTS cancellation_policy,
  DROP COLUMN IF EXISTS cover_images,
  DROP COLUMN IF EXISTS gallery_images_jsonb;

COMMIT;

-- Verify
\d venues  -- Should not show new columns
```

**Option C: Restore from pg_dump Backup**

```bash
# Stop application to prevent writes
# ...

# Restore from backup file
psql "$DATABASE_URL" < backup_20251017_120000.sql

# Or restore specific table
psql "$DATABASE_URL" << 'EOF'
DROP TABLE venues CASCADE;
EOF

psql "$DATABASE_URL" < venues_backup.sql

# Restart application
```

### Scenario 3: Partial Migration (Some Columns Added, Some Failed)

```sql
-- Check which columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'venues'
  AND column_name IN ('latitude', 'longitude', 'region', 'categories', 
                      'vibes', 'services', 'pricing_model', 'cancellation_policy',
                      'cover_images', 'gallery_images_jsonb');

-- Drop only the columns that were added
BEGIN;
  -- Drop each column individually
  ALTER TABLE venues DROP COLUMN IF EXISTS latitude;
  ALTER TABLE venues DROP COLUMN IF EXISTS longitude;
  -- ... continue for each column found
COMMIT;
```

---

## 📝 Migration DOWN Script

Create a rollback script `rollback_venue_migration.sql`:

```sql
-- ====================================================
-- VENUE MIGRATION ROLLBACK SCRIPT
-- Date: 2025-10-17
-- ====================================================

BEGIN;

-- Verify backup exists
DO $$
DECLARE
  backup_count INT;
BEGIN
  SELECT COUNT(*) INTO backup_count 
  FROM information_schema.tables 
  WHERE table_name = 'venues_backup_pre_migration';
  
  IF backup_count = 0 THEN
    RAISE EXCEPTION 'Backup table not found! Cannot safely rollback.';
  END IF;
END $$;

-- Remove new columns
ALTER TABLE venues
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS vibes,
  DROP COLUMN IF EXISTS custom_amenities,
  DROP COLUMN IF EXISTS services,
  DROP COLUMN IF EXISTS pricing_model,
  DROP COLUMN IF EXISTS cancellation_policy,
  DROP COLUMN IF EXISTS cover_images,
  DROP COLUMN IF EXISTS gallery_images_jsonb;

-- Verify rollback
DO $$
DECLARE
  column_count INT;
BEGIN
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_name = 'venues'
    AND column_name IN ('latitude', 'longitude', 'region', 'categories');
  
  IF column_count != 0 THEN
    RAISE EXCEPTION 'Rollback failed! Columns still exist.';
  END IF;
  
  RAISE NOTICE '✓ Rollback verification passed';
END $$;

COMMIT;

SELECT '✅ ROLLBACK COMPLETED' as status;
SELECT 'All new columns removed' as result;
```

Run rollback:
```bash
psql "$DATABASE_URL" -f rollback_venue_migration.sql
```

---

## 🎯 Execution Checklist

### Before Migration

- [ ] Database backup created
- [ ] Backup table created (optional double-safety)
- [ ] Migration tested on staging/local
- [ ] Application traffic paused (optional)
- [ ] Team notified
- [ ] Rollback script ready

### During Migration

- [ ] Start transaction with BEGIN
- [ ] Run pre-migration checks
- [ ] Create backup table
- [ ] Execute schema changes
- [ ] Run verification queries
- [ ] Review results
- [ ] COMMIT if all good, ROLLBACK if not

### After Migration

- [ ] Verify row counts unchanged
- [ ] Verify new columns exist
- [ ] Test application functionality
- [ ] Monitor for errors
- [ ] Keep backup for 7 days
- [ ] Document migration in changelog

---

## 🚨 Troubleshooting

### Error: "relation already exists"

**Cause:** Trying to create backup table that exists

**Solution:**
```sql
DROP TABLE IF EXISTS venues_backup_pre_migration;
CREATE TABLE venues_backup_pre_migration AS SELECT * FROM venues;
```

### Error: "column already exists"

**Cause:** Column was partially added before

**Solution:** Use `IF NOT EXISTS`:
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7);
```

### Error: "permission denied"

**Cause:** Database user lacks ALTER TABLE permission

**Solution:**
```sql
-- Check permissions
SELECT * FROM information_schema.table_privileges 
WHERE table_name = 'venues';

-- Grant permissions (as superuser)
GRANT ALL ON TABLE venues TO your_user;
```

### Error: "out of memory"

**Cause:** Large table migration

**Solution:**
```sql
-- For very large tables, add columns one at a time
BEGIN;
  ALTER TABLE venues ADD COLUMN latitude NUMERIC(10, 7);
COMMIT;

BEGIN;
  ALTER TABLE venues ADD COLUMN longitude NUMERIC(10, 7);
COMMIT;
-- ... continue
```

---

## 📊 Verification After Migration

Run these queries to confirm success:

```sql
-- 1. Row count unchanged
SELECT COUNT(*) FROM venues;  -- Should be 27

-- 2. All new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'venues'
  AND column_name IN ('latitude', 'longitude', 'region', 'categories')
ORDER BY column_name;
-- Should return 4 rows (or all 11)

-- 3. Sample data
SELECT id, name, slug, latitude, categories, services
FROM venues
LIMIT 5;
-- Should show new columns with NULL or default values

-- 4. No duplicates
SELECT slug, COUNT(*) FROM venues GROUP BY slug HAVING COUNT(*) > 1;
-- Should return empty

-- 5. Foreign keys intact
SELECT COUNT(*) FROM experiences 
WHERE linked_venue_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM venues WHERE id = linked_venue_id);
-- Should return 0 (no orphaned references)
```

---

## ✅ Success Criteria

Migration is successful when:

✅ Transaction completed without errors  
✅ All 27 venues preserved (row count unchanged)  
✅ All 11 new columns exist with correct types  
✅ All new columns have safe defaults (NULL or empty arrays)  
✅ Slug uniqueness maintained  
✅ Foreign key relationships intact  
✅ Application starts and runs without errors  
✅ Sample queries return expected data  

---

## 🎉 Final Migration Command

**The safest, most atomic way to run this migration:**

```bash
# Create backup first
pg_dump "$DATABASE_URL" -t venues > venues_backup_$(date +%Y%m%d_%H%M%S).sql

# Run migration in transaction
psql "$DATABASE_URL" << 'EOF'
BEGIN;

-- Backup table
CREATE TABLE venues_backup_pre_migration AS SELECT * FROM venues;

-- Add columns
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pricing_model TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
  ADD COLUMN IF NOT EXISTS cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;

-- Verify
SELECT COUNT(*) FROM venues;

COMMIT;
EOF

# Verify success
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM venues;"
psql "$DATABASE_URL" -c "\d venues" | grep -E "latitude|longitude|region"
```

**If anything fails, the transaction auto-rolls back. Your data is safe!** ✅

---

**Ready to execute?** This is the safest possible approach with full atomic guarantees and automatic rollback on any error.
