# Rollback Plan - v1.2.0

**Release Version:** v1.2.0  
**Last Updated:** October 27, 2025  
**Document Owner:** Replit Agent

## Overview

This document provides comprehensive rollback procedures for Release v1.2.0 (Test Suite & Critical Bug Fixes). Since this release includes only code changes and no database migrations, rollback is straightforward and low-risk.

---

## Quick Reference

| Scenario | Rollback Time | Risk Level | Auto-Rollback |
|----------|---------------|------------|---------------|
| Code-only issues | 5-10 min | Low | ✅ Available |
| Database issues | N/A | N/A | N/A (no migrations) |
| Feature flag disable | Immediate | Very Low | ✅ Available |

---

## Table of Contents
1. [Rollback Decision Matrix](#rollback-decision-matrix)
2. [Code Rollback Procedures](#code-rollback-procedures)
3. [Feature Flag Management](#feature-flag-management)
4. [Database Rollback](#database-rollback)
5. [Verification Steps](#verification-steps)
6. [Emergency Contacts](#emergency-contacts)

---

## Rollback Decision Matrix

### When to Rollback

#### Immediate Rollback Required (Within 5 minutes)
- ❌ Application fails to start
- ❌ Critical errors in startup logs
- ❌ Health check endpoint returns 500
- ❌ Stripe fee calculations incorrect (> 5% variance)
- ❌ Revenue calculations producing NaN or Infinity
- ❌ More than 10% of tests failing

#### Scheduled Rollback (Within 1 hour)
- ⚠️ Error rate > 10%
- ⚠️ Response time > 2s (p95)
- ⚠️ Multiple customer complaints about pricing
- ⚠️ Revenue discrepancies detected

#### Feature Disable (Immediate)
- 🔧 Non-critical bugs in new features
- 🔧 Performance degradation in specific flows
- 🔧 Minor UI/UX issues

#### No Rollback Needed
- ✅ Minor cosmetic issues
- ✅ Non-blocking test failures
- ✅ Performance within acceptable range

---

## Code Rollback Procedures

### Option 1: Git Revert (Preferred)

**Use Case:** Clean rollback to previous stable version

**Steps:**
```bash
# 1. Stop the application
pm2 stop great-platform

# 2. Checkout previous version
git checkout v1.1.0

# 3. Reinstall dependencies (in case of changes)
npm install --production

# 4. Restart application
pm2 start great-platform

# 5. Verify health
curl https://great-platform.replit.app/health

# 6. Run tests
npm run test
```

**Expected Time:** 5-10 minutes  
**Risk:** Low

### Option 2: Hot-Fix Forward (For Minor Issues)

**Use Case:** Small bug that can be quickly fixed

**Steps:**
```bash
# 1. Create hot-fix branch
git checkout -b hotfix/v1.2.1 v1.2.0

# 2. Apply fix
# (edit files as needed)

# 3. Run tests
npm run test

# 4. Commit and tag
git commit -m "Hotfix: <description>"
git tag -a v1.2.1 -m "Hotfix v1.2.1"

# 5. Deploy
pm2 reload great-platform

# 6. Verify
curl https://great-platform.replit.app/health
```

**Expected Time:** 15-30 minutes  
**Risk:** Medium

### Option 3: Feature Flag Disable (Immediate)

**Use Case:** Disable specific problematic features without full rollback

See [Feature Flag Management](#feature-flag-management) section below.

---

## Feature Flag Management

### Current Feature Flags

This release doesn't require feature flags for core functionality since the changes are bug fixes. However, if issues arise, these flags can be added:

#### Flag: `USE_NEW_PRICING_CALCULATION`
**Purpose:** Toggle between old and new (fixed) pricing calculation  
**Default:** `true`  
**File:** `shared/pricingService.ts`

**Implementation:**
```typescript
// Add at top of file
const USE_NEW_PRICING_CALCULATION = 
  process.env.USE_NEW_PRICING_CALCULATION !== 'false';

// In calculateRevenueBreakdown function:
const stripeFees = USE_NEW_PRICING_CALCULATION
  ? Math.round((grossAmount * 0.029 + 0.30) * 100) / 100  // Fixed version
  : Math.round((grossAmount * 0.029 + 30) * 100) / 100;    // Old version (buggy)
```

**To Disable (Rollback to old pricing):**
```bash
# Set environment variable
export USE_NEW_PRICING_CALCULATION=false

# Restart application
pm2 restart great-platform
```

**WARNING:** This would revert to the buggy pricing calculation. Only use in extreme emergency where new calculation is causing worse issues.

#### Flag: `ENABLE_COMPREHENSIVE_VALIDATION`
**Purpose:** Toggle enhanced input validation (NaN, Infinity checks)  
**Default:** `true`

**To Disable:**
```bash
export ENABLE_COMPREHENSIVE_VALIDATION=false
pm2 restart great-platform
```

### Feature Flag Deployment
```bash
# 1. Set environment variable in production
# Via Replit Secrets UI or .env file

# 2. Restart application without code changes
pm2 restart great-platform

# 3. Verify feature is disabled
# Test affected functionality

# 4. Monitor for 1 hour
# Check error rates, response times, revenue accuracy
```

**Expected Time:** Immediate  
**Risk:** Very Low

---

## Database Rollback

### Current Release - No Database Changes

**Good News:** This release (v1.2.0) includes **no database schema changes**, so database rollback is not required.

### Previous Migrations (Reference Only)

If you need to rollback to before the previous migration:

**Migration:** `2025_fix_services_and_pricing.sql`  
**Rollback File:** `server/migrations/2025_fix_services_and_pricing_ROLLBACK.sql`

**Rollback Steps:**
```bash
# 1. Connect to database
psql $DATABASE_URL

# 2. Run rollback script
\i server/migrations/2025_fix_services_and_pricing_ROLLBACK.sql

# 3. Verify rollback
SELECT COUNT(*) FROM venues WHERE services IS NULL;

# 4. Restart application
pm2 restart great-platform
```

**WARNING:** This would rollback changes from a previous release, not v1.2.0.

---

## Verification Steps

### Post-Rollback Verification Checklist

#### Immediate Verification (0-5 minutes)
- [ ] Application starts successfully
- [ ] Health check returns 200 OK
- [ ] No errors in startup logs
- [ ] Critical endpoints responding

**Commands:**
```bash
# Check application status
pm2 status

# Check health endpoint
curl https://great-platform.replit.app/health

# Check recent logs for errors
pm2 logs great-platform --lines 100 | grep ERROR
```

#### Functional Verification (5-15 minutes)
- [ ] Test pricing calculation (create test booking)
- [ ] Verify Stripe fees are reasonable
- [ ] Test venue creation
- [ ] Test event creation
- [ ] Test user authentication

**Manual Tests:**
1. Create booking for $100 → Stripe fee should be ~$3-4 (not $30)
2. Create booking for $1000 → Stripe fee should be ~$29-30
3. Create venue with services
4. Upload photo
5. Set soft hold days and deposit percentage

#### Test Suite Verification (15-25 minutes)
- [ ] Run full test suite
- [ ] Verify all tests pass
- [ ] No unexpected test failures

**Commands:**
```bash
# Run all tests
npm run test

# Expected: 109 tests passing (or fewer if rolled back to v1.1.0)
```

#### Monitoring Verification (30 minutes - 24 hours)
- [ ] Error rate < 1%
- [ ] Response time < 500ms (p95)
- [ ] No customer complaints
- [ ] Revenue calculations accurate

---

## Rollback Scenarios & Procedures

### Scenario 1: Application Won't Start

**Symptoms:**
- PM2 shows "errored" or "stopped"
- Health check fails
- Cannot access application

**Rollback Steps:**
```bash
# 1. Check logs for root cause
pm2 logs great-platform --err --lines 50

# 2. Immediate rollback to v1.1.0
git checkout v1.1.0
npm install
pm2 restart great-platform

# 3. Verify application starts
pm2 status

# 4. Check health endpoint
curl https://great-platform.replit.app/health

# 5. Notify team
# Post in #engineering-alerts Slack channel
```

**Time to Resolution:** 5 minutes

---

### Scenario 2: Pricing Calculations Incorrect

**Symptoms:**
- Stripe fees > $100 for normal transactions
- Revenue splits don't match configuration
- NaN or Infinity values in pricing

**Rollback Steps:**

**Option A: Feature Flag (Fastest)**
```bash
# Disable new pricing calculation
export USE_NEW_PRICING_CALCULATION=false
pm2 restart great-platform
```

**Option B: Code Rollback**
```bash
git checkout v1.1.0
npm install
pm2 restart great-platform
```

**Verification:**
```bash
# Test pricing calculation
node scripts/test-pricing.js

# Create test booking
curl -X POST https://great-platform.replit.app/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "model": "custom"}'

# Verify Stripe fee is ~$29.30, not $59
```

**Time to Resolution:** 2-5 minutes

---

### Scenario 3: Tests Failing

**Symptoms:**
- Test suite failing in CI/CD
- More than 5 tests failing
- Test failures blocking deployment

**Rollback Steps:**
```bash
# 1. Identify which tests are failing
npm run test 2>&1 | grep "FAIL"

# 2. If critical tests fail, rollback
git checkout v1.1.0

# 3. If only new tests fail, disable them temporarily
# Comment out failing test files in vitest.config.ts

# 4. Restart and verify
npm run test
```

**Time to Resolution:** 10-15 minutes

---

### Scenario 4: Performance Degradation

**Symptoms:**
- Response time > 2s
- High CPU usage
- Memory leaks

**Rollback Steps:**
```bash
# 1. Check current performance
pm2 monit

# 2. If severe, rollback immediately
git checkout v1.1.0
npm install
pm2 restart great-platform

# 3. Monitor performance improvement
# Watch for 5 minutes
```

**Time to Resolution:** 5-10 minutes

---

## Emergency Contacts

### On-Call Engineers
- **Primary:** Engineering Lead (+1-XXX-XXX-XXXX)
- **Secondary:** Senior Backend Engineer (+1-XXX-XXX-XXXX)
- **Escalation:** CTO (+1-XXX-XXX-XXXX)

### Communication Channels
- **Slack:** #engineering-alerts
- **PagerDuty:** https://greatplatform.pagerduty.com
- **Status Page:** https://status.great-platform.com

### Rollback Decision Authority
- **Immediate (< 5 min):** Any on-call engineer
- **Scheduled (< 1 hour):** Engineering Lead approval
- **Database rollback:** CTO approval required

---

## Post-Rollback Actions

### Immediate (Within 1 hour)
1. [ ] Document reason for rollback
2. [ ] Update status page
3. [ ] Notify stakeholders
4. [ ] Create incident report ticket

### Short-term (Within 24 hours)
1. [ ] Root cause analysis
2. [ ] Fix identified issues
3. [ ] Add regression tests
4. [ ] Plan re-deployment

### Long-term (Within 1 week)
1. [ ] Incident post-mortem
2. [ ] Process improvements
3. [ ] Update rollback procedures
4. [ ] Share learnings with team

---

## Rollback Success Criteria

### Technical Success
- [ ] Application running stable for 1 hour
- [ ] Error rate < 1%
- [ ] All critical tests passing
- [ ] Performance metrics normal

### Business Success
- [ ] No customer-reported issues
- [ ] Revenue calculations accurate
- [ ] Bookings processing normally
- [ ] Support ticket volume normal

---

## Appendix: Rollback Commands Quick Reference

```bash
# Full rollback to v1.1.0
git checkout v1.1.0 && npm install && pm2 restart great-platform

# Check application status
pm2 status && pm2 logs great-platform --lines 50

# Verify health
curl https://great-platform.replit.app/health

# Run tests
npm run test

# Check error rate
pm2 logs great-platform --err | wc -l

# Monitor real-time
pm2 monit
```

---

**Document Version:** 1.0  
**Last Tested:** October 27, 2025  
**Next Review:** After each deployment
