# Trip Builder Frontend - Complete UI-to-API Validation Review

**Date:** November 22, 2025  
**File:** `client/src/components/EventBuilder/EventBuilder.tsx` (4079 lines)  
**Related:** `client/src/pages/event-builder.tsx`

---

## EXECUTIVE SUMMARY

**Critical Findings:** ⚠️ **MULTIPLE DISCREPANCIES BETWEEN UI AND BACKEND**

The Trip Builder frontend collects **35+ fields** but has **significant gaps** when sending to backend:

- ✅ **Well-designed form schema** with 10-step wizard
- ⚠️ **Missing Milestone 1 fields** in publish payload
- ❌ **Field name mismatches** vs backend expectations
- ❌ **Deposit handling mismatch** - UI has options, backend confused
- ❌ **Unused fields** collected but never sent
- ⚠️ **Auto-save vs publish payloads differ** - inconsistent data

---

## PART 1: FORM DATA STRUCTURE

### Form Data Type Definition
**File:** `client/src/components/EventBuilder/EventBuilder.tsx:212`

```typescript
type EventBuilderData = z.infer<typeof eventBuilderSchema>;
```

### Complete Zod Schema (Lines 69-210)

The form schema defines **40+ fields** organized by step:

#### Step 1: Basic Info
```typescript
title: z.string().min(1, "Title is required").max(255).optional().or(z.literal('')),
shortDescription: z.string().max(500).optional(),
description: z.string().min(10).optional().or(z.literal('')),
category: z.enum(["sports_wellness", "retreats", "community_social", "adventure_trips", "workations", "festivals_events"]).optional(),
type: z.enum(["one-day", "multi-day", "virtual"]).optional(),
```

#### Step 2: Media
```typescript
coverImageUrl: z.string().optional().or(z.literal('')),
gallery: z.array(z.string().url()).default([]),
```

#### Step 3: Dates & Capacity
```typescript
startDate: z.date().optional(),
endDate: z.date().optional(),
maxParticipants: z.number().min(1).max(200).optional(),
```

#### Step 4: Venue
```typescript
location: z.string().min(1).optional().or(z.literal('')),
venueType: z.enum(["catalog", "manual", "virtual"]).default("catalog"),
selectedVenueId: z.string().optional(),
venue: z.string().optional(),  // Legacy field
manualVenueName: z.string().optional(),
manualVenueAddress: z.string().optional(),
manualVenueDescription: z.string().optional(),
manualVenueCapacity: z.number().min(1).optional(),
manualVenuePhotos: z.array(z.string().url()).default([]),
virtualPlatform: z.string().optional(),
virtualMeetingUrl: z.string().url().optional(),
virtualInstructions: z.string().optional(),
```

#### Step 5: Services & Amenities
```typescript
selectedServiceIds: z.array(z.string()).default([]),
selectedAmenityIds: z.array(z.string()).default([]),
serviceDemandNotes: z.record(z.string()).default({}),
serviceConnectRequests: z.record(z.boolean()).default({}),
```

#### Step 6: Roles
```typescript
roles: z.array(z.object({
  name: z.string(),
  required: z.boolean().default(false),
  headcount: z.number().min(1).default(1),
  rate: z.number().optional(),
  notes: z.string().optional(),
})).default([]),
```

#### Step 7: Rooms
```typescript
accommodationType: z.enum(["shared", "private", "mixed", "none"]).optional(),
roomCapacity: z.number().min(1).optional(),
totalRooms: z.number().min(1).optional(),
rooms: z.array(z.object({
  id: z.string(),
  name: z.string().min(1, "Room name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  pricePerPerson: z.number().min(0, "Price per person cannot be negative"),
  gallery: z.array(z.string().url()).max(3).optional(),
  notes: z.string().optional()
})).default([]),
```

#### Step 8: Itinerary
```typescript
itinerary: z.array(z.object({
  day: z.number(),
  date: z.date(),
  title: z.string().default(""),
  timeSlots: z.array(z.object({
    id: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    activity: z.string(),
    notes: z.string().optional()
  })).default([]),
  notes: z.string().default("")
})).default([]),
```

