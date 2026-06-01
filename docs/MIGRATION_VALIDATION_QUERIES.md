# Migration Validation Queries

**Date:** October 17, 2025  
**Purpose:** Verify venue and event schema migrations completed successfully  

---

## 🏨 Venue Migration Validation

### Query 1: Sample Venues with New Fields

```sql
-- Show 5 sample venues with all new geographic and categorization fields
SELECT 
  id,
  name,
  slug,
  city,
  latitude,
  longitude,
  region,
  categories,
  vibes,
  custom_amenities,
  pricing_model,
  cancellation_policy,
  jsonb_array_length(COALESCE(services, '[]'::jsonb)) as services_count,
  jsonb_array_length(COALESCE(cover_images, '[]'::jsonb)) as cover_images_count,
  jsonb_array_length(COALESCE(gallery_images_jsonb, '[]'::jsonb)) as gallery_count
FROM venues
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:**
- All venues should have unique slugs
- New fields (latitude, longitude, region, etc.) should be NULL or have default values
- categories, vibes, custom_amenities should be empty arrays `{}`
- services, cover_images, gallery_images_jsonb should be `[]` or count as 0

---

### Query 2: Venue Field Population Status

```sql
-- Count how many venues have data in each new field
SELECT 
  COUNT(*) as total_venues,
  COUNT(latitude) as has_latitude,
  COUNT(longitude) as has_longitude,
  COUNT(region) as has_region,
  COUNT(*) FILTER (WHERE categories != '{}') as has_categories,
  COUNT(*) FILTER (WHERE vibes != '{}') as has_vibes,
  COUNT(*) FILTER (WHERE custom_amenities != '{}') as has_custom_amenities,
  COUNT(*) FILTER (WHERE services != '[]'::jsonb) as has_services,
  COUNT(pricing_model) as has_pricing_model,
  COUNT(cancellation_policy) as has_cancellation_policy,
  COUNT(*) FILTER (WHERE cover_images != '[]'::jsonb) as has_cover_images,
  COUNT(*) FILTER (WHERE gallery_images_jsonb != '[]'::jsonb) as has_gallery_images_jsonb
FROM venues;
```

**Expected Result (Fresh Migration):**
```
total_venues: 27
has_latitude: 0
has_longitude: 0
has_region: 0
has_categories: 0
has_vibes: 0
has_custom_amenities: 0
has_services: 0
has_pricing_model: 0
has_cancellation_policy: 0
has_cover_images: 0
has_gallery_images_jsonb: 0
```

---

### Query 3: Venue Slug Validation

```sql
-- Verify all slugs are unique and properly formatted
SELECT 
  'Total Venues' as metric,
  COUNT(*)::text as value
FROM venues

UNION ALL

SELECT 
  'Unique Slugs',
  COUNT(DISTINCT slug)::text
FROM venues

UNION ALL

SELECT 
  'NULL Slugs',
  COUNT(*)::text
FROM venues
WHERE slug IS NULL

UNION ALL

SELECT 
  'Empty Slugs',
  COUNT(*)::text
FROM venues
WHERE slug = ''

UNION ALL

SELECT 
  'Invalid Format Slugs',
  COUNT(*)::text
FROM venues
WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
```

**Expected Result:**
```
metric                  | value
------------------------|------
Total Venues            | 27
Unique Slugs            | 27
NULL Slugs              | 0
Empty Slugs             | 0
Invalid Format Slugs    | 0
```

---

### Query 4: Duplicate Slug Detection

```sql
-- Find any duplicate slugs (should be empty after migration)
SELECT 
  slug,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as venue_ids,
  STRING_AGG(name || ' (' || city || ')', ', ') as venues
FROM venues
GROUP BY slug
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

**Expected Result:** Empty (no duplicates)

---

### Query 5: Venue Columns Existence Check

```sql
-- Verify all new columns exist in the venues table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'venues'
  AND column_name IN (
    'latitude', 'longitude', 'region', 
    'categories', 'vibes', 'custom_amenities',
    'services', 'pricing_model', 'cancellation_policy',
    'cover_images', 'gallery_images_jsonb'
  )
ORDER BY column_name;
```

**Expected Result:** All 11 columns should appear with correct types

---

### Query 6: Sample Venues with Full Details

