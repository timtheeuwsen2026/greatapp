# Event Data Fetching API

## Overview
This document explains how to fetch comprehensive event (experience) data using the Great. platform API. The API returns all necessary information for displaying event details, including venue information, pricing, creator details, and more.

## API Endpoint

### Fetch Single Event by Slug or ID

```
GET /api/e/:slugOrId
```

**Parameters:**
- `slugOrId` - Event slug (URL-friendly string) or UUID

**Query Parameters (Optional):**
- `preview` - Preview token for accessing pending events (only for pending status)

**Access Control:**
- **Approved events**: Publicly accessible
- **Pending events**: Requires valid preview token OR creator/admin access
- **Draft events**: Creator/admin only

---

## Response Structure

### Complete Event Data Object

```typescript
{
  // ═══════════════════════════════════════════════════════════════
  // BASIC INFORMATION
  // ═══════════════════════════════════════════════════════════════
  id: string;                    // UUID
  slug: string | null;           // URL-friendly identifier
  title: string;                 // Event title
  short_description: string;     // Brief summary (for cards/previews)
  full_description: string;      // Complete description
  category: string;              // sports_wellness | retreats | community_social | adventure_trips | workations | festivals_events
  experienceType: string;        // one-day | multi-day | virtual
  status: string;                // draft | pending | approved | published | rejected
  location: string;              // Full address or "Virtual"
  
  // ═══════════════════════════════════════════════════════════════
  // DATES & DURATION
  // ═══════════════════════════════════════════════════════════════
  start_date: string;            // ISO 8601 datetime
  end_date: string;              // ISO 8601 datetime
  duration: number;              // Duration in days (calculated)
  startTime: string | null;      // For single-day events
  endTime: string | null;        // For single-day events
  
  // ═══════════════════════════════════════════════════════════════
  // MEDIA
  // ═══════════════════════════════════════════════════════════════
  cover_image: string;           // Primary cover photo URL
  gallery: Array<{               // Additional photos
    id: string;
    imageUrl: string;
    caption: string | null;
    order: number;
  }>;
  
  // ═══════════════════════════════════════════════════════════════
  // VENUE INFORMATION (if linked)
  // ═══════════════════════════════════════════════════════════════
  venue: {
    id: string;
    name: string;
    slug: string;
    city: string;
    location: string;            // Full address
    capacity: number;
    description: string;
    coverImageUrl: string | null;
    amenities: string[];         // Array of amenity names
    website: string | null;
    instagram: string | null;
    photos: string[];            // Cover image + gallery combined
  } | null;
  
  // ═══════════════════════════════════════════════════════════════
  // ITINERARY
  // ═══════════════════════════════════════════════════════════════
  itinerary: Array<{
    day?: number;
    title?: string;
    activities?: Array<{
      time?: string;
      title: string;
      description?: string;
    }>;
  }>;
  
  // ═══════════════════════════════════════════════════════════════
  // PRICING OPTIONS
  // ═══════════════════════════════════════════════════════════════
  pricing: {
    currency: string;            // usd, eur, gbp, etc.
    basePrice: number;           // Base price (fallback if no rooms)
    depositEnabled: boolean;
    depositPercentage: number;
    
    // Room/SKU-based pricing (for multi-room experiences)
    rooms: Array<{
      id: string;
      name: string;              // "Private Room", "Shared Room", etc.
      price: number;             // Price per person
      quantity: number;          // Total available
      availableSpots: number;    // Remaining spots
      discount: {                // Active discount (if any)
        title: string;
        type: "percentage" | "fixed";
        value: number;
        validUntil: string | null;
      } | null;
      gallery: string[];         // Room photos
      notes: string | null;
    }>;
    
    // General discounts (not room-specific)
    discounts: Array<{
      id: string;
      title: string;
      type: "percentage" | "fixed";
      value: number;
      validUntil: string | null;
      active: boolean;
    }>;
  };
  
  // ═══════════════════════════════════════════════════════════════
  // MVG (Minimum Viable Group) & SOFT-HOLD DATA
  // ═══════════════════════════════════════════════════════════════
  mvg: {
    enabled: boolean;            // Is MVG enabled?
    minimum_required: number;    // Min participants needed
    current_signups: number;     // Current confirmed bookings
    soft_hold_deadline: string | null;  // Deadline for reaching MVG
    status: string;              // pending | met | failed
    escrow_enabled: boolean;     // Are payments held in escrow?
  };
  
  // Soft-hold reservation configuration
  softHoldEnabled: boolean;
  softHoldDurationHours: number;
  currentReservations: number;   // Active reservations count
  
  // ═══════════════════════════════════════════════════════════════
  // CREATOR INFORMATION
  // ═══════════════════════════════════════════════════════════════
  creator: {
    photo: string | null;        // Profile image URL
    name: string;                // Display name
    tagline: string | null;      // Brief tagline/bio
  } | null;
  
  // ═══════════════════════════════════════════════════════════════
  // AMENITIES & SERVICES
  // ═══════════════════════════════════════════════════════════════
  amenities: string[];           // Combined: experience + venue amenities + confirmed services
  services: string[];            // Confirmed service add-ons only
  
  // ═══════════════════════════════════════════════════════════════
  // CAPACITY & AVAILABILITY
  // ═══════════════════════════════════════════════════════════════
  maxParticipants: number;
  currentParticipants: number;
  showParticipantList: boolean;
  
  // ═══════════════════════════════════════════════════════════════
  // STATISTICS & SOCIAL PROOF
  // ═══════════════════════════════════════════════════════════════
  stats: {
    totalBookings: number;
    totalViews: number;
    averageRating: number;
    totalReviews: number;
  };
  
  bookings: Array<Booking>;      // Confirmed bookings only
  reviews: Array<Review>;
  
  // ═══════════════════════════════════════════════════════════════
  // VIRTUAL EVENT FIELDS (if virtual)
  // ═══════════════════════════════════════════════════════════════
  virtualMeetingUrl: string | null;
  virtualMeetingPassword: string | null;
  virtualPlatform: string | null;    // zoom, google_meet, teams, etc.
  virtualInstructions: string | null;
  
  // ═══════════════════════════════════════════════════════════════
  // ADDITIONAL METADATA
  // ═══════════════════════════════════════════════════════════════
  createdAt: string;
  updatedAt: string;
  managementType: string;        // creator_managed | great_managed
  monetisationMode: string;      // creator_led | great_managed | promo_only | extra_services
}
```