#### Step 9: Pricing & Deposits
```typescript
price: z.number().min(0).optional(),
currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]).optional(),
depositEnabled: z.boolean().default(false),
depositPercentage: z.number().min(5).max(80).default(20),

// Legacy monetization (kept for compatibility)
monetizationModel: z.enum(["facilitator", "influencer"]).optional(),
facilitatorServices: z.array(z.string()).default([]),
serviceCosts: z.record(z.number()).default({}),
expectedPayout: z.number().optional(),
platformCommission: z.number().optional(),
stripeFee: z.number().optional(),

// New monetisation mode
monetisationMode: z.enum(["creator_led", "great_managed", "promo_only", "extra_services"]).optional(),
influencerPromotionEnabled: z.boolean().default(false),
influencerCommissionPct: z.number().min(0).max(50).default(0),

// Discounts
discounts: z.array(z.object({
  id: z.string(),
  title: z.string().min(1),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().min(0),
  validUntil: z.date().optional(),
  capacityCap: z.number().min(1).optional(),
  active: z.boolean().default(true),
  skuId: z.string().optional()
})).default([]),

// Stripe & Payouts
stripeConnectRequired: z.boolean().default(true),
balanceDueDays: z.number().min(1).max(90).default(14),

// Revenue Splits
creatorPct: z.number().min(0).max(100).default(85),
platformPct: z.number().min(0).max(100).default(15),
venueRevenuePercentage: z.number().min(0).max(100).default(0),
creatorRevenuePercentage: z.number().min(0).max(100).default(85),
platformRevenuePercentage: z.number().min(0).max(100).default(15),

// MVG
requireMinimumParticipants: z.boolean().default(true),
minimumParticipants: z.number().min(2).max(50).default(6),
mvgDeadline: z.date().optional(),

// Soft-Hold
softHoldEnabled: z.boolean().default(false),
softHoldDurationHours: z.number().min(1).max(168).default(48),
```

#### Step 10: Terms
```typescript
termsAccepted: z.boolean().refine(val => val === true),
```

---

## PART 2: FORM STATE INITIALIZATION

**Lines 255-335:** Default values for all fields

```typescript
const form = useForm<EventBuilderData>({
  resolver: zodResolver(eventBuilderSchema),
  mode: "onChange",
  defaultValues: {
    // Step 1
    title: "",
    shortDescription: "",
    description: "",
    category: undefined,
    type: undefined,
    
    // Step 2
    coverImageUrl: "",
    gallery: [],
    
    // Step 3
    startDate: undefined,
    endDate: undefined,
    maxParticipants: undefined,
    
    // Step 4
    location: "",
    venueType: "catalog",
    selectedVenueId: "",
    venue: "",
    manualVenueName: "",
    manualVenueAddress: "",
    manualVenueDescription: "",
    manualVenueCapacity: undefined,
    manualVenuePhotos: [],
    virtualPlatform: "",
    virtualMeetingUrl: "",
    virtualInstructions: "",
    
    // Step 5
    selectedServiceIds: [],
    selectedAmenityIds: [],
    serviceDemandNotes: {},
    serviceConnectRequests: {},
    
    // Step 6
    roles: [],
    
    // Step 7
    accommodationType: undefined,
    roomCapacity: undefined,
    totalRooms: undefined,
    rooms: [],  // Default: empty array
    
    // Step 8
    itinerary: [],  // Default: empty array
    
    // Step 9
    price: undefined,
    currency: undefined,
    depositEnabled: false,
    depositPercentage: 20,
    
    // Legacy
    monetizationModel: undefined,
    facilitatorServices: [],
    serviceCosts: {},
    expectedPayout: undefined,
    platformCommission: undefined,
    stripeFee: undefined,
    
    // New pricing
    monetisationMode: undefined,
    influencerPromotionEnabled: false,
    influencerCommissionPct: 0,
    discounts: [],
    
    // Stripe
    stripeConnectRequired: true,
    balanceDueDays: 14,
    
    // Revenue Splits
    creatorPct: 85,
    platformPct: 15,
    venueRevenuePercentage: 0,
    creatorRevenuePercentage: 85,
    platformRevenuePercentage: 15,
    
    // MVG
    requireMinimumParticipants: true,
    minimumParticipants: 6,
    mvgDeadline: undefined,
    
    // Soft-Hold
    softHoldEnabled: false,
    softHoldDurationHours: 48,
    
    // Step 10
    termsAccepted: false
  }
});
```

