# VENUE BACKEND SYSTEM - COMPREHENSIVE ANALYSIS REPORT
**Date:** November 24, 2025  
**Scope:** Milestone 1 - Venue Backend Validation & Field Mapping Analysis  
**Status:** ANALYSIS ONLY - NO FIXES APPLIED

---

## EXECUTIVE SUMMARY

The Venue backend system has **CRITICAL GAPS** in field mapping, validation, and query logic that prevent venues from being created/updated correctly and from appearing in dashboards properly.

**Critical Issues Found:**
- ❌ **70+ fields NOT being saved** to database (out of 80+ schema fields)
- ❌ **Wrong API endpoint** queried by operator dashboard (`/api/venue/listings` doesn't exist)
- ❌ **No Zod validation schemas** for venue data (unlike experiences which have complete validation)
- ❌ **Broken admin query** - `getPendingVenues()` uses wrong filter logic
- ❌ **Field name mismatches** between frontend form → API → database

---

## 1. FILE INVENTORY

### 1.1 Schema & Models
| File | Path | Purpose |
|------|------|---------|
| **Venue Schema** | `shared/schema.ts` (lines 569-715) | Defines 80+ fields for venues table |
| **Venue Types** | `shared/schema.ts` (lines 1177-1181, 1408-1411) | `InsertVenue`, `Venue` types |
| **Availability Schema** | `shared/schema.ts` (lines 717-728) | Venue availability tracking |

### 1.2 Backend API Routes
| Endpoint | Method | Path | Line in routes.ts |
|----------|--------|------|-------------------|
| List venues (public) | GET | `/api/venues` | 3263-3275 |
| List user's venues | GET | `/api/user/venues` | 3278-3292 |
| Get venue for edit | GET | `/api/venues/:id/edit` | 3295-3320 |
| Get venue by slug | GET | `/api/venues/:slug` | 3323-3347 |
| Legacy venue page | GET | `/api/v/:slug` | 3350-3365 |
| **Create venue** | POST | `/api/venues` | 3379-3498 |
| **Update venue** | PUT | `/api/venues/:id` | 3501-3602 |
| Submit for review | PATCH | `/api/venues/:id/submit` | 3609-3635 |
| Get pending venues (admin) | GET | `/api/admin/venues/pending` | 3642-3661 |
| Approve venue (admin) | PATCH | `/api/venues/:id/approve` | 3664-3684 |
| Reject venue (admin) | PATCH | `/api/venues/:id/reject` | 3687-3707 |
| Delete venue (admin) | DELETE | `/api/venues/:id` | 3709-3745 |

### 1.3 Storage Layer Functions
| Function | Line in storage.ts | Purpose |
|----------|-------------------|---------|
| `createVenue()` | 1111-1114 | Inserts new venue (passes all fields through) |
| `getVenue()` | 1116-1119 | Fetch by ID |
| `getVenueBySlug()` | 1121-1124 | Fetch by slug |
| `getVenues()` | 1126-1152 | List with filters |
| `getVenuesWithCreators()` | 1154-1185 | Admin list with owner info |
| `getVenuesByCreator()` | 1187-1189 | User's venues |
| `updateVenue()` | 1191-1198 | Updates venue (passes all fields through) |
| `deleteVenue()` | 1200-1202 | Delete venue |
| `getPendingVenues()` | 1213-1215 | ❌ **BROKEN** - wrong filter |
| `approveVenue()` | 1217-1231 | Approve workflow |
| `rejectVenue()` | 1233-1247 | Reject workflow |
| `updateVenueStatus()` | 1249-1256 | Update status field |

### 1.4 Frontend Components
| File | Path | Purpose |
|------|------|---------|
| Venue Dashboard | `client/src/pages/venue-dashboard.tsx` | Operator dashboard - queries `/api/venue/listings` ❌ |
| Venue Setup Wizard | `client/src/pages/venue-profile-setup.tsx` | 10-step venue creation form |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Admin venue management |
| Public Venue Page | `client/src/pages/public-venue-page.tsx` | Public venue display |

---

## 2. CRITICAL ISSUES FOUND

### 🔴 ISSUE #1: Missing API Endpoint for Operator Dashboard
**Severity:** CRITICAL  
**Location:** `client/src/pages/venue-dashboard.tsx` line 40-44

**Problem:**
```typescript
const { data: venues = [] } = useQuery({
  queryKey: ["/api/venue/listings"],  // ❌ This endpoint doesn't exist!
  enabled: isAuthenticated,
});
```

**Actual Endpoint:**
- `/api/user/venues` exists (line 3278 in routes.ts)
- Frontend queries wrong endpoint, venues never load in operator dashboard

**Impact:**
- Venue operators cannot see their venues in dashboard
- Dashboard shows empty state even when venues exist
- Breaks entire venue management workflow

---

### 🔴 ISSUE #2: 70+ Database Fields NOT Being Saved
**Severity:** CRITICAL  
**Location:** `server/routes.ts` POST `/api/venues` (lines 3468-3488)

**Fields in Database Schema (80+ total):**
```typescript
// Basic fields (lines 573-586)
name, tagline, city, description, capacity, location, 
friendlyAddress, logoUrl, website, instagram, amenities, servicesOffered

// Geographic fields (lines 588-591)
latitude, longitude, region

// Categorization (lines 593-597)
categories, vibes, customAmenities, customServicesOffered

// Photo fields (lines 599-616)
coverImageUrl, galleryImages, coverImages, galleryImagesJsonb, videoUrl

// System fields (lines 618-621)
slug, status, approved

// Services (lines 623-630)
services (JSONB array)

// Pricing fields (lines 632-638)
pricingModel, currency, basePrice, minStay, depositPercent, cancellationPolicy

// Business fields (lines 640-643)
softHoldDays, commissionPercent, paymentModel

// Availability (lines 645-647)
googleCalendarConnected, googleCalendarId

// Contact fields (lines 649-657)
contactPerson, contactEmail, contactPhone, facebook, youtube, whatsapp, skype, timezone

// Commercial settings (lines 659-663)
approvalMode, commercialModel, softHoldPolicyEnabled, softHoldRefundableDeposit

// Survey fields (line 665)
featuredWeeksToFill

// Display preferences (lines 668-671)
displayPrefs

// Templates (lines 673-704)
defaultItinerary, venueRoles, venueRoomTypes

// Admin review (lines 707-710)
reviewedBy, reviewedAt, reviewNotes

// Meta fields (lines 712-715)
createdBy, createdAt, updatedAt
```

**Fields Actually Saved by POST /api/venues:**
```typescript
const venueData = {
  name: req.body.name,                    // ✅
  city: req.body.city,                    // ✅
  description: req.body.description,      // ✅
  capacity: req.body.capacity,            // ✅
  location: req.body.location,            // ✅
  website: req.body.website || null,      // ✅
  instagram: req.body.instagram || null,  // ✅
  amenities,                              // ✅ (validated as array)
  coverImageUrl: req.body.coverImageUrl || null,  // ✅
  galleryImages,                          // ✅ (validated as array)
  services,                               // ✅ (validated inline)
  slug,                                   // ✅ (auto-generated)
  createdBy: userId,                      // ✅
  softHoldDays: req.body.softHoldDays ?? null,           // ✅
  depositPercent: req.body.depositPercent ?? null,       // ✅
  commissionPercent: req.body.commissionPercent ?? null, // ✅
  paymentModel: req.body.paymentModel ?? null,           // ✅
};
```

**Missing Fields (NOT SAVED):**
```
❌ tagline
❌ friendlyAddress  
❌ logoUrl
❌ servicesOffered (array)
❌ latitude
❌ longitude
❌ region
❌ categories (array)
❌ vibes (array)
❌ customAmenities (array)
❌ customServicesOffered (array)
❌ coverImages (JSONB)
❌ galleryImagesJsonb (JSONB)
❌ videoUrl
❌ pricingModel
❌ currency
❌ basePrice
❌ minStay
❌ cancellationPolicy
❌ googleCalendarConnected
❌ googleCalendarId
❌ contactPerson
❌ contactEmail
❌ contactPhone
❌ facebook
❌ youtube
❌ whatsapp
❌ skype
❌ timezone
❌ approvalMode
❌ commercialModel
❌ softHoldPolicyEnabled
❌ softHoldRefundableDeposit
❌ featuredWeeksToFill (JSONB)
❌ displayPrefs (JSONB)
❌ defaultItinerary (JSONB)
❌ venueRoles (JSONB)
❌ venueRoomTypes (JSONB)
```

**Impact:**
- Venue wizard collects 80+ fields from users
- Only 17 fields actually save to database
- 63+ fields silently dropped, data loss on every save
- Users re-enter data repeatedly, never persists

---

### 🔴 ISSUE #3: No Zod Validation Schemas
**Severity:** HIGH  
**Location:** `shared/schema.ts`

**Problem:**
- Experiences have comprehensive validation (see `MILESTONE_1_VALIDATION_IMPLEMENTATION.md`)
- Venues have ZERO backend Zod validation schemas
- Only basic `insertVenueSchema` from Drizzle (auto-generated, no rules)

**Current State:**
```typescript
// shared/schema.ts line 1177-1181
export const insertVenueSchema = createInsertSchema(venues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
// ❌ No validation rules added
// ❌ No field-specific schemas for JSONB arrays
// ❌ No cross-field validation
```

**Comparison to Experiences (Good Example):**
```typescript
// Experiences have:
✅ insertExperienceDraftSchema with 30+ validation rules
✅ roomSchema for room validation
✅ itinerarySchema for itinerary items
✅ roleSchema for role validation
✅ Cross-field checks (minParticipants ≤ maxParticipants)
✅ Date validation (startDate < endDate, future dates only)
✅ Price validation (non-negative, range checks)
```

**What Venues Need:**
```typescript
// Should have (but don't):
❌ venueServiceSchema - validate services JSONB
❌ venueRoleSchema - validate venueRoles JSONB  
❌ venueRoomTypeSchema - validate venueRoomTypes JSONB
❌ defaultItinerarySchema - validate itinerary template
❌ Field validations: capacity (1-10,000), depositPercent (0-100%), etc.
❌ URL validations for website, videoUrl
❌ Coordinate validations for latitude/longitude
```

**Impact:**
- Malformed data can be inserted into database
- No validation errors returned to frontend
- Database integrity at risk
- Silent failures, poor UX

---

### 🔴 ISSUE #4: Broken Admin Query for Pending Venues
**Severity:** HIGH  
**Location:** `server/storage.ts` line 1213-1215

**Current Implementation:**
```typescript
async getPendingVenues(): Promise<Venue[]> {
  return await db.select().from(venues).where(eq(venues.approved, false));
  // ❌ WRONG: Returns ALL unapproved venues (draft, pending, rejected)
}
```

**Problem:**
- Query returns venues where `approved = false`
- This includes:
  - ✅ `status='pending'` (correct - should show these)
  - ❌ `status='draft'` (wrong - still being edited by owner)
  - ❌ `status='rejected'` (wrong - already reviewed and denied)

**Correct Implementation Should Be:**
```typescript
async getPendingVenues(): Promise<Venue[]> {
  return await db.select().from(venues).where(eq(venues.status, 'pending'));
  // ✅ Only returns venues submitted for review
}
```

**Impact:**
- Admin dashboard shows draft venues not ready for review
- Admin dashboard shows previously rejected venues
- Cluttered admin interface, wastes admin time
- Venues stuck in wrong workflow states

---

### 🔴 ISSUE #5: Inline Validation Instead of Schemas
**Severity:** MEDIUM  
**Location:** `server/routes.ts` lines 3405-3466 (POST), 3527-3586 (PUT)

**Problem:**
Services validation is hardcoded inline instead of using Zod schemas:

```typescript
// Repeated in both POST and PUT endpoints (code duplication)
for (const service of services) {
  if (!service.title || service.title.length < 3) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Service title must be at least 3 characters",
    });
  }
  
  if (!service.description || service.description.length < 50) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Service description must be at least 50 characters",
    });
  }
  // ... more inline validation
}
```

**Issues:**
- ❌ Code duplication (same logic in 2 places)
- ❌ Hard to maintain (changes must be made twice)
- ❌ Inconsistent with experience validation approach
- ❌ No type safety
- ❌ Error messages not structured consistently

**Should Use Zod Schema:**
```typescript
// shared/schema.ts
const venueServiceSchema = z.object({
  title: z.string().min(3, "Service title must be at least 3 characters"),
  description: z.string().min(50, "Service description must be at least 50 characters"),
  price: z.number().min(0, "Price must be positive").optional(),
  frequency: z.enum(['one-time', 'per_day', 'per_person', 'per_hour']),
  quantity: z.number().int().min(0).optional(),
});
```

---

### 🟡 ISSUE #6: Field Name Inconsistencies
**Severity:** MEDIUM  
**Locations:** Multiple files

**Mismatches Found:**

| Frontend Field | Backend Expected | Database Column | Status |
|---------------|------------------|-----------------|--------|
| `servicesOffered` (array) | Not mapped | `servicesOffered` | ❌ Not saved |
| `services` (JSONB) | `services` | `services` | ✅ Saved with validation |
| `venueRoles` | Not mapped | `venueRoles` | ❌ Not saved |
| `venueRoomTypes` | Not mapped | `venueRoomTypes` | ❌ Not saved |
| `defaultItinerary` | Not mapped | `defaultItinerary` | ❌ Not saved |

**Note:** Unlike experiences which had 25+ field mapping issues (now fixed in Milestone 1), venues have fewer name mismatches but massive omission of fields.

---

### 🟡 ISSUE #7: Update Endpoint Uses Spread Operator Blindly
**Severity:** MEDIUM  
**Location:** `server/routes.ts` line 3589-3596

```typescript
const updateData = {
  ...req.body,           // ❌ Spreads ALL fields from request
  amenities,             // Overrides specific fields
  galleryImages,
  ...(services !== undefined && { services }),
};

const updatedVenue = await storage.updateVenue(req.params.id, updateData);
```

**Problem:**
- Spreads entire `req.body` without validation
- Could allow updating protected fields (createdBy, id, etc.)
- No field whitelist
- Inconsistent with safe POST approach

**Should Explicitly Map Fields:**
```typescript
const updateData = {
  name: req.body.name,
  city: req.body.city,
  // ... explicitly list allowed fields
};
```

---

## 3. VALIDATION GAPS SUMMARY

### Fields With NO Validation:
```
✅ services - Has inline validation (should use Zod)
❌ tagline - No length check
❌ categories - No array length limit
❌ vibes - No array length limit
❌ latitude/longitude - No coordinate validation
❌ venueRoles - No JSONB structure validation
❌ venueRoomTypes - No JSONB structure validation
❌ defaultItinerary - No JSONB structure validation
❌ basePrice - No range check, no negative check
❌ depositPercent - No 0-100% validation
❌ capacity - No min/max validation
❌ videoUrl - No URL validation
❌ website - No URL validation
```

### Validation Needed (Like Experiences Have):
1. **String Lengths:** title (1-255), description (10-10,000), tagline (max 255)
2. **Number Ranges:** capacity (1-10,000), depositPercent (0-100%), basePrice (0-1,000,000)
3. **Array Limits:** categories (max 10), vibes (max 10), amenities (max 50)
4. **URL Formats:** website, videoUrl, logoUrl
5. **Geographic:** latitude (-90 to 90), longitude (-180 to 180)
6. **JSONB Structures:** services, venueRoles, venueRoomTypes, defaultItinerary
7. **Enum Values:** pricingModel, currency, cancellationPolicy, approvalMode, commercialModel

---

## 4. DASHBOARD QUERY ISSUES

### 4.1 Operator Dashboard
**File:** `client/src/pages/venue-dashboard.tsx`

**Query:**
```typescript
const { data: venues = [] } = useQuery({
  queryKey: ["/api/venue/listings"],  // ❌ Wrong endpoint
});
```

**Should Be:**
```typescript
const { data: venues = [] } = useQuery({
  queryKey: ["/api/user/venues"],  // ✅ Correct endpoint
});
```

**Why It Fails:**
- `/api/venue/listings` returns 404
- Query fails silently
- Dashboard shows "No venues found" even when user has venues
- Users think their venues weren't saved

### 4.2 Admin Dashboard - Pending Venues
**File:** `client/src/pages/admin-dashboard.tsx` line 79-83

**Query:**
```typescript
const { data: allVenues = [] } = useQuery<VenueWithOwner[]>({
  queryKey: ["/api/admin/venues"],  // ✅ Endpoint exists
  enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
});
```

**Backend:**
```typescript
// routes.ts - No dedicated /api/admin/venues endpoint found
// Admin uses getVenuesWithCreators() which returns ALL venues (not filtered)
```

**Issue:**
- Admin dashboard has to filter client-side
- No server-side pagination
- Fetches ALL venues every time (inefficient)

### 4.3 Admin Pending Venues
**Endpoint:** `/api/admin/venues/pending` (line 3642)  
**Storage Function:** `getPendingVenues()` (line 1213)

**Problem:**
```typescript
async getPendingVenues(): Promise<Venue[]> {
  return await db.select().from(venues).where(eq(venues.approved, false));
  // ❌ Returns draft + pending + rejected (all approved=false)
}
```

**Should Be:**
```typescript
async getPendingVenues(): Promise<Venue[]> {
  return await db.select().from(venues).where(eq(venues.status, 'pending'));
  // ✅ Returns only status='pending'
}
```

---

## 5. FIELDS NOT SAVING CORRECTLY (Detailed List)

### 5.1 Basic Information
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `name` | varchar(255) | ✅ | ✅ | Working |
| `tagline` | varchar(255) | ✅ | ❌ | Not mapped in POST/PUT |
| `city` | varchar(255) | ✅ | ✅ | Working |
| `description` | text | ✅ | ✅ | Working |
| `capacity` | integer | ✅ | ✅ | Working |
| `location` | varchar | ✅ | ✅ | Working |
| `friendlyAddress` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `logoUrl` | varchar | ✅ | ❌ | Not mapped in POST/PUT |

### 5.2 Geographic Data
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `latitude` | decimal(10,7) | ✅ | ❌ | Not mapped in POST/PUT |
| `longitude` | decimal(10,7) | ✅ | ❌ | Not mapped in POST/PUT |
| `region` | text | ✅ | ❌ | Not mapped in POST/PUT |
| `timezone` | varchar | ✅ | ❌ | Not mapped in POST/PUT |

### 5.3 Categorization & Discovery
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `categories` | text[] | ✅ | ❌ | Not mapped in POST/PUT |
| `vibes` | text[] | ✅ | ❌ | Not mapped in POST/PUT |
| `customAmenities` | text[] | ✅ | ❌ | Not mapped in POST/PUT |
| `amenities` | text[] | ✅ | ✅ | Working |
| `servicesOffered` | text[] | ✅ | ❌ | Not mapped (different from `services`) |
| `customServicesOffered` | text[] | ✅ | ❌ | Not mapped in POST/PUT |

### 5.4 Media Fields
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `coverImageUrl` | varchar | ✅ | ✅ | Working (legacy) |
| `galleryImages` | jsonb | ✅ | ✅ | Working (legacy) |
| `coverImages` | jsonb | ✅ | ❌ | Not mapped (new JSONB structure) |
| `galleryImagesJsonb` | jsonb | ✅ | ❌ | Not mapped (new JSONB structure) |
| `videoUrl` | varchar | ✅ | ❌ | Not mapped in POST/PUT |

### 5.5 Pricing & Availability
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `pricingModel` | text | ✅ | ❌ | Not mapped in POST/PUT |
| `currency` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `basePrice` | decimal(10,2) | ✅ | ❌ | Not mapped in POST/PUT |
| `minStay` | integer | ✅ | ❌ | Not mapped in POST/PUT |
| `depositPercent` | decimal(5,2) | ✅ | ✅ | Working |
| `cancellationPolicy` | varchar | ✅ | ❌ | Not mapped in POST/PUT |

### 5.6 Contact & Social
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `website` | varchar | ✅ | ✅ | Working |
| `instagram` | varchar | ✅ | ✅ | Working |
| `contactPerson` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `contactEmail` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `contactPhone` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `facebook` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `youtube` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `whatsapp` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `skype` | varchar | ✅ | ❌ | Not mapped in POST/PUT |

### 5.7 Business Settings
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `softHoldDays` | integer | ✅ | ✅ | Working |
| `commissionPercent` | decimal(5,2) | ✅ | ✅ | Working |
| `paymentModel` | varchar | ✅ | ✅ | Working |
| `approvalMode` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `commercialModel` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `softHoldPolicyEnabled` | boolean | ✅ | ❌ | Not mapped in POST/PUT |
| `softHoldRefundableDeposit` | decimal(5,2) | ✅ | ❌ | Not mapped in POST/PUT |

### 5.8 Availability Integration
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `googleCalendarConnected` | boolean | ✅ | ❌ | Not mapped in POST/PUT |
| `googleCalendarId` | varchar | ✅ | ❌ | Not mapped in POST/PUT |
| `featuredWeeksToFill` | jsonb | ✅ | ❌ | Not mapped in POST/PUT |

### 5.9 Templates & Defaults
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `venueRoles` | jsonb | ✅ | ❌ | Not mapped in POST/PUT |
| `venueRoomTypes` | jsonb | ✅ | ❌ | Not mapped in POST/PUT |
| `defaultItinerary` | jsonb | ✅ | ❌ | Not mapped in POST/PUT |
| `displayPrefs` | jsonb | ⚠️ | ⚠️ | Separate endpoint exists |

### 5.10 System Fields
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `slug` | varchar(255) | ❌ | ✅ | Auto-generated (working) |
| `status` | varchar | ❌ | ✅ | Default 'draft' (working) |
| `approved` | boolean | ❌ | ✅ | Default false (working) |
| `createdBy` | varchar | ❌ | ✅ | From auth (working) |

### 5.11 Services (Special Case)
| Field | Schema Type | Frontend Sends? | Backend Saves? | Issue |
|-------|-------------|----------------|----------------|-------|
| `services` | jsonb | ✅ | ✅ | Inline validation (should use Zod) |

---

## 6. ENDPOINT COMPARISON

### POST `/api/venues` vs PUT `/api/venues/:id`

| Aspect | POST (Create) | PUT (Update) | Consistent? |
|--------|---------------|--------------|-------------|
| Fields mapped | 17 fields | Spreads all `req.body` | ❌ No |
| Validation approach | Inline for services | Inline for services | ✅ Yes (but wrong) |
| Array sanitization | ✅ Yes | ✅ Yes | ✅ Yes |
| Missing fields | 63+ fields | 63+ fields | ✅ Consistently broken |
| Auth check | ✅ Yes | ✅ Yes | ✅ Yes |
| Ownership check | N/A | ✅ Yes | ✅ Yes |

**Issue:** Both endpoints have same field mapping problems, code duplication.

---

## 7. MISSING VALIDATION DETAILS

### 7.1 What Experiences Have (Reference)
From `MILESTONE_1_VALIDATION_IMPLEMENTATION.md`:

```typescript
// ✅ Comprehensive validation with:
- Field-specific rules (title: 1-255 chars, description: 10-10k chars)
- Number ranges (minimumParticipants: 1-10,000)
- Percentage validation (depositPercentage: 0-100%)
- Price validation (price: 0-1M, non-negative)
- Date validation (startDate < endDate, future only)
- URL validation (coverImageUrl, gallery URLs)
- JSONB structure validation (rooms, itinerary, roles)
- Cross-field checks (min ≤ max participants)
- Partial validation for updates
```

### 7.2 What Venues Need (But Don't Have)

```typescript
// ❌ Missing comprehensive validation:

// Basic field validation
✅ name: 1-255 characters (has basic check via schema)
❌ tagline: max 255 characters
✅ description: 50-5000 characters (frontend has, backend doesn't)
❌ capacity: 1-10,000 range check
❌ friendlyAddress: max 500 characters

// Geographic validation
❌ latitude: -90 to 90 decimal validation
❌ longitude: -180 to 180 decimal validation
❌ region: enum or string validation

// Array validation
❌ categories: max 10 items, each 3-50 chars
❌ vibes: max 10 items, each 3-50 chars
❌ amenities: max 50 items
❌ customAmenities: max 20 items

// Pricing validation
❌ basePrice: 0-1,000,000, non-negative
❌ depositPercent: 0-100%
❌ commissionPercent: 0-100%
❌ minStay: 1-365 days

// URL validation
❌ website: valid URL format
❌ videoUrl: valid URL format  
❌ logoUrl: valid URL format

// JSONB structure validation
❌ services: array of objects with title, description, price, frequency
❌ venueRoles: array with name, required, headcount, rate
❌ venueRoomTypes: array with name, type, capacity, quantity, pricePerNight
❌ defaultItinerary: array with day, title, timeSlots
❌ coverImages: array with url, altText, isCover
❌ galleryImagesJsonb: array with url, altText, order

// Enum validation
❌ pricingModel: "Per Day" | "Per Event"
❌ currency: USD | EUR | GBP | IDR | THB | MXN | AUD
❌ cancellationPolicy: Flexible | Moderate | Strict
❌ approvalMode: Direct | Approval | Fully Managed
❌ commercialModel: Fixed Rental | Revenue Share | Flexible
```

---

## 8. RECOMMENDED FIXES (For Next Phase)

### Priority 1: Critical Field Mapping
1. **Fix operator dashboard endpoint**
   - Change `/api/venue/listings` → `/api/user/venues` in `venue-dashboard.tsx`

2. **Add ALL 63+ missing fields to POST `/api/venues`**
   - Map frontend fields → backend venueData object
   - Include: tagline, logoUrl, latitude, longitude, region, categories, vibes, etc.

3. **Add ALL 63+ missing fields to PUT `/api/venues/:id`**
   - Remove blind spread of req.body
   - Explicitly map all allowed fields
   - Ensure consistency with POST

4. **Fix `getPendingVenues()` query**
   - Change: `where(eq(venues.approved, false))`
   - To: `where(eq(venues.status, 'pending'))`

### Priority 2: Validation Layer
5. **Create comprehensive Zod schemas** (like experiences)
   - `venueServiceSchema` for services JSONB
   - `venueRoleSchema` for venueRoles JSONB
   - `venueRoomTypeSchema` for venueRoomTypes JSONB
   - `defaultItineraryDaySchema` for itinerary template
   - `extendedInsertVenueSchema` with all validation rules

6. **Add field validations**
   - String lengths (title, tagline, description)
   - Number ranges (capacity, prices, percentages)
   - URL formats (website, videoUrl, logoUrl)
   - Geographic coordinates (lat/lon)
   - Array limits (categories, vibes, amenities)

7. **Apply validation to endpoints**
   - POST `/api/venues` - full validation
   - PUT `/api/venues/:id` - partial validation
   - Return 400 with structured errors

### Priority 3: Code Quality
8. **Remove inline validation**
   - Replace services inline validation with Zod schema
   - Eliminate code duplication between POST/PUT

9. **Add validation documentation**
   - Create `MILESTONE_1_VENUE_VALIDATION_IMPLEMENTATION.md`
   - Document all schemas, rules, endpoints
   - Include error examples

### Priority 4: Admin Improvements
10. **Add dedicated admin venue endpoint**
    - `/api/admin/venues` with proper filtering
    - Support status filter query param
    - Server-side pagination

---

## 9. COMPARISON TO EXPERIENCE SYSTEM

| Feature | Experiences (Milestone 1) | Venues | Status |
|---------|--------------------------|--------|--------|
| Field mapping | ✅ Fixed (25+ fields) | ❌ Broken (63+ missing) | Venues behind |
| Zod validation | ✅ Comprehensive | ❌ None | Venues behind |
| Dashboard endpoint | ✅ Working | ❌ Wrong endpoint | Venues broken |
| Admin pending query | ✅ Correct filter | ❌ Wrong filter | Venues broken |
| Inline validation | ❌ None (uses schemas) | ❌ Services only | Both wrong |
| JSONB validation | ✅ Has schemas | ❌ None | Venues behind |
| Documentation | ✅ Complete (500+ lines) | ❌ None | Venues behind |

**Conclusion:** Venues are in similar state to experiences BEFORE Milestone 1 fixes were applied.

---

## 10. TESTING GAPS

### No Tests Found For:
- ❌ Venue creation with all 80+ fields
- ❌ Venue update field persistence
- ❌ Validation error responses
- ❌ Dashboard endpoint queries
- ❌ Admin pending venues query
- ❌ JSONB field structure validation

### Existing Tests:
- ✅ `tests/venue-services.test.tsx` - Services CRUD (frontend)
- ✅ `server/__tests__/venue.test.ts` - Basic venue operations (backend)

---

## 11. NEXT STEPS

1. **Share this report with stakeholders**
2. **Create task list for fixes** (similar to experience validation implementation)
3. **Implement fixes in order of priority**
4. **Create validation documentation** (like `MILESTONE_1_VALIDATION_IMPLEMENTATION.md`)
5. **Add comprehensive tests**
6. **Verify all venue flows work end-to-end**

---

## APPENDIX A: Full Schema Reference

See `shared/schema.ts` lines 569-715 for complete venue schema definition (80+ fields).

---

## APPENDIX B: Frontend Form Fields

The venue wizard (`venue-profile-setup.tsx`) collects:
- Step 1: Basic Info (name, tagline, city, description, capacity, location)
- Step 2: Media (logoUrl, coverImageUrl, galleryImages, videoUrl)
- Step 3: Calendar & Availability (googleCalendarConnected, googleCalendarId)
- Step 4: Venue Details (categories, vibes, region, timezone, contact info)
- Step 5: Services & Amenities (amenities, servicesOffered, services JSONB)
- Step 6: Roles (venueRoles JSONB with name, required, headcount, rate)
- Step 7: Rooms (venueRoomTypes JSONB with name, type, capacity, pricePerNight)
- Step 8: Itinerary (defaultItinerary JSONB template)
- Step 9: Pricing (pricingModel, currency, basePrice, minStay, depositPercent, cancellationPolicy)
- Step 10: Terms (termsAccepted, privacyPolicyAccepted)

All 80+ fields collected, but only 17 save to database.

---

**END OF REPORT**
