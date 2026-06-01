# MVG (Minimum Viable Group) - Data Flow & Calculation

## Overview

The MVG section on the Public Event Page is **fully implemented** and automatically fetches/calculates all values from the database. No additional work is needed!

---

## 🔄 Complete Data Flow

### 1. Database Schema

**Table:** `experiences`

**MVG Fields:**
```typescript
// shared/schema.ts (lines 244-247)
{
  mvgEnabled: boolean("mvg_enabled").default(true),
  mvgMinimumSize: integer("mvg_minimum_size").default(6),
  mvgDeadlineDays: integer("mvg_deadline_days").default(7),
  mvgStatus: mvgStatusEnum("mvg_status").default("pending"),
  
  // Related fields
  requireMinimumParticipants: boolean("require_minimum_participants"),
  minimumParticipants: integer("minimum_participants"),
  currentParticipants: integer("current_participants").default(0),
  mvgDeadline: timestamp("mvg_deadline"),
  escrowEnabled: boolean("escrow_enabled"),
}
```

### 2. Backend API (GET /api/e/:slugOrId)

**Location:** `server/routes.ts` (lines 1168-1176)

**Data Fetching:**
```typescript
// Fetch experience from database
const experience = await storage.getExperience(id);

// Map to MVG response object
mvg: {
  enabled: experience.requireMinimumParticipants || false,
  minimum_required: experience.minimumParticipants || experience.mvgMin || 0,
  current_signups: experience.currentParticipants || 0,
  soft_hold_deadline: experience.mvgDeadline,
  status: experience.mvgStatus || 'pending',
  escrow_enabled: experience.escrowEnabled || false,
}
```

**Fields Explained:**

| API Field | Database Source | Example |
|-----------|----------------|---------|
| `enabled` | `requireMinimumParticipants` | `true` |
| `minimum_required` | `minimumParticipants` or `mvgMin` | `20` |
| `current_signups` | `currentParticipants` | `12` |
| `soft_hold_deadline` | `mvgDeadline` | `"2024-03-15T00:00:00Z"` |
| `status` | `mvgStatus` | `"pending"` |
| `escrow_enabled` | `escrowEnabled` | `true` |

### 3. Frontend Display

**Location:** `client/src/pages/public-event-page.tsx` (lines 747-794)

**Rendering:**
```tsx
{event.mvg.enabled && (
  <Card>
    <CardContent className="p-8">
      <h2>Event Confirmation Status</h2>
      
      {/* Progress Info */}
      <div>
        <Users className="w-5 h-5 text-primary" />
        <span>
          {event.mvg.current_signups} of {event.mvg.minimum_required} participants joined
        </span>
        <span>
          {Math.round((event.mvg.current_signups / event.mvg.minimum_required) * 100)}%
        </span>
      </div>
      
      {/* Progress Bar */}
      <Progress 
        value={(event.mvg.current_signups / event.mvg.minimum_required) * 100} 
        className="h-3"
      />
      
      {/* Status Message */}
      <p>
        {event.mvg.current_signups >= event.mvg.minimum_required ? (
          <span className="text-green-700 font-medium">
            ✓ Event confirmed
          </span>
        ) : (
          <span>
            Confirmed once {event.mvg.minimum_required} join
            {event.mvg.soft_hold_deadline && 
              ` by ${formatDate(event.mvg.soft_hold_deadline)}`}
          </span>
        )}
      </p>
    </CardContent>
  </Card>
)}
```

---

## 📊 Value Calculations

### Percentage Calculation

**Formula:**
```typescript
const percentage = Math.round(
  (event.mvg.current_signups / event.mvg.minimum_required) * 100
);
```

**Examples:**
- 12 of 20 → 60%
- 15 of 20 → 75%
- 20 of 20 → 100%
- 22 of 20 → 110%

### Progress Bar Value

**Formula:**
```typescript
const progressValue = (event.mvg.current_signups / event.mvg.minimum_required) * 100;
```

