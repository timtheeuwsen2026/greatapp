# Experience Access Control System

## Overview

This document describes the complete access control system for experiences (events) in the Great. platform. The system implements status-based visibility with preview token support for secure sharing of pending experiences.

## Access Control Rules

### 1. **APPROVED Experiences** 
**Status:** `approved` or `published`

✅ **Publicly accessible to everyone**
- No authentication required
- No preview token required
- Visible in public listings
- Full public access to all details

**Use Cases:**
- Live, published events ready for bookings
- Events that have passed admin review
- Default public experience pages

---

### 2. **PENDING Experiences**
**Status:** `pending` or `pending_approval`

🔒 **Restricted access with two authorization methods:**

#### Method A: Valid Preview Token
- Anyone with the correct preview token can view
- Token passed as query parameter: `?preview={token}`
- Enables secure sharing before public launch
- Creator/admin can generate preview links

#### Method B: Creator or Admin Access
- Experience creator can always view their own pending experiences
- Admins (email: `timtheeuwsen@gmail.com`) can view all pending experiences
- No preview token required for creator/admin

**Authorization Flow:**
```
Is experience pending?
  └─> Yes
      ├─> Has valid preview token? → ALLOW
      ├─> Is creator? → ALLOW
      ├─> Is admin? → ALLOW
      └─> Otherwise → DENY (404 Not Found)
```

**Use Cases:**
- Sharing draft experiences with stakeholders for feedback
- Creator preview before submission
- Admin review process

---

### 3. **DRAFT Experiences**
**Status:** `draft`

🔐 **Highly restricted - Creator/Admin only**

- **Preview tokens DO NOT work** for draft experiences
- Only the experience creator can access
- Admins can access for support purposes
- Hidden from all public endpoints

**Authorization Flow:**
```
Is experience draft?
  └─> Yes
      ├─> Is creator? → ALLOW
      ├─> Is admin? → ALLOW
      └─> Otherwise → DENY (404 Not Found)
```

**Use Cases:**
- Experience creation in progress
- Incomplete experiences
- Private workspace for creators

---

## API Endpoints

### GET `/api/experiences`
**Purpose:** List public experiences

**Default Behavior:**
- Returns `approved` experiences by default
- Can override with `?status=published` or `?status=draft` (for authenticated users)

**Query Parameters:**
- `category` (optional): Filter by experience category
- `status` (optional): Filter by status (default: `approved`)
- `limit` (optional): Limit number of results

**Access Control:**
- Only returns experiences matching the requested status
- Non-approved experiences excluded from default listings

---

### GET `/api/experiences/:id`
**Purpose:** Fetch single experience by ID

**Access Control:**
- Implements full status-based visibility rules
- Checks preview token via `?preview={token}` query parameter
- Validates creator/admin permissions

**Response:**
- Returns experience data with stats, bookings, and reviews
- Returns 404 if access denied

**Authentication (Development):**
- Uses hardcoded fallback: `userId='45788955'`, `email='timtheeuwsen@gmail.com'`
- Production uses real authenticated session

---

### GET `/api/e/:slugOrId`
**Purpose:** Fetch experience by slug or ID (public-facing endpoint)

**Access Control:**
- Same rules as `/api/experiences/:id`
- Tries slug lookup first, then ID fallback
- Returns enhanced response with venue, creator, and related data

**Special Features:**
- Includes venue information if linked
- Includes creator profile
- Calculates duration automatically
- Returns gallery, amenities, and services

---

### POST `/api/experiences/:id/generate-preview-token`
**Purpose:** Generate preview token for pending experiences

**Authorization Required:**
- Must be authenticated
- Must be experience creator OR admin

**Validation:**
- Only works for `pending` or `pending_approval` status
- Returns error for draft or approved experiences

**Response:**
```json
{
  "previewToken": "64-char-hex-string",
  "previewUrl": "https://domain.com/experience/{id}?preview={token}",
  "message": "Preview link generated successfully..."
}
```

**Implementation Details:**
- Generates cryptographically secure random token (32 bytes → 64 hex chars)
- Stores token in `experiences.previewToken` field
- Token is checked in access control logic

---

## Preview Token Validation

### Where Tokens Are Validated

**Location:** `server/routes.ts`

**Endpoints:**
1. `GET /api/experiences/:id` (lines 899-906)
2. `GET /api/e/:slugOrId` (lines 1060-1066)

### Validation Logic

```typescript
// 1. Extract preview token from query params
const previewToken = req.query.preview as string;

// 2. Check if experience is in pending status
const isPendingStatus = experience.status === "pending" || 
                        experience.status === "pending_approval";

// 3. Validate token matches stored token
const hasValidPreviewToken = 
  isPendingStatus &&           // Must be pending
  previewToken &&              // Token must be provided
  experience.previewToken &&   // Token must exist in DB
  previewToken === experience.previewToken; // Exact match required
```

### Security Considerations

✅ **Secure:**
- Cryptographically random tokens (32 bytes)
- Token comparison uses strict equality
- Tokens only work for pending status
- No tokens for draft experiences (prevents accidental exposure)

