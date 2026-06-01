# Complete Taxonomy System - Venues & Experiences

**Date:** October 17, 2025  
**Purpose:** Harmonize venue facilities, amenities, categories, and vibes with Experience Builder taxonomy  

---

## 📋 Part 1: Canonical Taxonomy Lists

### 1.1 Experience Categories (ENUM - Strict)

**Database Type:** PostgreSQL ENUM  
**Why:** Fixed, well-defined categories that rarely change

```typescript
// Already defined in shared/schema.ts
export const categoryEnum = pgEnum("category", [
  "sports_wellness",      // Fitness, yoga, wellness retreats
  "retreats",            // Meditation, spiritual, personal growth
  "community_social",    // Meetups, networking, social gatherings
  "adventure_trips",     // Hiking, climbing, outdoor adventures
  "workations",          // Remote work + travel combinations
  "festivals_events"     // Conferences, festivals, celebrations
]);
```

**Trade-offs:**
- ✅ **PRO:** Type-safe, database-enforced, efficient storage
- ✅ **PRO:** No typos or inconsistencies
- ✅ **PRO:** Easy filtering and indexing
- ❌ **CON:** Requires migration to add new categories
- ❌ **CON:** Can't have user-created categories

**Recommendation:** ✅ **Use ENUM** - Categories are core to the platform and should be controlled

---

### 1.2 Venue Categories (TEXT[] - Flexible)

**Database Type:** TEXT[] (Array of strings)  
**Why:** Venues can have multiple types, may need custom categories

```typescript
// Canonical list for frontend selection
const VENUE_CATEGORIES = [
  // Retreat & Wellness
  "retreat_center",
  "yoga_studio",
  "meditation_center",
  "wellness_spa",
  "hot_springs",
  
  // Adventure & Nature
  "outdoor_camp",
  "eco_lodge",
  "mountain_lodge",
  "beach_resort",
  "safari_camp",
  "ranch",
  
  // Urban & Work
  "coworking_space",
  "workshop_space",
  "conference_center",
  "event_venue",
  "art_studio",
  "maker_space",
  
  // Accommodation
  "hotel",
  "hostel",
  "villa",
  "cabin",
  "glamping",
  "treehouse",
  "boat",
  
  // Specialty
  "farm",
  "vineyard",
  "castle",
  "monastery",
  "cultural_center",
  "sports_facility",
  "dance_studio",
  "music_venue",
  
  // Allow custom via text input
  "other"
] as const;

export type VenueCategory = typeof VENUE_CATEGORIES[number];
```

**Trade-offs:**
- ✅ **PRO:** Multiple categories per venue
- ✅ **PRO:** Easy to add new categories (no migration)
- ✅ **PRO:** Supports custom user input
- ❌ **CON:** Potential for typos/inconsistencies
- ❌ **CON:** Needs frontend validation

**Recommendation:** ✅ **Use TEXT[]** - Flexibility needed for diverse venue types

---

### 1.3 Venue Vibes (TEXT[] - Flexible)

**Database Type:** TEXT[] (Array of strings)  
**Why:** Subjective, multiple vibes per venue, user-created allowed

```typescript
// Canonical list for frontend selection
const VENUE_VIBES = [
  // Atmosphere
  "peaceful",
  "energetic",
  "adventurous",
  "serene",
  "rustic",
  "modern",
  "luxurious",
  "minimalist",
  "bohemian",
  "traditional",
  
  // Setting
  "remote",
  "secluded",
  "urban",
  "beachfront",
  "mountain",
  "forest",
  "desert",
  "lakeside",
  "countryside",
  
  // Social
  "intimate",
  "community-focused",
  "family-friendly",
  "adults-only",
  "couples-oriented",
  "solo-friendly",
  "group-friendly",
  
  // Focus
  "wellness-focused",
  "eco-friendly",
  "sustainable",
  "off-grid",
  "spiritual",
  "creative",
  "fitness-oriented",
  "cultural",
  "educational",
  
  // Experience
  "transformative",
  "healing",
  "rejuvenating",
  "challenging",
  "inspiring",
  "authentic",
  "unique",
  "accessible"
] as const;

export type VenueVibe = typeof VENUE_VIBES[number];
```

**Trade-offs:**
- ✅ **PRO:** Highly flexible and descriptive
- ✅ **PRO:** Multiple vibes capture complex atmospheres
- ✅ **PRO:** User-created vibes allowed for unique venues
- ❌ **CON:** Can become cluttered without curation
- ❌ **CON:** Harder to filter if too many options

