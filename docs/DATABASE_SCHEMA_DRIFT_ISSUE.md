# Database Schema Drift Issue

**Date:** October 17, 2025  
**Status:** ⚠️ BLOCKER - Schema Drift Preventing Migration  

---

## 🚨 Problem Summary

The database schema has drifted significantly from the code schema in `shared/schema.ts`. Multiple tables have structural differences preventing automated migration via `npm run db:push`.

**Impact:** Cannot complete venue field migration until schema drift is resolved.

---

## 📊 Tables with Schema Drift

### 1. `experience_services` ✅ FIXED

**Missing Columns (ADDED):**
- `demand_notes` (TEXT) ✅
- `estimated_cost` (NUMERIC) ✅
- `status` (VARCHAR) ✅
- `contact_requested` (BOOLEAN) ✅

**Extra Column in Database:**
- `role_description` (not in schema)

### 2. `creator_earnings` ✅ FIXED

**Missing Columns (ADDED):**
- `platform_fee_amount` (INTEGER) ✅
- `platform_fee_percentage` (NUMERIC 5,2) ✅
- `stripe_fee_amount` (INTEGER) ✅
- `stripe_transfer_id` (VARCHAR) ✅
- `payout_failure_reason` (TEXT) ✅
- `currency` (VARCHAR) ✅
- `exchange_rate` (NUMERIC 10,4) ✅
- `tax_witheld` (INTEGER) ✅
- `updated_at` (TIMESTAMP) ✅

**Renamed Column:**
- `platform_fee` → `platform_fee_amount`

### 3. `community_applications` ⚠️ **MAJOR STRUCTURE CHANGE**

**Current Database Structure (OLD):**
```
id, first_name, last_name, email, remote_work_status, 
current_work, travel_goals, what_drives_you, 
perfect_experience, community_contribution, status, 
review_notes, reviewed_by, reviewed_at, created_at, updated_at
```

**Schema File Structure (NEW):**
```
id, experience_id, user_id, motivation_text, 
contribution_text, experience_level, special_interests, 
status, review_notes, reviewed_by, reviewed_at, 
applied_at, created_at
```

**Analysis:** This is a complete table redesign, not just adding columns. The old table appears to be a general user survey/application form, while the new table is specifically for experience-based community applications.

### 4. `venues` ⏳ PENDING (Our Target)

**Missing Columns (NOT YET ADDED):**
- `latitude` (NUMERIC 10,7)
- `longitude` (NUMERIC 10,7)
- `region` (TEXT)
- `categories` (TEXT[])
- `vibes` (TEXT[])
- `custom_amenities` (TEXT[])
- `services` (JSONB)
- `pricing_model` (TEXT)
- `cancellation_policy` (TEXT)
- `cover_images` (JSONB)
- `gallery_images_jsonb` (JSONB)

**Status:** Cannot apply until other schema drift is resolved.

---

## 🔍 Root Cause

**Why This Happened:**
1. Schema changes were made in `shared/schema.ts` over time
2. These changes were never applied to the database via `npm run db:push`
3. The database continued running with the old structure
4. New code expects the new structure, but database still has old structure

**Evidence:**
- `drizzle-kit push` is prompting for every structural difference
- Multiple tables show mismatches between schema.ts and actual database
- Some changes are simple additions, others are complete redesigns

---

## 🛠️ Solution Options

### Option 1: Fresh Database (RECOMMENDED for Development)

**If you can afford to lose current data:**

```bash
# 1. Drop all tables and start fresh
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. Apply schema from scratch
npm run db:push --force

# 3. Verify all tables created correctly
psql $DATABASE_URL -c "\dt"
```

**Pros:**
- ✅ Clean slate - schema perfectly matches code
- ✅ Fast - completes in seconds
- ✅ No migration complexity

**Cons:**
- ❌ Loses all existing data (27 venues, any bookings, users, etc.)
- ❌ Not suitable for production

### Option 2: Selective Table Recreation

**For community_applications only (minimal data loss):**

```sql
-- 1. Check if there's any data to preserve
SELECT COUNT(*) FROM community_applications;

-- 2. If count is small or data is not important, drop and recreate
DROP TABLE community_applications CASCADE;

-- 3. Then run migration
npm run db:push --force
```

**Then manually fix remaining drift:**
- Drop `role_description` from `experience_services`
- Rename `platform_fee` to `platform_fee_amount` in `creator_earnings`

**Pros:**
- ✅ Preserves venue data (27 records)
- ✅ Preserves user/booking data
- ✅ Only loses community_applications data

**Cons:**
- ❌ Requires manual SQL for some fixes
- ❌ Still loses some data

### Option 3: Manual Migration Script (SAFEST - Production Ready)

**Create comprehensive migration SQL:**

