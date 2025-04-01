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
  Sun,
  HelpCircle // Default icon
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SafetyMetric } from '@/types/safety-report'
import { getRiskLevel } from '../utils'
// Import the JSON config
import metricDefinitions from '@/config/safety_metrics_config.json' assert { type: 'json' };

type SafetyMetricsProps = {
  data: SafetyMetric[] | null
}

// --- Define Type for Config Items ---
interface MetricDefinition {
  id: string;
  question: string;
  description: string;
  iconName: keyof typeof LucideIcons; // Ensure iconName matches a valid key
}

// --- Map Icon Names from JSON to Actual Components ---
const LucideIcons = {
  Clock,
  Car,
  Baby,
  Bus,
  UserRound,
  Home,
  Sun,
  HelpCircle // Default/fallback icon
};

// --- Remove old constants ---
// const METRIC_QUESTIONS: Record<string, string> = { ... }
// const METRIC_ICONS: Record<string, LucideIcon> = { ... }
// const EXPECTED_METRIC_TYPES = [ ... ]

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
  // --- Build metricsByType using JSON config --- 
  const metricsByType: Record<string, MetricData> = {};

  // 1. Initialize all metrics from config as 'No Data'
  (metricDefinitions.metrics as MetricDefinition[]).forEach(def => {
    const MetricIcon = LucideIcons[def.iconName] || LucideIcons.HelpCircle;
    metricsByType[def.id] = {
      title: def.question,
      description: "Data not available for this location", // Default description
      icon: MetricIcon,
      iconForeground: "text-gray-400",
      iconBackground: "bg-gray-100",
      score: 0,
      label: "No Data",
      isEmpty: true
    }
  });

  // 2. Populate with actual data if available
  if (data) {
    data.forEach(metric => {
      const definition = (metricDefinitions.metrics as MetricDefinition[]).find(def => def.id === metric.metric_type);
      if (!definition) return; // Skip if metric type not in config

      const riskLevel = getRiskLevel(metric.score);
      const MetricIcon = LucideIcons[definition.iconName] || LucideIcons.HelpCircle;
      
      metricsByType[metric.metric_type] = {
        title: definition.question, // Use question from config
        description: metric.description, // Use description from fetched data
        icon: MetricIcon,
        iconForeground: riskLevel.textColor,
        iconBackground: riskLevel.bgColor,
        score: metric.score,
        label: riskLevel.label,
        isEmpty: false // Mark as not empty
      }
    });
  }

  // --- Removed old processing logic for available/missing metrics --- 

  // Add "coming soon" metric (optional, can be removed if not needed)
  const comingSoonMetric = {
    title: "More metrics coming soon",
    description: "We're constantly adding new safety indicators",
    icon: Plus,
    iconForeground: "text-blue-600",
    iconBackground: "bg-blue-100",
    label: "Coming Soon",
    isEmpty: false // Treat as not empty for display purposes
  }
  
  // Convert to array for rendering (ensure order matches JSON config if desired, or sort)
  const metricActions = [
    // Get metrics in the order defined in the JSON file
    ...(metricDefinitions.metrics as MetricDefinition[]).map(def => metricsByType[def.id]),
    // Add coming soon at the end
    comingSoonMetric
  ];

  // --- Render logic remains the same --- 
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