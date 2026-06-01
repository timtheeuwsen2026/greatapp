# Access Control System - Complete Summary

## Overview

The Great. platform implements a comprehensive status-based access control system for events/experiences with three distinct states (Draft, Pending, Approved) and intelligent preview token support.

---

## 🎯 Core Principles

1. **Security First:** Backend enforces all access rules; frontend trusts backend completely
2. **User-Friendly Errors:** 404 responses prevent information leakage
3. **Flexible Preview:** Secure preview tokens enable stakeholder review before public launch
4. **Creator Control:** Creators always access their own content at any status

---

## 📊 Status-Based Access Rules

### ✅ **APPROVED / PUBLISHED**
**Status:** `approved` or `published`

**Access:**
- ✅ Public (everyone)
- ✅ No authentication required
- ✅ Visible in public listings

**Frontend UI:**
- Full public event page
- All 12 sections visible
- "Book Now" CTA buttons
- No restrictions or banners

**Use Case:** Live events ready for bookings

---

### 🟡 **PENDING / PENDING_APPROVAL**
**Status:** `pending` or `pending_approval`

**Access:**
- 🔓 Valid preview token → Anyone
- 🔓 Event creator → Direct access
- 🔓 Admin → Direct access
- 🔒 Public (no token) → Denied (404)

**Frontend UI (With Token):**
- Yellow preview banner at top
- Full event content below
- Badge: "Pending"

**Frontend UI (Creator/Admin, No Token):**
- Blue status banner at top
- Full event content below
- Badge: "Pending Approval"

**Use Case:** Stakeholder review, feedback collection, creator preview

---

### 📝 **DRAFT**
**Status:** `draft`

**Access:**
- 🔓 Event creator → Special draft page
- 🔓 Admin → Special draft page
- 🔒 Public → Denied (404)
- 🔒 Preview tokens → Don't work (security)

**Frontend UI (Creator/Admin):**
- Draft information page
- "This event is not yet published" message
- Event title display
- "Continue Editing" button
- "Go to Dashboard" button

**Use Case:** Work in progress, incomplete events

---

## 🔐 Preview Token System

### How It Works

1. **Generation:**
   ```bash
   POST /api/experiences/{id}/generate-preview-token
   ```
   - Requires authentication (creator or admin)
   - Only works for pending status
   - Returns 64-char hex token

2. **Usage:**
   ```
   /e/{id}?preview={token}
   ```
   - Token passed as URL query parameter
   - Validated on backend
   - Grants temporary access

3. **Security:**
   - Cryptographically random (32 bytes)
   - Exact string match required
   - Only works for pending status
   - No expiration (valid until status changes)

### Token Validation

**Backend Logic:**
```typescript
const isPendingStatus = 
  experience.status === "pending" || 
  experience.status === "pending_approval";

const hasValidPreviewToken = 
  isPendingStatus &&               // Must be pending
  previewToken &&                  // Token provided
  experience.previewToken &&       // Token exists in DB
  previewToken === experience.previewToken; // Exact match
```

**Frontend Handling:**
```typescript
// Extract token from URL
const previewToken = searchParams.get('preview');

// Include in API request
const queryKey = previewToken 
  ? [`/api/e/${slugOrId}?preview=${previewToken}`]
  : ["/api/e", slugOrId];
```

---

## 🚨 Error Handling

### Backend Responses

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Public → Approved | 200 OK | Full data |
| Token → Pending | 200 OK | Full data |
| Creator → Own Event | 200 OK | Full data (any status) |
| Admin → Any Event | 200 OK | Full data (any status) |
| Public → Draft | 404 Not Found | `{ message: "Not Found" }` |
| Public → Pending (no token) | 404 Not Found | `{ message: "Not Found" }` |
| Invalid token | 404 Not Found | `{ message: "Not Found" }` |
| Non-existent event | 404 Not Found | `{ message: "Not Found" }` |

### Frontend Error States

**404 - Not Found:**
```
📄 Event Not Found

This event doesn't exist, is not yet published, 
or you don't have permission to view it.

[Browse Events]
```

**401/403 - Unauthorized:**
```
🔒 Access Restricted

You don't have permission to view this event. 
It may require a preview token or authentication.

[Browse Public Events]
```

**Generic Error:**
```
⚠️ Something Went Wrong

We couldn't load this event. Please try again later.

[Try Again] [Browse Events]
```

---

## 🎨 Visual Indicators

### Preview Banner (Pending + Token)
```
┌─────────────────────────────────────────────────┐
│ 🔒 Preview Mode — This event is pending         │
│ approval and not yet public. You're viewing     │
│ it with a preview token.              [Pending] │
└─────────────────────────────────────────────────┘
```
**Colors:** Yellow theme (`bg-yellow-50`)

### Status Banner (Pending, Creator/Admin)
```
┌─────────────────────────────────────────────────┐
│ ℹ️  This event is pending approval. It's not    │
│ yet visible to the public.  [Pending Approval]  │
└─────────────────────────────────────────────────┘
```
**Colors:** Blue theme (`bg-blue-50`)

### Draft Page (Creator/Admin)
```
┌─────────────────────────────────────────────────┐
│ 🔒 This event is not yet published              │
│                                                 │
│ This is a draft event that's still being        │
│ created. Only you (the creator) and             │
│ administrators can view it.                     │
│                                                 │
│ Event Title: "Summer Wellness Retreat"          │
│                                                 │
│ [Continue Editing] [Go to Dashboard]            │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Access Flow Diagrams

### Approved Event
```
User visits /e/{approved-id}
         ↓
