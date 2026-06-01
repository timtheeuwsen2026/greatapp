# Venue Form - Validation & UX Testing Checklist

**Date:** October 17, 2025  
**Purpose:** Comprehensive test checklist for venue form validation  
**Environment:** Replit Development  

---

## 🧪 How to Run Tests on Replit

### Prerequisites

1. **Start the application:**
   ```bash
   # In Replit Shell
   npm run dev
   ```

2. **Open preview URL:**
   - Click "Webview" or open the preview in a new tab
   - Navigate to `/venue/create` (or wherever your venue form is)

3. **Open browser DevTools:**
   - Right-click → Inspect
   - Go to Console tab (for error checking)
   - Go to Network tab (for API monitoring)

4. **For API tests:**
   ```bash
   # Get your Replit URL
   echo $REPLIT_DEV_DOMAIN
   
   # Or use localhost
   API_URL="http://localhost:5000"
   ```

---

## ✅ Test Checklist

### Test 1: Required Fields Show Errors When Empty

**Steps:**
1. Open venue form at `/venue/create`
2. Leave all fields empty
3. Click "Submit Venue" button
4. Observe error messages

**Expected Result:**
- ❌ Submit blocked (form doesn't submit)
- ✅ Red error messages appear under these fields:
  - "Venue Name" → "Venue name is required"
  - "City" → "City is required"
  - "Description" → "Description must be at least 100 characters"
  - "Capacity" → "Capacity is required"
  - "Location" → "Location is required"
  - "Categories" → "Select at least one category"
- ✅ Form focus moves to first error field
- ✅ Submit button remains disabled if applicable

**Visual Check:**
```
┌────────────────────────────────────┐
│ Venue Name *                       │
│ [                                ] │
│ ⚠️ Venue name is required          │
└────────────────────────────────────┘
```

---

### Test 2: Required Fields Accept Valid Input

**Steps:**
1. Fill in "Venue Name" field: "Zen Garden Retreat"
2. Fill in "City" field: "Sedona"
3. Fill in "Description" (100+ chars): "A peaceful retreat center nestled in the red rocks of Sedona, offering transformative experiences for wellness seekers and spiritual explorers."
4. Fill in "Capacity": 50
5. Fill in "Location": "123 Retreat Lane, Sedona, AZ 86336"
6. Select at least one category

**Expected Result:**
- ✅ No error messages shown
- ✅ Field borders turn green (if success state implemented)
- ✅ Character counter shows progress: "142 / 100 minimum characters"
- ✅ Submit button becomes enabled (if all other required fields valid)

**Visual Check:**
```
┌────────────────────────────────────┐
│ Description *                      │
│ [A peaceful retreat center...    ] │
│ ✓ 142 / 100 minimum characters     │
└────────────────────────────────────┘
```

---

### Test 3: Cover Image Required

**Steps:**
1. Fill in all required text fields (name, city, description, etc.)
2. Do NOT upload a cover image
3. Scroll to "Cover Image" section
4. Click "Submit Venue" button
5. Observe error message

**Expected Result:**
- ❌ Submit blocked
- ✅ Error message appears: "Cover image is required"
- ✅ Cover image section highlighted in red
- ✅ Page auto-scrolls to cover image section

**Visual Check:**
```
┌────────────────────────────────────┐
│ Cover Image *                      │
│ ┌────────────────────────────────┐ │
│ │  📷  Upload Cover Image        │ │
│ └────────────────────────────────┘ │
│ ⚠️ Cover image is required         │
└────────────────────────────────────┘
```

**After Fix:**
1. Upload an image (JPEG/PNG)
2. Click "Submit Venue" again

**Expected Result:**
- ✅ Error message disappears
- ✅ Image preview shows
- ✅ Submit proceeds (if no other errors)

---

### Test 4: Gallery Image Limit (Max 10)

**Steps:**
1. Go to "Gallery Images" section
2. Click "Add Image" or upload button
3. Try to upload 11 images (or add 11th after 10 uploaded)
4. Observe behavior

**Expected Result:**
- ❌ 11th image upload blocked
- ✅ Error message: "Maximum 10 gallery images allowed"
- ✅ Upload button disabled after 10 images
- ✅ Counter shows: "10 / 10 images"

**Visual Check (at limit):**
```
┌────────────────────────────────────┐
│ Gallery Images (10 / 10)           │
│ [Image 1] [Image 2] ... [Image 10] │
│ [+ Add Image] ← DISABLED           │
│ ℹ️ Maximum 10 images reached       │
└────────────────────────────────────┘
```

**Test Removal:**
1. Click delete (🗑️) on one image
2. Observe counter and button state

**Expected Result:**
- ✅ Counter shows: "9 / 10 images"
- ✅ Add button becomes enabled
- ✅ Can upload 10th image again

---

### Test 5: Image Reorder Persistence

**Steps:**
1. Upload 3 gallery images
2. Note initial order: Image A, Image B, Image C
3. Drag Image C to first position using drag handle (≡)
4. New order: Image C, Image A, Image B
5. Click "Save as Draft"
6. Wait for success message
7. Refresh the page (F5 or Ctrl+R)
8. Observe image order

**Expected Result:**
- ✅ Order persists: Image C, Image A, Image B
- ✅ Images display in dragged order after refresh
- ✅ No reversion to original order

**Visual Check:**
```
Before:  [A] [B] [C]
After:   [C] [A] [B]
Refresh: [C] [A] [B] ← Should match "After"
```

---

### Test 6: Google Maps Autocomplete → Lat/Long Saved

**Steps:**
1. Go to "Location" field
2. Start typing: "Grand Canyon Village"
3. Wait for autocomplete dropdown to appear
4. Click on suggestion: "Grand Canyon Village, AZ, USA"
5. Observe auto-filled fields

**Expected Result:**
- ✅ Location field filled: "Grand Canyon Village, AZ 86023, USA"
- ✅ City field filled: "Grand Canyon Village"
- ✅ Latitude field shows: ~36.0544 (read-only, grayed out)
- ✅ Longitude field shows: ~-112.1401 (read-only, grayed out)
- ✅ "View on Google Maps" link appears

**Visual Check:**
```
┌────────────────────────────────────┐
│ Location *                         │
│ [Grand Canyon Village, AZ 86023] ✓ │
│                                    │
│ City: Grand Canyon Village         │
│ Lat:  36.0544   Long: -112.1401    │
│ 📍 View on Google Maps →           │
└────────────────────────────────────┘
```

**Verification:**
1. Click "View on Google Maps" link
2. New tab opens with map at correct location

---

### Test 7: Multi-Select - Canonical + Custom Amenity

**Steps:**
1. Go to "Amenities" section
2. Select canonical amenities:
   - Click "WiFi"
   - Click "Parking"
3. Add custom amenity:
   - Type in custom field: "Organic Garden"
   - Press Enter or click "Add"
4. Verify all 3 appear as tags/pills
5. Click "Save as Draft"
6. Refresh page
7. Observe amenities section

**Expected Result:**
- ✅ All 3 amenities appear as pills/badges:
  - "WiFi" (canonical)
  - "Parking" (canonical)
  - "Organic Garden" (custom)
- ✅ After refresh, all 3 amenities still selected
- ✅ Custom amenity persists (not lost)
- ✅ Can remove any amenity by clicking X

**Visual Check:**
```
Amenities: [WiFi ✕] [Parking ✕] [Organic Garden ✕]
```

**Database Check:**
```bash
# In Replit Shell
npm run db:studio
# Or query directly:
psql $DATABASE_URL -c "SELECT amenities FROM venues WHERE id = 'your-venue-id';"
```

**Expected DB Value:**
```json
["WiFi", "Parking", "Organic Garden"]
```

---

### Test 8: Services - Add/Edit/Delete → Persists

**Steps:**
1. Go to "On-Site Services" section
2. Click "Add Service"
3. Fill in service:
   - Title: "Gourmet Catering"
   - Description: "Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options." (50+ chars)
   - Price: 45.00
   - Frequency: "Per Day"
   - Quantity: 50
4. Click save (✓) icon
5. Service collapses to summary view
6. Click edit (✏️) icon
7. Change price to 50.00
8. Click save (✓)
9. Click "Add Service" again
10. Add second service (any valid data)
11. Click delete (🗑️) on first service
12. Click "Save as Draft"
13. Refresh page

**Expected Result:**
- ✅ Only second service remains after refresh
- ✅ First service (deleted) is gone
- ✅ Price change (45.00 → 50.00) would have persisted if not deleted

**Visual Check After Refresh:**
```
Services: 
[Service 2: Title - $XX.XX / per_day]
(Service 1 is gone)
```

---

### Test 9: Terms Checkbox - Cannot Submit Without It

**Steps:**
1. Fill in all required fields (name, description, city, etc.)
2. Upload cover image
3. Scroll to "Terms & Conditions" section
4. Leave checkbox UNCHECKED
5. Click "Submit Venue" button
6. Observe behavior

**Expected Result:**
- ❌ Submit button is DISABLED (grayed out, not clickable)
- ✅ Tooltip may show on hover: "Accept terms to continue"
- ✅ If clicked anyway (shouldn't be possible), error alert appears:
  - "⚠️ You must accept the terms and conditions before submitting"
- ✅ Page scrolls to terms checkbox
- ✅ Checkbox section highlighted in red

**Visual Check:**
```
┌────────────────────────────────────┐
│ Terms & Conditions                 │
│ [ ] I agree to Terms of Service... │
│                                    │
│ [Cancel]  [Save Draft]  [Submit] ← DISABLED │
└────────────────────────────────────┘
```

**After Checking:**
1. Click terms checkbox
2. Observe submit button

**Expected Result:**
- ✅ Submit button becomes ENABLED
- ✅ Can now click "Submit Venue"

---

### Test 10: Server Validation Matches UI - Deposit Percent >100

**Client-Side Test:**

**Steps:**
1. Go to "Deposit Settings" section
2. Enable deposit toggle
3. Enter deposit percent: 150
4. Try to submit

**Expected Result:**
- ❌ Submit blocked
- ✅ Error message: "Deposit percent must be between 0 and 100"
- ✅ Field highlighted in red

**Server-Side Test (API):**

```bash
# Test: Submit with deposit_percent > 100
curl -X POST http://localhost:5000/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "name": "Test Venue",
    "slug": "test-venue-sedona",
    "city": "Sedona",
    "location": "123 Test St",
    "description": "A test venue for validation testing with over one hundred characters to meet the minimum description length requirement.",
    "capacity": 50,
    "createdBy": "user-123",
    "depositPercent": 150,
    "termsAccepted": true
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid venue data",
  "details": [
    {
      "code": "too_big",
      "maximum": 100,
      "type": "number",
      "message": "Deposit percent must be between 0 and 100",
      "path": ["depositPercent"]
    }
  ]
}
```

**Verification:**
- ✅ Same error message on client and server
- ✅ HTTP 400 status code
- ✅ Clear error path indicating which field failed

---

### Test 11: Draft Persistence - Save & Reload

**Steps:**
1. Fill in partial venue data:
   - Name: "Draft Venue Test"
   - City: "Sedona"
   - Description: (100+ chars)
   - Capacity: 25
   - Category: Select "Retreat Centers"
   - Upload cover image
2. Do NOT fill in all optional fields
3. Do NOT check terms (draft doesn't require)
4. Click "Save as Draft"
5. Wait for success toast: "Draft saved successfully"
6. Note the venue ID from URL or response
7. Close browser tab
8. Reopen venue form or navigate to drafts list
9. Open the saved draft
10. Observe all fields

**Expected Result:**
- ✅ Name: "Draft Venue Test" (restored)
- ✅ City: "Sedona" (restored)
- ✅ Description: same text (restored)
- ✅ Capacity: 25 (restored)
- ✅ Category: "Retreat Centers" selected
- ✅ Cover image: preview shows (restored)
- ✅ Status: "Draft" badge visible
- ✅ Terms checkbox: unchecked (as saved)

**Visual Check:**
```
┌────────────────────────────────────┐
│ Editing Draft: Draft Venue Test    │
│ Status: [Draft]                    │
│                                    │
│ Name: [Draft Venue Test]           │
│ City: [Sedona]                     │
│ ...all previously entered data...  │
└────────────────────────────────────┘
```

---

## 🔧 Backend Validation Test Suite

### Setup for API Tests

```bash
# In Replit Shell

# 1. Get auth session cookie
# Method A: Login via browser, copy cookie from DevTools
# Application → Cookies → connect.sid

# Method B: Login via API (if you have login endpoint)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test@example.com", "password": "password123"}' \
  -c cookies.txt

# 2. Set base URL
API_URL="http://localhost:5000"

# 3. Set session cookie for subsequent requests
SESSION_COOKIE="connect.sid=YOUR_COOKIE_HERE"
```

---

### API Test 1: Required Field Missing (Name)

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "city": "Sedona",
    "description": "A venue without a name to test required field validation with sufficient character count.",
    "capacity": 50
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid venue data",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["name"],
      "message": "Venue name is required"
    }
  ]
}
```

---

### API Test 2: Description Too Short (<100 chars)

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "name": "Test Venue",
    "slug": "test-venue",
    "city": "Sedona",
    "location": "123 Test St",
    "description": "Too short",
    "capacity": 50,
    "createdBy": "user-123",
    "termsAccepted": true
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "too_small",
      "minimum": 100,
      "message": "Description must be at least 100 characters",
      "path": ["description"]
    }
  ]
}
```

