# 🎬 Full Staging Demonstration - MVG Platform

## Complete End-to-End Scenario

This document walks through a complete MVG (Minimum Viable Group) scenario from trip creation to automatic confirmation or refund.

---

## 🎯 Demo Scenario Overview

**Goal:** Create a trip, collect deposits, and watch the MVG system automatically confirm or cancel

**Timeline:** 
- **Phase 1:** Creator lists trip (5 minutes)
- **Phase 2:** Participants reserve spots (10 minutes)
- **Phase 3:** MVG auto-confirmation OR auto-cancellation (automatic)

**Participants:**
- **1 Creator** (creates the trip)
- **10 Participants** (minimum needed for MVG)
- **System** (automatically confirms or cancels)

---

## 📋 Pre-Demo Checklist

### System Requirements
- ✅ Server running on port 5000
- ✅ MVG Scheduler active (15-minute intervals)
- ✅ WebSocket server connected
- ✅ Stripe integration configured (test mode)
- ✅ Database initialized and migrations applied

### Test Accounts Needed
- **1 Creator account** (can be your main account)
- **10 Participant accounts** (or multiple browser sessions/incognito)

### Stripe Test Card
```
Card Number: 4242 4242 4242 4242
Expiration:  12/25 (any future date)
CVC:         123 (any 3 digits)
ZIP:         12345 (any 5 digits)
```

---

## 🎬 PHASE 1: Create & Publish Trip (Creator)

### Step 1.1: Log in as Creator
1. Go to homepage
2. Click **"Login"** (top right)
3. Authenticate via Replit Auth
4. Verify you're logged in (see profile icon/name)

**Expected:**
- ✅ Redirected to homepage
- ✅ See user menu with "Creator Dashboard" option
- ✅ See "Start a Trip" button

---

### Step 1.2: Navigate to Journey Builder
1. Click **"Start a Trip"** button (hero section or footer)
2. OR click profile menu → **"Creator Dashboard"** → **"Create New Trip"**

**Expected:**
- ✅ Redirected to `/journey-builder`
- ✅ See Step 1: Basic Information

---

### Step 1.3: Fill Basic Information (Step 1)
Fill in the following:

```
Title:        "7-Day Yoga & Meditation Retreat in Bali"
Category:     "Retreat"
Type:         "Wellness"
Location:     "Ubud, Bali, Indonesia"
Start Date:   [30 days from today]
End Date:     [37 days from today - 7 days duration]
Description:  "Join us for a transformative week of yoga, meditation, 
               and mindfulness in the heart of Bali. Daily practices, 
               organic meals, and jungle excursions included."
```

Click **"Next"** (or "Save & Continue")

**Expected:**
- ✅ Form validation passes
- ✅ Advance to Step 2: Media & Photos

---

### Step 1.4: Upload Photos (Step 2)
1. Upload cover image (drag & drop or select)
2. Upload 2-3 gallery images
3. Click **"Next"**

**Expected:**
- ✅ Photos upload successfully (progress bars)
- ✅ Thumbnails appear
- ✅ Advance to Step 3 (or next step)

*Note: If no images available, you can skip this step for demo purposes*

---

### Step 1.5: Configure Pricing & Capacity (Relevant Step)
Fill in critical MVG settings:

```
Price per Person:       $1,500
Capacity (Max People):  20
MVG Threshold:          10 people (50% of capacity)
Deposit Amount:         $300
MVG Deadline:           [15 days from today]
```

**Critical Fields Explained:**
- **MVG Threshold:** Minimum number of deposits needed to confirm trip
- **Deposit Amount:** Refundable deposit each participant pays
- **MVG Deadline:** Date by which MVG must be met (or trip auto-cancels)

Click **"Next"** through remaining steps

**Expected:**
- ✅ MVG settings saved
- ✅ System calculates: "Need 10 people minimum"

---

### Step 1.6: Complete Trip Creation
1. Fill in any remaining required fields (itinerary, terms, etc.)
2. Review trip summary
3. Click **"Submit for Approval"** or **"Publish Trip"**

**Expected:**
- ✅ Trip created successfully
- ✅ See confirmation message
- ✅ Trip status: `pending` (if admin approval required) or `approved` (if auto-publish)

---

### Step 1.7: Admin Approval (If Required)
**As Admin:**
1. Go to **Admin Dashboard** (`/admin`)
2. Find trip in "Pending Approval" section
3. Click **"Approve"**

**Expected:**
- ✅ Trip status changes to `approved`
- ✅ Trip now visible on homepage
- ✅ MVG status: `pending`

---

### Step 1.8: Verify Trip on Homepage
1. Navigate to homepage (`/`)
2. Scroll to "Featured Upcoming Trips" section
3. Find your newly created trip