```sql
-- Detailed view of 5 venues showing old and new fields
SELECT 
  v.id,
  v.name,
  v.slug,
  v.city,
  v.location,
  v.capacity,
  v.status,
  v.approved,
  -- New geographic fields
  v.latitude,
  v.longitude,
  v.region,
  -- New categorization
  COALESCE(array_length(v.categories, 1), 0) as categories_count,
  v.categories,
  COALESCE(array_length(v.vibes, 1), 0) as vibes_count,
  v.vibes,
  -- Legacy vs new image fields
  v.cover_image_url as old_cover_image,
  jsonb_array_length(COALESCE(v.cover_images, '[]'::jsonb)) as new_cover_images_count,
  COALESCE(array_length(v.gallery_images, 1), 0) as old_gallery_count,
  jsonb_array_length(COALESCE(v.gallery_images_jsonb, '[]'::jsonb)) as new_gallery_count
FROM venues v
ORDER BY v.created_at DESC
LIMIT 5;
```

---

## 🎉 Event (Experience) Migration Validation

### Query 7: Sample Events with New Fields

```sql
-- Show 5 sample events with all new MVG and commission fields
SELECT 
  id,
  title,
  slug,
  status,
  -- MVG fields
  mvg_enabled,
  mvg_min,
  mvg_deadline,
  mvg_status,
  -- Promoter commission
  promoter_commission,
  influencer_promotion_enabled,
  influencer_commission_pct,
  -- Room images
  jsonb_array_length(COALESCE(room_images, '[]'::jsonb)) as room_images_count,
  -- Basic info
  max_participants,
  current_participants,
  price
FROM experiences
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:**
- mvg_enabled should be TRUE (default)
- mvg_min should be 6 (default)
- promoter_commission should be 0.00 (default)
- room_images should be empty array (count 0)

---

### Query 8: Event Field Population Status

```sql
-- Count how many events have data in each new field
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE mvg_enabled = true) as mvg_enabled_count,
  COUNT(*) FILTER (WHERE mvg_enabled = false) as mvg_disabled_count,
  AVG(mvg_min) as avg_mvg_minimum,
  COUNT(mvg_deadline) as has_mvg_deadline,
  COUNT(*) FILTER (WHERE promoter_commission > 0) as has_promoter_commission,
  AVG(promoter_commission) as avg_promoter_commission,
  COUNT(*) FILTER (WHERE room_images != '[]'::jsonb) as has_room_images,
  COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'approved') as approved_count
FROM experiences;
```

**Expected Result (Fresh Migration):**
```
total_events: 35
mvg_enabled_count: 35 (all should have default true)
mvg_disabled_count: 0
avg_mvg_minimum: 6.0
has_mvg_deadline: 0 (or count of events with deadlines set)
has_promoter_commission: 0
avg_promoter_commission: 0.00
has_room_images: 0
draft_count: (varies)
pending_count: (varies)
approved_count: (varies)
```

---

### Query 9: Event Status Distribution

```sql
-- Show distribution of events by status
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM experiences
GROUP BY status
ORDER BY count DESC;
```

---

### Query 10: MVG Configuration Analysis

```sql
-- Analyze MVG settings across all events
SELECT 
  'Total Events' as metric,
  COUNT(*)::text as value
FROM experiences

UNION ALL

SELECT 
  'MVG Enabled',
  COUNT(*)::text
FROM experiences
WHERE mvg_enabled = true

UNION ALL

SELECT 
  'MVG Disabled',
  COUNT(*)::text
FROM experiences
WHERE mvg_enabled = false

UNION ALL

SELECT 
  'Has MVG Deadline',
  COUNT(*)::text
FROM experiences
WHERE mvg_deadline IS NOT NULL

UNION ALL

SELECT 
  'MVG Status: Pending',
  COUNT(*)::text
FROM experiences
WHERE mvg_status = 'pending'

UNION ALL

SELECT 
  'MVG Status: Met',
  COUNT(*)::text
FROM experiences
WHERE mvg_status = 'met'

UNION ALL

SELECT 
  'MVG Status: Failed',
  COUNT(*)::text
FROM experiences
WHERE mvg_status = 'failed';
```

---

### Query 11: Event Columns Existence Check

```sql
-- Verify all new columns exist in the experiences table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'experiences'
  AND column_name IN (
    'promoter_commission',
    'mvg_enabled',
    'room_images'
  )
ORDER BY column_name;
```

**Expected Result:**
```
column_name          | data_type | is_nullable | column_default
---------------------|-----------|-------------|---------------
mvg_enabled          | boolean   | YES         | true
promoter_commission  | numeric   | YES         | 0.00
room_images          | jsonb     | YES         | '[]'::jsonb
```

---

### Query 12: Experience Drafts Validation

```sql
-- Verify experience_drafts table also has new fields
SELECT 
  COUNT(*) as total_drafts,
  COUNT(*) FILTER (WHERE mvg_enabled = true) as mvg_enabled_count,
  COUNT(*) FILTER (WHERE promoter_commission > 0) as has_promoter_commission,
  COUNT(*) FILTER (WHERE room_images != '[]'::jsonb) as has_room_images
