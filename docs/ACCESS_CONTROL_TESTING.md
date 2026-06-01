# Access Control Testing Guide

## Overview

This guide provides step-by-step instructions for testing the complete access control system for events, including frontend conditional rendering and backend authorization.

## Prerequisites

1. **Development Server Running:**
   ```bash
   npm run dev
   ```

2. **Test Data Setup:**
   - Create test events with different statuses
   - Generate preview tokens for pending events
   - Have test user accounts (creator and non-creator)

---

## Test Scenarios

### 1. ✅ **Approved Event - Public Access**

**Objective:** Verify approved events are publicly accessible

**Setup:**
1. Ensure you have an event with `status = 'approved'`
2. Example ID: `exp-admin-published-demo`

**Test Steps:**

**A. Public User (No Authentication)**
```bash
# Visit the event page
http://localhost:5000/e/exp-admin-published-demo
```

**Expected Results:**
- ✅ Page loads successfully (200 OK)
- ✅ Full event page displays with all 12 sections
- ✅ No preview or status banners shown
- ✅ "Book Now" button visible in hero and footer
- ✅ All content publicly visible

**Verification Checklist:**
- [ ] Hero section displays cover image
- [ ] Title, dates, location visible
- [ ] Quick facts card shows price, duration, group size
- [ ] All sections load (about, gallery, itinerary, etc.)
- [ ] No error messages or warnings

---

### 2. 🟡 **Pending Event - Preview Token Access**

**Objective:** Verify preview tokens grant access to pending events

**Setup:**
1. Create event with `status = 'pending'`
2. Generate preview token via API:
   ```bash
   curl -X POST http://localhost:5000/api/experiences/{event-id}/generate-preview-token \
     -H "Cookie: {auth-cookie}"
   ```
3. Copy the `previewToken` from response

**Test Steps:**

**A. With Valid Preview Token**
```bash
# Visit with preview token
http://localhost:5000/e/{pending-event-id}?preview={token}
```

**Expected Results:**
- ✅ Page loads successfully (200 OK)
- ✅ Yellow preview banner at top
- ✅ Banner text: "Preview Mode — This event is pending approval..."
- ✅ Badge shows "Pending"
- ✅ Full event content below banner
- ✅ All sections visible

**Verification Checklist:**
- [ ] Preview banner visible with `data-testid="preview-banner"`
- [ ] Banner has yellow theme (`bg-yellow-50`)
- [ ] Lock icon displayed in banner
- [ ] Full content accessible below banner
- [ ] URL contains `?preview=` parameter

**B. With Invalid/Missing Token**
```bash
# Visit without token
http://localhost:5000/e/{pending-event-id}
```

**Expected Results:**
- ✅ 404 error page displayed
- ✅ "Event Not Found" heading
- ✅ Message: "This event doesn't exist, is not yet published, or you don't have permission..."
- ✅ "Browse Events" button visible

**Verification Checklist:**
- [ ] 404 page shows with `data-testid="error-heading-not-found"`
- [ ] FileX icon displayed
- [ ] Error message is user-friendly
- [ ] Browse button redirects to `/experiences`

---

### 3. 🟡 **Pending Event - Creator/Admin Access**

**Objective:** Verify creators and admins can view their own pending events

**Setup:**
1. Use event with `status = 'pending'`
2. Authenticate as the event creator
3. OR authenticate as admin (email: `timtheeuwsen@gmail.com`)

**Test Steps:**

**A. Creator Viewing Own Pending Event**
```bash
# Visit without preview token (authenticated as creator)
http://localhost:5000/e/{own-pending-event-id}
```

**Expected Results:**
- ✅ Page loads successfully (200 OK)
- ✅ Blue status banner at top
- ✅ Banner text: "This event is pending approval. It's not yet visible to the public."
- ✅ Badge shows "Pending Approval"
- ✅ Full event content below banner

**Verification Checklist:**
- [ ] Status banner visible with `data-testid="status-banner-pending"`
- [ ] Banner has blue theme (`bg-blue-50`)
- [ ] Alert icon displayed
- [ ] Full content accessible
- [ ] No preview token in URL

**B. Admin Viewing Any Pending Event**
```bash
# Visit as admin (email: timtheeuwsen@gmail.com)
http://localhost:5000/e/{any-pending-event-id}
```

**Expected Results:**
- ✅ Same as creator access above
- ✅ Admin can view any pending event
- ✅ Blue status banner shown

---

### 4. 📝 **Draft Event - Creator/Admin Access**

**Objective:** Verify draft events show special UI for creators

