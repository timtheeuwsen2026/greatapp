# Great. Platform - Complete Demo Script

## 🎬 Demo Overview

This script walks through the complete functional flows of the Great. platform, demonstrating:
1. **Creator Flow**: Trip creation → Publishing → Funding → Earning
2. **Traveler Flow**: Discovery → Booking → Funding Progress → Confirmation
3. **Venue Flow**: Listing → Soft-Hold → Booking Confirmation → Deposit Release
4. **Admin Flow**: Approval workflows and platform management

**Total Demo Time**: ~15 minutes for complete walkthrough

---

## 🎯 Demo Setup & Prerequisites

### Before Starting

1. **Open Application**: Navigate to homepage at `/`
2. **Login** (if needed): Use Replit Auth
3. **Role Access**: Demo user should have access to Creator, Venue Provider, and Admin roles
4. **Clear State** (optional): Fresh browser session for clean demo

### Demo Data

Have these ready to show:
- At least 1 published experience with MVG enabled
- At least 1 experience in "funding" state (50-80% funded)
- At least 1 pending experience for admin approval
- At least 1 venue listing

---

## 📍 Part 1: Homepage & Value Proposition (2 minutes)

### Script:

"Welcome to **Great.** - the platform for community-backed experiences. Unlike traditional booking sites, we use a unique funding model where experiences only happen when enough people commit."

### Demo Steps:

1. **Homepage Hero Section** (`/`)
   - Point out left-aligned headline and subcopy
   - Highlight the two primary CTAs: "Create a Trip" and "Explore Experiences"
   - Show quick stats (500+ travelers, 150+ experiences, 98% satisfaction)

2. **Three Ways to Participate Section**
   - Scroll to "How It Works" section
   - Explain the three distinct user journeys:

   **For Creators** (Blue card):
   ```
   1. Design Your Experience (Journey Builder)
   2. Set Funding Goal (minimum participants)
   3. Earn & Lead (get paid when confirmed)
   ```
   
   **For Travelers** (Green card - "Most Popular"):
   ```
   1. Browse & Discover (experiences that match your vibe)
   2. Book with Confidence (full refund if minimum not met)
   3. Connect & Travel (meet your tribe before departure)
   ```
   
   **For Venues** (Purple card):
   ```
   1. List Your Space (set pricing and availability)
   2. Accept Soft Holds (reserve dates while funding builds)
   3. Get Paid (deposit released when confirmed)
   ```

3. **Community-Backed Funding Section**
   - Scroll to funding progress showcase
   - Point out the two example cards:
   
   **Bali Yoga Retreat** (Funded - Green):
   - "This trip reached 120% funding - 12 of 10 spots filled"
   - Show the progress bar at 100%
   - "Trip confirmed, deposits released to venue"
   
   **Iceland Adventure Trek** (In Progress - Blue):
   - "This trip is 62.5% funded - 5 of 8 spots filled"
   - "3 more bookings needed with 14 days left"
   - "Venue is on soft-hold, travelers haven't been charged yet"

4. **Key Insight**:
   "All payments are held securely until the minimum is met. If not enough people book by the deadline, everyone gets a full automatic refund. This protects both travelers and creators."

---

## 📍 Part 2: Creator Flow - Trip Creation (4 minutes)

### Script:

"Let me show you how a creator builds an experience from scratch using our AI-powered Journey Builder."

### Demo Steps:

1. **Access Journey Builder**
   - Click "Create a Trip" button from homepage
   - Or navigate to `/journey-builder`

2. **Step 1: Basic Info**
   ```
   Title: "Mystic Marrakesh Retreat"
   Category: Retreats
   Experience Type: Yoga & Meditation
   Start Date: July 15, 2025
   End Date: July 22, 2025
   Location: Marrakesh, Morocco
   Max Participants: 15
   ```
   - Click "Next"

3. **Step 2: Media Upload** (show S3 integration)
   - Click "Upload Cover Image"
   - Select/drag image (or use demo placeholder)
   - Show upload progress bar
   - Add 2-3 gallery images
   - Point out: "Photos are stored in S3-compatible object storage"
   - Click "Next"

4. **Step 3: Detailed Description**
   - Paste sample description
   - Show AI suggestion feature (if available)
   - Click "Next"

