import { memo } from 'react'
import Image from 'next/image'
import { PropertyMetrics } from '../components/PropertyMetrics'
import { IMAGE_CONFIG } from '../constants'
import type { PropertyHeaderProps } from '../types'
import { getValidImageUrl } from '../utils'
import { ImageOff, ExternalLink, Shield, CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert } from 'lucide-react'
import { SavedButton } from '@/components/safety-report/SavedButton'

// We need this function from SafetyMetrics
const getRiskLevel = (score: number) => {
  if (score >= 8) return { 
    label: 'Low Risk', 
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700', 
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-100',
    icon: CheckCircle2,
    description: 'Generally very safe area'
  }
  if (score >= 6) return { 
    label: 'Medium Risk', 
    color: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700', 
    lightBg: 'bg-amber-50',
    border: 'border-amber-100',
    icon: AlertCircle,
    description: 'Exercise normal caution'
  }
  if (score >= 4) return { 
    label: 'High Risk', 
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700', 
    lightBg: 'bg-orange-50',
    border: 'border-orange-100',
    icon: AlertTriangle,
    description: 'Exercise increased caution'
  }
  return { 
    label: 'Maximum Risk', 
    color: 'bg-rose-500',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700', 
    lightBg: 'bg-rose-50',
    border: 'border-rose-100',
    icon: ShieldAlert,
    description: 'Extreme caution advised'
  }
}

type PropertyHeaderWithScoreProps = PropertyHeaderProps & {
  image_url: string | null
  url?: string | null
  overall_score?: number
}

export const PropertyHeader = memo(({ 
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url,
  url,
  overall_score = 0
}: PropertyHeaderWithScoreProps) => {
  // Extract accommodation ID from the URL or use a fallback
  const extractAccommodationId = () => {
    // If we have a URL, try to extract ID from the last part of the URL path
    if (url) {
      const segments = url.split('/');
      const lastSegment = segments[segments.length - 1];
      // If there's a query string, remove it
      return lastSegment.split('?')[0];
    }
    
    // If we're on a safety report page, extract ID from the URL
    if (typeof window !== 'undefined') {
      const pathSegments = window.location.pathname.split('/');
      if (pathSegments.length > 1) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment !== 'undefined') {
          return lastSegment;
        }
      }
    }
    
    // Fallback: generate a deterministic ID based on name and source
    // This ensures the same accommodation always gets the same ID
    return `${source.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}`;
  };

  const accommodationId = extractAccommodationId();
  
  // Get overall risk level based on score
  const hasScore = overall_score > 0;
  const overallRisk = hasScore ? getRiskLevel(overall_score / 100) : null;
  const RiskIcon = overallRisk?.icon || Shield;

  return (
    <div className="overflow-hidden">
      <div className="relative h-[280px] w-full rounded-xl overflow-hidden mb-4">
        {getValidImageUrl(image_url) ? (
          <Image
            src={image_url!}
            alt={`${name} - Property View`}
            fill
            className="object-cover transition-transform duration-700 hover:scale-105"
            priority
            sizes={IMAGE_CONFIG.SIZES}
            quality={IMAGE_CONFIG.QUALITY}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-50">
            <div className="text-gray-400 text-center">
              <ImageOff className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-sm">No image available</p>
            </div>
          </div>
        )}
        
        {/* Source badge */}
        {source && (
          <div className="absolute top-3 right-3 bg-white bg-opacity-90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
            {source === 'airbnb' ? 'Airbnb' : 
             source === 'booking' ? 'Booking.com' : 
             source === 'vrbo' ? 'VRBO' : source}
          </div>
        )}
        
        {/* Safety score badge */}
        {hasScore && (
          <div className="absolute top-3 left-3 bg-white bg-opacity-90 backdrop-blur-sm rounded-full py-1 pl-2 pr-3 shadow-sm flex items-center gap-1.5">
            <div className={`p-1.5 rounded-full ${overallRisk!.bgColor}`}>
              <RiskIcon className={`w-3 h-3 ${overallRisk!.textColor}`} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-800">
                {overall_score}/100
              </span>
              <span className={`text-[10px] leading-tight ${overallRisk!.textColor}`}>{overallRisk!.label}</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="px-1">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-xl font-semibold text-gray-900 leading-tight">{name}</h2>
          
          <div className="flex items-center ml-2 space-x-2 shrink-0">
            {/* Save button */}
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
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <span>View Listing</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        
        <PropertyMetrics
          price_per_night={price_per_night}
          rating={rating}
          total_reviews={total_reviews}
          source={source}
        />
      </div>
    </div>
  )
})

PropertyHeader.displayName = 'PropertyHeader' 