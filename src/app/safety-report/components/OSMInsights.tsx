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
    label: 'Not Found',
    textColor: 'text-gray-500',
    bgColor: 'bg-gray-100',
    descriptions: {
        pedestrian: "We couldn't find data on sidewalks or crossings . The map might be incomplete, so explore with awareness.",
        transport: "No public transport stops appear on the map. Plan for alternative ways to get around or longer walks to the nearest stop.",
        convenience: "Essential shops like supermarkets or pharmacies aren't mapped. You'll likely need to travel a bit further for supplies.",
        dining: "Restaurants or cafes aren't mapped. Prepare to venture outside the immediate area for meals or coffee.",
        nightlife: "No bars or clubs are mapped. Expect a quiet evening atmosphere right outside your door.",
        greenSpace: "Parks or playgrounds aren't mapped. You might need to travel a short distance to find green spaces for relaxation or play."
    }
  },
  Low: {
    label: 'Low',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-100',
    descriptions: {
        pedestrian: "There's limited mapped pedestrian infrastructure (like sidewalks) within 500m. Be mindful of your surroundings when walking.",
        transport: "A few public transport options are mapped within 500m. Check schedules, as you might need to walk a bit or wait longer.",
        convenience: "A small number of essential shops are mapped within 500m. Basic needs might be covered, but options could be limited.",
        dining: "You'll find a few restaurants or cafes mapped within 500m. Good for a quick bite, but explore further for more variety.",
        nightlife: "A couple of bars or pubs are mapped within 500m. Offers a touch of nightlife, but it's generally a quieter area.",
        greenSpace: "Limited parks or playgrounds are mapped within 500m. A short trip might be needed to find a good spot to relax outdoors."
    }
  },
  Medium: {
    label: 'Medium',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    descriptions: {
        pedestrian: "The map shows a decent amount of sidewalks and crossings within 500m. Getting around on foot should be reasonably comfortable.",
        transport: "You'll find a fair number of public transport stops mapped within 500m, offering decent options for getting around the city.",
        convenience: "A moderate selection of essential shops are mapped within 500m. You should be able to find most daily necessities nearby.",
        dining: "There's a good mix of restaurants and cafes mapped within 500m. You'll likely find several appealing options close by.",
        nightlife: "A moderate number of bars and pubs are mapped within 500m, suggesting some options for evening entertainment nearby.",
        greenSpace: "Some parks or playgrounds are mapped within 500m, providing reasonable access to nearby spots for fresh air and recreation."
    }
  },
  High: {
    label: 'High',
    textColor: 'text-green-700',
    bgColor: 'bg-green-100',
    descriptions: {
        pedestrian: "Excellent pedestrian infrastructure is mapped within 500m. Expect a very walkable area with good sidewalks and crossings.",
        transport: "Numerous public transport options are mapped within 500m. Getting around the city should be easy and convenient.",
        convenience: "Plenty of essential shops are mapped within 500m. Grabbing groceries or necessities should be very convenient.",
        dining: "A wide variety of restaurants and cafes are mapped within 500m. You'll be spoiled for choice right outside your door!",
        nightlife: "Lots of bars, pubs, and clubs are mapped within 500m. Expect a lively atmosphere with plenty of evening entertainment options.",
        greenSpace: "Good availability of parks and playgrounds mapped within 500m. Enjoy easy access to nearby green spaces for relaxation or activity."
    }
  },
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
                    <span className={`text-base px-2 py-1 rounded-full ${action.iconBackground} ${action.iconForeground}`}>
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