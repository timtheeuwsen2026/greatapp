# Trip Creation API - Full Backend Validation Review

**Date:** November 22, 2025  
**Scope:** Backend-side validation for Trip/Experience creation endpoints  
**Files Analyzed:** `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`

---

## EXECUTIVE SUMMARY

**Critical Findings:** ⚠️ **MULTIPLE ISSUES BLOCKING MILESTONE 1**

The Trip creation system has **3 separate endpoints** with **inconsistent validation** and **design conflicts**:

1. `POST /api/trips` (Line 1839) - **MINIMAL VALIDATION** ✅ Works but too lenient
2. `POST /api/experiences` (Line 1587) - **NO VALIDATION AT ALL** ❌ Dangerous
3. `POST /api/experience-drafts/:id/publish` (Line 1402) - **GOOD VALIDATION** ✅ Best endpoint
4. `POST /api/events/saveDraft` (Line 500) - **LEGACY/DUPLICATE** ⚠️ Confusing

**Result:** Inconsistent behavior across endpoints, missing Zod validation, dangerous field handling

---

## ENDPOINT ANALYSIS

### ENDPOINT #1: `POST /api/trips` (TRIP CREATION)
**File:** `server/routes.ts` (Lines 1839-1867)  
**Status:** ⚠️ MINIMAL VALIDATION (Accepts anything)

#### Route Definition
```typescript
app.post("/api/trips", isAuthenticated, async (req: any, res) => {
```

#### Input Fields Accepted
The endpoint accepts **ANY field** from `req.body` via spread operator:
```typescript
const draftData = { ...parsedBody, creatorId: userId };
```

#### Processing Logic
```typescript
// 1. Parse body
const parsedBody = { ...req.body };

// 2. Date normalization (Defense in depth)
if (parsedBody.startDate) {
  const date = new Date(parsedBody.startDate);
  parsedBody.startDate = !isNaN(date.getTime()) ? date : null;
}
if (parsedBody.endDate) {
  const date = new Date(parsedBody.endDate);
  parsedBody.endDate = !isNaN(date.getTime()) ? date : null;
}
if (parsedBody.mvgDeadline) {
  const date = new Date(parsedBody.mvgDeadline);
  parsedBody.mvgDeadline = !isNaN(date.getTime()) ? date : null;
}

// 3. Add creator ID
const draftData = { ...parsedBody, creatorId: userId };

// 4. Create draft (NO VALIDATION)
const draft = await storage.createExperienceDraft(draftData);
res.json(draft);
```

#### Database Insert Logic
**File:** `server/storage.ts` (Lines 1718-1724)
```typescript
async createExperienceDraft(draft: InsertExperienceDraft): Promise<ExperienceDraft> {
  const [created] = await db
    .insert(experienceDrafts)
    .values(draft)
    .returning();
  return created;
}
```

**Issues:**
- ❌ **NO Zod validation** before insert
- ❌ **NO field checks** - accepts any field name
- ❌ **NO required field validation** - all fields optional
- ✅ Date normalization present (good)
- ❌ **NO type casting** - relies on database schema

---

### ENDPOINT #2: `POST /api/experiences` (DIRECT EXPERIENCE CREATION)
**File:** `server/routes.ts` (Lines 1587-1632)  
**Status:** ❌ DANGEROUS - NO VALIDATION

#### Route Definition
```typescript
app.post("/api/experiences", isAuthenticated, async (req: any, res) => {
```

#### Input Fields Accepted
Again, **ANY field** via spread:
```typescript
const experienceData = {
  ...req.body,
  experienceType: req.body.type,
  creatorId: userId,
  status: status as any,
  startDate,
  endDate,
};
```

