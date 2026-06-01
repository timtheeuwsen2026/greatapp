# Deployment Guide: Venue Services Feature

## 🚀 Quick Start Deployment

### Option 1: Replit Publishing (Recommended)

**Steps:**
1. Click the **"Publish"** button in the top-right corner of Replit
2. Select deployment type:
   - **Autoscale**: Automatically scales based on traffic (recommended for production)
   - **Reserved VM**: Dedicated resources for consistent performance
3. Wait for build to complete (~2-3 minutes)
4. Copy your staging URL (format: `https://[repl-name]-[username].replit.app`)

**Your Staging URL will be:**
```
https://great-experience-platform-[username].replit.app
```

---

## ✅ Pre-Deployment Verification

Before publishing, verify locally:

```bash
# 1. Check application is running
curl http://localhost:5000/api/health

# 2. Verify database migration completed
npm run db:push

# 3. Check for TypeScript errors
npx tsc --noEmit

# 4. Verify all workflows running
# Check "Start application" workflow is RUNNING in Replit UI

# 5. Test critical paths locally
# - Visit http://localhost:5000/v/zen-garden-retreat-center
# - Login as venue provider
# - Toggle service placement
# - Verify services display correctly
```

**Checklist:**
- [x] Application running without errors
- [x] Database migration successful
- [x] No TypeScript compilation errors
- [x] All responsive CSS working
- [x] Cache invalidation tested
- [x] Services display in correct placement

---

## 🔍 Post-Deployment Verification

### Step 1: Basic Health Check

```bash
# Replace [STAGING_URL] with your actual staging URL

# Check application is responding
curl https://[STAGING_URL]/api/health

# Expected: {"status":"ok"}

# Check database connection
curl https://[STAGING_URL]/api/auth/user

# Expected: 200 OK (or 401 if not logged in - that's fine)
```

---

### Step 2: Venue Services Feature Verification

**Manual Testing Checklist:**

#### Test 1: Public Venue Page Load
```
1. Navigate to: https://[STAGING_URL]/v/zen-garden-retreat-center
2. ✅ Page loads without errors
3. ✅ Services section visible (sidebar or inline)
4. ✅ No console errors (F12 → Console tab)
5. ✅ Images load correctly
6. ✅ Responsive layout works on mobile view
```

#### Test 2: Service Display Placement
```
1. Login to Replit Auth (click user icon)
2. Navigate to venue profile settings
3. Find "Service Display Settings" section
4. Toggle "Show services inline" checkbox
5. Click "Save Changes"
6. ✅ Success toast appears
7. Navigate to public venue page
8. ✅ Services moved to inline position
9. Toggle back to sidebar
10. ✅ Services moved to sidebar
```

#### Test 3: Service CRUD Operations
```
1. Go to venue profile settings
2. Scroll to "Services" section
3. Click "Add Service"
4. Fill form:
   - Title: "Test Service"
   - Price: 50
   - Frequency: per_day
   - Description: "Test description"
5. Click "Save"
6. ✅ Service appears in list
7. Edit the service (change price to 60)
8. ✅ Updated price persists
9. Delete the test service
10. ✅ Service removed successfully
```

#### Test 4: Cache Invalidation
```
1. Open venue page in two browser tabs
2. In Tab 1: Add new service "Cache Test - $100/session"
3. In Tab 2: Refresh the page
4. ✅ New service appears immediately
5. In Tab 1: Toggle placement to inline
6. In Tab 2: Refresh
7. ✅ Services moved to inline position
8. ✅ No stale data (check Network tab for 200 responses, not 304)
```

#### Test 5: Responsive Design
```
1. Open DevTools (F12)
2. Click device toolbar (Ctrl+Shift+M)
3. Test Mobile (375px):
   ✅ Services use small text
   ✅ Titles truncate with ellipsis
   ✅ No horizontal scroll
   ✅ Touch targets ≥44px
4. Test Tablet (768px):
   ✅ Grid layout appears
   ✅ Services in sidebar on right
   ✅ Full titles visible
5. Test Desktop (1024px+):
   ✅ Maximum spacing
   ✅ All content readable
   ✅ Hover states work
```

#### Test 6: Accessibility
```
1. Use keyboard only (Tab key):
   ✅ Can navigate all services
   ✅ Focus outlines visible
   ✅ Enter/Space activates elements
2. Run Lighthouse audit (DevTools → Lighthouse):
   ✅ Accessibility score ≥95
   ✅ Performance score ≥90
   ✅ Best Practices score ≥90
3. Test screen reader (optional):
   ✅ Services announced correctly
   ✅ ARIA labels working
```

---

### Step 3: Database Verification

```bash
# Connect to production database (via Replit Console)

# Check venue count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM venues;"
# Expected: 27

# Check services exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM venue_services;"
# Expected: ≥1

# Check specific venue has services
psql $DATABASE_URL -c "
  SELECT v.name, COUNT(vs.id) as service_count
  FROM venues v
  LEFT JOIN venue_services vs ON v.id = vs.venue_id
  WHERE v.slug = 'zen-garden-retreat-center'
  GROUP BY v.name;
"
# Expected: Zen Garden Retreat Center | 1 (or more)

# Verify display preferences
psql $DATABASE_URL -c "
  SELECT name, display_prefs->'servicesPlacement' as placement
  FROM venues
  WHERE display_prefs IS NOT NULL;
"
# Expected: Shows 'sidebar' or 'inline' for configured venues
```

---

## 📊 Live Verification Steps (QA Checklist)

