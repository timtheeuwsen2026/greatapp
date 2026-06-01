# Homepage Documentation - Community-Backed Travel Platform

## Overview
The homepage implements a social-first design emphasizing traveler connections and group formation with the tagline "Find Your Tribe, Fund Your Adventure". It features live community trips with MVG (Minimum Viable Group) funding mechanics and complete journey sections.

## Page Structure

### 1. **Navigation Bar**
- Logo and brand name
- Navigation links: Home, Experiences, Community, Venues
- User authentication controls (Login/Profile)
- **Test ID**: `button-login`, `button-create-experience`

### 2. **Hero Section (50vh)**
- **Headline**: "Find Your Tribe, Fund Your Adventure"
- **Subheadline**: "Join community-backed experiences that only happen when enough travelers commit. Connect first, travel together."
- **CTA Buttons**:
  - "Explore Adventures" (Primary) - `button-explore-adventures`
  - "How It Works" (Secondary) - `button-how-it-works`
- **Background**: Gradient overlay on full-width hero image

### 3. **Live Community Trips Section**
- **Headline**: "Adventures Backed by Real Travelers"
- **Subheadline**: "These trips are happening because communities like yours made them possible"
- **Layout**: Horizontal scrolling cards on mobile, grid on desktop
- **4 Featured Trips**:

#### Trip 1: Alpine Yoga Retreat
- **Image**: `attached_assets/stock_images/alpine_yoga_retreat__ec441345.jpg` (640×426 px)
- **Location**: Swiss Alps, Switzerland
- **Dates**: March 15-22, 2025
- **Status**: 6/8 spots filled
- **Reserve Amount**: $450
- **Travelers**: 6 avatars with hover tooltips (Emma, Jake, Sophia, Liam, Olivia, Noah)
- **Test ID**: `card-trip-alpine-yoga`, `button-join-alpine-yoga`

#### Trip 2: Bali Surf & Mindfulness
- **Image**: `attached_assets/stock_images/bali_surf_retreat_be_43f7cb51.jpg` (640×426 px)
- **Location**: Canggu, Bali
- **Dates**: April 10-17, 2025
- **Status**: 5/10 spots filled
- **Reserve Amount**: $350
- **Travelers**: 5 avatars with hover tooltips
- **Test ID**: `card-trip-bali-surf`, `button-join-bali-surf`

#### Trip 3: Tuscany Art Workshop
- **Image**: `attached_assets/stock_images/tuscany_art_workshop_e9f6dadf.jpg` (640×426 px)
- **Location**: Florence, Italy
- **Dates**: May 5-12, 2025
- **Status**: 4/6 spots filled
- **Reserve Amount**: $520
- **Travelers**: 4 avatars with hover tooltips
- **Test ID**: `card-trip-tuscany-art`, `button-join-tuscany-art`

#### Trip 4: Costa Rica Cycling Adventure
- **Image**: `attached_assets/stock_images/costa_rica_cycling_n_91881812.jpg` (640×426 px)
- **Location**: San José, Costa Rica
- **Dates**: June 1-8, 2025
- **Status**: 8/8 spots filled (MVG CONFIRMED ✅)
- **Reserve Amount**: $399
- **Travelers**: 8 avatars with hover tooltips
- **Progress Bar**: Green highlighted (MVG reached)
- **Test ID**: `card-trip-costa-rica`, `button-join-costa-rica`

### 4. **How It Works Section**
- **4-Step Process**:
  1. **Discover Your Tribe** - Browse community-backed experiences
  2. **Reserve Your Spot** - Small deposit holds your place
  3. **Community Confirms** - Trip happens when MVG is reached
  4. **Adventure Together** - Experience with your new community

### 5. **Win/Win/Win Section**
- **3-Column Layout**:
  - **Travelers** (4 benefits with icons)
  - **Creators** (4 benefits with icons)
  - **Venues** (4 benefits with icons)
- **Individual CTAs** for each audience type