---

## Usage Examples

### Example 1: Fetch Event by ID

```bash
curl http://localhost:5000/api/e/exp-admin-published-demo
```

### Example 2: Fetch Event by Slug

```bash
curl http://localhost:5000/api/e/mystic-marrakesh-adventure
```

### Example 3: Fetch Pending Event with Preview Token

```bash
curl "http://localhost:5000/api/e/pending-event-id?preview=3cc8da3781c528eb13118383f225aea0245db8b2cff9505a3038da2b0a382d8f"
```

### Example 4: Extract Specific Fields with jq

```bash
# Get title, dates, and pricing
curl -s http://localhost:5000/api/e/exp-admin-published-demo | jq '{
  title,
  duration: .duration,
  price: .pricing.basePrice,
  currency: .pricing.currency,
  venue: .venue.name,
  creator: .creator.name
}'
```

---

## Frontend Integration

### React/TypeScript Example

```typescript
import { useQuery } from "@tanstack/react-query";

interface EventData {
  id: string;
  title: string;
  short_description: string;
  full_description: string;
  start_date: string;
  end_date: string;
  duration: number;
  cover_image: string;
  gallery: Array<{
    id: string;
    imageUrl: string;
    caption: string | null;
  }>;
  venue: {
    name: string;
    location: string;
    capacity: number;
    description: string;
    photos: string[];
    amenities: string[];
  } | null;
  pricing: {
    currency: string;
    basePrice: number;
    rooms: Array<{
      id: string;
      name: string;
      price: number;
      availableSpots: number;
    }>;
  };
  mvg: {
    enabled: boolean;
    minimum_required: number;
    current_signups: number;
    status: string;
  };
  creator: {
    photo: string | null;
    name: string;
    tagline: string | null;
  };
  stats: {
    totalBookings: number;
    averageRating: number;
    totalReviews: number;
  };
}

function useEventData(slugOrId: string) {
  return useQuery<EventData>({
    queryKey: ["/api/e", slugOrId],
    enabled: !!slugOrId,
  });
}

// Usage in component
function EventDetailsPage({ eventSlug }: { eventSlug: string }) {
  const { data: event, isLoading, error } = useEventData(eventSlug);

  if (isLoading) return <div>Loading event details...</div>;
  if (error) return <div>Event not found</div>;
  if (!event) return null;

  return (
    <div>
      <h1>{event.title}</h1>
      <p>{event.short_description}</p>
      
      <img src={event.cover_image} alt={event.title} />
      
      <div>
        <h2>Duration: {event.duration} days</h2>
        <p>From: {new Date(event.start_date).toLocaleDateString()}</p>
        <p>To: {new Date(event.end_date).toLocaleDateString()}</p>
      </div>
      
      {event.venue && (
        <div>
          <h2>Venue: {event.venue.name}</h2>
          <p>{event.venue.location}</p>
          <p>Capacity: {event.venue.capacity} people</p>
          <p>{event.venue.description}</p>
          
          <div>
            <h3>Amenities</h3>
            <ul>
              {event.venue.amenities.map((amenity, i) => (
                <li key={i}>{amenity}</li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3>Venue Photos</h3>
            {event.venue.photos.map((photo, i) => (
              <img key={i} src={photo} alt={`Venue ${i + 1}`} />
            ))}
          </div>
        </div>
      )}
      
      <div>
        <h2>Pricing</h2>
        <p>Base Price: {event.pricing.currency.toUpperCase()} {event.pricing.basePrice}</p>
        
        {event.pricing.rooms.map((room) => (
          <div key={room.id}>
            <h3>{room.name}</h3>
            <p>Price: {event.pricing.currency.toUpperCase()} {room.price}</p>
            <p>Available Spots: {room.availableSpots}</p>
          </div>
        ))}
      </div>
      
      {event.mvg.enabled && (
        <div>
          <h2>Minimum Group Size</h2>
          <p>Requires at least {event.mvg.minimum_required} participants</p>
          <p>Current signups: {event.mvg.current_signups}</p>
          <p>Status: {event.mvg.status}</p>
        </div>
      )}
      
      {event.creator && (
        <div>
          <h2>Hosted By</h2>
          {event.creator.photo && <img src={event.creator.photo} alt={event.creator.name} />}
          <h3>{event.creator.name}</h3>
          {event.creator.tagline && <p>{event.creator.tagline}</p>}
        </div>
      )}
    </div>
  );
}
```

