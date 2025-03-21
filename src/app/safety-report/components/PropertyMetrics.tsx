import { memo } from 'react'
import type { PropertyMetricsProps } from '../types'
import { formatPrice, formatRating, formatReviewCount } from '../utils'

export const PropertyMetrics = memo(({ 
  price_per_night,
  rating,
  total_reviews,
  source
}: PropertyMetricsProps) => {
  return (
    <div className="flex items-center gap-4 text-gray-600 mb-4">
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatPrice(price_per_night)}</span>
        {price_per_night && <span>per night</span>}
      </div>
      
      {(rating || total_reviews) && (
        <div className="flex items-center gap-2">
          {rating && (
            <>
              <span>★</span>
              <span>{formatRating(rating, source)}</span>
            </>
          )}
          {total_reviews && (
            <span>{formatReviewCount(total_reviews)}</span>
          )}
        </div>
      )}
    </div>
  )
}) 