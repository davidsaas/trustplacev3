import { memo, useState, useEffect } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { ImageOff, ExternalLink, Shield } from 'lucide-react'
import { SavedButton } from './SavedButton'
import { PropertyMetrics } from './PropertyMetrics'
import { getValidImageUrl, getRiskLevel } from '../utils'
import type { PropertyHeaderProps as PropertyHeaderDataProps } from '@/types/safety-report'
import { ReportNavMenu, type ExtendedReportSection } from '../[id]/components/ReportNavMenu'

// Combine base props with navigation props
// Ensure PropertyHeaderDataProps actually contains image_url, url, overall_score etc.
// If not, they need to be added here or in the base type definition.
interface PropertyHeaderProps extends PropertyHeaderDataProps {
  activeSection: ExtendedReportSection;
  onSectionChange: (section: ExtendedReportSection) => void;
  // Explicitly add properties if they aren't guaranteed by PropertyHeaderDataProps
  image_url: string | null;
  url: string | null;
  overall_score: number;
}

export const PropertyHeader = memo(({
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url, // Now explicitly part of the interface
  url,       // Now explicitly part of the interface
  overall_score = 0, // Now explicitly part of the interface
  activeSection,
  onSectionChange,
}: PropertyHeaderProps) => {
  // State to manage the score value for animation
  const [animatedScore, setAnimatedScore] = useState(0);

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
    // Handle potentially null source in fallback
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
    const safeSource = (source ?? 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '-'); // Provide fallback for null source
    return `${safeSource}-${safeName}-${overall_score}`; // Add score for more uniqueness
  };

  const accommodationId = extractAccommodationId();
  
  // Get overall risk level based on score
  const hasScore = overall_score > 0;
  const overallRisk = hasScore 
    ? getRiskLevel(overall_score / 10) 
    : { 
        label: 'N/A', 
        fill: '#e5e7eb', // Default gray fill
        textColor: 'text-gray-500', 
        bgColor: 'bg-gray-100', 
        border: 'border-gray-200' 
      };

  // Effect to trigger the animation after mount or when overall_score changes
  useEffect(() => {
    // Use a small timeout to ensure the initial render with 0 happens first
    const timer = setTimeout(() => {
      setAnimatedScore(overall_score);
    }, 100); // 100ms delay, adjust if needed

    return () => clearTimeout(timer); // Cleanup timeout on unmount or score change
  }, [overall_score]); // Dependency array includes overall_score

  return (
    <div className="shadow-sm rounded-xl bg-white">
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
      
      <div className="mx-auto px-4 pt-6 pb-4 sm:px-6 lg:px-8">
        <div className="-mt-12 sm:-mt-16 sm:flex sm:items-end sm:space-x-5">
          <div className="flex">
            <div className={`relative size-24 rounded-full bg-white ring-4 ring-white sm:size-32 flex items-center justify-center p-2 ${overallRisk.border}`}>
              {hasScore ? (
                <CircularProgressbar
                  value={animatedScore}
                  text={`${overall_score}`}
                  styles={buildStyles({
                    rotation: 0,
                    strokeLinecap: 'round',
                    textSize: '30px',
                    pathTransitionDuration: 1.5,
                    pathColor: overallRisk.fill,
                    textColor: overallRisk.fill,
                    trailColor: '#e5e7eb',
                    backgroundColor: 'transparent',
                  })}
                  className="font-extrabold"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                   <Shield className="size-10 text-gray-400" />
                   <span className="mt-1 text-xs text-gray-500 font-medium">No Score</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-6 sm:mt-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:justify-end sm:space-x-6 sm:pb-1">
            <div className="min-w-0 flex-1 sm:hidden md:block">
              <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
              <PropertyMetrics
                price_per_night={price_per_night}
                source={source ?? 'Unknown Source'}
              />
            </div>
            
            <div className="mt-6 flex flex-col justify-stretch space-y-3 sm:mt-0 sm:flex-row sm:space-y-0 sm:space-x-4">
              <SavedButton
                accommodationId={accommodationId}
                accommodationName={name}
                source={source ?? 'Unknown Source'}
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
            source={source ?? 'Unknown Source'}
          />
        </div>
      </div>

      <div className="border-t border-gray-200">
        <ReportNavMenu
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </div>
    </div>
  )
})

PropertyHeader.displayName = 'PropertyHeader' 