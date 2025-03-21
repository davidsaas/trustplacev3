import { memo } from 'react'
import Image from 'next/image'
import { PropertyMetrics } from './PropertyMetrics'
import { IMAGE_CONFIG } from '../constants'
import type { PropertyHeaderProps } from '../types'
import { getValidImageUrl } from '../utils'

export const PropertyHeader = memo(({ 
  name,
  price_per_night,
  rating,
  total_reviews,
  source,
  image_url
}: PropertyHeaderProps & { image_url: string | null }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="relative h-[400px] w-full">
        {getValidImageUrl(image_url) ? (
          <Image
            src={image_url!}
            alt={`${name} - Property View`}
            fill
            className="object-cover"
            priority
            sizes={IMAGE_CONFIG.SIZES}
            quality={IMAGE_CONFIG.QUALITY}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-100">
            <div className="text-gray-400 text-center">
              <svg 
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                aria-hidden="true"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                />
              </svg>
              <p className="mt-2">No image available</p>
            </div>
          </div>
        )}
      </div>
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-2">{name}</h2>
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