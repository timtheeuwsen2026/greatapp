# Frontend Access Control Implementation

## Overview

The Public Event Page (`/e/:slugOrId`) implements comprehensive conditional rendering based on event status (draft, pending, approved) with proper error handling and user-friendly messages.

## Status-Based UI States

### 1. ✅ **APPROVED / PUBLISHED** 
**Status:** `approved` or `published`

**Behavior:**
- Shows complete public event page
- All 12 sections visible
- No restrictions or banners
- Public access for everyone

**UI:**
```
✓ Full event page with all sections
✓ Hero section with "Book Now" CTA
✓ All content visible
```

---

### 2. 🟡 **PENDING / PENDING_APPROVAL**
**Status:** `pending` or `pending_approval`

**Behavior depends on access method:**

#### A. **With Valid Preview Token** (`?preview={token}`)
- Shows yellow preview banner at top
- Displays full event content below banner
- Banner text: "Preview Mode — This event is pending approval and not yet public. You're viewing it with a preview token."
- Badge shows "Pending"

**UI:**
```
┌─────────────────────────────────────────────┐
│ 🔒 Preview Mode Banner (Yellow)             │
│ "You're viewing with a preview token"       │
└─────────────────────────────────────────────┘
     ↓
Full Event Page Content
```

#### B. **Creator/Admin Access** (No Token)
- Shows blue status banner at top
- Displays full event content below banner
- Banner text: "This event is pending approval. It's not yet visible to the public."
- Badge shows "Pending Approval"

**UI:**
```
┌─────────────────────────────────────────────┐
│ ℹ️  Status Banner (Blue)                     │
│ "Not yet visible to the public"             │
└─────────────────────────────────────────────┘
     ↓
Full Event Page Content
```

#### C. **No Token + Not Creator/Admin**
- Backend returns 404
- Shows "Event Not Found" error page
- Suggests browsing public events

---

### 3. 📝 **DRAFT**
**Status:** `draft`

**Behavior depends on access:**

#### A. **Creator/Admin Access**
- Shows special draft information page
- Displays event title (if available)
- Provides action buttons:
  - "Continue Editing" → Event Builder
  - "Go to Dashboard" → Creator Dashboard
- Message: "This event is not yet published"

**UI:**
```
┌─────────────────────────────────────────────┐
│ 🔒 This event is not yet published          │
│                                             │
│ This is a draft event that's still being    │
│ created. Only you (the creator) and         │
│ administrators can view it.                 │
│                                             │
│ [Continue Editing] [Go to Dashboard]        │
└─────────────────────────────────────────────┘
```

#### B. **Not Creator/Admin**
- Backend returns 404
- Shows "Event Not Found" error page

---

## Error States

### 🚫 **404 - Not Found**
**Triggers:**
- Event doesn't exist
- Draft event (non-creator/admin access)
- Pending event without valid token (non-creator/admin)

**UI:**
```
┌─────────────────────────────────────────────┐
│        📄 Event Not Found                   │
│                                             │
│ This event doesn't exist, is not yet        │
│ published, or you don't have permission     │
│ to view it.                                 │
│                                             │
│         [Browse Events]                     │
└─────────────────────────────────────────────┘
```

**Test ID:** `error-heading-not-found`, `error-message-not-found`

---

### 🔒 **401/403 - Unauthorized**
**Triggers:**
- Explicit authorization failure
- Invalid credentials

**UI:**
```
┌─────────────────────────────────────────────┐
│        🔒 Access Restricted                 │
│                                             │
│ You don't have permission to view this      │
│ event. It may require a preview token or    │
│ authentication.                             │
│                                             │
│       [Browse Public Events]                │
└─────────────────────────────────────────────┘
```

**Test ID:** `error-heading-unauthorized`, `error-message-unauthorized`

---

### ⚠️ **Generic Error**
**Triggers:**
- Network errors
- Server errors (500, etc.)
- Unknown issues

