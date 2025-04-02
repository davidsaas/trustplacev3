'use client'

import React from 'react';
import { 
  ImageOff, 
  ArrowUpIcon, 
  ArrowDownIcon, 
  Shield, 
  ShieldCheck,
  MapPin, 
  DollarSign
} from 'lucide-react';
import type { SimilarAccommodation, SafetyMetric } from '@/types/safety-report';
import Link from 'next/link';
import { SAFETY_METRIC_DETAILS } from '@/lib/constants';

// Define type for metric comparison results
type MetricComparison = {
  metric_type: string;
  difference: number;
  current_score: number | null;
  alt_score: number | null;
  message: string;
  sentiment: 'positive' | 'negative' | 'neutral';
};

// Update props to include current accommodation's metrics
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

export const SaferAlternativesSection = ({ alternatives, currentScore, currentMetrics }: SaferAlternativesSectionProps) => {
  // Handle null or empty alternatives array
  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm text-center">
        <p className="text-gray-500">No significantly safer alternatives found nearby matching the criteria.</p>
      </div>
    );
  }

  const safeCurrentScore = currentScore ?? 0;

  return (
    <div className="space-y-4">
      {alternatives.map((alt) => {
        const metricComparisons = compareMetrics(currentMetrics, alt.safety_metrics);
        const improvements = metricComparisons.filter(c => c.sentiment === 'positive').slice(0, 3);
        const concerns = metricComparisons.filter(c => c.sentiment === 'negative').slice(0, 1);
        const scoreDifference = (alt.overall_score ?? 0) - safeCurrentScore;
        
        return (
          <div key={alt.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
            {/* Property Card Header */}
            <div className="flex items-center p-4">
              {/* Thumbnail */}
              {alt.image_url ? (
                <img src={alt.image_url} alt={alt.name} className="w-20 h-20 object-cover rounded-md flex-shrink-0 bg-gray-100" />
              ) : (
                <div className="w-20 h-20 rounded-md flex-shrink-0 bg-gray-100 flex items-center justify-center" aria-label="Placeholder image">
                  <ImageOff className="size-8 text-gray-300" aria-hidden="true" />
                </div>
              )}
              
              {/* Name and Basic Details */}
              <div className="ml-4 flex-grow">
                <h4 className="font-semibold text-gray-800 truncate">{alt.name}</h4>
                
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center text-green-600">
                    <Shield className="size-4 mr-1.5" />
                    <span className="font-medium">+{scoreDifference.toFixed(0)} safety score</span>
                  </div>
                  
                  <div className="inline-flex items-center text-gray-500">
                    <MapPin className="size-4 mr-1" />
                    <span>{(alt.distance ?? 0).toFixed(1)} km</span>
                  </div>
                  
                  {alt.price_per_night && (
                    <div className="inline-flex items-center text-gray-500">
                      <DollarSign className="size-4 mr-1" />
                      <span>${alt.price_per_night}/night</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* View Button */}
              <div className="ml-4">
                <Link 
                  href={`/safety-report/${alt.id}`}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </Link>
              </div>
            </div>
            
            {/* Safety Insights Section */}
            {(improvements.length > 0 || concerns.length > 0) && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <h5 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2.5">SAFETY INSIGHTS</h5>
                
                <div className="grid grid-cols-1 gap-2.5">
                  {/* Improvements */}
                  {improvements.map(comp => {
                    const Icon = SAFETY_METRIC_DETAILS[comp.metric_type]?.Icon || ShieldCheck;
                    
                    return (
                      <div 
                        key={comp.metric_type} 
                        className="flex items-center"
                        title={`${comp.current_score} → ${comp.alt_score} (${comp.difference > 0 ? '+' : ''}${comp.difference.toFixed(0)})`}
                      >
                        <ArrowUpIcon className="size-4 text-green-600 mr-2" />
                        <ShieldCheck className="size-4 text-gray-700 mr-2" />
                        <span className="text-gray-900 font-medium">{comp.message}</span>
                      </div>
                    );
                  })}
                  
                  {/* Concerns */}
                  {concerns.map(comp => {
                    const Icon = SAFETY_METRIC_DETAILS[comp.metric_type]?.Icon || ShieldCheck;
                    
                    return (
                      <div 
                        key={comp.metric_type} 
                        className="flex items-center"
                        title={`${comp.current_score} → ${comp.alt_score} (${comp.difference > 0 ? '+' : ''}${comp.difference.toFixed(0)})`}
                      >
                        <ArrowDownIcon className="size-4 text-red-600 mr-2" />
                        <ShieldCheck className="size-4 text-gray-700 mr-2" />
                        <span className="text-gray-900 font-medium">{comp.message}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SaferAlternativesSection;
