# QA Checklist - Release v1.2.0

**Release Version:** v1.2.0  
**QA Lead:** _________________  
**Test Date:** _________________  
**Environment:** [ ] Staging  [ ] Production

---

## Pre-Deployment Checklist

### Automated Tests
- [ ] All 109 unit tests passing
  - [ ] 34 pricing calculation tests
  - [ ] 23 venue services integration tests
  - [ ] 52 pricing utility tests
- [ ] No blocking LSP errors in core files
- [ ] Application builds successfully
- [ ] No console errors in browser

**Commands:**
```bash
npm run test
npm run build
npm run check
```

---

## Critical Bug Fix Verification

### Bug #1: Stripe Fee Calculation

**Test Case 1.1: Small Transaction ($100)**
- [ ] Create booking for $100
- [ ] Verify Stripe fee = $3.20 (not $32.90)
- [ ] Verify net revenue = $96.80
- [ ] ✅ PASS / ❌ FAIL

**Test Case 1.2: Medium Transaction ($500)**
- [ ] Create booking for $500
- [ ] Verify Stripe fee = $14.80 (not $44.50)
- [ ] Verify net revenue = $485.20
- [ ] ✅ PASS / ❌ FAIL

**Test Case 1.3: Large Transaction ($1000)**
- [ ] Create booking for $1000
- [ ] Verify Stripe fee = $29.30 (not $59.00)
- [ ] Verify net revenue = $970.70
- [ ] ✅ PASS / ❌ FAIL

---

### Bug #2: NaN Input Validation

**Test Case 2.1: Invalid Gross Amount**
- [ ] Input NaN as gross amount
- [ ] Verify function returns grossRevenue = 0
- [ ] Verify no NaN propagation in results
- [ ] ✅ PASS / ❌ FAIL

**Test Case 2.2: Invalid Percentage**
- [ ] Input NaN as revenue percentage
- [ ] Verify function defaults to 0%
- [ ] Verify calculations complete successfully
- [ ] ✅ PASS / ❌ FAIL

---

### Bug #3: Infinity Handling

**Test Case 3.1: Infinity in Currency Format**
- [ ] Pass Infinity to formatPriceByCurrency
- [ ] Verify output is "$0.00" (not "$Infinity")
- [ ] Verify no UI rendering issues
- [ ] ✅ PASS / ❌ FAIL

---

### Bug #4: Revenue Split Validation

**Test Case 4.1: Invalid Creator Percentage**
- [ ] Input NaN as creatorPct
- [ ] Verify defaults to 0%
- [ ] Verify split calculations work
- [ ] ✅ PASS / ❌ FAIL

---

## Pricing Calculation Verification

### Facilitator Model

**Test Case 5.1: Base Commission (20%)**
- [ ] Create $1000 booking with facilitator model
- [ ] No additional services selected
- [ ] Verify platform fee = $194.14 (20%)
- [ ] Verify creator payout = $776.56
- [ ] ✅ PASS / ❌ FAIL

**Test Case 5.2: With Enhanced Support (+6%)**
- [ ] Select "Enhanced Support" service
- [ ] Verify platform fee = $252.38 (26%)
- [ ] Verify creator payout = $718.32
- [ ] ✅ PASS / ❌ FAIL

**Test Case 5.3: All Services (Capped at 34%)**
- [ ] Select all services (Enhanced, Full Service, Marketing, Logistics)
- [ ] Verify platform fee = $330.04 (34% cap)
- [ ] Verify creator payout = $640.66
- [ ] ✅ PASS / ❌ FAIL

---

### Influencer Model

**Test Case 6.1: Default Revenue Share (25%)**
- [ ] Create $1000 booking with influencer model
- [ ] No custom revenue share set
- [ ] Verify creator gets 25% = $242.68
- [ ] Verify platform gets 75% = $728.02
- [ ] ✅ PASS / ❌ FAIL

**Test Case 6.2: Custom Revenue Share (40%)**
- [ ] Set custom revenue share to 40%
- [ ] Verify creator gets 40% = $388.28
- [ ] Verify platform gets 60% = $582.42
- [ ] ✅ PASS / ❌ FAIL

---

### Custom Model