**UI:**
```
┌─────────────────────────────────────────────┐
│        ⚠️  Something Went Wrong             │
│                                             │
│ We couldn't load this event. Please try     │
│ again later.                                │
│                                             │
│    [Try Again] [Browse Events]              │
└─────────────────────────────────────────────┘
```

**Test ID:** `error-heading-generic`, `error-message-generic`

---

## Implementation Details

### Preview Token Handling

**URL Format:**
```
/e/{slugOrId}?preview={64-char-hex-token}
```

**Code:**
```typescript
// Extract preview token from URL
const searchParams = new URLSearchParams(location.split('?')[1] || '');
const previewToken = searchParams.get('preview');

// Build query key with token
const queryKey = previewToken 
  ? [`/api/e/${slugOrId}?preview=${previewToken}`]
  : ["/api/e", slugOrId];

// Pass to query
const { data: event, isLoading, error } = useQuery<PublicEventData>({
  queryKey,
  enabled: !!slugOrId,
});
```

### Status Detection

```typescript
// Check event status
const isPending = event.status === 'pending' || event.status === 'pending_approval';
const isApproved = event.status === 'approved' || event.status === 'published';
const isDraft = event.status === 'draft';

// Determine UI to show
if (isDraft) {
  return <DraftInfoPage />;
}

if (isPending && previewToken) {
  return (
    <>
      <PreviewBanner />
      <FullEventPage />
    </>
  );
}

if (isApproved) {
  return <FullEventPage />;
}
```

### Error Response Handling

```typescript
if (error || !event) {
  const errorResponse = error as any;
  const status = errorResponse?.response?.status;
  const errorMessage = errorResponse?.response?.data?.message;

  // Handle different HTTP status codes
  if (status === 404) return <NotFoundPage />;
  if (status === 401 || status === 403) return <UnauthorizedPage />;
  return <GenericErrorPage message={errorMessage} />;
}
```

---

## Visual Design

### Banner Colors

**Preview Banner (Pending + Token):**
- Background: `bg-yellow-50`
- Border: `border-yellow-200`
- Icon background: `bg-yellow-100`
- Text: `text-yellow-900`
- Badge: Yellow with outline

**Status Banner (Pending, No Token):**
- Background: `bg-blue-50`
- Border: `border-blue-200`
- Icon background: `bg-blue-100`
- Text: `text-blue-900`
- Badge: Blue with outline

**Error States:**
- Not Found: Gray theme with FileX icon
- Unauthorized: Yellow theme with Lock icon
- Generic Error: Red theme with AlertCircle icon
- Draft Info: Blue theme with Lock icon

---

## Test IDs Reference

### Error Pages
- `error-heading-not-found` - 404 heading
- `error-message-not-found` - 404 message
- `error-heading-unauthorized` - 401/403 heading
- `error-message-unauthorized` - 401/403 message
- `error-heading-generic` - Generic error heading
- `error-message-generic` - Generic error message
- `button-browse-events` - Browse events button (404)
- `button-browse-events-unauthorized` - Browse button (401/403)
- `button-browse-events-error` - Browse button (error)
- `button-retry` - Try again button

### Draft Page
- `draft-heading` - Draft page heading
- `draft-message` - Draft page message
- `button-continue-editing` - Continue editing button
- `button-dashboard` - Go to dashboard button

### Preview/Status Banners
- `preview-banner` - Preview mode banner container
- `preview-banner-text` - Preview banner text
- `status-banner-pending` - Pending status banner
- `status-banner-text` - Status banner text

---

## Backend Alignment

The frontend states directly align with backend access control:

| Backend Response | Frontend State |
|-----------------|----------------|
| 200 + status='approved' | Full public page |
| 200 + status='pending' + token | Preview banner + full page |
| 200 + status='pending' (creator) | Status banner + full page |
| 200 + status='draft' (creator) | Draft info page |
| 404 (any unauthorized) | Not found error |
| 401/403 | Unauthorized error |
| 500/other | Generic error |

**Backend automatically returns:**
- 404 for draft (if not creator/admin)
- 404 for pending without valid token (if not creator/admin)
- 200 with data for approved (public)
- 200 with data for creator/admin (any status)

