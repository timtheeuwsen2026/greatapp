# Public Event Page - Deployment Testing Guide

## 🚀 Quick Reference

**Route to Test:** `/e/:slugOrId`

**Example URLs:**
- `https://your-app.replit.app/e/exp-admin-published-demo`
- `https://your-app.replit.app/e/your-event-slug`
- `https://your-app.replit.app/e/event-id-123`

---

## 🔧 Environment Variables Required

### Production Environment

```bash
# Database (Automatically configured by Replit)
DATABASE_URL=postgresql://...

# Authentication
REPLIT_DOMAINS=your-app.replit.app

# Payment Processing (if using Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI Assistant (if using OpenAI)
OPENAI_API_KEY=sk-...

# Email (if using SendGrid)
SENDGRID_API_KEY=SG...
```

### Verify Environment Variables

**In Replit:**
1. Click "Tools" → "Secrets"
2. Verify all required keys are set
3. Check that `DATABASE_URL` is automatically available

**Required for Public Event Page:**
- ✅ `DATABASE_URL` - Database connection
- ✅ `REPLIT_DOMAINS` - For authentication

**Optional (for full functionality):**
- `STRIPE_SECRET_KEY` - For payments
- `OPENAI_API_KEY` - For AI assistant
- `SENDGRID_API_KEY` - For emails

---

## 🏗️ Build Steps

### Automatic Build (Replit Handles This)

When you deploy on Replit, it automatically:

1. **Installs dependencies:** `npm install`
2. **Builds frontend:** `npm run build` (Vite)
3. **Compiles backend:** TypeScript to JavaScript
4. **Starts server:** `npm run dev` or `npm start`

### Manual Build (if needed)

```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Start production server
npm start
```

### Database Migration

```bash
# Push schema changes to database
npm run db:push

# Or force if needed
npm run db:push --force
```

---

## 📍 Routes & Access Patterns

### Public Event Page Routes

| Route | Description | Access |
|-------|-------------|--------|
| `/e/:slug` | Public event by slug | Anyone |
| `/e/:id` | Public event by ID | Anyone |
| `/e/:slugOrId?preview=token` | Preview pending event | Stakeholders with token |

### Access Control Logic

**Draft Events:**
- **Creator/Admin:** Can view with edit controls
- **Public:** Cannot access (404)
- **Preview Token:** Not applicable

**Pending Events:**
- **Creator/Admin:** Can view with status banner
- **Public:** Cannot access (404)
- **With Preview Token:** Can view (stakeholders)

**Approved Events:**
- **Everyone:** Full public access
- **No restrictions**

---

## 🧪 Smoke Test Checklist

### Pre-Deployment Checks

Before deploying, verify locally:

- [ ] App runs without errors: `npm run dev`
- [ ] Database connected: Check logs for connection
- [ ] All environment variables set
- [ ] No TypeScript errors: `npm run build`

### Post-Deployment Smoke Tests

After deploying to production, test these scenarios:

---

### ✅ Test 1: Approved Event (Public Access)

**Route:** `/e/:slugOrId`

**Example:** `https://your-app.replit.app/e/exp-admin-published-demo`

**Expected Results:**

#### **Page Load**
- [ ] Page loads within 2-3 seconds
- [ ] No 404 or 500 errors
- [ ] No console errors in browser DevTools

#### **Hero Section**
- [ ] Cover image loads and displays
- [ ] Event title shows correctly
- [ ] Dates formatted properly
- [ ] Location displays with icon

#### **Data Display**
- [ ] Short description visible
- [ ] Full description renders
- [ ] All info cards populated:
  - Location with map pin
  - Dates with calendar icon
  - Price with dollar sign
  - Group size with users icon

#### **Images**
- [ ] Cover image loads (HTTPS)
- [ ] Gallery images load
- [ ] Room images display
- [ ] Creator avatar shows (or fallback initials)
- [ ] Venue cover photo loads

#### **Sections Visibility**
- [ ] Itinerary displays (if exists)
- [ ] Rooms & Pricing shows:
  - Room cards with images
  - Prices with currency
  - Discount badges (if applicable)
  - Spots remaining
