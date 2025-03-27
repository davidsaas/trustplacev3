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
import type { ReportSection } from './components/ReportNavMenu'
import { useAuth } from '@/components/shared/providers/auth-provider'

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

// Function to fetch similar accommodations (OPTIMIZED)
async function findSimilarAccommodations(
  location: Location,
  price: number | null,
  currentScore: number,
  excludeId: string
): Promise<SimilarAccommodation[]> {
  // Validate inputs
  if (!location || !isValidCoordinates(location.lat, location.lng)) {
    console.error('Invalid location in findSimilarAccommodations:', location);
    return [];
  }

  // console.log('Finding similar accommodations:', { hasPrice: price !== null, currentScore, searchRadius: LOCATION_RADIUS });
  // console.log('Location bounds:', { latMin: location.lat - LOCATION_RADIUS, latMax: location.lat + LOCATION_RADIUS, lngMin: location.lng - LOCATION_RADIUS, lngMax: location.lng + LOCATION_RADIUS });

  try {
    // 1. Fetch candidate accommodations based on location/price
    let query = supabaseServer
      .from('accommodations')
      .select('id, name, price_per_night, latitude, longitude, source')
      .neq('id', excludeId)
      .gte('latitude', location.lat - LOCATION_RADIUS)
      .lte('latitude', location.lat + LOCATION_RADIUS)
      .gte('longitude', location.lng - LOCATION_RADIUS)
      .lte('longitude', location.lng + LOCATION_RADIUS);

    if (price !== null && price > 0) {
      // ... (price constraints) ...
      query = query
        .gte('price_per_night', price * PRICE_RANGE.MIN)
        .lte('price_per_night', price * PRICE_RANGE.MAX);
    }

    const { data: accommodations, error } = await query;

    if (error) {
      console.error('Error fetching similar accommodations:', error);
      return [];
    }
    if (!accommodations || accommodations.length === 0) return [];

    console.log(`[findSimilarAccommodations] Found ${accommodations.length} candidates.`);

    // 2. Prepare locations for batch metric fetching
    const validLocationsMap = new Map<string, Location>();
    const validAccommodations = accommodations.filter(acc => {
        const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
        const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;
        if (isValidCoordinates(accLat, accLng)) {
            const locKey = `${accLat},${accLng}`;
            if (!validLocationsMap.has(locKey)) {
                validLocationsMap.set(locKey, { lat: accLat, lng: accLng });
            }
            return true;
        }
        console.warn(`Invalid coordinates for accommodation ${acc.name} (${acc.id})`);
        return false;
    });

    const locationsToFetch = Array.from(validLocationsMap.values());

    if (locationsToFetch.length === 0) return [];

    // 3. Fetch metrics for all valid locations in batch
    console.log(`[findSimilarAccommodations] Fetching metrics for ${locationsToFetch.length} unique locations.`);
    const metricsByLocation = await findClosestSafetyMetricsBatch(locationsToFetch);
    console.log(`[findSimilarAccommodations] Received metrics for ${Object.keys(metricsByLocation).length} locations.`);

    // 4. Process accommodations with fetched metrics
    const similarAccommodations = validAccommodations.map(acc => {
      const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
      const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;
      const locKey = `${accLat},${accLng}`;
      const metrics = metricsByLocation[locKey];

      if (!metrics || metrics.length === 0) {
        return null; // Skip if no metrics found for this location
      }

      const overall_score = Math.round(
        metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length * 10
      );

      const hasCompleteData = metrics.length === 5; // Assuming 5 means complete

      return overall_score > currentScore ? {
        id: acc.id,
        name: acc.name,
        price_per_night: acc.price_per_night,
        source: acc.source,
        latitude: accLat,
        longitude: accLng,
        overall_score,
        hasCompleteData
      } : null;
    });

    // 5. Filter and sort results
    const filteredAccommodations = similarAccommodations
      .filter((acc): acc is NonNullable<typeof acc> => acc !== null)
      .sort((a, b) => b.overall_score - a.overall_score);

    console.log(`[findSimilarAccommodations] Returning ${filteredAccommodations.length} similar accommodations.`);
    return filteredAccommodations;

  } catch (err) {
    console.error('Error in findSimilarAccommodations:', err);
    return [];
  }
}

