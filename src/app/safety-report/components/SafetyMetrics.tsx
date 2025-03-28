'use client'

import * as React from 'react'
import { 
  Clock, 
  Car, 
  Baby, 
  Bus, 
  UserRound,
  Plus,
  Home,
  Sun
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
  women: 'Would I be harassed here?',
  property: 'How likely is a break-in or theft?',
  daytime: 'Is it safe to walk around during the day?'
}

// Icons for each metric type
const METRIC_ICONS: Record<string, LucideIcon> = {
  night: Clock,
  vehicle: Car,
  child: Baby,
  transit: Bus,
  women: UserRound,
  property: Home,
  daytime: Sun
}

// All expected metric types
const EXPECTED_METRIC_TYPES = [
  'night', 
  'vehicle', 
  'child', 
  'transit', 
  'women',
  'property',
  'daytime'
]

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface MetricData {
  title: string
  description: string
  icon: LucideIcon
  iconForeground: string
  iconBackground: string
  score?: number
  label: string
  isEmpty: boolean
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

  const metricsByType: Record<string, MetricData> = {}
  
  // Process available metrics
  data.forEach(metric => {
    const riskLevel = getRiskLevel(metric.score)
    const MetricIcon = METRIC_ICONS[metric.metric_type] || riskLevel.icon
    
    metricsByType[metric.metric_type] = {
      title: METRIC_QUESTIONS[metric.metric_type] || metric.question,
      description: metric.description,
      icon: MetricIcon,
      iconForeground: riskLevel.textColor,
      iconBackground: riskLevel.bgColor,
      score: metric.score,
      label: riskLevel.label,
      isEmpty: false
    }
  })
  
  // Create empty states for missing metrics
  EXPECTED_METRIC_TYPES.forEach(type => {
    if (!metricsByType[type]) {
      const MetricIcon = METRIC_ICONS[type] || Plus
      metricsByType[type] = {
        title: METRIC_QUESTIONS[type] || "Unknown Metric",
        description: "Data not available for this location",
        icon: MetricIcon,
        iconForeground: "text-gray-400",
        iconBackground: "bg-gray-100",
        score: 0,
        label: "No Data",
        isEmpty: true
      }
    }
  })

  // Add "coming soon" metric
  const comingSoonMetric = {
    title: "More metrics coming soon",
    description: "We're constantly adding new safety indicators",
    icon: Plus,
    iconForeground: "text-blue-600",
    iconBackground: "bg-blue-100",
    label: "Coming Soon",
    isEmpty: false
  }
  
  // Convert to array for rendering
  const metricActions = [...Object.values(metricsByType), comingSoonMetric]

  return (
    <div className="bg-white p-6 shadow-sm rounded-b-xl">
      <div className="divide-y divide-gray-200 overflow-hidden bg-gray-200 sm:grid sm:grid-cols-2 sm:gap-px sm:divide-y-0">
        {metricActions.map((action) => (
          <div
            key={action.title}
            className={classNames(
              action.isEmpty ? 'opacity-70' : '',
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
                {action.label && (
                  <span className={`text-sm px-2 py-1 rounded-full ${action.iconBackground} ${action.iconForeground}`}>
                    {action.label}
                  </span>
                )}
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