# Public Event Page - Complete Layout

## Overview
The Public Event Page (`/e/:slugOrId`) displays comprehensive event information in a professionally structured layout. The page is fully responsive and includes all necessary sections for users to understand and book an experience.

## Route
```
/e/:slugOrId
```
- Accepts either event slug or UUID
- Supports preview token query parameter: `?preview={token}` for pending events

## Page Structure

### ✅ 1. Hero Section
**Full-width cover image with overlay content**

**Displayed Information:**
- Cover photo (full-width, 500px height)
- Event title (large, bold)
- Dates with duration
- Location (from venue)
- MVG badge (if enabled)
- Primary CTA: "Book Now" button

**Design:**
- Dark overlay (40% black) for text readability
- White text on dark background
- Large, prominent title (4xl-6xl font size)
- Bottom-aligned content layout

### ✅ 2. Quick Facts Section
**Elevated card showing key metrics**

**Displayed Information:**
- Lowest price (if rooms available)
- Duration (days/nights)
- Group size (total available spots)
- MVG progress (if enabled)

**Design:**
- Card positioned -32px from top (overlapping hero)
- Icon-based layout with circular backgrounds
- Responsive grid layout
- Primary color accents

### ✅ 3. About the Experience
**Rich text content section**

**Displayed Information:**
- Short description (highlighted)
- Full description (prose formatting)

**Design:**
- Card layout with padding
- Large, readable typography
- Proper line spacing for readability

### ✅ 4. Photo Gallery
**Grid display of event photos**

**Displayed Information:**
- Gallery images (ordered)
- Image captions (overlay on hover)

**Design:**
- Responsive grid: 1 column (mobile) → 2 (tablet) → 3 (desktop)
- Aspect-ratio maintained (16:9)
- Hover zoom effect
- Caption overlay with backdrop blur

### ✅ 5. What's Included
**Amenity badges section**

**Displayed Information:**
- Combined amenities from:
  - Experience-specific amenities
  - Venue amenities
  - Confirmed services

**Design:**
- Badge layout with secondary variant
- Wrapped flex layout
- Clear, scannable presentation

### ✅ 6. Itinerary
**Accordion-style day-by-day breakdown**

**Displayed Information:**
- Day number and title
- Day subtitle (optional)
- Activities with:
  - Time
  - Activity title
  - Activity description

**Design:**
- Accordion component (collapsible)
- Numbered day indicators (circular badges)
- Time indicators with clock icons
- Hierarchical content structure

### ✅ 7. Rooms & Pricing
**Card grid showing accommodation options**

**Displayed Information:**
For each room:
- Room photo (if available)
- Room name
- Price per person
- Discount badge (if active)
- Available spots
- Room notes
- "Select Room" button

**Design:**
- 3-column grid (responsive)
- Individual cards per room
- Green discount badges
- Disabled booking buttons (for now)

### ✅ 8. MVG Status
**Progress tracking for minimum viable group**

**Displayed Information:**
- Current signups vs. minimum required
- Progress bar (visual)
- Percentage complete
- Status message:
  - "✓ Event confirmed" (if MVG met)
  - "Confirmed once X join by [deadline]" (if pending)

**Design:**
- Large progress bar (h-3)
- Color-coded status (green for confirmed)
- Clear messaging

### ✅ 9. Venue Section
**Venue details and photos**

**Displayed Information:**
- Venue photos (grid of 4)
- Venue name
- Location with map pin icon
- Description
- Capacity (with user icon)
- Venue amenities (outline badges)

**Design:**
- Photo grid: 2x2 on mobile, 4 columns on desktop
- Square aspect ratio for photos
- Separated amenities section
- Clear hierarchy

### ✅ 10. Creator Section
**Host information**

**Displayed Information:**
- Creator photo (or placeholder)
- Creator name
- Tagline/bio

**Design:**
- Horizontal layout (avatar + text)
- 64px circular avatar
- Clean, professional presentation

### ✅ 11. Service Add-Ons
**Optional services section**

**Displayed Information:**
- Service names (confirmed only)

**Design:**
- Chip/pill layout
- Primary color theme
- Border and background styling

### ✅ 12. Final CTA
**Bottom call-to-action card**

**Displayed Information:**
- "Ready to Join?" headline
- Contextual message (MVG-aware)
- Price reminder
- CTA button:
  - "Join Waitlist" (if MVG not met)
  - "Book Now" (if MVG met or disabled)

**Design:**
- Gradient background (primary colors)
- Large, prominent layout
- Responsive flex layout
- Emphasized pricing

## Component Tree