async function getReportData(id: string): Promise<AccommodationData | null> {
  console.log('[getReportData] Fetching report data for accommodation ID:', id); // Log start

  const { data: accommodation, error } = await supabaseServer
    .from('accommodations')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    // Log the specific error when fetching the main accommodation fails
    console.error(`[getReportData] Error fetching accommodation ${id}:`, error.message);
    return null // Return null on direct fetch error
  }

  if (!accommodation) {
    // Log if accommodation is not found
    console.warn(`[getReportData] Accommodation not found for ID: ${id}`);
    return null // Return null if not found
  }

  // console.log('Found accommodation:', accommodation.name, 'Price:', accommodation.price_per_night);

  // Parse coordinates safely, trying different possible fields
  const latString = accommodation.latitude || accommodation.location?.lat || '';
  const lngString = accommodation.longitude || accommodation.location?.lng || '';
  const latitude = typeof latString === 'string' ? parseFloat(latString) : latString;
  const longitude = typeof lngString === 'string' ? parseFloat(lngString) : lngString;
  const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null;


  // console.log('Accommodation coordinates:', location);

  // Ensure image_url is valid
  const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null

  // Fetch safety metrics only if we have valid coordinates
  const locationKey = location ? `${location.lat},${location.lng}` : null;
  const safetyMetricsResult = location ? await findClosestSafetyMetricsBatch([location]) : null;

  // Extract the metrics array for the specific location
  const metricsForLocation: SafetyMetric[] | null = (locationKey && safetyMetricsResult && safetyMetricsResult[locationKey])
    ? safetyMetricsResult[locationKey]
    : null;

  // console.log('Found safety metrics for location:', metricsForLocation?.length ?? 0);

  // Check if we have complete safety data (assuming 5 metrics means complete) based on the extracted array
  const hasCompleteData = metricsForLocation ? metricsForLocation.length === 5 : false;

  // Calculate overall score based on the extracted array
  const overall_score = (metricsForLocation && metricsForLocation.length > 0)
    ? Math.round(metricsForLocation.reduce((sum, metric) => sum + metric.score, 0) / metricsForLocation.length * 10)
    : 0; // Default to 0 if no metrics found

  // console.log('Calculated overall safety score:', overall_score);

  // --- Fetch Accommodation Takeaways ---
  let accommodationTakeaways: string[] | null = null;
  const { data: takeawayData, error: takeawayError } = await supabaseServer
    .from('accommodation_takeaways')
    .select('takeaways') // Select only the takeaways array
    .eq('accommodation_id', id)
    .maybeSingle(); // Fetch one record or null

  if (takeawayError) {
    console.error(`Error fetching accommodation takeaways for ${id}:`, takeawayError.message);
    // Don't fail the whole page load, just log the error
  } else if (takeawayData && takeawayData.takeaways) {
    accommodationTakeaways = takeawayData.takeaways;
    // console.log(`Found ${accommodationTakeaways.length} accommodation takeaways.`);
  } else {
    // console.log(`No accommodation takeaways found for ${id}.`);
  }
  // --- End Fetch Accommodation Takeaways ---

  // Fetch similar accommodations if we have valid location and a score > 0
  let similar_accommodations: SimilarAccommodation[] = [];
  if (location && overall_score > 0) {
    // console.log('Calling findSimilarAccommodations with:', { location, price: accommodation.price_per_night, currentScore: overall_score, excludeId: id });
    similar_accommodations = await findSimilarAccommodations(
      location,
      accommodation.price_per_night, // Pass the actual price (can be null)
      overall_score,
      id
    );
    // console.log(`findSimilarAccommodations returned ${similar_accommodations.length} results`);
  } else {
    // console.log('Skipping similar accommodations search due to missing location or zero score');
  }

  console.log('[getReportData] Successfully processed data for:', accommodation.name); // Log success
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
    location, // Will be null if coordinates were invalid/missing
    safety_metrics: metricsForLocation, // Assign the extracted array
    overall_score,
    similar_accommodations,
    hasCompleteData,
    accommodation_takeaways: accommodationTakeaways // Add to return object
  }
}

export default function SafetyReportPage({ params }: SafetyReportProps) {
  const [reportData, setReportData] = useState<AccommodationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorOccurred, setErrorOccurred] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeSection, setActiveSection] = useState<ReportSection>('overview')
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
      setReportData(null) // Clear previous data

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
        } else {
          console.log("[SafetyReportPage Effect] Report data received:", data.name);
          setReportData(data)
        }
      } catch (error) {
        console.error("[SafetyReportPage Effect] Error during loadData:", error)
        if (isMounted) {
          setErrorOccurred(true)
          // Ensure authChecked is also set in catch block if Promise.all failed before setting it
          if (!authChecked) setAuthChecked(true);
        }
      } finally {
        if (isMounted) {
          console.log("[SafetyReportPage Effect] Setting loading to false.");
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      console.log(`[SafetyReportPage Effect] Cleanup for ID: ${params.id}`);
      isMounted = false
    }
  }, [params.id, supabase])

  const handleSectionChange = (section: ReportSection) => {
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
        return <OverviewSection takeaways={reportData.accommodation_takeaways} />;
      case 'map':
        return (
          <div>
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Map View</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Property location and nearby safer alternatives.
                  </p>
                </div>
              </div>
            </div>
            <div className="h-[400px] bg-white rounded-b-xl shadow-sm overflow-hidden">
              {/* Use Suspense to wrap the lazy-loaded map */}
              <Suspense fallback={<MapLoadingPlaceholder />}>
                {reportData.location ? (
                  <LazyMapView // Use the lazy component
                    location={reportData.location}
                    currentAccommodation={{
                      id: reportData.id,
                      name: reportData.name,
                      overall_score: reportData.overall_score,
                      hasCompleteData: reportData.hasCompleteData
                    }}
                    similarAccommodations={reportData.similar_accommodations.map(acc => ({
                      ...acc,
                      hasCompleteData: !!acc.hasCompleteData
                    }))}
                  />
                ) : (
                  <div className="h-full bg-gray-100 flex items-center justify-center">
                    <p className="text-gray-500">Location coordinates not available</p>
                  </div>
                )}
              </Suspense>
            </div>
          </div>
        );
      case 'safety':
        return (
          <div>
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Safety Analysis</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Detailed safety metrics for this location based on local data.
                  </p>
                </div>
              </div>
            </div>
            <RestrictedContent>
              <SafetyMetrics data={reportData.safety_metrics} />
            </RestrictedContent>
          </div>
        );
      case 'community':
        return (
          <div>
            <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
              <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                <div className="ml-4 mt-4">
                  <h3 className="text-base font-semibold text-gray-900">Community Feedback</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    AI takeaways and raw comments from local discussions.
                  </p>
                </div>
              </div>
            </div>
            <RestrictedContent>
              <CommunityOpinions
                isAuthenticated={isAuthenticated}
                latitude={reportData.location?.lat ?? null}
                longitude={reportData.location?.lng ?? null}
              />
            </RestrictedContent>
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
                    url={reportData.url}
                    overall_score={reportData.overall_score}
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
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