### 6. **Community Success Stories**
- **Carousel with 3 stories**:
  - **Bali Yoga Tribe** - Sarah's testimonial (12 participants)
  - **Portugal Digital Nomads** - Marcus's testimonial (8 participants)
  - **Iceland Adventure Squad** - Lisa's testimonial (10 participants)
- Each story includes participant avatars and social proof
- **Test ID**: `button-join-community-stories`

### 7. **Featured Community Venues**
- **3 Venue Cards** (Horizontal scroll on mobile):

#### Mountain Eco Lodge
- **Image**: Unsplash (Swiss Alps landscape)
- **Location**: Swiss Alps, Switzerland
- **Capacity**: 6-12 guests
- **Badge**: Eco-Certified
- **Amenities**: Meditation garden & yoga studio, Farm-to-table organic meals, Mountain hiking trails
- **Test ID**: `button-view-mountain-lodge`

#### Bali Beach Retreat
- **Image**: Unsplash (Bali beach scene)
- **Location**: Canggu, Bali
- **Capacity**: 8-16 guests
- **Badge**: Beachfront
- **Amenities**: Infinity pool & surf lessons, Open-air yoga pavilion, Co-working space with ocean views
- **Test ID**: `button-view-bali-retreat`

#### Tuscan Art Villa
- **Image**: Unsplash (Tuscany villa)
- **Location**: Tuscany, Italy
- **Capacity**: 6-14 guests
- **Badge**: Historic
- **Amenities**: Professional art studio, Wine tasting & cooking classes, Panoramic terrace & gardens
- **Test ID**: `button-view-tuscan-villa`

### 8. **Trusted by Community Builders**
- **3 Testimonials** (Grid layout):
  - **Maria** - Yoga Retreat Participant (5 stars)
  - **Alex** - Surf Retreat Creator (5 stars)
  - **Bali Retreat Center** - Venue Partner (5 stars)

- **Community Trust Features** (2×2 Grid):
  - ✅ Payments held until community confirms
  - ✅ Full refund if community doesn't form
  - ✅ Verified creators
  - ✅ 24/7 community support

## Image Assets

### Trip Images (640×426 px)
All located in `attached_assets/stock_images/`:
- `alpine_yoga_retreat__ec441345.jpg` - Swiss Alps mountain scene
- `bali_surf_retreat_be_43f7cb51.jpg` - Bali beach and surf scene
- `tuscany_art_workshop_e9f6dadf.jpg` - Tuscan countryside landscape
- `costa_rica_cycling_n_91881812.jpg` - Costa Rica cycling trail

### Traveler Avatars (64px circular)
Imported in `client/src/pages/home.tsx`:
- `avatar1.jpg` - Used for Emma, Maria
- `avatar2.jpg` - Used for Jake, multiple trips
- `avatar3.jpg` - Used for Sophia, multiple trips
- `avatar4.jpg` - Used for Liam, Alex, multiple trips

### Venue Images
Currently using Unsplash URLs (can be replaced with custom images):
- Mountain Eco Lodge: `photo-1506905925346-21bda4d32df4`
- Bali Beach Retreat: `photo-1559827260-dc66d52bef19`
- Tuscan Art Villa: `photo-1523531294919-4bcd7c65e216`

## Technical Implementation

### Components Used
- **FundingProgressBar** - Custom component with MVG confirmation state
- **CountdownTimer** - Displays time remaining for trip funding
- **JoinTripModal** - Modal for trip reservations (not yet implemented)
- **shadcn/ui components**: Card, Button, Badge, Tabs, Tooltip

### Avatar Features
- **Size**: 64px circular with 2px white border
- **Tooltips**: Show first name on hover
- **Online Indicators**: Green dot (8px) for active travelers
- **Hover Effects**: Scale to 110% on hover
- **Stacking**: Overlapping layout with `-ml-3` offset

### MVG Display Logic
- **Below MVG**: Shows "⚡ Only $X to reserve" + progress bar + spots count
- **MVG Reached**: Shows "Community Confirmed ✅" + green progress bar (100%)
- Costa Rica trip demonstrates confirmed state (8/8 spots)

