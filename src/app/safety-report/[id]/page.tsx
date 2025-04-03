'use client'

import React, { useState, useEffect, Suspense, lazy } from 'react'
import { notFound } from 'next/navigation'
import { SafetyMetrics } from '../components/SafetyMetrics'
import { CommunityOpinions, type CommunityOpinion } from './components/CommunityOpinions'
import { RestrictedContent } from '@/app/auth/components/restricted-content'
import { supabaseServer } from '@/lib/supabase/server' // Note: Using supabaseServer in 'use client' is generally not recommended directly for auth, relying on Auth context is better. This looks like it might be from server-side props originally, ensure correct usage.
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, SAFETY_RADIUS } from '../constants'
import { isValidCoordinates, calculateDistance } from '../utils'
import Loading from './loading'
import { AppNavbar } from '@/app/components/navbar'
import { OverviewSection } from './components/OverviewSection'
import type { ReportSection, ExtendedReportSection } from './components/ReportNavMenu'
import { useAuth } from '@/components/shared/providers/auth-provider'
import { OSMInsights } from '../components/OSMInsights'
import type { OSMInsightsResponse } from '@/app/api/osm-insights/route'
import { ImageOff, MessageSquare } from 'lucide-react'
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
export const MapLoadingPlaceholder = () => (
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

// --- Helper Function for Background Gradient (FIXED) ---
const getGradientBackgroundStyle = (score: number): React.CSSProperties => {
  // Normalize score to 0-1 range
  const normalizedScore = Math.max(0, Math.min(100, score)) / 100;

  // Define HSL color stops roughly matching getRiskLevel:
  // Very High Risk (0-39): Rose/Red (Hue ~0, Sat 80%, Light 50%)
  // High Risk (40-59): Orange (Hue ~30, Sat 95%, Light 50%)
  // Medium Risk (60-79): Amber (Hue ~40, Sat 90%, Light 50%)
  // Low Risk (80-100): Green (Hue ~120, Sat 60%, Light 45%)
  let hue: number;
  let saturation: number;
  let lightness: number;

  if (normalizedScore < 0.4) {
    // Very High Risk Range (Rose/Red)
    hue = 0; // Keep hue at red
    saturation = 80;
    lightness = 50;
  } else if (normalizedScore < 0.6) {
    // High Risk Range (Interpolate Red -> Orange)
    const t = (normalizedScore - 0.4) / 0.2; // Scale 0.4-0.6 to 0-1
    hue = 0 + (30 - 0) * t;
    saturation = 80 + (95 - 80) * t;
    lightness = 50;
  } else if (normalizedScore < 0.8) {
     // Medium Risk Range (Interpolate Orange -> Amber)
    const t = (normalizedScore - 0.6) / 0.2; // Scale 0.6-0.8 to 0-1
    hue = 30 + (40 - 30) * t;
    saturation = 95 + (90 - 95) * t;
    lightness = 50;
  } else {
    // Low Risk Range (Interpolate Amber -> Green)
    const t = (normalizedScore - 0.8) / 0.2; // Scale 0.8-1.0 to 0-1
    hue = 40 + (120 - 40) * t; // Go towards green
    saturation = 90 + (60 - 90) * t; // Decrease saturation towards green
    lightness = 50 + (45 - 50) * t; // Slightly darken towards green
  }

  const startColor = `hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, 0.15)`; // Start with 15% opacity
  const midColor = `hsla(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, 0.05)`; // Fade to 5% opacity
  const endColor = 'transparent'; // End transparent (will show bg-gray-50 underneath)

  return {
    // Define the gradient image
    backgroundImage: `linear-gradient(to bottom, ${startColor} 0%, ${midColor} 50%, ${endColor} 100%)`,
    // Fix the background relative to the viewport
    backgroundAttachment: 'fixed',
    // Prevent the gradient from repeating
    backgroundRepeat: 'no-repeat',
  };
};
// ----------------------------------------------


// NOTE: The following async functions (findClosestSafetyMetricsBatch, findSimilarAccommodations, etc.)
// are typically run on the server or in API routes in Next.js.
// Calling them directly within a 'use client' component like this is unusual and might imply
// they were originally intended for Server Components or `getServerSideProps`/`getStaticProps`.
// If these need to run *on the client*, consider moving them to API routes and fetching
// the results using `fetch`. If they *can* run on the server, this component structure
// might need rethinking (e.g., fetching data in a parent Server Component and passing it down).
// For this example, I'm leaving them as defined, assuming they work in your current setup,
// but be aware of this potential architecture issue.

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

  try {
        // Fetch all metrics within the expanded bounding box
    const { data: allMetrics, error } = await supabaseServer // Assuming supabaseServer is correctly configured for this context
        .from('safety_metrics')
        .select('*')
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng);

    if (error) {
        console.error('Error fetching safety metrics batch:', error);
        // Return an object where each location maps to null on error
        return locations.reduce((acc, loc) => {
        acc[`${loc.lat},${loc.lng}`] = null;
        return acc;
        }, {} as Record<string, SafetyMetric[] | null>);
    }

    if (!allMetrics || allMetrics.length === 0) {
        // Return an object where each location maps to null if no metrics found
        return locations.reduce((acc, loc) => {
        acc[`${loc.lat},${loc.lng}`] = null;
        return acc;
        }, {} as Record<string, SafetyMetric[] | null>);
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
  } catch(err) {
      console.error('[findClosestSafetyMetricsBatch] Unexpected error during fetch/processing:', err);
      // Return null for all locations on unexpected error
       return locations.reduce((acc, loc) => {
        acc[`${loc.lat},${loc.lng}`] = null;
        return acc;
        }, {} as Record<string, SafetyMetric[] | null>);
  }
}