---

## PART 3: API PAYLOADS SENT TO BACKEND

### Payload #1: Auto-Save Draft (Lines 339-364)
**Endpoint:** `PUT /api/experience-drafts/:id` OR `POST /api/experience-drafts`

```typescript
const autoSaveMutation = useMutation({
  mutationFn: async (data: Partial<EventBuilderData>) => {
    const mappedData = {
      ...data,
      // Date serialization
      startDate: data.startDate ? (typeof data.startDate === 'string' ? data.startDate : 
                 (data.startDate instanceof Date ? data.startDate.toISOString() : null)) : null,
      endDate: data.endDate ? (typeof data.endDate === 'string' ? data.endDate : 
               (data.endDate instanceof Date ? data.endDate.toISOString() : null)) : null,
      mvgDeadline: data.mvgDeadline ? (typeof data.mvgDeadline === 'string' ? data.mvgDeadline : 
                   (data.mvgDeadline instanceof Date ? data.mvgDeadline.toISOString() : null)) : null,
    };
    
    const draftData = {
      ...mappedData,
      currentStep,
      creatorId: user.id
    };
    
    if (currentDraftId) {
      return apiRequest("PUT", `/api/experience-drafts/${currentDraftId}`, draftData);
    } else {
      return apiRequest("POST", "/api/experience-drafts", draftData);
    }
  }
});
```

**Data Sent:** ✅ **ALL form fields** (spread operator includes everything)

---

### Payload #2: Manual Save Draft (Lines 710-784)
**Endpoint:** `PUT /api/events/updateDraft/:id` OR `POST /api/events/saveDraft`

```typescript
const rawDraftPayload = {
  // Basic info fields
  title: formData.title || '',
  description: formData.description || '',
  location: formData.location || '',
  
  // Media fields
  coverImageUrl: formData.coverImageUrl || '',
  gallery: formData.gallery || [],
  
  // Date fields
  startDate: formData.startDate,
  endDate: formData.endDate,
  mvgDeadline: formData.mvgDeadline,
  
  // Venue/location fields
  venueType: formData.venueType || 'catalog',
  selectedVenueId: formData.selectedVenueId || '',
  manualVenueName: formData.manualVenueName || '',
  manualVenueAddress: formData.manualVenueAddress || '',
  virtualPlatform: formData.virtualPlatform || '',
  
  // Room fields
  rooms: formData.rooms || [],
  
  // Pricing fields
  price: formData.price || '',
  currency: formData.currency || 'USD',
  creatorRevenuePercentage: formData.creatorRevenuePercentage || 75,
  platformRevenuePercentage: formData.platformRevenuePercentage || 25,
  
  // Capacity and MVG fields
  maxParticipants: formData.maxParticipants || 1,
  requireMinimumParticipants: formData.requireMinimumParticipants || false,
  minimumParticipants: formData.minimumParticipants || 1,
  
  // Services and amenities
  selectedServiceIds: formData.selectedServiceIds || [],
  selectedAmenityIds: formData.selectedAmenityIds || [],
  
  // Terms and soft hold
  termsAccepted: formData.termsAccepted || false,
  softHoldEnabled: formData.softHoldEnabled || false,
  softHoldDurationHours: formData.softHoldDurationHours || 48,
  
  // Category
  category: formData.category || '',
  
  // Meta fields
  currentStep,
  status: 'draft'
};

const draftPayload = normalizeDraftForSave(rawDraftPayload);
```

