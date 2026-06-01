# QA Verification Checklist - Venue Services Feature

## 📋 Quick Reference

**Feature:** Venue-Specific Services Management  
**Staging URL:** `https://[your-repl-name]-[username].replit.app`  
**Test Venue:** `/v/zen-garden-retreat-center`  
**Estimated Testing Time:** 15-20 minutes

---

## ✅ Acceptance Criteria Testing

### 1️⃣ Services Show in Correct Placement

**Objective:** Verify services display in sidebar (default) or inline (when toggled)

**Steps:**
1. ⬜ Navigate to: `[STAGING_URL]/v/zen-garden-retreat-center`
2. ⬜ Verify services section exists
3. ⬜ **Expected:** Services appear in right sidebar by default
4. ⬜ Login as venue provider
5. ⬜ Go to venue profile settings
6. ⬜ Toggle "Show services inline" to ON
7. ⬜ Click "Save Changes"
8. ⬜ Return to public venue page
9. ⬜ **Expected:** Services now appear in main content area below amenities
10. ⬜ Toggle back to sidebar placement
11. ⬜ **Expected:** Services return to sidebar

**Pass Criteria:**
- ✅ Services visible in both placements
- ✅ Toggle saves and persists
- ✅ Page updates immediately after save

**Status:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________

---

### 2️⃣ Only Venue-Specific Services Shown

**Objective:** Verify service isolation between venues

**Steps:**
1. ⬜ View Zen Garden Retreat Center venue page
2. ⬜ Note which services are displayed
3. ⬜ Navigate to a different venue (if available)
4. ⬜ **Expected:** Different services shown (or no services if venue has none)
5. ⬜ Open browser DevTools → Network tab
6. ⬜ Refresh page
7. ⬜ Find API call: `/api/venues/[id]/services`
8. ⬜ Click on request → Preview tab
9. ⬜ **Expected:** Response only contains services for that specific venue

**Pass Criteria:**
- ✅ Services are venue-specific
- ✅ No cross-contamination between venues
- ✅ API returns correct filtered data

**Status:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________

---

### 3️⃣ Saves Persist Correctly

**Objective:** Verify all CRUD operations persist to database

**Test 3a: Create Service**
1. ⬜ Login as venue provider
2. ⬜ Go to venue profile settings
3. ⬜ Scroll to "Services" section
4. ⬜ Click "Add Service" button
5. ⬜ Fill in form:
   - Title: "QA Test Service"
   - Price: 99
   - Frequency: "per_session"
   - Description: "Test service for QA verification"
6. ⬜ Click "Save"
7. ⬜ **Expected:** Success toast appears
8. ⬜ **Expected:** Service appears in services list
9. ⬜ Refresh the page (F5)
10. ⬜ **Expected:** Service still visible after refresh

**Status:** ⬜ Pass  ⬜ Fail

**Test 3b: Edit Service**
1. ⬜ Find "QA Test Service" in services list
2. ⬜ Click "Edit" button
3. ⬜ Change price from $99 to $75
4. ⬜ Click "Save"
5. ⬜ **Expected:** Success toast appears
6. ⬜ **Expected:** Price shows $75
7. ⬜ Refresh the page (F5)
8. ⬜ **Expected:** Price still shows $75

**Status:** ⬜ Pass  ⬜ Fail

**Test 3c: Delete Service**
1. ⬜ Find "QA Test Service" in services list
2. ⬜ Click "Delete" button
3. ⬜ Confirm deletion in modal
4. ⬜ **Expected:** Success toast appears
5. ⬜ **Expected:** Service removed from list
6. ⬜ Refresh the page (F5)
7. ⬜ **Expected:** Service still gone after refresh

**Status:** ⬜ Pass  ⬜ Fail

**Overall Test 3 Status:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________

---

### 4️⃣ Cache Invalidation Works

**Objective:** Verify real-time updates across browser tabs

**Steps:**
1. ⬜ Open venue page in Chrome Tab 1
2. ⬜ Open same venue page in Chrome Tab 2
3. ⬜ In Tab 1: Add new service "Cache Test - $100/session"
4. ⬜ In Tab 1: Click "Save"
5. ⬜ Switch to Tab 2
6. ⬜ Refresh Tab 2 (F5)
7. ⬜ **Expected:** New "Cache Test" service appears in Tab 2
8. ⬜ In Tab 1: Toggle placement from sidebar to inline
9. ⬜ Switch to Tab 2
10. ⬜ Refresh Tab 2 (F5)
11. ⬜ **Expected:** Services moved to inline position in Tab 2
12. ⬜ Open DevTools in Tab 2 → Network tab
13. ⬜ Refresh page and check venue API call
14. ⬜ **Expected:** Status 200 (not 304), indicating fresh data

**Pass Criteria:**
- ✅ Changes visible across tabs after refresh
- ✅ No stale data served
- ✅ Network tab shows 200 responses for fresh data

**Status:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________

---

### 5️⃣ Responsive & Accessible

