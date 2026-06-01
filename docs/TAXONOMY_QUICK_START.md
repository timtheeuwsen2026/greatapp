# Taxonomy System - Quick Start Guide

**Date:** October 17, 2025  
**Purpose:** Fast implementation guide for venue taxonomy and forms  

---

## 📚 Documentation Index

1. **TAXONOMY_SYSTEM_COMPLETE_GUIDE.md** - Canonical lists, database design, API endpoints
2. **VENUE_FORM_IMPLEMENTATION_GUIDE.md** - Exact Zod schema and form setup
3. **VENUE_FORM_PART2_COMPONENTS.md** - Helper components and transformations
4. **SAFE_MIGRATION_EXECUTION_GUIDE.md** - How to run migrations safely
5. **MIGRATION_VALIDATION_QUERIES.md** - Validation queries for data integrity

---

## 🚀 Quick Start: 5 Steps to Implementation

### Step 1: Create Taxonomy Constants (5 min)

Create `shared/taxonomy.ts`:

```typescript
export const VENUE_CATEGORIES = [
  { value: "retreat_center", label: "Retreat Center", group: "Retreat & Wellness" },
  { value: "yoga_studio", label: "Yoga Studio", group: "Retreat & Wellness" },
  // ... see TAXONOMY_SYSTEM_COMPLETE_GUIDE.md for full list
];

export const VENUE_VIBES = [
  { value: "peaceful", label: "Peaceful", emoji: "🕊️" },
  { value: "energetic", label: "Energetic", emoji: "⚡" },
  // ... see full list in guide
];
```

**Location:** Already documented in `TAXONOMY_SYSTEM_COMPLETE_GUIDE.md` Part 3

---

### Step 2: Seed Amenities Database (10 min)

Run the amenities seed script:

```bash
# Copy seed script from TAXONOMY_SYSTEM_COMPLETE_GUIDE.md Part 2.2
# Save as seed_amenities.sql
psql "$DATABASE_URL" -f seed_amenities.sql
```

**Verify:**
```sql
SELECT category, COUNT(*) FROM amenities GROUP BY category;
```

**Expected:** ~40 amenities across 10 categories

---

### Step 3: Add API Endpoints (15 min)

Add to `server/routes.ts`:

```typescript
// Get all amenities
app.get("/api/taxonomy/amenities", async (req, res) => {
  const allAmenities = await storage.getAmenities();
  res.json(allAmenities);
});

// Get venue categories (static)
app.get("/api/taxonomy/venue-categories", (req, res) => {
  res.json(VENUE_CATEGORIES);  // Import from shared/taxonomy.ts
});

// Get venue vibes (static)
app.get("/api/taxonomy/venue-vibes", (req, res) => {
  res.json(VENUE_VIBES);
});
```

Add storage methods to `server/storage.ts`:

```typescript
async getAmenities(): Promise<Amenity[]> {
  return await this.db
    .select()
    .from(amenities)
    .orderBy(amenities.popular, amenities.name);
}
```

**Full code:** See `TAXONOMY_SYSTEM_COMPLETE_GUIDE.md` Part 4

---

### Step 4: Create Helper Components (30 min)

Copy these 4 components from `VENUE_FORM_PART2_COMPONENTS.md`:

1. **MultiSelect** → `client/src/components/ui/multi-select.tsx`
2. **TagInput** → `client/src/components/ui/tag-input.tsx`
3. **ServiceEditor** → `client/src/components/service-editor.tsx`
4. **ImageUploader** → `client/src/components/image-uploader.tsx`

**Status:** Complete exact code provided in documentation

---

### Step 5: Create Venue Form (45 min)

Create these files:

1. **Zod Schema** → `client/src/schemas/venue-form-schema.ts`
   - Copy from `VENUE_FORM_IMPLEMENTATION_GUIDE.md` Part 1
   - Complete validation schema with all 40+ fields

2. **Venue Builder Form** → `client/src/pages/venue-builder.tsx`
   - Copy from `VENUE_FORM_IMPLEMENTATION_GUIDE.md` Part 2
   - Complete form with all sections:
     - ✅ Basic Information
     - ✅ Location & Geography
     - ✅ Categorization
     - ✅ Amenities
     - ✅ Services & Pricing
     - ✅ Images & Media
     - ✅ Social & Web

3. **Register Route** → `client/src/App.tsx`
   ```typescript
   <Route path="/venues/new" component={VenueBuilder} />
   ```

**Status:** Complete implementation code provided

---

## 🎯 What You Get

### Taxonomy Features