**Data Sent:** ⚠️ **SELECTIVE fields** (manually enumerated, missing many)

**Missing from this payload:**
- ❌ `type` (experienceType)
- ❌ `shortDescription`
- ❌ `manualVenueDescription`
- ❌ `manualVenueCapacity`
- ❌ `manualVenuePhotos`
- ❌ `virtualMeetingUrl`
- ❌ `virtualInstructions`
- ❌ `serviceDemandNotes`
- ❌ `serviceConnectRequests`
- ❌ `roles`
- ❌ `accommodationType`
- ❌ `roomCapacity`
- ❌ `totalRooms`
- ❌ `itinerary`
- ❌ ALL deposit/monetization/discount fields
- ❌ `balanceDueDays`
- ❌ `stripeConnectRequired`
- ❌ `creatorPct`, `platformPct`
- ❌ `softHoldEnabled`, `softHoldDurationHours` (added back later)

---

### Payload #3: Publish/Submit (Lines 1051-1108)
**Endpoint:** `POST /api/experience-drafts/:id/publish`

```typescript
const rawPublishPayload = {
  id: currentDraftId || undefined,
  
  // Basic info fields
  title: formData.title || '',
  description: formData.description || '',
  location: formData.location || '',
  
  // Media fields
  coverImageUrl: formData.coverImageUrl || '',
  gallery: formData.gallery || [],
  
  // Date fields
  startDate: formData.startDate,
  endDate: formData.endDate,
  mvgDeadline: formData.mvgDeadline,
  
  // Venue/location fields
  venueType: formData.venueType || 'catalog',
  selectedVenueId: formData.selectedVenueId || '',
  manualVenueName: formData.manualVenueName || '',
  manualVenueAddress: formData.manualVenueAddress || '',
  virtualPlatform: formData.virtualPlatform || '',
  
  // Room fields
  rooms: formData.rooms || [],
  
  // Pricing fields
  price: formData.price || '',
  currency: formData.currency || 'USD',
  creatorRevenuePercentage: formData.creatorRevenuePercentage || 75,
  platformRevenuePercentage: formData.platformRevenuePercentage || 25,
  
  // Capacity and MVG fields
  maxParticipants: formData.maxParticipants || 1,
  requireMinimumParticipants: formData.requireMinimumParticipants || false,
  minimumParticipants: formData.minimumParticipants || 1,
  
  // Services and amenities
  selectedServiceIds: formData.selectedServiceIds || [],
  selectedAmenityIds: formData.selectedAmenityIds || [],
  
  // Terms and soft hold
  termsAccepted: formData.termsAccepted || false,
  softHoldEnabled: formData.softHoldEnabled || false,
  softHoldDurationHours: formData.softHoldDurationHours || 48,
  
  // Category
  category: formData.category || '',
  
  // Meta fields
  currentStep,
  status: 'pending'
};

const publishPayload = normalizeDraftForSave(rawPublishPayload);
```

**Data Sent:** ⚠️ **SAME as manual save** (same fields missing)

---

### Payload #4: Date Normalization (Lines 233-238)
```typescript
function normalizeDraftForSave(draft: any) {
  const copy = { ...draft };
  if (copy.startDate) copy.startDate = new Date(copy.startDate).toISOString();
  if (copy.endDate) copy.endDate = new Date(copy.endDate).toISOString();
  if (copy.mvgDeadline) copy.mvgDeadline = new Date(copy.mvgDeadline).toISOString();
  return copy;
}
```

---

## PART 4: DISCREPANCIES ANALYSIS

### 🔴 CRITICAL ISSUE #1: Field Name Mismatches

| UI Field Name | Backend Expected | Status | Impact |
|---------------|------------------|--------|--------|
| `type` | `experienceType` | ❌ MISMATCH | Data lost in draft |
| `selectedVenueId` | `linkedVenueId` | ❌ MISMATCH | Data lost in draft |
| `price` | `price` | ✅ OK | - |