**Recommendation:** ✅ **Use TEXT[]** - Essential for capturing venue atmosphere

---

### 1.4 Amenities (REFERENCE TABLE - Normalized)

**Database Type:** Reference table with junction table  
**Why:** Rich data (name, description, icon, category), reusable, searchable

```typescript
// Amenities stored in dedicated table
export const amenities = pgTable("amenities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category").notNull(), // "technology", "wellness", "comfort", etc.
  icon: varchar("icon"), // Lucide icon name
  popular: boolean("popular").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Canonical amenities list (seed data)
const AMENITIES = [
  // Technology
  { name: "WiFi", category: "technology", icon: "Wifi", popular: true },
  { name: "Projector", category: "technology", icon: "Projector", popular: false },
  { name: "Sound System", category: "technology", icon: "Speaker", popular: false },
  { name: "Video Conferencing", category: "technology", icon: "Video", popular: false },
  
  // Wellness
  { name: "Yoga Mats", category: "wellness", icon: "Heart", popular: true },
  { name: "Meditation Cushions", category: "wellness", icon: "CircleDot", popular: false },
  { name: "Sauna", category: "wellness", icon: "Thermometer", popular: false },
  { name: "Hot Tub", category: "wellness", icon: "Bath", popular: true },
  { name: "Massage Room", category: "wellness", icon: "HandMetal", popular: false },
  
  // Comfort
  { name: "Air Conditioning", category: "comfort", icon: "Wind", popular: true },
  { name: "Heating", category: "comfort", icon: "Flame", popular: true },
  { name: "Fireplace", category: "comfort", icon: "Flame", popular: false },
  { name: "Comfortable Seating", category: "comfort", icon: "Armchair", popular: true },
  
  // Food & Beverage
  { name: "Kitchen", category: "food_beverage", icon: "UtensilsCrossed", popular: true },
  { name: "Coffee/Tea", category: "food_beverage", icon: "Coffee", popular: true },
  { name: "Drinking Water", category: "food_beverage", icon: "Droplet", popular: true },
  { name: "BBQ Grill", category: "food_beverage", icon: "FlameKindling", popular: false },
  
  // Outdoor
  { name: "Outdoor Space", category: "outdoor", icon: "Trees", popular: true },
  { name: "Garden", category: "outdoor", icon: "Flower2", popular: false },
  { name: "Swimming Pool", category: "outdoor", icon: "Waves", popular: true },
  { name: "Hiking Trails", category: "outdoor", icon: "Mountain", popular: false },
  { name: "Beach Access", category: "outdoor", icon: "Palmtree", popular: false },
  
  // Safety
  { name: "First Aid Kit", category: "safety", icon: "Cross", popular: false },
  { name: "Fire Extinguisher", category: "safety", icon: "Flame", popular: false },
  { name: "Security", category: "safety", icon: "Shield", popular: false },
  
  // Accessibility
  { name: "Wheelchair Accessible", category: "accessibility", icon: "Accessibility", popular: true },
  { name: "Elevator", category: "accessibility", icon: "MoveVertical", popular: false },
  { name: "Accessible Bathroom", category: "accessibility", icon: "Bath", popular: false },
  
  // Transportation
  { name: "Parking", category: "transportation", icon: "Car", popular: true },
  { name: "Bike Storage", category: "transportation", icon: "Bike", popular: false },
  { name: "Airport Shuttle", category: "transportation", icon: "Plane", popular: false },
  
  // Entertainment
  { name: "Music System", category: "entertainment", icon: "Music", popular: false },
  { name: "Games", category: "entertainment", icon: "Gamepad2", popular: false },
  { name: "Library", category: "entertainment", icon: "Library", popular: false },
  
  // Sleeping
  { name: "Linens Provided", category: "sleeping", icon: "Bed", popular: true },
  { name: "Towels Provided", category: "sleeping", icon: "Shirt", popular: true },
  { name: "Private Rooms", category: "sleeping", icon: "DoorClosed", popular: true },
  { name: "Shared Rooms", category: "sleeping", icon: "Users", popular: false },
];
```

**Trade-offs:**
- ✅ **PRO:** Rich data model with descriptions and icons
- ✅ **PRO:** Reusable across venues and experiences
- ✅ **PRO:** Easy to search and filter
- ✅ **PRO:** Can mark popular amenities
- ❌ **CON:** More complex queries (requires joins)
- ❌ **CON:** Need separate custom_amenities for user input