---

### API Test 3: Terms Not Accepted

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "name": "Test Venue",
    "slug": "test-venue",
    "city": "Sedona",
    "location": "123 Test St",
    "description": "A complete venue description with over one hundred characters to meet the minimum requirement for testing purposes.",
    "capacity": 50,
    "createdBy": "user-123",
    "termsAccepted": false
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "TERMS_NOT_ACCEPTED",
  "message": "You must accept the terms and conditions before submitting your venue",
  "code": "TERMS_REQUIRED"
}
```

---

### API Test 4: Service Description Too Short (<50 chars)

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "name": "Test Venue",
    "slug": "test-venue",
    "city": "Sedona",
    "location": "123 Test St",
    "description": "A complete venue description with over one hundred characters to meet the minimum requirement for testing.",
    "capacity": 50,
    "createdBy": "user-123",
    "termsAccepted": true,
    "services": [
      {
        "title": "Test Service",
        "description": "Too short",
        "price": 25.00,
        "frequency": "per_day"
      }
    ]
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "Invalid services data",
  "details": [
    {
      "code": "too_small",
      "minimum": 50,
      "message": "Service description must be at least 50 characters",
      "path": ["services", 0, "description"]
    }
  ]
}
```

---

### API Test 5: Service Price Invalid (3 decimals)

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "name": "Test Venue",
    "slug": "test-venue",
    "city": "Sedona",
    "location": "123 Test St",
    "description": "A complete venue description with over one hundred characters to meet the minimum requirement for testing.",
    "capacity": 50,
    "createdBy": "user-123",
    "termsAccepted": true,
    "services": [
      {
        "title": "Test Service",
        "description": "A detailed service description with more than fifty characters to pass validation.",
        "price": 25.123,
        "frequency": "per_day"
      }
    ]
  }'
