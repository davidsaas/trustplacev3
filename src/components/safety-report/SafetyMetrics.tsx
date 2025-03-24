'use client'

import { Card } from '@/components/ui/card'

type SafetyMetric = {
  id: string
  metric_type: string
  score: number
  question: string
  description: string
}

type SafetyMetricsProps = {
  data: SafetyMetric[] | null
}

const METRIC_LABELS: Record<string, string> = {
  night: 'Night Safety',
  vehicle: 'Vehicle Safety',
  child: 'Child Safety',
  transit: 'Transit Safety',
  women: 'Women Safety'
}

export const SafetyMetrics = ({ data }: SafetyMetricsProps) => {
  if (!data) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Safety Score</h2>
        <p className="text-gray-500">No safety data available for this location</p>
      </Card>
    )
  }

  // Calculate overall score (average of all metric scores)
  const overallScore = Math.round(
    data.reduce((acc, metric) => acc + metric.score, 0) / data.length * 10
  )

  // Clean up debug info from descriptions
  const cleanDescription = (description: string) => {
    // Remove debug info in brackets if present
    return description.replace(/\s*\[DEBUG:.+\]$/, '').trim()
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Safety Score</h2>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold">{overallScore}</span>
            </div>
            <svg className="transform -rotate-90" width="96" height="96">
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - overallScore / 100)}`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium">Overall Safety</p>
            <p className="text-sm text-gray-500">Based on multiple safety factors</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {data.map((metric) => (
          <div key={metric.id} className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">{METRIC_LABELS[metric.metric_type] || metric.question}</h3>
                <p className="text-sm text-gray-500">
                  {cleanDescription(metric.description)}
                </p>
              </div>
              <span className="text-lg font-semibold">{metric.score * 10}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${metric.score * 10}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
} 