### Responsive Design
- **Mobile**: Horizontal scrolling sections with snap points
- **Tablet (md)**: 2-column grids
- **Desktop (lg)**: 3-4 column grids, fixed positioning
- **Tailwind utilities**: `snap-x`, `snap-mandatory`, `overflow-x-auto`, `scrollbar-hide`

## API Endpoints

### Currently Implemented
- `GET /api/experiences` - Fetches all approved experiences
- `GET /api/experiences/:id` - Fetches single experience details
- `GET /api/experiences/funding/active` - Fetches experiences with active funding rounds

### Authentication
- Uses Replit Auth with session-based authentication
- Role-based access control (participant, creator, venue provider, service provider)

## Creator Listing Flow (Create → Admin Review → Public)

### Complete Flow Overview
1. **Creator creates draft** → POST /api/trips (authenticated)
2. **Creator updates draft** → PUT /api/trips/:id (authenticated, owner only)
3. **Creator submits for review** → POST /api/trips/:id/submit (authenticated, validated)
4. **Admin reviews pending** → GET /api/admin/trips (admin only: timtheeuwsen@gmail.com)
5. **Admin approves** → POST /api/admin/trips/:id/approve (admin only)
6. **Public sees approved** → GET /api/experiences?status=approved (public)

### API Endpoints Reference

**Creator Endpoints (Authenticated)**:
- `POST /api/trips` - Create new trip draft
- `PUT /api/trips/:id` - Update existing draft
- `POST /api/trips/:id/submit` - Submit for admin review (validates required fields)

**Admin Endpoints (Admin Only - timtheeuwsen@gmail.com)**:
- `GET /api/admin/trips` - List all pending trips awaiting review
- `POST /api/admin/trips/:id/approve` - Approve trip (sets status=published)

**Public Endpoints**:
- `GET /api/experiences?status=approved` - List all approved experiences (default)

### Validation on Submit
When creators submit (`POST /api/trips/:id/submit`), the following are required:
- Title (non-empty)
- Description (non-empty)
- Start date (valid future date)
- Location (non-empty)
- Price (greater than 0)

### Status Flow
- **draft** → saved in experience_drafts table, visible only to creator
- **pending_approval** → submitted, visible to admin in /api/admin/trips
- **published/approved** → approved by admin, visible on public homepage

## Data Sources & No Fantasy Policy

**CRITICAL: All data comes from real database queries - NO hard-coded fantasy data**

### API Endpoints Used
- **Primary**: `GET /api/experiences?status=approved` - Fetches all approved experiences
- **Stats**: Experience stats embedded in response (currentParticipants, minimumParticipants, price)
- **Refresh**: Queries refresh every 30 seconds for live updates

### Database Fields Used
The homepage displays **ONLY** these real database fields:
- `currentParticipants` - Actual participant count from bookings table
- `minimumParticipants` - MVG threshold from experiences table
- `price` - Experience price from experiences table
- `mvgDeadline` or `startDate` - Funding deadline
- `coverImageUrl` - Experience cover image
- `title`, `location`, `category`, `creatorName` - Experience metadata

## Trip Data Model - Required Fields

**All trip records contain these fields (database → API mapping):**

### Direct Database Mappings
| Required Field | Database Column | Type | Description |
|----------------|----------------|------|-------------|
| `id` | `experiences.id` | string | Unique trip identifier (UUID) |
| `title` | `experiences.title` | string | Trip title |
| `description` | `experiences.description` | string | Full trip description |
| `image_urls` | `experiences.gallery` | string[] | Array of image URLs (jsonb) |
| `cover_image` | `experiences.coverImageUrl` | string\|null | Main cover photo URL |
| `host_id` | `experiences.creatorId` | string | Creator/host user ID |
| `seats_total` | `experiences.maxParticipants` | number | Maximum capacity |
| `seats_taken` | `experiences.currentParticipants` | number | Current participants count |
| `mvg_spots` | `experiences.minimumParticipants` | number | Minimum viable group size |
| `unlock_price` | `experiences.depositAmount` | number | Deposit/unlock amount |
| `end_date` | `experiences.endDate` | Date | Trip end date |
| `status` | `experiences.status` | string | Trip status (draft/pending/approved) |
| `chat_group_id` | `experiences.chatGroupId` | string\|null | Chat group reference |
| `created_at` | `experiences.createdAt` | Date | Creation timestamp |

