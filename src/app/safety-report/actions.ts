// src/app/safety-report/actions.ts
'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr' // Use ssr client consistently
// Use standard client for potentially broader queries if needed, ensure service role key is set
// Removed incorrect import: import { createClient } from '@/lib/supabase/server';

import type { Database } from '@/lib/supabase/database.types'
import type {
  SafetyMetric,
  Location,
  AccommodationData,
  SimilarAccommodation,
  // CommunityOpinion type is imported below
} from '@/types/safety-report';
// Import CommunityOpinion from its actual location
import type { CommunityOpinion } from './[id]/components/CommunityOpinions';

// Define a type for the data returned by getReportDataAction (excluding similar_accommodations)
type AccommodationReportCoreData = Omit<AccommodationData, 'similar_accommodations'>;
import {
  isValidCoordinates,
  calculateDistance,
} from './utils' // Assuming utils are accessible server-side or copied
// Import only the constants that are actually exported from constants.ts
import {
  LOCATION_RADIUS,
  SAFETY_RADIUS
} from './constants';

// Define the other constants locally as they were in page.tsx
const SIMILARITY_PRICE_RANGE = { MIN: 0.4, MAX: 1.2 };
const SAFER_SCORE_THRESHOLD = 5;
const MIN_METRIC_TYPES_FOR_RELIABLE_SCORE = 3;
const MAX_SIMILAR_RESULTS = 10;
const SIMILAR_ACCOMMODATION_RADIUS = 0.4;
const MAX_MAP_MARKERS = 25; // Reduced for map performance
// Import the new constant
import { OPINION_PROXIMITY_RADIUS } from './constants';

