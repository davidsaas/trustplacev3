'use client'

import React, { useState, useEffect, Suspense, lazy } from 'react'
import { notFound } from 'next/navigation'
import { SafetyMetrics } from '../components/SafetyMetrics'
import { CommunityOpinions } from './components/CommunityOpinions'
import { RestrictedContent } from '@/app/auth/components/restricted-content'
import { supabaseServer } from '@/lib/supabase/server'
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, SAFETY_RADIUS, PRICE_RANGE } from '../constants'
import { isValidCoordinates, calculateDistance } from '../utils'
import Loading from './loading'
import { AppNavbar } from '@/app/components/navbar'
import { OverviewSection } from './components/OverviewSection'
import type { ReportSection, ExtendedReportSection } from './components/ReportNavMenu'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { OSMInsights } from '../components/OSMInsights'
import type { OSMInsightsResponse } from '@/app/api/osm-insights/route'
import { ImageOff } from 'lucide-react'
import { SaferAlternativesSection } from './components/SaferAlternativesSection'

import type {
  SafetyReportProps,
  SafetyMetric,
  Location,
  AccommodationData,
  SimilarAccommodation,
  AccommodationTakeaway
} from '@/types/safety-report'

// Lazily import MapView
const LazyMapView = lazy(() => import('../components/MapView').then(module => ({ default: module.MapView })));

// Simple placeholder for map loading
const MapLoadingPlaceholder = () => (
  <div className="h-full bg-gray-100 flex items-center justify-center rounded-xl">
    <div className="text-center">
      <svg className="animate-spin h-8 w-8 text-gray-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="text-sm text-gray-500">Loading map...</p>
    </div>
  </div>
);

// Function to find closest safety metrics for MULTIPLE locations
async function findClosestSafetyMetricsBatch(locations: Location[]): Promise<Record<string, SafetyMetric[] | null>> {
  if (!locations || locations.length === 0) return {};

  // Calculate bounding box for all locations
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  locations.forEach(loc => {
    if (isValidCoordinates(loc.lat, loc.lng)) {
      minLat = Math.min(minLat, loc.lat);
      maxLat = Math.max(maxLat, loc.lat);
      minLng = Math.min(minLng, loc.lng);
      maxLng = Math.max(maxLng, loc.lng);
    }
  });

  // Add radius padding to bounding box
  minLat -= SAFETY_RADIUS;
  maxLat += SAFETY_RADIUS;
  minLng -= SAFETY_RADIUS;
  maxLng += SAFETY_RADIUS;

  // Fetch all metrics within the expanded bounding box
  const { data: allMetrics, error } = await supabaseServer
    .from('safety_metrics')
    .select('*')
    .gte('latitude', minLat)
    .lte('latitude', maxLat)
    .gte('longitude', minLng)
    .lte('longitude', maxLng);

  if (error) {
    console.error('Error fetching safety metrics batch:', error);
    return {};
  }

  if (!allMetrics || allMetrics.length === 0) {
    return {};
  }

  // Process metrics (ensure numeric coords/score)
  const processedMetrics = allMetrics.map(metric => ({
    ...metric,
    latitude: typeof metric.latitude === 'string' ? parseFloat(metric.latitude) : metric.latitude,
    longitude: typeof metric.longitude === 'string' ? parseFloat(metric.longitude) : metric.longitude,
    score: typeof metric.score === 'string' ? parseFloat(metric.score) : metric.score
  })).filter(m => isValidCoordinates(m.latitude, m.longitude)); // Filter invalid metrics early

  // Group metrics by location
  const results: Record<string, SafetyMetric[] | null> = {};
  locations.forEach(location => {
    const locationKey = `${location.lat},${location.lng}`;
    if (!isValidCoordinates(location.lat, location.lng)) {
        results[locationKey] = null;
        return;
    }

    const metricsForLocation: Record<string, { metric: SafetyMetric; distance: number }> = {};

    processedMetrics.forEach(metric => {
      const distance = calculateDistance(location, { lat: metric.latitude, lng: metric.longitude });
      const existing = metricsForLocation[metric.metric_type];

      if (!existing || distance < existing.distance) {
        metricsForLocation[metric.metric_type] = { metric, distance };
      }
    });

    const closestMetrics = Object.values(metricsForLocation).map(item => item.metric);
    results[locationKey] = closestMetrics.length > 0 ? closestMetrics : null;
  });

  return results;
}