**Expected Display:**
- ✅ Trip card shows:
  - Title: "7-Day Yoga & Meditation Retreat in Bali"
  - Location: "Ubud, Bali, Indonesia"
  - Price: "$1,500"
  - MVG Badge: "0/10 spots filled" or "Find Your Tribe"
  - Progress bar at 0%
  - **"Reserve Your Spot"** button

---

## 🎬 PHASE 2: Reserve Spots (Participants)

### Step 2.1: Participant 1 - First Deposit

**As Participant 1:**
1. Click on the trip card
2. View trip details page
3. Click **"Reserve Your Spot"** or **"Join This Trip"**
4. Modal opens showing deposit information:
   ```
   Deposit: $300 (refundable until MVG met)
   Full Price: $1,500
   MVG Progress: 0/10 people
   ```
5. Click **"Confirm & Pay Deposit"**
6. Enter Stripe test card: `4242 4242 4242 4242`
7. Submit payment

**Expected Results:**
- ✅ Stripe payment intent created (uncaptured)
- ✅ Booking status: `pending`
- ✅ Deposit status: `refundable`
- ✅ Success message: "Spot reserved! Your $300 deposit is refundable until MVG is met."
- ✅ **Real-time update:** Progress bar jumps to 10% (1/10)
- ✅ WebSocket broadcast sent to all connected clients

**What Happens Behind the Scenes:**
```javascript
// Stripe Payment Intent
{
  amount: 30000, // $300 in cents
  currency: 'usd',
  capture_method: 'manual', // ← Refundable!
  status: 'requires_capture'
}

// Database Updates
bookings: {
  status: 'pending',
  depositStatus: 'refundable',
  stripePaymentIntentId: 'pi_xyz...'
}

experiences: {
  currentParticipants: 1 (pending),
  mvgStatus: 'pending'
}
```

---

### Step 2.2: Real-Time Updates Verification

**Open in 2nd Browser/Tab (as Observer):**
1. Navigate to homepage
2. Find the trip card
3. **Watch progress update WITHOUT refreshing**

**Expected:**
- ✅ Progress bar updates from 0% → 10%
- ✅ Text updates: "1/10 spots filled"
- ✅ No page refresh needed
- ✅ Update happens within 1-2 seconds

---

### Step 2.3: Participants 2-9 - Additional Deposits

**Repeat Step 2.1 for Participants 2 through 9:**
- Use different user accounts (or incognito browsers)
- Each participant makes $300 deposit
- Use same test card: `4242 4242 4242 4242`

**Expected After Each Deposit:**
- ✅ Progress bar increments: 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%
- ✅ Participant count updates: 2/10, 3/10, 4/10... 9/10
- ✅ All pages update in real-time via WebSocket
- ✅ All deposits remain `refundable` (not captured yet)

**After 9 Deposits:**
```
Progress: 90% (9/10 people)
MVG Status: Still 'pending'
Trip Status: Still 'approved'
Remaining: Need 1 more person!
```

---

### Step 2.4: Participant 10 - MVG THRESHOLD REACHED! 🎉

**As Participant 10 (the final participant):**
1. Make deposit using same process
2. Enter test card: `4242 4242 4242 4242`
3. Click **"Confirm & Pay Deposit"**

**Expected - AUTOMATIC MVG CONFIRMATION:**

**Immediate Actions (< 1 second):**
1. ✅ All 10 Stripe payment intents **captured** (money charged)
2. ✅ Trip status → `confirmed`
3. ✅ MVG status → `met`
4. ✅ All booking statuses → `confirmed`
5. ✅ All deposit statuses → `locked` (no longer refundable)
6. ✅ `currentParticipants` → 10

**Visual Feedback:**
- ✅ **Success banner appears:** "🎉 Trip Confirmed! Minimum group reached!"
- ✅ Progress bar turns green at 100%
- ✅ Badge changes to: **"CONFIRMED - Trip Happening!"**
- ✅ MVG messaging removed (no longer relevant)
- ✅ Deposit now shows: "$300 deposit charged (trip confirmed)"

**Notifications Sent (all 10 participants):**
```
Title: "Trip Confirmed! 🎉"
Message: "Great news! '7-Day Yoga & Meditation Retreat in Bali' has 
         reached the minimum group size and is now confirmed. Your 
         $300 deposit has been charged. See you in Ubud!"
```

**Real-Time Broadcast:**
- ✅ All connected clients receive WebSocket update
- ✅ Homepage refreshes trip status
- ✅ Detail page shows "CONFIRMED" badge
- ✅ Recently Funded section on homepage shows this trip