**Setup:**
1. Create event with `status = 'draft'`
2. Authenticate as the event creator

**Test Steps:**

**A. Creator Viewing Own Draft**
```bash
# Visit draft event (authenticated as creator)
http://localhost:5000/e/{own-draft-id}
```

**Expected Results:**
- ✅ Draft information page displayed (NOT 404)
- ✅ Heading: "This event is not yet published"
- ✅ Message: "This is a draft event that's still being created..."
- ✅ Event title shown (if available)
- ✅ "Continue Editing" button present
- ✅ "Go to Dashboard" button present

**Verification Checklist:**
- [ ] Draft page shows with `data-testid="draft-heading"`
- [ ] Lock icon in blue circle
- [ ] Event title displayed
- [ ] "Continue Editing" button with `data-testid="button-continue-editing"`
- [ ] "Go to Dashboard" button with `data-testid="button-dashboard"`
- [ ] Buttons navigate correctly

**B. Public User Viewing Draft**
```bash
# Visit draft event (not authenticated or not creator)
http://localhost:5000/e/{draft-id}
```

**Expected Results:**
- ✅ 404 error page displayed
- ✅ "Event Not Found" message
- ✅ No indication draft exists
- ✅ Prevents information leakage

**Verification Checklist:**
- [ ] 404 page shown (same as other not found)
- [ ] No draft-specific information revealed
- [ ] Browse events button works

---

### 5. 🚫 **Error Handling Tests**

**Objective:** Verify proper error states

**Test Steps:**

**A. Non-Existent Event**
```bash
http://localhost:5000/e/completely-fake-event-id-12345
```

**Expected Results:**
- ✅ 404 error page
- ✅ "Event Not Found" heading
- ✅ Generic not found message

**B. Network Error Simulation**
```bash
# Stop the server, then try to visit any event
```

**Expected Results:**
- ✅ Generic error page
- ✅ "Something Went Wrong" heading
- ✅ "Try Again" and "Browse Events" buttons

**C. Malformed Preview Token**
```bash
http://localhost:5000/e/{pending-id}?preview=invalid-token-123
```