// Constants for filtering similar accommodations
const SIMILARITY_PRICE_RANGE = { MIN: 0.7, MAX: 1.3 }; // e.g., 70% to 130% of current price
const SAFER_SCORE_THRESHOLD = 5; // Alternative must be at least 5 points higher
const MIN_METRIC_TYPES_FOR_RELIABLE_SCORE = 4; // Require at least 4 metric types for reliable comparison
const MAX_SIMILAR_RESULTS = 5; // Show top 5 results

// Function to fetch similar accommodations (REVISED to include metrics)
async function findSimilarAccommodations(
  currentAccommodation: Pick<
    AccommodationData,
    'id' | 'location' | 'price_per_night' | 'overall_score' | 'property_type' | 'room_type' | 'bedrooms'
  >
): Promise<SimilarAccommodation[]> {
  const { id: excludeId, location, price_per_night, overall_score: currentScore, property_type, room_type, bedrooms } = currentAccommodation;

  // Validate inputs
  if (!location || !isValidCoordinates(location.lat, location.lng)) {
    console.error('[findSimilarAccommodations] Invalid current location:', location);
    return [];
  }
  if (currentScore <= 0) {
    console.warn('[findSimilarAccommodations] Current accommodation has no score, cannot find \'safer\' alternatives.');
    return []; // Cannot find safer if current score is unknown
  }

  console.log(`[findSimilarAccommodations] Finding alternatives near (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}) with score > ${currentScore + SAFER_SCORE_THRESHOLD}`);

  try {
    // 1. Fetch candidate accommodations based on location, score, and basic similarity
    let query = supabaseServer
      .from('accommodations')
      // Select necessary fields + the pre-calculated score and metric count
      .select('id, name, price_per_night, latitude, longitude, source, overall_safety_score, safety_metric_types_found, property_type, room_type, bedrooms, image_url')
      .neq('id', excludeId)
      // --- Geographic Filter --- (Use PostGIS for accurate radius)
      // Note: You'll need to create a PostGIS index on 'location' column if you don't have one
      // Example using ST_DWithin (replace 'location' with your geometry column name if different)
      // .rpc('find_accommodations_within_radius', {
      //   target_lat: location.lat,
      //   target_lon: location.lng,
      //   radius_meters: LOCATION_RADIUS * 111320 // Approx meters per degree latitude
      // })
      // --- Fallback to BBox (less accurate but easier) ---
      .gte('latitude', location.lat - LOCATION_RADIUS)
      .lte('latitude', location.lat + LOCATION_RADIUS)
      .gte('longitude', location.lng - LOCATION_RADIUS)
      .lte('longitude', location.lng + LOCATION_RADIUS)
      // --- Safety Filter --- (Using pre-calculated scores)
      .gt('overall_safety_score', currentScore + SAFER_SCORE_THRESHOLD)
      // --- Reliability Filter --- (Using pre-calculated metric count)
      .gte('safety_metric_types_found', MIN_METRIC_TYPES_FOR_RELIABLE_SCORE)
      // --- Basic Similarity Filters (Add more as needed) ---
      .eq('property_type', property_type) // Match property type
      .eq('room_type', room_type); // Match room type

    // Optional: Filter by bedrooms (e.g., same number or +/- 1)
    if (bedrooms != null && typeof bedrooms === 'number') {
      query = query.gte('bedrooms', Math.max(0, bedrooms - 1))
                   .lte('bedrooms', bedrooms + 1);
    }

    // Optional: Price Filter
    if (price_per_night !== null && price_per_night > 0) {
      query = query
        .gte('price_per_night', price_per_night * SIMILARITY_PRICE_RANGE.MIN)
        .lte('price_per_night', price_per_night * SIMILARITY_PRICE_RANGE.MAX);
    }

    const { data: candidates, error } = await query;

    if (error) {
      console.error('[findSimilarAccommodations] Error fetching candidates:', error);
      return [];
    }
    if (!candidates || candidates.length === 0) {
        console.log('[findSimilarAccommodations] No candidates found matching criteria.');
        return [];
    }

    console.log(`[findSimilarAccommodations] Found ${candidates.length} candidates matching initial criteria.`);

    // 2. Extract valid locations from candidates to fetch their metrics
    const candidateLocations: Location[] = candidates
        .map(acc => {
            const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
            const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;
            return isValidCoordinates(accLat, accLng) ? { lat: accLat, lng: accLng } : null;
        })
        .filter((loc): loc is Location => loc !== null);

    // 3. Fetch metrics for all valid candidate locations in a batch
    console.log(`[findSimilarAccommodations] Fetching metrics for ${candidateLocations.length} valid candidate locations.`);
    const metricsByLocation = await findClosestSafetyMetricsBatch(candidateLocations);
    console.log(`[findSimilarAccommodations] Received metrics for ${Object.keys(metricsByLocation).length} locations.`);

    // 4. Process candidates: Calculate distance AND attach fetched metrics
    const resultsWithData = candidates
      .map(acc => {
        const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
        const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;

        if (!isValidCoordinates(accLat, accLng) || !acc.overall_safety_score) {
            console.warn(`[findSimilarAccommodations] Skipping candidate ${acc.id} due to invalid coords or missing score.`);
            return null;
        }

        const distance = calculateDistance(location, { lat: accLat, lng: accLng });
        const locationKey = `${accLat},${accLng}`; // Key used in metricsByLocation
        const safety_metrics = metricsByLocation[locationKey] || null; // Get metrics for this location

        return {
          id: acc.id,
          name: acc.name,
          price_per_night: acc.price_per_night,
          source: acc.source,
          latitude: accLat,
          longitude: accLng,
          overall_score: acc.overall_safety_score,
          hasCompleteData: (acc.safety_metric_types_found ?? 0) >= MIN_METRIC_TYPES_FOR_RELIABLE_SCORE,
          metricTypesFound: acc.safety_metric_types_found ?? 0,
          distance: distance,
          image_url: acc.image_url,
          safety_metrics: safety_metrics // Attach the fetched metrics
        };
      })
      .filter((acc): acc is NonNullable<typeof acc> => acc !== null);

    // 5. Sort by distance (closest first)
    resultsWithData.sort((a, b) => a.distance - b.distance);

    // 6. Limit results
    const finalResults = resultsWithData.slice(0, MAX_SIMILAR_RESULTS);

    console.log(`[findSimilarAccommodations] Returning ${finalResults.length} similar, safer, nearby accommodations with metrics.`);
    return finalResults;

  } catch (err) {
    console.error('[findSimilarAccommodations] Unexpected error:', err);
    return [];
  }
}

