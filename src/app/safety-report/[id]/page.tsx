import { Suspense } from 'react'
import { SafetyMetrics } from '@/components/safety-report/SafetyMetrics'
import { CommunityOpinions } from '@/components/safety-report/CommunityOpinions'
import { MapView } from '@/components/safety-report/MapView'
import { RestrictedContent } from '@/components/auth/restricted-content'
import { notFound } from 'next/navigation'
import Loading from './loading'
import { supabaseServer } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, SAFETY_RADIUS, PRICE_RANGE } from '../constants'
import { isValidCoordinates, calculateDistance } from '../utils'
import { ChevronLeft, Shield } from 'lucide-react'
import Link from 'next/link'
import type { 
  SafetyReportProps, 
  SafetyMetric, 
  Location,
  AccommodationData,
  SimilarAccommodation
} from '../types'

// Function to find closest safety metrics for a location
async function findClosestSafetyMetrics(location: Location): Promise<SafetyMetric[] | null> {
  const { data: metrics, error } = await supabaseServer
    .from('safety_metrics')
    .select('*')
    .gte('latitude', location.lat - SAFETY_RADIUS)
    .lte('latitude', location.lat + SAFETY_RADIUS)
    .gte('longitude', location.lng - SAFETY_RADIUS)
    .lte('longitude', location.lng + SAFETY_RADIUS)

  if (error || !metrics) {
    console.error('Error fetching safety metrics:', error)
    return null
  }

  // Group metrics by type and find the closest for each type
  const metricsByType = metrics.reduce<Record<string, SafetyMetric>>((acc, metric) => {
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

  return Object.values(metricsByType)
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
    similar_accommodations
  }
}

export default async function SafetyReportPage({ params }: SafetyReportProps) {
  if (!params.id) notFound()

  const reportData = await getReportData(params.id)
  if (!reportData) notFound()

  return (
    <Suspense fallback={<Loading />}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center mb-1">
              <Link href="/safety-reports" className="flex items-center text-blue-600 font-medium hover:text-blue-800 transition-colors mr-4">
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span>Back</span>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Safety Report</h1>
            </div>
            <div className="text-sm text-gray-500">
              Making your stay safer with data-driven insights
            </div>
          </div>
        </header>
        
        <main className="container mx-auto px-4 py-6">
          {/* Property Header */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-8">
            <PropertyHeader
              name={reportData.name}
              price_per_night={reportData.price_per_night}
              rating={reportData.rating}
              total_reviews={reportData.total_reviews}
              source={reportData.source}
              image_url={reportData.image_url}
            />
          </div>
          
          {/* Overall assessment highlight */}
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Shield className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Safety Assessment</h2>
                <p className="text-gray-600">
                  {reportData.overall_score >= 80 ? "This area is generally considered safe based on historical data" :
                   reportData.overall_score >= 60 ? "This area requires normal caution for urban settings" :
                   reportData.overall_score >= 40 ? "Exercise increased caution in this area" :
                   "This area has safety concerns that require significant awareness"}
                </p>
              </div>
            </div>
          </div>
          
          {/* Safety Metrics and Map */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <RestrictedContent>
              <SafetyMetrics data={reportData.safety_metrics} />
            </RestrictedContent>

            {reportData.location ? (
              <MapView 
                location={reportData.location}
                currentAccommodation={{
                  id: reportData.id,
                  name: reportData.name,
                  overall_score: reportData.overall_score
                }}
                similarAccommodations={reportData.similar_accommodations}
              />
            ) : (
              <Card className="p-6 rounded-xl shadow-md overflow-hidden">
                <h2 className="text-2xl font-semibold mb-4">Location</h2>
                <div className="h-[400px] rounded-xl bg-gray-50 flex items-center justify-center">
                  <p className="text-gray-500">Location coordinates not available</p>
                </div>
              </Card>
            )}
          </div>

          <RestrictedContent>
            <CommunityOpinions reportId={params.id} />
          </RestrictedContent>
        </main>
        
        {/* Footer */}
        <footer className="bg-white border-t border-gray-100 py-8 mt-12">
          <div className="container mx-auto px-4">
            <div className="text-center text-gray-500 text-sm">
              <p>Safety data is aggregated from multiple sources and is updated regularly.</p>
              <p className="mt-2">© {new Date().getFullYear()} TrustPlace - Making travel safer through data</p>
            </div>
          </div>
        </footer>
      </div>
    </Suspense>
  )
}