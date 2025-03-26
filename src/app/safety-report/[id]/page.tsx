'use client'

import { useState, useEffect } from 'react'
import { notFound } from 'next/navigation'
import { SafetyMetrics } from '../components/SafetyMetrics'
import { CommunityOpinions } from '../components/CommunityOpinions'
import { MapView } from '../components/MapView'
import { RestrictedContent } from '@/app/auth/components/restricted-content'
import { supabaseServer } from '@/lib/supabase/server'
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, SAFETY_RADIUS, PRICE_RANGE } from '../constants'
import { isValidCoordinates, calculateDistance } from '../utils'
import Loading from './loading'
import { AppNavbar } from '@/app/components/navbar'

import type { 
  SafetyReportProps, 
  SafetyMetric, 
  Location,
  AccommodationData,
  SimilarAccommodation
} from '@/types/safety-report'

// Function to find closest safety metrics for a location
async function findClosestSafetyMetrics(location: Location): Promise<SafetyMetric[] | null> {
  console.log('Finding safety metrics for location:', location);
  
  const { data: metrics, error } = await supabaseServer
    .from('safety_metrics')
    .select('*')
    .gte('latitude', location.lat - SAFETY_RADIUS)
    .lte('latitude', location.lat + SAFETY_RADIUS)
    .gte('longitude', location.lng - SAFETY_RADIUS)
    .lte('longitude', location.lng + SAFETY_RADIUS)

  if (error) {
    console.error('Error fetching safety metrics:', error)
    return null
  }

  if (!metrics || metrics.length === 0) {
    console.log('No safety metrics found in radius')
    return null
  }
  
  console.log(`Found ${metrics.length} raw safety metrics entries in radius`)

  // Ensure numeric values for calculations by converting string values if needed
  const processedMetrics = metrics.map(metric => ({
    ...metric,
    latitude: typeof metric.latitude === 'string' ? parseFloat(metric.latitude) : metric.latitude,
    longitude: typeof metric.longitude === 'string' ? parseFloat(metric.longitude) : metric.longitude,
    score: typeof metric.score === 'string' ? parseFloat(metric.score) : metric.score
  }))

  // Group metrics by type and find the closest for each type
  const metricsByType = processedMetrics.reduce<Record<string, SafetyMetric>>((acc, metric) => {
    const distance = calculateDistance(
      { lat: location.lat, lng: location.lng },
      { lat: metric.latitude, lng: metric.longitude }
    )
    
    if (!acc[metric.metric_type] || distance < calculateDistance(
      { lat: location.lat, lng: location.lng },
      { lat: acc[metric.metric_type].latitude, lng: acc[metric.metric_type].longitude }
    )) {
      acc[metric.metric_type] = metric
    }
    return acc
  }, {})

  const result = Object.values(metricsByType)
  console.log(`Returning ${result.length} grouped safety metrics by type`)
  return result
}

// Function to fetch similar accommodations
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

  console.log('Finding similar accommodations:', { 
    hasPrice: price !== null, 
    currentScore, 
    searchRadius: LOCATION_RADIUS 
  });
  console.log('Location bounds:', {
    latMin: location.lat - LOCATION_RADIUS,
    latMax: location.lat + LOCATION_RADIUS,
    lngMin: location.lng - LOCATION_RADIUS,
    lngMax: location.lng + LOCATION_RADIUS
  });

  try {
    // Base query with location constraints
    let query = supabaseServer
      .from('accommodations')
      .select('id, name, price_per_night, latitude, longitude, source')
      .neq('id', excludeId)
      .gte('latitude', location.lat - LOCATION_RADIUS)
      .lte('latitude', location.lat + LOCATION_RADIUS)
      .gte('longitude', location.lng - LOCATION_RADIUS)
      .lte('longitude', location.lng + LOCATION_RADIUS);
    
    // Add price constraints only if we have a price
    if (price !== null && price > 0) {
      const minPrice = price * PRICE_RANGE.MIN;
      const maxPrice = price * PRICE_RANGE.MAX;
      console.log('Adding price constraints:', { minPrice, maxPrice, originalPrice: price });
      
      query = query
        .gte('price_per_night', minPrice)
        .lte('price_per_night', maxPrice);
    } else {
      console.log('Skipping price constraints - no price available for current accommodation');
    }

    const { data: accommodations, error } = await query;

    if (error) {
      console.error('Error fetching similar accommodations:', error);
      return [];
    }

    if (!accommodations || accommodations.length === 0) {
      console.log('No accommodations found within the search parameters');
      return [];
    }

    console.log(`Found ${accommodations.length} accommodations in radius`);
    
    // Fetch safety metrics for each accommodation
    const similarAccommodations = await Promise.all(
      accommodations.map(async (acc) => {
        // Skip accommodations with invalid coordinates
        if (!isValidCoordinates(acc.latitude, acc.longitude)) {
          console.warn(`Invalid coordinates for accommodation ${acc.name} (${acc.id}): lat=${acc.latitude}, lng=${acc.longitude}`);
          return null;
        }
        
        const metrics = await findClosestSafetyMetrics({ lat: acc.latitude, lng: acc.longitude })
        if (!metrics || metrics.length === 0) {
          console.log(`No safety metrics found for ${acc.name} (${acc.id})`);
          return null; // Skip accommodations without safety metrics
        }

        const overall_score = Math.round(
          metrics.reduce((acc, metric) => acc + metric.score, 0) / metrics.length * 10
        )

        console.log(`${acc.name} (${acc.id}) - Score: ${overall_score}, Current Score: ${currentScore}`);
        
        // Only return accommodations with a higher score than the current one
        return overall_score > currentScore ? {
          ...acc,
          overall_score
        } : null;
      })
    )

    const filteredAccommodations = similarAccommodations
      .filter((acc): acc is SimilarAccommodation => acc !== null)
      .sort((a, b) => b.overall_score - a.overall_score);
    
    console.log(`Returning ${filteredAccommodations.length} similar accommodations with higher safety scores`);
    return filteredAccommodations;
  } catch (err) {
    console.error('Error in findSimilarAccommodations:', err);
    return [];
  }
}