```

**Expected Response:**
```json
HTTP 400 Bad Request
{
  "error": "Service \"Test Service\" has invalid price format (max 2 decimal places)"
}
```

---

### API Test 6: Valid Venue Creation

```bash
curl -X POST $API_URL/api/venues \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "name": "Zen Garden Retreat",
    "slug": "zen-garden-retreat-sedona",
    "city": "Sedona",
    "location": "123 Retreat Lane, Sedona, AZ 86336",
    "description": "A peaceful retreat center nestled in the red rocks of Sedona, offering transformative experiences for wellness seekers and spiritual explorers worldwide.",
    "capacity": 50,
    "latitude": 34.8697,
    "longitude": -111.7610,
    "categories": ["Retreat Centers", "Yoga Studios"],
    "vibes": ["Peaceful", "Transformative"],
    "amenities": ["WiFi", "Parking", "Organic Garden"],
    "createdBy": "user-123",
    "termsAccepted": true,
    "services": [
      {
        "title": "Gourmet Catering",
        "description": "Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with options.",
        "price": 45.00,
        "frequency": "per_day",
        "quantity": 50
      }
    ]
  }'
```

**Expected Response:**
```json
HTTP 201 Created
{
  "id": "venue-uuid-here",
  "name": "Zen Garden Retreat",
  "slug": "zen-garden-retreat-sedona",
  "city": "Sedona",
  "latitude": 34.8697,
  "longitude": -111.7610,
  "termsAccepted": true,
  "termsAcceptedAt": "2025-10-17T12:34:56.789Z",
  "services": [
    {
      "id": "svc-...",
      "title": "Gourmet Catering",
      "price": 45.00,
      ...
    }
  ],
  "createdAt": "2025-10-17T12:34:56.789Z",
  ...
}
```

---

## 🎯 Quick Test Run (5 Minutes)

### Minimal Smoke Test

1. **Start app:** `npm run dev`
2. **Open form:** Navigate to `/venue/create`
3. **Test required fields:** Click submit → See errors
4. **Test terms:** Try to submit without terms → Blocked
5. **Test valid submission:**
   - Fill all required fields
   - Upload cover image
   - Check terms
   - Submit → Success

**Expected:** All 5 checks pass ✅

---

## 📊 Test Results Template

Use this checklist to track your test results:

```
□ Test 1:  Required fields empty → Errors shown
□ Test 2:  Required fields valid → Errors clear
□ Test 3:  Cover image missing → Blocked
□ Test 4:  Gallery 11 images → Blocked at 10
□ Test 5:  Image reorder → Persists after refresh
□ Test 6:  Google Autocomplete → Lat/Long saved
□ Test 7:  Multi-select amenities → Canonical + custom persist
□ Test 8:  Services CRUD → Add/edit/delete persists
□ Test 9:  Terms unchecked → Submit disabled
□ Test 10: Deposit >100 → Server rejects (matches UI)
□ Test 11: Draft save → Restores after reload