5. **Step 4: Itinerary Builder**
   - Show existing day structure
   - Click "Add Day" to add Day 3
   - For Day 3, click "Add Time Slot":
     ```
     Start Time: 08:00
     End Time: 10:00
     Activity: Morning Yoga & Meditation
     Description: Sunrise yoga session on rooftop terrace
     ```
   - Add another time slot:
     ```
     Start Time: 18:00
     End Time: 20:00
     Activity: Sunset Camel Ride
     Description: Desert experience with traditional tea
     ```
   - Point out: "Each day can have multiple time slots with detailed descriptions"
   - Click "Next"

6. **Step 5: Pricing & MVG Settings** (KEY FEATURE)
   ```
   Price Per Person: $1,500
   Monetization Model: Experience Facilitator
   Commission: 25% (Base 20% + Enhanced Support 5%)
   
   MVG Settings:
   ☑ Enable Minimum Viable Gathering
   Minimum Participants: 10
   MVG Deadline: June 15, 2025 (30 days before start)
   
   Deposit Settings:
   ☑ Enable Deposit Payments
   Deposit Percentage: 30%
   Balance Due: 14 days before experience
   ```
   
   - **Explain**: "If we don't get 10 bookings by June 15th, the trip is automatically cancelled and everyone gets refunded. If we DO reach 10, the trip confirms and payments are captured."
   - Show revenue breakdown calculator
   - Click "Next"

7. **Step 6: Roles Assignment**
   - Show standard roles dropdown (21 roles available)
   - Add roles:
     ```
     - Yoga Instructor (Required, 2 people)
     - Chef (Required, 1 person, Rate: $100/day)
     - Photographer (Optional, 1 person)
     ```
   - Point out: "These roles can be filled by participants or hired separately"
   - Click "Next"

8. **Step 7-9: Quick Overview**
   - Requirements & Logistics (Skip for demo)
   - Photos again (Skip)
   - Review & Publish

10. **Step 10: Submit for Review**
    - Click "Submit for Admin Review"
    - Show success message
    - "The experience is now pending admin approval"

---

## 📍 Part 3: Admin Approval Flow (2 minutes)

### Script:

"Before an experience goes live, our admin team reviews it for quality and safety."

### Demo Steps:

1. **Access Admin Dashboard**
   - Navigate to `/admin`
   - Click "Experiences" tab

2. **Pending Approvals**
   - Show list of pending experiences
   - Find "Mystic Marrakesh Retreat" in list
   - Click "Review" or "View Details"

3. **Preview Experience**
   - Show full experience details
   - Point out: "Admins can see everything travelers will see"
   - Check itinerary, pricing, photos

4. **Approve Experience**
   - Click "Approve Experience" button
   - Add optional feedback: "Great retreat! Love the detailed itinerary."
   - Confirm approval
   - Show success toast: "Experience approved and now live!"

5. **Status Change**
   - Navigate back to creator dashboard (`/creator-dashboard`)
   - Show experience is now "Approved" status
   - "Now travelers can discover and book this experience"

---

## 📍 Part 4: Traveler Flow - Discovery & Booking (4 minutes)

### Script:

"Let's switch perspectives to a traveler discovering this newly published retreat."

### Demo Steps:

1. **Browse Experiences**
   - Navigate to `/experiences`
   - Show filter options (category, price range, dates)
   - Find "Mystic Marrakesh Retreat" in the list

2. **Experience Details Page**
   - Click on the retreat card
   - Navigate to `/experience/:id`
   - Scroll through page highlighting:
     - Cover image and gallery
     - Full itinerary with time slots
     - Creator profile
     - **MVG Progress Widget** (KEY FEATURE)

3. **MVG Progress Widget**
   - Point out the funding progress bar:
     ```
     Current Status: 3 of 10 spots filled (30%)
     Deadline: June 15, 2025 (42 days remaining)
     Status: Funding in Progress
     ```
   - "This trip needs 7 more bookings to confirm"

4. **Booking Options**
   
   **Option A: Reserve Spot (Soft-Hold)**
   - Click "Reserve Spot (48h)" button
   - Show reservation modal
   - Add optional notes: "Interested! Waiting for my friend to decide."
   - Click "Reserve"
   - Show success toast: "Spot reserved for 48 hours!"
   - Point out: "No payment required yet. This just holds a spot."

   **Then Convert to Booking:**
   - Show "You have an active reservation" card
   - Click "Complete Booking" button
   - This redirects to checkout

   **Option B: Book Now (Direct)**
   - Click "Book Now - $1,500" button
   - Proceed directly to checkout