// --- NEW: Function to fetch ALL nearby accommodations for Map Debugging ---
const MAX_MAP_MARKERS = 200; // Limit markers on map for performance

async function fetchAllNearbyAccommodations(
  currentLocation: Location,
  excludeId: string
): Promise<SimilarAccommodation[]> {
  if (!currentLocation || !isValidCoordinates(currentLocation.lat, currentLocation.lng)) {
    console.warn('[fetchAllNearbyAccommodations] Invalid location provided.');
    return [];
  }

  console.log(`[fetchAllNearbyAccommodations] Fetching up to ${MAX_MAP_MARKERS} accommodations near (${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}) excluding ${excludeId}`);

  try {
    const { data: nearby, error } = await supabaseServer
      .from('accommodations')
      .select('id, name, price_per_night, latitude, longitude, source, overall_safety_score, safety_metric_types_found, image_url')
      .neq('id', excludeId)
      // --- Geographic Filter (Bounding Box) ---
      .gte('latitude', currentLocation.lat - LOCATION_RADIUS)
      .lte('latitude', currentLocation.lat + LOCATION_RADIUS)
      .gte('longitude', currentLocation.lng - LOCATION_RADIUS)
      .lte('longitude', currentLocation.lng + LOCATION_RADIUS)
      // --- NO score/reliability/type/price filters here ---
      .limit(MAX_MAP_MARKERS); // Apply limit

    if (error) {
      console.error('[fetchAllNearbyAccommodations] Error fetching nearby accommodations:', error);
      return [];
    }
    if (!nearby || nearby.length === 0) {
        console.log('[fetchAllNearbyAccommodations] No nearby accommodations found within radius.');
        return [];
    }

    console.log(`[fetchAllNearbyAccommodations] Found ${nearby.length} raw nearby accommodations.`);

    // Calculate distance and format
    const resultsWithDistance = nearby
      .map(acc => {
        const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
        const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;

        if (!isValidCoordinates(accLat, accLng)) { return null; }

        const distance = calculateDistance(currentLocation, { lat: accLat, lng: accLng });
        const score = acc.overall_safety_score ?? 0;
        const metricTypes = acc.safety_metric_types_found ?? 0;

        return {
          id: acc.id,
          name: acc.name,
          price_per_night: acc.price_per_night,
          source: acc.source,
          latitude: accLat,
          longitude: accLng,
          overall_score: score,
          hasCompleteData: metricTypes >= MIN_METRIC_TYPES_FOR_RELIABLE_SCORE,
          metricTypesFound: metricTypes,
          distance: distance,
          image_url: acc.image_url,
          safety_metrics: null // Add null metrics for map markers
        };
      })
      .filter((acc): acc is NonNullable<typeof acc> => acc !== null);

    // Optional: Sort by distance if needed, though map doesn't strictly require it
    // resultsWithDistance.sort((a, b) => a.distance - b.distance);

    console.log(`[fetchAllNearbyAccommodations] Returning ${resultsWithDistance.length} formatted nearby accommodations for map.`);
    return resultsWithDistance;

  } catch (err) {
    console.error('[fetchAllNearbyAccommodations] Unexpected error:', err);
    return [];
  }
}