⚠️ **Important Notes:**
- Tokens are stored in plain text in database (sufficient for preview use case)
- Tokens persist across multiple uses (shareable links)
- No expiration implemented (tokens valid until experience status changes)
- Changing experience status to non-pending invalidates the token

---

## Unauthorized Access Handling

### Response Pattern

**All access denials return:**
```http
HTTP 404 Not Found
{
  "message": "Experience not found"
}
```

**Why 404 instead of 403?**
- Prevents information leakage
- Doesn't confirm experience exists
- Standard behavior for non-existent resources
- Better security posture

### Logging

Access denials are logged with context:
```javascript
console.log(`[Experience ${id}] Access denied - {reason}`);
```

**Log Examples:**
- `Access denied - Draft only visible to creator/admin`
- `Access denied - Pending requires preview token or creator/admin`
- `Access denied - Invalid status: {status}`

---

## Authentication Context

### Development Mode
```typescript
const userId = process.env.NODE_ENV === 'development' 
  ? '45788955' 
  : req.user?.claims?.sub;

const userEmail = process.env.NODE_ENV === 'development' 
  ? 'timtheeuwsen@gmail.com' 
  : req.user?.claims?.email;
```

**Purpose:**
- Enables testing without full auth setup
- Provides consistent admin access in development
- Mirrors production behavior

### Production Mode
- Uses Replit Auth OpenID Connect
- Session-based authentication via Passport.js
- User data extracted from `req.user.claims`
- Admin identified by email match

---

## Implementation Checklist

✅ **Completed:**
- [x] Status-based visibility for approved/pending/draft
- [x] Preview token validation for pending experiences
- [x] Creator/admin bypass for restricted content
- [x] Secure token generation endpoint
- [x] Development mode authentication fallback
- [x] Consistent 404 responses for access denial
- [x] Access control logging for debugging
- [x] Public list endpoint defaults to approved status

---

## Testing Access Control

### Test Scenarios

**1. Public User - Approved Experience**
```bash
GET /api/experiences/{approved-id}
Expected: 200 OK (experience data)
```

**2. Public User - Draft Experience**
```bash
GET /api/experiences/{draft-id}
Expected: 404 Not Found
```

**3. Public User - Pending Experience (No Token)**
```bash
GET /api/experiences/{pending-id}
Expected: 404 Not Found
```

**4. Public User - Pending Experience (Valid Token)**
```bash
GET /api/experiences/{pending-id}?preview={valid-token}
Expected: 200 OK (experience data)
```

**5. Creator - Own Draft Experience**
```bash
GET /api/experiences/{draft-id}
Headers: Cookie: {auth-session}
Expected: 200 OK (experience data)
```

**6. Creator - Own Pending Experience (No Token)**
```bash
GET /api/experiences/{pending-id}
Headers: Cookie: {auth-session}
Expected: 200 OK (experience data)
```

**7. Admin - Any Experience**
```bash
GET /api/experiences/{any-id}
Headers: Cookie: {admin-auth-session}
Expected: 200 OK (experience data)
```

---

## Flow Diagrams

### Experience Access Decision Flow

```
Request: GET /api/experiences/:id
           ↓
    Experience exists?
           ↓ Yes
    Extract user context
    (userId, email, isAdmin, isCreator)
           ↓
    Is experience APPROVED?
           ↓ Yes              ↓ No
        ALLOW              Is DRAFT?
                               ↓ Yes            ↓ No (PENDING)
                           Is creator/admin?    Has valid token OR creator/admin?
                               ↓ Yes  ↓ No         ↓ Yes            ↓ No
                              ALLOW  DENY        ALLOW            DENY
                                                                    ↓
                                                            404 Not Found
```

### Preview Token Generation Flow

```
Request: POST /api/experiences/:id/generate-preview-token
                    ↓
            Is authenticated?
                    ↓ No → 401 Unauthorized
                    ↓ Yes
            Experience exists?
                    ↓ No → 404 Not Found
                    ↓ Yes
            Is creator OR admin?
                    ↓ No → 403 Forbidden
                    ↓ Yes
            Is status PENDING?
                    ↓ No → 400 Bad Request
                    ↓ Yes
            Generate secure token
                    ↓
            Update experience.previewToken
                    ↓
            Return preview URL
```

---

## Related Files

- **Implementation:** `server/routes.ts` (lines 867-1100+)
- **Schema:** `shared/schema.ts` (experiences table, line 308)
- **Storage:** `server/storage.ts` (getExperience, updateExperience methods)
- **Auth:** `server/replitAuth.ts` (authentication setup)

---

## Future Enhancements

**Potential Improvements:**
- [ ] Token expiration (e.g., 7 days after generation)
- [ ] Token revocation endpoint
- [ ] Rate limiting on preview token generation
- [ ] Audit log for preview link usage
- [ ] Role-based access control (RBAC) expansion
- [ ] IP-based access restrictions for sensitive content
