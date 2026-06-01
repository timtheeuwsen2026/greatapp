# Safe Data Migration Guide - Venue Slugs & Schema Updates

**Date:** October 17, 2025  
**Environment:** Development Database  
**Current Status:** ✅ All 27 venues have unique slugs, no migration needed  
**Purpose:** Documentation for safe data migrations (current and future)

---

## 📊 Current Venue Slug Status

**Total Venues:** 27  
**Slugs Status:** ✅ All unique, no duplicates  
**NULL/Empty Slugs:** 0  

**Sample Slugs:**
- `zen-garden-retreat-center-sedona`
- `mountain-view-studio-boulder`
- `sunset-beach-resort-tulum-1` (numeric suffix for duplicate)
- `coastal-wellness-center-big-sur-1` (numeric suffix for duplicate)

**Conclusion:** No immediate migration needed, but this guide documents the process for future use.

---

## 🎯 Migration Scenarios

### Scenario A: Generate Missing Slugs
**When:** Some venues have NULL or empty slugs  
**Action:** Generate slugs using name + city

### Scenario B: Fix Duplicate Slugs
**When:** Multiple venues share the same slug  
**Action:** Append numeric suffixes (-1, -2, etc.)

### Scenario C: Regenerate All Slugs
**When:** Slug format needs to change  
**Action:** Regenerate all slugs with new logic

### Scenario D: Add New Columns
**When:** Adding new fields to existing tables  
**Action:** Use ALTER TABLE with safe defaults

---

## 📋 Safe Migration Checklist

### Pre-Migration Phase

- [ ] **Identify the issue** - What needs to be migrated?
- [ ] **Count affected records** - How many rows will change?
- [ ] **Create backup** - Export data before changes
- [ ] **Test on staging** - Verify migration on copy of data
- [ ] **Document rollback plan** - How to undo if needed
- [ ] **Schedule maintenance window** - Plan for downtime if needed

### Migration Phase

- [ ] **Verify backup exists** - Confirm export file created
- [ ] **Run migration script** - Execute planned changes
- [ ] **Verify results** - Check all records updated correctly
- [ ] **Test application** - Ensure app works with new data
- [ ] **Monitor for errors** - Check logs for issues

### Post-Migration Phase

- [ ] **Compare before/after counts** - Ensure no data loss
- [ ] **Test critical paths** - Verify key features work
- [ ] **Keep backup for 7 days** - In case rollback needed
- [ ] **Document what changed** - Update migration log
- [ ] **Update team** - Notify of completed migration

---

## 1️⃣ Step 1: Backup Affected Tables

### Option A: PostgreSQL pg_dump (Best for Production)

```bash
# Backup entire database
pg_dump $DATABASE_URL > /tmp/database_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup specific table
pg_dump $DATABASE_URL -t venues > /tmp/venues_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup specific table with data only (no schema)
pg_dump $DATABASE_URL -t venues --data-only > /tmp/venues_data_backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup size
ls -lh /tmp/*backup*.sql
```

**Restore from backup:**
```bash
# Restore entire database
psql $DATABASE_URL < /tmp/database_backup_20251017_120000.sql

# Restore specific table (drop existing first)
psql $DATABASE_URL -c "DROP TABLE venues CASCADE;"
psql $DATABASE_URL < /tmp/venues_backup_20251017_120000.sql
```

### Option B: Export to CSV (Good for Data Review)

```bash
# Export venues to CSV
psql $DATABASE_URL -c "\COPY venues TO '/tmp/venues_backup.csv' WITH CSV HEADER"

# Check the export
head -5 /tmp/venues_backup.csv
wc -l /tmp/venues_backup.csv  # Should show 28 lines (27 + header)
```

**Restore from CSV:**
```sql
-- Import venues from CSV (after table is created)
\COPY venues FROM '/tmp/venues_backup.csv' WITH CSV HEADER;
```

### Option C: Export to JSON (Best for Version Control)