async function getReportData(id: string): Promise<AccommodationData | null> {
  console.log('Fetching report data for accommodation ID:', id);

  const { data: accommodation, error } = await supabaseServer
    .from('accommodations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !accommodation) {
    console.error('Error fetching accommodation:', error)
    return null
  }

  console.log('Found accommodation:', accommodation.name, 'Price:', accommodation.price_per_night);

  // Parse coordinates safely
  const latitude = parseFloat(accommodation.latitude || accommodation.location?.lat || '')
  const longitude = parseFloat(accommodation.longitude || accommodation.location?.lng || '')
  const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null

  console.log('Accommodation coordinates:', location);

  // For Booking.com accommodations, ensure we're using the correct fields
  const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null

  // Fetch safety metrics if we have valid coordinates
  const safetyMetrics = location ? await findClosestSafetyMetrics(location) : null
  console.log('Found safety metrics:', safetyMetrics?.length || 0);

  // Check if we have complete safety data (5 metrics)
  const hasCompleteData = safetyMetrics ? safetyMetrics.length === 5 : false

  // Calculate overall score
  const overall_score = safetyMetrics 
    ? Math.round(safetyMetrics.reduce((acc, metric) => acc + metric.score, 0) / safetyMetrics.length * 10)
    : 0
  
  console.log('Calculated overall safety score:', overall_score);
  
  // Debug check for similar accommodations parameters
  const hasSimilarAccommodationsParams = !!(location && overall_score > 0);
  console.log('Has all parameters for similar accommodations search:', hasSimilarAccommodationsParams);

  // Fetch similar accommodations if we have valid data - only require location and score
  let similar_accommodations: SimilarAccommodation[] = [];
  
  if (location && overall_score > 0) {
    console.log('Calling findSimilarAccommodations with:', {
      location,
      price: accommodation.price_per_night, // Pass the actual price, which might be null
      currentScore: overall_score,
      excludeId: id
    });
    
    similar_accommodations = await findSimilarAccommodations(
      location,
      accommodation.price_per_night, // Pass the actual price, which might be null
      overall_score,
      id
    );
    
    console.log(`findSimilarAccommodations returned ${similar_accommodations.length} results`);
  } else {
    console.log('Skipping similar accommodations search due to missing parameters');
  }

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
    safety_metrics: safetyMetrics,
    overall_score,
    similar_accommodations,
    hasCompleteData
  }
}

export default function SafetyReportPage({ params }: SafetyReportProps) {
  const [reportData, setReportData] = useState<AccommodationData | null>(null)
  const [loading, setLoading] = useState(true)

  if (!params.id) {
    notFound()
  }

  // Fetch data
  useEffect(() => {
    async function loadData() {
      try {
        const data = await getReportData(params.id)
        if (!data) notFound()
        setReportData(data)
      } catch (error) {
        console.error("Error loading report data:", error)
        notFound()
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [params.id])

  if (loading || !reportData) {
    return <Loading />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Global Navigation */}
      <AppNavbar />
      
      {/* Page content with proper top padding */}
      <div className="pt-20 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-10">
            {/* Property header with banner */}
            <PropertyHeader
              name={reportData.name}
              price_per_night={reportData.price_per_night}
              rating={reportData.rating}
              total_reviews={reportData.total_reviews}
              source={reportData.source}
              image_url={reportData.image_url}
              url={reportData.url}
              overall_score={reportData.overall_score}
            />
            
            {/* Map section */}
            <div className="h-[400px] mt-10">
              {reportData.location ? (
                <MapView 
                  location={reportData.location}
                  currentAccommodation={{
                    id: reportData.id,
                    name: reportData.name,
                    overall_score: reportData.overall_score,
                    hasCompleteData: reportData.hasCompleteData
                  }}
                  similarAccommodations={reportData.similar_accommodations.map(acc => ({
                    ...acc,
                    hasCompleteData: acc.hasCompleteData !== undefined ? acc.hasCompleteData : false
                  }))}
                />
              ) : (
                <div className="h-full bg-gray-100 flex items-center justify-center rounded-xl">
                  <p className="text-gray-500">Location coordinates not available</p>
                </div>
              )}
            </div>
              
            {/* Safety Analysis */}
            <div className="mt-10">
              <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
                <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                  <div className="ml-4 mt-4">
                    <h3 className="text-base font-semibold text-gray-900">Safety Analysis</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Detailed safety metrics for this location based on local data
                    </p>
                  </div>
                </div>
              </div>
              <RestrictedContent>
                <SafetyMetrics data={reportData.safety_metrics} />
              </RestrictedContent>
            </div>
        
            {/* Community Opinions */}
            <div className="mt-10">
              <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
                <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
                  <div className="ml-4 mt-4">
                    <h3 className="text-base font-semibold text-gray-900">Community Feedback</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Opinions and experiences shared by other travelers
                    </p>
                  </div>
                </div>
              </div>
              <RestrictedContent>
                <CommunityOpinions reportId={params.id} />
              </RestrictedContent>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}