### Calculated/Computed Fields
| Required Field | Calculation | Description |
|----------------|-------------|-------------|
| `mvg_target_amount` | `price * minimumParticipants` | Total funding goal |
| `funded_amount` | `SUM(bookings.amount)` where status='confirmed' | Current funding total |
| `funded_percent` | `(funded_amount / mvg_target_amount) * 100` | Funding progress % |

### Type Conversions
- Database DECIMAL fields (`price`, `depositAmount`) → Convert to `number` in API responses
- Database TIMESTAMP fields → Convert to JavaScript `Date` objects
- Database JSONB arrays → Parse to native JavaScript arrays

### Friendly Fallbacks (No Invented Values)
When real data is missing, friendly messages are shown:
- **No trips exist**: "No Adventures Available Yet. Check back soon or create your own!"
- **0 participants**: "Be the first to join! Start the community and get early founder perks"
- **Missing price**: "Price coming soon"
- **All counts show 0** when no bookings exist (never shows fake "4/6" or "5/10" values)

### What Was Removed
- ❌ `SAMPLE_TRIPS` array with hard-coded fantasy data (4/6 spots, 5/10 spots, etc.)
- ❌ Placeholder avatar images and participant names
- ❌ Invented chat counts ("4 chatting now" when no real data)
- ❌ Calculated funding amounts not from database
- ❌ Any fallback to fake data for demo purposes

## QA Verification Checklist

### ✅ Hero Section
- [x] Tagline "Find Your Tribe, Fund Your Adventure" displays correctly
- [x] Both CTA buttons present and functional
- [x] Hero section is exactly 50vh height
- [x] Background gradient overlay applies correctly

### ✅ Live Community Trips (Real Data)
- [x] Section starts mid-screen (after 50vh hero)
- [x] Shows empty state when no approved experiences exist
- [x] Fetches data from `GET /api/experiences?status=approved`
- [x] Displays only real database values for participant counts
- [x] Shows "Be the first to join" when currentParticipants = 0
- [x] Shows "Price coming soon" when price is missing
- [x] No fantasy/placeholder data displayed
- [x] Horizontal scroll works on mobile when trips exist

### ✅ Empty State Display
- [x] Shows when `filteredExperiences.length === 0`
- [x] Friendly message: "No Adventures Available Yet"
- [x] "Create an Experience" CTA button functional
- [x] No fallback to sample/demo data

### ✅ Complete Section Order
1. [x] Navigation
2. [x] Hero (50vh)
3. [x] Live Community Trips
4. [x] How It Works
5. [x] Win/Win/Win
6. [x] Community Success Stories
7. [x] Featured Community Venues
8. [x] Trusted by Community Builders
9. [ ] Footer (not yet implemented)

### ✅ Interactive Elements
- [x] All buttons have proper test IDs
- [x] Click handlers navigate correctly
- [x] Hover effects smooth and performant
- [x] Tooltips appear on avatar hover
- [x] Cards have shadow effects on hover

## Performance Notes
- All images optimized for web (640×426 px)
- Lazy loading not implemented (consider for future)
- Horizontal scroll uses CSS `snap-x` for smooth UX
- Tailwind's `scrollbar-hide` utility for clean appearance

## Future Enhancements
- [ ] Implement JoinTripModal functionality
- [ ] Add Footer component
- [ ] Connect to real-time funding data via WebSocket
- [ ] Implement lazy loading for images
- [ ] Add animation on scroll (AOS)
- [ ] Record demo video showing scroll and hover behavior
- [ ] Add meta tags for SEO and social sharing

## Development Notes
- File location: `client/src/pages/home.tsx`
- Uses Wouter for routing
- TanStack Query for data fetching
- Development URL: `http://localhost:5000/`
- Backend runs on port 5000 (Express + Vite)