```bash
# Export venues to JSON
psql $DATABASE_URL -t -c "SELECT json_agg(row_to_json(venues)) FROM venues;" > /tmp/venues_backup.json

# Pretty print to verify
cat /tmp/venues_backup.json | jq '.' | head -20
```

### Option D: Create Backup Table (Fastest Rollback)

```sql
-- Create backup table with all data
CREATE TABLE venues_backup_20251017 AS SELECT * FROM venues;

-- Verify backup
SELECT COUNT(*) FROM venues_backup_20251017;  -- Should be 27

-- To restore later
DROP TABLE venues CASCADE;
ALTER TABLE venues_backup_20251017 RENAME TO venues;
-- (Then recreate foreign keys, indexes, constraints)
```

**Recommended:** Use **pg_dump** for production, **backup table** for quick development rollback.

---

## 2️⃣ Step 2: Test on Staging Environment

### Option A: Replit Database (If Available)

If you have a staging Replit instance:

```bash
# On staging repl
export STAGING_DATABASE_URL="your-staging-db-url"

# Copy production data to staging
pg_dump $DATABASE_URL | psql $STAGING_DATABASE_URL

# Run migration on staging
psql $STAGING_DATABASE_URL -f migration_script.sql

# Test staging app
# ... manual testing ...

# If successful, run on production
```

### Option B: Local PostgreSQL Copy

```bash
# Create local test database
createdb venue_migration_test

# Copy production data to local
pg_dump $DATABASE_URL | psql venue_migration_test

# Run migration locally
psql venue_migration_test -f migration_script.sql

# Test locally
export DATABASE_URL="postgresql://localhost/venue_migration_test"
npm run dev

# If successful, run on production
```

### Option C: Database Transaction Rollback Test

```sql
-- Start transaction (changes not committed)
BEGIN;

-- Run migration
UPDATE venues SET slug = 'test-migration';

-- Check results
SELECT slug FROM venues LIMIT 5;

-- If looks good, COMMIT. If not, ROLLBACK
ROLLBACK;  -- Undo all changes
-- or
COMMIT;    -- Make changes permanent
```

**Best Practice:** Always test migrations on a copy first, even simple ones.

---

## 3️⃣ Step 3: Slug Generation Strategy

### A. JavaScript Slug Generation Function

```javascript
/**
 * Generate a URL-friendly slug from text
 * @param {string} text - The text to slugify
 * @returns {string} - URL-safe slug
 */
function slugify(text) {
  return text
    .toString()                      // Convert to string
    .toLowerCase()                   // Convert to lowercase
    .trim()                          // Remove whitespace from both ends
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Generate a unique venue slug
 * @param {string} name - Venue name
 * @param {string} city - Venue city
 * @returns {string} - Unique slug like "venue-name-city"
 */
function generateVenueSlug(name, city) {
  const namePart = slugify(name);
  const cityPart = slugify(city);
  
  // Combine name and city
  if (cityPart) {
    return `${namePart}-${cityPart}`;
  }
  return namePart;
}

// Examples:
slugify("Zen Garden Retreat Center")  // "zen-garden-retreat-center"
slugify("Tim Theeuwsen")               // "tim-theeuwsen"
slugify("Mountain View Studio")        // "mountain-view-studio"

generateVenueSlug("Sunset Beach Resort", "Tulum")
// Result: "sunset-beach-resort-tulum"

generateVenueSlug("Coastal Wellness Center", "Big Sur")
// Result: "coastal-wellness-center-big-sur"
```

### B. SQL Slug Generation Function

```sql
-- Create slugify function in PostgreSQL
CREATE OR REPLACE FUNCTION slugify(text) 
RETURNS text AS $$
  SELECT 
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            TRIM($1),
            '[^a-zA-Z0-9\s-]', '', 'g'  -- Remove special chars
          ),
          '\s+', '-', 'g'                -- Replace spaces with -
        ),
        '-+', '-', 'g'                   -- Replace multiple - with single
      )
    );
$$ LANGUAGE SQL IMMUTABLE;

-- Test the function
SELECT slugify('Zen Garden Retreat Center');  -- "zen-garden-retreat-center"
SELECT slugify('Mountain View Studio');       -- "mountain-view-studio"

-- Generate venue slugs
SELECT 
  id,
  name,
  city,
  slugify(name || '-' || COALESCE(city, '')) as generated_slug
FROM venues
LIMIT 5;
```