#### Processing Logic
```typescript
const userId = req.user.claims.sub;

// Check creator profile completion (for status determination only)
const creatorProfile = await storage.getCreatorProfile(userId);
const hasCompletedProfile = creatorProfile && (creatorProfile as any).completed;

// Parse dates
const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
const endDate = req.body.endDate 
  ? new Date(req.body.endDate) 
  : (req.body.type === "one-day" && startDate ? startDate : startDate);

// Determine status (no request validation)
const requestedStatus = req.body.status;
const validStatuses = ["published", "pending_approval", "draft"];
let status = "published";

if (requestedStatus && validStatuses.includes(requestedStatus)) {
  if (requestedStatus === "published" && !hasCompletedProfile) {
    status = "pending_approval";
  } else {
    status = requestedStatus;
  }
} else if (!hasCompletedProfile) {
  status = "pending_approval";
}

// Create experience (NO VALIDATION)
const experienceData = {
  ...req.body,
  experienceType: req.body.type,
  creatorId: userId,
  status: status as any,
  startDate,
  endDate,
};

const experience = await storage.createExperience(experienceData);
res.json(experience);
```

**Issues:**
- ❌ **NO Zod validation** before insert
- ❌ **NO required field checks** (title, description, price, etc.)
- ❌ **NO field type validation**
- ❌ **NO price validation** (could be negative, zero, huge)
- ❌ **NO capacity validation** (maxParticipants could be 0 or -1)
- ❌ **NO date validation** (startDate could be in past, endDate before startDate)
- ⚠️ Field mapping: `type` → `experienceType` (inconsistent naming)
- ❌ **DANGEROUS:** Accepts `status` directly from request (user can publish without approval)

---

### ENDPOINT #3: `POST /api/experience-drafts/:id/publish` (DRAFT PUBLICATION)
**File:** `server/routes.ts` (Lines 1402-1584)  
**Status:** ✅ GOOD - HAS VALIDATION

#### Route Definition
```typescript
app.post("/api/experience-drafts/:id/publish", isAuthenticated, async (req: any, res) => {
```

#### Validation Function
```typescript
const validateDraftForPublication = (data: any) => {
  const errors: string[] = [];
  
  // Demo event bypass (Marrakesh)
  const isDemoEvent = data.title?.toLowerCase().includes('mystic') && 
                      data.title?.toLowerCase().includes('marrakesh');
  
  // 1. Cover image validation
  if (!isDemoEvent) {
    if (!data.coverImageUrl || data.coverImageUrl.trim() === '') {
      errors.push("Please add a cover photo...");
    } else if (!data.coverImageUrl.startsWith('https://')) {
      errors.push("Cover photo must be uploaded through secure image uploader...");
    }
  }
  
  // 2. Gallery validation
  if (!isDemoEvent && data.gallery && data.gallery.length > 0) {
    const invalidGalleryUrls = data.gallery.filter((url: string) => !url || !url.startsWith('https://'));
    if (invalidGalleryUrls.length > 0) {
      errors.push("Some gallery images have invalid formats...");
    }
  }
  
  // 3. Title validation
  if (!data.title || data.title.trim() === '') {
    errors.push("Please add a compelling title...");
  } else if (data.title.length < 10) {
    errors.push("Experience title should be at least 10 characters...");
  }
  
  // 4. Description validation
  if (!data.description || data.description.trim() === '') {
    errors.push("Please add a detailed description...");
  } else if (data.description.length < 50) {
    errors.push("Description should be at least 50 characters...");
  }
  
  // 5. Start date validation
  if (!data.startDate) {
    errors.push("Please select when your experience will take place");
  } else {
    const startDate = new Date(data.startDate);
    const now = new Date();
    if (startDate < now) {
      errors.push("Experience start date must be in the future");
    }
  }
  
  // 6. Location validation
  if (!data.location || data.location.trim() === '') {
    errors.push("Please specify where your experience will take place...");
  }
  
  // 7. Price validation
  if (!data.price || data.price === '') {
    errors.push("Please set a price for your experience");
  } else if (parseFloat(data.price) <= 0) {
    errors.push("Experience price must be greater than $0");
  } else if (parseFloat(data.price) > 10000) {
    errors.push("Experience price seems unusually high...");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    missingFields: errors.length
  };
};
```