**Recommendation:** ✅ **Use REFERENCE TABLE** - Already implemented, works well

---

### 1.5 Service Categories (ENUM - Strict)

**Database Type:** PostgreSQL ENUM  
**Why:** Well-defined service types

```typescript
// Already defined in shared/schema.ts
export const serviceCategoryEnum = pgEnum("service_category", [
  "accommodation",
  "food_beverage",
  "transportation",
  "equipment_rental",
  "wellness_spa",
  "adventure_sports",
  "guided_tours",
  "entertainment",
  "photography",
  "event_planning",
  "fitness_training",
  "creative_workshops",
  "technical_support",
  "language_translation",
  "childcare",
  "medical_support"
]);
```

**Recommendation:** ✅ **Use ENUM** - Service categories are platform-controlled

---

## 🔄 Part 2: Database Schema & Migration

### 2.1 Current Schema Status

**Already Implemented:**
- ✅ `categoryEnum` for experiences (ENUM)
- ✅ `serviceCategoryEnum` for services (ENUM)
- ✅ `amenities` reference table
- ✅ `venues.amenities` (TEXT[])
- ✅ `venues.categories` (TEXT[])
- ✅ `venues.vibes` (TEXT[])
- ✅ `venues.custom_amenities` (TEXT[])

**Schema is already optimal!** No migration needed for taxonomy structure.

### 2.2 Seed Data Migration (Amenities)

Create amenities seed data:

```sql
-- seed_amenities.sql
-- Populate amenities table with canonical list

BEGIN;

-- Technology
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'WiFi', 'High-speed wireless internet', 'technology', 'Wifi', true),
  (gen_random_uuid(), 'Projector', 'HD projector for presentations', 'technology', 'Projector', false),
  (gen_random_uuid(), 'Sound System', 'Professional audio equipment', 'technology', 'Speaker', false),
  (gen_random_uuid(), 'Video Conferencing', 'Zoom-ready meeting setup', 'technology', 'Video', false);

-- Wellness
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Yoga Mats', 'Clean, comfortable yoga mats', 'wellness', 'Heart', true),
  (gen_random_uuid(), 'Meditation Cushions', 'Zafu and zabuton cushions', 'wellness', 'CircleDot', false),
  (gen_random_uuid(), 'Sauna', 'Traditional or infrared sauna', 'wellness', 'Thermometer', false),
  (gen_random_uuid(), 'Hot Tub', 'Relaxing hot tub or jacuzzi', 'wellness', 'Bath', true),
  (gen_random_uuid(), 'Massage Room', 'Private massage treatment room', 'wellness', 'HandMetal', false);

-- Comfort
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Air Conditioning', 'Climate-controlled cooling', 'comfort', 'Wind', true),
  (gen_random_uuid(), 'Heating', 'Central or space heating', 'comfort', 'Flame', true),
  (gen_random_uuid(), 'Fireplace', 'Wood-burning or gas fireplace', 'comfort', 'Flame', false),
  (gen_random_uuid(), 'Comfortable Seating', 'Ergonomic chairs and sofas', 'comfort', 'Armchair', true);

-- Food & Beverage
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Kitchen', 'Full kitchen with appliances', 'food_beverage', 'UtensilsCrossed', true),
  (gen_random_uuid(), 'Coffee/Tea', 'Complimentary coffee and tea', 'food_beverage', 'Coffee', true),
  (gen_random_uuid(), 'Drinking Water', 'Filtered drinking water', 'food_beverage', 'Droplet', true),
  (gen_random_uuid(), 'BBQ Grill', 'Outdoor barbecue grill', 'food_beverage', 'FlameKindling', false);

-- Outdoor
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Outdoor Space', 'Patio, deck, or garden area', 'outdoor', 'Trees', true),
  (gen_random_uuid(), 'Garden', 'Beautiful landscaped garden', 'outdoor', 'Flower2', false),
  (gen_random_uuid(), 'Swimming Pool', 'Outdoor or indoor pool', 'outdoor', 'Waves', true),
  (gen_random_uuid(), 'Hiking Trails', 'Access to hiking trails', 'outdoor', 'Mountain', false),
  (gen_random_uuid(), 'Beach Access', 'Direct beach access', 'outdoor', 'Palmtree', false);

-- Safety
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'First Aid Kit', 'Stocked first aid supplies', 'safety', 'Cross', false),
  (gen_random_uuid(), 'Fire Extinguisher', 'Fire safety equipment', 'safety', 'Flame', false),
  (gen_random_uuid(), 'Security', '24/7 security or cameras', 'safety', 'Shield', false);

-- Accessibility
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Wheelchair Accessible', 'Full wheelchair accessibility', 'accessibility', 'Accessibility', true),
  (gen_random_uuid(), 'Elevator', 'Elevator or lift access', 'accessibility', 'MoveVertical', false),
  (gen_random_uuid(), 'Accessible Bathroom', 'ADA-compliant bathroom', 'accessibility', 'Bath', false);

-- Transportation
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Parking', 'Free on-site parking', 'transportation', 'Car', true),
  (gen_random_uuid(), 'Bike Storage', 'Secure bicycle storage', 'transportation', 'Bike', false),
  (gen_random_uuid(), 'Airport Shuttle', 'Airport pickup service', 'transportation', 'Plane', false);

-- Entertainment
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Music System', 'Quality sound system', 'entertainment', 'Music', false),
  (gen_random_uuid(), 'Games', 'Board games and activities', 'entertainment', 'Gamepad2', false),
  (gen_random_uuid(), 'Library', 'Book collection or library', 'entertainment', 'Library', false);

-- Sleeping
INSERT INTO amenities (id, name, description, category, icon, popular) VALUES
  (gen_random_uuid(), 'Linens Provided', 'Clean bed linens included', 'sleeping', 'Bed', true),
  (gen_random_uuid(), 'Towels Provided', 'Bath towels included', 'sleeping', 'Shirt', true),
  (gen_random_uuid(), 'Private Rooms', 'Private bedroom options', 'sleeping', 'DoorClosed', true),
  (gen_random_uuid(), 'Shared Rooms', 'Shared dormitory rooms', 'sleeping', 'Users', false);

COMMIT;

-- Verify
SELECT category, COUNT(*) as count
FROM amenities
GROUP BY category
ORDER BY category;
```

