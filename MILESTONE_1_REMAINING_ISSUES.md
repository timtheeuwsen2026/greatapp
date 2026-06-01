# Milestone 1 Remaining Issues Checklist

## Event Builder Issues
- [x] Media Step (2/10): images upload but don't display anywhere - **FIXED**
- [x] Rooms Step (7/10): capacity calculation wrong (13 spots shows as 10) - **FIXED** (previous session)
- [x] Pricing Step (9/10): MVG saved as 8 but shows as 6 - **FIXED** (previous session)
- [x] Terms Step (10/10): static T&Cs, cannot edit/replace - **FIXED**

## Dashboards Issues
- [x] Creator dashboard: no images, MVG incorrect, total spots incorrect - **FIXED**
- [x] Admin dashboard: event shows but cover image missing - **FIXED**

## Venue Builder Issues
- [x] No "Submit Venue" button on the venue wizard - **FIXED** (previous session)
- [x] "Save Draft" does not make venue appear in venue dashboard or admin dashboard - **FIXED** (added My Venues tab to Creator Dashboard)

---

## Fix Progress Log

### Phase 1 - Media Step
Status: **COMPLETED**
Fix: Created normalizeImageUrl utility function in client/src/lib/utils.ts that converts GCS private URLs to local /objects/ paths. Updated all image display components to use this function.
Files changed: utils.ts, creator-dashboard.tsx, admin-dashboard.tsx, experiences.tsx, home.tsx, experience-card.tsx, venues.tsx, public-venue-page.tsx, checkout.tsx, reservations.tsx, event-invite.tsx, booking-success.tsx, JoinTripModal.tsx

### Phase 2 - Rooms Capacity
Status: **COMPLETED** (previous session)
Fix: Auto-save mutation now properly preserves maxParticipants field calculated from room quantities.

### Phase 3 - MVG/Pricing
Status: **COMPLETED** (previous session)
Fix: Auto-save mutation now maps minimumParticipants → mvgMinimumSize and requireMinimumParticipants → mvgEnabled before saving.

### Phase 4 - Terms
Status: **COMPLETED**
Fix: Added customTerms text field to schema and Event Builder form. Creators can now type custom terms in a textarea. The text maps to termsAndConditions in experiences table on publish. PDF upload remains as an alternative option.

### Phase 5 - Dashboards
Status: **COMPLETED**
Fix: normalizeImageUrl applied to all dashboard image displays.

### Phase 6 - Venue Builder
Status: **COMPLETED**
Fix: Submit button visibility fixed (previous session). Added "My Venues" tab to Creator Dashboard with full venue listing, status badges, and action buttons. API endpoint /api/venues/my returns user's venues.

### Phase 7 - Final Testing
Status: **COMPLETED**
E2E tests verified:
- Images load correctly with normalized URLs
- Terms step has editable textarea
- My Venues tab shows venue cards
- My Experiences tab shows drafts

All Milestone 1 issues are now resolved.
