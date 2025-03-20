import { Suspense } from 'react'
import { SafetyMetrics } from '@/components/safety-report/SafetyMetrics'
import { CommunityOpinions } from '@/components/safety-report/CommunityOpinions'
import { MapView } from '@/components/safety-report/MapView'
import { RestrictedContent } from '@/components/auth/restricted-content'
import { notFound } from 'next/navigation'
import Loading from './loading'
import { supabaseServer } from '@/lib/supabase/server'
import Image from 'next/image'
import { Card } from '@/components/ui/card'

interface Props {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

interface SafetyMetric {
  id: string
  latitude: number
  longitude: number
  metric_type: string
  score: number
  question: string
  description: string
  created_at: string
  expires_at: string
  total_population: number | null
  housing_units: number | null
  median_age: number | null
  incidents_per_1000: number | null
}

interface SafetyMetricWithDistance extends SafetyMetric {
  distance: number
}

interface SimilarAccommodation {
  id: string
  name: string
  price_per_night: number
  latitude: number
  longitude: number
  overall_score: number
  source: string
}

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c // Distance in kilometers
}

// Function to find closest safety metrics for a location
async function findClosestSafetyMetrics(latitude: number, longitude: number) {
  // Fetch safety metrics within a reasonable radius (0.05 degrees ≈ 5.5km)
  const { data: metrics, error } = await supabaseServer
    .from('safety_metrics')
    .select('*')
    .gte('latitude', latitude - 0.05)
    .lte('latitude', latitude + 0.05)
    .gte('longitude', longitude - 0.05)
    .lte('longitude', longitude + 0.05)

  if (error || !metrics) {
    console.error('Error fetching safety metrics:', error)
    return null
  }

  // Group metrics by type and find the closest for each type
  const metricsByType = metrics.reduce<Record<string, SafetyMetricWithDistance>>((acc, metric: SafetyMetric) => {
    const distance = calculateDistance(latitude, longitude, metric.latitude, metric.longitude)
    
    if (!acc[metric.metric_type] || distance < acc[metric.metric_type].distance) {
      acc[metric.metric_type] = {
        ...metric,
        distance
      }
    }
    return acc
  }, {})

  // Convert back to array and remove distance property
  return Object.values(metricsByType).map(({ distance, ...metric }) => metric)
}

// Function to fetch similar accommodations
async function findSimilarAccommodations(
  latitude: number,
  longitude: number,
  price: number,
  currentScore: number,
  excludeId: string
): Promise<SimilarAccommodation[]> {
  // Price range: ±30% of current price
  const minPrice = price * 0.7
  const maxPrice = price * 1.3

  // Fetch accommodations within 5km and similar price range
  const { data: accommodations, error } = await supabaseServer
    .from('accommodations')
    .select('id, name, price_per_night, latitude, longitude, source')
    .neq('id', excludeId)
    .gte('price_per_night', minPrice)
    .lte('price_per_night', maxPrice)
    .gte('latitude', latitude - 0.05)
    .lte('latitude', latitude + 0.05)
    .gte('longitude', longitude - 0.05)
    .lte('longitude', longitude + 0.05)

  if (error || !accommodations) {
    console.error('Error fetching similar accommodations:', error)
    return []
  }

  // Fetch safety metrics for each accommodation
  const similarAccommodations = await Promise.all(
    accommodations.map(async (acc) => {
      const metrics = await findClosestSafetyMetrics(acc.latitude, acc.longitude)
      if (!metrics) return null

      // Calculate overall score
      const overall_score = Math.round(
        metrics.reduce((acc, metric) => acc + metric.score, 0) / metrics.length * 10
      )

      // Only include accommodations with equal or better safety score
      if (overall_score < currentScore) return null

      return {
        ...acc,
        overall_score
      }
    })
  )

  // Filter out null values and sort by safety score
  return similarAccommodations
    .filter((acc): acc is SimilarAccommodation => acc !== null)
    .sort((a, b) => b.overall_score - a.overall_score)
}

const validateReportParams = async (id: string) => {
  return typeof id === 'string' && id.length > 0
}

