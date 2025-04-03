'use client'

import * as React from 'react'
import {
  Footprints, // Pedestrian
  TrainFront, // Transport
  ShoppingCart, // Convenience
  Utensils, // Dining
  Martini, // Nightlife
  TreePine, // Green Space
  HelpCircle, // Default/Not Found
  Loader2 // Loading icon
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OSMInsightsResponse, OSMInsight } from '@/app/api/osm-insights/route' // Import types from API route

type OSMInsightsProps = {
  data: OSMInsightsResponse | null
  isLoading: boolean
}

// Define base details for each OSM metric
const OSM_METRIC_DETAILS: Record<keyof OSMInsightsResponse, { question: string; icon: LucideIcon }> = {
  pedestrian: {
    question: 'Is it easy to walk around?',
    icon: Footprints,
  },
  transport: {
    question: 'How good is public transport access?',
    icon: TrainFront,
  },
  convenience: {
    question: 'Are daily essentials nearby?',
    icon: ShoppingCart,
  },
  dining: {
    question: 'Many places to eat or grab coffee?',
    icon: Utensils,
  },
  nightlife: {
    question: 'Is the area lively at night?',
    icon: Martini,
  },
  greenSpace: {
    question: 'Are there parks nearby?',
    icon: TreePine,
  },
}

// Define styling and **engaging, metric-specific** descriptions for each level
const LEVEL_INFO: Record<OSMInsight['level'], {
    label: string;
    textColor: string;
    bgColor: string;
    // Descriptions are now an object keyed by metric type
    descriptions: Record<keyof OSMInsightsResponse, string>;
}> = {
    'Not Found': {
      label: 'Not Found', // Consider 'No Data Shown' or 'Not Mapped'
      textColor: 'text-gray-500',
      bgColor: 'bg-gray-100',
      descriptions: {
          pedestrian: "Map shows no sidewalks or crossings in the immediate area. Data may be incomplete, so please walk with caution.",
          transport: "No public transport stops shown nearby. Plan for alternative travel or longer walks to the nearest stop.",
          convenience: "No essential shops (like supermarkets) shown nearby. Expect to travel further for supplies.",
          dining: "No restaurants or cafes shown nearby. You'll likely need to explore other areas for meals.",
          nightlife: "No bars or clubs shown nearby. Expect quiet evenings in the immediate vicinity.",
          greenSpace: "No parks or playgrounds shown nearby. Finding green space will likely require a short trip."
      }
    },
    Low: {
      label: 'Low',
      textColor: 'text-orange-700',
      bgColor: 'bg-orange-100',
      descriptions: {
          pedestrian: "Limited sidewalks and crossings in the area. Be mindful when walking.",
          transport: "Few public transport stops are close by. Check schedules and expect some walking or potential waits.",
          convenience: "A few essential shops are close by. Basic needs might be covered, but options are limited.",
          dining: "A few restaurants or cafes are nearby. Suitable for quick meals; explore further for more variety.",
          nightlife: "Limited bars or pubs are close by. It's generally a quieter area with few evening options.",
          greenSpace: "Limited parks or playgrounds are nearby. You may need to travel a bit for larger green spaces."
      }
    },
    Medium: {
      label: 'Medium',
      textColor: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      descriptions: {
          pedestrian: "Good sidewalk and crossing coverage locally. Walking should be reasonably easy.",
          transport: "A fair number of public transport stops are available nearby, offering decent travel options.",
          convenience: "A moderate selection of essential shops are close by. Finding daily necessities should be convenient.",
          dining: "A good mix of restaurants and cafes are available nearby. Plenty of choice for meals close at hand.",
          nightlife: "A moderate number of bars and pubs are close by, offering some local evening entertainment options.",
          greenSpace: "Some parks or playgrounds are readily accessible, providing nearby spots for fresh air and recreation."
      }
    },
    High: {
      label: 'High',
      textColor: 'text-green-700',
      bgColor: 'bg-green-100',
      descriptions: {
          pedestrian: "Excellent sidewalk and crossing coverage locally. Expect a highly walkable area.",
          transport: "Numerous public transport stops are readily available. Getting around is easy and convenient.",
          convenience: "Plenty of essential shops are close by. Daily necessities are very convenient to get.",
          dining: "Wide variety of restaurants and cafes right nearby. You'll be spoiled for choice!",
          nightlife: "Lots of bars, pubs, and clubs close by. Expect a lively atmosphere with many evening options.",
          greenSpace: "Good availability of parks and playgrounds nearby. Easy access to green space for recreation."
      }
    }
}

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface MetricDisplayData {
  key: keyof OSMInsightsResponse
  title: string
  description: string // Updated description based on level
  icon: LucideIcon
  iconForeground: string
  iconBackground: string
  label: string
  isEmpty: boolean // Indicates if data wasn't found
}

export const OSMInsights = ({ data, isLoading }: OSMInsightsProps) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="p-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400 mr-2" />
          <p className="text-gray-500">Loading neighborhood insights...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="p-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">Could not load neighborhood insights.</p>
        </div>
      </div>
    )
  }

  const metricActions: MetricDisplayData[] = (Object.keys(data) as Array<keyof OSMInsightsResponse>).map(key => {
    const insight = data[key]
    const details = OSM_METRIC_DETAILS[key]
    const levelInfo = LEVEL_INFO[insight.level]
    // Access the description specific to this metric's key
    const description = levelInfo.descriptions[key] || levelInfo.descriptions.pedestrian; // Fallback just in case
    const Icon = details.icon || HelpCircle

    return {
      key: key,
      title: details.question,
      description: description, // Use the metric-specific description
      icon: Icon,
      iconForeground: levelInfo.textColor,
      iconBackground: levelInfo.bgColor,
      label: levelInfo.label,
      isEmpty: insight.level === 'Not Found',
    }
  })

  return (
    <div className="bg-white p-6 shadow-sm rounded-b-xl">
      <div className="divide-y divide-gray-200 overflow-hidden bg-gray-200 sm:grid sm:grid-cols-2 sm:gap-px sm:divide-y-0">
        {metricActions.map((action) => {
          // Determine background based on label
          let backgroundClass = '';
          switch (action.label) {
            case 'High':
              backgroundClass = 'bg-green-500/5'; // Subtle green
              break;
            case 'Medium':
              backgroundClass = 'bg-orange-500/5'; // Subtle yellow
              break;
            case 'Low':
              backgroundClass = 'bg-orange-500/5'; // Subtle orange
              break;
            case 'Not Found':
            default:
              backgroundClass = 'bg-gray-500/5'; // Subtle gray for 'Not Found' or default
          }
          
          return (
            <div
              key={action.key}
              className={classNames(
                action.isEmpty ? 'opacity-70' : '',
                'group relative bg-white p-6 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-inset',
                backgroundClass // Add the background class here
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
                <h3 className="text-lg font-semibold text-gray-900 flex items-center justify-between">
                  {action.title}
                  {action.label && (
                    <span className={`text-sm px-2 py-1 rounded-full ${action.iconBackground} ${action.iconForeground}`}>
                      {action.label}
                    </span>
                  )}
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  {action.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
} 