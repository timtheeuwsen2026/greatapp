# Venue Section Integration - Event Page

## Overview

The Venue Section is now integrated into the Public Event Page using a reusable `VenueInfoCard` component. The venue data is automatically pulled from the event record via the existing API.

## Implementation

### 1. Reusable Component

**File:** `client/src/components/VenueInfoCard.tsx`

A new reusable component that displays venue information with:
- ✅ Venue name (prominent heading)
- ✅ Cover photo (400px hero image)
- ✅ Additional photos (3-image gallery)
- ✅ Location with map icon
- ✅ Short description
- ✅ Capacity with icon
- ✅ Amenities (badge display)

**Props:**
```typescript
interface VenueInfoCardProps {
  venue: {
    id: string;
    name: string;
    location?: string;
    description?: string;
    photos?: string[];
    capacity?: number;
    amenities?: string[];
  };
  showPhotos?: boolean;  // Default: true
  className?: string;
}
```

### 2. Integration in Event Page

**File:** `client/src/pages/public-event-page.tsx`

**Usage:**
```tsx
{event.venue && (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
    <VenueInfoCard venue={event.venue} />
  </div>
)}
```

**Position:** Section #9 (between MVG Status and Creator Section)

### 3. Data Flow

#### Backend (Already Implemented)

**Endpoint:** `GET /api/e/:slugOrId`

The backend automatically includes venue data in the event response:

```typescript
// server/routes.ts (lines 1094-1102)
const [venue, creator, ...] = await Promise.all([
  experience.linkedVenueId 
    ? storage.getVenue(experience.linkedVenueId) 
    : Promise.resolve(null),
  // ... other data
]);

// Response includes venue data
return res.json({
  ...experience,
  venue: venue ? {
    id: venue.id,
    name: venue.name,
    location: venue.city,
    description: venue.description,
    photos: [
      ...(venue.coverImageUrl ? [venue.coverImageUrl] : []),
      ...(venue.galleryImages || [])
    ],
    capacity: venue.capacity,
    amenities: venue.tags || []
  } : null,
  // ... other data
});
```

#### Frontend

The frontend receives venue data as part of the event object:

```typescript
const { data: event } = useQuery<PublicEventData>({
  queryKey: ["/api/e", slugOrId],
});

// event.venue is automatically available
// VenueInfoCard renders if event.venue exists
```

---

## Visual Layout

```
┌─────────────────────────────────────────────────────────┐
│  THE VENUE                                              │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │                                                   │ │
│  │          VENUE COVER PHOTO (400px)               │ │
│  │              (Full-width hero)                    │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  [Photo 2] [Photo 3] [Photo 4]  (if available)         │
│                                                         │
│  Venue Name (2xl, bold)                                │
│  📍 Location                                            │
│                                                         │
│  Short description text...                             │
│                                                         │
│  ┌──────────────────────────────────────────┐          │
│  │ 👥  Capacity                             │          │
│  │     Up to 150 guests                     │          │
│  └──────────────────────────────────────────┘          │
│                                                         │
│  Venue Amenities:                                      │
│  [WiFi] [Pool] [Parking] [Kitchen] ...                 │
└─────────────────────────────────────────────────────────┘
```

---

## Data Mapping

### Backend Venue Model → Frontend Display

| Backend Field | Frontend Display | Transform |
|---------------|------------------|-----------|
| `venue.name` | Heading | Direct |
| `venue.city` | Location with icon | Mapped to `location` |
| `venue.description` | Description text | Direct |
| `venue.coverImageUrl` + `venue.galleryImages` | Photos array | Combined |
| `venue.capacity` | Capacity card | Direct |
| `venue.tags` | Amenities badges | Mapped to `amenities` |

### API Response Structure

```json
{
  "id": "event-id",
  "title": "Event Title",
  "venue": {
    "id": "venue-id",
    "name": "Seaside Retreat Center",
    "location": "Bali, Indonesia",
    "description": "A beautiful beachfront venue...",
    "photos": [
      "https://example.com/cover.jpg",
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg"
    ],
    "capacity": 150,
    "amenities": ["WiFi", "Pool", "Yoga Studio", "Restaurant"]
  }
}
```

---

## Conditional Rendering

The venue section only displays when:
- ✅ `event.venue` exists (event has `linkedVenueId`)
- ✅ Backend successfully fetches venue data
- ✅ At least venue name is available

**If no venue:**
- Section is completely hidden
- No error message (graceful degradation)
- Page continues with other sections

---

## Features

### Photo Display
- **Cover Photo:** Full-width 400px hero image
- **Gallery:** Up to 3 additional photos in responsive grid
- **Lazy Loading:** Images load on scroll
- **Hover Effect:** Zoom transition on additional photos

