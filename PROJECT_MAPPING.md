# Great. Platform - Complete Codebase Mapping

## Table of Contents
1. [Trip Creation System](#trip-creation-system)
2. [Venue Listing System](#venue-listing-system)
3. [Shared Resources](#shared-resources)

---

# TRIP CREATION SYSTEM

## Database Layer

### Schema Definitions
**File:** `shared/schema.ts`

| Table | Lines | Purpose |
|-------|-------|---------|
| `experiences` | 348-498 | Main trip/experience table with MVG settings, pricing, dates, capacity, status tracking |
| `experienceDrafts` | 194-268 | Auto-save drafts for trip builder, preserves creator's work-in-progress |
| `bookings` | 501-519 | Booking records with deposit tracking, Stripe payment intent IDs, status management |
| `reservations` | 522-572 | Soft-hold reservation system with expiry timers |
| `experienceGallery` | 575-582 | Media attachments (photos, videos) for experiences |
| `experienceVenues` | 760-777 | Link between experiences and venues (many-to-many) |
| `experienceServices` | 780-797 | Services offered during an experience |
| `experienceAmenities` | 800-817 | Amenities available for an experience |
| `experienceMessages` | 1086-1094 | Chat messages between participants (community building) |
| `experienceAnnouncements` | 1097-1106 | Admin/creator announcements for experiences |

### Zod Schemas
**File:** `shared/schema.ts`

| Schema | Lines | Purpose |
|--------|-------|---------|
| `insertExperienceSchema` | 1131+ | Validation for creating/updating experiences |
| `insertBookingSchema` | 1141+ | Validation for booking creation |
| `insertExperienceDraftSchema` | 1168+ | Validation for draft saving |
| `insertReservationSchema` | 1175+ | Validation for reservations |

---

## Backend - API Layer

**File:** `server/routes.ts`

### Experience Draft Endpoints

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/experience-drafts` | GET | 358 | Fetch all drafts for authenticated creator |
| `/api/experience-drafts` | POST | 369 | Create new draft with auto-save |
| `/api/experience-drafts/:id` | PUT | 399 | Update existing draft (defense in depth date normalization) |
| `/api/experience-drafts/:id` | DELETE | 431 | Delete draft |
| `/api/experience-drafts/latest` | GET | 444 | Get creator's most recent draft |
| `/api/experience-drafts/:id` | GET | 462 | Get specific draft by ID |
| `/api/experience-drafts` | DELETE | 485 | Clear all drafts (bulk delete) |
| `/api/events/saveDraft` | POST | 500 | Legacy endpoint for saving draft |
| `/api/events/updateDraft/:id` | PUT | 550 | Legacy endpoint for updating draft |

### Experience Publishing & Management

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/events/publishEvent/:id` | POST | 615 | Publish draft → pending experience (validation + status change) |
| `/api/experience-drafts/:id/publish` | POST | 1402 | Publish draft with validation checks |
| `/api/experiences` | GET | 899 | Fetch approved + published experiences (with participant preview) |
| `/api/experiences/:id` | GET | 945 | Get single experience details (full data + booking info) |
| `/api/experiences` | POST | 1587 | Create experience directly (bypasses draft system) |
| `/api/experiences/:id` | PUT | 1634 | Update published experience |
| `/api/experiences/:id/share-link` | GET | 1017 | Generate shareable link with preview token |
| `/api/experiences/:id/generate-preview-token` | POST | 1049 | Create secure preview token for pending experiences |

### Trips (MVG-Specific)

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/trips` | POST | 1839 | Create trip with MVG settings |
| `/api/trips/:id` | PUT | 1870 | Update trip |
| `/api/trips/:id/submit` | POST | 1901 | Submit trip for approval |
| `/api/trips/:id/deposit` | POST | 1972 | Create refundable deposit booking for MVG |
| `/api/trips/:id/mvg/check-success` | POST | 2119 | Manual MVG success check |
| `/api/trips/:id/mvg/check-failure` | POST | 2141 | Manual MVG failure check |

### Admin Experience Management

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/admin/experiences/pending` | GET | 1779 | Fetch pending experiences needing approval |
| `/api/admin/experiences/:id/approve` | POST | 1790 | Admin approves experience |
| `/api/admin/experiences/:id/reject` | POST | 1812 | Admin rejects experience with notes |
| `/api/admin/experiences/:id` | PATCH | 5428 | Admin patch endpoint for experience updates |

### Experience Analytics & Meta

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/experiences/:id/booking-stats` | GET | 2659 | Get booking count, capacity, confirmation rate |
| `/api/experiences/:id/mvg-progress` | GET | 2674 | Get funded amount, percent, participants |
| `/api/experiences/:id/invite-link` | GET | 2701 | Generate invite link for participants |
| `/api/experiences/:id/participants` | GET | 4116 | Get participant profiles and details |
| `/api/creator/experiences` | GET | 4178 | Get all experiences by authenticated creator |
| `/api/experiences/:id/messages` | GET/POST | 4064+ | Chat messages for experience |
| `/api/experiences/:id/announcements` | GET/POST | 4214+ | Admin announcements |

---

## Backend - Storage Layer

**File:** `server/storage.ts`

### Experience CRUD Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `createExperience()` | 316 | Insert new experience into database |
| `getExperience()` | 321 | Fetch single experience by ID |
| `getExperienceBySlug()` | 326 | Lookup experience by URL slug |
| `getExperiences()` | 331 | List experiences with filtering (category, status) |
| `getExperiencesWithParticipantPreview()` | 362-476 | Fetch experiences with enriched participant data, avatar URLs, active chatters |
| `getExperiencesByCreator()` | 478 | Get all creator's experiences |
| `getExperiencesByVenue()` | 486 | Get experiences linked to venue |
| `updateExperience()` | 502 | Update experience fields |
| `deleteExperience()` | 512 | Delete experience |

### Experience Draft Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `createExperienceDraft()` | N/A | Create draft record |
| `getExperienceDraft()` | N/A | Get draft by ID and creator |
| `getExperienceDraftsByCreator()` | N/A | Get all creator's drafts |
| `updateExperienceDraft()` | N/A | Update draft with date normalization |
| `deleteExperienceDraft()` | N/A | Delete draft |

### Experience Status Workflow

| Function | Lines | Purpose |
|----------|-------|---------|
| `getPendingExperiences()` | 516 | Get experiences awaiting admin approval |
| `getPendingExperiencesByCreator()` | 520 | Get creator's pending experiences |
| `approveExperience()` | 531 | Move experience to published state |
| `rejectExperience()` | 546 | Reject with reason, return to draft |

### MVG Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `getAllMVGExperiences()` | 938 | Get experiences with MVG enabled |
| `updateExperienceMVGStatus()` | 943 | Update mvgStatus (pending → met → failed) |
| `processMVGSuccess()` | 952 | Capture deposits, confirm all bookings, update experience |
| `processMVGFailure()` | 1012 | Refund deposits, cancel bookings, update experience |

### Booking Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `createBooking()` | 562 | Create booking record |
| `createDeposit()` | 602 | Create deposit-specific booking with Stripe payment intent |
| `getBooking()` | 567 | Get single booking |
| `getBookingsByExperience()` | 693 | Get all bookings for experience |
| `getBookingsByUser()` | 1454 | Get all user's bookings |
| `updateBookingStatus()` | 580 | Update booking status |
| `updateBookingBalancePayment()` | 589 | Set balance payment intent and due date |
| `updateBookingBalancePaid()` | 670 | Mark balance as paid |

---

## Frontend - Pages

**File:** `client/src/pages/`

| Page | File | Lines | Purpose |
|------|------|-------|---------|
| Event Builder | `event-builder.tsx` | Full | Multi-step wizard for creating experiences (main creator UI) |
| My Experiences | `my-experiences.tsx` | Full | Creator's experience dashboard (view drafts, published, approved) |
| Experience Details | `experience-details.tsx` | Full | Public experience page with booking UI, chat, participant list |
| Experiences Browse | `experiences.tsx` | Full | Homepage trip listing with filters, MVG progress |
| Public Event Page | `public-event-page.tsx` | Full | SEO-optimized public experience view with embed support |
| Checkout | `checkout.tsx` | Full | Stripe payment processing page for booking |
| Creator Dashboard | `creator-dashboard.tsx` | Full | Creator analytics, earnings, experience management |

---

## Frontend - Components

**File:** `client/src/components/`

### Event Builder Components
**File:** `client/src/components/EventBuilder/EventBuilder.tsx` (165KB - Main component)

Core step-by-step builder with:
- Step 1: Basic Info (title, description, category)
- Step 2: Media Upload (cover image, gallery)
- Step 3: Dates & MVG Settings (start/end, deadline, minimum participants)
- Step 4: Venue Selection
- Step 5: Services & Amenities
- Step 6: Roles (team roles with headcount)
- Step 7: Rooms (accommodation types)
- Step 8: Itinerary (day-by-day schedule)
- Step 9: Pricing & Revenue Splits
- Step 10: Terms & Publishing

### Experience Display Components

| Component | File | Purpose |
|-----------|------|---------|
| Experience Card | `experience-card.tsx` | Displays trip preview card with image, title, price, participants |
| Featured Experiences | `featured-experiences.tsx` | Carousel of highlighted trips |
| Join Trip Modal | `JoinTripModal.tsx` | Modal for booking with deposit UI |
| MVG Progress Widget | `funding/FundingProgressBar.tsx` | Visual progress bar for funding threshold |
| Participant Avatars | `RealParticipantAvatars.tsx` | Display participant profile pictures |
| Countdown Timer | `funding/CountdownTimer.tsx` | Shows time until MVG deadline |

### Media Management

| Component | File | Purpose |
|-----------|------|---------|
| Photo Upload | `SharedPhotoUpload.tsx` | Drag-drop uploader with S3 integration, progress tracking |
| Progressive Image | `ProgressiveImage.tsx` | Lazy-load images with blur placeholder |

---

## Frontend - Hooks

**File:** `client/src/hooks/`

| Hook | File | Purpose |
|------|------|---------|
| useDepositMutation | `useDepositMutation.ts` | Handles deposit creation mutation with payment processing |
| useRealtimeUpdates | `useRealtimeUpdates.ts` | WebSocket subscription for MVG progress updates |
| useAuth | `useAuth.ts` | Authentication state and user role management |
| useCoreWebVitals | `useCoreWebVitals.ts` | Performance monitoring |

---

## Backend - Services & Utilities

**File:** `server/payments.ts`

| Function | Lines | Purpose |
|----------|-------|---------|
| `createDepositIntent()` | 50-123 | Create Stripe PaymentIntent with manual capture for refundable deposits |
| `capturePayment()` | 139-194 | Capture deposit when MVG met (charge the card) |
| `refundPayment()` | 213-278 | Refund deposit when MVG fails or user cancels |

**File:** `shared/pricingService.ts`

| Function | Purpose |
|----------|---------|
| `calculateRevenueBreakdown()` | Compute revenue splits (platform fee, creator, venue) across all monetization models |

**File:** `server/mvg-scheduler.ts`

| Function | Lines | Purpose |
|----------|-------|---------|
| `startMVGDeadlineScheduler()` | 10 | Initialize cron job to check expired MVG deadlines every 15 min |
| `processFailedMVG()` | 50-150 | Auto-refund deposits, update bookings, send notifications |

**File:** `server/websocket.ts`

| Function | Purpose |
|----------|---------|
| `broadcastMVGUpdate()` | Send real-time MVG progress to all connected clients |

**File:** `server/notifications.ts`

| Function | Purpose |
|----------|---------|
| `sendMVGSuccessNotification()` | Notify participants when trip confirmed |
| `sendMVGFailedNotification()` | Notify participants when trip cancelled |

---

## Frontend - Utilities

**File:** `client/src/lib/`

| File | Purpose |
|------|---------|
| `queryClient.ts` | TanStack Query setup, API request helper |
| `authUtils.ts` | Auth error handling |

---

# VENUE LISTING SYSTEM

## Database Layer

### Schema Definitions
**File:** `shared/schema.ts`

| Table | Lines | Purpose |
|-------|-------|---------|
| `venues` | 700-757 | Venue profile with details, capacity, amenities, availability, status |
| `venueAvailability` | 1007-1023 | Blocked dates and soft-hold days (manual or Google sync) |
| `experienceVenues` | 760-777 | Link experiences to venues (many-to-many) |
| `venueServices` | (in venues) | Services offered by venue (pricing, frequency, quantity) |

### Zod Schemas
**File:** `shared/schema.ts`

| Schema | Purpose |
|--------|---------|
| `insertVenueSchema` | Validation for venue creation/updates |
| `insertVenueAvailabilitySchema` | Validation for blocked dates |

---

## Backend - API Layer

**File:** `server/routes.ts`

### Venue Listing & CRUD

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/venues` | GET | 3174 | Fetch all approved venues with filters (location, type) |
| `/api/venues/:slug` | GET | 3234 | Get single venue by slug (public page) |
| `/api/venues/:id/edit` | GET | 3206 | Get venue data for editing (ownership verified) |
| `/api/user/venues` | GET | 3189 | Get authenticated user's venues |
| `/api/venues` | POST | 3290 | Create new venue (with multi-step form data) |
| `/api/venues/:id` | PUT | 3412 | Update venue details and settings |
| `/api/venues/:id/submit` | PATCH | 3520 | Submit venue for admin approval |
| `/api/venues/:id` | DELETE | 3620 | Delete venue (admin or owner only) |

### Admin Venue Management

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/admin/venues` | GET | 3540+ | Get all venues (admin dashboard) |
| `/api/admin/venues/pending` | GET | 3553 | Get venues awaiting approval |
| `/api/venues/:id/approve` | PATCH | 3575 | Admin approves venue |
| `/api/venues/:id/reject` | PATCH | 3598 | Admin rejects venue with notes |
| `/api/admin/venue-availability` | GET | 3380+ | Consolidated view of all venue availability |

### Venue Availability Management

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/venues/:venueId/availability` | GET | 3653 | Get blocked dates for venue |
| `/api/venues/:venueId/availability` | POST | 3681 | Create blocked date |
| `/api/venues/availability/:id` | PUT | 3729 | Update blocked date |
| `/api/venues/availability/:id` | DELETE | 3772 | Delete blocked date |
| `/api/venues/:venueId/google-calendar` | PATCH | 3805 | Connect Google Calendar (placeholder) |

### Venue Meta & Relations

| Endpoint | Method | Lines | Purpose |
|----------|--------|-------|---------|
| `/api/venues/:venueId/experiences` | GET | 3279 | Get all experiences linked to venue |
| `/api/venues/available` | GET | 3954 | Get venues with availability (for trip builder selector) |
| `/api/experiences/:id/venues` | POST | 3998 | Link venue to experience |

---

## Backend - Storage Layer

**File:** `server/storage.ts`

### Venue CRUD Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `createVenue()` | 1111 | Insert new venue |
| `getVenue()` | 1116 | Fetch venue by ID |
| `getVenueBySlug()` | 1121 | Lookup venue by URL slug |
| `getVenues()` | 1126 | List venues with filtering (location, type, approved status) |
| `getVenuesWithCreators()` | 1154 | Fetch venues with owner details (admin) |
| `getVenuesByCreator()` | 1187 | Get creator's venues |
| `updateVenue()` | 1191 | Update venue details |
| `deleteVenue()` | 1200 | Delete venue |
| `updateVenueDisplayPrefs()` | 1204 | Update UI preferences (services placement) |

### Venue Approval Workflow

| Function | Lines | Purpose |
|----------|-------|---------|
| `getPendingVenues()` | 1213 | Get venues awaiting approval |
| `approveVenue()` | 1217 | Move venue to approved state |
| `rejectVenue()` | 1233 | Reject with reason |
| `updateVenueStatus()` | 1249 | Update venue status field |

### Venue Availability Operations

| Function | Lines | Purpose |
|----------|-------|---------|
| `createVenueAvailability()` | 1259 | Create blocked date |
| `getVenueAvailability()` | 1267 | Get all blocked dates for venue |
| `getVenueAvailabilityById()` | 1275 | Get single availability record |
| `updateVenueAvailability()` | 1284 | Update blocked date |
| `deleteVenueAvailability()` | 1293 | Delete blocked date |

### Google Calendar Integration

| Function | Lines | Purpose |
|----------|-------|---------|
| `updateVenueGoogleCalendar()` | 1299 | Store Google Calendar connection status |

---

## Frontend - Pages

**File:** `client/src/pages/`

| Page | File | Lines | Purpose |
|------|------|-------|---------|
| Venue Profile Setup | `venue-profile-setup.tsx` | Full | 10-step wizard for creating/editing venues |
| Venue Dashboard | `venue-dashboard.tsx` | Full | Operator dashboard (manage availability, view bookings) |
| Public Venue Page | `public-venue-page.tsx` | Full | SEO-optimized public venue listing |
| Venues Browse | `venues.tsx` | Full | Public venue directory with filters |

---

## Frontend - Components

**File:** `client/src/components/`

### Venue Management Components

| Component | File | Purpose |
|-----------|------|---------|
| Venue Availability Manager | `VenueAvailabilityManager.tsx` | Interactive calendar for blocking dates (manual) |
| Venue Availability | `VenueAvailability.tsx` | Display availability calendar |
| Venue Services Editor | `VenueServicesEditor.tsx` | Add/edit services with pricing and frequency |
| Venue Info Card | `VenueInfoCard.tsx` | Display venue details, amenities, capacity |
| Google Calendar Integration | `VenueGoogleCalendarIntegration.tsx` | Stub for Google Calendar sync |
| Admin Venue Calendar | `AdminVenueCalendar.tsx` | Consolidated calendar view for admins |
| Roles Editor | `RolesEditor.tsx` | Edit venue team roles |

---

## Frontend - Hooks

**File:** `client/src/hooks/`

| Hook | File | Purpose |
|------|------|---------|
| useAuth | `useAuth.ts` | Get current user and role |
| useRoleAuth | `useRoleAuth.ts` | Verify user has venue_provider role |

---

## Shared Resources

### Validation & Type Schemas
**File:** `shared/schema.ts`

```typescript
// Enums
export const experienceStatusEnum      // draft, pending_approval, published, approved, cancelled
export const bookingStatusEnum         // pending, confirmed, refunded, cancelled
export const depositStatusEnum         // refundable, locked, refunded
export const reservationStatusEnum     // active, expired, converted, cancelled
export const mvgStatusEnum             // pending, met, failed

// Type Exports
export type Experience = typeof experiences.$inferSelect;
export type InsertExperience = z.infer<typeof insertExperienceSchema>;
export type Venue = typeof venues.$inferSelect;
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Booking = typeof bookings.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
```

### Config & Constants
**File:** `shared/constants.ts`

- Standard roles list (21 roles: Retreat Host, Lead Facilitator, etc.)
- Category options
- Experience types
- Amenities & services lists

### Pricing Service
**File:** `shared/pricingService.ts`

- `calculateRevenueBreakdown()` - Unified pricing calculation for all models
- Used by both frontend (calculator) and backend (payment processing)

---

## API Request Pattern

All frontend API requests flow through:
```
client/src/lib/queryClient.ts → apiRequest() helper
```

Query keys follow pattern:
```
['/api/experiences']           // List query
['/api/experiences', id]       // Detail query
```

---

## Database Relationships

```
users (1) ──→ (many) experiences (creator_id)
users (1) ──→ (many) bookings (user_id)
users (1) ──→ (many) venues (owner_id via creator_profiles)

experiences (1) ──→ (many) bookings
experiences (1) ──→ (many) reservations
experiences (1) ──→ (many) experienceMessages
experiences (1) ──→ (many) experienceGallery
experiences (1) ──→ (many) experienceVenues
experiences (1) ──→ (many) experienceServices

venues (1) ──→ (many) venueAvailability
venues (1) ──→ (many) experienceVenues
```

---

## Authentication & Authorization

- **Frontend**: `useAuth()` hook checks `user.role`
- **Backend**: Middleware checks `req.user.claims.sub` (Replit Auth)
- **Admin Check**: Email verification (`timtheeuwsen@gmail.com`)
- **Creator Check**: `ProtectedRoute requiredRole="creator"`

---

## State Management Pattern

```
React Query (TanStack Query v5)
  ↓
queryKey: ['/api/endpoint', params]
  ↓
Automatic caching & background refetch
  ↓
Mutations invalidate relevant queries
```

---

## Build & Deployment

- **Frontend Build**: Vite (`npm run dev` in dev mode)
- **Backend**: Express on port 5000
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Storage**: S3-compatible (Replit Object Storage)

---

**Generated:** November 22, 2025
**Total Files Mapped:** 100+
**Backend Routes:** 80+
**Storage Functions:** 120+
**Frontend Pages:** 51
**Frontend Components:** 200+
