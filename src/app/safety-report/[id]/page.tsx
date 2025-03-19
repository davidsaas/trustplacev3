import { Suspense } from 'react'
import { SafetyMetrics } from '@/components/safety-report/SafetyMetrics'
import { CommunityOpinions } from '@/components/safety-report/CommunityOpinions'
import { MapView } from '@/components/safety-report/MapView'
import { RestrictedContent } from '@/components/auth/restricted-content'
import { notFound } from 'next/navigation'
import Loading from './loading'
import { MOCK_SAFETY_REPORT, MOCK_SAFETY_METRICS } from '@/lib/mock/safety-report'

interface PageProps {
  params: {
    id: string
  }
  searchParams?: { [key: string]: string | string[] | undefined }
}

const validateReportParams = (id: string) => {
  return typeof id === 'string' && id.length > 0
}

async function getReportData() {
  // For now, return mock data
  return Promise.resolve(MOCK_SAFETY_REPORT)
}

export default async function SafetyReportPage({ params }: PageProps) {
  const id = params.id

  // Validate params before proceeding
  if (!validateReportParams(id)) {
    notFound()
  }

  // Fetch report data
  const reportData = await getReportData()

  // If no data found, show 404
  if (!reportData) {
    notFound()
  }

  return (
    <Suspense fallback={<Loading />}>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Safety Report</h1>
          <p className="text-gray-600">
            Report for: <a href={reportData.url} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{reportData.url}</a>
          </p>
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