**Visual:**
- 0-100: Partial fill
- 100+: Full bar (can exceed 100%)

### Status Message Logic

**Conditional Rendering:**
```typescript
if (event.mvg.current_signups >= event.mvg.minimum_required) {
  // Show: "✓ Event confirmed"
  return <span className="text-green-700">✓ Event confirmed</span>;
} else {
  // Show: "Confirmed once X join by [date]"
  return (
    <span>
      Confirmed once {event.mvg.minimum_required} join
      {event.mvg.soft_hold_deadline && ` by ${formatDate(deadline)}`}
    </span>
  );
}
```

**Output Examples:**
- Not met: `"Confirmed once 20 join by Mar 15, 2024"`
- Met: `"✓ Event confirmed"`

---

## 🔢 How Current Signups are Updated

### Automatic Updates

**When a booking is created:**
```typescript
// server/routes.ts - POST /api/bookings
const booking = await storage.createBooking({
  experienceId,
  userId,
  // ... other fields
});

// Update current participants count
await storage.incrementExperienceParticipants(experienceId);
// This increments experience.currentParticipants by 1
```

**When MVG is checked:**
```typescript
// server/routes.ts (lines 1551-1556)
if (experience.requireMinimumParticipants && experience.mvgStatus === "pending") {
  const bookings = await storage.getBookingsByExperience(experienceId);
  const currentBookings = bookings.filter(
    b => b.status === "confirmed" || b.status === "pending"
  ).length;
  
  const mvgMin = experience.mvgMin || experience.minimumParticipants || 6;
  
  if (currentBookings >= mvgMin) {
    // MVG MET - confirm event
    await storage.updateExperience(experienceId, { 
      mvgStatus: "confirmed" 
    });
  }
}
```

### Real-time Polling (Optional)

Frontend can poll for updates:
```typescript
const { data: mvgProgress } = useQuery({
  queryKey: [`/api/experiences/${eventId}/mvg-progress`],
  refetchInterval: 30000  // Poll every 30 seconds
});
```

---

## 📅 Deadline Calculation

### From Event Builder

**When creating event:**
```typescript
// Calculate deadline from start date and mvgDeadlineDays
const mvgDeadline = draft.mvgEnabled && draft.mvgDeadlineDays && startDate ? 
  new Date(startDate.getTime() - (draft.mvgDeadlineDays * 24 * 60 * 60 * 1000)) : 
  undefined;
```

**Example:**
- Start Date: `April 1, 2024`
- MVG Deadline Days: `7`
- Calculated Deadline: `March 25, 2024` (7 days before start)

### Display Format

```typescript
const formatDate = (dateString: string) => {
  return format(new Date(dateString), "MMM d, yyyy");
};

// Output: "Mar 25, 2024"
```

---

## 🎯 Complete Example

### Database State

```sql
SELECT 
  id,
  title,
  requireMinimumParticipants,
  minimumParticipants,
  currentParticipants,
  mvgDeadline,
  mvgStatus
FROM experiences
WHERE id = 'event-123';
```

**Result:**
```
id: event-123
title: "Summer Wellness Retreat"
requireMinimumParticipants: true
minimumParticipants: 20
currentParticipants: 12
mvgDeadline: "2024-03-15T00:00:00Z"
mvgStatus: "pending"
```

### API Response

```json
GET /api/e/event-123

{
  "id": "event-123",
  "title": "Summer Wellness Retreat",
  "mvg": {
    "enabled": true,
    "minimum_required": 20,
    "current_signups": 12,
    "soft_hold_deadline": "2024-03-15T00:00:00Z",
    "status": "pending",
    "escrow_enabled": true
  }
}
```

### Frontend Display

```
┌────────────────────────────────────────────┐
│  Event Confirmation Status                 │
│                                            │
│  👥 12 of 20 participants joined      60% │
│                                            │
│  [████████████░░░░░░░░░░░░]               │
│                                            │
│  Confirmed once 20 join by Mar 15, 2024   │
└────────────────────────────────────────────┘
```