✅ **46 Venue Categories** - Organized in 4 groups (Retreat, Adventure, Urban, Specialty)  
✅ **48 Venue Vibes** - With emojis for visual selection  
✅ **6 Experience Categories** - Color-coded with icons  
✅ **40+ Standard Amenities** - Across 10 categories with icons  
✅ **Custom Amenities** - User-created beyond standard list  
✅ **Service Editor** - Complex pricing models (per person/event/day/hour)  

### Form Features

✅ **Auto-Slug Generation** - From venue name + city  
✅ **Slug Preview** - Live URL preview as you type  
✅ **Manual Override** - Option to customize slug  
✅ **Inline Validation** - Real-time Zod validation  
✅ **Error Display** - Field-level and form-level errors  
✅ **Multi-Select** - Searchable, grouped, with emoji support  
✅ **Tag Input** - Enter key to add, backspace to remove  
✅ **Image Upload** - Drag & drop, reorder, alt text  
✅ **Geo Coordinates** - Latitude/longitude with map picker  
✅ **Services Array** - Dynamic add/remove with pricing  

### Data Safety

✅ **Type-Safe** - Full TypeScript end-to-end  
✅ **Validated** - Zod schema on frontend + backend  
✅ **Null Handling** - Empty strings converted to null  
✅ **Array Defaults** - Empty arrays instead of null  
✅ **JSONB Support** - Complex nested objects  

---

## 📊 Database Schema Status

### ✅ Already Implemented (No changes needed)

```typescript
// Venues table has:
- categories: TEXT[]             // Venue types
- vibes: TEXT[]                  // Atmosphere tags
- amenities: TEXT[]              // Amenity IDs
- customAmenities: TEXT[]        // User-created amenities
- services: JSONB                // Service offerings
- latitude: NUMERIC(10,7)        // Geographic coordinates
- longitude: NUMERIC(10,7)
- region: TEXT                   // Geographic region
- pricingModel: TEXT             // Pricing strategy
- cancellationPolicy: TEXT       // Refund policy
- coverImages: JSONB             // New image structure
- galleryImagesJsonb: JSONB      // Gallery with metadata
```

**Migration Status:** Schema updated in code, needs database sync

---

## 🎨 UI/UX Pattern

### Multi-Select with Groups

```typescript
<MultiSelect
  options={VENUE_CATEGORIES}
  selected={categories}
  onChange={setCategories}
  groupBy="group"
  searchable
  maxSelections={5}
/>
```

**Renders:**
```
🔍 Search...

Retreat & Wellness
  ✓ Retreat Center
  ✓ Yoga Studio
  □ Meditation Center
  
Adventure & Nature
  □ Outdoor Camp
  □ Eco Lodge
  
[5 selected: retreat_center, yoga_studio, ...]
```

### Tag Input with Badges

```typescript
<TagInput
  tags={customAmenities}
  onTagsChange={setCustomAmenities}
  placeholder="Type and press Enter..."
  maxTags={10}
/>
```

**Renders:**
```
Type and press Enter...

[Saltwater Pool ×] [Sound Healing Room ×] [Infrared Sauna ×]

3 / 10 tags
```

---

## 🔄 Form Data Flow

### Input → Transformation → API → Database

```javascript
// 1. User Input
{
  name: "Zen Garden Retreat",
  city: "Sedona",
  categories: ["retreat_center", "yoga_studio"],
  vibes: ["peaceful", "luxurious"],
  latitude: 34.8697,
  website: "",  // Empty string
}

// 2. Form Transformation
{
  name: "Zen Garden Retreat",
  city: "Sedona",
  slug: "zen-garden-retreat-sedona",  // Auto-generated
  categories: ["retreat_center", "yoga_studio"],
  vibes: ["peaceful", "luxurious"],
  latitude: 34.8697,
  website: null,  // Converted to null
  createdBy: "user-uuid",  // Added
}

// 3. API Validation (Zod)
✓ name: length 3-255
✓ slug: lowercase-with-hyphens
✓ categories: array 1-5 items
✓ latitude: -90 to 90

// 4. Database Insert
INSERT INTO venues (...) VALUES (...)
RETURNING *;

// 5. Response
{
  id: "venue-uuid",
  name: "Zen Garden Retreat",
  slug: "zen-garden-retreat-sedona",
  // ... all fields
}
```

---

## 🧪 Testing Checklist

### Form Validation