**Database State:**
```sql
-- experiences table
{
  status: 'confirmed',
  mvgStatus: 'met',
  currentParticipants: 10,
  confirmedAt: '2024-11-14 23:15:00'
}

-- bookings table (all 10)
{
  status: 'confirmed',
  depositStatus: 'locked'
}
```

**Stripe Dashboard:**
```
Payment Intents: 10 succeeded (captured)
Total Revenue: $3,000 captured
Status: All deposits moved from "Uncaptured" to "Succeeded"
```

---

## 🎬 PHASE 3: Alternative - MVG Auto-Cancellation Demo

### Scenario: MVG Deadline Expires Without Reaching Threshold

**Setup for Cancellation Demo:**
1. Create a new trip with MVG settings:
   ```
   MVG Threshold: 10 people
   MVG Deadline:  [Set to 5 minutes from now, or use past date for testing]
   Deposit:       $300
   ```
2. Make only **5 deposits** (not enough for MVG)
3. Wait for deadline to pass
4. Wait up to **15 minutes** for scheduler to run

---

### Step 3.1: Scheduler Detection

**After deadline passes, within 15 minutes:**

**Server Logs Show:**
```
[MVG Scheduler] Checking for expired MVG deadlines...
[MVG Scheduler] Found 1 expired MVG deadline: Trip ID 123
[MVG Scheduler] Processing failed MVG for trip: 7-Day Yoga Retreat
[MVG Scheduler] Processing 5 pending bookings...
```

---

### Step 3.2: Automatic Refund Processing

**For Each of the 5 Bookings:**

**Server Logs:**
```
[Refund] Processing refund for booking 1, PaymentIntent: pi_xyz...
[Refund] Stripe refund successful: re_abc123
[Refund] Updated booking status: cancelled, depositStatus: refunded
[Refund] Processing refund for booking 2...
[Refund] Stripe refund successful: re_def456
...
```

**Expected Actions (all automatic):**
1. ✅ Stripe refund API called for each payment intent
2. ✅ Refunds processed: 5 × $300 = $1,500 total refunded
3. ✅ Booking statuses → `cancelled`
4. ✅ Deposit statuses → `refunded`
5. ✅ Trip status → `cancelled`
6. ✅ MVG status → `failed`
7. ✅ `cancelledAt` timestamp recorded
8. ✅ `currentParticipants` → 0

---

### Step 3.3: Participant Notifications

**All 5 Participants Receive:**
```
Title: "Trip Cancelled - Full Refund Processed"

Message: "Unfortunately, '7-Day Yoga & Meditation Retreat in Bali' 
         didn't reach the minimum group size by the deadline. 
         
         Your $300 deposit has been fully refunded to your original 
         payment method. You should see it in 5-10 business days.
         
         We hope you'll join us on another adventure soon!"
```

**Edge Case - Already Cancelled Booking:**
```
Title: "Trip Cancelled"

Message: "The trip you were interested in didn't reach minimum 
         group size. Since you already cancelled your booking, 
         no refund is needed."
```

---

### Step 3.4: Real-Time UI Updates

**All Connected Clients See:**
- ✅ Trip disappears from active listings
- ✅ OR shows "CANCELLED" badge
- ✅ Detail page shows:
  ```
  Status: Cancelled
  Reason: Minimum group size not reached
  Refunds: Processed for all participants
  ```

**WebSocket Broadcast:**
```javascript
{
  type: 'trip_cancelled',
  tripId: 123,
  mvgStatus: 'failed',
  reason: 'mvg_deadline_expired'
}
```

---

### Step 3.5: Verification in Stripe Dashboard

**Navigate to Stripe Dashboard:**

**Before Cancellation:**
```
Payment Intents: 5 uncaptured
Status: Requires capture
Total: $1,500 held
```

**After Cancellation:**
```
Payment Intents: 5 refunded
Refunds: 5 successful
Total Refunded: $1,500
Status: Refund succeeded
```

---

## 📊 Verification Checklist

### ✅ System Verification

**After MVG Confirmation:**
- [ ] All 10 deposits captured in Stripe
- [ ] Trip status = `confirmed`
- [ ] MVG status = `met`
- [ ] All bookings status = `confirmed`
- [ ] All deposits status = `locked`
- [ ] All participants notified
- [ ] Homepage shows "CONFIRMED" badge
- [ ] Real-time updates worked

**After MVG Cancellation:**
- [ ] All deposits refunded in Stripe
- [ ] Trip status = `cancelled`
- [ ] MVG status = `failed`
- [ ] All bookings status = `cancelled`
- [ ] All deposits status = `refunded`
- [ ] All participants notified with refund confirmation
- [ ] Homepage removes/hides cancelled trip
- [ ] Real-time updates worked