Run seed:
```bash
psql "$DATABASE_URL" -f seed_amenities.sql
```

---

## 🎨 Part 3: Frontend Taxonomy Constants

Create `shared/taxonomy.ts`:

```typescript
// shared/taxonomy.ts
// Canonical taxonomy lists for frontend use

export const VENUE_CATEGORIES = [
  // Retreat & Wellness
  { value: "retreat_center", label: "Retreat Center", group: "Retreat & Wellness" },
  { value: "yoga_studio", label: "Yoga Studio", group: "Retreat & Wellness" },
  { value: "meditation_center", label: "Meditation Center", group: "Retreat & Wellness" },
  { value: "wellness_spa", label: "Wellness Spa", group: "Retreat & Wellness" },
  { value: "hot_springs", label: "Hot Springs", group: "Retreat & Wellness" },
  
  // Adventure & Nature
  { value: "outdoor_camp", label: "Outdoor Camp", group: "Adventure & Nature" },
  { value: "eco_lodge", label: "Eco Lodge", group: "Adventure & Nature" },
  { value: "mountain_lodge", label: "Mountain Lodge", group: "Adventure & Nature" },
  { value: "beach_resort", label: "Beach Resort", group: "Adventure & Nature" },
  { value: "safari_camp", label: "Safari Camp", group: "Adventure & Nature" },
  { value: "ranch", label: "Ranch", group: "Adventure & Nature" },
  
  // Urban & Work
  { value: "coworking_space", label: "Coworking Space", group: "Urban & Work" },
  { value: "workshop_space", label: "Workshop Space", group: "Urban & Work" },
  { value: "conference_center", label: "Conference Center", group: "Urban & Work" },
  { value: "event_venue", label: "Event Venue", group: "Urban & Work" },
  { value: "art_studio", label: "Art Studio", group: "Urban & Work" },
  { value: "maker_space", label: "Maker Space", group: "Urban & Work" },
  
  // Accommodation
  { value: "hotel", label: "Hotel", group: "Accommodation" },
  { value: "hostel", label: "Hostel", group: "Accommodation" },
  { value: "villa", label: "Villa", group: "Accommodation" },
  { value: "cabin", label: "Cabin", group: "Accommodation" },
  { value: "glamping", label: "Glamping Site", group: "Accommodation" },
  { value: "treehouse", label: "Treehouse", group: "Accommodation" },
  { value: "boat", label: "Boat/Yacht", group: "Accommodation" },
  
  // Specialty
  { value: "farm", label: "Farm", group: "Specialty" },
  { value: "vineyard", label: "Vineyard", group: "Specialty" },
  { value: "castle", label: "Castle", group: "Specialty" },
  { value: "monastery", label: "Monastery", group: "Specialty" },
  { value: "cultural_center", label: "Cultural Center", group: "Specialty" },
  { value: "sports_facility", label: "Sports Facility", group: "Specialty" },
  { value: "dance_studio", label: "Dance Studio", group: "Specialty" },
  { value: "music_venue", label: "Music Venue", group: "Specialty" },
] as const;

export const VENUE_VIBES = [
  // Atmosphere
  { value: "peaceful", label: "Peaceful", emoji: "🕊️" },
  { value: "energetic", label: "Energetic", emoji: "⚡" },
  { value: "adventurous", label: "Adventurous", emoji: "🏔️" },
  { value: "serene", label: "Serene", emoji: "🧘" },
  { value: "rustic", label: "Rustic", emoji: "🪵" },
  { value: "modern", label: "Modern", emoji: "🏙️" },
  { value: "luxurious", label: "Luxurious", emoji: "💎" },
  { value: "minimalist", label: "Minimalist", emoji: "⚪" },
  { value: "bohemian", label: "Bohemian", emoji: "🌸" },
  { value: "traditional", label: "Traditional", emoji: "🏛️" },
  
  // Setting
  { value: "remote", label: "Remote", emoji: "🗺️" },
  { value: "secluded", label: "Secluded", emoji: "🌲" },
  { value: "urban", label: "Urban", emoji: "🌆" },
  { value: "beachfront", label: "Beachfront", emoji: "🏖️" },
  { value: "mountain", label: "Mountain", emoji: "⛰️" },
  { value: "forest", label: "Forest", emoji: "🌳" },
  { value: "desert", label: "Desert", emoji: "🏜️" },
  { value: "lakeside", label: "Lakeside", emoji: "🏞️" },
  { value: "countryside", label: "Countryside", emoji: "🌾" },
  
  // Social
  { value: "intimate", label: "Intimate", emoji: "💫" },
  { value: "community-focused", label: "Community-Focused", emoji: "👥" },
  { value: "family-friendly", label: "Family-Friendly", emoji: "👨‍👩‍👧‍👦" },
  { value: "adults-only", label: "Adults Only", emoji: "🔞" },
  { value: "couples-oriented", label: "Couples-Oriented", emoji: "💑" },
  { value: "solo-friendly", label: "Solo-Friendly", emoji: "🧳" },
  { value: "group-friendly", label: "Group-Friendly", emoji: "👫" },
  
  // Focus
  { value: "wellness-focused", label: "Wellness-Focused", emoji: "🧘‍♀️" },
  { value: "eco-friendly", label: "Eco-Friendly", emoji: "♻️" },
  { value: "sustainable", label: "Sustainable", emoji: "🌱" },
  { value: "off-grid", label: "Off-Grid", emoji: "🔋" },
  { value: "spiritual", label: "Spiritual", emoji: "🙏" },
  { value: "creative", label: "Creative", emoji: "🎨" },
  { value: "fitness-oriented", label: "Fitness-Oriented", emoji: "💪" },
  { value: "cultural", label: "Cultural", emoji: "🎭" },
  { value: "educational", label: "Educational", emoji: "📚" },
  
  // Experience
  { value: "transformative", label: "Transformative", emoji: "✨" },
  { value: "healing", label: "Healing", emoji: "💚" },
  { value: "rejuvenating", label: "Rejuvenating", emoji: "🌺" },
  { value: "challenging", label: "Challenging", emoji: "🎯" },
  { value: "inspiring", label: "Inspiring", emoji: "💡" },
  { value: "authentic", label: "Authentic", emoji: "🌟" },
  { value: "unique", label: "Unique", emoji: "🦄" },
  { value: "accessible", label: "Accessible", emoji: "♿" },
] as const;

export const EXPERIENCE_CATEGORIES = [
  { value: "sports_wellness", label: "Sports & Wellness", icon: "Heart", color: "text-green-600" },
  { value: "retreats", label: "Retreats", icon: "Mountain", color: "text-purple-600" },
  { value: "community_social", label: "Community & Social", icon: "Users", color: "text-blue-600" },
  { value: "adventure_trips", label: "Adventure Trips", icon: "Compass", color: "text-orange-600" },
  { value: "workations", label: "Workations", icon: "Briefcase", color: "text-indigo-600" },
  { value: "festivals_events", label: "Festivals & Events", icon: "PartyPopper", color: "text-pink-600" },
] as const;

export const AMENITY_CATEGORIES = [
  "technology",
  "wellness",
  "comfort",
  "food_beverage",
  "outdoor",
  "safety",
  "accessibility",
  "transportation",
  "entertainment",
  "sleeping"
] as const;

// Helper functions
export function getVenueCategoryLabel(value: string): string {
  return VENUE_CATEGORIES.find(c => c.value === value)?.label || value;
}

export function getVibeLabel(value: string): string {
  return VENUE_VIBES.find(v => v.value === value)?.label || value;
}

export function getExperienceCategoryLabel(value: string): string {
  return EXPERIENCE_CATEGORIES.find(c => c.value === value)?.label || value;
}
```

