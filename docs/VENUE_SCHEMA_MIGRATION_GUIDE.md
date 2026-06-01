# Venue Schema Migration Guide

**Date:** October 17, 2025  
**Status:** Schema Updated - Ready for Migration  
**Existing Venues:** 27 records (all will be preserved)

---

## 📊 Schema Changes Summary

### ✅ Fields Already Exist (No Changes)
- `slug` (varchar, unique) ✅
- `amenities` (text[]) ✅
- `deposit_percent` (numeric 5,2) ✅
- `soft_hold_days` (integer) ✅
- `gallery_images` (text[]) ✅
- `cover_image_url` (varchar) ✅

### ✨ New Fields Added to Schema

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `latitude` | decimal(10,7) | NULL | Geographic coordinate (e.g., 40.7127837) |
| `longitude` | decimal(10,7) | NULL | Geographic coordinate (e.g., -74.0059413) |
| `region` | text | NULL | Geographic region (e.g., "North America") |
| `categories` | text[] | {} | Venue types (e.g., ["retreat_center", "yoga_studio"]) |
| `vibes` | text[] | {} | Atmosphere tags (e.g., ["peaceful", "luxury"]) |
| `custom_amenities` | text[] | {} | Custom amenities beyond standard list |
| `services` | jsonb | [] | Services offered with pricing details |
| `pricing_model` | text | NULL | Pricing structure (per_night, per_person, etc.) |
| `cancellation_policy` | text | NULL | Cancellation terms description |
| `cover_images` | jsonb | [] | Cover images with metadata {url, altText, isCover} |
| `gallery_images_jsonb` | jsonb | [] | Gallery images with metadata {url, altText, order} |

---

## 🔄 Migration Steps

### Step 1: Schema Already Updated ✅

The schema file (`shared/schema.ts`) has been updated with all new fields.

### Step 2: Apply Migration to Database

**Option A: Automatic Migration (Recommended)**

```bash
# This will add new columns to existing venues table
npm run db:push
```

**When prompted about `demand_notes` column:**
- Select: **"+ demand_notes create column"** (press Enter)

The migration will:
- ✅ Add 11 new columns to venues table
- ✅ Preserve all 27 existing venues
- ✅ Set NULL or default values for new fields
- ✅ Take < 5 seconds to complete

**Option B: Manual SQL Migration (If Option A Fails)**

```sql
-- Add geographic fields
ALTER TABLE venues ADD COLUMN latitude DECIMAL(10,7);
ALTER TABLE venues ADD COLUMN longitude DECIMAL(10,7);
ALTER TABLE venues ADD COLUMN region TEXT;

-- Add categorization fields
ALTER TABLE venues ADD COLUMN categories TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE venues ADD COLUMN vibes TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE venues ADD COLUMN custom_amenities TEXT[] DEFAULT '{}'::TEXT[];

-- Add services field
ALTER TABLE venues ADD COLUMN services JSONB DEFAULT '[]'::JSONB;

-- Add business fields
ALTER TABLE venues ADD COLUMN pricing_model TEXT;
ALTER TABLE venues ADD COLUMN cancellation_policy TEXT;

-- Add new image fields (JSONB structure)
ALTER TABLE venues ADD COLUMN cover_images JSONB DEFAULT '[]'::JSONB;
ALTER TABLE venues ADD COLUMN gallery_images_jsonb JSONB DEFAULT '[]'::JSONB;
```

### Step 3: Verify Migration

```sql
-- Check that all columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'venues'
ORDER BY ordinal_position;

-- Verify all 27 venues still exist
SELECT COUNT(*) as total_venues FROM venues;
-- Expected: 27

-- Check a sample venue has new fields
SELECT id, name, latitude, categories, services
FROM venues
LIMIT 1;
```

---

## 📋 Field Details & Usage

### Geographic Fields

```typescript
// Location tracking
latitude: 40.7127837  // New York City
longitude: -74.0059413
region: "North America"
```

### Categorization

```typescript
categories: ["retreat_center", "yoga_studio", "workshop_space"]
vibes: ["peaceful", "luxury", "wellness-focused", "adventurous"]
custom_amenities: ["Saltwater pool", "Sound healing room", "Organic garden"]
```

### Services Array (JSONB)

```typescript
services: [
  {
    title: "Catering",
    description: "Farm-to-table meals",
    price: 45,
    frequency: "per_person",
    quantity: null
  },
  {
    title: "Yoga instruction",
    description: "Daily morning yoga",
    price: 500,
    frequency: "per_event",
    quantity: 1
  }
]
```

### Pricing Model

```typescript
pricing_model: "per_night" | "per_person" | "per_event" | "flat_rate" | "custom"
```

### Cancellation Policy

```typescript
cancellation_policy: "Free cancellation up to 30 days before event. 50% refund 15-30 days. No refund within 15 days."
```

### Cover Images (JSONB)

```typescript
cover_images: [
  {
    url: "https://storage.googleapis.com/.../cover1.jpg",
    altText: "Mountain view from deck",
    isCover: true
  },
  {
    url: "https://storage.googleapis.com/.../cover2.jpg",
    altText: "Interior yoga studio",
    isCover: false
  }
]
```

### Gallery Images (JSONB)

```typescript
gallery_images_jsonb: [
  {
    url: "https://storage.googleapis.com/.../gallery1.jpg",
    altText: "Meditation room",
    order: 1
  },
  {
    url: "https://storage.googleapis.com/.../gallery2.jpg",
    altText: "Outdoor deck",
    order: 2
  }
]
```

---

## ⚠️ Important Notes

### Backward Compatibility

**Legacy fields preserved:**
- `cover_image_url` (varchar) - kept for backward compatibility
- `gallery_images` (text[]) - kept for backward compatibility