```sql
-- Phase 1: Fix experience_services (ALREADY DONE)
-- No action needed

-- Phase 2: Fix creator_earnings (ALREADY DONE)
-- Rename platform_fee column if needed:
-- ALTER TABLE creator_earnings RENAME COLUMN platform_fee TO platform_fee_amount;

-- Phase 3: Fix community_applications
-- Option A: Drop and recreate (if data not important)
DROP TABLE IF EXISTS community_applications CASCADE;

CREATE TABLE community_applications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id VARCHAR NOT NULL REFERENCES experiences(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  motivation_text TEXT NOT NULL,
  contribution_text TEXT,
  experience_level VARCHAR,
  special_interests TEXT[] DEFAULT '{}'::TEXT[],
  status VARCHAR DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by VARCHAR REFERENCES users(id),
  reviewed_at TIMESTAMP,
  applied_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Option B: Migrate data (if old data is important)
-- Would require custom migration logic to map old fields to new fields

-- Phase 4: Add venue columns (FINAL STEP)
ALTER TABLE venues
  ADD COLUMN latitude NUMERIC(10, 7),
  ADD COLUMN longitude NUMERIC(10, 7),
  ADD COLUMN region TEXT,
  ADD COLUMN categories TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN vibes TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN custom_amenities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN services JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN pricing_model TEXT,
  ADD COLUMN cancellation_policy TEXT,
  ADD COLUMN cover_images JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;
```

**Pros:**
- ✅ Most control over migration process
- ✅ Can preserve data where possible
- ✅ Production-safe

**Cons:**
- ❌ Requires manual SQL execution
- ❌ More complex
- ❌ Time-consuming

### Option 4: Accept Each Prompt Manually

**Just run `npm run db:push` and answer each prompt:**

```bash
npm run db:push

# For each prompt:
# - "create column" for new columns
# - "rename column" if you want to preserve data
# - Review each decision carefully
```

**Pros:**
- ✅ Drizzle handles SQL generation
- ✅ Interactive control

**Cons:**
- ❌ Very tedious (many prompts)
- ❌ Risk of making wrong choice
- ❌ Hard to track what you selected

---

## 🎯 Recommended Action Plan

### For Development Environment (Can Lose Data)

**Quick Fix - Start Fresh:**

```bash
# Save venues to JSON file for backup
psql $DATABASE_URL -c "COPY (SELECT * FROM venues) TO STDOUT WITH CSV HEADER" > /tmp/venues_backup.csv

# Drop and recreate schema
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Apply clean schema
npm run db:push --force

# Restore venues if needed
# (would require SQL INSERT statements)
```

### For Production Environment (Must Preserve Data)

**Careful Migration:**

1. **Audit Data Impact:**
   ```sql
   SELECT COUNT(*) FROM community_applications;
   SELECT COUNT(*) FROM experience_services;
   SELECT COUNT(*) FROM creator_earnings;
   SELECT COUNT(*) FROM venues; -- Should be 27
   ```

2. **Backup Critical Data:**
   ```bash
   pg_dump $DATABASE_URL > /tmp/database_backup.sql
   ```

3. **Apply Manual Migration:**
   - Run Option 3 SQL script above
   - Test each table after migration
   - Verify data integrity

4. **Run Final Sync:**
   ```bash
   npm run db:push --force
   ```

---

## ⚠️ Decision Required

**You need to decide:**

1. **Is the data in `community_applications` important?**
   - If NO → Use Option 1 or 2 (drop and recreate)
   - If YES → Use Option 3 (manual migration with data preservation)

2. **Is this a development or production environment?**
   - Development → Option 1 is fastest
   - Production → Option 3 is safest

3. **Can you lose all data and start fresh?**
   - If YES → Option 1 (fresh start)
   - If NO → Option 3 (careful migration)

---

## 🚀 Once Schema Drift is Resolved

After resolving the community_applications issue, the venue migration will proceed automatically:

```bash
npm run db:push
# Should now complete without prompts
# Will add all 11 venue columns
# Will preserve all 27 existing venues
```

---

## 📁 Files Involved

- **Schema Definition:** `shared/schema.ts`
- **Current Issue:** community_applications structure mismatch
- **Blocked Migration:** Venue field additions
- **Related Docs:** 
  - `docs/VENUE_SCHEMA_MIGRATION_GUIDE.md`
  - `docs/VENUE_MIGRATION_FILES_AND_RISKS.md`

---

## 🎯 Next Steps

1. **Review this document** and decide which option fits your needs
2. **Execute chosen migration strategy**
3. **Verify schema is in sync:**
   ```bash
   npm run db:push
   # Should complete without prompts
   ```
4. **Confirm venues migration:**
   ```sql
   SELECT COUNT(*) FROM venues; -- Should be 27
   \d venues -- Should show 35 columns
   ```

---

**Status:** Waiting for decision on how to handle `community_applications` table redesign.