API Tests:
□ API Test 1: Name missing → 400 error
□ API Test 2: Description short → 400 error
□ API Test 3: Terms false → 400 TERMS_NOT_ACCEPTED
□ API Test 4: Service desc short → 400 error
□ API Test 5: Price 3 decimals → 400 error
□ API Test 6: Valid data → 201 Created
```

---

## 🐛 Common Issues & Debugging

### Issue: Submit button not disabled without terms

**Debug:**
```typescript
// In browser console
const termsCheckbox = document.querySelector('[data-testid="checkbox-terms-accepted"]');
const submitButton = document.querySelector('[data-testid="button-submit"]');
console.log('Terms checked:', termsCheckbox.checked);
console.log('Submit disabled:', submitButton.disabled);
```

**Fix:** Check that submit button `disabled` prop is tied to `termsAccepted` state

---

### Issue: Images not persisting after refresh

**Debug:**
```bash
# Check database
psql $DATABASE_URL -c "SELECT cover_image, gallery_images FROM venues WHERE id = 'your-id';"
```

**Expected:** URLs should be saved, not empty

---

### Issue: API returns 401 Unauthorized

**Debug:**
```bash
# Check if authenticated
curl http://localhost:5000/api/user \
  -H "Cookie: $SESSION_COOKIE"
```

**Fix:** Get fresh session cookie from browser DevTools

---

### Issue: Validation errors not showing

**Debug:**
```typescript
// In browser console after submit attempt
const form = document.querySelector('form');
console.log('Form errors:', form.formState?.errors);
```

**Expected:** Errors object should contain field names with messages

---

## ✅ Success Criteria

**All tests passing means:**

✅ Client-side validation works  
✅ Server-side validation works  
✅ Error messages match between client/server  
✅ Required fields enforced  
✅ Image limits enforced  
✅ Data persists correctly  
✅ Terms acceptance enforced  
✅ Draft workflow functional  

**Ready for production!** 🚀