**New fields added:**
- `cover_images` (jsonb) - new structured format
- `gallery_images_jsonb` (jsonb) - new structured format

**Migration strategy:**
1. New code should use `cover_images` and `gallery_images_jsonb`
2. Old code using `cover_image_url` and `gallery_images` will continue working
3. Gradually migrate data from old → new format

### Data Migration (Optional)

After adding columns, you can migrate existing image data:

```sql
-- Migrate cover image URL to new JSONB structure
UPDATE venues
SET cover_images = jsonb_build_array(
  jsonb_build_object(
    'url', cover_image_url,
    'altText', name || ' cover image',
    'isCover', true
  )
)
WHERE cover_image_url IS NOT NULL
AND cover_images = '[]'::jsonb;

-- Migrate gallery images to new JSONB structure
UPDATE venues
SET gallery_images_jsonb = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'url', img,
      'altText', name || ' gallery image',
      'order', idx
    )
  )
  FROM unnest(gallery_images) WITH ORDINALITY AS t(img, idx)
)
WHERE array_length(gallery_images, 1) > 0
AND gallery_images_jsonb = '[]'::jsonb;
```

---

## 🔍 Validation Queries

### Check New Fields Are Null/Empty

```sql
-- All new fields should be NULL or empty arrays for existing venues
SELECT 
  id,
  name,
  latitude IS NULL as lat_is_null,
  longitude IS NULL as long_is_null,
  categories = '{}' as cats_empty,
  vibes = '{}' as vibes_empty,
  services = '[]'::jsonb as services_empty
FROM venues
LIMIT 5;
```

### Verify No Data Loss

```sql
-- Ensure all original fields still have data
SELECT 
  COUNT(*) as total,
  COUNT(name) as has_name,
  COUNT(description) as has_description,
  COUNT(location) as has_location,
  COUNT(slug) as has_slug
FROM venues;

-- All counts should equal total_venues (27)
```

---

## 🚀 Next Steps After Migration

### 1. Update Frontend Forms

**File:** `client/src/pages/venue-builder.tsx`

Add form fields for:
- Geographic coordinates (latitude/longitude)
- Region selector
- Category multi-select
- Vibes multi-select
- Custom amenities input
- Services editor (title, description, price, frequency)
- Pricing model selector
- Cancellation policy textarea
- Cover images uploader (JSONB format)
- Gallery images uploader (JSONB format)

### 2. Update Backend Endpoints

**File:** `server/routes.ts`

Update venue creation/update endpoints to accept new fields:
```typescript
// Validation schema automatically includes new fields
const venueData = insertVenueSchema.parse(req.body);
```

### 3. Update Public Venue Page

**File:** `client/src/pages/public-venue-page.tsx`

Display new fields:
- Show map with latitude/longitude
- Display vibes as badges
- Show services with pricing
- Display cancellation policy
- Use new JSONB image structure

---

## 📊 Risk Assessment

| Aspect | Risk Level | Notes |
|--------|-----------|-------|
| **Data Loss** | 🟢 ZERO | All new columns are nullable/have defaults |
| **Existing Records** | 🟢 SAFE | All 27 venues preserved |
| **Backward Compatibility** | 🟢 FULL | Old fields kept, new fields added |
| **Migration Time** | 🟢 FAST | < 5 seconds for 27 records |
| **Rollback** | 🟢 EASY | Can drop new columns if needed |

---

## ✅ Migration Checklist

Pre-Migration:
- [x] Schema updated in `shared/schema.ts`
- [x] Migration SQL generated
- [x] Existing data verified (27 venues)
- [x] Backup not needed (non-destructive changes)

Migration:
- [ ] Run `npm run db:push`
- [ ] Answer prompt: Select "create column"
- [ ] Wait for completion (< 5 seconds)

Post-Migration:
- [ ] Verify column count increased
- [ ] Verify all 27 venues still exist
- [ ] Check new columns have NULL/default values
- [ ] Test venue creation with new fields
- [ ] Update frontend forms
- [ ] Update backend validation

---

## 🔧 Troubleshooting

### Issue: Migration Prompts Are Interactive

**Solution:** The `demand_notes` column prompt is unrelated to venue changes. Simply press Enter to accept "create column" and continue.

### Issue: Migration Fails

**Fallback:** Use manual SQL migration (Option B above)

```bash
# Connect to database
psql $DATABASE_URL

# Run ALTER TABLE statements one by one
# (See Option B in Step 2)
```

### Issue: Drizzle Hangs on Push

**Solution:** Generate + apply migration manually

```bash
# Already done: Generated migration file
# migrations/0000_nice_black_tom.sql

# Apply manually (not recommended - creates from scratch)
# Better: use npm run db:push --force
npm run db:push --force
```

---

## 📚 Related Files

- **Schema Definition:** `shared/schema.ts` (lines 488-560)
- **Insert Schema:** Auto-generated from `insertVenueSchema`
- **Storage Interface:** `server/storage.ts`
- **API Routes:** `server/routes.ts`
- **Frontend Forms:** `client/src/pages/venue-builder.tsx`
- **Public Page:** `client/src/pages/public-venue-page.tsx`

---

## 🎉 Summary

**Changes Made:**
- ✅ Added 11 new columns to venues table schema
- ✅ All fields nullable or have safe defaults
- ✅ Backward compatible with existing code
- ✅ Ready to migrate 27 existing venues

**What Happens:**
- ✅ Existing venues get NULL or [] for new fields
- ✅ No data is deleted or modified
- ✅ Old image fields continue working
- ✅ Can populate new fields gradually

**Ready to Run Migration!** 🚀