// --- REVISED getReportData --- (Only change is how findSimilarAccommodations is called)
async function getReportData(id: string): Promise<AccommodationData | null> {
  console.log('[getReportData] Fetching report data for accommodation ID:', id);

  const { data: accommodation, error } = await supabaseServer
    .from('accommodations')
    // Select the new metric count column
    .select('*, overall_safety_score, safety_metric_types_found')
    .eq('id', id)
    .single()

  if (error) {
    console.error(`[getReportData] Error fetching accommodation ${id}:`, error.message);
    return null
  }
  if (!accommodation) {
    console.warn(`[getReportData] Accommodation not found for ID: ${id}`);
    return null
  }

  // Parse coordinates safely (unchanged)
  const latString = accommodation.latitude || accommodation.location?.lat || '';
  const lngString = accommodation.longitude || accommodation.location?.lng || '';
  const latitude = typeof latString === 'string' ? parseFloat(latString) : latString;
  const longitude = typeof lngString === 'string' ? parseFloat(lngString) : lngString;
  const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null;

  // Ensure image_url is valid (unchanged)
  const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null

  // Use the score from the table (unchanged)
  const overall_score = accommodation.overall_safety_score ?? 0;
  console.log('[getReportData] Using pre-calculated overall safety score:', overall_score);

  // --- Fetch individual metrics for detailed display (unchanged) ---
  let metricsForLocation: SafetyMetric[] | null = null;
  if (location) {
      console.log('[getReportData] Fetching individual metrics for detailed display...');
      const safetyMetricsResult = await findClosestSafetyMetricsBatch([location]);
      const locationKey = `${location.lat},${location.lng}`;
      metricsForLocation = (safetyMetricsResult && safetyMetricsResult[locationKey]) ? safetyMetricsResult[locationKey] : null;
      console.log(`[getReportData] Found ${metricsForLocation?.length ?? 0} individual metrics.`);
  }
  // ---

  // --- Determine hasCompleteData using the metric count ---
  const metricTypesFound = accommodation.safety_metric_types_found ?? 0;
  const hasCompleteData = metricTypesFound >= MIN_METRIC_TYPES_FOR_RELIABLE_SCORE;
  console.log(`[getReportData] Score reliability: Found ${metricTypesFound} metric types (Threshold: ${MIN_METRIC_TYPES_FOR_RELIABLE_SCORE}), hasCompleteData: ${hasCompleteData}`);
  // ---

  // --- Fetch Accommodation Takeaways (unchanged) ---
  let accommodationTakeaways: string[] | null = null;
  const { data: takeawayData, error: takeawayError } = await supabaseServer
    .from('accommodation_takeaways')
    .select('takeaways')
    .eq('accommodation_id', id)
    .maybeSingle();

  if (takeawayError) {
    console.error(`Error fetching accommodation takeaways for ${id}:`, takeawayError.message);
  } else if (takeawayData && takeawayData.takeaways) {
    accommodationTakeaways = takeawayData.takeaways;
  }
  // ---

  // --- Fetch similar accommodations (Pass relevant parts of current accommodation) ---
  let similar_accommodations: SimilarAccommodation[] = [];
  if (location && overall_score > 0) { // Only search if current location is valid and has a score
    console.log('[getReportData] Calling findSimilarAccommodations...');
    similar_accommodations = await findSimilarAccommodations({
      id: accommodation.id,
      location: location, // Pass the validated location object
      price_per_night: accommodation.price_per_night,
      overall_score: overall_score,
      property_type: accommodation.property_type, // Pass for filtering
      room_type: accommodation.room_type, // Pass for filtering
      bedrooms: accommodation.bedrooms // Pass for filtering
    });
  } else {
    console.log('[getReportData] Skipping similar accommodations search due to missing location or zero score.');
  }
  // ---

  console.log('[getReportData] Successfully processed data for:', accommodation.name);
  return {
    id: accommodation.id,
    url: accommodation.url,
    name: accommodation.name,
    image_url,
    price_per_night: accommodation.price_per_night || null,
    rating: accommodation.rating || null,
    total_reviews: accommodation.total_reviews || null,
    property_type: accommodation.property_type || accommodation.type || null,
    neighborhood: accommodation.neighborhood || (accommodation.address?.full || null),
    source: accommodation.source,
    location,
    safety_metrics: metricsForLocation,
    overall_score,
    similar_accommodations,
    hasCompleteData, // Use the reliability-based flag
    metricTypesFound: metricTypesFound, // Pass the count
    accommodation_takeaways: accommodationTakeaways,
    room_type: accommodation.room_type
  }
}