---

## 4️⃣ Step 4: Detect Slug Collisions

### A. SQL Query to Find Duplicates

```sql
-- Find duplicate slugs (current state)
SELECT 
  slug, 
  COUNT(*) as count,
  ARRAY_AGG(id) as venue_ids,
  STRING_AGG(name || ' (' || city || ')', ', ') as venues
FROM venues
GROUP BY slug
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Current Result:** No duplicates found ✅

### B. SQL Query to Predict Future Collisions

```sql
-- Simulate slug generation and find potential duplicates
WITH generated_slugs AS (
  SELECT 
    id,
    name,
    city,
    slug as current_slug,
    slugify(name || '-' || COALESCE(city, '')) as new_slug
  FROM venues
)
SELECT 
  new_slug,
  COUNT(*) as collision_count,
  ARRAY_AGG(name) as colliding_venues
FROM generated_slugs
GROUP BY new_slug
HAVING COUNT(*) > 1;
```

### C. Collision Resolution Strategy

**Strategy 1: Append Numeric Suffix**

```javascript
/**
 * Check if slug exists and append numeric suffix if needed
 * @param {string} baseSlug - The base slug to check
 * @param {Array} existingSlugs - Array of already-used slugs
 * @returns {string} - Unique slug with suffix if needed
 */
function ensureUniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug;
  let counter = 1;
  
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}

// Example usage:
const existingSlugs = [
  'sunset-beach-resort-tulum',
  'sunset-beach-resort-tulum-1'
];

ensureUniqueSlug('sunset-beach-resort-tulum', existingSlugs)
// Returns: 'sunset-beach-resort-tulum-2'
```

**Strategy 2: Include Venue ID**

```javascript
// For guaranteed uniqueness, include short ID
function generateUniqueSlug(name, city, venueId) {
  const baseSlug = generateVenueSlug(name, city);
  const shortId = venueId.substring(0, 8);
  return `${baseSlug}-${shortId}`;
}

// Example:
generateUniqueSlug("Sunset Resort", "Tulum", "abc123-def456-...")
// Result: "sunset-resort-tulum-abc123de"
```

**Strategy 3: Add Location Specificity**

```javascript
// Add country, state, or zip code for uniqueness
function generateDetailedSlug(name, city, state, country) {
  let parts = [slugify(name)];
  
  if (city) parts.push(slugify(city));
  if (state) parts.push(slugify(state));
  if (country) parts.push(slugify(country));
  
  return parts.join('-');
}

// Example:
generateDetailedSlug("Wellness Center", "Boulder", "CO", "USA")
// Result: "wellness-center-boulder-co-usa"
```

---

## 5️⃣ Step 5: Migration Script Examples

### Example A: Generate Missing Slugs Only

```sql
-- Only update venues with NULL or empty slugs
UPDATE venues
SET slug = slugify(name || '-' || COALESCE(city, ''))
WHERE slug IS NULL OR slug = '';

-- Verify
SELECT COUNT(*) FROM venues WHERE slug IS NULL OR slug = '';
-- Should return: 0
```

### Example B: Fix Duplicate Slugs with Numeric Suffixes

```sql
-- Step 1: Create temporary table with new slugs
CREATE TEMP TABLE venue_slug_migration AS
WITH slug_counts AS (
  -- Count how many times each slug appears
  SELECT 
    slug,
    COUNT(*) as count
  FROM venues
  GROUP BY slug
),
ranked_venues AS (
  -- Rank venues within each slug group by creation date
  SELECT 
    v.id,
    v.slug as current_slug,
    ROW_NUMBER() OVER (
      PARTITION BY v.slug 
      ORDER BY v.created_at ASC
    ) as rank
  FROM venues v
  INNER JOIN slug_counts sc ON v.slug = sc.slug
  WHERE sc.count > 1
)
SELECT 
  id,
  current_slug,
  CASE 
    WHEN rank = 1 THEN current_slug
    ELSE current_slug || '-' || (rank - 1)
  END as new_slug
