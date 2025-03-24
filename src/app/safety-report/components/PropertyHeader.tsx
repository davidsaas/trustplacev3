import { memo } from 'react'
import Image from 'next/image'
import { PropertyMetrics } from '../components/PropertyMetrics'
import { IMAGE_CONFIG } from '../constants'
import type { PropertyHeaderProps } from '../types'
import { getValidImageUrl } from '../utils'
import { ImageOff, ExternalLink } from 'lucide-react'

export const PropertyHeader = memo(({ 
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url,
  url
}: PropertyHeaderProps & { image_url: string | null, url?: string | null }) => {
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
      </div>
      
      <div className="px-1">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-xl font-semibold text-gray-900 leading-tight">{name}</h2>
          
          {url && (
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors shrink-0 ml-2"
            >
              <span>View Listing</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
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