import { memo, useState, useEffect } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { 
  ImageOff, 
  ExternalLink, 
  Shield, 
  DollarSign, 
  MapPin, 
  Home, 
  BedDouble 
} from 'lucide-react'
import { PropertyMetrics } from './PropertyMetrics'
import { getValidImageUrl, getRiskLevel } from '../utils'
import type { PropertyHeaderProps, Location } from '@/types/safety-report'
import { ReportNavMenu, type ExtendedReportSection } from '../[id]/components/ReportNavMenu'

// Add commentsCount to the props interface definition
// Add description and city_id
interface ExtendedPropertyHeaderProps extends PropertyHeaderProps {
  commentsCount?: number;
  description?: string | null;
  city_id?: number | null;
  property_type?: string | null;
  room_type?: string | null;
}

export const PropertyHeader = memo(({
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url,
  url,
  overall_score = 0,
  property_type,
  neighborhood,
  location,
  activeSection,
  onSectionChange,
  commentsCount, // Destructure commentsCount
  description, // Destructure description
  city_id, // Destructure city_id
  room_type,
}: ExtendedPropertyHeaderProps) => { // Use the extended interface
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
        fill: '#9ca3af', // Use gray-400 for fill
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

  // --- Get City Name from ID ---
  const getCityName = (id: number | null | undefined): string => {
     switch (id) {
       case 1: return 'Los Angeles';
       case 2: return 'New York City';
       default: return 'Unknown City'; // Fallback
     }
  };
  const cityName = getCityName(city_id);
  // ----------------------------

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

      {/* Adjusted margin: -mt-16 only on mobile, sm:mt-4 for spacing on larger screens */}
      <div className="mx-auto px-4 pb-4 sm:px-6 lg:px-8 -mt-16 sm:mt-6">
        <div className="sm:flex sm:items-end sm:space-x-5">
          {/* Container for score circle and label */}
          <div className="flex flex-col items-center">
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
                    textColor: overallRisk.fill, // Use fill color for text too
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
            {/* Risk Level Tag - Added Below Circle */}
            {hasScore && (
              <span
                className={`mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${overallRisk.bgColor} ${overallRisk.textColor}`}
              >
                {overallRisk.label}
              </span>
            )}
            {/* If no score, maybe show a placeholder tag or nothing */}
             {!hasScore && (
                <span className="mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    N/A
                </span>
             )}
          </div>

          {/* Rest of the content (name, details, buttons) */}
          <div className="mt-6 sm:mt-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:justify-end sm:space-x-6 sm:pb-1">
            <div className="min-w-0 flex-1 sm:hidden md:block">
              <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                  {price_per_night && (
                     <span className="inline-flex items-center">
                          <DollarSign className="mr-1 size-4 flex-shrink-0" /> ${price_per_night}/night
                     </span>
                  )}
                  {price_per_night && cityName && <span className="text-gray-300">&bull;</span>}
                  {cityName && cityName !== 'Unknown City' && (
                      <span className="inline-flex items-center">
                          <MapPin className="mr-1 size-4 flex-shrink-0" /> {cityName}
                      </span>
                  )}
                  {cityName && property_type && <span className="text-gray-300">&bull;</span>}
                  {property_type && (
                      <span className="inline-flex items-center">
                          <Home className="mr-1 size-4 flex-shrink-0" /> {property_type}
                      </span>
                  )}
                  {property_type && room_type && <span className="text-gray-300">&bull;</span>}
                  {room_type && (
                      <span className="inline-flex items-center">
                          <BedDouble className="mr-1 size-4 flex-shrink-0" /> {room_type}
                      </span>
                  )}
              </div>
              <div className="mt-2 flex flex-col space-y-1">
                  {description && <p className="text-sm text-gray-600 mt-1 line-clamp-2" title={description}>{description}</p>}
              </div>
            </div>
            
            <div className="mt-6 flex flex-col justify-stretch space-y-3 sm:mt-0 sm:flex-row sm:space-y-0 sm:space-x-4">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex justify-center items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  aria-label={`View ${name} on ${source || 'source website'} (opens in new tab)`}
                >
                  <ExternalLink className="mr-2 h-5 w-5 text-gray-400" />
                  View on {source || 'Source'}
                </a>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-8 hidden min-w-0 flex-1 sm:block md:hidden">
          <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              {price_per_night && (
                 <span className="inline-flex items-center">
                      <DollarSign className="mr-1 size-4 flex-shrink-0" /> ${price_per_night}/night
                 </span>
              )}
              {price_per_night && cityName && <span className="text-gray-300">&bull;</span>}
              {cityName && cityName !== 'Unknown City' && (
                  <span className="inline-flex items-center">
                      <MapPin className="mr-1 size-4 flex-shrink-0" /> {cityName}
                  </span>
              )}
              {cityName && property_type && <span className="text-gray-300">&bull;</span>}
              {property_type && (
                  <span className="inline-flex items-center">
                      <Home className="mr-1 size-4 flex-shrink-0" /> {property_type}
                  </span>
              )}
              {property_type && room_type && <span className="text-gray-300">&bull;</span>}
              {room_type && (
                  <span className="inline-flex items-center">
                      <BedDouble className="mr-1 size-4 flex-shrink-0" /> {room_type}
                  </span>
              )}
          </div>
          <div className="mt-2 flex flex-col space-y-1">
              {description && <p className="text-sm text-gray-600 mt-1 line-clamp-2" title={description}>{description}</p>}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200">
        <ReportNavMenu
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          commentsCount={commentsCount} // Pass commentsCount down
        />
      </div>
    </div>
  )
})

PropertyHeader.displayName = 'PropertyHeader' 