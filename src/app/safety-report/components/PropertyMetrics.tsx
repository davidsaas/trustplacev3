import { memo } from 'react'
import type { PropertyMetricsProps } from '../types'
import { formatPrice, formatRating, formatReviewCount } from '../utils'
import { Star, DollarSign, MessageSquare } from 'lucide-react'

export const PropertyMetrics = memo(({ 
  price_per_night,
  rating,
  total_reviews,
  source
}: PropertyMetricsProps) => {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
      {price_per_night && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center p-1 bg-emerald-50 rounded-full">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          </span>
          <span className="font-medium text-gray-900">{formatPrice(price_per_night)}</span>
          <span className="text-gray-500">/ night</span>
        </div>
      )}
      
      {rating && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center p-1 bg-amber-50 rounded-full">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          </span>
          <span className="font-medium text-gray-900">{formatRating(rating, source)}</span>
        </div>
      )}
      
      {total_reviews && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center p-1 bg-blue-50 rounded-full">
            <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
          </span>
          <span className="text-gray-700">{formatReviewCount(total_reviews)} reviews</span>
        </div>
      )}
    </div>
  )
}) 