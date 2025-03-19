import { Suspense } from 'react'
import { SafetyMetrics } from '@/components/safety-report/SafetyMetrics'
import { CommunityOpinions } from '@/components/safety-report/CommunityOpinions'
import { MapView } from '@/components/safety-report/MapView'
import { RestrictedContent } from '@/components/auth/restricted-content'
import { notFound } from 'next/navigation'
import Loading from './loading'

type Props = {
  params: {
    id: string
  }
}

async function getReportData(id: string) {
  // TODO: Implement actual data fetching
  // For now, return mock data
  return {
    id,
    url: 'https://example.com',
    platform: 'airbnb',
    timestamp: new Date().toISOString()
  }
}

export default async function SafetyReportPage({ params }: Props) {
  const reportData = await getReportData(params.id)

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
              <SafetyMetrics />
            </RestrictedContent>

            <MapView />
          </div>

          <RestrictedContent>
            <CommunityOpinions />
          </RestrictedContent>
        </section>
      </main>
    </Suspense>
  )
}