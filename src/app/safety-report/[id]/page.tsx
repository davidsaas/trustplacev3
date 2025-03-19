import { Suspense } from 'react'
import { SafetyMetrics } from '@/components/safety-report/SafetyMetrics'
import { CommunityOpinions } from '@/components/safety-report/CommunityOpinions'
import { MapView } from '@/components/safety-report/MapView'
import { RestrictedContent } from '@/components/auth/restricted-content'
import { notFound } from 'next/navigation'
import Loading from './loading'
import { supabaseServer } from '@/lib/supabase/server'
import Image from 'next/image'
import { MOCK_SAFETY_METRICS, MOCK_SAFETY_REPORT } from '@/lib/mock/safety-report'
import { Card } from '@/components/ui/card'

interface PageProps {
  params: {
    id: string
  }
  searchParams?: { [key: string]: string | string[] | undefined }
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

  // Combine real accommodation data with mock safety data
  return {
    ...accommodation,
    ...MOCK_SAFETY_REPORT,
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
    } : null
  }
}

export default async function SafetyReportPage({ params }: PageProps) {
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
              <SafetyMetrics data={MOCK_SAFETY_METRICS} />
            </RestrictedContent>

            {reportData.location ? (
              <MapView location={reportData.location} />
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