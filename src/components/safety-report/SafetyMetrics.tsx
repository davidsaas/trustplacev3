'use client'

import { Card } from '@/components/ui/card'
import { MOCK_SAFETY_METRICS } from '@/lib/mock/safety-report'

export const SafetyMetrics = () => {
  const { overallScore, metrics } = MOCK_SAFETY_METRICS

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
        {Object.entries(metrics).map(([key, metric]) => (
          <div key={key} className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">{metric.label}</h3>
                <p className="text-sm text-gray-500">{metric.description}</p>
              </div>
              <span className="text-lg font-semibold">{metric.score}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${metric.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
} 