// --- Helper: findClosestSafetyMetricsBatch (Server-Side) ---
// This remains largely the same but uses the server client passed to it or created within
async function findClosestSafetyMetricsBatch(
    supabase: ReturnType<typeof createServerClient<Database>>, // Update type hint
    locations: Location[]
): Promise<Record<string, SafetyMetric[] | null>> {
  if (!locations || locations.length === 0) return {};

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  locations.forEach(loc => {
    if (isValidCoordinates(loc.lat, loc.lng)) {
      minLat = Math.min(minLat, loc.lat);
      maxLat = Math.max(maxLat, loc.lat);
      minLng = Math.min(minLng, loc.lng);
      maxLng = Math.max(maxLng, loc.lng);
    }
  });

  minLat -= SAFETY_RADIUS;
  maxLat += SAFETY_RADIUS;
  minLng -= SAFETY_RADIUS;
  maxLng += SAFETY_RADIUS;

  try {
    const { data: allMetrics, error } = await supabase
        .from('safety_metrics')
        .select('*')
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLng)
        .lte('longitude', maxLng);

    if (error) {
        console.error('Server Action Error (findClosestSafetyMetricsBatch):', error);
        return locations.reduce((acc, loc) => { acc[`${loc.lat},${loc.lng}`] = null; return acc; }, {} as Record<string, SafetyMetric[] | null>);
    }
    if (!allMetrics || allMetrics.length === 0) {
        return locations.reduce((acc, loc) => { acc[`${loc.lat},${loc.lng}`] = null; return acc; }, {} as Record<string, SafetyMetric[] | null>);
    }

    const processedMetrics = allMetrics.map(metric => ({
        ...metric,
        latitude: typeof metric.latitude === 'string' ? parseFloat(metric.latitude) : metric.latitude,
        longitude: typeof metric.longitude === 'string' ? parseFloat(metric.longitude) : metric.longitude,
        score: typeof metric.score === 'string' ? parseFloat(metric.score) : metric.score
    })).filter(m => isValidCoordinates(m.latitude, m.longitude));

    const results: Record<string, SafetyMetric[] | null> = {};
    locations.forEach(location => {
        const locationKey = `${location.lat},${location.lng}`;
        if (!isValidCoordinates(location.lat, location.lng)) {
            results[locationKey] = null;
            return;
        }
        const metricsForLocation: Record<string, { metric: SafetyMetric; distance: number }> = {};
        processedMetrics.forEach(rawMetric => {
          const metric: SafetyMetric = {
              ...(rawMetric as any),
              city_id: String((rawMetric as any).city_id ?? ''),
              score: Number((rawMetric as any).score ?? 0),
          };
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
      console.error('[Server Action findClosestSafetyMetricsBatch] Unexpected error:', err);
       return locations.reduce((acc, loc) => { acc[`${loc.lat},${loc.lng}`] = null; return acc; }, {} as Record<string, SafetyMetric[] | null>);
  }
}

// --- Server Action: findSimilarAccommodationsAction ---
export async function findSimilarAccommodationsAction(
  currentAccommodation: Pick<
    AccommodationData,
    'id' | 'location' | 'price_per_night' | 'overall_score' | 'property_type' | 'room_type'
  >
): Promise<SimilarAccommodation[]> {
    const cookieStore = cookies()
    // Use createServerClient from @supabase/ssr for actions
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } } // Adapt cookie handling
    );
    const { id: excludeId, location, price_per_night, overall_score: currentScore, property_type, room_type } = currentAccommodation;

    if (!location || !isValidCoordinates(location.lat, location.lng)) {
        console.error('[Server Action findSimilarAccommodations] Invalid current location:', location);
        return [];
    }
    if (currentScore <= 0) {
        console.warn('[Server Action findSimilarAccommodations] Current accommodation has no score.');
        return [];
    }

    console.log(`[Server Action findSimilarAccommodations] Finding alternatives near (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}) with score > ${currentScore + SAFER_SCORE_THRESHOLD}`);

    try {
        let query = supabase
        .from('accommodations')
        .select('id, name, price_per_night, latitude, longitude, source, overall_safety_score, safety_metric_types_found, property_type, room_type, image_url')
        .neq('id', excludeId)
        .gte('latitude', location.lat - SIMILAR_ACCOMMODATION_RADIUS)
        .lte('latitude', location.lat + SIMILAR_ACCOMMODATION_RADIUS)
        .gte('longitude', location.lng - SIMILAR_ACCOMMODATION_RADIUS)
        .lte('longitude', location.lng + SIMILAR_ACCOMMODATION_RADIUS)
        .gt('overall_safety_score', currentScore + SAFER_SCORE_THRESHOLD)
        .gte('safety_metric_types_found', MIN_METRIC_TYPES_FOR_RELIABLE_SCORE);

        if (property_type) {
            query = query.eq('property_type', property_type);
        }
        if (room_type) {
            query = query.eq('room_type', room_type as any);
        }
        if (price_per_night !== null && price_per_night > 0) {
            query = query
                .gte('price_per_night', price_per_night * SIMILARITY_PRICE_RANGE.MIN)
                .lte('price_per_night', price_per_night * SIMILARITY_PRICE_RANGE.MAX);
        }

        const { data: candidates, error } = await query;

        if (error) {
            console.error('[Server Action findSimilarAccommodations] Error fetching candidates:', error);
            return [];
        }
        if (!candidates || candidates.length === 0) {
            console.log('[Server Action findSimilarAccommodations] No candidates found.');
            return [];
        }

        console.log(`[Server Action findSimilarAccommodations] Found ${candidates.length} candidates.`);

        const candidateLocations: Location[] = candidates
            .map(acc => {
                const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
                const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;
                return isValidCoordinates(accLat, accLng) ? { lat: accLat, lng: accLng } : null;
            })
            .filter((loc): loc is Location => loc !== null);

        const metricsByLocation = await findClosestSafetyMetricsBatch(supabase, candidateLocations); // Pass client

        const resultsWithData = candidates
        .map(acc => {
            const accLat = typeof acc.latitude === 'string' ? parseFloat(acc.latitude) : acc.latitude;
            const accLng = typeof acc.longitude === 'string' ? parseFloat(acc.longitude) : acc.longitude;
            if (!isValidCoordinates(accLat, accLng) || !acc.overall_safety_score) return null;

            const distance = calculateDistance(location, { lat: accLat, lng: accLng });
            const locationKey = `${accLat},${accLng}`;
            const safety_metrics = metricsByLocation[locationKey] || null;

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
            property_type: acc.property_type,
            room_type: acc.room_type,
            safety_metrics: safety_metrics
            };
        })
        .filter((acc): acc is NonNullable<typeof acc> => acc !== null);

        resultsWithData.sort((a, b) => a.distance - b.distance);
        const finalResults = resultsWithData.slice(0, MAX_SIMILAR_RESULTS);

        console.log(`[Server Action findSimilarAccommodations] Returning ${finalResults.length} results.`);
        return finalResults;

    } catch (err) {
        console.error('[Server Action findSimilarAccommodations] Unexpected error:', err);
        return [];
    }
}

