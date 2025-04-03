'use client'

import React, { useState, useEffect } from 'react';
import { 
  ImageOff, 
  ArrowUpIcon, 
  ArrowDownIcon, 
  ShieldCheck,
  MapPin, 
  DollarSign
} from 'lucide-react';
import type { SimilarAccommodation, SafetyMetric } from '@/types/safety-report';
import Link from 'next/link';
import { SAFETY_METRIC_DETAILS } from '@/lib/constants';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { getRiskLevel } from '../../utils';

// Define type for metric comparison results
type MetricComparison = {
  metric_type: string;
  difference: number;
  current_score: number | null;
  alt_score: number | null;
  message: string;
  sentiment: 'positive' | 'negative' | 'neutral';
};

// Update props to remove hover state and handler
interface SaferAlternativesSectionProps {
  alternatives: SimilarAccommodation[] | null | undefined;
  currentScore: number | null | undefined;
  currentMetrics: SafetyMetric[] | null | undefined;
}

// Helper function to generate user-friendly metric message
const getMetricMessage = (
  metricType: string,
  difference: number
): { message: string; sentiment: 'positive' | 'negative' | 'neutral' } => {
  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  
  if (difference > 0) {
    sentiment = 'positive';
  } else if (difference < 0) {
    sentiment = 'negative';
  }

  // Generate very specific messages based on metric type and magnitude
  if (sentiment === 'positive') {
    if (difference > 10) {
      switch(metricType) {
        case 'night_safety':
          return { message: "Less nighttime crime reported", sentiment };
        case 'parking_safety':
          return { message: "Lower car break-in risk", sentiment };
        case 'kids_safety':
          return { message: "Safer for families with children", sentiment };
        case 'transport_safety':
          return { message: "Better transit security", sentiment };
        case 'women_safety':
          return { message: "Reduced harassment incidents", sentiment };
        default:
          return { message: `Much better ${metricType.replace('_', ' ')}`, sentiment };
      }
    } 
    else {
      switch(metricType) {
        case 'night_safety':
          return { message: "Fewer nighttime incidents", sentiment };
        case 'parking_safety':
          return { message: "Less vehicle theft risk", sentiment };
        case 'kids_safety':
          return { message: "Better for children", sentiment };
        case 'transport_safety':
          return { message: "Safer public transport nearby", sentiment };
        case 'women_safety':
          return { message: "Better for solo women travelers", sentiment };
        default:
          return { message: `Better ${metricType.replace('_', ' ')}`, sentiment };
      }
    }
  } 
  else if (sentiment === 'negative') {
    const absDiff = Math.abs(difference);
    if (absDiff > 10) {
      switch(metricType) {
        case 'night_safety':
          return { message: "Higher nighttime crime rate", sentiment };
        case 'parking_safety':
          return { message: "More car break-ins reported", sentiment };
        case 'kids_safety':
          return { message: "Less child-friendly area", sentiment };
        case 'transport_safety':
          return { message: "Transit safety concerns", sentiment };
        case 'women_safety':
          return { message: "More harassment incidents", sentiment };
        default:
          return { message: `Worse ${metricType.replace('_', ' ')}`, sentiment };
      }
    } 
    else {
      switch(metricType) {
        case 'night_safety':
          return { message: "Slightly higher night risk", sentiment };
        case 'parking_safety':
          return { message: "Some vehicle security concerns", sentiment };
        case 'kids_safety':
          return { message: "Less ideal for families", sentiment };
        case 'transport_safety':
          return { message: "Some transit safety issues", sentiment };
        case 'women_safety':
          return { message: "Some concerns for women", sentiment };
        default:
          return { message: `Slightly worse ${metricType.replace('_', ' ')}`, sentiment };
      }
    }
  }
  
  return { message: `Similar ${metricType.replace('_', ' ')}`, sentiment: 'neutral' };
};

// Helper function to compare metrics
const compareMetrics = (
  currentMetrics: SafetyMetric[] | null | undefined,
  altMetrics: SafetyMetric[] | null | undefined
): MetricComparison[] => {
  if (!currentMetrics || !altMetrics) {
    return [];
  }

  const currentMetricsMap = new Map(currentMetrics.map(m => [m.metric_type, m.score]));
  const altMetricsMap = new Map(altMetrics.map(m => [m.metric_type, m.score]));
  
  const currentKeys = Array.from(currentMetricsMap.keys());
  const altKeys = Array.from(altMetricsMap.keys());
  const allMetricTypes = Array.from(new Set([...currentKeys, ...altKeys]));

  const comparisons: MetricComparison[] = [];

  allMetricTypes.forEach(type => {
    const currentScore = currentMetricsMap.get(type) ?? null;
    const altScore = altMetricsMap.get(type) ?? null;

    if (typeof currentScore === 'number' && typeof altScore === 'number') {
      const difference = altScore - currentScore;
      const { message, sentiment } = getMetricMessage(type, difference);
      
      comparisons.push({
        metric_type: type,
        difference,
        current_score: currentScore,
        alt_score: altScore,
        message,
        sentiment
      });
    }
  });

  comparisons.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return comparisons;
};