```
PublicEventPage
├── Hero Section
│   ├── Cover Image
│   ├── Dark Overlay
│   └── Content Overlay
│       ├── Title
│       ├── MVG Badge (conditional)
│       ├── Dates & Location
│       └── Book Now Button
│
├── Quick Facts Card (elevated)
│   ├── Price Fact
│   ├── Duration Fact
│   ├── Group Size Fact
│   └── MVG Progress Fact (conditional)
│
├── About Card
│   ├── Short Description
│   └── Full Description
│
├── Photo Gallery Card (conditional)
│   └── Image Grid
│
├── What's Included Card (conditional)
│   └── Amenity Badges
│
├── Itinerary Card (conditional)
│   └── Accordion
│       └── Day Items
│           └── Activities
│
├── Rooms & Pricing Card (conditional)
│   └── Room Cards Grid
│       └── Room Card
│           ├── Photo
│           ├── Name & Price
│           ├── Discount Badge
│           ├── Spots Info
│           └── Select Button
│
├── MVG Status Card (conditional)
│   ├── Progress Info
│   ├── Progress Bar
│   └── Status Note
│
├── Venue Card (conditional)
│   ├── Photo Grid
│   ├── Name & Location
│   ├── Description
│   └── Capacity & Amenities
│
├── Creator Card (conditional)
│   ├── Avatar
│   └── Name & Tagline
│
├── Services Card (conditional)
│   └── Service Chips
│
└── Final CTA Card
    ├── Headline & Message
    ├── Price Reminder
    └── CTA Button
```

## Data Requirements

### Required Fields
- `id` - Event identifier
- `title` - Event name
- `cover_image` - Hero photo
- `start_date` - Event start
- `end_date` - Event end
- `duration` - Calculated days
- `pricing` - Price information

### Optional Fields
- `short_description`
- `full_description`
- `gallery` - Additional photos
- `itinerary` - Day-by-day details
- `amenities` - Included features
- `venue` - Venue information
- `creator` - Host information
- `services` - Service add-ons
- `mvg` - MVG settings
- `pricing.rooms` - Room options

## Responsive Behavior

### Mobile (< 640px)
- Single column layout
- Stacked quick facts
- 1 gallery column
- Full-width room cards

### Tablet (640px - 1024px)
- 2 column gallery
- 2 column room grid
- Responsive hero text

### Desktop (> 1024px)
- 3 column gallery
- 3 column room grid
- Larger hero text
- Side-by-side CTA layout

## Loading States

### Initial Load
```tsx
<Skeleton className="w-full h-[500px]" />
```

### Error State
```tsx
<div>Event Not Found</div>
```

## Test IDs

All interactive and important elements have `data-testid` attributes for testing:

**Hero Section:**
- `img-cover` - Cover image
- `text-title` - Event title
- `badge-mvg` - MVG badge
- `text-dates` - Date information
- `text-location` - Location
- `button-book-now` - Primary CTA

**Quick Facts:**
- `fact-lowest-price`
- `fact-duration`
- `fact-group-size`
- `fact-mvg-progress`

**Content Sections:**
- `heading-about`
- `text-short-description`
- `text-full-description`
- `heading-gallery`
- `gallery-photo-{id}`
- `heading-whats-included`
- `amenity-badge-{index}`

**Itinerary:**
- `heading-itinerary`
- `itinerary-day-{index}`
- `activity-{dayIndex}-{activityIndex}`

**Rooms:**
- `heading-rooms-pricing`
- `room-card-{index}`
- `room-image-{index}`
- `room-name-{index}`
- `button-select-room-{index}`

**MVG:**
- `heading-mvg-status`
- `mvg-progress-bar`
- `mvg-status-note`

**Venue:**
- `heading-venue`
- `venue-photo-{index}`
- `venue-name`
- `venue-location`
- `venue-description`
- `venue-capacity`
- `venue-amenity-{index}`

**Creator:**
- `heading-creator`
- `creator-avatar`
- `creator-name`
- `creator-tagline`

**Services:**
- `heading-services`
- `service-chip-{index}`

**Final CTA:**
- `heading-final-cta`
- `button-join-waitlist` OR `button-book-now-final`

## Example URLs

### By ID
```
/e/exp-admin-published-demo
```

### By Slug
```
/e/mystic-marrakesh-adventure
```

### With Preview Token
```
/e/pending-event-id?preview=3cc8da3781c528eb13118383f225aea0245db8b2cff9505a3038da2b0a382d8f
```

## Usage

### Navigate to Event Page
```tsx
import { Link } from "wouter";

<Link href={`/e/${event.id}`}>
  View Event
</Link>
```

### Open in New Tab
```tsx
<a 
  href={`/e/${event.slug || event.id}`}
  target="_blank"
  rel="noopener noreferrer"
>
  View Event
</a>
```

## Key Features

✅ **Access Control** - Respects draft/pending/approved status
✅ **Responsive Design** - Mobile-first, scales to desktop
✅ **Smart Conditionals** - Only shows sections with data
✅ **MVG Integration** - Dynamic messaging based on status
✅ **Image Optimization** - Lazy loading for gallery
✅ **SEO Ready** - Semantic HTML structure
✅ **Accessible** - Proper heading hierarchy, ARIA labels
✅ **Test Coverage** - Comprehensive test IDs for automation
