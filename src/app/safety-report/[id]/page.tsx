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

interface PageProps {
  params: {
    id: string
  }
  searchParams?: { [key: string]: string | string[] | undefined }
}

const validateReportParams = (id: string) => {
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

  // Combine real accommodation data with mock safety data
  return {
    ...accommodation,
    ...MOCK_SAFETY_REPORT,
    // Override mock data with real accommodation data
    id: accommodation.id,
    url: accommodation.url,
    name: accommodation.name,
    image_url: accommodation.image_url,
    price_per_night: accommodation.price_per_night,
    rating: accommodation.rating,
    total_reviews: accommodation.total_reviews,
    property_type: accommodation.property_type,
    neighborhood: accommodation.neighborhood,
    source: accommodation.source,
    location: {
      lat: parseFloat(accommodation.latitude),
      lng: parseFloat(accommodation.longitude)
    }
  }
}

export default async function SafetyReportPage({ params }: PageProps) {
  const id = params.id

  // Validate params before proceeding
  if (!validateReportParams(id)) {
    notFound()
  }

  // Fetch report data
  const reportData = await getReportData(id)

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
              <Image
                src={reportData.image_url}
                alt={reportData.name}
                fill
                className="object-cover"
                priority
              />
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-semibold mb-2">{reportData.name}</h2>
              <div className="flex items-center gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">${reportData.price_per_night}</span>
                  <span>per night</span>
                </div>
                {reportData.rating && (
                  <div className="flex items-center gap-2">
                    <span>★</span>
                    <span>{reportData.rating}</span>
                    <span>({reportData.total_reviews} reviews)</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>{reportData.property_type}</span>
                <span>•</span>
                <span>{reportData.neighborhood}</span>
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

            <MapView location={reportData.location} />
          </div>

          <RestrictedContent>
            <CommunityOpinions reportId={id} />
          </RestrictedContent>
        </section>
      </main>
    </Suspense>
  )
}