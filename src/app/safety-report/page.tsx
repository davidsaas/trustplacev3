import { Suspense } from 'react'
import { URLProcessor } from './components/URLProcessor'
import { SafetyMetrics } from './components/SafetyMetrics'

export default function SafetyReportPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Safety Report</h1>
      
      <section className="space-y-8">
        <Suspense fallback={<div>Loading URL processor...</div>}>
          <URLProcessor />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Suspense fallback={<div>Loading safety metrics...</div>}>
            <SafetyMetrics data={null} />
          </Suspense>
        </div>
      </section>
    </main>
  )
} 