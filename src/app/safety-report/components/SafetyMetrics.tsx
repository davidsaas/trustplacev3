'use client'

import React from 'react'
import { 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Car, 
  Baby, 
  Bus, 
  UserRound
} from 'lucide-react'
import type { SafetyMetric } from '@/types/safety-report'

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

// Icons for each metric type
const METRIC_ICONS: Record<string, any> = {
  night: Clock,
  vehicle: Car,
  child: Baby,
  transit: Bus,
  women: UserRound
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
    icon: ShieldCheck,
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

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export const SafetyMetrics = ({ data }: SafetyMetricsProps) => {
  if (!data) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="p-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">No safety data available for this location</p>
        </div>
      </div>
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

  const metricActions = data.map(metric => {
    const riskLevel = getRiskLevel(metric.score)
    const MetricIcon = METRIC_ICONS[metric.metric_type] || riskLevel.icon
    
    return {
      title: METRIC_QUESTIONS[metric.metric_type] || metric.question,
      description: cleanDescription(metric.description),
      icon: MetricIcon,
      iconForeground: riskLevel.textColor,
      iconBackground: riskLevel.bgColor,
      score: metric.score,
      label: riskLevel.label
    }
  })

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">

      {/* Individual safety metrics as grid */}
      <h3 className="text-lg font-medium text-gray-800 mb-4">Safety Factors</h3>
      
      <div className="divide-y divide-gray-200 overflow-hidden rounded-xl bg-gray-200 shadow-sm sm:grid sm:grid-cols-2 sm:gap-px sm:divide-y-0">
        {metricActions.map((action, actionIdx) => (
          <div
            key={action.title}
            className={classNames(
              actionIdx === 0 ? 'rounded-tl-xl rounded-tr-xl sm:rounded-tr-none' : '',
              actionIdx === 1 ? 'sm:rounded-tr-xl' : '',
              actionIdx === metricActions.length - 2 ? 'sm:rounded-bl-xl' : '',
              actionIdx === metricActions.length - 1 ? 'rounded-br-xl rounded-bl-xl sm:rounded-bl-none' : '',
              'group relative bg-white p-6 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-inset',
            )}
          >
            <div>
              <span
                className={classNames(
                  action.iconBackground,
                  action.iconForeground,
                  'inline-flex rounded-lg p-3 ring-4 ring-white',
                )}
              >
                <action.icon aria-hidden="true" className="size-6" />
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center justify-between">
                {action.title}
                <span className={`text-sm px-2 py-1 rounded-full ${action.iconBackground} ${action.iconForeground}`}>
                  {action.label}
                </span>
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {action.description}
              </p>
            </div>
            
            <div className="mt-4 pt-2 border-t border-gray-100">
              <div className="h-2 bg-white bg-opacity-70 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${action.iconForeground.replace('text', 'bg')} rounded-full transition-all duration-1000 ease-out`}
                  style={{ width: `${action.score * 10}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 