- [ ] MVG Status shows (if enabled):
  - Progress bar filled correctly
  - Percentage accurate
  - Status message conditional
- [ ] Venue section displays (if linked)
- [ ] Creator section shows with profile card
- [ ] Service Needs displays (if exists)
- [ ] Final CTA always visible

#### **CTA Buttons**
- [ ] Primary CTA shows correct text:
  - "Book Now" (MVG met/disabled)
  - "Join Waitlist" (MVG not met)
- [ ] Final CTA shows same button
- [ ] Buttons styled correctly
- [ ] Hover effects work

#### **Responsive Design**
- [ ] **Mobile (< 768px):** Sections stack vertically
- [ ] **Tablet (768-1024px):** 2-column layouts work
- [ ] **Desktop (> 1024px):** 3-column layouts optimal
- [ ] Images scale properly on all devices

---

### ✅ Test 2: Pending Event (Preview Access)

**Route:** `/e/:slugOrId?preview=PREVIEW_TOKEN`

**How to Get Preview Token:**
1. Go to event in admin/creator dashboard
2. Click "Share Preview" or "Get Preview Link"
3. Copy the full URL with `?preview=` parameter

**Expected Results:**

#### **Access Control**
- [ ] **Without token:** 404 error (public cannot access)
- [ ] **With valid token:** Page loads successfully
- [ ] **With invalid token:** 404 or error message

#### **Status Banner**
- [ ] Yellow/orange banner at top
- [ ] Text: "This event is pending review"
- [ ] Preview token notice visible
- [ ] Edit button shows (for creator/admin)

#### **Content Display**
- [ ] All sections display normally
- [ ] Same layout as approved event
- [ ] All features functional
- [ ] Images and data load correctly

#### **Creator/Admin View**
- [ ] Edit controls visible
- [ ] "Approve" button shows (admin only)
- [ ] "Edit" button shows (creator/admin)
- [ ] Status banner prominent

---

### ✅ Test 3: Draft Event (Creator/Admin Only)

**Route:** `/e/:slugOrId`

**Login Required:** Must be logged in as creator or admin

**Expected Results:**

#### **Access Control**
- [ ] **Not logged in:** 404 error
- [ ] **Logged in as creator:** Full access
- [ ] **Logged in as admin:** Full access
- [ ] **Logged in as other user:** 404 error

#### **Status Banner**
- [ ] Gray/blue banner at top
- [ ] Text: "This is a draft event"
- [ ] Visibility notice: "Only you can see this"
- [ ] Edit button prominent

#### **Edit Controls**
- [ ] "Edit Event" button visible
- [ ] "Publish" button shows
- [ ] Draft-specific messaging clear

---

### ✅ Test 4: Fallback States

Test how the page handles missing data:

#### **Missing Venue**
- [ ] Venue section hidden (no error)
- [ ] Other sections display normally
- [ ] No "undefined" or "null" text

#### **Missing Creator Photo**
- [ ] Avatar shows initials fallback
- [ ] Circle with first letter of name
- [ ] Proper background color

#### **No Services**
- [ ] Service Needs section hidden
- [ ] No empty card displayed
- [ ] Clean layout maintained

#### **No Room Images**
- [ ] Room cards show without image
- [ ] Layout not broken
- [ ] Placeholder or gradient background

#### **MVG Disabled**
- [ ] MVG section hidden
- [ ] CTA shows "Book Now"
- [ ] No progress bar displayed

#### **No Gallery Images**
- [ ] Gallery section hidden
- [ ] Cover image still displays in hero

---

### ✅ Test 5: MVG States

Test different MVG (Minimum Viable Group) scenarios:

#### **MVG Not Met (e.g., 8 of 20 participants)**
- [ ] Progress bar shows 40%
- [ ] Status message: "Confirmed once 20 join by [date]"
- [ ] Button: "Join Waitlist"
- [ ] Deadline formatted correctly