export default function SafetyReportPage({ params }: SafetyReportProps) {
  const [reportData, setReportData] = useState<AccommodationData | null>(null)
  const [allNearbyAccommodations, setAllNearbyAccommodations] = useState<SimilarAccommodation[]>([])
  const [loading, setLoading] = useState(true)
  const [errorOccurred, setErrorOccurred] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeSection, setActiveSection] = useState<ExtendedReportSection>('overview')
  const [osmInsights, setOsmInsights] = useState<OSMInsightsResponse | null>(null)
  const [loadingOSM, setLoadingOSM] = useState<boolean>(false)
  const [loadingNearbyMapData, setLoadingNearbyMapData] = useState<boolean>(false)
  const { supabase } = useAuth()

  // Validate ID early
  if (!params.id) {
    console.error("[SafetyReportPage] No ID provided in params.");
    notFound()
  }

  // Fetch data and check authentication
  useEffect(() => {
    if (!params.id) {
      console.error("[SafetyReportPage Effect] Effect running without params.id.");
      setErrorOccurred(true)
      setLoading(false)
      setAuthChecked(true)
      return
    }

    let isMounted = true
    console.log(`[SafetyReportPage Effect] Starting data load for ID: ${params.id}`);

    async function loadData() {
      // Reset states at the beginning
      setLoading(true)
      setErrorOccurred(false)
      setAuthChecked(false)
      setReportData(null) // Clear previous report data
      setAllNearbyAccommodations([]) // Clear previous nearby map data
      setLoadingNearbyMapData(true) // Set loading true for nearby map data
      setOsmInsights(null)

      try {
        if (!supabase) {
           throw new Error("Supabase client not available from Auth context");
        }
        console.log("[SafetyReportPage Effect] Fetching report data and session concurrently...");
        const [data, { data: { session } }] = await Promise.all([
          getReportData(params.id),
          supabase.auth.getSession()
        ])
        console.log("[SafetyReportPage Effect] Promise.all resolved.");

        if (!isMounted) {
          console.log("[SafetyReportPage Effect] Component unmounted before state update.");
          return
        }

        console.log("[SafetyReportPage Effect] Auth session:", session ? `User ${session.user.id}` : 'No session');
        setIsAuthenticated(!!session)
        setAuthChecked(true) // Mark auth as checked regardless of data outcome

        if (!data) {
          // Explicitly handle null data from getReportData as an error case for this page
          console.error(`[SafetyReportPage Effect] No report data returned or fetch failed for ID: ${params.id}`)
          setErrorOccurred(true)
          setLoadingNearbyMapData(false) // Stop nearby loading if report fails
        } else {
          console.log("[SafetyReportPage Effect] Report data received:", data.name);
          setReportData(data)

          // --- Trigger Fetches for OSM and ALL Nearby Accommodations ---
          const fetches: Promise<void>[] = [];

          // OSM Fetch
          if (data.location) {
            setLoadingOSM(true);
            fetches.push(
              fetch(`/api/osm-insights?lat=${data.location.lat}&lng=${data.location.lng}`)
                .then(res => res.ok ? res.json() : Promise.reject(`OSM API fetch failed: ${res.statusText}`))
                .then(osmData => { if (isMounted) setOsmInsights(osmData); })
                .catch(err => console.error("[SafetyReportPage Effect] Error fetching OSM insights:", err))
                .finally(() => { if (isMounted) setLoadingOSM(false); })
            );
          } else {
             console.log("[SafetyReportPage Effect] Skipping OSM fetch due to missing location.");
          }

          // Nearby Accommodations Fetch (for Map)
          if (data.location) {
             console.log("[SafetyReportPage Effect] Fetching all nearby accommodations for map...");
             fetches.push(
                fetchAllNearbyAccommodations(data.location, data.id)
                 .then(nearbyData => {
                    if (isMounted) {
                       console.log(`[SafetyReportPage Effect] Received ${nearbyData.length} nearby accommodations for map.`);
                       setAllNearbyAccommodations(nearbyData);
                    }
                 })
                 .catch(err => console.error("[SafetyReportPage Effect] Error fetching nearby accommodations for map:", err))
                 .finally(() => { if (isMounted) setLoadingNearbyMapData(false); }) // Set loading false here
             );
          } else {
             console.log("[SafetyReportPage Effect] Skipping nearby accommodations fetch due to missing location.");
             setLoadingNearbyMapData(false); // Set loading false if skipped
          }

          // Wait for secondary fetches if any were started
          if (fetches.length > 0) {
             await Promise.all(fetches);
          } else {
              // Ensure loading states are false if no secondary fetches occurred
              if (isMounted) {
                setLoadingOSM(false);
                setLoadingNearbyMapData(false);
              }
          }
          // --- End Secondary Fetches ---
        }
      } catch (error) {
        console.error("[SafetyReportPage Effect] Error during loadData:", error)
        if (isMounted) {
          setErrorOccurred(true)
          // Ensure authChecked is also set in catch block if Promise.all failed before setting it
          if (!authChecked) setAuthChecked(true);
          setLoadingNearbyMapData(false); // Ensure loading is false on error
        }
      } finally {
        if (isMounted) {
          console.log("[SafetyReportPage Effect] Setting main loading to false.");
          setLoading(false) // Main loading stops after all primary and secondary fetches attempt
        }
      }
    }

    loadData()

    return () => {
      console.log(`[SafetyReportPage Effect] Cleanup for ID: ${params.id}`);
      isMounted = false
    }
  }, [params.id, supabase])

  const handleSectionChange = (section: ExtendedReportSection) => {
    setActiveSection(section)
  }

  // Check error state *after* loading is false
  if (!loading && errorOccurred) {
    console.log("[SafetyReportPage Render] Error occurred, rendering notFound.");
    notFound()
  }

  // Updated loading condition: Show loading only while actively loading OR if auth hasn't been checked yet.
  // Once loading is false and auth is checked, we should either have data or have triggered notFound.
  if (loading || !authChecked) {
     console.log(`[SafetyReportPage Render] Rendering Loading component (loading: ${loading}, authChecked: ${authChecked})`);
    return <Loading />
  }

  // If loading is false, auth is checked, and no error occurred, but reportData is still null,
  // this indicates an unexpected state. Log it, but maybe render notFound.
  if (!reportData) {
      console.error("[SafetyReportPage Render] Unexpected state: Loading finished, auth checked, no error, but no report data. Rendering notFound.");
      notFound();
      // return null; // Or return null / a specific error component
  }

  console.log("[SafetyReportPage Render] Rendering main content for:", reportData.name);
  // Helper to render section content
  const renderSectionContent = () => {
    if (!reportData) return null;

    switch (activeSection) {
      case 'overview':
        return (
          <div key="overview" className="space-y-6">
            <OverviewSection takeaways={reportData.accommodation_takeaways} />
          </div>
        );
      case 'alternatives':
        return (
          <div key="alternatives">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
                <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                  <div className="ml-4 mt-4">
                    <h3 className="text-base font-semibold text-gray-900">Safer Nearby Alternatives</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Similar properties nearby with significantly better safety scores.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 sm:p-6 rounded-b-xl shadow-sm">
                  <SaferAlternativesSection
                    alternatives={reportData.similar_accommodations}
                    currentScore={reportData.overall_score}
                    currentMetrics={reportData.safety_metrics}
                  />
              </div>
          </div>
        );
      case 'map':
        return (
          <div key="map">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Map</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Property location and nearby safer alternatives.
                  </p>
                </div>
              </div>
            </div>
            <div className="h-[400px] bg-white rounded-b-xl shadow-sm overflow-hidden">
              {/* Show loading indicator specifically for map data if needed */}
              {loadingNearbyMapData && (
                 <div className="h-full flex items-center justify-center bg-gray-50">
                    <p className="text-gray-500 animate-pulse">Loading map data...</p>
                 </div>
              )}
              {/* Render map once nearby data loading is complete AND reportData exists */}
              {!loadingNearbyMapData && reportData.location && (
                  <Suspense fallback={<MapLoadingPlaceholder />}>
                    <LazyMapView
                      location={reportData.location}
                      currentAccommodation={{
                        id: reportData.id,
                        name: reportData.name,
                        overall_score: reportData.overall_score,
                        hasCompleteData: reportData.hasCompleteData
                      }}
                      // --- Pass the NEW state to the map ---
                      similarAccommodations={allNearbyAccommodations}
                      // --- End change ---
                    />
                  </Suspense>
              )}
              {/* Handle case where location is missing even after loading */}
              {!loadingNearbyMapData && !reportData.location && (
                 <div className="h-full bg-gray-100 flex items-center justify-center">
                    <p className="text-gray-500">Location coordinates not available for map.</p>
                 </div>
              )}
            </div>
          </div>
        );
      case 'safety':
        return (
          <div key="safety">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Safety</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Detailed safety metrics and community feedback for this location.
                  </p>
                </div>
              </div>
            </div>
            <SafetyMetrics data={reportData.safety_metrics} />

            <div className="mt-6">
              <CommunityOpinions
                isAuthenticated={isAuthenticated}
                latitude={reportData.location?.lat ?? null}
                longitude={reportData.location?.lng ?? null}
              />
            </div>
          </div>
        );
      case 'neighborhood':
        return (
          <div key="neighborhood">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Neighborhood Insights</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Insights about the immediate surroundings based on OpenStreetMap data.
                  </p>
                </div>
              </div>
            </div>
            <OSMInsights data={osmInsights} isLoading={loadingOSM} />
          </div>
        );
      case 'activities':
        // --- Dynamic Location Logic ---
        const { location, neighborhood } = reportData;
        let gygLocationId = '179'; // Default to Los Angeles ID
        let gygLocationName = 'Los Angeles'; // Default name
        let gygLocationLink = 'https://www.getyourguide.com/los-angeles-l179/'; // Default link

        // TODO: Implement actual GetYourGuide Location ID lookup
        // Option 1: Use GetYourGuide API with location.lat, location.lng or neighborhood name.
        // Option 2: Use a manual mapping from neighborhood name to GYG Location ID.
        // Example (Manual Mapping - requires maintaining this map):
        /*
        const locationMap: { [key: string]: { id: string; name: string; link: string } } = {
          'Downtown Los Angeles': { id: '179', name: 'Los Angeles', link: 'https://www.getyourguide.com/los-angeles-l179/' },
          'Santa Monica': { id: '540', name: 'Santa Monica', link: 'https://www.getyourguide.com/santa-monica-l540/' },
          // Add other relevant neighborhoods/cities and their GYG IDs
        };
        if (neighborhood && locationMap[neighborhood]) {
           gygLocationId = locationMap[neighborhood].id;
           gygLocationName = locationMap[neighborhood].name;
           gygLocationLink = locationMap[neighborhood].link;
        } else if (location) {
           // Fallback: Attempt API lookup if neighborhood mapping fails or isn't present
           // gygLocationId = await fetchGygIdFromApi(location.lat, location.lng);
           // Update name/link based on API result
        }
        */
        // For now, we stick with the default '179' (Los Angeles)

        return (
          <div key="activities">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">What to Do</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Explore tours and activities near {neighborhood || 'this location'}, powered by GetYourGuide.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-b-xl shadow-sm p-4 sm:p-6">
              <div
                data-gyg-href="https://widget.getyourguide.com/default/activities.frame"
                data-gyg-location-id={gygLocationId}
                data-gyg-locale-code="en-US"
                data-gyg-widget="activities"
                data-gyg-number-of-items="21"
                data-gyg-cmp="safety-report-widget"
                data-gyg-partner-id="PLGSROV"
              >
                <span className="text-xs text-gray-500">
                  Powered by <a target="_blank" rel="sponsored" href={gygLocationLink} className="text-blue-600 hover:underline">GetYourGuide</a>
                </span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavbar />

      <div className="pt-6 sm:pt-8">
        {reportData && (
          <>
            <div className="bg-gray-50">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                  <PropertyHeader
                    name={reportData.name}
                    price_per_night={reportData.price_per_night}
                    rating={reportData.rating}
                    total_reviews={reportData.total_reviews}
                    source={reportData.source}
                    image_url={reportData.image_url}
                    url={reportData.url ?? null}
                    overall_score={reportData.overall_score}
                    property_type={reportData.property_type}
                    neighborhood={reportData.neighborhood}
                    location={reportData.location}
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    hasCompleteData={reportData.hasCompleteData}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 pb-10">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                  {renderSectionContent()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}