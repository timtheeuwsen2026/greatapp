-- Verification Queries for Venue Services Migration
-- Run these to verify the migration was successful

\echo '=== 1. Services Distribution ==='
SELECT 
  CASE 
    WHEN services IS NULL THEN 'No services'
    WHEN jsonb_array_length(services) = 0 THEN 'Empty array'
    ELSE jsonb_array_length(services)::text || ' services'
  END as services_status,
  COUNT(*) as venue_count
FROM venues
GROUP BY services_status;

\echo ''
\echo '=== 2. Display Preferences Distribution ==='
SELECT 
  COALESCE(display_prefs->>'servicesPlacement', 'not set') as placement,
  COUNT(*) as venue_count
FROM venues
GROUP BY display_prefs->>'servicesPlacement';

\echo ''
\echo '=== 3. Venues with Services (Sample) ==='
SELECT 
  v.id,
  v.name,
  jsonb_array_length(v.services) as service_count,
  display_prefs->>'servicesPlacement' as placement
FROM venues v
WHERE v.services IS NOT NULL AND jsonb_array_length(v.services) > 0
LIMIT 10;

\echo ''
\echo '=== 4. Service Details (Sample) ==='
SELECT 
  v.name as venue_name,
  s.value->>'title' as service_title,
  s.value->>'price' as price,
  s.value->>'frequency' as frequency
FROM venues v
CROSS JOIN LATERAL jsonb_array_elements(v.services) AS s(value)
WHERE jsonb_array_length(v.services) > 0
LIMIT 10;

\echo ''
\echo '=== 5. Data Integrity Check ==='
SELECT 
  COUNT(*) as total_venues,
  SUM(CASE WHEN services IS NOT NULL AND jsonb_array_length(services) > 0 THEN 1 ELSE 0 END) as venues_with_services,
  SUM(CASE WHEN display_prefs IS NOT NULL THEN 1 ELSE 0 END) as venues_with_display_prefs
FROM venues;

\echo ''
\echo 'Migration verification complete!'