5. **Checkout Flow** (`/checkout/:id`)
   - Show Stripe payment form
   - Point out payment breakdown:
     ```
     Total Price: $1,500
     Deposit (Today): $450 (30%)
     Balance (Due Later): $1,050
     ```
   
   - **Explain the MVG messaging**:
     ```
     💳 Deposit: $450 charged immediately
     💸 Full refund if minimum not met by deadline (June 15)
     ✅ Balance ($1,050) charged when event confirms
     ⏱️ 7 more bookings needed to reach minimum (10 participants)
     ```

6. **Complete Booking**
   - Use Stripe test card: `4242 4242 4242 4242`
   - Any future expiry date, any CVC
   - Click "Pay Deposit - $450"
   - Show loading state → Success!

7. **Booking Success Page** (`/booking-success`)
   - Show confirmation message
   - Display booking details
   - Point out: "You'll only be charged the balance if the trip confirms"

8. **MVG Progress Updates**
   - Navigate back to experience details
   - Show updated progress: "4 of 10 spots filled (40%)"
   - "Just added one more booking - 6 more needed!"

---

## 📍 Part 5: Venue Flow - Soft-Hold to Deposit Release (3 minutes)

### Script:

"Now let's see how venue providers participate in this funding model."

### Demo Steps:

1. **Venue Dashboard**
   - Navigate to `/venue-dashboard`
   - Show "My Venue" card with availability calendar

2. **Incoming Soft-Hold Request**
   - Show notification: "Soft-hold request for July 15-22, 2025"
   - Experience: "Mystic Marrakesh Retreat"
   - Status: "Provisional - Pending MVG Confirmation"
   - Soft-hold expires: "June 15, 2025 (MVG deadline)"

3. **Explain Soft-Hold**:
   "A soft-hold means:
   - The dates are reserved for this experience
   - No payment yet - waiting for minimum bookings
   - If minimum is reached → Booking confirms, venue gets deposit
   - If not reached → Dates are released back to availability
   - Venue can see real-time funding progress"

4. **Track Funding Progress**
   - Click on booking to view details
   - Show MVG progress widget in venue view:
     ```
     Funding Status: 4 of 10 bookings (40%)
     Your Deposit: $3,000 (will be released when confirmed)
     Time Remaining: 42 days until deadline
     ```

5. **Simulate MVG Success** (Fast-forward scenario)
   - "Let's imagine 6 more travelers book this retreat..."
   - Navigate to experience and show progress: "10 of 10 spots filled (100%)"
   - MVG Status changes to: "✓ Confirmed - Minimum Reached!"

6. **Deposit Release**
   - Back to venue dashboard
   - Show booking status changed to "Confirmed"
   - Deposit status: "✓ Released - $3,000"
   - "The venue now has guaranteed booking and payment"

7. **Calendar Update**
   - Show calendar with July 15-22 marked as "Booked (Confirmed)"
   - "These dates are now locked and unavailable for other bookings"

---

## 📍 Part 6: What Happens If MVG Fails? (1 minute)

### Script:

"Let's quickly show what happens if a trip doesn't reach its minimum."

### Demo Steps:

1. **Show Failing Experience**
   - Navigate to an experience with < 50% funding
   - Example: "Iceland Adventure Trek" - 5 of 8 spots (62.5%)
   - Deadline: "3 days remaining"

2. **Deadline Passes**
   - Simulate: "Imagine the deadline passes with only 5 bookings"
   - MVG status changes to: "Failed - Minimum Not Met"

3. **Automatic Refunds**
   - Show traveler booking dashboard
   - All 5 bookings show status: "Refunded"
   - Email notification sent: "Your payment has been fully refunded"
   - "Stripe automatically processes refunds for all participants"

4. **Venue Dates Released**
   - Show venue dashboard
   - Booking status: "Cancelled - MVG Failed"
   - Calendar: Dates released back to "Available"
   - "Venue can now accept other bookings for those dates"

5. **Creator Notification**
   - Creator receives email: "Trip cancelled due to insufficient bookings"
   - Experience status: "Draft" (can be edited and republished)

---

## 📍 Part 7: Platform Features Showcase (2 minutes)

### Quick highlights of additional features:

1. **Community Hub** (`/community-hub`)
   - Pre-experience group chat
   - Participant introductions
   - Shared intention setting
   - "Meet your tribe before you travel"

