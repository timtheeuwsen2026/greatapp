# React Query Cache Invalidation Strategy

## Overview

This document outlines the comprehensive cache invalidation strategy implemented for venue services and display preferences to ensure immediate UI updates after data mutations.

## Problem Statement

When venue services were updated or display preferences changed, the public venue page and other related views did not immediately reflect the changes because the React Query cache was not properly invalidated.

## Solution

Implemented multi-level cache invalidation that targets:
1. **List-level queries** - All venues, venue listings
2. **Individual venue queries** - Specific venue by ID and slug
3. **Edit mode queries** - Venue edit forms

## Implementation Details

### 1. Venue Profile Save/Update (venue-profile-setup.tsx)

**Query Keys Invalidated:**
```typescript
// List queries
await queryClient.invalidateQueries({ queryKey: ['/api/venues'] });
await queryClient.invalidateQueries({ queryKey: ['/api/venue/listings'] });

// Individual venue by slug (public page)
if (venue.slug) {
  await queryClient.invalidateQueries({ queryKey: [`/api/v/${venue.slug}`] });
}

// Edit mode query
if (editVenueId) {
  await queryClient.invalidateQueries({ queryKey: ['/api/venues', editVenueId, 'edit'] });
}
```

**Triggers:**
- After successful venue creation
- After successful venue update
- After venue submission for review

**Effect:** Public venue page immediately shows updated services, amenities, and all other venue data.

### 2. Admin Display Preferences Update (admin-dashboard.tsx)

**Query Keys Invalidated:**
```typescript
// Admin and general venue lists
await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
await queryClient.invalidateQueries({ queryKey: ["/api/venues"] });

// Individual venue by slug (public page)
if (slug) {
  await queryClient.invalidateQueries({ queryKey: [`/api/v/${slug}`] });
}
```

**Triggers:**
- After admin toggles services placement (sidebar ↔ inline)

**Effect:** Public venue page immediately updates services display position without page refresh.

## Query Key Architecture

### Venue Query Keys Map

| Query Key Pattern | Purpose | Invalidated By |
|------------------|---------|----------------|
| `['/api/venues']` | All venues list | Create, Update, Delete, Status Change |
| `['/api/venue/listings']` | Venue provider's listings | Create, Update, Delete, Submit |
| `['/api/v/${slug}']` | **Public venue page** | Create, Update, Display Prefs |
| `['/api/venues', id, 'edit']` | Edit form data | Update |
| `['/api/admin/venues']` | Admin venues dashboard | Status Change, Delete, Display Prefs |

## Benefits

### 1. Immediate UI Updates
✅ Service changes appear immediately  
✅ Display preference toggles work in real-time  
✅ Admin changes reflect on public pages instantly  

### 2. Consistent Data Across Views
✅ Admin dashboard ↔ Public venue page  
✅ Edit form ↔ Venue listings  
✅ Venue dashboard ↔ Public profile  

### 3. Better UX
- No stale data issues
- No confusing delays between save and display
- Predictable behavior for users

## Testing Cache Invalidation

### Manual Testing Steps

**Test 1: Edit Venue Services**
1. Navigate to venue edit page
2. Add/edit/remove services
3. Click Save
4. Navigate to public venue page (/v/[slug])
5. ✅ Changes should appear immediately

**Test 2: Toggle Display Preferences**
1. Open Admin Dashboard → Venues tab
2. Toggle "Services Display" for a venue
3. Open public venue page in another tab
4. ✅ Services position changes immediately (no refresh needed)

**Test 3: Multi-Tab Sync**
1. Open public venue page in Tab A
2. Open venue edit page in Tab B
3. Make changes and save in Tab B
4. Switch to Tab A
5. ✅ Tab A refetches and shows updated data

## Best Practices

### When Adding New Mutations

1. **Identify affected query keys**
   - What data does this mutation change?
   - Which queries fetch that data?

2. **Invalidate hierarchically**
   ```typescript
   // Always invalidate from specific to general
   await queryClient.invalidateQueries({ queryKey: [`/api/v/${slug}`] }); // Specific
   await queryClient.invalidateQueries({ queryKey: ['/api/venues'] });    // General
   ```

3. **Use await for critical invalidations**
   ```typescript
   onSuccess: async () => {
     // await ensures cache is cleared before proceeding
     await queryClient.invalidateQueries({ queryKey: [...] });
   }
   ```

---

**Last Updated:** January 22, 2025  
**Status:** ✅ Implemented and Tested