**Test 5a: Mobile Responsive (375px)**
1. ⬜ Open DevTools (F12)
2. ⬜ Click device toolbar icon (Ctrl+Shift+M)
3. ⬜ Select "iPhone SE" or set width to 375px
4. ⬜ Navigate to venue page
5. ⬜ Scroll to services section
6. ⬜ **Expected:** Services use small text size
7. ⬜ **Expected:** Long service titles truncate with "..."
8. ⬜ **Expected:** No horizontal scrollbar
9. ⬜ **Expected:** Services wrap to next line if needed
10. ⬜ **Expected:** Touch targets are large enough (≥44px)

**Status:** ⬜ Pass  ⬜ Fail

**Test 5b: Tablet Responsive (768px)**
1. ⬜ In DevTools device mode, select "iPad" or set width to 768px
2. ⬜ Navigate to venue page
3. ⬜ **Expected:** Page shows 3-column grid layout
4. ⬜ **Expected:** Sidebar appears on right side
5. ⬜ **Expected:** Services display full titles (no truncation)
6. ⬜ **Expected:** Balanced spacing between elements

**Status:** ⬜ Pass  ⬜ Fail

**Test 5c: Desktop Responsive (1024px+)**
1. ⬜ Exit device mode (click device toolbar icon again)
2. ⬜ Maximize browser window
3. ⬜ Navigate to venue page
4. ⬜ **Expected:** Full 3-column layout with generous spacing
5. ⬜ **Expected:** All service information clearly visible
6. ⬜ **Expected:** Hover states work on service badges
7. ⬜ **Expected:** Optimal readability and visual hierarchy

**Status:** ⬜ Pass  ⬜ Fail

**Test 5d: Keyboard Navigation**
1. ⬜ Close DevTools
2. ⬜ Navigate to venue page
3. ⬜ Press Tab key repeatedly
4. ⬜ **Expected:** Focus moves through all interactive elements
5. ⬜ **Expected:** Focus outline visible on each element
6. ⬜ Navigate to service badge with Tab
7. ⬜ Press Enter or Space
8. ⬜ **Expected:** Service badge responds to keyboard input

**Status:** ⬜ Pass  ⬜ Fail

**Test 5e: Accessibility Audit**
1. ⬜ Open DevTools (F12)
2. ⬜ Go to "Lighthouse" tab
3. ⬜ Select "Accessibility" only
4. ⬜ Click "Analyze page load"
5. ⬜ Wait for audit to complete
6. ⬜ **Expected:** Accessibility score ≥95
7. ⬜ **Expected:** No critical accessibility issues
8. ⬜ Review any warnings/suggestions

**Lighthouse Score:** _____ / 100

**Status:** ⬜ Pass  ⬜ Fail

**Overall Test 5 Status:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________

---

## 🐛 Bug Reporting Template

**If you find any issues, document them here:**

### Bug #1
**Severity:** ⬜ Critical  ⬜ Major  ⬜ Minor  ⬜ Cosmetic

**Description:** _______________________________________

**Steps to Reproduce:**
1. _______________________________________
2. _______________________________________
3. _______________________________________

**Expected Result:** _______________________________________

**Actual Result:** _______________________________________

**Screenshot/Video:** _______________________________________

**Browser:** ⬜ Chrome  ⬜ Firefox  ⬜ Safari  ⬜ Edge

**Device:** ⬜ Desktop  ⬜ Tablet  ⬜ Mobile

---

### Bug #2
**Severity:** ⬜ Critical  ⬜ Major  ⬜ Minor  ⬜ Cosmetic

**Description:** _______________________________________

**Steps to Reproduce:**
1. _______________________________________
2. _______________________________________
3. _______________________________________

**Expected Result:** _______________________________________

**Actual Result:** _______________________________________

**Screenshot/Video:** _______________________________________

**Browser:** ⬜ Chrome  ⬜ Firefox  ⬜ Safari  ⬜ Edge

**Device:** ⬜ Desktop  ⬜ Tablet  ⬜ Mobile

---

## 📊 Summary

### Overall Test Results

| Acceptance Criteria | Status | Notes |
|---------------------|--------|-------|
| 1. Correct Placement | ⬜ Pass  ⬜ Fail | |
| 2. Venue Isolation | ⬜ Pass  ⬜ Fail | |
| 3. Persistence | ⬜ Pass  ⬜ Fail | |
| 4. Cache Invalidation | ⬜ Pass  ⬜ Fail | |
| 5. Responsive & A11y | ⬜ Pass  ⬜ Fail | |

### Final Decision

**Total Tests Passed:** _____ / 5

**Recommendation:**
- ⬜ **APPROVE** - All tests passed, ready for production
- ⬜ **APPROVE WITH NOTES** - Minor issues found, can be fixed post-deployment
- ⬜ **REJECT** - Critical issues found, requires fixes before deployment

**Tested By:** _______________________________________

**Date:** _______________________________________

**Time Spent:** _____ minutes

**Additional Comments:**

_____________________________________________________________

_____________________________________________________________

_____________________________________________________________

---

## 🚀 Next Steps

**If APPROVED:**
1. Notify development team
2. Schedule production deployment
3. Monitor staging for 24 hours
4. Prepare rollback plan
5. Deploy to production

**If REJECTED:**
1. File bugs in tracking system
2. Assign to development team
3. Re-test after fixes
4. Complete this checklist again

---

**Thank you for your thorough QA testing! 🎉**