FROM experience_drafts;
```

---

### Query 13: Sample Events - Full Details

```sql
-- Detailed view of events with commission and MVG settings
SELECT 
  e.id,
  e.title,
  e.slug,
  e.status,
  e.category,
  e.experience_type,
  -- Pricing
  e.price,
  e.currency,
  -- Commissions
  e.promoter_commission,
  e.influencer_promotion_enabled,
  e.influencer_commission_pct,
  -- MVG
  e.mvg_enabled,
  e.mvg_min,
  e.mvg_deadline,
  e.mvg_status,
  -- Participants
  e.max_participants,
  e.current_participants,
  -- Room images
  jsonb_array_length(COALESCE(e.room_images, '[]'::jsonb)) as room_images_count,
  e.room_images,
  -- Dates
  e.start_date,
  e.end_date,
  e.created_at
FROM experiences e
ORDER BY e.created_at DESC
LIMIT 5;
```

---

## 🔍 Cross-Table Validation

### Query 14: Overall Migration Summary

```sql
-- Complete summary of both migrations
SELECT 
  'Venues' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT slug) as unique_slugs,
  (COUNT(*) = COUNT(DISTINCT slug)) as all_slugs_unique
FROM venues

UNION ALL

SELECT 
  'Experiences',
  COUNT(*),
  COUNT(DISTINCT slug),
  (COUNT(*) = COUNT(DISTINCT slug))
FROM experiences

UNION ALL

SELECT 
  'Experience Drafts',
  COUNT(*),
  0,
  true
FROM experience_drafts;
```

---

### Query 15: Slug Format Validation (Both Tables)

```sql
-- Check slug format in both venues and experiences
SELECT 
  'Venues' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') as valid_format,
  COUNT(*) FILTER (WHERE slug IS NULL OR slug = '') as null_or_empty
FROM venues

UNION ALL

SELECT 
  'Experiences',
  COUNT(*),
  COUNT(*) FILTER (WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  COUNT(*) FILTER (WHERE slug IS NULL OR slug = '')
FROM experiences;
```

---

### Query 16: Auto-Generated Slug Count

```sql
-- Count slugs with numeric suffixes (auto-generated for duplicates)
-- Pattern: ends with -1, -2, -3, etc.
SELECT 
  'Venues with numeric suffix' as category,
  COUNT(*) as count
FROM venues
WHERE slug ~ '-[0-9]+$'

UNION ALL

SELECT 
  'Venues without numeric suffix',
  COUNT(*)
FROM venues
WHERE slug !~ '-[0-9]+$'

UNION ALL

SELECT 
  'Experiences with numeric suffix',
  COUNT(*)
FROM experiences
WHERE slug ~ '-[0-9]+$'

UNION ALL

SELECT 
  'Experiences without numeric suffix',
  COUNT(*)
FROM experiences
WHERE slug !~ '-[0-9]+$';
```

**Interpretation:**
- Numeric suffix = duplicate was detected and handled automatically
- No suffix = original unique slug

---

### Query 17: Data Integrity Check

```sql
-- Verify foreign key relationships and data integrity
SELECT 
  'Venues' as check_type,
  'Total records' as metric,
  COUNT(*)::text as value
FROM venues

UNION ALL

SELECT 
  'Venues',
  'Valid created_by references',
  COUNT(*)::text
FROM venues v
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = v.created_by)

UNION ALL

SELECT 
  'Experiences',
  'Total records',
  COUNT(*)::text
FROM experiences

UNION ALL

SELECT 
  'Experiences',
  'Valid creator_id references',
  COUNT(*)::text
FROM experiences e
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = e.creator_id)

UNION ALL

SELECT 
  'Experiences',
  'Valid linked_venue_id references',
  COUNT(*)::text
FROM experiences e
WHERE e.linked_venue_id IS NOT NULL 
  AND EXISTS (SELECT 1 FROM venues v WHERE v.id = e.linked_venue_id);