**Test Case 7.1: Custom Platform Fee (15%)**
- [ ] Create $1000 booking with custom model
- [ ] Set platform fee to 15%
- [ ] Verify platform fee = $145.60
- [ ] Verify creator payout = $825.10
- [ ] ✅ PASS / ❌ FAIL

---

### Promoter Commission

**Test Case 8.1: With 10% Promoter Commission**
- [ ] Create $1000 booking
- [ ] Add 10% promoter commission
- [ ] Verify promoter gets $97.07 (after Stripe fees)
- [ ] Verify revenue split excludes promoter share
- [ ] ✅ PASS / ❌ FAIL

---

## Venue Services Testing

### Services Persistence

**Test Case 9.1: Add Service**
- [ ] Navigate to venue setup
- [ ] Add new service "Gourmet Catering"
- [ ] Set price: $45/day
- [ ] Set description (min 50 chars)
- [ ] Save venue
- [ ] Verify service persists in database
- [ ] ✅ PASS / ❌ FAIL

**Test Case 9.2: Edit Service**
- [ ] Edit existing service
- [ ] Change price to $50
- [ ] Save venue
- [ ] Verify changes persist
- [ ] ✅ PASS / ❌ FAIL

**Test Case 9.3: Delete Service**
- [ ] Delete a service
- [ ] Save venue
- [ ] Verify service removed from database
- [ ] ✅ PASS / ❌ FAIL

**Test Case 9.4: Service Order**
- [ ] Add 3 services in specific order
- [ ] Save venue
- [ ] Reload page
- [ ] Verify services display in correct order
- [ ] ✅ PASS / ❌ FAIL

---

### Photo Upload Flow

**Test Case 10.1: Upload Cover Image**
- [ ] Click "Upload Cover Image"
- [ ] Select valid JPG file (< 10MB)
- [ ] Verify upload progress shows
- [ ] Verify image appears after upload
- [ ] Save venue
- [ ] Verify image persists
- [ ] ✅ PASS / ❌ FAIL

**Test Case 10.2: Upload Gallery Images**
- [ ] Click "Add to Gallery"
- [ ] Upload 3 images
- [ ] Verify all images appear in gallery
- [ ] Save venue
- [ ] Verify images persist
- [ ] ✅ PASS / ❌ FAIL

**Test Case 10.3: File Type Validation**
- [ ] Attempt to upload .txt file
- [ ] Verify error message shows
- [ ] Verify upload blocked
- [ ] ✅ PASS / ❌ FAIL

**Test Case 10.4: File Size Validation**
- [ ] Attempt to upload 15MB image
- [ ] Verify error message shows
- [ ] Verify upload blocked
- [ ] ✅ PASS / ❌ FAIL

---

### Soft Hold Days

**Test Case 11.1: Set Valid Soft Hold**
- [ ] Navigate to venue calendar settings
- [ ] Set soft hold days to 14
- [ ] Save venue
- [ ] Verify field persists
- [ ] ✅ PASS / ❌ FAIL

**Test Case 11.2: Clear Soft Hold**
- [ ] Set soft hold to null/empty
- [ ] Save venue
- [ ] Verify field clears
- [ ] ✅ PASS / ❌ FAIL

**Test Case 11.3: Validate Range (0-90)**
- [ ] Attempt to set soft hold to -5
- [ ] Verify error message
- [ ] Attempt to set soft hold to 120
- [ ] Verify error message
- [ ] Set to valid value 30
- [ ] Verify saves successfully
- [ ] ✅ PASS / ❌ FAIL

---

### Deposit Percentage

**Test Case 12.1: Set Valid Deposit**
- [ ] Navigate to venue pricing settings
- [ ] Set deposit percentage to 30%
- [ ] Save venue
- [ ] Verify field persists
- [ ] ✅ PASS / ❌ FAIL

**Test Case 12.2: Clear Deposit**
- [ ] Set deposit to null/empty
- [ ] Save venue
- [ ] Verify field clears (no deposit required)
- [ ] ✅ PASS / ❌ FAIL

**Test Case 12.3: Validate Range (0-100)**
- [ ] Attempt to set deposit to -10%
- [ ] Verify error message
- [ ] Attempt to set deposit to 150%
- [ ] Verify error message
- [ ] Set to valid value 25%
- [ ] Verify saves successfully
- [ ] ✅ PASS / ❌ FAIL