FROM ranked_venues;

-- Step 2: Review proposed changes
SELECT * FROM venue_slug_migration ORDER BY current_slug;

-- Step 3: Apply changes
UPDATE venues v
SET slug = m.new_slug
FROM venue_slug_migration m
WHERE v.id = m.id;

-- Step 4: Verify no duplicates remain
SELECT slug, COUNT(*) 
FROM venues 
GROUP BY slug 
HAVING COUNT(*) > 1;
-- Should return: empty
```

### Example C: Regenerate All Slugs with Collision Handling

```sql
-- Full slug regeneration with automatic collision resolution
WITH RECURSIVE slug_generation AS (
  -- Base case: Generate initial slugs
  SELECT 
    id,
    name,
    city,
    slug as old_slug,
    slugify(name || '-' || COALESCE(city, '')) as base_slug,
    slugify(name || '-' || COALESCE(city, '')) as new_slug,
    0 as suffix_num,
    ROW_NUMBER() OVER (
      PARTITION BY slugify(name || '-' || COALESCE(city, ''))
      ORDER BY created_at ASC
    ) as collision_rank
  FROM venues
)
SELECT 
  id,
  old_slug,
  CASE 
    WHEN collision_rank = 1 THEN base_slug
    ELSE base_slug || '-' || (collision_rank - 1)
  END as new_slug
FROM slug_generation
ORDER BY id;

-- Save results for review before applying
CREATE TEMP TABLE slug_migration_plan AS
WITH RECURSIVE slug_generation AS (
  SELECT 
    id,
    name,
    city,
    slug as old_slug,
    slugify(name || '-' || COALESCE(city, '')) as base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY slugify(name || '-' || COALESCE(city, ''))
      ORDER BY created_at ASC
    ) as collision_rank
  FROM venues
)
SELECT 
  id,
  old_slug,
  CASE 
    WHEN collision_rank = 1 THEN base_slug
    ELSE base_slug || '-' || (collision_rank - 1)
  END as new_slug
FROM slug_generation;

-- Review the plan
SELECT * FROM slug_migration_plan WHERE old_slug != new_slug;

-- Apply if looks good
UPDATE venues v
SET slug = p.new_slug
FROM slug_migration_plan p
WHERE v.id = p.id AND v.slug != p.new_slug;
```

---

## 6️⃣ Step 6: Add New Columns Safely

### Example: Adding Venue Fields (Current Task)

```sql
-- Add new columns with safe defaults
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

-- Verify data preserved
SELECT COUNT(*) as total_venues FROM venues;
-- Should still be: 27
```

**Why This is Safe:**
- ✅ All columns nullable or have defaults
- ✅ No data modification required
- ✅ Existing queries still work
- ✅ Can rollback by dropping columns

---

## 7️⃣ Step 7: Verification Queries

### After Migration Checklist

```sql
-- 1. Verify row count unchanged
SELECT COUNT(*) as total FROM venues;
-- Expected: 27 (same as before)

-- 2. Verify all slugs unique
SELECT slug, COUNT(*) 
FROM venues 
GROUP BY slug 
HAVING COUNT(*) > 1;
-- Expected: empty (no duplicates)

-- 3. Verify no NULL slugs
SELECT COUNT(*) FROM venues WHERE slug IS NULL OR slug = '';
-- Expected: 0

-- 4. Check slug format is correct
SELECT slug 
FROM venues 
WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
-- Expected: empty (all slugs valid format)

