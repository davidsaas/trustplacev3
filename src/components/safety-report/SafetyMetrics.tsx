'use client'

import { Card } from '@/components/ui/card'
import { CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react'

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

// Updated labels with questions
const METRIC_QUESTIONS: Record<string, string> = {
  night: 'Can I go outside after dark?',
  vehicle: 'Can I park here safely?',
  child: 'Are kids safe here?',
  transit: 'Is it safe to use public transport?',
  women: 'Would I be harassed here?'
}

// Risk level mapping with enhanced visual styling
const getRiskLevel = (score: number) => {
  if (score >= 8) return { 
    label: 'Low Risk', 
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700', 
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-100',
    icon: CheckCircle2,
    description: 'Generally very safe area'
  }
  if (score >= 6) return { 
    label: 'Medium Risk', 
    color: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700', 
    lightBg: 'bg-amber-50',
    border: 'border-amber-100',
    icon: AlertCircle,
    description: 'Exercise normal caution'
  }
  if (score >= 4) return { 
    label: 'High Risk', 
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700', 
    lightBg: 'bg-orange-50',
    border: 'border-orange-100',
    icon: AlertTriangle,
    description: 'Exercise increased caution'
  }
  return { 
    label: 'Maximum Risk', 
    color: 'bg-rose-500',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700', 
    lightBg: 'bg-rose-50',
    border: 'border-rose-100',
    icon: ShieldAlert,
    description: 'Extreme caution advised'
  }
}

export const SafetyMetrics = ({ data }: SafetyMetricsProps) => {
  if (!data) {
    return (
      <Card className="p-6 bg-white rounded-xl shadow-md">
        <h2 className="text-2xl font-semibold mb-4">Safety Score</h2>
        <div className="p-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">No safety data available for this location</p>
        </div>
      </Card>
    )
  }

  // Calculate overall score (average of all metric scores)
  const overallScore = Math.round(
    data.reduce((acc, metric) => acc + metric.score, 0) / data.length * 10
  )

  // Get overall risk level
  const overallRisk = getRiskLevel(overallScore / 10)
  const RiskIcon = overallRisk.icon

  // Clean up debug info from descriptions
  const cleanDescription = (description: string) => {
    // Remove debug info in brackets if present
    return description.replace(/\s*\[DEBUG:.+\]$/, '').trim()
  }

  return (
    <Card className="p-6 bg-white rounded-xl shadow-md overflow-hidden">
      <h2 className="text-2xl font-semibold mb-4">Safety Analysis</h2>
      
      {/* Overall score section */}
      <div className="mb-8 p-6 rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0">
            <div className={`absolute inset-0 flex items-center justify-center flex-col rounded-full ${overallRisk.lightBg} border-4 ${overallRisk.border}`}>
              <span className="text-3xl font-bold">{overallScore}</span>
              <span className="text-xs font-medium mt-1">/100</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <RiskIcon className={`w-5 h-5 ${overallRisk.textColor}`} />
              <h3 className={`text-lg font-semibold ${overallRisk.textColor}`}>{overallRisk.label}</h3>
            </div>
            <p className="text-gray-500 text-sm mb-2">{overallRisk.description}</p>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${overallRisk.color} rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${overallScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Individual safety metrics */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-800 mb-4">Safety Factors</h3>
        
        {data.map((metric) => {
          const riskLevel = getRiskLevel(metric.score)
          const MetricIcon = riskLevel.icon
          return (
            <div key={metric.id} className={`p-4 rounded-xl ${riskLevel.bgColor} border ${riskLevel.border}`}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <MetricIcon className={`w-5 h-5 ${riskLevel.textColor}`} />
                  <h4 className="font-medium text-gray-800">{METRIC_QUESTIONS[metric.metric_type] || metric.question}</h4>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${riskLevel.textColor} bg-white shadow-sm`}>
                  {riskLevel.label}
                </span>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-gray-600">
                  {cleanDescription(metric.description)}
                </p>
              </div>
              
              <div className="h-2 bg-white bg-opacity-70 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${riskLevel.color} rounded-full transition-all duration-1000 ease-out`}
                  style={{ width: `${metric.score * 10}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
} 