// --- Mini Score Component ---
const MiniScoreIndicator = ({ score }: { score: number | null | undefined }) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const displayScore = score ?? 0;
  const hasScore = typeof score === 'number' && score >= 0; // Consider 0 a valid score for display
  const risk = hasScore
    ? getRiskLevel(displayScore / 10)
    : { fill: '#e5e7eb', textColor: 'text-gray-500' }; // Default gray

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(displayScore);
    }, 50); // Short delay for animation
    return () => clearTimeout(timer);
  }, [displayScore]);

  if (!hasScore) {
    return (
      <div className="size-10 flex items-center justify-center rounded-full bg-gray-100">
        <span className="text-[10px] font-bold text-gray-400">N/A</span>
      </div>
    );
  }

  return (
    <div className="size-10" title={`Safety Score: ${displayScore}/100`}>
      <CircularProgressbar
        value={animatedScore}
        text={`${displayScore}`}
        styles={buildStyles({
          textSize: '36px',
          pathTransitionDuration: 1.0,
          pathColor: risk.fill,
          textColor: risk.fill,
          trailColor: '#f3f4f6', // Lighter gray trail
          backgroundColor: 'transparent',
        })}
        strokeWidth={10}
        className="font-bold"
      />
    </div>
  );
};
// --- End Mini Score Component ---

export const SaferAlternativesSection = ({
  alternatives,
  currentScore,
  currentMetrics,
}: SaferAlternativesSectionProps) => {
  // Handle null or empty alternatives array
  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center min-h-[150px] flex items-center justify-center">
        <p className="text-gray-500">No significantly safer alternatives found nearby matching the criteria.</p>
      </div>
    );
  }

  const safeCurrentScore = currentScore ?? 0;
  const displayedAlternatives = alternatives.slice(0, 8); // Limit to 8 alternatives

  return (
    <div className="flex space-x-4 overflow-x-auto py-2 -my-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
      {displayedAlternatives.map((alt) => {
        const metricComparisons = compareMetrics(currentMetrics, alt.safety_metrics);
        const improvements = metricComparisons.filter(c => c.sentiment === 'positive').slice(0, 3);
        const concerns = metricComparisons.filter(c => c.sentiment === 'negative').slice(0, 1);

        return (
          <div
            key={alt.id}
            className={`relative flex-shrink-0 w-[300px] bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-md group transition-all duration-200 ease-in-out`}
          >
            {/* Property Card Header */}
            <div className="flex items-start p-4">
              {/* Thumbnail */}
              <div className="flex-shrink-0 mr-3">
                 {alt.image_url ? (
                   <img src={alt.image_url} alt={alt.name} className="size-10 object-cover rounded-md bg-gray-100" />
                 ) : (
                   <div className="size-10 rounded-md bg-gray-100 flex items-center justify-center" aria-label="Placeholder image">
                     <ImageOff className="size-6 text-gray-300" aria-hidden="true" />
                   </div>
                 )}
              </div>

              {/* Mini Score Indicator */}
              <div className="flex-shrink-0 mr-3">
                 <MiniScoreIndicator score={alt.overall_score} />
              </div>

              {/* Name and Basic Details */}
              <div className="flex-grow min-w-0">
                 {/* Ensure title truncation */}
                <h4 className="font-semibold text-gray-800 truncate max-w-[25ch]" title={alt.name}>{alt.name}</h4>

                <div className="mt-1.5 flex flex-col space-y-1">
                  {/* Distance */}
                  <div className="inline-flex items-center text-gray-500">
                    <MapPin className="size-4 mr-1.5 flex-shrink-0" />
                    <span className="text-sm">{(alt.distance ?? 0).toFixed(1)} km away</span>
                  </div>

                  {/* Price */}
                  {alt.price_per_night && (
                    <div className="inline-flex items-center text-gray-500">
                      <DollarSign className="size-4 mr-1.5 flex-shrink-0" />
                      <span className="text-sm">${alt.price_per_night}/night</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Safety Insights Section */}
            {(improvements.length > 0 || concerns.length > 0) && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <h5 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">SAFETY INSIGHTS</h5>
                <div className="space-y-1.5">
                  {/* Improvements */}
                  {improvements.map(comp => {
                    const Icon = SAFETY_METRIC_DETAILS[comp.metric_type]?.Icon || ShieldCheck;
                    return (
                      <div
                        key={`${alt.id}-improve-${comp.metric_type}`}
                        className="flex items-center text-xs"
                      >
                        <ArrowUpIcon className="size-3.5 text-green-600 mr-1.5 flex-shrink-0" />
                        <Icon className="size-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
                        <span className="text-gray-700 truncate" title={comp.message}>{comp.message}</span>
                      </div>
                    );
                  })}
                  
                  {/* Concerns */}
                  {concerns.map(comp => {
                    const Icon = SAFETY_METRIC_DETAILS[comp.metric_type]?.Icon || ShieldCheck;
                    return (
                      <div
                        key={`${alt.id}-concern-${comp.metric_type}`}
                        className="flex items-center text-xs"
                      >
                        <ArrowDownIcon className="size-3.5 text-red-600 mr-1.5 flex-shrink-0" />
                        <Icon className="size-3.5 text-gray-500 mr-1.5 flex-shrink-0" />
                        <span className="text-gray-700 truncate" title={comp.message}>{comp.message}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

             {/* View Button (Absolute positioned at bottom right) */}
             <Link
                 href={`/safety-report/${alt.id}`}
                 className="absolute bottom-3 right-3 inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                 target="_blank"
                 rel="noopener noreferrer"
                 aria-label={`View safety report for ${alt.name}`}
             >
                 View
             </Link>

          </div>
        );
      })}
      {/* Add padding element for better scroll appearance */}
      <div className="flex-shrink-0 w-2"></div>
    </div>
  );
};

export default SaferAlternativesSection;