2. **Creator Earnings** (`/creator/earnings`)
   - Revenue breakdown dashboard
   - Platform fees transparency
   - Payout tracking
   - "See exactly what you'll earn"

3. **AI Travel Assistant** (Homepage)
   - Click "Ask AI" button
   - Ask: "Find me a yoga retreat in Bali under $2000"
   - AI provides personalized recommendations
   - "Smart search powered by OpenAI"

4. **Role Assignment** (in Experience Details)
   - Show participant list with assigned roles
   - Photographer, Chef, Yoga Instructor slots
   - "Participants can fill service roles and reduce costs"

5. **Reviews & Ratings**
   - Show 5-star review system
   - Verified participant badges
   - "Only people who attended can review"

---

## 📍 Conclusion & Key Takeaways (1 minute)

### Script:

"So that's **Great.** - the platform for community-backed experiences. Let me recap the key innovations:"

### Key Points:

1. **Risk-Free for Everyone**
   - Creators: Don't book venues until confirmed
   - Travelers: Full refund if trip doesn't happen
   - Venues: Soft-holds protect calendar without commitment

2. **Transparent Funding**
   - Real-time progress tracking
   - Clear deadlines and minimums
   - Automatic payment processing

3. **Community-First**
   - Connect before you travel
   - Shared roles and responsibilities
   - Lasting friendships beyond the trip

4. **Complete Ecosystem**
   - Journey Builder for creators
   - Smart discovery for travelers
   - Professional tools for venues
   - AI-powered assistance throughout

### Final CTA:

"Visit the platform and start creating your next unforgettable experience!"

---

## 🎥 Video Recording Tips

### Setup
- Use 1920x1080 screen resolution
- Clear browser cache for clean demo
- Use incognito/private window
- Prepare test data beforehand

### Recording Approach
- **Intro**: 30 seconds on homepage explaining value prop
- **Creator Flow**: 3 minutes showing Journey Builder
- **Traveler Flow**: 3 minutes showing discovery and booking
- **Funding Progress**: 2 minutes showing MVG in action
- **Venue Flow**: 2 minutes showing soft-hold system
- **Wrap-up**: 30 seconds highlighting key benefits

### Narration Tips
- Speak clearly and at moderate pace
- Pause briefly when clicking/loading
- Emphasize unique features (MVG, soft-holds, community)
- Use phrases like:
  - "Notice how..."
  - "The key difference here is..."
  - "This is unique because..."

### Screen Capture Tools
- **Loom**: Easy browser extension
- **OBS Studio**: Professional recording
- **QuickTime**: Mac native option
- **Replit**: Use Replit's built-in screen sharing

---

## 📋 Demo Checklist

Before recording, ensure:
- [ ] Application is running on port 5000
- [ ] Database has seed data
- [ ] At least 2-3 experiences exist
- [ ] At least 1 experience is in "funding" state
- [ ] Test Stripe integration works (use test mode)
- [ ] Admin dashboard is accessible
- [ ] Venue dashboard has sample venue
- [ ] User can switch between roles
- [ ] All images load correctly
- [ ] Dark mode works (optional to show)
- [ ] No console errors

---

## 🐛 Troubleshooting During Demo

### If Something Breaks:

**Payment fails:**
- Use test card `4242 4242 4242 4242`
- Any future date, any CVC
- Check Stripe dashboard

**Image upload fails:**
- Mention: "In production, this uses S3"
- Use placeholder: "For demo, using placeholder image"

**Experience not showing:**
- Check status is "approved"
- Verify dates are in future
- Refresh the page

**MVG progress not updating:**
- Refresh experience details page
- Check booking was successful
- Verify invalidation worked

---

## 📤 Deliverables

After recording demo video:

1. **Video Export**
   - Format: MP4, 1080p
   - Length: 10-15 minutes
   - Include captions/subtitles (optional)

2. **Demo Link**
   - Live Replit app URL
   - Test credentials (if needed)
   - Demo walkthrough instructions

3. **Documentation**
   - This DEMO_SCRIPT.md
   - README.md
   - FEATURE_TESTING_VALIDATION.md

4. **Code Archive**
   - GitHub repository
   - Or ZIP file with complete source

---

**Great.** - Turn dreams into adventures, together. 🌍✨

**Ready to record? Let's create something great!**