**Processing After Validation:**
```typescript
// Convert to experience with complex field mapping
const experienceData = {
  title: draft.title || '',
  description: draft.description || '',
  shortDescription: draft.shortDescription,
  category: (draft.category as "sports_wellness" | "retreats" | ...) || "community_social",
  experienceType: (draft.type as "one-day" | "multi-day" | "virtual") || "one-day",
  coverImageUrl,
  gallery: draft.gallery || [],
  location: draft.location || '',
  venue: draft.venue,
  startDate,
  endDate,
  maxParticipants: draft.maxParticipants || 10,
  currentParticipants: 0,
  price: (draft.price || '0').toString(),
  creatorId: userId,
  status: "pending_approval" as const,
  
  // Map selectedVenueId to linkedVenueId
  linkedVenueId: (draft as any).selectedVenueId || null,
  
  // Convert selectedServiceIds/selectedAmenityIds to structured objects
  services: [...],
  amenities: [...],
  
  roles: [...],
  // ... many more fields
};

const experience = await storage.createExperience(experienceData);
```

**Assessment:**
- ✅ **HAS Validation** (custom function, not Zod)
- ✅ Checks all required Milestone 1 fields
- ✅ Field mapping is comprehensive
- ⚠️ Validation is **manual string checking**, not Zod (fragile)
- ⚠️ No validation for `rooms`, `itinerary`, `pricing` structure

---

### ENDPOINT #4: `POST /api/events/saveDraft` (LEGACY)
**File:** `server/routes.ts` (Lines 500-547)  
**Status:** ⚠️ LEGACY DUPLICATE - SAME AS `/api/trips`

```typescript
app.post('/api/events/saveDraft', async (req: any, res) => {
  // Same logic as /api/trips
  // NO VALIDATION
  // Just spreads req.body and saves
}
```

**Issues:**
- ⚠️ **DUPLICATE ENDPOINT** - same functionality as `/api/trips`
- ❌ **LEGACY NAME** - confusing API surface
- ❌ **INCONSISTENT** - different from `/api/experience-drafts/:id/publish`

---

## MILESTONE 1 FIELD COMPARISON

### Required Milestone 1 Fields vs. API Acceptance

| Field | `/api/trips` | `/api/experiences` | `/api/.../publish` | Validation | Issue |
|-------|-------------|-------------------|-------------------|----------|-------|
| **title** | ✅ Accepted | ✅ Accepted | ✅ Validated | ❌ NO Zod | Manual check only |
| **description** | ✅ Accepted | ✅ Accepted | ✅ Validated | ❌ NO Zod | Manual check only |
| **threshold** (minParticipants) | ✅ Accepted | ✅ Accepted | ⚠️ Default 6 | ❌ NO | No validation |
| **pricing** | ✅ Accepted | ✅ Accepted | ✅ Validated (0-10k) | ⚠️ Partial | Only publish validates |
| **rooms** | ✅ Accepted | ✅ Accepted | ❌ NO | ❌ NO | Silently dropped |
| **depositPercentage** | ✅ Accepted | ✅ Accepted | ❌ NO | ❌ NO | Not validated |
| **depositAmount** | ✅ Accepted | ✅ Accepted | ❌ NO | ❌ NO | Not validated |
| **deadline** (mvgDeadline) | ✅ Normalized | ✅ Not handled | ❌ NO | ⚠️ Partial | Date parsing only |
| **venueId** (linkedVenueId) | ✅ Accepted (as selectedVenueId) | ✅ Accepted | ✅ Validated | ❌ NO | Field name mapping issue |
| **itinerary** | ✅ Accepted | ✅ Accepted | ❌ NO | ❌ NO | No structure validation |
| **creatorId** | ✅ Auto-set | ✅ Auto-set | ✅ Auto-set | ✅ YES | Server-side only |
| **status** | ⚠️ Default 'draft' | ❌ ACCEPTS REQUEST | ✅ Forced 'pending_approval' | ❌ DANGER | User can override! |
| **images** (coverImageUrl, gallery) | ✅ Accepted | ✅ Accepted | ✅ Validated (HTTPS) | ⚠️ Partial | Only publish checks |

---

## CRITICAL ISSUES

### 🔴 ISSUE #1: NO ZOD VALIDATION IN CREATE ENDPOINTS
**Severity:** CRITICAL  
**Impact:** Any invalid data bypasses backend checks

**Current State:**
```typescript
// /api/trips - NO Zod validation
const draft = await storage.createExperienceDraft(draftData);

// /api/experiences - NO Zod validation  
const experience = await storage.createExperience(experienceData);
```

**Expected State:**
```typescript
// Should validate BEFORE storage call
const validated = insertExperienceSchema.parse(experienceData);
const experience = await storage.createExperience(validated);
```