---

## User Journey Examples

### ✅ **Public User → Approved Event**
```
1. Visit: /e/summer-retreat-2024
2. Backend: Returns 200 with full data
3. Frontend: Shows complete public page
4. User: Can book immediately
```

### 🟡 **Creator → Own Pending Event**
```
1. Visit: /e/my-pending-event
2. Backend: Recognizes creator, returns 200
3. Frontend: Shows blue status banner + full page
4. User: Can preview how it will look when approved
```

### 🔗 **Stakeholder → Pending Event with Token**
```
1. Visit: /e/pending-event?preview=abc123...
2. Backend: Validates token, returns 200
3. Frontend: Shows yellow preview banner + full page
4. User: Can review event before approval
```

### 🚫 **Public User → Pending Event (No Token)**
```
1. Visit: /e/pending-event
2. Backend: No token, not creator → 404
3. Frontend: Shows "Event Not Found" page
4. User: Redirected to browse public events
```

### 📝 **Creator → Own Draft**
```
1. Visit: /e/my-draft-event
2. Backend: Recognizes creator, returns 200
3. Frontend: Shows draft info page
4. User: Can continue editing or go to dashboard
```

### ❌ **Public User → Draft Event**
```
1. Visit: /e/draft-event
2. Backend: Not creator → 404
3. Frontend: Shows "Event Not Found" page
4. User: No indication draft exists (security)
```

---

## Security Considerations

✅ **Implemented:**
- Preview tokens validated on backend (not just frontend)
- Draft events completely hidden from unauthorized users
- 404 responses for all unauthorized access (prevents info leakage)
- No client-side token generation
- Token passed via URL query parameter (shareable links)

⚠️ **Important:**
- Frontend trusts backend access control completely
- No client-side permission checks (backend is source of truth)
- Error messages intentionally vague for unauthorized access
- Draft status never leaked to non-authorized users

---

## Testing Checklist

### Manual Testing

**Approved Event:**
- [ ] Visit `/e/{approved-id}` → Full page loads
- [ ] No banners shown
- [ ] All sections visible
- [ ] "Book Now" button present

**Pending Event - With Token:**
- [ ] Visit `/e/{pending-id}?preview={token}` → Full page loads
- [ ] Yellow preview banner shown
- [ ] All content visible below banner
- [ ] Token in URL

**Pending Event - No Token (Public):**
- [ ] Visit `/e/{pending-id}` → 404 error page
- [ ] "Event Not Found" message
- [ ] "Browse Events" button works

**Pending Event - Creator Access:**
- [ ] Creator visits `/e/{own-pending-id}` → Full page loads
- [ ] Blue status banner shown
- [ ] All content visible

**Draft Event - Creator Access:**
- [ ] Creator visits `/e/{own-draft-id}` → Draft info page
- [ ] "This event is not yet published" message
- [ ] "Continue Editing" button works
- [ ] "Go to Dashboard" button works

**Draft Event - Public:**
- [ ] Visit `/e/{draft-id}` → 404 error page
- [ ] No indication event exists

**Error Handling:**
- [ ] Invalid ID → 404 page
- [ ] Network error → Generic error with retry
- [ ] Invalid token → 404 page

---

## Related Files

**Implementation:**
- `client/src/pages/public-event-page.tsx` - Main component
- `server/routes.ts` - Backend access control (line 1037-1160)

**Documentation:**
- `docs/ACCESS_CONTROL.md` - Backend access control rules
- `docs/EVENT_DATA_API.md` - API documentation
- `docs/PUBLIC_EVENT_PAGE.md` - Page structure

**Schema:**
- `shared/schema.ts` - Experience model with status field

---

## Future Enhancements

**Potential Improvements:**
- [ ] Token expiration indicators
- [ ] "Request Access" form for pending events
- [ ] Social sharing preview cards
- [ ] Admin actions in status banner (approve/reject)
- [ ] Preview mode watermark
- [ ] Analytics tracking for preview link usage