- [ ] Name too short (< 3 chars) → Error
- [ ] Slug with spaces → Error
- [ ] No categories selected → Error
- [ ] More than 5 categories → Blocked
- [ ] Invalid latitude (> 90) → Error
- [ ] Invalid URL format → Error
- [ ] Instagram with @ symbol → Allowed (stripped)

### Slug Generation

- [ ] Type name + city → Auto-generates slug
- [ ] Special characters → Stripped
- [ ] Spaces → Converted to hyphens
- [ ] Multiple hyphens → Collapsed to one
- [ ] Manual edit → Stops auto-generation
- [ ] Click "Auto-Generate" → Regenerates

### Array Handling

- [ ] Multi-select categories → Array saved
- [ ] Add custom amenity → Added to array
- [ ] Remove vibe badge → Removed from array
- [ ] Form submission → Arrays intact

### Image Upload

- [ ] Upload image → Shows preview
- [ ] Add alt text → Saved in object
- [ ] Drag to reorder → Order updated
- [ ] Remove image → Deleted from array

---

## 🚨 Common Issues & Fixes

### Issue: "Column does not exist"
**Cause:** New venue columns not added to database  
**Fix:** Run venue migration (see SAFE_MIGRATION_EXECUTION_GUIDE.md)

### Issue: "Slug already exists"
**Cause:** Duplicate slug in database  
**Fix:** Backend adds numeric suffix (-1, -2) automatically

### Issue: "Invalid enum value"
**Cause:** Using custom category in enum field  
**Fix:** Venues use TEXT[] not ENUM, so custom values allowed

### Issue: Form won't submit
**Cause:** Validation errors  
**Fix:** Check `form.formState.errors` and display to user

### Issue: Images not uploading
**Cause:** No upload handler  
**Fix:** Implement cloud storage upload (ImageUploader uses base64 placeholder)

---

## 📦 Files to Create

```
shared/
  └── taxonomy.ts                    ← Canonical taxonomy lists

client/src/
  ├── schemas/
  │   └── venue-form-schema.ts       ← Zod validation
  ├── components/
  │   ├── ui/
  │   │   ├── multi-select.tsx       ← Multi-select component
  │   │   └── tag-input.tsx          ← Tag input component
  │   ├── service-editor.tsx         ← Service editor
  │   ├── image-uploader.tsx         ← Image upload
  │   └── location-picker.tsx        ← Map picker (optional)
  └── pages/
      └── venue-builder.tsx          ← Main form

server/
  └── routes.ts                      ← Add taxonomy endpoints

database/
  └── seed_amenities.sql             ← Amenity seed data
```

**Status:** All code provided in documentation

---

## 🎓 Learning Resources

### React Hook Form + Zod
- Form validation: `VENUE_FORM_IMPLEMENTATION_GUIDE.md` Part 1
- Form setup: `VENUE_FORM_IMPLEMENTATION_GUIDE.md` Part 2
- Error handling: `VENUE_FORM_PART2_COMPONENTS.md` Part 7

### Multi-Select Pattern
- Component code: `VENUE_FORM_PART2_COMPONENTS.md` Part 4.1
- Usage: `VENUE_FORM_IMPLEMENTATION_GUIDE.md` Categorization section

### Image Upload
- Component code: `VENUE_FORM_PART2_COMPONENTS.md` Part 4.4
- Usage: `VENUE_FORM_PART2_COMPONENTS.md` Images & Media section

### Taxonomy Design
- Database schema: `TAXONOMY_SYSTEM_COMPLETE_GUIDE.md` Part 1
- API design: `TAXONOMY_SYSTEM_COMPLETE_GUIDE.md` Part 4
- Migration: `SAFE_MIGRATION_EXECUTION_GUIDE.md`

---

## ✅ Next Steps

1. **Implement Components** (1-2 hours)
   - Create helper components from provided code
   - Test each component in isolation

2. **Build Form** (1-2 hours)
   - Create Zod schema
   - Build venue builder form
   - Wire up all sections

3. **Add API Endpoints** (30 min)
   - Taxonomy endpoints
   - Storage methods
   - Test with Postman/curl

4. **Seed Database** (10 min)
   - Run amenities seed script
   - Verify data

5. **Test End-to-End** (30 min)
   - Create test venue
   - Verify all fields save
   - Check validation

6. **Deploy** (5 min)
   - Commit changes
   - Push to production
   - Run migration on prod database

---

**Total Implementation Time:** ~4-5 hours  
**Difficulty:** Intermediate  
**Prerequisites:** React Hook Form, Zod, TypeScript basics  

🚀 **Ready to implement!** All exact code provided in the linked documentation.