---

## Regression Testing

### Critical User Flows

**Test Case 13.1: User Authentication**
- [ ] Log out
- [ ] Log in with valid credentials
- [ ] Verify successful login
- [ ] ✅ PASS / ❌ FAIL

**Test Case 13.2: Venue Creation**
- [ ] Create new venue
- [ ] Fill all required fields
- [ ] Upload cover image
- [ ] Add service
- [ ] Submit for review
- [ ] Verify venue created
- [ ] ✅ PASS / ❌ FAIL

**Test Case 13.3: Event Creation**
- [ ] Create new event
- [ ] Select venue
- [ ] Set dates
- [ ] Configure pricing
- [ ] Publish event
- [ ] Verify event created
- [ ] ✅ PASS / ❌ FAIL

**Test Case 13.4: Booking Flow**
- [ ] Browse events
- [ ] Select event
- [ ] Add to cart
- [ ] Proceed to checkout
- [ ] Enter payment details (test mode)
- [ ] Complete booking
- [ ] Verify booking confirmation
- [ ] ✅ PASS / ❌ FAIL

**Test Case 13.5: Public Venue Page**
- [ ] Navigate to public venue page
- [ ] Verify cover image loads
- [ ] Verify gallery images load
- [ ] Verify services display
- [ ] Verify pricing correct
- [ ] ✅ PASS / ❌ FAIL

---

## Performance Testing

### Response Times

**Test Case 14.1: Home Page Load**
- [ ] Navigate to home page
- [ ] Measure load time
- [ ] Expected: < 2 seconds
- [ ] Actual: _____ seconds
- [ ] ✅ PASS / ❌ FAIL

**Test Case 14.2: Pricing Calculation**
- [ ] Trigger pricing calculation
- [ ] Measure response time
- [ ] Expected: < 500ms
- [ ] Actual: _____ ms
- [ ] ✅ PASS / ❌ FAIL

**Test Case 14.3: Image Upload**
- [ ] Upload 5MB image
- [ ] Measure upload time
- [ ] Expected: < 10 seconds
- [ ] Actual: _____ seconds
- [ ] ✅ PASS / ❌ FAIL

---

## Browser Compatibility

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Mobile Firefox

### Responsive Design
- [ ] Desktop (1280px)
- [ ] Tablet (768px)
- [ ] Mobile (375px)

---

## Security Testing

**Test Case 15.1: Authentication Required**
- [ ] Attempt to access admin pages without login
- [ ] Verify redirect to login
- [ ] ✅ PASS / ❌ FAIL

**Test Case 15.2: Authorization Check**
- [ ] Log in as non-admin user
- [ ] Attempt to access admin dashboard
- [ ] Verify access denied
- [ ] ✅ PASS / ❌ FAIL

**Test Case 15.3: Data Validation**
- [ ] Submit form with invalid data
- [ ] Verify server-side validation
- [ ] Verify error messages
- [ ] ✅ PASS / ❌ FAIL

---

## Post-Deployment Verification

### Monitoring (30 minutes after deployment)

**Metrics to Monitor:**
- [ ] Error rate < 1%
- [ ] Response time < 500ms (p95)
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%
- [ ] No pricing anomalies reported

**Log Review:**
- [ ] No ERROR level logs
- [ ] No unexpected WARN logs
- [ ] No stack traces in logs

---

## Sign-Off

### QA Team
- [ ] All critical tests passed
- [ ] No blocking issues found
- [ ] Performance acceptable
- [ ] Ready for deployment

**QA Lead Signature:** _________________  
**Date:** _________________

### Engineering Team
- [ ] Code review completed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Rollback plan verified

**Engineering Lead Signature:** _________________  
**Date:** _________________

### Product Team
- [ ] Feature requirements met
- [ ] User experience acceptable
- [ ] Business logic correct
- [ ] Ready for release

**Product Manager Signature:** _________________  
**Date:** _________________

---

## Issues Found

| Issue ID | Severity | Description | Status | Assigned To |
|----------|----------|-------------|--------|-------------|
| | | | | |
| | | | | |
| | | | | |

---

## Notes

Add any additional observations, concerns, or recommendations here:

_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
