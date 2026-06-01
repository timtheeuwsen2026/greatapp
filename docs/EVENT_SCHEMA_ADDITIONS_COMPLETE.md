# Event (Experience) Table Additions - Complete

**Date:** October 17, 2025  
**Status:** ✅ COMPLETED  
**Existing Events Preserved:** 35 experiences + 319 drafts

---

## ✅ Successfully Added Fields

### 1. `promoter_commission` ✅

**Type:** NUMERIC(5, 2)  
**Default:** 0.00  
**Purpose:** Commission percentage for promoters/affiliates

**Usage:**
```typescript
// Set 10% commission for promoters
experience.promoterCommission = 10.00;
```

**Added to:**
- ✅ `experiences` table
- ✅ `experience_drafts` table

---

### 2. `mvg_enabled` ✅

**Type:** BOOLEAN  
**Default:** true  
**Purpose:** Enable/disable Minimum Viable Group functionality

**Note:** This field was already present in `experience_drafts` but was missing in `experiences` table. Now both tables have it.

**Usage:**
```typescript
// Disable MVG for this event
experience.mvgEnabled = false;
```

**Added to:**
- ✅ `experiences` table
- ✅ Already existed in `experience_drafts` table

---

### 3. `mvg_minimum` ✅

**Type:** INTEGER  
**Default:** 6  
**Field Name:** `mvg_min` (already exists)

**Status:** ✅ **Already existed** - No changes needed

The `experiences` table already has:
- `mvg_min` (integer, default 6)
- `minimum_participants` (integer, default 6)
- Both serve the same purpose

---

### 4. `mvg_deadline` ✅

**Type:** TIMESTAMP WITH TIME ZONE  
**Default:** NULL  
**Purpose:** Deadline for reaching minimum group size

**Status:** ✅ **Updated** - Changed from `TIMESTAMP` to `TIMESTAMP WITH TIME ZONE`

**Usage:**
```typescript
// Set deadline 7 days before event
experience.mvgDeadline = new Date('2025-11-01T00:00:00Z');
```

**Added to:**
- ✅ `experiences` table (type updated to include timezone)
- ⚠️ `experience_drafts` uses `mvg_deadline_days` (INTEGER) instead - this is intentional as drafts use relative dates

---

### 5. `status` ✅

**Type:** ENUM (experience_status)  
**Allowed Values:** 'draft', 'pending_approval', 'pending', 'approved', 'published', 'rejected', 'cancelled'  
**Default:** 'draft'

**Status:** ✅ **Already existed** - No changes needed

The status field already existed with the requested values plus additional states.

---

### 6. `room_images` ✅

**Type:** JSONB Array  
**Default:** []  
**Purpose:** Store room images separately from individual room galleries

**Structure:**
```typescript
roomImages: Array<{
  url: string;
  altText?: string;
  roomId?: string;  // Link to specific room if applicable
  order?: number;   // Display order
}>
```

**Usage:**
```typescript
// Add room image
experience.roomImages = [
  {
    url: "https://example.com/room1.jpg",
    altText: "Luxury Suite",
    roomId: "room-123",
    order: 1
  },
  {
    url: "https://example.com/room2.jpg",
    altText: "Standard Room",
    roomId: "room-456",
    order: 2
  }
];
```

**Added to:**
- ✅ `experiences` table
- ✅ `experience_drafts` table

**Note:** This is separate from the `rooms` field, which has its own `gallery` property per room:
```typescript
rooms: Array<{
  id: string;
  name: string;
  gallery?: string[];  // Per-room gallery
  // ... other room fields
}>
```

---

## 📊 Verification Results

### Database Changes Applied

```sql
✅ experiences table:
   - Added promoter_commission (NUMERIC 5,2, default 0.00)
   - Added mvg_enabled (BOOLEAN, default true)
   - Added room_images (JSONB, default [])
   - Updated mvg_deadline (TIMESTAMP → TIMESTAMP WITH TIME ZONE)

✅ experience_drafts table:
   - Added promoter_commission (NUMERIC 5,2, default 0.00)
   - Added room_images (JSONB, default [])
   - mvg_enabled already existed
```

### Data Impact

| Table | Records | Status |
|-------|---------|--------|
| `experiences` | 35 | ✅ All preserved with new fields set to defaults |
| `experience_drafts` | 319 | ✅ All preserved with new fields set to defaults |

**Total:** 354 records updated with new fields, **zero data loss**

---

## 🔍 Field Summary Table

| Requested Field | Schema Field | Type | Status | Default | Tables |
|----------------|--------------|------|--------|---------|--------|
| `promoter_commission` | `promoterCommission` | NUMERIC(5,2) | ✅ **NEW** | 0.00 | experiences, experience_drafts |
| `mvg_enabled` | `mvgEnabled` | BOOLEAN | ✅ **ADDED** | true | experiences (added), experience_drafts (existed) |
| `mvg_minimum` | `mvgMin` | INTEGER | ✅ **EXISTS** | 6 | experiences, experience_drafts |
| `mvg_deadline` | `mvgDeadline` | TIMESTAMPTZ | ✅ **UPDATED** | NULL | experiences (type updated) |
| `status` | `status` | ENUM | ✅ **EXISTS** | 'draft' | experiences, experience_drafts |
| `room_images` | `roomImages` | JSONB | ✅ **NEW** | [] | experiences, experience_drafts |

