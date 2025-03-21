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
import { PropertyHeader } from '../components/PropertyHeader'
import { LOCATION_RADIUS, PRICE_RANGE } from '../constants'
import { isValidCoordinates, calculateDistance } from '../utils'
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
    .gte('latitude', location.lat - LOCATION_RADIUS)
    .lte('latitude', location.lat + LOCATION_RADIUS)
    .gte('longitude', location.lng - LOCATION_RADIUS)
    .lte('longitude', location.lng + LOCATION_RADIUS)

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
  price: number,
  currentScore: number,
  excludeId: string
): Promise<SimilarAccommodation[]> {
  const minPrice = price * PRICE_RANGE.MIN
  const maxPrice = price * PRICE_RANGE.MAX

  const { data: accommodations, error } = await supabaseServer
    .from('accommodations')
    .select('id, name, price_per_night, latitude, longitude, source')
    .neq('id', excludeId)
    .gte('price_per_night', minPrice)
    .lte('price_per_night', maxPrice)
    .gte('latitude', location.lat - LOCATION_RADIUS)
    .lte('latitude', location.lat + LOCATION_RADIUS)
    .gte('longitude', location.lng - LOCATION_RADIUS)
    .lte('longitude', location.lng + LOCATION_RADIUS)

  if (error || !accommodations) {
    console.error('Error fetching similar accommodations:', error)
    return []
  }

  // Fetch safety metrics for each accommodation
  const similarAccommodations = await Promise.all(
    accommodations.map(async (acc) => {
      const metrics = await findClosestSafetyMetrics({ lat: acc.latitude, lng: acc.longitude })
      if (!metrics) return null

      const overall_score = Math.round(
        metrics.reduce((acc, metric) => acc + metric.score, 0) / metrics.length * 10
      )

      return overall_score >= currentScore ? {
        ...acc,
        overall_score
      } : null
    })
  )

  return similarAccommodations
    .filter((acc): acc is SimilarAccommodation => acc !== null)
    .sort((a, b) => b.overall_score - a.overall_score)
}

async function getReportData(id: string): Promise<AccommodationData | null> {
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
  const location = isValidCoordinates(latitude, longitude) ? { lat: latitude, lng: longitude } : null

  // For Booking.com accommodations, ensure we're using the correct fields
  const image_url = accommodation.image_url?.startsWith('http') ? accommodation.image_url : null

  // Fetch safety metrics if we have valid coordinates
  const safetyMetrics = location ? await findClosestSafetyMetrics(location) : null

  // Calculate overall score
  const overall_score = safetyMetrics 
    ? Math.round(safetyMetrics.reduce((acc, metric) => acc + metric.score, 0) / safetyMetrics.length * 10)
    : 0

  // Fetch similar accommodations if we have valid data
  const similar_accommodations = (location && accommodation.price_per_night && overall_score)
    ? await findSimilarAccommodations(
        location,
        accommodation.price_per_night,
        overall_score,
        id
      )
    : []

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
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Safety Report</h1>
          <PropertyHeader
            name={reportData.name}
            price_per_night={reportData.price_per_night}
            rating={reportData.rating}
            total_reviews={reportData.total_reviews}
            source={reportData.source}
            image_url={reportData.image_url}
          />
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