### Critical Path Testing

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Visit staging URL | Homepage loads | ⬜ |
| 2 | Navigate to venue page | Venue details show | ⬜ |
| 3 | Check services display | Services visible in correct placement | ⬜ |
| 4 | Login as venue provider | Login successful | ⬜ |
| 5 | Toggle service placement | Setting saves and updates | ⬜ |
| 6 | Add new service | Service created successfully | ⬜ |
| 7 | Edit service | Changes persist | ⬜ |
| 8 | Delete service | Service removed | ⬜ |
| 9 | Test responsive design | Works at all breakpoints | ⬜ |
| 10 | Test keyboard navigation | All elements accessible | ⬜ |

### Performance Benchmarks

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Page Load Time | <3s | ___ | ⬜ |
| Time to Interactive | <4s | ___ | ⬜ |
| API Response Time | <200ms | ___ | ⬜ |
| Lighthouse Performance | ≥90 | ___ | ⬜ |
| Lighthouse Accessibility | ≥95 | ___ | ⬜ |

---

## 🔄 Rollback Procedure

### If Critical Issues Found in Staging

**Immediate Rollback Steps:**

```bash
# 1. Stop the deployment
# In Replit: Click "Stop" on the published deployment

# 2. Revert database changes (if needed)
psql $DATABASE_URL -f migrations/001_rollback.sql

# 3. Verify rollback
psql $DATABASE_URL -c "
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_name = 'venue_services';
"
# If rollback successful, table should not exist (or should be restored from backup)

# 4. Redeploy previous version
# In Replit: Click "Publish" again, it will deploy current state
```

**Rollback Time Estimate:** 5-10 minutes

---

## 🎯 Production Deployment (After Staging Verification)

### Go/No-Go Decision

**GO if all these are ✅:**
- [ ] All acceptance criteria passing
- [ ] QA checklist completed
- [ ] Performance benchmarks met
- [ ] No critical bugs found
- [ ] Rollback plan tested
- [ ] Documentation reviewed

**NO-GO if any of these occur:**
- [ ] Data corruption detected
- [ ] Critical functionality broken
- [ ] Performance degradation >20%
- [ ] Security vulnerabilities found
- [ ] Accessibility score <90

### Production Deployment Steps

```bash
# 1. Merge to main branch (if using Git)
git checkout main
git merge feature/venue-services-management
git push origin main

# 2. Update production database
# (Same migration script, but run on production DB)
# ⚠️ BACKUP FIRST!

# 3. Deploy to production
# In Replit: Use the same "Publish" flow
# Select "Production" environment (if available)

# 4. Monitor for 1 hour
# Watch error rates, performance metrics, user feedback
```

---

## 📈 Monitoring & Alerts

### What to Monitor After Deployment

**First 24 Hours:**
1. **Error Rate**: Should stay <1%
2. **Response Time**: Should be <200ms average
3. **User Feedback**: Monitor support channels
4. **Database Performance**: Watch query times

**Monitoring Tools:**
```bash
# Check application logs
tail -f /tmp/logs/Start_application_*.log

# Check for errors
grep -i error /tmp/logs/Start_application_*.log | tail -20

# Monitor database connections
psql $DATABASE_URL -c "
  SELECT count(*) as active_connections 
  FROM pg_stat_activity;
"
```

### Alert Thresholds

- 🔴 **Critical**: Error rate >5%, response time >1s
- 🟡 **Warning**: Error rate >2%, response time >500ms
- 🟢 **Normal**: Error rate <1%, response time <200ms

---

## 📞 Support & Troubleshooting

### Common Issues & Solutions

#### Issue 1: Services Not Displaying
**Symptoms:** Blank services section on venue page

**Debug Steps:**
```bash
# Check if services exist in database
psql $DATABASE_URL -c "
  SELECT * FROM venue_services 
  WHERE venue_id = '[venue-id]';
"

# Check API endpoint
curl https://[STAGING_URL]/api/venues/[venue-id]/services

# Check browser console for errors
# F12 → Console tab
```

**Solution:** Verify venue has services, check API response

---

#### Issue 2: Placement Toggle Not Working
**Symptoms:** Services don't move when toggling placement

**Debug Steps:**
```bash
# Check display_prefs in database
psql $DATABASE_URL -c "
  SELECT name, display_prefs 
  FROM venues 
  WHERE id = '[venue-id]';
"

# Check browser console for mutation errors
# Should see successful PUT request
```

**Solution:** Verify cache invalidation, hard refresh browser

---

#### Issue 3: Responsive Layout Broken
**Symptoms:** Overflow or wrapping issues on mobile

**Debug Steps:**
```bash
# Check for CSS conflicts
# F12 → Elements tab → Inspect service badge
# Look for overridden Tailwind classes

# Verify viewport meta tag
# Should have: <meta name="viewport" content="width=device-width">
```

**Solution:** Clear browser cache, verify CSS classes applied

---

## ✅ Final Checklist

**Before marking deployment complete:**

- [ ] Staging URL is live and accessible
- [ ] All QA verification steps completed
- [ ] Performance benchmarks met
- [ ] No console errors
- [ ] Responsive design works
- [ ] Accessibility verified
- [ ] Documentation updated
- [ ] Team notified of deployment
- [ ] Monitoring enabled
- [ ] Rollback plan ready

---

## 📝 Deployment Log

**Deployment Details:**

- **Date:** _________________
- **Deployed By:** _________________
- **Staging URL:** _________________
- **Commit Hash:** _________________
- **Database Migration:** ✅ Completed
- **QA Sign-Off:** _________________

**Issues Found:** (List any issues discovered during verification)

**Resolution:** (How issues were resolved)

**Go-Live Approved By:** _________________

---

**🎉 Deployment Complete!**

Your staging URL: `https://[your-repl-name]-[username].replit.app`

Share this URL with QA team for verification!