**Analysis:**
- Frontend sends `type: "one-day"` but backend expects `experienceType`
- Frontend sends `selectedVenueId: "venue-123"` but backend expects `linkedVenueId`
- These fields are stored as-is in drafts with wrong column names
- Backend's publish endpoint (lines 1502-1545) **manually maps** these fields correctly
- But manual save endpoints don't map - **data is lost**

**Example:**
```javascript
// User fills out form
form.watch() returns:
{
  type: "multi-day",
  selectedVenueId: "venue-456"
}

// Frontend sends to /api/events/saveDraft
POST /api/events/saveDraft {
  type: "multi-day",
  selectedVenueId: "venue-456",
  ...
}

// Backend stores in experiences_drafts table as:
{
  type: "multi-day",           // ❌ Should be in 'experienceType' column
  selectedVenueId: "venue-456" // ❌ Should be in 'linkedVenueId' column
}

// Result: Fields are in wrong columns!
```

---

### 🔴 CRITICAL ISSUE #2: Deposit Handling Mismatch

**Frontend Offers:**
```typescript
depositEnabled: z.boolean().default(false),
depositPercentage: z.number().min(5).max(80).default(20),
```

**Frontend Sends:**
- ✅ Only sends `depositPercentage` and `depositEnabled`
- ❌ Does NOT send `depositAmount` (correctly - UI doesn't collect it)

**Backend Expects:**
```typescript
depositEnabled: boolean,
depositPercentage: decimal,
depositAmount: decimal,
balanceAmount: decimal,
```

**Backend Confusion:**
- Backend has BOTH `depositPercentage` AND `depositAmount` fields
- Payment logic (Line 1670 in routes.ts) **only checks depositPercentage**
- If user somehow sends `depositAmount`, it's ignored

**Result:** ✅ Frontend actually correct here (doesn't send conflicting field)

---

### ⚠️ ISSUE #3: Missing Milestone 1 Fields in Payloads

| Milestone 1 Field | In Schema | In Draft Save | In Publish | Status |
|-------------------|-----------|---------------|-----------|--------|
| title | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| description | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| threshold (minParticipants) | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| pricing (price) | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| rooms | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| depositPercentage | ✅ YES | ❌ NO | ❌ NO | ❌ MISSING |
| deadline (mvgDeadline) | ✅ YES | ✅ YES | ✅ YES | ✅ OK |
| venueId (selectedVenueId) | ✅ YES | ✅ YES (wrong name) | ✅ YES (wrong name) | ⚠️ Misnamed |
| itinerary | ✅ YES | ❌ NO | ❌ NO | ❌ MISSING |
| creatorId | ❌ NOT IN FORM | ✅ Auto-set | ✅ Auto-set | ✅ OK |
| status | ❌ NOT IN FORM | ✅ Auto-set | ✅ Auto-set | ✅ OK |
| images (cover + gallery) | ✅ YES | ✅ YES | ✅ YES | ✅ OK |

---

### ⚠️ ISSUE #4: Fields Collected But Never Sent

**Collected in UI but not in draft save payloads:**

| Field | Reason | Impact |
|-------|--------|--------|
| `type` | Collected but sent as `type` instead of `experienceType` | Data lost |
| `shortDescription` | Collected but never sent | ❌ LOST |
| `roles` | Collected and validated but never sent | ❌ LOST |
| `itinerary` | Collected and validated but never sent | ❌ LOST |
| `accommodationType` | Collected but never sent | ❌ LOST |
| `roomCapacity` | Collected but never sent | ❌ LOST |
| `totalRooms` | Collected but never sent | ❌ LOST |
| `depositPercentage` | Collected but never sent | ❌ LOST |
| `depositEnabled` | Collected but never sent | ❌ LOST |
| `monetizationModel` | Collected but never sent | ❌ LOST |
| `facilitatorServices` | Collected but never sent | ❌ LOST |
| `serviceCosts` | Collected but never sent | ❌ LOST |
| `expectedPayout` | Collected but never sent | ❌ LOST |
| `platformCommission` | Collected but never sent | ❌ LOST |
| `stripeFee` | Collected but never sent | ❌ LOST |
| `monetisationMode` | Collected but never sent | ❌ LOST |
| `influencerPromotionEnabled` | Collected but never sent | ❌ LOST |
| `influencerCommissionPct` | Collected but never sent | ❌ LOST |
| `discounts` | Collected but never sent | ❌ LOST |
| `stripeConnectRequired` | Collected but never sent | ❌ LOST |
| `balanceDueDays` | Collected but never sent | ❌ LOST |
| `creatorPct`, `platformPct` | Collected but uses legacy fields instead | ⚠️ Legacy used instead |
| `venueRevenuePercentage` | Collected but never sent (legacy) | ❌ LOST |
| All manual venue fields | Collected but only sent if `venueType === 'manual'` | ⚠️ Conditional |
| All virtual event fields | Collected but only sent if `venueType === 'virtual'` | ⚠️ Conditional |
| `serviceDemandNotes` | Collected but never sent | ❌ LOST |
| `serviceConnectRequests` | Collected but never sent | ❌ LOST |

---

### ⚠️ ISSUE #5: Inconsistent Payloads

**Auto-save mutation (Lines 339-364):**
- Sends: `...data` (all fields via spread)
- Does: Date conversion, adds `currentStep` and `creatorId`
- Result: ✅ More complete

**Manual save draft (Lines 710-784):**
- Sends: Hand-enumerated fields
- Does: Date normalization
- Result: ❌ Missing ~20+ fields

**Publish endpoint (Lines 1051-1108):**
- Sends: Same as manual save
- Does: Date normalization
- Result: ❌ Missing fields

**Problem:** Three different payloads with different field coverage!

---

### ⚠️ ISSUE #6: Backend Publish Endpoint Maps Fields (Lines 1502-1545)

The backend's `POST /api/experience-drafts/:id/publish` endpoint manually maps:

```typescript
// Convert selectedServiceIds to structured service objects
const services = Array.isArray((draft as any).selectedServiceIds) 
  ? (draft as any).selectedServiceIds.map((id: string) => ({
      id,
      name: serviceMap[id]?.name || id,
      description: serviceMap[id]?.description,
      custom: !serviceMap[id],
      approvedByAdmin: false
    }))
  : [];

// Convert selectedAmenityIds to structured amenity objects
const amenities = Array.isArray((draft as any).selectedAmenityIds)
  ? (draft as any).selectedAmenityIds.map((id: string) => ({
      id,
      name: amenityMap[id]?.name || id,
      description: amenityMap[id]?.description,
      custom: !amenityMap[id],
      approvedByAdmin: false
    }))
  : [];

// Get roles from draft
const roles = Array.isArray((draft as any).roles) ? (draft as any).roles : [];
```

**BUT:** These fields are NOT in the publish payload!
- Frontend sends: `selectedServiceIds: []`, `selectedAmenityIds: []`
- Backend tries to map: `(draft as any).selectedServiceIds` ✅ OK
- But `roles` field: Frontend doesn't send it → Backend gets empty array

---

## PART 5: VALIDATION ANALYSIS

### Client-Side Validation
**Publication validation (Lines 832-1027):**

```typescript
const validateForPublish = (data: any) => {
  const errors: string[] = [];
  
  // Validates:
  // ✅ Cover photo URL format (HTTPS/HTTP/blob/data)
  // ✅ Gallery image URLs
  // ✅ Title (not empty)
  // ✅ Description (not empty)
  // ✅ Start date (required, in future)
  // ✅ Location (required)
  // ✅ Venue selection based on type
  // ✅ Pricing and room prices
  
  // Does NOT validate:
  // ❌ Required Milestone 1 fields missing from backend
  // ❌ Field name mapping issues
  // ❌ Deposit field completeness
};
```

**Validation Status:**
- ✅ Good frontend validation for filled-in fields
- ❌ Doesn't catch missing payload fields
- ❌ Can't validate backend schema mismatches

---

### Form Error Handling
**Lines 1151-1177:** Displays server validation errors

```typescript
if (response.status === 400) {
  if (errorData.errors && Array.isArray(errorData.errors)) {
    errorMessage = `Please complete the following: ${errorData.errors.join(', ')}`;
  } else if (errorData.message) {
    errorMessage = errorData.message;
  }
}
```

**Status:** ✅ Handles backend errors but can't prevent them

---

## PART 6: COMPLETE FIELD MAPPING TABLE

| Field | Type | In Schema | Collected | Draft Save | Publish | Backend Column | Status |
|-------|------|-----------|-----------|-----------|---------|----------------|--------|
| title | string | ✅ | ✅ | ✅ | ✅ | title | ✅ OK |
| description | string | ✅ | ✅ | ✅ | ✅ | description | ✅ OK |
| shortDescription | string | ✅ | ✅ | ❌ | ❌ | shortDescription | ❌ LOST |
| category | enum | ✅ | ✅ | ✅ | ✅ | category | ✅ OK |
| type | enum | ✅ | ✅ | ✅ (wrong name) | ✅ (wrong name) | experienceType | ❌ MISMATCH |
| coverImageUrl | string | ✅ | ✅ | ✅ | ✅ | coverImageUrl | ✅ OK |
| gallery | array | ✅ | ✅ | ✅ | ✅ | gallery | ✅ OK |
| startDate | date | ✅ | ✅ | ✅ | ✅ | startDate | ✅ OK |
| endDate | date | ✅ | ✅ | ✅ | ✅ | endDate | ✅ OK |
| maxParticipants | number | ✅ | ✅ | ✅ | ✅ | maxParticipants | ✅ OK |
| location | string | ✅ | ✅ | ✅ | ✅ | location | ✅ OK |
| venueType | enum | ✅ | ✅ | ✅ | ✅ | (not in DB) | ⚠️ UI ONLY |
| selectedVenueId | string | ✅ | ✅ | ✅ (wrong name) | ✅ (wrong name) | linkedVenueId | ❌ MISMATCH |
| manualVenueName | string | ✅ | ✅ | ✅ | ✅ | (not in DB) | ⚠️ Mapped at publish |
| manualVenueAddress | string | ✅ | ✅ | ✅ | ✅ | (not in DB) | ⚠️ Mapped at publish |
| manualVenueDescription | string | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| virtualPlatform | string | ✅ | ✅ | ✅ | ✅ | virtualPlatform | ✅ OK |
| virtualMeetingUrl | string | ✅ | ✅ | ❌ | ❌ | virtualMeetingUrl | ❌ LOST |
| virtualInstructions | string | ✅ | ✅ | ❌ | ❌ | virtualInstructions | ❌ LOST |
| selectedServiceIds | array | ✅ | ✅ | ✅ | ✅ | services (mapped) | ✅ OK |
| selectedAmenityIds | array | ✅ | ✅ | ✅ | ✅ | amenities (mapped) | ✅ OK |
| serviceDemandNotes | object | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| serviceConnectRequests | object | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| roles | array | ✅ | ✅ | ❌ | ❌ | roles | ❌ LOST |
| accommodationType | enum | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| roomCapacity | number | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| totalRooms | number | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| rooms | array | ✅ | ✅ | ✅ | ✅ | rooms | ✅ OK |
| itinerary | array | ✅ | ✅ | ❌ | ❌ | itinerary | ❌ LOST |
| price | number | ✅ | ✅ | ✅ | ✅ | price | ✅ OK |
| currency | enum | ✅ | ✅ | ✅ | ✅ | currency | ✅ OK |
| depositEnabled | boolean | ✅ | ✅ | ❌ | ❌ | depositEnabled | ❌ LOST |
| depositPercentage | number | ✅ | ✅ | ❌ | ❌ | depositPercentage | ❌ LOST |
| requireMinimumParticipants | boolean | ✅ | ✅ | ✅ | ✅ | requireMinimumParticipants | ✅ OK |
| minimumParticipants | number | ✅ | ✅ | ✅ | ✅ | minimumParticipants | ✅ OK |
| mvgDeadline | date | ✅ | ✅ | ✅ | ✅ | mvgDeadline | ✅ OK |
| softHoldEnabled | boolean | ✅ | ✅ | ✅ | ✅ | softHoldEnabled | ✅ OK |
| softHoldDurationHours | number | ✅ | ✅ | ✅ | ✅ | softHoldDurationHours | ✅ OK |
| creatorRevenuePercentage | number | ✅ | ✅ | ✅ | ✅ | creatorRevenuePercentage | ✅ OK |
| platformRevenuePercentage | number | ✅ | ✅ | ✅ | ✅ | platformRevenuePercentage | ✅ OK |
| All legacy monetization | various | ✅ | ✅ | ❌ | ❌ | various | ❌ LOST |
| All new monetization | various | ✅ | ✅ | ❌ | ❌ | various | ❌ LOST |
| All discount fields | various | ✅ | ✅ | ❌ | ❌ | discounts | ❌ LOST |
| stripeConnectRequired | boolean | ✅ | ✅ | ❌ | ❌ | (not in DB) | ❌ LOST |
| balanceDueDays | number | ✅ | ✅ | ❌ | ❌ | balanceDueDays | ❌ LOST |
| termsAccepted | boolean | ✅ | ✅ | ✅ | ✅ | (not in DB) | ⚠️ UI ONLY |

---

## SUMMARY OF ISSUES

### 🔴 CRITICAL (Blocking Milestone 1)

1. **Field name mismatches** - `type` → `experienceType`, `selectedVenueId` → `linkedVenueId`
2. **Roles field** - Collected but never sent
3. **Itinerary field** - Collected but never sent  
4. **Deposit settings** - Collected but never sent
5. **Inconsistent payloads** - Auto-save vs manual save vs publish differ

### ⚠️ HIGH (Data Loss Issues)

6. **Missing field mappings** - 20+ fields in schema but not in payloads
7. **Short description** - Collected but not sent
8. **Virtual event fields** - Meeting URL and instructions not sent
9. **Manual venue fields** - Description and capacity not sent
10. **Service demand notes** - Not sent
11. **Room metadata** - accommodationType, roomCapacity, totalRooms not sent
12. **Monetization fields** - All deposit, discount, and new monetization fields not sent

### 📋 MEDIUM (But Important)

13. **Inconsistent default values** - Different values in schema vs actual form initialization
14. **Backend field mapping** - Publish endpoint maps fields but draft save doesn't
15. **No error validation** - Frontend doesn't validate against backend schema expectations

---

## RECOMMENDATIONS FOR MILESTONE 1

**Immediate Fixes Needed:**

1. ✅ **Fix field name mappings** in draft save payloads
   - Send `experienceType` instead of `type`
   - Send `linkedVenueId` instead of `selectedVenueId`

2. ✅ **Include all Milestone 1 fields** in payloads
   - Add roles to draft save
   - Add itinerary to draft save
   - Add deposit fields to draft save

3. ✅ **Consolidate payloads** - Use auto-save mutation payload as template
   - Ensures all fields are sent
   - Consistent across draft/publish

4. ✅ **Backend field mapping** - Move from publish endpoint to all endpoints
   - Don't rely on ad-hoc mapping in publish endpoint

---

## CONCLUSION

**Frontend Readiness:** ⚠️ **PARTIAL**

**Strengths:**
- ✅ Comprehensive form collection
- ✅ Good client-side validation
- ✅ Proper Zod schema definition
- ✅ Clean 10-step UX

**Weaknesses:**
- ❌ Field name mismatches not handled
- ❌ 20+ collected fields never sent to backend
- ❌ Inconsistent payloads across endpoints
- ❌ Critical Milestone 1 fields missing from payloads

**Data Loss Potential:** 🔴 **CRITICAL** - At least 25+ fields collected but lost