**Missing Validations:**
- ❌ Title: min/max length
- ❌ Description: min/max length
- ❌ Price: min (> 0), max, type (decimal)
- ❌ maxParticipants: min, max
- ❌ minimumParticipants: >= 1, <= maxParticipants
- ❌ Dates: startDate < endDate, future dates
- ❌ Rooms: array structure validation
- ❌ Itinerary: array structure validation
- ❌ Images: URL format validation

---

### 🔴 ISSUE #2: STATUS CAN BE OVERRIDDEN BY USER
**Severity:** CRITICAL  
**Impact:** Users can publish experiences without approval

**Current Code (Line 1602-1615):**
```typescript
const requestedStatus = req.body.status;  // ❌ TRUSTS USER INPUT
const validStatuses = ["published", "pending_approval", "draft"];
let status = "published";

if (requestedStatus && validStatuses.includes(requestedStatus)) {
  if (requestedStatus === "published" && !hasCompletedProfile) {
    status = "pending_approval";  // Tries to downgrade but...
  } else {
    status = requestedStatus;  // ❌ ALLOWS USER'S STATUS!
  }
}
```

**Problem:** If `hasCompletedProfile === true`, user can request `status: "published"` and bypass approval

**Fix Needed:**
```typescript
// Always enforce pending_approval on submission
const status = "pending_approval";  // NEVER trust req.body.status
```

---

### 🔴 ISSUE #3: NO VALIDATION ON ROOM STRUCTURE
**Severity:** HIGH  
**Impact:** Malformed rooms silently accepted, breaks payment

**Current State:**
```typescript
rooms: jsonb("rooms").$type<Array<{
  id: string;
  name: string;
  quantity: number;
  pricePerPerson: number;
  gallery?: string[];
  notes?: string;
}>>().default([])
```

**No Validation:**
- ❌ Room array can have invalid objects
- ❌ `quantity` can be 0 or negative
- ❌ `pricePerPerson` can be negative or invalid
- ❌ No check that required fields exist

**Example Bad Data Accepted:**
```javascript
rooms: [
  { quantity: -5, pricePerPerson: "not a number" },  // ❌ INVALID
  { name: "Suite" }  // ❌ Missing required fields
]
```

---

### 🔴 ISSUE #4: DEPOSIT FIELDS ACCEPTED BUT CONFLICTING
**Severity:** HIGH  
**Impact:** Ambiguous deposit handling breaks payments

**Current State:**
```typescript
// Both fields accepted with no validation
depositPercentage: decimal("deposit_percentage", { precision: 5, scale: 2 }).default("0.00")
depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default("0.00")
```

**Problems:**
- ❌ Can send both `depositPercentage: 20` AND `depositAmount: 150`
- ❌ Code doesn't validate mutual exclusivity
- ❌ Booking logic (Line 1670) **only checks depositPercentage**, ignores depositAmount
- ❌ If user sends `depositAmount: 500` and `depositPercentage: 0`, deposit is ignored!

**Booking Logic (Line 1670):**
```typescript
if (experience.depositEnabled && experience.depositPercentage && parseFloat(experience.depositPercentage) > 0) {
  // Only uses depositPercentage
  depositAmount = Math.round((fullPrice * parseFloat(experience.depositPercentage)) / 100 * 100) / 100;
}
```

**Result:** `depositAmount` field is SILENTLY IGNORED by payment processing!

---

### 🔴 ISSUE #5: FIELD NAME MISMATCHES BETWEEN API AND DATABASE
**Severity:** HIGH  
**Impact:** Data loss, confused API contract

**Mapping Issues:**

| API Parameter | Database Column | Status |
|---------------|-----------------|--------|
| `type` | `experienceType` | ❌ Inconsistent naming |
| `selectedVenueId` | `linkedVenueId` | ❌ Inconsistent naming |
| `selectedServiceIds` | `services` | ⚠️ Converted (publish endpoint only) |
| `selectedAmenityIds` | `amenities` | ⚠️ Converted (publish endpoint only) |
| `mvgDeadline` | `mvgDeadline` | ✅ Consistent |