-- 5. Verify new columns exist and have defaults
SELECT 
  COUNT(*) as total_rows,
  COUNT(latitude) as has_latitude,
  COUNT(longitude) as has_longitude,
  COUNT(*) FILTER (WHERE categories = '{}') as empty_categories,
  COUNT(*) FILTER (WHERE services = '[]'::jsonb) as empty_services
FROM venues;

-- 6. Sample data check
SELECT 
  id,
  name,
  slug,
  latitude,
  categories,
  services
FROM venues
LIMIT 5;
```

---

## 8️⃣ Step 8: Rollback Procedures

### Rollback Option 1: Restore from pg_dump

```bash
# Stop the application
# (Prevent writes during restore)

# Restore from backup
psql $DATABASE_URL < /tmp/venues_backup_20251017_120000.sql

# Restart application
# Verify data restored correctly
```

### Rollback Option 2: Restore from Backup Table

```sql
-- Drop current table
DROP TABLE venues CASCADE;

-- Restore from backup
ALTER TABLE venues_backup_20251017 RENAME TO venues;

-- Recreate foreign keys and indexes
-- (SQL depends on your schema)
ALTER TABLE experience_venues 
  ADD CONSTRAINT experience_venues_venue_id_fk 
  FOREIGN KEY (venue_id) REFERENCES venues(id);

CREATE UNIQUE INDEX venues_slug_unique ON venues(slug);

-- Verify
SELECT COUNT(*) FROM venues;  -- Should be 27
```

### Rollback Option 3: Revert Specific Changes

```sql
-- Revert slug changes only (if you saved old values)
UPDATE venues v
SET slug = m.old_slug
FROM slug_migration_plan m
WHERE v.id = m.id;

-- Drop newly added columns
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
```

---

## 9️⃣ Step 9: Full Migration Workflow Example

### Complete Workflow for Adding Venue Columns

```bash
#!/bin/bash
# migrate_venue_columns.sh

echo "🔍 Step 1: Pre-migration checks"
psql $DATABASE_URL -c "SELECT COUNT(*) as venues FROM venues;"
psql $DATABASE_URL -c "SELECT slug, COUNT(*) FROM venues GROUP BY slug HAVING COUNT(*) > 1;"

echo "💾 Step 2: Create backup"
pg_dump $DATABASE_URL -t venues > /tmp/venues_backup_$(date +%Y%m%d_%H%M%S).sql
echo "Backup created: $(ls -lh /tmp/venues_backup_*.sql | tail -1)"

echo "📊 Step 3: Create backup table"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS venues_backup_pre_migration;"
psql $DATABASE_URL -c "CREATE TABLE venues_backup_pre_migration AS SELECT * FROM venues;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM venues_backup_pre_migration;"

echo "🚀 Step 4: Run migration"
psql $DATABASE_URL <<EOF
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
EOF

echo "✅ Step 5: Verify migration"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM venues;"
psql $DATABASE_URL -c "\d venues" | grep -E "latitude|longitude|region|categories"

echo "🎉 Migration complete!"
echo "Backup files:"
ls -lh /tmp/venues_backup_*.sql | tail -3
```

**Run it:**
```bash
chmod +x migrate_venue_columns.sh
./migrate_venue_columns.sh
```

---

## 🔟 Step 10: Migration Logging & Documentation

### Create Migration Log Entry

```markdown
# Migration Log

## Migration 2025-10-17: Add Venue Geographic & Service Fields

**Date:** October 17, 2025 12:00 PM UTC  
**Database:** Development  
**Executed By:** Agent  
**Duration:** 0.8 seconds  

### Changes Made
- Added 11 new columns to `venues` table
- All columns nullable or with safe defaults
- No data modification required

### Backup Location
- File: `/tmp/venues_backup_20251017_120000.sql`
- Backup Table: `venues_backup_pre_migration`
- Size: 45 KB

### Results
- ✅ All 27 venues preserved
- ✅ New columns added successfully
- ✅ No slug conflicts
- ✅ Application tested and working