```

---

## 📊 Quick Validation Checklist

Run this complete validation in one query:

```sql
-- MASTER VALIDATION QUERY
WITH venue_stats AS (
  SELECT 
    COUNT(*) as total_venues,
    COUNT(DISTINCT slug) as unique_slugs,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL) as has_geo_data,
    COUNT(*) FILTER (WHERE categories != '{}') as has_categories
  FROM venues
),
experience_stats AS (
  SELECT 
    COUNT(*) as total_experiences,
    COUNT(DISTINCT slug) as unique_slugs,
    COUNT(*) FILTER (WHERE mvg_enabled = true) as mvg_enabled,
    COUNT(*) FILTER (WHERE promoter_commission > 0) as has_commission
  FROM experiences
)
SELECT 
  '🏨 VENUES' as section,
  '' as check,
  '' as status
  
UNION ALL SELECT '', 'Total venues', vs.total_venues::text FROM venue_stats vs
UNION ALL SELECT '', 'Unique slugs', vs.unique_slugs::text FROM venue_stats vs
UNION ALL SELECT '', 'All slugs unique?', 
  CASE WHEN vs.total_venues = vs.unique_slugs THEN '✅ YES' ELSE '❌ NO' END
  FROM venue_stats vs
UNION ALL SELECT '', 'Has geo data', vs.has_geo_data::text FROM venue_stats vs
UNION ALL SELECT '', 'Has categories', vs.has_categories::text FROM venue_stats vs

UNION ALL SELECT '', '', ''

UNION ALL SELECT '🎉 EXPERIENCES', '', ''
UNION ALL SELECT '', 'Total events', es.total_experiences::text FROM experience_stats es
UNION ALL SELECT '', 'Unique slugs', es.unique_slugs::text FROM experience_stats es
UNION ALL SELECT '', 'All slugs unique?',
  CASE WHEN es.total_experiences = es.unique_slugs THEN '✅ YES' ELSE '❌ NO' END
  FROM experience_stats es
UNION ALL SELECT '', 'MVG enabled count', es.mvg_enabled::text FROM experience_stats es
UNION ALL SELECT '', 'Has promoter commission', es.has_commission::text FROM experience_stats es

UNION ALL SELECT '', '', ''

UNION ALL SELECT '✅ MIGRATION STATUS', '', ''
UNION ALL SELECT '', 'Venue migration',
  CASE WHEN (SELECT COUNT(*) FROM information_schema.columns 
             WHERE table_name = 'venues' AND column_name = 'latitude') > 0
  THEN '✅ COMPLETE' ELSE '❌ PENDING' END
UNION ALL SELECT '', 'Event migration',
  CASE WHEN (SELECT COUNT(*) FROM information_schema.columns 
             WHERE table_name = 'experiences' AND column_name = 'promoter_commission') > 0
  THEN '✅ COMPLETE' ELSE '❌ PENDING' END;
```

---

## 🎯 Expected Results Summary

### After Venue Migration:

```
✅ All 27 venues preserved
✅ All slugs unique
✅ 11 new columns added (latitude, longitude, region, categories, vibes, etc.)
✅ All new fields NULL or have default values
✅ No data loss
```

### After Event Migration:

```
✅ All 35 experiences preserved
✅ All slugs unique
✅ 3 new columns added (promoter_commission, mvg_enabled, room_images)
✅ All new fields have safe defaults
✅ mvg_enabled = true for all events
✅ promoter_commission = 0.00 for all events
✅ No data loss
```

---

## 🚨 Troubleshooting

### If Row Counts Don't Match

```sql
-- Compare before/after
SELECT 
  (SELECT COUNT(*) FROM venues_backup_pre_migration) as before_count,
  (SELECT COUNT(*) FROM venues) as after_count,
  (SELECT COUNT(*) FROM venues) - (SELECT COUNT(*) FROM venues_backup_pre_migration) as difference;
```

### If Duplicates Found

```sql
-- Find and list duplicates
SELECT slug, COUNT(*), STRING_AGG(id::text, ', ') as ids
FROM venues
GROUP BY slug
HAVING COUNT(*) > 1;
```

### If Columns Missing

```sql
-- List all venue columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'venues'
ORDER BY ordinal_position;
```

---

## 📁 Save Results to File

```bash
# Run validation and save to file
psql $DATABASE_URL -f validation_queries.sql > validation_results.txt

# Or run specific query
psql $DATABASE_URL -c "SELECT * FROM venues LIMIT 5;" > sample_venues.txt
```

---

## ✅ Success Criteria

Migration is successful when:

- [ ] All row counts match before/after
- [ ] All slugs are unique (no duplicates)
- [ ] No NULL or empty slugs
- [ ] All new columns exist with correct types
- [ ] All new columns have safe defaults
- [ ] Foreign key relationships intact
- [ ] Application starts without errors
- [ ] Sample queries return expected data

---

**Next Step:** Run these queries in order and verify each section passes ✅