**Issue:** 
- `/api/trips` accepts field but doesn't map → data lost
- `/api/experiences` accepts field but doesn't map → data lost
- `/api/.../publish` **maps fields correctly** → only working endpoint

**Example:**
```javascript
// User sends
POST /api/trips {
  selectedVenueId: "venue-123"
}

// Stored as-is in experiences_drafts table
// But experiences table expects linkedVenueId
// Result: ❌ Venue link lost in draft
```

---

### ⚠️ ISSUE #6: MISSING VALIDATION FOR REQUIRED MILESTONE 1 FIELDS
**Severity:** HIGH

| Field | Required | Validated | Issue |
|-------|----------|-----------|-------|
| title | YES | Manual only | ❌ No Zod |
| description | YES | Manual only | ❌ No Zod |
| startDate | YES | Manual only | ❌ No Zod |
| maxParticipants | YES | ❌ NOT VALIDATED | Can be 0 or -1 |
| minimumParticipants | YES | ❌ NOT VALIDATED | Can be > maxParticipants |
| price | YES | Partial (only publish) | ❌ Missing in /api/experiences |
| location | YES | Manual only (publish) | ⚠️ Not in /api/trips |
| mvgDeadline | YES | ❌ NOT VALIDATED | Can be in past |

---

### ⚠️ ISSUE #7: INCONSISTENT DEFAULT VALUES
**Severity:** MEDIUM

| Field | Draft Default | Experience Default | Issue |
|-------|---------------|-------------------|-------|
| maxParticipants | None | 10 | ⚠️ Inconsistent |
| minimumParticipants | 6 | 6 | ✅ Consistent |
| status | 'draft' | 'pending_approval' (or 'published') | ⚠️ Different flows |
| mvgDeadline | null | null | ✅ Consistent |

---

### ⚠️ ISSUE #8: ITINERARY NOT VALIDATED
**Severity:** MEDIUM

**Current State:**
```typescript
itinerary: jsonb("itinerary")  // NO TYPE, NO VALIDATION
```

**Problems:**
- ❌ Can be null or invalid structure
- ❌ No validation that itinerary days match trip duration
- ❌ No validation that itinerary has minimum content

---

### ⚠️ ISSUE #9: MULTIPLE ENDPOINTS FOR SAME FUNCTIONALITY
**Severity:** MEDIUM  
**Impact:** Confusing API surface, inconsistent behavior

**Endpoints:**
1. `POST /api/trips` - Draft creation (NO validation)
2. `POST /api/experiences` - Direct experience creation (NO validation, dangerous)
3. `POST /api/events/saveDraft` - DUPLICATE of /api/trips (legacy)
4. `POST /api/experience-drafts/:id/publish` - Draft publication (HAS validation)

**Problem:** Developer confusion on which endpoint to use, inconsistent validation

---

## FIELD-BY-FIELD VALIDATION STATUS

### 1. TITLE
**API Acceptance:** ✅ YES (all endpoints)  
**Database Storage:** ✅ YES (varchar 255)  
**Validation:**
- ⚠️ Publish endpoint: min 10 chars (manual)
- ❌ Create endpoints: NO validation
- ❌ NO Zod schema validation

**Issue:** Users can send 1-char titles via `/api/trips`

---

### 2. DESCRIPTION
**API Acceptance:** ✅ YES (all endpoints)  
**Database Storage:** ✅ YES (text)  
**Validation:**
- ⚠️ Publish endpoint: min 50 chars (manual)
- ❌ Create endpoints: NO validation
- ❌ NO Zod schema validation

**Issue:** Users can send empty descriptions via `/api/trips`

---

### 3. THRESHOLD (minimumParticipants)
**API Acceptance:** ✅ YES (as minimumParticipants)  
**Database Storage:** ✅ YES (integer)  
**Validation:**
- ❌ NOT VALIDATED AT ALL
- ❌ Can be 0, negative, or > maxParticipants
- ⚠️ Default: 6 (if not provided)

**Issue:** No constraints enforced

---

### 4. PRICING
**API Acceptance:** ✅ YES (as price)  
**Database Storage:** ✅ YES (decimal 10,2)  
**Validation:**
- ⚠️ Publish endpoint: 0 < price <= 10000
- ❌ Create endpoints: NO validation
- ❌ Can be negative, zero, or massive