// Constants for filtering similar accommodations
const SIMILARITY_PRICE_RANGE = { MIN: 0.4, MAX: 1.8 }; // Widen price range
const SAFER_SCORE_THRESHOLD = 3; // Reduced threshold for 'safer'
const MIN_METRIC_TYPES_FOR_RELIABLE_SCORE = 3; // Reduced reliability requirement
const MAX_SIMILAR_RESULTS = 8; // Show top 8 results (Changed from 5)
const SIMILAR_ACCOMMODATION_RADIUS = 0.4; // NEW: Increased radius for finding similar accommodations (~44km)

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
    let query = supabaseServer // Assuming supabaseServer is correctly configured
      .from('accommodations')
      // Select necessary fields + the pre-calculated score and metric count
      .select('id, name, price_per_night, latitude, longitude, source, overall_safety_score, safety_metric_types_found, property_type, room_type, bedrooms, image_url')
      .neq('id', excludeId)
      // --- Geographic Filter (Bounding Box with Increased Radius) ---
      .gte('latitude', location.lat - SIMILAR_ACCOMMODATION_RADIUS)
      .lte('latitude', location.lat + SIMILAR_ACCOMMODATION_RADIUS)
      .gte('longitude', location.lng - SIMILAR_ACCOMMODATION_RADIUS)
      .lte('longitude', location.lng + SIMILAR_ACCOMMODATION_RADIUS)
      // --- Safety Filter --- (Using pre-calculated scores)
      .gt('overall_safety_score', currentScore + SAFER_SCORE_THRESHOLD)
      // --- Reliability Filter --- (Using pre-calculated metric count)
      .gte('safety_metric_types_found', MIN_METRIC_TYPES_FOR_RELIABLE_SCORE)
      // --- Basic Similarity Filters ---
      .eq('property_type', property_type) // Match property type
      .eq('room_type', room_type); // Match room type

    // Optional: Filter by bedrooms
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
const MAX_MAP_MARKERS = 300; // Limit markers on map for performance

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
    const { data: nearby, error } = await supabaseServer // Assuming supabaseServer is correctly configured
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

    console.log(`[fetchAllNearbyAccommodations] Returning ${resultsWithDistance.length} formatted nearby accommodations for map.`);
    return resultsWithDistance;

  } catch (err) {
    console.error('[fetchAllNearbyAccommodations] Unexpected error:', err);
    return [];
  }
}