### Rollback Procedure
If needed, restore from backup:
```bash
psql $DATABASE_URL < /tmp/venues_backup_20251017_120000.sql
```

### Verification Queries Run
```sql
SELECT COUNT(*) FROM venues; -- Result: 27
SELECT COUNT(*) FROM venues WHERE latitude IS NOT NULL; -- Result: 0
SELECT COUNT(*) FROM venues WHERE categories != '{}'; -- Result: 0
```

### Notes
- Migration completed without issues
- All new fields initialized to NULL or defaults
- Ready for frontend form updates
```

---

## 📚 Best Practices Summary

### DO ✅

1. **Always backup before migrations** - Use pg_dump or backup tables
2. **Test on staging first** - Never run migrations directly on production
3. **Use transactions** - Wrap changes in BEGIN/COMMIT for easy rollback
4. **Verify results** - Check row counts, constraints, data integrity
5. **Keep backups for 7 days** - In case issues discovered later
6. **Use IF NOT EXISTS** - Make migrations idempotent
7. **Add safe defaults** - NULL or empty arrays for new columns
8. **Document changes** - Maintain migration log
9. **Monitor application** - Check logs after deployment

### DON'T ❌

1. **Don't skip backups** - "It's just a small change" famous last words
2. **Don't change primary keys** - Breaks foreign key relationships
3. **Don't run untested SQL** - Test on sample data first
4. **Don't delete columns hastily** - Might break old code
5. **Don't modify data without backup** - UPDATE without WHERE is dangerous
6. **Don't ignore constraints** - Foreign keys, uniques must be handled
7. **Don't migrate during peak hours** - Schedule maintenance windows
8. **Don't forget to update docs** - Document schema changes

---

## 🎯 Current Status: Venue Schema

### Existing Slugs (All Unique) ✅

All 27 venues have unique, valid slugs. No migration needed for slugs.

**Examples:**
- `zen-garden-retreat-center-sedona`
- `mountain-view-studio-boulder`
- `sunset-beach-resort-tulum`
- `coastal-wellness-center-big-sur`

### New Columns (Ready to Add) ✅

11 new columns ready to add via migration:
- Geographic: `latitude`, `longitude`, `region`
- Categorization: `categories`, `vibes`, `custom_amenities`
- Services: `services` (JSONB)
- Business: `pricing_model`, `cancellation_policy`
- Media: `cover_images`, `gallery_images_jsonb` (JSONB)

**Recommended Action:** Run manual SQL to add columns (see Step 6)

---

## 📁 Files & Commands Reference

### Backup Commands
```bash
# Full database
pg_dump $DATABASE_URL > backup.sql

# Single table
pg_dump $DATABASE_URL -t venues > venues.sql

# Data only
pg_dump $DATABASE_URL -t venues --data-only > venues_data.sql

# CSV export
psql $DATABASE_URL -c "\COPY venues TO 'venues.csv' WITH CSV HEADER"
```

### Restore Commands
```bash
# Full database
psql $DATABASE_URL < backup.sql

# Single table (drop first)
psql $DATABASE_URL -c "DROP TABLE venues CASCADE;"
psql $DATABASE_URL < venues.sql

# Import CSV
psql $DATABASE_URL -c "\COPY venues FROM 'venues.csv' WITH CSV HEADER"
```

### Verification Commands
```sql
-- Count rows
SELECT COUNT(*) FROM venues;

-- Check duplicates
SELECT slug, COUNT(*) FROM venues GROUP BY slug HAVING COUNT(*) > 1;

-- Check NULLs
SELECT COUNT(*) FROM venues WHERE slug IS NULL;

-- Describe table
\d venues
```

---

## 🎉 Conclusion

Your venue data is in excellent shape:
- ✅ All 27 venues have unique slugs
- ✅ No duplicates or NULL values
- ✅ Ready for schema additions
- ✅ Comprehensive migration plan documented

**Next Step:** Run the column addition migration from Step 6 when ready.