**Issue:** `/api/trips` accepts invalid prices

---

### 5. ROOMS / TIERS
**API Acceptance:** ✅ YES (as rooms JSONB array)  
**Database Storage:** ✅ YES (jsonb)  
**Validation:**
- ❌ NO VALIDATION AT ALL
- ❌ No schema validation for room structure
- ❌ quantity/pricePerPerson can be invalid

**Issue:** Malformed room data silently accepted

---

### 6. DEPOSIT PERCENTAGE
**API Acceptance:** ✅ YES  
**Database Storage:** ✅ YES (decimal 5,2)  
**Validation:**
- ❌ NO VALIDATION
- ❌ Can be negative or > 100%
- ⚠️ Conflicts with depositAmount field

**Issue:** No constraint on valid percentage range

---

### 7. DEPOSIT AMOUNT
**API Acceptance:** ✅ YES  
**Database Storage:** ✅ YES (decimal 10,2)  
**Validation:**
- ❌ NO VALIDATION
- ❌ IGNORED BY PAYMENT LOGIC (Line 1670)
- ⚠️ Conflicts with depositPercentage field

**Issue:** Field is stored but never used!

---

### 8. DEADLINE (mvgDeadline)
**API Acceptance:** ✅ YES (as mvgDeadline)  
**Database Storage:** ✅ YES (timestamp with timezone)  
**Validation:**
- ⚠️ Date parsing/normalization (defensive)
- ❌ NO VALIDATION that deadline < startDate
- ❌ NO VALIDATION that deadline is in future

**Issue:** Can set deadline after trip start date

---

### 9. VENUEID (linkedVenueId)
**API Acceptance:** ⚠️ YES but mapped as selectedVenueId  
**Database Storage:** ✅ YES (references venues.id)  
**Validation:**
- ❌ NO foreign key validation
- ❌ NO check that venue exists
- ❌ NO check that venue belongs to creator (for bookings)

**Issue:** Can reference non-existent venues

---

### 10. ITINERARY
**API Acceptance:** ✅ YES (as itinerary JSONB)  
**Database Storage:** ✅ YES (jsonb)  
**Validation:**
- ❌ NO TYPE DEFINITION
- ❌ NO VALIDATION AT ALL
- ❌ Can be null or invalid structure

**Issue:** Any structure accepted, can break frontend

---

### 11. CREATORID
**API Acceptance:** ❌ NOT FROM REQUEST (auto-set)  
**Database Storage:** ✅ YES (references users.id)  
**Validation:**
- ✅ Server-side set from auth token
- ✅ Always validated (token required)

**Status:** ✅ CORRECT

---

### 12. STATUS
**API Acceptance:** ⚠️ YES BUT DANGEROUS  
**Database Storage:** ✅ YES (enum)  
**Validation:**
- ✅ Publish endpoint: forced to 'pending_approval'
- ❌ Create endpoints: can be user-requested
- ❌ `/api/experiences`: allows 'published' if profile complete

**Issue:** Users with completed profiles can self-publish!

---

### 13. IMAGES (coverImageUrl, gallery)
**API Acceptance:** ✅ YES  
**Database Storage:** ✅ YES (varchar, jsonb)  
**Validation:**
- ⚠️ Publish endpoint: must be HTTPS URLs
- ❌ Create endpoints: NO validation
- ⚠️ Demo event bypass allows any URL

**Issue:** `/api/trips` accepts invalid image URLs

---

## STORAGE FUNCTION ANALYSIS

### createExperienceDraft()
**File:** `server/storage.ts:1718-1724`

```typescript
async createExperienceDraft(draft: InsertExperienceDraft): Promise<ExperienceDraft> {
  const [created] = await db
    .insert(experienceDrafts)
    .values(draft)
    .returning();
  return created;
}
```

**Analysis:**
- ✅ Simple, reliable insert
- ❌ **NO Zod validation before insert**
- ❌ Expects `draft` to match `InsertExperienceDraft` schema
- ❌ Schema is too permissive (omits auto-gen fields only)

### createExperience()
**File:** `server/storage.ts:316-319`

```typescript
async createExperience(experienceData: InsertExperience): Promise<Experience> {
  const [experience] = await db
    .insert(experiences)
    .values([experienceData])
    .returning();
  return experience;
}
```