#### **MVG Met (e.g., 22 of 20 participants)**
- [ ] Progress bar shows 110% (full)
- [ ] Status message: "✓ Event confirmed" (green)
- [ ] Button: "Book Now"
- [ ] Confirmation checkmark visible

#### **MVG Disabled**
- [ ] MVG section completely hidden
- [ ] Button: "Book Now"
- [ ] No progress bar or status

---

### ✅ Test 6: Performance & Loading

#### **Load Times**
- [ ] Initial page load: < 3 seconds
- [ ] API response: < 500ms
- [ ] Images load progressively
- [ ] No blocking resources

#### **Browser Console**
- [ ] No JavaScript errors
- [ ] No failed network requests
- [ ] No 404s for assets
- [ ] API calls succeed

#### **Network Tab (DevTools)**
- [ ] Event API returns 200
- [ ] All images return 200
- [ ] No CORS errors
- [ ] Proper caching headers

---

## 🔍 How to Test Each Scenario

### Step 1: Create Test Events

Create events in different states for testing:

```sql
-- Example: Create approved event
INSERT INTO experiences (
  id, title, status, "startDate", "endDate", 
  "coverImageUrl", "shortDescription"
) VALUES (
  'test-approved-event',
  'Test Approved Event',
  'approved',
  NOW() + INTERVAL '30 days',
  NOW() + INTERVAL '35 days',
  'https://example.com/cover.jpg',
  'This is a test approved event'
);

-- Example: Create pending event with preview token
INSERT INTO experiences (
  id, title, status, "previewToken",
  "startDate", "endDate", "coverImageUrl"
) VALUES (
  'test-pending-event',
  'Test Pending Event',
  'pending',
  'preview-token-123',
  NOW() + INTERVAL '30 days',
  NOW() + INTERVAL '35 days',
  'https://example.com/cover.jpg'
);
```

### Step 2: Test Routes

**Approved Event:**
```
https://your-app.replit.app/e/test-approved-event
```

**Pending Event (with preview):**
```
https://your-app.replit.app/e/test-pending-event?preview=preview-token-123
```

**Pending Event (without preview - should fail):**
```
https://your-app.replit.app/e/test-pending-event
```

**Draft Event (must be logged in as creator):**
```
https://your-app.replit.app/e/test-draft-event
```

### Step 3: Verify Each Section

For each test event, verify:

1. **Hero & Info Cards** - Load correctly
2. **Description** - Renders properly
3. **Gallery** - Images display
4. **Itinerary** - Shows schedule (if exists)
5. **Rooms & Pricing** - Cards with prices/discounts
6. **MVG Status** - Progress bar and messaging
7. **Venue** - Info card displays (if linked)
8. **Creator** - Profile card shows
9. **Service Needs** - Chips display (if exists)
10. **Final CTA** - Correct button shows

### Step 4: Test Responsive

Use browser DevTools:

1. Open DevTools (F12)
2. Click "Toggle Device Toolbar" (Ctrl+Shift+M)
3. Test these viewports:
   - **Mobile:** 375px width (iPhone)
   - **Tablet:** 768px width (iPad)
   - **Desktop:** 1440px width

Verify layout adapts correctly.

---

## 🐛 Common Issues & Solutions

### Issue 1: 404 Error on Event Page

**Possible Causes:**
- Event doesn't exist in database
- Wrong slug/ID in URL
- Event status prevents access (draft/pending without permission)

**Solutions:**
1. Verify event exists: `SELECT * FROM experiences WHERE id = 'your-id'`
2. Check event status and your access level
3. Use correct slug or ID in URL

### Issue 2: Images Not Loading

**Possible Causes:**
- Non-HTTPS URLs
- Invalid image URLs
- CORS issues

**Solutions:**
1. Ensure all image URLs are HTTPS
2. Verify URLs are accessible
3. Check browser console for errors

### Issue 3: Section Not Displaying

**Possible Causes:**
- Missing data in database
- Conditional rendering hiding section
- API not returning data

**Solutions:**
1. Check database for data: `SELECT * FROM experiences WHERE id = 'your-id'`
2. Verify API response includes field
3. Check browser console for errors