// --- REVISED getReportData ---
async function getReportData(id: string): Promise<AccommodationData | null> {
  console.log('[getReportData] Fetching report data for accommodation ID:', id);

  try {
    const { data: accommodation, error } = await supabaseServer // Assuming supabaseServer is correctly configured
        .from('accommodations')
        // Select the new metric count column
        .select('*, overall_safety_score, safety_metric_types_found, description, city_id')
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

    // Parse coordinates safely
    const latString = accommodation.latitude || accommodation.location?.lat || '';
    const lngString = accommodation.longitude || accommodation.location?.lng || '';
    const latitude = typeof latString === 'string' ? parseFloat(latString) : latString;
    const longitude = typeof lngString === 'string' ? parseFloat(lngString) : lngString;
    const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null;

    // Ensure image_url is valid
    const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null

    // Use the score from the table
    const overall_score = accommodation.overall_safety_score ?? 0;
    console.log('[getReportData] Using pre-calculated overall safety score:', overall_score);

    // --- Fetch individual metrics for detailed display ---
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

    // --- Fetch Accommodation Takeaways ---
    let accommodationTakeaways: string[] | null = null;
    const { data: takeawayData, error: takeawayError } = await supabaseServer // Assuming supabaseServer is correctly configured
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

    // --- Fetch similar accommodations ---
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
        room_type: accommodation.room_type,
        description: accommodation.description, // Add description
        city_id: accommodation.city_id // Add city_id
    }
  } catch (err) {
      console.error('[getReportData] Unexpected error fetching or processing report data for ID', id, err);
      return null;
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

  // --- State for Community Opinions ---
  const [communityOpinions, setCommunityOpinions] = useState<CommunityOpinion[] | null>(null);
  const [loadingCommunityOpinions, setLoadingCommunityOpinions] = useState<boolean>(false);
  const [communityOpinionsError, setCommunityOpinionsError] = useState<string | null>(null);
  const [communityOpinionsCount, setCommunityOpinionsCount] = useState<number>(0);
  // --- End State for Community Opinions ---

  const { supabase } = useAuth() // Use the client-side Supabase instance from context for auth checks and RPCs

  // Validate ID early
  if (!params.id) {
    console.error("[SafetyReportPage] No ID provided in params.");
    // We can't call notFound() directly here (outside render/effect),
    // but the effect will handle the error state.
  }

  // --- NEW: useEffect for GetYourGuide Script ---
  useEffect(() => {
      const scriptId = 'gyg-widget-script';
      if (!document.getElementById(scriptId)) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.async = true;
          script.defer = true;
          script.src = "https://widget.getyourguide.com/v2/core.js";
          document.body.appendChild(script);

          // Optional: Cleanup script on component unmount if necessary
          // Be cautious removing scripts potentially shared by other components
          // return () => {
          //     const existingScript = document.getElementById(scriptId);
          //     if (existingScript && document.body.contains(existingScript)) {
          //        document.body.removeChild(existingScript);
          //     }
          // };
      }
  }, []); // Run only once on mount
  // --- End GetYourGuide Script useEffect ---

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
      // Reset community opinions state
      setCommunityOpinions(null);
      setLoadingCommunityOpinions(true);
      setCommunityOpinionsError(null);
      setCommunityOpinionsCount(0);

      try {
        if (!supabase) {
           // Wait a cycle if supabase client isn't ready yet from context
           console.warn("[SafetyReportPage Effect] Supabase client not available yet, will retry shortly.");
           // Optional: Add a small delay and retry logic, or rely on re-render when context updates
           // For simplicity, throwing error for now. A better approach might be to disable fetches until ready.
           throw new Error("Supabase client not available from Auth context");
        }
        console.log("[SafetyReportPage Effect] Fetching report data and session concurrently...");

        // **Important:** getReportData uses supabaseServer. If this component is 'use client',
        // this implies getReportData is either being called incorrectly here, OR it's actually
        // making API calls internally, OR it was intended for server-side rendering.
        // Assuming it works as intended in your setup for now.
        const [data, { data: { session } }] = await Promise.all([
          getReportData(params.id), // This might need refactoring if it relies purely on server context
          supabase.auth.getSession() // Use client Supabase for session check
        ])
        console.log("[SafetyReportPage Effect] Promise.all resolved.");

        if (!isMounted) {
          console.log("[SafetyReportPage Effect] Component unmounted before state update.");
          return
        }

        console.log("[SafetyReportPage Effect] Auth session:", session ? `User ${session.user.id}` : 'No session');
        const authenticated = !!session;
        setIsAuthenticated(authenticated)
        setAuthChecked(true) // Mark auth as checked regardless of data outcome

        if (!data) {
          // Explicitly handle null data from getReportData as an error case for this page
          console.error(`[SafetyReportPage Effect] No report data returned or fetch failed for ID: ${params.id}`)
          setErrorOccurred(true)
          setLoadingNearbyMapData(false) // Stop nearby loading if report fails
          setLoadingCommunityOpinions(false); // Stop community opinions loading if report fails
        } else {
          console.log("[SafetyReportPage Effect] Report data received:", data.name);
          setReportData(data)

          // --- Trigger Secondary Fetches --- //
          const secondaryFetches: Promise<any>[] = [];

          // OSM Fetch (Using client-side fetch to an API route)
          if (data.location) {
            setLoadingOSM(true);
            secondaryFetches.push(
              fetch(`/api/osm-insights?lat=${data.location.lat}&lng=${data.location.lng}`)
                .then(res => {
                    if (!res.ok) throw new Error(`OSM API fetch failed: ${res.status} ${res.statusText}`);
                    return res.json();
                })
                .then(osmData => { if (isMounted) setOsmInsights(osmData); })
                .catch(err => console.error("[SafetyReportPage Effect] Error fetching OSM insights:", err))
                .finally(() => { if (isMounted) setLoadingOSM(false); })
            );
          } else {
             console.log("[SafetyReportPage Effect] Skipping OSM fetch due to missing location.");
             if (isMounted) setLoadingOSM(false);
          }

          // Nearby Accommodations Fetch (for Map - assuming fetchAllNearbyAccommodations is okay to run here)
          // Again, consider if this should be an API route.
          if (data.location) {
             console.log("[SafetyReportPage Effect] Fetching all nearby accommodations for map...");
             setLoadingNearbyMapData(true); // Ensure loading state is true before fetch
             secondaryFetches.push(
                fetchAllNearbyAccommodations(data.location, data.id) // Needs supabaseServer context potentially
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
             if (isMounted) setLoadingNearbyMapData(false); // Set loading false if skipped
          }

          // Community Opinions Fetch (Using client-side Supabase RPC)
          if (authenticated && data.location && supabase) {
            console.log("[SafetyReportPage Effect] Fetching safety-related community opinions...");
            setLoadingCommunityOpinions(true); // Ensure loading is true
            const { lat, lng } = data.location;
            const radiusMeters = 2000; // Define radius
            const opinionLimit = 50; // Define limit

            secondaryFetches.push(
                Promise.all([
                    supabase.rpc('get_safety_related_opinions_within_radius', {
                        target_lat: lat,
                        target_lon: lng,
                        radius_meters: radiusMeters,
                        opinion_limit: opinionLimit
                    }),
                    supabase.rpc('count_safety_related_opinions_within_radius', {
                        target_lat: lat,
                        target_lon: lng,
                        radius_meters: radiusMeters
                    })
                ]).then(([opinionsResult, countResult]) => {
                    if (!isMounted) return;

                    // Handle Opinions Data
                    if (opinionsResult.error) {
                        console.error("[SafetyReportPage Effect] Error fetching community opinions:", opinionsResult.error.message);
                        setCommunityOpinionsError('Failed to fetch community comments.');
                        setCommunityOpinions(null);
                    } else {
                        console.log(`[SafetyReportPage Effect] Fetched ${opinionsResult.data?.length ?? 0} community opinions.`);
                        setCommunityOpinions(opinionsResult.data as CommunityOpinion[] ?? []);
                    }

                    // Handle Count Data
                    if (countResult.error) {
                        console.error("[SafetyReportPage Effect] Error fetching community opinions count:", countResult.error.message);
                        // Use the length of fetched opinions as a fallback count if count fails? Or 0?
                        setCommunityOpinionsCount(opinionsResult.data?.length ?? 0);
                    } else {
                        // Supabase RPC count often returns just the number in `data` or a `count` property
                        const count = typeof countResult.data === 'number' ? countResult.data : (countResult.data as any)?.count ?? 0;
                        console.log(`[SafetyReportPage Effect] Fetched community opinions count: ${count}`);
                        setCommunityOpinionsCount(count);
                    }

                }).catch(err => {
                    console.error("[SafetyReportPage Effect] Error in community opinions Promise.all:", err);
                    if (isMounted) {
                        setCommunityOpinionsError('Could not load community comments or count.');
                        setCommunityOpinions(null);
                        setCommunityOpinionsCount(0);
                    }
                }).finally(() => {
                    if (isMounted) setLoadingCommunityOpinions(false);
                })
            );
          } else {
              console.log("[SafetyReportPage Effect] Skipping community opinions fetch (not authenticated, missing location, or supabase client unavailable).");
              if (isMounted) setLoadingCommunityOpinions(false); // Set loading false if skipped
          }
          // --- End Community Opinions Fetch ---

          // Wait for all secondary fetches
          if (secondaryFetches.length > 0) {
             console.log(`[SafetyReportPage Effect] Waiting for ${secondaryFetches.length} secondary fetches...`);
             await Promise.all(secondaryFetches);
             console.log("[SafetyReportPage Effect] All secondary fetches completed.");
          } else {
              // Ensure loading states are false if no secondary fetches occurred
              if (isMounted) {
                setLoadingOSM(false);
                setLoadingNearbyMapData(false);
                setLoadingCommunityOpinions(false);
              }
          }
          // --- End Secondary Fetches --- //
        }
      } catch (error) {
        console.error("[SafetyReportPage Effect] Error during loadData:", error)
        if (isMounted) {
          setErrorOccurred(true)
          // Ensure authChecked is also set in catch block if Promise.all failed before setting it
          if (!authChecked) setAuthChecked(true);
          setLoadingNearbyMapData(false); // Ensure loading is false on error
          setLoadingOSM(false);
          setLoadingCommunityOpinions(false);
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
  }, [params.id, supabase]) // Dependency array includes params.id and the supabase client instance

  const handleSectionChange = (section: ExtendedReportSection) => {
    setActiveSection(section)
  }

  // Trigger notFound navigation if an error occurred during data fetching
  useEffect(() => {
    if (!loading && errorOccurred) {
        console.log("[SafetyReportPage Render Effect] Error occurred, navigating to notFound.");
        notFound();
    }
  }, [loading, errorOccurred]);


  // Loading state
  if (loading || !authChecked) {
     console.log(`[SafetyReportPage Render] Rendering Loading component (loading: ${loading}, authChecked: ${authChecked})`);
    return <Loading />
  }

  // If loading finished, auth checked, no error, but still no data (edge case, potentially handled by errorOccurred)
  if (!reportData) {
      console.error("[SafetyReportPage Render] Unexpected state: Loading finished, auth checked, no error, but no report data. Rendering fallback.");
      // Avoid calling notFound() directly in render. Error state should handle navigation.
      // Render minimal fallback or null. Loading component might still be visible briefly if error occurs late.
      return null; // Or a minimal error message component if preferred
  }

  console.log("[SafetyReportPage Render] Rendering main content for:", reportData.name);

  // Get the gradient style based on the score
  const backgroundStyle = getGradientBackgroundStyle(reportData.overall_score);

  // Helper to render section content
  const renderSectionContent = () => {
    if (!reportData) return null; // Guard against null reportData

    switch (activeSection) {
      case 'overview':
        return (
          <div key="overview" className="space-y-6">
            <OverviewSection
              takeaways={reportData.accommodation_takeaways}
              alternatives={reportData.similar_accommodations}
              currentAccommodation={{
                 id: reportData.id,
                 name: reportData.name,
                 overall_score: reportData.overall_score,
                 hasCompleteData: reportData.hasCompleteData
              }}
              currentMetrics={reportData.safety_metrics}
              currentScore={reportData.overall_score}
              allNearbyAccommodations={allNearbyAccommodations}
              location={reportData.location}
              loadingNearbyMapData={loadingNearbyMapData}
            />
          </div>
        );
      case 'safety':
        return (
          <div key="safety">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">Safety</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Detailed safety metrics for this location.
                  </p>
                </div>
              </div>
            </div>
            <SafetyMetrics data={reportData.safety_metrics} />
          </div>
        );
      case 'neighborhood':
        return (
          <div key="neighborhood">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">Neighborhood Insights</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Insights about the immediate surroundings based on OpenStreetMap data.
                  </p>
                </div>
              </div>
            </div>
            <OSMInsights data={osmInsights} isLoading={loadingOSM} />
          </div>
        );
      case 'comments':
            return (
              <div key="comments">
                <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
                  <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                    <div className="ml-4 mt-4">
                      <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center gap-2">
                         <MessageSquare className="size-5 text-gray-500" /> Raw Community Comments
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Safety-related comments from local discussions near this location. Restricted access.
                      </p>
                    </div>
                  </div>
                </div>
                {/* Wrap CommunityOpinions in RestrictedContent - Removed fallback prop */}
                <RestrictedContent>
                    <CommunityOpinions
                      isAuthenticated={isAuthenticated} // Pass auth status if needed internally by CommunityOpinions
                      opinions={communityOpinions}
                      isLoading={loadingCommunityOpinions}
                      error={communityOpinionsError}
                    />
                </RestrictedContent>
              </div>
            );
      case 'activities':
        // --- Dynamic Location Logic ---
        const { location, neighborhood, city_id } = reportData;
        let gygLocationId = '179'; // Default to Los Angeles ID
        let gygLocationName = 'Los Angeles'; // Default name
        let gygLocationLink = 'https://www.getyourguide.com/los-angeles-l179/'; // Default link

        // --- Dynamic GetYourGuide Location based on city_id ---
        if (city_id === 1) {
           // Already defaulted to LA
        } else if (city_id === 2) {
          gygLocationId = '59'; // New York City ID
          gygLocationName = 'New York City';
          gygLocationLink = 'https://www.getyourguide.com/new-york-city-l59/';
        } else {
           // Log warning or keep default if city_id is unknown/null
           console.warn(`[Activities Section] Unknown city_id: ${city_id}. Defaulting to Los Angeles for GetYourGuide.`);
        }
        // --- End Dynamic GetYourGuide Location ---

        return (
          <div key="activities">
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold leading-6 text-gray-900">What to Do</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Explore tours and activities in {gygLocationName}, powered by GetYourGuide.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-b-xl shadow-sm p-4 sm:p-6">
              {/* GetYourGuide Widget Placeholder */}
              <div
                data-gyg-href="https://widget.getyourguide.com/default/activities.frame"
                data-gyg-location-id={gygLocationId}
                data-gyg-locale-code="en-US"
                data-gyg-widget="activities"
                data-gyg-number-of-items="9" // Adjust number of items as needed
                data-gyg-cmp="safety-report-widget" // Your campaign parameter
                data-gyg-partner-id="PLGSROV" // Your partner ID
              >
                {/* Optional: Fallback content or link */}
                <span className="text-xs text-gray-500">
                  Loading activities... If content doesn't appear, check{' '}
                  <a target="_blank" rel="noopener noreferrer sponsored" href={gygLocationLink} className="text-blue-600 hover:underline">
                    GetYourGuide for {gygLocationName}
                  </a>.
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
    // Apply the fixed background style here
    <div className="min-h-screen bg-gray-50" style={backgroundStyle}>
      <AppNavbar />

      <div className="pt-6 sm:pt-8">
          <> {/* Use fragment as reportData is guaranteed non-null here */}
            <div className="">
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
                    commentsCount={communityOpinionsCount}
                    description={reportData.description}
                    city_id={reportData.city_id}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 pb-10">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                  {/* Use Suspense for lazy loaded components if needed, although MapView seems integrated into OverviewSection now */}
                   {/* <Suspense fallback={<div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center">Loading Section...</div>}> */}
                      {renderSectionContent()}
                   {/* </Suspense> */}
                </div>
              </div>
            </div>
          </>
      </div>
    </div>
  )
}