---

## 🔌 Part 4: API Endpoints

### 4.1 Taxonomy Endpoints

Add to `server/routes.ts`:

```typescript
// ========================================
// TAXONOMY ENDPOINTS
// ========================================

// Get all amenities
app.get("/api/taxonomy/amenities", async (req, res) => {
  try {
    const allAmenities = await storage.getAmenities();
    res.json(allAmenities);
  } catch (error) {
    console.error("Error fetching amenities:", error);
    res.status(500).json({ error: "Failed to fetch amenities" });
  }
});

// Get amenities by category
app.get("/api/taxonomy/amenities/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const amenities = await storage.getAmenitiesByCategory(category);
    res.json(amenities);
  } catch (error) {
    console.error("Error fetching amenities by category:", error);
    res.status(500).json({ error: "Failed to fetch amenities" });
  }
});

// Get popular amenities
app.get("/api/taxonomy/amenities/popular/list", async (req, res) => {
  try {
    const amenities = await storage.getPopularAmenities();
    res.json(amenities);
  } catch (error) {
    console.error("Error fetching popular amenities:", error);
    res.status(500).json({ error: "Failed to fetch popular amenities" });
  }
});

// Get venue categories (static)
app.get("/api/taxonomy/venue-categories", (req, res) => {
  const categories = [
    { value: "retreat_center", label: "Retreat Center", group: "Retreat & Wellness" },
    { value: "yoga_studio", label: "Yoga Studio", group: "Retreat & Wellness" },
    // ... full list from taxonomy.ts
  ];
  res.json(categories);
});

// Get venue vibes (static)
app.get("/api/taxonomy/venue-vibes", (req, res) => {
  const vibes = [
    { value: "peaceful", label: "Peaceful", emoji: "🕊️" },
    { value: "energetic", label: "Energetic", emoji: "⚡" },
    // ... full list from taxonomy.ts
  ];
  res.json(vibes);
});

// Get experience categories (static)
app.get("/api/taxonomy/experience-categories", (req, res) => {
  const categories = [
    { value: "sports_wellness", label: "Sports & Wellness" },
    { value: "retreats", label: "Retreats" },
    // ... full list from taxonomy.ts
  ];
  res.json(categories);
});
```