**Expected Results:**
- ✅ 404 error page (token doesn't match)
- ✅ Same as no token scenario

---

## Backend API Testing

### Direct API Endpoint Tests

**1. Test Approved Event:**
```bash
curl -i http://localhost:5000/api/e/exp-admin-published-demo
# Expected: 200 OK with full event data
```

**2. Test Pending Event (No Token):**
```bash
curl -i http://localhost:5000/api/e/{pending-id}
# Expected: 404 Not Found (if not authenticated as creator/admin)
```

**3. Test Pending Event (With Token):**
```bash
curl -i "http://localhost:5000/api/e/{pending-id}?preview={valid-token}"
# Expected: 200 OK with full event data
```

**4. Test Draft Event:**
```bash
curl -i http://localhost:5000/api/e/{draft-id}
# Expected: 404 Not Found (if not authenticated as creator/admin)
```

**5. Generate Preview Token:**
```bash
curl -X POST http://localhost:5000/api/experiences/{pending-id}/generate-preview-token \
  -H "Cookie: {auth-session}" \
  -H "Content-Type: application/json"
# Expected: 200 OK with previewToken and previewUrl
```

---

## Access Control Matrix

Test all combinations to ensure proper access control:

| Status | User Type | Preview Token | Expected Result |
|--------|-----------|---------------|-----------------|
| **Approved** | Public | N/A | ✅ Full Page |
| **Approved** | Creator | N/A | ✅ Full Page |
| **Approved** | Admin | N/A | ✅ Full Page |
| **Pending** | Public | ❌ None | 🚫 404 Error |
| **Pending** | Public | ✅ Valid | ✅ Full Page + Preview Banner |
| **Pending** | Public | ❌ Invalid | 🚫 404 Error |
| **Pending** | Creator | ❌ None | ✅ Full Page + Status Banner |
| **Pending** | Creator | ✅ Valid | ✅ Full Page + Preview Banner |
| **Pending** | Admin | ❌ None | ✅ Full Page + Status Banner |
| **Pending** | Admin | ✅ Valid | ✅ Full Page + Preview Banner |
| **Draft** | Public | N/A | 🚫 404 Error |
| **Draft** | Public | ❌ Token | 🚫 404 Error (tokens don't work) |
| **Draft** | Creator | N/A | ℹ️ Draft Info Page |
| **Draft** | Admin | N/A | ℹ️ Draft Info Page |

---

## Visual Verification

### Banner Appearance

**Preview Banner (Yellow):**
- Background: Light yellow (`bg-yellow-50`)
- Border: Yellow (`border-yellow-200`)
- Icon: Lock in yellow circle
- Text: Dark yellow (`text-yellow-900`)
- Badge: "Pending" with yellow outline

**Status Banner (Blue):**
- Background: Light blue (`bg-blue-50`)
- Border: Blue (`border-blue-200`)
- Icon: Alert circle in blue
- Text: Dark blue (`text-blue-900`)
- Badge: "Pending Approval" with blue outline

**Error Pages:**
- Centered card layout
- Icon in colored circle
- Clear heading and message
- Action buttons at bottom

---

## Automated Testing

### Test Data Setup Script

```javascript
// Create test events
const testEvents = [
  {
    id: 'test-approved-event',
    status: 'approved',
    title: 'Test Approved Event'
  },
  {
    id: 'test-pending-event',
    status: 'pending',
    title: 'Test Pending Event',
    previewToken: null // Generate separately
  },
  {
    id: 'test-draft-event',
    status: 'draft',
    title: 'Test Draft Event'
  }
];
```

### Preview Token Generation

```bash
# 1. Create pending event
# 2. Generate token
curl -X POST http://localhost:5000/api/experiences/test-pending-event/generate-preview-token \
  -H "Cookie: connect.sid=..." \
  -H "Content-Type: application/json"

# 3. Save token for testing
export PREVIEW_TOKEN="<token-from-response>"

# 4. Test with token
curl -i "http://localhost:5000/api/e/test-pending-event?preview=$PREVIEW_TOKEN"
```

---

## Debug Checklist

If tests fail, check:

**Backend Issues:**
- [ ] Event exists in database
- [ ] Status field is correct (approved/pending/draft)
- [ ] Preview token matches exactly (64 hex chars)
- [ ] Creator ID matches authenticated user
- [ ] Admin email is `timtheeuwsen@gmail.com`
- [ ] Development fallbacks active (`NODE_ENV=development`)

**Frontend Issues:**
- [ ] Query key includes preview token if present
- [ ] Status detection logic correct
- [ ] Error response parsing works
- [ ] Test IDs present on all elements
- [ ] Console shows no errors

**Network Issues:**
- [ ] Server running on correct port
- [ ] No CORS errors in console
- [ ] Cookies being sent with requests
- [ ] Session persisting correctly

---

## Development vs Production

### Development Mode (Current)
```typescript
const userId = process.env.NODE_ENV === 'development' 
  ? '45788955'  // Hardcoded for testing
  : req.user?.claims?.sub;

const userEmail = process.env.NODE_ENV === 'development'
  ? 'timtheeuwsen@gmail.com'  // Admin for testing
  : req.user?.claims?.email;
```

**Testing as Different Users:**
- Currently always authenticated as admin in development
- To test public access: temporarily comment out fallbacks
- Or test directly via unauthenticated API calls

### Production Mode
- Uses real Replit Auth
- Session-based authentication
- User context from `req.user.claims`
- No fallback values

---

## Quick Test Commands

```bash
# 1. Approved Event (Should work)
curl -i http://localhost:5000/e/exp-admin-published-demo

# 2. Non-existent Event (Should 404)
curl -i http://localhost:5000/e/fake-event-123

# 3. Generate Preview Token (Need auth)
curl -X POST http://localhost:5000/api/experiences/{id}/generate-preview-token \
  -H "Cookie: connect.sid=YOUR_SESSION"

# 4. Test with Preview Token
curl -i "http://localhost:5000/e/{id}?preview=TOKEN_HERE"

# 5. Check Event Status
curl http://localhost:5000/api/experiences/{id} | jq '.status'
```

---

## Success Criteria

All tests pass when:

✅ **Approved events** are publicly accessible
✅ **Pending events** require token OR creator/admin access
✅ **Draft events** only accessible to creator/admin
✅ **Preview tokens** work correctly for pending events
✅ **Preview tokens** don't work for draft events
✅ **404 errors** shown for unauthorized access
✅ **Banners** display correctly based on context
✅ **Error pages** are user-friendly
✅ **No information leakage** about restricted events
✅ **Backend and frontend** access control aligned

---

## Related Documentation

- [Backend Access Control](./ACCESS_CONTROL.md)
- [Frontend Access Control](./FRONTEND_ACCESS_CONTROL.md)
- [Event Data API](./EVENT_DATA_API.md)
- [Public Event Page](./PUBLIC_EVENT_PAGE.md)