---

## 🎯 Next Steps

### Backend (Auto-Updated) ✅

The insert and update schemas are automatically generated from the table definitions, so they already include the new fields:

```typescript
// These work automatically - no code changes needed
insertExperienceSchema.parse(data); // Includes new fields
insertExperienceDraftSchema.parse(data); // Includes new fields
```

### Frontend Updates Needed

#### 1. Event Builder Form

**File:** `client/src/pages/event-builder.tsx` (or similar)

Add form fields for:

```typescript
// Promoter Commission (Step 8: Monetization)
<FormField
  control={form.control}
  name="promoterCommission"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Promoter Commission (%)</FormLabel>
      <FormControl>
        <Input 
          type="number" 
          step="0.01" 
          placeholder="0.00"
          {...field}
        />
      </FormControl>
      <FormDescription>
        Commission percentage for affiliates/promoters (e.g., 10 for 10%)
      </FormDescription>
    </FormItem>
  )}
/>

// MVG Enabled Toggle (Step 7: Pricing)
<FormField
  control={form.control}
  name="mvgEnabled"
  render={({ field }) => (
    <FormItem className="flex items-center justify-between">
      <div>
        <FormLabel>Enable Minimum Viable Group</FormLabel>
        <FormDescription>
          Require minimum participants before event is confirmed
        </FormDescription>
      </div>
      <FormControl>
        <Switch
          checked={field.value}
          onCheckedChange={field.onChange}
        />
      </FormControl>
    </FormItem>
  )}
/>

// Room Images Upload (Step 9: Media)
<FormField
  control={form.control}
  name="roomImages"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Room Images</FormLabel>
      <FormControl>
        <ImageUploader
          images={field.value}
          onImagesChange={field.onChange}
          maxImages={10}
        />
      </FormControl>
      <FormDescription>
        Upload images of accommodation rooms (max 10)
      </FormDescription>
    </FormItem>
  )}
/>
```

#### 2. Public Event Page

**File:** `client/src/pages/public-event-page.tsx`

Display new fields:

```typescript
// Show promoter commission if enabled
{experience.promoterCommission > 0 && (
  <div className="flex items-center gap-2">
    <Users className="h-4 w-4" />
    <span>Earn {experience.promoterCommission}% by sharing this event</span>
  </div>
)}

// Show MVG status
{experience.mvgEnabled && (
  <div className="border rounded-lg p-4">
    <h3 className="font-semibold">Minimum Group Size</h3>
    <p>This event requires at least {experience.mvgMin} participants</p>
    {experience.mvgDeadline && (
      <p className="text-sm text-muted-foreground">
        Deadline: {formatDate(experience.mvgDeadline)}
      </p>
    )}
    <Badge>{experience.mvgStatus}</Badge>
  </div>
)}

// Display room images gallery
{experience.roomImages && experience.roomImages.length > 0 && (
  <div className="mt-6">
    <h3 className="font-semibold mb-4">Accommodation</h3>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {experience.roomImages
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((img, idx) => (
          <div key={idx} className="relative aspect-video">
            <img
              src={img.url}
              alt={img.altText || `Room ${idx + 1}`}
              className="object-cover rounded-lg w-full h-full"
            />
            {img.altText && (
              <p className="text-sm mt-1">{img.altText}</p>
            )}
          </div>
        ))}
    </div>
  </div>
)}
```

---

## 🔄 Comparison: Events vs Drafts

### MVG Fields Difference

**Experience Drafts** (uses relative dates):
```typescript
mvgEnabled: boolean         // Enable/disable
mvgMinimumSize: integer     // Minimum participants
mvgDeadlineDays: integer    // Days before event (relative)
mvgStatus: enum             // Status
```

**Published Experiences** (uses absolute dates):
```typescript
mvgEnabled: boolean           // Enable/disable  ✅ NEW
mvgMin: integer              // Minimum participants
mvgDeadline: timestamptz     // Actual deadline date ✅ UPDATED
mvgStatus: enum              // Status
```

This difference is intentional:
- Drafts don't have final dates yet → use days before
- Published experiences have dates → use actual timestamp

---

## 📁 Files Changed

| File | Changes | Status |
|------|---------|--------|
| `shared/schema.ts` | Added 3 new fields, updated 1 field type | ✅ Updated |
| Database: `experiences` | Added 3 columns, updated 1 column type | ✅ Migrated |
| Database: `experience_drafts` | Added 2 columns | ✅ Migrated |

---

## ✅ Migration Summary

**What was added:**
- ✅ `promoter_commission` field for affiliate commissions
- ✅ `mvg_enabled` flag to toggle MVG functionality
- ✅ `room_images` JSONB array for accommodation photos
- ✅ Updated `mvg_deadline` to use timezone-aware timestamps

**Data safety:**
- ✅ All 35 experiences preserved
- ✅ All 319 drafts preserved
- ✅ All new fields have safe defaults
- ✅ No data loss
- ✅ Backward compatible

**Migration time:** < 1 second  
**Risk level:** 🟢 ZERO

---

## 🎉 Status: COMPLETE

All requested event table fields have been successfully added to the database. The schema is updated, migrations applied, and all existing data preserved.

**Ready for:**
- ✅ Backend API usage (auto-validated)
- ⏳ Frontend form updates (manual update needed)
- ⏳ Public page display (manual update needed)