**Analysis:**
- ✅ Simple, reliable insert
- ❌ **NO Zod validation before insert**
- ❌ Relies entirely on caller to validate

---

## VALIDATION SCHEMA ANALYSIS

**File:** `shared/schema.ts:1147-1152`

```typescript
export const insertExperienceSchema = createInsertSchema(experiences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  currentParticipants: true,
});
```

**Analysis:**
- ❌ **NO REFINEMENTS ADDED**
- ❌ Schema is bare Drizzle-to-Zod conversion
- ❌ All fields are optional (drizzle-zod default behavior)
- ❌ No custom validation rules for:
  - Price range
  - Participant counts
  - Date relationships
  - Room structure
  - Itinerary structure

**Expected:**
```typescript
export const insertExperienceSchema = createInsertSchema(experiences)
  .omit({ id: true, createdAt: true, updatedAt: true, currentParticipants: true })
  .extend({
    title: z.string().min(10).max(255),
    description: z.string().min(50),
    price: z.string().refine(p => parseFloat(p) > 0 && parseFloat(p) <= 10000),
    maxParticipants: z.number().int().min(1).max(1000),
    minimumParticipants: z.number().int().min(1),
    startDate: z.date().refine(d => d > new Date()),
    endDate: z.date(),
    rooms: z.array(roomSchema).optional(),
    itinerary: z.array(itinerarySchema).optional(),
    // ... more validations
  })
  .refine(d => d.startDate < d.endDate, { message: "Start date must be before end date" });
```

---

## SUMMARY TABLE: WHAT'S BROKEN

| Issue | Endpoint | Severity | Fix Effort |
|-------|----------|----------|-----------|
| No Zod validation | `/api/trips`, `/api/experiences` | CRITICAL | High |
| User can override status | `/api/experiences` | CRITICAL | Low |
| Room validation missing | All | HIGH | Medium |
| Deposit field conflicts | All | HIGH | Medium |
| Field name mismatches | `/api/trips`, `/api/experiences` | HIGH | Medium |
| Itinerary not validated | All | HIGH | Medium |
| No date validation | `/api/trips` | HIGH | Low |
| Multiple endpoints | N/A | MEDIUM | Medium (consolidate) |
| Default value inconsistencies | All | MEDIUM | Low |

---

## RECOMMENDATIONS

### Immediate Fixes (Blocking Milestone 1)

1. **Add Zod validation to insertExperienceSchema** (shared/schema.ts)
   - Add `.extend()` with all field validations
   - Validate room structure
   - Validate itinerary structure
   - Validate date relationships

2. **Fix status handling** (server/routes.ts:1600)
   - Remove `req.body.status` acceptance
   - Force `status: "pending_approval"` on all submissions
   - Only admins can approve

3. **Fix deposit field conflict** (choose one)
   - RECOMMENDED: Keep only `depositPercentage`
   - Remove `depositAmount` (it's calculated)
   - OR: Keep only `depositAmount`, remove `depositPercentage`

4. **Standardize API endpoints** (server/routes.ts)
   - Keep only `/api/experience-drafts` endpoints
   - Remove `/api/trips` duplicate
   - Remove `/api/events/saveDraft` legacy
   - Remove `/api/experiences` POST (too dangerous)

5. **Fix field name mappings** (server/routes.ts)
   - Consistently use `linkedVenueId` (not `selectedVenueId`)
   - Consistently use `experienceType` (not `type`)
   - Document all field transformations

### Medium Priority

6. Add validation to `/api/trips` and `/api/experiences` before storage calls
7. Standardize room and itinerary structures with complete Zod schemas
8. Add foreign key validation for venueId references
9. Add date constraint validation in all endpoints

---

## CONCLUSION

**API Readiness for Milestone 1:** ❌ **NOT READY**

**Core Issues:**
- ❌ Three conflicting endpoints with different validation levels
- ❌ No Zod validation in create endpoints
- ❌ Critical data integrity issues (status override, field conflicts)
- ❌ Incomplete validation schemas

**Time to Fix:** 4-6 hours for comprehensive fixes

**Risk Level:** 🔴 HIGH - Current system can accept invalid data and bypass approval workflows