---

## 🎥 Demo Script (For Presentation)

### Opening (1 minute)
```
"Today I'll demonstrate our MVG platform's complete automation. 
We'll create a trip, collect refundable deposits, and watch the 
system automatically confirm or cancel based on whether we reach 
the minimum group size."
```

### Act 1: Trip Creation (3 minutes)
```
"As a creator, I'll list a 7-day Bali yoga retreat. The key 
settings are:
- $1,500 per person
- 10 people minimum (MVG)
- $300 refundable deposit
- 15-day deadline

Notice this means participants pay $300 upfront, but it's fully 
refundable if we don't get 10 people."
```

### Act 2: Deposit Collection (5 minutes)
```
"Now watch as participants reserve spots. Each deposit is held 
by Stripe but not charged yet - keeping it refundable.

See the progress bar? It updates in real-time across all pages 
thanks to WebSocket. No refreshing needed.

1st deposit... 10%
2nd deposit... 20%
...
9th deposit... 90% - almost there!"
```

### Act 3: The Magic Moment (2 minutes)
```
"Here comes the 10th participant. Watch what happens when we 
hit the MVG threshold...

BOOM! 🎉

The system just:
1. Captured all 10 deposits from Stripe
2. Confirmed the trip
3. Sent notifications to all participants
4. Updated every page in real-time

All automatic. No manual intervention."
```

### Alternative Act 3: Auto-Cancellation (3 minutes)
```
"But what if we don't reach 10 people? Let me show you.

I've created another trip with a deadline that just passed. 
Only 5 people signed up. Watch the scheduler...

[Wait for scheduler]

There it goes! The system just:
1. Detected the expired deadline
2. Refunded all 5 deposits via Stripe
3. Cancelled the trip
4. Notified all participants with refund confirmation
5. Updated the UI

Zero risk for participants. Zero manual work for creators."
```

### Closing (1 minute)
```
"This is the power of MVG automation:
- Participants: Risk-free deposits
- Creators: Guaranteed committed groups
- System: Fully automated from start to finish

Whether we confirm or cancel, it all happens automatically 
with real-time updates and comprehensive notifications."
```

---

## 🐛 Troubleshooting During Demo

### Issue: Scheduler Doesn't Run
**Solution:** 
```bash
# Check logs
tail -f /tmp/logs/Start_application_*.log | grep "MVG Scheduler"

# Manually trigger (if needed for demo)
# Call the scheduler function directly via API
```

### Issue: WebSocket Not Updating
**Check:** Browser console for connection errors
**Solution:** Refresh page to reconnect

### Issue: Stripe Payment Fails
**Verify:** Using correct test card `4242 4242 4242 4242`
**Check:** Stripe dashboard for error details

### Issue: Progress Not Updating
**Check:** Database to verify bookings created
**Query:**
```sql
SELECT * FROM bookings WHERE "experienceId" = [trip_id];
```

---

## 📸 Screenshots to Capture

For documentation, capture screenshots at these moments:

1. ✅ Trip creation form (MVG settings highlighted)
2. ✅ Homepage showing 0/10 progress
3. ✅ Stripe payment modal (test card)
4. ✅ Progress at 50% (5/10 deposits)
5. ✅ Progress at 90% (9/10 deposits)
6. ✅ **CONFIRMATION MOMENT** (10/10, success banner)
7. ✅ Stripe dashboard showing captured payments
8. ✅ Notification inbox (confirmation message)
9. ✅ Trip detail page showing "CONFIRMED" status
10. ✅ [Cancellation] Refund notifications
11. ✅ [Cancellation] Stripe dashboard showing refunds

---

## ✅ Demo Success Criteria

**Demonstration is successful when:**
- ✅ Trip created and published
- ✅ 10 deposits accepted
- ✅ Real-time progress visible
- ✅ Automatic confirmation triggered
- ✅ All deposits captured
- ✅ Notifications sent
- ✅ UI updated everywhere
- ✅ Zero manual intervention required

**OR (for cancellation demo):**
- ✅ Deadline expired
- ✅ Automatic refunds processed
- ✅ Trip cancelled
- ✅ Participants notified
- ✅ Stripe refunds visible

---

## 🎯 Post-Demo Metrics

**Share these results:**
```
Trip:                    7-Day Yoga Retreat in Bali
MVG Threshold:           10 people
Total Deposits:          10 × $300 = $3,000
Confirmation Time:       < 1 second (automatic)
Notification Latency:    < 2 seconds
Real-Time Update Speed:  < 50ms via WebSocket
Manual Interventions:    0
```

---

**🎬 Demo Complete! Platform working as designed.**