### Issue 4: Preview Token Not Working

**Possible Causes:**
- Invalid token
- Event not in pending status
- Token expired or missing

**Solutions:**
1. Verify event status is "pending"
2. Check `previewToken` field in database
3. Use exact token from database

### Issue 5: MVG Not Showing

**Possible Causes:**
- MVG not enabled for event
- `requireMinimumParticipants` is false

**Solutions:**
1. Check: `SELECT "requireMinimumParticipants", "minimumParticipants" FROM experiences WHERE id = 'your-id'`
2. Enable MVG in Event Builder
3. Verify `mvgEnabled` is true in draft

---

## 📊 Database Verification Queries

### Check Event Status & Data

```sql
-- Complete event check
SELECT 
  id,
  title,
  status,
  "linkedVenueId",
  "creatorId",
  "previewToken",
  "requireMinimumParticipants",
  "minimumParticipants",
  "currentParticipants",
  "mvgDeadline",
  "startDate",
  "endDate",
  "coverImageUrl"
FROM experiences 
WHERE id = 'your-event-id';
```

### Check Creator Profile

```sql
-- Creator data
SELECT 
  "userId",
  "displayName",
  "businessName",
  "profilePhoto",
  "baseLocation",
  "bio",
  "expertiseTags",
  "isVerified",
  "averageRating",
  "totalExperiences"
FROM creator_profiles
WHERE "userId" = 'creator-user-id';
```

### Check Venue Link

```sql
-- Venue data
SELECT 
  id,
  name,
  slug,
  city,
  description,
  capacity,
  "coverImageUrl",
  amenities
FROM venues
WHERE id = 'venue-id';
```

---

## ✅ Final Deployment Checklist

Before marking deployment complete:

### Environment
- [ ] All environment variables set
- [ ] Database connected
- [ ] API responding correctly

### Functionality
- [ ] Approved events load publicly
- [ ] Pending events require preview token
- [ ] Draft events restricted to creator/admin
- [ ] All 12 sections display correctly
- [ ] Images load properly
- [ ] CTAs show correct text

### Performance
- [ ] Page loads < 3 seconds
- [ ] No console errors
- [ ] API responses < 500ms
- [ ] Images optimized

### Responsive
- [ ] Mobile layout works
- [ ] Tablet layout works
- [ ] Desktop layout optimal

### Edge Cases
- [ ] Missing data handled gracefully
- [ ] Fallback states work
- [ ] Error pages display correctly

---

## 🎯 Quick Smoke Test Script

Run this quick test after deployment:

```bash
# 1. Test approved event
curl -I https://your-app.replit.app/e/exp-admin-published-demo
# Should return: 200 OK

# 2. Test pending event without token (should fail)
curl -I https://your-app.replit.app/e/pending-event-id
# Should return: 404 Not Found

# 3. Test pending event with token (should work)
curl -I https://your-app.replit.app/e/pending-event-id?preview=token123
# Should return: 200 OK

# 4. Test non-existent event
curl -I https://your-app.replit.app/e/fake-event
# Should return: 404 Not Found
```

---

## 📝 Summary

### Routes to Test
- ✅ `/e/:slugOrId` - Public approved events
- ✅ `/e/:slugOrId?preview=token` - Pending events with preview
- ✅ `/e/:slugOrId` (as creator) - Draft events

### Required Environment Variables
- ✅ `DATABASE_URL` (auto-configured)
- ✅ `REPLIT_DOMAINS` (for auth)
- Optional: `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`

### Build Steps
- ✅ Automatic on Replit deployment
- Manual: `npm install && npm run build && npm start`

### Smoke Test Priority
1. **Critical:** Approved event loads and displays
2. **Critical:** Images load correctly
3. **Critical:** CTAs show correct text
4. **Important:** Pending preview access works
5. **Important:** Fallback states handle missing data
6. **Important:** Responsive design works
7. **Nice to have:** All sections display perfectly

---

## 🚀 Ready to Deploy!

Your Public Event Page is production-ready. Use this guide to verify everything works correctly after deployment!