---

## Key Points

### Data Completeness
✅ **Always returned:**
- Basic info (title, description, dates, duration)
- Cover image
- Pricing information
- MVG/soft-hold data
- Creator information
- Stats and reviews

⚠️ **Conditionally returned (may be null):**
- Venue information (only if `linkedVenueId` is set)
- Gallery images (may be empty array)
- Itinerary (may be empty array)
- Room-based pricing (may be empty array)

### Performance
- All related data fetched in parallel for speed
- Graceful fallbacks for missing tables/data
- Duration automatically calculated from dates

### Security
- Access control enforced based on event status
- Preview tokens validated for pending events
- Returns 404 for unauthorized access (not 403)

---

## Error Handling

### 404 Not Found
- Event doesn't exist
- Access denied (draft/pending without proper authorization)

### 500 Server Error
- Database connection issues
- Internal server errors

### Access Denied Scenarios
```bash
# Draft event, no auth
GET /api/e/draft-event-id
→ 404 Not Found

# Pending event, no preview token
GET /api/e/pending-event-id
→ 404 Not Found

# Pending event WITH preview token
GET /api/e/pending-event-id?preview={token}
→ 200 OK (if token valid)
```

---

## Related Endpoints

- `GET /api/experiences` - List all approved events
- `GET /api/experiences/:id` - Fetch event by ID only (less data than /api/e/:slugOrId)
- `POST /api/experiences/:id/generate-preview-token` - Generate preview link for pending events
- `GET /api/venues/:venueId/experiences` - Get all events at a specific venue

---

## Testing

```bash
# List all approved events
curl http://localhost:5000/api/experiences

# Get full event details
curl http://localhost:5000/api/e/exp-admin-published-demo | jq

# Extract specific fields
curl -s http://localhost:5000/api/e/exp-admin-published-demo | jq '{
  title,
  venue: .venue.name,
  price: .pricing.basePrice,
  spots_left: (.maxParticipants - .currentParticipants)
}'
```
