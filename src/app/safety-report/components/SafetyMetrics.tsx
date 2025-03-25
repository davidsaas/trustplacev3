'use client'

import * as React from 'react'
import { 
  Clock, 
  Car, 
  Baby, 
  Bus, 
  UserRound
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SafetyMetric } from '@/types/safety-report'
import { getRiskLevel } from '../utils'

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
const METRIC_ICONS: Record<string, LucideIcon> = {
  night: Clock,
  vehicle: Car,
  child: Baby,
  transit: Bus,
  women: UserRound
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
    <div className="bg-white p-6 shadow-sm">
      <div className="divide-y divide-gray-200 overflow-hidden bg-gray-200 sm:grid sm:grid-cols-2 sm:gap-px sm:divide-y-0">
        {metricActions.map((action, actionIdx) => (
          <div
            key={action.title}
            className={classNames(
              actionIdx === 0 ? '' : '',
              actionIdx === 1 ? '' : '',
              actionIdx === metricActions.length - 2 ? '' : '',
              actionIdx === metricActions.length - 1 ? '' : '',
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
          </div>
        ))}
      </div>
    </div>
  )
} 