// --- Server Action: getReportDataAction ---
export async function getReportDataAction(id: string): Promise<AccommodationReportCoreData | null> {
    const cookieStore = cookies()
    // Use createServerClient from @supabase/ssr for actions
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } } // Adapt cookie handling
    );
    console.log('[Server Action getReportData] Fetching report data for ID:', id);

    try {
        const { data: accommodation, error } = await supabase
            .from('accommodations')
            .select('*, overall_safety_score, safety_metric_types_found, description, city_id')
            .eq('id', id)
            .single()

        if (error) {
            console.error(`[Server Action getReportData] Error fetching accommodation ${id}:`, error.message);
            return null
        }
        if (!accommodation) {
            console.warn(`[Server Action getReportData] Accommodation not found for ID: ${id}`);
            return null
        }

        let latString = String(accommodation.latitude ?? '');
        let lngString = String(accommodation.longitude ?? '');
        if (typeof accommodation.location === 'object' && accommodation.location !== null && 'lat' in accommodation.location && 'lng' in accommodation.location) {
            const locLat = accommodation.location.lat;
            const locLng = accommodation.location.lng;
            if (!latString && typeof locLat === 'number') latString = String(locLat);
            if (!lngString && typeof locLng === 'number') lngString = String(locLng);
        }
        const latitude = latString ? parseFloat(latString) : NaN;
        const longitude = lngString ? parseFloat(lngString) : NaN;
        const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null;
        const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null
        const overall_score = accommodation.overall_safety_score ?? 0;

        let metricsForLocation: SafetyMetric[] | null = null;
        if (location) {
            const safetyMetricsResult = await findClosestSafetyMetricsBatch(supabase, [location]); // Pass client
            const locationKey = `${location.lat},${location.lng}`;
            metricsForLocation = (safetyMetricsResult && safetyMetricsResult[locationKey]) ? safetyMetricsResult[locationKey] : null;
        }

        const metricTypesFound = accommodation.safety_metric_types_found ?? 0;
        const hasCompleteData = metricTypesFound >= MIN_METRIC_TYPES_FOR_RELIABLE_SCORE;

        let accommodationTakeaways: string[] | null = null;
        const { data: takeawayData, error: takeawayError } = await supabase
            .from('accommodation_takeaways')
            .select('takeaways')
            .eq('accommodation_id', id)
            .maybeSingle();
        if (takeawayError) {
            console.error(`[Server Action getReportData] Error fetching takeaways for ${id}:`, takeawayError.message);
        } else if (takeawayData && takeawayData.takeaways) {
            accommodationTakeaways = takeawayData.takeaways;
        }

        // Note: Similar accommodations are fetched separately by the client

        // Construct the return object matching AccommodationReportCoreData
        const reportData: AccommodationReportCoreData = {
            // Spread properties from the DB query result
            ...accommodation,
            // Overwrite/ensure correct types for specific fields
            location: location, // Use the parsed Location object
            image_url: image_url, // Use the validated image_url
            overall_score: overall_score, // Use the pre-calculated score
            safety_metrics: metricsForLocation, // Assign fetched metrics
            hasCompleteData: hasCompleteData, // Assign calculated reliability flag
            metricTypesFound: metricTypesFound, // Assign metric count
            accommodation_takeaways: accommodationTakeaways, // Assign fetched takeaways
            city_id: accommodation.city_id, // Use number | null directly
            // Ensure required fields have defaults if nullable in DB but not in type
            name: accommodation.name ?? 'Unknown Name',
            price_per_night: accommodation.price_per_night ?? null,
            source: accommodation.source ?? 'Unknown Source',
            property_type: accommodation.property_type ?? null,
            room_type: accommodation.room_type ?? undefined, // Match type definition (optional string)
            description: accommodation.description ?? null,
            // Removed explicit undefined assignment for latitude/longitude
            // The type AccommodationReportCoreData correctly excludes them from the top level.
            // Ensure other fields match the type if necessary
            rating: accommodation.rating ?? null,
            total_reviews: accommodation.total_reviews ?? null,
            // Explicitly add neighborhood back, providing null as default, to satisfy AccommodationReportCoreData type
            // Use 'as any' to bypass TS check on the potentially incomplete 'accommodation' object type
            neighborhood: (accommodation as any).neighborhood ?? null,
            // bedrooms is optional in AccommodationData, so no need to add it back explicitly
            // neighborhood: accommodation.neighborhood ?? null,
        };
        // Remove undefined keys to clean up the object, although TS handles the type correctly
        Object.keys(reportData).forEach(key => reportData[key as keyof AccommodationReportCoreData] === undefined && delete reportData[key as keyof AccommodationReportCoreData]);

        console.log('[Server Action getReportData] Successfully fetched and processed report data.');
        return reportData;

    } catch (err) {
        console.error('[Server Action getReportData] Unexpected error:', err);
        return null;
    }
}