---

## 🔍 Verification Steps

### 1. Check Database Values

```sql
SELECT 
  minimumParticipants as minimum_required,
  currentParticipants as current_signups,
  mvgDeadline as deadline,
  mvgStatus as status
FROM experiences
WHERE id = 'your-event-id';
```

### 2. Check API Response

```bash
curl http://localhost:5000/api/e/your-event-id | jq '.mvg'
```

**Expected:**
```json
{
  "enabled": true,
  "minimum_required": 20,
  "current_signups": 12,
  "soft_hold_deadline": "2024-03-15T00:00:00Z",
  "status": "pending",
  "escrow_enabled": true
}
```

### 3. Check Frontend Display

Visit: `http://localhost:5000/e/your-event-id`

Look for:
- ✅ Progress bar rendering
- ✅ "X of Y participants joined"
- ✅ Percentage calculation
- ✅ Status message with deadline

---

## 🔄 Update Flow

### When a New Booking is Made

1. **Booking Created**
   ```typescript
   await storage.createBooking(bookingData);
   ```

2. **Participant Count Updated**
   ```typescript
   await storage.incrementExperienceParticipants(experienceId);
   // currentParticipants incremented
   ```

3. **MVG Status Checked**
   ```typescript
   if (currentParticipants >= minimumParticipants) {
     await storage.updateExperience(experienceId, { 
       mvgStatus: "confirmed" 
     });
   }
   ```

4. **Frontend Refetches**
   ```typescript
   // React Query automatically refetches on window focus
   // Or manual refetch every 30s if polling enabled
   ```

5. **UI Updates**
   - Progress bar fills
   - Percentage updates
   - Status message may change to "✓ Event confirmed"

---

## 📊 Database Fields Reference

### Core MVG Fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `mvgEnabled` | boolean | `true` | Enable MVG feature |
| `mvgMinimumSize` | integer | `6` | Minimum participants required |
| `mvgDeadlineDays` | integer | `7` | Days before start for deadline |
| `mvgStatus` | enum | `"pending"` | Current MVG status |
| `requireMinimumParticipants` | boolean | - | MVG enabled flag |
| `minimumParticipants` | integer | - | Min required (primary field) |
| `currentParticipants` | integer | `0` | Current signup count |
| `mvgDeadline` | timestamp | - | Calculated deadline date |
| `escrowEnabled` | boolean | - | Payment escrow enabled |

### Status Values

- `"pending"` - Waiting for minimum participants
- `"confirmed"` - Minimum reached, event confirmed
- `"cancelled"` - Deadline passed without minimum

---

## 🎨 Display States

### State 1: Pending (Not Met)

**Condition:** `current_signups < minimum_required`

**Display:**
```
👥 12 of 20 participants joined        60%
[████████████░░░░░░░░░░░░]
Confirmed once 20 join by Mar 15, 2024
```

### State 2: Confirmed (Met)

**Condition:** `current_signups >= minimum_required`

**Display:**
```
👥 22 of 20 participants joined       110%
[████████████████████████████████████]
✓ Event confirmed
```

### State 3: No Deadline

**Condition:** `soft_hold_deadline === null`

**Display:**
```
👥 12 of 20 participants joined        60%
[████████████░░░░░░░░░░░░]
Confirmed once 20 join
```

---

## ✅ Summary

**All Values Are Automatically Calculated:**

✅ **minimum_required** ← `experience.minimumParticipants` (database)  
✅ **current_signups** ← `experience.currentParticipants` (database)  
✅ **percentage** ← Calculated: `(current / minimum) * 100`  
✅ **progress_bar** ← Visual: percentage fill  
✅ **deadline** ← `experience.mvgDeadline` (database)  
✅ **status_message** ← Conditional: based on current vs minimum  

**No Additional Work Needed:**
- Database fields exist ✅
- Backend fetching works ✅
- Frontend calculations work ✅
- Display logic complete ✅

The MVG section is **fully functional** and ready to use!
