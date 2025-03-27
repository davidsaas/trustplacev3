import { memo } from 'react'
import { ImageOff, ExternalLink, Shield, Info, CheckCircle, AlertTriangle } from 'lucide-react'
import { SavedButton } from './SavedButton'
import { PropertyMetrics } from './PropertyMetrics'
import { getValidImageUrl, getRiskLevel } from '../utils'
import type { PropertyHeaderProps } from '@/types/safety-report'
import { ReportNavMenu, type ReportSection } from '../[id]/components/ReportNavMenu'

type PropertyHeaderWithScoreAndNavProps = PropertyHeaderProps & {
  image_url: string | null
  url?: string | null
  overall_score?: number
  activeSection: ReportSection
  onSectionChange: (section: ReportSection) => void
}

const AnimatedScoreCircle = ({ score, size = 120, strokeWidth = 8, overallRisk }: { 
  score: number,
  size?: number,
  strokeWidth?: number,
  overallRisk: ReturnType<typeof getRiskLevel>
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (score / 100) * circumference;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg width={size} height={size} className="absolute inset-0">
        <circle
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
      </svg>
      
      {/* Animated progress circle */}
      <svg width={size} height={size} className="absolute inset-0 -rotate-90 transition-all duration-1000">
        <circle
          stroke={overallRisk.fill}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          className="transition-all duration-1000 ease-out"
        >
          <animate
            attributeName="stroke-dashoffset"
            from={circumference}
            to={progressOffset}
            dur="1.5s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.42 0 0.58 1"
          />
        </circle>
      </svg>
      
      {/* Inner content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{score}</span>
        <div className={`text-xs mt-1 ${overallRisk.textColor} font-medium flex items-center gap-1`}>
          <span>{overallRisk.label}</span>
        </div>
      </div>
    </div>
  );
};

export const PropertyHeader = memo(({
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url,
  url,
  overall_score = 0,
  activeSection,
  onSectionChange,
}: PropertyHeaderWithScoreAndNavProps) => {
  // Extract accommodation ID from the URL or use a fallback
  const extractAccommodationId = () => {
    if (url) {
      try {
        const urlObject = new URL(url);
        const segments = urlObject.pathname.split('/');
        const lastSegment = segments.filter(Boolean).pop(); // Get last non-empty segment
        if (lastSegment) return lastSegment.split('?')[0];
      } catch (e) {
         console.warn("Could not parse URL for ID extraction:", url);
      }
    }
    if (typeof window !== 'undefined') {
      const pathSegments = window.location.pathname.split('/');
      if (pathSegments.length > 2 && pathSegments[1] === 'safety-report') { // Check if it's a report page
        const idSegment = pathSegments[2];
        if (idSegment && idSegment !== '[id]') { // Ensure it's not the template placeholder
          return idSegment;
        }
      }
    }
    // Fallback using name and source if needed, ensure it's somewhat unique
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
    const safeSource = source.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${safeSource}-${safeName}-${overall_score}`; // Add score for more uniqueness
  };

  const accommodationId = extractAccommodationId();
  
  // Get overall risk level based on score
  const hasScore = overall_score > 0;
  const overallRisk = hasScore ? getRiskLevel(overall_score / 10) : null;

  return (
    <div className="shadow-sm rounded-xl">
      <div className="rounded-t-xl overflow-hidden">
        {getValidImageUrl(image_url) ? (
          <img 
            alt={`${name} - Property View`}
            src={image_url!}
            className="h-48 w-full object-cover lg:h-64" 
          />
        ) : (
          <div className="h-48 w-full lg:h-64 bg-gray-100 flex items-center justify-center">
            <div className="text-gray-400 text-center">
              <ImageOff className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-sm">No image available</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-white">
        <div className="mx-auto px-4 pt-6 pb-4 sm:px-6 lg:px-8">
          <div className="-mt-12 sm:-mt-16 sm:flex sm:items-end sm:space-x-5">
            <div className="flex">
              {hasScore && (
                <div className={`relative size-24 rounded-full ${overallRisk!.bgColor} ring-4 ring-white sm:size-32 flex items-center justify-center ${overallRisk!.border}`}>
                  <AnimatedScoreCircle 
                    score={overall_score} 
                    size={100} 
                    strokeWidth={8}
                    overallRisk={overallRisk!}
                  />
                </div>
              )}
              {!hasScore && (
                <div className="size-24 rounded-full bg-gray-100 ring-4 ring-white sm:size-32 flex items-center justify-center">
                  <Shield className="size-10 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="mt-6 sm:mt-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:justify-end sm:space-x-6 sm:pb-1">
              <div className="min-w-0 flex-1 sm:hidden md:block">
                <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
                <PropertyMetrics
                  price_per_night={price_per_night}
                  rating={rating}
                  total_reviews={total_reviews}
                  source={source}
                />
              </div>
              
              <div className="mt-6 flex flex-col justify-stretch space-y-3 sm:mt-0 sm:flex-row sm:space-y-0 sm:space-x-4">
                <SavedButton
                  accommodationId={accommodationId}
                  accommodationName={name}
                  source={source}
                />
                
                {url && (
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    <ExternalLink className="-ml-0.5 mr-1.5 size-5 text-gray-400" aria-hidden="true" />
                    <span>View Listing</span>
                  </a>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-6 hidden min-w-0 flex-1 sm:block md:hidden">
            <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
            <PropertyMetrics
              price_per_night={price_per_night}
              rating={rating}
              total_reviews={total_reviews}
              source={source}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-b-xl border-t border-gray-200">
        <ReportNavMenu
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </div>
    </div>
  )
})

PropertyHeader.displayName = 'PropertyHeader' 