async function getReportData(id: string) {
  const { data: accommodation, error } = await supabaseServer
    .from('accommodations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !accommodation) {
    console.error('Error fetching accommodation:', error)
    return null
  }

  // Parse coordinates safely
  const latitude = parseFloat(accommodation.latitude || accommodation.location?.lat || '')
  const longitude = parseFloat(accommodation.longitude || accommodation.location?.lng || '')

  // Validate coordinates
  const hasValidCoordinates = 
    !isNaN(latitude) && 
    !isNaN(longitude) && 
    latitude !== 0 && 
    longitude !== 0 && 
    Math.abs(latitude) <= 90 && 
    Math.abs(longitude) <= 180

  // For Booking.com accommodations, ensure we're using the correct fields
  const imageUrl = accommodation.image_url
  const validImageUrl = imageUrl && imageUrl.startsWith('http') ? imageUrl : null

  // Fetch safety metrics if we have valid coordinates
  const safetyMetrics = hasValidCoordinates 
    ? await findClosestSafetyMetrics(latitude, longitude)
    : null

  // Calculate overall score
  const overall_score = safetyMetrics 
    ? Math.round(safetyMetrics.reduce((acc, metric) => acc + metric.score, 0) / safetyMetrics.length * 10)
    : 0

  // Fetch similar accommodations if we have valid data
  const similarAccommodations = (hasValidCoordinates && accommodation.price_per_night && overall_score)
    ? await findSimilarAccommodations(
        latitude,
        longitude,
        accommodation.price_per_night,
        overall_score,
        id
      )
    : []

  // Return combined data
  return {
    ...accommodation,
    id: accommodation.id,
    url: accommodation.url,
    name: accommodation.name,
    image_url: validImageUrl,
    price_per_night: accommodation.price_per_night || null,
    rating: accommodation.rating || null,
    total_reviews: accommodation.total_reviews || null,
    property_type: accommodation.property_type || accommodation.type || null,
    neighborhood: accommodation.neighborhood || (accommodation.address?.full || null),
    source: accommodation.source,
    location: hasValidCoordinates ? {
      lat: latitude,
      lng: longitude
    } : null,
    safety_metrics: safetyMetrics,
    overall_score,
    similar_accommodations: similarAccommodations
  }
}

export default async function SafetyReportPage({ params }: Props) {
  // Validate params before proceeding
  const isValid = await validateReportParams(params.id)
  if (!isValid) {
    notFound()
  }

  // Fetch report data
  const reportData = await getReportData(params.id)

  // If no data found, show 404
  if (!reportData) {
    notFound()
  }

  return (
    <Suspense fallback={<Loading />}>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Safety Report</h1>
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="relative h-[400px] w-full">
              {reportData.image_url ? (
                <Image
                  src={reportData.image_url}
                  alt={reportData.name}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gray-100">
                  <div className="text-gray-400 text-center">
                    <svg 
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      aria-hidden="true"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                      />
                    </svg>
                    <p className="mt-2">No image available</p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-semibold mb-2">{reportData.name}</h2>
              <div className="flex items-center gap-4 text-gray-600 mb-4">
                {reportData.price_per_night ? (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">${reportData.price_per_night}</span>
                    <span>per night</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Price not available</span>
                  </div>
                )}
                {(reportData.rating || reportData.total_reviews) && (
                  <div className="flex items-center gap-2">
                    {reportData.rating && (
                      <>
                        <span>★</span>
                        <span>
                          {reportData.rating.toFixed(1)}
                          {reportData.source === 'booking' ? '/10' : '/5'}
                        </span>
                      </>
                    )}
                    {reportData.total_reviews && (
                      <span>({reportData.total_reviews.toLocaleString()} reviews)</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                {reportData.property_type && <span>{reportData.property_type}</span>}
                {reportData.property_type && reportData.neighborhood && <span>•</span>}
                {reportData.neighborhood && <span>{reportData.neighborhood}</span>}
              </div>
              <div className="mt-4">
                <a 
                  href={reportData.url} 
                  className="text-blue-600 hover:underline flex items-center gap-2"
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  View on {reportData.source === 'airbnb' ? 'Airbnb' : 'Booking.com'}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
        
        <section className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
              <Card className="p-6">
                <h2 className="text-2xl font-semibold mb-4">Location</h2>
                <div className="h-[400px] rounded-lg bg-gray-100 flex items-center justify-center">
                  <p className="text-gray-500">Location coordinates not available</p>
                </div>
              </Card>
            )}
          </div>

          <RestrictedContent>
            <CommunityOpinions reportId={params.id} />
          </RestrictedContent>
        </section>
      </main>
    </Suspense>
  )
}