### Capacity Display
- **Icon:** Users icon in primary color
- **Format:** "Up to X guests"
- **Styling:** Highlighted card with background

### Amenities
- **Display:** Badge layout with outline variant
- **Responsive:** Wraps on smaller screens
- **Accessible:** Clear, readable text

---

## Test IDs

For automated testing:

- `heading-venue` - Section heading
- `venue-cover-photo` - Main cover photo
- `venue-photo-1`, `venue-photo-2`, `venue-photo-3` - Additional photos
- `venue-name` - Venue name heading
- `venue-location` - Location text
- `venue-description` - Description text
- `venue-capacity` - Capacity display card
- `venue-amenity-{index}` - Individual amenity badges

---

## Reusability

The `VenueInfoCard` component can be reused in other contexts:

### Event Page (Current)
```tsx
<VenueInfoCard venue={event.venue} />
```

### Event Builder Preview
```tsx
<VenueInfoCard 
  venue={selectedVenue} 
  showPhotos={true}
/>
```

### Compact Display (No Photos)
```tsx
<VenueInfoCard 
  venue={venueData}
  showPhotos={false}
  className="max-w-md"
/>
```

---

## Examples

### Event with Full Venue Data
```
Event: "Summer Wellness Retreat"
Venue: "Oceanview Wellness Center"
→ Shows: Cover photo, 3 gallery photos, name, location, 
         description, capacity (50 guests), 8 amenities
```

### Event with Basic Venue Data
```
Event: "Weekend Workshop"
Venue: "Downtown Studio"
→ Shows: Name, location, description
→ Hides: Photos (none), capacity (not set), amenities (empty)
```

### Event with No Venue
```
Event: "Virtual Masterclass"
Venue: null
→ Entire section hidden, no errors
```

---

## Related Files

### Implementation
- `client/src/components/VenueInfoCard.tsx` - Reusable component
- `client/src/pages/public-event-page.tsx` - Event page integration
- `server/routes.ts` - API endpoint (lines 1037-1160)

### Backend Storage
- `server/storage.ts` - getVenue() method
- `shared/schema.ts` - Venue model

### Related Components
- `client/src/pages/venues.tsx` - VenueCard (listing view)
- `client/src/pages/public-venue-page.tsx` - Full venue page

---

## Database Schema

**Experiences Table:**
```typescript
linkedVenueId: varchar("linked_venue_id").references(() => venues.id)
```

**Venues Table:**
```typescript
{
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  city: varchar("city"),
  description: text("description"),
  coverImageUrl: varchar("cover_image_url"),
  galleryImages: text("gallery_images").array(),
  capacity: integer("capacity"),
  tags: text("tags").array(),
  // ... other fields
}
```

---

## Testing Checklist

### Manual Testing

**With Venue Data:**
- [ ] Venue section appears on page
- [ ] Cover photo displays correctly
- [ ] Additional photos show in grid
- [ ] Venue name is prominent
- [ ] Location shows with icon
- [ ] Description is readable
- [ ] Capacity card displays
- [ ] Amenities show as badges

**Without Venue Data:**
- [ ] Section is hidden
- [ ] No errors in console
- [ ] Page renders normally

**Responsive:**
- [ ] Mobile: Stacked layout, single column photos
- [ ] Tablet: 2-column photo grid
- [ ] Desktop: 3-column photo grid

### API Testing

```bash
# Check event with venue
curl http://localhost:5000/api/e/{event-id} | jq '.venue'

# Expected: Venue object with all fields

# Check event without venue
curl http://localhost:5000/api/e/{no-venue-id} | jq '.venue'

# Expected: null
```

---

## Future Enhancements

Potential improvements:

- [ ] Link to full venue page (`/v/:slug`)
- [ ] Venue availability calendar
- [ ] Interactive map integration
- [ ] 360° virtual tour
- [ ] Venue comparison tool
- [ ] Favorite venue feature
- [ ] Venue reviews/ratings
- [ ] Booking inquiry form

---

## Summary

✅ **Reusable Component:** VenueInfoCard can be used across the app  
✅ **Data from Event:** Venue data automatically pulled from event record  
✅ **Conditional Rendering:** Only shows when venue data exists  
✅ **Professional Design:** Cover photo, description, capacity, amenities  
✅ **Responsive:** Works on all screen sizes  
✅ **Test Coverage:** Comprehensive data-testid attributes  
✅ **No Duplication:** Reuses existing design patterns  

The Venue Section is now fully integrated and ready to display venue information for any event that has a linked venue!