Backend: Status = approved → 200 OK
         ↓
Frontend: Full public page
```

### Pending Event (With Token)
```
User visits /e/{pending-id}?preview={token}
         ↓
Backend: Validates token → 200 OK
         ↓
Frontend: Yellow banner + Full page
```

### Pending Event (No Token, Public)
```
User visits /e/{pending-id}
         ↓
Backend: No token, not creator → 404
         ↓
Frontend: "Event Not Found" error
```

### Draft Event (Creator)
```
Creator visits /e/{draft-id}
         ↓
Backend: Recognizes creator → 200 OK
         ↓
Frontend: Draft info page
```

---

## 📁 File Structure

### Backend
```
server/routes.ts
├── GET /api/e/:slugOrId (lines 1037-1160)
│   ├── Fetch by slug or ID
│   ├── Access control validation
│   ├── Preview token check
│   └── Return 200 or 404
│
└── POST /api/experiences/:id/generate-preview-token
    ├── Validate creator/admin
    ├── Check pending status
    ├── Generate secure token
    └── Return token + URL
```

### Frontend
```
client/src/pages/public-event-page.tsx
├── Preview token extraction from URL
├── Query with token if present
├── Error state handling (404/401/500)
├── Draft status page (creator/admin)
├── Preview banner (pending + token)
├── Status banner (pending + creator)
└── Full public page (approved)
```

### Documentation
```
docs/
├── ACCESS_CONTROL.md              # Backend rules
├── FRONTEND_ACCESS_CONTROL.md     # Frontend implementation
├── ACCESS_CONTROL_TESTING.md      # Testing guide
├── ACCESS_CONTROL_SUMMARY.md      # This file
├── EVENT_DATA_API.md              # API reference
└── PUBLIC_EVENT_PAGE.md           # Page structure
```

---

## ✅ Implementation Checklist

**Backend:**
- [x] Status-based visibility (approved/pending/draft)
- [x] Preview token validation for pending
- [x] Creator/admin bypass
- [x] Secure token generation endpoint
- [x] Development mode auth fallback
- [x] Consistent 404 for unauthorized
- [x] Access logging for debugging

**Frontend:**
- [x] Preview token URL extraction
- [x] Conditional rendering by status
- [x] Error state handling (404/401/500)
- [x] Draft information page
- [x] Preview banner (yellow)
- [x] Status banner (blue)
- [x] User-friendly error messages
- [x] Comprehensive test IDs

**Documentation:**
- [x] Backend access control rules
- [x] Frontend implementation guide
- [x] Testing procedures
- [x] API documentation
- [x] Complete summary

---

## 🧪 Quick Test Matrix

| User | Event | Token | Expected |
|------|-------|-------|----------|
| Public | Approved | - | ✅ Full Page |
| Public | Pending | ❌ | 🚫 404 |
| Public | Pending | ✅ | ✅ Page + Yellow Banner |
| Public | Draft | - | 🚫 404 |
| Creator | Own Pending | ❌ | ✅ Page + Blue Banner |
| Creator | Own Draft | - | ℹ️ Draft Page |
| Admin | Any | - | ✅ Full Access |

---

## 🔒 Security Features

✅ **Implemented:**
- Backend-enforced access control
- Preview tokens validated server-side
- 404 for all unauthorized (no info leakage)
- Cryptographically secure tokens
- Draft events completely hidden
- No client-side permission checks

⚠️ **Important Notes:**
- Frontend trusts backend completely
- Error messages intentionally vague
- Tokens stored plain text (sufficient for use case)
- No token expiration (valid until status changes)
- Development mode has hardcoded admin

---

## 📚 Usage Examples

### Generate Preview Token
```javascript
// Backend API call
const response = await fetch(
  `/api/experiences/${eventId}/generate-preview-token`,
  { method: 'POST', credentials: 'include' }
);

const { previewToken, previewUrl } = await response.json();
// Share previewUrl with stakeholders
```

### Share Preview Link
```
Email to stakeholder:
"Review our upcoming event here:
https://great.replit.app/e/summer-retreat-2024?preview=abc123..."
```

### Frontend Status Check
```typescript
if (event.status === 'draft') {
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
```

---

## 🎯 Key Takeaways

1. **Three Status Levels:** Draft → Pending → Approved
2. **Preview Tokens:** Enable secure sharing of pending events
3. **Backend Authority:** All access decisions made server-side
4. **User-Friendly UI:** Clear messages, helpful error states
5. **Security Focus:** 404 for unauthorized, no info leakage
6. **Creator Control:** Always access own content
7. **Admin Override:** Full access to everything

---

## 🚀 Next Steps

**For Production:**
- [ ] Add token expiration (optional)
- [ ] Token revocation endpoint
- [ ] Rate limiting on token generation
- [ ] Audit log for preview usage
- [ ] Enhanced RBAC system
- [ ] Social preview cards

**For Testing:**
- [ ] Run complete test matrix
- [ ] Verify all error states
- [ ] Test with real auth (non-development)
- [ ] Load test preview tokens
- [ ] Security audit

**For UX:**
- [ ] "Request Access" form
- [ ] Preview watermarks
- [ ] Sharing analytics
- [ ] Admin approval actions in banner