### 4.2 Storage Interface

Add to `server/storage.ts`:

```typescript
interface IStorage {
  // ... existing methods
  
  // Amenity methods
  getAmenities(): Promise<Amenity[]>;
  getAmenitiesByCategory(category: string): Promise<Amenity[]>;
  getPopularAmenities(): Promise<Amenity[]>;
  createAmenity(amenity: InsertAmenity): Promise<Amenity>;
}

// Implementation
class DbStorage implements IStorage {
  // ... existing methods
  
  async getAmenities(): Promise<Amenity[]> {
    return await this.db
      .select()
      .from(amenities)
      .orderBy(amenities.popular, amenities.name);
  }
  
  async getAmenitiesByCategory(category: string): Promise<Amenity[]> {
    return await this.db
      .select()
      .from(amenities)
      .where(eq(amenities.category, category))
      .orderBy(amenities.name);
  }
  
  async getPopularAmenities(): Promise<Amenity[]> {
    return await this.db
      .select()
      .from(amenities)
      .where(eq(amenities.popular, true))
      .orderBy(amenities.name);
  }
  
  async createAmenity(amenityData: InsertAmenity): Promise<Amenity> {
    const [amenity] = await this.db
      .insert(amenities)
      .values(amenityData)
      .returning();
    return amenity;
  }
}
```

---

Continued in next file...