// --- Server Action: fetchAllNearbyAccommodationsAction ---
export async function fetchAllNearbyAccommodationsAction(
  currentLocation: Location,
  excludeId: string
): Promise<SimilarAccommodation[]> {
    const cookieStore = cookies()
    // Use createServerClient from @supabase/ssr for actions
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } } // Adapt cookie handling
    );

    if (!currentLocation || !isValidCoordinates(currentLocation.lat, currentLocation.lng)) {
        console.warn('[Server Action fetchAllNearby] Invalid location.');
        return [];
    }
    console.log(`[Server Action fetchAllNearby] Fetching up to ${MAX_MAP_MARKERS} accommodations near (${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)})`);

    try {
        const { data: nearby, error } = await supabase
        .from('accommodations')
        .select('id, name, price_per_night, latitude, longitude, source, overall_safety_score, safety_metric_types_found, image_url')
        .neq('id', excludeId)
        .gte('latitude', currentLocation.lat - LOCATION_RADIUS)
        .lte('latitude', currentLocation.lat + LOCATION_RADIUS)
        .gte('longitude', currentLocation.lng - LOCATION_RADIUS)
        .lte('longitude', currentLocation.lng + LOCATION_RADIUS)
        .limit(MAX_MAP_MARKERS);

        if (error) {
            console.error('[Server Action fetchAllNearby] Error fetching:', error);
            return [];
        }
        if (!nearby || nearby.length === 0) {
            console.log('[Server Action fetchAllNearby] No nearby found.');
            return [];
        }

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
            safety_metrics: null // No detailed metrics needed for map markers
            };
        })
        .filter((acc): acc is NonNullable<typeof acc> => acc !== null);

        console.log(`[Server Action fetchAllNearby] Returning ${resultsWithDistance.length} results.`);
        return resultsWithDistance;

    } catch (err) {
        console.error('[Server Action fetchAllNearby] Unexpected error:', err);
        return [];
    }
}


// --- Server Action: getCommunityOpinionsAction ---
export async function getCommunityOpinionsAction(
    location: Location | null, // Accept location instead of ID
    page: number = 1,
    limit: number = 5
): Promise<CommunityOpinion[]> {
    if (!location || !isValidCoordinates(location.lat, location.lng)) {
        console.warn('[Server Action getCommunityOpinions] Invalid location provided.');
        return [];
    }
    const cookieStore = cookies()
    // Use createServerClient from @supabase/ssr for actions
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } } // Adapt cookie handling
    );
    const offset = (page - 1) * limit;

    console.log(`[Server Action getCommunityOpinions] Fetching page ${page} (limit ${limit}) near location (${location.lat}, ${location.lng})`);

    try {
        const { data, error } = await supabase
            .from('community_opinions')
            .select('*')
            // Filter by geographic bounding box
            .gte('latitude', location.lat - OPINION_PROXIMITY_RADIUS)
            .lte('latitude', location.lat + OPINION_PROXIMITY_RADIUS)
            .gte('longitude', location.lng - OPINION_PROXIMITY_RADIUS)
            .lte('longitude', location.lng + OPINION_PROXIMITY_RADIUS)
            // Optionally filter by relevance if needed: .eq('is_safety_relevant', true)
            .order('created_at', { ascending: false }) // Or order by relevance/upvotes if available
            .range(offset, offset + limit - 1);

        if (error) {
            console.error(`[Server Action getCommunityOpinions] Error fetching opinions near (${location.lat}, ${location.lng}):`, error);
            return [];
        }

        // Ensure data matches CommunityOpinion type if necessary (e.g., date formatting)
        return (data || []).map(opinion => ({
            ...opinion,
            created_at: opinion.created_at ? new Date(opinion.created_at).toISOString() : new Date().toISOString(), // Ensure ISO string format if needed by client
            // Add any other type transformations here
        }));

    } catch (err) {
        console.error('[Server Action getCommunityOpinions] Unexpected error:', err);
        return [];
    }
}

// --- Server Action: getCommunityOpinionsCountAction ---
export async function getCommunityOpinionsCountAction(
    location: Location | null // Accept location instead of ID
): Promise<number> {
    if (!location || !isValidCoordinates(location.lat, location.lng)) {
        console.warn('[Server Action getCommunityOpinionsCount] Invalid location provided.');
        return 0;
    }
    const cookieStore = cookies()
    // Use createServerClient from @supabase/ssr for actions
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } } // Adapt cookie handling
    );

    console.log(`[Server Action getCommunityOpinionsCount] Fetching count near location (${location.lat}, ${location.lng})`);

    try {
        const { count, error } = await supabase
            .from('community_opinions')
            .select('*', { count: 'exact', head: true }) // Use head: true for count only
            // Filter by geographic bounding box
            .gte('latitude', location.lat - OPINION_PROXIMITY_RADIUS)
            .lte('latitude', location.lat + OPINION_PROXIMITY_RADIUS)
            .gte('longitude', location.lng - OPINION_PROXIMITY_RADIUS)
            .lte('longitude', location.lng + OPINION_PROXIMITY_RADIUS);
            // Optionally filter by relevance if needed: .eq('is_safety_relevant', true)

        if (error) {
            console.error(`[Server Action getCommunityOpinionsCount] Error fetching count near (${location.lat}, ${location.lng}):`, error);
            return 0;
        }

        return count ?? 0;

    } catch (err) {
        console.error('[Server Action getCommunityOpinionsCount] Unexpected error:', err);
        return 0;
    }
}