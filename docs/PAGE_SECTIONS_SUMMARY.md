# Public Event Page - Section Summary

## Complete Layout Structure

### Route: `/e/:slugOrId`

---

## 📸 1. Hero Section
**Full-width cover image with dark overlay**

✅ **Includes:**
- Event title (4xl-6xl font)
- Event dates with duration
- Location (from venue)
- MVG badge (if enabled)
- "Book Now" primary CTA button

**Styling:** Dark overlay, white text, bottom-aligned content

---

## 📊 2. Quick Facts
**Elevated card with key metrics**

✅ **Displays:**
- 💰 Lowest price (from rooms)
- ⏱️ Duration (days/nights)
- 👥 Group size (total spots)
- 📈 MVG progress (if enabled)

**Styling:** Icon-based circular backgrounds, primary color accents

---

## 📝 3. About the Experience
**Rich text content**

✅ **Shows:**
- Short description (highlighted)
- Full description (prose formatting)

**Styling:** Large readable text, proper spacing

---

## 🖼️ 4. Photo Gallery
**Responsive image grid**

✅ **Features:**
- Gallery images (ordered)
- Image captions (hover overlay)
- Lazy loading

**Layout:** 1-3 columns (responsive), zoom on hover

---

## ✨ 5. What's Included
**Amenity badges**

✅ **Combines:**
- Experience amenities
- Venue amenities  
- Confirmed services

**Styling:** Secondary badge variant, wrapped layout

---

## 🗓️ 6. Itinerary
**Accordion day-by-day breakdown**

✅ **For each day:**
- Day number & title
- Day subtitle (optional)
- Activities with:
  - Time
  - Activity title
  - Description

**Interaction:** Collapsible accordion items

---

## 🏠 7. Rooms & Pricing
**Room option cards**

✅ **Each room shows:**
- Room photo
- Room name
- Price per person
- Discount badge (if active)
- Available spots
- Room notes
- "Select Room" button

**Layout:** 3-column responsive grid

---

## 📈 8. MVG Status
**Progress tracking**

✅ **Displays:**
- Current signups / Minimum required
- Visual progress bar
- Percentage complete
- Status message with deadline

**Styling:** Color-coded (green when confirmed)

---

## 🏛️ 9. Venue Section
**Venue details**

✅ **Includes:**
- Venue photos (4-image grid)
- Venue name
- Location with map icon
- Description
- Capacity
- Venue amenities (badges)

**Layout:** Photo grid, structured info

---

## 👤 10. Creator Section
**Your Host**

✅ **Shows:**
- Creator photo (64px circular)
- Creator name
- Tagline/bio

**Styling:** Horizontal layout, professional

---

## 🛎️ 11. Service Add-Ons
**Optional services**

✅ **Displays:**
- Service names (confirmed only)

**Styling:** Chip/pill layout, primary color theme

---

## 🎯 12. Final CTA
**Bottom call-to-action**

✅ **Contains:**
- "Ready to Join?" headline
- Contextual message (MVG-aware)
- Price reminder
- CTA button:
  - "Join Waitlist" (MVG not met)
  - "Book Now" (MVG met)

**Styling:** Gradient background, large prominent layout

---

## Key Features

✅ **Fully Responsive** - Mobile → Tablet → Desktop
✅ **Smart Conditionals** - Only shows sections with data
✅ **Access Control** - Respects event status (draft/pending/approved)
✅ **MVG Integration** - Dynamic messaging
✅ **SEO Optimized** - Semantic HTML, proper headings
✅ **Test Ready** - Comprehensive data-testid attributes
✅ **Performance** - Lazy loading, optimized images

## Data Fetched

All data comes from single API endpoint:
```
GET /api/e/:slugOrId
```

Returns complete event object with venue, creator, pricing, and all details.
